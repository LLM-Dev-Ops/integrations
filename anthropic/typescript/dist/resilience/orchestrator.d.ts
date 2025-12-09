/**
 * Resilience orchestrator that combines retry, circuit breaker, and rate limiting
 */
import { RetryExecutor } from './retry.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { RateLimiter } from './rate-limiter.js';
import { ResilienceConfig } from './types.js';
/**
 * Interface for resilience orchestration
 */
export interface ResilienceOrchestrator {
    execute<T>(operation: () => Promise<T>): Promise<T>;
}
/**
 * Default implementation that combines all resilience patterns
 *
 * Execution order:
 * 1. Rate limiter - Acquire token to control throughput
 * 2. Circuit breaker - Check if circuit is open
 * 3. Retry executor - Execute with retry logic
 */
export declare class DefaultResilienceOrchestrator implements ResilienceOrchestrator {
    private retry;
    private circuitBreaker;
    private rateLimiter;
    constructor(retry: RetryExecutor, circuitBreaker: CircuitBreaker, rateLimiter: RateLimiter);
    /**
     * Execute an operation through all resilience layers
     * @param operation - The async operation to execute
     * @returns The result of the operation
     * @throws Various errors from rate limiting, circuit breaking, or the operation itself
     */
    execute<T>(operation: () => Promise<T>): Promise<T>;
    /**
     * Create an orchestrator with default or custom configuration
     */
    static create(config?: Partial<ResilienceConfig>): DefaultResilienceOrchestrator;
    /**
     * Get the circuit breaker instance
     */
    getCircuitBreaker(): CircuitBreaker;
    /**
     * Get the rate limiter instance
     */
    getRateLimiter(): RateLimiter;
    /**
     * Get the retry executor instance
     */
    getRetryExecutor(): RetryExecutor;
}
/**
 * Passthrough orchestrator that executes operations without any resilience features
 * Useful for testing or when resilience is not needed
 */
export declare class PassthroughResilienceOrchestrator implements ResilienceOrchestrator {
    execute<T>(operation: () => Promise<T>): Promise<T>;
}
/**
 * Create a default resilience configuration
 */
export declare function createDefaultResilienceConfig(): ResilienceConfig;
//# sourceMappingURL=orchestrator.d.ts.map