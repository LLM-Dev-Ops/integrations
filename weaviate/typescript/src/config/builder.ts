/**
 * Configuration builder for Weaviate client.
 * @module config/builder
 */

import type { WeaviateConfig } from './types.js';
import { ConsistencyLevel } from './types.js';
import {
  DEFAULT_ENDPOINT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
  DEFAULT_POOL_SIZE,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_SCHEMA_CACHE_TTL_MS,
  DEFAULT_CONSISTENCY_LEVEL,
} from './types.js';
import { validateConfig, ConfigurationError } from './validation.js';

/**
 * Fluent builder for creating WeaviateConfig objects.
 *
 * @example
 * ```typescript
 * const config = new WeaviateConfigBuilder()
 *   .endpoint('http://localhost:8080')
 *   .apiKey('my-secret-key')
 *   .timeout(60000)
 *   .batchSize(200)
 *   .build();
 * ```
 */
export class WeaviateConfigBuilder {
  private config: WeaviateConfig;

  constructor() {
    this.config = {
      endpoint: DEFAULT_ENDPOINT,
      auth: { type: 'none' },
      timeout: DEFAULT_TIMEOUT_MS,
      batchSize: DEFAULT_BATCH_SIZE,
      consistencyLevel: DEFAULT_CONSISTENCY_LEVEL,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryBackoff: DEFAULT_RETRY_BACKOFF_MS,
      circuitBreakerThreshold: DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
      poolSize: DEFAULT_POOL_SIZE,
      idleTimeout: DEFAULT_IDLE_TIMEOUT_MS,
      schemaCacheTtl: DEFAULT_SCHEMA_CACHE_TTL_MS,
    };
  }

  /**
   * Sets the Weaviate instance endpoint URL.
   *
   * @param url - Endpoint URL (e.g., 'http://localhost:8080')
   * @returns This builder instance for chaining
   */
  endpoint(url: string): this {
    this.config.endpoint = url;
    return this;
  }

  /**
   * Sets the gRPC endpoint for high-throughput operations.
   *
   * @param url - gRPC endpoint (e.g., 'localhost:50051')
   * @returns This builder instance for chaining
   */
  grpcEndpoint(url: string): this {
    this.config.grpcEndpoint = url;
    return this;
  }

  /**
   * Sets API key authentication.
   *
   * @param key - API key for authentication
   * @returns This builder instance for chaining
   */
  apiKey(key: string): this {
    this.config.auth = {
      type: 'apiKey',
      apiKey: key,
    };
    return this;
  }

  /**
   * Sets OIDC token authentication.
   *
   * @param token - OIDC token
   * @param refreshToken - Optional refresh token for token renewal
   * @param expiresAt - Optional token expiry timestamp (Unix milliseconds)
   * @returns This builder instance for chaining
   */
  oidcToken(token: string, refreshToken?: string, expiresAt?: number): this {
    this.config.auth = {
      type: 'oidc',
      token,
      refreshToken,
      expiresAt,
    };
    return this;
  }

  /**
   * Sets client credentials authentication.
   *
   * @param clientId - OAuth client ID
   * @param clientSecret - OAuth client secret
   * @param scopes - Optional array of OAuth scopes
   * @param tokenEndpoint - Optional token endpoint URL
   * @returns This builder instance for chaining
   */
  clientCredentials(
    clientId: string,
    clientSecret: string,
    scopes?: string[],
    tokenEndpoint?: string
  ): this {
    this.config.auth = {
      type: 'clientCredentials',
      clientId,
      clientSecret,
      scopes,
      tokenEndpoint,
    };
    return this;
  }

  /**
   * Sets no authentication.
   *
   * @returns This builder instance for chaining
   */
  noAuth(): this {
    this.config.auth = { type: 'none' };
    return this;
  }

  /**
   * Sets the request timeout.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder instance for chaining
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Sets the default batch size for batch operations.
   *
   * @param size - Batch size (number of objects per batch)
   * @returns This builder instance for chaining
   */
  batchSize(size: number): this {
    this.config.batchSize = size;
    return this;
  }

  /**
   * Sets the default consistency level.
   *
   * @param level - Consistency level (ONE, QUORUM, or ALL)
   * @returns This builder instance for chaining
   */
  consistencyLevel(level: ConsistencyLevel): this {
    this.config.consistencyLevel = level;
    return this;
  }

  /**
   * Sets the maximum number of retry attempts.
   *
   * @param retries - Maximum retry attempts
   * @returns This builder instance for chaining
   */
  maxRetries(retries: number): this {
    this.config.maxRetries = retries;
    return this;
  }

  /**
   * Sets the retry backoff delay.
   *
   * @param ms - Base delay in milliseconds before retry
   * @returns This builder instance for chaining
   */
  retryBackoff(ms: number): this {
    this.config.retryBackoff = ms;
    return this;
  }

  /**
   * Sets the circuit breaker failure threshold.
   *
   * @param threshold - Number of failures before circuit opens
   * @returns This builder instance for chaining
   */
  circuitBreakerThreshold(threshold: number): this {
    this.config.circuitBreakerThreshold = threshold;
    return this;
  }

  /**
   * Sets the gRPC connection pool size.
   *
   * @param size - Number of connections in pool
   * @returns This builder instance for chaining
   */
  poolSize(size: number): this {
    this.config.poolSize = size;
    return this;
  }

  /**
   * Sets the idle timeout for pooled connections.
   *
   * @param ms - Idle timeout in milliseconds
   * @returns This builder instance for chaining
   */
  idleTimeout(ms: number): this {
    this.config.idleTimeout = ms;
    return this;
  }

  /**
   * Sets the schema cache TTL.
   *
   * @param ms - Cache TTL in milliseconds (0 to disable caching)
   * @returns This builder instance for chaining
   */
  schemaCacheTtl(ms: number): this {
    this.config.schemaCacheTtl = ms;
    return this;
  }

  /**
   * Sets the tenant allowlist for multi-tenancy.
   *
   * @param tenants - Array of allowed tenant names
   * @returns This builder instance for chaining
   */
  tenantAllowlist(tenants: string[]): this {
    this.config.tenantAllowlist = tenants;
    return this;
  }

  /**
   * Adds a custom header to all requests.
   *
   * @param key - Header name
   * @param value - Header value
   * @returns This builder instance for chaining
   */
  header(key: string, value: string): this {
    if (!this.config.headers) {
      this.config.headers = {};
    }
    this.config.headers[key] = value;
    return this;
  }

  /**
   * Sets multiple custom headers.
   *
   * @param headers - Object containing header key-value pairs
   * @returns This builder instance for chaining
   */
  headers(headers: Record<string, string>): this {
    this.config.headers = { ...this.config.headers, ...headers };
    return this;
  }

  /**
   * Builds and validates the configuration.
   *
   * @returns Validated WeaviateConfig object
   * @throws {ConfigurationError} If the configuration is invalid
   */
  build(): WeaviateConfig {
    validateConfig(this.config);
    return { ...this.config };
  }

  /**
   * Creates a builder from an existing configuration.
   *
   * @param config - Existing configuration to copy
   * @returns New builder instance with copied configuration
   */
  static from(config: WeaviateConfig): WeaviateConfigBuilder {
    const builder = new WeaviateConfigBuilder();
    builder.config = { ...config };
    return builder;
  }

  /**
   * Resets the builder to default values.
   *
   * @returns This builder instance for chaining
   */
  reset(): this {
    this.config = {
      endpoint: DEFAULT_ENDPOINT,
      auth: { type: 'none' },
      timeout: DEFAULT_TIMEOUT_MS,
      batchSize: DEFAULT_BATCH_SIZE,
      consistencyLevel: DEFAULT_CONSISTENCY_LEVEL,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryBackoff: DEFAULT_RETRY_BACKOFF_MS,
      circuitBreakerThreshold: DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
      poolSize: DEFAULT_POOL_SIZE,
      idleTimeout: DEFAULT_IDLE_TIMEOUT_MS,
      schemaCacheTtl: DEFAULT_SCHEMA_CACHE_TTL_MS,
    };
    return this;
  }
}
