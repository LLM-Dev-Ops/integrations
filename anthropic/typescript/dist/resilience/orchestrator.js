/**
 * Resilience orchestrator that combines retry, circuit breaker, and rate limiting
 */
import { RetryExecutor, createDefaultRetryConfig } from './retry.js';
import { CircuitBreaker, createDefaultCircuitBreakerConfig } from './circuit-breaker.js';
import { RateLimiter, createDefaultRateLimiterConfig } from './rate-limiter.js';
/**
 * Default implementation that combines all resilience patterns
 *
 * Execution order:
 * 1. Rate limiter - Acquire token to control throughput
 * 2. Circuit breaker - Check if circuit is open
 * 3. Retry executor - Execute with retry logic
 */
export class DefaultResilienceOrchestrator {
    retry;
    circuitBreaker;
    rateLimiter;
    constructor(retry, circuitBreaker, rateLimiter) {
        this.retry = retry;
        this.circuitBreaker = circuitBreaker;
        this.rateLimiter = rateLimiter;
    }
    /**
     * Execute an operation through all resilience layers
     * @param operation - The async operation to execute
     * @returns The result of the operation
     * @throws Various errors from rate limiting, circuit breaking, or the operation itself
     */
    async execute(operation) {
        // 1. Acquire rate limit token
        await this.rateLimiter.acquire();
        // 2. Execute through circuit breaker and retry
        return this.circuitBreaker.execute(() => this.retry.execute(operation));
    }
    /**
     * Create an orchestrator with default or custom configuration
     */
    static create(config) {
        const retry = new RetryExecutor(config?.retry ?? createDefaultRetryConfig());
        const circuitBreaker = new CircuitBreaker(config?.circuitBreaker ?? createDefaultCircuitBreakerConfig());
        const rateLimiter = new RateLimiter(config?.rateLimiter ?? createDefaultRateLimiterConfig());
        return new DefaultResilienceOrchestrator(retry, circuitBreaker, rateLimiter);
    }
    /**
     * Get the circuit breaker instance
     */
    getCircuitBreaker() {
        return this.circuitBreaker;
    }
    /**
     * Get the rate limiter instance
     */
    getRateLimiter() {
        return this.rateLimiter;
    }
    /**
     * Get the retry executor instance
     */
    getRetryExecutor() {
        return this.retry;
    }
}
/**
 * Passthrough orchestrator that executes operations without any resilience features
 * Useful for testing or when resilience is not needed
 */
export class PassthroughResilienceOrchestrator {
    async execute(operation) {
        return operation();
    }
}
/**
 * Create a default resilience configuration
 */
export function createDefaultResilienceConfig() {
    return {
        retry: createDefaultRetryConfig(),
        circuitBreaker: createDefaultCircuitBreakerConfig(),
        rateLimiter: createDefaultRateLimiterConfig(),
    };
}
//# sourceMappingURL=orchestrator.js.map