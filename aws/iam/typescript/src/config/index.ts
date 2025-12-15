/**
 * AWS IAM Configuration Module
 *
 * Provides configuration types, builders, and utilities for the IAM/STS client.
 * Follows the SPARC hexagonal architecture pattern for clean separation of concerns.
 *
 * @module config
 */

import type { CredentialProvider } from "../credentials/types.js";
import { IamError } from "../error/index.js";

/**
 * Session tag for role assumption.
 *
 * Tags are used for audit trails and can be propagated through role chains.
 *
 * @example
 * ```typescript
 * const tag: SessionTag = {
 *   key: 'Department',
 *   value: 'Engineering'
 * };
 * ```
 */
export interface SessionTag {
  /**
   * Tag key (1-128 characters).
   */
  key: string;

  /**
   * Tag value (0-256 characters).
   */
  value: string;
}

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
 * Circuit breaker configuration.
 *
 * Controls when to fail fast and prevent cascading failures.
 *
 * @example
 * ```typescript
 * const circuitBreakerConfig: CircuitBreakerConfig = {
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   resetTimeout: 30000
 * };
 * ```
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening the circuit.
   * @default 5
   */
  failureThreshold: number;

  /**
   * Number of consecutive successes to close the circuit.
   * @default 2
   */
  successThreshold: number;

  /**
   * Time in milliseconds before attempting to close the circuit.
   * @default 30000 (30 seconds)
   */
  resetTimeout: number;
}

/**
 * Credential cache configuration.
 *
 * Controls how assumed role credentials are cached and refreshed.
 *
 * @example
 * ```typescript
 * const cacheConfig: CacheConfig = {
 *   refreshBuffer: 300000,  // 5 minutes
 *   maxEntries: 100,
 *   asyncRefresh: true
 * };
 * ```
 */
export interface CacheConfig {
  /**
   * Refresh credentials this many milliseconds before expiry.
   * @default 300000 (5 minutes)
   */
  refreshBuffer?: number;

  /**
   * Maximum number of cached credential entries.
   * @default 100
   */
  maxEntries?: number;

  /**
   * Enable async refresh of credentials.
   * When true, stale credentials can be returned while refresh happens in background.
   * @default true
   */
  asyncRefresh?: boolean;
}

/**
 * Cross-account role configuration.
 *
 * Configuration for assuming roles in other AWS accounts.
 *
 * @example
 * ```typescript
 * const roleConfig: CrossAccountRoleConfig = {
 *   accountId: '123456789012',
 *   roleName: 'CrossAccountRole',
 *   externalId: 'unique-external-id',
 *   sessionNamePrefix: 'app-session',
 *   duration: 3600
 * };
 * ```
 */
export interface CrossAccountRoleConfig {
  /**
   * Target AWS account ID (12 digits).
   */
  accountId: string;

  /**
   * Name of the role in the target account.
   */
  roleName: string;

  /**
   * External ID for cross-account trust.
   * Required if the trust policy specifies an external ID.
   */
  externalId?: string;

  /**
   * Prefix for session names.
   * Actual session name will be: `${prefix}-${timestamp}`
   */
  sessionNamePrefix: string;

  /**
   * Session duration in seconds (900-43200).
   * @default 3600 (1 hour)
   */
  duration?: number;

  /**
   * Session tags for audit trails.
   */
  sessionTags?: SessionTag[];
}

/**
 * AWS IAM client configuration.
 *
 * Complete configuration for creating and operating an IAM client instance.
 * All fields except region and baseCredentialsProvider are optional with sensible defaults.
 *
 * @example
 * ```typescript
 * const config: IamConfig = {
 *   region: 'us-east-1',
 *   baseCredentialsProvider: new StaticCredentialsProvider(credentials),
 *   useRegionalSts: true,
 *   timeout: 30000
 * };
 * ```
 */
export interface IamConfig {
  /**
   * AWS region for STS API endpoint (e.g., 'us-east-1', 'eu-west-1').
   */
  region: string;

  /**
   * Custom endpoint URL for STS (for testing or custom endpoints).
   * If not provided, uses the regional or global STS endpoint based on useRegionalSts.
   *
   * @example 'https://sts.us-east-1.amazonaws.com'
   */
  endpoint?: string;

  /**
   * Base credentials provider for AWS authentication.
   * These credentials are used to sign requests to STS/IAM APIs.
   */
  baseCredentialsProvider: CredentialProvider;

  /**
   * Use regional STS endpoints instead of global.
   * Regional endpoints are recommended for better reliability and lower latency.
   *
   * @default true
   */
  useRegionalSts?: boolean;

  /**
   * Total request timeout in milliseconds.
   * Includes connection time, request/response transfer, and processing.
   *
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Credential cache configuration.
   * If not provided, uses default cache settings.
   */
  cacheConfig?: CacheConfig;

  /**
   * Advanced retry configuration.
   * If not provided, uses sensible defaults.
   */
  retryConfig?: RetryConfig;

  /**
   * Circuit breaker configuration.
   * If not provided, uses default circuit breaker settings.
   */
  circuitBreakerConfig?: CircuitBreakerConfig;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  useRegionalSts: true,
  timeout: 30000,
  retryConfig: {
    maxAttempts: 3,
    initialBackoff: 100,
    maxBackoff: 20000,
    backoffMultiplier: 2,
    jitter: true,
  } as RetryConfig,
  circuitBreakerConfig: {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeout: 30000,
  } as CircuitBreakerConfig,
  cacheConfig: {
    refreshBuffer: 300000, // 5 minutes
    maxEntries: 100,
    asyncRefresh: true,
  } as CacheConfig,
};

/**
 * IAM configuration builder.
 *
 * Provides a fluent API for constructing IAM client configuration.
 * All methods return `this` for chaining.
 *
 * @example
 * ```typescript
 * const config = new IamConfigBuilder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
 *   .useRegionalSts(true)
 *   .timeout(60000)
 *   .cacheConfig({ refreshBuffer: 600000 })
 *   .build();
 * ```
 */
export class IamConfigBuilder {
  private config: Partial<IamConfig> = {};

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
   * Set a custom STS endpoint URL.
   *
   * Useful for testing with LocalStack or using custom STS endpoints.
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

    this.config.baseCredentialsProvider = new StaticCredentialProvider(creds);
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
    this.config.baseCredentialsProvider = provider;
    return this;
  }

  /**
   * Set whether to use regional STS endpoints.
   *
   * @param useRegional - true to use regional endpoints, false for global
   * @returns This builder for chaining
   */
  useRegionalSts(useRegional: boolean): this {
    this.config.useRegionalSts = useRegional;
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
   * Set credential cache configuration.
   *
   * @param config - Cache configuration
   * @returns This builder for chaining
   */
  cacheConfig(config: CacheConfig): this {
    this.config.cacheConfig = config;
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
   * Set circuit breaker configuration.
   *
   * @param config - Circuit breaker configuration
   * @returns This builder for chaining
   */
  circuitBreakerConfig(config: CircuitBreakerConfig): this {
    this.config.circuitBreakerConfig = config;
    return this;
  }

  /**
   * Load configuration from environment variables.
   *
   * Reads the following environment variables:
   * - AWS_REGION or AWS_DEFAULT_REGION: Region
   * - AWS_ENDPOINT_URL_STS or AWS_ENDPOINT_URL: Custom endpoint
   * - AWS_STS_REGIONAL_ENDPOINTS: 'regional' or 'legacy' (global)
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
    const endpoint = process.env.AWS_ENDPOINT_URL_STS ?? process.env.AWS_ENDPOINT_URL;
    if (endpoint) {
      this.config.endpoint = endpoint;
    }

    // Regional STS
    const regionalEndpoints = process.env.AWS_STS_REGIONAL_ENDPOINTS;
    if (regionalEndpoints) {
      this.config.useRegionalSts = regionalEndpoints.toLowerCase() === "regional";
    }

    return this;
  }

  /**
   * Build the configuration.
   *
   * Validates required fields and applies defaults.
   *
   * @returns Complete IAM configuration
   * @throws {IamError} If required fields are missing or invalid
   */
  build(): IamConfig {
    // Validate required fields
    if (!this.config.region) {
      throw new IamError("Region must be specified", "CONFIGURATION", false);
    }

    if (!this.config.baseCredentialsProvider) {
      throw new IamError("Credentials provider must be specified", "CONFIGURATION", false);
    }

    // Validate endpoint if provided
    if (this.config.endpoint) {
      try {
        new URL(this.config.endpoint);
      } catch {
        throw new IamError(
          `Invalid endpoint URL: ${this.config.endpoint}`,
          "CONFIGURATION",
          false
        );
      }
    }

    // Merge with defaults
    const merged: IamConfig = {
      region: this.config.region,
      baseCredentialsProvider: this.config.baseCredentialsProvider,
      endpoint: this.config.endpoint,
      useRegionalSts: this.config.useRegionalSts ?? DEFAULT_CONFIG.useRegionalSts,
      timeout: this.config.timeout ?? DEFAULT_CONFIG.timeout,
      retryConfig: this.config.retryConfig ?? DEFAULT_CONFIG.retryConfig,
      circuitBreakerConfig:
        this.config.circuitBreakerConfig ?? DEFAULT_CONFIG.circuitBreakerConfig,
      cacheConfig: this.config.cacheConfig ?? DEFAULT_CONFIG.cacheConfig,
    };

    return merged;
  }
}

/**
 * Create a new IAM config builder.
 *
 * @returns New configuration builder instance
 */
export function configBuilder(): IamConfigBuilder {
  return new IamConfigBuilder();
}

/**
 * Resolve the STS API endpoint URL for a region.
 *
 * Returns either a regional or global STS endpoint based on configuration.
 *
 * @param config - IAM configuration
 * @param region - Optional region override (defaults to config.region)
 * @returns Full STS endpoint URL
 *
 * @example
 * ```typescript
 * const url = resolveStsEndpoint({ region: 'us-east-1', useRegionalSts: true, ... });
 * // Returns: 'https://sts.us-east-1.amazonaws.com'
 *
 * const globalUrl = resolveStsEndpoint({ region: 'us-east-1', useRegionalSts: false, ... });
 * // Returns: 'https://sts.amazonaws.com'
 * ```
 */
export function resolveStsEndpoint(config: IamConfig, region?: string): string {
  // Custom endpoint
  if (config.endpoint) {
    return config.endpoint;
  }

  // Use regional or global endpoint based on configuration
  const targetRegion = region ?? config.region;
  const useRegional = config.useRegionalSts ?? DEFAULT_CONFIG.useRegionalSts;

  if (useRegional) {
    // Regional STS endpoint (recommended)
    return `https://sts.${targetRegion}.amazonaws.com`;
  } else {
    // Global STS endpoint (legacy)
    return "https://sts.amazonaws.com";
  }
}

/**
 * Resolve the IAM API endpoint URL.
 *
 * IAM is a global service and always uses the global endpoint.
 *
 * @returns IAM global endpoint URL
 *
 * @example
 * ```typescript
 * const url = resolveIamEndpoint();
 * // Returns: 'https://iam.amazonaws.com'
 * ```
 */
export function resolveIamEndpoint(): string {
  // IAM is always global
  return "https://iam.amazonaws.com";
}

/**
 * Build the user agent string.
 *
 * @param customUserAgent - Optional custom user agent suffix
 * @returns User agent string
 *
 * @internal
 */
export function buildUserAgent(customUserAgent?: string): string {
  const baseAgent = "aws-iam-typescript/1.0.0";
  return customUserAgent ? `${baseAgent} ${customUserAgent}` : baseAgent;
}

/**
 * Validate role ARN format.
 *
 * @param roleArn - Role ARN to validate
 * @throws {IamError} If role ARN format is invalid
 */
export function validateRoleArn(roleArn: string): void {
  if (!roleArn) {
    throw new IamError("Role ARN cannot be empty", "CONFIGURATION", false);
  }

  // Basic ARN validation for IAM roles
  const arnRegex = /^arn:aws:iam::\d{12}:role\/.+$/;
  if (!arnRegex.test(roleArn)) {
    throw new IamError(
      `Invalid role ARN format: ${roleArn}. Expected: arn:aws:iam::ACCOUNT:role/ROLE_NAME`,
      "CONFIGURATION",
      false
    );
  }
}

/**
 * Validate session name format.
 *
 * @param sessionName - Session name to validate
 * @throws {IamError} If session name format is invalid
 */
export function validateSessionName(sessionName: string): void {
  if (!sessionName) {
    throw new IamError("Session name cannot be empty", "CONFIGURATION", false);
  }

  // Session name must be 2-64 characters
  if (sessionName.length < 2 || sessionName.length > 64) {
    throw new IamError(
      `Session name must be 2-64 characters, got ${sessionName.length}`,
      "CONFIGURATION",
      false
    );
  }

  // Valid characters: [\w+=,.@-]+
  const sessionNameRegex = /^[\w+=,.@-]+$/;
  if (!sessionNameRegex.test(sessionName)) {
    throw new IamError(
      `Invalid session name format: ${sessionName}. Must match [\\w+=,.@-]+`,
      "CONFIGURATION",
      false
    );
  }
}

/**
 * Validate session duration.
 *
 * @param duration - Duration in seconds
 * @throws {IamError} If duration is invalid
 */
export function validateSessionDuration(duration: number): void {
  if (duration < 900 || duration > 43200) {
    throw new IamError(
      `Session duration must be between 900 and 43200 seconds, got ${duration}`,
      "CONFIGURATION",
      false
    );
  }
}

/**
 * Validate external ID format.
 *
 * @param externalId - External ID to validate
 * @throws {IamError} If external ID format is invalid
 */
export function validateExternalId(externalId: string): void {
  if (!externalId) {
    throw new IamError("External ID cannot be empty", "CONFIGURATION", false);
  }

  // External ID must be 2-1224 characters
  if (externalId.length < 2 || externalId.length > 1224) {
    throw new IamError(
      `External ID must be 2-1224 characters, got ${externalId.length}`,
      "CONFIGURATION",
      false
    );
  }

  // Valid characters: [\w+=,.@:/-]+
  const externalIdRegex = /^[\w+=,.@:/-]+$/;
  if (!externalIdRegex.test(externalId)) {
    throw new IamError(
      `Invalid external ID format: ${externalId}. Must match [\\w+=,.@:/-]+`,
      "CONFIGURATION",
      false
    );
  }
}
