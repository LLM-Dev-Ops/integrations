/**
 * Resilience orchestrator that combines retry, circuit breaker, and rate limiting
 */

import { RetryExecutor, createDefaultRetryConfig } from './retry.js';
import { CircuitBreaker, createDefaultCircuitBreakerConfig } from './circuit-breaker.js';
import { RateLimiter, createDefaultRateLimiterConfig } from './rate-limiter.js';
import { ResilienceConfig } from './types.js';

/**
 * Interface for resilience orchestration
 */
export interface ResilienceOrchestrator {
  execute<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Default implementation that combines all resilience patterns
 *
 * Execution order:
 * 1. Rate limiter - Acquire token to control throughput
 * 2. Circuit breaker - Check if circuit is open
 * 3. Retry executor - Execute with retry logic
 */
export class DefaultResilienceOrchestrator implements ResilienceOrchestrator {
  private retry: RetryExecutor;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;

  constructor(
    retry: RetryExecutor,
    circuitBreaker: CircuitBreaker,
    rateLimiter: RateLimiter,
  ) {
    this.retry = retry;
    this.circuitBreaker = circuitBreaker;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Execute an operation through all resilience layers
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws Various errors from rate limiting, circuit breaking, or the operation itself
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // 1. Acquire rate limit token
    await this.rateLimiter.acquire();

    // 2. Execute through circuit breaker and retry
    return this.circuitBreaker.execute(() =>
      this.retry.execute(operation)
    );
  }

  /**
   * Create an orchestrator with default or custom configuration
   */
  static create(config?: Partial<ResilienceConfig>): DefaultResilienceOrchestrator {
    const retry = new RetryExecutor(config?.retry ?? createDefaultRetryConfig());
    const circuitBreaker = new CircuitBreaker(
      config?.circuitBreaker ?? createDefaultCircuitBreakerConfig()
    );
    const rateLimiter = new RateLimiter(
      config?.rateLimiter ?? createDefaultRateLimiterConfig()
    );

    return new DefaultResilienceOrchestrator(retry, circuitBreaker, rateLimiter);
  }

  /**
   * Get the circuit breaker instance
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Get the rate limiter instance
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Get the retry executor instance
   */
  getRetryExecutor(): RetryExecutor {
    return this.retry;
  }
}

/**
 * Passthrough orchestrator that executes operations without any resilience features
 * Useful for testing or when resilience is not needed
 */
export class PassthroughResilienceOrchestrator implements ResilienceOrchestrator {
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }
}

/**
 * Create a default resilience configuration
 */
export function createDefaultResilienceConfig(): ResilienceConfig {
  return {
    retry: createDefaultRetryConfig(),
    circuitBreaker: createDefaultCircuitBreakerConfig(),
    rateLimiter: createDefaultRateLimiterConfig(),
  };
}
