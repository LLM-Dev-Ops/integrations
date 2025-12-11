/**
 * Circuit breaker implementation for fault tolerance.
 */

import type { CircuitBreakerConfig } from '../config/index.js';

/**
 * Circuit breaker states.
 */
export enum CircuitState {
  /** Circuit is closed, requests flow normally */
  Closed = 'CLOSED',
  /** Circuit is open, requests are rejected immediately */
  Open = 'OPEN',
  /** Circuit is half-open, testing if service has recovered */
  HalfOpen = 'HALF_OPEN',
}

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
  private state: CircuitState = CircuitState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private halfOpenRequests = 0;

  constructor(private readonly config: CircuitBreakerConfig) {}

  /**
   * Execute an operation through the circuit breaker.
   *
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws CircuitBreakerOpenError if circuit is open
   * @throws The operation's error if it fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
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
    } catch (error) {
      this.recordFailure();
      throw error;
    } finally {
      if (this.state === CircuitState.HalfOpen) {
        this.halfOpenRequests--;
      }
    }
  }

  /**
   * Check and update circuit state based on time elapsed.
   */
  private checkState(): void {
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
  private recordSuccess(): void {
    if (this.state === CircuitState.HalfOpen) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.Closed;
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.Closed) {
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed operation.
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (
      this.state === CircuitState.Closed &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.state = CircuitState.Open;
    } else if (this.state === CircuitState.HalfOpen) {
      // If any failure in half-open, go back to open
      this.state = CircuitState.Open;
      this.successCount = 0;
    }
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    this.checkState();
    return this.state;
  }

  /**
   * Reset circuit breaker to closed state.
   */
  reset(): void {
    this.state = CircuitState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.halfOpenRequests = 0;
  }

  /**
   * Get circuit breaker metrics.
   */
  getMetrics(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    halfOpenRequests: number;
  } {
    this.checkState();
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      halfOpenRequests: this.halfOpenRequests,
    };
  }
}
