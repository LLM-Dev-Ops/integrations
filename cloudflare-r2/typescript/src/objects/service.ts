/**
 * Objects Service implementation for Cloudflare R2 Storage
 * @module @studiorack/cloudflare-r2/objects/service
 */

import type { R2ObjectsService } from './interface.js';
import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { NormalizedR2Config } from '../config/index.js';
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
import { putObject } from './put.js';
import { getObject, getObjectStream } from './get.js';
import { deleteObject, deleteObjects } from './delete.js';
import { headObject } from './head.js';
import { copyObject } from './copy.js';
import { listObjects, listAllObjects } from './list.js';

/**
 * Main implementation of R2ObjectsService
 *
 * This service provides all object operations for R2 storage:
 * - Upload (PUT) - buffered and streaming
 * - Download (GET) - buffered and streaming
 * - Delete - single and bulk
 * - Metadata (HEAD)
 * - Copy
 * - List - paginated and iterator
 *
 * The service handles:
 * - Request signing with R2Signer
 * - HTTP transport
 * - Error mapping and handling
 * - Response parsing
 *
 * @example
 * ```typescript
 * import { R2ObjectsServiceImpl } from '@studiorack/cloudflare-r2/objects';
 * import { createFetchTransport } from '@studiorack/cloudflare-r2/transport';
 * import { R2Signer } from '@studiorack/cloudflare-r2/signing';
 * import { normalizeConfig } from '@studiorack/cloudflare-r2/config';
 *
 * const config = normalizeConfig({
 *   accountId: 'abc123',
 *   accessKeyId: 'key',
 *   secretAccessKey: 'secret'
 * });
 *
 * const transport = createFetchTransport();
 * const signer = new R2Signer({
 *   accessKeyId: config.accessKeyId,
 *   secretAccessKey: config.secretAccessKey
 * });
 *
 * const service = new R2ObjectsServiceImpl(config, transport, signer);
 *
 * // Upload an object
 * await service.put({
 *   bucket: 'my-bucket',
 *   key: 'file.txt',
 *   body: 'Hello, world!'
 * });
 *
 * // Download an object
 * const result = await service.get({
 *   bucket: 'my-bucket',
 *   key: 'file.txt'
 * });
 * console.log(result.body.toString());
 * ```
 */
export class R2ObjectsServiceImpl implements R2ObjectsService {
  /**
   * Creates a new R2ObjectsService instance
   *
   * @param config - Normalized R2 configuration
   * @param transport - HTTP transport for requests
   * @param signer - R2 signer for authentication
   */
  constructor(
    private readonly config: NormalizedR2Config,
    private readonly transport: HttpTransport,
    private readonly signer: R2Signer
  ) {}

  /**
   * Upload an object to R2 (buffered)
   *
   * @param request - Object upload request
   * @returns Upload result with ETag and version ID
   */
  async put(request: PutObjectRequest): Promise<PutObjectOutput> {
    return putObject(this.transport, this.signer, this.config.endpointUrl, request);
  }

  /**
   * Upload an object to R2 (streaming)
   *
   * @param request - Object upload request with streaming body
   * @returns Upload result with ETag and version ID
   */
  async putStream(request: PutObjectRequest): Promise<PutObjectOutput> {
    // putObject handles both buffered and streaming bodies
    return putObject(this.transport, this.signer, this.config.endpointUrl, request);
  }

  /**
   * Download an object from R2 (buffered)
   *
   * @param request - Object download request
   * @returns Object data with metadata
   */
  async get(request: GetObjectRequest): Promise<GetObjectOutput> {
    return getObject(this.transport, this.signer, this.config.endpointUrl, request);
  }

  /**
   * Download an object from R2 (streaming)
   *
   * @param request - Object download request
   * @returns Object stream with metadata
   */
  async getStream(request: GetObjectRequest): Promise<GetObjectStreamOutput> {
    return getObjectStream(this.transport, this.signer, this.config.endpointUrl, request);
  }

  /**
   * Delete a single object from R2
   *
   * @param request - Object deletion request
   */
  async delete(request: DeleteObjectRequest): Promise<void> {
    return deleteObject(this.transport, this.signer, this.config.endpointUrl, request);
  }

  /**
   * Delete multiple objects from R2 in a single request
   *
   * @param request - Bulk deletion request
   * @returns Deletion results with success and error lists
   */
  async deleteObjects(request: DeleteObjectsRequest): Promise<DeleteObjectsOutput> {
    return deleteObjects(this.transport, this.signer, this.config.endpointUrl, request);
  }

  /**
   * Retrieve object metadata without downloading the object
   *
   * @param request - Metadata request
   * @returns Object metadata
   */
  async head(request: HeadObjectRequest): Promise<HeadObjectOutput> {
    return headObject(this.transport, this.signer, this.config.endpointUrl, request);
  }

  /**
   * Copy an object within R2
   *
   * @param request - Copy request
   * @returns Copy result with new object metadata
   */
  async copy(request: CopyObjectRequest): Promise<CopyObjectOutput> {
    return copyObject(this.transport, this.signer, this.config.endpointUrl, request);
  }

  /**
   * List objects in a bucket with pagination
   *
   * @param request - List request with optional filters
   * @returns List of objects with pagination info
   */
  async list(request: ListObjectsRequest): Promise<ListObjectsOutput> {
    return listObjects(this.transport, this.signer, this.config.endpointUrl, request);
  }

  /**
   * List all objects in a bucket using automatic pagination
   *
   * @param request - List request without continuation token
   * @returns Async iterator of objects
   */
  async *listAll(
    request: Omit<ListObjectsRequest, 'continuationToken'>
  ): AsyncIterableIterator<R2Object> {
    yield* listAllObjects(this.transport, this.signer, this.config.endpointUrl, request);
  }
}
