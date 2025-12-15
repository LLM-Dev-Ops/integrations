/**
 * Microsoft Teams Resilience Module
 *
 * Provides retry, circuit breaker, and rate limiting functionality.
 */

import type { RetryConfig, CircuitBreakerConfig, RateLimitConfig } from '../config/index.js';
import {
  TeamsError,
  RateLimitedError,
  CircuitBreakerOpenError,
  TimeoutError,
  isRetryable,
} from '../errors.js';

// ============================================================================
// Circuit Breaker
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker for protecting against cascading failures.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  private endpoint: string;

  constructor(endpoint: string, config: CircuitBreakerConfig) {
    this.endpoint = endpoint;
    this.config = config;
  }

  getState(): CircuitState {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
      }
    }
    return this.state;
  }

  canExecute(): boolean {
    const state = this.getState();
    return state === 'closed' || state === 'half-open';
  }

  recordSuccess(): void {
    const state = this.getState();

    if (state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (state === 'closed') {
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.successCount = 0;
    } else if (this.state === 'closed') {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'open';
      }
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  getStats(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.getState(),
      failures: this.failureCount,
      successes: this.successCount,
    };
  }

  getEndpoint(): string {
    return this.endpoint;
  }
}

// ============================================================================
// Retry Executor
// ============================================================================

/**
 * Retry executor with exponential backoff and jitter.
 */
export class RetryExecutor {
  private config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        // Check if error is retryable
        if (!isRetryable(error)) {
          throw error;
        }

        // Check if we've exhausted retries
        if (attempt >= this.config.maxRetries) {
          throw lastError;
        }

        // Handle rate limiting specially - use the provided retry-after
        if (error instanceof RateLimitedError && error.retryAfterMs) {
          await this.sleep(error.retryAfterMs);
          continue;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Retry failed');
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay =
      this.config.initialBackoffMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxBackoffMs);
    const jitter = cappedDelay * this.config.jitterFactor * Math.random();
    return Math.floor(cappedDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Rate Limiter
// ============================================================================

interface QueuedRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  queuedAt: number;
}

/**
 * Token bucket rate limiter.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private queue: QueuedRequest[] = [];
  private processing = false;
  private config: RateLimitConfig;
  private name: string;

  constructor(name: string, tokensPerSecond: number, config: RateLimitConfig) {
    this.name = name;
    this.maxTokens = tokensPerSecond;
    this.tokens = tokensPerSecond;
    this.refillRate = tokensPerSecond / 1000;
    this.lastRefill = Date.now();
    this.config = config;
  }

  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Check queue size
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new RateLimitedError(this.calculateWaitTime());
    }

    // Queue the request
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        resolve,
        reject,
        queuedAt: Date.now(),
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private calculateWaitTime(): number {
    const tokensNeeded = 1 - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        this.refillTokens();

        if (this.tokens >= 1) {
          const request = this.queue.shift()!;
          const elapsed = Date.now() - request.queuedAt;

          if (elapsed > this.config.queueTimeout) {
            request.reject(new RateLimitedError(this.config.queueTimeout));
            continue;
          }

          this.tokens -= 1;
          request.resolve();
        } else {
          // Wait for more tokens
          const waitTime = Math.min(100, this.calculateWaitTime());
          await this.sleep(waitTime);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats(): { name: string; tokens: number; queueSize: number } {
    this.refillTokens();
    return {
      name: this.name,
      tokens: Math.floor(this.tokens * 100) / 100,
      queueSize: this.queue.length,
    };
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.queue.forEach((req) => req.reject(new Error('Rate limiter reset')));
    this.queue = [];
  }
}

// ============================================================================
// Resilient Executor
// ============================================================================

/**
 * Resilient executor combining retry, circuit breaker, and rate limiting.
 */
export class ResilientExecutor {
  private retryExecutor: RetryExecutor;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private circuitBreakerConfig: CircuitBreakerConfig;
  private rateLimitConfig: RateLimitConfig;

  constructor(
    retryConfig: RetryConfig,
    circuitBreakerConfig: CircuitBreakerConfig,
    rateLimitConfig: RateLimitConfig
  ) {
    this.retryExecutor = new RetryExecutor(retryConfig);
    this.circuitBreakerConfig = circuitBreakerConfig;
    this.rateLimitConfig = rateLimitConfig;
  }

  /**
   * Execute an operation with full resilience.
   */
  async execute<T>(
    endpoint: string,
    operation: () => Promise<T>,
    options?: {
      rateLimitName?: string;
      rateLimitPerSecond?: number;
      skipRateLimit?: boolean;
    }
  ): Promise<T> {
    // Get or create circuit breaker
    let circuitBreaker = this.circuitBreakers.get(endpoint);
    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker(endpoint, this.circuitBreakerConfig);
      this.circuitBreakers.set(endpoint, circuitBreaker);
    }

    // Check circuit breaker
    if (!circuitBreaker.canExecute()) {
      throw new CircuitBreakerOpenError(endpoint);
    }

    // Rate limiting
    if (!options?.skipRateLimit && options?.rateLimitName) {
      let rateLimiter = this.rateLimiters.get(options.rateLimitName);
      if (!rateLimiter) {
        rateLimiter = new RateLimiter(
          options.rateLimitName,
          options.rateLimitPerSecond ?? 1,
          this.rateLimitConfig
        );
        this.rateLimiters.set(options.rateLimitName, rateLimiter);
      }
      await rateLimiter.acquire();
    }

    // Execute with retry
    try {
      const result = await this.retryExecutor.execute(operation);
      circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      circuitBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * Get circuit breaker for an endpoint.
   */
  getCircuitBreaker(endpoint: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(endpoint);
  }

  /**
   * Get rate limiter by name.
   */
  getRateLimiter(name: string): RateLimiter | undefined {
    return this.rateLimiters.get(name);
  }

  /**
   * Reset all circuit breakers and rate limiters.
   */
  reset(): void {
    this.circuitBreakers.forEach((cb) => cb.reset());
    this.rateLimiters.forEach((rl) => rl.reset());
  }

  /**
   * Get statistics.
   */
  getStats(): {
    circuitBreakers: Array<{ endpoint: string; state: CircuitState; failures: number }>;
    rateLimiters: Array<{ name: string; tokens: number; queueSize: number }>;
  } {
    return {
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([endpoint, cb]) => ({
        endpoint,
        ...cb.getStats(),
      })),
      rateLimiters: Array.from(this.rateLimiters.values()).map((rl) => rl.getStats()),
    };
  }
}

// ============================================================================
// Timeout Helper
// ============================================================================

/**
 * Wraps a promise with a timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation?: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createCircuitBreaker(endpoint: string, config: CircuitBreakerConfig): CircuitBreaker {
  return new CircuitBreaker(endpoint, config);
}

export function createRetryExecutor(config: RetryConfig): RetryExecutor {
  return new RetryExecutor(config);
}

export function createRateLimiter(
  name: string,
  tokensPerSecond: number,
  config: RateLimitConfig
): RateLimiter {
  return new RateLimiter(name, tokensPerSecond, config);
}

export function createResilientExecutor(
  retryConfig: RetryConfig,
  circuitBreakerConfig: CircuitBreakerConfig,
  rateLimitConfig: RateLimitConfig
): ResilientExecutor {
  return new ResilientExecutor(retryConfig, circuitBreakerConfig, rateLimitConfig);
}
