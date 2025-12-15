/**
 * Log Tailer Service
 *
 * Handles streaming log entry tailing from Cloud Logging.
 * Following the SPARC specification.
 */

import type { GclConfig } from "../config/index.js";
import { resolveEndpoint, formatResourceName } from "../config/index.js";
import type { HttpTransport, StreamingHttpResponse } from "../transport/index.js";
import type { GcpAuthProvider } from "../client/auth.js";
import type {
  LogEntry,
  TailRequest,
  TailLogEntriesResponse,
  SuppressionInfo,
} from "../types/index.js";
import { NetworkError, parseGclError } from "../error/index.js";

/**
 * Tail handle for controlling the stream.
 */
export class TailHandle {
  private cancelled: boolean = false;
  private cancelCallbacks: Array<() => void> = [];

  /**
   * Cancel the tail stream.
   */
  cancel(): void {
    this.cancelled = true;
    for (const cb of this.cancelCallbacks) {
      cb();
    }
  }

  /**
   * Check if the stream is still active.
   */
  isActive(): boolean {
    return !this.cancelled;
  }

  /**
   * Register a cancel callback.
   */
  onCancel(callback: () => void): void {
    if (this.cancelled) {
      callback();
    } else {
      this.cancelCallbacks.push(callback);
    }
  }
}

/**
 * Tail stream for iterating over log entries.
 */
export class TailStream implements AsyncIterable<LogEntry> {
  private handle: TailHandle;
  private entryQueue: LogEntry[] = [];
  private errorQueue: Error[] = [];
  private resolvers: Array<(value: IteratorResult<LogEntry>) => void> = [];
  private done: boolean = false;
  private suppressionInfo?: SuppressionInfo;

  constructor() {
    this.handle = new TailHandle();
  }

  /**
   * Get the tail handle.
   */
  getHandle(): TailHandle {
    return this.handle;
  }

  /**
   * Cancel the stream.
   */
  cancel(): void {
    this.handle.cancel();
    this.done = true;
    this.resolveAll();
  }

  /**
   * Check if stream is active.
   */
  isActive(): boolean {
    return this.handle.isActive();
  }

  /**
   * Get suppression info (if any entries were suppressed).
   */
  getSuppressionInfo(): SuppressionInfo | undefined {
    return this.suppressionInfo;
  }

  /**
   * Push entries to the stream.
   */
  pushEntries(entries: LogEntry[]): void {
    for (const entry of entries) {
      if (this.resolvers.length > 0) {
        const resolver = this.resolvers.shift()!;
        resolver({ value: entry, done: false });
      } else {
        this.entryQueue.push(entry);
      }
    }
  }

  /**
   * Push an error to the stream.
   */
  pushError(error: Error): void {
    this.errorQueue.push(error);
    this.resolveAll();
  }

  /**
   * Set suppression info.
   */
  setSuppressionInfo(info: SuppressionInfo): void {
    this.suppressionInfo = info;
  }

  /**
   * Mark the stream as done.
   */
  setDone(): void {
    this.done = true;
    this.resolveAll();
  }

  /**
   * Async iterator implementation.
   */
  [Symbol.asyncIterator](): AsyncIterator<LogEntry> {
    return {
      next: async (): Promise<IteratorResult<LogEntry>> => {
        // Check for errors
        if (this.errorQueue.length > 0) {
          const error = this.errorQueue.shift()!;
          throw error;
        }

        // Return queued entries
        if (this.entryQueue.length > 0) {
          const entry = this.entryQueue.shift()!;
          return { value: entry, done: false };
        }

        // Check if done
        if (this.done) {
          return { value: undefined as unknown as LogEntry, done: true };
        }

        // Wait for next entry
        return new Promise((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }

  /**
   * Resolve all pending promises.
   */
  private resolveAll(): void {
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()!;
      if (this.errorQueue.length > 0) {
        // Errors are thrown in next() call
        resolver({ value: undefined as unknown as LogEntry, done: false });
      } else {
        resolver({ value: undefined as unknown as LogEntry, done: true });
      }
    }
  }
}

/**
 * Log tailer trait interface.
 */
export interface LogTailerTrait {
  /**
   * Tail log entries.
   */
  tail(request: TailRequest): Promise<TailStream>;
}

/**
 * Log tailer implementation.
 */
export class LogTailer implements LogTailerTrait {
  private config: GclConfig;
  private transport: HttpTransport;
  private authProvider: GcpAuthProvider;
  private maxReconnectAttempts: number = 5;
  private reconnectBaseDelay: number = 1000;

  constructor(
    config: GclConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * Start tailing log entries.
   */
  async tail(request: TailRequest): Promise<TailStream> {
    const stream = new TailStream();

    // Start the streaming in the background
    this.startStreaming(request, stream).catch((error) => {
      stream.pushError(error);
    });

    return stream;
  }

  /**
   * Start the streaming connection.
   */
  private async startStreaming(
    request: TailRequest,
    stream: TailStream
  ): Promise<void> {
    let reconnectAttempts = 0;

    while (stream.isActive()) {
      try {
        await this.streamEntries(request, stream);
        // Stream ended normally
        break;
      } catch (error) {
        if (!stream.isActive()) {
          // Stream was cancelled
          break;
        }

        if (
          error instanceof NetworkError &&
          reconnectAttempts < this.maxReconnectAttempts
        ) {
          // Retry with exponential backoff
          reconnectAttempts++;
          const delay = this.reconnectBaseDelay * Math.pow(2, reconnectAttempts - 1);

          if (this.config.enableLogging) {
            console.warn(
              `[GCL] Tail stream disconnected, reconnecting in ${delay}ms (attempt ${reconnectAttempts})`
            );
          }

          await this.sleep(delay);
          continue;
        }

        // Non-retryable error or max attempts reached
        throw error;
      }
    }

    stream.setDone();
  }

  /**
   * Stream entries from the API.
   */
  private async streamEntries(
    request: TailRequest,
    stream: TailStream
  ): Promise<void> {
    const token = await this.authProvider.getAccessToken();
    const endpoint = resolveEndpoint(this.config);

    // Build the tail request
    const resourceNames =
      request.resourceNames.length > 0
        ? request.resourceNames
        : [formatResourceName(this.config.projectId)];

    const apiRequest = {
      resourceNames,
      filter: request.filter,
      bufferWindow: request.bufferWindow
        ? `${request.bufferWindow}s`
        : undefined,
    };

    // Check if transport supports streaming
    if (!this.transport.sendStreaming) {
      // Fall back to polling
      await this.pollEntries(request, stream, token, endpoint);
      return;
    }

    // Use streaming HTTP
    let response: StreamingHttpResponse;
    try {
      response = await this.transport.sendStreaming({
        method: "POST",
        url: `${endpoint}/v2/entries:tail`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiRequest),
        timeout: 0, // No timeout for streaming
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new NetworkError(error.message, "ConnectionFailed");
      }
      throw error;
    }

    if (response.status !== 200) {
      // Read the error body
      let body = "";
      for await (const chunk of response.stream) {
        body += chunk.toString();
      }
      throw parseGclError(response.status, body);
    }

    // Process the stream
    let buffer = "";
    for await (const chunk of response.stream) {
      if (!stream.isActive()) {
        break;
      }

      buffer += chunk.toString();

      // Parse newline-delimited JSON
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim() === "") continue;

        try {
          const data = JSON.parse(line) as TailLogEntriesResponse;

          if (data.entries) {
            const entries = data.entries.map((e) => this.parseLogEntry(e));
            stream.pushEntries(entries);
          }

          if (data.suppressionInfo) {
            stream.setSuppressionInfo(data.suppressionInfo);
            if (this.config.enableLogging) {
              console.warn(
                `[GCL] ${data.suppressionInfo.suppressedCount} entries suppressed due to ${data.suppressionInfo.reason}`
              );
            }
          }
        } catch {
          // Ignore parse errors for non-JSON lines
        }
      }
    }
  }

  /**
   * Fall back to polling when streaming is not available.
   */
  private async pollEntries(
    request: TailRequest,
    stream: TailStream,
    token: string,
    endpoint: string
  ): Promise<void> {
    const resourceNames =
      request.resourceNames.length > 0
        ? request.resourceNames
        : [formatResourceName(this.config.projectId)];

    let lastTimestamp = new Date().toISOString();
    const pollInterval = (request.bufferWindow ?? 10) * 1000;

    while (stream.isActive()) {
      const filter = request.filter
        ? `(${request.filter}) AND timestamp > "${lastTimestamp}"`
        : `timestamp > "${lastTimestamp}"`;

      const response = await this.transport.send({
        method: "POST",
        url: `${endpoint}/v2/entries:list`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resourceNames,
          filter,
          orderBy: "timestamp asc",
          pageSize: 1000,
        }),
        timeout: this.config.timeout,
      });

      if (response.status !== 200) {
        throw parseGclError(response.status, response.body.toString());
      }

      const data = JSON.parse(response.body.toString()) as {
        entries?: Record<string, unknown>[];
      };

      if (data.entries && data.entries.length > 0) {
        const entries = data.entries.map((e) => this.parseLogEntry(e));
        stream.pushEntries(entries);

        // Update last timestamp
        const lastEntry = entries[entries.length - 1];
        if (lastEntry?.timestamp) {
          lastTimestamp = lastEntry.timestamp;
        }
      }

      // Wait before next poll
      await this.sleep(pollInterval);
    }
  }

  /**
   * Parse log entry from API response.
   */
  private parseLogEntry(data: Record<string, unknown>): LogEntry {
    return {
      logName: data["logName"] as string | undefined,
      resource: data["resource"] as LogEntry["resource"],
      timestamp: data["timestamp"] as string | undefined,
      receiveTimestamp: data["receiveTimestamp"] as string | undefined,
      severity: (data["severity"] as string) ?? "DEFAULT",
      insertId: data["insertId"] as string | undefined,
      labels: (data["labels"] as Record<string, string>) ?? {},
      textPayload: data["textPayload"] as string | undefined,
      jsonPayload: data["jsonPayload"] as Record<string, unknown> | undefined,
      protoPayload: data["protoPayload"] as LogEntry["protoPayload"],
      httpRequest: data["httpRequest"] as LogEntry["httpRequest"],
      trace: data["trace"] as string | undefined,
      spanId: data["spanId"] as string | undefined,
      traceSampled: data["traceSampled"] as boolean | undefined,
      sourceLocation: data["sourceLocation"] as LogEntry["sourceLocation"],
      operation: data["operation"] as LogEntry["operation"],
    };
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
