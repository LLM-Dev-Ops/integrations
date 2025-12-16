/**
 * PutObject implementation for Cloudflare R2 Storage
 * @module @studiorack/cloudflare-r2/objects/put
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { PutObjectRequest, PutObjectOutput } from '../types/index.js';
import { mapHttpStatusToError } from '../errors/index.js';
import { getHeader, isSuccessResponse, getRequestId } from '../transport/index.js';
import { parseErrorResponse, isErrorResponse } from '../xml/index.js';
import {
  buildObjectUrl,
  buildMetadataHeaders,
  normalizeBody,
  isStream,
} from './utils.js';

/**
 * Uploads an object to R2 storage
 *
 * Implements PUT object operation with S3 Signature V4 authentication.
 * Supports custom metadata, content type, caching directives, and more.
 *
 * Request flow:
 * 1. Build object URL
 * 2. Prepare headers (content-type, metadata, etc.)
 * 3. Convert body to Uint8Array (if not streaming)
 * 4. Sign request with R2Signer
 * 5. Send via HttpTransport
 * 6. Extract ETag from response
 *
 * @param transport - HTTP transport for sending request
 * @param signer - R2 signer for authentication
 * @param endpoint - R2 endpoint URL
 * @param request - Put object request parameters
 * @returns Upload result with ETag and metadata
 * @throws {ObjectError} If upload fails
 * @throws {ValidationError} If parameters are invalid
 * @throws {AuthError} If authentication fails
 *
 * @example
 * ```typescript
 * const result = await putObject(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   key: 'documents/report.pdf',
 *   body: pdfBuffer,
 *   contentType: 'application/pdf',
 *   metadata: { author: 'John Doe', version: '1.0' }
 * });
 * console.log('Uploaded with ETag:', result.eTag);
 * ```
 */
export async function putObject(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: PutObjectRequest
): Promise<PutObjectOutput> {
  // Build URL
  const url = buildObjectUrl(endpoint, request.bucket, request.key);

  // Build headers
  const headers: Record<string, string> = {};

  // Content-Type
  if (request.contentType) {
    headers['content-type'] = request.contentType;
  }

  // Content-MD5 (for integrity verification)
  if (request.contentMd5) {
    headers['content-md5'] = request.contentMd5;
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

  // Expires
  if (request.expires) {
    headers['expires'] = request.expires.toUTCString();
  }

  // Server-side encryption
  if (request.serverSideEncryption) {
    headers['x-amz-server-side-encryption'] = request.serverSideEncryption;
  }

  // Storage class
  if (request.storageClass) {
    headers['x-amz-storage-class'] = request.storageClass;
  }

  // Custom metadata
  if (request.metadata) {
    const metadataHeaders = buildMetadataHeaders(request.metadata);
    Object.assign(headers, metadataHeaders);
  }

  // Tagging (if provided)
  if (request.tags) {
    const tagPairs = Object.entries(request.tags).map(
      ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    );
    headers['x-amz-tagging'] = tagPairs.join('&');
  }

  // Prepare body
  let body: Uint8Array | ReadableStream<Uint8Array>;
  let payloadHash: string;

  if (isStream(request.body)) {
    // For streaming bodies, we can't hash the payload upfront
    // Use UNSIGNED-PAYLOAD for streaming
    body = request.body;
    payloadHash = 'UNSIGNED-PAYLOAD';
  } else {
    // For non-streaming bodies, normalize and hash
    body = normalizeBody(request.body);
    payloadHash = signer.hashPayload(body);
  }

  // Sign request
  const urlObj = new URL(url);
  const signedRequest = signer.signRequest(
    {
      method: 'PUT',
      url: urlObj,
      headers,
      body: isStream(body) ? undefined : body,
    },
    payloadHash
  );

  // Send request
  const response = await transport.send({
    method: 'PUT',
    url: signedRequest.url.toString(),
    headers: signedRequest.headers,
    body,
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

  // Extract response metadata
  const eTag = getHeader(response.headers, 'etag')?.replace(/^"|"$/g, '');
  const versionId = getHeader(response.headers, 'x-amz-version-id');
  const serverSideEncryption = getHeader(response.headers, 'x-amz-server-side-encryption');
  const expiration = getHeader(response.headers, 'x-amz-expiration');
  const requestId = getRequestId(response.headers);

  return {
    eTag,
    versionId,
    serverSideEncryption,
    expiration,
    requestId,
  };
}
