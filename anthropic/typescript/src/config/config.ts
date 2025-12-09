/**
 * Beta features that can be enabled in the Anthropic API.
 * These features may have breaking changes between versions.
 */
export type BetaFeature =
  | 'message-batches-2024-09-24'
  | 'prompt-caching-2024-07-31'
  | 'computer-use-2024-10-22'
  | 'token-counting-2024-11-01'
  | 'extended-thinking-2025-01-29';

/**
 * Default API configuration constants
 */
export const DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const DEFAULT_API_VERSION = '2023-06-01';
export const DEFAULT_TIMEOUT = 600000; // 10 minutes in milliseconds
export const DEFAULT_MAX_RETRIES = 2;

/**
 * Configuration interface for the Anthropic API client
 */
export interface AnthropicConfig {
  /**
   * API key for authentication with Anthropic API.
   * Can be obtained from https://console.anthropic.com/
   */
  apiKey: string;

  /**
   * Base URL for the API.
   * @default 'https://api.anthropic.com'
   */
  baseUrl?: string;

  /**
   * API version to use.
   * @default '2023-06-01'
   */
  apiVersion?: string;

  /**
   * Request timeout in milliseconds.
   * @default 600000 (10 minutes)
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts for failed requests.
   * @default 2
   */
  maxRetries?: number;

  /**
   * Beta features to enable.
   * @default []
   */
  betaFeatures?: BetaFeature[];

  /**
   * Custom headers to include in all requests
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation (useful for testing or custom environments)
   */
  fetch?: typeof fetch;
}

/**
 * Validates and normalizes the configuration
 */
export function validateConfig(config: AnthropicConfig): Required<AnthropicConfig> {
  if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim().length === 0) {
    throw new Error('API key is required and must be a non-empty string');
  }

  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    throw new Error('Base URL must start with http:// or https://');
  }

  const timeout = config.timeout ?? DEFAULT_TIMEOUT;
  if (timeout < 0) {
    throw new Error('Timeout must be a non-negative number');
  }

  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  if (maxRetries < 0) {
    throw new Error('Max retries must be a non-negative number');
  }

  return {
    apiKey: config.apiKey.trim(),
    baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
    apiVersion: config.apiVersion ?? DEFAULT_API_VERSION,
    timeout,
    maxRetries,
    betaFeatures: config.betaFeatures ?? [],
    headers: config.headers ?? {},
    fetch: config.fetch ?? globalThis.fetch,
  };
}

/**
 * Fluent builder for creating AnthropicConfig objects
 */
export class AnthropicConfigBuilder {
  private config: Partial<AnthropicConfig> = {};

  /**
   * Sets the API key
   */
  withApiKey(apiKey: string): this {
    this.config.apiKey = apiKey;
    return this;
  }

  /**
   * Sets the base URL
   */
  withBaseUrl(baseUrl: string): this {
    this.config.baseUrl = baseUrl;
    return this;
  }

  /**
   * Sets the API version
   */
  withApiVersion(apiVersion: string): this {
    this.config.apiVersion = apiVersion;
    return this;
  }

  /**
   * Sets the request timeout
   */
  withTimeout(timeout: number): this {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Sets the maximum number of retries
   */
  withMaxRetries(maxRetries: number): this {
    this.config.maxRetries = maxRetries;
    return this;
  }

  /**
   * Adds a beta feature
   */
  withBetaFeature(feature: BetaFeature): this {
    this.config.betaFeatures = [...(this.config.betaFeatures ?? []), feature];
    return this;
  }

  /**
   * Sets multiple beta features
   */
  withBetaFeatures(features: BetaFeature[]): this {
    this.config.betaFeatures = features;
    return this;
  }

  /**
   * Adds a custom header
   */
  withHeader(key: string, value: string): this {
    this.config.headers = { ...this.config.headers, [key]: value };
    return this;
  }

  /**
   * Sets multiple custom headers
   */
  withHeaders(headers: Record<string, string>): this {
    this.config.headers = { ...this.config.headers, ...headers };
    return this;
  }

  /**
   * Sets a custom fetch implementation
   */
  withFetch(fetch: typeof globalThis.fetch): this {
    this.config.fetch = fetch;
    return this;
  }

  /**
   * Builds and validates the configuration
   */
  build(): Required<AnthropicConfig> {
    if (!this.config.apiKey) {
      throw new Error('API key is required. Use withApiKey() to set it.');
    }
    return validateConfig(this.config as AnthropicConfig);
  }

  /**
   * Creates a builder from an existing config
   */
  static from(config: AnthropicConfig): AnthropicConfigBuilder {
    const builder = new AnthropicConfigBuilder();
    builder.config = { ...config };
    return builder;
  }
}
