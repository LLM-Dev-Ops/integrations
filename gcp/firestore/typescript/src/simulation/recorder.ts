/**
 * Operation recorder for Firestore simulation.
 *
 * Records all operations performed on the mock client for testing,
 * debugging, and replay purposes.
 *
 * Following the SPARC specification for Firestore integration.
 */

import { promises as fs } from "fs";
import type { FieldValueMap } from "../types/field-value.js";
import type { Query } from "../types/query.js";
import type { FirestoreError } from "../error/index.js";

/**
 * Type of operation recorded.
 */
export type OperationType =
  | "get"
  | "create"
  | "set"
  | "update"
  | "delete"
  | "query"
  | "batch"
  | "transaction"
  | "listen";

/**
 * Recorded operation entry.
 */
export interface RecordedOperation {
  /** Operation type */
  type: OperationType;
  /** Document/collection path */
  path: string;
  /** Timestamp when operation occurred */
  timestamp: Date;
  /** Operation data (for writes) */
  data?: FieldValueMap | FieldValueMap[];
  /** Query (for query operations) */
  query?: Query;
  /** Operation result */
  result?: {
    success: boolean;
    documentCount?: number;
    data?: unknown;
  };
  /** Error if operation failed */
  error?: {
    code: string;
    message: string;
  };
  /** Additional metadata */
  metadata?: {
    transactionId?: string;
    batchId?: string;
    listenerId?: string;
    duration?: number;
  };
}

/**
 * Operation recorder for tracking all operations.
 */
export class OperationRecorder {
  private history: RecordedOperation[] = [];
  private recording = true;

  /**
   * Record an operation.
   *
   * @param operation - Operation to record
   */
  record(operation: RecordedOperation): void {
    if (!this.recording) {
      return;
    }

    this.history.push({
      ...operation,
      timestamp: operation.timestamp || new Date(),
    });
  }

  /**
   * Get the full operation history.
   *
   * @returns Array of recorded operations
   */
  getHistory(): RecordedOperation[] {
    return [...this.history];
  }

  /**
   * Get operations by type.
   *
   * @param type - Operation type to filter
   * @returns Filtered operations
   */
  getByType(type: OperationType): RecordedOperation[] {
    return this.history.filter((op) => op.type === type);
  }

  /**
   * Get operations by path.
   *
   * @param path - Document/collection path
   * @returns Operations for this path
   */
  getByPath(path: string): RecordedOperation[] {
    return this.history.filter((op) => op.path === path);
  }

  /**
   * Get operations within a time range.
   *
   * @param start - Start time
   * @param end - End time
   * @returns Operations in time range
   */
  getByTimeRange(start: Date, end: Date): RecordedOperation[] {
    return this.history.filter(
      (op) => op.timestamp >= start && op.timestamp <= end
    );
  }

  /**
   * Get failed operations.
   *
   * @returns Operations that failed
   */
  getFailures(): RecordedOperation[] {
    return this.history.filter((op) => op.error !== undefined);
  }

  /**
   * Get successful operations.
   *
   * @returns Operations that succeeded
   */
  getSuccesses(): RecordedOperation[] {
    return this.history.filter(
      (op) => op.result?.success === true && !op.error
    );
  }

  /**
   * Clear the operation history.
   */
  clear(): void {
    this.history = [];
  }

  /**
   * Get the number of recorded operations.
   */
  get count(): number {
    return this.history.length;
  }

  /**
   * Pause recording.
   */
  pause(): void {
    this.recording = false;
  }

  /**
   * Resume recording.
   */
  resume(): void {
    this.recording = true;
  }

  /**
   * Check if currently recording.
   */
  get isRecording(): boolean {
    return this.recording;
  }

  /**
   * Save operation history to a file.
   *
   * @param filePath - Path to save the history
   */
  async save(filePath: string): Promise<void> {
    const data = JSON.stringify(
      {
        version: "1.0",
        recordedAt: new Date().toISOString(),
        operationCount: this.history.length,
        operations: this.history.map((op) => ({
          ...op,
          timestamp: op.timestamp.toISOString(),
        })),
      },
      null,
      2
    );

    await fs.writeFile(filePath, data, "utf-8");
  }

  /**
   * Load operation history from a file.
   *
   * @param filePath - Path to load from
   */
  async load(filePath: string): Promise<void> {
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);

    if (parsed.version !== "1.0") {
      throw new Error(`Unsupported recording version: ${parsed.version}`);
    }

    this.history = parsed.operations.map((op: any) => ({
      ...op,
      timestamp: new Date(op.timestamp),
    }));
  }

  /**
   * Get statistics about recorded operations.
   *
   * @returns Operation statistics
   */
  getStats(): {
    total: number;
    byType: Record<OperationType, number>;
    successCount: number;
    failureCount: number;
    averageDuration?: number;
  } {
    const byType: Record<string, number> = {};
    let successCount = 0;
    let failureCount = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const op of this.history) {
      // Count by type
      byType[op.type] = (byType[op.type] || 0) + 1;

      // Count successes/failures
      if (op.error) {
        failureCount++;
      } else if (op.result?.success) {
        successCount++;
      }

      // Track duration
      if (op.metadata?.duration) {
        totalDuration += op.metadata.duration;
        durationCount++;
      }
    }

    return {
      total: this.history.length,
      byType: byType as Record<OperationType, number>,
      successCount,
      failureCount,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : undefined,
    };
  }

  /**
   * Get the last N operations.
   *
   * @param count - Number of operations to retrieve
   * @returns Last N operations
   */
  getLast(count: number): RecordedOperation[] {
    return this.history.slice(-count);
  }

  /**
   * Find operations matching a predicate.
   *
   * @param predicate - Function to test operations
   * @returns Matching operations
   */
  find(predicate: (op: RecordedOperation) => boolean): RecordedOperation[] {
    return this.history.filter(predicate);
  }

  /**
   * Record a get operation.
   */
  recordGet(path: string, result: unknown, error?: FirestoreError): void {
    this.record({
      type: "get",
      path,
      timestamp: new Date(),
      result: {
        success: !error,
        data: result,
      },
      error: error
        ? {
            code: error.code,
            message: error.message,
          }
        : undefined,
    });
  }

  /**
   * Record a write operation (create/set/update).
   */
  recordWrite(
    type: "create" | "set" | "update",
    path: string,
    data: FieldValueMap,
    error?: FirestoreError
  ): void {
    this.record({
      type,
      path,
      data,
      timestamp: new Date(),
      result: {
        success: !error,
      },
      error: error
        ? {
            code: error.code,
            message: error.message,
          }
        : undefined,
    });
  }

  /**
   * Record a delete operation.
   */
  recordDelete(path: string, existed: boolean, error?: FirestoreError): void {
    this.record({
      type: "delete",
      path,
      timestamp: new Date(),
      result: {
        success: !error,
        data: { existed },
      },
      error: error
        ? {
            code: error.code,
            message: error.message,
          }
        : undefined,
    });
  }

  /**
   * Record a query operation.
   */
  recordQuery(
    path: string,
    query: Query,
    documentCount: number,
    error?: FirestoreError
  ): void {
    this.record({
      type: "query",
      path,
      query,
      timestamp: new Date(),
      result: {
        success: !error,
        documentCount,
      },
      error: error
        ? {
            code: error.code,
            message: error.message,
          }
        : undefined,
    });
  }

  /**
   * Record a listener registration.
   */
  recordListen(path: string, listenerId: string): void {
    this.record({
      type: "listen",
      path,
      timestamp: new Date(),
      result: {
        success: true,
      },
      metadata: {
        listenerId,
      },
    });
  }
}

/**
 * Create a new operation recorder.
 *
 * @returns New OperationRecorder instance
 */
export function createOperationRecorder(): OperationRecorder {
  return new OperationRecorder();
}
