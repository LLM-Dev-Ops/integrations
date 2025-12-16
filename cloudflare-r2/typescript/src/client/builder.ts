/**
 * Fluent builder for R2 client construction
 * Based on SPARC specification pattern
 * @module @studiorack/cloudflare-r2/client
 */

import type { R2Client } from './interface.js';
import { R2ClientImpl } from './client.js';
import type {
  R2Config,
  R2RetryConfig,
  R2CircuitBreakerConfig,
  R2SimulationConfig,
} from '../config/index.js';
import { normalizeConfig } from '../config/index.js';
import { R2Signer } from '../signing/index.js';
import {
  createFetchTransport,
  createResilientTransport,
} from '../transport/index.js';

/**
 * Fluent builder for creating R2 clients
 *
 * Provides a chainable API for configuring and building R2 clients.
 * The builder validates configuration and constructs all necessary
 * dependencies (transport, signer) before creating the client.
 *
 * @example
 * ```typescript
 * const client = new R2ClientBuilder()
 *   .accountId('my-account')
 *   .credentials('my-key', 'my-secret')
 *   .timeout(60000)
 *   .retry({ maxRetries: 5 })
 *   .build();
 * ```
 */
export class R2ClientBuilder {
  /**
   * Core configuration parameters
   */
  private config: Partial<R2Config> = {};

  /**
   * Retry configuration
   */
  private retryConfig?: Partial<R2RetryConfig>;

  /**
   * Circuit breaker configuration
   */
  private circuitBreakerConfig?: Partial<R2CircuitBreakerConfig>;

  /**
   * Simulation configuration
   */
  private simulationConfig?: R2SimulationConfig;

  /**
   * Sets the Cloudflare account ID
   *
   * @param id - Cloudflare account ID
   * @returns This builder for chaining
   */
  accountId(id: string): this {
    this.config.accountId = id;
    return this;
  }

  /**
   * Sets the R2 access credentials
   *
   * @param accessKeyId - R2 access key ID
   * @param secretAccessKey - R2 secret access key
   * @returns This builder for chaining
   */
  credentials(accessKeyId: string, secretAccessKey: string): this {
    this.config.accessKeyId = accessKeyId;
    this.config.secretAccessKey = secretAccessKey;
    return this;
  }

  /**
   * Sets a custom endpoint URL
   *
   * By default, the endpoint is constructed from the account ID.
   * Use this to override with a custom endpoint.
   *
   * @param url - Custom endpoint URL
   * @returns This builder for chaining
   */
  endpoint(url: string): this {
    this.config.endpoint = url;
    return this;
  }

  /**
   * Sets the request timeout in milliseconds
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Sets the multipart upload threshold
   *
   * Objects larger than this size will use multipart upload.
   *
   * @param bytes - Threshold in bytes (minimum 5MB)
   * @returns This builder for chaining
   */
  multipartThreshold(bytes: number): this {
    this.config.multipartThreshold = bytes;
    return this;
  }

  /**
   * Sets the multipart upload part size
   *
   * @param bytes - Part size in bytes (5MB - 5GB)
   * @returns This builder for chaining
   */
  multipartPartSize(bytes: number): this {
    this.config.multipartPartSize = bytes;
    return this;
  }

  /**
   * Sets the multipart upload concurrency
   *
   * @param n - Number of concurrent part uploads (1-100)
   * @returns This builder for chaining
   */
  multipartConcurrency(n: number): this {
    this.config.multipartConcurrency = n;
    return this;
  }

  /**
   * Sets retry configuration
   *
   * @param config - Partial retry configuration (merged with defaults)
   * @returns This builder for chaining
   */
  retry(config: Partial<R2RetryConfig>): this {
    this.retryConfig = { ...this.retryConfig, ...config };
    return this;
  }

  /**
   * Sets circuit breaker configuration
   *
   * @param config - Partial circuit breaker configuration (merged with defaults)
   * @returns This builder for chaining
   */
  circuitBreaker(config: Partial<R2CircuitBreakerConfig>): this {
    this.circuitBreakerConfig = { ...this.circuitBreakerConfig, ...config };
    return this;
  }

  /**
   * Sets simulation configuration
   *
   * @param config - Simulation configuration
   * @returns This builder for chaining
   */
  simulation(config: R2SimulationConfig): this {
    this.simulationConfig = config;
    return this;
  }

  /**
   * Builds the R2 client
   *
   * Validates configuration, normalizes it with defaults, and constructs
   * the client with all necessary dependencies.
   *
   * @returns Configured R2 client
   * @throws {ConfigError} If configuration is invalid
   */
  build(): R2Client {
    // Build full config with retry/circuit breaker settings
    const fullConfig = {
      ...this.config,
      ...(this.retryConfig && { retry: this.retryConfig }),
      ...(this.circuitBreakerConfig && {
        circuitBreaker: this.circuitBreakerConfig,
      }),
      ...(this.simulationConfig && { simulation: this.simulationConfig }),
    };

    // Normalize and validate config
    const normalizedConfig = normalizeConfig(fullConfig as R2Config);

    // Create HTTP transport
    // Start with basic fetch transport
    const fetchTransport = createFetchTransport(normalizedConfig.timeout);

    // Wrap with resilient transport for retry and circuit breaker
    const transport = createResilientTransport(
      fetchTransport,
      normalizedConfig.retry,
      normalizedConfig.circuitBreaker
    );

    // Create signer
    const signer = new R2Signer({
      accessKeyId: normalizedConfig.accessKeyId,
      secretAccessKey: normalizedConfig.secretAccessKey,
      region: 'auto', // R2 is always "auto"
      service: 's3',
    });

    // Create and return client
    return new R2ClientImpl(normalizedConfig, transport, signer);
  }

  /**
   * Resets the builder to default state
   *
   * @returns This builder for chaining
   */
  reset(): this {
    this.config = {};
    this.retryConfig = undefined;
    this.circuitBreakerConfig = undefined;
    this.simulationConfig = undefined;
    return this;
  }
}
