/**
 * Client interface for Cloudflare R2 Storage Integration
 * Based on SPARC specification section 4.1
 * @module @studiorack/cloudflare-r2/client
 */

// ============================================================================
// Placeholder Service Interfaces
// These will be replaced when the actual service implementations are created
// ============================================================================

/**
 * Placeholder for R2 Objects Service
 * Handles object operations (get, put, delete, head, list)
 */
export interface R2ObjectsService {
  // To be implemented by objects service
}

/**
 * Placeholder for R2 Multipart Service
 * Handles multipart upload operations
 */
export interface R2MultipartService {
  // To be implemented by multipart service
}

/**
 * Placeholder for R2 Presign Service
 * Handles presigned URL generation
 */
export interface R2PresignService {
  // To be implemented by presign service
}

// ============================================================================
// Main Client Interface
// ============================================================================

/**
 * Main R2 client interface
 *
 * Provides access to all R2 operations through specialized service interfaces:
 * - objects: Object operations (get, put, delete, head, list)
 * - multipart: Multipart upload operations
 * - presign: Presigned URL generation
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   accountId: 'my-account',
 *   accessKeyId: 'my-key',
 *   secretAccessKey: 'my-secret'
 * });
 *
 * // Use object operations
 * const data = await client.objects.get('my-bucket', 'my-key');
 *
 * // Use presigned URLs
 * const url = await client.presign.getUrl('my-bucket', 'my-key', 3600);
 *
 * // Clean up
 * await client.close();
 * ```
 */
export interface R2Client {
  /**
   * Service for object operations (get, put, delete, head, list)
   */
  readonly objects: R2ObjectsService;

  /**
   * Service for multipart upload operations
   */
  readonly multipart: R2MultipartService;

  /**
   * Service for presigned URL generation
   */
  readonly presign: R2PresignService;

  /**
   * Closes the client and releases all resources
   *
   * Shuts down the HTTP transport and any background tasks.
   * The client cannot be used after calling close().
   *
   * @returns Promise that resolves when cleanup is complete
   */
  close(): Promise<void>;
}
