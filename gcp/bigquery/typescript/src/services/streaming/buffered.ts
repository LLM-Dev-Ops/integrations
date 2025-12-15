/**
 * Buffered Inserter
 *
 * Provides automatic batching and buffering for streaming inserts.
 * Reduces API calls by buffering rows and auto-flushing based on:
 * - Row count threshold
 * - Byte size threshold
 * - Time interval
 */

import { StreamingService } from "./service.js";
import {
  InsertAllResponse,
  InsertRow,
  BufferedInserterOptions,
  DEFAULT_BUFFERED_OPTIONS,
} from "./types.js";
import { StreamingError } from "../../error/index.js";

/**
 * Buffered inserter for streaming inserts.
 *
 * Automatically batches rows and flushes when:
 * - Buffer reaches maxRows (default: 500)
 * - Buffer reaches maxBytes (default: 1MB)
 * - flushIntervalMs timer fires (default: 1000ms)
 *
 * Example usage:
 * ```typescript
 * const inserter = new BufferedInserter(
 *   streamingService,
 *   'my-project',
 *   'my-dataset',
 *   'my-table',
 *   { maxRows: 100, flushIntervalMs: 5000 }
 * );
 *
 * // Insert rows - automatically batched
 * await inserter.insert({ name: 'Alice', age: 30 });
 * await inserter.insert({ name: 'Bob', age: 25 });
 *
 * // Force flush remaining rows
 * await inserter.flush();
 *
 * // Clean up
 * await inserter.close();
 * ```
 */
export class BufferedInserter {
  private readonly service: StreamingService;
  private readonly projectId: string;
  private readonly datasetId: string;
  private readonly tableId: string;
  private readonly options: Required<BufferedInserterOptions>;

  private buffer: InsertRow[] = [];
  private bufferBytes = 0;
  private flushTimer?: NodeJS.Timeout;
  private flushPromise?: Promise<InsertAllResponse>;
  private closed = false;

  /**
   * Create a new buffered inserter.
   *
   * @param service - Streaming service instance
   * @param projectId - GCP project ID
   * @param datasetId - Dataset ID
   * @param tableId - Table ID
   * @param options - Buffering options
   */
  constructor(
    service: StreamingService,
    projectId: string,
    datasetId: string,
    tableId: string,
    options?: BufferedInserterOptions
  ) {
    this.service = service;
    this.projectId = projectId;
    this.datasetId = datasetId;
    this.tableId = tableId;
    this.options = {
      ...DEFAULT_BUFFERED_OPTIONS,
      ...options,
    };

    // Start flush timer
    this.startFlushTimer();
  }

  /**
   * Insert a row into the buffer.
   *
   * The row will be buffered and automatically flushed when thresholds are reached.
   *
   * @param row - Row data as JSON object
   * @param insertId - Optional insert ID for deduplication
   * @returns Promise that resolves when the row is buffered (not necessarily inserted)
   * @throws {StreamingError} If inserter is closed
   */
  async insert(row: Record<string, unknown>, insertId?: string): Promise<void> {
    if (this.closed) {
      throw new StreamingError("BufferedInserter is closed", "InsertFailed");
    }

    // Create insert row
    const insertRow: InsertRow = {
      json: row,
      insertId,
    };

    // Estimate row size
    const rowSize = this.estimateRowSize(insertRow);

    // Check if we need to flush before adding
    if (this.shouldFlushBeforeAdd(rowSize)) {
      await this.flush();
    }

    // Add to buffer
    this.buffer.push(insertRow);
    this.bufferBytes += rowSize;

    // Check if we need to flush after adding
    if (this.shouldFlushAfterAdd()) {
      // Don't await - let it flush in background
      this.flushAsync();
    }
  }

  /**
   * Force flush all buffered rows.
   *
   * @returns Response from the insert operation (may contain partial errors)
   * @throws {StreamingError} If insert fails
   */
  async flush(): Promise<InsertAllResponse> {
    // If there's already a flush in progress, wait for it
    if (this.flushPromise) {
      return this.flushPromise;
    }

    // If buffer is empty, return empty response
    if (this.buffer.length === 0) {
      return {};
    }

    // Take current buffer and create new one
    const rowsToFlush = this.buffer;
    this.buffer = [];
    this.bufferBytes = 0;

    // Reset timer
    this.resetFlushTimer();

    // Create flush promise
    this.flushPromise = this.service
      .insertAll(this.projectId, this.datasetId, this.tableId, {
        rows: rowsToFlush,
      })
      .finally(() => {
        this.flushPromise = undefined;
      });

    return this.flushPromise;
  }

  /**
   * Close the inserter and flush any remaining rows.
   *
   * After calling close(), no more rows can be inserted.
   *
   * @returns Response from the final flush operation
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Stop timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush remaining rows
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }

  /**
   * Get current buffer statistics.
   */
  getStats(): {
    bufferedRows: number;
    bufferedBytes: number;
    maxRows: number;
    maxBytes: number;
  } {
    return {
      bufferedRows: this.buffer.length,
      bufferedBytes: this.bufferBytes,
      maxRows: this.options.maxRows,
      maxBytes: this.options.maxBytes,
    };
  }

  /**
   * Start the auto-flush timer.
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      if (!this.closed && this.buffer.length > 0) {
        this.flushAsync();
      }
      // Restart timer
      if (!this.closed) {
        this.startFlushTimer();
      }
    }, this.options.flushIntervalMs);

    // Don't keep process alive just for timer
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Reset the flush timer.
   */
  private resetFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (!this.closed) {
      this.startFlushTimer();
    }
  }

  /**
   * Flush asynchronously (don't wait for result).
   */
  private flushAsync(): void {
    this.flush().catch((error) => {
      // Log error but don't throw (to avoid unhandled promise rejection)
      console.error("Background flush failed:", error);
    });
  }

  /**
   * Check if we should flush before adding a row.
   */
  private shouldFlushBeforeAdd(rowSize: number): boolean {
    // If adding this row would exceed byte limit, flush first
    return this.bufferBytes + rowSize > this.options.maxBytes;
  }

  /**
   * Check if we should flush after adding a row.
   */
  private shouldFlushAfterAdd(): boolean {
    // If we've reached row limit, flush
    if (this.buffer.length >= this.options.maxRows) {
      return true;
    }

    // If we've reached byte limit, flush
    if (this.bufferBytes >= this.options.maxBytes) {
      return true;
    }

    return false;
  }

  /**
   * Estimate the size of a row in bytes.
   */
  private estimateRowSize(row: InsertRow): number {
    // Rough estimation: serialize to JSON and measure
    // This is approximate but sufficient for buffering purposes
    return JSON.stringify(row).length;
  }
}
