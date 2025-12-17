/**
 * Circuit breaker implementation following the three-state pattern
 */
/**
 * Error thrown when circuit breaker is open
 */
export class CircuitOpenError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CircuitOpenError';
    }
}
/**
 * Circuit breaker that prevents cascading failures by failing fast when errors exceed threshold
 *
 * States:
 * - Closed: Normal operation, tracks failures
 * - Open: Fails fast, rejects all requests immediately
 * - Half-Open: Allows one test request through to check if service recovered
 */
export class CircuitBreaker {
    state = 'closed';
    failureCount = 0;
    successCount = 0;
    lastFailureTime = undefined;
    config;
    hooks = [];
    constructor(config) {
        this.config = config;
    }
    /**
     * Add a hook to be called on state changes
     */
    addHook(hook) {
        this.hooks.push(hook);
    }
    /**
     * Execute an operation through the circuit breaker
     * @param operation - The async operation to execute
     * @returns The result of the operation
     * @throws CircuitOpenError if circuit is open
     * @throws The original error from the operation
     */
    async execute(operation) {
        this.checkStateTransition();
        if (this.state === 'open') {
            throw new CircuitOpenError('Circuit breaker is open');
        }
        try {
            const result = await operation();
            this.recordSuccess();
            return result;
        }
        catch (error) {
            this.recordFailure();
            throw error;
        }
    }
    /**
     * Check if circuit should transition from open to half-open
     */
    checkStateTransition() {
        if (this.state === 'open' && this.shouldTransitionToHalfOpen()) {
            this.transitionTo('half_open');
        }
    }
    /**
     * Determine if enough time has passed to try half-open state
     */
    shouldTransitionToHalfOpen() {
        if (!this.lastFailureTime)
            return false;
        return Date.now() - this.lastFailureTime >= this.config.openDurationMs;
    }
    /**
     * Record a successful operation
     */
    recordSuccess() {
        if (this.state === 'half_open') {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.transitionTo('closed');
            }
        }
        else if (this.state === 'closed') {
            // Reset failure count on success
            this.failureCount = 0;
        }
    }
    /**
     * Record a failed operation
     */
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.state === 'half_open') {
            // Any failure in half-open state reopens the circuit
            this.transitionTo('open');
        }
        else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
            this.transitionTo('open');
        }
    }
    /**
     * Transition to a new state
     */
    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        // Reset counters based on new state
        if (newState === 'closed') {
            this.failureCount = 0;
            this.successCount = 0;
        }
        else if (newState === 'half_open') {
            this.successCount = 0;
        }
        else if (newState === 'open') {
            this.successCount = 0;
        }
        // Notify hooks
        this.hooks.forEach(hook => hook.onStateChange(oldState, newState));
    }
    /**
     * Get the current state of the circuit breaker
     */
    getState() {
        return this.state;
    }
    /**
     * Get the current failure count
     */
    getFailureCount() {
        return this.failureCount;
    }
    /**
     * Get the current success count
     */
    getSuccessCount() {
        return this.successCount;
    }
    /**
     * Reset the circuit breaker to closed state
     */
    reset() {
        this.transitionTo('closed');
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = undefined;
    }
    /**
     * Get comprehensive statistics about the circuit breaker state
     */
    getStats() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            config: { ...this.config },
            timeUntilHalfOpen: this.getTimeUntilHalfOpen(),
        };
    }
    /**
     * Get time remaining until circuit transitions to half-open (if open)
     * Returns undefined if circuit is not open
     */
    getTimeUntilHalfOpen() {
        if (this.state !== 'open' || !this.lastFailureTime) {
            return undefined;
        }
        const elapsed = Date.now() - this.lastFailureTime;
        const remaining = this.config.openDurationMs - elapsed;
        return remaining > 0 ? remaining : 0;
    }
}
/**
 * Create a default circuit breaker configuration
 */
export function createDefaultCircuitBreakerConfig() {
    return {
        failureThreshold: 5,
        successThreshold: 3,
        openDurationMs: 30000,
    };
}
//# sourceMappingURL=circuit-breaker.js.map