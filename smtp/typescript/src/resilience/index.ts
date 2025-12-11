/**
 * Resilience patterns for the SMTP client.
 */

import { SmtpError, isRetryableError } from '../errors';
import { RetryConfig, CircuitBreakerConfig, RateLimitConfig, OnLimitBehavior } from '../config';

/**
 * Retry executor with exponential backoff.
 */
export class RetryExecutor {
  private readonly config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  /**
   * Executes an operation with retry logic.
   */
  async execute<T>(operation: () => Promise<T>, _context?: string): Promise<T> {
    if (!this.config.enabled) {
      return operation();
    }

    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt < this.config.maxAttempts) {
      try {
        return await operation();
      } catch (err) {
        const error = err as Error;
        lastError = error;
        attempt++;

        // Check if we should retry
        if (attempt >= this.config.maxAttempts || !isRetryableError(error)) {
          throw error;
        }

        // Calculate delay
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Retry exhausted without error');
  }

  /**
   * Calculates the delay for a given attempt.
   */
  calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.initialDelay * Math.pow(this.config.multiplier, attempt - 1);
    let delay = Math.min(exponentialDelay, this.config.maxDelay);

    if (this.config.jitter) {
      // Add up to 25% jitter
      const jitter = delay * 0.25 * Math.random();
      delay += jitter;
    }

    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Circuit breaker states.
 */
export enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half_open',
}

/**
 * Circuit breaker event types.
 */
export type CircuitBreakerEvent =
  | { type: 'state_change'; from: CircuitState; to: CircuitState }
  | { type: 'failure'; error: Error }
  | { type: 'success' }
  | { type: 'rejected' };

/**
 * Circuit breaker implementation.
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly listeners: Array<(event: CircuitBreakerEvent) => void> = [];

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Executes an operation through the circuit breaker.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return operation();
    }

    // Check if circuit should transition from open to half-open
    this.checkRecovery();

    if (this.state === CircuitState.Open) {
      this.emit({ type: 'rejected' });
      throw SmtpError.circuitOpen();
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err as Error);
      throw err;
    }
  }

  /**
   * Gets the current state.
   */
  getState(): CircuitState {
    this.checkRecovery();
    return this.state;
  }

  /**
   * Gets circuit breaker metrics.
   */
  getMetrics(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Forces the circuit to a specific state.
   */
  forceState(state: CircuitState): void {
    const from = this.state;
    this.state = state;
    if (state === CircuitState.Closed) {
      this.failureCount = 0;
    }
    this.emit({ type: 'state_change', from, to: state });
  }

  /**
   * Adds an event listener.
   */
  onEvent(listener: (event: CircuitBreakerEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private onSuccess(): void {
    this.emit({ type: 'success' });

    if (this.state === CircuitState.HalfOpen) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.Closed);
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(error: Error): void {
    this.emit({ type: 'failure', error });
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HalfOpen) {
      // Any failure in half-open state opens the circuit
      this.transitionTo(CircuitState.Open);
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.Open);
    }
  }

  private checkRecovery(): void {
    if (this.state === CircuitState.Open) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.recoveryTimeout) {
        this.transitionTo(CircuitState.HalfOpen);
        this.successCount = 0;
      }
    }
  }

  private transitionTo(state: CircuitState): void {
    if (this.state !== state) {
      const from = this.state;
      this.state = state;
      this.emit({ type: 'state_change', from, to: state });
    }
  }

  private emit(event: CircuitBreakerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

/**
 * Token bucket rate limiter.
 */
export class RateLimiter {
  private readonly config: RateLimitConfig;
  private tokens: number;
  private lastRefill: number;
  private readonly waitQueue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timeout?: NodeJS.Timeout;
  }> = [];

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.tokens = config.maxEmails ?? Infinity;
    this.lastRefill = Date.now();
  }

  /**
   * Acquires a token, potentially waiting if necessary.
   */
  async acquire(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }

    // Handle based on configured behavior
    switch (this.config.onLimit) {
      case OnLimitBehavior.Reject:
        throw SmtpError.rateLimit('Rate limit exceeded');

      case OnLimitBehavior.Wait:
        return this.waitForToken();

      case OnLimitBehavior.WaitWithTimeout:
        return this.waitForTokenWithTimeout(this.config.window);
    }
  }

  /**
   * Checks if a token is available without acquiring it.
   */
  isAvailable(): boolean {
    if (!this.config.enabled) {
      return true;
    }
    this.refillTokens();
    return this.tokens >= 1;
  }

  /**
   * Gets the current token count.
   */
  getTokenCount(): number {
    this.refillTokens();
    return this.tokens;
  }

  /**
   * Gets rate limiter status.
   */
  getStatus(): {
    tokens: number;
    maxTokens: number;
    waitingCount: number;
    enabled: boolean;
  } {
    this.refillTokens();
    return {
      tokens: Math.floor(this.tokens),
      maxTokens: this.config.maxEmails ?? Infinity,
      waitingCount: this.waitQueue.length,
      enabled: this.config.enabled,
    };
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.config.window) {
      // Full refill
      this.tokens = this.config.maxEmails ?? Infinity;
      this.lastRefill = now;

      // Wake up waiting requests
      this.processWaitQueue();
    }
  }

  private waitForToken(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.waitQueue.push({ resolve, reject });
    });
  }

  private waitForTokenWithTimeout(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waitQueue.findIndex((w) => w.timeout === timer);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(SmtpError.rateLimit(`Rate limit timeout after ${timeout}ms`));
      }, timeout);

      this.waitQueue.push({ resolve, reject, timeout: timer });
    });
  }

  private processWaitQueue(): void {
    while (this.waitQueue.length > 0 && this.tokens >= 1) {
      const waiter = this.waitQueue.shift();
      if (waiter) {
        if (waiter.timeout) {
          clearTimeout(waiter.timeout);
        }
        this.tokens--;
        waiter.resolve();
      }
    }
  }
}

/**
 * Resilience orchestrator combining retry, circuit breaker, and rate limiting.
 */
export class ResilienceOrchestrator {
  private readonly retry: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiter;

  constructor(
    retryConfig: RetryConfig,
    circuitBreakerConfig: CircuitBreakerConfig,
    rateLimitConfig: RateLimitConfig
  ) {
    this.retry = new RetryExecutor(retryConfig);
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    this.rateLimiter = new RateLimiter(rateLimitConfig);
  }

  /**
   * Executes an operation with all resilience patterns applied.
   */
  async execute<T>(operation: () => Promise<T>, context?: string): Promise<T> {
    // First, check rate limit
    await this.rateLimiter.acquire();

    // Then, apply circuit breaker and retry
    return this.circuitBreaker.execute(() => this.retry.execute(operation, context));
  }

  /**
   * Gets the circuit breaker instance.
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Gets the rate limiter instance.
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Gets combined status.
   */
  getStatus(): {
    circuitState: CircuitState;
    rateLimiterTokens: number;
    isHealthy: boolean;
  } {
    const circuitState = this.circuitBreaker.getState();
    const rateLimiterStatus = this.rateLimiter.getStatus();

    return {
      circuitState,
      rateLimiterTokens: rateLimiterStatus.tokens,
      isHealthy: circuitState !== CircuitState.Open && rateLimiterStatus.tokens > 0,
    };
  }
}

/**
 * Creates a retry executor.
 */
export function createRetryExecutor(config: RetryConfig): RetryExecutor {
  return new RetryExecutor(config);
}

/**
 * Creates a circuit breaker.
 */
export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Creates a rate limiter.
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return new RateLimiter(config);
}

/**
 * Creates a resilience orchestrator.
 */
export function createResilienceOrchestrator(
  retryConfig: RetryConfig,
  circuitBreakerConfig: CircuitBreakerConfig,
  rateLimitConfig: RateLimitConfig
): ResilienceOrchestrator {
  return new ResilienceOrchestrator(retryConfig, circuitBreakerConfig, rateLimitConfig);
}
