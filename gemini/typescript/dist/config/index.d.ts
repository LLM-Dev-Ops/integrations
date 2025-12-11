/**
 * Configuration types for the Gemini API client.
 */
/** Default Gemini API base URL */
export declare const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
/** Default API version */
export declare const DEFAULT_API_VERSION = "v1beta";
/** Default request timeout (120 seconds) */
export declare const DEFAULT_TIMEOUT = 120000;
/** Default connect timeout (30 seconds) */
export declare const DEFAULT_CONNECT_TIMEOUT = 30000;
/** Default max retries */
export declare const DEFAULT_MAX_RETRIES = 3;
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
export declare const DEFAULT_RETRY_CONFIG: RetryConfig;
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
export declare const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig;
/** Rate limit configuration */
export interface RateLimitConfig {
    /** Requests per minute */
    requestsPerMinute: number;
    /** Tokens per minute (optional) */
    tokensPerMinute?: number;
}
/** Default rate limit configuration */
export declare const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig;
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
export declare function resolveConfig(config: GeminiConfig): ResolvedGeminiConfig;
/**
 * Create configuration from environment variables.
 */
export declare function createConfigFromEnv(): GeminiConfig;
/**
 * Validate configuration.
 */
export declare function validateConfig(config: GeminiConfig): void;
//# sourceMappingURL=index.d.ts.map