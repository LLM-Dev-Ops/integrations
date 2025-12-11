/**
 * Resilience patterns tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RetryExecutor,
  CircuitBreaker,
  CircuitBreakerOpenError,
  RateLimiter,
  ResilienceOrchestrator,
  CircuitState,
} from '../src/resilience/index.js';

describe('RetryExecutor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should succeed on first attempt', async () => {
    const executor = new RetryExecutor({
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      multiplier: 2,
      jitter: 0,
    });

    const operation = vi.fn().mockResolvedValue('success');
    const isRetryable = () => true;

    const result = await executor.execute(operation, isRetryable);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const executor = new RetryExecutor({
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      multiplier: 2,
      jitter: 0,
    });

    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const isRetryable = () => true;

    const promise = executor.execute(operation, isRetryable);

    // Advance through retry delays
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable errors', async () => {
    const executor = new RetryExecutor({
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      multiplier: 2,
      jitter: 0,
    });

    const operation = vi.fn().mockRejectedValue(new Error('Non-retryable'));
    const isRetryable = () => false;

    await expect(executor.execute(operation, isRetryable)).rejects.toThrow('Non-retryable');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should respect max attempts', async () => {
    const executor = new RetryExecutor({
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      multiplier: 2,
      jitter: 0,
    });

    const operation = vi.fn().mockRejectedValue(new Error('Always fails'));
    const isRetryable = () => true;

    const promise = executor.execute(operation, isRetryable);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toThrow('Always fails');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const executor = new RetryExecutor({
      maxAttempts: 4,
      initialDelay: 100,
      maxDelay: 10000,
      multiplier: 2,
      jitter: 0,
    });

    const operation = vi.fn().mockRejectedValue(new Error('Fail'));
    const isRetryable = () => true;

    const promise = executor.execute(operation, isRetryable);

    // First retry: 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(operation).toHaveBeenCalledTimes(2);

    // Second retry: 200ms
    await vi.advanceTimersByTimeAsync(200);
    expect(operation).toHaveBeenCalledTimes(3);

    // Third retry: 400ms
    await vi.advanceTimersByTimeAsync(400);
    expect(operation).toHaveBeenCalledTimes(4);

    await expect(promise).rejects.toThrow('Fail');
  });

  it('should respect retry-after header', async () => {
    const executor = new RetryExecutor({
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      multiplier: 2,
      jitter: 0,
    });

    const operation = vi.fn().mockRejectedValue(new Error('Rate limited'));
    const isRetryable = () => true;
    const getRetryAfter = () => 5; // 5 seconds

    const promise = executor.execute(operation, isRetryable, getRetryAfter);

    // Should wait 5000ms (5 seconds from retry-after)
    await vi.advanceTimersByTimeAsync(5000);
    expect(operation).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000);
    expect(operation).toHaveBeenCalledTimes(3);

    await expect(promise).rejects.toThrow('Rate limited');
  });
});

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      openDuration: 1000,
      halfOpenMaxRequests: 1,
    });

    expect(breaker.getState()).toBe(CircuitState.Closed);
  });

  it('should execute operation in closed state', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      openDuration: 1000,
      halfOpenMaxRequests: 1,
    });

    const result = await breaker.execute(async () => 'success');

    expect(result).toBe('success');
    expect(breaker.getState()).toBe(CircuitState.Closed);
  });

  it('should open circuit after threshold failures', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      openDuration: 1000,
      halfOpenMaxRequests: 1,
    });

    // Fail 3 times to reach threshold
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('Fail');
        });
      } catch {
        // Expected
      }
    }

    expect(breaker.getState()).toBe(CircuitState.Open);
  });

  it('should reject requests when circuit is open', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      openDuration: 1000,
      halfOpenMaxRequests: 1,
    });

    // Open the circuit
    try {
      await breaker.execute(async () => {
        throw new Error('Fail');
      });
    } catch {
      // Expected
    }

    expect(breaker.getState()).toBe(CircuitState.Open);

    // Should reject immediately
    await expect(breaker.execute(async () => 'success')).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('should transition to half-open after open duration', async () => {
    vi.useFakeTimers();

    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      openDuration: 1000,
      halfOpenMaxRequests: 1,
    });

    // Open the circuit
    try {
      await breaker.execute(async () => {
        throw new Error('Fail');
      });
    } catch {
      // Expected
    }

    expect(breaker.getState()).toBe(CircuitState.Open);

    // Advance time past open duration
    vi.advanceTimersByTime(1001);

    expect(breaker.getState()).toBe(CircuitState.HalfOpen);

    vi.useRealTimers();
  });

  it('should close circuit after successful requests in half-open state', async () => {
    vi.useFakeTimers();

    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      openDuration: 1000,
      halfOpenMaxRequests: 1,
    });

    // Open the circuit
    try {
      await breaker.execute(async () => {
        throw new Error('Fail');
      });
    } catch {
      // Expected
    }

    // Wait for half-open
    vi.advanceTimersByTime(1001);

    // Succeed twice to close
    await breaker.execute(async () => 'success1');
    vi.advanceTimersByTime(1001);
    await breaker.execute(async () => 'success2');

    expect(breaker.getState()).toBe(CircuitState.Closed);

    vi.useRealTimers();
  });

  it('should reset failure count on success in closed state', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      openDuration: 1000,
      halfOpenMaxRequests: 1,
    });

    // Fail twice
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('Fail');
        });
      } catch {
        // Expected
      }
    }

    // Succeed (should reset failure count)
    await breaker.execute(async () => 'success');

    // Fail twice more (shouldn't open because count was reset)
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('Fail');
        });
      } catch {
        // Expected
      }
    }

    expect(breaker.getState()).toBe(CircuitState.Closed);
  });

  it('should provide metrics', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      openDuration: 1000,
      halfOpenMaxRequests: 1,
    });

    // Execute some operations
    await breaker.execute(async () => 'success');

    try {
      await breaker.execute(async () => {
        throw new Error('Fail');
      });
    } catch {
      // Expected
    }

    const metrics = breaker.getMetrics();
    expect(metrics.state).toBe(CircuitState.Closed);
    expect(metrics.failureCount).toBe(1);
  });
});

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests within limit', async () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 10,
    });

    // Should allow 10 requests
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }

    const state = limiter.getState();
    expect(state.requestTokens).toBe(0);
  });

  it('should block requests exceeding limit', async () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 5,
    });

    // Use all tokens
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    // Next request should wait
    const promise = limiter.acquire();

    // Advance to refill
    await vi.advanceTimersByTimeAsync(60000);

    await promise;

    const state = limiter.getState();
    expect(state.requestTokens).toBe(4); // 5 - 1 = 4
  });

  it('should refill tokens after one minute', async () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 10,
    });

    // Use some tokens
    await limiter.acquire();
    await limiter.acquire();

    let state = limiter.getState();
    expect(state.requestTokens).toBe(8);

    // Advance one minute
    vi.advanceTimersByTime(60000);

    state = limiter.getState();
    expect(state.requestTokens).toBe(10); // Refilled
  });

  it('should handle token budget when specified', async () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      tokensPerMinute: 1000,
    });

    // Request with token estimate
    await limiter.acquire(500);

    const state = limiter.getState();
    expect(state.tokenBudget).toBe(500);
  });

  it('should wait for token budget refill', async () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      tokensPerMinute: 1000,
    });

    // Use all tokens
    await limiter.acquire(1000);

    const state1 = limiter.getState();
    expect(state1.tokenBudget).toBe(0);

    // Next request should wait
    const promise = limiter.acquire(100);

    await vi.advanceTimersByTimeAsync(60000);

    await promise;

    const state2 = limiter.getState();
    expect(state2.tokenBudget).toBe(900);
  });

  it('should reset to initial state', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 10,
      tokensPerMinute: 1000,
    });

    // Use some tokens
    limiter.acquire();
    limiter.acquire(500);

    limiter.reset();

    const state = limiter.getState();
    expect(state.requestTokens).toBe(10);
    expect(state.tokenBudget).toBe(1000);
  });
});

describe('ResilienceOrchestrator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute operation successfully', async () => {
    const orchestrator = new ResilienceOrchestrator({
      retry: {
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        multiplier: 2,
        jitter: 0,
      },
      circuitBreaker: {
        failureThreshold: 5,
        successThreshold: 2,
        openDuration: 1000,
        halfOpenMaxRequests: 1,
      },
      rateLimit: {
        requestsPerMinute: 60,
      },
    });

    const result = await orchestrator.execute(async () => 'success');

    expect(result).toBe('success');
  });

  it('should retry failed operations', async () => {
    const orchestrator = new ResilienceOrchestrator({
      retry: {
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        multiplier: 2,
        jitter: 0,
      },
      circuitBreaker: {
        failureThreshold: 10,
        successThreshold: 2,
        openDuration: 1000,
        halfOpenMaxRequests: 1,
      },
      rateLimit: {
        requestsPerMinute: 60,
      },
    });

    // Create a proper GeminiError for retryable failure
    const error = new (class extends Error {
      isRetryable = true;
      constructor() {
        super('Fail 1');
      }
    })();

    const operation = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = orchestrator.execute(operation);

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should open circuit after multiple failures', async () => {
    const orchestrator = new ResilienceOrchestrator({
      retry: {
        maxAttempts: 1,
        initialDelay: 100,
        maxDelay: 1000,
        multiplier: 2,
        jitter: 0,
      },
      circuitBreaker: {
        failureThreshold: 2,
        successThreshold: 2,
        openDuration: 1000,
        halfOpenMaxRequests: 1,
      },
      rateLimit: {
        requestsPerMinute: 60,
      },
    });

    const error = new Error('Fail');
    (error as any).isRetryable = false;

    // Fail twice to open circuit
    for (let i = 0; i < 2; i++) {
      try {
        await orchestrator.execute(async () => {
          throw error;
        });
      } catch {
        // Expected
      }
    }

    // Next request should be rejected by circuit breaker
    await expect(
      orchestrator.execute(async () => 'success')
    ).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('should respect rate limits', async () => {
    const orchestrator = new ResilienceOrchestrator({
      retry: {
        maxAttempts: 1,
        initialDelay: 100,
        maxDelay: 1000,
        multiplier: 2,
        jitter: 0,
      },
      circuitBreaker: {
        failureThreshold: 10,
        successThreshold: 2,
        openDuration: 1000,
        halfOpenMaxRequests: 1,
      },
      rateLimit: {
        requestsPerMinute: 2,
      },
    });

    // Use up rate limit
    await orchestrator.execute(async () => 'success1');
    await orchestrator.execute(async () => 'success2');

    // Next request should wait
    const promise = orchestrator.execute(async () => 'success3');

    await vi.advanceTimersByTimeAsync(60000);

    const result = await promise;
    expect(result).toBe('success3');
  });
});
