/**
 * AWS SES Configuration Module
 *
 * Provides configuration types, builders, and utilities for the SES client.
 * Follows the SPARC hexagonal architecture pattern for clean separation of concerns.
 *
 * @module config
 */

import { CredentialProvider } from "../credentials/types";
import { SesError } from "../error";

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
 * Rate limiting configuration.
 *
 * Controls request rate to avoid throttling and stay within AWS limits.
 *
 * @example
 * ```typescript
 * const rateLimit: RateLimitConfig = {
 *   requestsPerSecond: 14,  // AWS SES default
 *   burstSize: 1            // Allow 1 burst request
 * };
 * ```
 */
export interface RateLimitConfig {
  /**
   * Maximum requests per second.
   * AWS SES default is 14 for production, 1 for sandbox.
   */
  requestsPerSecond: number;

  /**
   * Maximum burst size above the rate limit.
   * @default 1
   */
  burstSize: number;
}

/**
 * AWS SES client configuration.
 *
 * Complete configuration for creating and operating an SES client instance.
 * All fields except region and credentialsProvider are optional with sensible defaults.
 *
 * @example
 * ```typescript
 * const config: SesConfig = {
 *   region: 'us-east-1',
 *   credentialsProvider: new StaticCredentialsProvider(credentials),
 *   timeout: 30000,
 *   maxRetries: 3
 * };
 * ```
 */
export interface SesConfig {
  /**
   * AWS region for SES API endpoint (e.g., 'us-east-1', 'eu-west-1').
   */
  region: string;

  /**
   * Custom endpoint URL (for testing or VPC endpoints).
   * If not provided, uses the standard AWS SES endpoint for the region.
   *
   * @example 'https://email.us-east-1.amazonaws.com'
   */
  endpoint?: string;

  /**
   * Credentials provider for AWS authentication.
   * Required for signing requests to AWS SES API.
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
   * Rate limiting configuration.
   * If not provided, no rate limiting is applied (use AWS's default throttling).
   */
  rateLimit?: RateLimitConfig;

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
 * SES configuration builder.
 *
 * Provides a fluent API for constructing SES client configuration.
 * All methods return `this` for chaining.
 *
 * @example
 * ```typescript
 * const config = new SesConfigBuilder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
 *   .timeout(60000)
 *   .maxRetries(5)
 *   .rateLimit({ requestsPerSecond: 10, burstSize: 2 })
 *   .build();
 * ```
 */
export class SesConfigBuilder {
  private config: Partial<SesConfig> = {};

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
   * Set static credentials using access key and secret key.
   *
   * Creates a StaticCredentialsProvider internally.
   *
   * @param accessKey - AWS access key ID
   * @param secretKey - AWS secret access key
   * @param sessionToken - Optional session token for temporary credentials
   * @returns This builder for chaining
   */
  credentials(accessKey: string, secretKey: string, sessionToken?: string): this {
    // Import at runtime to avoid circular dependency
    const { StaticCredentialProvider } = require("../credentials/static");

    const creds = sessionToken
      ? { accessKeyId: accessKey, secretAccessKey: secretKey, sessionToken }
      : { accessKeyId: accessKey, secretAccessKey: secretKey };

    this.config.credentialsProvider = new StaticCredentialProvider(creds);
    return this;
  }

  /**
   * Set a custom credentials provider.
   *
   * @param provider - Credentials provider implementation
   * @returns This builder for chaining
   *
   * @example
   * builder.credentialsProvider(new ChainCredentialsProvider())
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
   * Set rate limiting configuration.
   *
   * @param config - Rate limit configuration
   * @returns This builder for chaining
   *
   * @example
   * builder.rateLimit({ requestsPerSecond: 14, burstSize: 1 })
   */
  rateLimit(config: RateLimitConfig): this {
    this.config.rateLimit = config;
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
   * - AWS_ENDPOINT_URL_SES or AWS_ENDPOINT_URL: Custom endpoint
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
    const endpoint = process.env.AWS_ENDPOINT_URL_SES ?? process.env.AWS_ENDPOINT_URL;
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
   * @returns Complete SES configuration
   * @throws {SesError} If required fields are missing or invalid
   */
  build(): SesConfig {
    // Validate required fields
    if (!this.config.region) {
      throw new SesError("Region must be specified", "CONFIGURATION", false);
    }

    if (!this.config.credentialsProvider) {
      throw new SesError("Credentials provider must be specified", "CONFIGURATION", false);
    }

    // Validate endpoint if provided
    if (this.config.endpoint) {
      try {
        new URL(this.config.endpoint);
      } catch {
        throw new SesError(
          `Invalid endpoint URL: ${this.config.endpoint}`,
          "CONFIGURATION",
          false
        );
      }
    }

    // Merge with defaults
    const merged: SesConfig = {
      region: this.config.region,
      credentialsProvider: this.config.credentialsProvider,
      endpoint: this.config.endpoint,
      timeout: this.config.timeout ?? DEFAULT_CONFIG.timeout,
      connectTimeout: this.config.connectTimeout ?? DEFAULT_CONFIG.connectTimeout,
      maxRetries: this.config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      retryConfig: this.config.retryConfig ?? DEFAULT_CONFIG.retryConfig,
      rateLimit: this.config.rateLimit,
      userAgent: this.config.userAgent,
    };

    return merged;
  }
}

/**
 * Create a new SES config builder.
 *
 * @returns New configuration builder instance
 */
export function configBuilder(): SesConfigBuilder {
  return new SesConfigBuilder();
}

/**
 * Resolve the SES API endpoint URL for a region.
 *
 * @param config - SES configuration
 * @returns Full endpoint URL
 *
 * @example
 * ```typescript
 * const url = resolveEndpoint({ region: 'us-east-1', ... });
 * // Returns: 'https://email.us-east-1.amazonaws.com'
 * ```
 */
export function resolveEndpoint(config: SesConfig): string {
  // Custom endpoint
  if (config.endpoint) {
    return config.endpoint;
  }

  // Standard SES V2 endpoint
  return `https://email.${config.region}.amazonaws.com`;
}

/**
 * Build the user agent string.
 *
 * @param config - SES configuration
 * @returns User agent string
 *
 * @internal
 */
export function buildUserAgent(config: SesConfig): string {
  const baseAgent = "aws-ses-typescript/1.0.0";
  return config.userAgent ? `${baseAgent} ${config.userAgent}` : baseAgent;
}

/**
 * Validate email address format.
 *
 * @param email - Email address to validate
 * @throws {SesError} If email format is invalid
 */
export function validateEmailAddress(email: string): void {
  if (!email) {
    throw new SesError("Email address cannot be empty", "VALIDATION", false);
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new SesError(`Invalid email address format: ${email}`, "VALIDATION", false);
  }
}

/**
 * Validate domain format.
 *
 * @param domain - Domain name to validate
 * @throws {SesError} If domain format is invalid
 */
export function validateDomain(domain: string): void {
  if (!domain) {
    throw new SesError("Domain cannot be empty", "VALIDATION", false);
  }

  // Basic domain validation
  const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
  if (!domainRegex.test(domain)) {
    throw new SesError(`Invalid domain format: ${domain}`, "VALIDATION", false);
  }
}
