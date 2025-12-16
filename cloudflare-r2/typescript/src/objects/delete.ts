/**
 * DeleteObject implementation for Cloudflare R2 Storage
 * @module @studiorack/cloudflare-r2/objects/delete
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type {
  DeleteObjectRequest,
  DeleteObjectsRequest,
  DeleteObjectsOutput,
} from '../types/index.js';
import { mapHttpStatusToError } from '../errors/index.js';
import { getRequestId, isSuccessResponse } from '../transport/index.js';
import { parseErrorResponse, isErrorResponse, parseDeleteObjectsResponse } from '../xml/index.js';
import { buildDeleteObjectsXml } from '../xml/index.js';
import { EMPTY_SHA256 } from '../signing/index.js';
import { buildObjectUrl, buildQueryString } from './utils.js';

/**
 * Deletes a single object from R2 storage
 *
 * Implements DELETE object operation.
 * This operation is idempotent - deleting a non-existent object succeeds.
 *
 * Request flow:
 * 1. Build object URL with optional versionId
 * 2. Sign DELETE request
 * 3. Send via HttpTransport
 * 4. Handle response (always succeeds unless auth/network error)
 *
 * @param transport - HTTP transport for sending request
 * @param signer - R2 signer for authentication
 * @param endpoint - R2 endpoint URL
 * @param request - Delete object request parameters
 * @returns Promise that resolves when deletion completes
 * @throws {ValidationError} If parameters are invalid
 * @throws {AuthError} If authentication fails
 * @throws {NetworkError} If network error occurs
 *
 * @example
 * ```typescript
 * await deleteObject(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   key: 'documents/old-file.pdf'
 * });
 * console.log('Object deleted successfully');
 * ```
 */
export async function deleteObject(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: DeleteObjectRequest
): Promise<void> {
  // Build URL with query parameters
  const baseUrl = buildObjectUrl(endpoint, request.bucket, request.key);
  const queryParams: Record<string, string | undefined> = {};

  if (request.versionId) {
    queryParams.versionId = request.versionId;
  }

  if (request.bypassGovernanceRetention) {
    queryParams['x-amz-bypass-governance-retention'] = 'true';
  }

  const queryString = buildQueryString(queryParams);
  const url = `${baseUrl}${queryString}`;

  // Build headers
  const headers: Record<string, string> = {};

  if (request.bypassGovernanceRetention) {
    headers['x-amz-bypass-governance-retention'] = 'true';
  }

  // Sign request
  const urlObj = new URL(url);
  const signedRequest = signer.signRequest(
    {
      method: 'DELETE',
      url: urlObj,
      headers,
    },
    EMPTY_SHA256
  );

  // Send request
  const response = await transport.send({
    method: 'DELETE',
    url: signedRequest.url.toString(),
    headers: signedRequest.headers,
  });

  // Check for errors
  // Note: 204 No Content is the typical success response
  // 404 Not Found is also acceptable (object already deleted)
  if (!isSuccessResponse(response) && response.status !== 204 && response.status !== 404) {
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

  // Success - no return value
}

/**
 * Deletes multiple objects from R2 storage in a single request
 *
 * Implements POST to /?delete with XML body containing object keys.
 * Can delete up to 1000 objects per request.
 *
 * Request flow:
 * 1. Validate object count (max 1000)
 * 2. Build XML request body with object identifiers
 * 3. Build URL with ?delete query parameter
 * 4. Sign POST request
 * 5. Send via HttpTransport
 * 6. Parse XML response with deleted/error lists
 *
 * @param transport - HTTP transport for sending request
 * @param signer - R2 signer for authentication
 * @param endpoint - R2 endpoint URL
 * @param request - Delete objects request parameters
 * @returns Deletion results with success and error lists
 * @throws {ValidationError} If parameters are invalid (e.g., >1000 objects)
 * @throws {AuthError} If authentication fails
 *
 * @example
 * ```typescript
 * const result = await deleteObjects(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   objects: [
 *     { key: 'file1.txt' },
 *     { key: 'file2.txt' },
 *     { key: 'versioned.txt', versionId: 'abc123' }
 *   ],
 *   quiet: false
 * });
 *
 * console.log(`Deleted: ${result.deleted.length}`);
 * console.log(`Errors: ${result.errors.length}`);
 *
 * for (const error of result.errors) {
 *   console.error(`Failed to delete ${error.key}: ${error.message}`);
 * }
 * ```
 */
export async function deleteObjects(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: DeleteObjectsRequest
): Promise<DeleteObjectsOutput> {
  // Validate object count
  if (!request.objects || request.objects.length === 0) {
    throw new Error('DeleteObjects request must include at least one object');
  }

  if (request.objects.length > 1000) {
    throw new Error(
      `Cannot delete more than 1000 objects at once (got ${request.objects.length})`
    );
  }

  // Build XML request body
  const xmlBody = buildDeleteObjectsXml(
    request.objects as Array<{ key: string; versionId?: string }>,
    request.quiet ?? false
  );

  // Build URL with ?delete query parameter
  const baseUrl = `${endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint}/${request.bucket}`;
  const url = `${baseUrl}?delete`;

  // Build headers
  const headers: Record<string, string> = {
    'content-type': 'application/xml',
  };

  if (request.bypassGovernanceRetention) {
    headers['x-amz-bypass-governance-retention'] = 'true';
  }

  // Convert XML string to Uint8Array
  const bodyBytes = new TextEncoder().encode(xmlBody);

  // Sign request
  const urlObj = new URL(url);
  const payloadHash = signer.hashPayload(bodyBytes);
  const signedRequest = signer.signRequest(
    {
      method: 'POST',
      url: urlObj,
      headers,
      body: bodyBytes,
    },
    payloadHash
  );

  // Send request
  const response = await transport.send({
    method: 'POST',
    url: signedRequest.url.toString(),
    headers: signedRequest.headers,
    body: bodyBytes,
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
  const result = parseDeleteObjectsResponse(bodyText);

  // Add request ID
  const requestId = getRequestId(response.headers);

  return {
    ...result,
    requestId,
  };
}
