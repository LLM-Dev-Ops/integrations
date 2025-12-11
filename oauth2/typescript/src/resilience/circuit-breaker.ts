/**
 * OAuth2 Circuit Breaker
 *
 * Circuit breaker pattern for OAuth2 operations.
 */

import { NetworkError } from "../error";

/**
 * Circuit breaker state.
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Number of successes in half-open state before closing */
  successThreshold: number;
  /** Time window for counting failures in milliseconds */
  failureWindowMs: number;
  /** Time before attempting recovery in milliseconds */
  resetTimeoutMs: number;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  failureWindowMs: 60000, // 1 minute
  resetTimeoutMs: 30000, // 30 seconds
};

/**
 * Circuit breaker interface.
 */
export interface CircuitBreaker {
  /**
   * Execute operation through circuit breaker.
   */
  execute<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Get current state.
   */
  getState(): CircuitState;

  /**
   * Reset circuit breaker.
   */
  reset(): void;
}

/**
 * OAuth2 circuit breaker implementation.
 */
export class OAuth2CircuitBreaker implements CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = "closed";
  private failures: number[] = [];
  private successesInHalfOpen: number = 0;
  private lastFailureTime?: number;
  private openedAt?: number;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === "open") {
      // Check if we should transition to half-open
      if (this.shouldAttemptReset()) {
        this.state = "half-open";
        this.successesInHalfOpen = 0;
      } else {
        throw new NetworkError("Circuit breaker is open", "CircuitOpen", {
          retryable: false,
        });
      }
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

  getState(): CircuitState {
    // Check if open circuit should transition to half-open
    if (this.state === "open" && this.shouldAttemptReset()) {
      this.state = "half-open";
      this.successesInHalfOpen = 0;
    }
    return this.state;
  }

  reset(): void {
    this.state = "closed";
    this.failures = [];
    this.successesInHalfOpen = 0;
    this.lastFailureTime = undefined;
    this.openedAt = undefined;
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.successesInHalfOpen++;
      if (this.successesInHalfOpen >= this.config.successThreshold) {
        // Transition to closed
        this.state = "closed";
        this.failures = [];
        this.openedAt = undefined;
      }
    } else {
      // In closed state, we don't need to track successes
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;

    if (this.state === "half-open") {
      // Any failure in half-open goes back to open
      this.state = "open";
      this.openedAt = now;
      this.successesInHalfOpen = 0;
      return;
    }

    // In closed state, track failures
    this.failures.push(now);

    // Remove old failures outside window
    const windowStart = now - this.config.failureWindowMs;
    this.failures = this.failures.filter((t) => t >= windowStart);

    // Check if we should open the circuit
    if (this.failures.length >= this.config.failureThreshold) {
      this.state = "open";
      this.openedAt = now;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.openedAt) {
      return true;
    }
    return Date.now() - this.openedAt >= this.config.resetTimeoutMs;
  }
}

/**
 * Mock circuit breaker for testing.
 */
export class MockCircuitBreaker implements CircuitBreaker {
  private state: CircuitState = "closed";
  private executeHistory: Array<{ state: CircuitState; success: boolean }> = [];
  private forceState?: CircuitState;

  /**
   * Force circuit state.
   */
  setForceState(state: CircuitState | undefined): this {
    this.forceState = state;
    return this;
  }

  /**
   * Get execution history.
   */
  getExecuteHistory(): Array<{ state: CircuitState; success: boolean }> {
    return [...this.executeHistory];
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const currentState = this.forceState ?? this.state;

    if (currentState === "open") {
      throw new NetworkError("Circuit breaker is open", "CircuitOpen", {
        retryable: false,
      });
    }

    try {
      const result = await operation();
      this.executeHistory.push({ state: currentState, success: true });
      return result;
    } catch (error) {
      this.executeHistory.push({ state: currentState, success: false });
      throw error;
    }
  }

  getState(): CircuitState {
    return this.forceState ?? this.state;
  }

  reset(): void {
    this.state = "closed";
    this.forceState = undefined;
  }
}

/**
 * Create OAuth2 circuit breaker.
 */
export function createCircuitBreaker(
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return new OAuth2CircuitBreaker(config);
}

/**
 * Create mock circuit breaker for testing.
 */
export function createMockCircuitBreaker(): MockCircuitBreaker {
  return new MockCircuitBreaker();
}
