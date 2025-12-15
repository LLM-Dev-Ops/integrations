/**
 * Microsoft Teams Configuration Module
 *
 * Following the SPARC specification for Teams integration.
 */

import { ConfigurationError } from '../errors.js';

// ============================================================================
// Constants
// ============================================================================

/** Microsoft Graph API base URL */
export const GRAPH_API_BASE_URL = 'https://graph.microsoft.com/v1.0';

/** Bot Framework service URL */
export const BOT_FRAMEWORK_URL = 'https://smba.trafficmanager.net';

/** Default user agent */
export const DEFAULT_USER_AGENT = 'LLMDevOps-Teams/1.0.0';

/** Default request timeout in milliseconds */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Default connection timeout in milliseconds */
export const DEFAULT_CONNECTION_TIMEOUT_MS = 10000;

/** Maximum card size in bytes (28KB) */
export const MAX_CARD_SIZE_BYTES = 28672;

/** Maximum text length in characters */
export const MAX_TEXT_LENGTH = 4096;

/** Maximum message size in bytes */
export const MAX_MESSAGE_SIZE_BYTES = 1048576;

/** Webhook rate limit (messages per second) */
export const WEBHOOK_RATE_LIMIT_PER_SECOND = 4.0;

/** Bot rate limit (messages per second) */
export const BOT_RATE_LIMIT_PER_SECOND = 1.0;

/** Maximum routing depth */
export const MAX_ROUTING_DEPTH = 5;

// ============================================================================
// SecretString
// ============================================================================

/**
 * SecretString wrapper to prevent accidental logging of sensitive values.
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

  toString(): string {
    return '[REDACTED]';
  }

  toJSON(): string {
    return '[REDACTED]';
  }
}

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Simulation mode for testing.
 */
export type SimulationMode =
  | { type: 'disabled' }
  | { type: 'recording'; path: string }
  | { type: 'replay'; path: string };

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Webhook messages per second. Default: 4 */
  webhookPerSecond: number;
  /** Bot messages per second. Default: 1 */
  botPerSecond: number;
  /** Maximum time to wait in queue (ms). Default: 30000 */
  queueTimeout: number;
  /** Maximum pending requests in queue. Default: 100 */
  maxQueueSize: number;
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum retry attempts. Default: 3 */
  maxRetries: number;
  /** Initial backoff delay (ms). Default: 1000 */
  initialBackoffMs: number;
  /** Maximum backoff delay (ms). Default: 30000 */
  maxBackoffMs: number;
  /** Backoff multiplier. Default: 2 */
  backoffMultiplier: number;
  /** Jitter factor (0-1). Default: 0.25 */
  jitterFactor: number;
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit. Default: 5 */
  failureThreshold: number;
  /** Success threshold to close circuit. Default: 2 */
  successThreshold: number;
  /** Reset timeout in milliseconds. Default: 30000 */
  resetTimeoutMs: number;
}

/**
 * Authentication configuration for Teams.
 */
export interface TeamsAuthConfig {
  /** Application client ID */
  clientId: string;
  /** Application client secret */
  clientSecret: SecretString;
  /** Tenant ID (or 'common' for multi-tenant) */
  tenantId: string;
  /** Bot application ID (optional, for Bot Framework) */
  botAppId?: string;
  /** Bot application secret (optional, for Bot Framework) */
  botAppSecret?: SecretString;
}

/**
 * Endpoint configuration.
 */
export interface TeamsEndpoints {
  /** Graph API URL. Default: https://graph.microsoft.com/v1.0 */
  graphUrl: string;
  /** Bot Framework URL. Default: https://smba.trafficmanager.net */
  botFrameworkUrl: string;
  /** Login URL for token acquisition */
  loginUrl: string;
}

/**
 * Resilience configuration.
 */
export interface TeamsResilienceConfig {
  /** Retry configuration */
  retry: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;
  /** Rate limit configuration */
  rateLimit: RateLimitConfig;
  /** Request timeout (ms). Default: 30000 */
  requestTimeoutMs: number;
  /** Connection timeout (ms). Default: 10000 */
  connectionTimeoutMs: number;
}

/**
 * Multi-tenant configuration.
 */
export interface MultiTenantConfig {
  /** Enable multi-tenant support */
  enabled: boolean;
  /** Allowed tenant IDs (null = all allowed) */
  allowedTenants?: string[];
}

/**
 * Full Teams client configuration.
 */
export interface TeamsConfig {
  /** Authentication configuration */
  auth?: TeamsAuthConfig;
  /** Default webhook URL (for webhook-only usage) */
  defaultWebhookUrl?: SecretString;
  /** Endpoint configuration */
  endpoints: TeamsEndpoints;
  /** Resilience configuration */
  resilience: TeamsResilienceConfig;
  /** Multi-tenant configuration */
  multiTenant: MultiTenantConfig;
  /** Simulation mode */
  simulationMode: SimulationMode;
  /** User agent string */
  userAgent: string;
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  webhookPerSecond: WEBHOOK_RATE_LIMIT_PER_SECOND,
  botPerSecond: BOT_RATE_LIMIT_PER_SECOND,
  queueTimeout: 30000,
  maxQueueSize: 100,
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.25,
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
};

export const DEFAULT_ENDPOINTS: TeamsEndpoints = {
  graphUrl: GRAPH_API_BASE_URL,
  botFrameworkUrl: BOT_FRAMEWORK_URL,
  loginUrl: 'https://login.microsoftonline.com',
};

export const DEFAULT_RESILIENCE_CONFIG: TeamsResilienceConfig = {
  retry: DEFAULT_RETRY_CONFIG,
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
  rateLimit: DEFAULT_RATE_LIMIT_CONFIG,
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_MS,
};

export const DEFAULT_MULTI_TENANT_CONFIG: MultiTenantConfig = {
  enabled: false,
  allowedTenants: undefined,
};

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builder for Teams client configuration.
 */
export class TeamsConfigBuilder {
  private authConfig?: TeamsAuthConfig;
  private webhookUrl?: SecretString;
  private endpoints: TeamsEndpoints = { ...DEFAULT_ENDPOINTS };
  private resilience: TeamsResilienceConfig = { ...DEFAULT_RESILIENCE_CONFIG };
  private multiTenant: MultiTenantConfig = { ...DEFAULT_MULTI_TENANT_CONFIG };
  private simulationMode: SimulationMode = { type: 'disabled' };
  private userAgent: string = DEFAULT_USER_AGENT;

  /**
   * Sets Graph API credentials.
   */
  withGraphCredentials(clientId: string, clientSecret: string, tenantId: string): this {
    if (!clientId || clientId.trim().length === 0) {
      throw new ConfigurationError('Client ID cannot be empty');
    }
    if (!clientSecret || clientSecret.trim().length === 0) {
      throw new ConfigurationError('Client secret cannot be empty');
    }
    if (!tenantId || tenantId.trim().length === 0) {
      throw new ConfigurationError('Tenant ID cannot be empty');
    }

    this.authConfig = {
      clientId: clientId.trim(),
      clientSecret: new SecretString(clientSecret.trim()),
      tenantId: tenantId.trim(),
    };
    return this;
  }

  /**
   * Sets Bot Framework credentials.
   */
  withBotCredentials(botAppId: string, botAppSecret: string): this {
    if (!this.authConfig) {
      throw new ConfigurationError('Graph credentials must be set before bot credentials');
    }
    if (!botAppId || botAppId.trim().length === 0) {
      throw new ConfigurationError('Bot app ID cannot be empty');
    }
    if (!botAppSecret || botAppSecret.trim().length === 0) {
      throw new ConfigurationError('Bot app secret cannot be empty');
    }

    this.authConfig.botAppId = botAppId.trim();
    this.authConfig.botAppSecret = new SecretString(botAppSecret.trim());
    return this;
  }

  /**
   * Sets the default webhook URL.
   */
  withWebhook(url: string): this {
    if (!url || url.trim().length === 0) {
      throw new ConfigurationError('Webhook URL cannot be empty');
    }
    if (!this.isValidWebhookUrl(url)) {
      throw new ConfigurationError('Invalid Teams webhook URL format');
    }
    this.webhookUrl = new SecretString(url.trim());
    return this;
  }

  /**
   * Sets custom endpoints.
   */
  withEndpoints(endpoints: Partial<TeamsEndpoints>): this {
    this.endpoints = { ...this.endpoints, ...endpoints };
    return this;
  }

  /**
   * Sets retry configuration.
   */
  withRetryConfig(config: Partial<RetryConfig>): this {
    this.resilience = {
      ...this.resilience,
      retry: { ...this.resilience.retry, ...config },
    };
    return this;
  }

  /**
   * Sets circuit breaker configuration.
   */
  withCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): this {
    this.resilience = {
      ...this.resilience,
      circuitBreaker: { ...this.resilience.circuitBreaker, ...config },
    };
    return this;
  }

  /**
   * Sets rate limit configuration.
   */
  withRateLimitConfig(config: Partial<RateLimitConfig>): this {
    this.resilience = {
      ...this.resilience,
      rateLimit: { ...this.resilience.rateLimit, ...config },
    };
    return this;
  }

  /**
   * Sets request timeout.
   */
  withRequestTimeout(timeoutMs: number): this {
    if (timeoutMs <= 0) {
      throw new ConfigurationError('Request timeout must be positive');
    }
    this.resilience.requestTimeoutMs = timeoutMs;
    return this;
  }

  /**
   * Enables multi-tenant support.
   */
  withMultiTenant(allowedTenants?: string[]): this {
    this.multiTenant = {
      enabled: true,
      allowedTenants,
    };
    return this;
  }

  /**
   * Enables recording simulation mode.
   */
  withRecording(path: string): this {
    this.simulationMode = { type: 'recording', path };
    return this;
  }

  /**
   * Enables replay simulation mode.
   */
  withReplay(path: string): this {
    this.simulationMode = { type: 'replay', path };
    return this;
  }

  /**
   * Sets user agent string.
   */
  withUserAgent(userAgent: string): this {
    this.userAgent = userAgent;
    return this;
  }

  /**
   * Creates a builder from environment variables.
   */
  static fromEnv(): TeamsConfigBuilder {
    const builder = new TeamsConfigBuilder();

    // Graph API credentials
    const clientId = process.env.TEAMS_CLIENT_ID;
    const clientSecret = process.env.TEAMS_CLIENT_SECRET;
    const tenantId = process.env.TEAMS_TENANT_ID;

    if (clientId && clientSecret && tenantId) {
      builder.withGraphCredentials(clientId, clientSecret, tenantId);

      // Bot credentials (optional)
      const botAppId = process.env.TEAMS_BOT_APP_ID;
      const botAppSecret = process.env.TEAMS_BOT_APP_SECRET;
      if (botAppId && botAppSecret) {
        builder.withBotCredentials(botAppId, botAppSecret);
      }
    }

    // Webhook URL (optional)
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (webhookUrl) {
      builder.withWebhook(webhookUrl);
    }

    // Custom endpoints
    const graphUrl = process.env.TEAMS_GRAPH_URL;
    if (graphUrl) {
      builder.withEndpoints({ graphUrl });
    }

    const botFrameworkUrl = process.env.TEAMS_BOT_FRAMEWORK_URL;
    if (botFrameworkUrl) {
      builder.withEndpoints({ botFrameworkUrl });
    }

    // Retry configuration
    const maxRetries = process.env.TEAMS_MAX_RETRIES;
    if (maxRetries) {
      builder.withRetryConfig({ maxRetries: parseInt(maxRetries, 10) });
    }

    const initialBackoff = process.env.TEAMS_INITIAL_BACKOFF_MS;
    if (initialBackoff) {
      builder.withRetryConfig({ initialBackoffMs: parseInt(initialBackoff, 10) });
    }

    const maxBackoff = process.env.TEAMS_MAX_BACKOFF_MS;
    if (maxBackoff) {
      builder.withRetryConfig({ maxBackoffMs: parseInt(maxBackoff, 10) });
    }

    // Timeout configuration
    const requestTimeout = process.env.TEAMS_REQUEST_TIMEOUT_MS;
    if (requestTimeout) {
      builder.withRequestTimeout(parseInt(requestTimeout, 10));
    }

    // Circuit breaker configuration
    const cbThreshold = process.env.TEAMS_CIRCUIT_BREAKER_THRESHOLD;
    if (cbThreshold) {
      builder.withCircuitBreakerConfig({ failureThreshold: parseInt(cbThreshold, 10) });
    }

    const cbTimeout = process.env.TEAMS_CIRCUIT_BREAKER_TIMEOUT_MS;
    if (cbTimeout) {
      builder.withCircuitBreakerConfig({ resetTimeoutMs: parseInt(cbTimeout, 10) });
    }

    // Rate limit configuration
    const webhookRateLimit = process.env.TEAMS_WEBHOOK_RATE_LIMIT_PER_SECOND;
    if (webhookRateLimit) {
      builder.withRateLimitConfig({ webhookPerSecond: parseFloat(webhookRateLimit) });
    }

    const botRateLimit = process.env.TEAMS_BOT_RATE_LIMIT_PER_SECOND;
    if (botRateLimit) {
      builder.withRateLimitConfig({ botPerSecond: parseFloat(botRateLimit) });
    }

    // Multi-tenant configuration
    const multiTenantEnabled = process.env.TEAMS_MULTI_TENANT_ENABLED;
    if (multiTenantEnabled === 'true') {
      const allowedTenants = process.env.TEAMS_ALLOWED_TENANTS?.split(',').map((t) => t.trim());
      builder.withMultiTenant(allowedTenants);
    }

    return builder;
  }

  /**
   * Builds the Teams configuration.
   */
  build(): TeamsConfig {
    // Require at least one authentication method
    if (!this.authConfig && !this.webhookUrl) {
      throw new ConfigurationError('Either Graph credentials or webhook URL must be configured');
    }

    return {
      auth: this.authConfig,
      defaultWebhookUrl: this.webhookUrl,
      endpoints: { ...this.endpoints },
      resilience: { ...this.resilience },
      multiTenant: { ...this.multiTenant },
      simulationMode: this.simulationMode,
      userAgent: this.userAgent,
    };
  }

  /**
   * Validates a Teams webhook URL format.
   */
  private isValidWebhookUrl(url: string): boolean {
    // Teams webhook URL format:
    // https://{tenant}.webhook.office.com/webhookb2/{tenant-id}/IncomingWebhook/{...}
    // or: https://outlook.office.com/webhook/{...}
    const webhookRegex =
      /^https:\/\/(?:[\w-]+\.webhook\.office\.com\/webhookb2\/|outlook\.office\.com\/webhook\/)/;
    return webhookRegex.test(url);
  }
}

/**
 * Creates a new Teams config builder.
 */
export function configBuilder(): TeamsConfigBuilder {
  return new TeamsConfigBuilder();
}
