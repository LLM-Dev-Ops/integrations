/**
 * Orchestrates retry, circuit breaker, and rate limiting for resilient operations.
 */
import { CircuitBreaker } from './circuit-breaker.js';
import { RateLimiter } from './rate-limiter.js';
import type { RetryConfig, CircuitBreakerConfig, RateLimitConfig } from '../config/index.js';
/**
 * Configuration for resilience orchestration.
 */
export interface ResilienceConfig {
    /** Retry configuration */
    retry?: RetryConfig;
    /** Circuit breaker configuration */
    circuitBreaker?: CircuitBreakerConfig;
    /** Rate limit configuration */
    rateLimit?: RateLimitConfig;
}
/**
 * Orchestrates multiple resilience patterns for robust API interactions.
 */
export declare class ResilienceOrchestrator {
    private readonly retry;
    private readonly circuitBreaker?;
    private readonly rateLimiter?;
    constructor(config?: ResilienceConfig);
    /**
     * Execute an operation with full resilience patterns applied.
     *
     * Order of execution:
     * 1. Rate limiting (if configured)
     * 2. Circuit breaker (if configured)
     * 3. Retry with exponential backoff
     *
     * @param operation - The async operation to execute
     * @param estimatedTokens - Estimated tokens for rate limiting (optional)
     * @returns The result of the operation
     */
    execute<T>(operation: () => Promise<T>, estimatedTokens?: number): Promise<T>;
    /**
     * Get circuit breaker instance for manual control.
     */
    getCircuitBreaker(): CircuitBreaker | undefined;
    /**
     * Get rate limiter instance for manual control.
     */
    getRateLimiter(): RateLimiter | undefined;
    /**
     * Reset all resilience components.
     */
    reset(): void;
}
//# sourceMappingURL=orchestrator.d.ts.map