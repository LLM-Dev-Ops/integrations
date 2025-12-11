/**
 * Resilience patterns for the Cohere client.
 *
 * Includes retry logic, circuit breaker, and rate limiting.
 */

import { CohereError, isRetryableError, getRetryAfter, RateLimitError } from '../errors';

// ============================================================================
// Retry Pattern
// ============================================================================

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  multiplier: number;
  /** Whether to add jitter to delays */
  jitter: boolean;
  /** Retry on specific status codes */
  retryOnStatusCodes?: number[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  jitter: true,
  retryOnStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * Retry context passed to hooks
 */
export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  error: unknown;
  delayMs: number;
  startTime: number;
}

/**
 * Retry decision
 */
export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  reason?: string;
}

/**
 * Hook called before retry
 */
export type RetryHook = (context: RetryContext) => void | Promise<void>;

/**
 * Retry executor
 */
export class RetryExecutor {
  private readonly config: RetryConfig;
  private readonly hooks: RetryHook[] = [];

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Add a retry hook
   */
  addHook(hook: RetryHook): this {
    this.hooks.push(hook);
    return this;
  }

  /**
   * Execute with retries
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt >= this.config.maxAttempts) {
          throw error;
        }

        const decision = this.shouldRetry(error, attempt);
        if (!decision.shouldRetry) {
          throw error;
        }

        const context: RetryContext = {
          attempt,
          maxAttempts: this.config.maxAttempts,
          error,
          delayMs: decision.delayMs,
          startTime,
        };

        // Call hooks
        for (const hook of this.hooks) {
          await hook(context);
        }

        // Wait before retry
        await this.delay(decision.delayMs);
      }
    }

    throw lastError;
  }

  /**
   * Determine if we should retry
   */
  private shouldRetry(error: unknown, attempt: number): RetryDecision {
    if (!isRetryableError(error)) {
      return { shouldRetry: false, delayMs: 0, reason: 'Error is not retryable' };
    }

    // Check if error has a retry-after header
    const retryAfter = getRetryAfter(error);
    if (retryAfter !== undefined) {
      return {
        shouldRetry: true,
        delayMs: retryAfter * 1000,
        reason: 'Using retry-after header',
      };
    }

    // Calculate exponential backoff
    let delayMs = this.config.initialDelayMs * Math.pow(this.config.multiplier, attempt - 1);
    delayMs = Math.min(delayMs, this.config.maxDelayMs);

    if (this.config.jitter) {
      // Add random jitter (±25%)
      const jitterFactor = 0.75 + Math.random() * 0.5;
      delayMs = Math.floor(delayMs * jitterFactor);
    }

    return { shouldRetry: true, delayMs, reason: 'Exponential backoff' };
  }

  /**
   * Delay for a specified time
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Circuit Breaker Pattern
// ============================================================================

/**
 * Circuit breaker state
 */
export enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half_open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold before opening */
  failureThreshold: number;
  /** Success threshold to close from half-open */
  successThreshold: number;
  /** Time in open state before half-open (ms) */
  resetTimeoutMs: number;
  /** Window for counting failures (ms) */
  monitoringWindowMs: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  monitoringWindowMs: 60000,
};

/**
 * Circuit breaker for fault tolerance
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private failures: number[] = [];

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Check if request can proceed
   */
  canExecute(): boolean {
    this.updateState();
    return this.state !== CircuitState.Open;
  }

  /**
   * Execute with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CohereCircuitOpenError('Circuit breaker is open');
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HalfOpen) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.reset();
      }
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.failures.push(now);

    // Clean old failures outside monitoring window
    const windowStart = now - this.config.monitoringWindowMs;
    this.failures = this.failures.filter((t) => t > windowStart);

    if (this.state === CircuitState.HalfOpen) {
      this.trip();
    } else if (this.failures.length >= this.config.failureThreshold) {
      this.trip();
    }
  }

  /**
   * Update state based on time
   */
  private updateState(): void {
    if (this.state === CircuitState.Open) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state = CircuitState.HalfOpen;
        this.successCount = 0;
      }
    }
  }

  /**
   * Trip the circuit breaker
   */
  private trip(): void {
    this.state = CircuitState.Open;
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Reset the circuit breaker
   */
  private reset(): void {
    this.state = CircuitState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.failures = [];
  }
}

/**
 * Error thrown when circuit is open
 */
export class CohereCircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CohereCircuitOpenError';
  }
}

// ============================================================================
// Rate Limiter Pattern
// ============================================================================

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Whether to queue requests when limited */
  queueRequests: boolean;
  /** Maximum queue size */
  maxQueueSize: number;
}

/**
 * Default rate limiter configuration
 */
export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  maxRequests: 100,
  windowMs: 60000,
  queueRequests: false,
  maxQueueSize: 100,
};

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private tokens: number;
  private lastRefill: number;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
    this.tokens = this.config.maxRequests;
    this.lastRefill = Date.now();
  }

  /**
   * Check if request can proceed
   */
  canProceed(): boolean {
    this.refillTokens();
    return this.tokens > 0;
  }

  /**
   * Acquire a token (blocks if queueing enabled)
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    if (!this.config.queueRequests) {
      throw new RateLimitError('Rate limit exceeded', this.timeUntilRefill());
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      throw new RateLimitError('Rate limit queue full');
    }

    // Queue the request
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.scheduleQueueProcessing();
    });
  }

  /**
   * Update from response headers
   */
  updateFromHeaders(headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining');
    if (remaining !== null) {
      this.tokens = Math.min(parseInt(remaining, 10), this.config.maxRequests);
    }
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.config.windowMs) {
      // Full refill
      this.tokens = this.config.maxRequests;
      this.lastRefill = now;
    } else {
      // Partial refill (linear)
      const refillRate = this.config.maxRequests / this.config.windowMs;
      const tokensToAdd = Math.floor(elapsed * refillRate);
      if (tokensToAdd > 0) {
        this.tokens = Math.min(this.tokens + tokensToAdd, this.config.maxRequests);
        this.lastRefill = now;
      }
    }
  }

  /**
   * Calculate time until next refill
   */
  private timeUntilRefill(): number {
    const elapsed = Date.now() - this.lastRefill;
    return Math.max(0, this.config.windowMs - elapsed);
  }

  /**
   * Schedule processing of queued requests
   */
  private scheduleQueueProcessing(): void {
    const timeUntilToken = this.config.windowMs / this.config.maxRequests;
    setTimeout(() => this.processQueue(), timeUntilToken);
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    this.refillTokens();

    while (this.tokens > 0 && this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        this.tokens--;
        request.resolve();
      }
    }

    if (this.queue.length > 0) {
      this.scheduleQueueProcessing();
    }
  }
}

// ============================================================================
// Resilience Orchestrator
// ============================================================================

/**
 * Orchestrates all resilience patterns
 */
export class ResilienceOrchestrator {
  private readonly retry: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiter;

  constructor(options?: {
    retry?: Partial<RetryConfig>;
    circuitBreaker?: Partial<CircuitBreakerConfig>;
    rateLimiter?: Partial<RateLimiterConfig>;
  }) {
    this.retry = new RetryExecutor(options?.retry);
    this.circuitBreaker = new CircuitBreaker(options?.circuitBreaker);
    this.rateLimiter = new RateLimiter(options?.rateLimiter);
  }

  /**
   * Execute with all resilience patterns
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check rate limit first
    await this.rateLimiter.acquire();

    // Then circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      throw new CohereCircuitOpenError('Circuit breaker is open');
    }

    // Execute with retry
    try {
      const result = await this.retry.execute(async () => {
        return await this.circuitBreaker.execute(fn);
      });
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the retry executor
   */
  getRetry(): RetryExecutor {
    return this.retry;
  }

  /**
   * Get the circuit breaker
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Get the rate limiter
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }
}
