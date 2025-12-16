/**
 * Replay engine for Firestore simulation.
 *
 * Replays recorded operations to recreate scenarios for testing
 * and debugging purposes.
 *
 * Following the SPARC specification for Firestore integration.
 */

import { promises as fs } from "fs";
import type { RecordedOperation } from "./recorder.js";
import type { FieldValueMap } from "../types/field-value.js";
import type { DocumentSnapshot } from "../types/document.js";
import type { FirestoreError } from "../error/index.js";
import { NotFoundError, AlreadyExistsError } from "../error/index.js";

/**
 * Replay mode configuration.
 */
export type ReplayMode = "strict" | "lenient";

/**
 * Replay options.
 */
export interface ReplayOptions {
  /** Replay mode - strict requires exact matching, lenient allows variations */
  mode: ReplayMode;
  /** Speed multiplier for time-based replay (1.0 = real-time) */
  speedMultiplier: number;
  /** Whether to emit errors from recordings */
  emitErrors: boolean;
}

/**
 * Replay client that returns recorded responses.
 */
export interface ReplayClient {
  /** Get a document */
  get(path: string): Promise<DocumentSnapshot | null>;
  /** Set a document */
  set(path: string, data: FieldValueMap): Promise<void>;
  /** Update a document */
  update(path: string, updates: FieldValueMap): Promise<void>;
  /** Delete a document */
  delete(path: string): Promise<boolean>;
  /** Query documents */
  query(collectionPath: string): Promise<DocumentSnapshot[]>;
  /** Check if replay is complete */
  isComplete(): boolean;
  /** Get current operation index */
  getCurrentIndex(): number;
}

/**
 * Replay engine for recreating recorded scenarios.
 */
export class ReplayEngine {
  private operations: RecordedOperation[] = [];
  private currentIndex = 0;
  private options: ReplayOptions = {
    mode: "strict",
    speedMultiplier: 1.0,
    emitErrors: true,
  };

  /**
   * Load operations from a file.
   *
   * @param filePath - Path to recording file
   */
  async load(filePath: string): Promise<void> {
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);

    if (parsed.version !== "1.0") {
      throw new Error(`Unsupported recording version: ${parsed.version}`);
    }

    this.operations = parsed.operations.map((op: any) => ({
      ...op,
      timestamp: new Date(op.timestamp),
    }));

    this.currentIndex = 0;
  }

  /**
   * Load operations from an array.
   *
   * @param operations - Array of recorded operations
   */
  loadFromArray(operations: RecordedOperation[]): void {
    this.operations = [...operations];
    this.currentIndex = 0;
  }

  /**
   * Set replay options.
   *
   * @param options - Partial replay options to override
   */
  setOptions(options: Partial<ReplayOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Create a replay client that returns recorded responses.
   *
   * @returns Replay client instance
   */
  createReplayClient(): ReplayClient {
    const self = this;

    return {
      async get(path: string): Promise<DocumentSnapshot | null> {
        const op = self.findNextOperation("get", path);
        if (!op) {
          if (self.options.mode === "strict") {
            throw new Error(`No recorded get operation for path: ${path}`);
          }
          return null;
        }

        // Emit error if recorded
        if (self.options.emitErrors && op.error) {
          throw self.createErrorFromRecording(op.error);
        }

        // Return recorded result
        return (op.result?.data as DocumentSnapshot) || null;
      },

      async set(path: string, data: FieldValueMap): Promise<void> {
        const op = self.findNextOperation("set", path);
        if (!op && self.options.mode === "strict") {
          throw new Error(`No recorded set operation for path: ${path}`);
        }

        // Emit error if recorded
        if (op && self.options.emitErrors && op.error) {
          throw self.createErrorFromRecording(op.error);
        }
      },

      async update(path: string, updates: FieldValueMap): Promise<void> {
        const op = self.findNextOperation("update", path);
        if (!op && self.options.mode === "strict") {
          throw new Error(`No recorded update operation for path: ${path}`);
        }

        // Emit error if recorded
        if (op && self.options.emitErrors && op.error) {
          throw self.createErrorFromRecording(op.error);
        }
      },

      async delete(path: string): Promise<boolean> {
        const op = self.findNextOperation("delete", path);
        if (!op) {
          if (self.options.mode === "strict") {
            throw new Error(`No recorded delete operation for path: ${path}`);
          }
          return false;
        }

        // Emit error if recorded
        if (self.options.emitErrors && op.error) {
          throw self.createErrorFromRecording(op.error);
        }

        // Return whether document existed
        return (op.result?.data as any)?.existed ?? false;
      },

      async query(collectionPath: string): Promise<DocumentSnapshot[]> {
        const op = self.findNextOperation("query", collectionPath);
        if (!op) {
          if (self.options.mode === "strict") {
            throw new Error(`No recorded query operation for path: ${collectionPath}`);
          }
          return [];
        }

        // Emit error if recorded
        if (self.options.emitErrors && op.error) {
          throw self.createErrorFromRecording(op.error);
        }

        // Return empty array (full query results would need to be stored)
        return [];
      },

      isComplete(): boolean {
        return self.currentIndex >= self.operations.length;
      },

      getCurrentIndex(): number {
        return self.currentIndex;
      },
    };
  }

  /**
   * Find the next operation matching the criteria.
   *
   * @param type - Operation type
   * @param path - Operation path
   * @returns Matching operation or undefined
   */
  private findNextOperation(
    type: RecordedOperation["type"],
    path: string
  ): RecordedOperation | undefined {
    // Look for exact match from current index
    for (let i = this.currentIndex; i < this.operations.length; i++) {
      const op = this.operations[i];
      if (op.type === type && op.path === path) {
        this.currentIndex = i + 1;
        return op;
      }
    }

    // In lenient mode, look for any matching type
    if (this.options.mode === "lenient") {
      for (let i = this.currentIndex; i < this.operations.length; i++) {
        const op = this.operations[i];
        if (op.type === type) {
          this.currentIndex = i + 1;
          return op;
        }
      }
    }

    return undefined;
  }

  /**
   * Create an error from a recorded error.
   *
   * @param errorRecord - Recorded error data
   * @returns FirestoreError instance
   */
  private createErrorFromRecording(errorRecord: {
    code: string;
    message: string;
  }): FirestoreError {
    // Map common error codes to specific error types
    switch (errorRecord.code) {
      case "NOT_FOUND":
        return new NotFoundError(errorRecord.message);
      case "ALREADY_EXISTS":
        return new AlreadyExistsError(errorRecord.message);
      default:
        // Return generic error
        return {
          name: "FirestoreError",
          message: errorRecord.message,
          code: errorRecord.code,
        } as FirestoreError;
    }
  }

  /**
   * Reset replay to beginning.
   */
  reset(): void {
    this.currentIndex = 0;
  }

  /**
   * Skip to a specific operation index.
   *
   * @param index - Index to skip to
   */
  skipTo(index: number): void {
    if (index < 0 || index > this.operations.length) {
      throw new Error(`Invalid index: ${index}`);
    }
    this.currentIndex = index;
  }

  /**
   * Get the total number of operations.
   */
  get totalOperations(): number {
    return this.operations.length;
  }

  /**
   * Get progress as a percentage.
   */
  get progress(): number {
    if (this.operations.length === 0) {
      return 100;
    }
    return (this.currentIndex / this.operations.length) * 100;
  }

  /**
   * Get all operations.
   */
  getOperations(): RecordedOperation[] {
    return [...this.operations];
  }

  /**
   * Get current operation.
   */
  getCurrentOperation(): RecordedOperation | undefined {
    if (this.currentIndex < this.operations.length) {
      return this.operations[this.currentIndex];
    }
    return undefined;
  }

  /**
   * Peek at next N operations without advancing.
   *
   * @param count - Number of operations to peek
   * @returns Next operations
   */
  peek(count: number = 1): RecordedOperation[] {
    return this.operations.slice(this.currentIndex, this.currentIndex + count);
  }

  /**
   * Play operations with timing (async iteration).
   *
   * @yields Each operation with delay based on timestamps
   */
  async *play(): AsyncGenerator<RecordedOperation> {
    let previousTimestamp: Date | null = null;

    for (const operation of this.operations) {
      // Calculate delay based on timestamp difference
      if (previousTimestamp) {
        const delay =
          (operation.timestamp.getTime() - previousTimestamp.getTime()) /
          this.options.speedMultiplier;

        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      previousTimestamp = operation.timestamp;
      this.currentIndex++;
      yield operation;
    }
  }

  /**
   * Get statistics about the recording.
   */
  getStats(): {
    totalOperations: number;
    byType: Record<string, number>;
    duration: number;
    failureCount: number;
  } {
    const byType: Record<string, number> = {};
    let failureCount = 0;

    for (const op of this.operations) {
      byType[op.type] = (byType[op.type] || 0) + 1;
      if (op.error) {
        failureCount++;
      }
    }

    const duration =
      this.operations.length > 0
        ? this.operations[this.operations.length - 1].timestamp.getTime() -
          this.operations[0].timestamp.getTime()
        : 0;

    return {
      totalOperations: this.operations.length,
      byType,
      duration,
      failureCount,
    };
  }
}

/**
 * Create a new replay engine.
 *
 * @returns New ReplayEngine instance
 */
export function createReplayEngine(): ReplayEngine {
  return new ReplayEngine();
}
