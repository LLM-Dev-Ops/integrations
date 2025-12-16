import { gzipSync } from 'zlib';

/**
 * Compress data using gzip if it exceeds threshold.
 */
export function compressIfNeeded(
  data: string,
  threshold: number = 1024
): { data: Buffer | string; isCompressed: boolean } {
  if (data.length < threshold) {
    return { data, isCompressed: false };
  }
  return { data: gzipSync(data), isCompressed: true };
}

/**
 * Check if request accepts gzip encoding.
 */
export function acceptsGzip(acceptEncoding?: string): boolean {
  return acceptEncoding?.includes('gzip') ?? false;
}
