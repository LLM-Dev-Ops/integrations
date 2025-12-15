/**
 * AWS Secrets Manager Configuration Module
 *
 * Provides configuration types, builders, and utilities for the Secrets Manager client.
 * Follows the SPARC hexagonal architecture pattern for clean separation of concerns.
 *
 * @module config
 */

import type { CredentialProvider } from '../types/index.js';
import { SecretsManagerError } from '../error/index.js';

/**
 * Retry configuration for failed requests.
 *
 * Controls exponential backoff behavior when retrying failed API calls.
 *
 * @example
 * ```typescript
 * const retryConfig: RetryConfig = {
 *   maxAttempts: 5,
 *   initialBackoff: 100,
 *   maxBackoff: 20000,
 *   backoffMultiplier: 2,
 *   jitter: true
 * };
 * ```
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts (including initial request).
   * @default 3
   */
  maxAttempts: number;

  /**
   * Initial backoff delay in milliseconds.
   * @default 100
   */
  initialBackoff: number;

  /**
   * Maximum backoff delay in milliseconds.
   * @default 20000 (20 seconds)
   */
  maxBackoff: number;

  /**
   * Multiplier for exponential backoff.
   * @default 2
   */
  backoffMultiplier: number;

  /**
   * Whether to add random jitter to backoff delays.
   * Helps prevent thundering herd problem.
   * @default true
   */
  jitter: boolean;
}

/**
 * AWS Secrets Manager client configuration.
 *
 * Complete configuration for creating and operating a Secrets Manager client instance.
 *
 * @example
 * ```typescript
 * const config: SecretsManagerConfig = {
 *   region: 'us-east-1',
 *   credentialsProvider: new StaticCredentialsProvider(credentials),
 *   timeout: 30000,
 *   maxRetries: 3
 * };
 * ```
 */
export interface SecretsManagerConfig {
  /**
   * AWS region for Secrets Manager API endpoint (e.g., 'us-east-1', 'eu-west-1').
   */
  region: string;

  /**
   * Custom endpoint URL (for testing with LocalStack or VPC endpoints).
   * If not provided, uses the standard AWS Secrets Manager endpoint for the region.
   *
   * @example 'https://secretsmanager.us-east-1.amazonaws.com'
   */
  endpoint?: string;

  /**
   * Credentials provider for AWS authentication.
   * Required for signing requests to AWS Secrets Manager API.
   */
  credentialsProvider: CredentialProvider;

  /**
   * Total request timeout in milliseconds.
   * Includes connection time, request/response transfer, and processing.
   *
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Connection establishment timeout in milliseconds.
   *
   * @default 10000 (10 seconds)
   */
  connectTimeout?: number;

  /**
   * Maximum number of retry attempts for failed requests.
   * Set to 0 to disable retries.
   *
   * @default 3
   */
  maxRetries?: number;

  /**
   * Advanced retry configuration.
   * If not provided, uses sensible defaults based on maxRetries.
   */
  retryConfig?: RetryConfig;

  /**
   * Custom user agent suffix to append to requests.
   * Useful for tracking usage from specific applications.
   *
   * @example 'my-app/1.0.0'
   */
  userAgent?: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  timeout: 30000,
  connectTimeout: 10000,
  maxRetries: 3,
  retryConfig: {
    maxAttempts: 3,
    initialBackoff: 100,
    maxBackoff: 20000,
    backoffMultiplier: 2,
    jitter: true,
  } as RetryConfig,
};

/**
 * Secrets Manager configuration builder.
 *
 * Provides a fluent API for constructing Secrets Manager client configuration.
 * All methods return `this` for chaining.
 *
 * @example
 * ```typescript
 * const config = new SecretsManagerConfigBuilder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
 *   .timeout(60000)
 *   .maxRetries(5)
 *   .build();
 * ```
 */
export class SecretsManagerConfigBuilder {
  private config: Partial<SecretsManagerConfig> = {};

  /**
   * Set the AWS region.
   *
   * @param region - AWS region code (e.g., 'us-east-1', 'eu-west-1')
   * @returns This builder for chaining
   */
  region(region: string): this {
    this.config.region = region;
    return this;
  }

  /**
   * Set a custom endpoint URL.
   *
   * Useful for testing with LocalStack or using VPC endpoints.
   *
   * @param endpoint - Full endpoint URL
   * @returns This builder for chaining
   *
   * @example
   * builder.endpoint('http://localhost:4566')  // LocalStack
   */
  endpoint(endpoint: string): this {
    this.config.endpoint = endpoint;
    return this;
  }

  /**
   * Set a custom credentials provider.
   *
   * @param provider - Credentials provider implementation
   * @returns This builder for chaining
   */
  credentialsProvider(provider: CredentialProvider): this {
    this.config.credentialsProvider = provider;
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   *
   * @param ms - Timeout duration in milliseconds
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Set connection timeout in milliseconds.
   *
   * @param ms - Connection timeout in milliseconds
   * @returns This builder for chaining
   */
  connectTimeout(ms: number): this {
    this.config.connectTimeout = ms;
    return this;
  }

  /**
   * Set maximum number of retry attempts.
   *
   * @param n - Maximum retry attempts (0 to disable retries)
   * @returns This builder for chaining
   */
  maxRetries(n: number): this {
    this.config.maxRetries = n;
    return this;
  }

  /**
   * Set advanced retry configuration.
   *
   * @param config - Retry configuration
   * @returns This builder for chaining
   */
  retryConfig(config: RetryConfig): this {
    this.config.retryConfig = config;
    return this;
  }

  /**
   * Set custom user agent suffix.
   *
   * @param userAgent - User agent string to append
   * @returns This builder for chaining
   */
  userAgent(userAgent: string): this {
    this.config.userAgent = userAgent;
    return this;
  }

  /**
   * Load configuration from environment variables.
   *
   * Reads the following environment variables:
   * - AWS_REGION or AWS_DEFAULT_REGION: Region
   * - AWS_ENDPOINT_URL_SECRETSMANAGER or AWS_ENDPOINT_URL: Custom endpoint
   *
   * @returns This builder for chaining
   */
  fromEnv(): this {
    // Region
    const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
    if (region) {
      this.config.region = region;
    }

    // Endpoint
    const endpoint = process.env.AWS_ENDPOINT_URL_SECRETSMANAGER ?? process.env.AWS_ENDPOINT_URL;
    if (endpoint) {
      this.config.endpoint = endpoint;
    }

    // User agent
    const userAgent = process.env.AWS_USER_AGENT;
    if (userAgent) {
      this.config.userAgent = userAgent;
    }

    return this;
  }

  /**
   * Build the configuration.
   *
   * Validates required fields and applies defaults.
   *
   * @returns Complete Secrets Manager configuration
   * @throws {SecretsManagerError} If required fields are missing or invalid
   */
  build(): SecretsManagerConfig {
    // Validate required fields
    if (!this.config.region) {
      throw new SecretsManagerError('Region must be specified', 'CONFIGURATION', false);
    }

    if (!this.config.credentialsProvider) {
      throw new SecretsManagerError('Credentials provider must be specified', 'CONFIGURATION', false);
    }

    // Validate endpoint if provided
    if (this.config.endpoint) {
      try {
        new URL(this.config.endpoint);
      } catch {
        throw new SecretsManagerError(
          `Invalid endpoint URL: ${this.config.endpoint}`,
          'CONFIGURATION',
          false
        );
      }
    }

    // Merge with defaults
    const merged: SecretsManagerConfig = {
      region: this.config.region,
      credentialsProvider: this.config.credentialsProvider,
      endpoint: this.config.endpoint,
      timeout: this.config.timeout ?? DEFAULT_CONFIG.timeout,
      connectTimeout: this.config.connectTimeout ?? DEFAULT_CONFIG.connectTimeout,
      maxRetries: this.config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      retryConfig: this.config.retryConfig ?? DEFAULT_CONFIG.retryConfig,
      userAgent: this.config.userAgent,
    };

    return merged;
  }
}

/**
 * Create a new Secrets Manager config builder.
 *
 * @returns New configuration builder instance
 */
export function configBuilder(): SecretsManagerConfigBuilder {
  return new SecretsManagerConfigBuilder();
}

/**
 * Resolve the Secrets Manager API endpoint URL for a region.
 *
 * @param config - Secrets Manager configuration
 * @returns Full endpoint URL
 *
 * @example
 * ```typescript
 * const url = resolveEndpoint({ region: 'us-east-1', ... });
 * // Returns: 'https://secretsmanager.us-east-1.amazonaws.com'
 * ```
 */
export function resolveEndpoint(config: SecretsManagerConfig): string {
  // Custom endpoint
  if (config.endpoint) {
    return config.endpoint;
  }

  // Standard Secrets Manager endpoint
  return `https://secretsmanager.${config.region}.amazonaws.com`;
}

/**
 * Build the user agent string.
 *
 * @param config - Secrets Manager configuration
 * @returns User agent string
 *
 * @internal
 */
export function buildUserAgent(config: SecretsManagerConfig): string {
  const baseAgent = 'aws-secretsmanager-typescript/1.0.0';
  return config.userAgent ? `${baseAgent} ${config.userAgent}` : baseAgent;
}
