import { vi } from 'vitest';
import type { ResilienceOrchestrator } from '../resilience/orchestrator.js';
import type { HttpRequest, HttpResponse } from '../transport/http-transport.js';

export interface MockResilienceOrchestrator extends ResilienceOrchestrator {
  request: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
  addRequestHook?: ReturnType<typeof vi.fn>;
  addResponseHook?: ReturnType<typeof vi.fn>;
  addErrorHook?: ReturnType<typeof vi.fn>;
  addRetryHook?: ReturnType<typeof vi.fn>;
}

export function createMockResilienceOrchestrator(): MockResilienceOrchestrator {
  return {
    request: vi.fn<[HttpRequest], Promise<unknown>>(),
    stream: vi.fn<[HttpRequest], AsyncIterable<unknown>>(),
    addRequestHook: vi.fn(),
    addResponseHook: vi.fn(),
    addErrorHook: vi.fn(),
    addRetryHook: vi.fn(),
  } as unknown as MockResilienceOrchestrator;
}

export function createMockResilienceOrchestratorWithDefaults(): MockResilienceOrchestrator {
  const orchestrator = createMockResilienceOrchestrator();

  // Default successful response - returns data directly
  orchestrator.request.mockResolvedValue({});

  // Default stream implementation
  orchestrator.stream.mockImplementation(async function* () {
    yield { data: 'chunk1' };
  });

  return orchestrator;
}

export function mockResilienceOrchestratorError(
  orchestrator: MockResilienceOrchestrator,
  error: Error
): void {
  orchestrator.request.mockRejectedValue(error);
}

export function mockResilienceOrchestratorResponse<T>(
  orchestrator: MockResilienceOrchestrator,
  response: HttpResponse<T>
): void {
  // Extract data from HttpResponse and return it directly
  orchestrator.request.mockResolvedValue(response.data);
}

export function mockResilienceOrchestratorStream<T>(
  orchestrator: MockResilienceOrchestrator,
  chunks: T[]
): void {
  orchestrator.stream.mockImplementation(async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  });
}
