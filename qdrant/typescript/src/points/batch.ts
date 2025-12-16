/**
 * Batch Processing for Point Operations
 *
 * Provides efficient batch processing with adaptive sizing,
 * concurrent execution, and proper error handling.
 */

import type {
  Point,
  UpsertResult,
  BatchUpsertResult,
  BatchOptions,
  BatchError,
} from './types.js';

/**
 * Semaphore for controlling concurrent operations
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

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
      this.queue.push(resolve);
    });
  }

  /**
   * Release a permit
   */
  release(): void {
    this.permits++;
    const next = this.queue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }

  /**
   * Get current available permits
   */
  available(): number {
    return this.permits;
  }
}

/**
 * Adaptive batch size calculator
 * Adjusts batch size based on success/failure rates
 */
class AdaptiveBatchSizer {
  private currentSize: number;
  private readonly minSize: number;
  private readonly maxSize: number;
  private successCount = 0;
  private failureCount = 0;
  private readonly adjustmentThreshold = 5;

  constructor(initialSize: number, minSize = 10, maxSize = 1000) {
    this.currentSize = initialSize;
    this.minSize = minSize;
    this.maxSize = maxSize;
  }

  /**
   * Get current batch size
   */
  getSize(): number {
    return this.currentSize;
  }

  /**
   * Record a successful batch
   */
  recordSuccess(): void {
    this.successCount++;
    this.adjust();
  }

  /**
   * Record a failed batch
   */
  recordFailure(): void {
    this.failureCount++;
    this.adjust();
  }

  /**
   * Adjust batch size based on success/failure pattern
   */
  private adjust(): void {
    const total = this.successCount + this.failureCount;
    if (total < this.adjustmentThreshold) {
      return;
    }

    const successRate = this.successCount / total;

    if (successRate > 0.95 && this.currentSize < this.maxSize) {
      // High success rate - increase batch size
      this.currentSize = Math.min(
        Math.floor(this.currentSize * 1.5),
        this.maxSize
      );
    } else if (successRate < 0.8 && this.currentSize > this.minSize) {
      // Lower success rate - decrease batch size
      this.currentSize = Math.max(
        Math.floor(this.currentSize * 0.7),
        this.minSize
      );
    }

    // Reset counters
    this.successCount = 0;
    this.failureCount = 0;
  }
}

/**
 * Batch processor for point operations
 */
export class BatchProcessor {
  private readonly upsertFn: (points: Point[]) => Promise<UpsertResult>;
  private sizer: AdaptiveBatchSizer;

  constructor(upsertFn: (points: Point[]) => Promise<UpsertResult>) {
    this.upsertFn = upsertFn;
    this.sizer = new AdaptiveBatchSizer(100, 10, 1000);
  }

  /**
   * Process points in batches with adaptive sizing and concurrency control
   */
  async processBatches(
    points: Point[],
    options: BatchOptions = {}
  ): Promise<BatchUpsertResult> {
    const {
      batchSize = 100,
      maxConcurrency = 5,
      onProgress,
      onBatchComplete,
      onBatchError,
    } = options;

    // Set initial batch size
    this.sizer = new AdaptiveBatchSizer(batchSize, 10, 1000);

    // Create batches
    const batches = this.createBatches(points, this.sizer.getSize());
    const totalBatches = batches.length;
    const results: UpsertResult[] = [];
    const errors: BatchError[] = [];

    // Semaphore for concurrency control
    const semaphore = new Semaphore(maxConcurrency);

    let processedBatches = 0;
    let processedPoints = 0;

    // Process batches concurrently
    const batchPromises = batches.map(async (batch, index) => {
      await semaphore.acquire();

      try {
        const result = await this.upsertFn(batch);
        results.push(result);
        this.sizer.recordSuccess();

        processedBatches++;
        processedPoints += batch.length;

        if (onBatchComplete) {
          onBatchComplete(index, result);
        }

        if (onProgress) {
          onProgress(processedPoints, points.length);
        }

        return result;
      } catch (error) {
        this.sizer.recordFailure();

        const batchError: BatchError = {
          batchIndex: index,
          message: error instanceof Error ? error.message : 'Unknown error',
          pointCount: batch.length,
        };
        errors.push(batchError);

        if (onBatchError) {
          onBatchError(index, error instanceof Error ? error : new Error(String(error)));
        }

        throw error;
      } finally {
        semaphore.release();
      }
    });

    // Wait for all batches with error handling
    const settledResults = await Promise.allSettled(batchPromises);

    // Count successful batches
    const successfulBatches = settledResults.filter(
      (result) => result.status === 'fulfilled'
    ).length;

    return {
      totalPoints: points.length,
      batchesProcessed: successfulBatches,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Create batches from points array
   */
  private createBatches(points: Point[], batchSize: number): Point[][] {
    const batches: Point[][] = [];
    for (let i = 0; i < points.length; i += batchSize) {
      batches.push(points.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process batches with retry logic
   */
  async processBatchesWithRetry(
    points: Point[],
    options: BatchOptions & { maxRetries?: number } = {}
  ): Promise<BatchUpsertResult> {
    const { maxRetries = 3, ...batchOptions } = options;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.processBatches(points, batchOptions);

        // If we have some errors but also some successes, consider it a partial success
        if (result.errors && result.errors.length > 0) {
          const failedPoints = result.errors.reduce(
            (sum, err) => sum + err.pointCount,
            0
          );

          // Only retry if more than 50% failed
          if (failedPoints > points.length / 2 && attempt < maxRetries) {
            lastError = new Error(
              `Batch processing partially failed: ${failedPoints}/${points.length} points failed`
            );
            continue;
          }
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Batch processing failed after retries');
  }
}

/**
 * Create a batch processor
 */
export function createBatchProcessor(
  upsertFn: (points: Point[]) => Promise<UpsertResult>
): BatchProcessor {
  return new BatchProcessor(upsertFn);
}

/**
 * Helper function to split an array into chunks
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Helper function to process items in parallel with concurrency limit
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const semaphore = new Semaphore(concurrency);
  const results: R[] = [];

  const promises = items.map(async (item, index) => {
    await semaphore.acquire();
    try {
      const result = await fn(item, index);
      results[index] = result;
      return result;
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);
  return results;
}
