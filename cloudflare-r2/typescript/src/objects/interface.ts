/**
 * Objects Service interface for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/objects/interface
 */

import type {
  PutObjectRequest,
  PutObjectOutput,
  GetObjectRequest,
  GetObjectOutput,
  GetObjectStreamOutput,
  DeleteObjectRequest,
  DeleteObjectsRequest,
  DeleteObjectsOutput,
  HeadObjectRequest,
  HeadObjectOutput,
  CopyObjectRequest,
  CopyObjectOutput,
  ListObjectsRequest,
  ListObjectsOutput,
  R2Object,
} from '../types/index.js';

/**
 * Service interface for R2 object operations
 *
 * Provides methods for:
 * - Uploading objects (buffered and streaming)
 * - Downloading objects (buffered and streaming)
 * - Deleting objects (single and bulk)
 * - Copying objects within or between buckets
 * - Listing objects with pagination
 * - Retrieving object metadata
 *
 * All methods handle authentication, signing, error mapping, and transport.
 */
export interface R2ObjectsService {
  /**
   * Upload an object to R2 (buffered)
   *
   * Suitable for small to medium objects that fit in memory.
   * For large objects, consider using putStream or multipart upload.
   *
   * @param request - Object upload request
   * @returns Upload result with ETag and version ID
   * @throws {ObjectError} If object upload fails
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * const result = await service.put({
   *   bucket: 'my-bucket',
   *   key: 'file.txt',
   *   body: 'Hello, world!',
   *   contentType: 'text/plain'
   * });
   * console.log(result.eTag);
   * ```
   */
  put(request: PutObjectRequest): Promise<PutObjectOutput>;

  /**
   * Upload an object to R2 (streaming)
   *
   * Suitable for large objects or streaming data.
   * Body can be a ReadableStream for efficient memory usage.
   *
   * @param request - Object upload request with streaming body
   * @returns Upload result with ETag and version ID
   * @throws {ObjectError} If object upload fails
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * const stream = fs.createReadStream('large-file.zip');
   * const result = await service.putStream({
   *   bucket: 'my-bucket',
   *   key: 'large-file.zip',
   *   body: stream,
   *   contentType: 'application/zip'
   * });
   * ```
   */
  putStream(request: PutObjectRequest): Promise<PutObjectOutput>;

  /**
   * Download an object from R2 (buffered)
   *
   * Downloads the entire object into memory as a Buffer.
   * Suitable for small to medium objects.
   *
   * @param request - Object download request
   * @returns Object data with metadata
   * @throws {ObjectError} If object not found or download fails
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * const result = await service.get({
   *   bucket: 'my-bucket',
   *   key: 'file.txt'
   * });
   * console.log(result.body.toString('utf-8'));
   * console.log(result.contentType);
   * ```
   */
  get(request: GetObjectRequest): Promise<GetObjectOutput>;

  /**
   * Download an object from R2 (streaming)
   *
   * Downloads the object as a stream for efficient memory usage.
   * Suitable for large objects.
   *
   * @param request - Object download request
   * @returns Object stream with metadata
   * @throws {ObjectError} If object not found or download fails
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * const result = await service.getStream({
   *   bucket: 'my-bucket',
   *   key: 'large-file.zip'
   * });
   * const writer = fs.createWriteStream('downloaded.zip');
   * await result.body.pipeTo(writer);
   * ```
   */
  getStream(request: GetObjectRequest): Promise<GetObjectStreamOutput>;

  /**
   * Delete a single object from R2
   *
   * Deletes the specified object. Returns successfully even if
   * the object doesn't exist (idempotent operation).
   *
   * @param request - Object deletion request
   * @returns Promise that resolves when deletion completes
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * await service.delete({
   *   bucket: 'my-bucket',
   *   key: 'file-to-delete.txt'
   * });
   * ```
   */
  delete(request: DeleteObjectRequest): Promise<void>;

  /**
   * Delete multiple objects from R2 in a single request
   *
   * Can delete up to 1000 objects per request.
   * Returns results indicating which objects were successfully deleted
   * and which encountered errors.
   *
   * @param request - Bulk deletion request
   * @returns Deletion results with success and error lists
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * const result = await service.deleteObjects({
   *   bucket: 'my-bucket',
   *   objects: [
   *     { key: 'file1.txt' },
   *     { key: 'file2.txt' },
   *     { key: 'file3.txt' }
   *   ]
   * });
   * console.log(`Deleted: ${result.deleted.length}`);
   * console.log(`Errors: ${result.errors.length}`);
   * ```
   */
  deleteObjects(request: DeleteObjectsRequest): Promise<DeleteObjectsOutput>;

  /**
   * Retrieve object metadata without downloading the object
   *
   * Performs a HEAD request to get object metadata including size,
   * content type, ETag, and custom metadata.
   *
   * @param request - Metadata request
   * @returns Object metadata
   * @throws {ObjectError} If object not found
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * const metadata = await service.head({
   *   bucket: 'my-bucket',
   *   key: 'file.txt'
   * });
   * console.log(metadata.contentLength);
   * console.log(metadata.lastModified);
   * console.log(metadata.metadata);
   * ```
   */
  head(request: HeadObjectRequest): Promise<HeadObjectOutput>;

  /**
   * Copy an object within R2
   *
   * Copies an object from one location to another within the same
   * account. Can copy within the same bucket or between buckets.
   *
   * @param request - Copy request
   * @returns Copy result with new object metadata
   * @throws {ObjectError} If source object not found
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * const result = await service.copy({
   *   bucket: 'dest-bucket',
   *   key: 'copied-file.txt',
   *   sourceBucket: 'source-bucket',
   *   sourceKey: 'original-file.txt'
   * });
   * console.log(result.eTag);
   * ```
   */
  copy(request: CopyObjectRequest): Promise<CopyObjectOutput>;

  /**
   * List objects in a bucket with pagination
   *
   * Returns up to 1000 objects per request.
   * Use nextContinuationToken for pagination.
   *
   * @param request - List request with optional filters
   * @returns List of objects with pagination info
   * @throws {BucketError} If bucket not found
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * const result = await service.list({
   *   bucket: 'my-bucket',
   *   prefix: 'images/',
   *   maxKeys: 100
   * });
   *
   * for (const obj of result.contents) {
   *   console.log(obj.key, obj.size);
   * }
   *
   * if (result.isTruncated) {
   *   // More results available
   *   const nextPage = await service.list({
   *     bucket: 'my-bucket',
   *     continuationToken: result.nextContinuationToken
   *   });
   * }
   * ```
   */
  list(request: ListObjectsRequest): Promise<ListObjectsOutput>;

  /**
   * List all objects in a bucket using automatic pagination
   *
   * Returns an async iterator that automatically handles pagination,
   * yielding objects one at a time. Suitable for processing large buckets.
   *
   * @param request - List request without continuation token
   * @returns Async iterator of objects
   * @throws {BucketError} If bucket not found
   * @throws {ValidationError} If request parameters are invalid
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * for await (const obj of service.listAll({ bucket: 'my-bucket', prefix: 'data/' })) {
   *   console.log(obj.key, obj.size);
   *   // Process each object
   * }
   * ```
   */
  listAll(
    request: Omit<ListObjectsRequest, 'continuationToken'>
  ): AsyncIterableIterator<R2Object>;
}
