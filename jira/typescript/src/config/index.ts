/**
 * Jira client configuration and builder following SPARC specification.
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
 * Rate limit configuration.
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
 * Authentication method types.
 */
export type AuthMethod =
  | { type: 'api_token'; email: string; token: string }
  | { type: 'oauth'; clientId: string; clientSecret: string; refreshToken: string; accessToken?: string }
  | { type: 'connect_jwt'; sharedSecret: string; issuer: string };

// ============================================================================
// Cache Configuration
// ============================================================================

/**
 * Cache configuration.
 */
export interface CacheConfig {
  /** Enable caching. Default: true */
  enabled: boolean;
  /** Fields cache TTL (ms). Default: 3600000 (1 hour) */
  fieldsTtlMs: number;
  /** Transitions cache TTL (ms). Default: 900000 (15 min) */
  transitionsTtlMs: number;
}

// ============================================================================
// Webhook Configuration
// ============================================================================

/**
 * Webhook configuration.
 */
export interface WebhookConfig {
  /** Webhook secrets (supports rotation with multiple secrets) */
  secrets: string[];
  /** Maximum event age (ms). Default: 300000 (5 min) */
  maxEventAgeMs: number;
  /** Idempotency cache TTL (ms). Default: 86400000 (24 hours) */
  idempotencyTtlMs: number;
}

// ============================================================================
// Bulk Operations Configuration
// ============================================================================

/**
 * Bulk operations configuration.
 */
export interface BulkConfig {
  /** Maximum issues per bulk request. Default: 50 */
  batchSize: number;
  /** Maximum concurrent transitions. Default: 10 */
  maxConcurrentTransitions: number;
}

// ============================================================================
// Main Configuration Interface
// ============================================================================

/**
 * Jira client configuration.
 */
export interface JiraConfig {
  /** Jira site URL (e.g., "https://your-domain.atlassian.net") */
  siteUrl: string;
  /** API version path. Default: "/rest/api/3" */
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
  /** Cache configuration */
  cacheConfig: CacheConfig;
  /** Webhook configuration */
  webhookConfig: WebhookConfig;
  /** Bulk operations configuration */
  bulkConfig: BulkConfig;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default rate limit configuration.
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
 * Default cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  fieldsTtlMs: 3600000, // 1 hour
  transitionsTtlMs: 900000, // 15 minutes
};

/**
 * Default webhook configuration.
 */
export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  secrets: [],
  maxEventAgeMs: 300000, // 5 minutes
  idempotencyTtlMs: 86400000, // 24 hours
};

/**
 * Default bulk configuration.
 */
export const DEFAULT_BULK_CONFIG: BulkConfig = {
  batchSize: 50,
  maxConcurrentTransitions: 10,
};

/**
 * Default request timeout.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Default user agent.
 */
export const DEFAULT_USER_AGENT = 'LLMDevOps-Jira/1.0.0';

/**
 * Jira API v3 path.
 */
export const JIRA_API_V3 = '/rest/api/3';

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
 * Builder for Jira client configuration.
 */
export class JiraConfigBuilder {
  private siteUrl?: string;
  private apiVersion: string = JIRA_API_V3;
  private auth?: AuthMethod;
  private rateLimitConfig: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG };
  private retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG };
  private circuitBreakerConfig: CircuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG };
  private simulationMode: SimulationMode = { type: 'disabled' };
  private requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS;
  private userAgent: string = DEFAULT_USER_AGENT;
  private cacheConfig: CacheConfig = { ...DEFAULT_CACHE_CONFIG };
  private webhookConfig: WebhookConfig = { ...DEFAULT_WEBHOOK_CONFIG };
  private bulkConfig: BulkConfig = { ...DEFAULT_BULK_CONFIG };

  /**
   * Sets the Jira site URL.
   * @param url - The site URL (e.g., "https://your-domain.atlassian.net")
   */
  withSiteUrl(url: string): this {
    if (!url || url.trim().length === 0) {
      throw new ConfigurationError('Site URL cannot be empty');
    }
    // Validate URL format
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new ConfigurationError('Site URL must use HTTP or HTTPS protocol');
      }
      // Remove trailing slash
      this.siteUrl = url.replace(/\/$/, '');
    } catch {
      throw new ConfigurationError('Invalid site URL format');
    }
    return this;
  }

  /**
   * Sets API token authentication.
   * @param email - User email
   * @param token - API token
   */
  withApiToken(email: string, token: string): this {
    if (!email || email.trim().length === 0) {
      throw new ConfigurationError('Email cannot be empty for API token auth');
    }
    if (!token || token.trim().length === 0) {
      throw new ConfigurationError('API token cannot be empty');
    }
    this.auth = {
      type: 'api_token',
      email: email.trim(),
      token: token.trim(),
    };
    return this;
  }

  /**
   * Sets OAuth 2.0 authentication.
   * @param clientId - OAuth client ID
   * @param clientSecret - OAuth client secret
   * @param refreshToken - OAuth refresh token
   * @param accessToken - Optional initial access token
   */
  withOAuth(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    accessToken?: string
  ): this {
    if (!clientId || clientId.trim().length === 0) {
      throw new ConfigurationError('OAuth client ID cannot be empty');
    }
    if (!clientSecret || clientSecret.trim().length === 0) {
      throw new ConfigurationError('OAuth client secret cannot be empty');
    }
    if (!refreshToken || refreshToken.trim().length === 0) {
      throw new ConfigurationError('OAuth refresh token cannot be empty');
    }
    this.auth = {
      type: 'oauth',
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      refreshToken: refreshToken.trim(),
      accessToken: accessToken?.trim(),
    };
    return this;
  }

  /**
   * Sets Atlassian Connect JWT authentication.
   * @param sharedSecret - Connect app shared secret
   * @param issuer - Connect app key (issuer)
   */
  withConnectJwt(sharedSecret: string, issuer: string): this {
    if (!sharedSecret || sharedSecret.trim().length === 0) {
      throw new ConfigurationError('Connect shared secret cannot be empty');
    }
    if (!issuer || issuer.trim().length === 0) {
      throw new ConfigurationError('Connect issuer cannot be empty');
    }
    this.auth = {
      type: 'connect_jwt',
      sharedSecret: sharedSecret.trim(),
      issuer: issuer.trim(),
    };
    return this;
  }

  /**
   * Sets the API version path.
   * @param version - API version path (e.g., "/rest/api/3")
   */
  withApiVersion(version: string): this {
    this.apiVersion = version;
    return this;
  }

  /**
   * Sets the rate limit configuration.
   */
  withRateLimitConfig(config: Partial<RateLimitConfig>): this {
    this.rateLimitConfig = { ...this.rateLimitConfig, ...config };
    return this;
  }

  /**
   * Sets the retry configuration.
   */
  withRetryConfig(config: Partial<RetryConfig>): this {
    this.retryConfig = { ...this.retryConfig, ...config };
    return this;
  }

  /**
   * Sets the circuit breaker configuration.
   */
  withCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): this {
    this.circuitBreakerConfig = { ...this.circuitBreakerConfig, ...config };
    return this;
  }

  /**
   * Enables recording simulation mode.
   * @param path - Path to save recordings
   */
  withRecording(path: string): this {
    this.simulationMode = { type: 'recording', path };
    return this;
  }

  /**
   * Enables replay simulation mode.
   * @param path - Path to load recordings from
   */
  withReplay(path: string): this {
    this.simulationMode = { type: 'replay', path };
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
    this.userAgent = userAgent;
    return this;
  }

  /**
   * Sets the cache configuration.
   */
  withCacheConfig(config: Partial<CacheConfig>): this {
    this.cacheConfig = { ...this.cacheConfig, ...config };
    return this;
  }

  /**
   * Sets webhook secrets.
   * @param secrets - Array of webhook secrets (supports rotation)
   */
  withWebhookSecrets(secrets: string[]): this {
    this.webhookConfig = {
      ...this.webhookConfig,
      secrets: secrets.filter(s => s.trim().length > 0),
    };
    return this;
  }

  /**
   * Sets the webhook configuration.
   */
  withWebhookConfig(config: Partial<WebhookConfig>): this {
    this.webhookConfig = { ...this.webhookConfig, ...config };
    return this;
  }

  /**
   * Sets the bulk operations configuration.
   */
  withBulkConfig(config: Partial<BulkConfig>): this {
    if (config.batchSize !== undefined && (config.batchSize <= 0 || config.batchSize > 50)) {
      throw new ConfigurationError('Bulk batch size must be between 1 and 50');
    }
    this.bulkConfig = { ...this.bulkConfig, ...config };
    return this;
  }

  /**
   * Creates a builder from environment variables.
   *
   * Environment variables:
   * - JIRA_SITE_URL: Site URL (required)
   * - JIRA_AUTH_METHOD: Auth method (api_token, oauth, connect_jwt)
   * - JIRA_AUTH_EMAIL: Email for API token auth
   * - JIRA_API_TOKEN: API token
   * - JIRA_OAUTH_CLIENT_ID: OAuth client ID
   * - JIRA_OAUTH_CLIENT_SECRET: OAuth client secret
   * - JIRA_OAUTH_REFRESH_TOKEN: OAuth refresh token
   * - JIRA_CONNECT_SHARED_SECRET: Connect JWT shared secret
   * - JIRA_CONNECT_ISSUER: Connect JWT issuer
   * - JIRA_WEBHOOK_SECRET: Webhook secret(s), comma-separated
   * - JIRA_TIMEOUT_SECONDS: Request timeout in seconds
   * - JIRA_RATE_LIMIT_RPS: Rate limit requests per second
   * - JIRA_MAX_RETRIES: Maximum retry attempts
   */
  static fromEnv(): JiraConfigBuilder {
    const builder = new JiraConfigBuilder();

    const siteUrl = process.env.JIRA_SITE_URL;
    if (siteUrl) {
      builder.withSiteUrl(siteUrl);
    }

    const authMethod = process.env.JIRA_AUTH_METHOD ?? 'api_token';
    switch (authMethod) {
      case 'api_token': {
        const email = process.env.JIRA_AUTH_EMAIL;
        const token = process.env.JIRA_API_TOKEN;
        if (email && token) {
          builder.withApiToken(email, token);
        }
        break;
      }
      case 'oauth': {
        const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
        const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;
        const refreshToken = process.env.JIRA_OAUTH_REFRESH_TOKEN;
        if (clientId && clientSecret && refreshToken) {
          builder.withOAuth(clientId, clientSecret, refreshToken);
        }
        break;
      }
      case 'connect_jwt': {
        const sharedSecret = process.env.JIRA_CONNECT_SHARED_SECRET;
        const issuer = process.env.JIRA_CONNECT_ISSUER;
        if (sharedSecret && issuer) {
          builder.withConnectJwt(sharedSecret, issuer);
        }
        break;
      }
    }

    const webhookSecret = process.env.JIRA_WEBHOOK_SECRET;
    if (webhookSecret) {
      builder.withWebhookSecrets(webhookSecret.split(','));
    }

    const timeout = process.env.JIRA_TIMEOUT_SECONDS;
    if (timeout) {
      builder.withRequestTimeout(parseInt(timeout, 10) * 1000);
    }

    const rateLimit = process.env.JIRA_RATE_LIMIT_RPS;
    if (rateLimit) {
      builder.withRateLimitConfig({ requestsPerSecond: parseInt(rateLimit, 10) });
    }

    const maxRetries = process.env.JIRA_MAX_RETRIES;
    if (maxRetries) {
      builder.withRetryConfig({ maxRetries: parseInt(maxRetries, 10) });
    }

    return builder;
  }

  /**
   * Builds the Jira configuration.
   * @throws ConfigurationError if required fields are missing
   */
  build(): JiraConfig {
    if (!this.siteUrl) {
      throw new ConfigurationError('Site URL is required');
    }
    if (!this.auth) {
      throw new NoAuthenticationError();
    }

    return {
      siteUrl: this.siteUrl,
      apiVersion: this.apiVersion,
      auth: this.auth,
      rateLimitConfig: { ...this.rateLimitConfig },
      retryConfig: { ...this.retryConfig },
      circuitBreakerConfig: { ...this.circuitBreakerConfig },
      simulationMode: this.simulationMode,
      requestTimeoutMs: this.requestTimeoutMs,
      userAgent: this.userAgent,
      cacheConfig: { ...this.cacheConfig },
      webhookConfig: { ...this.webhookConfig },
      bulkConfig: { ...this.bulkConfig },
    };
  }
}
