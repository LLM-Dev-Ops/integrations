/**
 * Resilience Patterns for GitHub API Client
 *
 * Implements three key resilience patterns:
 * 1. Retry with exponential backoff - Handles transient failures
 * 2. Circuit Breaker - Prevents cascading failures
 * 3. Rate Limit Tracking - Respects GitHub API rate limits
 *
 * These patterns work together through the ResilienceOrchestrator to provide
 * robust and reliable API interactions.
 *
 * @module resilience
 */

import { RateLimitError, ServerError, GitHubError } from './errors.js';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number;
  /** Backoff multiplier (e.g., 2 for exponential backoff) */
  multiplier: number;
  /** Whether to add random jitter to delays */
  jitter: boolean;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Whether circuit breaker is enabled */
  enabled: boolean;
  /** Number of failures before opening the circuit */
  threshold: number;
  /** Time in milliseconds before attempting to close the circuit */
  resetTimeoutMs: number;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Whether to enable preemptive rate limit handling */
  preemptive: boolean;
  /** Percentage of limit at which to start throttling (0-100) */
  throttleThreshold: number;
  /** Whether to automatically wait when rate limit is exceeded */
  autoWait: boolean;
}

/**
 * Rate limit information for a specific resource
 */
export interface RateLimitInfo {
  /** Maximum requests allowed in the time window */
  limit: number;
  /** Remaining requests in the time window */
  remaining: number;
  /** Unix timestamp when the rate limit resets */
  reset: number;
  /** Number of requests used in the time window */
  used: number;
  /** Rate limit resource type (core, search, graphql, etc.) */
  resource: string;
}

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Retry executor with exponential backoff
 */
export class RetryExecutor {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      initialDelayMs: config.initialDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 60000,
      multiplier: config.multiplier ?? 2,
      jitter: config.jitter ?? true,
    };
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(fn: () => Promise<T>, shouldRetry?: (error: Error) => boolean): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry this error
        const retry = shouldRetry ? shouldRetry(lastError) : this.isRetryableError(lastError);

        if (!retry || attempt >= this.config.maxRetries) {
          throw lastError;
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt, lastError);
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error('Retry executor failed');
  }

  /**
   * Calculate delay for a retry attempt with exponential backoff
   */
  private calculateDelay(attempt: number, error: Error): number {
    // If error has a retry-after suggestion, use it
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000;
    }

    // Exponential backoff: initialDelay * multiplier^attempt
    const baseDelay = this.config.initialDelayMs * Math.pow(this.config.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);

    // Add jitter if enabled
    if (this.config.jitter) {
      const jitter = cappedDelay * 0.5 * (Math.random() - 0.5);
      return Math.round(cappedDelay + jitter);
    }

    return Math.round(cappedDelay);
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    // Retry on rate limit errors
    if (error instanceof RateLimitError) {
      return true;
    }

    // Retry on server errors (5xx)
    if (error instanceof ServerError) {
      return true;
    }

    // Retry on network/timeout errors
    if (error instanceof GitHubError) {
      const status = (error as any).statusCode;
      return status >= 500 || status === 408 || status === 429;
    }

    // Retry on common network errors
    if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
      return true;
    }

    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the retry configuration
   */
  getConfig(): Readonly<RetryConfig> {
    return { ...this.config };
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      threshold: config.threshold ?? 5,
      resetTimeoutMs: config.resetTimeoutMs ?? 60000,
    };
  }

  /**
   * Check if execution is allowed
   */
  canExecute(): boolean {
    if (!this.config.enabled) {
      return true;
    }

    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if enough time has passed to attempt half-open
        if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
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
   * Record a successful execution
   */
  recordSuccess(): void {
    if (!this.config.enabled) {
      return;
    }

    if (this.state === 'half-open') {
      this.successCount++;
      // After 3 consecutive successes in half-open, close the circuit
      if (this.successCount >= 3) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === 'closed') {
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(): void {
    if (!this.config.enabled) {
      return;
    }

    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Any failure in half-open state reopens the circuit
      this.state = 'open';
      this.successCount = 0;
    } else if (this.state === 'closed') {
      this.failureCount++;
      if (this.failureCount >= this.config.threshold) {
        this.state = 'open';
      }
    }
  }

  /**
   * Get the current circuit state
   */
  getState(): CircuitState {
    // Update state if we've been open long enough
    if (
      this.state === 'open' &&
      Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs
    ) {
      this.state = 'half-open';
      this.successCount = 0;
    }

    return this.state;
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Get circuit breaker statistics
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
 * Rate limit tracker for GitHub API
 */
export class RateLimitTracker {
  private readonly limits: Map<string, RateLimitInfo> = new Map();
  private readonly config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      preemptive: config.preemptive ?? true,
      throttleThreshold: config.throttleThreshold ?? 10,
      autoWait: config.autoWait ?? true,
    };
  }

  /**
   * Update rate limit information for a resource
   */
  update(info: RateLimitInfo): void {
    this.limits.set(info.resource, info);
  }

  /**
   * Get rate limit information for a resource
   */
  get(resource: string = 'core'): RateLimitInfo | null {
    return this.limits.get(resource) || null;
  }

  /**
   * Check if a request should be allowed based on rate limits
   */
  async checkRateLimit(resource: string = 'core'): Promise<void> {
    const info = this.limits.get(resource);

    if (!info) {
      // No rate limit info yet, allow the request
      return;
    }

    // Check if rate limit is exhausted
    if (info.remaining === 0) {
      const now = Date.now() / 1000; // Convert to seconds
      const resetTime = info.reset;
      const waitTime = Math.max(0, resetTime - now);

      if (this.config.autoWait && waitTime > 0) {
        // Wait until rate limit resets
        await this.sleep(waitTime * 1000);
        return;
      }

      // Don't auto-wait, throw error
      throw new RateLimitError(
        `Rate limit exceeded for ${resource}`,
        info.limit,
        info.remaining,
        info.reset
      );
    }

    // Check if we're approaching the limit (preemptive throttling)
    if (this.config.preemptive) {
      const usagePercent = (info.used / info.limit) * 100;

      if (usagePercent >= (100 - this.config.throttleThreshold)) {
        // Add a small delay to throttle requests
        const delay = this.calculateThrottleDelay(info);
        if (delay > 0) {
          await this.sleep(delay);
        }
      }
    }
  }

  /**
   * Calculate throttle delay based on current rate limit state
   */
  private calculateThrottleDelay(info: RateLimitInfo): number {
    const now = Date.now() / 1000;
    const timeUntilReset = Math.max(0, info.reset - now);
    const requestsRemaining = info.remaining;

    if (requestsRemaining === 0 || timeUntilReset === 0) {
      return 0;
    }

    // Distribute remaining requests evenly over remaining time
    const optimalDelay = (timeUntilReset * 1000) / requestsRemaining;

    // Cap the delay at a reasonable maximum (e.g., 5 seconds)
    return Math.min(optimalDelay, 5000);
  }

  /**
   * Get all tracked rate limit information
   */
  getAll(): Map<string, RateLimitInfo> {
    return new Map(this.limits);
  }

  /**
   * Clear all rate limit information
   */
  clear(): void {
    this.limits.clear();
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Resilience orchestrator combining retry, circuit breaker, and rate limiting
 */
export class ResilienceOrchestrator {
  private readonly retryExecutor: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimitTracker: RateLimitTracker;

  constructor(config: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
    jitter?: boolean;
    circuitBreaker?: Partial<CircuitBreakerConfig>;
    rateLimitConfig?: Partial<RateLimitConfig>;
  } = {}) {
    this.retryExecutor = new RetryExecutor({
      maxRetries: config.maxRetries,
      initialDelayMs: config.initialDelayMs,
      maxDelayMs: config.maxDelayMs,
      multiplier: config.multiplier,
      jitter: config.jitter,
    });

    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.rateLimitTracker = new RateLimitTracker(config.rateLimitConfig);
  }

  /**
   * Execute a function with all resilience patterns applied
   */
  async execute<T>(fn: () => Promise<T>, resource: string = 'core'): Promise<T> {
    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      throw new Error(
        `Circuit breaker is ${this.circuitBreaker.getState()} - request blocked`
      );
    }

    // Check rate limits
    await this.rateLimitTracker.checkRateLimit(resource);

    // Execute with retry logic
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
   * Update rate limit information
   */
  updateRateLimitInfo(info: RateLimitInfo): void {
    this.rateLimitTracker.update(info);
  }

  /**
   * Get rate limit information for a resource
   */
  getRateLimitInfo(resource: string = 'core'): RateLimitInfo | null {
    return this.rateLimitTracker.get(resource);
  }

  /**
   * Get all rate limit information
   */
  getAllRateLimits(): Map<string, RateLimitInfo> {
    return this.rateLimitTracker.getAll();
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset the circuit breaker
   */
  resetCircuit(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Get retry configuration
   */
  getRetryConfig(): Readonly<RetryConfig> {
    return this.retryExecutor.getConfig();
  }
}

/**
 * Create a resilience orchestrator with default configuration
 */
export function createResilienceOrchestrator(
  config: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
    jitter?: boolean;
    circuitBreaker?: Partial<CircuitBreakerConfig>;
    rateLimitConfig?: Partial<RateLimitConfig>;
  } = {}
): ResilienceOrchestrator {
  return new ResilienceOrchestrator(config);
}

/**
 * Default retry configuration for GitHub API
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitter: true,
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  threshold: 5,
  resetTimeoutMs: 60000,
};

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  preemptive: true,
  throttleThreshold: 10,
  autoWait: true,
};
