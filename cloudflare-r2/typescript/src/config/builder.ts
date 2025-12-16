/**
 * Fluent configuration builder for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/config/builder
 */

import type {
  R2FullConfig,
  R2RetryConfig,
  R2CircuitBreakerConfig,
  R2SimulationConfig,
  NormalizedR2Config,
} from './types.js';
import { normalizeConfig } from './validation.js';

/**
 * Fluent builder for constructing R2 configuration.
 */
export class R2ConfigBuilder {
  private config: Partial<R2FullConfig> = {};

  /**
   * Sets the Cloudflare account ID.
   *
   * @param id - Cloudflare account ID
   * @returns This builder instance
   */
  accountId(id: string): this {
    this.config.accountId = id;
    return this;
  }

  /**
   * Sets the R2 access credentials.
   *
   * @param accessKeyId - R2 access key ID
   * @param secretAccessKey - R2 secret access key
   * @returns This builder instance
   */
  credentials(accessKeyId: string, secretAccessKey: string): this {
    this.config.accessKeyId = accessKeyId;
    this.config.secretAccessKey = secretAccessKey;
    return this;
  }

  /**
   * Sets a custom endpoint URL.
   *
   * @param url - Custom endpoint URL
   * @returns This builder instance
   */
  endpoint(url: string): this {
    this.config.endpoint = url;
    return this;
  }

  /**
   * Sets the request timeout in milliseconds.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder instance
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Sets the multipart upload threshold in bytes.
   *
   * @param bytes - Threshold in bytes
   * @returns This builder instance
   */
  multipartThreshold(bytes: number): this {
    this.config.multipartThreshold = bytes;
    return this;
  }

  /**
   * Sets the multipart part size in bytes.
   *
   * @param bytes - Part size in bytes
   * @returns This builder instance
   */
  multipartPartSize(bytes: number): this {
    this.config.multipartPartSize = bytes;
    return this;
  }

  /**
   * Sets the number of concurrent multipart uploads.
   *
   * @param n - Number of concurrent uploads
   * @returns This builder instance
   */
  multipartConcurrency(n: number): this {
    this.config.multipartConcurrency = n;
    return this;
  }

  /**
   * Sets the retry configuration.
   *
   * @param config - Partial or full retry configuration
   * @returns This builder instance
   */
  retry(config: Partial<R2RetryConfig>): this {
    this.config.retry = {
      ...this.config.retry,
      ...config,
    } as R2RetryConfig;
    return this;
  }

  /**
   * Sets the circuit breaker configuration.
   *
   * @param config - Partial or full circuit breaker configuration
   * @returns This builder instance
   */
  circuitBreaker(config: Partial<R2CircuitBreakerConfig>): this {
    this.config.circuitBreaker = {
      ...this.config.circuitBreaker,
      ...config,
    } as R2CircuitBreakerConfig;
    return this;
  }

  /**
   * Sets the simulation configuration.
   *
   * @param config - Simulation configuration
   * @returns This builder instance
   */
  simulation(config: R2SimulationConfig): this {
    this.config.simulation = config;
    return this;
  }

  /**
   * Builds and validates the configuration.
   *
   * @returns Normalized R2 configuration
   * @throws {ConfigError} If configuration is invalid
   */
  build(): NormalizedR2Config {
    // normalizeConfig will validate and apply defaults
    return normalizeConfig(this.config as any);
  }
}
