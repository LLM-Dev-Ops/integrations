/**
 * Resilience utilities for Slack API.
 */

export * from './retry';
export * from './circuit-breaker';
export * from './rate-limiter';

import { RetryConfig, DEFAULT_RETRY_CONFIG, retry } from './retry';
import { CircuitBreaker, CircuitBreakerConfig, DEFAULT_CIRCUIT_BREAKER_CONFIG, CircuitOpenError } from './circuit-breaker';
import { RateLimiter, RateLimitTier } from './rate-limiter';

/**
 * Resilience orchestrator configuration
 */
export interface ResilienceConfig {
  retry: Partial<RetryConfig>;
  circuitBreaker: Partial<CircuitBreakerConfig>;
  rateLimiter: {
    enabled: boolean;
    defaultTier: RateLimitTier;
  };
}

/**
 * Default resilience configuration
 */
export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  retry: DEFAULT_RETRY_CONFIG,
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
  rateLimiter: {
    enabled: true,
    defaultTier: 'tier3',
  },
};

/**
 * Resilience orchestrator
 */
export class ResilienceOrchestrator {
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private retryConfig: RetryConfig;
  private enabled: boolean;

  constructor(config: Partial<ResilienceConfig> = {}) {
    const fullConfig = {
      ...DEFAULT_RESILIENCE_CONFIG,
      ...config,
      retry: { ...DEFAULT_RESILIENCE_CONFIG.retry, ...config.retry },
      circuitBreaker: { ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker, ...config.circuitBreaker },
      rateLimiter: { ...DEFAULT_RESILIENCE_CONFIG.rateLimiter, ...config.rateLimiter },
    };

    this.retryConfig = fullConfig.retry as RetryConfig;
    this.circuitBreaker = new CircuitBreaker(fullConfig.circuitBreaker);
    this.rateLimiter = new RateLimiter(fullConfig.rateLimiter.defaultTier);
    this.enabled = true;
  }

  /**
   * Execute with resilience
   */
  async execute<T>(
    endpoint: string,
    fn: () => Promise<T>,
    options?: { tier?: RateLimitTier; skipRateLimit?: boolean }
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    // Check circuit breaker
    if (!this.circuitBreaker.isAllowed()) {
      throw new CircuitOpenError(`Circuit breaker open for Slack API`);
    }

    // Wait for rate limit slot
    if (!options?.skipRateLimit) {
      await this.rateLimiter.waitForSlot(endpoint, options?.tier);
    }

    // Execute with retry
    const result = await retry(
      async () => {
        return this.circuitBreaker.execute(fn);
      },
      this.retryConfig
    );

    if (!result.success) {
      throw result.error ?? new Error('Request failed');
    }

    return result.result as T;
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState() {
    return this.circuitBreaker.getState();
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      circuitBreaker: this.circuitBreaker.getMetrics(),
    };
  }

  /**
   * Reset all resilience state
   */
  reset(): void {
    this.circuitBreaker.reset();
    this.rateLimiter.reset();
  }

  /**
   * Enable/disable resilience
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

/**
 * Create resilience orchestrator
 */
export function createResilience(config: Partial<ResilienceConfig> = {}): ResilienceOrchestrator {
  return new ResilienceOrchestrator(config);
}
