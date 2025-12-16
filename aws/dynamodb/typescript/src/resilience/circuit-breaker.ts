/**
 * Circuit Breaker implementation for DynamoDB operations.
 *
 * Provides fault tolerance by preventing cascading failures when DynamoDB
 * is experiencing issues or throttling.
 */

import type { CircuitBreakerConfig } from '../config/index.js';

/**
 * Circuit breaker state.
 */
export enum CircuitState {
  /** Circuit is closed - requests flow through normally */
  CLOSED = 'CLOSED',
  /** Circuit is open - requests are rejected immediately */
  OPEN = 'OPEN',
  /** Circuit is testing if service has recovered */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker for DynamoDB operations.
 *
 * Implements the circuit breaker pattern to provide fault tolerance:
 * - CLOSED: Normal operation, failures are counted
 * - OPEN: After threshold failures, reject requests for a timeout period
 * - HALF_OPEN: After timeout, allow limited requests to test recovery
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: number;
  private readonly config: Required<CircuitBreakerConfig>;

  /**
   * Creates a new circuit breaker.
   *
   * @param config - Circuit breaker configuration
   */
  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: config.failureThreshold,
      successThreshold: config.successThreshold,
      openDurationMs: config.openDurationMs,
    };
  }

  /**
   * Executes an operation through the circuit breaker.
   *
   * @template T - Return type of the operation
   * @param operation - Async operation to execute
   * @returns Promise resolving to operation result
   * @throws Error if circuit is open
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we should allow the request
    this.checkState();

    if (this.state === CircuitState.OPEN) {
      throw new Error('Circuit breaker is OPEN - request rejected');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Records a successful operation.
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  /**
   * Records a failed operation.
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  /**
   * Checks and updates the circuit state based on time and thresholds.
   */
  private checkState(): void {
    if (this.state === CircuitState.OPEN && this.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.config.openDurationMs) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      }
    }
  }

  /**
   * Gets the current circuit state.
   *
   * @returns Current state
   */
  getState(): CircuitState {
    this.checkState();
    return this.state;
  }

  /**
   * Resets the circuit breaker to closed state.
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }

  /**
   * Gets circuit breaker statistics.
   *
   * @returns Statistics object
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime?: number;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  openDurationMs: 60000, // 1 minute
};
