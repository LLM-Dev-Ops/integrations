/**
 * Circuit breaker implementation for fault tolerance.
 *
 * Implements the circuit breaker pattern with three states:
 * - Closed: Requests flow normally
 * - Open: Requests are rejected immediately
 * - HalfOpen: Testing if service has recovered
 */

import { isWeaviateError } from '../errors/base.js';
import {
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerStateInfo,
  CircuitStateChangeHook,
} from './types.js';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeoutMs: 30000,
  halfOpenRequests: 1,
  monitoringWindowMs: 60000,
  recordExceptions: [
    'ServiceUnavailableError',
    'InternalError',
    'TimeoutError',
    'ConnectionError',
  ],
  ignoreExceptions: [
    'InvalidObjectError',
    'InvalidFilterError',
    'ObjectNotFoundError',
    'UnauthorizedError',
    'ForbiddenError',
    'ConfigurationError',
  ],
};

// ============================================================================
// Circuit Breaker Error
// ============================================================================

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  public readonly state: CircuitBreakerState;
  public readonly timeUntilReset?: number;

  constructor(message: string, timeUntilReset?: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.state = CircuitBreakerState.Open;
    this.timeUntilReset = timeUntilReset;
  }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitBreakerState = CircuitBreakerState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private openedAt?: number;
  private failures: number[] = [];
  private halfOpenRequests = 0;
  private readonly hooks: CircuitStateChangeHook[] = [];

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...config,
    };
  }

  /**
   * Add a state change hook
   */
  addHook(hook: CircuitStateChangeHook): this {
    this.hooks.push(hook);
    return this;
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    this.updateState();
    return this.state;
  }

  /**
   * Get detailed state information
   */
  getStateInfo(): CircuitBreakerStateInfo {
    this.updateState();

    const info: CircuitBreakerStateInfo = {
      state: this.state,
      failureCount: this.failures.length,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      openedAt: this.openedAt,
    };

    if (this.state === CircuitBreakerState.Open && this.openedAt) {
      const elapsed = Date.now() - this.openedAt;
      info.timeUntilReset = Math.max(0, this.config.resetTimeoutMs - elapsed);
    }

    return info;
  }

  /**
   * Check if a request is allowed
   */
  allowRequest(): boolean {
    this.updateState();

    if (this.state === CircuitBreakerState.Closed) {
      return true;
    }

    if (this.state === CircuitBreakerState.HalfOpen) {
      // Allow limited number of test requests
      if (this.halfOpenRequests < this.config.halfOpenRequests) {
        this.halfOpenRequests++;
        return true;
      }
      return false;
    }

    // State is Open
    return false;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.allowRequest()) {
      const info = this.getStateInfo();
      throw new CircuitBreakerOpenError(
        `Circuit breaker is ${this.state}`,
        info.timeUntilReset
      );
    }

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
   * Record a successful request
   */
  recordSuccess(): void {
    if (this.state === CircuitBreakerState.HalfOpen) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.close();
      }
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(error?: unknown): void {
    // Check if this error should be recorded
    if (!this.shouldRecordError(error)) {
      return;
    }

    const now = Date.now();
    this.lastFailureTime = now;
    this.failures.push(now);

    // Clean old failures outside monitoring window
    const windowStart = now - this.config.monitoringWindowMs;
    this.failures = this.failures.filter((t) => t > windowStart);

    if (this.state === CircuitBreakerState.HalfOpen) {
      // Any failure in half-open immediately opens circuit
      this.open();
    } else if (this.failures.length >= this.config.failureThreshold) {
      // Threshold exceeded, open circuit
      this.open();
    }
  }

  /**
   * Determine if an error should be recorded
   */
  private shouldRecordError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return true;
    }

    const errorName = (error as Error).name;

    // Check if error is in ignore list
    if (this.config.ignoreExceptions.includes(errorName)) {
      return false;
    }

    // Check if error is in record list
    if (this.config.recordExceptions.includes(errorName)) {
      return true;
    }

    // For WeaviateErrors, use the retryable flag as a heuristic
    if (isWeaviateError(error)) {
      return error.isRetryable;
    }

    // Default to recording unknown errors
    return true;
  }

  /**
   * Update state based on time
   */
  private updateState(): void {
    if (this.state === CircuitBreakerState.Open && this.openedAt) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.halfOpen();
      }
    }
  }

  /**
   * Transition to Open state
   */
  private open(): void {
    if (this.state === CircuitBreakerState.Open) {
      return;
    }

    const oldState = this.state;
    this.state = CircuitBreakerState.Open;
    this.successCount = 0;
    this.halfOpenRequests = 0;
    this.openedAt = Date.now();

    this.notifyStateChange(oldState, this.state);
  }

  /**
   * Transition to HalfOpen state
   */
  private halfOpen(): void {
    if (this.state === CircuitBreakerState.HalfOpen) {
      return;
    }

    const oldState = this.state;
    this.state = CircuitBreakerState.HalfOpen;
    this.successCount = 0;
    this.halfOpenRequests = 0;

    this.notifyStateChange(oldState, this.state);
  }

  /**
   * Transition to Closed state
   */
  private close(): void {
    if (this.state === CircuitBreakerState.Closed) {
      return;
    }

    const oldState = this.state;
    this.state = CircuitBreakerState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.failures = [];
    this.openedAt = undefined;
    this.halfOpenRequests = 0;

    this.notifyStateChange(oldState, this.state);
  }

  /**
   * Notify hooks of state change
   */
  private async notifyStateChange(
    oldState: CircuitBreakerState,
    newState: CircuitBreakerState
  ): Promise<void> {
    const info = this.getStateInfo();
    for (const hook of this.hooks) {
      try {
        await hook(oldState, newState, info);
      } catch (error) {
        // Ignore hook errors to prevent affecting circuit breaker operation
        console.error('Circuit breaker hook error:', error);
      }
    }
  }

  /**
   * Force reset the circuit breaker
   */
  reset(): void {
    this.close();
  }

  /**
   * Get current configuration
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }
}
