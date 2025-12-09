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
export declare function createMockResilienceOrchestrator(): MockResilienceOrchestrator;
/**
 * Create a mock orchestrator with default passthrough behavior
 */
export declare function createMockResilienceOrchestratorWithDefaults(): MockResilienceOrchestrator;
/**
 * Configure mock to throw a specific error
 */
export declare function mockResilienceOrchestratorError(orchestrator: MockResilienceOrchestrator, error: Error): void;
/**
 * Configure mock to return a specific response
 */
export declare function mockResilienceOrchestratorResponse<T>(orchestrator: MockResilienceOrchestrator, response: T): void;
/**
 * Configure mock to fail N times before succeeding
 */
export declare function mockResilienceOrchestratorWithRetries<T>(orchestrator: MockResilienceOrchestrator, failCount: number, error: Error, successValue: T): void;
/**
 * Configure mock to simulate circuit breaker opening
 */
export declare function mockResilienceOrchestratorCircuitOpen(orchestrator: MockResilienceOrchestrator): void;
/**
 * Configure mock to simulate rate limiting
 */
export declare function mockResilienceOrchestratorRateLimited(orchestrator: MockResilienceOrchestrator, delayMs: number): void;
//# sourceMappingURL=resilience.mock.d.ts.map