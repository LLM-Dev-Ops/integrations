/**
 * Rate limiter implementation using token bucket algorithm.
 *
 * Supports header-based rate limit updates and optional request queuing.
 */

import { RateLimiterConfig, RateLimiterStateInfo } from './types.js';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default rate limiter configuration
 */
export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  algorithm: 'token_bucket',
  maxRequests: 100,
  windowMs: 60000, // 60 seconds
  queueRequests: false,
  maxQueueSize: 100,
  updateFromHeaders: true,
};

// ============================================================================
// Rate Limiter Error
// ============================================================================

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitExceededError extends Error {
  public readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = 'RateLimitExceededError';
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// Rate Limiter
// ============================================================================

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private tokens: number;
  private lastRefillTime: number;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private processingQueue = false;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = {
      ...DEFAULT_RATE_LIMITER_CONFIG,
      ...config,
    };
    this.tokens = this.config.maxRequests;
    this.lastRefillTime = Date.now();
  }

  /**
   * Acquire a token (blocks if queueing is enabled)
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    // If we have tokens, consume one immediately
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // No tokens available
    if (!this.config.queueRequests) {
      const timeUntilRefill = this.getTimeUntilRefill();
      throw new RateLimitExceededError(
        'Rate limit exceeded',
        Math.ceil(timeUntilRefill / 1000)
      );
    }

    // Queue is full
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new RateLimitExceededError('Rate limit queue full');
    }

    // Queue the request
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject, timestamp: Date.now() });
      this.scheduleQueueProcessing();
    });
  }

  /**
   * Release a token (for algorithms that require explicit release)
   */
  release(): void {
    // Token bucket doesn't require explicit release
    // This is a no-op for compatibility with other algorithms
  }

  /**
   * Update rate limits from response headers
   */
  updateFromHeaders(headers: Headers | Record<string, string>): void {
    if (!this.config.updateFromHeaders) {
      return;
    }

    // Handle both Headers object and plain object
    const getHeader = (name: string): string | null => {
      if (headers instanceof Headers) {
        return headers.get(name);
      }
      return headers[name] ?? headers[name.toLowerCase()] ?? null;
    };

    // Check for X-RateLimit-* headers
    const limit = getHeader('x-ratelimit-limit');
    const remaining = getHeader('x-ratelimit-remaining');
    const reset = getHeader('x-ratelimit-reset');

    if (limit !== null) {
      const limitValue = parseInt(limit, 10);
      if (!isNaN(limitValue)) {
        this.config.maxRequests = limitValue;
      }
    }

    if (remaining !== null) {
      const remainingValue = parseInt(remaining, 10);
      if (!isNaN(remainingValue)) {
        this.tokens = Math.min(remainingValue, this.config.maxRequests);
      }
    }

    if (reset !== null) {
      const resetValue = parseInt(reset, 10);
      if (!isNaN(resetValue)) {
        // Reset is typically a Unix timestamp
        const now = Math.floor(Date.now() / 1000);
        if (resetValue > now) {
          const resetMs = (resetValue - now) * 1000;
          this.lastRefillTime = Date.now() - this.config.windowMs + resetMs;
        }
      }
    }
  }

  /**
   * Get current state information
   */
  getState(): RateLimiterStateInfo {
    this.refillTokens();

    return {
      available: this.tokens,
      capacity: this.config.maxRequests,
      queueSize: this.queue.length,
      timeUntilRefillMs: this.getTimeUntilRefill(),
    };
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;

    if (elapsed >= this.config.windowMs) {
      // Full refill
      this.tokens = this.config.maxRequests;
      this.lastRefillTime = now;
    } else {
      // Partial refill (continuous token bucket)
      const refillRate = this.config.maxRequests / this.config.windowMs;
      const tokensToAdd = Math.floor(elapsed * refillRate);

      if (tokensToAdd > 0) {
        this.tokens = Math.min(this.tokens + tokensToAdd, this.config.maxRequests);
        // Adjust last refill time to account for partial tokens
        this.lastRefillTime += tokensToAdd / refillRate;
      }
    }
  }

  /**
   * Get time until next token refill
   */
  private getTimeUntilRefill(): number {
    const elapsed = Date.now() - this.lastRefillTime;
    const timeUntilFullRefill = Math.max(0, this.config.windowMs - elapsed);

    // For token bucket, we get tokens continuously
    // Calculate time until next single token
    const refillRate = this.config.maxRequests / this.config.windowMs;
    const timePerToken = 1 / refillRate;

    return Math.min(timePerToken, timeUntilFullRefill);
  }

  /**
   * Schedule processing of queued requests
   */
  private scheduleQueueProcessing(): void {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;
    const timeUntilToken = this.getTimeUntilRefill();

    setTimeout(() => {
      this.processQueue();
    }, timeUntilToken);
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    this.refillTokens();

    // Process as many queued requests as we have tokens
    while (this.tokens > 0 && this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        this.tokens--;
        request.resolve();
      }
    }

    // Continue processing if queue has items
    if (this.queue.length > 0) {
      const timeUntilToken = this.getTimeUntilRefill();
      setTimeout(() => {
        this.processQueue();
      }, timeUntilToken);
    } else {
      this.processingQueue = false;
    }
  }

  /**
   * Clear the request queue
   */
  clearQueue(): void {
    const error = new RateLimitExceededError('Queue cleared');
    for (const request of this.queue) {
      request.reject(error);
    }
    this.queue = [];
    this.processingQueue = false;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.config.maxRequests;
    this.lastRefillTime = Date.now();
    this.clearQueue();
  }

  /**
   * Get current configuration
   */
  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }
}
