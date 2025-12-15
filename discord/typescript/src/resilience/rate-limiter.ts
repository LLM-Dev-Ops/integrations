/**
 * Discord rate limit handling with bucket-based tracking.
 *
 * Discord uses a bucket-based rate limiting system:
 * - Global limit: 50 requests/second across all routes
 * - Per-route buckets: Limits vary by endpoint
 * - Webhook limit: 30 messages/minute per webhook
 */

import { RateLimitConfig } from '../config/index.js';
import {
  RateLimitedError,
  RateLimitTimeoutError,
  QueueFullError,
} from '../errors/index.js';

/**
 * Rate limit bucket tracking individual route limits.
 */
export class RateLimitBucket {
  /** Route identifier */
  readonly route: string;

  /** Remaining requests in current window */
  private remaining: number = Infinity;

  /** Unix timestamp (seconds) when the limit resets */
  private resetAt: number = 0;

  /** Bucket ID from Discord (for shared buckets) */
  private bucketId?: string;

  /** Pending requests waiting for this bucket */
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    queuedAt: number;
  }> = [];

  /** Whether bucket is currently processing */
  private processing: boolean = false;

  constructor(route: string) {
    this.route = route;
  }

  /**
   * Gets the number of remaining requests.
   */
  getRemaining(): number {
    return this.remaining;
  }

  /**
   * Gets the reset timestamp in milliseconds.
   */
  getResetAt(): number {
    return this.resetAt * 1000;
  }

  /**
   * Gets the bucket ID.
   */
  getBucketId(): string | undefined {
    return this.bucketId;
  }

  /**
   * Gets the number of pending requests in queue.
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Updates bucket state from response headers.
   */
  updateFromHeaders(headers: Headers): void {
    const remaining = headers.get('X-RateLimit-Remaining');
    if (remaining !== null) {
      this.remaining = parseInt(remaining, 10);
    }

    const reset = headers.get('X-RateLimit-Reset');
    if (reset !== null) {
      this.resetAt = parseFloat(reset);
    }

    const bucket = headers.get('X-RateLimit-Bucket');
    if (bucket !== null) {
      this.bucketId = bucket;
    }
  }

  /**
   * Checks if we can make a request immediately.
   */
  canProceed(): boolean {
    if (this.remaining > 0) {
      return true;
    }
    // Check if reset time has passed
    const now = Date.now() / 1000;
    return this.resetAt <= now;
  }

  /**
   * Gets the time to wait until reset (in milliseconds).
   */
  getWaitTime(): number {
    if (this.canProceed()) {
      return 0;
    }
    const now = Date.now() / 1000;
    return Math.max(0, (this.resetAt - now) * 1000);
  }

  /**
   * Acquires a slot in this bucket.
   * Waits if necessary until a slot is available.
   * @param timeout - Maximum time to wait (ms)
   */
  async acquire(timeout: number): Promise<void> {
    // Fast path: can proceed immediately
    if (this.canProceed()) {
      this.remaining = Math.max(0, this.remaining - 1);
      return;
    }

    // Need to wait - add to queue
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        resolve,
        reject,
        queuedAt: Date.now(),
      });

      // Start processing queue if not already
      if (!this.processing) {
        this.processQueue(timeout);
      }
    });
  }

  /**
   * Processes the queue of waiting requests.
   */
  private async processQueue(timeout: number): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const waitTime = this.getWaitTime();

        if (waitTime > 0) {
          // Wait until reset
          await this.sleep(waitTime);
        }

        // Process pending requests
        while (this.queue.length > 0 && this.canProceed()) {
          const request = this.queue.shift()!;
          const elapsed = Date.now() - request.queuedAt;

          if (elapsed > timeout) {
            request.reject(
              new RateLimitTimeoutError(elapsed, timeout)
            );
          } else {
            this.remaining = Math.max(0, this.remaining - 1);
            request.resolve();
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Resets the bucket to initial state.
   */
  reset(): void {
    this.remaining = Infinity;
    this.resetAt = 0;
    this.bucketId = undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Global rate limiter coordinating all buckets.
 */
export class RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly buckets: Map<string, RateLimitBucket> = new Map();

  /** Shared buckets (different routes may share same Discord bucket) */
  private readonly sharedBuckets: Map<string, RateLimitBucket> = new Map();

  /** Global rate limit state */
  private globalLimited: boolean = false;
  private globalResetAt: number = 0;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Gets or creates a bucket for a route.
   */
  getBucket(route: string): RateLimitBucket {
    let bucket = this.buckets.get(route);
    if (!bucket) {
      bucket = new RateLimitBucket(route);
      this.buckets.set(route, bucket);
    }
    return bucket;
  }

  /**
   * Acquires a slot for a request to the given route.
   * Handles both global and per-route limits.
   */
  async acquire(route: string): Promise<void> {
    // Check global rate limit
    if (this.globalLimited) {
      const waitTime = Math.max(0, this.globalResetAt - Date.now());
      if (waitTime > this.config.queueTimeout) {
        throw new RateLimitTimeoutError(waitTime, this.config.queueTimeout);
      }
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
      this.globalLimited = false;
    }

    // Check queue size
    const bucket = this.getBucket(route);
    if (bucket.getQueueSize() >= this.config.maxQueueSize) {
      throw new QueueFullError(bucket.getQueueSize(), this.config.maxQueueSize);
    }

    // Acquire slot
    await bucket.acquire(this.config.queueTimeout);
  }

  /**
   * Updates rate limit state from response headers.
   */
  updateFromResponse(route: string, headers: Headers): void {
    const bucket = this.getBucket(route);
    bucket.updateFromHeaders(headers);

    // Check for shared bucket
    const bucketId = headers.get('X-RateLimit-Bucket');
    if (bucketId) {
      this.sharedBuckets.set(bucketId, bucket);
    }

    // Check for global rate limit
    const isGlobal = headers.get('X-RateLimit-Global');
    if (isGlobal === 'true') {
      this.globalLimited = true;
      const retryAfter = headers.get('Retry-After');
      if (retryAfter) {
        this.globalResetAt = Date.now() + parseFloat(retryAfter) * 1000;
      }
    }
  }

  /**
   * Handles a 429 response.
   */
  handleRateLimit(
    route: string,
    retryAfterMs: number,
    isGlobal: boolean
  ): RateLimitedError {
    if (isGlobal) {
      this.globalLimited = true;
      this.globalResetAt = Date.now() + retryAfterMs;
    } else {
      const bucket = this.getBucket(route);
      // Update bucket reset time
      const resetAt = (Date.now() + retryAfterMs) / 1000;
      bucket.updateFromHeaders(
        new Headers({
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toString(),
        })
      );
    }

    return new RateLimitedError(retryAfterMs, isGlobal);
  }

  /**
   * Gets statistics for all buckets.
   */
  getStats(): {
    globalLimited: boolean;
    bucketCount: number;
    totalQueueSize: number;
    buckets: Array<{
      route: string;
      remaining: number;
      queueSize: number;
      resetAt: number;
    }>;
  } {
    let totalQueueSize = 0;
    const bucketStats = [];

    for (const [route, bucket] of this.buckets) {
      const queueSize = bucket.getQueueSize();
      totalQueueSize += queueSize;
      bucketStats.push({
        route,
        remaining: bucket.getRemaining(),
        queueSize,
        resetAt: bucket.getResetAt(),
      });
    }

    return {
      globalLimited: this.globalLimited,
      bucketCount: this.buckets.size,
      totalQueueSize,
      buckets: bucketStats,
    };
  }

  /**
   * Resets all buckets and global state.
   */
  reset(): void {
    this.globalLimited = false;
    this.globalResetAt = 0;
    for (const bucket of this.buckets.values()) {
      bucket.reset();
    }
    this.buckets.clear();
    this.sharedBuckets.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Route builder for Discord API endpoints.
 */
export function buildRoute(
  method: string,
  path: string,
  majorParams?: { channelId?: string; guildId?: string; webhookId?: string }
): string {
  // Discord rate limits are shared by major parameters
  let route = `${method}:${path}`;

  if (majorParams) {
    if (majorParams.channelId) {
      route = route.replace(majorParams.channelId, ':channel_id');
    }
    if (majorParams.guildId) {
      route = route.replace(majorParams.guildId, ':guild_id');
    }
    if (majorParams.webhookId) {
      route = route.replace(majorParams.webhookId, ':webhook_id');
    }
  }

  return route;
}
