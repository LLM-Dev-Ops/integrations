/**
 * Rate limiter configuration for token bucket algorithm
 */
export interface RateLimiterConfig {
  /** Maximum number of requests per minute */
  requestsPerMinute: number;
  /** Maximum burst size for handling burst requests */
  burstSize: number;
  /** Extra wait time in milliseconds after rate limit reset */
  retryAfterBuffer?: number;
}

/**
 * Rate limiter state information
 */
export interface RateLimiterState {
  /** Current number of available tokens */
  tokens: number;
  /** Maximum number of tokens */
  maxTokens: number;
  /** Unix timestamp when rate limit resets */
  resetTime?: number;
}

/**
 * Token bucket rate limiter implementation for GitLab API requests.
 *
 * Uses a token bucket algorithm to manage request rate limits:
 * - Tokens are consumed for each request
 * - Tokens refill continuously at a configured rate
 * - Supports burst requests up to the bucket size
 * - Handles 429 rate limit responses from GitLab API
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   requestsPerMinute: 600,
 *   burstSize: 100,
 *   retryAfterBuffer: 1000
 * });
 *
 * // Wait for token before making request
 * await limiter.acquire();
 * const response = await fetch(url);
 *
 * // Handle rate limit response
 * if (response.status === 429) {
 *   limiter.handleRateLimitResponse(response.headers);
 * }
 * ```
 */
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;
  private resetTime?: number;
  private retryAfterBuffer: number;

  /**
   * Creates a new rate limiter instance
   *
   * @param config - Rate limiter configuration
   */
  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.burstSize;
    this.tokens = config.burstSize;
    this.refillRate = config.requestsPerMinute / 60000; // tokens per millisecond
    this.lastRefill = Date.now();
    this.retryAfterBuffer = config.retryAfterBuffer ?? 0;
  }

  /**
   * Acquires a token for making a request.
   * If no tokens are available, waits until a token becomes available.
   *
   * @returns Promise that resolves when a token is acquired
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    await this.waitForToken();
    this.tokens -= 1;
  }

  /**
   * Checks if a token can be acquired without waiting
   *
   * @returns true if a token is available, false otherwise
   */
  canAcquire(): boolean {
    this.refillTokens();
    return this.tokens >= 1;
  }

  /**
   * Handles rate limit response from GitLab API.
   * Parses the RateLimit-Reset header and updates internal state.
   *
   * @param headers - Response headers from GitLab API
   */
  handleRateLimitResponse(headers: Headers): void {
    // Try to get reset time from RateLimit-Reset header
    const rateLimitReset = headers.get('RateLimit-Reset');
    if (rateLimitReset) {
      this.resetTime = parseInt(rateLimitReset, 10) * 1000; // Convert to milliseconds
      this.tokens = 0; // Exhaust all tokens
      return;
    }

    // Fallback to Retry-After header if available
    const retryAfter = headers.get('Retry-After');
    if (retryAfter) {
      const retrySeconds = parseInt(retryAfter, 10);
      if (!isNaN(retrySeconds)) {
        this.resetTime = Date.now() + (retrySeconds * 1000);
        this.tokens = 0;
      }
    }
  }

  /**
   * Gets the current state of the rate limiter
   *
   * @returns Current rate limiter state
   */
  getState(): RateLimiterState {
    this.refillTokens();
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      resetTime: this.resetTime,
    };
  }

  /**
   * Refills tokens based on time elapsed since last refill
   */
  private refillTokens(): void {
    const now = Date.now();

    // If we have a reset time and it's in the future, don't refill yet
    if (this.resetTime && now < this.resetTime) {
      return;
    }

    // If we've passed the reset time, clear it and refill to max
    if (this.resetTime && now >= this.resetTime) {
      this.resetTime = undefined;
      this.tokens = this.maxTokens;
      this.lastRefill = now;
      return;
    }

    // Normal token bucket refill
    const timeSinceLastRefill = now - this.lastRefill;
    const tokensToAdd = timeSinceLastRefill * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Waits until a token becomes available
   *
   * @returns Promise that resolves when a token is available
   */
  private async waitForToken(): Promise<void> {
    const now = Date.now();

    // If we have a reset time, wait until then plus buffer
    if (this.resetTime && this.resetTime > now) {
      const waitTime = this.resetTime - now + this.retryAfterBuffer;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.refillTokens();
      return;
    }

    // Calculate time needed to get one token
    const timeForOneToken = 1 / this.refillRate;
    await new Promise(resolve => setTimeout(resolve, timeForOneToken));
    this.refillTokens();
  }
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Normal operation - requests are allowed */
  Closed = 'closed',
  /** Circuit is open - requests are rejected */
  Open = 'open',
  /** Testing recovery - limited requests allowed */
  HalfOpen = 'half-open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Number of consecutive successes to close from half-open state */
  successThreshold: number;
  /** Time in milliseconds before attempting half-open from open state */
  resetTimeoutMs: number;
}

/**
 * Circuit breaker implementation for fault tolerance.
 *
 * Prevents cascading failures by detecting failure patterns and temporarily
 * blocking requests when a service is experiencing issues.
 *
 * States:
 * - Closed: Normal operation, requests allowed
 * - Open: Too many failures, requests blocked
 * - Half-Open: Testing if service recovered, limited requests allowed
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   resetTimeoutMs: 60000
 * });
 *
 * if (!breaker.allowRequest()) {
 *   throw new Error('Circuit breaker is open');
 * }
 *
 * try {
 *   await makeApiCall();
 *   breaker.recordSuccess();
 * } catch (error) {
 *   breaker.recordFailure();
 *   throw error;
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState;
  private failures: number;
  private successes: number;
  private lastFailure?: number;
  private config: CircuitBreakerConfig;

  /**
   * Creates a new circuit breaker instance
   *
   * @param config - Circuit breaker configuration
   */
  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.state = CircuitState.Closed;
    this.failures = 0;
    this.successes = 0;
  }

  /**
   * Checks if a request should be allowed based on circuit state
   *
   * @returns true if request is allowed, false if circuit is open
   */
  allowRequest(): boolean {
    if (this.state === CircuitState.Closed) {
      return true;
    }

    if (this.state === CircuitState.Open) {
      // Check if enough time has passed to try half-open
      if (this.lastFailure && Date.now() - this.lastFailure >= this.config.resetTimeoutMs) {
        this.state = CircuitState.HalfOpen;
        this.successes = 0;
        return true;
      }
      return false;
    }

    // Half-open state - allow request to test recovery
    return true;
  }

  /**
   * Records a successful request
   */
  recordSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HalfOpen) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.Closed;
        this.successes = 0;
      }
    }
  }

  /**
   * Records a failed request
   */
  recordFailure(): void {
    this.lastFailure = Date.now();
    this.failures++;
    this.successes = 0;

    if (this.state === CircuitState.HalfOpen) {
      // Go back to open on any failure in half-open
      this.state = CircuitState.Open;
      return;
    }

    if (this.state === CircuitState.Closed && this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.Open;
    }
  }

  /**
   * Gets the current state of the circuit breaker
   *
   * @returns Current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Resets the circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitState.Closed;
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = undefined;
  }
}
