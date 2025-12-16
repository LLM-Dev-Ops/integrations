# Weaviate Authentication Module

This module provides comprehensive authentication support for Weaviate with multiple authentication methods, automatic token management, and secure credential handling.

## Features

- **Multiple Authentication Methods**: Support for API Key, OIDC, OAuth2 Client Credentials, and no authentication
- **Automatic Token Management**: Automatic token refresh before expiration with configurable buffer
- **Secure Credential Handling**: API keys and secrets are automatically redacted in logs and JSON serialization
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Factory Pattern**: Easy provider creation through factory functions
- **Environment Variable Support**: Automatic configuration from environment variables

## Authentication Methods

### 1. No Authentication (Noop)

For local development or testing environments without authentication.

```typescript
import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

const provider = createAuthProvider({
  method: AuthType.None,
});

const headers = await provider.getAuthHeaders(); // Returns {}
```

### 2. API Key Authentication

Bearer token authentication using a static API key.

```typescript
import {
  createAuthProvider,
  AuthType,
  createApiKeyAuthProvider,
  createApiKeyAuthProviderFromEnv
} from '@llmdevops/weaviate-integration/auth';

// Using factory function
const provider = createAuthProvider({
  method: AuthType.ApiKey,
  apiKey: 'your-api-key-here',
});

// Using specific provider
const provider2 = createApiKeyAuthProvider('your-api-key-here');

// From environment variable (WEAVIATE_API_KEY)
const provider3 = createApiKeyAuthProviderFromEnv();

// Get auth headers
const headers = await provider.getAuthHeaders();
// { Authorization: 'Bearer your-api-key-here' }
```

### 3. OIDC Authentication

OpenID Connect token authentication with optional refresh support.

```typescript
import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

// Simple OIDC with static token
const provider = createAuthProvider({
  method: AuthType.Oidc,
  token: 'your-oidc-access-token',
});

// OIDC with token refresh
const providerWithRefresh = createAuthProvider({
  method: AuthType.Oidc,
  token: 'your-oidc-access-token',
  refreshToken: 'your-refresh-token',
  expiresIn: 3600, // 1 hour
  refreshCallback: async (currentToken, refreshToken) => {
    // Implement your token refresh logic
    const response = await fetch('https://your-oidc-provider.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  },
});
```

### 4. OAuth2 Client Credentials

OAuth2 Client Credentials flow with automatic token management.

```typescript
import {
  createAuthProvider,
  AuthType,
  createClientCredentialsAuthProvider,
  createClientCredentialsAuthProviderFromEnv
} from '@llmdevops/weaviate-integration/auth';

// Using factory function
const provider = createAuthProvider({
  method: AuthType.ClientCredentials,
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  tokenEndpoint: 'https://auth.weaviate.io/oauth2/token',
  scopes: ['weaviate.read', 'weaviate.write'], // optional
});

// Using specific provider
const provider2 = createClientCredentialsAuthProvider({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  tokenEndpoint: 'https://auth.weaviate.io/oauth2/token',
  scopes: ['weaviate.read', 'weaviate.write'],
});

// From environment variables
// Requires: WEAVIATE_CLIENT_ID, WEAVIATE_CLIENT_SECRET, WEAVIATE_TOKEN_ENDPOINT
// Optional: WEAVIATE_SCOPES (comma-separated)
const provider3 = createClientCredentialsAuthProviderFromEnv();

// Token is automatically fetched and refreshed
const headers = await provider.getAuthHeaders();
// { Authorization: 'Bearer <auto-refreshed-token>' }

// Check token status
console.log('Token expired?', provider2.isExpired());
console.log('Time until expiration:', provider2.getTimeUntilExpiration(), 'ms');
```

## Factory Functions

### Auto-detect from Environment

```typescript
import { createAuthProviderFromEnv } from '@llmdevops/weaviate-integration/auth';

// Auto-detects authentication method from environment variables
// Priority: Client Credentials > OIDC > API Key > None
const provider = createAuthProviderFromEnv();

// Use custom prefix
const customProvider = createAuthProviderFromEnv('MY_APP');
```

### Environment Variables

```bash
# API Key Authentication
export WEAVIATE_API_KEY="your-api-key"

# OIDC Authentication
export WEAVIATE_OIDC_TOKEN="your-oidc-token"
export WEAVIATE_OIDC_EXPIRES_IN="3600"  # optional

# Client Credentials OAuth2
export WEAVIATE_CLIENT_ID="your-client-id"
export WEAVIATE_CLIENT_SECRET="your-client-secret"
export WEAVIATE_TOKEN_ENDPOINT="https://auth.weaviate.io/oauth2/token"
export WEAVIATE_SCOPES="weaviate.read,weaviate.write"  # optional, comma-separated
```

## Security Features

### Automatic Credential Redaction

All authentication providers automatically redact sensitive information in:
- `toString()` - Prevents logging of credentials
- `toJSON()` - Prevents JSON serialization of credentials
- `Symbol.for('nodejs.util.inspect.custom')` - Prevents Node.js inspection

```typescript
const provider = createApiKeyAuthProvider('secret-key');

console.log(provider.toString());
// [ApiKeyAuthProvider: apiKey=***REDACTED***]

console.log(JSON.stringify(provider));
// {"type":"ApiKeyAuthProvider","apiKey":"***REDACTED***"}
```

### Secure Token Comparison

The module uses timing-safe comparison for tokens to prevent timing attacks.

### Clear Credentials from Memory

```typescript
const provider = createApiKeyAuthProvider('secret-key');

// When done, clear credentials from memory
provider.clear(); // Best-effort memory clearing
```

## Validation

```typescript
import { validateAuthConfig, AuthType } from '@llmdevops/weaviate-integration/auth';

try {
  validateAuthConfig({
    method: AuthType.ApiKey,
    apiKey: 'my-key',
  });
  console.log('Configuration is valid');
} catch (error) {
  console.error('Invalid configuration:', error.message);
}
```

## Advanced Usage

### Token Expiration Management

```typescript
const provider = createClientCredentialsAuthProvider({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  tokenEndpoint: 'https://auth.example.com/token',
});

// Check if token is expired (includes 60-second buffer)
if (provider.isExpired()) {
  await provider.refresh();
}

// Get token expiration timestamp
const expiresAt = provider.getTokenExpiration(); // milliseconds since epoch

// Get time remaining until expiration
const remaining = provider.getTimeUntilExpiration(); // milliseconds

// Clear cached token (forces refresh on next use)
provider.clearCache();
```

### Custom OIDC Token Refresh

```typescript
import { OidcAuthProvider } from '@llmdevops/weaviate-integration/auth';

const provider = new OidcAuthProvider({
  token: 'initial-token',
  expiresIn: 3600,
});

// Set refresh callback later
provider.setRefreshCallback(async (token, refreshToken) => {
  // Your refresh logic
  return {
    accessToken: 'new-token',
    expiresIn: 3600,
  };
});

// Update token manually
provider.updateToken('new-token', 3600);
```

## Error Handling

All authentication methods throw descriptive errors:

```typescript
try {
  const provider = createAuthProvider({
    method: AuthType.ApiKey,
    apiKey: '', // Invalid: empty key
  });
} catch (error) {
  console.error(error.message); // "API key cannot be empty"
}

try {
  const headers = await provider.getAuthHeaders();
} catch (error) {
  console.error('Failed to get auth headers:', error.message);
}
```

## Integration Example

```typescript
import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

// Create auth provider
const authProvider = createAuthProvider({
  method: AuthType.ClientCredentials,
  clientId: process.env.WEAVIATE_CLIENT_ID!,
  clientSecret: process.env.WEAVIATE_CLIENT_SECRET!,
  tokenEndpoint: process.env.WEAVIATE_TOKEN_ENDPOINT!,
});

// Use with HTTP client
async function makeWeaviateRequest(url: string, body?: any) {
  const headers = await authProvider.getAuthHeaders();

  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return response.json();
}

// Example query
const results = await makeWeaviateRequest(
  'https://your-weaviate-instance.com/v1/objects',
);
```

## Type Definitions

```typescript
// AuthProvider interface
interface AuthProvider {
  getAuthHeaders(): Promise<Record<string, string>>;
  isExpired(): boolean;
  refresh?(): Promise<void>;
}

// Auth configuration types
type WeaviateAuthConfig =
  | NoAuthConfig
  | ApiKeyAuthConfig
  | OidcAuthConfig
  | ClientCredentialsAuthConfig;

// Auth type enum
enum AuthType {
  None = 'none',
  ApiKey = 'api_key',
  Oidc = 'oidc',
  ClientCredentials = 'client_credentials',
}
```

## Best Practices

1. **Use Environment Variables**: Store credentials in environment variables, never in code
2. **Use Factory Functions**: Prefer `createAuthProvider()` for type-safe provider creation
3. **Handle Refresh Errors**: Implement proper error handling for token refresh failures
4. **Clear Credentials**: Call `clear()` on API key providers when done
5. **Monitor Expiration**: Check token expiration status for long-running applications
6. **Use HTTPS**: Always use HTTPS for token endpoints to prevent credential exposure

## License

Part of the LLM Dev Ops Integrations suite.
