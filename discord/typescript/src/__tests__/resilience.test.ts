/**
 * Tests for resilience components (rate limiting, retry).
 */

import {
  RateLimitBucket,
  RateLimiter,
  buildRoute,
  RetryExecutor,
  createRetryExecutor,
  RateLimitedError,
  ServerError,
  NotFoundError,
} from '../index.js';

describe('RateLimitBucket', () => {
  describe('basic operations', () => {
    it('should allow requests when remaining > 0', async () => {
      const bucket = new RateLimitBucket('test');
      await bucket.acquire(1000);
      // Should not throw
    });

    it('should track remaining requests', () => {
      const bucket = new RateLimitBucket('test');
      const headers = new Headers({
        'X-RateLimit-Remaining': '5',
        'X-RateLimit-Reset': String(Date.now() / 1000 + 60),
      });
      bucket.updateFromHeaders(headers);
      expect(bucket.getRemaining()).toBe(5);
    });

    it('should track bucket ID', () => {
      const bucket = new RateLimitBucket('test');
      const headers = new Headers({
        'X-RateLimit-Bucket': 'abc123',
      });
      bucket.updateFromHeaders(headers);
      expect(bucket.getBucketId()).toBe('abc123');
    });

    it('should reset bucket', () => {
      const bucket = new RateLimitBucket('test');
      bucket.updateFromHeaders(new Headers({
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Bucket': 'xyz',
      }));
      bucket.reset();
      expect(bucket.getRemaining()).toBe(Infinity);
      expect(bucket.getBucketId()).toBeUndefined();
    });
  });

  describe('canProceed', () => {
    it('should return true when remaining > 0', () => {
      const bucket = new RateLimitBucket('test');
      expect(bucket.canProceed()).toBe(true);
    });

    it('should return true when reset time has passed', () => {
      const bucket = new RateLimitBucket('test');
      bucket.updateFromHeaders(new Headers({
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Date.now() / 1000 - 1), // In the past
      }));
      expect(bucket.canProceed()).toBe(true);
    });

    it('should return false when exhausted and reset in future', () => {
      const bucket = new RateLimitBucket('test');
      bucket.updateFromHeaders(new Headers({
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Date.now() / 1000 + 60), // 60 seconds from now
      }));
      expect(bucket.canProceed()).toBe(false);
    });
  });

  describe('getWaitTime', () => {
    it('should return 0 when can proceed', () => {
      const bucket = new RateLimitBucket('test');
      expect(bucket.getWaitTime()).toBe(0);
    });

    it('should return positive wait time when rate limited', () => {
      const bucket = new RateLimitBucket('test');
      const resetTime = Date.now() / 1000 + 5; // 5 seconds from now
      bucket.updateFromHeaders(new Headers({
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(resetTime),
      }));
      const waitTime = bucket.getWaitTime();
      expect(waitTime).toBeGreaterThan(4000);
      expect(waitTime).toBeLessThanOrEqual(5000);
    });
  });
});

describe('RateLimiter', () => {
  describe('bucket management', () => {
    it('should create buckets on demand', () => {
      const limiter = new RateLimiter({
        globalLimit: 50,
        queueTimeout: 30000,
        maxQueueSize: 1000,
      });

      const bucket = limiter.getBucket('channel:123:messages');
      expect(bucket).toBeDefined();
      expect(bucket.getRemaining()).toBe(Infinity);
    });

    it('should reuse existing buckets', () => {
      const limiter = new RateLimiter({
        globalLimit: 50,
        queueTimeout: 30000,
        maxQueueSize: 1000,
      });

      const bucket1 = limiter.getBucket('channel:123:messages');
      const bucket2 = limiter.getBucket('channel:123:messages');
      expect(bucket1).toBe(bucket2);
    });
  });

  describe('acquire', () => {
    it('should acquire without waiting when available', async () => {
      const limiter = new RateLimiter({
        globalLimit: 50,
        queueTimeout: 30000,
        maxQueueSize: 1000,
      });

      const start = Date.now();
      await limiter.acquire('test:route');
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('updateFromResponse', () => {
    it('should update bucket from response headers', () => {
      const limiter = new RateLimiter({
        globalLimit: 50,
        queueTimeout: 30000,
        maxQueueSize: 1000,
      });

      const headers = new Headers({
        'X-RateLimit-Remaining': '10',
        'X-RateLimit-Reset': String(Date.now() / 1000 + 60),
        'X-RateLimit-Bucket': 'bucket123',
      });

      limiter.updateFromResponse('channel:123', headers);
      const bucket = limiter.getBucket('channel:123');
      expect(bucket.getRemaining()).toBe(10);
      expect(bucket.getBucketId()).toBe('bucket123');
    });
  });

  describe('handleRateLimit', () => {
    it('should return RateLimitedError', () => {
      const limiter = new RateLimiter({
        globalLimit: 50,
        queueTimeout: 30000,
        maxQueueSize: 1000,
      });

      const error = limiter.handleRateLimit('test:route', 5000, false);
      expect(error).toBeInstanceOf(RateLimitedError);
      expect(error.retryAfterMs).toBe(5000);
    });
  });

  describe('getStats', () => {
    it('should return limiter statistics', () => {
      const limiter = new RateLimiter({
        globalLimit: 50,
        queueTimeout: 30000,
        maxQueueSize: 1000,
      });

      limiter.getBucket('route1');
      limiter.getBucket('route2');

      const stats = limiter.getStats();
      expect(stats.bucketCount).toBe(2);
      expect(stats.globalLimited).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear all buckets', () => {
      const limiter = new RateLimiter({
        globalLimit: 50,
        queueTimeout: 30000,
        maxQueueSize: 1000,
      });

      limiter.getBucket('route1');
      limiter.getBucket('route2');
      limiter.reset();

      const stats = limiter.getStats();
      expect(stats.bucketCount).toBe(0);
    });
  });
});

describe('buildRoute', () => {
  it('should build route from method and path', () => {
    expect(buildRoute('POST', '/channels/123/messages')).toBe('POST:/channels/123/messages');
    expect(buildRoute('GET', '/users/@me')).toBe('GET:/users/@me');
  });

  it('should replace major parameters', () => {
    const route = buildRoute('POST', '/channels/123456789/messages', {
      channelId: '123456789',
    });
    expect(route).toBe('POST:/channels/:channel_id/messages');
  });

  it('should replace multiple parameters', () => {
    const route = buildRoute('POST', '/guilds/111/channels/222/messages', {
      guildId: '111',
      channelId: '222',
    });
    expect(route).toBe('POST:/guilds/:guild_id/channels/:channel_id/messages');
  });
});

describe('RetryExecutor', () => {
  describe('successful execution', () => {
    it('should return result without retry', async () => {
      const executor = createRetryExecutor();
      const result = await executor.execute(async () => 'success');
      expect(result).toBe('success');
    });
  });

  describe('retry on retryable errors', () => {
    it('should retry on ServerError', async () => {
      let attempts = 0;
      const executor = createRetryExecutor({ maxRetries: 3, initialBackoffMs: 10 });

      const result = await executor.execute(async () => {
        attempts++;
        if (attempts < 3) {
          throw new ServerError(500);
        }
        return 'success';
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should use retry-after from error', async () => {
      let attempts = 0;
      const delays: number[] = [];

      const executor = new RetryExecutor(
        { maxRetries: 2, initialBackoffMs: 1000, maxBackoffMs: 30000, backoffMultiplier: 2, jitterFactor: 0 },
        {
          onRetry: (_attempt, _error, delay) => {
            delays.push(delay);
          },
        }
      );

      try {
        await executor.execute(async () => {
          attempts++;
          throw new RateLimitedError(100); // 100ms retry-after
        });
      } catch {
        // Expected to fail after retries
      }

      // Should use the retry-after value
      expect(delays[0]).toBe(100);
    });
  });

  describe('no retry on non-retryable errors', () => {
    it('should not retry NotFoundError', async () => {
      let attempts = 0;
      const executor = createRetryExecutor({ maxRetries: 3 });

      await expect(executor.execute(async () => {
        attempts++;
        throw new NotFoundError('channel');
      })).rejects.toThrow(NotFoundError);

      expect(attempts).toBe(1);
    });
  });

  describe('hooks', () => {
    it('should call onRetry hook', async () => {
      const onRetry = jest.fn();
      const executor = new RetryExecutor(
        { maxRetries: 2, initialBackoffMs: 10, maxBackoffMs: 100, backoffMultiplier: 2, jitterFactor: 0 },
        { onRetry }
      );

      let attempts = 0;
      await executor.execute(async () => {
        attempts++;
        if (attempts < 2) {
          throw new ServerError(500);
        }
        return 'success';
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(ServerError), expect.any(Number));
    });

    it('should call onExhausted hook', async () => {
      const onExhausted = jest.fn();
      const executor = new RetryExecutor(
        { maxRetries: 2, initialBackoffMs: 10, maxBackoffMs: 100, backoffMultiplier: 2, jitterFactor: 0 },
        { onExhausted }
      );

      await expect(executor.execute(async () => {
        throw new ServerError(500);
      })).rejects.toThrow(ServerError);

      expect(onExhausted).toHaveBeenCalledTimes(1);
      expect(onExhausted).toHaveBeenCalledWith(expect.any(ServerError), 3);
    });
  });

  describe('backoff calculation', () => {
    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const executor = new RetryExecutor(
        { maxRetries: 3, initialBackoffMs: 100, maxBackoffMs: 10000, backoffMultiplier: 2, jitterFactor: 0 },
        {
          onRetry: (_attempt, _error, delay) => {
            delays.push(delay);
          },
        }
      );

      try {
        await executor.execute(async () => {
          throw new ServerError(500);
        });
      } catch {
        // Expected
      }

      // 100, 200, 400
      expect(delays).toEqual([100, 200, 400]);
    });

    it('should cap at maxBackoffMs', async () => {
      const delays: number[] = [];
      const executor = new RetryExecutor(
        { maxRetries: 5, initialBackoffMs: 100, maxBackoffMs: 300, backoffMultiplier: 2, jitterFactor: 0 },
        {
          onRetry: (_attempt, _error, delay) => {
            delays.push(delay);
          },
        }
      );

      try {
        await executor.execute(async () => {
          throw new ServerError(500);
        });
      } catch {
        // Expected
      }

      // 100, 200, 300 (capped), 300 (capped), 300 (capped)
      expect(delays).toEqual([100, 200, 300, 300, 300]);
    });
  });
});
