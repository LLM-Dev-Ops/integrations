/**
 * Configuration management for the Slack client.
 */

import { ConfigurationError } from '../errors';

/**
 * Token types
 */
export type TokenType = 'bot' | 'user' | 'app';

/**
 * Detect token type from prefix
 */
export function detectTokenType(token: string): TokenType {
  if (token.startsWith('xoxb-')) return 'bot';
  if (token.startsWith('xoxp-')) return 'user';
  if (token.startsWith('xapp-')) return 'app';
  throw new ConfigurationError('Token must start with xoxb-, xoxp-, or xapp-');
}

/**
 * Slack token wrapper
 */
export interface SlackToken {
  /** The token value */
  readonly value: string;
  /** Token type */
  readonly type: TokenType;
}

/**
 * Create a slack token
 */
export function createToken(token: string): SlackToken {
  const type = detectTokenType(token);
  return { value: token, type };
}

/**
 * Socket Mode configuration
 */
export interface SocketModeConfig {
  /** Enable Socket Mode */
  enabled: boolean;
  /** Ping interval in ms */
  pingInterval: number;
  /** Connection timeout in ms */
  connectTimeout: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;
  /** Reconnection delay in ms */
  reconnectDelay: number;
}

/**
 * Default Socket Mode configuration
 */
export const defaultSocketModeConfig: SocketModeConfig = {
  enabled: false,
  pingInterval: 30000,
  connectTimeout: 30000,
  maxReconnectAttempts: 5,
  reconnectDelay: 5000,
};

/**
 * Slack client configuration
 */
export interface SlackConfig {
  /** Bot token (xoxb-*) */
  botToken?: SlackToken;
  /** User token (xoxp-*) */
  userToken?: SlackToken;
  /** App-level token (xapp-*) for Socket Mode */
  appToken?: SlackToken;
  /** Signing secret for webhook verification */
  signingSecret?: string;
  /** Client ID for OAuth */
  clientId?: string;
  /** Client secret for OAuth */
  clientSecret?: string;
  /** Base URL for API requests */
  baseUrl: string;
  /** Request timeout in ms */
  timeout: number;
  /** Maximum retries */
  maxRetries: number;
  /** Default headers */
  defaultHeaders: Record<string, string>;
  /** Socket Mode configuration */
  socketMode: SocketModeConfig;
}

/**
 * Default configuration
 */
export const defaultConfig: SlackConfig = {
  baseUrl: 'https://slack.com/api',
  timeout: 30000,
  maxRetries: 3,
  defaultHeaders: {},
  socketMode: { ...defaultSocketModeConfig },
};

/**
 * Builder for SlackConfig
 */
export class SlackConfigBuilder {
  private config: SlackConfig;

  constructor() {
    this.config = { ...defaultConfig, socketMode: { ...defaultSocketModeConfig } };
  }

  /**
   * Set bot token
   */
  botToken(token: string): this {
    this.config.botToken = createToken(token);
    return this;
  }

  /**
   * Set user token
   */
  userToken(token: string): this {
    this.config.userToken = createToken(token);
    return this;
  }

  /**
   * Set app token
   */
  appToken(token: string): this {
    this.config.appToken = createToken(token);
    return this;
  }

  /**
   * Set signing secret
   */
  signingSecret(secret: string): this {
    this.config.signingSecret = secret;
    return this;
  }

  /**
   * Set client ID
   */
  clientId(id: string): this {
    this.config.clientId = id;
    return this;
  }

  /**
   * Set client secret
   */
  clientSecret(secret: string): this {
    this.config.clientSecret = secret;
    return this;
  }

  /**
   * Set base URL
   */
  baseUrl(url: string): this {
    this.config.baseUrl = url;
    return this;
  }

  /**
   * Set timeout
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Set max retries
   */
  maxRetries(n: number): this {
    this.config.maxRetries = n;
    return this;
  }

  /**
   * Add default header
   */
  defaultHeader(name: string, value: string): this {
    this.config.defaultHeaders[name] = value;
    return this;
  }

  /**
   * Enable Socket Mode
   */
  enableSocketMode(): this {
    this.config.socketMode.enabled = true;
    return this;
  }

  /**
   * Configure Socket Mode
   */
  socketModeConfig(config: Partial<SocketModeConfig>): this {
    this.config.socketMode = { ...this.config.socketMode, ...config };
    return this;
  }

  /**
   * Build the configuration (with validation)
   */
  build(): SlackConfig {
    this.validate();
    return { ...this.config };
  }

  /**
   * Build without validation (for testing)
   */
  buildUnchecked(): SlackConfig {
    return { ...this.config };
  }

  /**
   * Validate configuration
   */
  private validate(): void {
    if (!this.config.botToken && !this.config.userToken) {
      throw new ConfigurationError('At least one token (bot or user) is required');
    }

    if (this.config.socketMode.enabled && !this.config.appToken) {
      throw new ConfigurationError('App token is required for Socket Mode');
    }
  }
}

/**
 * Create configuration from environment variables
 */
export function createConfigFromEnv(): SlackConfig {
  const builder = new SlackConfigBuilder();

  // Bot token
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (botToken) {
    builder.botToken(botToken);
  }

  // User token
  const userToken = process.env.SLACK_USER_TOKEN;
  if (userToken) {
    builder.userToken(userToken);
  }

  // App token
  const appToken = process.env.SLACK_APP_TOKEN;
  if (appToken) {
    builder.appToken(appToken);
  }

  // Signing secret
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    builder.signingSecret(signingSecret);
  }

  // Client ID/Secret
  const clientId = process.env.SLACK_CLIENT_ID;
  if (clientId) {
    builder.clientId(clientId);
  }

  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (clientSecret) {
    builder.clientSecret(clientSecret);
  }

  // Base URL
  const baseUrl = process.env.SLACK_BASE_URL;
  if (baseUrl) {
    builder.baseUrl(baseUrl);
  }

  // Timeout
  const timeout = process.env.SLACK_TIMEOUT;
  if (timeout) {
    const ms = parseInt(timeout, 10);
    if (!isNaN(ms)) {
      builder.timeout(ms);
    }
  }

  // Max retries
  const maxRetries = process.env.SLACK_MAX_RETRIES;
  if (maxRetries) {
    const n = parseInt(maxRetries, 10);
    if (!isNaN(n)) {
      builder.maxRetries(n);
    }
  }

  return builder.build();
}

// Re-export
export { SlackConfig, SlackConfigBuilder };
