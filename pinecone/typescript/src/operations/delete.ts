/**
 * Delete Operation Module
 *
 * Provides functionality to delete vectors from Pinecone.
 * Supports deletion by IDs, metadata filter, or deleting all vectors.
 *
 * @module operations/delete
 */

import { HttpTransport } from '../transport/http.js';
import type { DeleteRequest } from '../types/delete.js';
import { VectorValidator } from '../validation/vector.js';
import { NamespaceValidator } from '../validation/namespace.js';

/**
 * Configuration for delete operation
 */
export interface DeleteOperationConfig {
  /** HTTP transport instance */
  transport: HttpTransport;
}

/**
 * Deletes vectors from the index
 *
 * Supports three deletion modes:
 * 1. Delete by IDs: Provide an array of vector IDs
 * 2. Delete by filter: Provide a metadata filter to match vectors
 * 3. Delete all: Set deleteAll to true to remove all vectors in a namespace
 *
 * @param config - Configuration including transport
 * @param request - Delete request specifying what to delete
 * @returns Promise that resolves when deletion is complete
 * @throws {ValidationError} If validation fails
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns an error
 *
 * @example
 * ```typescript
 * // Delete by IDs
 * await deleteVectors(config, {
 *   ids: ['vec1', 'vec2', 'vec3'],
 *   namespace: 'my-namespace'
 * });
 *
 * // Delete by filter
 * await deleteVectors(config, {
 *   filter: { category: { $eq: 'obsolete' } },
 *   namespace: 'my-namespace'
 * });
 *
 * // Delete all in namespace
 * await deleteVectors(config, {
 *   deleteAll: true,
 *   namespace: 'my-namespace'
 * });
 * ```
 */
export async function deleteVectors(
  config: DeleteOperationConfig,
  request: DeleteRequest
): Promise<void> {
  // 1. Validate request (must have ids, filter, or deleteAll)
  validateDeleteRequest(request);

  // 2. Build request body with proper field naming (camelCase)
  const requestBody: any = {};

  // Add namespace if provided
  const namespace = NamespaceValidator.normalize(request.namespace);
  if (namespace) {
    NamespaceValidator.validate(namespace);
    requestBody.namespace = namespace;
  }

  // Add IDs if provided
  if (request.ids !== undefined) {
    // Validate each ID
    for (const id of request.ids) {
      VectorValidator.validateId(id);
    }
    requestBody.ids = request.ids;
  }

  // Add filter if provided
  if (request.filter !== undefined) {
    requestBody.filter = request.filter;
  }

  // Add deleteAll flag if provided
  if (request.deleteAll !== undefined) {
    requestBody.deleteAll = request.deleteAll;
  }

  // 3. Execute POST /vectors/delete
  await config.transport.request({
    method: 'POST',
    path: '/vectors/delete',
    body: requestBody,
  });

  // Delete operation returns void (no response body)
}

/**
 * Validates a delete request
 *
 * @param request - Delete request to validate
 * @throws {Error} If validation fails
 */
function validateDeleteRequest(request: DeleteRequest): void {
  if (!request) {
    throw new Error('Delete request is required');
  }

  // Count how many deletion methods are specified
  const hasIds = request.ids !== undefined && request.ids.length > 0;
  const hasFilter = request.filter !== undefined;
  const hasDeleteAll = request.deleteAll === true;

  // Must have exactly one deletion method
  const methodCount = [hasIds, hasFilter, hasDeleteAll].filter(Boolean).length;

  if (methodCount === 0) {
    throw new Error(
      'Delete request must specify one of: ids (non-empty array), filter, or deleteAll (true)'
    );
  }

  if (methodCount > 1) {
    throw new Error(
      'Delete request can only specify one deletion method: ids, filter, or deleteAll'
    );
  }

  // Validate IDs if provided
  if (request.ids !== undefined) {
    if (!Array.isArray(request.ids)) {
      throw new Error('IDs must be an array');
    }

    if (request.ids.length === 0) {
      throw new Error('IDs array cannot be empty when specified');
    }
  }
}
