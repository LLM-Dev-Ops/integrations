import { vi } from 'vitest';
/**
 * Create a mock resilience orchestrator with tracking capabilities
 */
export function createMockResilienceOrchestrator() {
    let executionCount = 0;
    let lastError;
    const mock = {
        execute: vi.fn(async (fn) => {
            executionCount++;
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
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
export function createMockResilienceOrchestratorWithDefaults() {
    const orchestrator = createMockResilienceOrchestrator();
    // Default behavior: execute the function directly
    orchestrator.execute.mockImplementation(async (fn) => {
        try {
            return await fn();
        }
        catch (error) {
            throw error;
        }
    });
    return orchestrator;
}
/**
 * Configure mock to throw a specific error
 */
export function mockResilienceOrchestratorError(orchestrator, error) {
    orchestrator.execute.mockRejectedValue(error);
}
/**
 * Configure mock to return a specific response
 */
export function mockResilienceOrchestratorResponse(orchestrator, response) {
    orchestrator.execute.mockResolvedValue(response);
}
/**
 * Configure mock to fail N times before succeeding
 */
export function mockResilienceOrchestratorWithRetries(orchestrator, failCount, error, successValue) {
    let attempts = 0;
    orchestrator.execute.mockImplementation(async (fn) => {
        attempts++;
        if (attempts <= failCount) {
            throw error;
        }
        return successValue;
    });
}
/**
 * Configure mock to simulate circuit breaker opening
 */
export function mockResilienceOrchestratorCircuitOpen(orchestrator) {
    const circuitOpenError = new Error('Circuit breaker is open');
    circuitOpenError.name = 'CircuitOpenError';
    orchestrator.execute.mockRejectedValue(circuitOpenError);
}
/**
 * Configure mock to simulate rate limiting
 */
export function mockResilienceOrchestratorRateLimited(orchestrator, delayMs) {
    orchestrator.execute.mockImplementation(async (fn) => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return fn();
    });
}
//# sourceMappingURL=resilience.mock.js.map