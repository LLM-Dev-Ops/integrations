/**
 * Resilience module for Google Drive integration.
 *
 * Provides retry logic, circuit breaker, and rate limiting.
 */

import type { RetryConfig, CircuitBreakerConfig, RateLimitConfig } from "../config";
import { GoogleDriveError } from "../errors";

export enum CircuitBreakerState {
  Closed = "CLOSED",
  Open = "OPEN",
  HalfOpen = "HALF_OPEN",
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return fn();
    }

    if (this.state === CircuitBreakerState.Open) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error("Circuit breaker is OPEN");
      }
      this.state = CircuitBreakerState.HalfOpen;
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HalfOpen) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitBreakerState.Closed;
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.Open;
      this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
      this.failureCount = 0;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitBreakerState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }
}

export class RetryExecutor {
  constructor(private config: RetryConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt < this.config.maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt >= this.config.maxAttempts) {
          break;
        }

        if (error instanceof GoogleDriveError) {
          if (!error.isRetryable()) {
            throw error;
          }

          const delay = this.calculateDelay(attempt, error.getRetryAfter());
          await this.sleep(delay);
        } else {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private calculateDelay(attempt: number, retryAfter?: number): number {
    if (this.config.respectRetryAfter && retryAfter) {
      return retryAfter;
    }

    const exponentialDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelayMs
    );

    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
    return Math.floor(exponentialDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class RateLimitTracker {
  private requestCount = 0;
  private windowStart = Date.now();
  private concurrentRequests = 0;

  constructor(private config: RateLimitConfig) {}

  async acquire(): Promise<void> {
    if (this.config.maxConcurrentRequests) {
      while (this.concurrentRequests >= this.config.maxConcurrentRequests) {
        await this.sleep(100);
      }
    }

    const now = Date.now();
    const windowDuration = 100000; // 100 seconds in ms

    if (now - this.windowStart >= windowDuration) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.config.userQueriesPer100Seconds) {
      if (this.config.preemptiveThrottling) {
        const waitTime = windowDuration - (now - this.windowStart);
        await this.sleep(waitTime);
        this.requestCount = 0;
        this.windowStart = Date.now();
      }
    }

    this.requestCount++;
    this.concurrentRequests++;
  }

  release(): void {
    this.concurrentRequests = Math.max(0, this.concurrentRequests - 1);
  }

  getStats(): {
    requestCount: number;
    concurrentRequests: number;
    windowRemaining: number;
  } {
    const now = Date.now();
    const windowDuration = 100000;
    const windowRemaining = Math.max(0, windowDuration - (now - this.windowStart));

    return {
      requestCount: this.requestCount,
      concurrentRequests: this.concurrentRequests,
      windowRemaining,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class ResilienceOrchestrator {
  private retryExecutor: RetryExecutor;
  private circuitBreaker: CircuitBreaker;
  private rateLimitTracker?: RateLimitTracker;

  constructor(
    retryConfig: RetryConfig,
    circuitBreakerConfig: CircuitBreakerConfig,
    rateLimitConfig?: RateLimitConfig
  ) {
    this.retryExecutor = new RetryExecutor(retryConfig);
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    this.rateLimitTracker = rateLimitConfig
      ? new RateLimitTracker(rateLimitConfig)
      : undefined;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.rateLimitTracker) {
      await this.rateLimitTracker.acquire();
    }

    try {
      return await this.retryExecutor.execute(() =>
        this.circuitBreaker.execute(fn)
      );
    } finally {
      if (this.rateLimitTracker) {
        this.rateLimitTracker.release();
      }
    }
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  getRateLimitStats():
    | {
        requestCount: number;
        concurrentRequests: number;
        windowRemaining: number;
      }
    | undefined {
    return this.rateLimitTracker?.getStats();
  }

  reset(): void {
    this.circuitBreaker.reset();
  }
}

export function createResilience(
  retryConfig: RetryConfig,
  circuitBreakerConfig: CircuitBreakerConfig,
  rateLimitConfig?: RateLimitConfig
): ResilienceOrchestrator {
  return new ResilienceOrchestrator(
    retryConfig,
    circuitBreakerConfig,
    rateLimitConfig
  );
}
