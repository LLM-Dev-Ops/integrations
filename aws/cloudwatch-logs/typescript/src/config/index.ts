/**
 * AWS CloudWatch Logs Configuration Module
 *
 * Provides configuration types, builders, and utilities for the CloudWatch Logs client.
 * Follows the SPARC hexagonal architecture pattern for clean separation of concerns.
 *
 * @module config
 */

import { CredentialProvider } from "../credentials/types";
import { CloudWatchLogsError } from "../error";

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
 *   requestsPerSecond: 5,  // CloudWatch Logs default
 *   burstSize: 1           // Allow 1 burst request
 * };
 * ```
 */
export interface RateLimitConfig {
  /**
   * Maximum requests per second.
   * CloudWatch Logs has various limits depending on the operation.
   */
  requestsPerSecond: number;

  /**
   * Maximum burst size above the rate limit.
   * @default 1
   */
  burstSize: number;
}

/**
 * Batch configuration for log event emission.
 *
 * Controls how log events are batched before being sent to CloudWatch Logs.
 * CloudWatch Logs has specific limits: max 10,000 events per batch, max 1MB per batch.
 *
 * @example
 * ```typescript
 * const batchConfig: BatchConfig = {
 *   maxEvents: 10000,
 *   maxBytes: 1048576,
 *   flushIntervalMs: 5000
 * };
 * ```
 */
export interface BatchConfig {
  /**
   * Maximum number of events per batch.
   * CloudWatch Logs limit is 10,000 events per PutLogEvents request.
   *
   * @default 10000
   */
  maxEvents?: number;

  /**
   * Maximum batch size in bytes.
   * CloudWatch Logs limit is 1,048,576 bytes (1 MB) per PutLogEvents request.
   *
   * @default 1048576 (1 MB)
   */
  maxBytes?: number;

  /**
   * Flush interval in milliseconds.
   * How long to wait before automatically flushing the batch.
   *
   * @default 5000 (5 seconds)
   */
  flushIntervalMs?: number;
}

/**
 * AWS CloudWatch Logs client configuration.
 *
 * Complete configuration for creating and operating a CloudWatch Logs client instance.
 * All fields except region and credentialsProvider are optional with sensible defaults.
 *
 * @example
 * ```typescript
 * const config: CloudWatchLogsConfig = {
 *   region: 'us-east-1',
 *   credentialsProvider: new StaticCredentialsProvider(credentials),
 *   timeout: 30000,
 *   maxRetries: 3,
 *   defaultLogGroup: '/aws/lambda/my-function'
 * };
 * ```
 */
export interface CloudWatchLogsConfig {
  /**
   * AWS region for CloudWatch Logs API endpoint (e.g., 'us-east-1', 'eu-west-1').
   */
  region: string;

  /**
   * Custom endpoint URL (for testing or VPC endpoints).
   * If not provided, uses the standard AWS CloudWatch Logs endpoint for the region.
   *
   * @example 'https://logs.us-east-1.amazonaws.com'
   */
  endpoint?: string;

  /**
   * Credentials provider for AWS authentication.
   * Required for signing requests to AWS CloudWatch Logs API.
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

  /**
   * Batch configuration for PutLogEvents operations.
   * Controls event batching behavior to optimize throughput and respect AWS limits.
   */
  batchConfig?: BatchConfig;

  /**
   * Default log group name to use when not explicitly specified.
   * Useful for applications that primarily log to a single log group.
   *
   * @example '/aws/lambda/my-function'
   */
  defaultLogGroup?: string;

  /**
   * Default log stream name to use when not explicitly specified.
   * Useful for applications that primarily log to a single log stream.
   *
   * @example 'production/web-server-1'
   */
  defaultLogStream?: string;
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
  batchConfig: {
    maxEvents: 10000,
    maxBytes: 1048576, // 1 MB
    flushIntervalMs: 5000, // 5 seconds
  } as BatchConfig,
};

/**
 * CloudWatch Logs configuration builder.
 *
 * Provides a fluent API for constructing CloudWatch Logs client configuration.
 * All methods return `this` for chaining.
 *
 * @example
 * ```typescript
 * const config = new CloudWatchLogsConfigBuilder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
 *   .timeout(60000)
 *   .maxRetries(5)
 *   .defaultLogGroup('/aws/lambda/my-function')
 *   .batchConfig({ maxEvents: 5000, flushIntervalMs: 3000 })
 *   .build();
 * ```
 */
export class CloudWatchLogsConfigBuilder {
  private config: Partial<CloudWatchLogsConfig> = {};

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
   * builder.rateLimit({ requestsPerSecond: 5, burstSize: 1 })
   */
  rateLimit(config: RateLimitConfig): this {
    this.config.rateLimit = config;
    return this;
  }

  /**
   * Set batch configuration for log event emission.
   *
   * @param config - Batch configuration
   * @returns This builder for chaining
   *
   * @example
   * builder.batchConfig({ maxEvents: 5000, maxBytes: 524288, flushIntervalMs: 3000 })
   */
  batchConfig(config: BatchConfig): this {
    this.config.batchConfig = config;
    return this;
  }

  /**
   * Set default log group name.
   *
   * @param name - Log group name
   * @returns This builder for chaining
   *
   * @example
   * builder.defaultLogGroup('/aws/lambda/my-function')
   */
  defaultLogGroup(name: string): this {
    validateLogGroupName(name);
    this.config.defaultLogGroup = name;
    return this;
  }

  /**
   * Set default log stream name.
   *
   * @param name - Log stream name
   * @returns This builder for chaining
   *
   * @example
   * builder.defaultLogStream('production/web-server-1')
   */
  defaultLogStream(name: string): this {
    validateLogStreamName(name);
    this.config.defaultLogStream = name;
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
   * - AWS_ENDPOINT_URL_LOGS or AWS_ENDPOINT_URL: Custom endpoint
   * - AWS_USER_AGENT: Custom user agent
   * - CLOUDWATCH_LOGS_DEFAULT_GROUP: Default log group
   * - CLOUDWATCH_LOGS_DEFAULT_STREAM: Default log stream
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
    const endpoint = process.env.AWS_ENDPOINT_URL_LOGS ?? process.env.AWS_ENDPOINT_URL;
    if (endpoint) {
      this.config.endpoint = endpoint;
    }

    // User agent
    const userAgent = process.env.AWS_USER_AGENT;
    if (userAgent) {
      this.config.userAgent = userAgent;
    }

    // Default log group
    const defaultLogGroup = process.env.CLOUDWATCH_LOGS_DEFAULT_GROUP;
    if (defaultLogGroup) {
      this.config.defaultLogGroup = defaultLogGroup;
    }

    // Default log stream
    const defaultLogStream = process.env.CLOUDWATCH_LOGS_DEFAULT_STREAM;
    if (defaultLogStream) {
      this.config.defaultLogStream = defaultLogStream;
    }

    return this;
  }

  /**
   * Build the configuration.
   *
   * Validates required fields and applies defaults.
   *
   * @returns Complete CloudWatch Logs configuration
   * @throws {CloudWatchLogsError} If required fields are missing or invalid
   */
  build(): CloudWatchLogsConfig {
    // Validate required fields
    if (!this.config.region) {
      throw new CloudWatchLogsError("Region must be specified", "CONFIGURATION", false);
    }

    if (!this.config.credentialsProvider) {
      throw new CloudWatchLogsError(
        "Credentials provider must be specified",
        "CONFIGURATION",
        false
      );
    }

    // Validate endpoint if provided
    if (this.config.endpoint) {
      try {
        new URL(this.config.endpoint);
      } catch {
        throw new CloudWatchLogsError(
          `Invalid endpoint URL: ${this.config.endpoint}`,
          "CONFIGURATION",
          false
        );
      }
    }

    // Validate default log group if provided
    if (this.config.defaultLogGroup) {
      validateLogGroupName(this.config.defaultLogGroup);
    }

    // Validate default log stream if provided
    if (this.config.defaultLogStream) {
      validateLogStreamName(this.config.defaultLogStream);
    }

    // Merge with defaults
    const merged: CloudWatchLogsConfig = {
      region: this.config.region,
      credentialsProvider: this.config.credentialsProvider,
      endpoint: this.config.endpoint,
      timeout: this.config.timeout ?? DEFAULT_CONFIG.timeout,
      connectTimeout: this.config.connectTimeout ?? DEFAULT_CONFIG.connectTimeout,
      maxRetries: this.config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      retryConfig: this.config.retryConfig ?? DEFAULT_CONFIG.retryConfig,
      rateLimit: this.config.rateLimit,
      userAgent: this.config.userAgent,
      batchConfig: this.config.batchConfig
        ? { ...DEFAULT_CONFIG.batchConfig, ...this.config.batchConfig }
        : DEFAULT_CONFIG.batchConfig,
      defaultLogGroup: this.config.defaultLogGroup,
      defaultLogStream: this.config.defaultLogStream,
    };

    return merged;
  }
}

/**
 * Create a new CloudWatch Logs config builder.
 *
 * @returns New configuration builder instance
 */
export function configBuilder(): CloudWatchLogsConfigBuilder {
  return new CloudWatchLogsConfigBuilder();
}

/**
 * Resolve the CloudWatch Logs API endpoint URL for a region.
 *
 * @param config - CloudWatch Logs configuration
 * @returns Full endpoint URL
 *
 * @example
 * ```typescript
 * const url = resolveEndpoint({ region: 'us-east-1', ... });
 * // Returns: 'https://logs.us-east-1.amazonaws.com'
 * ```
 */
export function resolveEndpoint(config: CloudWatchLogsConfig): string {
  // Custom endpoint
  if (config.endpoint) {
    return config.endpoint;
  }

  // Standard CloudWatch Logs endpoint
  return `https://logs.${config.region}.amazonaws.com`;
}

/**
 * Build the user agent string.
 *
 * @param config - CloudWatch Logs configuration
 * @returns User agent string
 *
 * @internal
 */
export function buildUserAgent(config: CloudWatchLogsConfig): string {
  const baseAgent = "aws-cloudwatch-logs-typescript/1.0.0";
  return config.userAgent ? `${baseAgent} ${config.userAgent}` : baseAgent;
}

/**
 * Validate log group name format.
 *
 * CloudWatch Logs log group names must:
 * - Be between 1 and 512 characters
 * - Contain only alphanumeric, hyphens, underscores, forward slashes, and periods
 * - Not start with aws/ (reserved for AWS services)
 *
 * @param name - Log group name to validate
 * @throws {CloudWatchLogsError} If log group name format is invalid
 */
export function validateLogGroupName(name: string): void {
  if (!name) {
    throw new CloudWatchLogsError("Log group name cannot be empty", "VALIDATION", false);
  }

  if (name.length > 512) {
    throw new CloudWatchLogsError(
      `Log group name too long (max 512 characters): ${name}`,
      "VALIDATION",
      false
    );
  }

  // Valid characters: alphanumeric, hyphens, underscores, forward slashes, periods
  const validPattern = /^[a-zA-Z0-9._/-]+$/;
  if (!validPattern.test(name)) {
    throw new CloudWatchLogsError(
      `Invalid log group name format: ${name}. Must contain only alphanumeric, hyphens, underscores, forward slashes, and periods`,
      "VALIDATION",
      false
    );
  }

  // Cannot start with aws/ (reserved for AWS services)
  if (name.startsWith("aws/") && !name.startsWith("aws/lambda/")) {
    throw new CloudWatchLogsError(
      `Log group name cannot start with 'aws/' (reserved): ${name}`,
      "VALIDATION",
      false
    );
  }
}

/**
 * Validate log stream name format.
 *
 * CloudWatch Logs log stream names must:
 * - Be between 1 and 512 characters
 * - Contain only alphanumeric, hyphens, underscores, forward slashes, and periods
 * - Cannot contain colons (:)
 *
 * @param name - Log stream name to validate
 * @throws {CloudWatchLogsError} If log stream name format is invalid
 */
export function validateLogStreamName(name: string): void {
  if (!name) {
    throw new CloudWatchLogsError("Log stream name cannot be empty", "VALIDATION", false);
  }

  if (name.length > 512) {
    throw new CloudWatchLogsError(
      `Log stream name too long (max 512 characters): ${name}`,
      "VALIDATION",
      false
    );
  }

  // Valid characters: alphanumeric, hyphens, underscores, forward slashes, periods
  // Cannot contain colons
  const validPattern = /^[a-zA-Z0-9._/-]+$/;
  if (!validPattern.test(name)) {
    throw new CloudWatchLogsError(
      `Invalid log stream name format: ${name}. Must contain only alphanumeric, hyphens, underscores, forward slashes, and periods`,
      "VALIDATION",
      false
    );
  }

  if (name.includes(":")) {
    throw new CloudWatchLogsError(
      `Log stream name cannot contain colons: ${name}`,
      "VALIDATION",
      false
    );
  }
}
