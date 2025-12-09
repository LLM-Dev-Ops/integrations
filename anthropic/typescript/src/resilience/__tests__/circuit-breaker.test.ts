/**
 * Tests for CircuitBreaker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  createDefaultCircuitBreakerConfig,
} from '../circuit-breaker.js';
import type { CircuitBreakerHook, CircuitState } from '../types.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(createDefaultCircuitBreakerConfig());
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should have zero failure count', () => {
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should have zero success count', () => {
      expect(circuitBreaker.getSuccessCount()).toBe(0);
    });
  });

  describe('closed state', () => {
    it('should execute operation successfully', async () => {
      const operation = vi.fn().mockResolvedValue(42);

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should track failures', async () => {
      const error = new Error('Test error');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(error);

      expect(circuitBreaker.getFailureCount()).toBe(1);
      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should open circuit after failure threshold', async () => {
      const config = createDefaultCircuitBreakerConfig();
      const cb = new CircuitBreaker({ ...config, failureThreshold: 3 });

      const error = new Error('Test error');
      const operation = vi.fn().mockRejectedValue(error);

      // First two failures keep circuit closed
      await expect(cb.execute(operation)).rejects.toThrow(error);
      expect(cb.getState()).toBe('closed');

      await expect(cb.execute(operation)).rejects.toThrow(error);
      expect(cb.getState()).toBe('closed');

      // Third failure opens circuit
      await expect(cb.execute(operation)).rejects.toThrow(error);
      expect(cb.getState()).toBe('open');
    });

    it('should reset failure count on success', async () => {
      const error = new Error('Test error');
      const errorOp = vi.fn().mockRejectedValue(error);
      const successOp = vi.fn().mockResolvedValue(42);

      await expect(circuitBreaker.execute(errorOp)).rejects.toThrow(error);
      expect(circuitBreaker.getFailureCount()).toBe(1);

      await circuitBreaker.execute(successOp);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('open state', () => {
    beforeEach(async () => {
      const config = createDefaultCircuitBreakerConfig();
      circuitBreaker = new CircuitBreaker({ ...config, failureThreshold: 2 });

      const error = new Error('Test error');
      const operation = vi.fn().mockRejectedValue(error);

      // Open the circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow(error);
      await expect(circuitBreaker.execute(operation)).rejects.toThrow(error);

      expect(circuitBreaker.getState()).toBe('open');
    });

    it('should fail fast without executing operation', async () => {
      const operation = vi.fn().mockResolvedValue(42);

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(
        CircuitOpenError
      );

      expect(operation).not.toHaveBeenCalled();
    });

    it('should throw CircuitOpenError', async () => {
      const operation = vi.fn().mockResolvedValue(42);

      try {
        await circuitBreaker.execute(operation);
        expect.fail('Should have thrown CircuitOpenError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).message).toBe(
          'Circuit breaker is open'
        );
      }
    });

    it('should transition to half-open after timeout', async () => {
      const config = createDefaultCircuitBreakerConfig();
      const cb = new CircuitBreaker({
        ...config,
        failureThreshold: 1,
        openDurationMs: 100,
      });

      const error = new Error('Test error');
      const operation = vi.fn().mockRejectedValue(error);

      // Open the circuit
      await expect(cb.execute(operation)).rejects.toThrow(error);
      expect(cb.getState()).toBe('open');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next operation should transition to half-open
      const successOp = vi.fn().mockResolvedValue(42);
      await cb.execute(successOp);

      expect(successOp).toHaveBeenCalled();
    });
  });

  describe('half-open state', () => {
    it('should transition to closed after success threshold', async () => {
      const config = createDefaultCircuitBreakerConfig();
      const cb = new CircuitBreaker({
        ...config,
        failureThreshold: 1,
        successThreshold: 2,
        openDurationMs: 50,
      });

      const error = new Error('Test error');
      const errorOp = vi.fn().mockRejectedValue(error);

      // Open the circuit
      await expect(cb.execute(errorOp)).rejects.toThrow(error);
      expect(cb.getState()).toBe('open');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      // Succeed twice to close circuit
      const successOp = vi.fn().mockResolvedValue(42);
      await cb.execute(successOp);
      expect(cb.getState()).toBe('half_open');

      await cb.execute(successOp);
      expect(cb.getState()).toBe('closed');
    });

    it('should transition back to open on failure', async () => {
      const config = createDefaultCircuitBreakerConfig();
      const cb = new CircuitBreaker({
        ...config,
        failureThreshold: 1,
        successThreshold: 2,
        openDurationMs: 50,
      });

      const error = new Error('Test error');
      const errorOp = vi.fn().mockRejectedValue(error);

      // Open the circuit
      await expect(cb.execute(errorOp)).rejects.toThrow(error);
      expect(cb.getState()).toBe('open');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      // Transition to half-open
      const successOp = vi.fn().mockResolvedValue(42);
      await cb.execute(successOp);
      expect(cb.getState()).toBe('half_open');

      // Failure reopens circuit
      await expect(cb.execute(errorOp)).rejects.toThrow(error);
      expect(cb.getState()).toBe('open');
    });
  });

  describe('hooks', () => {
    it('should call hook on state change', async () => {
      const hook: CircuitBreakerHook = {
        onStateChange: vi.fn(),
      };

      const config = createDefaultCircuitBreakerConfig();
      const cb = new CircuitBreaker({ ...config, failureThreshold: 1 });
      cb.addHook(hook);

      const error = new Error('Test error');
      const operation = vi.fn().mockRejectedValue(error);

      // Open the circuit
      await expect(cb.execute(operation)).rejects.toThrow(error);

      expect(hook.onStateChange).toHaveBeenCalledTimes(1);
      expect(hook.onStateChange).toHaveBeenCalledWith('closed', 'open');
    });

    it('should call hook on all state transitions', async () => {
      const stateChanges: Array<[CircuitState, CircuitState]> = [];

      const hook: CircuitBreakerHook = {
        onStateChange: (from, to) => {
          stateChanges.push([from, to]);
        },
      };

      const config = createDefaultCircuitBreakerConfig();
      const cb = new CircuitBreaker({
        ...config,
        failureThreshold: 1,
        successThreshold: 1,
        openDurationMs: 50,
      });
      cb.addHook(hook);

      const error = new Error('Test error');
      const errorOp = vi.fn().mockRejectedValue(error);
      const successOp = vi.fn().mockResolvedValue(42);

      // Open
      await expect(cb.execute(errorOp)).rejects.toThrow(error);

      // Wait for timeout and transition to half-open
      await new Promise(resolve => setTimeout(resolve, 100));
      await cb.execute(successOp);

      expect(stateChanges).toEqual([
        ['closed', 'open'],
        ['open', 'half_open'],
        ['half_open', 'closed'],
      ]);
    });

    it('should call multiple hooks', async () => {
      const calls: number[] = [];

      const hook1: CircuitBreakerHook = {
        onStateChange: () => { calls.push(1); },
      };

      const hook2: CircuitBreakerHook = {
        onStateChange: () => { calls.push(2); },
      };

      const config = createDefaultCircuitBreakerConfig();
      const cb = new CircuitBreaker({ ...config, failureThreshold: 1 });
      cb.addHook(hook1);
      cb.addHook(hook2);

      const error = new Error('Test error');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(cb.execute(operation)).rejects.toThrow(error);

      expect(calls).toEqual([1, 2]);
    });
  });

  describe('reset', () => {
    it('should reset circuit to closed state', async () => {
      const config = createDefaultCircuitBreakerConfig();
      const cb = new CircuitBreaker({ ...config, failureThreshold: 1 });

      const error = new Error('Test error');
      const operation = vi.fn().mockRejectedValue(error);

      // Open the circuit
      await expect(cb.execute(operation)).rejects.toThrow(error);
      expect(cb.getState()).toBe('open');

      // Reset
      cb.reset();

      expect(cb.getState()).toBe('closed');
      expect(cb.getFailureCount()).toBe(0);
      expect(cb.getSuccessCount()).toBe(0);
    });

    it('should allow operations after reset', async () => {
      const config = createDefaultCircuitBreakerConfig();
      const cb = new CircuitBreaker({ ...config, failureThreshold: 1 });

      const error = new Error('Test error');
      const errorOp = vi.fn().mockRejectedValue(error);

      // Open the circuit
      await expect(cb.execute(errorOp)).rejects.toThrow(error);
      expect(cb.getState()).toBe('open');

      // Reset
      cb.reset();

      // Should execute successfully now
      const successOp = vi.fn().mockResolvedValue(42);
      const result = await cb.execute(successOp);

      expect(result).toBe(42);
      expect(successOp).toHaveBeenCalled();
    });
  });

  describe('createDefaultCircuitBreakerConfig', () => {
    it('should create default configuration', () => {
      const config = createDefaultCircuitBreakerConfig();

      expect(config).toEqual({
        failureThreshold: 5,
        successThreshold: 3,
        openDurationMs: 30000,
      });
    });
  });
});
