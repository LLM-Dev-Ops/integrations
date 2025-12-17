/**
 * Rate limiter for HubSpot API requests
 * Implements three token buckets:
 * - Daily bucket (resets at midnight UTC)
 * - Burst bucket (refills at 100 per 10 seconds)
 * - Search bucket (refills at 4 per second)
 */

import type {
  RateLimitConfig,
  RateLimitStatus,
  RateLimitType,
} from './types/rate-limit.js';

/**
 * Daily limit exceeded error
 */
export class DailyLimitExceededError extends Error {
  constructor(public readonly waitTime: number) {
    super(`Daily rate limit exceeded. Resets in ${Math.ceil(waitTime / 1000)}s`);
    this.name = 'DailyLimitExceededError';
  }
}

/**
 * Rate limiter implementing token bucket algorithm
 */
export class RateLimiter {
  private dailyRemaining: number;
  private dailyResetAt: Date;
  private burstTokens: number;
  private lastBurstRefill: number;
  private searchTokens: number;
  private lastSearchRefill: number;
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.dailyRemaining = config.dailyLimit;
    this.dailyResetAt = this.getNextMidnightUTC();
    this.burstTokens = config.burstLimit;
    this.lastBurstRefill = Date.now();
    this.searchTokens = config.searchLimit;
    this.lastSearchRefill = Date.now();
  }

  /**
   * Wait for a rate limit slot to become available
   * @param type - Type of request (standard, search, or batch)
   * @throws {DailyLimitExceededError} If daily limit is exhausted
   */
  async waitForSlot(type: RateLimitType): Promise<void> {
    // Refill tokens based on elapsed time
    this.refillTokens();

    // Check daily limit
    if (this.dailyRemaining <= this.getReservedBuffer()) {
      const waitTime = this.dailyResetAt.getTime() - Date.now();
      if (waitTime > 0) {
        throw new DailyLimitExceededError(waitTime);
      }
    }

    // Check burst limit for standard and batch requests
    if (type === 'standard' || type === 'batch') {
      while (this.burstTokens < 1) {
        await this.waitForBurstRefill();
        this.refillTokens();
      }
      this.burstTokens--;
    }

    // Check search limit (stricter)
    if (type === 'search') {
      while (this.searchTokens < 1) {
        await this.waitForSearchRefill();
        this.refillTokens();
      }
      this.searchTokens--;
    }

    this.dailyRemaining--;
  }

  /**
   * Refill tokens based on elapsed time
   */
  refillTokens(): void {
    const now = Date.now();

    // Refill burst tokens (100 per 10 seconds)
    const burstElapsed = now - this.lastBurstRefill;
    if (burstElapsed >= 10000) {
      const periods = Math.floor(burstElapsed / 10000);
      this.burstTokens = Math.min(
        this.config.burstLimit,
        this.burstTokens + periods * this.config.burstLimit
      );
      this.lastBurstRefill = now;
    }

    // Refill search tokens (N per second)
    const searchElapsed = now - this.lastSearchRefill;
    if (searchElapsed >= 1000) {
      const periods = Math.floor(searchElapsed / 1000);
      this.searchTokens = Math.min(
        this.config.searchLimit,
        this.searchTokens + periods * this.config.searchLimit
      );
      this.lastSearchRefill = now;
    }

    // Reset daily at midnight UTC
    if (now > this.dailyResetAt.getTime()) {
      this.dailyRemaining = this.config.dailyLimit;
      this.dailyResetAt = this.getNextMidnightUTC();
    }
  }

  /**
   * Update rate limits from HubSpot response headers
   * @param headers - Response headers from HubSpot API
   */
  handleRateLimitResponse(headers: Headers): void {
    // Update from response headers
    const dailyRemaining = headers.get('x-hubspot-ratelimit-daily-remaining');
    if (dailyRemaining) {
      this.dailyRemaining = parseInt(dailyRemaining, 10);
    }

    const secondlyRemaining = headers.get('x-hubspot-ratelimit-secondly-remaining');
    if (secondlyRemaining) {
      this.burstTokens = parseInt(secondlyRemaining, 10);
    }
  }

  /**
   * Get current rate limit status
   * @returns Current status of all rate limit buckets
   */
  getStatus(): RateLimitStatus {
    return {
      daily: {
        remaining: this.dailyRemaining,
        limit: this.config.dailyLimit,
        resetsAt: this.dailyResetAt,
      },
      burst: {
        remaining: this.burstTokens,
        limit: this.config.burstLimit,
      },
      search: {
        remaining: this.searchTokens,
        limit: this.config.searchLimit,
      },
    };
  }

  /**
   * Get reserved buffer for critical operations
   * @returns Number of calls to reserve
   */
  private getReservedBuffer(): number {
    return Math.floor(this.config.dailyLimit * this.config.buffer);
  }

  /**
   * Wait for burst bucket to refill
   * @returns Promise that resolves when next refill period begins
   */
  private async waitForBurstRefill(): Promise<void> {
    const now = Date.now();
    const nextRefill = this.lastBurstRefill + 10000;
    const waitTime = Math.max(0, nextRefill - now);

    if (waitTime > 0) {
      await this.sleep(waitTime);
    }
  }

  /**
   * Wait for search bucket to refill
   * @returns Promise that resolves when next refill period begins
   */
  private async waitForSearchRefill(): Promise<void> {
    const now = Date.now();
    const nextRefill = this.lastSearchRefill + 1000;
    const waitTime = Math.max(0, nextRefill - now);

    if (waitTime > 0) {
      await this.sleep(waitTime);
    }
  }

  /**
   * Calculate next midnight UTC
   * @returns Date object for next midnight UTC
   */
  private getNextMidnightUTC(): Date {
    const now = new Date();
    const midnight = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
        0
      )
    );
    return midnight;
  }

  /**
   * Sleep for specified milliseconds
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
