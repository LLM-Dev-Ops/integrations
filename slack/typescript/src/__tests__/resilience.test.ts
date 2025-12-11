/**
 * Tests for resilience utilities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  retry,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  isRetryableError,
  calculateDelay,
} from '../resilience/retry';
import {
  CircuitBreaker,
  CircuitOpenError,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from '../resilience/circuit-breaker';
import {
  RateLimiter,
  TokenBucket,
  SlidingWindowLimiter,
  TIER_LIMITS,
} from '../resilience/rate-limiter';
import { RateLimitError, NetworkError, ServerError } from '../errors';

describe('Retry', () => {
  describe('isRetryableError', () => {
    it('should identify RateLimitError as retryable', () => {
      const error = new RateLimitError('Rate limited', 60);
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify NetworkError as retryable', () => {
      const error = new NetworkError('Connection failed');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify ServerError as retryable', () => {
      const error = new ServerError('Internal server error');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should not identify generic Error as retryable', () => {
      const error = new Error('Some error');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    it('should calculate exponential backoff', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, jitterFactor: 0 };

      expect(calculateDelay(0, config)).toBe(1000);
      expect(calculateDelay(1, config)).toBe(2000);
      expect(calculateDelay(2, config)).toBe(4000);
    });

    it('should cap delay at maxDelayMs', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, jitterFactor: 0, maxDelayMs: 5000 };

      expect(calculateDelay(10, config)).toBe(5000);
    });

    it('should use rate limit retry-after when provided', () => {
      expect(calculateDelay(0, DEFAULT_RETRY_CONFIG, 30)).toBe(30000);
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retry(fn);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('Failed'))
        .mockResolvedValue('success');

      const result = await retry(fn, { maxRetries: 3, initialDelayMs: 10 });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(2);
    });

    it('should not retry on non-retryable error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Not retryable'));

      const result = await retry(fn, { maxRetries: 3 });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it('should give up after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new NetworkError('Always fails'));

      const result = await retry(fn, { maxRetries: 2, initialDelayMs: 10 });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
    });
  });
});

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100,
    });
  });

  describe('state transitions', () => {
    it('should start in closed state', () => {
      expect(cb.getState()).toBe('closed');
    });

    it('should open after failure threshold', () => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();

      expect(cb.getState()).toBe('open');
    });

    it('should transition to half-open after timeout', async () => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('open');

      await new Promise((r) => setTimeout(r, 150));

      expect(cb.getState()).toBe('half_open');
    });

    it('should close after successes in half-open', async () => {
      // Open the circuit
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();

      // Wait for half-open
      await new Promise((r) => setTimeout(r, 150));
      expect(cb.getState()).toBe('half_open');

      // Record successes
      cb.recordSuccess();
      cb.recordSuccess();

      expect(cb.getState()).toBe('closed');
    });

    it('should reopen on failure in half-open', async () => {
      // Open the circuit
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();

      // Wait for half-open
      await new Promise((r) => setTimeout(r, 150));
      expect(cb.getState()).toBe('half_open');

      // Record failure
      cb.recordFailure();

      expect(cb.getState()).toBe('open');
    });
  });

  describe('execute', () => {
    it('should execute function when closed', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await cb.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should throw CircuitOpenError when open', async () => {
      cb.open();

      await expect(cb.execute(() => Promise.resolve('test'))).rejects.toThrow(
        CircuitOpenError
      );
    });

    it('should record success on successful execution', async () => {
      await cb.execute(() => Promise.resolve('test'));

      const metrics = cb.getMetrics();
      expect(metrics.successCount).toBe(1);
    });

    it('should record failure on failed execution', async () => {
      try {
        await cb.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // Expected
      }

      const metrics = cb.getMetrics();
      expect(metrics.failureCount).toBe(1);
    });
  });

  describe('metrics', () => {
    it('should track failure rate', () => {
      cb.recordSuccess();
      cb.recordSuccess();
      cb.recordFailure();
      cb.recordFailure();

      const metrics = cb.getMetrics();
      expect(metrics.failureRate).toBe(0.5);
    });
  });
});

describe('RateLimiter', () => {
  describe('TokenBucket', () => {
    it('should allow consumption when tokens available', () => {
      const bucket = new TokenBucket(10, 1);

      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.getAvailableTokens()).toBeCloseTo(9, 0);
    });

    it('should deny consumption when empty', () => {
      const bucket = new TokenBucket(2, 0.001);
      bucket.tryConsume();
      bucket.tryConsume();

      expect(bucket.tryConsume()).toBe(false);
    });

    it('should refill over time', async () => {
      const bucket = new TokenBucket(10, 100); // 100 tokens per second
      bucket.tryConsume(5);

      await new Promise((r) => setTimeout(r, 60));

      expect(bucket.getAvailableTokens()).toBeGreaterThan(5);
    });
  });

  describe('SlidingWindowLimiter', () => {
    it('should allow requests within limit', () => {
      const limiter = new SlidingWindowLimiter(5, 1000);

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.getRemainingRequests()).toBe(3);
    });

    it('should deny requests over limit', () => {
      const limiter = new SlidingWindowLimiter(2, 1000);
      limiter.tryAcquire();
      limiter.tryAcquire();

      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should allow requests after window expires', async () => {
      const limiter = new SlidingWindowLimiter(1, 50);
      limiter.tryAcquire();
      expect(limiter.tryAcquire()).toBe(false);

      await new Promise((r) => setTimeout(r, 60));

      expect(limiter.tryAcquire()).toBe(true);
    });
  });

  describe('RateLimiter', () => {
    it('should rate limit by endpoint', () => {
      const limiter = new RateLimiter('tier1');

      expect(limiter.isAllowed('test.endpoint')).toBe(true);
      expect(limiter.isAllowed('test.endpoint')).toBe(false);
    });

    it('should track different endpoints separately', () => {
      const limiter = new RateLimiter('tier1');

      expect(limiter.isAllowed('endpoint1')).toBe(true);
      expect(limiter.isAllowed('endpoint2')).toBe(true);
    });

    it('should reset limiter', () => {
      const limiter = new RateLimiter('tier1');
      limiter.isAllowed('test');

      limiter.reset('test');

      expect(limiter.isAllowed('test')).toBe(true);
    });
  });
});
