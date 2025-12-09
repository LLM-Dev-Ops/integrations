/**
 * Tests for RateLimiter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RateLimiter,
  createDefaultRateLimiterConfig,
} from '../rate-limiter.js';
import type { RateLimitHook } from '../types.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(createDefaultRateLimiterConfig());
  });

  describe('acquire', () => {
    it('should allow requests up to burst size', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 1,
        burstSize: 5,
      });

      // Should allow 5 requests immediately
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      // All should complete without delay
      expect(limiter.getAvailableTokens()).toBeCloseTo(0, 0);
    });

    it('should wait when no tokens available', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 1,
      });

      // First request should succeed immediately
      const start = Date.now();
      await limiter.acquire();

      // Second request should wait
      await limiter.acquire();
      const elapsed = Date.now() - start;

      // Should wait ~100ms (1/10 requests per second)
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(elapsed).toBeLessThan(200);
    });

    it('should refill tokens over time', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 5,
      });

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      expect(limiter.getAvailableTokens()).toBeCloseTo(0, 0);

      // Wait for refill (200ms = 2 tokens at 10/sec)
      await new Promise(resolve => setTimeout(resolve, 200));

      const availableTokens = limiter.getAvailableTokens();
      expect(availableTokens).toBeGreaterThanOrEqual(1.8);
      expect(availableTokens).toBeLessThanOrEqual(2.2);
    });

    it('should not exceed burst size when refilling', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 5,
      });

      // Wait for more than burst duration
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should cap at burst size
      const availableTokens = limiter.getAvailableTokens();
      expect(availableTokens).toBeLessThanOrEqual(5);
    });
  });

  describe('getAvailableTokens', () => {
    it('should return initial burst size', () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 20,
      });

      expect(limiter.getAvailableTokens()).toBe(20);
    });

    it('should decrease after acquire', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 10,
      });

      await limiter.acquire();

      expect(limiter.getAvailableTokens()).toBeCloseTo(9, 0);
    });

    it('should increase over time', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 10,
      });

      // Consume 5 tokens
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      const before = limiter.getAvailableTokens();
      expect(before).toBeCloseTo(5, 0);

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 100));

      const after = limiter.getAvailableTokens();
      expect(after).toBeGreaterThan(before);
      expect(after).toBeCloseTo(6, 0);
    });
  });

  describe('reset', () => {
    it('should reset tokens to burst size', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 5,
      });

      // Consume tokens
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      expect(limiter.getAvailableTokens()).toBeCloseTo(0, 0);

      // Reset
      limiter.reset();

      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it('should allow immediate requests after reset', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 1,
      });

      // Consume token
      await limiter.acquire();

      // Reset
      limiter.reset();

      // Should succeed immediately
      const start = Date.now();
      await limiter.acquire();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('hooks', () => {
    it('should call hook when rate limited', async () => {
      const hook: RateLimitHook = {
        onRateLimited: vi.fn(),
      };

      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 1,
      });
      limiter.addHook(hook);

      // First request succeeds
      await limiter.acquire();

      // Second request is rate limited
      await limiter.acquire();

      expect(hook.onRateLimited).toHaveBeenCalledTimes(1);
      expect(hook.onRateLimited).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should call multiple hooks', async () => {
      const calls: number[] = [];

      const hook1: RateLimitHook = {
        onRateLimited: () => { calls.push(1); },
      };

      const hook2: RateLimitHook = {
        onRateLimited: () => { calls.push(2); },
      };

      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 1,
      });
      limiter.addHook(hook1);
      limiter.addHook(hook2);

      // First request succeeds
      await limiter.acquire();

      // Second request is rate limited
      await limiter.acquire();

      expect(calls).toEqual([1, 2]);
    });

    it('should not call hook when tokens available', async () => {
      const hook: RateLimitHook = {
        onRateLimited: vi.fn(),
      };

      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 5,
      });
      limiter.addHook(hook);

      // All requests succeed without rate limiting
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      expect(hook.onRateLimited).not.toHaveBeenCalled();
    });

    it('should provide correct wait time to hook', async () => {
      const hook: RateLimitHook = {
        onRateLimited: vi.fn(),
      };

      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 1,
      });
      limiter.addHook(hook);

      // First request succeeds
      await limiter.acquire();

      // Second request is rate limited
      await limiter.acquire();

      // Wait time should be ~100ms (1/10 sec)
      const waitTime = (hook.onRateLimited as any).mock.calls[0][0];
      expect(waitTime).toBeGreaterThanOrEqual(80);
      expect(waitTime).toBeLessThanOrEqual(120);
    });
  });

  describe('token bucket algorithm', () => {
    it('should implement smooth rate limiting', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 5,
        burstSize: 2,
      });

      const timestamps: number[] = [];

      // Make 4 requests
      for (let i = 0; i < 4; i++) {
        await limiter.acquire();
        timestamps.push(Date.now());
      }

      // First two should be immediate (burst)
      const burstDuration = timestamps[1] - timestamps[0];
      expect(burstDuration).toBeLessThan(50);

      // Next requests should be spaced ~200ms apart (1/5 sec)
      const spacing1 = timestamps[2] - timestamps[1];
      const spacing2 = timestamps[3] - timestamps[2];

      expect(spacing1).toBeGreaterThanOrEqual(150);
      expect(spacing1).toBeLessThanOrEqual(250);
      expect(spacing2).toBeGreaterThanOrEqual(150);
      expect(spacing2).toBeLessThanOrEqual(250);
    });

    it('should handle fractional tokens', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 3,
        burstSize: 1,
      });

      // Consume token
      await limiter.acquire();

      // Wait for partial refill
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have ~0.6 tokens
      const tokens = limiter.getAvailableTokens();
      expect(tokens).toBeGreaterThan(0.5);
      expect(tokens).toBeLessThan(0.7);
    });
  });

  describe('concurrent requests', () => {
    it('should handle concurrent acquire calls', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 5,
        burstSize: 2,
      });

      // Launch 4 concurrent requests
      const promises = Array.from({ length: 4 }, () => limiter.acquire());

      const start = Date.now();
      await Promise.all(promises);
      const elapsed = Date.now() - start;

      // Should take time to process all (first 2 immediate, next 2 delayed)
      // Allow some variance for timing
      expect(elapsed).toBeGreaterThanOrEqual(200);
    });
  });

  describe('createDefaultRateLimiterConfig', () => {
    it('should create default configuration', () => {
      const config = createDefaultRateLimiterConfig();

      expect(config).toEqual({
        requestsPerSecond: 10,
        burstSize: 20,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very low rate limits', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 0.5,
        burstSize: 1,
      });

      const start = Date.now();

      await limiter.acquire();
      await limiter.acquire();

      const elapsed = Date.now() - start;

      // Should wait ~2 seconds for second request
      expect(elapsed).toBeGreaterThanOrEqual(1800);
      expect(elapsed).toBeLessThan(2200);
    });

    it('should handle very high rate limits', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 1000,
        burstSize: 100,
      });

      const start = Date.now();

      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        await limiter.acquire();
      }

      const elapsed = Date.now() - start;

      // Should complete very quickly (burst allows all)
      expect(elapsed).toBeLessThan(200);
    });

    it('should handle zero available tokens correctly', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 10,
        burstSize: 1,
      });

      // Consume all tokens
      await limiter.acquire();

      expect(limiter.getAvailableTokens()).toBeCloseTo(0, 1);

      // Should still work
      await limiter.acquire();
      expect(limiter.getAvailableTokens()).toBeCloseTo(0, 1);
    });
  });
});
