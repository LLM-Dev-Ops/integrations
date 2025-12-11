/**
 * Common types shared across the Groq client.
 */

/**
 * Token usage information.
 */
export interface GroqUsage {
  /** Number of tokens in the prompt. */
  promptTokens: number;
  /** Number of tokens in the completion. */
  completionTokens: number;
  /** Total number of tokens used. */
  totalTokens: number;
  /** Time to first token in seconds. */
  timeToFirstToken?: number;
  /** Total processing time in seconds. */
  totalTime?: number;
}

/**
 * Request metadata.
 */
export interface GroqMetadata {
  /** Unique request ID. */
  requestId?: string;
  /** Model used for the request. */
  model: string;
  /** Request timestamp. */
  timestamp: Date;
  /** Processing duration in milliseconds. */
  durationMs?: number;
}

/**
 * Rate limit information from response headers.
 */
export interface RateLimitInfo {
  /** Maximum requests allowed per window. */
  limitRequests?: number;
  /** Remaining requests in current window. */
  remainingRequests?: number;
  /** Maximum tokens allowed per window. */
  limitTokens?: number;
  /** Remaining tokens in current window. */
  remainingTokens?: number;
  /** Time until rate limit resets (seconds). */
  resetRequests?: number;
  /** Time until token limit resets (seconds). */
  resetTokens?: number;
}

/**
 * Parses rate limit info from response headers.
 */
export function parseRateLimitInfo(headers: Record<string, string>): RateLimitInfo {
  const info: RateLimitInfo = {};

  const limitRequests = headers['x-ratelimit-limit-requests'];
  if (limitRequests) {
    info.limitRequests = parseInt(limitRequests, 10);
  }

  const remainingRequests = headers['x-ratelimit-remaining-requests'];
  if (remainingRequests) {
    info.remainingRequests = parseInt(remainingRequests, 10);
  }

  const limitTokens = headers['x-ratelimit-limit-tokens'];
  if (limitTokens) {
    info.limitTokens = parseInt(limitTokens, 10);
  }

  const remainingTokens = headers['x-ratelimit-remaining-tokens'];
  if (remainingTokens) {
    info.remainingTokens = parseInt(remainingTokens, 10);
  }

  const resetRequests = headers['x-ratelimit-reset-requests'];
  if (resetRequests) {
    info.resetRequests = parseResetTime(resetRequests);
  }

  const resetTokens = headers['x-ratelimit-reset-tokens'];
  if (resetTokens) {
    info.resetTokens = parseResetTime(resetTokens);
  }

  return info;
}

/**
 * Parses a reset time string (e.g., "1s", "500ms") to seconds.
 */
function parseResetTime(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) {
    return 0;
  }

  const numStr = match[1];
  if (!numStr) {
    return 0;
  }
  const num = parseFloat(numStr);
  const unit = match[2] ?? 's';

  switch (unit) {
    case 'ms':
      return num / 1000;
    case 's':
      return num;
    case 'm':
      return num * 60;
    case 'h':
      return num * 3600;
    default:
      return num;
  }
}
