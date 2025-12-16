/**
 * GetObject implementation for Cloudflare R2 Storage
 * @module @studiorack/cloudflare-r2/objects/get
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type {
  GetObjectRequest,
  GetObjectOutput,
  GetObjectStreamOutput,
} from '../types/index.js';
import { mapHttpStatusToError } from '../errors/index.js';
import { getRequestId, isSuccessResponse } from '../transport/index.js';
import { parseErrorResponse, isErrorResponse } from '../xml/index.js';
import { EMPTY_SHA256 } from '../signing/index.js';
import {
  buildObjectUrl,
  buildQueryString,
  extractMetadata,
  extractObjectMetadata,
} from './utils.js';

/**
 * Downloads an object from R2 storage (buffered)
 *
 * Implements GET object operation with full response body buffering.
 * Suitable for small to medium objects that fit in memory.
 *
 * Request flow:
 * 1. Build object URL with query parameters
 * 2. Prepare conditional headers (If-Match, Range, etc.)
 * 3. Sign request with R2Signer
 * 4. Send via HttpTransport (buffered)
 * 5. Parse response headers and metadata
 * 6. Return object data with metadata
 *
 * @param transport - HTTP transport for sending request
 * @param signer - R2 signer for authentication
 * @param endpoint - R2 endpoint URL
 * @param request - Get object request parameters
 * @returns Object data with metadata
 * @throws {ObjectError} If object not found or download fails
 * @throws {ValidationError} If parameters are invalid
 * @throws {AuthError} If authentication fails
 *
 * @example
 * ```typescript
 * const result = await getObject(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   key: 'documents/report.pdf',
 *   range: 'bytes=0-1023'
 * });
 * console.log('Downloaded', result.contentLength, 'bytes');
 * ```
 */
export async function getObject(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: GetObjectRequest
): Promise<GetObjectOutput> {
  // Build URL with query parameters
  const baseUrl = buildObjectUrl(endpoint, request.bucket, request.key);
  const queryParams: Record<string, string | undefined> = {};

  if (request.versionId) {
    queryParams.versionId = request.versionId;
  }

  // Response overrides
  if (request.responseCacheControl) {
    queryParams['response-cache-control'] = request.responseCacheControl;
  }
  if (request.responseContentDisposition) {
    queryParams['response-content-disposition'] = request.responseContentDisposition;
  }
  if (request.responseContentEncoding) {
    queryParams['response-content-encoding'] = request.responseContentEncoding;
  }
  if (request.responseContentLanguage) {
    queryParams['response-content-language'] = request.responseContentLanguage;
  }
  if (request.responseContentType) {
    queryParams['response-content-type'] = request.responseContentType;
  }
  if (request.responseExpires) {
    queryParams['response-expires'] = request.responseExpires.toUTCString();
  }

  const queryString = buildQueryString(queryParams);
  const url = `${baseUrl}${queryString}`;

  // Build headers
  const headers: Record<string, string> = {};

  // Range request
  if (request.range) {
    headers['range'] = request.range;
  }

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

  // Sign request
  const urlObj = new URL(url);
  const signedRequest = signer.signRequest(
    {
      method: 'GET',
      url: urlObj,
      headers,
    },
    EMPTY_SHA256
  );

  // Send request (buffered)
  const response = await transport.send({
    method: 'GET',
    url: signedRequest.url.toString(),
    headers: signedRequest.headers,
  });

  // Handle 304 Not Modified specially
  if (response.status === 304) {
    throw mapHttpStatusToError(304, 'NotModified', 'Not Modified', getRequestId(response.headers));
  }

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

  // Extract metadata
  const objectMetadata = extractObjectMetadata(response.headers);
  const customMetadata = extractMetadata(response.headers);
  const requestId = getRequestId(response.headers);

  // Convert Uint8Array to Buffer for consistency
  const body = Buffer.from(response.body);

  return {
    body,
    contentLength: objectMetadata.contentLength || body.length,
    contentType: objectMetadata.contentType,
    eTag: objectMetadata.eTag,
    lastModified: objectMetadata.lastModified,
    metadata: Object.keys(customMetadata).length > 0 ? customMetadata : undefined,
    contentRange: objectMetadata.contentRange,
    cacheControl: objectMetadata.cacheControl,
    contentDisposition: objectMetadata.contentDisposition,
    contentEncoding: objectMetadata.contentEncoding,
    contentLanguage: objectMetadata.contentLanguage,
    versionId: objectMetadata.versionId,
    serverSideEncryption: objectMetadata.serverSideEncryption,
    expiration: objectMetadata.expiration,
    expires: objectMetadata.expires,
    acceptRanges: objectMetadata.acceptRanges,
    requestId,
  };
}

/**
 * Downloads an object from R2 storage (streaming)
 *
 * Implements GET object operation with streaming response body.
 * Suitable for large objects where memory efficiency is important.
 *
 * @param transport - HTTP transport for sending request
 * @param signer - R2 signer for authentication
 * @param endpoint - R2 endpoint URL
 * @param request - Get object request parameters
 * @returns Object stream with metadata
 * @throws {ObjectError} If object not found or download fails
 * @throws {ValidationError} If parameters are invalid
 * @throws {AuthError} If authentication fails
 *
 * @example
 * ```typescript
 * const result = await getObjectStream(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   key: 'videos/large-file.mp4'
 * });
 *
 * // Process stream
 * const reader = result.body.getReader();
 * while (true) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   // Process chunk
 * }
 * ```
 */
export async function getObjectStream(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: GetObjectRequest
): Promise<GetObjectStreamOutput> {
  // Build URL with query parameters (same as buffered version)
  const baseUrl = buildObjectUrl(endpoint, request.bucket, request.key);
  const queryParams: Record<string, string | undefined> = {};

  if (request.versionId) {
    queryParams.versionId = request.versionId;
  }

  // Response overrides
  if (request.responseCacheControl) {
    queryParams['response-cache-control'] = request.responseCacheControl;
  }
  if (request.responseContentDisposition) {
    queryParams['response-content-disposition'] = request.responseContentDisposition;
  }
  if (request.responseContentEncoding) {
    queryParams['response-content-encoding'] = request.responseContentEncoding;
  }
  if (request.responseContentLanguage) {
    queryParams['response-content-language'] = request.responseContentLanguage;
  }
  if (request.responseContentType) {
    queryParams['response-content-type'] = request.responseContentType;
  }
  if (request.responseExpires) {
    queryParams['response-expires'] = request.responseExpires.toUTCString();
  }

  const queryString = buildQueryString(queryParams);
  const url = `${baseUrl}${queryString}`;

  // Build headers (same as buffered version)
  const headers: Record<string, string> = {};

  if (request.range) {
    headers['range'] = request.range;
  }
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

  // Sign request
  const urlObj = new URL(url);
  const signedRequest = signer.signRequest(
    {
      method: 'GET',
      url: urlObj,
      headers,
    },
    EMPTY_SHA256
  );

  // Send request (streaming)
  const response = await transport.sendStreaming({
    method: 'GET',
    url: signedRequest.url.toString(),
    headers: signedRequest.headers,
  });

  // Handle 304 Not Modified
  if (response.status === 304) {
    throw mapHttpStatusToError(304, 'NotModified', 'Not Modified', getRequestId(response.headers));
  }

  // Check for errors
  if (!isSuccessResponse(response)) {
    // For streaming, we need to consume the body to get error details
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }
    } finally {
      reader.releaseLock();
    }

    // Combine chunks
    const bodyArray = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      bodyArray.set(chunk, offset);
      offset += chunk.length;
    }

    const bodyText = new TextDecoder().decode(bodyArray);

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

  // Extract metadata
  const objectMetadata = extractObjectMetadata(response.headers);
  const customMetadata = extractMetadata(response.headers);
  const requestId = getRequestId(response.headers);

  return {
    body: response.body,
    contentLength: objectMetadata.contentLength || 0,
    contentType: objectMetadata.contentType,
    eTag: objectMetadata.eTag,
    lastModified: objectMetadata.lastModified,
    metadata: Object.keys(customMetadata).length > 0 ? customMetadata : undefined,
    contentRange: objectMetadata.contentRange,
    cacheControl: objectMetadata.cacheControl,
    contentDisposition: objectMetadata.contentDisposition,
    contentEncoding: objectMetadata.contentEncoding,
    contentLanguage: objectMetadata.contentLanguage,
    versionId: objectMetadata.versionId,
    serverSideEncryption: objectMetadata.serverSideEncryption,
    expiration: objectMetadata.expiration,
    expires: objectMetadata.expires,
    acceptRanges: objectMetadata.acceptRanges,
    requestId,
  };
}
