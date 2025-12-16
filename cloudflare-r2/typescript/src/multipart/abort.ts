/**
 * AbortMultipartUpload operation implementation
 * @module @studiorack/cloudflare-r2/multipart/abort
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { AbortMultipartRequest } from '../types/index.js';
import { isErrorResponse, parseErrorResponse } from '../xml/index.js';
import { MultipartError, ValidationError } from '../errors/index.js';
import { getRequestId } from '../transport/types.js';
import { buildMultipartUrl } from './utils.js';

/**
 * Aborts a multipart upload
 *
 * Sends DELETE request to R2 to cancel an in-progress multipart upload
 * and free storage used by uploaded parts. After aborting, the upload ID
 * is no longer valid.
 *
 * @param transport - HTTP transport implementation
 * @param signer - Request signer
 * @param endpoint - R2 endpoint URL
 * @param request - Upload ID to abort
 * @throws {MultipartError} If abort fails
 * @throws {ValidationError} If request parameters are invalid
 */
export async function abortMultipartUpload(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: AbortMultipartRequest
): Promise<void> {
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

  // Build URL with upload ID
  const url = buildMultipartUrl(endpoint, request.bucket, request.key, {
    uploadId: request.uploadId,
  });

  // Build headers
  const headers: Record<string, string> = {
    'host': new URL(endpoint).host,
  };

  // Sign the request (empty body for DELETE)
  const payloadHash = signer.hashPayload();
  const signedRequest = signer.signRequest(
    {
      method: 'DELETE',
      url: new URL(url),
      headers,
    },
    payloadHash
  );

  // Send request
  const response = await transport.send({
    method: 'DELETE',
    url,
    headers: signedRequest.headers,
  });

  // Check for errors
  // Note: R2 returns 204 No Content on success
  if (response.status >= 400) {
    let errorMessage = 'Failed to abort multipart upload';
    let errorCode = 'ABORT_FAILED';

    // Try to parse error response
    if (response.body.length > 0) {
      const decoder = new TextDecoder();
      const responseText = decoder.decode(response.body);

      if (isErrorResponse(responseText)) {
        const error = parseErrorResponse(responseText);
        errorMessage = `Failed to abort multipart upload: ${error.message}`;
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
      },
    });
  }

  // Success - no return value needed
}
