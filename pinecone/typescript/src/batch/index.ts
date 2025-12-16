/**
 * Batch operations module for Pinecone.
 *
 * Provides utilities for processing large numbers of vectors in batches with:
 * - Chunking: Split items into manageable chunks
 * - Progress tracking: Monitor batch operation progress
 * - Parallel execution: Process chunks concurrently with semaphore-based control
 * - High-level operations: Batch upsert, fetch, and delete
 *
 * @example
 * ```typescript
 * import { batchUpsert, ParallelExecutor } from './batch';
 *
 * // Batch upsert with progress tracking
 * const response = await batchUpsert(transport, {
 *   vectors: largeVectorArray,
 *   namespace: 'my-namespace',
 *   options: {
 *     chunkSize: 100,
 *     maxParallelism: 4,
 *     continueOnError: true,
 *     onProgress: (progress) => {
 *       console.log(`Progress: ${progress.completed}/${progress.total}`);
 *     }
 *   }
 * });
 * ```
 *
 * @module batch
 */

// Chunking utilities
export { chunkByCount, estimateChunks, type ChunkOptions } from './chunker.js';

// Progress tracking
export {
  createProgress,
  updateProgress,
  getPercentage,
  type BatchProgress,
} from './progress.js';

// Parallel executor
export {
  ParallelExecutor,
  type BatchOptions,
  type BatchResult,
} from './executor.js';

// Batch operations
export {
  batchUpsert,
  batchFetch,
  batchDelete,
  type BatchUpsertRequest,
  type BatchUpsertResponse,
  type BatchFetchRequest,
  type BatchDeleteRequest,
  type HttpTransport,
} from './operations.js';
