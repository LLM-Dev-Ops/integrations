/**
 * CreateMultipartUpload operation implementation
 * @module @studiorack/cloudflare-r2/multipart/create
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { CreateMultipartRequest, CreateMultipartOutput } from '../types/index.js';
import { parseInitiateMultipartResponse, isErrorResponse, parseErrorResponse } from '../xml/index.js';
import { MultipartError, ValidationError } from '../errors/index.js';
import { getRequestId } from '../transport/types.js';
import { buildMultipartUrl } from './utils.js';

/**
 * Creates a new multipart upload
 *
 * Sends POST request to R2 with ?uploads query parameter to initiate
 * a multipart upload session. Returns an upload ID that must be used
 * for all subsequent operations.
 *
 * @param transport - HTTP transport implementation
 * @param signer - Request signer
 * @param endpoint - R2 endpoint URL
 * @param request - Multipart creation parameters
 * @returns Upload ID and metadata
 * @throws {MultipartError} If upload creation fails
 * @throws {ValidationError} If request parameters are invalid
 */
export async function createMultipartUpload(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: CreateMultipartRequest
): Promise<CreateMultipartOutput> {
  // Validate request
  if (!request.bucket) {
    throw new ValidationError({
      isRetryable: false,
      message: 'Bucket name is required',
      code: 'MISSING_BUCKET',
    });
  }
  if (!request.key) {
    throw new ValidationError({
      isRetryable: false,
      message: 'Object key is required',
      code: 'MISSING_KEY',
    });
  }

  // Build URL with ?uploads query parameter
  const url = buildMultipartUrl(endpoint, request.bucket, request.key, {
    uploads: '',
  });

  // Build headers
  const headers: Record<string, string> = {
    'host': new URL(endpoint).host,
  };

  // Add content type
  if (request.contentType) {
    headers['content-type'] = request.contentType;
  }

  // Add cache control
  if (request.cacheControl) {
    headers['cache-control'] = request.cacheControl;
  }

  // Add content disposition
  if (request.contentDisposition) {
    headers['content-disposition'] = request.contentDisposition;
  }

  // Add content encoding
  if (request.contentEncoding) {
    headers['content-encoding'] = request.contentEncoding;
  }

  // Add content language
  if (request.contentLanguage) {
    headers['content-language'] = request.contentLanguage;
  }

  // Add metadata as x-amz-meta-* headers
  if (request.metadata) {
    for (const [key, value] of Object.entries(request.metadata)) {
      headers[`x-amz-meta-${key}`] = value;
    }
  }

  // Add server-side encryption
  if (request.serverSideEncryption) {
    headers['x-amz-server-side-encryption'] = request.serverSideEncryption;
  }

  // Add storage class
  if (request.storageClass) {
    headers['x-amz-storage-class'] = request.storageClass;
  }

  // Add expires
  if (request.expires) {
    headers['expires'] = request.expires.toUTCString();
  }

  // Add tags as header if provided
  if (request.tags && Object.keys(request.tags).length > 0) {
    const tagString = Object.entries(request.tags)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    headers['x-amz-tagging'] = tagString;
  }

  // Sign the request (empty body for POST ?uploads)
  const payloadHash = signer.hashPayload();
  const signedRequest = signer.signRequest(
    {
      method: 'POST',
      url: new URL(url),
      headers,
    },
    payloadHash
  );

  // Send request
  const response = await transport.send({
    method: 'POST',
    url,
    headers: signedRequest.headers,
  });

  // Check for errors
  const decoder = new TextDecoder();
  const responseText = decoder.decode(response.body);

  if (response.status >= 400 || isErrorResponse(responseText)) {
    const error = parseErrorResponse(responseText);
    throw new MultipartError({
      isRetryable: false,
      message: `Failed to create multipart upload: ${error.message}`,
      code: error.code,
      status: response.status,
      requestId: getRequestId(response.headers),
      details: {
        bucket: request.bucket,
        key: request.key,
      },
    });
  }

  // Parse successful response
  try {
    const result = parseInitiateMultipartResponse(responseText);

    return {
      uploadId: result.uploadId,
      bucket: result.bucket,
      key: result.key,
      serverSideEncryption: response.headers['x-amz-server-side-encryption'],
      requestId: getRequestId(response.headers),
    };
  } catch (error) {
    throw new MultipartError({
      isRetryable: false,
      message: 'Failed to parse multipart upload response',
      code: 'PARSE_ERROR',
      status: response.status,
      requestId: getRequestId(response.headers),
    });
  }
}
