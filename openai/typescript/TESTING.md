# OpenAI Integration Testing Guide

This document describes the comprehensive test architecture for the OpenAI TypeScript integration module, following London-School TDD principles and SPARC specification patterns.

## Table of Contents

- [Overview](#overview)
- [Test Architecture](#test-architecture)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
- [Writing New Tests](#writing-new-tests)
- [Best Practices](#best-practices)

## Overview

The test suite is organized into three main categories:

1. **Unit Tests** - Test individual services in isolation using mocks
2. **Integration Tests** - Test the full stack with MSW (Mock Service Worker)
3. **Client Tests** - Test client factory and configuration

### Test Framework

- **Test Runner**: Vitest
- **Mocking**: Vitest's `vi.fn()`
- **HTTP Mocking**: MSW (Mock Service Worker)
- **Coverage**: Vitest coverage with v8

## Test Architecture

### Directory Structure

```
src/
├── __mocks__/              # Mock implementations
│   ├── http-transport.mock.ts
│   ├── auth-manager.mock.ts
│   ├── resilience.mock.ts
│   └── index.ts
├── __fixtures__/           # Test fixtures and data
│   ├── chat.fixtures.ts
│   ├── embeddings.fixtures.ts
│   ├── files.fixtures.ts
│   ├── models.fixtures.ts
│   ├── errors.fixtures.ts
│   ├── streams.fixtures.ts
│   └── index.ts
├── __tests__/              # Integration tests
│   └── integration/
│       ├── setup.ts
│       ├── chat.integration.test.ts
│       └── embeddings.integration.test.ts
├── services/               # Service unit tests
│   ├── chat/__tests__/service.test.ts
│   ├── embeddings/__tests__/service.test.ts
│   ├── files/__tests__/service.test.ts
│   ├── models/__tests__/service.test.ts
│   ├── images/__tests__/service.test.ts
│   ├── audio/__tests__/service.test.ts
│   ├── moderations/__tests__/service.test.ts
│   ├── batches/__tests__/service.test.ts
│   ├── fine-tuning/__tests__/service.test.ts
│   └── assistants/__tests__/service.test.ts
└── client/__tests__/       # Client tests
    ├── config.test.ts
    └── client.test.ts
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run with Coverage
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npx vitest run src/services/chat/__tests__/service.test.ts
```

### Run Tests Matching Pattern
```bash
npx vitest run -t "ChatCompletionService"
```

## Test Categories

### 1. Unit Tests (London-School TDD)

Unit tests use mocks to isolate the service under test from its dependencies.

#### Example: Chat Service Unit Test

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatCompletionServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
} from '../../../__mocks__/index.js';
import { createChatCompletionResponse } from '../../../__fixtures__/index.js';

describe('ChatCompletionService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: ChatCompletionServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new ChatCompletionServiceImpl(mockOrchestrator);
  });

  it('should create a chat completion successfully', async () => {
    const response = createChatCompletionResponse();
    mockResilienceOrchestratorResponse(mockOrchestrator, {
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: response,
    });

    const result = await service.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result).toEqual(response);
    expect(mockOrchestrator.request).toHaveBeenCalledOnce();
  });
});
```

### 2. Integration Tests (MSW)

Integration tests use MSW to mock HTTP responses and test the full request/response cycle.

#### Example: Chat Integration Test

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../../client/factory.js';
import { mockChatCompletion } from './setup.js';
import { createChatCompletionResponse } from '../../__fixtures__/index.js';

describe('Chat Integration Tests', () => {
  let client: OpenAIClient;

  beforeEach(() => {
    client = createClient({
      apiKey: 'sk-test-key',
      baseURL: 'https://api.openai.com',
    });
  });

  it('should create a chat completion successfully', async () => {
    const response = createChatCompletionResponse();
    mockChatCompletion(response);

    const result = await client.chat.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.id).toBe(response.id);
    expect(result.choices).toHaveLength(1);
  });
});
```

### 3. Client Tests

Client tests verify the client factory, configuration validation, and environment variable handling.

#### Example: Config Test

```typescript
import { describe, it, expect } from 'vitest';
import { validateConfig, normalizeConfig } from '../config.js';

describe('Client Config', () => {
  it('should validate a valid config', () => {
    const config = { apiKey: 'sk-test-key' };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should throw if apiKey is missing', () => {
    const config = {} as OpenAIConfig;
    expect(() => validateConfig(config)).toThrow('API key is required');
  });
});
```

## Test Categories by Service

Each service test file includes the following test categories:

### 1. Happy Path Tests
- Successful API calls with valid parameters
- Different parameter combinations
- Edge cases with valid inputs

### 2. Validation Tests
- Required parameter validation
- Parameter type validation
- Parameter range validation
- Empty/null value handling

### 3. Error Handling Tests
- 401 Unauthorized errors
- 403 Forbidden errors
- 404 Not Found errors
- 429 Rate Limit errors
- 500 Server errors
- 502 Bad Gateway errors
- 503 Service Unavailable errors
- Timeout errors
- Network errors
- Abort errors

### 4. Streaming Tests (for applicable services)
- Successful streaming
- Stream error handling
- Stream interruption
- Content accumulation

### 5. Retry Behavior Tests
- Retry on transient errors
- Respect max retries configuration
- Exponential backoff

## Writing New Tests

### 1. Create Mock Implementations

Add mocks to `src/__mocks__/` for new dependencies:

```typescript
import { vi } from 'vitest';
import type { NewService } from '../types.js';

export interface MockNewService extends NewService {
  method: ReturnType<typeof vi.fn>;
}

export function createMockNewService(): MockNewService {
  return {
    method: vi.fn(),
  };
}
```

### 2. Create Fixtures

Add fixtures to `src/__fixtures__/` for test data:

```typescript
import type { NewResponse } from '../services/new/types.js';

export function createNewResponse(
  overrides?: Partial<NewResponse>
): NewResponse {
  return {
    id: 'new-123',
    data: 'test-data',
    ...overrides,
  };
}
```

### 3. Create Unit Tests

Create test file at `src/services/new/__tests__/service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { NewServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
} from '../../../__mocks__/index.js';
import { createNewResponse } from '../../../__fixtures__/index.js';

describe('NewService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: NewServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new NewServiceImpl(mockOrchestrator);
  });

  describe('method', () => {
    it('should call method successfully', async () => {
      const response = createNewResponse();
      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.method({ param: 'value' });

      expect(result).toEqual(response);
      expect(mockOrchestrator.request).toHaveBeenCalledOnce();
    });
  });
});
```

### 4. Create Integration Tests

Add integration test to `src/__tests__/integration/new.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../../client/factory.js';
import { server } from './setup.js';
import { http, HttpResponse } from 'msw';
import { createNewResponse } from '../../__fixtures__/index.js';

describe('New Service Integration Tests', () => {
  let client: OpenAIClient;

  beforeEach(() => {
    client = createClient({
      apiKey: 'sk-test-key',
      baseURL: 'https://api.openai.com',
    });
  });

  it('should call new service successfully', async () => {
    const response = createNewResponse();
    server.use(
      http.post('https://api.openai.com/v1/new', () => {
        return HttpResponse.json(response);
      })
    );

    const result = await client.newService.method({ param: 'value' });

    expect(result).toEqual(response);
  });
});
```

## Best Practices

### 1. London-School TDD Principles

- **Mock all dependencies**: Each service test should mock its dependencies
- **Test behavior, not implementation**: Focus on what the service does, not how
- **One assertion per test**: Keep tests focused and clear
- **Arrange-Act-Assert**: Structure tests clearly

### 2. Test Naming

Use descriptive test names that explain the behavior:

```typescript
// Good
it('should create a chat completion successfully', async () => {});
it('should handle 401 unauthorized errors', async () => {});
it('should validate model is required', async () => {});

// Bad
it('works', async () => {});
it('test1', async () => {});
```

### 3. Fixture Usage

- Use fixtures for all test data
- Create factory functions that accept overrides
- Keep fixtures simple and focused
- Export fixtures from a central index

### 4. Mock Helpers

- Create helper functions for common mocking patterns
- Use typed mocks with proper TypeScript types
- Reset mocks between tests with `beforeEach`

### 5. Error Testing

Test all error scenarios:

```typescript
describe('error handling', () => {
  it('should handle 401 unauthorized errors', async () => {
    mockResilienceOrchestratorError(mockOrchestrator, new Error('Unauthorized'));
    await expect(service.create(request)).rejects.toThrow('Unauthorized');
  });

  it('should handle 429 rate limit errors', async () => {
    mockResilienceOrchestratorError(mockOrchestrator, new Error('Rate limit reached'));
    await expect(service.create(request)).rejects.toThrow('Rate limit reached');
  });

  it('should handle timeout errors', async () => {
    mockResilienceOrchestratorError(mockOrchestrator, createTimeoutError());
    await expect(service.create(request)).rejects.toThrow('Request timeout');
  });
});
```

### 6. Streaming Tests

Test streaming with AsyncIterable:

```typescript
it('should stream chunks successfully', async () => {
  const chunks = createStreamChunks();
  mockResilienceOrchestratorStream(mockOrchestrator, chunks);

  const results = [];
  for await (const chunk of service.stream(request)) {
    results.push(chunk);
  }

  expect(results).toHaveLength(4);
  expect(results[0].choices[0].delta.role).toBe('assistant');
});
```

### 7. Integration Test Setup

- Use MSW for HTTP mocking
- Set up common handlers in `setup.ts`
- Override handlers per test as needed
- Reset handlers after each test

### 8. Coverage Goals

Aim for high coverage:

- **Statements**: 90%+
- **Branches**: 85%+
- **Functions**: 90%+
- **Lines**: 90%+

Focus on:
- All happy paths
- All error conditions
- All validation rules
- Edge cases

## Continuous Integration

Tests are run automatically on:

- Pull requests
- Commits to main branch
- Pre-commit hooks (optional)

### CI Configuration

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
```

## Troubleshooting

### Tests Failing Intermittently

- Check for race conditions in async code
- Ensure mocks are properly reset between tests
- Verify MSW handlers are not conflicting

### Coverage Not Meeting Goals

- Add tests for uncovered branches
- Test error paths thoroughly
- Add edge case tests

### Slow Tests

- Use unit tests instead of integration tests where possible
- Mock expensive operations
- Run tests in parallel (default in Vitest)

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [MSW Documentation](https://mswjs.io/)
- [London-School TDD](https://github.com/testdouble/contributing-tests/wiki/London-school-TDD)
- [SPARC Architecture](../../../SPARC.md)

## Contributing

When contributing tests:

1. Follow the existing patterns
2. Add tests for new features
3. Ensure all tests pass
4. Maintain coverage levels
5. Document complex test scenarios
