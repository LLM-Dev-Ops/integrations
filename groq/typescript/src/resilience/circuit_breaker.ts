/**
 * Circuit breaker pattern implementation.
 */

import { GroqError } from '../errors';

/**
 * Circuit breaker states.
 */
export enum CircuitState {
  /** Circuit is closed, requests flow normally. */
  Closed = 'closed',
  /** Circuit is open, requests are rejected. */
  Open = 'open',
  /** Circuit is half-open, allowing test requests. */
  HalfOpen = 'half_open',
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit. */
  failureThreshold: number;
  /** Duration in milliseconds to keep the circuit open. */
  resetTimeoutMs: number;
  /** Number of successes in half-open state to close circuit. */
  successThreshold: number;
  /** Minimum requests before calculating failure rate. */
  minimumRequests: number;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 3,
  minimumRequests: 10,
};

/**
 * Circuit breaker for protecting against cascading failures.
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private requestCount = 0;
  private lastFailureTime: number | null = null;
  private openedAt: number | null = null;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Gets the current circuit state.
   */
  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Checks if the circuit allows requests.
   */
  isAllowed(): boolean {
    this.checkStateTransition();
    return this.state !== CircuitState.Open;
  }

  /**
   * Executes a function with circuit breaker protection.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAllowed()) {
      throw GroqError.circuitOpen();
    }

    this.requestCount++;

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Records a successful request.
   */
  recordSuccess(): void {
    this.checkStateTransition();

    switch (this.state) {
      case CircuitState.Closed:
        // Reset failure count on success
        this.failureCount = 0;
        break;

      case CircuitState.HalfOpen:
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          this.close();
        }
        break;

      case CircuitState.Open:
        // Shouldn't happen, but handle gracefully
        break;
    }
  }

  /**
   * Records a failed request.
   */
  recordFailure(error: unknown): void {
    this.checkStateTransition();

    // Only count failures that should trip the circuit
    if (!this.shouldCountFailure(error)) {
      return;
    }

    this.lastFailureTime = Date.now();

    switch (this.state) {
      case CircuitState.Closed:
        this.failureCount++;
        if (
          this.requestCount >= this.config.minimumRequests &&
          this.failureCount >= this.config.failureThreshold
        ) {
          this.open();
        }
        break;

      case CircuitState.HalfOpen:
        // Any failure in half-open state reopens the circuit
        this.open();
        break;

      case CircuitState.Open:
        // Already open, nothing to do
        break;
    }
  }

  /**
   * Manually resets the circuit breaker.
   */
  reset(): void {
    this.state = CircuitState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.openedAt = null;
  }

  /**
   * Gets circuit breaker statistics.
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    requestCount: number;
    lastFailureTime: number | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  private open(): void {
    this.state = CircuitState.Open;
    this.openedAt = Date.now();
    this.successCount = 0;
  }

  private close(): void {
    this.state = CircuitState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = null;
  }

  private halfOpen(): void {
    this.state = CircuitState.HalfOpen;
    this.successCount = 0;
  }

  private checkStateTransition(): void {
    if (this.state === CircuitState.Open && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.halfOpen();
      }
    }
  }

  private shouldCountFailure(error: unknown): boolean {
    if (!(error instanceof GroqError)) {
      return true;
    }

    // Only count failures that indicate service issues
    return error.shouldCircuitBreak();
  }
}

/**
 * Creates a circuit breaker.
 */
export function createCircuitBreaker(
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  return new CircuitBreaker(config);
}
