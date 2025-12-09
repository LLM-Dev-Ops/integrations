# Test Quick Reference Guide

Quick reference for writing tests in the OpenAI TypeScript integration module.

## File Structure

```
src/
├── __mocks__/              # Mock implementations
├── __fixtures__/           # Test data
├── __tests__/              # Integration tests
│   └── integration/
├── services/*/__tests__/   # Service unit tests
└── client/__tests__/       # Client tests
```

## Common Imports

### Unit Tests
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
  mockResilienceOrchestratorError,
  mockResilienceOrchestratorStream,
} from '../../../__mocks__/index.js';
import {
  createResponse,
  createRequest,
  create401UnauthorizedError,
} from '../../../__fixtures__/index.js';
```

### Integration Tests
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../../client/factory.js';
import { server } from './setup.js';
import { http, HttpResponse } from 'msw';
import { createResponse } from '../../__fixtures__/index.js';
```

## Test Patterns

### Basic Unit Test
```typescript
describe('ServiceName', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: ServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new ServiceImpl(mockOrchestrator);
  });

  describe('methodName', () => {
    it('should do something successfully', async () => {
      // Arrange
      const request = createRequest();
      const response = createResponse();
      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      // Act
      const result = await service.method(request);

      // Assert
      expect(result).toEqual(response);
      expect(mockOrchestrator.request).toHaveBeenCalledOnce();
    });
  });
});
```

### Error Handling Test
```typescript
it('should handle 401 unauthorized errors', async () => {
  mockResilienceOrchestratorError(
    mockOrchestrator,
    new Error('Unauthorized')
  );

  await expect(service.method(request)).rejects.toThrow('Unauthorized');
});
```

### Validation Test
```typescript
it('should validate required parameter', async () => {
  const invalidRequest = { } as RequestType;

  await expect(service.method(invalidRequest)).rejects.toThrow();
});
```

### Streaming Test
```typescript
it('should stream chunks successfully', async () => {
  const chunks = createStreamChunks();
  mockResilienceOrchestratorStream(mockOrchestrator, chunks);

  const results = [];
  for await (const chunk of service.stream(request)) {
    results.push(chunk);
  }

  expect(results).toHaveLength(3);
  expect(results[0]).toBeDefined();
});
```

### Integration Test
```typescript
describe('Service Integration Tests', () => {
  let client: OpenAIClient;

  beforeEach(() => {
    client = createClient({
      apiKey: 'sk-test-key',
      baseURL: 'https://api.openai.com',
    });
  });

  it('should call service successfully', async () => {
    const response = createResponse();
    server.use(
      http.post('https://api.openai.com/v1/endpoint', () => {
        return HttpResponse.json(response);
      })
    );

    const result = await client.service.method(request);

    expect(result).toEqual(response);
  });
});
```

## Mock Helpers

### Create Mock Orchestrator
```typescript
const mockOrchestrator = createMockResilienceOrchestrator();
```

### Mock Successful Response
```typescript
mockResilienceOrchestratorResponse(mockOrchestrator, {
  status: 200,
  headers: { 'content-type': 'application/json' },
  data: createResponse(),
});
```

### Mock Error
```typescript
mockResilienceOrchestratorError(
  mockOrchestrator,
  new Error('Error message')
);
```

### Mock Stream
```typescript
const chunks = [chunk1, chunk2, chunk3];
mockResilienceOrchestratorStream(mockOrchestrator, chunks);
```

## Fixture Helpers

### Create Response Fixture
```typescript
export function createResponse(
  overrides?: Partial<Response>
): Response {
  return {
    id: 'default-id',
    data: 'default-data',
    ...overrides,
  };
}

// Usage
const response = createResponse({ id: 'custom-id' });
```

### Create Error Fixture
```typescript
// Pre-built error fixtures
const error = create401UnauthorizedError();
const error = create429RateLimitError();
const error = create500InternalServerError();
const error = createTimeoutError();
```

## MSW Handlers

### Basic Handler
```typescript
server.use(
  http.post('https://api.openai.com/v1/endpoint', () => {
    return HttpResponse.json(createResponse());
  })
);
```

### Error Handler
```typescript
server.use(
  http.post('https://api.openai.com/v1/endpoint', () => {
    return HttpResponse.json(
      { error: { message: 'Error', type: 'error' } },
      { status: 500 }
    );
  })
);
```

### Streaming Handler
```typescript
server.use(
  http.post('https://api.openai.com/v1/endpoint', () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('data: {"chunk": 1}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    });
  })
);
```

## Assertion Patterns

### Basic Assertions
```typescript
expect(result).toBeDefined();
expect(result).toEqual(expected);
expect(result.id).toBe('expected-id');
expect(result.data).toHaveLength(3);
expect(mockFn).toHaveBeenCalledOnce();
expect(mockFn).toHaveBeenCalledWith(expectedArg);
```

### Error Assertions
```typescript
await expect(promise).rejects.toThrow();
await expect(promise).rejects.toThrow('Error message');
await expect(promise).rejects.toThrow(ErrorClass);
```

### Object Matching
```typescript
expect(mockFn).toHaveBeenCalledWith(
  expect.objectContaining({
    method: 'POST',
    path: '/v1/endpoint',
  })
);
```

### Array Matching
```typescript
expect(result.items).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: '1' }),
    expect.objectContaining({ id: '2' }),
  ])
);
```

## Test Categories Checklist

For each service method, test:

- [ ] **Happy Path**: Successful operation with valid inputs
- [ ] **Validation**: Required parameters, types, ranges
- [ ] **Error Handling**: 401, 403, 404, 429, 500, 502, 503
- [ ] **Network Errors**: Timeout, network failure, abort
- [ ] **Edge Cases**: Empty inputs, large inputs, special values
- [ ] **Streaming** (if applicable): Success, errors, interruption
- [ ] **Request Options**: Headers, timeout, signal

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Specific file
npx vitest run src/services/chat/__tests__/service.test.ts

# Pattern match
npx vitest run -t "ChatCompletionService"

# Debug mode
npx vitest run --reporter=verbose
```

## Common Issues

### Mock Not Called
```typescript
// Ensure mock is set up before calling service
mockResilienceOrchestratorResponse(mockOrchestrator, response);
const result = await service.method(request);
```

### Async Iterator Issues
```typescript
// Use for-await-of for streaming
for await (const chunk of service.stream(request)) {
  results.push(chunk);
}
```

### MSW Handler Not Matching
```typescript
// Check URL matches exactly
server.use(
  http.post('https://api.openai.com/v1/chat/completions', () => {
    // Handler
  })
);

// Enable MSW debugging
server.listHandlers(); // In test
```

### TypeScript Errors
```typescript
// Use type assertions for partial objects
const request = { } as RequestType;

// Use proper typing for mocks
const mock: MockType = createMock();
```

## Quick Tips

1. **Always reset mocks** in `beforeEach`
2. **Use fixtures** for all test data
3. **Test one thing** per test case
4. **Name tests clearly** - describe what they test
5. **Mock at boundaries** - mock external dependencies only
6. **Test errors thoroughly** - cover all error paths
7. **Use integration tests** for end-to-end scenarios
8. **Keep tests fast** - use unit tests when possible
9. **Maintain coverage** - aim for 90%+ coverage
10. **Document complex tests** - add comments for clarity

## Resources

- Full Guide: [TESTING.md](./TESTING.md)
- Vitest: https://vitest.dev/
- MSW: https://mswjs.io/
- SPARC: [../../../SPARC.md](../../../SPARC.md)
