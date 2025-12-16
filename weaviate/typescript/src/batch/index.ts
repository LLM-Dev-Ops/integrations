/**
 * Batch operations module for Weaviate.
 *
 * Provides utilities for processing large numbers of objects in batches with:
 * - Automatic chunking: Split large batches into manageable chunks
 * - Progress tracking: Monitor batch operation progress
 * - Parallel execution: Process chunks concurrently with semaphore control
 * - Retry logic: Automatic retry for transient failures
 * - High-level operations: Batch create, update, and delete with observability
 *
 * @example
 * ```typescript
 * import { BatchService } from './batch';
 *
 * const batchService = new BatchService(
 *   transport,
 *   observability,
 *   resilience,
 *   { defaultBatchSize: 100 }
 * );
 *
 * // Batch create with progress tracking
 * const response = await batchService.batchCreate(objects, {
 *   batchSize: 100,
 *   maxParallelism: 4,
 *   continueOnError: true,
 *   onProgress: (current, total, successful, failed) => {
 *     console.log(`Progress: ${current}/${total} (${successful} ok, ${failed} failed)`);
 *   }
 * });
 *
 * // Batch create with automatic retry
 * const result = await batchService.batchCreateWithRetry(objects, {
 *   maxRetries: 3,
 *   batchSize: 100,
 *   initialDelayMs: 1000
 * });
 *
 * // Batch delete by filter
 * const deleteResponse = await batchService.batchDelete(
 *   'Article',
 *   { operator: 'Operand', operand: { path: ['status'], operator: 'Equal', value: 'archived' } },
 *   { dryRun: false }
 * );
 * ```
 *
 * @module batch
 */

// Service
export { BatchService, type BatchServiceConfig } from './service.js';

// Types
export type {
  BatchOptions,
  BatchRetryOptions,
  BatchDeleteOptions,
  BatchProgress,
  BatchResult,
  BatchChunk,
  BatchUpdateObject,
} from './types.js';

// Chunking utilities
export {
  chunkArray,
  createChunks,
  estimateBatchSize,
  calculateOptimalChunkSize,
} from './chunker.js';

// Progress tracking
export {
  BatchProgressTracker,
  createProgressTracker,
  type ProgressCallback,
} from './progress.js';

// Retry utilities
export {
  isRetriableBatchError,
  isValidationError,
  extractFailedObjects,
  aggregateBatchResponses,
  calculateRetryDelay,
  groupErrorsByType,
  separateRetriableErrors,
} from './retry.js';
