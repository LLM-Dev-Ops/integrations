/**
 * ListParts operation implementation
 * @module @studiorack/cloudflare-r2/multipart/list-parts
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { ListPartsRequest, ListPartsOutput } from '../types/index.js';
import { parseListPartsResponse, isErrorResponse, parseErrorResponse } from '../xml/index.js';
import { MultipartError, ValidationError } from '../errors/index.js';
import { getRequestId } from '../transport/types.js';
import { buildMultipartUrl } from './utils.js';

/**
 * Lists parts that have been uploaded
 *
 * Sends GET request to R2 to retrieve information about all parts that
 * have been uploaded for a specific multipart upload.
 *
 * @param transport - HTTP transport implementation
 * @param signer - Request signer
 * @param endpoint - R2 endpoint URL
 * @param request - Upload ID and pagination parameters
 * @returns List of uploaded parts
 * @throws {MultipartError} If listing fails
 * @throws {ValidationError} If request parameters are invalid
 */
export async function listParts(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: ListPartsRequest
): Promise<ListPartsOutput> {
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

  // Build query parameters
  const params: Record<string, string> = {
    uploadId: request.uploadId,
  };

  // Add optional pagination parameters
  if (request.maxParts !== undefined) {
    params['max-parts'] = String(request.maxParts);
  }

  if (request.partNumberMarker !== undefined) {
    params['part-number-marker'] = String(request.partNumberMarker);
  }

  // Build URL
  const url = buildMultipartUrl(endpoint, request.bucket, request.key, params);

  // Build headers
  const headers: Record<string, string> = {
    'host': new URL(endpoint).host,
  };

  // Sign the request (empty body for GET)
  const payloadHash = signer.hashPayload();
  const signedRequest = signer.signRequest(
    {
      method: 'GET',
      url: new URL(url),
      headers,
    },
    payloadHash
  );

  // Send request
  const response = await transport.send({
    method: 'GET',
    url,
    headers: signedRequest.headers,
  });

  // Parse response
  const decoder = new TextDecoder();
  const responseText = decoder.decode(response.body);

  // Check for errors
  if (response.status >= 400 || isErrorResponse(responseText)) {
    const error = parseErrorResponse(responseText);
    throw new MultipartError({
      isRetryable: false,
      message: `Failed to list parts: ${error.message}`,
      code: error.code,
      status: response.status,
      requestId: getRequestId(response.headers),
      details: {
        bucket: request.bucket,
        key: request.key,
        uploadId: request.uploadId,
      },
    });
  }

  // Parse successful response
  try {
    const result = parseListPartsResponse(responseText);

    return {
      ...result,
      requestId: getRequestId(response.headers),
    };
  } catch (error) {
    throw new MultipartError({
      isRetryable: false,
      message: 'Failed to parse list parts response',
      code: 'PARSE_ERROR',
      status: response.status,
      requestId: getRequestId(response.headers),
    });
  }
}
