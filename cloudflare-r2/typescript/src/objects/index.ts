/**
 * Objects Service module for Cloudflare R2 Storage Integration
 *
 * This module provides complete object operation capabilities for R2:
 * - Upload objects (PUT) - buffered and streaming
 * - Download objects (GET) - buffered and streaming
 * - Delete objects - single and bulk operations
 * - Retrieve object metadata (HEAD)
 * - Copy objects within or between buckets
 * - List objects with pagination and filtering
 *
 * @module @studiorack/cloudflare-r2/objects
 *
 * @example
 * ```typescript
 * import { R2ObjectsServiceImpl } from '@studiorack/cloudflare-r2/objects';
 * import { createFetchTransport } from '@studiorack/cloudflare-r2/transport';
 * import { R2Signer } from '@studiorack/cloudflare-r2/signing';
 * import { normalizeConfig } from '@studiorack/cloudflare-r2/config';
 *
 * // Create service
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
 * // Upload
 * await service.put({
 *   bucket: 'my-bucket',
 *   key: 'documents/report.pdf',
 *   body: pdfBuffer,
 *   contentType: 'application/pdf',
 *   metadata: { author: 'John Doe' }
 * });
 *
 * // Download
 * const result = await service.get({
 *   bucket: 'my-bucket',
 *   key: 'documents/report.pdf'
 * });
 * console.log('Size:', result.contentLength);
 *
 * // Stream download
 * const stream = await service.getStream({
 *   bucket: 'my-bucket',
 *   key: 'videos/large-file.mp4'
 * });
 *
 * // List objects
 * const list = await service.list({
 *   bucket: 'my-bucket',
 *   prefix: 'images/',
 *   maxKeys: 100
 * });
 *
 * // Iterate all objects
 * for await (const obj of service.listAll({ bucket: 'my-bucket' })) {
 *   console.log(obj.key, obj.size);
 * }
 *
 * // Delete multiple objects
 * await service.deleteObjects({
 *   bucket: 'my-bucket',
 *   objects: [
 *     { key: 'old-file-1.txt' },
 *     { key: 'old-file-2.txt' }
 *   ]
 * });
 *
 * // Copy object
 * await service.copy({
 *   bucket: 'dest-bucket',
 *   key: 'backup/file.txt',
 *   sourceBucket: 'source-bucket',
 *   sourceKey: 'original/file.txt'
 * });
 * ```
 */

// Service interface
export type { R2ObjectsService } from './interface.js';

// Service implementation
export { R2ObjectsServiceImpl } from './service.js';

// Individual operation functions (for advanced usage)
export { putObject } from './put.js';
export { getObject, getObjectStream } from './get.js';
export { deleteObject, deleteObjects } from './delete.js';
export { headObject } from './head.js';
export { copyObject } from './copy.js';
export { listObjects, listAllObjects } from './list.js';

// Utility functions
export {
  buildObjectUrl,
  encodeKey,
  extractMetadata,
  buildMetadataHeaders,
  extractObjectMetadata,
  buildQueryString,
  normalizeBody,
  isStream,
  parseHeaderDate,
} from './utils.js';
