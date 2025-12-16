/**
 * Batch operations for Pinecone vector database.
 * Provides high-level batch upsert, fetch, and delete operations.
 */

import type { Vector } from '../types/vector.js';
import type { FetchResponse } from '../types/fetch.js';
import { ParallelExecutor, type BatchOptions } from './executor.js';

/**
 * HTTP transport interface for making requests
 */
export interface HttpTransport {
  /**
   * Send an HTTP request
   */
  send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<{
    status: number;
    headers: Headers;
    body: unknown;
  }>;
}

/**
 * Request to batch upsert vectors
 */
export interface BatchUpsertRequest {
  /**
   * Optional namespace to upsert vectors into
   */
  namespace?: string;

  /**
   * Vectors to upsert
   */
  vectors: Vector[];

  /**
   * Optional batch execution options
   */
  options?: Partial<BatchOptions>;
}

/**
 * Response from batch upsert operation
 */
export interface BatchUpsertResponse {
  /**
   * Total number of vectors successfully upserted
   */
  totalUpserted: number;

  /**
   * Number of chunks processed
   */
  chunkCount: number;

  /**
   * Errors that occurred during processing
   */
  errors: Array<{ chunkIndex: number; error: Error }>;
}

/**
 * Request to batch fetch vectors
 */
export interface BatchFetchRequest {
  /**
   * IDs of vectors to fetch
   */
  ids: string[];

  /**
   * Optional namespace to fetch from
   */
  namespace?: string;

  /**
   * Optional batch execution options
   */
  options?: Partial<BatchOptions>;
}

/**
 * Request to batch delete vectors
 */
export interface BatchDeleteRequest {
  /**
   * IDs of vectors to delete
   */
  ids: string[];

  /**
   * Optional namespace to delete from
   */
  namespace?: string;

  /**
   * Optional batch execution options
   */
  options?: Partial<BatchOptions>;
}

/**
 * Internal upsert response from Pinecone API
 */
interface UpsertResponse {
  upsertedCount: number;
}

/**
 * Batch upsert vectors to Pinecone
 *
 * Splits vectors into chunks and upserts them in parallel with concurrency control.
 *
 * @param transport - HTTP transport for making requests
 * @param request - Batch upsert request
 * @returns Batch upsert response with total count and errors
 *
 * @example
 * ```typescript
 * const response = await batchUpsert(transport, {
 *   namespace: 'my-namespace',
 *   vectors: largeVectorArray,
 *   options: {
 *     chunkSize: 100,
 *     maxParallelism: 4,
 *     continueOnError: true
 *   }
 * });
 * console.log(`Upserted ${response.totalUpserted} vectors in ${response.chunkCount} chunks`);
 * ```
 */
export async function batchUpsert(
  transport: HttpTransport,
  request: BatchUpsertRequest
): Promise<BatchUpsertResponse> {
  const { vectors, namespace, options = {} } = request;

  // Create executor with provided options
  const executor = new ParallelExecutor(options);

  // Execute batch upsert
  const result = await executor.executeAll(vectors, async (chunk) => {
    // Build request body
    const body: Record<string, unknown> = {
      vectors: chunk,
    };

    if (namespace) {
      body.namespace = namespace;
    }

    // Make upsert request
    const response = await transport.send('POST', '/vectors/upsert', {}, body);

    return response.body as UpsertResponse;
  });

  // Calculate total upserted
  const totalUpserted = result.results.reduce(
    (sum, response) => sum + (response?.upsertedCount ?? 0),
    0
  );

  return {
    totalUpserted,
    chunkCount: result.results.length,
    errors: result.errors.map((e) => ({
      chunkIndex: e.index,
      error: e.error,
    })),
  };
}

/**
 * Batch fetch vectors from Pinecone
 *
 * Splits IDs into chunks and fetches them in parallel with concurrency control.
 * Merges all fetched vectors into a single response.
 *
 * @param transport - HTTP transport for making requests
 * @param request - Batch fetch request
 * @returns Combined fetch response with all vectors
 *
 * @example
 * ```typescript
 * const response = await batchFetch(transport, {
 *   ids: largeIdArray,
 *   namespace: 'my-namespace',
 *   options: { chunkSize: 100, maxParallelism: 4 }
 * });
 * console.log(`Fetched ${Object.keys(response.vectors).length} vectors`);
 * ```
 */
export async function batchFetch(
  transport: HttpTransport,
  request: BatchFetchRequest
): Promise<FetchResponse> {
  const { ids, namespace, options = {} } = request;

  // Create executor with provided options
  const executor = new ParallelExecutor(options);

  // Execute batch fetch
  const result = await executor.executeAll(ids, async (chunk) => {
    // Build request body
    const params = new URLSearchParams();
    chunk.forEach((id) => params.append('ids', id));
    if (namespace) {
      params.set('namespace', namespace);
    }

    // Make fetch request
    const url = `/vectors/fetch?${params.toString()}`;
    const response = await transport.send('GET', url, {}, undefined);

    return response.body as FetchResponse;
  });

  // Merge all fetched vectors
  const mergedVectors: Record<string, Vector> = {};
  let totalReadUnits = 0;

  for (const fetchResponse of result.results) {
    if (fetchResponse?.vectors) {
      Object.assign(mergedVectors, fetchResponse.vectors);
    }
    if (fetchResponse?.usage?.readUnits) {
      totalReadUnits += fetchResponse.usage.readUnits;
    }
  }

  return {
    vectors: mergedVectors,
    namespace,
    usage: {
      readUnits: totalReadUnits,
    },
  };
}

/**
 * Batch delete vectors from Pinecone
 *
 * Splits IDs into chunks and deletes them in parallel with concurrency control.
 *
 * @param transport - HTTP transport for making requests
 * @param request - Batch delete request
 * @returns Promise that resolves when all deletes complete
 *
 * @example
 * ```typescript
 * await batchDelete(transport, {
 *   ids: largeIdArray,
 *   namespace: 'my-namespace',
 *   options: {
 *     chunkSize: 100,
 *     maxParallelism: 4,
 *     continueOnError: true
 *   }
 * });
 * console.log('Batch delete completed');
 * ```
 */
export async function batchDelete(
  transport: HttpTransport,
  request: BatchDeleteRequest
): Promise<void> {
  const { ids, namespace, options = {} } = request;

  // Create executor with provided options
  const executor = new ParallelExecutor(options);

  // Execute batch delete
  const result = await executor.executeAll(ids, async (chunk) => {
    // Build request body
    const body: Record<string, unknown> = {
      ids: chunk,
    };

    if (namespace) {
      body.namespace = namespace;
    }

    // Make delete request
    await transport.send('POST', '/vectors/delete', {}, body);
  });

  // If there were errors and continueOnError was false, throw the first error
  const firstError = result.errors[0];
  if (result.errors.length > 0 && !options.continueOnError && firstError) {
    throw firstError.error;
  }
}
