# AWS SES HTTP Module

Production-ready HTTP client for AWS SES v2 API with TypeScript support.

## Overview

This module provides a comprehensive HTTP layer for communicating with the AWS SES v2 REST API. It includes:

- **Type-safe request building** with fluent interfaces
- **Transport abstraction** supporting Fetch API and undici
- **Connection pooling** for high-throughput scenarios
- **Response parsing** with pagination support
- **Error handling** with AWS-specific error types
- **Retry logic** with exponential backoff (in client.ts)

## Architecture

```
┌─────────────────┐
│  SesHttpClient  │  High-level client
│                 │  - Request signing
│                 │  - Retry logic
│                 │  - Rate limiting
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   SesRequest    │  Request building
│                 │  - Query params
│                 │  - Headers
│                 │  - JSON body
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Transport     │  HTTP abstraction
│                 │  - Fetch API
│                 │  - undici Pool
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   HTTP Layer    │  Actual HTTP
└─────────────────┘
```

## Files

### Core Files

- **`types.ts`** - TypeScript type definitions for HTTP operations
- **`transport.ts`** - Transport layer abstraction (Fetch API)
- **`pool.ts`** - Connection pooling using undici
- **`request.ts`** - Request builder with fluent API
- **`response.ts`** - Response parsing and error extraction
- **`client.ts`** - High-level HTTP client (pre-existing)
- **`index.ts`** - Module exports

### Test Files

- **`__tests__/types.test.ts`** - Type definition tests
- **`__tests__/request.test.ts`** - Request builder tests
- **`__tests__/response.test.ts`** - Response parsing tests

## Usage

### Basic Request Building

```typescript
import { SesRequest } from './http';

// Create a GET request
const request = SesRequest.get('/v2/email/identities')
  .withQuery('PageSize', '100')
  .withQuery('NextToken', 'abc123');

// Create a POST request
const sendRequest = SesRequest.post('/v2/email/outbound-emails', {
  FromEmailAddress: 'sender@example.com',
  Destination: {
    ToAddresses: ['recipient@example.com']
  },
  Content: {
    Simple: {
      Subject: { Data: 'Test Email' },
      Body: { Text: { Data: 'Hello, World!' } }
    }
  }
});

// Convert to HTTP request
const httpRequest = request.toHttpRequest('https://email.us-east-1.amazonaws.com');
```

### Using the Transport Layer

```typescript
import { FetchTransport } from './http';

const transport = new FetchTransport({
  timeout: 30000,
  connectTimeout: 10000,
  keepAlive: true
});

const response = await transport.send({
  method: 'GET',
  url: 'https://email.us-east-1.amazonaws.com/v2/email/identities',
  headers: {
    'Authorization': 'AWS4-HMAC-SHA256 ...',
    'Content-Type': 'application/json'
  }
});
```

### Connection Pooling

For high-throughput scenarios, use the connection pool:

```typescript
import { ConnectionPool } from './http';

const pool = new ConnectionPool('https://email.us-east-1.amazonaws.com', {
  maxIdlePerHost: 20,
  idleTimeout: 90000,     // 90 seconds
  maxLifetime: 300000     // 5 minutes
});

try {
  const response = await pool.request({
    method: 'GET',
    path: '/v2/email/identities',
    headers: {
      'Authorization': 'AWS4-HMAC-SHA256 ...'
    }
  });

  console.log('Status:', response.status);
  console.log('Body:', response.body);
} finally {
  // Always close the pool when done
  await pool.close();
}

// Monitor pool statistics
const stats = pool.stats();
console.log('Active connections:', stats.activeConnections);
console.log('Reuse rate:', (stats.reuseRate() * 100).toFixed(1) + '%');
console.log('Utilization:', (stats.utilizationRate() * 100).toFixed(1) + '%');
```

### Response Parsing

```typescript
import {
  parseResponse,
  parsePaginatedResponse,
  parseAwsError,
  isSuccessResponse,
  extractNextToken
} from './http';

// Parse JSON response
interface SendEmailResponse {
  MessageId: string;
}

const data = parseResponse<SendEmailResponse>(response.body);
console.log('Message ID:', data.MessageId);

// Parse paginated response
interface Identity {
  IdentityName: string;
  IdentityType: string;
}

const result = parsePaginatedResponse<Identity>(response.body, 'Identities');
console.log('Items:', result.items);
console.log('Next token:', result.nextToken);

// Handle errors
if (!isSuccessResponse(response)) {
  const error = parseAwsError(response);
  console.error('Error:', error.type);
  console.error('Message:', error.message);
  console.error('Retryable:', error.retryable);
  console.error('Request ID:', error.requestId);
}
```

### Using the High-Level Client

The `client.ts` file provides a high-level client that integrates with the rest of the SES module:

```typescript
import { SesHttpClient, createSesHttpClient } from './http';
import { SesConfig } from '../config';
import { AwsCredentials } from '../signing';

// Create client with config and credentials
const config: SesConfig = {
  region: 'us-east-1',
  timeout: 30000,
  connectTimeout: 10000,
  maxRetries: 3
};

const credentials: AwsCredentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  sessionToken: undefined
};

const client = createSesHttpClient(config, credentials);

// Make requests
const response = await client.post<SendEmailResponse>(
  '/v2/email/outbound-emails',
  {
    FromEmailAddress: 'sender@example.com',
    Destination: {
      ToAddresses: ['recipient@example.com']
    },
    Content: {
      Simple: {
        Subject: { Data: 'Test' },
        Body: { Text: { Data: 'Hello' } }
      }
    }
  }
);

console.log('Message ID:', response.MessageId);
```

## Type Definitions

### HttpRequest

```typescript
interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers: Record<string, string>;
  body?: string;
}
```

### HttpResponse

```typescript
interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
```

### HttpClientConfig

```typescript
interface HttpClientConfig {
  timeout?: number;           // Default: 30000ms
  connectTimeout?: number;    // Default: 10000ms
  keepAlive?: boolean;        // Default: true
}
```

### PoolOptions

```typescript
interface PoolOptions {
  maxIdlePerHost?: number;    // Default: 10
  idleTimeout?: number;       // Default: 90000ms
  maxLifetime?: number;       // Default: 300000ms
}
```

## Features

### Request Building

- Fluent API for building requests
- Type-safe method chaining
- Query parameter encoding
- Header management
- JSON body serialization
- Static factory methods for common HTTP methods

### Transport Layer

- Abstract transport interface
- Fetch API implementation
- Timeout handling with AbortController
- Connection keep-alive support
- Error handling and conversion

### Connection Pooling

- undici-based connection pooling
- Configurable pool size and timeouts
- Connection reuse tracking
- Pool health monitoring
- Statistics reporting (reuse rate, utilization)

### Response Parsing

- JSON deserialization
- Pagination token extraction
- AWS error response parsing
- Retryable error detection
- Request ID extraction
- Response metadata extraction (rate limits, etc.)

### Error Handling

- AWS-specific error types
- HTTP status code mapping
- Retryable vs. non-retryable errors
- Request ID tracking for debugging
- Detailed error messages

## Testing

The module includes comprehensive tests:

```bash
# Run all tests
npm test

# Run HTTP module tests only
npm test -- src/http

# Run with coverage
npm run test:coverage
```

## Dependencies

- **undici** - High-performance HTTP client for connection pooling
- Node.js 18+ for native Fetch API support

## Best Practices

1. **Use connection pooling for high-throughput**: Create one ConnectionPool and reuse it
2. **Always close pools**: Call `pool.close()` when done to free resources
3. **Monitor pool statistics**: Use `pool.stats()` to track performance
4. **Handle errors properly**: Check `error.retryable` to decide retry logic
5. **Set appropriate timeouts**: Balance between reliability and responsiveness
6. **Use the high-level client**: Let `SesHttpClient` handle signing and retries

## Performance Tips

- Connection pooling can improve throughput by 2-5x for bulk operations
- Typical reuse rate should be >80% for steady-state workloads
- Pool utilization >70% may indicate need to increase `maxIdlePerHost`
- Monitor `activeConnections` to detect connection leaks

## License

See LICENSE file in repository root.
