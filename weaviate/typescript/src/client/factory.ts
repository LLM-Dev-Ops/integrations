/**
 * Client factory functions
 *
 * Provides convenient factory functions for creating WeaviateClient instances.
 *
 * @module client/factory
 */

import { WeaviateClient } from './client.js';
import type { WeaviateConfig } from '../config/types.js';
import type { WeaviateClientOptions } from './types.js';
import { loadConfigFromEnv } from '../config/env.js';
import { validateConfig } from '../config/validation.js';

/**
 * Create a Weaviate client with the provided configuration
 *
 * @param config - Client configuration
 * @returns Weaviate client instance
 * @throws {ConfigError} If configuration is invalid
 *
 * @example
 * ```typescript
 * import { createClient } from '@llmdevops/weaviate-integration';
 *
 * const client = createClient({
 *   endpoint: 'http://localhost:8080',
 *   auth: { type: 'apiKey', apiKey: 'secret' },
 *   timeout: 60000,
 *   batchSize: 200
 * });
 *
 * // Use client
 * const results = await client.nearVector('Article', {
 *   vector: [0.1, 0.2, 0.3],
 *   limit: 10
 * });
 *
 * await client.close();
 * ```
 */
export function createClient(config: WeaviateConfig): WeaviateClient {
  // Validate configuration
  validateConfig(config);

  // Create and return client
  return new WeaviateClient(config);
}

/**
 * Create a Weaviate client from environment variables
 *
 * Reads configuration from environment variables:
 * - WEAVIATE_ENDPOINT: Weaviate instance URL
 * - WEAVIATE_GRPC_ENDPOINT: Optional gRPC endpoint
 * - WEAVIATE_API_KEY: Optional API key
 * - WEAVIATE_OIDC_TOKEN: Optional OIDC token
 * - WEAVIATE_CLIENT_ID: Optional OAuth client ID
 * - WEAVIATE_CLIENT_SECRET: Optional OAuth client secret
 * - WEAVIATE_TIMEOUT: Optional timeout in milliseconds
 * - WEAVIATE_BATCH_SIZE: Optional batch size
 * - WEAVIATE_MAX_RETRIES: Optional max retry attempts
 *
 * @returns Weaviate client instance
 * @throws {ConfigError} If environment configuration is invalid
 *
 * @example
 * ```typescript
 * import { createClientFromEnv } from '@llmdevops/weaviate-integration';
 *
 * // Assumes WEAVIATE_ENDPOINT and other vars are set
 * const client = createClientFromEnv();
 *
 * const results = await client.nearVector('Article', {
 *   vector: [0.1, 0.2, 0.3],
 *   limit: 10
 * });
 *
 * await client.close();
 * ```
 */
export function createClientFromEnv(): WeaviateClient {
  // Load config from environment
  const config = loadConfigFromEnv();

  // Validate and create client
  return createClient(config);
}

/**
 * Create a test client with mock configuration
 *
 * Useful for testing and development. Creates a client configured
 * to connect to a local Weaviate instance with sensible defaults.
 *
 * @param mockConfig - Optional partial config to override defaults
 * @returns Weaviate client instance
 *
 * @example
 * ```typescript
 * import { createTestClient } from '@llmdevops/weaviate-integration';
 *
 * // Uses localhost:8080 by default
 * const client = createTestClient();
 *
 * // Or override specific settings
 * const client2 = createTestClient({
 *   endpoint: 'http://localhost:8081',
 *   timeout: 5000
 * });
 * ```
 */
export function createTestClient(mockConfig?: Partial<WeaviateConfig>): WeaviateClient {
  const defaultTestConfig: WeaviateConfig = {
    endpoint: 'http://localhost:8080',
    auth: { type: 'none' },
    timeout: 30000,
    batchSize: 100,
    maxRetries: 3,
    retryBackoff: 1000,
    circuitBreakerThreshold: 5,
    poolSize: 10,
    idleTimeout: 300000,
    schemaCacheTtl: 300000,
  };

  // Merge with mock config
  const config: WeaviateConfig = {
    ...defaultTestConfig,
    ...mockConfig,
  };

  return createClient(config);
}

/**
 * Create a client builder for fluent configuration
 *
 * @returns Client builder instance
 *
 * @example
 * ```typescript
 * import { createClientBuilder } from '@llmdevops/weaviate-integration';
 *
 * const client = createClientBuilder()
 *   .endpoint('http://localhost:8080')
 *   .apiKey('my-secret-key')
 *   .timeout(60000)
 *   .batchSize(200)
 *   .build();
 * ```
 */
export function createClientBuilder(): WeaviateClientBuilder {
  return new WeaviateClientBuilder();
}

/**
 * Fluent builder for creating Weaviate clients
 */
export class WeaviateClientBuilder {
  private config: Partial<WeaviateConfig> = {};

  /**
   * Set endpoint URL
   */
  endpoint(url: string): this {
    this.config.endpoint = url;
    return this;
  }

  /**
   * Set gRPC endpoint
   */
  grpcEndpoint(url: string): this {
    this.config.grpcEndpoint = url;
    return this;
  }

  /**
   * Set API key authentication
   */
  apiKey(key: string): this {
    this.config.auth = { type: 'apiKey', apiKey: key };
    return this;
  }

  /**
   * Set OIDC token authentication
   */
  oidcToken(token: string, refreshToken?: string): this {
    this.config.auth = { type: 'oidc', token, refreshToken };
    return this;
  }

  /**
   * Set client credentials authentication
   */
  clientCredentials(clientId: string, clientSecret: string, scopes?: string[]): this {
    this.config.auth = {
      type: 'clientCredentials',
      clientId,
      clientSecret,
      scopes,
    };
    return this;
  }

  /**
   * Set request timeout
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Set batch size
   */
  batchSize(size: number): this {
    this.config.batchSize = size;
    return this;
  }

  /**
   * Set max retries
   */
  maxRetries(retries: number): this {
    this.config.maxRetries = retries;
    return this;
  }

  /**
   * Set retry backoff
   */
  retryBackoff(ms: number): this {
    this.config.retryBackoff = ms;
    return this;
  }

  /**
   * Set circuit breaker threshold
   */
  circuitBreakerThreshold(threshold: number): this {
    this.config.circuitBreakerThreshold = threshold;
    return this;
  }

  /**
   * Set pool size
   */
  poolSize(size: number): this {
    this.config.poolSize = size;
    return this;
  }

  /**
   * Set schema cache TTL
   */
  schemaCacheTtl(ms: number): this {
    this.config.schemaCacheTtl = ms;
    return this;
  }

  /**
   * Set tenant allowlist
   */
  tenantAllowlist(tenants: string[]): this {
    this.config.tenantAllowlist = tenants;
    return this;
  }

  /**
   * Set custom headers
   */
  headers(headers: Record<string, string>): this {
    this.config.headers = headers;
    return this;
  }

  /**
   * Build and return the client
   */
  build(): WeaviateClient {
    if (!this.config.endpoint) {
      throw new Error('Endpoint is required');
    }

    return createClient(this.config as WeaviateConfig);
  }
}
