/**
 * HeadObject implementation for Cloudflare R2 Storage
 * @module @studiorack/cloudflare-r2/objects/head
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { HeadObjectRequest, HeadObjectOutput } from '../types/index.js';
import { mapHttpStatusToError } from '../errors/index.js';
import { getHeader, getRequestId, isSuccessResponse } from '../transport/index.js';
import { EMPTY_SHA256 } from '../signing/index.js';
import {
  buildObjectUrl,
  buildQueryString,
  extractMetadata,
  extractObjectMetadata,
  parseHeaderDate,
} from './utils.js';

/**
 * Retrieves object metadata without downloading the object body
 *
 * Implements HEAD object operation.
 * This is useful for checking if an object exists and getting its metadata
 * without the overhead of downloading the entire object.
 *
 * Request flow:
 * 1. Build object URL with optional versionId
 * 2. Add conditional headers (If-Match, etc.)
 * 3. Sign HEAD request
 * 4. Send via HttpTransport
 * 5. Extract all metadata from response headers
 *
 * @param transport - HTTP transport for sending request
 * @param signer - R2 signer for authentication
 * @param endpoint - R2 endpoint URL
 * @param request - Head object request parameters
 * @returns Object metadata
 * @throws {ObjectError} If object not found
 * @throws {ValidationError} If parameters are invalid
 * @throws {AuthError} If authentication fails
 *
 * @example
 * ```typescript
 * const metadata = await headObject(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   key: 'documents/report.pdf'
 * });
 *
 * console.log('Size:', metadata.contentLength);
 * console.log('Type:', metadata.contentType);
 * console.log('Last Modified:', metadata.lastModified);
 * console.log('Custom metadata:', metadata.metadata);
 * ```
 */
export async function headObject(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: HeadObjectRequest
): Promise<HeadObjectOutput> {
  // Build URL with query parameters
  const baseUrl = buildObjectUrl(endpoint, request.bucket, request.key);
  const queryParams: Record<string, string | undefined> = {};

  if (request.versionId) {
    queryParams.versionId = request.versionId;
  }

  const queryString = buildQueryString(queryParams);
  const url = `${baseUrl}${queryString}`;

  // Build headers
  const headers: Record<string, string> = {};

  // Conditional headers
  if (request.ifMatch) {
    headers['if-match'] = request.ifMatch;
  }
  if (request.ifNoneMatch) {
    headers['if-none-match'] = request.ifNoneMatch;
  }
  if (request.ifModifiedSince) {
    headers['if-modified-since'] = request.ifModifiedSince.toUTCString();
  }
  if (request.ifUnmodifiedSince) {
    headers['if-unmodified-since'] = request.ifUnmodifiedSince.toUTCString();
  }

  // Range (for partial metadata)
  if (request.range) {
    headers['range'] = request.range;
  }

  // Sign request
  const urlObj = new URL(url);
  const signedRequest = signer.signRequest(
    {
      method: 'HEAD',
      url: urlObj,
      headers,
    },
    EMPTY_SHA256
  );

  // Send request
  const response = await transport.send({
    method: 'HEAD',
    url: signedRequest.url.toString(),
    headers: signedRequest.headers,
  });

  // Handle 304 Not Modified specially
  if (response.status === 304) {
    throw mapHttpStatusToError(304, 'NotModified', 'Not Modified', getRequestId(response.headers));
  }

  // Check for errors
  if (!isSuccessResponse(response)) {
    // For HEAD requests, there's no body, so we can't parse XML errors
    // We rely on status code mapping
    throw mapHttpStatusToError(
      response.status,
      undefined,
      response.status === 404 ? 'Object not found' : undefined,
      getRequestId(response.headers)
    );
  }

  // Extract metadata from headers
  const objectMetadata = extractObjectMetadata(response.headers);
  const customMetadata = extractMetadata(response.headers);
  const requestId = getRequestId(response.headers);

  // Extract additional metadata specific to HEAD response
  const archiveStatus = getHeader(response.headers, 'x-amz-archive-status');
  const objectLockMode = getHeader(response.headers, 'x-amz-object-lock-mode');
  const objectLockRetainUntilDateStr = getHeader(
    response.headers,
    'x-amz-object-lock-retain-until-date'
  );
  const objectLockLegalHoldStatus = getHeader(
    response.headers,
    'x-amz-object-lock-legal-hold-status'
  );

  const objectLockRetainUntilDate = parseHeaderDate(objectLockRetainUntilDateStr);

  return {
    contentLength: objectMetadata.contentLength || 0,
    contentType: objectMetadata.contentType,
    eTag: objectMetadata.eTag,
    lastModified: objectMetadata.lastModified,
    metadata: Object.keys(customMetadata).length > 0 ? customMetadata : undefined,
    cacheControl: objectMetadata.cacheControl,
    contentDisposition: objectMetadata.contentDisposition,
    contentEncoding: objectMetadata.contentEncoding,
    contentLanguage: objectMetadata.contentLanguage,
    versionId: objectMetadata.versionId,
    serverSideEncryption: objectMetadata.serverSideEncryption,
    expiration: objectMetadata.expiration,
    expires: objectMetadata.expires,
    acceptRanges: objectMetadata.acceptRanges,
    archiveStatus,
    objectLockMode,
    objectLockRetainUntilDate,
    objectLockLegalHoldStatus,
    requestId,
  };
}
