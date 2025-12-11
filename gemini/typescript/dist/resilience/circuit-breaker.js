/**
 * Circuit breaker implementation for fault tolerance.
 */
/**
 * Circuit breaker states.
 */
export var CircuitState;
(function (CircuitState) {
    /** Circuit is closed, requests flow normally */
    CircuitState["Closed"] = "CLOSED";
    /** Circuit is open, requests are rejected immediately */
    CircuitState["Open"] = "OPEN";
    /** Circuit is half-open, testing if service has recovered */
    CircuitState["HalfOpen"] = "HALF_OPEN";
})(CircuitState || (CircuitState = {}));
/**
 * Error thrown when circuit breaker is open.
 */
export class CircuitBreakerOpenError extends Error {
    constructor(message = 'Circuit breaker is open') {
        super(message);
        this.name = 'CircuitBreakerOpenError';
    }
}
/**
 * Circuit breaker to prevent cascading failures.
 */
export class CircuitBreaker {
    config;
    state = CircuitState.Closed;
    failureCount = 0;
    successCount = 0;
    lastFailureTime;
    halfOpenRequests = 0;
    constructor(config) {
        this.config = config;
    }
    /**
     * Execute an operation through the circuit breaker.
     *
     * @param operation - The async operation to execute
     * @returns The result of the operation
     * @throws CircuitBreakerOpenError if circuit is open
     * @throws The operation's error if it fails
     */
    async execute(operation) {
        this.checkState();
        if (this.state === CircuitState.Open) {
            throw new CircuitBreakerOpenError();
        }
        // In half-open state, limit concurrent requests
        if (this.state === CircuitState.HalfOpen) {
            if (this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
                throw new CircuitBreakerOpenError('Circuit breaker is half-open with max requests');
            }
            this.halfOpenRequests++;
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
        finally {
            if (this.state === CircuitState.HalfOpen) {
                this.halfOpenRequests--;
            }
        }
    }
    /**
     * Check and update circuit state based on time elapsed.
     */
    checkState() {
        if (this.state === CircuitState.Open && this.lastFailureTime) {
            const elapsedMs = Date.now() - this.lastFailureTime;
            if (elapsedMs >= this.config.openDuration) {
                this.state = CircuitState.HalfOpen;
                this.successCount = 0;
                this.halfOpenRequests = 0;
            }
        }
    }
    /**
     * Record a successful operation.
     */
    recordSuccess() {
        if (this.state === CircuitState.HalfOpen) {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.state = CircuitState.Closed;
                this.failureCount = 0;
                this.successCount = 0;
            }
        }
        else if (this.state === CircuitState.Closed) {
            this.failureCount = 0;
        }
    }
    /**
     * Record a failed operation.
     */
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.state === CircuitState.Closed &&
            this.failureCount >= this.config.failureThreshold) {
            this.state = CircuitState.Open;
        }
        else if (this.state === CircuitState.HalfOpen) {
            // If any failure in half-open, go back to open
            this.state = CircuitState.Open;
            this.successCount = 0;
        }
    }
    /**
     * Get current circuit state.
     */
    getState() {
        this.checkState();
        return this.state;
    }
    /**
     * Reset circuit breaker to closed state.
     */
    reset() {
        this.state = CircuitState.Closed;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = undefined;
        this.halfOpenRequests = 0;
    }
    /**
     * Get circuit breaker metrics.
     */
    getMetrics() {
        this.checkState();
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            halfOpenRequests: this.halfOpenRequests,
        };
    }
}
//# sourceMappingURL=circuit-breaker.js.map