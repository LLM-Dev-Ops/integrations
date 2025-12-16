/**
 * Resilience Patterns for Buildkite API Client
 * @module resilience
 */

import { BuildkiteError, BuildkiteErrorKind, type RateLimitInfo } from './errors.js';
import type { RetryConfig, CircuitBreakerConfig } from './config.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

// Re-export types from their canonical sources for convenience
export type { RetryConfig, CircuitBreakerConfig } from './config.js';
export type { RateLimitInfo } from './errors.js';

export class RetryExecutor {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      initialDelayMs: config.initialDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 60000,
      multiplier: config.multiplier ?? 2,
      jitter: config.jitter ?? true,
    };
  }

  async execute<T>(fn: () => Promise<T>, shouldRetry?: (error: Error) => boolean): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const retry = shouldRetry ? shouldRetry(lastError) : this.isRetryableError(lastError);
        if (!retry || attempt >= this.config.maxAttempts) throw lastError;
        const delay = this.calculateDelay(attempt, lastError);
        await this.sleep(delay);
      }
    }
    throw lastError || new Error('Retry executor failed');
  }

  private calculateDelay(attempt: number, error: Error): number {
    if (error instanceof BuildkiteError && error.rateLimitInfo?.retryAfter) {
      return error.rateLimitInfo.retryAfter * 1000;
    }
    const baseDelay = this.config.initialDelayMs * Math.pow(this.config.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);
    if (this.config.jitter) {
      const jitter = cappedDelay * 0.5 * (Math.random() - 0.5);
      return Math.round(cappedDelay + jitter);
    }
    return Math.round(cappedDelay);
  }

  private isRetryableError(error: Error): boolean {
    if (error instanceof BuildkiteError) return error.isRetryable();
    if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) return true;
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      threshold: config.threshold ?? 5,
      resetTimeoutMs: config.resetTimeoutMs ?? 30000,
    };
  }

  canExecute(): boolean {
    if (!this.config.enabled) return true;
    switch (this.state) {
      case 'closed': return true;
      case 'open':
        if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
          this.state = 'half-open';
          this.successCount = 0;
          return true;
        }
        return false;
      case 'half-open': return true;
    }
  }

  recordSuccess(): void {
    if (!this.config.enabled) return;
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === 'closed') {
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    if (!this.config.enabled) return;
    this.lastFailureTime = Date.now();
    if (this.state === 'half-open') {
      this.state = 'open';
      this.successCount = 0;
    } else if (this.state === 'closed') {
      this.failureCount++;
      if (this.failureCount >= this.config.threshold) {
        this.state = 'open';
      }
    }
  }

  getState(): CircuitState {
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
      this.state = 'half-open';
      this.successCount = 0;
    }
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

export class RateLimitTracker {
  private rateLimitInfo: RateLimitInfo | null = null;

  update(info: RateLimitInfo): void {
    this.rateLimitInfo = info;
  }

  get(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  async checkRateLimit(): Promise<void> {
    if (!this.rateLimitInfo || this.rateLimitInfo.remaining > 0) return;
    const now = Date.now();
    const resetAt = this.rateLimitInfo.resetAt.getTime();
    const waitTime = Math.max(0, resetAt - now);
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

export class ResilienceOrchestrator {
  private readonly retryExecutor: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimitTracker: RateLimitTracker;

  constructor(config: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
    jitter?: boolean;
    circuitBreaker?: Partial<CircuitBreakerConfig>;
  } = {}) {
    this.retryExecutor = new RetryExecutor(config);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.rateLimitTracker = new RateLimitTracker();
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.circuitBreaker.canExecute()) {
      throw new BuildkiteError(BuildkiteErrorKind.ServiceUnavailable, `Circuit breaker is ${this.circuitBreaker.getState()} - request blocked`);
    }
    await this.rateLimitTracker.checkRateLimit();
    try {
      const result = await this.retryExecutor.execute(fn);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }

  updateRateLimitInfo(info: RateLimitInfo): void {
    this.rateLimitTracker.update(info);
  }

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitTracker.get();
  }

  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  resetCircuit(): void {
    this.circuitBreaker.reset();
  }
}
