/**
 * ListObjects implementation for Cloudflare R2 Storage
 * @module @studiorack/cloudflare-r2/objects/list
 */

import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';
import type { ListObjectsRequest, ListObjectsOutput, R2Object } from '../types/index.js';
import { mapHttpStatusToError } from '../errors/index.js';
import { getRequestId, isSuccessResponse } from '../transport/index.js';
import { parseErrorResponse, isErrorResponse, parseListObjectsResponse } from '../xml/index.js';
import { EMPTY_SHA256 } from '../signing/index.js';

/**
 * Lists objects in a bucket with pagination support
 *
 * Implements GET bucket with list-type=2 (ListObjectsV2).
 * Returns up to 1000 objects per request (default 1000, configurable with maxKeys).
 * Supports prefix filtering, delimiter-based grouping, and pagination.
 *
 * Request flow:
 * 1. Build bucket URL with query parameters
 * 2. Add list-type=2, prefix, delimiter, max-keys, continuation-token
 * 3. Sign GET request
 * 4. Send via HttpTransport
 * 5. Parse XML response into structured output
 *
 * @param transport - HTTP transport for sending request
 * @param signer - R2 signer for authentication
 * @param endpoint - R2 endpoint URL
 * @param request - List objects request parameters
 * @returns List of objects with pagination info
 * @throws {BucketError} If bucket not found
 * @throws {ValidationError} If parameters are invalid
 * @throws {AuthError} If authentication fails
 *
 * @example
 * ```typescript
 * // List all objects
 * const result = await listObjects(transport, signer, endpoint, {
 *   bucket: 'my-bucket'
 * });
 *
 * // List with prefix filter
 * const result2 = await listObjects(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   prefix: 'images/',
 *   maxKeys: 100
 * });
 *
 * // List with delimiter (directory-style listing)
 * const result3 = await listObjects(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   prefix: 'documents/',
 *   delimiter: '/'
 * });
 *
 * // Pagination
 * let continuationToken: string | undefined;
 * do {
 *   const result = await listObjects(transport, signer, endpoint, {
 *     bucket: 'my-bucket',
 *     continuationToken
 *   });
 *
 *   // Process objects
 *   for (const obj of result.contents) {
 *     console.log(obj.key);
 *   }
 *
 *   continuationToken = result.nextContinuationToken;
 * } while (continuationToken);
 * ```
 */
export async function listObjects(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: ListObjectsRequest
): Promise<ListObjectsOutput> {
  // Build URL with query parameters
  const baseUrl = `${endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint}/${request.bucket}`;

  // Build query parameters for ListObjectsV2
  const queryParams: string[] = ['list-type=2'];

  if (request.prefix) {
    queryParams.push(`prefix=${encodeURIComponent(request.prefix)}`);
  }

  if (request.delimiter) {
    queryParams.push(`delimiter=${encodeURIComponent(request.delimiter)}`);
  }

  if (request.maxKeys !== undefined) {
    // Validate maxKeys
    if (request.maxKeys < 1 || request.maxKeys > 1000) {
      throw new Error('maxKeys must be between 1 and 1000');
    }
    queryParams.push(`max-keys=${request.maxKeys}`);
  }

  if (request.continuationToken) {
    queryParams.push(`continuation-token=${encodeURIComponent(request.continuationToken)}`);
  }

  if (request.startAfter) {
    queryParams.push(`start-after=${encodeURIComponent(request.startAfter)}`);
  }

  if (request.fetchOwner) {
    queryParams.push('fetch-owner=true');
  }

  if (request.requestPayer) {
    queryParams.push(`request-payer=${encodeURIComponent(request.requestPayer)}`);
  }

  const url = `${baseUrl}?${queryParams.join('&')}`;

  // Build headers
  const headers: Record<string, string> = {};

  if (request.requestPayer) {
    headers['x-amz-request-payer'] = request.requestPayer;
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

  // Send request
  const response = await transport.send({
    method: 'GET',
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
  const listResult = parseListObjectsResponse(bodyText);

  // Add request ID
  const requestId = getRequestId(response.headers);

  return {
    ...listResult,
    requestId,
  };
}

/**
 * Lists all objects in a bucket using automatic pagination
 *
 * Returns an async iterator that automatically handles pagination,
 * yielding objects one at a time. This is useful for processing large
 * buckets without loading all objects into memory.
 *
 * The iterator handles continuation tokens internally and will continue
 * fetching pages until all objects matching the filter criteria have been
 * returned.
 *
 * @param transport - HTTP transport for sending requests
 * @param signer - R2 signer for authentication
 * @param endpoint - R2 endpoint URL
 * @param request - List request without continuation token
 * @yields Individual R2Object instances
 * @throws {BucketError} If bucket not found
 * @throws {ValidationError} If parameters are invalid
 * @throws {AuthError} If authentication fails
 *
 * @example
 * ```typescript
 * // Process all objects one at a time
 * for await (const obj of listAllObjects(transport, signer, endpoint, {
 *   bucket: 'my-bucket',
 *   prefix: 'images/'
 * })) {
 *   console.log(`${obj.key}: ${obj.size} bytes`);
 *
 *   // Can process, download, or analyze each object
 *   if (obj.size > 1000000) {
 *     console.log('Large file:', obj.key);
 *   }
 * }
 *
 * // Collect all keys into an array
 * const allKeys: string[] = [];
 * for await (const obj of listAllObjects(transport, signer, endpoint, {
 *   bucket: 'my-bucket'
 * })) {
 *   allKeys.push(obj.key);
 * }
 * console.log(`Total objects: ${allKeys.length}`);
 *
 * // Use with Array.fromAsync (if available)
 * const allObjects = await Array.fromAsync(
 *   listAllObjects(transport, signer, endpoint, { bucket: 'my-bucket' })
 * );
 * ```
 */
export async function* listAllObjects(
  transport: HttpTransport,
  signer: R2Signer,
  endpoint: string,
  request: Omit<ListObjectsRequest, 'continuationToken'>
): AsyncIterableIterator<R2Object> {
  let continuationToken: string | undefined;

  do {
    // Fetch next page
    const result = await listObjects(transport, signer, endpoint, {
      ...request,
      continuationToken,
    });

    // Yield each object
    for (const obj of result.contents) {
      yield obj;
    }

    // Update continuation token for next iteration
    continuationToken = result.nextContinuationToken;

    // Continue if there are more results
  } while (continuationToken);
}
