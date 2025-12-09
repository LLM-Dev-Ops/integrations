import { vi } from 'vitest';
import type { ResilienceOrchestrator } from '../resilience/index.js';

/**
 * Mock resilience orchestrator with execution tracking
 */
export interface MockResilienceOrchestrator extends ResilienceOrchestrator {
  execute: ReturnType<typeof vi.fn>;
  executionCount: number;
  lastError?: Error;
  reset: () => void;
}

/**
 * Create a mock resilience orchestrator with tracking capabilities
 */
export function createMockResilienceOrchestrator(): MockResilienceOrchestrator {
  let executionCount = 0;
  let lastError: Error | undefined;

  const mock = {
    execute: vi.fn(async <T>(fn: () => Promise<T>) => {
      executionCount++;
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        throw error;
      }
    }),
    get executionCount() {
      return executionCount;
    },
    get lastError() {
      return lastError;
    },
    reset() {
      executionCount = 0;
      lastError = undefined;
      mock.execute.mockClear();
    },
  };

  return mock;
}

/**
 * Create a mock orchestrator with default passthrough behavior
 */
export function createMockResilienceOrchestratorWithDefaults(): MockResilienceOrchestrator {
  const orchestrator = createMockResilienceOrchestrator();

  // Default behavior: execute the function directly
  orchestrator.execute.mockImplementation(async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (error) {
      throw error;
    }
  });

  return orchestrator;
}

/**
 * Configure mock to throw a specific error
 */
export function mockResilienceOrchestratorError(
  orchestrator: MockResilienceOrchestrator,
  error: Error
): void {
  orchestrator.execute.mockRejectedValue(error);
}

/**
 * Configure mock to return a specific response
 */
export function mockResilienceOrchestratorResponse<T>(
  orchestrator: MockResilienceOrchestrator,
  response: T
): void {
  orchestrator.execute.mockResolvedValue(response);
}

/**
 * Configure mock to fail N times before succeeding
 */
export function mockResilienceOrchestratorWithRetries<T>(
  orchestrator: MockResilienceOrchestrator,
  failCount: number,
  error: Error,
  successValue: T
): void {
  let attempts = 0;
  orchestrator.execute.mockImplementation(async <U>() => {
    attempts++;
    if (attempts <= failCount) {
      throw error;
    }
    return successValue as U;
  });
}

/**
 * Configure mock to simulate circuit breaker opening
 */
export function mockResilienceOrchestratorCircuitOpen(
  orchestrator: MockResilienceOrchestrator
): void {
  const circuitOpenError = new Error('Circuit breaker is open');
  circuitOpenError.name = 'CircuitOpenError';
  orchestrator.execute.mockRejectedValue(circuitOpenError);
}

/**
 * Configure mock to simulate rate limiting
 */
export function mockResilienceOrchestratorRateLimited(
  orchestrator: MockResilienceOrchestrator,
  delayMs: number
): void {
  orchestrator.execute.mockImplementation(async <T>(fn: () => Promise<T>) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return fn();
  });
}
