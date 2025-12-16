# Weaviate Error Module

The error module provides a comprehensive error taxonomy for handling various error conditions when interacting with Weaviate. It follows TypeScript best practices and provides proper error inheritance, type guards, and detailed error information.

## Overview

All errors extend from the base `WeaviateError` class, which provides:

- **Category**: Categorization for error handling logic
- **Status Code**: HTTP status code when applicable
- **Retry Information**: Whether the error is retryable and retry-after timing
- **Details**: Additional error context
- **Cause Chaining**: Support for underlying error causes

## Error Categories

Errors are categorized into the following types:

- `configuration` - Client misconfiguration
- `authentication` - Auth failures (401/403)
- `validation` - Invalid request data (422)
- `rate_limit` - Rate limiting (429)
- `network` - Network/connection issues
- `server` - Server errors (500/503)
- `not_found` - Resource not found (404)
- `batch` - Batch operation failures
- `graphql` - GraphQL query errors
- `tenant` - Tenant-specific errors
- `schema` - Schema-related errors
- `internal` - Uncategorized internal errors

## Error Types

### Configuration Errors

```typescript
import { ConfigurationError } from './errors';

throw new ConfigurationError('Missing endpoint URL', {
  requiredFields: ['endpoint'],
});
```

**Properties:**
- Not retryable
- No HTTP status code
- Indicates invalid client configuration

### Authentication Errors

```typescript
import { AuthenticationError, UnauthorizedError, ForbiddenError } from './errors';

// Invalid credentials
throw new AuthenticationError('Invalid API key');

// Unauthorized (401) - alias for AuthenticationError
throw new UnauthorizedError('Authentication required');

// Forbidden (403) - insufficient permissions
throw new ForbiddenError('Insufficient permissions for this resource');
```

**Properties:**
- Not retryable (credentials must be fixed)
- Status codes: 401 (Unauthorized), 403 (Forbidden)

### Not Found Errors (404)

```typescript
import { ObjectNotFoundError, ClassNotFoundError, TenantNotFoundError } from './errors';

// Object not found
throw new ObjectNotFoundError('123e4567-e89b-12d3-a456-426614174000', 'Article');

// Class not found
throw new ClassNotFoundError('NonExistentClass');

// Tenant not found
throw new TenantNotFoundError('tenant-123', 'MultiTenantClass');
```

**Properties:**
- Not retryable (resource doesn't exist)
- Status code: 404
- Include resource identifiers in details

### Validation Errors (422)

```typescript
import { InvalidObjectError, InvalidFilterError, InvalidVectorError } from './errors';

// Object validation failure
throw new InvalidObjectError('Missing required property: title');

// Filter validation failure
throw new InvalidFilterError('Invalid operator for property type');

// Vector validation failure
throw new InvalidVectorError('Vector dimension mismatch: expected 384, got 768');
```

**Properties:**
- Not retryable (request data is invalid)
- Status code: 422
- Include validation details

### Rate Limiting (429)

```typescript
import { RateLimitedError } from './errors';

throw new RateLimitedError('Too many requests', 60); // Retry after 60 seconds
```

**Properties:**
- Retryable
- Status code: 429
- Includes retry-after duration

### Server Errors (5xx)

```typescript
import { ServiceUnavailableError, InternalError } from './errors';

// Service temporarily unavailable (503)
throw new ServiceUnavailableError('Weaviate is temporarily unavailable', 30);

// Internal server error (500)
throw new InternalError('Unexpected server error', 500);
```

**Properties:**
- Retryable (may be transient)
- Status codes: 500, 503, etc.
- May include retry-after

### Network Errors

```typescript
import { TimeoutError, ConnectionError } from './errors';

// Request timeout
throw new TimeoutError('Request timed out after 30s');

// Connection failure
const originalError = new Error('ECONNREFUSED');
throw new ConnectionError('Failed to connect to Weaviate', originalError);
```

**Properties:**
- Retryable (may succeed on retry)
- No HTTP status code
- Support for cause chaining

### Batch Errors

```typescript
import { BatchPartialFailureError } from './errors';

throw new BatchPartialFailureError(
  95, // successful count
  5,  // failed count
  [
    { index: 10, objectId: 'obj-1', message: 'Invalid property' },
    { index: 25, objectId: 'obj-2', message: 'Vector dimension mismatch' },
    { index: 50, message: 'Validation failed' },
  ]
);

// Get indices of failed items for retry
const failedIndices = error.getFailedIndices(); // [10, 25, 50]
```

**Properties:**
- Partially retryable (only failed items)
- Status code: 207 (Multi-Status)
- Includes detailed per-item error information
- Helper method to extract failed indices

### GraphQL Errors

```typescript
import { GraphQLError } from './errors';

throw new GraphQLError([
  {
    message: 'Field "invalidField" not found',
    path: ['Get', 'Article', 'invalidField'],
    locations: [{ line: 3, column: 5 }],
    extensions: { code: 'FIELD_NOT_FOUND' },
  },
  {
    message: 'Invalid filter syntax',
    path: ['Get', 'Article'],
  },
]);

// Check for specific error
if (error.hasErrorMessage('Field')) {
  // Handle field-related error
}

// Get first error message
const firstError = error.getFirstErrorMessage();
```

**Properties:**
- Not retryable (query syntax/structure issues)
- No HTTP status code
- Contains array of GraphQL error details
- Helper methods for error inspection

### Tenant Errors

```typescript
import { TenantNotActiveError } from './errors';

throw new TenantNotActiveError('tenant-123', 'INACTIVE', 'MultiTenantClass');
```

**Properties:**
- Not retryable
- Status code: 422
- Indicates tenant exists but is not in active state

## Error Mapping

The module provides utilities to map HTTP responses and network errors to appropriate error types:

### HTTP Error Mapping

```typescript
import { mapHttpError } from './errors';

const response = {
  status: 404,
  statusText: 'Not Found',
  data: { message: "Class 'Article' not found" },
  headers: {},
};

const error = mapHttpError(response); // ClassNotFoundError
```

### Network Error Mapping

```typescript
import { mapNetworkError } from './errors';

try {
  await fetch('http://weaviate:8080');
} catch (err) {
  const error = mapNetworkError(err as Error); // ConnectionError or TimeoutError
  throw error;
}
```

### Universal Error Mapping

```typescript
import { mapToWeaviateError } from './errors';

// Handles any error type and converts to WeaviateError
try {
  // ... operation
} catch (err) {
  const weaviateError = mapToWeaviateError(err);
  // Always a WeaviateError instance
}
```

### GraphQL Error Handling

```typescript
import { handleGraphQLResponse, extractGraphQLErrors } from './errors';

const response = await graphqlQuery(...);

// Throws GraphQLError if response contains errors
handleGraphQLResponse(response);

// Or manually extract errors
const errors = extractGraphQLErrors(response);
if (errors) {
  // Handle errors
}
```

## Type Guards

Type guards for checking error types and properties:

```typescript
import {
  isWeaviateError,
  isRetryableError,
  isErrorCategory,
  getRetryAfter,
  isConfigurationError,
  isAuthenticationError,
  isBatchPartialFailureError,
  isGraphQLError,
  isNotFoundError,
  isValidationError,
  isNetworkError,
} from './errors';

try {
  // ... operation
} catch (err) {
  // Check if it's a Weaviate error
  if (isWeaviateError(err)) {
    console.log(`Category: ${err.category}`);
  }

  // Check if retryable
  if (isRetryableError(err)) {
    const retryAfter = getRetryAfter(err);
    if (retryAfter) {
      console.log(`Retry after ${retryAfter} seconds`);
    }
  }

  // Check specific category
  if (isErrorCategory(err, 'authentication')) {
    // Handle auth errors
  }

  // Check specific error type
  if (isAuthenticationError(err)) {
    // Handle authentication failure
  }

  if (isBatchPartialFailureError(err)) {
    // Retry failed items
    const failedIndices = err.getFailedIndices();
  }

  if (isNotFoundError(err)) {
    // Handle 404 errors (ObjectNotFoundError | ClassNotFoundError | TenantNotFoundError)
  }
}
```

## Usage Examples

### Basic Error Handling

```typescript
import { WeaviateClient } from './client';
import { isRetryableError, getRetryAfter } from './errors';

async function getObject(id: string) {
  try {
    const client = new WeaviateClient(config);
    return await client.objects.get(id);
  } catch (err) {
    if (isRetryableError(err)) {
      const retryAfter = getRetryAfter(err);
      console.log(`Retryable error, wait ${retryAfter}s before retry`);
      // Implement retry logic
    } else {
      // Non-retryable, handle differently
      console.error('Non-retryable error:', err);
    }
    throw err;
  }
}
```

### Batch Operation Error Handling

```typescript
import { BatchPartialFailureError, isBatchPartialFailureError } from './errors';

async function batchImport(objects: Object[]) {
  try {
    return await client.batch.create(objects);
  } catch (err) {
    if (isBatchPartialFailureError(err)) {
      console.log(`${err.successful} succeeded, ${err.failed} failed`);

      // Get failed objects for retry
      const failedIndices = err.getFailedIndices();
      const failedObjects = failedIndices.map(i => objects[i]);

      // Log detailed errors
      err.errors.forEach(error => {
        console.error(`Object at index ${error.index}: ${error.message}`);
      });

      // Retry failed objects
      return await retryBatch(failedObjects);
    }
    throw err;
  }
}
```

### GraphQL Error Handling

```typescript
import { isGraphQLError, handleGraphQLResponse } from './errors';

async function graphqlQuery(query: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

  const data = await response.json();

  try {
    handleGraphQLResponse(data); // Throws if errors present
    return data;
  } catch (err) {
    if (isGraphQLError(err)) {
      console.error('GraphQL errors:');
      err.errors.forEach((error, index) => {
        console.error(`  ${index + 1}. ${error.message}`);
        if (error.path) {
          console.error(`     Path: ${error.path.join('.')}`);
        }
      });
    }
    throw err;
  }
}
```

### Tenant-Aware Error Handling

```typescript
import { TenantNotFoundError, TenantNotActiveError } from './errors';

async function queryTenant(className: string, tenant: string) {
  try {
    return await client.search.nearVector(
      { vector: [/* ... */] },
      { className, tenant }
    );
  } catch (err) {
    if (err instanceof TenantNotFoundError) {
      console.error(`Tenant ${tenant} doesn't exist in ${className}`);
      // Maybe create tenant?
    } else if (err instanceof TenantNotActiveError) {
      console.error(`Tenant ${tenant} is ${err.details?.status}`);
      // Maybe activate tenant?
      await client.tenants.activate(className, tenant);
      // Retry query
      return await queryTenant(className, tenant);
    }
    throw err;
  }
}
```

## Error Serialization

All errors support JSON serialization for logging and debugging:

```typescript
const error = new InvalidVectorError('Dimension mismatch', { expected: 384, got: 768 });

// Convert to JSON
const json = error.toJSON();
console.log(JSON.stringify(json, null, 2));
// {
//   "name": "InvalidVectorError",
//   "category": "validation",
//   "message": "Dimension mismatch",
//   "statusCode": 422,
//   "isRetryable": false,
//   "retryAfter": undefined,
//   "details": {
//     "expected": 384,
//     "got": 768
//   },
//   "cause": undefined
// }

// Use toString for readable output
console.log(error.toString());
// InvalidVectorError: Dimension mismatch (HTTP 422)
```

## Best Practices

1. **Always use specific error types** rather than generic WeaviateError
2. **Check retryability** before implementing retry logic
3. **Include context** in error details for debugging
4. **Use type guards** for type-safe error handling
5. **Preserve error causes** when wrapping errors
6. **Log error details** but sanitize sensitive information
7. **Handle batch errors** by retrying only failed items
8. **Inspect GraphQL errors** for detailed field-level issues

## Integration with Resilience Layer

The error module is designed to work with the resilience layer (`shared/resilience`):

```typescript
import { RetryPolicy } from 'shared/resilience';
import { isRetryableError, getRetryAfter } from './errors';

const retryPolicy = new RetryPolicy({
  maxRetries: 3,
  shouldRetry: (error) => isRetryableError(error),
  getRetryDelay: (error, attempt) => {
    const retryAfter = getRetryAfter(error);
    if (retryAfter) {
      return retryAfter * 1000; // Convert to ms
    }
    // Exponential backoff
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  },
});
```
