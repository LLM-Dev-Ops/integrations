/**
 * Configuration interfaces and types for the resilience layer
 */
/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
    /** Maximum number of retry attempts */
    maxAttempts: number;
    /** Base delay in milliseconds before first retry */
    baseDelayMs: number;
    /** Maximum delay in milliseconds between retries */
    maxDelayMs: number;
    /** Jitter factor (0-1) to add randomness to delays */
    jitterFactor: number;
}
/**
 * Configuration for circuit breaker behavior
 */
export interface CircuitBreakerConfig {
    /** Number of failures before opening the circuit */
    failureThreshold: number;
    /** Number of successes required to close the circuit from half-open */
    successThreshold: number;
    /** Duration in milliseconds to wait before transitioning to half-open */
    openDurationMs: number;
}
/**
 * Configuration for rate limiter behavior
 */
export interface RateLimiterConfig {
    /** Maximum requests per second */
    requestsPerSecond: number;
    /** Maximum burst size (token bucket capacity) */
    burstSize: number;
}
/**
 * Combined resilience configuration
 */
export interface ResilienceConfig {
    retry: RetryConfig;
    circuitBreaker: CircuitBreakerConfig;
    rateLimiter: RateLimiterConfig;
}
/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half_open';
/**
 * Hook for custom retry behavior
 */
export interface RetryHook {
    /**
     * Called before each retry attempt
     * @param attempt - The attempt number (1-indexed)
     * @param error - The error that triggered the retry
     * @param delayMs - The calculated delay before retry
     */
    onRetry(attempt: number, error: Error, delayMs: number): void;
}
/**
 * Hook for circuit breaker state changes
 */
export interface CircuitBreakerHook {
    /**
     * Called when the circuit breaker changes state
     * @param from - The previous state
     * @param to - The new state
     */
    onStateChange(from: CircuitState, to: CircuitState): void;
}
/**
 * Hook for rate limiting events
 */
export interface RateLimitHook {
    /**
     * Called when a request is rate limited
     * @param waitMs - The time to wait in milliseconds
     */
    onRateLimited(waitMs: number): void;
}
//# sourceMappingURL=types.d.ts.map