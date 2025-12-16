/**
 * Rate limiter for Docker Hub pull operations.
 *
 * Docker Hub enforces rate limits based on authentication status:
 * - Anonymous: 100 pulls per 6 hours (identified by IP)
 * - Authenticated Free: 200 pulls per 6 hours (identified by Docker ID)
 * - Pro/Team/Business: Unlimited pulls
 *
 * Rate limit information is provided in response headers:
 * - RateLimit-Limit: Maximum requests allowed (e.g., "100;w=21600")
 * - RateLimit-Remaining: Remaining requests in current window
 * - Docker-RateLimit-Source: IP address for rate limit identification
 *
 * @module util/rate-limiter
 */

import { DockerHubError, DockerHubErrorKind } from '../errors.js';

/**
 * Rate limit status information.
 */
export interface RateLimitStatus {
  /** Number of pulls remaining in the current window. */
  remaining: number;
  /** Maximum pulls allowed in the window. */
  limit: number;
  /** Time when the rate limit resets. */
  resetAt?: Date;
  /** Whether the user is authenticated. */
  isAuthenticated: boolean;
}

/**
 * Rate limiter interface for Docker Hub pull operations.
 */
export interface RateLimiter {
  /**
   * Checks if a pull can be performed without exceeding rate limits.
   * @throws {DockerHubError} If rate limit is exceeded.
   */
  checkBeforePull(): void;

  /**
   * Updates rate limit tracking from HTTP response headers.
   * @param headers - Response headers containing rate limit information.
   */
  updateFromHeaders(headers: Headers): void;

  /**
   * Gets the current rate limit status.
   * @returns Current rate limit status.
   */
  getStatus(): RateLimitStatus;

  /**
   * Checks if the rate limit is running low.
   * @returns True if remaining pulls is less than the low threshold.
   */
  isLow(): boolean;
}

/**
 * Docker Hub rate limiter implementation.
 *
 * Tracks pull rate limits and prevents exceeding Docker Hub's limits.
 * Parses rate limit headers and provides warnings when approaching limits.
 */
export class DockerRateLimiter implements RateLimiter {
  private pullRemaining: number;
  private pullLimit: number;
  private resetTime?: Date;
  private isAuthenticated: boolean;
  private lowThreshold: number = 10;
  private windowSeconds: number = 21600; // 6 hours default

  /**
   * Creates a new Docker Hub rate limiter.
   *
   * @param isAuthenticated - Whether the user is authenticated.
   * @param lowThreshold - Threshold for warning about low remaining pulls (default: 10).
   */
  constructor(isAuthenticated: boolean = false, lowThreshold: number = 10) {
    this.isAuthenticated = isAuthenticated;
    this.lowThreshold = lowThreshold;

    // Set initial limits based on authentication status
    this.pullLimit = isAuthenticated ? 200 : 100;
    this.pullRemaining = this.pullLimit;
  }

  /**
   * Checks if a pull can be performed without exceeding rate limits.
   *
   * @throws {DockerHubError} If rate limit is exceeded (remaining <= 0).
   */
  checkBeforePull(): void {
    if (this.pullRemaining <= 0) {
      const resetAt = this.resetTime || this.calculateResetTime();
      const retryAfter = this.calculateRetryAfterSeconds(resetAt);

      let message = `Docker Hub pull rate limit exceeded: 0/${this.pullLimit} remaining.`;

      if (resetAt) {
        message += ` Rate limit resets at ${resetAt.toISOString()}.`;
      }

      if (!this.isAuthenticated) {
        message += ' Consider authenticating to increase your rate limit from 100 to 200 pulls per 6 hours.';
      }

      throw new DockerHubError(
        DockerHubErrorKind.PullLimitExceeded,
        message,
        {
          statusCode: 429,
          resetAt,
          retryAfter,
          rateLimitInfo: {
            limit: this.pullLimit,
            remaining: this.pullRemaining,
            resetAt,
            retryAfter,
            source: 'pull',
          },
        }
      );
    }

    // Warn if approaching rate limit
    if (this.isLow()) {
      const resetAt = this.resetTime || this.calculateResetTime();
      const warning = !this.isAuthenticated
        ? ` Consider authenticating to increase your rate limit to 200 pulls per 6 hours.`
        : '';

      console.warn(
        `Docker Hub rate limit running low: ${this.pullRemaining}/${this.pullLimit} remaining.` +
        (resetAt ? ` Resets at ${resetAt.toISOString()}.` : '') +
        warning
      );
    }
  }

  /**
   * Updates rate limit tracking from HTTP response headers.
   *
   * Parses the following headers:
   * - RateLimit-Limit: Format "100;w=21600" (limit=100, window=21600 seconds)
   * - RateLimit-Remaining: Number of pulls remaining
   * - Docker-RateLimit-Source: IP address for rate limit identification
   *
   * @param headers - Response headers from Docker Hub API.
   */
  updateFromHeaders(headers: Headers): void {
    // Parse RateLimit-Limit header: "100;w=21600"
    const limitHeader = headers.get('RateLimit-Limit');
    if (limitHeader) {
      const parsed = this.parseRateLimitHeader(limitHeader);
      if (parsed) {
        this.pullLimit = parsed.limit;
        this.windowSeconds = parsed.window;
      }
    }

    // Parse RateLimit-Remaining header
    const remainingHeader = headers.get('RateLimit-Remaining');
    if (remainingHeader) {
      const remaining = parseInt(remainingHeader, 10);
      if (!isNaN(remaining)) {
        this.pullRemaining = remaining;
      }
    }

    // Calculate reset time based on window
    if (this.windowSeconds > 0) {
      this.resetTime = this.calculateResetTime();
    }

    // Log rate limit source for debugging (IP address)
    const sourceHeader = headers.get('Docker-RateLimit-Source');
    if (sourceHeader) {
      // This is informational - shows which IP is being rate limited
      // Could be used for debugging or monitoring
    }
  }

  /**
   * Gets the current rate limit status.
   *
   * @returns Current rate limit status including remaining, limit, reset time, and auth status.
   */
  getStatus(): RateLimitStatus {
    return {
      remaining: this.pullRemaining,
      limit: this.pullLimit,
      resetAt: this.resetTime,
      isAuthenticated: this.isAuthenticated,
    };
  }

  /**
   * Checks if the rate limit is running low.
   *
   * @returns True if remaining pulls is less than the low threshold (default: 10).
   */
  isLow(): boolean {
    return this.pullRemaining < this.lowThreshold;
  }

  /**
   * Parses the RateLimit-Limit header.
   *
   * Expected format: "100;w=21600" where:
   * - 100 is the limit
   * - w=21600 is the window in seconds (21600 = 6 hours)
   *
   * @param header - RateLimit-Limit header value.
   * @returns Parsed limit and window, or null if parsing fails.
   */
  private parseRateLimitHeader(header: string): { limit: number; window: number } | null {
    try {
      // Split on semicolon: ["100", "w=21600"]
      const parts = header.split(';').map(p => p.trim());

      if (parts.length === 0) {
        return null;
      }

      // Parse limit (first part)
      const limit = parseInt(parts[0], 10);
      if (isNaN(limit)) {
        return null;
      }

      // Parse window (second part, format: "w=21600")
      let window = 21600; // Default to 6 hours
      if (parts.length > 1) {
        const windowPart = parts.find(p => p.startsWith('w='));
        if (windowPart) {
          const windowValue = parseInt(windowPart.substring(2), 10);
          if (!isNaN(windowValue)) {
            window = windowValue;
          }
        }
      }

      return { limit, window };
    } catch (error) {
      // If parsing fails, return null
      return null;
    }
  }

  /**
   * Calculates the reset time based on the current time and window.
   *
   * @returns Reset time as a Date object.
   */
  private calculateResetTime(): Date {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowSeconds * 1000);
    return resetAt;
  }

  /**
   * Calculates the retry-after duration in seconds.
   *
   * @param resetAt - Time when the rate limit resets.
   * @returns Number of seconds until reset, or 0 if reset time has passed.
   */
  private calculateRetryAfterSeconds(resetAt: Date): number {
    const now = new Date();
    if (resetAt > now) {
      return Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
    }
    return 0;
  }
}

/**
 * Creates a Docker Hub rate limiter.
 *
 * @param isAuthenticated - Whether the user is authenticated.
 * @param lowThreshold - Threshold for warning about low remaining pulls (default: 10).
 * @returns A new DockerRateLimiter instance.
 */
export function createDockerRateLimiter(
  isAuthenticated: boolean = false,
  lowThreshold: number = 10
): RateLimiter {
  return new DockerRateLimiter(isAuthenticated, lowThreshold);
}

/**
 * No-op rate limiter for testing or when rate limiting is disabled.
 */
export class NoopRateLimiter implements RateLimiter {
  checkBeforePull(): void {
    // No-op: always allow pulls
  }

  updateFromHeaders(_headers: Headers): void {
    // No-op: ignore headers
  }

  getStatus(): RateLimitStatus {
    return {
      remaining: Number.MAX_SAFE_INTEGER,
      limit: Number.MAX_SAFE_INTEGER,
      resetAt: undefined,
      isAuthenticated: false,
    };
  }

  isLow(): boolean {
    return false;
  }
}

/**
 * Creates a no-op rate limiter that doesn't enforce any limits.
 *
 * Useful for testing or for Pro/Team/Business accounts with unlimited pulls.
 *
 * @returns A new NoopRateLimiter instance.
 */
export function createNoopRateLimiter(): RateLimiter {
  return new NoopRateLimiter();
}
