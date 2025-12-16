/**
 * Presign service interface for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/presign
 */

import type {
  PresignGetRequest,
  PresignPutRequest,
  PresignedUrl,
} from '../types/index.js';

/**
 * Service for generating presigned URLs for R2 operations
 *
 * Presigned URLs allow clients to perform operations without credentials:
 * - GET: Download objects
 * - PUT: Upload objects
 *
 * URLs are valid for a specified duration (1 second to 7 days).
 */
export interface R2PresignService {
  /**
   * Generate a presigned URL for downloading an object
   *
   * @param request - Presign GET request parameters
   * @returns Presigned URL information
   * @throws {ValidationError} If expiration is out of bounds
   */
  getObject(request: PresignGetRequest): PresignedUrl;

  /**
   * Generate a presigned URL for uploading an object
   *
   * @param request - Presign PUT request parameters
   * @returns Presigned URL information
   * @throws {ValidationError} If expiration is out of bounds
   */
  putObject(request: PresignPutRequest): PresignedUrl;
}
