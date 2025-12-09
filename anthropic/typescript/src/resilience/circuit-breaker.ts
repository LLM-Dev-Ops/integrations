/**
 * Circuit breaker implementation following the three-state pattern
 */

import { CircuitBreakerConfig, CircuitBreakerHook, CircuitState } from './types.js';

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitOpenError extends Error {
  constructor(message: string) {
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
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | undefined = undefined;
  private config: CircuitBreakerConfig;
  private hooks: CircuitBreakerHook[] = [];

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Add a hook to be called on state changes
   */
  addHook(hook: CircuitBreakerHook): void {
    this.hooks.push(hook);
  }

  /**
   * Execute an operation through the circuit breaker
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws CircuitOpenError if circuit is open
   * @throws The original error from the operation
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.checkStateTransition();

    if (this.state === 'open') {
      throw new CircuitOpenError('Circuit breaker is open');
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
   * Check if circuit should transition from open to half-open
   */
  private checkStateTransition(): void {
    if (this.state === 'open' && this.shouldTransitionToHalfOpen()) {
      this.transitionTo('half_open');
    }
  }

  /**
   * Determine if enough time has passed to try half-open state
   */
  private shouldTransitionToHalfOpen(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.config.openDurationMs;
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(): void {
    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed operation
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      // Any failure in half-open state reopens the circuit
      this.transitionTo('open');
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    // Reset counters based on new state
    if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === 'half_open') {
      this.successCount = 0;
    } else if (newState === 'open') {
      this.successCount = 0;
    }

    // Notify hooks
    this.hooks.forEach(hook => hook.onStateChange(oldState, newState));
  }

  /**
   * Get the current state of the circuit breaker
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get the current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get the current success count
   */
  getSuccessCount(): number {
    return this.successCount;
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }
}

/**
 * Create a default circuit breaker configuration
 */
export function createDefaultCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    failureThreshold: 5,
    successThreshold: 3,
    openDurationMs: 30000,
  };
}
