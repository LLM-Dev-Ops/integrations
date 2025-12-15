/**
 * Log Writer Service
 *
 * Handles buffered log entry writes to Cloud Logging.
 * Following the SPARC specification.
 */

import type { GclConfig } from "../config/index.js";
import { formatLogName, resolveEndpoint } from "../config/index.js";
import type { HttpTransport } from "../transport/index.js";
import { isSuccess, getRequestId } from "../transport/index.js";
import type { GcpAuthProvider } from "../client/auth.js";
import { LogBuffer, chunkEntries } from "../buffer/index.js";
import {
  enrichWithTraceContext,
  generateInsertId,
  getTraceContext,
} from "../correlation/index.js";
import type {
  LogEntry,
  Severity,
  SeverityString,
  BatchWriteResult,
} from "../types/index.js";
import { severityToString, parseSeverity } from "../types/index.js";
import { WriteError, parseGclError } from "../error/index.js";

/**
 * Log writer trait interface.
 */
export interface LogWriterTrait {
  /**
   * Write a single log entry.
   */
  write(entry: LogEntry): Promise<void>;

  /**
   * Write a batch of log entries.
   */
  writeBatch(entries: LogEntry[]): Promise<BatchWriteResult>;

  /**
   * Flush buffered entries.
   */
  flush(): Promise<void>;
}

/**
 * Log entry builder for fluent API.
 */
export class LogEntryBuilder {
  private writer: LogWriter;
  private entry: LogEntry;

  constructor(writer: LogWriter, severity: Severity | SeverityString) {
    this.writer = writer;
    this.entry = {
      severity: typeof severity === "string" ? parseSeverity(severity) : severity,
      labels: {},
    };
  }

  /**
   * Set text message payload.
   */
  message(msg: string): this {
    this.entry.textPayload = msg;
    return this;
  }

  /**
   * Set JSON payload.
   */
  jsonPayload<T extends Record<string, unknown>>(payload: T): this {
    this.entry.jsonPayload = payload;
    return this;
  }

  /**
   * Add a label.
   */
  label(key: string, value: string): this {
    this.entry.labels[key] = value;
    return this;
  }

  /**
   * Set multiple labels.
   */
  labels(labels: Record<string, string>): this {
    this.entry.labels = { ...this.entry.labels, ...labels };
    return this;
  }

  /**
   * Set trace ID.
   */
  trace(traceId: string): this {
    this.entry.trace = traceId;
    return this;
  }

  /**
   * Set span ID.
   */
  span(spanId: string): this {
    this.entry.spanId = spanId;
    return this;
  }

  /**
   * Set trace sampled flag.
   */
  sampled(sampled: boolean): this {
    this.entry.traceSampled = sampled;
    return this;
  }

  /**
   * Set source location.
   */
  sourceLocation(file: string, line: number, fn: string): this {
    this.entry.sourceLocation = { file, line, function: fn };
    return this;
  }

  /**
   * Set insert ID for deduplication.
   */
  insertId(id: string): this {
    this.entry.insertId = id;
    return this;
  }

  /**
   * Set HTTP request metadata.
   */
  httpRequest(request: LogEntry["httpRequest"]): this {
    this.entry.httpRequest = request;
    return this;
  }

  /**
   * Set operation metadata.
   */
  operation(operation: LogEntry["operation"]): this {
    this.entry.operation = operation;
    return this;
  }

  /**
   * Set timestamp.
   */
  timestamp(ts: Date | string): this {
    this.entry.timestamp = typeof ts === "string" ? ts : ts.toISOString();
    return this;
  }

  /**
   * Build the entry without sending.
   */
  build(): LogEntry {
    return this.entry;
  }

  /**
   * Send the log entry.
   */
  async send(): Promise<void> {
    await this.writer.write(this.entry);
  }
}

/**
 * Log writer implementation.
 */
export class LogWriter implements LogWriterTrait {
  private config: GclConfig;
  private transport: HttpTransport;
  private authProvider: GcpAuthProvider;
  private buffer: LogBuffer;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<void> | null = null;

  constructor(
    config: GclConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider,
    buffer: LogBuffer
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
    this.buffer = buffer;

    // Start flush interval
    this.startFlushInterval();
  }

  /**
   * Create a new entry builder with the specified severity.
   */
  entry(severity: Severity | SeverityString): LogEntryBuilder {
    return new LogEntryBuilder(this, severity);
  }

  /**
   * Write a single log entry.
   */
  async write(entry: LogEntry): Promise<void> {
    // Validate and enrich entry
    const enriched = this.enrichEntry(entry);

    // Try to add to buffer
    if (!this.buffer.tryAdd(enriched)) {
      // Buffer full - force flush
      await this.flush();
      this.buffer.add(enriched);
    }

    // Check if immediate flush needed
    if (this.buffer.shouldFlush()) {
      // Fire and forget flush (don't await to avoid blocking)
      this.triggerFlush();
    }
  }

  /**
   * Write a batch of log entries directly (bypass buffer).
   */
  async writeBatch(entries: LogEntry[]): Promise<BatchWriteResult> {
    const validated: LogEntry[] = [];
    const failures: Array<{ insertId: string; error: string }> = [];

    // Validate and enrich entries
    for (const entry of entries) {
      try {
        const enriched = this.enrichEntry(entry);
        validated.push(enriched);
      } catch (e) {
        failures.push({
          insertId: entry.insertId ?? "unknown",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (validated.length === 0) {
      return {
        successCount: 0,
        failureCount: failures.length,
        failures,
      };
    }

    // Write directly (bypass buffer)
    try {
      await this.writeEntriesDirect(validated);
      return {
        successCount: validated.length,
        failureCount: failures.length,
        failures,
      };
    } catch (e) {
      // All validated entries failed
      return {
        successCount: 0,
        failureCount: entries.length,
        failures: entries.map((entry) => ({
          insertId: entry.insertId ?? "unknown",
          error: e instanceof Error ? e.message : String(e),
        })),
      };
    }
  }

  /**
   * Flush buffered entries.
   */
  async flush(): Promise<void> {
    // Avoid concurrent flushes
    if (this.flushing) {
      await this.flushing;
      return;
    }

    this.flushing = this.doFlush();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  /**
   * Stop the writer and flush remaining entries.
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  /**
   * Start the flush interval timer.
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      if (this.buffer.shouldFlush()) {
        this.triggerFlush();
      }
    }, this.config.bufferConfig.flushIntervalMs);
  }

  /**
   * Trigger a flush without awaiting.
   */
  private triggerFlush(): void {
    this.flush().catch((err) => {
      if (this.config.enableLogging) {
        console.error("[GCL] Flush failed:", err);
      }
    });
  }

  /**
   * Perform the actual flush operation.
   */
  private async doFlush(): Promise<void> {
    const entries = this.buffer.drain();
    if (entries.length === 0) {
      return;
    }

    // Chunk entries into batches
    const batches = chunkEntries(entries);

    for (const batch of batches) {
      try {
        await this.writeEntriesWithRetry(batch);
      } catch (e) {
        // Re-queue failed entries (best effort)
        for (const entry of batch) {
          this.buffer.tryAdd(entry);
        }
        throw e;
      }
    }
  }

  /**
   * Write entries with retry logic.
   */
  private async writeEntriesWithRetry(entries: LogEntry[]): Promise<void> {
    let lastError: Error | undefined;
    const { maxAttempts, baseDelay, maxDelay, multiplier } = this.config.retryConfig;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.writeEntriesDirect(entries);
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));

        // Check if retryable
        if (e instanceof WriteError && !e.retryable) {
          throw e;
        }

        // Calculate backoff delay
        const delay = Math.min(baseDelay * Math.pow(multiplier, attempt), maxDelay);

        if (this.config.enableLogging) {
          console.warn(
            `[GCL] Write attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
            e
          );
        }

        await this.sleep(delay);
      }
    }

    throw lastError ?? new WriteError("Write failed after retries", "PartialFailure");
  }

  /**
   * Write entries directly to the API.
   */
  private async writeEntriesDirect(entries: LogEntry[]): Promise<void> {
    const token = await this.authProvider.getAccessToken();
    const endpoint = resolveEndpoint(this.config);

    // Build request
    const request = {
      logName: formatLogName(this.config.projectId, this.config.logId),
      resource: this.config.resource,
      labels: this.config.defaultLabels,
      entries: entries.map((e) => this.serializeEntry(e)),
      partialSuccess: true,
    };

    const response = await this.transport.send({
      method: "POST",
      url: `${endpoint}/v2/entries:write`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      const requestId = getRequestId(response);
      throw parseGclError(response.status, response.body.toString(), requestId);
    }
  }

  /**
   * Enrich a log entry with defaults and context.
   */
  private enrichEntry(entry: LogEntry): LogEntry {
    let enriched = { ...entry };

    // Add default labels
    enriched.labels = { ...this.config.defaultLabels, ...entry.labels };

    // Add trace context if not already set
    if (!enriched.trace) {
      const ctx = getTraceContext();
      if (ctx) {
        enriched = enrichWithTraceContext(enriched, this.config.projectId, ctx);
      }
    }

    // Add insert ID if missing
    if (!enriched.insertId) {
      enriched.insertId = generateInsertId();
    }

    // Add timestamp if missing
    if (!enriched.timestamp) {
      enriched.timestamp = new Date().toISOString();
    }

    return enriched;
  }

  /**
   * Serialize entry for API request.
   */
  private serializeEntry(
    entry: LogEntry
  ): Record<string, unknown> {
    const serialized: Record<string, unknown> = {};

    if (entry.logName) serialized["logName"] = entry.logName;
    if (entry.resource) serialized["resource"] = entry.resource;
    if (entry.timestamp) serialized["timestamp"] = entry.timestamp;
    if (entry.receiveTimestamp) serialized["receiveTimestamp"] = entry.receiveTimestamp;

    // Convert severity to string
    serialized["severity"] =
      typeof entry.severity === "number"
        ? severityToString(entry.severity)
        : entry.severity;

    if (entry.insertId) serialized["insertId"] = entry.insertId;
    if (Object.keys(entry.labels).length > 0) serialized["labels"] = entry.labels;
    if (entry.textPayload) serialized["textPayload"] = entry.textPayload;
    if (entry.jsonPayload) serialized["jsonPayload"] = entry.jsonPayload;
    if (entry.protoPayload) serialized["protoPayload"] = entry.protoPayload;
    if (entry.httpRequest) serialized["httpRequest"] = entry.httpRequest;
    if (entry.trace) serialized["trace"] = entry.trace;
    if (entry.spanId) serialized["spanId"] = entry.spanId;
    if (entry.traceSampled !== undefined) serialized["traceSampled"] = entry.traceSampled;
    if (entry.sourceLocation) serialized["sourceLocation"] = entry.sourceLocation;
    if (entry.operation) serialized["operation"] = entry.operation;

    return serialized;
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
