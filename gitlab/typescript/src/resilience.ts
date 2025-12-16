/**
 * Resilience patterns for GitLab integration
 * Implements rate limiting, circuit breaker, retry with backoff, and orchestration
 */

/**
 * Circuit breaker states
 */
export enum CircuitState {
  Closed = 'CLOSED',
  Open = 'OPEN',
  HalfOpen = 'HALF_OPEN',
}

/**
 * Rate limiter configuration
 */
export interface RateLimitConfig {
  /** Maximum requests allowed per window */
  limit?: number;
  /** Initial remaining requests */
  remaining?: number;
  /** Reset timestamp (Unix timestamp in seconds) */
  reset?: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  threshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeoutMs: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in ms before first retry */
  initialDelayMs: number;
  /** Maximum delay in ms between retries */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  multiplier: number;
  /** Whether to add random jitter to delays */
  jitter: boolean;
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Resilience statistics
 */
export interface ResilienceStats {
  rateLimitHits: number;
  circuitBreakerTrips: number;
  totalRetries: number;
  successfulRequests: number;
  failedRequests: number;
}

/**
 * Execution options for resilience orchestrator
 */
export interface ExecutionOptions {
  skipRateLimit?: boolean;
  skipRetry?: boolean;
}

/**
 * Rate limiter using semaphore pattern for burst control
 */
export class RateLimiter {
  private limit: number;
  private remaining: number;
  private reset: number;
  private queue: Array<() => void> = [];
  private processing = false;

  constructor(config: RateLimitConfig = {}) {
    this.limit = config.limit ?? 600;
    this.remaining = config.remaining ?? this.limit;
    this.reset = config.reset ?? Math.floor(Date.now() / 1000) + 60;
  }

  /**
   * Acquire a permit to make a request
   * Waits if rate limited until reset time
   */
  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      const tryAcquire = () => {
        const now = Math.floor(Date.now() / 1000);

        // Reset if window has passed
        if (now >= this.reset) {
          this.remaining = this.limit;
          this.reset = now + 60;
        }

        // If we have remaining capacity, grant immediately
        if (this.remaining > 0) {
          this.remaining--;
          resolve();
          this.processQueue();
          return;
        }

        // Otherwise, queue and wait for reset
        this.queue.push(() => {
          this.remaining--;
          resolve();
        });

        if (!this.processing) {
          this.scheduleReset();
        }
      };

      tryAcquire();
    });
  }

  /**
   * Update rate limit info from GitLab response headers
   */
  updateFromHeaders(headers: Headers): void {
    const parsed = parseRateLimitHeaders(headers);

    if (parsed.limit !== undefined) {
      this.limit = parsed.limit;
    }
    if (parsed.remaining !== undefined) {
      this.remaining = parsed.remaining;
    }
    if (parsed.reset !== undefined) {
      this.reset = parsed.reset;
    }

    // Process queue if we now have capacity
    if (this.remaining > 0) {
      this.processQueue();
    }
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo {
    return {
      limit: this.limit,
      remaining: this.remaining,
      reset: this.reset,
    };
  }

  /**
   * Schedule processing of queued requests after reset
   */
  private scheduleReset(): void {
    if (this.processing) {
      return;
    }

    this.processing = true;
    const now = Math.floor(Date.now() / 1000);
    const delayMs = Math.max(0, (this.reset - now) * 1000);

    setTimeout(() => {
      this.processing = false;
      const now = Math.floor(Date.now() / 1000);

      if (now >= this.reset) {
        this.remaining = this.limit;
        this.reset = now + 60;
        this.processQueue();
      } else {
        // If reset hasn't occurred yet, schedule again
        this.scheduleReset();
      }
    }, delayMs);
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    while (this.queue.length > 0 && this.remaining > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

/**
 * Circuit breaker pattern implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = 0;
  private readonly threshold: number;
  private readonly resetTimeoutMs: number;

  constructor(config: CircuitBreakerConfig) {
    this.threshold = config.threshold;
    this.resetTimeoutMs = config.resetTimeoutMs;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Check if circuit is open
    if (this.state === CircuitState.Open) {
      if (now < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      // Transition to half-open to test the service
      this.state = CircuitState.HalfOpen;
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
   * Record a successful execution
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HalfOpen) {
      this.successCount++;
      // After a success in half-open, close the circuit
      this.state = CircuitState.Closed;
      this.successCount = 0;
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.state === CircuitState.HalfOpen) {
      // Failure in half-open state, reopen the circuit
      this.state = CircuitState.Open;
      this.nextAttempt = Date.now() + this.resetTimeoutMs;
    } else if (this.failureCount >= this.threshold) {
      // Threshold exceeded, open the circuit
      this.state = CircuitState.Open;
      this.nextAttempt = Date.now() + this.resetTimeoutMs;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = 0;
  }
}

/**
 * Retry with exponential backoff implementation
 */
export class RetryWithBackoff {
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly multiplier: number;
  private readonly jitter: boolean;

  constructor(config: RetryConfig) {
    this.maxRetries = config.maxRetries;
    this.initialDelayMs = config.initialDelayMs;
    this.maxDelayMs = config.maxDelayMs;
    this.multiplier = config.multiplier;
    this.jitter = config.jitter;
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Don't retry if we've exhausted attempts or error is not retryable
        if (attempt >= this.maxRetries || !shouldRetry(error)) {
          throw error;
        }

        // Calculate and wait for backoff delay
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs this
    throw lastError;
  }

  /**
   * Calculate delay for exponential backoff with optional jitter
   */
  calculateDelay(attempt: number): number {
    // Base exponential backoff
    let delay = Math.min(
      this.initialDelayMs * Math.pow(this.multiplier, attempt),
      this.maxDelayMs
    );

    // Add jitter if enabled
    if (this.jitter) {
      // Random jitter between 0% and 100% of the delay
      const jitterAmount = Math.random() * delay;
      delay = delay - jitterAmount / 2 + Math.random() * jitterAmount;
    }

    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Orchestrates all resilience patterns
 */
export class ResilienceOrchestrator {
  private readonly rateLimiter: RateLimiter;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly retry?: RetryWithBackoff;
  private stats: ResilienceStats = {
    rateLimitHits: 0,
    circuitBreakerTrips: 0,
    totalRetries: 0,
    successfulRequests: 0,
    failedRequests: 0,
  };

  constructor(
    rateLimitConfig: RateLimitConfig,
    circuitBreakerConfig?: CircuitBreakerConfig,
    retryConfig?: RetryConfig
  ) {
    this.rateLimiter = new RateLimiter(rateLimitConfig);

    if (circuitBreakerConfig) {
      this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    }

    if (retryConfig) {
      this.retry = new RetryWithBackoff(retryConfig);
    }
  }

  /**
   * Execute a function with all configured resilience patterns
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: ExecutionOptions = {}
  ): Promise<T> {
    const executeWithPatterns = async (): Promise<T> => {
      // Apply rate limiting unless skipped
      if (!options.skipRateLimit) {
        const rateLimitInfo = this.rateLimiter.getRateLimitInfo();
        if (rateLimitInfo.remaining <= 0) {
          this.stats.rateLimitHits++;
        }
        await this.rateLimiter.acquire();
      }

      // Apply circuit breaker if configured
      const executeRequest = async (): Promise<T> => {
        if (this.circuitBreaker) {
          return await this.circuitBreaker.execute(fn);
        }
        return await fn();
      };

      try {
        const result = await executeRequest();
        this.stats.successfulRequests++;
        return result;
      } catch (error) {
        this.stats.failedRequests++;

        // Track circuit breaker trips
        if (this.circuitBreaker && this.circuitBreaker.getState() === CircuitState.Open) {
          this.stats.circuitBreakerTrips++;
        }

        throw error;
      }
    };

    // Apply retry logic if configured and not skipped
    if (this.retry && !options.skipRetry) {
      return await this.retry.execute(
        executeWithPatterns,
        (error: unknown) => {
          this.stats.totalRetries++;
          return this.isRetryableError(error);
        }
      );
    }

    return await executeWithPatterns();
  }

  /**
   * Update rate limit information from response headers
   */
  updateRateLimitFromHeaders(headers: Headers): void {
    this.rateLimiter.updateFromHeaders(headers);
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo {
    return this.rateLimiter.getRateLimitInfo();
  }

  /**
   * Get current circuit breaker state
   */
  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker?.getState() ?? CircuitState.Closed;
  }

  /**
   * Get resilience statistics
   */
  getStats(): ResilienceStats {
    return { ...this.stats };
  }

  /**
   * Reset all resilience components and statistics
   */
  reset(): void {
    this.circuitBreaker?.reset();
    this.stats = {
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
      totalRetries: 0,
      successfulRequests: 0,
      failedRequests: 0,
    };
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    // Retry on network errors, timeouts, and certain HTTP status codes
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Network errors
      if (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('enotfound')
      ) {
        return true;
      }

      // Check for HTTP status codes in error message
      // Common retryable status codes: 408, 429, 500, 502, 503, 504
      const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
      for (const code of retryableStatusCodes) {
        if (message.includes(String(code))) {
          return true;
        }
      }
    }

    // Check if error has a status property (common in HTTP clients)
    const errorWithStatus = error as { status?: number };
    if (errorWithStatus.status) {
      const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
      return retryableStatusCodes.includes(errorWithStatus.status);
    }

    return false;
  }
}

/**
 * Parse rate limit headers from GitLab response
 */
export function parseRateLimitHeaders(headers: Headers): {
  limit?: number;
  remaining?: number;
  reset?: number;
} {
  const result: { limit?: number; remaining?: number; reset?: number } = {};

  // GitLab uses RateLimit-* headers
  const limitHeader = headers.get('RateLimit-Limit');
  if (limitHeader) {
    const parsed = parseInt(limitHeader, 10);
    if (!isNaN(parsed)) {
      result.limit = parsed;
    }
  }

  const remainingHeader = headers.get('RateLimit-Remaining');
  if (remainingHeader) {
    const parsed = parseInt(remainingHeader, 10);
    if (!isNaN(parsed)) {
      result.remaining = parsed;
    }
  }

  const resetHeader = headers.get('RateLimit-Reset');
  if (resetHeader) {
    const parsed = parseInt(resetHeader, 10);
    if (!isNaN(parsed)) {
      result.reset = parsed;
    }
  }

  return result;
}

/**
 * Parse Retry-After header
 * Returns delay in milliseconds
 */
export function parseRetryAfter(headers: Headers): number | undefined {
  const retryAfter = headers.get('Retry-After');
  if (!retryAfter) {
    return undefined;
  }

  // Retry-After can be either a number (seconds) or HTTP date
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return Math.max(0, delayMs);
  }

  return undefined;
}
