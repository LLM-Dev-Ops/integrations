/**
 * Resilience module for the Mistral client.
 */

export * from './retry';
export * from './circuit-breaker';
export * from './rate-limiter';

import { RetryExecutor, RetryConfig, DEFAULT_RETRY_CONFIG } from './retry';
import { CircuitBreaker, CircuitBreakerConfig, DEFAULT_CIRCUIT_BREAKER_CONFIG } from './circuit-breaker';
import { RateLimiter, RateLimiterConfig, DEFAULT_RATE_LIMITER_CONFIG } from './rate-limiter';

/**
 * Combined resilience configuration.
 */
export interface ResilienceConfig {
  retry: Partial<RetryConfig>;
  circuitBreaker: Partial<CircuitBreakerConfig>;
  rateLimiter: Partial<RateLimiterConfig>;
}

/**
 * Default resilience configuration.
 */
export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  retry: DEFAULT_RETRY_CONFIG,
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
  rateLimiter: DEFAULT_RATE_LIMITER_CONFIG,
};

/**
 * Resilience orchestrator that combines retry, circuit breaker, and rate limiting.
 */
export class ResilienceOrchestrator {
  private readonly retry: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiter;

  constructor(config: Partial<ResilienceConfig> = {}) {
    this.retry = new RetryExecutor(config.retry);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.rateLimiter = new RateLimiter(config.rateLimiter);
  }

  /**
   * Gets the retry executor.
   */
  getRetry(): RetryExecutor {
    return this.retry;
  }

  /**
   * Gets the circuit breaker.
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Gets the rate limiter.
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Executes an operation with full resilience protection.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // First, acquire a rate limit token
    await this.rateLimiter.acquire();

    // Then, execute through circuit breaker and retry
    return this.circuitBreaker.execute(() => this.retry.execute(operation));
  }

  /**
   * Resets all resilience components.
   */
  reset(): void {
    this.circuitBreaker.reset();
    this.rateLimiter.reset();
  }
}

/**
 * Creates a resilience orchestrator with the given configuration.
 */
export function createResilienceOrchestrator(
  config?: Partial<ResilienceConfig>
): ResilienceOrchestrator {
  return new ResilienceOrchestrator(config);
}
