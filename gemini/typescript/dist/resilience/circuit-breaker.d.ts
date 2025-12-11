/**
 * Circuit breaker implementation for fault tolerance.
 */
import type { CircuitBreakerConfig } from '../config/index.js';
/**
 * Circuit breaker states.
 */
export declare enum CircuitState {
    /** Circuit is closed, requests flow normally */
    Closed = "CLOSED",
    /** Circuit is open, requests are rejected immediately */
    Open = "OPEN",
    /** Circuit is half-open, testing if service has recovered */
    HalfOpen = "HALF_OPEN"
}
/**
 * Error thrown when circuit breaker is open.
 */
export declare class CircuitBreakerOpenError extends Error {
    constructor(message?: string);
}
/**
 * Circuit breaker to prevent cascading failures.
 */
export declare class CircuitBreaker {
    private readonly config;
    private state;
    private failureCount;
    private successCount;
    private lastFailureTime?;
    private halfOpenRequests;
    constructor(config: CircuitBreakerConfig);
    /**
     * Execute an operation through the circuit breaker.
     *
     * @param operation - The async operation to execute
     * @returns The result of the operation
     * @throws CircuitBreakerOpenError if circuit is open
     * @throws The operation's error if it fails
     */
    execute<T>(operation: () => Promise<T>): Promise<T>;
    /**
     * Check and update circuit state based on time elapsed.
     */
    private checkState;
    /**
     * Record a successful operation.
     */
    private recordSuccess;
    /**
     * Record a failed operation.
     */
    private recordFailure;
    /**
     * Get current circuit state.
     */
    getState(): CircuitState;
    /**
     * Reset circuit breaker to closed state.
     */
    reset(): void;
    /**
     * Get circuit breaker metrics.
     */
    getMetrics(): {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        halfOpenRequests: number;
    };
}
//# sourceMappingURL=circuit-breaker.d.ts.map