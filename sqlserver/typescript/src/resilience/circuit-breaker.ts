/**
 * Circuit breaker implementation for SQL Server resilience following SPARC specification.
 *
 * Provides circuit breaker pattern to prevent cascading failures by failing fast
 * when a service is experiencing issues.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail fast
 * - HALF_OPEN: Testing if service is recovered
 */

import { CircuitBreakerOpenError } from '../errors/index.js';
import { Observability } from '../observability/index.js';

/**
 * Circuit breaker states.
 */
export enum CircuitState {
  /** Normal operation, requests pass through */
  CLOSED = 'CLOSED',
  /** Circuit is tripped, requests fail fast */
  OPEN = 'OPEN',
  /** Testing if service is recovered */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Number of successes in half-open state before closing */
  successThreshold: number;
  /** Time in milliseconds before moving from open to half-open */
  resetTimeoutMs: number;
}

/**
 * Circuit breaker statistics.
 */
export interface CircuitBreakerStats {
  /** Current circuit state */
  state: CircuitState;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Number of consecutive successes in half-open state */
  consecutiveSuccesses: number;
  /** Total number of calls */
  totalCalls: number;
  /** Total number of successful calls */
  totalSuccesses: number;
  /** Total number of failed calls */
  totalFailures: number;
  /** Total number of rejected calls (circuit open) */
  totalRejected: number;
  /** Timestamp when circuit was last opened (milliseconds since epoch) */
  lastOpenedAt?: number;
  /** Timestamp when circuit will attempt to close (milliseconds since epoch) */
  nextAttemptAt?: number;
}

/**
 * Circuit breaker implementation.
 *
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation, tracks failures
 * - OPEN: Too many failures, reject requests immediately
 * - HALF_OPEN: Testing recovery, allow limited requests
 *
 * Configuration from completion document:
 * - failure_threshold: 5 (failures before opening)
 * - success_threshold: 2 (successes in half-open before closing)
 * - reset_timeout: 30s (time before moving from open to half-open)
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly observability: Observability;
  private state: CircuitState;
  private consecutiveFailures: number;
  private consecutiveSuccesses: number;
  private totalCalls: number;
  private totalSuccesses: number;
  private totalFailures: number;
  private totalRejected: number;
  private lastOpenedAt?: number;
  private nextAttemptAt?: number;

  /**
   * Creates a new circuit breaker.
   *
   * @param config - Circuit breaker configuration
   * @param observability - Observability components (logger, metrics, tracer)
   */
  constructor(config: CircuitBreakerConfig, observability: Observability) {
    this.config = config;
    this.observability = observability;
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.totalCalls = 0;
    this.totalSuccesses = 0;
    this.totalFailures = 0;
    this.totalRejected = 0;

    this.observability.logger.info('Circuit breaker initialized', {
      failureThreshold: config.failureThreshold,
      successThreshold: config.successThreshold,
      resetTimeoutMs: config.resetTimeoutMs,
    });
  }

  /**
   * Executes a function with circuit breaker protection.
   *
   * @param fn - Function to execute
   * @returns Result of the function
   * @throws {CircuitBreakerOpenError} If circuit is open
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN && this.shouldAttemptReset()) {
      this.transitionToHalfOpen();
    }

    // Reject immediately if circuit is open
    if (this.state === CircuitState.OPEN) {
      this.totalRejected++;
      this.observability.logger.warn('Circuit breaker rejected request', {
        state: this.state,
        nextAttemptAt: this.nextAttemptAt,
      });
      this.observability.metrics.increment('sqlserver_circuit_breaker_rejected_total', 1);

      const resetTimeMs = this.nextAttemptAt ? this.nextAttemptAt - Date.now() : this.config.resetTimeoutMs;
      throw new CircuitBreakerOpenError(resetTimeMs);
    }

    // Execute the function
    this.totalCalls++;
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Gets the current circuit state.
   *
   * @returns Current circuit state
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN && this.shouldAttemptReset()) {
      this.transitionToHalfOpen();
    }

    return this.state;
  }

  /**
   * Manually resets the circuit breaker to closed state.
   */
  reset(): void {
    this.observability.logger.info('Circuit breaker manually reset', {
      previousState: this.state,
    });

    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastOpenedAt = undefined;
    this.nextAttemptAt = undefined;

    this.observability.metrics.increment('sqlserver_circuit_breaker_reset_total', 1);
    this.updateMetrics();
  }

  /**
   * Gets circuit breaker statistics.
   *
   * @returns Circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalCalls: this.totalCalls,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      totalRejected: this.totalRejected,
      lastOpenedAt: this.lastOpenedAt,
      nextAttemptAt: this.nextAttemptAt,
    };
  }

  /**
   * Handles successful execution.
   */
  private onSuccess(): void {
    this.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses++;

      this.observability.logger.debug('Circuit breaker success in half-open state', {
        consecutiveSuccesses: this.consecutiveSuccesses,
        successThreshold: this.config.successThreshold,
      });

      // Transition to CLOSED if we have enough successes
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.consecutiveFailures = 0;
    }

    this.observability.metrics.increment('sqlserver_circuit_breaker_success_total', 1, {
      state: this.state,
    });
    this.updateMetrics();
  }

  /**
   * Handles failed execution.
   */
  private onFailure(): void {
    this.totalFailures++;
    this.consecutiveFailures++;

    this.observability.logger.debug('Circuit breaker failure', {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.config.failureThreshold,
    });

    this.observability.metrics.increment('sqlserver_circuit_breaker_failure_total', 1, {
      state: this.state,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open immediately opens the circuit
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED) {
      // Open circuit if we exceed the failure threshold
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    }

    this.updateMetrics();
  }

  /**
   * Checks if the circuit should attempt to reset.
   */
  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptAt) {
      return false;
    }

    return Date.now() >= this.nextAttemptAt;
  }

  /**
   * Transitions the circuit to OPEN state.
   */
  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.lastOpenedAt = Date.now();
    this.nextAttemptAt = this.lastOpenedAt + this.config.resetTimeoutMs;
    this.consecutiveSuccesses = 0;

    this.observability.logger.warn('Circuit breaker opened', {
      previousState,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.config.failureThreshold,
      nextAttemptAt: this.nextAttemptAt,
    });

    this.observability.metrics.increment('sqlserver_circuit_breaker_state_change_total', 1, {
      from: previousState,
      to: this.state,
    });
    this.updateMetrics();
  }

  /**
   * Transitions the circuit to HALF_OPEN state.
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;

    this.observability.logger.info('Circuit breaker half-open', {
      previousState,
    });

    this.observability.metrics.increment('sqlserver_circuit_breaker_state_change_total', 1, {
      from: previousState,
      to: this.state,
    });
    this.updateMetrics();
  }

  /**
   * Transitions the circuit to CLOSED state.
   */
  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastOpenedAt = undefined;
    this.nextAttemptAt = undefined;

    this.observability.logger.info('Circuit breaker closed', {
      previousState,
      successThreshold: this.config.successThreshold,
    });

    this.observability.metrics.increment('sqlserver_circuit_breaker_state_change_total', 1, {
      from: previousState,
      to: this.state,
    });
    this.updateMetrics();
  }

  /**
   * Updates circuit breaker metrics.
   */
  private updateMetrics(): void {
    // Update state gauge
    this.observability.metrics.gauge('sqlserver_circuit_breaker_state', this.stateToNumber(this.state));

    // Update counters
    this.observability.metrics.gauge('sqlserver_circuit_breaker_consecutive_failures', this.consecutiveFailures);
    this.observability.metrics.gauge('sqlserver_circuit_breaker_consecutive_successes', this.consecutiveSuccesses);
  }

  /**
   * Converts circuit state to a number for metrics.
   */
  private stateToNumber(state: CircuitState): number {
    switch (state) {
      case CircuitState.CLOSED:
        return 0;
      case CircuitState.HALF_OPEN:
        return 1;
      case CircuitState.OPEN:
        return 2;
    }
  }
}

/**
 * Creates a circuit breaker with default configuration.
 *
 * @param observability - Observability components
 * @param config - Optional custom configuration
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker(
  observability: Observability,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeoutMs: 30000, // 30 seconds
  };

  return new CircuitBreaker({ ...defaultConfig, ...config }, observability);
}
