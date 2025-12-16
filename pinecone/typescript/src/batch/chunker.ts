/**
 * Batch chunking utilities for splitting items into manageable chunks.
 */

/**
 * Options for chunking operations
 */
export interface ChunkOptions {
  /**
   * Maximum number of items per chunk (default: 100)
   */
  maxSize: number;
}

/**
 * Split an array of items into chunks of a specified size
 *
 * @param items - Array of items to chunk
 * @param maxSize - Maximum number of items per chunk
 * @returns Array of chunks, where each chunk is an array of items
 *
 * @example
 * ```typescript
 * const items = [1, 2, 3, 4, 5];
 * const chunks = chunkByCount(items, 2);
 * // Returns [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunkByCount<T>(items: T[], maxSize: number): T[][] {
  if (maxSize <= 0) {
    throw new Error('maxSize must be greater than 0');
  }

  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += maxSize) {
    chunks.push(items.slice(i, i + maxSize));
  }

  return chunks;
}

/**
 * Estimate the number of chunks needed for a given item count
 *
 * @param itemCount - Total number of items
 * @param maxSize - Maximum number of items per chunk
 * @returns The number of chunks that will be created
 *
 * @example
 * ```typescript
 * const chunks = estimateChunks(250, 100);
 * // Returns 3
 * ```
 */
export function estimateChunks(itemCount: number, maxSize: number): number {
  if (maxSize <= 0) {
    throw new Error('maxSize must be greater than 0');
  }

  if (itemCount <= 0) {
    return 0;
  }

  return Math.ceil(itemCount / maxSize);
}
