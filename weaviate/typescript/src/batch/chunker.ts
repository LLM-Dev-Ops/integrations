/**
 * Batch chunking utilities for splitting objects into manageable chunks.
 */

import type { BatchObject } from '../types/batch.js';
import type { BatchChunk } from './types.js';

/**
 * Split an array of objects into chunks of a specified size
 *
 * @param array - Array of items to chunk
 * @param chunkSize - Maximum number of items per chunk
 * @returns Array of chunks
 *
 * @example
 * ```typescript
 * const objects = [obj1, obj2, obj3, obj4, obj5];
 * const chunks = chunkArray(objects, 2);
 * // Returns [[obj1, obj2], [obj3, obj4], [obj5]]
 * ```
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be greater than 0');
  }

  if (array.length === 0) {
    return [];
  }

  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }

  return chunks;
}

/**
 * Create batch chunks with metadata
 *
 * @param objects - Array of batch objects
 * @param batchSize - Maximum number of objects per chunk
 * @returns Array of batch chunks with metadata
 *
 * @example
 * ```typescript
 * const chunks = createChunks(objects, 100);
 * chunks.forEach(chunk => {
 *   console.log(`Chunk ${chunk.index}: ${chunk.objects.length} objects`);
 * });
 * ```
 */
export function createChunks(
  objects: BatchObject[],
  batchSize: number
): BatchChunk[] {
  if (batchSize <= 0) {
    throw new Error('batchSize must be greater than 0');
  }

  if (objects.length === 0) {
    return [];
  }

  const chunks: BatchChunk[] = [];
  const objectChunks = chunkArray(objects, batchSize);

  for (let i = 0; i < objectChunks.length; i++) {
    const chunk = objectChunks[i];
    chunks.push({
      index: i,
      objects: chunk,
      estimatedSize: estimateBatchSize(chunk),
    });
  }

  return chunks;
}

/**
 * Estimate the size in bytes of a batch of objects
 *
 * Provides a rough estimate based on JSON serialization size.
 * Used for monitoring and optimization purposes.
 *
 * @param objects - Array of batch objects
 * @returns Estimated size in bytes
 *
 * @example
 * ```typescript
 * const size = estimateBatchSize(objects);
 * console.log(`Estimated batch size: ${size} bytes`);
 * ```
 */
export function estimateBatchSize(objects: BatchObject[]): number {
  let totalSize = 0;

  for (const obj of objects) {
    // Estimate object size
    // Base overhead
    totalSize += 100; // Approximate JSON structure overhead

    // Properties
    if (obj.properties) {
      totalSize += JSON.stringify(obj.properties).length;
    }

    // Vector
    if (obj.vector) {
      totalSize += obj.vector.length * 8; // 8 bytes per float64
    }

    // Named vectors
    if (obj.vectors) {
      for (const vector of Object.values(obj.vectors)) {
        totalSize += vector.length * 8;
      }
    }

    // Class name
    totalSize += obj.className.length;

    // ID (UUID)
    totalSize += 36; // UUID string length

    // Tenant
    if (obj.tenant) {
      totalSize += obj.tenant.length;
    }
  }

  return totalSize;
}

/**
 * Calculate the optimal chunk size based on object size
 *
 * Adjusts chunk size to stay under a target payload size while
 * maximizing batch efficiency.
 *
 * @param objects - Sample of objects
 * @param targetSizeBytes - Target payload size in bytes (default: 1MB)
 * @param maxBatchSize - Maximum batch size regardless of size (default: 100)
 * @returns Optimal chunk size
 *
 * @example
 * ```typescript
 * const optimalSize = calculateOptimalChunkSize(objects, 1024 * 1024, 100);
 * console.log(`Using chunk size: ${optimalSize}`);
 * ```
 */
export function calculateOptimalChunkSize(
  objects: BatchObject[],
  targetSizeBytes: number = 1024 * 1024, // 1MB default
  maxBatchSize: number = 100
): number {
  if (objects.length === 0) {
    return maxBatchSize;
  }

  // Sample first few objects to estimate average size
  const sampleSize = Math.min(10, objects.length);
  const sample = objects.slice(0, sampleSize);
  const sampleTotalSize = estimateBatchSize(sample);
  const avgObjectSize = sampleTotalSize / sampleSize;

  // Calculate how many objects fit in target size
  const calculatedSize = Math.floor(targetSizeBytes / avgObjectSize);

  // Clamp to reasonable bounds
  const minSize = 1;
  const chunkSize = Math.max(minSize, Math.min(calculatedSize, maxBatchSize));

  return chunkSize;
}
