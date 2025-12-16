/**
 * Circuit breaker pattern implementation for Cloudflare R2
 */

import type { R2CircuitBreakerConfig } from '../config/index.js';

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  resetTimeout: number;
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitOpenError);
    }
  }
}

/**
 * Circuit breaker implementation to prevent cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime?: number;
  private readonly options: CircuitBreakerOptions;
  private readonly enabled: boolean;

  constructor(config: R2CircuitBreakerConfig) {
    this.enabled = config.enabled;
    this.options = {
      failureThreshold: config.failureThreshold,
      successThreshold: config.successThreshold,
      resetTimeout: config.resetTimeout,
    };
  }

  /**
   * Executes an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Bypass circuit breaker if disabled
    if (!this.enabled) {
      return operation();
    }

    // Check if circuit allows execution
    if (!this.canExecute()) {
      this.emitStateChange('open');
      throw new CircuitOpenError();
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Gets the current circuit state
   */
  getState(): CircuitState {
    // Check for automatic state transition from open to half-open
    if (this.shouldReset()) {
      this.state = 'half-open';
      this.successes = 0;
      this.emitStateChange('half-open');
    }

    return this.state;
  }

  /**
   * Manually resets the circuit to closed state
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.emitStateChange('closed');
  }

  /**
   * Gets circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime?: number;
  } {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Manually opens the circuit
   */
  forceOpen(): void {
    this.state = 'open';
    this.lastFailureTime = Date.now();
    this.successes = 0;
    this.emitStateChange('open');
  }

  /**
   * Checks if an operation can be executed
   */
  private canExecute(): boolean {
    const currentState = this.getState();

    switch (currentState) {
      case 'closed':
        return true;

      case 'open':
        // Check if timeout has elapsed
        if (this.shouldReset()) {
          this.state = 'half-open';
          this.successes = 0;
          this.emitStateChange('half-open');
          return true;
        }
        return false;

      case 'half-open':
        return true;
    }
  }

  /**
   * Records a successful operation
   */
  private recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        // Close the circuit after enough successes
        this.reset();
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Records a failed operation
   */
  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Immediately trip circuit if failure in half-open state
      this.trip();
    } else if (this.state === 'closed' && this.failures >= this.options.failureThreshold) {
      // Trip circuit if failure threshold exceeded
      this.trip();
    }
  }

  /**
   * Trips the circuit to open state
   */
  private trip(): void {
    this.state = 'open';
    this.successes = 0;
    this.emitStateChange('open');
  }

  /**
   * Checks if circuit should reset from open to half-open
   */
  private shouldReset(): boolean {
    if (this.state !== 'open' || !this.lastFailureTime) {
      return false;
    }

    const elapsed = Date.now() - this.lastFailureTime;
    return elapsed >= this.options.resetTimeout;
  }

  /**
   * Emits state change for monitoring
   */
  private emitStateChange(newState: CircuitState): void {
    // Log state changes for observability
    if (this.state !== newState) {
      console.info(
        `[R2 Circuit Breaker] State transition: ${this.state} -> ${newState} ` +
        `(failures: ${this.failures}, successes: ${this.successes})`
      );
    }
  }
}

/**
 * Creates a circuit breaker from R2 circuit breaker config
 */
export function createCircuitBreaker(config: R2CircuitBreakerConfig): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Creates a default circuit breaker
 */
export function createDefaultCircuitBreaker(): CircuitBreaker {
  return new CircuitBreaker({
    enabled: true,
    failureThreshold: 5,
    successThreshold: 3,
    resetTimeout: 30000,
  });
}
