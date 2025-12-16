/**
 * Resilience components for Jira client following SPARC specification.
 *
 * Includes rate limiting, retry logic, and circuit breaker implementations.
 */

import {
  RateLimitConfig,
  RetryConfig,
  CircuitBreakerConfig,
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from '../config/index.js';
import {
  JiraError,
  RateLimitedError,
  RateLimitTimeoutError,
  CircuitBreakerOpenError,
  isRetryableError,
  getRetryDelayMs,
} from '../errors/index.js';

// ============================================================================
// Rate Limiter
// ============================================================================

/**
 * Token bucket rate limiter with adaptive rate limiting support.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private consecutiveRateLimits: number = 0;
  private currentRate: number;
  private readonly config: RateLimitConfig;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {
    this.config = config;
    this.maxTokens = config.requestsPerSecond;
    this.currentRate = config.requestsPerSecond;
    this.refillRate = config.requestsPerSecond;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Acquires a token, waiting if necessary.
   * @throws RateLimitTimeoutError if wait time exceeds queue timeout
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // No tokens available, queue the request
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new RateLimitTimeoutError(0, this.config.queueTimeout);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.queue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new RateLimitTimeoutError(this.config.queueTimeout, this.config.queueTimeout));
      }, this.config.queueTimeout);

      this.queue.push({ resolve, reject, timeout });

      // Schedule token refill check
      this.scheduleTokenRefill();
    });
  }

  /**
   * Refills tokens based on elapsed time.
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.currentRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Schedules a token refill check for queued requests.
   */
  private scheduleTokenRefill(): void {
    const timeToNextToken = (1 / this.currentRate) * 1000;

    setTimeout(() => {
      this.refillTokens();

      while (this.tokens >= 1 && this.queue.length > 0) {
        this.tokens -= 1;
        const item = this.queue.shift()!;
        clearTimeout(item.timeout);
        item.resolve();
      }

      if (this.queue.length > 0) {
        this.scheduleTokenRefill();
      }
    }, timeToNextToken);
  }

  /**
   * Handles a rate limit response from the API.
   * Adapts the rate limit if adaptive rate limiting is enabled.
   * @param retryAfterMs - The retry-after duration in milliseconds
   */
  handleRateLimitResponse(retryAfterMs: number): void {
    this.consecutiveRateLimits += 1;

    if (this.config.adaptiveRateLimit) {
      // Exponentially reduce rate on repeated 429s
      const reductionFactor = Math.pow(0.5, this.consecutiveRateLimits);
      this.currentRate = Math.max(1, this.refillRate * reductionFactor);
    }
  }

  /**
   * Records a successful request, gradually recovering rate.
   */
  handleSuccess(): void {
    if (this.consecutiveRateLimits > 0 && this.config.adaptiveRateLimit) {
      this.consecutiveRateLimits = Math.max(0, this.consecutiveRateLimits - 1);
      // Gradually recover rate (10% increase per success)
      this.currentRate = Math.min(this.refillRate, this.currentRate * 1.1);
    }
  }

  /**
   * Gets current rate limiter statistics.
   */
  getStats(): {
    currentTokens: number;
    currentRate: number;
    maxRate: number;
    queueSize: number;
    consecutiveRateLimits: number;
  } {
    this.refillTokens();
    return {
      currentTokens: this.tokens,
      currentRate: this.currentRate,
      maxRate: this.refillRate,
      queueSize: this.queue.length,
      consecutiveRateLimits: this.consecutiveRateLimits,
    };
  }

  /**
   * Resets the rate limiter to initial state.
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.consecutiveRateLimits = 0;
    this.currentRate = this.refillRate;

    // Clear queue
    for (const item of this.queue) {
      clearTimeout(item.timeout);
      item.reject(new Error('Rate limiter reset'));
    }
    this.queue = [];
  }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker states.
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker for preventing cascading failures.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    this.config = config;
  }

  /**
   * Checks if the circuit breaker allows a request.
   * @throws CircuitBreakerOpenError if the circuit is open
   */
  async allowRequest(): Promise<boolean> {
    if (!this.config.enabled) {
      return true;
    }

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN': {
        const now = Date.now();
        const timeSinceFailure = now - this.lastFailureTime;

        if (timeSinceFailure >= this.config.resetTimeoutMs) {
          // Transition to half-open
          this.state = 'HALF_OPEN';
          this.successes = 0;
          return true;
        }

        throw new CircuitBreakerOpenError(
          this.config.resetTimeoutMs - timeSinceFailure
        );
      }

      case 'HALF_OPEN':
        // Allow single request in half-open state
        return true;
    }
  }

  /**
   * Records a successful request.
   */
  recordSuccess(): void {
    if (!this.config.enabled) {
      return;
    }

    this.successes += 1;

    switch (this.state) {
      case 'CLOSED':
        // Decay failure count on success
        this.failures = Math.max(0, this.failures - 1);
        break;

      case 'HALF_OPEN':
        if (this.successes >= this.config.successThreshold) {
          // Transition to closed
          this.state = 'CLOSED';
          this.failures = 0;
        }
        break;

      case 'OPEN':
        // Shouldn't happen, but handle gracefully
        break;
    }
  }

  /**
   * Records a failed request.
   */
  recordFailure(): void {
    if (!this.config.enabled) {
      return;
    }

    this.failures += 1;
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case 'CLOSED':
        if (this.failures >= this.config.failureThreshold) {
          // Transition to open
          this.state = 'OPEN';
        }
        break;

      case 'HALF_OPEN':
        // Single failure in half-open returns to open
        this.state = 'OPEN';
        this.successes = 0;
        break;

      case 'OPEN':
        // Already open, update failure time
        break;
    }
  }

  /**
   * Gets the current state.
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Gets circuit breaker statistics.
   */
  getStats(): {
    state: CircuitBreakerState;
    failures: number;
    successes: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Manually resets the circuit breaker.
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }
}

// ============================================================================
// Retry Executor
// ============================================================================

/**
 * Retry hooks for monitoring and logging.
 */
export interface RetryHooks {
  /** Called before a retry attempt */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** Called when all retries are exhausted */
  onRetriesExhausted?: (error: Error, attempts: number) => void;
  /** Called on successful completion */
  onSuccess?: (attempts: number) => void;
}

/**
 * Retry executor with exponential backoff.
 */
export class RetryExecutor {
  private readonly config: RetryConfig;
  private readonly hooks: RetryHooks;

  constructor(config: RetryConfig = DEFAULT_RETRY_CONFIG, hooks: RetryHooks = {}) {
    this.config = config;
    this.hooks = hooks;
  }

  /**
   * Executes an operation with retry logic.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        const result = await operation();
        this.hooks.onSuccess?.(attempt + 1);
        return result;
      } catch (error) {
        lastError = error as Error;
        attempt += 1;

        // Check if we should retry
        if (!isRetryableError(error)) {
          throw error;
        }

        // Check if we've exhausted retries
        const maxRetries = error instanceof RateLimitedError
          ? this.config.maxRateLimitRetries
          : this.config.maxRetries;

        if (attempt > maxRetries) {
          this.hooks.onRetriesExhausted?.(lastError, attempt);
          throw lastError;
        }

        // Calculate delay
        const delayMs = this.calculateDelay(attempt, error);
        this.hooks.onRetry?.(attempt, lastError, delayMs);

        // Wait before retrying
        await this.sleep(delayMs);
      }
    }

    throw lastError!;
  }

  /**
   * Calculates the delay for a retry attempt.
   */
  private calculateDelay(attempt: number, error: unknown): number {
    // Use retry-after from error if available
    const retryAfterMs = getRetryDelayMs(error);
    if (retryAfterMs !== undefined) {
      return retryAfterMs;
    }

    // Calculate exponential backoff
    const exponentialDelay =
      this.config.initialBackoffMs * Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Apply jitter
    const jitter = 1 + (Math.random() - 0.5) * 2 * this.config.jitterFactor;
    const delayWithJitter = exponentialDelay * jitter;

    // Cap at max delay
    return Math.min(delayWithJitter, this.config.maxBackoffMs);
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Creates a retry executor with the given configuration.
 */
export function createRetryExecutor(
  config?: Partial<RetryConfig>,
  hooks?: RetryHooks
): RetryExecutor {
  return new RetryExecutor(
    { ...DEFAULT_RETRY_CONFIG, ...config },
    hooks
  );
}

// ============================================================================
// Resilience Orchestrator
// ============================================================================

/**
 * Options for resilient execution.
 */
export interface ResilientExecuteOptions {
  /** Skip rate limiting */
  skipRateLimit?: boolean;
  /** Skip circuit breaker */
  skipCircuitBreaker?: boolean;
  /** Skip retry logic */
  skipRetry?: boolean;
}

/**
 * Orchestrates rate limiting, circuit breaking, and retry logic.
 */
export class ResilienceOrchestrator {
  private readonly rateLimiter: RateLimiter;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryExecutor: RetryExecutor;

  constructor(
    rateLimitConfig?: RateLimitConfig,
    circuitBreakerConfig?: CircuitBreakerConfig,
    retryConfig?: RetryConfig,
    retryHooks?: RetryHooks
  ) {
    this.rateLimiter = new RateLimiter(rateLimitConfig);
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    this.retryExecutor = new RetryExecutor(retryConfig, retryHooks);
  }

  /**
   * Executes an operation with all resilience mechanisms.
   */
  async execute<T>(
    operation: () => Promise<T>,
    options: ResilientExecuteOptions = {}
  ): Promise<T> {
    // Check circuit breaker first
    if (!options.skipCircuitBreaker) {
      await this.circuitBreaker.allowRequest();
    }

    // Acquire rate limit token
    if (!options.skipRateLimit) {
      await this.rateLimiter.acquire();
    }

    // Execute with retry logic
    const wrappedOperation = async (): Promise<T> => {
      try {
        const result = await operation();

        // Record success
        if (!options.skipCircuitBreaker) {
          this.circuitBreaker.recordSuccess();
        }
        if (!options.skipRateLimit) {
          this.rateLimiter.handleSuccess();
        }

        return result;
      } catch (error) {
        // Record failure
        if (!options.skipCircuitBreaker) {
          this.circuitBreaker.recordFailure();
        }
        if (error instanceof RateLimitedError && !options.skipRateLimit) {
          this.rateLimiter.handleRateLimitResponse(error.retryAfterMs!);
        }

        throw error;
      }
    };

    if (options.skipRetry) {
      return wrappedOperation();
    }

    return this.retryExecutor.execute(wrappedOperation);
  }

  /**
   * Gets the rate limiter instance.
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Gets the circuit breaker instance.
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Gets combined statistics from all resilience components.
   */
  getStats(): {
    rateLimiter: ReturnType<RateLimiter['getStats']>;
    circuitBreaker: ReturnType<CircuitBreaker['getStats']>;
  } {
    return {
      rateLimiter: this.rateLimiter.getStats(),
      circuitBreaker: this.circuitBreaker.getStats(),
    };
  }

  /**
   * Resets all resilience components.
   */
  reset(): void {
    this.rateLimiter.reset();
    this.circuitBreaker.reset();
  }
}
