/**
 * Upsert Operation Module
 *
 * Provides functionality to upsert (insert or update) vectors in Pinecone.
 * Implements automatic batching for large vector sets.
 *
 * @module operations/upsert
 */

import { HttpTransport } from '../transport/http.js';
import type { UpsertRequest, UpsertResponse } from '../types/upsert.js';
import type { Vector } from '../types/vector.js';
import { VectorValidator } from '../validation/vector.js';
import { NamespaceValidator } from '../validation/namespace.js';

/**
 * Configuration for upsert operation
 */
export interface UpsertOperationConfig {
  /** HTTP transport instance */
  transport: HttpTransport;
  /** Maximum batch size for chunking (default: 100) */
  maxBatchSize?: number;
}

/**
 * Default maximum batch size for upsert operations
 */
const DEFAULT_MAX_BATCH_SIZE = 100;

/**
 * Upserts (inserts or updates) vectors in the Pinecone index
 *
 * This operation validates all vectors, chunks them into batches if necessary,
 * and executes the upsert requests to the Pinecone API.
 *
 * @param config - Configuration including transport and batch size
 * @param request - Upsert request with vectors and optional namespace
 * @returns Promise resolving to the total number of vectors upserted
 * @throws {ValidationError} If validation fails
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns an error
 *
 * @example
 * ```typescript
 * const response = await upsert(config, {
 *   namespace: 'my-namespace',
 *   vectors: [
 *     { id: '1', values: [0.1, 0.2, 0.3] },
 *     { id: '2', values: [0.4, 0.5, 0.6] }
 *   ]
 * });
 * console.log(`Upserted ${response.upsertedCount} vectors`);
 * ```
 */
export async function upsert(
  config: UpsertOperationConfig,
  request: UpsertRequest
): Promise<UpsertResponse> {
  // 1. Validate namespace if provided
  const namespace = NamespaceValidator.normalize(request.namespace);
  if (namespace) {
    NamespaceValidator.validate(namespace);
  }

  // 2. Validate all vectors
  if (!request.vectors || !Array.isArray(request.vectors)) {
    throw new Error('Vectors array is required');
  }

  if (request.vectors.length === 0) {
    throw new Error('Vectors array cannot be empty');
  }

  for (const vector of request.vectors) {
    VectorValidator.validate(vector);
  }

  // 3. Chunk vectors if they exceed maxBatchSize
  const maxBatchSize = config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
  const chunks = chunkVectors(request.vectors, maxBatchSize);

  // 4. Execute POST /vectors/upsert for each chunk
  let totalUpsertedCount = 0;

  for (const chunk of chunks) {
    // Build request body with proper Pinecone API field naming (camelCase)
    const requestBody: any = {
      vectors: chunk.map(v => ({
        id: v.id,
        values: v.values,
        sparseValues: v.sparseValues,
        metadata: v.metadata,
      })),
    };

    // Add namespace if provided (empty string is valid for default namespace)
    if (namespace !== undefined && namespace !== '') {
      requestBody.namespace = namespace;
    }

    // Execute the request
    const response = await config.transport.request<{ upsertedCount: number }>({
      method: 'POST',
      path: '/vectors/upsert',
      body: requestBody,
    });

    totalUpsertedCount += response.data.upsertedCount;
  }

  // 5. Return aggregated upserted count
  return {
    upsertedCount: totalUpsertedCount,
  };
}

/**
 * Chunks vectors into smaller batches
 *
 * @param vectors - Array of vectors to chunk
 * @param maxSize - Maximum size of each chunk
 * @returns Array of vector chunks
 *
 * @example
 * ```typescript
 * const vectors = [v1, v2, v3, v4, v5];
 * const chunks = chunkVectors(vectors, 2);
 * // Returns: [[v1, v2], [v3, v4], [v5]]
 * ```
 */
export function chunkVectors(vectors: Vector[], maxSize: number): Vector[][] {
  if (maxSize <= 0) {
    throw new Error('Max size must be greater than 0');
  }

  const chunks: Vector[][] = [];

  for (let i = 0; i < vectors.length; i += maxSize) {
    chunks.push(vectors.slice(i, i + maxSize));
  }

  return chunks;
}
