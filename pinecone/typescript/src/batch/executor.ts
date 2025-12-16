/**
 * Parallel batch executor for processing items in chunks with concurrency control.
 */

import { chunkByCount } from './chunker.js';
import { createProgress, updateProgress, type BatchProgress } from './progress.js';

/**
 * Options for batch execution
 */
export interface BatchOptions {
  /**
   * Maximum number of items per chunk (default: 100)
   */
  chunkSize: number;

  /**
   * Maximum number of chunks to process in parallel (default: 4)
   */
  maxParallelism: number;

  /**
   * Whether to continue processing remaining chunks if one fails (default: false)
   */
  continueOnError: boolean;

  /**
   * Optional callback to track progress updates
   */
  onProgress?: (progress: BatchProgress) => void;
}

/**
 * Result of a batch operation
 */
export interface BatchResult<T> {
  /**
   * Results from successful chunk operations
   */
  results: T[];

  /**
   * Errors that occurred during processing
   */
  errors: Array<{ index: number; error: Error }>;

  /**
   * Final progress state
   */
  progress: BatchProgress;
}

/**
 * Default batch options
 */
const DEFAULT_OPTIONS: BatchOptions = {
  chunkSize: 100,
  maxParallelism: 4,
  continueOnError: false,
};

/**
 * Simple semaphore for controlling concurrent execution
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  /**
   * Acquire a permit, waiting if necessary
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  /**
   * Release a permit, potentially unblocking a waiting caller
   */
  release(): void {
    this.permits++;
    const resolve = this.waiting.shift();
    if (resolve) {
      this.permits--;
      resolve();
    }
  }
}

/**
 * Parallel executor for batch operations
 *
 * Splits items into chunks and processes them in parallel with concurrency control.
 * Uses a semaphore pattern to limit the number of concurrent operations.
 */
export class ParallelExecutor {
  private options: BatchOptions;

  constructor(options: Partial<BatchOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute an operation on all items in parallel with concurrency control
   *
   * @param items - Array of items to process
   * @param operation - Async function to execute on each chunk
   * @returns BatchResult with results, errors, and progress
   *
   * @example
   * ```typescript
   * const executor = new ParallelExecutor({ chunkSize: 50, maxParallelism: 2 });
   * const result = await executor.executeAll(
   *   vectors,
   *   async (chunk) => await upsertVectors(chunk)
   * );
   * ```
   */
  async executeAll<T, R>(
    items: T[],
    operation: (chunk: T[]) => Promise<R>
  ): Promise<BatchResult<R>> {
    // Chunk the items
    const chunks = chunkByCount(items, this.options.chunkSize);

    // Initialize progress
    const progress = createProgress(items.length);

    // Initialize results and errors
    const results: R[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    // Call initial progress callback
    if (this.options.onProgress) {
      this.options.onProgress(progress);
    }

    // If no chunks, return early
    if (chunks.length === 0) {
      return { results, errors, progress };
    }

    // Create semaphore for concurrency control
    const semaphore = new Semaphore(this.options.maxParallelism);

    // Process chunks
    const processChunk = async (chunk: T[], index: number): Promise<void> => {
      // Acquire permit
      await semaphore.acquire();

      try {
        // Update progress: mark chunk items as in progress
        progress.inProgress += chunk.length;
        if (this.options.onProgress) {
          this.options.onProgress(progress);
        }

        // Execute the operation
        const result = await operation(chunk);
        results[index] = result;

        // Update progress: mark chunk items as completed
        progress.inProgress -= chunk.length;
        Object.assign(progress, updateProgress(progress, chunk.length, 0));
        if (this.options.onProgress) {
          this.options.onProgress(progress);
        }
      } catch (error) {
        // Update progress: mark chunk items as failed
        progress.inProgress -= chunk.length;
        Object.assign(progress, updateProgress(progress, 0, chunk.length));

        errors.push({
          index,
          error: error instanceof Error ? error : new Error(String(error)),
        });

        if (this.options.onProgress) {
          this.options.onProgress(progress);
        }

        // If not continuing on error, throw to stop processing
        if (!this.options.continueOnError) {
          throw error;
        }
      } finally {
        // Release permit
        semaphore.release();
      }
    };

    // Execute all chunks
    try {
      await Promise.all(chunks.map((chunk, index) => processChunk(chunk, index)));
    } catch (error) {
      // If continueOnError is false, we stop here and return what we have
      if (!this.options.continueOnError) {
        return { results, errors, progress };
      }
    }

    return { results, errors, progress };
  }
}
