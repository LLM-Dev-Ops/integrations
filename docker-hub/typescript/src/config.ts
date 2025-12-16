/**
 * Configuration types for the Docker Hub client.
 * @module config
 */

import { z } from 'zod';

// ============================================================================
// Secret String
// ============================================================================

/**
 * Secret string wrapper to prevent accidental exposure.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Exposes the secret value.
   * Use with caution - avoid logging or displaying.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns a safe representation for logging.
   */
  toString(): string {
    return '[REDACTED]';
  }

  /**
   * Custom JSON serialization to prevent accidental exposure.
   */
  toJSON(): string {
    return '[REDACTED]';
  }
}

// ============================================================================
// Default Constants
// ============================================================================

/** Default Docker Hub URL. */
export const DEFAULT_HUB_URL = 'https://hub.docker.com';

/** Default Docker Registry URL. */
export const DEFAULT_REGISTRY_URL = 'https://registry-1.docker.io';

/** Default Docker Auth URL. */
export const DEFAULT_AUTH_URL = 'https://auth.docker.io';

/** Default request timeout in milliseconds. */
export const DEFAULT_TIMEOUT = 60000;

/** Default maximum retry attempts. */
export const DEFAULT_MAX_RETRIES = 3;

/** Default chunk size for blob uploads (5MB). */
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

/** Default User-Agent header. */
export const DEFAULT_USER_AGENT = 'integrations-docker-hub/0.1.0';

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration for failed requests.
 */
export interface RetryConfig {
  /** Maximum retry attempts. */
  maxAttempts: number;
  /** Initial backoff delay in milliseconds. */
  initialBackoff: number;
  /** Maximum backoff delay in milliseconds. */
  maxBackoff: number;
  /** Backoff multiplier. */
  multiplier: number;
  /** Jitter factor (0.0 to 1.0). */
  jitter: number;
  /** Enable retries. */
  enabled: boolean;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialBackoff: 1000,
  maxBackoff: 60000,
  multiplier: 2.0,
  jitter: 0.1,
  enabled: true,
};

// ============================================================================
// Circuit Breaker Configuration
// ============================================================================

/**
 * Circuit breaker configuration to prevent cascading failures.
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit. */
  failureThreshold: number;
  /** Success threshold to close circuit. */
  successThreshold: number;
  /** Reset timeout when circuit is open (in milliseconds). */
  resetTimeout: number;
  /** Enable circuit breaker. */
  enabled: boolean;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 30000,
  enabled: true,
};

// ============================================================================
// Rate Limit Configuration
// ============================================================================

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Buffer percentage to keep before throttling (0.0 to 1.0). */
  bufferPercentage: number;
  /** Enable preemptive throttling. */
  preemptiveThrottling: boolean;
  /** Enable rate limit tracking. */
  enabled: boolean;
}

/**
 * Default rate limit configuration.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  bufferPercentage: 0.1,
  preemptiveThrottling: true,
  enabled: true,
};

// ============================================================================
// Connection Pool Configuration
// ============================================================================

/**
 * Connection pool configuration for HTTP client.
 */
export interface PoolConfig {
  /** Maximum idle connections per host. */
  maxIdlePerHost: number;
  /** Idle connection timeout in milliseconds. */
  idleTimeout: number;
}

/**
 * Default connection pool configuration.
 */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxIdlePerHost: 20,
  idleTimeout: 90000,
};

// ============================================================================
// Authentication Methods
// ============================================================================

/**
 * Username/password authentication.
 */
export interface UsernamePasswordAuth {
  type: 'username_password';
  username: string;
  password: string;
}

/**
 * Personal Access Token (PAT) authentication.
 */
export interface AccessTokenAuth {
  type: 'access_token';
  username: string;
  accessToken: string;
}

/**
 * Anonymous access (public repositories only).
 */
export interface AnonymousAuth {
  type: 'anonymous';
}

/**
 * Supported authentication methods.
 */
export type AuthMethod = UsernamePasswordAuth | AccessTokenAuth | AnonymousAuth;

// ============================================================================
// Docker Hub Configuration
// ============================================================================

/**
 * Docker Hub client configuration.
 */
export interface DockerHubConfig {
  /** Docker Hub URL. */
  hubUrl: string;
  /** Docker Registry URL. */
  registryUrl: string;
  /** Docker Auth URL. */
  authUrl: string;
  /** Username (optional, can be provided via auth). */
  username?: string;
  /** Password (optional, wrapped in SecretString). */
  password?: SecretString;
  /** Personal Access Token (optional, wrapped in SecretString). */
  accessToken?: SecretString;
  /** Authentication method. */
  auth?: AuthMethod;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Maximum retry attempts. */
  maxRetries: number;
  /** Chunk size for blob uploads in bytes. */
  chunkSize: number;
  /** User-Agent header. */
  userAgent: string;
  /** Retry configuration. */
  retry: RetryConfig;
  /** Circuit breaker configuration. */
  circuitBreaker: CircuitBreakerConfig;
  /** Rate limit configuration. */
  rateLimit: RateLimitConfig;
  /** Connection pool configuration. */
  pool: PoolConfig;
}

// ============================================================================
// Zod Validation Schemas
// ============================================================================

/**
 * Zod schema for URL validation.
 */
const urlSchema = z.string().url();

/**
 * Zod schema for retry configuration validation.
 */
const retryConfigSchema = z.object({
  maxAttempts: z.number().int().min(0).max(10),
  initialBackoff: z.number().int().min(0),
  maxBackoff: z.number().int().min(0),
  multiplier: z.number().min(1.0),
  jitter: z.number().min(0.0).max(1.0),
  enabled: z.boolean(),
});

/**
 * Zod schema for circuit breaker configuration validation.
 */
const circuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().min(1),
  successThreshold: z.number().int().min(1),
  resetTimeout: z.number().int().min(0),
  enabled: z.boolean(),
});

/**
 * Zod schema for rate limit configuration validation.
 */
const rateLimitConfigSchema = z.object({
  bufferPercentage: z.number().min(0.0).max(1.0),
  preemptiveThrottling: z.boolean(),
  enabled: z.boolean(),
});

/**
 * Zod schema for pool configuration validation.
 */
const poolConfigSchema = z.object({
  maxIdlePerHost: z.number().int().min(1),
  idleTimeout: z.number().int().min(0),
});

// ============================================================================
// Error Types
// ============================================================================

/**
 * Docker Hub configuration error kinds.
 */
export enum DockerHubConfigErrorKind {
  /** Invalid Hub URL. */
  InvalidHubUrl = 'invalid_hub_url',
  /** Invalid Registry URL. */
  InvalidRegistryUrl = 'invalid_registry_url',
  /** Invalid Auth URL. */
  InvalidAuthUrl = 'invalid_auth_url',
  /** Invalid timeout value. */
  InvalidTimeout = 'invalid_timeout',
  /** Invalid retry configuration. */
  InvalidRetryConfig = 'invalid_retry_config',
  /** Invalid circuit breaker configuration. */
  InvalidCircuitBreakerConfig = 'invalid_circuit_breaker_config',
  /** Invalid rate limit configuration. */
  InvalidRateLimitConfig = 'invalid_rate_limit_config',
  /** Invalid pool configuration. */
  InvalidPoolConfig = 'invalid_pool_config',
  /** Invalid chunk size. */
  InvalidChunkSize = 'invalid_chunk_size',
  /** Missing authentication. */
  MissingAuth = 'missing_auth',
  /** Invalid authentication configuration. */
  InvalidAuth = 'invalid_auth',
  /** Invalid configuration. */
  InvalidConfiguration = 'invalid_configuration',
}

/**
 * Docker Hub configuration error.
 */
export class DockerHubConfigError extends Error {
  public readonly kind: DockerHubConfigErrorKind;

  constructor(kind: DockerHubConfigErrorKind, message: string) {
    super(message);
    this.name = 'DockerHubConfigError';
    this.kind = kind;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DockerHubConfigError);
    }
  }
}

// ============================================================================
// Configuration Factory
// ============================================================================

/**
 * Creates a default Docker Hub configuration.
 */
export function createDefaultConfig(): DockerHubConfig {
  return {
    hubUrl: DEFAULT_HUB_URL,
    registryUrl: DEFAULT_REGISTRY_URL,
    authUrl: DEFAULT_AUTH_URL,
    timeout: DEFAULT_TIMEOUT,
    maxRetries: DEFAULT_MAX_RETRIES,
    chunkSize: DEFAULT_CHUNK_SIZE,
    userAgent: DEFAULT_USER_AGENT,
    retry: DEFAULT_RETRY_CONFIG,
    circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
    rateLimit: DEFAULT_RATE_LIMIT_CONFIG,
    pool: DEFAULT_POOL_CONFIG,
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates a Docker Hub configuration.
 * @param config - The configuration to validate.
 * @throws {DockerHubConfigError} If the configuration is invalid.
 */
export function validateConfig(config: DockerHubConfig): void {
  // Validate Hub URL
  if (!config.hubUrl || config.hubUrl.trim() === '') {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidHubUrl,
      'Hub URL cannot be empty'
    );
  }

  if (!config.hubUrl.startsWith('http://') && !config.hubUrl.startsWith('https://')) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidHubUrl,
      'Hub URL must start with http:// or https://'
    );
  }

  const hubUrlResult = urlSchema.safeParse(config.hubUrl);
  if (!hubUrlResult.success) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidHubUrl,
      `Invalid Hub URL format: ${config.hubUrl}`
    );
  }

  // Validate Registry URL
  if (!config.registryUrl || config.registryUrl.trim() === '') {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidRegistryUrl,
      'Registry URL cannot be empty'
    );
  }

  if (!config.registryUrl.startsWith('http://') && !config.registryUrl.startsWith('https://')) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidRegistryUrl,
      'Registry URL must start with http:// or https://'
    );
  }

  const registryUrlResult = urlSchema.safeParse(config.registryUrl);
  if (!registryUrlResult.success) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidRegistryUrl,
      `Invalid Registry URL format: ${config.registryUrl}`
    );
  }

  // Validate Auth URL
  if (!config.authUrl || config.authUrl.trim() === '') {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidAuthUrl,
      'Auth URL cannot be empty'
    );
  }

  if (!config.authUrl.startsWith('http://') && !config.authUrl.startsWith('https://')) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidAuthUrl,
      'Auth URL must start with http:// or https://'
    );
  }

  const authUrlResult = urlSchema.safeParse(config.authUrl);
  if (!authUrlResult.success) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidAuthUrl,
      `Invalid Auth URL format: ${config.authUrl}`
    );
  }

  // Validate timeout
  if (config.timeout <= 0) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidTimeout,
      'Timeout must be greater than 0'
    );
  }

  // Validate maxRetries
  if (config.maxRetries < 0) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidConfiguration,
      'Max retries cannot be negative'
    );
  }

  // Validate chunk size
  if (config.chunkSize <= 0) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidChunkSize,
      'Chunk size must be greater than 0'
    );
  }

  // Validate retry configuration
  const retryResult = retryConfigSchema.safeParse(config.retry);
  if (!retryResult.success) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidRetryConfig,
      `Invalid retry configuration: ${retryResult.error.message}`
    );
  }

  // Validate circuit breaker configuration
  const circuitBreakerResult = circuitBreakerConfigSchema.safeParse(config.circuitBreaker);
  if (!circuitBreakerResult.success) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidCircuitBreakerConfig,
      `Invalid circuit breaker configuration: ${circuitBreakerResult.error.message}`
    );
  }

  // Validate rate limit configuration
  const rateLimitResult = rateLimitConfigSchema.safeParse(config.rateLimit);
  if (!rateLimitResult.success) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidRateLimitConfig,
      `Invalid rate limit configuration: ${rateLimitResult.error.message}`
    );
  }

  // Validate pool configuration
  const poolResult = poolConfigSchema.safeParse(config.pool);
  if (!poolResult.success) {
    throw new DockerHubConfigError(
      DockerHubConfigErrorKind.InvalidPoolConfig,
      `Invalid pool configuration: ${poolResult.error.message}`
    );
  }

  // Validate authentication consistency
  if (config.auth) {
    switch (config.auth.type) {
      case 'username_password':
        if (!config.auth.username || !config.auth.password) {
          throw new DockerHubConfigError(
            DockerHubConfigErrorKind.InvalidAuth,
            'Username and password are required for username_password auth'
          );
        }
        break;
      case 'access_token':
        if (!config.auth.username || !config.auth.accessToken) {
          throw new DockerHubConfigError(
            DockerHubConfigErrorKind.InvalidAuth,
            'Username and access token are required for access_token auth'
          );
        }
        break;
      case 'anonymous':
        // No validation needed for anonymous auth
        break;
    }
  }
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builder for DockerHubConfig with fluent API.
 */
export class DockerHubConfigBuilder {
  private config: DockerHubConfig;

  constructor() {
    this.config = createDefaultConfig();
  }

  /**
   * Sets the Hub URL.
   * @param url - The Hub URL.
   * @returns The builder instance for chaining.
   */
  hubUrl(url: string): this {
    this.config.hubUrl = url;
    return this;
  }

  /**
   * Sets the Registry URL.
   * @param url - The Registry URL.
   * @returns The builder instance for chaining.
   */
  registryUrl(url: string): this {
    this.config.registryUrl = url;
    return this;
  }

  /**
   * Sets the Auth URL.
   * @param url - The Auth URL.
   * @returns The builder instance for chaining.
   */
  authUrl(url: string): this {
    this.config.authUrl = url;
    return this;
  }

  /**
   * Sets the username.
   * @param username - The username.
   * @returns The builder instance for chaining.
   */
  username(username: string): this {
    this.config.username = username;
    return this;
  }

  /**
   * Sets the password.
   * @param password - The password.
   * @returns The builder instance for chaining.
   */
  password(password: string): this {
    this.config.password = new SecretString(password);
    return this;
  }

  /**
   * Sets the access token.
   * @param token - The access token.
   * @returns The builder instance for chaining.
   */
  accessToken(token: string): this {
    this.config.accessToken = new SecretString(token);
    return this;
  }

  /**
   * Sets the authentication method.
   * @param auth - The authentication method.
   * @returns The builder instance for chaining.
   */
  auth(auth: AuthMethod): this {
    this.config.auth = auth;
    return this;
  }

  /**
   * Configures username/password authentication.
   * @param username - The username.
   * @param password - The password.
   * @returns The builder instance for chaining.
   */
  withUsernamePassword(username: string, password: string): this {
    this.config.auth = {
      type: 'username_password',
      username,
      password,
    };
    this.config.username = username;
    this.config.password = new SecretString(password);
    return this;
  }

  /**
   * Configures access token authentication.
   * @param username - The username.
   * @param token - The access token.
   * @returns The builder instance for chaining.
   */
  withAccessToken(username: string, token: string): this {
    this.config.auth = {
      type: 'access_token',
      username,
      accessToken: token,
    };
    this.config.username = username;
    this.config.accessToken = new SecretString(token);
    return this;
  }

  /**
   * Configures anonymous authentication.
   * @returns The builder instance for chaining.
   */
  withAnonymousAuth(): this {
    this.config.auth = {
      type: 'anonymous',
    };
    return this;
  }

  /**
   * Sets the request timeout.
   * @param timeout - The timeout in milliseconds.
   * @returns The builder instance for chaining.
   */
  timeout(timeout: number): this {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Sets the maximum retry attempts.
   * @param maxRetries - The maximum retry attempts.
   * @returns The builder instance for chaining.
   */
  maxRetries(maxRetries: number): this {
    this.config.maxRetries = maxRetries;
    return this;
  }

  /**
   * Sets the chunk size for blob uploads.
   * @param size - The chunk size in bytes.
   * @returns The builder instance for chaining.
   */
  chunkSize(size: number): this {
    this.config.chunkSize = size;
    return this;
  }

  /**
   * Sets the User-Agent header.
   * @param userAgent - The User-Agent string.
   * @returns The builder instance for chaining.
   */
  userAgent(userAgent: string): this {
    this.config.userAgent = userAgent;
    return this;
  }

  /**
   * Sets the retry configuration.
   * @param config - The retry configuration.
   * @returns The builder instance for chaining.
   */
  retry(config: RetryConfig): this {
    this.config.retry = config;
    return this;
  }

  /**
   * Disables retries.
   * @returns The builder instance for chaining.
   */
  noRetry(): this {
    this.config.retry = {
      ...DEFAULT_RETRY_CONFIG,
      enabled: false,
    };
    return this;
  }

  /**
   * Sets the circuit breaker configuration.
   * @param config - The circuit breaker configuration.
   * @returns The builder instance for chaining.
   */
  circuitBreaker(config: CircuitBreakerConfig): this {
    this.config.circuitBreaker = config;
    return this;
  }

  /**
   * Disables circuit breaker.
   * @returns The builder instance for chaining.
   */
  noCircuitBreaker(): this {
    this.config.circuitBreaker = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      enabled: false,
    };
    return this;
  }

  /**
   * Sets the rate limit configuration.
   * @param config - The rate limit configuration.
   * @returns The builder instance for chaining.
   */
  rateLimit(config: RateLimitConfig): this {
    this.config.rateLimit = config;
    return this;
  }

  /**
   * Disables rate limiting.
   * @returns The builder instance for chaining.
   */
  noRateLimit(): this {
    this.config.rateLimit = {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      enabled: false,
    };
    return this;
  }

  /**
   * Sets the connection pool configuration.
   * @param config - The connection pool configuration.
   * @returns The builder instance for chaining.
   */
  pool(config: PoolConfig): this {
    this.config.pool = config;
    return this;
  }

  /**
   * Builds and validates the configuration.
   * @returns The validated configuration.
   * @throws {DockerHubConfigError} If the configuration is invalid.
   */
  build(): DockerHubConfig {
    validateConfig(this.config);
    return { ...this.config };
  }
}

// ============================================================================
// Namespace
// ============================================================================

/**
 * Namespace for DockerHubConfig-related utilities.
 */
export namespace DockerHubConfig {
  /**
   * Creates a new configuration builder.
   * @returns A new DockerHubConfigBuilder instance.
   */
  export function builder(): DockerHubConfigBuilder {
    return new DockerHubConfigBuilder();
  }

  /**
   * Creates a default configuration.
   * @returns The default configuration.
   */
  export function defaultConfig(): DockerHubConfig {
    return createDefaultConfig();
  }

  /**
   * Validates a configuration.
   * @param config - The configuration to validate.
   * @throws {DockerHubConfigError} If the configuration is invalid.
   */
  export function validate(config: DockerHubConfig): void {
    validateConfig(config);
  }
}
