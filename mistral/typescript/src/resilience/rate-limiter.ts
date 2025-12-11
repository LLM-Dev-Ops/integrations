/**
 * Rate limiter for the Mistral client.
 */

/**
 * Rate limiter configuration.
 */
export interface RateLimiterConfig {
  /** Maximum number of tokens in the bucket. */
  maxTokens: number;
  /** Token refill rate per second. */
  refillRate: number;
  /** Initial number of tokens. */
  initialTokens?: number;
}

/**
 * Default rate limiter configuration.
 */
export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  maxTokens: 100,
  refillRate: 10,
};

/**
 * Token bucket rate limiter.
 */
export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private tokens: number;
  private lastRefillTime: number;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
    this.tokens = this.config.initialTokens ?? this.config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Gets the current number of tokens.
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Checks if a request can be made.
   */
  canAcquire(tokens = 1): boolean {
    this.refill();
    return this.tokens >= tokens;
  }

  /**
   * Tries to acquire tokens.
   */
  tryAcquire(tokens = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Acquires tokens, waiting if necessary.
   */
  async acquire(tokens = 1): Promise<void> {
    while (!this.tryAcquire(tokens)) {
      const waitTime = this.getWaitTime(tokens);
      await this.sleep(waitTime);
    }
  }

  /**
   * Gets the time to wait for tokens to be available.
   */
  getWaitTime(tokens = 1): number {
    this.refill();

    if (this.tokens >= tokens) {
      return 0;
    }

    const needed = tokens - this.tokens;
    const waitSeconds = needed / this.config.refillRate;
    return Math.ceil(waitSeconds * 1000);
  }

  /**
   * Resets the rate limiter.
   */
  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Updates token count from API response headers.
   */
  updateFromHeaders(headers: Record<string, string>): void {
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];

    if (remaining !== undefined) {
      this.tokens = Math.min(parseInt(remaining, 10), this.config.maxTokens);
    }

    if (reset !== undefined) {
      // Reset header is typically in seconds since epoch
      const resetTime = parseInt(reset, 10) * 1000;
      const now = Date.now();
      if (resetTime > now) {
        this.lastRefillTime = now;
      }
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = elapsed * this.config.refillRate;

    this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a rate limiter with the given configuration.
 */
export function createRateLimiter(config?: Partial<RateLimiterConfig>): RateLimiter {
  return new RateLimiter(config);
}
