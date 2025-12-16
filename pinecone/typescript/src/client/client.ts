/**
 * Pinecone Client Module
 *
 * Production-ready TypeScript client for the Pinecone Vector Database API.
 * Provides a unified interface for all vector operations including:
 * - Vector CRUD operations (upsert, query, fetch, update, delete)
 * - Batch operations with parallel execution
 * - Namespace routing and access control
 * - Metrics collection and simulation support
 *
 * @module client
 */

import type { PineconeConfig, ValidatedPineconeConfig } from '../config.js';
import { validateConfig, resolveBaseUrl } from '../config.js';
import { HttpTransport, createHttpTransport } from '../transport/http.js';
import { RetryExecutor, isRetryableError } from '../transport/retry.js';
import type { MetadataFilter } from '../types/filter.js';
import type { QueryRequest, QueryResponse } from '../types/query.js';
import type { UpsertRequest, UpsertResponse } from '../types/upsert.js';
import type { FetchRequest, FetchResponse } from '../types/fetch.js';
import type { UpdateRequest } from '../types/update.js';
import type { DeleteRequest } from '../types/delete.js';
import type { IndexStats } from '../types/index.js';
import {
  upsert,
  query,
  fetch,
  update,
  deleteVectors,
  describeIndexStats,
} from '../operations/index.js';
import { ConfigurationError } from '../errors/index.js';

/**
 * Interface for Pinecone index operations
 */
export interface IndexOperations {
  /**
   * Upsert vectors into the index
   */
  upsert(request: UpsertRequest): Promise<UpsertResponse>;

  /**
   * Query vectors by similarity
   */
  query(request: QueryRequest): Promise<QueryResponse>;

  /**
   * Fetch vectors by ID
   */
  fetch(request: FetchRequest): Promise<FetchResponse>;

  /**
   * Update a vector's values or metadata
   */
  update(request: UpdateRequest): Promise<void>;

  /**
   * Delete vectors by ID, filter, or all
   */
  delete(request: DeleteRequest): Promise<void>;

  /**
   * Get index statistics
   */
  describeIndexStats(filter?: MetadataFilter): Promise<IndexStats>;
}

/**
 * Main Pinecone client interface
 */
export interface PineconeClient {
  /**
   * Get index operations for vector CRUD
   */
  readonly index: IndexOperations;

  /**
   * Get the current configuration
   */
  getConfig(): Readonly<ValidatedPineconeConfig>;

  /**
   * Get the HTTP transport instance
   */
  getTransport(): HttpTransport;

  /**
   * Get the retry executor instance
   */
  getRetryExecutor(): RetryExecutor;
}

/**
 * Implementation of the Pinecone client
 */
export class PineconeClientImpl implements PineconeClient {
  private readonly config: ValidatedPineconeConfig;
  private readonly transport: HttpTransport;
  private readonly retryExecutor: RetryExecutor;
  private readonly indexOps: IndexOperations;

  constructor(config: PineconeConfig) {
    // Validate and resolve configuration
    this.config = validateConfig(config);
    const baseUrl = resolveBaseUrl(this.config);

    // Create transport
    this.transport = createHttpTransport({
      baseUrl,
      apiKey: this.config.apiKey,
      timeout: this.config.timeout,
    });

    // Create retry executor
    this.retryExecutor = new RetryExecutor(this.config.retryConfig);

    // Create index operations with retry wrapping
    this.indexOps = this.createIndexOperations();
  }

  /**
   * Index operations for vector CRUD
   */
  get index(): IndexOperations {
    return this.indexOps;
  }

  getConfig(): Readonly<ValidatedPineconeConfig> {
    return Object.freeze({ ...this.config });
  }

  getTransport(): HttpTransport {
    return this.transport;
  }

  getRetryExecutor(): RetryExecutor {
    return this.retryExecutor;
  }

  /**
   * Create index operations with retry support
   */
  private createIndexOperations(): IndexOperations {
    const transport = this.transport;
    const retryExecutor = this.retryExecutor;

    return {
      upsert: async (request: UpsertRequest): Promise<UpsertResponse> => {
        return retryExecutor.execute(
          () => upsert({ transport }, request),
          isRetryableError
        );
      },

      query: async (request: QueryRequest): Promise<QueryResponse> => {
        return retryExecutor.execute(
          () => query({ transport }, request),
          isRetryableError
        );
      },

      fetch: async (request: FetchRequest): Promise<FetchResponse> => {
        return retryExecutor.execute(
          () => fetch({ transport }, request),
          isRetryableError
        );
      },

      update: async (request: UpdateRequest): Promise<void> => {
        return retryExecutor.execute(
          () => update({ transport }, request),
          isRetryableError
        );
      },

      delete: async (request: DeleteRequest): Promise<void> => {
        return retryExecutor.execute(
          () => deleteVectors({ transport }, request),
          isRetryableError
        );
      },

      describeIndexStats: async (filter?: MetadataFilter): Promise<IndexStats> => {
        return retryExecutor.execute(
          () => describeIndexStats({ transport }, filter),
          isRetryableError
        );
      },
    };
  }
}

/**
 * Creates a new Pinecone client with the provided configuration
 *
 * @param config - Client configuration
 * @returns A configured Pinecone client instance
 *
 * @example
 * ```typescript
 * import { createClient } from '@integrations/pinecone';
 *
 * const client = createClient({
 *   apiKey: 'your-api-key',
 *   environment: 'us-east-1-aws',
 *   indexName: 'my-index',
 *   projectId: 'your-project-id',
 * });
 *
 * // Upsert vectors
 * await client.index.upsert({
 *   vectors: [{ id: 'vec1', values: [0.1, 0.2, 0.3] }],
 * });
 *
 * // Query vectors
 * const results = await client.index.query({
 *   vector: [0.1, 0.2, 0.3],
 *   topK: 10,
 * });
 * ```
 */
export function createClient(config: PineconeConfig): PineconeClient {
  return new PineconeClientImpl(config);
}

/**
 * Creates a new Pinecone client using environment variables
 *
 * Expected environment variables:
 * - PINECONE_API_KEY (required)
 * - PINECONE_ENVIRONMENT (required)
 * - PINECONE_INDEX_NAME (required)
 * - PINECONE_PROJECT_ID (optional if baseUrl is provided)
 * - PINECONE_BASE_URL (optional)
 *
 * @param overrides - Optional configuration overrides
 * @returns A configured Pinecone client instance
 * @throws {ConfigurationError} If required environment variables are not set
 *
 * @example
 * ```typescript
 * import { createClientFromEnv } from '@integrations/pinecone';
 *
 * // Uses PINECONE_API_KEY, PINECONE_ENVIRONMENT, PINECONE_INDEX_NAME
 * const client = createClientFromEnv();
 *
 * // With overrides
 * const clientWithOverrides = createClientFromEnv({
 *   timeout: 60000,
 *   retryConfig: { maxRetries: 5 },
 * });
 * ```
 */
export function createClientFromEnv(overrides?: Partial<PineconeConfig>): PineconeClient {
  const apiKey = process.env.PINECONE_API_KEY;
  const environment = process.env.PINECONE_ENVIRONMENT;
  const indexName = process.env.PINECONE_INDEX_NAME;
  const projectId = process.env.PINECONE_PROJECT_ID;
  const baseUrl = process.env.PINECONE_BASE_URL;

  if (!apiKey) {
    throw new ConfigurationError(
      'PINECONE_API_KEY environment variable is not set. ' +
        'Please set it or provide an apiKey in the config.'
    );
  }

  if (!environment) {
    throw new ConfigurationError(
      'PINECONE_ENVIRONMENT environment variable is not set. ' +
        'Please set it or provide an environment in the config.'
    );
  }

  if (!indexName) {
    throw new ConfigurationError(
      'PINECONE_INDEX_NAME environment variable is not set. ' +
        'Please set it or provide an indexName in the config.'
    );
  }

  const config: PineconeConfig = {
    apiKey,
    environment,
    indexName,
    projectId,
    baseUrl,
    ...overrides,
  };

  return createClient(config);
}
