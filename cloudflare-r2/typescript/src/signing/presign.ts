/**
 * Presigned URL generation for S3 Signature V4
 * Based on SPARC specification section 3.4
 */

import type { R2Signer } from './signer.js';
import type { PresignedUrlResult } from './types.js';

/**
 * Create a presigned URL for GET or PUT operations
 *
 * @param signer - R2Signer instance
 * @param method - HTTP method (GET or PUT)
 * @param bucket - Bucket name
 * @param key - Object key
 * @param expiresIn - Expiration time in seconds (max 604800 - 7 days)
 * @param endpoint - R2 endpoint URL
 * @param options - Additional options
 * @returns Presigned URL result
 */
export function createPresignedUrl(
  signer: R2Signer,
  method: 'GET' | 'PUT',
  bucket: string,
  key: string,
  expiresIn: number,
  endpoint: string,
  options?: {
    contentType?: string;
  }
): PresignedUrlResult {
  // Maximum expiration is 7 days
  const MAX_EXPIRES = 604800; // 7 days in seconds

  if (expiresIn > MAX_EXPIRES) {
    throw new Error(
      `Presigned URL expiration cannot exceed ${MAX_EXPIRES} seconds (7 days)`
    );
  }

  if (expiresIn <= 0) {
    throw new Error('Presigned URL expiration must be positive');
  }

  // Use the signer's presignUrl method
  return signer.presignUrl(
    {
      method,
      bucket,
      key,
      expiresIn,
      contentType: options?.contentType,
    },
    endpoint
  );
}
