/**
 * Circuit breaker for the Mistral client.
 */

import { MistralError, isMistralError } from '../errors';

/**
 * Circuit breaker state.
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit. */
  failureThreshold: number;
  /** Duration the circuit stays open in milliseconds. */
  openDurationMs: number;
  /** Number of successes in half-open state to close the circuit. */
  halfOpenSuccesses: number;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  openDurationMs: 30000,
  halfOpenSuccesses: 2,
};

/**
 * Circuit breaker statistics.
 */
export interface CircuitBreakerStats {
  /** Current state. */
  state: CircuitBreakerState;
  /** Number of consecutive failures. */
  failureCount: number;
  /** Number of successes in half-open state. */
  halfOpenSuccessCount: number;
  /** Time when circuit was opened. */
  openedAt?: number;
  /** Time when circuit was last transitioned. */
  lastTransitionAt: number;
}

/**
 * Circuit breaker implementation.
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private halfOpenSuccessCount = 0;
  private openedAt?: number;
  private lastTransitionAt = Date.now();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Gets the current state.
   */
  getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Gets circuit breaker statistics.
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      halfOpenSuccessCount: this.halfOpenSuccessCount,
      openedAt: this.openedAt,
      lastTransitionAt: this.lastTransitionAt,
    };
  }

  /**
   * Checks if the circuit allows a request.
   */
  canExecute(): boolean {
    const state = this.getState();
    return state === 'closed' || state === 'half_open';
  }

  /**
   * Records a successful request.
   */
  recordSuccess(): void {
    if (this.state === 'half_open') {
      this.halfOpenSuccessCount++;

      if (this.halfOpenSuccessCount >= this.config.halfOpenSuccesses) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      this.failureCount = 0;
    }
  }

  /**
   * Records a failed request.
   */
  recordFailure(error: unknown): void {
    // Only count certain errors for circuit breaking
    if (isMistralError(error)) {
      if (!this.shouldCountAsFailure(error)) {
        return;
      }
    }

    if (this.state === 'half_open') {
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      this.failureCount++;

      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  /**
   * Executes an operation with circuit breaker protection.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw MistralError.circuitOpen('Circuit breaker is open');
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Resets the circuit breaker.
   */
  reset(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.halfOpenSuccessCount = 0;
    this.openedAt = undefined;
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state === newState) return;

    this.state = newState;
    this.lastTransitionAt = Date.now();

    if (newState === 'open') {
      this.openedAt = Date.now();
      this.halfOpenSuccessCount = 0;
    } else if (newState === 'closed') {
      this.failureCount = 0;
      this.halfOpenSuccessCount = 0;
    } else if (newState === 'half_open') {
      this.halfOpenSuccessCount = 0;
    }
  }

  private checkStateTransition(): void {
    if (this.state === 'open' && this.openedAt) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.openDurationMs) {
        this.transitionTo('half_open');
      }
    }
  }

  private shouldCountAsFailure(error: MistralError): boolean {
    // Don't count client errors as circuit breaker failures
    const clientErrors = [400, 401, 403, 404, 422];
    if (error.status && clientErrors.includes(error.status)) {
      return false;
    }
    return true;
  }
}

/**
 * Creates a circuit breaker with the given configuration.
 */
export function createCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  return new CircuitBreaker(config);
}
