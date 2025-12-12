# Google Drive TypeScript Integration

Type-safe Google Drive API integration module following SPARC methodology.

## Features

- **Full Type Safety**: Comprehensive TypeScript types with Zod validation
- **OAuth 2.0 & Service Accounts**: Support for both authentication methods
- **Resilience Patterns**: Built-in retry logic, circuit breaker, and rate limiting
- **Pagination**: Automatic handling of cursor-based pagination
- **Transport Abstraction**: Pluggable HTTP transport with interceptor support
- **Error Taxonomy**: Comprehensive error hierarchy with retryability hints

## Installation

```bash
npm install @integrations/google-drive
```

## Quick Start

### OAuth 2.0 Authentication

```typescript
import {
  createOAuth2Provider,
  createConfig,
  createHttpTransport,
} from "@integrations/google-drive";

// Create OAuth2 provider
const auth = createOAuth2Provider({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  refreshToken: "your-refresh-token",
});

// Create configuration
const config = createConfig({ auth });
```

### Service Account Authentication

```typescript
import {
  createServiceAccountProvider,
  loadServiceAccountFromKeyFile,
  SCOPES,
} from "@integrations/google-drive";

// Load service account credentials
const keyFile = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
const credentials = loadServiceAccountFromKeyFile(
  keyFile,
  [SCOPES.DRIVE], // Required scopes
  "user@example.com" // Optional subject for domain-wide delegation
);

// Create service account provider
const auth = createServiceAccountProvider(credentials);
```

## Core Modules

### 1. Configuration (`src/config/index.ts`)

Provides configuration interfaces and defaults:

```typescript
interface GoogleDriveConfig {
  auth: AuthProvider;
  baseUrl?: string;
  uploadUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryConfig?: RetryConfig;
  circuitBreakerConfig?: CircuitBreakerConfig;
  rateLimitConfig?: RateLimitConfig;
  uploadChunkSize?: number;
  userAgent?: string;
}
```

**OAuth 2.0 Scopes:**
- `SCOPES.DRIVE` - Full access to Drive files
- `SCOPES.DRIVE_READONLY` - Read-only access
- `SCOPES.DRIVE_FILE` - Access to files created by the app
- `SCOPES.DRIVE_APPDATA` - Access to app data folder
- `SCOPES.DRIVE_METADATA` - Metadata read/write access

### 2. Authentication (`src/auth/index.ts`)

Two authentication providers:

**OAuth2Provider:**
```typescript
const provider = new OAuth2Provider({
  clientId: "...",
  clientSecret: "...",
  refreshToken: "...",
});

const token = await provider.getAccessToken();
```

**ServiceAccountProvider:**
```typescript
const provider = new ServiceAccountProvider({
  clientEmail: "service@project.iam.gserviceaccount.com",
  privateKey: "-----BEGIN PRIVATE KEY-----\n...",
  scopes: [SCOPES.DRIVE],
});

const token = await provider.getAccessToken();
```

### 3. Error Handling (`src/errors/index.ts`)

Comprehensive error taxonomy:

```typescript
try {
  // API call
} catch (error) {
  if (error instanceof GoogleDriveError) {
    console.log(error.type); // Error type
    console.log(error.isRetryable()); // Whether retryable
    console.log(error.getRetryAfter()); // Retry delay hint
    console.log(error.statusCode); // HTTP status code
  }
}
```

**Error Types:**
- `ConfigurationError` - Invalid configuration
- `AuthenticationError` - Auth failures
- `AuthorizationError` - Permission denied
- `RequestError` - Invalid requests
- `ResourceError` - Resource not found
- `QuotaError` - Rate limits exceeded
- `UploadError` - Upload failures
- `NetworkError` - Network issues
- `ServerError` - Server-side errors

### 4. Transport Layer (`src/transport/index.ts`)

HTTP abstraction with interceptors:

```typescript
const transport = createHttpTransport();

// Add auth interceptor
transport.addRequestInterceptor(
  createAuthInterceptor(async () => {
    const token = await auth.getAccessToken();
    return token.token;
  })
);

// Add user agent
transport.addRequestInterceptor(
  createUserAgentInterceptor("MyApp/1.0")
);

// Send request
const response = await transport.send({
  method: "GET",
  url: "https://www.googleapis.com/drive/v3/files",
  headers: { "Content-Type": "application/json" },
});
```

### 5. Types & Validation (`src/types/index.ts`)

Comprehensive type definitions with Zod schemas:

```typescript
import { DriveFile, DriveFileSchema } from "@integrations/google-drive";

// Runtime validation
const file = DriveFileSchema.parse(apiResponse);

// Type-safe access
console.log(file.id, file.name, file.mimeType);
```

**Key Types:**
- `DriveFile` - File metadata
- `FileList` - Paginated file list
- `Permission` - File permission
- `Comment` - File comment
- `Revision` - File revision
- `Change` - Change notification
- `Drive` - Shared drive
- `StorageQuota` - Storage quota info

### 6. Pagination (`src/pagination/index.ts`)

Async iterators for paginated results:

```typescript
const iterator = createPageIterator(async (pageToken) => {
  const response = await fetchFiles({ pageToken });
  return {
    items: response.files,
    nextPageToken: response.nextPageToken,
  };
});

// Iterate all items
for await (const file of iterator) {
  console.log(file.name);
}

// Or collect all at once
const allFiles = await iterator.collectAll();
```

### 7. Resilience (`src/resilience/index.ts`)

Built-in resilience patterns:

**Retry Executor:**
```typescript
const retryExecutor = new RetryExecutor({
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  respectRetryAfter: true,
  jitterFactor: 0.1,
});

const result = await retryExecutor.execute(async () => {
  return await apiCall();
});
```

**Circuit Breaker:**
```typescript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeoutMs: 60000,
  enabled: true,
});

const result = await circuitBreaker.execute(async () => {
  return await apiCall();
});
```

**Rate Limiter:**
```typescript
const rateLimiter = new RateLimitTracker({
  trackFromHeaders: true,
  preemptiveThrottling: true,
  userQueriesPer100Seconds: 1000,
  projectQueriesPerDay: 10_000_000,
  maxConcurrentRequests: 10,
});

await rateLimiter.acquire();
try {
  await apiCall();
} finally {
  rateLimiter.release();
}
```

**Orchestrator (All Combined):**
```typescript
const resilience = createResilience(
  retryConfig,
  circuitBreakerConfig,
  rateLimitConfig
);

const result = await resilience.execute(async () => {
  return await apiCall();
});
```

## Architecture

The module follows clean architecture principles:

```
src/
├── index.ts                 # Public API exports
├── config/                  # Configuration
│   └── index.ts
├── auth/                    # Authentication providers
│   └── index.ts
├── errors/                  # Error taxonomy
│   └── index.ts
├── transport/               # HTTP transport layer
│   └── index.ts
├── types/                   # Type definitions & schemas
│   └── index.ts
├── pagination/              # Pagination utilities
│   └── index.ts
└── resilience/              # Retry, circuit breaker, rate limiting
    └── index.ts
```

## Development

```bash
# Install dependencies
npm install

# Type checking
npm run type-check

# Build
npm run build

# Test
npm test
```

## Design Principles

1. **Type Safety**: Full TypeScript coverage with strict mode
2. **Runtime Validation**: Zod schemas for API responses
3. **Testability**: Interface-based design (London-School TDD)
4. **Resilience**: Built-in retry, circuit breaker, rate limiting
5. **Clean Dependencies**: No circular dependencies
6. **Observability**: Structured errors with context

## References

- [Google Drive API v3 Documentation](https://developers.google.com/drive/api/v3/reference)
- [Specification](/workspaces/integrations/plans/gdrive/specification-google-drive.md)
- [OAuth2 TypeScript Reference](/workspaces/integrations/oauth2/typescript/src/client/oauth2-client.ts)

## License

MIT
