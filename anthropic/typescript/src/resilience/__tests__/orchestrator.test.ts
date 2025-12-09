/**
 * Tests for ResilienceOrchestrator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DefaultResilienceOrchestrator,
  PassthroughResilienceOrchestrator,
  createDefaultResilienceConfig,
} from '../orchestrator.js';
import { AnthropicError } from '../../errors/error.js';
import { CircuitOpenError } from '../circuit-breaker.js';

describe('DefaultResilienceOrchestrator', () => {
  let orchestrator: DefaultResilienceOrchestrator;

  beforeEach(() => {
    orchestrator = DefaultResilienceOrchestrator.create();
  });

  describe('execute', () => {
    it('should execute operation successfully', async () => {
      const operation = vi.fn().mockResolvedValue(42);

      const result = await orchestrator.execute(operation);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const error = new AnthropicError({
        type: 'server_error',
        message: 'Internal server error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(42);

      const result = await orchestrator.execute(operation);

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

      await expect(orchestrator.execute(operation)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect rate limits', async () => {
      const config = createDefaultResilienceConfig();
      const orch = DefaultResilienceOrchestrator.create({
        ...config,
        rateLimiter: {
          requestsPerSecond: 10,
          burstSize: 2,
        },
      });

      const operation = vi.fn().mockResolvedValue(42);

      // First two should succeed immediately
      await orch.execute(operation);
      await orch.execute(operation);

      // Third should be rate limited
      const start = Date.now();
      await orch.execute(operation);
      const elapsed = Date.now() - start;

      // Should wait ~100ms
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should open circuit breaker after failures', async () => {
      const config = createDefaultResilienceConfig();
      const orch = DefaultResilienceOrchestrator.create({
        ...config,
        retry: {
          maxAttempts: 1,
          baseDelayMs: 100,
          maxDelayMs: 1000,
          jitterFactor: 0.1,
        },
        circuitBreaker: {
          failureThreshold: 2,
          successThreshold: 2,
          openDurationMs: 1000,
        },
      });

      const error = new AnthropicError({
        type: 'server_error',
        message: 'Server error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn().mockRejectedValue(error);

      // First two failures should open circuit
      await expect(orch.execute(operation)).rejects.toThrow(error);
      await expect(orch.execute(operation)).rejects.toThrow(error);

      // Next request should fail fast with CircuitOpenError
      await expect(orch.execute(operation)).rejects.toThrow(CircuitOpenError);

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should coordinate all resilience patterns', async () => {
      const config = createDefaultResilienceConfig();
      const orch = DefaultResilienceOrchestrator.create({
        retry: {
          maxAttempts: 2,
          baseDelayMs: 50,
          maxDelayMs: 100,
          jitterFactor: 0.1,
        },
        circuitBreaker: {
          failureThreshold: 10,
          successThreshold: 2,
          openDurationMs: 1000,
        },
        rateLimiter: {
          requestsPerSecond: 5,
          burstSize: 1,
        },
      });

      const error = new AnthropicError({
        type: 'server_error',
        message: 'Server error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(42);

      const start = Date.now();
      const result = await orch.execute(operation);
      const elapsed = Date.now() - start;

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(2);
      // Should include retry delay (~50ms)
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe('create', () => {
    it('should create with default config', () => {
      const orch = DefaultResilienceOrchestrator.create();

      expect(orch).toBeInstanceOf(DefaultResilienceOrchestrator);
      expect(orch.getCircuitBreaker()).toBeDefined();
      expect(orch.getRateLimiter()).toBeDefined();
      expect(orch.getRetryExecutor()).toBeDefined();
    });

    it('should create with custom retry config', () => {
      const orch = DefaultResilienceOrchestrator.create({
        retry: {
          maxAttempts: 5,
          baseDelayMs: 2000,
          maxDelayMs: 60000,
          jitterFactor: 0.2,
        },
      });

      expect(orch).toBeInstanceOf(DefaultResilienceOrchestrator);
    });

    it('should create with custom circuit breaker config', () => {
      const orch = DefaultResilienceOrchestrator.create({
        circuitBreaker: {
          failureThreshold: 10,
          successThreshold: 5,
          openDurationMs: 60000,
        },
      });

      expect(orch).toBeInstanceOf(DefaultResilienceOrchestrator);
    });

    it('should create with custom rate limiter config', () => {
      const orch = DefaultResilienceOrchestrator.create({
        rateLimiter: {
          requestsPerSecond: 20,
          burstSize: 50,
        },
      });

      expect(orch).toBeInstanceOf(DefaultResilienceOrchestrator);
    });

    it('should create with partial config', () => {
      const orch = DefaultResilienceOrchestrator.create({
        retry: {
          maxAttempts: 5,
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          jitterFactor: 0.1,
        },
      });

      expect(orch).toBeInstanceOf(DefaultResilienceOrchestrator);
    });
  });

  describe('getters', () => {
    it('should return circuit breaker instance', () => {
      const circuitBreaker = orchestrator.getCircuitBreaker();

      expect(circuitBreaker).toBeDefined();
      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should return rate limiter instance', () => {
      const rateLimiter = orchestrator.getRateLimiter();

      expect(rateLimiter).toBeDefined();
      expect(rateLimiter.getAvailableTokens()).toBeGreaterThan(0);
    });

    it('should return retry executor instance', () => {
      const retryExecutor = orchestrator.getRetryExecutor();

      expect(retryExecutor).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle intermittent failures gracefully', async () => {
      const config = createDefaultResilienceConfig();
      const orch = DefaultResilienceOrchestrator.create({
        ...config,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 50,
          maxDelayMs: 200,
          jitterFactor: 0.1,
        },
      });

      const error = new AnthropicError({
        type: 'server_error',
        message: 'Temporary error',
        status: 503,
        isRetryable: true,
      });

      let callCount = 0;
      const operation = vi.fn(async () => {
        callCount++;
        if (callCount === 1 || callCount === 2) {
          throw error;
        }
        return 42;
      });

      const result = await orch.execute(operation);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle rate limit bursts correctly', async () => {
      const config = createDefaultResilienceConfig();
      const orch = DefaultResilienceOrchestrator.create({
        ...config,
        rateLimiter: {
          requestsPerSecond: 2,
          burstSize: 3,
        },
      });

      const operation = vi.fn().mockResolvedValue(42);

      const start = Date.now();

      // First 3 should burst through
      await Promise.all([
        orch.execute(operation),
        orch.execute(operation),
        orch.execute(operation),
      ]);

      const burstTime = Date.now() - start;

      // Burst should be fast
      expect(burstTime).toBeLessThan(100);

      // Next request should be rate limited
      const rateLimitStart = Date.now();
      await orch.execute(operation);
      const rateLimitTime = Date.now() - rateLimitStart;

      // Should wait ~500ms (1/2 requests per second)
      expect(rateLimitTime).toBeGreaterThanOrEqual(400);
      expect(operation).toHaveBeenCalledTimes(4);
    });

    it('should prevent circuit breaker from retrying when open', async () => {
      const config = createDefaultResilienceConfig();
      const orch = DefaultResilienceOrchestrator.create({
        ...config,
        retry: {
          maxAttempts: 1,
          baseDelayMs: 50,
          maxDelayMs: 100,
          jitterFactor: 0.1,
        },
        circuitBreaker: {
          failureThreshold: 1,
          successThreshold: 1,
          openDurationMs: 500,
        },
      });

      const error = new AnthropicError({
        type: 'server_error',
        message: 'Server error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn().mockRejectedValue(error);

      // First failure opens circuit
      await expect(orch.execute(operation)).rejects.toThrow(error);

      // Second attempt fails fast
      const start = Date.now();
      await expect(orch.execute(operation)).rejects.toThrow(CircuitOpenError);
      const elapsed = Date.now() - start;

      // Should fail immediately without retry
      expect(elapsed).toBeLessThan(50);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});

describe('PassthroughResilienceOrchestrator', () => {
  let orchestrator: PassthroughResilienceOrchestrator;

  beforeEach(() => {
    orchestrator = new PassthroughResilienceOrchestrator();
  });

  describe('execute', () => {
    it('should execute operation without resilience features', async () => {
      const operation = vi.fn().mockResolvedValue(42);

      const result = await orchestrator.execute(operation);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on errors', async () => {
      const error = new AnthropicError({
        type: 'server_error',
        message: 'Server error',
        status: 500,
        isRetryable: true,
      });

      const operation = vi.fn().mockRejectedValue(error);

      await expect(orchestrator.execute(operation)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should execute immediately without rate limiting', async () => {
      const operation = vi.fn().mockResolvedValue(42);

      const start = Date.now();

      // Execute multiple requests
      await Promise.all([
        orchestrator.execute(operation),
        orchestrator.execute(operation),
        orchestrator.execute(operation),
        orchestrator.execute(operation),
        orchestrator.execute(operation),
      ]);

      const elapsed = Date.now() - start;

      // Should be very fast
      expect(elapsed).toBeLessThan(100);
      expect(operation).toHaveBeenCalledTimes(5);
    });

    it('should not use circuit breaker', async () => {
      const error = new Error('Test error');
      const operation = vi.fn().mockRejectedValue(error);

      // Multiple failures should not open circuit
      for (let i = 0; i < 10; i++) {
        await expect(orchestrator.execute(operation)).rejects.toThrow(error);
      }

      // Should still execute (no circuit breaker)
      await expect(orchestrator.execute(operation)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(11);
    });
  });
});

describe('createDefaultResilienceConfig', () => {
  it('should create complete default configuration', () => {
    const config = createDefaultResilienceConfig();

    expect(config).toEqual({
      retry: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterFactor: 0.1,
      },
      circuitBreaker: {
        failureThreshold: 5,
        successThreshold: 3,
        openDurationMs: 30000,
      },
      rateLimiter: {
        requestsPerSecond: 10,
        burstSize: 20,
      },
    });
  });
});
