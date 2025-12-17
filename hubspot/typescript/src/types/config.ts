/**
 * HubSpot API Configuration Types
 * Configuration interfaces for HubSpotClient initialization
 */

/**
 * Logger interface for client logging
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Metrics client interface for telemetry
 */
export interface MetricsClient {
  increment(metric: string, tags?: Record<string, string>): void;
  histogram(metric: string, value: number, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Main configuration interface for HubSpotClient
 */
export interface HubSpotConfig {
  /** HubSpot access token for API authentication */
  accessToken: string;

  /** HubSpot portal (account) ID */
  portalId: string;

  /** Optional refresh token for OAuth token renewal */
  refreshToken?: string;

  /** Base URL for HubSpot API (default: "https://api.hubapi.com") */
  baseUrl?: string;

  /** API version to use (default: "v3") */
  apiVersion?: string;

  /** Request timeout in milliseconds (default: 30000, min: 1000) */
  timeout?: number;

  /** Maximum number of retry attempts for failed requests (default: 3) */
  maxRetries?: number;

  /** Daily API call limit (default: 500000) */
  dailyLimit?: number;

  /** Burst limit - requests per 10 seconds (default: 100) */
  burstLimit?: number;

  /** Search API requests per second limit (default: 4) */
  searchLimit?: number;

  /** Rate limit buffer as percentage (default: 0.1 = 10%) */
  rateLimitBuffer?: number;

  /** Batch operation size limit (default: 100) */
  batchSize?: number;

  /** Secret for webhook signature validation */
  webhookSecret?: string;

  /** Optional logger instance for client logging */
  logger?: Logger;

  /** Optional metrics client for telemetry */
  metrics?: MetricsClient;

  /** Callback invoked when OAuth tokens are refreshed */
  onTokenRefresh?: (tokens: Tokens) => void;

  /** OAuth client ID (required for token refresh) */
  clientId?: string;

  /** OAuth client secret (required for token refresh) */
  clientSecret?: string;
}

/**
 * OAuth token information
 */
export interface Tokens {
  /** OAuth access token */
  accessToken: string;

  /** OAuth refresh token */
  refreshToken?: string;

  /** Token expiration timestamp */
  expiresAt?: Date;

  /** Token expiration in seconds */
  expiresIn?: number;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Daily API call limit */
  dailyLimit: number;

  /** Burst limit - requests per 10 seconds */
  burstLimit: number;

  /** Search API requests per second limit */
  searchLimit: number;

  /** Rate limit buffer as percentage */
  buffer: number;
}

/**
 * Token manager configuration
 */
export interface TokenManagerConfig {
  /** Initial access token */
  accessToken: string;

  /** Optional refresh token */
  refreshToken?: string;

  /** Optional token expiration timestamp */
  expiresAt?: Date;

  /** OAuth client ID */
  clientId?: string;

  /** OAuth client secret */
  clientSecret?: string;

  /** Callback for token refresh */
  onRefresh?: (tokens: Tokens) => void;
}

/**
 * Webhook processor configuration
 */
export interface WebhookConfig {
  /** Webhook signature secret */
  webhookSecret: string;

  /** Optional logger instance */
  logger?: Logger;

  /** Optional metrics client */
  metrics?: MetricsClient;

  /** Maximum event age in milliseconds (default: 300000 = 5 minutes) */
  maxEventAge?: number;

  /** Maximum timestamp skew in milliseconds (default: 300000 = 5 minutes) */
  maxTimestampSkew?: number;

  /** Size of processed events cache (default: 10000) */
  processedEventsCache?: number;

  /** TTL for processed events cache in milliseconds (default: 3600000 = 1 hour) */
  processedEventsTTL?: number;
}

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  /** Base URL for API requests */
  baseUrl: string;

  /** Request timeout in milliseconds */
  timeout: number;

  /** Maximum retry attempts */
  retries: number;

  /** Custom headers to include in all requests */
  headers?: Record<string, string>;

  /** Proxy configuration */
  proxy?: ProxyConfig;
}

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  /** Proxy host */
  host: string;

  /** Proxy port */
  port: number;

  /** Proxy authentication */
  auth?: {
    username: string;
    password: string;
  };

  /** Protocol (http or https) */
  protocol?: 'http' | 'https';
}
