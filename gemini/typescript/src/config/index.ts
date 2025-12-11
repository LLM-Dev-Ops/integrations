/**
 * Configuration types for the Gemini API client.
 */

/** Default Gemini API base URL */
export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

/** Default API version */
export const DEFAULT_API_VERSION = 'v1beta';

/** Default request timeout (120 seconds) */
export const DEFAULT_TIMEOUT = 120_000;

/** Default connect timeout (30 seconds) */
export const DEFAULT_CONNECT_TIMEOUT = 30_000;

/** Default max retries */
export const DEFAULT_MAX_RETRIES = 3;

/** Authentication method */
export type AuthMethod = 'header' | 'queryParam';

/** Log level */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Retry configuration */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Multiplier for exponential backoff */
  multiplier: number;
  /** Jitter factor (0-1) */
  jitter: number;
}

/** Default retry configuration */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 60000,
  multiplier: 2.0,
  jitter: 0.25,
};

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  /** Failures before opening circuit */
  failureThreshold: number;
  /** Successes to close circuit */
  successThreshold: number;
  /** Duration circuit stays open (ms) */
  openDuration: number;
  /** Max requests in half-open state */
  halfOpenMaxRequests: number;
}

/** Default circuit breaker configuration */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  openDuration: 30000,
  halfOpenMaxRequests: 1,
};

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Requests per minute */
  requestsPerMinute: number;
  /** Tokens per minute (optional) */
  tokensPerMinute?: number;
}

/** Default rate limit configuration */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  requestsPerMinute: 60,
  tokensPerMinute: 1_000_000,
};

/** Configuration for the Gemini client */
export interface GeminiConfig {
  /** API key (required) */
  apiKey: string;
  /** Base URL for the API */
  baseUrl?: string;
  /** API version */
  apiVersion?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Connect timeout in milliseconds */
  connectTimeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry configuration */
  retryConfig?: Partial<RetryConfig>;
  /** Circuit breaker configuration */
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  /** Rate limit configuration */
  rateLimitConfig?: Partial<RateLimitConfig>;
  /** Authentication method */
  authMethod?: AuthMethod;
  /** Enable tracing */
  enableTracing?: boolean;
  /** Enable metrics */
  enableMetrics?: boolean;
  /** Log level */
  logLevel?: LogLevel;
}

/** Resolved configuration with all defaults applied */
export interface ResolvedGeminiConfig {
  apiKey: string;
  baseUrl: string;
  apiVersion: string;
  timeout: number;
  connectTimeout: number;
  maxRetries: number;
  retryConfig: RetryConfig;
  circuitBreakerConfig: CircuitBreakerConfig;
  rateLimitConfig: RateLimitConfig | undefined;
  authMethod: AuthMethod;
  enableTracing: boolean;
  enableMetrics: boolean;
  logLevel: LogLevel;
}

/**
 * Resolve configuration with defaults.
 */
export function resolveConfig(config: GeminiConfig): ResolvedGeminiConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    apiVersion: config.apiVersion ?? DEFAULT_API_VERSION,
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    connectTimeout: config.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    retryConfig: { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig },
    circuitBreakerConfig: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config.circuitBreakerConfig },
    rateLimitConfig: config.rateLimitConfig
      ? { ...DEFAULT_RATE_LIMIT_CONFIG, ...config.rateLimitConfig }
      : undefined,
    authMethod: config.authMethod ?? 'header',
    enableTracing: config.enableTracing ?? true,
    enableMetrics: config.enableMetrics ?? true,
    logLevel: config.logLevel ?? 'info',
  };
}

/**
 * Create configuration from environment variables.
 */
export function createConfigFromEnv(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('Missing API key. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.');
  }

  return {
    apiKey,
    baseUrl: process.env.GEMINI_BASE_URL,
    apiVersion: process.env.GEMINI_API_VERSION,
    timeout: process.env.GEMINI_TIMEOUT ? parseInt(process.env.GEMINI_TIMEOUT, 10) : undefined,
    maxRetries: process.env.GEMINI_MAX_RETRIES ? parseInt(process.env.GEMINI_MAX_RETRIES, 10) : undefined,
    logLevel: process.env.GEMINI_LOG_LEVEL as LogLevel | undefined,
  };
}

/**
 * Validate configuration.
 */
export function validateConfig(config: GeminiConfig): void {
  if (!config.apiKey) {
    throw new Error('API key is required');
  }

  if (config.baseUrl) {
    try {
      new URL(config.baseUrl);
    } catch {
      throw new Error(`Invalid base URL: ${config.baseUrl}`);
    }
  }

  if (config.timeout !== undefined && config.timeout <= 0) {
    throw new Error('Timeout must be positive');
  }

  if (config.maxRetries !== undefined && config.maxRetries < 0) {
    throw new Error('Max retries must be non-negative');
  }
}
