/**
 * Batch Service for Google Cloud Firestore.
 *
 * Provides batch write operations following the SPARC specification.
 * Implements WriteBatch interface and BatchService for chunked batch writes.
 */

import type { FirestoreConfig } from "../config/index.js";
import type { GcpAuthProvider } from "../credentials/index.js";
import type { WriteResult, Precondition } from "../types/document.js";
import type { FieldValueMap, SetOptions } from "../types/field-value.js";
import type { Write, WriteBatch as WriteBatchType, BatchWriteResult } from "../types/batch.js";
import type { HttpTransport, CircuitBreaker, MetricsEmitter, Tracer } from "./document.js";
import {
  FirestoreError,
  mapFirestoreError,
  isRetryableError,
  calculateBackoff,
  getRetryPolicy,
  InvalidArgumentError,
  BatchSizeLimitError as ErrorBatchSizeLimitError,
} from "../error/index.js";

/**
 * Maximum number of operations allowed in a single batch (Firestore limit).
 */
const MAX_BATCH_SIZE = 500;

/**
 * Error thrown when batch size limit is exceeded.
 */
export class BatchSizeLimitError extends Error {
  constructor(size: number, maxSize: number = MAX_BATCH_SIZE) {
    super(`Batch size limit exceeded: ${size} operations (max ${maxSize})`);
    this.name = "BatchSizeLimitError";
  }
}

/**
 * Error thrown when attempting to commit an empty batch.
 */
export class EmptyBatchError extends Error {
  constructor() {
    super("Cannot commit an empty batch");
    this.name = "EmptyBatchError";
  }
}

/**
 * Write batch implementation.
 * Provides a fluent API for chaining write operations.
 */
export class WriteBatchImpl {
  private writes: Array<{
    type: string;
    path: string;
    data?: FieldValueMap;
    updates?: FieldValueMap;
    options?: SetOptions;
    precondition?: Precondition;
  }> = [];

  private readonly config: FirestoreConfig;
  private readonly transport: HttpTransport;
  private readonly authProvider: GcpAuthProvider;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly metrics?: MetricsEmitter;
  private readonly tracer?: Tracer;

  constructor(
    config: FirestoreConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider,
    options?: {
      circuitBreaker?: CircuitBreaker;
      metrics?: MetricsEmitter;
      tracer?: Tracer;
    }
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
    this.circuitBreaker = options?.circuitBreaker;
    this.metrics = options?.metrics;
    this.tracer = options?.tracer;
  }

  /**
   * Set a document in the batch.
   *
   * @param path - Document path
   * @param data - Document data
   * @param options - Set options (merge, etc.)
   * @returns This batch for chaining
   * @throws BatchSizeLimitError if batch size exceeds limit
   */
  set(path: string, data: FieldValueMap, options?: SetOptions): this {
    if (this.writes.length >= MAX_BATCH_SIZE) {
      throw new BatchSizeLimitError(this.writes.length + 1);
    }

    this.writes.push({
      type: "set",
      path,
      data,
      options,
    });

    return this;
  }

  /**
   * Update a document in the batch.
   *
   * @param path - Document path
   * @param updates - Fields to update
   * @returns This batch for chaining
   * @throws BatchSizeLimitError if batch size exceeds limit
   */
  update(path: string, updates: FieldValueMap): this {
    if (this.writes.length >= MAX_BATCH_SIZE) {
      throw new BatchSizeLimitError(this.writes.length + 1);
    }

    if (Object.keys(updates).length === 0) {
      throw new InvalidArgumentError("Update must specify at least one field");
    }

    this.writes.push({
      type: "update",
      path,
      updates,
    });

    return this;
  }

  /**
   * Delete a document in the batch.
   *
   * @param path - Document path
   * @returns This batch for chaining
   * @throws BatchSizeLimitError if batch size exceeds limit
   */
  delete(path: string): this {
    if (this.writes.length >= MAX_BATCH_SIZE) {
      throw new BatchSizeLimitError(this.writes.length + 1);
    }

    this.writes.push({
      type: "delete",
      path,
    });

    return this;
  }

  /**
   * Commit the batch.
   *
   * @returns Promise resolving to array of write results
   * @throws EmptyBatchError if batch is empty
   */
  async commit(): Promise<WriteResult[]> {
    if (this.writes.length === 0) {
      throw new EmptyBatchError();
    }

    const span = this.tracer?.startSpan("firestore.batch.commit", {
      writeCount: this.writes.length,
    });
    const startTime = Date.now();

    try {
      const endpoint = this.getEndpoint();
      const token = await this.authProvider.getAccessToken();
      const parent = `projects/${this.config.project_id}/databases/${this.config.database_id}/documents`;

      // Build batch write request
      const writes = await this.buildWrites();

      const body = {
        writes,
      };

      const operation = async () => {
        const response = await this.transport.send({
          method: "POST",
          url: `${endpoint}/v1/${parent}:commit`,
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          timeout: this.config.request_timeout_ms,
        });

        if (response.status < 200 || response.status >= 300) {
          const errorBody = JSON.parse(response.body.toString());
          throw mapFirestoreError(errorBody, this.getRequestId(response));
        }

        const result = JSON.parse(response.body.toString());

        const { createTimestamp } = await import("../types/document.js");

        const writeResults: WriteResult[] = (result.writeResults || []).map(
          (wr: any) => ({
            update_time: wr.updateTime
              ? this.parseTimestamp(wr.updateTime)
              : createTimestamp(),
            transform_results: wr.transformResults || undefined,
          })
        );

        return writeResults;
      };

      const results = this.circuitBreaker
        ? await this.circuitBreaker.execute(operation)
        : await this.retryOperation(operation);

      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.writes", this.writes.length, {
        operation: "batch",
      });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "batch",
      });

      span?.setAttribute("writes.count", this.writes.length);
      span?.setStatus({ code: 0 });
      span?.end();

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.errors", 1, { operation: "batch" });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "batch",
        status: "error",
      });

      span?.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : String(error),
      });
      span?.end();

      throw error;
    }
  }

  /**
   * Get the current number of operations in the batch.
   *
   * @returns Number of operations
   */
  size(): number {
    return this.writes.length;
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Build Firestore write operations from batch writes.
   */
  private async buildWrites(): Promise<any[]> {
    const { toFirestoreFields } = await import("../types/field-value.js");

    return this.writes.map((write) => {
      const fullPath = this.buildDocumentPath(write.path);

      switch (write.type) {
        case "set": {
          const operation: any = {
            update: {
              name: fullPath,
              fields: toFirestoreFields(write.data!),
            },
          };

          // Add update mask for merge operations
          if (write.options?.merge) {
            operation.updateMask = { fieldPaths: ["*"] };
          } else if (write.options?.mergeFields) {
            operation.updateMask = { fieldPaths: write.options.mergeFields };
          } else {
            // Create mode - document must not exist
            operation.currentDocument = { exists: false };
          }

          return operation;
        }

        case "update": {
          const fields = write.updates!;
          return {
            update: {
              name: fullPath,
              fields: toFirestoreFields(fields),
            },
            updateMask: {
              fieldPaths: Object.keys(fields),
            },
            currentDocument: { exists: true },
          };
        }

        case "delete": {
          const operation: any = {
            delete: fullPath,
          };

          if (write.precondition) {
            operation.currentDocument = write.precondition;
          }

          return operation;
        }

        default:
          throw new InvalidArgumentError(`Unknown write type: ${write.type}`);
      }
    });
  }

  /**
   * Build full document path.
   */
  private buildDocumentPath(path: string): string {
    if (path.startsWith("projects/")) {
      return path;
    }

    return `projects/${this.config.project_id}/databases/${this.config.database_id}/documents/${path}`;
  }

  /**
   * Get Firestore endpoint.
   */
  private getEndpoint(): string {
    if (this.config.endpoint) {
      return this.config.endpoint;
    }

    if (this.config.use_emulator) {
      return "http://localhost:8080";
    }

    return "https://firestore.googleapis.com";
  }

  /**
   * Get request ID from response headers.
   */
  private getRequestId(response: {
    headers: Record<string, string>;
  }): string | undefined {
    return (
      response.headers["x-goog-request-id"] ||
      response.headers["X-Goog-Request-Id"]
    );
  }

  /**
   * Parse timestamp from string.
   */
  private parseTimestamp(
    timestamp: string
  ): { seconds: number; nanos: number } {
    const date = new Date(timestamp);
    const milliseconds = date.getTime();
    return {
      seconds: Math.floor(milliseconds / 1000),
      nanos: (milliseconds % 1000) * 1_000_000,
    };
  }

  /**
   * Retry operation with exponential backoff.
   */
  private async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
    const policy = getRetryPolicy(this.config);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!isRetryableError(lastError) || attempt === policy.maxRetries) {
          throw error;
        }

        const delay = calculateBackoff(attempt, policy);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new FirestoreError("Operation failed", "UNKNOWN", 2);
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Batch service for creating and managing write batches.
 */
export class BatchService {
  private readonly config: FirestoreConfig;
  private readonly transport: HttpTransport;
  private readonly authProvider: GcpAuthProvider;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly metrics?: MetricsEmitter;
  private readonly tracer?: Tracer;

  constructor(
    config: FirestoreConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider,
    options?: {
      circuitBreaker?: CircuitBreaker;
      metrics?: MetricsEmitter;
      tracer?: Tracer;
    }
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
    this.circuitBreaker = options?.circuitBreaker;
    this.metrics = options?.metrics;
    this.tracer = options?.tracer;
  }

  /**
   * Create a new write batch.
   *
   * @returns WriteBatchImpl instance
   */
  createBatch(): WriteBatchImpl {
    return new WriteBatchImpl(
      this.config,
      this.transport,
      this.authProvider,
      {
        circuitBreaker: this.circuitBreaker,
        metrics: this.metrics,
        tracer: this.tracer,
      }
    );
  }

  /**
   * Execute batch writes in chunks.
   *
   * Automatically splits large batches into chunks that fit within
   * Firestore's 500 operation limit.
   *
   * @param writes - Array of write operations
   * @param chunkSize - Size of each chunk (default: 500)
   * @returns Array of write result arrays (one per chunk)
   */
  async batchWritesChunked(
    writes: Write[],
    chunkSize: number = MAX_BATCH_SIZE
  ): Promise<WriteResult[][]> {
    if (chunkSize > MAX_BATCH_SIZE) {
      throw new InvalidArgumentError(
        `Chunk size ${chunkSize} exceeds maximum ${MAX_BATCH_SIZE}`
      );
    }

    const chunks = this.chunkArray(writes, chunkSize);
    const results: WriteResult[][] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const batch = this.createBatch();

      // Add all writes from this chunk to the batch
      for (const write of chunk) {
        switch (write.type) {
          case "set":
            batch.set(write.path, write.data!, write.options);
            break;

          case "update":
            batch.update(write.path, write.updates!);
            break;

          case "delete":
            batch.delete(write.path);
            break;

          default:
            throw new InvalidArgumentError(
              `Unknown write type: ${(write as any).type}`
            );
        }
      }

      // Commit the batch
      const chunkResults = await batch.commit();
      results.push(chunkResults);
    }

    return results;
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Chunk an array into smaller arrays.
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }

    return chunks;
  }
}
