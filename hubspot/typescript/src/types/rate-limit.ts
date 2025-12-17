/**
 * HubSpot Rate Limit Types
 * Type definitions for rate limit tracking and status
 */

/**
 * Rate limit status across all limit types
 */
export interface RateLimitStatus {
  /** Daily rate limit status */
  daily: DailyRateLimit;

  /** Burst (10-second) rate limit status */
  burst: BurstRateLimit;

  /** Search API rate limit status */
  search: SearchRateLimit;

  /** Overall health indicator */
  health?: RateLimitHealth;

  /** Last update timestamp */
  lastUpdated?: Date;
}

/**
 * Daily rate limit information
 */
export interface DailyRateLimit {
  /** Remaining calls for today */
  remaining: number;

  /** Total daily limit */
  limit: number;

  /** When the limit resets (midnight UTC) */
  resetsAt: Date;

  /** Percentage used (0-100) */
  usagePercent?: number;
}

/**
 * Burst rate limit (10-second window)
 */
export interface BurstRateLimit {
  /** Remaining calls in current window */
  remaining: number;

  /** Total burst limit */
  limit: number;

  /** When tokens will next refill */
  refillsAt?: Date;

  /** Percentage used (0-100) */
  usagePercent?: number;
}

/**
 * Search API rate limit (per second)
 */
export interface SearchRateLimit {
  /** Remaining search calls */
  remaining: number;

  /** Total search limit per second */
  limit: number;

  /** When tokens will next refill */
  refillsAt?: Date;

  /** Percentage used (0-100) */
  usagePercent?: number;
}

/**
 * Rate limit health status
 */
export type RateLimitHealth = 'healthy' | 'warning' | 'critical';

/**
 * Rate limit exceeded error information
 */
export interface RateLimitExceededInfo {
  /** Type of limit exceeded */
  limitType: 'daily' | 'burst' | 'search';

  /** Current usage */
  current: number;

  /** Limit value */
  limit: number;

  /** Time to wait before retry (milliseconds) */
  retryAfter: number;

  /** Reset timestamp */
  resetsAt: Date;

  /** Suggested action */
  suggestion?: string;
}

/**
 * Rate limit headers from HubSpot API responses
 */
export interface RateLimitHeaders {
  /** Daily remaining calls */
  'x-hubspot-ratelimit-daily-remaining'?: string;

  /** Daily limit */
  'x-hubspot-ratelimit-daily'?: string;

  /** Interval remaining (10-second burst) */
  'x-hubspot-ratelimit-interval-milliseconds-remaining'?: string;

  /** Interval limit */
  'x-hubspot-ratelimit-interval-milliseconds'?: string;

  /** Secondly remaining */
  'x-hubspot-ratelimit-secondly-remaining'?: string;

  /** Secondly limit */
  'x-hubspot-ratelimit-secondly'?: string;

  /** Retry after (when rate limited) */
  'retry-after'?: string;

  /** Additional headers */
  [key: string]: string | undefined;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Daily API call limit */
  dailyLimit: number;

  /** Burst limit (per 10 seconds) */
  burstLimit: number;

  /** Search limit (per second) */
  searchLimit: number;

  /** Reserved buffer percentage (0-1) */
  buffer: number;

  /** Enable adaptive rate limiting */
  adaptive?: boolean;

  /** Retry configuration */
  retry?: RetryConfig;
}

/**
 * Retry configuration for rate-limited requests
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;

  /** Initial backoff delay (milliseconds) */
  initialDelay: number;

  /** Maximum backoff delay (milliseconds) */
  maxDelay: number;

  /** Backoff multiplier */
  multiplier: number;

  /** Add random jitter to delays */
  jitter: boolean;
}

/**
 * Rate limit token bucket state
 */
export interface TokenBucket {
  /** Current token count */
  tokens: number;

  /** Maximum capacity */
  capacity: number;

  /** Refill rate (tokens per interval) */
  refillRate: number;

  /** Refill interval (milliseconds) */
  refillInterval: number;

  /** Last refill timestamp */
  lastRefill: number;
}

/**
 * Rate limit request type
 */
export type RateLimitType = 'standard' | 'search' | 'batch';

/**
 * Pending request in queue
 */
export interface PendingRequest {
  /** Request type */
  type: RateLimitType;

  /** Request priority (higher = more important) */
  priority: number;

  /** Resolve function for promise */
  resolve: () => void;

  /** Reject function for promise */
  reject: (error: Error) => void;
}

/**
 * Request queuing information
 */
export interface QueuedRequest {
  /** Unique request ID */
  id: string;

  /** Request priority (higher = more important) */
  priority: number;

  /** Request type */
  type: RateLimitType;

  /** When request was queued */
  queuedAt: Date;

  /** Estimated wait time (milliseconds) */
  estimatedWait?: number;

  /** Request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Rate limit statistics
 */
export interface RateLimitStatistics {
  /** Total requests made */
  totalRequests: number;

  /** Requests that hit rate limits */
  rateLimitedRequests: number;

  /** Rate limit hit percentage */
  rateLimitHitRate: number;

  /** Average requests per second */
  averageRequestRate: number;

  /** Peak requests per second */
  peakRequestRate: number;

  /** Time period for statistics */
  period: {
    start: Date;
    end: Date;
  };

  /** Breakdown by limit type */
  byLimitType?: {
    daily: LimitTypeStats;
    burst: LimitTypeStats;
    search: LimitTypeStats;
  };
}

/**
 * Statistics for a specific limit type
 */
export interface LimitTypeStats {
  /** Times this limit was hit */
  hitCount: number;

  /** Total wait time due to this limit (milliseconds) */
  totalWaitTime: number;

  /** Average wait time (milliseconds) */
  averageWaitTime: number;

  /** Maximum wait time (milliseconds) */
  maxWaitTime: number;
}

/**
 * Rate limit warning thresholds
 */
export interface RateLimitThresholds {
  /** Warning threshold (percentage, 0-100) */
  warning: number;

  /** Critical threshold (percentage, 0-100) */
  critical: number;

  /** Enable notifications */
  notificationsEnabled: boolean;
}

/**
 * Rate limit event for monitoring
 */
export interface RateLimitEvent {
  /** Event type */
  type: 'limit_approached' | 'limit_exceeded' | 'limit_reset';

  /** Limit type affected */
  limitType: 'daily' | 'burst' | 'search';

  /** Current usage */
  usage: number;

  /** Limit value */
  limit: number;

  /** Usage percentage */
  usagePercent: number;

  /** Timestamp */
  timestamp: Date;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Adaptive rate limit adjustment
 */
export interface AdaptiveRateLimitAdjustment {
  /** Original limit */
  originalLimit: number;

  /** Adjusted limit */
  adjustedLimit: number;

  /** Adjustment reason */
  reason: string;

  /** Adjustment factor */
  factor: number;

  /** Valid until */
  validUntil: Date;
}

/**
 * Rate limiter state for persistence
 */
export interface RateLimiterState {
  /** Daily limit state */
  daily: {
    remaining: number;
    resetsAt: number;
  };

  /** Burst limit state */
  burst: {
    tokens: number;
    lastRefill: number;
  };

  /** Search limit state */
  search: {
    tokens: number;
    lastRefill: number;
  };

  /** State version for compatibility */
  version: string;

  /** Last update timestamp */
  updatedAt: number;
}
