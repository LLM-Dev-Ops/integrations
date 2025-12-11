/**
 * OAuth2 Rate Limiter
 *
 * Rate limiting for OAuth2 operations.
 */

import { NetworkError } from "../error";

/**
 * Rate limiter configuration.
 */
export interface RateLimiterConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum concurrent requests */
  maxConcurrent?: number;
}

/**
 * Default rate limiter configurations per endpoint.
 */
export const DEFAULT_RATE_LIMITS = {
  token: { maxRequests: 60, windowMs: 60000 }, // 60 RPM
  authorization: { maxRequests: 30, windowMs: 60000 }, // 30 RPM
  introspection: { maxRequests: 60, windowMs: 60000 }, // 60 RPM
  revocation: { maxRequests: 30, windowMs: 60000 }, // 30 RPM
  device: { maxRequests: 30, windowMs: 60000 }, // 30 RPM
} as const;

/**
 * Rate limiter interface.
 */
export interface RateLimiter {
  /**
   * Acquire permission to make a request.
   * Returns immediately if permit available, otherwise waits or throws.
   */
  acquire(): Promise<void>;

  /**
   * Try to acquire without waiting.
   */
  tryAcquire(): boolean;

  /**
   * Release a concurrent request slot.
   */
  release(): void;

  /**
   * Get current availability.
   */
  getAvailability(): {
    remainingRequests: number;
    resetTime: Date;
    activeConcurrent: number;
  };
}

/**
 * Token bucket rate limiter implementation.
 */
export class TokenBucketRateLimiter implements RateLimiter {
  private config: Required<RateLimiterConfig>;
  private tokens: number;
  private lastRefill: number;
  private activeConcurrent: number = 0;

  constructor(config: RateLimiterConfig) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      maxConcurrent: config.maxConcurrent ?? 10,
    };
    this.tokens = config.maxRequests;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refillTokens();

    // Check concurrent limit
    if (this.activeConcurrent >= this.config.maxConcurrent) {
      // Wait for slot to become available
      await this.waitForConcurrentSlot();
    }

    // Check token availability
    if (this.tokens < 1) {
      const waitTime = this.getWaitTimeForToken();
      if (waitTime > 0) {
        throw new NetworkError(
          `Rate limit exceeded, retry after ${Math.ceil(waitTime / 1000)} seconds`,
          "RateLimited",
          { retryAfter: Math.ceil(waitTime / 1000) }
        );
      }
    }

    // Consume token
    this.tokens--;
    this.activeConcurrent++;
  }

  tryAcquire(): boolean {
    this.refillTokens();

    if (this.activeConcurrent >= this.config.maxConcurrent) {
      return false;
    }

    if (this.tokens < 1) {
      return false;
    }

    this.tokens--;
    this.activeConcurrent++;
    return true;
  }

  release(): void {
    if (this.activeConcurrent > 0) {
      this.activeConcurrent--;
    }
  }

  getAvailability(): {
    remainingRequests: number;
    resetTime: Date;
    activeConcurrent: number;
  } {
    this.refillTokens();
    return {
      remainingRequests: Math.floor(this.tokens),
      resetTime: new Date(this.lastRefill + this.config.windowMs),
      activeConcurrent: this.activeConcurrent,
    };
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd =
      (elapsed / this.config.windowMs) * this.config.maxRequests;

    this.tokens = Math.min(this.config.maxRequests, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private getWaitTimeForToken(): number {
    const tokensNeeded = 1 - this.tokens;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    return tokensNeeded / refillRate;
  }

  private async waitForConcurrentSlot(): Promise<void> {
    // Simple polling - in production, use proper queuing
    const maxWait = 30000; // 30 seconds
    const pollInterval = 100; // 100ms
    let waited = 0;

    while (this.activeConcurrent >= this.config.maxConcurrent) {
      if (waited >= maxWait) {
        throw new NetworkError(
          "Concurrent request limit reached",
          "RateLimited",
          { retryAfter: 1 }
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }
  }
}

/**
 * Mock rate limiter for testing.
 */
export class MockRateLimiter implements RateLimiter {
  private acquireHistory: Date[] = [];
  private forceReject: boolean = false;
  private activeConcurrent: number = 0;

  /**
   * Force rejection of acquire.
   */
  setForceReject(reject: boolean): this {
    this.forceReject = reject;
    return this;
  }

  /**
   * Get acquire history.
   */
  getAcquireHistory(): Date[] {
    return [...this.acquireHistory];
  }

  async acquire(): Promise<void> {
    if (this.forceReject) {
      throw new NetworkError("Rate limit exceeded", "RateLimited", {
        retryAfter: 60,
      });
    }
    this.acquireHistory.push(new Date());
    this.activeConcurrent++;
  }

  tryAcquire(): boolean {
    if (this.forceReject) {
      return false;
    }
    this.acquireHistory.push(new Date());
    this.activeConcurrent++;
    return true;
  }

  release(): void {
    if (this.activeConcurrent > 0) {
      this.activeConcurrent--;
    }
  }

  getAvailability(): {
    remainingRequests: number;
    resetTime: Date;
    activeConcurrent: number;
  } {
    return {
      remainingRequests: this.forceReject ? 0 : 100,
      resetTime: new Date(Date.now() + 60000),
      activeConcurrent: this.activeConcurrent,
    };
  }
}

/**
 * Create rate limiter.
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  return new TokenBucketRateLimiter(config);
}

/**
 * Create mock rate limiter for testing.
 */
export function createMockRateLimiter(): MockRateLimiter {
  return new MockRateLimiter();
}
