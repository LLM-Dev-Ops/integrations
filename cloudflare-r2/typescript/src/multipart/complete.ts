/**
 * CompleteMultipartUpload operation implementation
 * @module @studiorack/cloudflare-r2/multipart/complete
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { CompleteMultipartRequest, CompleteMultipartOutput } from '../types/index.js';
import {
  buildCompleteMultipartXml,
  parseCompleteMultipartResponse,
  isErrorResponse,
  parseErrorResponse,
} from '../xml/index.js';
import { MultipartError, ValidationError } from '../errors/index.js';
import { getRequestId } from '../transport/types.js';
import { buildMultipartUrl, sortPartsByNumber } from './utils.js';

/**
 * Completes a multipart upload
 *
 * Sends POST request to R2 with XML body containing all part ETags.
 * R2 will combine all parts into a single object.
 *
 * @param transport - HTTP transport implementation
 * @param signer - Request signer
 * @param endpoint - R2 endpoint URL
 * @param request - Completion parameters
 * @returns Completed object metadata
 * @throws {MultipartError} If completion fails
 * @throws {ValidationError} If request parameters are invalid
 */
export async function completeMultipartUpload(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: CompleteMultipartRequest
): Promise<CompleteMultipartOutput> {
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
  if (!request.parts || request.parts.length === 0) {
    throw new ValidationError({
      isRetryable: false,
      message: 'Parts array is required and cannot be empty',
      code: 'MISSING_PARTS',
    });
  }

  // Validate all parts have required fields
  for (const part of request.parts) {
    if (!part.partNumber || !part.eTag) {
      throw new ValidationError({
      isRetryable: false,
        message: 'Each part must have partNumber and eTag',
        code: 'INVALID_PART',
      });
    }
  }

  // Sort parts by part number (required by S3/R2)
  const sortedParts = sortPartsByNumber([...request.parts]);

  // Build URL with upload ID
  const url = buildMultipartUrl(endpoint, request.bucket, request.key, {
    uploadId: request.uploadId,
  });

  // Build XML body with parts
  const xmlBody = buildCompleteMultipartXml(sortedParts);
  const bodyBytes = new TextEncoder().encode(xmlBody);

  // Build headers
  const headers: Record<string, string> = {
    'host': new URL(endpoint).host,
    'content-type': 'application/xml',
    'content-length': String(bodyBytes.length),
  };

  // Sign the request
  const payloadHash = signer.hashPayload(bodyBytes);
  const signedRequest = signer.signRequest(
    {
      method: 'POST',
      url: new URL(url),
      headers,
      body: bodyBytes,
    },
    payloadHash
  );

  // Send request
  const response = await transport.send({
    method: 'POST',
    url,
    headers: signedRequest.headers,
    body: bodyBytes,
  });

  // Parse response
  const decoder = new TextDecoder();
  const responseText = decoder.decode(response.body);

  // Check for errors
  if (response.status >= 400 || isErrorResponse(responseText)) {
    const error = parseErrorResponse(responseText);
    throw new MultipartError({
      isRetryable: false,
      message: `Failed to complete multipart upload: ${error.message}`,
      code: error.code,
      status: response.status,
      requestId: getRequestId(response.headers),
      details: {
        bucket: request.bucket,
        key: request.key,
        uploadId: request.uploadId,
        partCount: request.parts.length,
      },
    });
  }

  // Parse successful response
  try {
    const result = parseCompleteMultipartResponse(responseText);

    return {
      location: result.location,
      bucket: result.bucket,
      key: result.key,
      eTag: result.eTag,
      versionId: response.headers['x-amz-version-id'],
      serverSideEncryption: response.headers['x-amz-server-side-encryption'],
      expiration: response.headers['x-amz-expiration'],
      requestId: getRequestId(response.headers),
    };
  } catch (error) {
    throw new MultipartError({
      isRetryable: false,
      message: 'Failed to parse complete multipart upload response',
      code: 'PARSE_ERROR',
      status: response.status,
      requestId: getRequestId(response.headers),
    });
  }
}
