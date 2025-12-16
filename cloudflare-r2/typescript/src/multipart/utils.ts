/**
 * Utility functions for multipart upload operations
 * @module @studiorack/cloudflare-r2/multipart/utils
 */

/**
 * Builds a URL for multipart upload operations
 *
 * @param endpoint - R2 endpoint URL
 * @param bucket - Bucket name
 * @param key - Object key
 * @param params - Query parameters
 * @returns Complete URL with query parameters
 */
export function buildMultipartUrl(
  endpoint: string,
  bucket: string,
  key: string,
  params: Record<string, string>
): string {
  // Encode the key for URL safety
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  // Build base URL
  const baseUrl = `${endpoint}/${bucket}/${encodedKey}`;

  // Add query parameters
  const queryParams = new URLSearchParams();
  for (const [paramKey, paramValue] of Object.entries(params)) {
    if (paramValue !== undefined && paramValue !== null) {
      queryParams.append(paramKey, paramValue);
    }
  }

  const queryString = queryParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Splits data into fixed-size chunks
 *
 * @param data - Data to split
 * @param chunkSize - Size of each chunk in bytes
 * @returns Array of chunks
 */
export function splitIntoChunks(data: Uint8Array, chunkSize: number): Uint8Array[] {
  if (chunkSize <= 0) {
    throw new Error('Chunk size must be positive');
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;

  while (offset < data.length) {
    const end = Math.min(offset + chunkSize, data.length);
    chunks.push(data.slice(offset, end));
    offset = end;
  }

  return chunks;
}

/**
 * Reads a stream into fixed-size chunks
 *
 * @param stream - ReadableStream to read
 * @param chunkSize - Size of each chunk in bytes
 * @returns Array of chunks
 */
export async function readStreamToChunks(
  stream: ReadableStream<Uint8Array>,
  chunkSize: number
): Promise<Uint8Array[]> {
  if (chunkSize <= 0) {
    throw new Error('Chunk size must be positive');
  }

  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let buffer = new Uint8Array(0);

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Add remaining buffer as final chunk
        if (buffer.length > 0) {
          chunks.push(buffer);
        }
        break;
      }

      // Append new data to buffer
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;

      // Extract complete chunks
      while (buffer.length >= chunkSize) {
        chunks.push(buffer.slice(0, chunkSize));
        buffer = buffer.slice(chunkSize);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return chunks;
}

/**
 * Converts various body types to Uint8Array
 *
 * @param body - Body in various formats
 * @returns Uint8Array representation
 */
export function normalizeBody(
  body: string | Buffer | Uint8Array | ReadableStream<Uint8Array>
): Uint8Array | ReadableStream<Uint8Array> {
  if (body instanceof ReadableStream) {
    return body;
  }

  if (typeof body === 'string') {
    return new TextEncoder().encode(body);
  }

  if (Buffer.isBuffer(body)) {
    return new Uint8Array(body);
  }

  return body;
}

/**
 * Estimates the total size of a body
 *
 * @param body - Body to measure
 * @returns Size in bytes, or undefined if size cannot be determined
 */
export function estimateBodySize(
  body: string | Buffer | Uint8Array | ReadableStream<Uint8Array>
): number | undefined {
  if (typeof body === 'string') {
    return new TextEncoder().encode(body).length;
  }

  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    return body.length;
  }

  // Cannot determine size of stream
  return undefined;
}

/**
 * Validates part number is within allowed range
 *
 * @param partNumber - Part number to validate
 * @throws {Error} If part number is invalid
 */
export function validatePartNumber(partNumber: number): void {
  if (!Number.isInteger(partNumber)) {
    throw new Error('Part number must be an integer');
  }

  if (partNumber < 1 || partNumber > 10000) {
    throw new Error('Part number must be between 1 and 10000');
  }
}

/**
 * Validates part size meets minimum requirements
 *
 * @param size - Part size in bytes
 * @param isLastPart - Whether this is the last part
 * @throws {Error} If part size is invalid
 */
export function validatePartSize(size: number, isLastPart: boolean): void {
  const MIN_PART_SIZE = 5 * 1024 * 1024; // 5 MB

  if (!isLastPart && size < MIN_PART_SIZE) {
    throw new Error(
      `Part size must be at least ${MIN_PART_SIZE} bytes (5 MB). Last part can be smaller.`
    );
  }

  if (size <= 0) {
    throw new Error('Part size must be positive');
  }
}

/**
 * Sorts parts by part number in ascending order
 *
 * @param parts - Array of parts to sort
 * @returns Sorted array
 */
export function sortPartsByNumber<T extends { partNumber: number }>(parts: T[]): T[] {
  return [...parts].sort((a, b) => a.partNumber - b.partNumber);
}

/**
 * Validates that parts are in ascending order without gaps
 *
 * @param parts - Array of parts to validate
 * @throws {Error} If parts are not properly ordered
 */
export function validatePartsSequence(parts: Array<{ partNumber: number }>): void {
  if (parts.length === 0) {
    throw new Error('Parts array cannot be empty');
  }

  const sorted = sortPartsByNumber(parts);

  for (let i = 0; i < sorted.length; i++) {
    const expectedPartNumber = i + 1;
    if (sorted[i].partNumber !== expectedPartNumber) {
      throw new Error(
        `Parts must be numbered sequentially starting from 1. Expected part ${expectedPartNumber}, got ${sorted[i].partNumber}`
      );
    }
  }
}
