/**
 * Multipart upload service interface for Cloudflare R2 Storage
 * Based on SPARC specification section 6
 * @module @studiorack/cloudflare-r2/multipart/interface
 */

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

/**
 * Service interface for multipart upload operations
 */
export interface R2MultipartService {
  /**
   * Initiates a multipart upload
   *
   * Creates a new multipart upload session and returns an upload ID.
   * This upload ID must be used for all subsequent part uploads and
   * to complete or abort the upload.
   *
   * @param request - Multipart upload creation parameters
   * @returns Upload ID and metadata
   * @throws {MultipartError} If upload cannot be initiated
   * @throws {ValidationError} If request parameters are invalid
   */
  create(request: CreateMultipartRequest): Promise<CreateMultipartOutput>;

  /**
   * Uploads a single part of a multipart upload
   *
   * Each part must be at least 5MB in size (except the last part).
   * Part numbers must be between 1 and 10,000.
   *
   * @param request - Part upload parameters including part number and data
   * @returns ETag of the uploaded part
   * @throws {MultipartError} If part upload fails
   * @throws {ValidationError} If part number is invalid
   */
  uploadPart(request: UploadPartRequest): Promise<UploadPartOutput>;

  /**
   * Completes a multipart upload
   *
   * Combines all uploaded parts into a single object. Parts must be
   * provided in ascending order by part number.
   *
   * @param request - Completion parameters including all part ETags
   * @returns Metadata of the completed object
   * @throws {MultipartError} If completion fails (e.g., missing parts)
   * @throws {ValidationError} If parts list is invalid
   */
  complete(request: CompleteMultipartRequest): Promise<CompleteMultipartOutput>;

  /**
   * Aborts a multipart upload
   *
   * Cancels an in-progress multipart upload and frees storage used by
   * uploaded parts. After aborting, the upload ID is no longer valid.
   *
   * @param request - Upload ID to abort
   * @throws {MultipartError} If abort fails
   */
  abort(request: AbortMultipartRequest): Promise<void>;

  /**
   * Lists uploaded parts for a multipart upload
   *
   * Returns information about all parts that have been uploaded for
   * a specific multipart upload.
   *
   * @param request - Upload ID and pagination parameters
   * @returns List of uploaded parts
   * @throws {MultipartError} If listing fails
   */
  listParts(request: ListPartsRequest): Promise<ListPartsOutput>;
}
