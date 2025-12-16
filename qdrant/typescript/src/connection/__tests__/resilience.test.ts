/**
 * Tests for resilience layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RetryExecutor,
  CircuitBreaker,
  CircuitOpenError,
  isTransientError,
  getRetryConfigForError,
  createDefaultRetryExecutor,
  createDefaultCircuitBreaker,
} from '../resilience.js';

describe('RetryExecutor', () => {
  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const executor = createDefaultRetryExecutor();
      const operation = vi.fn().mockResolvedValue('success');

      const result = await executor.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient errors', async () => {
      const executor = new RetryExecutor({
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterFactor: 0.1,
      });

      const operation = vi
        .fn()
        .mockRejectedValueOnce({ type: 'connection_error', isRetryable: true })
        .mockRejectedValueOnce({ type: 'connection_error', isRetryable: true })
        .mockResolvedValue('success');

      const result = await executor.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const executor = createDefaultRetryExecutor();
      const error = { type: 'invalid_request_error', isRetryable: false };
      const operation = vi.fn().mockRejectedValue(error);

      await expect(executor.execute(operation)).rejects.toEqual(error);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw last error', async () => {
      const executor = new RetryExecutor({
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterFactor: 0.1,
      });

      const error = { type: 'connection_error', isRetryable: true };
      const operation = vi.fn().mockRejectedValue(error);

      await expect(executor.execute(operation)).rejects.toEqual(error);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff with jitter', async () => {
      const executor = new RetryExecutor({
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterFactor: 0.1,
      });

      const operation = vi
        .fn()
        .mockRejectedValueOnce({ type: 'connection_error', isRetryable: true })
        .mockRejectedValueOnce({ type: 'connection_error', isRetryable: true })
        .mockResolvedValue('success');

      const startTime = Date.now();
      await executor.execute(operation);
      const duration = Date.now() - startTime;

      // Should have at least baseDelay + baseDelay*2 = 300ms
      expect(duration).toBeGreaterThanOrEqual(250);
    });
  });

  describe('isRetryable', () => {
    it('should detect retryable errors', () => {
      const executor = createDefaultRetryExecutor();

      expect(executor.isRetryable({ isRetryable: true })).toBe(true);
      expect(executor.isRetryable({ type: 'connection_error' })).toBe(true);
      expect(executor.isRetryable({ type: 'rate_limit_error' })).toBe(true);
      expect(executor.isRetryable({ type: 'timeout_error' })).toBe(true);
    });

    it('should detect non-retryable errors', () => {
      const executor = createDefaultRetryExecutor();

      expect(executor.isRetryable({ isRetryable: false })).toBe(false);
      expect(executor.isRetryable({ type: 'invalid_request_error' })).toBe(false);
      expect(executor.isRetryable(new Error('generic error'))).toBe(false);
      expect(executor.isRetryable('string error')).toBe(false);
    });
  });
});

describe('CircuitBreaker', () => {
  describe('execute', () => {
    it('should execute operation in closed state', async () => {
      const breaker = createDefaultCircuitBreaker();
      const operation = vi.fn().mockResolvedValue('success');

      const result = await breaker.execute(operation);

      expect(result).toBe('success');
      expect(breaker.getState()).toBe('closed');
    });

    it('should open circuit after threshold failures', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 1000,
      });

      const operation = vi.fn().mockRejectedValue(new Error('failure'));

      // Fail 3 times to open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow('failure');
      }

      expect(breaker.getState()).toBe('open');

      // Next call should fail fast with CircuitOpenError
      await expect(breaker.execute(operation)).rejects.toThrow(CircuitOpenError);
    });

    it('should transition to half-open after timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        openDurationMs: 50,
      });

      const operation = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      expect(breaker.getState()).toBe('open');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Should transition to half-open
      const successOp = vi.fn().mockResolvedValue('success');
      await breaker.execute(successOp);

      expect(breaker.getState()).toBe('half_open');
    });

    it('should close circuit after success threshold in half-open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        openDurationMs: 50,
      });

      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      const successOp = vi.fn().mockResolvedValue('success');

      // Open the circuit
      await expect(breaker.execute(failOp)).rejects.toThrow('failure');
      await expect(breaker.execute(failOp)).rejects.toThrow('failure');
      expect(breaker.getState()).toBe('open');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Execute successes to close circuit
      await breaker.execute(successOp);
      await breaker.execute(successOp);

      expect(breaker.getState()).toBe('closed');
    });

    it('should reopen circuit on failure in half-open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        openDurationMs: 50,
      });

      const failOp = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      await expect(breaker.execute(failOp)).rejects.toThrow('failure');
      await expect(breaker.execute(failOp)).rejects.toThrow('failure');
      expect(breaker.getState()).toBe('open');

      // Wait for timeout to transition to half-open
      await new Promise(resolve => setTimeout(resolve, 60));

      // Fail in half-open state should reopen circuit
      await expect(breaker.execute(failOp)).rejects.toThrow('failure');
      expect(breaker.getState()).toBe('open');
    });

    it('should reset failure count on success in closed state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 1000,
      });

      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      const successOp = vi.fn().mockResolvedValue('success');

      // Fail twice
      await expect(breaker.execute(failOp)).rejects.toThrow('failure');
      await expect(breaker.execute(failOp)).rejects.toThrow('failure');

      // Success should reset counter
      await breaker.execute(successOp);

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      const config = {
        failureThreshold: 5,
        successThreshold: 2,
        openDurationMs: 30000,
      };
      const breaker = new CircuitBreaker(config);

      const stats = breaker.getStats();

      expect(stats.state).toBe('closed');
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.lastFailureTime).toBeUndefined();
      expect(stats.config).toEqual(config);
      expect(stats.timeUntilHalfOpen).toBeUndefined();
    });

    it('should calculate time until half-open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        openDurationMs: 5000,
      });

      const operation = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      await expect(breaker.execute(operation)).rejects.toThrow('failure');

      const stats = breaker.getStats();
      expect(stats.state).toBe('open');
      expect(stats.timeUntilHalfOpen).toBeDefined();
      expect(stats.timeUntilHalfOpen).toBeLessThanOrEqual(5000);
      expect(stats.timeUntilHalfOpen).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset circuit to closed state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        openDurationMs: 1000,
      });

      const operation = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      expect(breaker.getState()).toBe('open');

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.lastFailureTime).toBeUndefined();
    });
  });
});

describe('isTransientError', () => {
  it('should identify transient errors', () => {
    expect(isTransientError('connection_error')).toBe(true);
    expect(isTransientError('connection_timeout')).toBe(true);
    expect(isTransientError('rate_limit_error')).toBe(true);
    expect(isTransientError('service_unavailable')).toBe(true);
    expect(isTransientError('timeout_error')).toBe(true);
    expect(isTransientError('search_timeout')).toBe(true);
    expect(isTransientError('internal_error')).toBe(true);
    expect(isTransientError('network_error')).toBe(true);
  });

  it('should identify non-transient errors', () => {
    expect(isTransientError('invalid_request_error')).toBe(false);
    expect(isTransientError('authentication_error')).toBe(false);
    expect(isTransientError('not_found_error')).toBe(false);
    expect(isTransientError('collection_not_found')).toBe(false);
    expect(isTransientError('invalid_vector')).toBe(false);
  });
});

describe('getRetryConfigForError', () => {
  it('should return config for connection errors', () => {
    const config = getRetryConfigForError('connection_error');

    expect(config.maxAttempts).toBe(3);
    expect(config.baseDelayMs).toBe(100);
    expect(config.maxDelayMs).toBe(5000);
    expect(config.jitterFactor).toBe(0.1);
  });

  it('should return config for rate limit errors', () => {
    const config = getRetryConfigForError('rate_limit_error');

    expect(config.maxAttempts).toBe(5);
    expect(config.baseDelayMs).toBe(500);
    expect(config.maxDelayMs).toBe(30000);
    expect(config.jitterFactor).toBe(0.1);
  });

  it('should return config for service unavailable errors', () => {
    const config = getRetryConfigForError('service_unavailable');

    expect(config.maxAttempts).toBe(3);
    expect(config.baseDelayMs).toBe(1000);
    expect(config.maxDelayMs).toBe(10000);
    expect(config.jitterFactor).toBe(0.1);
  });

  it('should return config for timeout errors (linear backoff)', () => {
    const config = getRetryConfigForError('timeout_error');

    expect(config.maxAttempts).toBe(2);
    expect(config.baseDelayMs).toBe(1000);
    expect(config.maxDelayMs).toBe(2000);
    expect(config.jitterFactor).toBe(0.0); // Linear backoff
  });

  it('should return default config for unknown errors', () => {
    const config = getRetryConfigForError('unknown_error');

    expect(config.maxAttempts).toBe(3);
    expect(config.baseDelayMs).toBe(100);
    expect(config.maxDelayMs).toBe(5000);
    expect(config.jitterFactor).toBe(0.1);
  });
});
