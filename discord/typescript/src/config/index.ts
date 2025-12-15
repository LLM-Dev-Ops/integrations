/**
 * Discord client configuration and builder.
 */

import { Snowflake } from '../types/index.js';
import { ConfigurationError, NoAuthenticationError } from '../errors/index.js';

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
  /** Global rate limit (requests per second). Default: 50 */
  globalLimit: number;
  /** Maximum time to wait in queue (ms). Default: 30000 */
  queueTimeout: number;
  /** Maximum pending requests in queue. Default: 1000 */
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
  /** Jitter factor (0-1). Default: 0.1 */
  jitterFactor: number;
}

/**
 * Discord client configuration.
 */
export interface DiscordConfig {
  /** Bot token for REST API authentication */
  botToken?: string;
  /** Default webhook URL for webhook operations */
  defaultWebhookUrl?: string;
  /** Discord API base URL */
  baseUrl: string;
  /** Rate limit configuration */
  rateLimitConfig: RateLimitConfig;
  /** Retry configuration */
  retryConfig: RetryConfig;
  /** Simulation mode */
  simulationMode: SimulationMode;
  /** Named channel routes (name -> channel ID) */
  channelRouting: Map<string, Snowflake>;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
  /** User agent string */
  userAgent: string;
}

/**
 * Default rate limit configuration.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  globalLimit: 50,
  queueTimeout: 30000,
  maxQueueSize: 1000,
};

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Discord API v10 base URL.
 */
export const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

/**
 * Default user agent for requests.
 */
export const DEFAULT_USER_AGENT = 'LLMDevOps-Discord/1.0.0';

/**
 * Default request timeout.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

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

/**
 * Builder for Discord client configuration.
 */
export class DiscordConfigBuilder {
  private botToken?: SecretString;
  private defaultWebhookUrl?: SecretString;
  private baseUrl: string = DISCORD_API_BASE_URL;
  private rateLimitConfig: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG };
  private retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG };
  private simulationMode: SimulationMode = { type: 'disabled' };
  private channelRouting: Map<string, Snowflake> = new Map();
  private requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS;
  private userAgent: string = DEFAULT_USER_AGENT;

  /**
   * Sets the bot token for REST API authentication.
   * @param token - The bot token (without "Bot " prefix)
   */
  withBotToken(token: string): this {
    if (!token || token.trim().length === 0) {
      throw new ConfigurationError('Bot token cannot be empty');
    }
    this.botToken = new SecretString(token.trim());
    return this;
  }

  /**
   * Sets the default webhook URL.
   * @param url - The webhook URL
   */
  withWebhook(url: string): this {
    if (!url || url.trim().length === 0) {
      throw new ConfigurationError('Webhook URL cannot be empty');
    }
    if (!this.isValidWebhookUrl(url)) {
      throw new ConfigurationError('Invalid webhook URL format');
    }
    this.defaultWebhookUrl = new SecretString(url.trim());
    return this;
  }

  /**
   * Sets the Discord API base URL.
   * @param url - The base URL (default: https://discord.com/api/v10)
   */
  withBaseUrl(url: string): this {
    if (!url || !url.startsWith('https://')) {
      throw new ConfigurationError('Base URL must be HTTPS');
    }
    this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
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
   * Sets the simulation mode.
   */
  withSimulation(mode: SimulationMode): this {
    this.simulationMode = mode;
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
   * Adds a named channel route.
   * @param name - Route name (e.g., "alerts", "deployments")
   * @param channelId - Channel Snowflake ID
   */
  withChannelRoute(name: string, channelId: Snowflake): this {
    if (!name || name.trim().length === 0) {
      throw new ConfigurationError('Channel route name cannot be empty');
    }
    this.channelRouting.set(name.trim(), channelId);
    return this;
  }

  /**
   * Sets multiple channel routes at once.
   * @param routes - Object mapping route names to channel IDs
   */
  withChannelRoutes(routes: Record<string, Snowflake>): this {
    for (const [name, channelId] of Object.entries(routes)) {
      this.withChannelRoute(name, channelId);
    }
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
   * Creates a builder from environment variables.
   *
   * Environment variables:
   * - DISCORD_BOT_TOKEN: Bot token for REST API
   * - DISCORD_WEBHOOK_URL: Default webhook URL
   * - DISCORD_API_BASE_URL: API base URL (optional)
   */
  static fromEnv(): DiscordConfigBuilder {
    const builder = new DiscordConfigBuilder();

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (botToken) {
      builder.withBotToken(botToken);
    }

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      builder.withWebhook(webhookUrl);
    }

    const baseUrl = process.env.DISCORD_API_BASE_URL;
    if (baseUrl) {
      builder.withBaseUrl(baseUrl);
    }

    return builder;
  }

  /**
   * Builds the Discord configuration.
   * @throws NoAuthenticationError if neither bot token nor webhook URL is configured
   */
  build(): DiscordConfig {
    // Validate that at least one auth method is configured
    if (!this.botToken && !this.defaultWebhookUrl) {
      throw new NoAuthenticationError();
    }

    return {
      botToken: this.botToken?.expose(),
      defaultWebhookUrl: this.defaultWebhookUrl?.expose(),
      baseUrl: this.baseUrl,
      rateLimitConfig: { ...this.rateLimitConfig },
      retryConfig: { ...this.retryConfig },
      simulationMode: this.simulationMode,
      channelRouting: new Map(this.channelRouting),
      requestTimeoutMs: this.requestTimeoutMs,
      userAgent: this.userAgent,
    };
  }

  /**
   * Validates a webhook URL format.
   */
  private isValidWebhookUrl(url: string): boolean {
    // Discord webhook URL format: https://discord.com/api/webhooks/{id}/{token}
    // or: https://discordapp.com/api/webhooks/{id}/{token}
    const webhookRegex =
      /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;
    return webhookRegex.test(url);
  }
}

/**
 * Parses a webhook URL to extract the webhook ID and token.
 * @param url - The webhook URL
 * @returns Object with webhookId and webhookToken
 * @throws ConfigurationError if the URL is invalid
 */
export function parseWebhookUrl(url: string): { webhookId: Snowflake; webhookToken: string } {
  const match = url.match(/webhooks\/(\d+)\/([\w-]+)/);
  if (!match) {
    throw new ConfigurationError('Invalid webhook URL format');
  }
  return {
    webhookId: match[1],
    webhookToken: match[2],
  };
}

/**
 * Builds a webhook URL from ID and token.
 * @param webhookId - The webhook ID
 * @param webhookToken - The webhook token
 * @param baseUrl - Optional base URL (default: Discord API)
 */
export function buildWebhookUrl(
  webhookId: Snowflake,
  webhookToken: string,
  baseUrl: string = DISCORD_API_BASE_URL
): string {
  return `${baseUrl}/webhooks/${webhookId}/${webhookToken}`;
}
