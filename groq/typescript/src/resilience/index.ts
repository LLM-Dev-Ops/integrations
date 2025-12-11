/**
 * Resilience layer exports.
 */

import { RetryPolicy, type RetryConfig } from './retry';
import { CircuitBreaker, type CircuitBreakerConfig } from './circuit_breaker';
import { RateLimitManager } from './rate_limit';

export type { RetryConfig } from './retry';
export { RetryPolicy, DEFAULT_RETRY_CONFIG, createRetryPolicy } from './retry';

export type { CircuitBreakerConfig } from './circuit_breaker';
export {
  CircuitBreaker,
  CircuitState,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  createCircuitBreaker,
} from './circuit_breaker';

export type { RateLimitState } from './rate_limit';
export { RateLimitManager, createRateLimitManager } from './rate_limit';

export type { RateLimitInfo } from '../types/common';

/**
 * Combined resilience configuration.
 */
export interface ResilienceConfig {
  /** Retry configuration. */
  retry?: Partial<RetryConfig>;
  /** Circuit breaker configuration. */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Whether to enable rate limit tracking. */
  enableRateLimitTracking?: boolean;
}

/**
 * Default resilience configuration.
 */
export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  retry: {},
  circuitBreaker: {},
  enableRateLimitTracking: true,
};

/**
 * Resilience orchestrator that combines retry, circuit breaker, and rate limiting.
 */
export class ResilienceOrchestrator {
  private readonly retryPolicy: RetryPolicy;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimitManager: RateLimitManager;
  private readonly enableRateLimitTracking: boolean;

  constructor(config: ResilienceConfig = {}) {
    this.retryPolicy = new RetryPolicy(config.retry);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.rateLimitManager = new RateLimitManager();
    this.enableRateLimitTracking = config.enableRateLimitTracking ?? true;
  }

  /**
   * Executes a function with full resilience protection.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check rate limits first
    if (this.enableRateLimitTracking && !this.rateLimitManager.shouldAllowRequest()) {
      const waitTime = this.rateLimitManager.getTimeUntilReset();
      if (waitTime !== undefined && waitTime > 0) {
        await this.sleep(waitTime);
      }
    }

    // Execute with circuit breaker and retry
    return this.circuitBreaker.execute(() => this.retryPolicy.execute(fn));
  }

  /**
   * Updates rate limits from response headers.
   */
  updateRateLimits(headers: Record<string, string>): void {
    if (this.enableRateLimitTracking) {
      this.rateLimitManager.updateFromHeaders(headers);
    }
  }

  /**
   * Gets the rate limit manager.
   */
  getRateLimitManager(): RateLimitManager {
    return this.rateLimitManager;
  }

  /**
   * Gets the circuit breaker.
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Resets all resilience state.
   */
  reset(): void {
    this.circuitBreaker.reset();
    this.rateLimitManager.reset();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a resilience orchestrator.
 */
export function createResilienceOrchestrator(
  config: ResilienceConfig = {}
): ResilienceOrchestrator {
  return new ResilienceOrchestrator(config);
}
