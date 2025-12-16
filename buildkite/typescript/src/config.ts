/**
 * Buildkite Integration Configuration
 * @module config
 */

/** Default Buildkite API base URL */
export const DEFAULT_BASE_URL = 'https://api.buildkite.com/v2';

/** Default Buildkite GraphQL URL */
export const DEFAULT_GRAPHQL_URL = 'https://graphql.buildkite.com/v1';

/** Default request timeout in milliseconds */
export const DEFAULT_TIMEOUT = 30000;

/** Default User-Agent header */
export const DEFAULT_USER_AGENT = 'buildkite-integration/1.0.0';

/** Retry configuration */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitter: true,
};

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  enabled: boolean;
  threshold: number;
  resetTimeoutMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  threshold: 5,
  resetTimeoutMs: 30000,
};

/** Rate limit configuration */
export interface RateLimitConfig {
  requestsPerSecond: number;
  preemptiveThrottling: boolean;
  throttleThreshold: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  requestsPerSecond: 3.0,
  preemptiveThrottling: true,
  throttleThreshold: 20,
};

/** Log streaming configuration */
export interface LogStreamConfig {
  pollIntervalMs: number;
  maxPollAttempts: number;
  includeHeaderTimes: boolean;
}

export const DEFAULT_LOG_STREAM_CONFIG: LogStreamConfig = {
  pollIntervalMs: 5000,
  maxPollAttempts: 360,
  includeHeaderTimes: false,
};

/** Authentication configuration */
export type AuthConfig =
  | { type: 'api_token'; token: string }
  | { type: 'access_token'; token: string };

/** Main Buildkite configuration */
export interface BuildkiteConfig {
  organizationSlug: string;
  auth: AuthConfig;
  baseUrl?: string;
  graphqlUrl?: string;
  timeout?: number;
  userAgent?: string;
  retry?: Partial<RetryConfig>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  rateLimit?: Partial<RateLimitConfig>;
  logStream?: Partial<LogStreamConfig>;
}

/** Validates configuration */
export function validateConfig(config: BuildkiteConfig): void {
  if (!config.organizationSlug || config.organizationSlug.trim() === '') {
    throw new Error('Organization slug is required');
  }
  if (!config.auth) {
    throw new Error('Authentication configuration is required');
  }
  if (!config.auth.token || config.auth.token.trim() === '') {
    throw new Error('API token is required');
  }
}

/** Creates a resolved configuration with defaults applied */
export function resolveConfig(config: BuildkiteConfig): Required<Omit<BuildkiteConfig, 'retry' | 'circuitBreaker' | 'rateLimit' | 'logStream'>> & {
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  rateLimit: RateLimitConfig;
  logStream: LogStreamConfig;
} {
  validateConfig(config);
  return {
    organizationSlug: config.organizationSlug,
    auth: config.auth,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    graphqlUrl: config.graphqlUrl ?? DEFAULT_GRAPHQL_URL,
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    retry: { ...DEFAULT_RETRY_CONFIG, ...config.retry },
    circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config.circuitBreaker },
    rateLimit: { ...DEFAULT_RATE_LIMIT_CONFIG, ...config.rateLimit },
    logStream: { ...DEFAULT_LOG_STREAM_CONFIG, ...config.logStream },
  };
}
