/**
 * Update Operation Module
 *
 * Provides functionality to update existing vectors in Pinecone.
 * Allows updating vector values, sparse values, and metadata.
 *
 * @module operations/update
 */

import { HttpTransport } from '../transport/http.js';
import type { UpdateRequest } from '../types/update.js';
import { VectorValidator } from '../validation/vector.js';
import { NamespaceValidator } from '../validation/namespace.js';

/**
 * Configuration for update operation
 */
export interface UpdateOperationConfig {
  /** HTTP transport instance */
  transport: HttpTransport;
}

/**
 * Updates an existing vector in the index
 *
 * Updates the values, sparse values, and/or metadata of an existing vector.
 * At least one of values, sparseValues, or setMetadata must be provided.
 *
 * @param config - Configuration including transport
 * @param request - Update request with vector ID and fields to update
 * @returns Promise that resolves when update is complete
 * @throws {ValidationError} If validation fails
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns an error
 *
 * @example
 * ```typescript
 * await update(config, {
 *   id: 'vec1',
 *   namespace: 'my-namespace',
 *   values: [0.1, 0.2, 0.3],
 *   setMetadata: { category: 'updated' }
 * });
 * ```
 */
export async function update(
  config: UpdateOperationConfig,
  request: UpdateRequest
): Promise<void> {
  // 1. Validate request (must have something to update)
  validateUpdateRequest(request);

  // 2. Build request body with proper field naming (camelCase)
  const requestBody: any = {
    id: request.id,
  };

  // Add namespace if provided
  const namespace = NamespaceValidator.normalize(request.namespace);
  if (namespace) {
    NamespaceValidator.validate(namespace);
    requestBody.namespace = namespace;
  }

  // Add values if provided
  if (request.values !== undefined) {
    VectorValidator.validateValues(request.values);
    requestBody.values = request.values;
  }

  // Add sparse values if provided
  if (request.sparseValues !== undefined) {
    VectorValidator.validateSparseValues(request.sparseValues);
    requestBody.sparseValues = {
      indices: request.sparseValues.indices,
      values: request.sparseValues.values,
    };
  }

  // Add metadata if provided
  if (request.setMetadata !== undefined) {
    VectorValidator.validateMetadata(request.setMetadata);
    requestBody.setMetadata = request.setMetadata;
  }

  // 3. Execute POST /vectors/update
  await config.transport.request({
    method: 'POST',
    path: '/vectors/update',
    body: requestBody,
  });

  // Update operation returns void (no response body)
}

/**
 * Validates an update request
 *
 * @param request - Update request to validate
 * @throws {Error} If validation fails
 */
function validateUpdateRequest(request: UpdateRequest): void {
  if (!request) {
    throw new Error('Update request is required');
  }

  // Validate ID
  if (!request.id) {
    throw new Error('Vector ID is required');
  }
  VectorValidator.validateId(request.id);

  // Must have at least one field to update
  const hasValues = request.values !== undefined;
  const hasSparseValues = request.sparseValues !== undefined;
  const hasMetadata = request.setMetadata !== undefined;

  if (!hasValues && !hasSparseValues && !hasMetadata) {
    throw new Error(
      'Update request must have at least one of: values, sparseValues, or setMetadata'
    );
  }
}
