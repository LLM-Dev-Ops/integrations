/**
 * Configuration types for the GitHub client.
 * @module config
 */

import { z } from 'zod';
import type { AuthMethod } from './auth.js';
import { GitHubError, GitHubErrorKind } from './errors.js';

/** Default GitHub API base URL. */
export const DEFAULT_BASE_URL = 'https://api.github.com';

/** Default GitHub API version (date-based). */
export const DEFAULT_API_VERSION = '2022-11-28';

/** Default request timeout in milliseconds. */
export const DEFAULT_TIMEOUT = 30000;

/** Default connect timeout in milliseconds. */
export const DEFAULT_CONNECT_TIMEOUT = 10000;

/** Default User-Agent header. */
export const DEFAULT_USER_AGENT = 'integrations-github/0.1.0';

/**
 * Retry configuration.
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

/**
 * Circuit breaker configuration.
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
  successThreshold: 3,
  resetTimeout: 60000,
  enabled: true,
};

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

/**
 * Connection pool configuration.
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

/**
 * GitHub client configuration.
 */
export interface GitHubConfig {
  /** API base URL. */
  baseUrl: string;
  /** API version header. */
  apiVersion: string;
  /** Authentication method. */
  auth?: AuthMethod;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Connect timeout in milliseconds. */
  connectTimeout: number;
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

/**
 * Zod schema for URL validation.
 */
const urlSchema = z.string().url();

/**
 * Creates a default GitHub configuration.
 */
export function createDefaultConfig(): GitHubConfig {
  return {
    baseUrl: DEFAULT_BASE_URL,
    apiVersion: DEFAULT_API_VERSION,
    auth: undefined,
    timeout: DEFAULT_TIMEOUT,
    connectTimeout: DEFAULT_CONNECT_TIMEOUT,
    userAgent: DEFAULT_USER_AGENT,
    retry: DEFAULT_RETRY_CONFIG,
    circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
    rateLimit: DEFAULT_RATE_LIMIT_CONFIG,
    pool: DEFAULT_POOL_CONFIG,
  };
}

/**
 * Validates a GitHub configuration.
 * @param config - The configuration to validate.
 * @throws {GitHubError} If the configuration is invalid.
 */
export function validateConfig(config: GitHubConfig): void {
  if (!config.baseUrl || config.baseUrl.trim() === '') {
    throw new GitHubError(
      GitHubErrorKind.InvalidBaseUrl,
      'Base URL cannot be empty'
    );
  }

  if (!config.baseUrl.startsWith('http://') && !config.baseUrl.startsWith('https://')) {
    throw new GitHubError(
      GitHubErrorKind.InvalidBaseUrl,
      'Base URL must start with http:// or https://'
    );
  }

  // Validate URL format
  const urlResult = urlSchema.safeParse(config.baseUrl);
  if (!urlResult.success) {
    throw new GitHubError(
      GitHubErrorKind.InvalidBaseUrl,
      `Invalid base URL format: ${config.baseUrl}`
    );
  }

  if (!config.userAgent || config.userAgent.trim() === '') {
    throw new GitHubError(
      GitHubErrorKind.InvalidConfiguration,
      'User-Agent is required by GitHub API'
    );
  }

  if (config.timeout <= 0) {
    throw new GitHubError(
      GitHubErrorKind.InvalidConfiguration,
      'Timeout must be greater than 0'
    );
  }

  if (config.connectTimeout <= 0) {
    throw new GitHubError(
      GitHubErrorKind.InvalidConfiguration,
      'Connect timeout must be greater than 0'
    );
  }
}

/**
 * Builder for GitHubConfig.
 */
export class GitHubConfigBuilder {
  private config: GitHubConfig;

  constructor() {
    this.config = createDefaultConfig();
  }

  /**
   * Sets the base URL.
   * @param url - The base URL.
   * @returns The builder instance for chaining.
   */
  baseUrl(url: string): this {
    this.config.baseUrl = url;
    return this;
  }

  /**
   * Sets the API version.
   * @param version - The API version.
   * @returns The builder instance for chaining.
   */
  apiVersion(version: string): this {
    this.config.apiVersion = version;
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
   * Sets the request timeout.
   * @param timeout - The timeout in milliseconds.
   * @returns The builder instance for chaining.
   */
  timeout(timeout: number): this {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Sets the connect timeout.
   * @param timeout - The timeout in milliseconds.
   * @returns The builder instance for chaining.
   */
  connectTimeout(timeout: number): this {
    this.config.connectTimeout = timeout;
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
   * @throws {GitHubError} If the configuration is invalid.
   */
  build(): GitHubConfig {
    validateConfig(this.config);
    return { ...this.config };
  }
}

/**
 * Namespace for GitHubConfig-related utilities.
 */
export namespace GitHubConfig {
  /**
   * Creates a new configuration builder.
   * @returns A new GitHubConfigBuilder instance.
   */
  export function builder(): GitHubConfigBuilder {
    return new GitHubConfigBuilder();
  }

  /**
   * Creates a default configuration.
   * @returns The default configuration.
   */
  export function defaultConfig(): GitHubConfig {
    return createDefaultConfig();
  }

  /**
   * Validates a configuration.
   * @param config - The configuration to validate.
   * @throws {GitHubError} If the configuration is invalid.
   */
  export function validate(config: GitHubConfig): void {
    validateConfig(config);
  }
}
