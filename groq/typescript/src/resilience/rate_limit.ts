/**
 * Rate limit tracking and management.
 */

import { RateLimitInfo, parseRateLimitInfo } from '../types/common';

/**
 * Rate limit state for tracking API limits.
 */
export interface RateLimitState {
  /** Request limit info. */
  requests: {
    limit?: number;
    remaining?: number;
    resetAt?: Date;
  };
  /** Token limit info. */
  tokens: {
    limit?: number;
    remaining?: number;
    resetAt?: Date;
  };
  /** Last update time. */
  updatedAt: Date;
}

/**
 * Rate limit manager for tracking and respecting API limits.
 */
export class RateLimitManager {
  private state: RateLimitState = {
    requests: {},
    tokens: {},
    updatedAt: new Date(),
  };

  /**
   * Updates rate limit state from response headers.
   */
  updateFromHeaders(headers: Record<string, string>): void {
    const info = parseRateLimitInfo(headers);
    this.updateFromInfo(info);
  }

  /**
   * Updates rate limit state from parsed info.
   */
  updateFromInfo(info: RateLimitInfo): void {
    const now = new Date();

    if (info.limitRequests !== undefined) {
      this.state.requests.limit = info.limitRequests;
    }
    if (info.remainingRequests !== undefined) {
      this.state.requests.remaining = info.remainingRequests;
    }
    if (info.resetRequests !== undefined) {
      this.state.requests.resetAt = new Date(now.getTime() + info.resetRequests * 1000);
    }

    if (info.limitTokens !== undefined) {
      this.state.tokens.limit = info.limitTokens;
    }
    if (info.remainingTokens !== undefined) {
      this.state.tokens.remaining = info.remainingTokens;
    }
    if (info.resetTokens !== undefined) {
      this.state.tokens.resetAt = new Date(now.getTime() + info.resetTokens * 1000);
    }

    this.state.updatedAt = now;
  }

  /**
   * Checks if a request should be allowed based on current limits.
   */
  shouldAllowRequest(): boolean {
    // If we don't have limit info, allow the request
    if (this.state.requests.remaining === undefined) {
      return true;
    }

    // Check if we've hit the limit
    if (this.state.requests.remaining <= 0) {
      // Check if the limit has reset
      if (this.state.requests.resetAt && new Date() >= this.state.requests.resetAt) {
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Gets the time until the rate limit resets in milliseconds.
   */
  getTimeUntilReset(): number | undefined {
    if (!this.state.requests.resetAt) {
      return undefined;
    }

    const now = new Date();
    const resetTime = this.state.requests.resetAt;

    if (now >= resetTime) {
      return 0;
    }

    return resetTime.getTime() - now.getTime();
  }

  /**
   * Gets the current rate limit state.
   */
  getState(): RateLimitState {
    return { ...this.state };
  }

  /**
   * Gets remaining requests, if known.
   */
  getRemainingRequests(): number | undefined {
    return this.state.requests.remaining;
  }

  /**
   * Gets remaining tokens, if known.
   */
  getRemainingTokens(): number | undefined {
    return this.state.tokens.remaining;
  }

  /**
   * Resets the rate limit state.
   */
  reset(): void {
    this.state = {
      requests: {},
      tokens: {},
      updatedAt: new Date(),
    };
  }

  /**
   * Estimates token usage for a request.
   * This is a rough estimate based on character count.
   */
  static estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
}

/**
 * Creates a rate limit manager.
 */
export function createRateLimitManager(): RateLimitManager {
  return new RateLimitManager();
}
