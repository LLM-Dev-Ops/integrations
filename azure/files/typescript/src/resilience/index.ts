/**
 * Azure Files Resilience Module
 *
 * Provides retry logic and circuit breaker functionality for resilient operations.
 * Following the SPARC specification for Azure Files integration.
 */

import { RetryConfig, CircuitBreakerConfig } from "../config/index.js";
import { AzureFilesError, isRetryable } from "../errors.js";

/**
 * Circuit breaker states.
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Circuit breaker for protecting against cascading failures.
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    if (this.state === "open") {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = "half-open";
        this.successCount = 0;
      }
    }
    return this.state;
  }

  /**
   * Check if circuit allows requests.
   */
  canExecute(): boolean {
    const state = this.getState();
    return state === "closed" || state === "half-open";
  }

  /**
   * Record a successful operation.
   */
  recordSuccess(): void {
    const state = this.getState();

    if (state === "half-open") {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = "closed";
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (state === "closed") {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed operation.
   */
  recordFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      // Any failure in half-open returns to open
      this.state = "open";
      this.successCount = 0;
    } else if (this.state === "closed") {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = "open";
      }
    }
  }

  /**
   * Reset the circuit breaker.
   */
  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Get circuit breaker statistics.
   */
  getStats(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.getState(),
      failures: this.failureCount,
      successes: this.successCount,
    };
  }
}

/**
 * Retry executor with exponential backoff.
 */
export class RetryExecutor {
  private config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  /**
   * Execute an operation with retry logic.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt < this.config.maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        // Check if error is retryable
        if (error instanceof AzureFilesError && !isRetryable(error)) {
          throw error;
        }

        // Check if we've exhausted retries
        if (attempt >= this.config.maxAttempts) {
          throw lastError;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error("Retry failed");
  }

  /**
   * Calculate delay for current attempt with exponential backoff.
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * multiplier^(attempt-1)
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.multiplier, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter (up to 25%)
    const jitter = cappedDelay * 0.25 * Math.random();

    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Resilient executor combining retry and circuit breaker.
 */
export class ResilientExecutor {
  private circuitBreaker: CircuitBreaker;
  private retryExecutor: RetryExecutor;

  constructor(retryConfig: RetryConfig, circuitBreakerConfig: CircuitBreakerConfig) {
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    this.retryExecutor = new RetryExecutor(retryConfig);
  }

  /**
   * Execute an operation with both retry and circuit breaker protection.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      throw new Error("Circuit breaker is open - operation rejected");
    }

    try {
      const result = await this.retryExecutor.execute(operation);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * Get circuit breaker state.
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Get circuit breaker statistics.
   */
  getStats(): { state: CircuitState; failures: number; successes: number } {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset the circuit breaker.
   */
  reset(): void {
    this.circuitBreaker.reset();
  }
}

/**
 * Create a circuit breaker.
 */
export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Create a retry executor.
 */
export function createRetryExecutor(config: RetryConfig): RetryExecutor {
  return new RetryExecutor(config);
}

/**
 * Create a resilient executor.
 */
export function createResilientExecutor(
  retryConfig: RetryConfig,
  circuitBreakerConfig: CircuitBreakerConfig
): ResilientExecutor {
  return new ResilientExecutor(retryConfig, circuitBreakerConfig);
}
