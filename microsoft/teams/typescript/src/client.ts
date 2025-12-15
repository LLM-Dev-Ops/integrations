/**
 * Microsoft Teams Client
 *
 * Main facade for Teams integration following the SPARC specification.
 */

import type { TeamsConfig } from './config/index.js';
import { ConfigurationError } from './errors.js';
import { WebhookService } from './services/webhook/index.js';
import { GraphService, TokenProvider } from './services/graph/index.js';
import { BotService } from './services/bot/index.js';
import { MessageRouter } from './routing/index.js';
import { ResilientExecutor } from './resilience/index.js';

// ============================================================================
// Token Provider Implementation
// ============================================================================

/**
 * Simple token provider that fetches tokens from Microsoft identity platform.
 */
class MicrosoftTokenProvider implements TokenProvider {
  private config: TeamsConfig;
  private accessToken?: string;
  private expiresAt: number = 0;
  private tokenEndpoint: string;

  constructor(config: TeamsConfig) {
    this.config = config;
    this.tokenEndpoint = `${config.endpoints.loginUrl}/${config.auth?.tenantId ?? 'common'}/oauth2/v2.0/token`;
  }

  async getToken(): Promise<string> {
    // Check if current token is still valid (with 5 minute buffer)
    if (this.accessToken && Date.now() < this.expiresAt - 300000) {
      return this.accessToken;
    }

    // Fetch new token
    await this.fetchToken();
    return this.accessToken!;
  }

  private async fetchToken(): Promise<void> {
    if (!this.config.auth) {
      throw new ConfigurationError('Authentication not configured');
    }

    const body = new URLSearchParams({
      client_id: this.config.auth.clientId,
      client_secret: this.config.auth.clientSecret.expose(),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.config.userAgent,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ConfigurationError(`Token acquisition failed: ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
  }
}

/**
 * Bot token provider for Bot Framework authentication.
 */
class BotTokenProvider implements TokenProvider {
  private config: TeamsConfig;
  private accessToken?: string;
  private expiresAt: number = 0;
  private tokenEndpoint: string = 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';

  constructor(config: TeamsConfig) {
    this.config = config;
  }

  async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 300000) {
      return this.accessToken;
    }

    await this.fetchToken();
    return this.accessToken!;
  }

  private async fetchToken(): Promise<void> {
    if (!this.config.auth?.botAppId || !this.config.auth?.botAppSecret) {
      throw new ConfigurationError('Bot credentials not configured');
    }

    const body = new URLSearchParams({
      client_id: this.config.auth.botAppId,
      client_secret: this.config.auth.botAppSecret.expose(),
      scope: 'https://api.botframework.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.config.userAgent,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ConfigurationError(`Bot token acquisition failed: ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
  }
}

// ============================================================================
// Teams Client
// ============================================================================

/**
 * Main Microsoft Teams client providing unified access to all Teams services.
 */
export class TeamsClient {
  private config: TeamsConfig;
  private executor: ResilientExecutor;
  private _webhookService?: WebhookService;
  private _graphService?: GraphService;
  private _botService?: BotService;
  private _router?: MessageRouter;
  private graphTokenProvider?: TokenProvider;
  private botTokenProvider?: TokenProvider;

  constructor(config: TeamsConfig) {
    this.config = config;

    // Create resilient executor
    this.executor = new ResilientExecutor(
      config.resilience.retry,
      config.resilience.circuitBreaker,
      config.resilience.rateLimit
    );

    // Initialize token providers if credentials are configured
    if (config.auth) {
      this.graphTokenProvider = new MicrosoftTokenProvider(config);
      if (config.auth.botAppId && config.auth.botAppSecret) {
        this.botTokenProvider = new BotTokenProvider(config);
      }
    }
  }

  /**
   * Creates a TeamsClient from environment variables.
   */
  static fromEnv(): TeamsClient {
    const { TeamsConfigBuilder } = require('./config/index.js');
    const config = TeamsConfigBuilder.fromEnv().build();
    return new TeamsClient(config);
  }

  /**
   * Gets the webhook service for sending webhook messages.
   */
  webhook(): WebhookService {
    if (!this._webhookService) {
      this._webhookService = new WebhookService(this.config, this.executor);
    }
    return this._webhookService;
  }

  /**
   * Gets the Graph service for Teams, Channels, and Chats operations.
   */
  graph(): GraphService {
    if (!this._graphService) {
      if (!this.graphTokenProvider) {
        throw new ConfigurationError('Graph API requires authentication configuration');
      }
      this._graphService = new GraphService(this.config, this.executor, this.graphTokenProvider);
    }
    return this._graphService;
  }

  /**
   * Gets the Bot service for proactive messaging and activity processing.
   */
  bot(): BotService {
    if (!this._botService) {
      if (!this.botTokenProvider) {
        throw new ConfigurationError('Bot service requires bot credentials configuration');
      }
      this._botService = new BotService(this.config, this.executor, this.botTokenProvider);
    }
    return this._botService;
  }

  /**
   * Gets the message router for rule-based message routing.
   */
  router(): MessageRouter {
    if (!this._router) {
      this._router = new MessageRouter({
        webhookService: this.config.defaultWebhookUrl ? this.webhook() : undefined,
        graphService: this.graphTokenProvider ? this.graph() : undefined,
      });
    }
    return this._router;
  }

  /**
   * Gets the configuration.
   */
  getConfig(): TeamsConfig {
    return this.config;
  }

  /**
   * Gets the resilient executor (for advanced usage).
   */
  getExecutor(): ResilientExecutor {
    return this.executor;
  }

  /**
   * Resets all circuit breakers and rate limiters.
   */
  reset(): void {
    this.executor.reset();
  }

  /**
   * Gets statistics from the resilient executor.
   */
  getStats(): ReturnType<ResilientExecutor['getStats']> {
    return this.executor.getStats();
  }

  /**
   * Checks if the client has webhook capability.
   */
  hasWebhook(): boolean {
    return !!this.config.defaultWebhookUrl;
  }

  /**
   * Checks if the client has Graph API capability.
   */
  hasGraph(): boolean {
    return !!this.graphTokenProvider;
  }

  /**
   * Checks if the client has Bot capability.
   */
  hasBot(): boolean {
    return !!this.botTokenProvider;
  }
}
