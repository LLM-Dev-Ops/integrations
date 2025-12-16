/**
 * Multipart upload module for Cloudflare R2 Storage Integration
 *
 * This module provides comprehensive multipart upload support for R2:
 *
 * ## Low-level API (R2MultipartService)
 *
 * Direct control over multipart upload operations:
 * - `create()` - Initiate a multipart upload
 * - `uploadPart()` - Upload individual parts
 * - `complete()` - Finalize the upload
 * - `abort()` - Cancel the upload
 * - `listParts()` - View uploaded parts
 *
 * ## High-level API (MultipartUploadOrchestrator)
 *
 * Automatic multipart upload with:
 * - Automatic chunking
 * - Parallel uploads with concurrency control
 * - Progress tracking
 * - Automatic cleanup on failure
 * - Resume capability
 *
 * @module @studiorack/cloudflare-r2/multipart
 *
 * @example
 * ```typescript
 * import { R2MultipartServiceImpl, MultipartUploadOrchestrator } from '@studiorack/cloudflare-r2/multipart';
 *
 * // Low-level API
 * const service = new R2MultipartServiceImpl(config, transport, signer);
 * const upload = await service.create({ bucket: 'my-bucket', key: 'large-file.bin' });
 * const part1 = await service.uploadPart({ ...upload, partNumber: 1, body: chunk1 });
 * await service.complete({ ...upload, parts: [part1] });
 *
 * // High-level API
 * const orchestrator = new MultipartUploadOrchestrator(service, config);
 * await orchestrator.upload('my-bucket', 'large-file.bin', data, {
 *   onProgress: (uploaded, total) => console.log(`${uploaded}/${total} bytes`)
 * });
 * ```
 */

// Service interface
export type { R2MultipartService } from './interface.js';

// Service implementation
export { R2MultipartServiceImpl } from './service.js';

// High-level orchestrator
export {
  MultipartUploadOrchestrator,
  type UploadOptions,
} from './orchestrator.js';

// Low-level operation functions (for advanced use cases)
export { createMultipartUpload } from './create.js';
export { uploadPart } from './upload-part.js';
export { completeMultipartUpload } from './complete.js';
export { abortMultipartUpload } from './abort.js';
export { listParts } from './list-parts.js';

// Utility functions
export {
  buildMultipartUrl,
  splitIntoChunks,
  readStreamToChunks,
  normalizeBody,
  estimateBodySize,
  validatePartNumber,
  validatePartSize,
  sortPartsByNumber,
  validatePartsSequence,
} from './utils.js';
