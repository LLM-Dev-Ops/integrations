/**
 * Grok Configuration
 *
 * Configuration types and builders for the Grok client.
 *
 * @module config
 */

import type { GrokModel } from './models/types.js';
import { configurationError } from './error.js';

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  readonly maxAttempts: number;

  /** Initial backoff delay in milliseconds */
  readonly initialBackoffMs: number;

  /** Maximum backoff delay in milliseconds */
  readonly maxBackoffMs: number;

  /** Backoff multiplier */
  readonly backoffMultiplier: number;

  /** Whether to add jitter to backoff */
  readonly jitter: boolean;
}

/**
 * Live Search configuration.
 */
export interface LiveSearchConfig {
  /** Whether Live Search is enabled */
  readonly enabled: boolean;

  /** Maximum number of sources per request */
  readonly maxSources: number;

  /** Daily budget in dollars (0 = unlimited) */
  readonly dailyBudget: number;
}

/**
 * Grok client configuration.
 */
export interface GrokConfig {
  /** xAI API key */
  readonly apiKey: string;

  /** Base URL for xAI API */
  readonly baseUrl: string;

  /** Default model to use */
  readonly defaultModel: GrokModel;

  /** Request timeout in milliseconds */
  readonly timeout: number;

  /** Connection timeout in milliseconds */
  readonly connectTimeout: number;

  /** Maximum retry attempts */
  readonly maxRetries: number;

  /** Retry configuration */
  readonly retryConfig: RetryConfig;

  /** Live Search configuration */
  readonly liveSearch: LiveSearchConfig;

  /** Custom user agent suffix */
  readonly userAgent?: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<GrokConfig, 'apiKey'> = {
  baseUrl: 'https://api.x.ai/v1',
  defaultModel: 'grok-3-beta',
  timeout: 120000,
  connectTimeout: 10000,
  maxRetries: 3,
  retryConfig: {
    maxAttempts: 3,
    initialBackoffMs: 100,
    maxBackoffMs: 20000,
    backoffMultiplier: 2,
    jitter: true,
  },
  liveSearch: {
    enabled: false,
    maxSources: 100,
    dailyBudget: 0,
  },
};

/**
 * Mutable config for builder.
 */
interface MutableGrokConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: GrokModel;
  timeout?: number;
  connectTimeout?: number;
  maxRetries?: number;
  retryConfig?: RetryConfig;
  liveSearch?: LiveSearchConfig;
  userAgent?: string;
}

/**
 * Grok configuration builder.
 */
export class GrokConfigBuilder {
  private config: MutableGrokConfig = {};

  /**
   * Set the API key.
   *
   * @param apiKey - xAI API key
   * @returns This builder
   */
  apiKey(apiKey: string): this {
    this.config.apiKey = apiKey;
    return this;
  }

  /**
   * Set the base URL.
   *
   * @param baseUrl - Base URL for xAI API
   * @returns This builder
   */
  baseUrl(baseUrl: string): this {
    this.config.baseUrl = baseUrl;
    return this;
  }

  /**
   * Set the default model.
   *
   * @param model - Default model to use
   * @returns This builder
   */
  defaultModel(model: GrokModel): this {
    this.config.defaultModel = model;
    return this;
  }

  /**
   * Set the request timeout.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Set the connection timeout.
   *
   * @param ms - Connection timeout in milliseconds
   * @returns This builder
   */
  connectTimeout(ms: number): this {
    this.config.connectTimeout = ms;
    return this;
  }

  /**
   * Set maximum retry attempts.
   *
   * @param n - Maximum retries
   * @returns This builder
   */
  maxRetries(n: number): this {
    this.config.maxRetries = n;
    return this;
  }

  /**
   * Set retry configuration.
   *
   * @param config - Retry configuration
   * @returns This builder
   */
  retryConfig(config: RetryConfig): this {
    this.config.retryConfig = config;
    return this;
  }

  /**
   * Set Live Search configuration.
   *
   * @param config - Live Search configuration
   * @returns This builder
   */
  liveSearch(config: LiveSearchConfig): this {
    this.config.liveSearch = config;
    return this;
  }

  /**
   * Set custom user agent suffix.
   *
   * @param userAgent - User agent suffix
   * @returns This builder
   */
  userAgent(userAgent: string): this {
    this.config.userAgent = userAgent;
    return this;
  }

  /**
   * Load configuration from environment variables.
   *
   * Environment variables:
   * - XAI_API_KEY: API key (required)
   * - XAI_BASE_URL: Base URL
   * - XAI_DEFAULT_MODEL: Default model
   * - XAI_REQUEST_TIMEOUT_MS: Request timeout
   * - XAI_LIVE_SEARCH_ENABLED: Enable Live Search
   * - XAI_LIVE_SEARCH_MAX_SOURCES: Max sources
   * - XAI_LIVE_SEARCH_DAILY_BUDGET: Daily budget
   *
   * @returns This builder
   */
  fromEnv(): this {
    const apiKey = process.env.XAI_API_KEY;
    if (apiKey) {
      this.config.apiKey = apiKey;
    }

    const baseUrl = process.env.XAI_BASE_URL;
    if (baseUrl) {
      this.config.baseUrl = baseUrl;
    }

    const defaultModel = process.env.XAI_DEFAULT_MODEL;
    if (defaultModel) {
      this.config.defaultModel = defaultModel as GrokModel;
    }

    const timeout = process.env.XAI_REQUEST_TIMEOUT_MS;
    if (timeout) {
      const parsed = parseInt(timeout, 10);
      if (!isNaN(parsed)) {
        this.config.timeout = parsed;
      }
    }

    // Live Search config
    const liveSearchEnabled = process.env.XAI_LIVE_SEARCH_ENABLED;
    const liveSearchMaxSources = process.env.XAI_LIVE_SEARCH_MAX_SOURCES;
    const liveSearchDailyBudget = process.env.XAI_LIVE_SEARCH_DAILY_BUDGET;

    if (liveSearchEnabled || liveSearchMaxSources || liveSearchDailyBudget) {
      this.config.liveSearch = {
        enabled: liveSearchEnabled === 'true',
        maxSources: liveSearchMaxSources
          ? parseInt(liveSearchMaxSources, 10)
          : DEFAULT_CONFIG.liveSearch.maxSources,
        dailyBudget: liveSearchDailyBudget
          ? parseFloat(liveSearchDailyBudget)
          : DEFAULT_CONFIG.liveSearch.dailyBudget,
      };
    }

    return this;
  }

  /**
   * Build the configuration.
   *
   * @returns Complete Grok configuration
   * @throws {GrokError} If required fields are missing
   */
  build(): GrokConfig {
    if (!this.config.apiKey) {
      throw configurationError('API key is required (XAI_API_KEY)');
    }

    // Validate base URL if provided
    if (this.config.baseUrl) {
      try {
        new URL(this.config.baseUrl);
      } catch {
        throw configurationError(
          `Invalid base URL: ${this.config.baseUrl}`
        );
      }
    }

    return {
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl ?? DEFAULT_CONFIG.baseUrl,
      defaultModel: this.config.defaultModel ?? DEFAULT_CONFIG.defaultModel,
      timeout: this.config.timeout ?? DEFAULT_CONFIG.timeout,
      connectTimeout:
        this.config.connectTimeout ?? DEFAULT_CONFIG.connectTimeout,
      maxRetries: this.config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      retryConfig: this.config.retryConfig ?? DEFAULT_CONFIG.retryConfig,
      liveSearch: this.config.liveSearch ?? DEFAULT_CONFIG.liveSearch,
      userAgent: this.config.userAgent,
    };
  }
}

/**
 * Create a new configuration builder.
 *
 * @returns New GrokConfigBuilder
 */
export function configBuilder(): GrokConfigBuilder {
  return new GrokConfigBuilder();
}

/**
 * Create configuration from environment variables.
 *
 * @returns Complete Grok configuration
 * @throws {GrokError} If required environment variables are missing
 */
export function configFromEnv(): GrokConfig {
  return new GrokConfigBuilder().fromEnv().build();
}
