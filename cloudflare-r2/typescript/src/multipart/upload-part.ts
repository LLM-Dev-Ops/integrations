/**
 * UploadPart operation implementation
 * @module @studiorack/cloudflare-r2/multipart/upload-part
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { UploadPartRequest, UploadPartOutput } from '../types/index.js';
import { isErrorResponse, parseErrorResponse } from '../xml/index.js';
import { MultipartError, ValidationError } from '../errors/index.js';
import { getRequestId, getETag } from '../transport/types.js';
import { buildMultipartUrl, normalizeBody, validatePartNumber } from './utils.js';

/**
 * Uploads a single part of a multipart upload
 *
 * Sends PUT request to R2 with the part data. The ETag returned in the
 * response must be saved and provided when completing the multipart upload.
 *
 * @param transport - HTTP transport implementation
 * @param signer - Request signer
 * @param endpoint - R2 endpoint URL
 * @param request - Part upload parameters
 * @returns Part ETag
 * @throws {MultipartError} If part upload fails
 * @throws {ValidationError} If request parameters are invalid
 */
export async function uploadPart(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: UploadPartRequest
): Promise<UploadPartOutput> {
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
  if (!request.uploadId) {
    throw new ValidationError({
      isRetryable: false,
      message: 'Upload ID is required',
      code: 'MISSING_UPLOAD_ID',
    });
  }
  if (!request.body) {
    throw new ValidationError({
      isRetryable: false,
      message: 'Part body is required',
      code: 'MISSING_BODY',
    });
  }

  // Validate part number
  validatePartNumber(request.partNumber);

  // Build URL with part number and upload ID
  const url = buildMultipartUrl(endpoint, request.bucket, request.key, {
    partNumber: String(request.partNumber),
    uploadId: request.uploadId,
  });

  // Normalize body to Uint8Array or ReadableStream
  const body = normalizeBody(request.body);

  // Build headers
  const headers: Record<string, string> = {
    'host': new URL(endpoint).host,
  };

  // Add content MD5 if provided
  if (request.contentMd5) {
    headers['content-md5'] = request.contentMd5;
  }

  // Add content length if provided
  if (request.contentLength !== undefined) {
    headers['content-length'] = String(request.contentLength);
  } else if (body instanceof Uint8Array) {
    headers['content-length'] = String(body.length);
  }

  // For Uint8Array bodies, calculate payload hash
  let payloadHash: string;
  if (body instanceof Uint8Array) {
    payloadHash = signer.hashPayload(body);
  } else {
    // For streams, use UNSIGNED-PAYLOAD
    payloadHash = 'UNSIGNED-PAYLOAD';
  }

  // Sign the request
  const signedRequest = signer.signRequest(
    {
      method: 'PUT',
      url: new URL(url),
      headers,
      body: body instanceof Uint8Array ? body : undefined,
    },
    payloadHash
  );

  // Send request
  const response = await transport.send({
    method: 'PUT',
    url,
    headers: signedRequest.headers,
    body,
  });

  // Check for errors
  if (response.status >= 400) {
    let errorMessage = `Failed to upload part ${request.partNumber}`;
    let errorCode = 'UPLOAD_PART_FAILED';

    // Try to parse error response
    if (response.body.length > 0) {
      const decoder = new TextDecoder();
      const responseText = decoder.decode(response.body);

      if (isErrorResponse(responseText)) {
        const error = parseErrorResponse(responseText);
        errorMessage = `Failed to upload part ${request.partNumber}: ${error.message}`;
        errorCode = error.code;
      }
    }

    throw new MultipartError({
      isRetryable: false,
      message: errorMessage,
      code: errorCode,
      status: response.status,
      requestId: getRequestId(response.headers),
      details: {
        bucket: request.bucket,
        key: request.key,
        uploadId: request.uploadId,
        partNumber: request.partNumber,
      },
    });
  }

  // Extract ETag from response headers
  const eTag = getETag(response.headers);
  if (!eTag) {
    throw new MultipartError({
      isRetryable: false,
      message: `No ETag returned for part ${request.partNumber}`,
      code: 'MISSING_ETAG',
      status: response.status,
      requestId: getRequestId(response.headers),
      details: {
        bucket: request.bucket,
        key: request.key,
        uploadId: request.uploadId,
        partNumber: request.partNumber,
      },
    });
  }

  return {
    eTag,
    serverSideEncryption: response.headers['x-amz-server-side-encryption'],
    requestId: getRequestId(response.headers),
  };
}
