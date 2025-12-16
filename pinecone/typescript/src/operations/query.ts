/**
 * Query Operation Module
 *
 * Provides functionality to query vectors by similarity in Pinecone.
 * Supports dense vectors, sparse vectors, and hybrid search.
 *
 * @module operations/query
 */

import { HttpTransport } from '../transport/http.js';
import type { QueryRequest, QueryResponse } from '../types/query.js';
import { VectorValidator } from '../validation/vector.js';
import { NamespaceValidator } from '../validation/namespace.js';

/**
 * Configuration for query operation
 */
export interface QueryOperationConfig {
  /** HTTP transport instance */
  transport: HttpTransport;
}

/**
 * Queries vectors by similarity
 *
 * Finds the most similar vectors to the provided query vector or vector ID.
 * Supports filtering by metadata and hybrid search with sparse vectors.
 *
 * @param config - Configuration including transport
 * @param request - Query request with vector/ID and search parameters
 * @returns Promise resolving to query results with matches
 * @throws {ValidationError} If validation fails
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns an error
 *
 * @example
 * ```typescript
 * const response = await query(config, {
 *   namespace: 'my-namespace',
 *   vector: [0.1, 0.2, 0.3],
 *   topK: 10,
 *   includeValues: true,
 *   includeMetadata: true
 * });
 * console.log(`Found ${response.matches.length} matches`);
 * ```
 */
export async function query(
  config: QueryOperationConfig,
  request: QueryRequest
): Promise<QueryResponse> {
  // 1. Validate request
  validateQueryRequest(request);

  // 2. Build request body with proper field naming (camelCase)
  const requestBody: any = {
    topK: request.topK,
  };

  // Add namespace if provided
  const namespace = NamespaceValidator.normalize(request.namespace);
  if (namespace) {
    NamespaceValidator.validate(namespace);
    requestBody.namespace = namespace;
  }

  // Add vector if provided
  if (request.vector !== undefined) {
    VectorValidator.validateValues(request.vector);
    requestBody.vector = request.vector;
  }

  // Add sparse vector if provided
  if (request.sparseVector !== undefined) {
    VectorValidator.validateSparseValues(request.sparseVector);
    requestBody.sparseVector = {
      indices: request.sparseVector.indices,
      values: request.sparseVector.values,
    };
  }

  // Add ID if provided
  if (request.id !== undefined) {
    VectorValidator.validateId(request.id);
    requestBody.id = request.id;
  }

  // Add filter if provided
  if (request.filter !== undefined) {
    requestBody.filter = request.filter;
  }

  // Add include flags
  if (request.includeValues !== undefined) {
    requestBody.includeValues = request.includeValues;
  }

  if (request.includeMetadata !== undefined) {
    requestBody.includeMetadata = request.includeMetadata;
  }

  // 3. Execute POST /query
  const response = await config.transport.request<QueryResponse>({
    method: 'POST',
    path: '/query',
    body: requestBody,
  });

  // 4. Parse and return response
  return response.data;
}

/**
 * Validates a query request
 *
 * @param request - Query request to validate
 * @throws {Error} If validation fails
 */
function validateQueryRequest(request: QueryRequest): void {
  if (!request) {
    throw new Error('Query request is required');
  }

  // Must have either vector or id
  if (!request.vector && !request.id) {
    throw new Error('Query request must have either "vector" or "id" specified');
  }

  // Validate topK
  if (typeof request.topK !== 'number') {
    throw new Error(`topK must be a number (got ${typeof request.topK})`);
  }

  if (!Number.isInteger(request.topK)) {
    throw new Error(`topK must be an integer (got ${request.topK})`);
  }

  if (request.topK < 1) {
    throw new Error(`topK must be at least 1 (got ${request.topK})`);
  }

  if (request.topK > 10000) {
    throw new Error(`topK exceeds maximum of 10000 (got ${request.topK})`);
  }
}
