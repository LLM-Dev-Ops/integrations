/**
 * Salesforce client configuration and builder following SPARC specification.
 */

import { ConfigurationError, NoAuthenticationError } from '../errors/index.js';

// ============================================================================
// Simulation Mode
// ============================================================================

/**
 * Simulation mode for testing.
 */
export type SimulationMode =
  | { type: 'disabled' }
  | { type: 'recording'; path: string }
  | { type: 'replay'; path: string };

// ============================================================================
// Rate Limit Configuration
// ============================================================================

/**
 * Rate limit configuration for Salesforce API.
 */
export interface RateLimitConfig {
  /** Requests per second limit. Default: 10 */
  requestsPerSecond: number;
  /** Maximum time to wait in queue (ms). Default: 30000 */
  queueTimeout: number;
  /** Maximum pending requests in queue. Default: 100 */
  maxQueueSize: number;
  /** Whether to adapt rate based on 429 responses. Default: true */
  adaptiveRateLimit: boolean;
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration.
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
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Failure threshold before opening circuit. Default: 5 */
  failureThreshold: number;
  /** Success threshold to close circuit. Default: 2 */
  successThreshold: number;
  /** Reset timeout (ms). Default: 30000 */
  resetTimeoutMs: number;
  /** Enable circuit breaker. Default: true */
  enabled: boolean;
}

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * JWT Bearer Flow authentication.
 * Used for server-to-server integration with RSA key pair.
 */
export interface JwtBearerAuth {
  type: 'jwt_bearer';
  /** OAuth client ID (Connected App consumer key) */
  clientId: string;
  /** RSA private key in PEM format */
  privateKey: string;
  /** Salesforce username */
  username: string;
  /** Optional Salesforce instance URL for token exchange */
  instanceUrl?: string;
  /** Optional custom token endpoint URL */
  tokenUrl?: string;
}

/**
 * Refresh Token Flow authentication.
 * Used for delegated access with a previously obtained refresh token.
 */
export interface RefreshTokenAuth {
  type: 'refresh_token';
  /** OAuth client ID (Connected App consumer key) */
  clientId: string;
  /** OAuth client secret (Connected App consumer secret) */
  clientSecret: string;
  /** OAuth refresh token */
  refreshToken: string;
  /** Optional initial access token */
  accessToken?: string;
  /** Optional Salesforce instance URL for token refresh */
  instanceUrl?: string;
  /** Optional custom token endpoint URL */
  tokenUrl?: string;
}

/**
 * Authentication method types.
 * Supports OAuth 2.0 JWT Bearer and Refresh Token flows.
 */
export type AuthMethod = JwtBearerAuth | RefreshTokenAuth;

// ============================================================================
// Main Configuration Interface
// ============================================================================

/**
 * Salesforce client configuration.
 */
export interface SalesforceConfig {
  /** Salesforce instance URL (e.g., "https://your-org.my.salesforce.com") */
  instanceUrl: string;
  /** API version (e.g., "v59.0"). Default: "v59.0" */
  apiVersion: string;
  /** Authentication method */
  auth: AuthMethod;
  /** Rate limit configuration */
  rateLimitConfig: RateLimitConfig;
  /** Retry configuration */
  retryConfig: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreakerConfig: CircuitBreakerConfig;
  /** Simulation mode */
  simulationMode: SimulationMode;
  /** Request timeout in milliseconds. Default: 30000 */
  requestTimeoutMs: number;
  /** User agent string */
  userAgent: string;
  /** Enable API limits tracking via Limits API. Default: true */
  trackLimits: boolean;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default rate limit configuration.
 * Salesforce has org-specific limits, these are conservative defaults.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  requestsPerSecond: 10,
  queueTimeout: 30000,
  maxQueueSize: 100,
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
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  enabled: true,
};

/**
 * Default request timeout.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Default user agent.
 */
export const DEFAULT_USER_AGENT = 'LLMDevOps-Salesforce/1.0.0';

/**
 * Default Salesforce API version.
 */
export const DEFAULT_API_VERSION = 'v59.0';

// ============================================================================
// SecretString
// ============================================================================

/**
 * SecretString wrapper to prevent accidental logging of sensitive values.
 * The value is only accessible via the expose() method.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Exposes the secret value. Use with caution.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns a redacted string for logging.
   */
  toString(): string {
    return '[REDACTED]';
  }

  /**
   * Returns a redacted value for JSON serialization.
   */
  toJSON(): string {
    return '[REDACTED]';
  }
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builder for Salesforce client configuration.
 */
export class SalesforceConfigBuilder {
  private instanceUrl?: string;
  private apiVersion: string = DEFAULT_API_VERSION;
  private auth?: AuthMethod;
  private rateLimitConfig: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG };
  private retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG };
  private circuitBreakerConfig: CircuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG };
  private simulationMode: SimulationMode = { type: 'disabled' };
  private requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS;
  private userAgent: string = DEFAULT_USER_AGENT;
  private trackLimits: boolean = true;

  /**
   * Sets the Salesforce instance URL.
   * @param url - The instance URL (e.g., "https://your-org.my.salesforce.com")
   */
  withInstanceUrl(url: string): this {
    if (!url || url.trim().length === 0) {
      throw new ConfigurationError('Instance URL cannot be empty');
    }
    // Validate URL format
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new ConfigurationError('Instance URL must use HTTP or HTTPS protocol');
      }
      // Remove trailing slash
      this.instanceUrl = url.replace(/\/$/, '');
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      throw new ConfigurationError('Invalid instance URL format');
    }
    return this;
  }

  /**
   * Sets JWT Bearer Flow authentication.
   * Used for server-to-server integration with RSA key pair.
   *
   * @param clientId - OAuth client ID (Connected App consumer key)
   * @param privateKey - RSA private key in PEM format
   * @param username - Salesforce username
   */
  withJwtBearer(clientId: string, privateKey: string, username: string): this {
    if (!clientId || clientId.trim().length === 0) {
      throw new ConfigurationError('JWT Bearer client ID cannot be empty');
    }
    if (!privateKey || privateKey.trim().length === 0) {
      throw new ConfigurationError('JWT Bearer private key cannot be empty');
    }
    if (!username || username.trim().length === 0) {
      throw new ConfigurationError('JWT Bearer username cannot be empty');
    }
    // Validate private key format (basic check)
    if (!privateKey.includes('BEGIN') || !privateKey.includes('PRIVATE KEY')) {
      throw new ConfigurationError('Private key must be in PEM format');
    }
    this.auth = {
      type: 'jwt_bearer',
      clientId: clientId.trim(),
      privateKey: privateKey.trim(),
      username: username.trim(),
    };
    return this;
  }

  /**
   * Sets Refresh Token Flow authentication.
   * Used for delegated access with a previously obtained refresh token.
   *
   * @param clientId - OAuth client ID (Connected App consumer key)
   * @param clientSecret - OAuth client secret (Connected App consumer secret)
   * @param refreshToken - OAuth refresh token
   * @param accessToken - Optional initial access token
   */
  withRefreshToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    accessToken?: string
  ): this {
    if (!clientId || clientId.trim().length === 0) {
      throw new ConfigurationError('Refresh Token client ID cannot be empty');
    }
    if (!clientSecret || clientSecret.trim().length === 0) {
      throw new ConfigurationError('Refresh Token client secret cannot be empty');
    }
    if (!refreshToken || refreshToken.trim().length === 0) {
      throw new ConfigurationError('Refresh Token cannot be empty');
    }
    this.auth = {
      type: 'refresh_token',
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      refreshToken: refreshToken.trim(),
      accessToken: accessToken?.trim(),
    };
    return this;
  }

  /**
   * Sets the API version.
   * @param version - API version (e.g., "v59.0")
   */
  withApiVersion(version: string): this {
    if (!version || version.trim().length === 0) {
      throw new ConfigurationError('API version cannot be empty');
    }
    // Validate version format (vXX.0)
    if (!/^v\d+\.\d+$/.test(version.trim())) {
      throw new ConfigurationError('API version must be in format "vXX.X" (e.g., "v59.0")');
    }
    this.apiVersion = version.trim();
    return this;
  }

  /**
   * Sets the rate limit configuration.
   */
  withRateLimitConfig(config: Partial<RateLimitConfig>): this {
    this.rateLimitConfig = { ...this.rateLimitConfig, ...config };
    if (this.rateLimitConfig.requestsPerSecond <= 0) {
      throw new ConfigurationError('Requests per second must be positive');
    }
    if (this.rateLimitConfig.queueTimeout < 0) {
      throw new ConfigurationError('Queue timeout cannot be negative');
    }
    if (this.rateLimitConfig.maxQueueSize < 0) {
      throw new ConfigurationError('Max queue size cannot be negative');
    }
    return this;
  }

  /**
   * Sets the retry configuration.
   */
  withRetryConfig(config: Partial<RetryConfig>): this {
    this.retryConfig = { ...this.retryConfig, ...config };
    if (this.retryConfig.maxRetries < 0) {
      throw new ConfigurationError('Max retries cannot be negative');
    }
    if (this.retryConfig.maxRateLimitRetries < 0) {
      throw new ConfigurationError('Max rate limit retries cannot be negative');
    }
    if (this.retryConfig.initialBackoffMs <= 0) {
      throw new ConfigurationError('Initial backoff must be positive');
    }
    if (this.retryConfig.maxBackoffMs <= 0) {
      throw new ConfigurationError('Max backoff must be positive');
    }
    if (this.retryConfig.backoffMultiplier <= 1) {
      throw new ConfigurationError('Backoff multiplier must be greater than 1');
    }
    if (this.retryConfig.jitterFactor < 0 || this.retryConfig.jitterFactor > 1) {
      throw new ConfigurationError('Jitter factor must be between 0 and 1');
    }
    return this;
  }

  /**
   * Sets the circuit breaker configuration.
   */
  withCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): this {
    this.circuitBreakerConfig = { ...this.circuitBreakerConfig, ...config };
    if (this.circuitBreakerConfig.failureThreshold <= 0) {
      throw new ConfigurationError('Failure threshold must be positive');
    }
    if (this.circuitBreakerConfig.successThreshold <= 0) {
      throw new ConfigurationError('Success threshold must be positive');
    }
    if (this.circuitBreakerConfig.resetTimeoutMs <= 0) {
      throw new ConfigurationError('Reset timeout must be positive');
    }
    return this;
  }

  /**
   * Enables recording simulation mode.
   * @param path - Path to save recordings
   */
  withRecording(path: string): this {
    if (!path || path.trim().length === 0) {
      throw new ConfigurationError('Recording path cannot be empty');
    }
    this.simulationMode = { type: 'recording', path: path.trim() };
    return this;
  }

  /**
   * Enables replay simulation mode.
   * @param path - Path to load recordings from
   */
  withReplay(path: string): this {
    if (!path || path.trim().length === 0) {
      throw new ConfigurationError('Replay path cannot be empty');
    }
    this.simulationMode = { type: 'replay', path: path.trim() };
    return this;
  }

  /**
   * Sets the request timeout.
   * @param timeoutMs - Timeout in milliseconds
   */
  withRequestTimeout(timeoutMs: number): this {
    if (timeoutMs <= 0) {
      throw new ConfigurationError('Request timeout must be positive');
    }
    this.requestTimeoutMs = timeoutMs;
    return this;
  }

  /**
   * Sets the user agent string.
   * @param userAgent - User agent string
   */
  withUserAgent(userAgent: string): this {
    if (!userAgent || userAgent.trim().length === 0) {
      throw new ConfigurationError('User agent cannot be empty');
    }
    this.userAgent = userAgent.trim();
    return this;
  }

  /**
   * Sets whether to track API limits via the Limits API.
   * @param track - Enable or disable limits tracking
   */
  withTrackLimits(track: boolean): this {
    this.trackLimits = track;
    return this;
  }

  /**
   * Creates a builder from environment variables.
   *
   * Environment variables:
   * - SF_INSTANCE_URL: Instance URL (required)
   * - SF_AUTH_METHOD: Auth method (jwt_bearer or refresh_token). Default: jwt_bearer
   * - SF_CLIENT_ID: OAuth client ID (required)
   * - SF_PRIVATE_KEY: Private key for JWT Bearer (required for jwt_bearer)
   * - SF_USERNAME: Username for JWT Bearer (required for jwt_bearer)
   * - SF_CLIENT_SECRET: Client secret for Refresh Token (required for refresh_token)
   * - SF_REFRESH_TOKEN: Refresh token (required for refresh_token)
   * - SF_ACCESS_TOKEN: Initial access token (optional for refresh_token)
   * - SF_API_VERSION: API version (default: v59.0)
   * - SF_TIMEOUT_SECONDS: Request timeout in seconds
   * - SF_RATE_LIMIT_RPS: Rate limit requests per second
   * - SF_MAX_RETRIES: Maximum retry attempts
   * - SF_TRACK_LIMITS: Enable limits tracking (true/false)
   */
  static fromEnv(): SalesforceConfigBuilder {
    const builder = new SalesforceConfigBuilder();

    const instanceUrl = process.env.SF_INSTANCE_URL;
    if (instanceUrl) {
      builder.withInstanceUrl(instanceUrl);
    }

    const apiVersion = process.env.SF_API_VERSION;
    if (apiVersion) {
      builder.withApiVersion(apiVersion);
    }

    const authMethod = process.env.SF_AUTH_METHOD ?? 'jwt_bearer';
    const clientId = process.env.SF_CLIENT_ID;

    switch (authMethod) {
      case 'jwt_bearer': {
        const privateKey = process.env.SF_PRIVATE_KEY;
        const username = process.env.SF_USERNAME;
        if (clientId && privateKey && username) {
          builder.withJwtBearer(clientId, privateKey, username);
        }
        break;
      }
      case 'refresh_token': {
        const clientSecret = process.env.SF_CLIENT_SECRET;
        const refreshToken = process.env.SF_REFRESH_TOKEN;
        const accessToken = process.env.SF_ACCESS_TOKEN;
        if (clientId && clientSecret && refreshToken) {
          builder.withRefreshToken(clientId, clientSecret, refreshToken, accessToken);
        }
        break;
      }
      default:
        throw new ConfigurationError(`Unknown auth method: ${authMethod}`);
    }

    const timeout = process.env.SF_TIMEOUT_SECONDS;
    if (timeout) {
      const timeoutNum = parseInt(timeout, 10);
      if (!isNaN(timeoutNum)) {
        builder.withRequestTimeout(timeoutNum * 1000);
      }
    }

    const rateLimit = process.env.SF_RATE_LIMIT_RPS;
    if (rateLimit) {
      const rateLimitNum = parseInt(rateLimit, 10);
      if (!isNaN(rateLimitNum)) {
        builder.withRateLimitConfig({ requestsPerSecond: rateLimitNum });
      }
    }

    const maxRetries = process.env.SF_MAX_RETRIES;
    if (maxRetries) {
      const maxRetriesNum = parseInt(maxRetries, 10);
      if (!isNaN(maxRetriesNum)) {
        builder.withRetryConfig({ maxRetries: maxRetriesNum });
      }
    }

    const trackLimits = process.env.SF_TRACK_LIMITS;
    if (trackLimits !== undefined) {
      builder.withTrackLimits(trackLimits.toLowerCase() === 'true');
    }

    return builder;
  }

  /**
   * Builds the Salesforce configuration.
   * @throws ConfigurationError if required fields are missing or invalid
   */
  build(): SalesforceConfig {
    if (!this.instanceUrl) {
      throw new ConfigurationError('Instance URL is required');
    }
    if (!this.auth) {
      throw new NoAuthenticationError();
    }

    return {
      instanceUrl: this.instanceUrl,
      apiVersion: this.apiVersion,
      auth: this.auth,
      rateLimitConfig: { ...this.rateLimitConfig },
      retryConfig: { ...this.retryConfig },
      circuitBreakerConfig: { ...this.circuitBreakerConfig },
      simulationMode: this.simulationMode,
      requestTimeoutMs: this.requestTimeoutMs,
      userAgent: this.userAgent,
      trackLimits: this.trackLimits,
    };
  }
}
