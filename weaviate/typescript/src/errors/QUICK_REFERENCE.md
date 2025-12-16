# Weaviate Error Module - Quick Reference

## Import Patterns

```typescript
// Import specific error types
import {
  ConfigurationError,
  AuthenticationError,
  ObjectNotFoundError,
  RateLimitedError,
  BatchPartialFailureError,
  GraphQLError,
} from './errors';

// Import type guards
import {
  isWeaviateError,
  isRetryableError,
  isAuthenticationError,
  isBatchPartialFailureError,
} from './errors';

// Import mappers
import {
  mapHttpError,
  mapToWeaviateError,
  handleGraphQLResponse,
} from './errors';

// Import types
import type {
  ErrorCategory,
  HttpErrorResponse,
  BatchErrorDetail,
  GraphQLErrorDetail,
} from './errors';
```

## Error Types Cheat Sheet

| Error Class | Status | Retryable | Use Case |
|------------|--------|-----------|----------|
| `ConfigurationError` | - | No | Missing/invalid config |
| `AuthenticationError` | 401 | No | Invalid credentials |
| `ForbiddenError` | 403 | No | Insufficient permissions |
| `ObjectNotFoundError` | 404 | No | Object doesn't exist |
| `ClassNotFoundError` | 404 | No | Class doesn't exist |
| `TenantNotFoundError` | 404 | No | Tenant doesn't exist |
| `InvalidObjectError` | 422 | No | Object validation failed |
| `InvalidFilterError` | 422 | No | Invalid filter syntax |
| `InvalidVectorError` | 422 | No | Vector dimension mismatch |
| `TenantNotActiveError` | 422 | No | Tenant not active |
| `RateLimitedError` | 429 | Yes | Rate limit exceeded |
| `InternalError` | 500 | Yes | Server error |
| `ServiceUnavailableError` | 503 | Yes | Service down |
| `TimeoutError` | - | Yes | Request timeout |
| `ConnectionError` | - | Yes | Connection failed |
| `BatchPartialFailureError` | 207 | Partial | Some batch items failed |
| `GraphQLError` | - | No | GraphQL query errors |

## Common Patterns

### 1. Basic Error Handling
```typescript
try {
  await client.objects.get(id);
} catch (err) {
  if (isRetryableError(err)) {
    // Retry logic
  } else {
    // Handle non-retryable error
  }
}
```

### 2. Retry with Backoff
```typescript
import { isRetryableError, getRetryAfter } from './errors';

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableError(err) || i === maxRetries - 1) {
        throw err;
      }
      const delay = getRetryAfter(err) ?? Math.pow(2, i);
      await sleep(delay * 1000);
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 3. HTTP Error Mapping
```typescript
const response = await fetch(url);
if (!response.ok) {
  throw mapHttpError({
    status: response.status,
    data: await response.json(),
    headers: Object.fromEntries(response.headers),
  });
}
```

### 4. Batch Error Handling
```typescript
try {
  await client.batch.create(objects);
} catch (err) {
  if (isBatchPartialFailureError(err)) {
    console.log(`Success: ${err.successful}, Failed: ${err.failed}`);
    const failedIndices = err.getFailedIndices();
    const failedObjects = failedIndices.map(i => objects[i]);
    await retryBatch(failedObjects);
  } else {
    throw err;
  }
}
```

### 5. GraphQL Error Handling
```typescript
const response = await graphqlQuery(query);
handleGraphQLResponse(response); // Throws GraphQLError if errors exist

// Or handle manually
const errors = extractGraphQLErrors(response);
if (errors) {
  throw new GraphQLError(errors);
}
```

### 6. Type-Specific Handling
```typescript
try {
  await operation();
} catch (err) {
  if (err instanceof ObjectNotFoundError) {
    // Create the object
  } else if (err instanceof TenantNotActiveError) {
    // Activate the tenant
    await client.tenants.activate(className, tenantName);
  } else if (err instanceof InvalidVectorError) {
    // Fix vector dimensions
  } else {
    throw err;
  }
}
```

### 7. Category-Based Handling
```typescript
import { isErrorCategory } from './errors';

try {
  await operation();
} catch (err) {
  if (isErrorCategory(err, 'authentication')) {
    // Refresh credentials
  } else if (isErrorCategory(err, 'not_found')) {
    // Handle any 404 error
  } else if (isErrorCategory(err, 'network')) {
    // Handle network issues
  }
}
```

### 8. Error Logging
```typescript
try {
  await operation();
} catch (err) {
  if (isWeaviateError(err)) {
    logger.error('Weaviate operation failed', {
      ...err.toJSON(),
      // Add sanitized context
    });
  }
  throw err;
}
```

### 9. Safe Error Mapping
```typescript
try {
  await operation();
} catch (err) {
  // Always converts to WeaviateError
  const weaviateErr = mapToWeaviateError(err);

  if (weaviateErr.isRetryable) {
    // Handle retry
  }
}
```

### 10. Tenant Error Recovery
```typescript
async function queryWithTenantRecovery(
  className: string,
  tenant: string,
  query: () => Promise<any>
) {
  try {
    return await query();
  } catch (err) {
    if (err instanceof TenantNotActiveError) {
      // Activate and retry
      await client.tenants.activate(className, tenant);
      return await query();
    }
    throw err;
  }
}
```

## Type Guards Reference

```typescript
// Base type guards
isWeaviateError(err)              // Is any WeaviateError
isRetryableError(err)             // Can be retried
isErrorCategory(err, category)    // Matches category
getRetryAfter(err)                // Get retry delay

// Specific type guards
isConfigurationError(err)         // ConfigurationError
isAuthenticationError(err)        // AuthenticationError
isBatchPartialFailureError(err)   // BatchPartialFailureError
isGraphQLError(err)               // GraphQLError

// Union type guards
isNotFoundError(err)              // Any 404 error
isValidationError(err)            // Any 422 error
isNetworkError(err)               // Timeout or Connection error
```

## Error Categories

```typescript
type ErrorCategory =
  | 'configuration'    // Config issues
  | 'authentication'   // Auth/authz
  | 'validation'       // Invalid data
  | 'rate_limit'       // Rate limiting
  | 'network'          // Network issues
  | 'server'           // Server errors
  | 'not_found'        // 404s
  | 'batch'            // Batch failures
  | 'graphql'          // GraphQL errors
  | 'tenant'           // Tenant issues
  | 'schema'           // Schema issues
  | 'internal';        // Other errors
```

## Creating Custom Errors

```typescript
// With details
throw new ObjectNotFoundError(
  objectId,
  className,
  { attemptedAt: new Date(), source: 'cache' }
);

// With retry-after
throw new RateLimitedError(
  'Daily quota exceeded',
  3600, // Retry after 1 hour
  { quotaType: 'daily', limit: 10000 }
);

// With cause chaining
try {
  await lowLevelOperation();
} catch (err) {
  throw new ConnectionError(
    'Failed to connect to Weaviate cluster',
    err as Error,
    { endpoint, cluster: 'prod' }
  );
}
```

## Error Properties

```typescript
interface WeaviateError {
  // Identification
  name: string;              // Error class name
  message: string;           // Error message
  category: ErrorCategory;   // Error category

  // HTTP
  statusCode?: number;       // HTTP status if applicable

  // Retry
  isRetryable: boolean;      // Can retry?
  retryAfter?: number;       // Seconds to wait

  // Context
  details?: Record<string, unknown>;  // Additional context
  cause?: Error;             // Underlying error

  // Methods
  toJSON(): object;          // Serialize to JSON
  toString(): string;        // Human-readable format
}
```

## Special Error Features

### BatchPartialFailureError
```typescript
interface BatchPartialFailureError {
  successful: number;
  failed: number;
  errors: BatchErrorDetail[];
  getFailedIndices(): number[];
}

interface BatchErrorDetail {
  index: number;
  objectId?: string;
  message: string;
  details?: Record<string, unknown>;
}
```

### GraphQLError
```typescript
interface GraphQLError {
  errors: GraphQLErrorDetail[];
  hasErrorMessage(search: string): boolean;
  getFirstErrorMessage(): string;
}

interface GraphQLErrorDetail {
  message: string;
  path?: (string | number)[];
  locations?: Array<{ line: number; column: number }>;
  extensions?: Record<string, unknown>;
}
```

## Testing Utilities

```typescript
// Test if error is thrown
expect(() => doSomething()).toThrow(ObjectNotFoundError);

// Test error properties
try {
  await operation();
} catch (err) {
  expect(isWeaviateError(err)).toBe(true);
  expect(err.category).toBe('not_found');
  expect(err.statusCode).toBe(404);
  expect(err.isRetryable).toBe(false);
}

// Test error mapping
const error = mapHttpError({ status: 429 });
expect(error).toBeInstanceOf(RateLimitedError);
expect(error.isRetryable).toBe(true);
```

## Integration with Resilience Layer

```typescript
import { RetryPolicy } from 'shared/resilience';
import { isRetryableError, getRetryAfter } from './errors';

const policy = new RetryPolicy({
  maxRetries: 3,
  shouldRetry: isRetryableError,
  getRetryDelay: (err, attempt) => {
    const retryAfter = getRetryAfter(err);
    return retryAfter ? retryAfter * 1000 : Math.pow(2, attempt) * 1000;
  },
});
```

## Error Response Formats

### HTTP Response
```typescript
interface HttpErrorResponse {
  status: number;
  statusText?: string;
  data?: {
    error?: string | { message?: string };
    message?: string;
    errors?: Array<{ message: string }>;
  };
  headers?: Record<string, string>;
}
```

### GraphQL Response
```typescript
interface GraphQLResponse {
  data?: any;
  errors?: Array<{
    message: string;
    path?: (string | number)[];
    locations?: Array<{ line: number; column: number }>;
    extensions?: Record<string, unknown>;
  }>;
}
```

## Best Practices

1. ✓ Use specific error types, not generic WeaviateError
2. ✓ Check `isRetryable` before retry logic
3. ✓ Include context in `details` for debugging
4. ✓ Use type guards for type-safe handling
5. ✓ Preserve error causes when wrapping
6. ✓ Log errors with sanitized details
7. ✓ Retry only failed items in batch operations
8. ✓ Inspect GraphQL errors for field-level issues
9. ✓ Respect retry-after headers
10. ✓ Use categories for broad error handling
