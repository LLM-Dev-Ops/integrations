/**
 * Main multipart upload service implementation
 * @module @studiorack/cloudflare-r2/multipart/service
 */

import type { R2MultipartService } from './interface.js';
import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { NormalizedR2Config } from '../config/index.js';
import type {
  CreateMultipartRequest,
  CreateMultipartOutput,
  UploadPartRequest,
  UploadPartOutput,
  CompleteMultipartRequest,
  CompleteMultipartOutput,
  AbortMultipartRequest,
  ListPartsRequest,
  ListPartsOutput,
} from '../types/index.js';
import { createMultipartUpload } from './create.js';
import { uploadPart } from './upload-part.js';
import { completeMultipartUpload } from './complete.js';
import { abortMultipartUpload } from './abort.js';
import { listParts } from './list-parts.js';

/**
 * Implementation of R2 multipart upload service
 *
 * Provides low-level operations for multipart uploads:
 * - Create: Initiate a multipart upload session
 * - UploadPart: Upload individual parts
 * - Complete: Finalize the upload
 * - Abort: Cancel the upload
 * - ListParts: View uploaded parts
 *
 * For high-level automatic multipart upload, use MultipartUploadOrchestrator.
 */
export class R2MultipartServiceImpl implements R2MultipartService {
  constructor(
    private readonly config: NormalizedR2Config,
    private readonly transport: HttpTransport,
    private readonly signer: R2Signer
  ) {}

  /**
   * Creates a new multipart upload
   *
   * @param request - Multipart creation parameters
   * @returns Upload ID and metadata
   */
  async create(request: CreateMultipartRequest): Promise<CreateMultipartOutput> {
    return createMultipartUpload(
      this.transport,
      this.signer,
      this.config.endpointUrl,
      request
    );
  }

  /**
   * Uploads a single part
   *
   * @param request - Part upload parameters
   * @returns Part ETag
   */
  async uploadPart(request: UploadPartRequest): Promise<UploadPartOutput> {
    return uploadPart(
      this.transport,
      this.signer,
      this.config.endpointUrl,
      request
    );
  }

  /**
   * Completes a multipart upload
   *
   * @param request - Completion parameters
   * @returns Completed object metadata
   */
  async complete(request: CompleteMultipartRequest): Promise<CompleteMultipartOutput> {
    return completeMultipartUpload(
      this.transport,
      this.signer,
      this.config.endpointUrl,
      request
    );
  }

  /**
   * Aborts a multipart upload
   *
   * @param request - Upload ID to abort
   */
  async abort(request: AbortMultipartRequest): Promise<void> {
    return abortMultipartUpload(
      this.transport,
      this.signer,
      this.config.endpointUrl,
      request
    );
  }

  /**
   * Lists uploaded parts
   *
   * @param request - Upload ID and pagination parameters
   * @returns List of uploaded parts
   */
  async listParts(request: ListPartsRequest): Promise<ListPartsOutput> {
    return listParts(
      this.transport,
      this.signer,
      this.config.endpointUrl,
      request
    );
  }
}
