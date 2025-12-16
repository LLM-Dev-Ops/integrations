/**
 * CopyObject implementation for Cloudflare R2 Storage
 * @module @studiorack/cloudflare-r2/objects/copy
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { CopyObjectRequest, CopyObjectOutput } from '../types/index.js';
import { mapHttpStatusToError } from '../errors/index.js';
import { getHeader, getRequestId, isSuccessResponse } from '../transport/index.js';
import { parseErrorResponse, isErrorResponse, parseCopyObjectResponse } from '../xml/index.js';
import { EMPTY_SHA256 } from '../signing/index.js';
import { buildObjectUrl, buildMetadataHeaders, encodeKey } from './utils.js';

/**
 * Copies an object within R2 storage
 *
 * Implements PUT object with x-amz-copy-source header.
 * Can copy within the same bucket or between buckets in the same account.
 * Supports metadata replacement and conditional copy operations.
 *
 * Request flow:
 * 1. Build destination object URL
 * 2. Build x-amz-copy-source header with source path
 * 3. Add metadata directive (COPY or REPLACE)
 * 4. Add conditional headers if specified
 * 5. Sign PUT request
 * 6. Send via HttpTransport
 * 7. Parse XML response for ETag and LastModified
 *
 * @param transport - HTTP transport for sending request
 * @param signer - R2 signer for authentication
 * @param endpoint - R2 endpoint URL
 * @param request - Copy object request parameters
 * @returns Copy result with new object metadata
 * @throws {ObjectError} If source object not found
 * @throws {ValidationError} If parameters are invalid
 * @throws {AuthError} If authentication fails
 *
 * @example
 * ```typescript
 * // Simple copy
 * const result = await copyObject(transport, signer, endpoint, {
 *   bucket: 'dest-bucket',
 *   key: 'backup/report.pdf',
 *   sourceBucket: 'source-bucket',
 *   sourceKey: 'documents/report.pdf'
 * });
 *
 * // Copy with metadata replacement
 * const result2 = await copyObject(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   key: 'new-version.txt',
 *   sourceBucket: 'my-bucket',
 *   sourceKey: 'old-version.txt',
 *   metadataDirective: 'REPLACE',
 *   metadata: { version: '2.0', author: 'Jane Doe' },
 *   contentType: 'text/plain'
 * });
 * ```
 */
export async function copyObject(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: CopyObjectRequest
): Promise<CopyObjectOutput> {
  // Build destination URL
  const url = buildObjectUrl(endpoint, request.bucket, request.key);

  // Build headers
  const headers: Record<string, string> = {};

  // x-amz-copy-source header (required)
  // Format: /{source-bucket}/{source-key}
  const encodedSourceKey = encodeKey(request.sourceKey);
  let copySource = `/${request.sourceBucket}/${encodedSourceKey}`;

  // Add source version ID if specified
  if (request.sourceVersionId) {
    copySource += `?versionId=${encodeURIComponent(request.sourceVersionId)}`;
  }

  headers['x-amz-copy-source'] = copySource;

  // Metadata directive (COPY or REPLACE)
  const metadataDirective = request.metadataDirective || 'COPY';
  headers['x-amz-metadata-directive'] = metadataDirective;

  // If REPLACE, add new metadata and content headers
  if (metadataDirective === 'REPLACE') {
    // Content-Type
    if (request.contentType) {
      headers['content-type'] = request.contentType;
    }

    // Cache-Control
    if (request.cacheControl) {
      headers['cache-control'] = request.cacheControl;
    }

    // Content-Disposition
    if (request.contentDisposition) {
      headers['content-disposition'] = request.contentDisposition;
    }

    // Content-Encoding
    if (request.contentEncoding) {
      headers['content-encoding'] = request.contentEncoding;
    }

    // Content-Language
    if (request.contentLanguage) {
      headers['content-language'] = request.contentLanguage;
    }

    // Custom metadata
    if (request.metadata) {
      const metadataHeaders = buildMetadataHeaders(request.metadata);
      Object.assign(headers, metadataHeaders);
    }
  }

  // Server-side encryption
  if (request.serverSideEncryption) {
    headers['x-amz-server-side-encryption'] = request.serverSideEncryption;
  }

  // Storage class
  if (request.storageClass) {
    headers['x-amz-storage-class'] = request.storageClass;
  }

  // Tagging (if provided)
  if (request.tags) {
    const tagPairs = Object.entries(request.tags).map(
      ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    );
    headers['x-amz-tagging'] = tagPairs.join('&');
  }

  // Conditional copy headers
  if (request.copySourceIfMatch) {
    headers['x-amz-copy-source-if-match'] = request.copySourceIfMatch;
  }
  if (request.copySourceIfNoneMatch) {
    headers['x-amz-copy-source-if-none-match'] = request.copySourceIfNoneMatch;
  }
  if (request.copySourceIfModifiedSince) {
    headers['x-amz-copy-source-if-modified-since'] =
      request.copySourceIfModifiedSince.toUTCString();
  }
  if (request.copySourceIfUnmodifiedSince) {
    headers['x-amz-copy-source-if-unmodified-since'] =
      request.copySourceIfUnmodifiedSince.toUTCString();
  }

  // Sign request (PUT with empty body)
  const urlObj = new URL(url);
  const signedRequest = signer.signRequest(
    {
      method: 'PUT',
      url: urlObj,
      headers,
    },
    EMPTY_SHA256
  );

  // Send request
  const response = await transport.send({
    method: 'PUT',
    url: signedRequest.url.toString(),
    headers: signedRequest.headers,
  });

  // Check for errors
  if (!isSuccessResponse(response)) {
    const bodyText = new TextDecoder().decode(response.body);

    // Try to parse XML error
    if (isErrorResponse(bodyText)) {
      const error = parseErrorResponse(bodyText);
      throw mapHttpStatusToError(
        response.status,
        error.code,
        error.message,
        error.requestId
      );
    }

    // Generic error
    throw mapHttpStatusToError(
      response.status,
      undefined,
      undefined,
      getRequestId(response.headers)
    );
  }

  // Parse response XML
  const bodyText = new TextDecoder().decode(response.body);
  const copyResult = parseCopyObjectResponse(bodyText);

  // Extract additional metadata from headers
  const versionId = getHeader(response.headers, 'x-amz-version-id');
  const copySourceVersionId = getHeader(response.headers, 'x-amz-copy-source-version-id');
  const serverSideEncryption = getHeader(response.headers, 'x-amz-server-side-encryption');
  const expiration = getHeader(response.headers, 'x-amz-expiration');
  const requestId = getRequestId(response.headers);

  return {
    eTag: copyResult.eTag,
    lastModified: copyResult.lastModified,
    versionId,
    copySourceVersionId,
    serverSideEncryption,
    expiration,
    requestId,
  };
}
