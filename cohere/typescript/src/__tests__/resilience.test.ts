/**
 * Tests for resilience patterns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RetryExecutor,
  CircuitBreaker,
  CircuitState,
  RateLimiter,
  ResilienceOrchestrator,
  CohereCircuitOpenError,
} from '../resilience';
import { RateLimitError, ServerError } from '../errors';

describe('RetryExecutor', () => {
  it('should succeed on first attempt', async () => {
    const executor = new RetryExecutor({ maxAttempts: 3 });
    const fn = vi.fn().mockResolvedValue('success');

    const result = await executor.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const executor = new RetryExecutor({
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ServerError('Server error'))
      .mockRejectedValueOnce(new ServerError('Server error'))
      .mockResolvedValue('success');

    const result = await executor.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable errors', async () => {
    const executor = new RetryExecutor({ maxAttempts: 3 });

    const error = new Error('Non-retryable');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(executor.execute(fn)).rejects.toThrow('Non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should exhaust retries and throw', async () => {
    const executor = new RetryExecutor({
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    const fn = vi.fn().mockRejectedValue(new ServerError('Server error'));

    await expect(executor.execute(fn)).rejects.toThrow(ServerError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect retry-after header', async () => {
    const executor = new RetryExecutor({
      maxAttempts: 2,
      initialDelayMs: 10,
    });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('Rate limited', 0.01))
      .mockResolvedValue('success');

    const start = Date.now();
    await executor.execute(fn);
    const elapsed = Date.now() - start;

    // Should have waited approximately 10ms (0.01 * 1000)
    expect(elapsed).toBeGreaterThanOrEqual(5);
  });

  it('should call retry hooks', async () => {
    const hook = vi.fn();
    const executor = new RetryExecutor({
      maxAttempts: 2,
      initialDelayMs: 10,
    }).addHook(hook);

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ServerError('Error'))
      .mockResolvedValue('success');

    await executor.execute(fn);

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        maxAttempts: 2,
      })
    );
  });
});

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.getState()).toBe(CircuitState.Closed);
  });

  it('should allow requests in closed state', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.canExecute()).toBe(true);
  });

  it('should open after failure threshold', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      monitoringWindowMs: 10000,
    });

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.Closed);

    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.Open);
  });

  it('should block requests in open state', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });

    breaker.recordFailure();
    expect(breaker.canExecute()).toBe(false);
  });

  it('should transition to half-open after reset timeout', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10,
    });

    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.Open);

    await new Promise((r) => setTimeout(r, 20));
    expect(breaker.getState()).toBe(CircuitState.HalfOpen);
  });

  it('should close after success threshold in half-open', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      resetTimeoutMs: 10,
    });

    breaker.recordFailure();
    await new Promise((r) => setTimeout(r, 20));

    expect(breaker.getState()).toBe(CircuitState.HalfOpen);

    breaker.recordSuccess();
    expect(breaker.getState()).toBe(CircuitState.HalfOpen);

    breaker.recordSuccess();
    expect(breaker.getState()).toBe(CircuitState.Closed);
  });

  it('should reopen on failure in half-open', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10,
    });

    breaker.recordFailure();
    await new Promise((r) => setTimeout(r, 20));

    expect(breaker.getState()).toBe(CircuitState.HalfOpen);

    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.Open);
  });
});

describe('RateLimiter', () => {
  it('should allow requests under limit', () => {
    const limiter = new RateLimiter({ maxRequests: 10, windowMs: 1000 });

    for (let i = 0; i < 10; i++) {
      expect(limiter.canProceed()).toBe(true);
    }
  });

  it('should acquire tokens', async () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

    await limiter.acquire();
    expect(limiter.getTokens()).toBe(1);

    await limiter.acquire();
    expect(limiter.getTokens()).toBe(0);
  });

  it('should throw when rate limited without queuing', async () => {
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 10000,
      queueRequests: false,
    });

    await limiter.acquire();
    await expect(limiter.acquire()).rejects.toThrow(RateLimitError);
  });

  it('should refill tokens over time', async () => {
    const limiter = new RateLimiter({
      maxRequests: 10,
      windowMs: 100,
    });

    // Drain all tokens
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }

    expect(limiter.getTokens()).toBe(0);

    // Wait for refill
    await new Promise((r) => setTimeout(r, 150));
    expect(limiter.getTokens()).toBe(10);
  });
});

describe('ResilienceOrchestrator', () => {
  it('should combine all patterns', async () => {
    const orchestrator = new ResilienceOrchestrator({
      retry: { maxAttempts: 2, initialDelayMs: 10 },
      circuitBreaker: { failureThreshold: 5 },
      rateLimiter: { maxRequests: 100, windowMs: 1000 },
    });

    const fn = vi.fn().mockResolvedValue('success');
    const result = await orchestrator.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry through orchestrator', async () => {
    const orchestrator = new ResilienceOrchestrator({
      retry: { maxAttempts: 3, initialDelayMs: 10 },
    });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ServerError('Error'))
      .mockResolvedValue('success');

    const result = await orchestrator.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should block when circuit is open', async () => {
    const orchestrator = new ResilienceOrchestrator({
      circuitBreaker: { failureThreshold: 1 },
    });

    // Force circuit open
    orchestrator.getCircuitBreaker().recordFailure();

    await expect(orchestrator.execute(() => Promise.resolve('test'))).rejects.toThrow(
      CohereCircuitOpenError
    );
  });
});
