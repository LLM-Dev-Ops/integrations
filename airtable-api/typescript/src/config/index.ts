/**
 * Airtable API client configuration and builder following SPARC specification.
 *
 * Provides configuration types, builder pattern, and defaults for the Airtable API client.
 */

// ============================================================================
// SecretString
// ============================================================================

/**
 * SecretString wrapper to prevent accidental logging of sensitive values.
 * The value is only accessible via the expose() method.
 */
export class SecretString {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Creates a SecretString from a plain string value.
   * @param value - The secret value to wrap
   * @returns A new SecretString instance
   */
  static from(value: string): SecretString {
    return new SecretString(value);
  }

  /**
   * Exposes the secret value. Use with caution.
   * @returns The underlying secret value
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns a redacted string for logging.
   * @returns '[REDACTED]' string
   */
  toString(): string {
    return '[REDACTED]';
  }

  /**
   * Returns a redacted value for JSON serialization.
   * @returns '[REDACTED]' string
   */
  toJSON(): string {
    return '[REDACTED]';
  }
}

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * Personal Access Token authentication method.
 */
export interface PatAuthMethod {
  type: 'pat';
  /** Personal Access Token */
  token: SecretString;
}

/**
 * OAuth 2.0 authentication method.
 */
export interface OAuthAuthMethod {
  type: 'oauth';
  /** OAuth access token */
  accessToken: SecretString;
  /** OAuth refresh token (optional) */
  refreshToken?: SecretString;
  /** Token expiration time (optional) */
  expiresAt?: Date;
}

/**
 * Authentication method types for Airtable API.
 */
export type AuthMethod = PatAuthMethod | OAuthAuthMethod;

// ============================================================================
// Rate Limit Configuration
// ============================================================================

/**
 * Rate limit handling strategies.
 */
export enum RateLimitStrategy {
  /** Wait/block until rate limit slot is available */
  Blocking = 'blocking',
  /** Queue requests in background */
  Queued = 'queued',
  /** Immediately return error on rate limit */
  FailFast = 'fail_fast',
}

/**
 * Rate limit configuration.
 *
 * Airtable API rate limits:
 * - 5 requests per second per base
 * - Higher limits available on enterprise plans
 */
export interface RateLimitConfig {
  /** Requests per second limit. Default: 5 (Airtable API standard limit) */
  requestsPerSecond: number;
  /** Maximum pending requests in queue. Default: 100 */
  maxQueueSize: number;
  /** Maximum time to wait in queue (ms). Default: 30000 */
  queueTimeout: number;
  /** Whether to adapt rate based on 429 responses. Default: true */
  adaptiveRateLimit: boolean;
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration for failed requests.
 */
export interface RetryConfig {
  /** Maximum retry attempts. Default: 3 */
  maxRetries: number;
  /** Maximum retries for rate limit errors. Default: 5 */
  maxRateLimitRetries: number;
  /** Initial backoff delay (ms). Default: 1000 */
  initialBackoffMs: number;
  /** Maximum backoff delay (ms). Default: 60000 */
  maxBackoffMs: number;
  /** Backoff multiplier. Default: 2 */
  backoffMultiplier: number;
  /** Jitter factor (0-1). Default: 0.1 */
  jitterFactor: number;
}

// ============================================================================
// Circuit Breaker Configuration
// ============================================================================

/**
 * Circuit breaker configuration for fault tolerance.
 */
export interface CircuitBreakerConfig {
  /** Enable circuit breaker. Default: true */
  enabled: boolean;
  /** Failure threshold before opening circuit. Default: 5 */
  failureThreshold: number;
  /** Reset timeout (ms). Default: 30000 */
  resetTimeoutMs: number;
  /** Success threshold to close circuit. Default: 2 */
  successThreshold: number;
}

// ============================================================================
// Webhook Configuration
// ============================================================================

/**
 * Webhook configuration for validating incoming webhooks.
 */
export interface WebhookConfig {
  /** Webhook secrets map (key -> secret) for signature validation */
  secrets: Map<string, SecretString>;
  /** Maximum timestamp age tolerance (ms). Default: 300000 (5 minutes) */
  timestampToleranceMs: number;
}

// ============================================================================
// Simulation Mode
// ============================================================================

/**
 * Simulation mode for testing and development.
 */
export enum SimulationMode {
  /** Normal operation - no simulation */
  Disabled = 'disabled',
  /** Record API requests and responses */
  Record = 'record',
  /** Replay recorded requests and responses */
  Replay = 'replay',
}

// ============================================================================
// Main Configuration Interface
// ============================================================================

/**
 * Airtable API client configuration.
 */
export interface AirtableConfig {
  /** Base API URL. Default: 'https://api.airtable.com/v0' */
  baseUrl: string;
  /** Authentication method */
  auth: AuthMethod;
  /** Request timeout in milliseconds. Default: 30000 */
  requestTimeoutMs: number;
  /** User agent string */
  userAgent: string;
  /** Rate limit configuration */
  rateLimitConfig: RateLimitConfig;
  /** Retry configuration */
  retryConfig: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreakerConfig: CircuitBreakerConfig;
  /** Webhook configuration (optional) */
  webhookConfig?: WebhookConfig;
  /** Simulation mode. Default: Disabled */
  simulationMode: SimulationMode;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default Airtable API base URL.
 */
export const DEFAULT_BASE_URL = 'https://api.airtable.com/v0';

/**
 * Airtable API v0 path.
 */
export const AIRTABLE_API_V0 = '/v0';

/**
 * Default request timeout in milliseconds (30 seconds).
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Default user agent string.
 */
export const DEFAULT_USER_AGENT = 'LLMDevOps-Airtable/1.0.0';

/**
 * Default rate limit configuration.
 * Based on Airtable's standard rate limit of 5 requests per second.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  requestsPerSecond: 5,
  maxQueueSize: 100,
  queueTimeout: 30000,
  adaptiveRateLimit: true,
};

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  maxRateLimitRetries: 5,
  initialBackoffMs: 1000,
  maxBackoffMs: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
};

/**
 * Default webhook timestamp tolerance (5 minutes).
 */
export const DEFAULT_WEBHOOK_TIMESTAMP_TOLERANCE_MS = 300000;

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builder for Airtable API client configuration.
 *
 * @example
 * ```typescript
 * const config = new AirtableConfigBuilder()
 *   .withToken('patXXXXXXXXXXXXXX')
 *   .withTimeout(60000)
 *   .build();
 * ```
 *
 * @example
 * ```typescript
 * // Build from environment variables
 * const config = AirtableConfigBuilder.fromEnv().build();
 * ```
 */
export class AirtableConfigBuilder {
  private baseUrl: string = DEFAULT_BASE_URL;
  private auth?: AuthMethod;
  private requestTimeoutMs: number = DEFAULT_TIMEOUT_MS;
  private userAgent: string = DEFAULT_USER_AGENT;
  private rateLimitConfig: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG };
  private retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG };
  private circuitBreakerConfig: CircuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG };
  private webhookConfig?: WebhookConfig;
  private simulationMode: SimulationMode = SimulationMode.Disabled;

  /**
   * Sets Personal Access Token authentication.
   * @param token - The Personal Access Token
   * @returns This builder instance for chaining
   */
  withToken(token: string): this {
    if (!token || token.trim().length === 0) {
      throw new Error('Personal Access Token cannot be empty');
    }
    this.auth = {
      type: 'pat',
      token: SecretString.from(token.trim()),
    };
    return this;
  }

  /**
   * Sets OAuth 2.0 authentication.
   * @param accessToken - OAuth access token
   * @param refreshToken - OAuth refresh token (optional)
   * @param expiresAt - Token expiration time (optional)
   * @returns This builder instance for chaining
   */
  withOAuth(accessToken: string, refreshToken?: string, expiresAt?: Date): this {
    if (!accessToken || accessToken.trim().length === 0) {
      throw new Error('OAuth access token cannot be empty');
    }
    this.auth = {
      type: 'oauth',
      accessToken: SecretString.from(accessToken.trim()),
      refreshToken: refreshToken ? SecretString.from(refreshToken.trim()) : undefined,
      expiresAt,
    };
    return this;
  }

  /**
   * Sets the base URL for the Airtable API.
   * @param url - The base URL (e.g., 'https://api.airtable.com/v0')
   * @returns This builder instance for chaining
   */
  withBaseUrl(url: string): this {
    if (!url || url.trim().length === 0) {
      throw new Error('Base URL cannot be empty');
    }
    // Validate URL format
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new Error('Base URL must use HTTP or HTTPS protocol');
      }
      // Remove trailing slash
      this.baseUrl = url.replace(/\/$/, '');
    } catch (error) {
      if (error instanceof Error && error.message.includes('protocol')) {
        throw error;
      }
      throw new Error('Invalid base URL format');
    }
    return this;
  }

  /**
   * Sets the request timeout.
   * @param ms - Timeout in milliseconds
   * @returns This builder instance for chaining
   */
  withTimeout(ms: number): this {
    if (ms <= 0) {
      throw new Error('Request timeout must be positive');
    }
    this.requestTimeoutMs = ms;
    return this;
  }

  /**
   * Sets the rate limit strategy.
   * @param strategy - Rate limit handling strategy
   * @returns This builder instance for chaining
   */
  withRateLimitStrategy(strategy: RateLimitStrategy): this {
    // Strategy is mainly for documentation/future use
    // The actual behavior is controlled by rateLimitConfig
    return this;
  }

  /**
   * Sets the simulation mode.
   * @param mode - Simulation mode (Disabled, Record, or Replay)
   * @returns This builder instance for chaining
   */
  withSimulationMode(mode: SimulationMode): this {
    this.simulationMode = mode;
    return this;
  }

  /**
   * Sets the retry configuration.
   * @param config - Partial retry configuration to merge with defaults
   * @returns This builder instance for chaining
   */
  withRetryConfig(config: Partial<RetryConfig>): this {
    this.retryConfig = { ...this.retryConfig, ...config };
    return this;
  }

  /**
   * Sets the circuit breaker configuration.
   * @param config - Partial circuit breaker configuration to merge with defaults
   * @returns This builder instance for chaining
   */
  withCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): this {
    this.circuitBreakerConfig = { ...this.circuitBreakerConfig, ...config };
    return this;
  }

  /**
   * Sets the rate limit configuration.
   * @param config - Partial rate limit configuration to merge with defaults
   * @returns This builder instance for chaining
   */
  withRateLimitConfig(config: Partial<RateLimitConfig>): this {
    this.rateLimitConfig = { ...this.rateLimitConfig, ...config };
    return this;
  }

  /**
   * Sets the user agent string.
   * @param userAgent - User agent string
   * @returns This builder instance for chaining
   */
  withUserAgent(userAgent: string): this {
    this.userAgent = userAgent;
    return this;
  }

  /**
   * Sets webhook configuration with secrets.
   * @param secrets - Map of webhook ID to secret string
   * @param timestampToleranceMs - Optional timestamp tolerance in ms
   * @returns This builder instance for chaining
   */
  withWebhookConfig(secrets: Map<string, string>, timestampToleranceMs?: number): this {
    const secretMap = new Map<string, SecretString>();
    secrets.forEach((value, key) => {
      secretMap.set(key, SecretString.from(value));
    });
    this.webhookConfig = {
      secrets: secretMap,
      timestampToleranceMs: timestampToleranceMs ?? DEFAULT_WEBHOOK_TIMESTAMP_TOLERANCE_MS,
    };
    return this;
  }

  /**
   * Creates a builder from environment variables.
   *
   * Environment variables:
   * - AIRTABLE_API_KEY or AIRTABLE_PAT: Personal Access Token (required)
   * - AIRTABLE_OAUTH_ACCESS_TOKEN: OAuth access token
   * - AIRTABLE_OAUTH_REFRESH_TOKEN: OAuth refresh token
   * - AIRTABLE_BASE_URL: Custom base URL (optional)
   * - AIRTABLE_TIMEOUT_MS: Request timeout in milliseconds
   * - AIRTABLE_RATE_LIMIT_RPS: Rate limit requests per second
   * - AIRTABLE_MAX_RETRIES: Maximum retry attempts
   * - AIRTABLE_SIMULATION_MODE: Simulation mode (disabled, record, replay)
   *
   * @returns A new builder instance configured from environment
   */
  static fromEnv(): AirtableConfigBuilder {
    const builder = new AirtableConfigBuilder();

    // Authentication - try PAT first, then OAuth
    const pat = process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY;
    const oauthAccessToken = process.env.AIRTABLE_OAUTH_ACCESS_TOKEN;
    const oauthRefreshToken = process.env.AIRTABLE_OAUTH_REFRESH_TOKEN;

    if (oauthAccessToken) {
      builder.withOAuth(oauthAccessToken, oauthRefreshToken);
    } else if (pat) {
      builder.withToken(pat);
    }

    // Base URL
    const baseUrl = process.env.AIRTABLE_BASE_URL;
    if (baseUrl) {
      builder.withBaseUrl(baseUrl);
    }

    // Timeout
    const timeout = process.env.AIRTABLE_TIMEOUT_MS;
    if (timeout) {
      const timeoutMs = parseInt(timeout, 10);
      if (!isNaN(timeoutMs)) {
        builder.withTimeout(timeoutMs);
      }
    }

    // Rate limit
    const rateLimit = process.env.AIRTABLE_RATE_LIMIT_RPS;
    if (rateLimit) {
      const rps = parseInt(rateLimit, 10);
      if (!isNaN(rps)) {
        builder.withRateLimitConfig({ requestsPerSecond: rps });
      }
    }

    // Max retries
    const maxRetries = process.env.AIRTABLE_MAX_RETRIES;
    if (maxRetries) {
      const retries = parseInt(maxRetries, 10);
      if (!isNaN(retries)) {
        builder.withRetryConfig({ maxRetries: retries });
      }
    }

    // Simulation mode
    const simMode = process.env.AIRTABLE_SIMULATION_MODE;
    if (simMode) {
      const mode = simMode.toLowerCase();
      if (mode === 'record') {
        builder.withSimulationMode(SimulationMode.Record);
      } else if (mode === 'replay') {
        builder.withSimulationMode(SimulationMode.Replay);
      } else if (mode === 'disabled') {
        builder.withSimulationMode(SimulationMode.Disabled);
      }
    }

    return builder;
  }

  /**
   * Builds the Airtable configuration.
   * @throws Error if required fields are missing
   * @returns The complete Airtable configuration
   */
  build(): AirtableConfig {
    if (!this.auth) {
      throw new Error('Authentication is required (use withToken() or withOAuth())');
    }

    return {
      baseUrl: this.baseUrl,
      auth: this.auth,
      requestTimeoutMs: this.requestTimeoutMs,
      userAgent: this.userAgent,
      rateLimitConfig: { ...this.rateLimitConfig },
      retryConfig: { ...this.retryConfig },
      circuitBreakerConfig: { ...this.circuitBreakerConfig },
      webhookConfig: this.webhookConfig,
      simulationMode: this.simulationMode,
    };
  }
}
