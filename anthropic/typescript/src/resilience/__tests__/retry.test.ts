/**
 * Tests for RetryExecutor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryExecutor, createDefaultRetryConfig } from '../retry.js';
import { AnthropicError } from '../../errors/error.js';
import type { RetryHook } from '../types.js';

describe('RetryExecutor', () => {
  let executor: RetryExecutor;

  beforeEach(() => {
    executor = new RetryExecutor(createDefaultRetryConfig());
  });

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue(42);

      const result = await executor.execute(operation);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const error = new AnthropicError({
        type: 'overloaded_error',
        message: 'Server overloaded',
        status: 529,
        isRetryable: true,
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(42);

      const result = await executor.execute(operation);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const error = new AnthropicError({
        type: 'authentication_error',
        message: 'Invalid API key',
        status: 401,
        isRetryable: false,
      });

      const operation = vi.fn().mockRejectedValue(error);

      await expect(executor.execute(operation)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect max attempts', async () => {
      const config = createDefaultRetryConfig();
      const executorWithLimit = new RetryExecutor({ ...config, maxAttempts: 2 });

      const error = new AnthropicError({
        type: 'server_error',
        message: 'Internal error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn().mockRejectedValue(error);

      await expect(executorWithLimit.execute(operation)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw last error when all retries exhausted', async () => {
      const config = createDefaultRetryConfig();
      const executorWithLimit = new RetryExecutor({ ...config, maxAttempts: 2 });

      const error1 = new AnthropicError({
        type: 'server_error',
        message: 'Error 1',
        status: 500,
        isRetryable: true,
      });

      const error2 = new AnthropicError({
        type: 'server_error',
        message: 'Error 2',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2);

      await expect(executorWithLimit.execute(operation)).rejects.toThrow('Error 2');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('exponential backoff', () => {
    it('should calculate exponential backoff with jitter', async () => {
      const config = {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterFactor: 0.1,
      };
      const executorWithBackoff = new RetryExecutor(config);

      const error = new AnthropicError({
        type: 'server_error',
        message: 'Server error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(42);

      const startTime = Date.now();
      await executorWithBackoff.execute(operation);
      const elapsedTime = Date.now() - startTime;

      // First retry: ~100ms, second retry: ~200ms = ~300ms total minimum
      // With jitter, should be slightly more
      expect(elapsedTime).toBeGreaterThanOrEqual(250);
      expect(elapsedTime).toBeLessThan(500);
    });

    it('should cap delay at maxDelayMs', async () => {
      const config = {
        maxAttempts: 10,
        baseDelayMs: 1000,
        maxDelayMs: 100,
        jitterFactor: 0.1,
      };
      const executorWithCap = new RetryExecutor(config);

      const error = new AnthropicError({
        type: 'server_error',
        message: 'Server error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(42);

      const startTime = Date.now();
      await executorWithCap.execute(operation);
      const elapsedTime = Date.now() - startTime;

      // Should be capped at ~100ms + jitter
      expect(elapsedTime).toBeLessThan(150);
    });
  });

  describe('hooks', () => {
    it('should call retry hook on retry attempts', async () => {
      const hook: RetryHook = {
        onRetry: vi.fn(),
      };

      executor.addHook(hook);

      const error = new AnthropicError({
        type: 'server_error',
        message: 'Server error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(42);

      await executor.execute(operation);

      expect(hook.onRetry).toHaveBeenCalledTimes(1);
      expect(hook.onRetry).toHaveBeenCalledWith(
        1,
        error,
        expect.any(Number)
      );
    });

    it('should call multiple hooks in order', async () => {
      const calls: number[] = [];

      const hook1: RetryHook = {
        onRetry: () => { calls.push(1); },
      };

      const hook2: RetryHook = {
        onRetry: () => { calls.push(2); },
      };

      executor.addHook(hook1);
      executor.addHook(hook2);

      const error = new AnthropicError({
        type: 'server_error',
        message: 'Server error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(42);

      await executor.execute(operation);

      expect(calls).toEqual([1, 2]);
    });

    it('should not call hook on first attempt', async () => {
      const hook: RetryHook = {
        onRetry: vi.fn(),
      };

      executor.addHook(hook);

      const operation = vi.fn().mockResolvedValue(42);

      await executor.execute(operation);

      expect(hook.onRetry).not.toHaveBeenCalled();
    });

    it('should not call hook for non-retryable errors', async () => {
      const hook: RetryHook = {
        onRetry: vi.fn(),
      };

      executor.addHook(hook);

      const error = new AnthropicError({
        type: 'authentication_error',
        message: 'Invalid API key',
        status: 401,
        isRetryable: false,
      });

      const operation = vi.fn().mockRejectedValue(error);

      await expect(executor.execute(operation)).rejects.toThrow();

      expect(hook.onRetry).not.toHaveBeenCalled();
    });
  });

  describe('createDefaultRetryConfig', () => {
    it('should create default configuration', () => {
      const config = createDefaultRetryConfig();

      expect(config).toEqual({
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterFactor: 0.1,
      });
    });
  });

  describe('error handling', () => {
    it('should handle generic errors as non-retryable', async () => {
      const error = new Error('Generic error');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(executor.execute(operation)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should preserve error stack trace', async () => {
      const error = new AnthropicError({
        type: 'server_error',
        message: 'Server error',
        status: 500,
        isRetryable: false,
      });

      const operation = vi.fn().mockRejectedValue(error);

      try {
        await executor.execute(operation);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBe(error);
        expect((e as Error).stack).toBeDefined();
      }
    });
  });
});
