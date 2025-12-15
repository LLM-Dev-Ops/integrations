/**
 * Rate Limiter Implementation for vLLM
 * Token bucket algorithm with configurable rate and burst
 */

import type { RateLimitConfig } from '../types/index.js';
import { RateLimitError } from '../types/errors.js';

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefillTime: number;

  constructor(config: RateLimitConfig) {
    this.maxTokens = config.burstSize;
    this.tokens = config.burstSize;
    this.refillRate = config.requestsPerSecond / 1000;
    this.lastRefillTime = Date.now();
  }

  /**
   * Try to acquire a token
   * @returns true if token acquired, false otherwise
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Acquire a token, throwing if not available
   * @throws RateLimitError if no tokens available
   */
  acquire(): void {
    if (!this.tryAcquire()) {
      const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
      throw new RateLimitError('Rate limit exceeded', {
        retryAfter: Math.ceil(waitTime / 1000),
        details: {
          availableTokens: this.tokens,
          waitTimeMs: waitTime,
        },
      });
    }
  }

  /**
   * Wait until a token is available
   */
  async acquireAsync(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
    await this.sleep(waitTime);

    // Recursively try again after waiting
    return this.acquireAsync();
  }

  /**
   * Get the current number of available tokens
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get the estimated wait time in ms for the next token
   */
  getWaitTimeMs(): number {
    this.refill();
    if (this.tokens >= 1) {
      return 0;
    }
    return Math.ceil((1 - this.tokens) / this.refillRate);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const refillAmount = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + refillAmount);
    this.lastRefillTime = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Manage rate limiters for multiple servers
 */
export class RateLimiterRegistry {
  private limiters: Map<string, RateLimiter> = new Map();
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Get or create a rate limiter for a server
   */
  get(serverId: string): RateLimiter {
    let limiter = this.limiters.get(serverId);
    if (!limiter) {
      limiter = new RateLimiter(this.config);
      this.limiters.set(serverId, limiter);
    }
    return limiter;
  }

  /**
   * Acquire a token from the specified server's rate limiter
   */
  acquire(serverId: string): void {
    this.get(serverId).acquire();
  }

  /**
   * Acquire a token asynchronously
   */
  async acquireAsync(serverId: string): Promise<void> {
    return this.get(serverId).acquireAsync();
  }
}
