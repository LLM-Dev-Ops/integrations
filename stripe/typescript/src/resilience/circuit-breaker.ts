/**
 * Circuit breaker pattern implementation
 */
import type { CircuitBreakerConfig } from '../config/config.js';

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Executes an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return operation();
    }

    if (!this.canExecute()) {
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
   * Checks if an operation can be executed
   */
  private canExecute(): boolean {
    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if timeout has elapsed
        if (Date.now() - this.lastFailureTime >= this.config.timeout) {
          this.state = 'half-open';
          this.successes = 0;
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
      if (this.successes >= this.config.successThreshold) {
        this.reset();
      }
    } else {
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
      this.trip();
    } else if (this.failures >= this.config.failureThreshold) {
      this.trip();
    }
  }

  /**
   * Trips the circuit to open state
   */
  private trip(): void {
    this.state = 'open';
    this.successes = 0;
  }

  /**
   * Resets the circuit to closed state
   */
  private reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
  }

  /**
   * Gets the current state
   */
  getState(): CircuitState {
    // Check for state transition
    if (
      this.state === 'open' &&
      Date.now() - this.lastFailureTime >= this.config.timeout
    ) {
      this.state = 'half-open';
    }
    return this.state;
  }

  /**
   * Gets circuit statistics
   */
  getStats(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
    };
  }

  /**
   * Manually resets the circuit breaker
   */
  forceReset(): void {
    this.reset();
  }

  /**
   * Manually trips the circuit breaker
   */
  forceOpen(): void {
    this.trip();
    this.lastFailureTime = Date.now();
  }
}

/**
 * Creates default circuit breaker configuration
 */
export function createDefaultCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    enabled: true,
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
  };
}
