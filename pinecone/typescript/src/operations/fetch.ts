/**
 * Fetch Operation Module
 *
 * Provides functionality to fetch vectors by their IDs from Pinecone.
 * Supports batch fetching of up to 1000 vectors at once.
 *
 * @module operations/fetch
 */

import { HttpTransport } from '../transport/http.js';
import type { FetchRequest, FetchResponse } from '../types/fetch.js';
import { VectorValidator } from '../validation/vector.js';
import { NamespaceValidator } from '../validation/namespace.js';

/**
 * Configuration for fetch operation
 */
export interface FetchOperationConfig {
  /** HTTP transport instance */
  transport: HttpTransport;
}

/**
 * Maximum number of IDs that can be fetched in a single request
 */
const MAX_FETCH_IDS = 1000;

/**
 * Fetches vectors by their IDs
 *
 * Retrieves specific vectors from the index by their unique identifiers.
 * Can fetch up to 1000 vectors in a single request.
 *
 * @param config - Configuration including transport
 * @param request - Fetch request with vector IDs and optional namespace
 * @returns Promise resolving to fetched vectors
 * @throws {ValidationError} If validation fails
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns an error
 *
 * @example
 * ```typescript
 * const response = await fetch(config, {
 *   ids: ['vec1', 'vec2', 'vec3'],
 *   namespace: 'my-namespace'
 * });
 * console.log(`Fetched ${Object.keys(response.vectors).length} vectors`);
 * ```
 */
export async function fetch(
  config: FetchOperationConfig,
  request: FetchRequest
): Promise<FetchResponse> {
  // 1. Validate request
  validateFetchRequest(request);

  // Add namespace if provided
  const namespace = NamespaceValidator.normalize(request.namespace);
  if (namespace) {
    NamespaceValidator.validate(namespace);
    // Note: namespace is a single value, but we need to add it properly
    // Pinecone API expects: /vectors/fetch?ids=id1&ids=id2&namespace=ns
  }

  // 3. Execute GET /vectors/fetch?ids=id1&ids=id2&namespace=ns
  const path = buildFetchPath(request.ids, namespace);
  const response = await config.transport.request<FetchResponse>({
    method: 'GET',
    path,
  });

  // 4. Parse and return response
  return response.data;
}

/**
 * Validates a fetch request
 *
 * @param request - Fetch request to validate
 * @throws {Error} If validation fails
 */
function validateFetchRequest(request: FetchRequest): void {
  if (!request) {
    throw new Error('Fetch request is required');
  }

  if (!request.ids || !Array.isArray(request.ids)) {
    throw new Error('IDs array is required');
  }

  if (request.ids.length === 0) {
    throw new Error('IDs array cannot be empty');
  }

  if (request.ids.length > MAX_FETCH_IDS) {
    throw new Error(
      `Cannot fetch more than ${MAX_FETCH_IDS} vectors at once (got ${request.ids.length})`
    );
  }

  // Validate each ID
  for (const id of request.ids) {
    VectorValidator.validateId(id);
  }
}

/**
 * Builds the fetch path with query parameters
 *
 * Constructs the URL path with properly encoded IDs and optional namespace.
 * Format: /vectors/fetch?ids=id1&ids=id2&namespace=ns
 *
 * @param ids - Array of vector IDs
 * @param namespace - Optional namespace
 * @returns URL path with query parameters
 */
function buildFetchPath(ids: string[], namespace?: string): string {
  const params = new URLSearchParams();

  // Add each ID as a separate parameter
  for (const id of ids) {
    params.append('ids', id);
  }

  // Add namespace if provided
  if (namespace) {
    params.append('namespace', namespace);
  }

  return `/vectors/fetch?${params.toString()}`;
}
