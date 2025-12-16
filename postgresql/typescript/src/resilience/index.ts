/**
 * Resilience patterns for PostgreSQL client following SPARC specification.
 *
 * Provides retry logic with exponential backoff and circuit breaker patterns
 * to handle transient failures and prevent cascading failures.
 *
 * @module resilience
 */

import { PgError, isPgError } from '../errors/index.js';
import { Observability, SpanContext } from '../observability/index.js';

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Initial backoff delay in milliseconds (default: 100) */
  initialBackoff: number;
  /** Maximum backoff delay in milliseconds (default: 10000) */
  maxBackoff: number;
  /** Backoff multiplier for exponential backoff (default: 2.0) */
  multiplier: number;
  /** Jitter factor between 0.0 and 1.0 to randomize backoff (default: 0.1) */
  jitter: number;
  /** PostgreSQL error codes (SQLSTATE) that should trigger a retry */
  retryableErrors: string[];
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialBackoff: 100,
  maxBackoff: 10000,
  multiplier: 2.0,
  jitter: 0.1,
  retryableErrors: [
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
  ],
};

/**
 * Configuration for circuit breaker behavior.
 */
export interface CircuitBreakerConfig {
  /** Whether the circuit breaker is enabled (default: true) */
  enabled: boolean;
  /** Number of consecutive failures before opening the circuit (default: 5) */
  failureThreshold: number;
  /** Number of consecutive successes to close the circuit from half-open (default: 3) */
  successThreshold: number;
  /** Time in milliseconds to wait before transitioning from open to half-open (default: 30000) */
  resetTimeout: number;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeout: 30000,
};

// ============================================================================
// Circuit Breaker State
// ============================================================================

/**
 * Circuit breaker state.
 */
export enum CircuitBreakerState {
  /** Circuit is closed, requests flow normally */
  Closed = 'closed',
  /** Circuit is open, requests are rejected */
  Open = 'open',
  /** Circuit is testing recovery, limited requests are allowed */
  HalfOpen = 'half_open',
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker implementation to prevent cascading failures.
 *
 * The circuit breaker has three states:
 * - Closed: Normal operation, all requests are allowed
 * - Open: Failures have exceeded threshold, requests are rejected
 * - HalfOpen: Testing recovery, limited requests are allowed
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker(config);
 * if (!breaker.isOpen()) {
 *   try {
 *     await operation();
 *     breaker.recordSuccess();
 *   } catch (error) {
 *     breaker.recordFailure();
 *     throw error;
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.Closed;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: number;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Gets the current state of the circuit breaker.
   */
  getState(): CircuitBreakerState {
    this.updateState();
    return this.state;
  }

  /**
   * Records a successful operation.
   *
   * In the Closed state, this has no effect.
   * In the HalfOpen state, increments success count and may close the circuit.
   */
  recordSuccess(): void {
    if (!this.config.enabled) {
      return;
    }

    this.updateState();

    if (this.state === CircuitBreakerState.HalfOpen) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitBreakerState.Closed) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Records a failed operation.
   *
   * Increments failure count and may open the circuit if threshold is exceeded.
   */
  recordFailure(): void {
    if (!this.config.enabled) {
      return;
    }

    this.updateState();

    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === CircuitBreakerState.HalfOpen) {
      // Any failure in half-open state reopens the circuit
      this.transitionToOpen();
    } else if (
      this.state === CircuitBreakerState.Closed &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.transitionToOpen();
    }
  }

  /**
   * Checks if the circuit breaker is open.
   *
   * @returns true if the circuit is open and requests should be rejected
   */
  isOpen(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    this.updateState();
    return this.state === CircuitBreakerState.Open;
  }

  /**
   * Manually resets the circuit breaker to closed state.
   *
   * Useful for administrative reset or testing.
   */
  reset(): void {
    this.transitionToClosed();
  }

  /**
   * Updates the state based on time and thresholds.
   */
  private updateState(): void {
    if (this.state === CircuitBreakerState.Open && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeout) {
        this.transitionToHalfOpen();
      }
    }
  }

  /**
   * Transitions to the Closed state.
   */
  private transitionToClosed(): void {
    this.state = CircuitBreakerState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }

  /**
   * Transitions to the Open state.
   */
  private transitionToOpen(): void {
    this.state = CircuitBreakerState.Open;
    this.successCount = 0;
  }

  /**
   * Transitions to the HalfOpen state.
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitBreakerState.HalfOpen;
    this.failureCount = 0;
    this.successCount = 0;
  }
}

// ============================================================================
// Retry Executor
// ============================================================================

/**
 * Retry executor with exponential backoff and jitter.
 *
 * Executes operations with automatic retry on transient failures.
 * Supports circuit breaker integration to prevent retries when the circuit is open.
 *
 * @example
 * ```typescript
 * const executor = new RetryExecutor(retryConfig, circuitBreaker);
 * const result = await executor.execute(
 *   async () => await db.query('SELECT 1'),
 *   'health-check'
 * );
 * ```
 */
export class RetryExecutor {
  private readonly config: RetryConfig;
  private readonly circuitBreaker?: CircuitBreaker;

  constructor(config: RetryConfig = DEFAULT_RETRY_CONFIG, circuitBreaker?: CircuitBreaker) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * Executes a function with retry logic.
   *
   * @param fn - The async function to execute
   * @param context - Optional context for logging and debugging
   * @returns The result of the function
   * @throws {PgError} If all retry attempts fail
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt < this.config.maxAttempts) {
      // Check circuit breaker before attempting
      if (this.circuitBreaker?.isOpen()) {
        throw new PgError({
          code: 'CIRCUIT_BREAKER_OPEN' as any,
          message: `Circuit breaker is open${context ? ` for ${context}` : ''}`,
          retryable: false,
        });
      }

      try {
        const result = await fn();
        this.circuitBreaker?.recordSuccess();
        return result;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Record failure in circuit breaker
        this.circuitBreaker?.recordFailure();

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error;
        }

        // Don't sleep after last attempt
        if (attempt >= this.config.maxAttempts) {
          break;
        }

        // Calculate backoff with exponential growth and jitter
        const backoff = this.calculateBackoff(attempt);
        await this.sleep(backoff);
      }
    }

    // All attempts failed
    throw lastError;
  }

  /**
   * Checks if an error is retryable based on configuration.
   *
   * @param error - The error to check
   * @returns true if the error should be retried
   */
  private isRetryable(error: unknown): boolean {
    // Check if it's a PgError with a retryable code
    if (isPgError(error)) {
      if (error.code && this.config.retryableErrors.includes(error.code)) {
        return true;
      }
      // Also check the built-in retryable property
      return error.retryable;
    }

    // For non-PgError errors, check common transient error patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound')
      );
    }

    return false;
  }

  /**
   * Calculates the backoff delay with exponential growth and jitter.
   *
   * @param attempt - The current attempt number (1-based)
   * @returns Backoff delay in milliseconds
   */
  private calculateBackoff(attempt: number): number {
    // Exponential backoff: initialBackoff * (multiplier ^ (attempt - 1))
    const exponentialBackoff = this.config.initialBackoff * Math.pow(this.config.multiplier, attempt - 1);

    // Cap at maxBackoff
    const cappedBackoff = Math.min(exponentialBackoff, this.config.maxBackoff);

    // Apply jitter: backoff +/- (backoff * jitter * random)
    const jitterRange = cappedBackoff * this.config.jitter;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    return Math.max(0, Math.floor(cappedBackoff + jitter));
  }

  /**
   * Sleeps for the specified duration.
   *
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Resilience Orchestrator
// ============================================================================

/**
 * Orchestrates retry logic with circuit breaker and observability.
 *
 * Combines retry executor and circuit breaker with integrated metrics
 * and logging for comprehensive resilience patterns.
 *
 * @example
 * ```typescript
 * const orchestrator = new ResilienceOrchestrator(
 *   retryConfig,
 *   circuitBreakerConfig,
 *   observability
 * );
 *
 * const result = await orchestrator.execute(async () => {
 *   return await db.query('SELECT * FROM users');
 * });
 * ```
 */
export class ResilienceOrchestrator {
  private readonly retryExecutor: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly observability: Observability;

  constructor(
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
    circuitBreakerConfig: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
    observability: Observability
  ) {
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    this.retryExecutor = new RetryExecutor(retryConfig, this.circuitBreaker);
    this.observability = observability;
  }

  /**
   * Executes a function with full resilience patterns.
   *
   * Includes retry logic, circuit breaker, metrics, and tracing.
   *
   * @param fn - The async function to execute
   * @param context - Optional context for logging and metrics
   * @returns The result of the function
   * @throws {PgError} If execution fails after all retries
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | undefined;

    return this.observability.tracer.withSpan(
      'resilience.execute',
      async (span: SpanContext) => {
        span.setAttribute('context', context ?? 'unknown');

        try {
          const result = await this.retryExecutor.execute(async () => {
            attempt++;

            // Log retry attempts
            if (attempt > 1) {
              this.observability.logger.warn('Retrying operation', {
                context,
                attempt,
                circuitState: this.circuitBreaker.getState(),
              });

              // Track retry metric
              this.observability.metrics.increment('pg_retry_attempts_total', 1, {
                context: context ?? 'unknown',
                attempt: attempt.toString(),
              });
            }

            // Execute the function
            try {
              return await fn();
            } catch (error) {
              lastError = error as Error;

              // Log error details
              const pgError = isPgError(lastError) ? lastError : null;
              this.observability.logger.error('Operation failed', {
                context,
                attempt,
                error: lastError.message,
                errorCode: pgError ? pgError.code : 'unknown',
              });

              // Track error metric
              this.observability.metrics.increment('pg_errors_total', 1, {
                context: context ?? 'unknown',
                errorCode: pgError ? pgError.code : 'unknown',
                retryable: this.isRetryableError(lastError) ? 'true' : 'false',
              });

              throw error;
            }
          }, context);

          // Record successful execution
          const duration = Date.now() - startTime;
          this.observability.metrics.timing('pg_resilience_execution_duration_ms', duration, {
            context: context ?? 'unknown',
            success: 'true',
            attempts: attempt.toString(),
          });

          span.setAttribute('success', true);
          span.setAttribute('attempts', attempt);
          span.setStatus('OK');

          return result;
        } catch (error) {
          // Record failed execution
          const duration = Date.now() - startTime;
          this.observability.metrics.timing('pg_resilience_execution_duration_ms', duration, {
            context: context ?? 'unknown',
            success: 'false',
            attempts: attempt.toString(),
          });

          // Track circuit breaker state changes
          const circuitState = this.circuitBreaker.getState();
          this.observability.metrics.gauge('pg_circuit_breaker_state', this.stateToNumber(circuitState), {
            context: context ?? 'unknown',
          });

          span.setAttribute('success', false);
          span.setAttribute('attempts', attempt);
          span.setAttribute('circuitState', circuitState);
          span.recordException(error as Error);
          span.setStatus('ERROR', (error as Error).message);

          throw error;
        }
      }
    );
  }

  /**
   * Gets the current circuit breaker state.
   *
   * @returns The current circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  /**
   * Resets the circuit breaker to closed state.
   *
   * Useful for administrative reset.
   */
  resetCircuitBreaker(): void {
    const oldState = this.circuitBreaker.getState();
    this.circuitBreaker.reset();
    const newState = this.circuitBreaker.getState();

    this.observability.logger.info('Circuit breaker reset', {
      oldState,
      newState,
    });

    this.observability.metrics.increment('pg_circuit_breaker_resets_total', 1);
  }

  /**
   * Checks if an error is retryable.
   */
  private isRetryableError(error: unknown): boolean {
    if (isPgError(error)) {
      return error.retryable;
    }
    return false;
  }

  /**
   * Converts circuit breaker state to a numeric value for metrics.
   *
   * @param state - The circuit breaker state
   * @returns Numeric representation (0=closed, 1=half_open, 2=open)
   */
  private stateToNumber(state: CircuitBreakerState): number {
    switch (state) {
      case CircuitBreakerState.Closed:
        return 0;
      case CircuitBreakerState.HalfOpen:
        return 1;
      case CircuitBreakerState.Open:
        return 2;
      default:
        return -1;
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  PgError,
  isPgError,
} from '../errors/index.js';

export type { Observability } from '../observability/index.js';
