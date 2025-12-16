/**
 * Rate limiting with preemptive throttling for GitHub Container Registry.
 * @module rate-limit
 */

import { GhcrError, GhcrErrorKind } from './errors.js';
import { RateLimitInfo, RateLimitUtils, RateLimitStatus } from './types/rate-limit.js';
import type { RateLimitConfig } from './config.js';

/**
 * Rate limiter with preemptive throttling.
 */
export class RateLimiter {
  private info: RateLimitInfo;
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.info = RateLimitUtils.defaultInfo();
  }

  /**
   * Updates rate limit info from response headers.
   */
  update(headers: Headers): void {
    const info = RateLimitUtils.fromHeaders(headers);
    if (info) {
      this.info = info;
    }
  }

  /**
   * Updates rate limit info directly.
   */
  updateInfo(info: RateLimitInfo): void {
    this.info = info;
  }

  /**
   * Gets the current rate limit info.
   */
  getInfo(): RateLimitInfo {
    return this.info;
  }

  /**
   * Gets the current rate limit status.
   */
  getStatus(): RateLimitStatus {
    return RateLimitUtils.getStatus(
      this.info,
      this.config.throttleThreshold * 100
    );
  }

  /**
   * Checks rate limits and waits if necessary.
   * Returns the time waited in milliseconds.
   */
  async checkAndWait(): Promise<number> {
    const status = this.getStatus();

    // If exceeded, wait or throw
    if (status.isExceeded) {
      if (this.config.autoWait) {
        const waitMs = Math.min(
          status.secondsUntilReset * 1000,
          this.config.maxWaitMs
        );

        if (waitMs > 0) {
          await this.sleep(waitMs);
          return waitMs;
        }
      }

      throw GhcrError.rateLimited(
        'Rate limit exceeded',
        this.info,
        status.secondsUntilReset
      );
    }

    // If approaching limit and preemptive is enabled, add delay
    if (this.config.preemptive && status.isApproaching) {
      const delay = RateLimitUtils.calculateDelay(this.info);
      if (delay > 0) {
        await this.sleep(delay);
        return delay;
      }
    }

    return 0;
  }

  /**
   * Formats the current rate limit for logging.
   */
  format(): string {
    return RateLimitUtils.format(this.info);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Retry executor with exponential backoff.
 */
export class RetryExecutor {
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly multiplier: number;
  private readonly jitter: boolean;

  constructor(config: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
    jitter: boolean;
  }) {
    this.maxRetries = config.maxRetries;
    this.initialDelayMs = config.initialDelayMs;
    this.maxDelayMs = config.maxDelayMs;
    this.multiplier = config.multiplier;
    this.jitter = config.jitter;
  }

  /**
   * Executes a function with retry logic.
   */
  async execute<T>(
    fn: () => Promise<T>,
    shouldRetry?: (error: GhcrError) => boolean
  ): Promise<T> {
    let lastError: GhcrError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (!(error instanceof GhcrError)) {
          throw error;
        }

        lastError = error;

        // Check if we should retry
        const retry = shouldRetry
          ? shouldRetry(error)
          : error.isRetryable();

        if (!retry || attempt >= this.maxRetries) {
          throw error;
        }

        // Calculate delay
        const delay = this.calculateDelay(attempt, error);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new GhcrError(
      GhcrErrorKind.Internal,
      'Retry executor failed unexpectedly'
    );
  }

  /**
   * Calculates delay for a retry attempt.
   */
  private calculateDelay(attempt: number, error: GhcrError): number {
    // Use Retry-After if available
    const retryDelay = error.getRetryDelay();
    if (retryDelay !== undefined) {
      return retryDelay;
    }

    // Exponential backoff
    const baseDelay = this.initialDelayMs * Math.pow(this.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, this.maxDelayMs);

    // Add jitter if enabled
    if (this.jitter) {
      const jitterRange = cappedDelay * 0.5;
      const jitterValue = (Math.random() - 0.5) * jitterRange;
      return Math.round(cappedDelay + jitterValue);
    }

    return Math.round(cappedDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit breaker state.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker for preventing cascading failures.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(config: {
    threshold: number;
    resetTimeoutMs: number;
    successThreshold?: number;
  }) {
    this.threshold = config.threshold;
    this.resetTimeoutMs = config.resetTimeoutMs;
    this.successThreshold = config.successThreshold ?? 3;
  }

  /**
   * Checks if execution is allowed.
   */
  canExecute(): boolean {
    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if timeout has passed
        if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
          this.state = 'half-open';
          this.successCount = 0;
          return true;
        }
        return false;

      case 'half-open':
        return true;
    }
  }

  /**
   * Records a successful execution.
   */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === 'closed') {
      this.failureCount = 0;
    }
  }

  /**
   * Records a failed execution.
   */
  recordFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.successCount = 0;
    } else if (this.state === 'closed') {
      this.failureCount++;
      if (this.failureCount >= this.threshold) {
        this.state = 'open';
      }
    }
  }

  /**
   * Gets the current state.
   */
  getState(): CircuitState {
    // Update state if timeout has passed
    if (
      this.state === 'open' &&
      Date.now() - this.lastFailureTime >= this.resetTimeoutMs
    ) {
      this.state = 'half-open';
      this.successCount = 0;
    }

    return this.state;
  }

  /**
   * Resets the circuit breaker.
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Gets circuit breaker statistics.
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Resilience orchestrator combining retry, circuit breaker, and rate limiting.
 */
export class ResilienceOrchestrator {
  private readonly retryExecutor: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiter;

  constructor(config: {
    maxRetries: number;
    retry: {
      initialDelayMs: number;
      maxDelayMs: number;
      multiplier: number;
      jitter: boolean;
    };
    rateLimit: RateLimitConfig;
    circuitBreaker?: {
      threshold: number;
      resetTimeoutMs: number;
    };
  }) {
    this.retryExecutor = new RetryExecutor({
      maxRetries: config.maxRetries,
      ...config.retry,
    });

    this.circuitBreaker = new CircuitBreaker({
      threshold: config.circuitBreaker?.threshold ?? 5,
      resetTimeoutMs: config.circuitBreaker?.resetTimeoutMs ?? 60000,
    });

    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  /**
   * Executes a function with all resilience patterns applied.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      throw new GhcrError(
        GhcrErrorKind.ThrottleTimeout,
        `Circuit breaker is ${this.circuitBreaker.getState()} - request blocked`
      );
    }

    // Check rate limits
    await this.rateLimiter.checkAndWait();

    // Execute with retry
    try {
      const result = await this.retryExecutor.execute(fn);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * Updates rate limit info from response headers.
   */
  updateRateLimitInfo(headers: Headers): void {
    this.rateLimiter.update(headers);
  }

  /**
   * Gets the rate limiter.
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Gets the circuit breaker.
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }
}
