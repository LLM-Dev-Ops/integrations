/**
 * Array chunking utility for batch operations.
 *
 * Provides utilities to split arrays into smaller chunks for batch processing.
 */

/**
 * Splits an array into chunks of a specified size.
 *
 * @template T - Type of items in the array
 * @param array - Array to split into chunks
 * @param size - Maximum size of each chunk
 * @returns Array of chunks, where each chunk is an array of items
 *
 * @example
 * ```typescript
 * const items = [1, 2, 3, 4, 5];
 * const chunks = chunk(items, 2);
 * // [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }

  if (array.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}
