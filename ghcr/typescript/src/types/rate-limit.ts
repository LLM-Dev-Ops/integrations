/**
 * Rate limit types for GitHub Container Registry.
 * @module types/rate-limit
 */

/**
 * Rate limit information from API headers.
 */
export interface RateLimitInfo {
  /** Maximum requests allowed in the time window */
  readonly limit: number;
  /** Remaining requests in the current window */
  readonly remaining: number;
  /** Unix timestamp when the rate limit resets */
  readonly reset: number;
  /** Number of requests used in the current window */
  readonly used: number;
}

/**
 * Rate limit status for decision making.
 */
export interface RateLimitStatus {
  /** Current rate limit info */
  readonly info: RateLimitInfo;
  /** Whether we're approaching the limit */
  readonly isApproaching: boolean;
  /** Whether we've exceeded the limit */
  readonly isExceeded: boolean;
  /** Seconds until reset */
  readonly secondsUntilReset: number;
  /** Usage percentage (0-100) */
  readonly usagePercent: number;
}

/**
 * Rate limit utilities.
 */
export const RateLimitUtils = {
  /**
   * Default rate limit info (unknown state).
   */
  defaultInfo(): RateLimitInfo {
    return {
      limit: 1000,
      remaining: 1000,
      reset: Math.floor(Date.now() / 1000) + 3600,
      used: 0,
    };
  },

  /**
   * Parses rate limit info from response headers.
   */
  fromHeaders(headers: Headers): RateLimitInfo | null {
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    const used = headers.get('x-ratelimit-used');

    if (limit && remaining && reset) {
      return {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
        used: used ? parseInt(used, 10) : parseInt(limit, 10) - parseInt(remaining, 10),
      };
    }

    return null;
  },

  /**
   * Gets the status of the rate limit.
   */
  getStatus(info: RateLimitInfo, thresholdPercent: number = 80): RateLimitStatus {
    const now = Math.floor(Date.now() / 1000);
    const secondsUntilReset = Math.max(0, info.reset - now);
    const usagePercent = info.limit > 0
      ? ((info.limit - info.remaining) / info.limit) * 100
      : 0;

    return {
      info,
      isApproaching: usagePercent >= thresholdPercent,
      isExceeded: info.remaining === 0,
      secondsUntilReset,
      usagePercent,
    };
  },

  /**
   * Calculates the optimal delay to avoid hitting rate limits.
   */
  calculateDelay(info: RateLimitInfo): number {
    if (info.remaining === 0) {
      const now = Math.floor(Date.now() / 1000);
      return Math.max(0, (info.reset - now) * 1000);
    }

    if (info.remaining < info.limit * 0.2) {
      // Less than 20% remaining - add a small delay
      const now = Math.floor(Date.now() / 1000);
      const timeUntilReset = Math.max(0, info.reset - now);
      const optimalDelay = (timeUntilReset * 1000) / info.remaining;
      return Math.min(optimalDelay, 5000); // Cap at 5 seconds
    }

    return 0;
  },

  /**
   * Parses Retry-After header value.
   */
  parseRetryAfter(headers: Headers): number | null {
    const retryAfter = headers.get('retry-after');
    if (!retryAfter) {
      return null;
    }

    // Try as seconds
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000; // Convert to milliseconds
    }

    // Try as HTTP date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      const now = Date.now();
      return Math.max(0, date.getTime() - now);
    }

    return null;
  },

  /**
   * Formats rate limit info for logging.
   */
  format(info: RateLimitInfo): string {
    const resetDate = new Date(info.reset * 1000);
    return `${info.remaining}/${info.limit} (resets at ${resetDate.toISOString()})`;
  },
};
