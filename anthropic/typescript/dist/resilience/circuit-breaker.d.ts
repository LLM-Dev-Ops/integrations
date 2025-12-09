/**
 * Circuit breaker implementation following the three-state pattern
 */
import { CircuitBreakerConfig, CircuitBreakerHook, CircuitState } from './types.js';
/**
 * Error thrown when circuit breaker is open
 */
export declare class CircuitOpenError extends Error {
    constructor(message: string);
}
/**
 * Circuit breaker that prevents cascading failures by failing fast when errors exceed threshold
 *
 * States:
 * - Closed: Normal operation, tracks failures
 * - Open: Fails fast, rejects all requests immediately
 * - Half-Open: Allows one test request through to check if service recovered
 */
export declare class CircuitBreaker {
    private state;
    private failureCount;
    private successCount;
    private lastFailureTime?;
    private config;
    private hooks;
    constructor(config: CircuitBreakerConfig);
    /**
     * Add a hook to be called on state changes
     */
    addHook(hook: CircuitBreakerHook): void;
    /**
     * Execute an operation through the circuit breaker
     * @param operation - The async operation to execute
     * @returns The result of the operation
     * @throws CircuitOpenError if circuit is open
     * @throws The original error from the operation
     */
    execute<T>(operation: () => Promise<T>): Promise<T>;
    /**
     * Check if circuit should transition from open to half-open
     */
    private checkStateTransition;
    /**
     * Determine if enough time has passed to try half-open state
     */
    private shouldTransitionToHalfOpen;
    /**
     * Record a successful operation
     */
    private recordSuccess;
    /**
     * Record a failed operation
     */
    private recordFailure;
    /**
     * Transition to a new state
     */
    private transitionTo;
    /**
     * Get the current state of the circuit breaker
     */
    getState(): CircuitState;
    /**
     * Get the current failure count
     */
    getFailureCount(): number;
    /**
     * Get the current success count
     */
    getSuccessCount(): number;
    /**
     * Reset the circuit breaker to closed state
     */
    reset(): void;
}
/**
 * Create a default circuit breaker configuration
 */
export declare function createDefaultCircuitBreakerConfig(): CircuitBreakerConfig;
//# sourceMappingURL=circuit-breaker.d.ts.map