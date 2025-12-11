/**
 * Orchestrates retry, circuit breaker, and rate limiting for resilient operations.
 */

import { RetryExecutor } from './retry.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { RateLimiter } from './rate-limiter.js';
import { GeminiError } from '../error/index.js';
import type { RetryConfig, CircuitBreakerConfig, RateLimitConfig } from '../config/index.js';
import { DEFAULT_RETRY_CONFIG } from '../config/index.js';

/**
 * Configuration for resilience orchestration.
 */
export interface ResilienceConfig {
  /** Retry configuration */
  retry?: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig;
  /** Rate limit configuration */
  rateLimit?: RateLimitConfig;
}

/**
 * Orchestrates multiple resilience patterns for robust API interactions.
 */
export class ResilienceOrchestrator {
  private readonly retry: RetryExecutor;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly rateLimiter?: RateLimiter;

  constructor(config: ResilienceConfig = {}) {
    this.retry = new RetryExecutor(config.retry ?? DEFAULT_RETRY_CONFIG);

    if (config.circuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    }

    if (config.rateLimit) {
      this.rateLimiter = new RateLimiter(config.rateLimit);
    }
  }

  /**
   * Execute an operation with full resilience patterns applied.
   *
   * Order of execution:
   * 1. Rate limiting (if configured)
   * 2. Circuit breaker (if configured)
   * 3. Retry with exponential backoff
   *
   * @param operation - The async operation to execute
   * @param estimatedTokens - Estimated tokens for rate limiting (optional)
   * @returns The result of the operation
   */
  async execute<T>(
    operation: () => Promise<T>,
    estimatedTokens?: number,
  ): Promise<T> {
    // Step 1: Rate limiting
    if (this.rateLimiter) {
      await this.rateLimiter.acquire(estimatedTokens);
    }

    // Step 2 & 3: Circuit breaker wrapping retry
    const wrappedOperation = () =>
      this.retry.execute(
        operation,
        (error) => error instanceof GeminiError && error.isRetryable,
        (error) => (error instanceof GeminiError ? error.retryAfter : undefined),
      );

    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(wrappedOperation);
    }

    return wrappedOperation();
  }

  /**
   * Get circuit breaker instance for manual control.
   */
  getCircuitBreaker(): CircuitBreaker | undefined {
    return this.circuitBreaker;
  }

  /**
   * Get rate limiter instance for manual control.
   */
  getRateLimiter(): RateLimiter | undefined {
    return this.rateLimiter;
  }

  /**
   * Reset all resilience components.
   */
  reset(): void {
    this.circuitBreaker?.reset();
    this.rateLimiter?.reset();
  }
}
