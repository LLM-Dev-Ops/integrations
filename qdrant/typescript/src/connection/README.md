# Qdrant Connection Resilience Layer

This module provides resilience mechanisms for reliable Qdrant operations, including retry logic with exponential backoff and circuit breaker pattern.

## Features

- **Retry Executor**: Automatic retry with exponential backoff and jitter
- **Circuit Breaker**: Prevents cascading failures by failing fast when errors exceed threshold
- **Error Type Detection**: Automatic detection of transient vs non-transient errors
- **Configurable Retry Policies**: Per-error-type retry configurations based on SPARC specification

## Usage

### Basic Retry

```typescript
import { createDefaultRetryExecutor } from './connection/index.js';

const executor = createDefaultRetryExecutor();

// Execute operation with automatic retry
const result = await executor.execute(async () => {
  return await qdrantClient.search({
    collection: 'my-collection',
    vector: [0.1, 0.2, 0.3],
    limit: 10,
  });
});
```

### Error-Specific Retry Configuration

```typescript
import { createRetryExecutorForError } from './connection/index.js';

// Use retry config optimized for rate limit errors
const executor = createRetryExecutorForError('rate_limit_error');

const result = await executor.execute(async () => {
  return await qdrantClient.upsertPoints({
    collection: 'my-collection',
    points: largePointsBatch,
  });
});
```

### Custom Retry Configuration

```typescript
import { RetryExecutor } from './connection/index.js';

const executor = new RetryExecutor({
  maxAttempts: 5,
  baseDelayMs: 200,
  maxDelayMs: 10000,
  jitterFactor: 0.2,
});

const result = await executor.execute(async () => {
  return await qdrantClient.getPoints({
    collection: 'my-collection',
    ids: [1, 2, 3],
  });
});
```

### Circuit Breaker

```typescript
import { createDefaultCircuitBreaker, CircuitOpenError } from './connection/index.js';

const breaker = createDefaultCircuitBreaker();

try {
  const result = await breaker.execute(async () => {
    return await qdrantClient.search({
      collection: 'my-collection',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    });
  });
} catch (error) {
  if (error instanceof CircuitOpenError) {
    console.error('Circuit breaker is open, service is unavailable');
  } else {
    console.error('Operation failed:', error);
  }
}
```

### Custom Circuit Breaker Configuration

```typescript
import { CircuitBreaker } from './connection/index.js';

const breaker = new CircuitBreaker({
  failureThreshold: 10,  // Open after 10 failures
  successThreshold: 3,   // Close after 3 successes in half-open state
  openDurationMs: 60000, // Wait 60s before trying half-open
});

const result = await breaker.execute(async () => {
  return await qdrantClient.getCollection('my-collection');
});
```

### Monitoring Circuit Breaker State

```typescript
import { createDefaultCircuitBreaker } from './connection/index.js';

const breaker = createDefaultCircuitBreaker();

// Get current state
const state = breaker.getState(); // 'closed' | 'open' | 'half_open'

// Get comprehensive statistics
const stats = breaker.getStats();
console.log({
  state: stats.state,
  failureCount: stats.failureCount,
  successCount: stats.successCount,
  lastFailureTime: stats.lastFailureTime,
  timeUntilHalfOpen: stats.timeUntilHalfOpen,
});
```

### Combined Retry and Circuit Breaker

```typescript
import {
  createDefaultRetryExecutor,
  createDefaultCircuitBreaker
} from './connection/index.js';

const executor = createDefaultRetryExecutor();
const breaker = createDefaultCircuitBreaker();

// Combine both patterns
const result = await breaker.execute(async () => {
  return await executor.execute(async () => {
    return await qdrantClient.search({
      collection: 'my-collection',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    });
  });
});
```

## Retry Configuration Per Error Type

Based on the SPARC specification (Section 6.1), the following retry configurations are applied:

| Error Type | Max Attempts | Base Delay | Max Delay | Backoff Type |
|------------|--------------|------------|-----------|--------------|
| `connection_error` | 3 | 100ms | 5s | Exponential |
| `rate_limit_error` | 5 | 500ms | 30s | Exponential |
| `service_unavailable` | 3 | 1s | 10s | Exponential |
| `timeout_error` | 2 | 1s | 2s | Linear |
| Other errors | 3 | 100ms | 5s | Exponential |

## Transient vs Non-Transient Errors

### Transient Errors (Retryable)

- `connection_error` - Network connectivity issues
- `connection_timeout` - Connection timeout
- `rate_limit_error` - Rate limiting
- `service_unavailable` - Service temporarily unavailable
- `timeout_error` - Request timeout
- `search_timeout` - Search operation timeout
- `internal_error` - Internal server error
- `network_error` - Network-level failures

### Non-Transient Errors (Not Retryable)

- `invalid_request_error` - Invalid request parameters
- `authentication_error` - Authentication failure
- `not_found_error` - Resource not found
- `collection_not_found` - Collection does not exist
- `invalid_vector` - Vector validation error
- `permission_denied` - Insufficient permissions

## Circuit Breaker States

### Closed (Normal Operation)

- All requests are processed normally
- Failures are tracked
- Transitions to Open after `failureThreshold` consecutive failures

### Open (Failing Fast)

- All requests immediately fail with `CircuitOpenError`
- No requests are sent to the service
- After `openDurationMs`, transitions to Half-Open

### Half-Open (Testing Recovery)

- Limited requests are allowed through to test service recovery
- After `successThreshold` successes, transitions to Closed
- Any failure immediately transitions back to Open

## Default Configurations

### Default Retry Configuration

```typescript
{
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  jitterFactor: 0.1,
}
```

### Default Circuit Breaker Configuration

```typescript
{
  failureThreshold: 5,
  successThreshold: 2,
  openDurationMs: 30000, // 30 seconds
}
```

## Best Practices

1. **Use error-specific retry configs**: Always prefer `createRetryExecutorForError()` over default config when you know the error type
2. **Combine patterns**: Use circuit breaker for external service calls, retry for transient failures
3. **Monitor circuit state**: Log circuit state changes to detect service degradation
4. **Set appropriate timeouts**: Ensure operation timeouts are shorter than retry delays
5. **Test failure scenarios**: Verify retry and circuit breaker behavior in your tests
6. **Reset circuit manually**: Use `breaker.reset()` when you know service has recovered

## Examples

### Search with Resilience

```typescript
import {
  createRetryExecutorForError,
  createDefaultCircuitBreaker
} from './connection/index.js';

async function resilientSearch(qdrantClient, collection, vector) {
  const executor = createRetryExecutorForError('search_timeout');
  const breaker = createDefaultCircuitBreaker();

  return await breaker.execute(async () => {
    return await executor.execute(async () => {
      return await qdrantClient.search({
        collection,
        vector,
        limit: 10,
      });
    });
  });
}
```

### Batch Upsert with Rate Limiting

```typescript
import { createRetryExecutorForError } from './connection/index.js';

async function batchUpsertWithRetry(qdrantClient, collection, points) {
  const executor = createRetryExecutorForError('rate_limit_error');

  return await executor.execute(async () => {
    return await qdrantClient.upsertPoints({
      collection,
      points,
      wait: true,
    });
  });
}
```

## API Reference

See TypeScript definitions in `resilience.ts` for detailed API documentation.
