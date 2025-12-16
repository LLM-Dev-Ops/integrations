/**
 * GitLab Integration Configuration
 *
 * This module provides configuration types and builders for the GitLab integration,
 * following the SPARC specifications for flexible, type-safe configuration management.
 */

/**
 * Simulation mode for recording and replaying API interactions
 */
export type SimulationMode =
  | { type: 'Disabled' }
  | { type: 'Recording'; path: string }
  | { type: 'Replay'; path: string };

/**
 * Rate limiting configuration for API requests
 */
export interface RateLimitConfig {
  /**
   * Maximum requests per minute (default: 2000 for authenticated requests)
   */
  requestsPerMinute: number;

  /**
   * Maximum burst size for token bucket algorithm (default: 100)
   */
  burstSize: number;

  /**
   * Additional buffer time in milliseconds after rate limit reset (default: 100ms)
   */
  retryAfterBuffer: number;
}

/**
 * Circuit breaker configuration for fault tolerance
 */
export interface CircuitBreakerConfig {
  /**
   * Whether circuit breaker is enabled
   */
  enabled: boolean;

  /**
   * Number of failures before opening the circuit
   */
  threshold: number;

  /**
   * Time in milliseconds before attempting to close the circuit
   */
  resetTimeoutMs: number;
}

/**
 * Retry configuration for failed requests
 */
export interface RetryConfig {
  /**
   * Initial delay in milliseconds before first retry (default: 1000)
   */
  initialDelayMs: number;

  /**
   * Maximum delay in milliseconds between retries (default: 60000)
   */
  maxDelayMs: number;

  /**
   * Multiplier for exponential backoff (default: 2)
   */
  multiplier: number;

  /**
   * Whether to add random jitter to retry delays (default: true)
   */
  jitter: boolean;
}

/**
 * Complete GitLab integration configuration
 */
export interface GitLabConfig {
  /**
   * Base URL for GitLab instance (default: "https://gitlab.com")
   */
  baseUrl: string;

  /**
   * GitLab API version (default: "v4")
   */
  apiVersion: string;

  /**
   * Request timeout in milliseconds (default: 30000)
   */
  timeout: number;

  /**
   * Timeout for streaming log operations in milliseconds (default: 300000)
   */
  logTimeout: number;

  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxRetries: number;

  /**
   * Rate limiting configuration
   */
  rateLimitConfig: RateLimitConfig;

  /**
   * Optional circuit breaker configuration
   */
  circuitBreakerConfig?: CircuitBreakerConfig;

  /**
   * Optional retry configuration
   */
  retryConfig?: RetryConfig;

  /**
   * Simulation mode for testing and development
   */
  simulationMode: SimulationMode;

  /**
   * Optional custom user agent string
   */
  userAgent?: string;
}

/**
 * Default rate limit configuration
 */
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  requestsPerMinute: 2000,
  burstSize: 100,
  retryAfterBuffer: 100,
};

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitter: true,
};

/**
 * Fluent builder for GitLabConfig with immutable configuration objects
 */
export class GitLabConfigBuilder {
  private config: Partial<GitLabConfig> = {};

  /**
   * Creates a new GitLabConfigBuilder instance
   */
  constructor() {
    // Initialize with defaults
    this.config = {
      baseUrl: 'https://gitlab.com',
      apiVersion: 'v4',
      timeout: 30000,
      logTimeout: 300000,
      maxRetries: 3,
      rateLimitConfig: { ...DEFAULT_RATE_LIMIT_CONFIG },
      simulationMode: { type: 'Disabled' },
    };
  }

  /**
   * Static factory method for creating a new builder
   * @returns A new GitLabConfigBuilder instance
   */
  static builder(): GitLabConfigBuilder {
    return new GitLabConfigBuilder();
  }

  /**
   * Sets the base URL for the GitLab instance
   * @param url - The base URL (e.g., "https://gitlab.example.com")
   * @returns This builder instance for chaining
   */
  baseUrl(url: string): this {
    this.config.baseUrl = url;
    return this;
  }

  /**
   * Sets the GitLab API version
   * @param version - The API version (e.g., "v4")
   * @returns This builder instance for chaining
   */
  apiVersion(version: string): this {
    this.config.apiVersion = version;
    return this;
  }

  /**
   * Sets the request timeout in milliseconds
   * @param ms - Timeout in milliseconds
   * @returns This builder instance for chaining
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Sets the log streaming timeout in milliseconds
   * @param ms - Log timeout in milliseconds
   * @returns This builder instance for chaining
   */
  logTimeout(ms: number): this {
    this.config.logTimeout = ms;
    return this;
  }

  /**
   * Sets the maximum number of retry attempts
   * @param count - Maximum retry count
   * @returns This builder instance for chaining
   */
  maxRetries(count: number): this {
    this.config.maxRetries = count;
    return this;
  }

  /**
   * Sets the rate limit configuration
   * @param config - Rate limit configuration
   * @returns This builder instance for chaining
   */
  rateLimitConfig(config: RateLimitConfig): this {
    this.config.rateLimitConfig = { ...config };
    return this;
  }

  /**
   * Sets the circuit breaker configuration
   * @param config - Circuit breaker configuration
   * @returns This builder instance for chaining
   */
  circuitBreakerConfig(config: CircuitBreakerConfig): this {
    this.config.circuitBreakerConfig = { ...config };
    return this;
  }

  /**
   * Sets the retry configuration
   * @param config - Retry configuration
   * @returns This builder instance for chaining
   */
  retryConfig(config: RetryConfig): this {
    this.config.retryConfig = { ...config };
    return this;
  }

  /**
   * Sets the simulation mode
   * @param mode - Simulation mode configuration
   * @returns This builder instance for chaining
   */
  simulation(mode: SimulationMode): this {
    this.config.simulationMode = mode;
    return this;
  }

  /**
   * Sets the user agent string
   * @param agent - User agent string
   * @returns This builder instance for chaining
   */
  userAgent(agent: string): this {
    this.config.userAgent = agent;
    return this;
  }

  /**
   * Builds and returns an immutable GitLabConfig object
   * @returns A complete GitLabConfig object
   * @throws Error if required fields are missing
   */
  build(): GitLabConfig {
    // Validate required fields
    if (!this.config.baseUrl) {
      throw new Error('baseUrl is required');
    }
    if (!this.config.apiVersion) {
      throw new Error('apiVersion is required');
    }
    if (this.config.timeout === undefined) {
      throw new Error('timeout is required');
    }
    if (this.config.logTimeout === undefined) {
      throw new Error('logTimeout is required');
    }
    if (this.config.maxRetries === undefined) {
      throw new Error('maxRetries is required');
    }
    if (!this.config.rateLimitConfig) {
      throw new Error('rateLimitConfig is required');
    }
    if (!this.config.simulationMode) {
      throw new Error('simulationMode is required');
    }

    // Return frozen (immutable) configuration
    return Object.freeze({
      baseUrl: this.config.baseUrl,
      apiVersion: this.config.apiVersion,
      timeout: this.config.timeout,
      logTimeout: this.config.logTimeout,
      maxRetries: this.config.maxRetries,
      rateLimitConfig: Object.freeze({ ...this.config.rateLimitConfig }),
      circuitBreakerConfig: this.config.circuitBreakerConfig
        ? Object.freeze({ ...this.config.circuitBreakerConfig })
        : undefined,
      retryConfig: this.config.retryConfig
        ? Object.freeze({ ...this.config.retryConfig })
        : undefined,
      simulationMode: Object.freeze({ ...this.config.simulationMode }),
      userAgent: this.config.userAgent,
    });
  }
}

/**
 * Creates a default GitLab configuration with recommended settings
 * @returns A GitLabConfig object with default values
 */
export function createDefaultConfig(): GitLabConfig {
  return Object.freeze({
    baseUrl: 'https://gitlab.com',
    apiVersion: 'v4',
    timeout: 30000,
    logTimeout: 300000,
    maxRetries: 3,
    rateLimitConfig: Object.freeze({ ...DEFAULT_RATE_LIMIT_CONFIG }),
    retryConfig: Object.freeze({ ...DEFAULT_RETRY_CONFIG }),
    simulationMode: Object.freeze({ type: 'Disabled' as const }),
  });
}

/**
 * Creates a GitLab configuration from environment variables
 *
 * Reads the following environment variables:
 * - GITLAB_BASE_URL: Base URL for GitLab instance
 * - GITLAB_API_VERSION: API version to use
 * - GITLAB_TIMEOUT: Request timeout in milliseconds
 * - GITLAB_MAX_RETRIES: Maximum number of retry attempts
 *
 * @returns A GitLabConfig object with values from environment or defaults
 */
export function createConfigFromEnv(): GitLabConfig {
  const builder = new GitLabConfigBuilder();

  // Read from environment variables
  const baseUrl = process.env.GITLAB_BASE_URL;
  if (baseUrl) {
    builder.baseUrl(baseUrl);
  }

  const apiVersion = process.env.GITLAB_API_VERSION;
  if (apiVersion) {
    builder.apiVersion(apiVersion);
  }

  const timeout = process.env.GITLAB_TIMEOUT;
  if (timeout) {
    const timeoutMs = parseInt(timeout, 10);
    if (!isNaN(timeoutMs) && timeoutMs > 0) {
      builder.timeout(timeoutMs);
    }
  }

  const maxRetries = process.env.GITLAB_MAX_RETRIES;
  if (maxRetries) {
    const retryCount = parseInt(maxRetries, 10);
    if (!isNaN(retryCount) && retryCount >= 0) {
      builder.maxRetries(retryCount);
    }
  }

  // Add default retry config
  builder.retryConfig(DEFAULT_RETRY_CONFIG);

  return builder.build();
}
