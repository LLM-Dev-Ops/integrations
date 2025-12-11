/**
 * Rate limiter for Slack API.
 */

/**
 * Rate limit tier
 */
export type RateLimitTier = 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'special';

/**
 * Rate limit configuration by tier
 */
export const TIER_LIMITS: Record<RateLimitTier, { requestsPerMinute: number }> = {
  tier1: { requestsPerMinute: 1 },
  tier2: { requestsPerMinute: 20 },
  tier3: { requestsPerMinute: 50 },
  tier4: { requestsPerMinute: 100 },
  special: { requestsPerMinute: 1 },
};

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  tier: RateLimitTier;
  maxTokens?: number;
  refillRate?: number;
  windowMs?: number;
}

/**
 * Token bucket implementation
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;

  constructor(maxTokens: number, refillRatePerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
    this.refillRatePerMs = refillRatePerSecond / 1000;
  }

  /**
   * Try to consume a token
   */
  tryConsume(tokens = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  /**
   * Get time until token available (ms)
   */
  getWaitTime(tokens = 1): number {
    this.refill();
    if (this.tokens >= tokens) {
      return 0;
    }
    const needed = tokens - this.tokens;
    return Math.ceil(needed / this.refillRatePerMs);
  }

  /**
   * Get available tokens
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Reset the bucket
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRatePerMs;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindowLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequestsPerMinute: number, windowMs = 60000) {
    this.maxRequests = maxRequestsPerMinute;
    this.windowMs = windowMs;
  }

  /**
   * Try to make a request
   */
  tryAcquire(): boolean {
    this.cleanup();
    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(Date.now());
      return true;
    }
    return false;
  }

  /**
   * Get wait time until next request allowed (ms)
   */
  getWaitTime(): number {
    this.cleanup();
    if (this.timestamps.length < this.maxRequests) {
      return 0;
    }
    const oldest = this.timestamps[0];
    return Math.max(0, oldest + this.windowMs - Date.now());
  }

  /**
   * Get remaining requests in window
   */
  getRemainingRequests(): number {
    this.cleanup();
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }

  /**
   * Reset the limiter
   */
  reset(): void {
    this.timestamps = [];
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((ts) => ts > cutoff);
  }
}

/**
 * Rate limiter for Slack API
 */
export class RateLimiter {
  private limiters: Map<string, SlidingWindowLimiter> = new Map();
  private defaultTier: RateLimitTier;

  constructor(defaultTier: RateLimitTier = 'tier3') {
    this.defaultTier = defaultTier;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(endpoint: string, tier?: RateLimitTier): boolean {
    const limiter = this.getLimiter(endpoint, tier);
    return limiter.tryAcquire();
  }

  /**
   * Get wait time for endpoint
   */
  getWaitTime(endpoint: string, tier?: RateLimitTier): number {
    const limiter = this.getLimiter(endpoint, tier);
    return limiter.getWaitTime();
  }

  /**
   * Wait until request allowed
   */
  async waitForSlot(endpoint: string, tier?: RateLimitTier): Promise<void> {
    const waitTime = this.getWaitTime(endpoint, tier);
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    // Try to acquire after waiting
    const limiter = this.getLimiter(endpoint, tier);
    if (!limiter.tryAcquire()) {
      // Recursive wait if still not allowed
      await this.waitForSlot(endpoint, tier);
    }
  }

  /**
   * Reset limiter for endpoint
   */
  reset(endpoint?: string): void {
    if (endpoint) {
      this.limiters.delete(endpoint);
    } else {
      this.limiters.clear();
    }
  }

  /**
   * Record rate limit from API response
   */
  recordRateLimit(endpoint: string, retryAfterSeconds: number): void {
    // The API has told us we're rate limited, reset the limiter
    // and adjust based on retry-after
    this.limiters.delete(endpoint);
  }

  private getLimiter(endpoint: string, tier?: RateLimitTier): SlidingWindowLimiter {
    const key = endpoint;
    let limiter = this.limiters.get(key);

    if (!limiter) {
      const effectiveTier = tier ?? this.getTierForEndpoint(endpoint);
      const config = TIER_LIMITS[effectiveTier];
      limiter = new SlidingWindowLimiter(config.requestsPerMinute);
      this.limiters.set(key, limiter);
    }

    return limiter;
  }

  private getTierForEndpoint(endpoint: string): RateLimitTier {
    // Some endpoints have specific tiers
    const tierMap: Record<string, RateLimitTier> = {
      'chat.postMessage': 'tier4',
      'chat.update': 'tier3',
      'conversations.list': 'tier2',
      'conversations.history': 'tier3',
      'users.list': 'tier2',
      'files.upload': 'tier2',
      'search.messages': 'tier2',
      'auth.test': 'tier4',
    };

    return tierMap[endpoint] ?? this.defaultTier;
  }
}

/**
 * Create rate limiter
 */
export function createRateLimiter(defaultTier: RateLimitTier = 'tier3'): RateLimiter {
  return new RateLimiter(defaultTier);
}
