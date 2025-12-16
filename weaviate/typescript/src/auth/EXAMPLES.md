# Weaviate Auth Module - Usage Examples

Comprehensive examples showing how to use the Weaviate authentication module in real-world scenarios.

## Table of Contents

1. [Quick Start](#quick-start)
2. [API Key Authentication](#api-key-authentication)
3. [OIDC Authentication](#oidc-authentication)
4. [OAuth2 Client Credentials](#oauth2-client-credentials)
5. [Factory Pattern Usage](#factory-pattern-usage)
6. [Environment Variables](#environment-variables)
7. [Integration with HTTP Client](#integration-with-http-client)
8. [Error Handling](#error-handling)
9. [Advanced Scenarios](#advanced-scenarios)

## Quick Start

```typescript
import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

// Create an auth provider
const authProvider = createAuthProvider({
  method: AuthType.ApiKey,
  apiKey: 'your-api-key-here',
});

// Get authentication headers
const headers = await authProvider.getAuthHeaders();
console.log(headers);
// { Authorization: 'Bearer your-api-key-here' }

// Use with fetch
const response = await fetch('https://weaviate.example.com/v1/objects', {
  headers: {
    ...headers,
    'Content-Type': 'application/json',
  },
});
```

## API Key Authentication

### Basic Usage

```typescript
import {
  ApiKeyAuthProvider,
  createApiKeyAuthProvider
} from '@llmdevops/weaviate-integration/auth';

// Method 1: Direct instantiation
const provider1 = new ApiKeyAuthProvider('your-api-key');

// Method 2: Factory function
const provider2 = createApiKeyAuthProvider('your-api-key');

// Get headers
const headers = await provider1.getAuthHeaders();

// Check expiration (always false for API keys)
console.log('Expired?', provider1.isExpired()); // false

// Clear from memory when done
provider1.clear();
```

### From Environment Variable

```typescript
import { createApiKeyAuthProviderFromEnv } from '@llmdevops/weaviate-integration/auth';

// Reads from WEAVIATE_API_KEY
const provider = createApiKeyAuthProviderFromEnv();

// Or use custom variable
const customProvider = createApiKeyAuthProviderFromEnv('MY_CUSTOM_API_KEY');
```

### Security Features

```typescript
const provider = createApiKeyAuthProvider('super-secret-key');

// API key is automatically redacted
console.log(provider.toString());
// [ApiKeyAuthProvider: apiKey=***REDACTED***]

console.log(JSON.stringify(provider));
// {"type":"ApiKeyAuthProvider","apiKey":"***REDACTED***"}

// Never logs the actual key
try {
  console.log(provider);
} catch (e) {
  // Key is still redacted even in errors
}
```

## OIDC Authentication

### Static Token (No Refresh)

```typescript
import {
  OidcAuthProvider,
  createOidcAuthProvider
} from '@llmdevops/weaviate-integration/auth';

// Simple OIDC with static token
const provider = createOidcAuthProvider('your-oidc-access-token');

// Get headers
const headers = await provider.getAuthHeaders();
// { Authorization: 'Bearer your-oidc-access-token' }

// Token never expires if no refresh callback
console.log('Expired?', provider.isExpired()); // false
```

### With Token Refresh

```typescript
import { createOidcAuthProviderWithRefresh } from '@llmdevops/weaviate-integration/auth';

const provider = createOidcAuthProviderWithRefresh({
  token: 'initial-access-token',
  refreshToken: 'initial-refresh-token',
  expiresIn: 3600, // 1 hour
  refreshCallback: async (currentToken, refreshToken) => {
    // Call your OIDC provider's token endpoint
    const response = await fetch('https://auth.example.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken!,
        client_id: 'your-client-id',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type || 'Bearer',
    };
  },
});

// Token is automatically refreshed when near expiration
const headers = await provider.getAuthHeaders();

// Check if token needs refresh (60-second buffer)
if (provider.isExpired()) {
  await provider.refresh();
}
```

### Manual Token Update

```typescript
const provider = new OidcAuthProvider({ token: 'initial-token' });

// Later, update token manually (e.g., from external refresh)
provider.updateToken('new-access-token', 3600);

// Or update refresh token
provider.setRefreshToken('new-refresh-token');

// Or set refresh callback dynamically
provider.setRefreshCallback(async (token, refreshToken) => {
  // Your refresh logic
  return { accessToken: 'new-token', expiresIn: 3600 };
});
```

## OAuth2 Client Credentials

### Basic Usage

```typescript
import {
  ClientCredentialsAuthProvider,
  createClientCredentialsAuthProvider
} from '@llmdevops/weaviate-integration/auth';

const provider = createClientCredentialsAuthProvider({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  tokenEndpoint: 'https://auth.weaviate.io/oauth2/token',
  scopes: ['weaviate.read', 'weaviate.write'], // optional
});

// First call fetches token
const headers = await provider.getAuthHeaders();
// { Authorization: 'Bearer <access-token>' }

// Subsequent calls use cached token
const headers2 = await provider.getAuthHeaders();

// Token is automatically refreshed when expired
// (uses 60-second buffer before expiration)
```

### Token Management

```typescript
const provider = createClientCredentialsAuthProvider({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  tokenEndpoint: 'https://auth.example.com/token',
});

// Check token expiration
console.log('Is expired?', provider.isExpired());

// Get expiration timestamp
const expiresAt = provider.getTokenExpiration();
if (expiresAt) {
  console.log('Expires at:', new Date(expiresAt));
}

// Get time remaining until expiration
const remaining = provider.getTimeUntilExpiration();
console.log('Time remaining:', remaining, 'ms');

// Force refresh
await provider.refresh();

// Clear cached token (forces new fetch on next use)
provider.clearCache();
```

### Custom OAuth2 Provider

```typescript
// Example: Azure AD integration
const azureProvider = createClientCredentialsAuthProvider({
  clientId: process.env.AZURE_CLIENT_ID!,
  clientSecret: process.env.AZURE_CLIENT_SECRET!,
  tokenEndpoint: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
  scopes: ['https://weaviate.azure.com/.default'],
});

// Example: Keycloak integration
const keycloakProvider = createClientCredentialsAuthProvider({
  clientId: 'weaviate-client',
  clientSecret: 'client-secret',
  tokenEndpoint: 'https://keycloak.example.com/auth/realms/myrealm/protocol/openid-connect/token',
  scopes: ['openid', 'profile'],
});
```

## Factory Pattern Usage

### Using Generic Factory

```typescript
import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

// Configuration-driven approach
const config = {
  method: AuthType.ClientCredentials as const,
  clientId: 'my-client',
  clientSecret: 'my-secret',
  tokenEndpoint: 'https://auth.example.com/token',
};

const provider = createAuthProvider(config);
```

### Dynamic Configuration

```typescript
import { createAuthProvider, AuthType, WeaviateAuthConfig } from '@llmdevops/weaviate-integration/auth';

function getAuthConfig(): WeaviateAuthConfig {
  const authMethod = process.env.WEAVIATE_AUTH_METHOD;

  switch (authMethod) {
    case 'api_key':
      return {
        method: AuthType.ApiKey,
        apiKey: process.env.WEAVIATE_API_KEY!,
      };

    case 'oidc':
      return {
        method: AuthType.Oidc,
        token: process.env.WEAVIATE_OIDC_TOKEN!,
      };

    case 'client_credentials':
      return {
        method: AuthType.ClientCredentials,
        clientId: process.env.WEAVIATE_CLIENT_ID!,
        clientSecret: process.env.WEAVIATE_CLIENT_SECRET!,
        tokenEndpoint: process.env.WEAVIATE_TOKEN_ENDPOINT!,
      };

    default:
      return { method: AuthType.None };
  }
}

const provider = createAuthProvider(getAuthConfig());
```

### Validation

```typescript
import { validateAuthConfig, AuthType } from '@llmdevops/weaviate-integration/auth';

const config = {
  method: AuthType.ApiKey,
  apiKey: process.env.API_KEY || '',
};

try {
  validateAuthConfig(config);
  const provider = createAuthProvider(config);
  console.log('Auth configured successfully');
} catch (error) {
  console.error('Invalid auth configuration:', error.message);
  process.exit(1);
}
```

## Environment Variables

### Auto-Detection

```typescript
import { createAuthProviderFromEnv } from '@llmdevops/weaviate-integration/auth';

// Auto-detects authentication method from environment
// Priority: Client Credentials > OIDC > API Key > None
const provider = createAuthProviderFromEnv();
```

### Environment Setup Examples

```bash
# API Key Authentication
export WEAVIATE_API_KEY="wv-1234567890abcdef"

# OIDC Authentication
export WEAVIATE_OIDC_TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
export WEAVIATE_OIDC_EXPIRES_IN="3600"

# OAuth2 Client Credentials
export WEAVIATE_CLIENT_ID="my-client-id"
export WEAVIATE_CLIENT_SECRET="my-client-secret"
export WEAVIATE_TOKEN_ENDPOINT="https://auth.weaviate.io/oauth2/token"
export WEAVIATE_SCOPES="weaviate.read,weaviate.write"
```

### Custom Prefix

```typescript
import {
  createAuthProviderFromEnv,
  createApiKeyAuthProviderFromEnv,
  createClientCredentialsAuthProviderFromEnv
} from '@llmdevops/weaviate-integration/auth';

// Use custom prefix for multi-instance scenarios
const provider1 = createAuthProviderFromEnv('WEAVIATE_PROD');
const provider2 = createAuthProviderFromEnv('WEAVIATE_DEV');

// Specific providers
const apiKeyProd = createApiKeyAuthProviderFromEnv('WEAVIATE_PROD_API_KEY');
const ccDev = createClientCredentialsAuthProviderFromEnv('WEAVIATE_DEV');
```

## Integration with HTTP Client

### Fetch API

```typescript
import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

const authProvider = createAuthProvider({
  method: AuthType.ApiKey,
  apiKey: process.env.WEAVIATE_API_KEY!,
});

async function weaviateRequest(url: string, options: RequestInit = {}) {
  const authHeaders = await authProvider.getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Weaviate request failed: ${response.statusText}`);
  }

  return response.json();
}

// Usage
const objects = await weaviateRequest(
  'https://weaviate.example.com/v1/objects'
);
```

### Axios Integration

```typescript
import axios from 'axios';
import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

const authProvider = createAuthProvider({
  method: AuthType.ClientCredentials,
  clientId: process.env.CLIENT_ID!,
  clientSecret: process.env.CLIENT_SECRET!,
  tokenEndpoint: process.env.TOKEN_ENDPOINT!,
});

// Create axios instance with auth interceptor
const weaviateClient = axios.create({
  baseURL: 'https://weaviate.example.com',
});

weaviateClient.interceptors.request.use(async (config) => {
  const authHeaders = await authProvider.getAuthHeaders();
  config.headers = {
    ...config.headers,
    ...authHeaders,
  };
  return config;
});

// Usage
const response = await weaviateClient.get('/v1/objects');
```

### Custom Client Class

```typescript
import { AuthProvider, createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

class WeaviateClient {
  private authProvider: AuthProvider;
  private baseUrl: string;

  constructor(baseUrl: string, authProvider: AuthProvider) {
    this.baseUrl = baseUrl;
    this.authProvider = authProvider;
  }

  private async request(path: string, options: RequestInit = {}) {
    const authHeaders = await this.authProvider.getAuthHeaders();

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getObjects() {
    return this.request('/v1/objects');
  }

  async createObject(data: any) {
    return this.request('/v1/objects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

// Usage
const authProvider = createAuthProvider({
  method: AuthType.ApiKey,
  apiKey: process.env.WEAVIATE_API_KEY!,
});

const client = new WeaviateClient(
  'https://weaviate.example.com',
  authProvider
);

const objects = await client.getObjects();
```

## Error Handling

### Configuration Errors

```typescript
import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

try {
  const provider = createAuthProvider({
    method: AuthType.ApiKey,
    apiKey: '', // Invalid: empty key
  });
} catch (error) {
  console.error('Configuration error:', error.message);
  // Configuration error: API key cannot be empty
}
```

### Token Refresh Errors

```typescript
import { createClientCredentialsAuthProvider } from '@llmdevops/weaviate-integration/auth';

const provider = createClientCredentialsAuthProvider({
  clientId: 'invalid-client',
  clientSecret: 'invalid-secret',
  tokenEndpoint: 'https://auth.example.com/token',
});

try {
  const headers = await provider.getAuthHeaders();
} catch (error) {
  console.error('Token fetch failed:', error.message);
  // Handle authentication failure
  // Maybe redirect to login or use fallback credentials
}
```

### Retry Logic

```typescript
async function getAuthHeadersWithRetry(provider: AuthProvider, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await provider.getAuthHeaders();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      console.warn(`Auth attempt ${i + 1} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Failed to authenticate after retries');
}

// Usage
try {
  const headers = await getAuthHeadersWithRetry(provider);
} catch (error) {
  console.error('Authentication failed after retries:', error.message);
}
```

## Advanced Scenarios

### Multi-Tenant Setup

```typescript
import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

interface TenantConfig {
  name: string;
  weaviateUrl: string;
  authProvider: AuthProvider;
}

const tenants: TenantConfig[] = [
  {
    name: 'tenant-a',
    weaviateUrl: 'https://tenant-a.weaviate.example.com',
    authProvider: createAuthProvider({
      method: AuthType.ApiKey,
      apiKey: process.env.TENANT_A_API_KEY!,
    }),
  },
  {
    name: 'tenant-b',
    weaviateUrl: 'https://tenant-b.weaviate.example.com',
    authProvider: createAuthProvider({
      method: AuthType.ClientCredentials,
      clientId: process.env.TENANT_B_CLIENT_ID!,
      clientSecret: process.env.TENANT_B_CLIENT_SECRET!,
      tokenEndpoint: process.env.TENANT_B_TOKEN_ENDPOINT!,
    }),
  },
];

async function queryTenant(tenant: TenantConfig, query: any) {
  const headers = await tenant.authProvider.getAuthHeaders();

  const response = await fetch(`${tenant.weaviateUrl}/v1/graphql`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(query),
  });

  return response.json();
}
```

### Token Pre-warming

```typescript
import { ClientCredentialsAuthProvider } from '@llmdevops/weaviate-integration/auth';

const provider = new ClientCredentialsAuthProvider({
  clientId: process.env.CLIENT_ID!,
  clientSecret: process.env.CLIENT_SECRET!,
  tokenEndpoint: process.env.TOKEN_ENDPOINT!,
});

// Pre-warm token cache on application startup
async function warmupAuth() {
  console.log('Warming up authentication...');
  try {
    await provider.getAuthHeaders();
    console.log('Authentication ready');
  } catch (error) {
    console.error('Failed to warm up authentication:', error.message);
    throw error;
  }
}

// Application startup
await warmupAuth();

// Now all requests use cached token
const headers = await provider.getAuthHeaders(); // Fast, uses cache
```

### Health Check

```typescript
import { AuthProvider } from '@llmdevops/weaviate-integration/auth';

async function checkAuthHealth(provider: AuthProvider): Promise<boolean> {
  try {
    // Check if token is expired
    if (provider.isExpired()) {
      console.warn('Token is expired, attempting refresh...');
      if (provider.refresh) {
        await provider.refresh();
      }
    }

    // Try to get headers
    const headers = await provider.getAuthHeaders();

    // Verify we got an Authorization header
    if (!headers.Authorization) {
      console.error('No Authorization header present');
      return false;
    }

    console.log('Auth health check passed');
    return true;
  } catch (error) {
    console.error('Auth health check failed:', error.message);
    return false;
  }
}

// Run health check periodically
setInterval(() => checkAuthHealth(provider), 60000); // Every minute
```

### Dynamic Provider Switching

```typescript
import { AuthProvider, createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';

class DynamicAuthProvider implements AuthProvider {
  private currentProvider: AuthProvider;
  private fallbackProvider: AuthProvider;

  constructor(primary: AuthProvider, fallback: AuthProvider) {
    this.currentProvider = primary;
    this.fallbackProvider = fallback;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      return await this.currentProvider.getAuthHeaders();
    } catch (error) {
      console.warn('Primary auth failed, using fallback');
      return await this.fallbackProvider.getAuthHeaders();
    }
  }

  isExpired(): boolean {
    return this.currentProvider.isExpired();
  }

  async refresh(): Promise<void> {
    try {
      if (this.currentProvider.refresh) {
        await this.currentProvider.refresh();
      }
    } catch (error) {
      console.warn('Refresh failed on primary provider');
    }
  }
}

// Usage
const primary = createAuthProvider({
  method: AuthType.ClientCredentials,
  clientId: 'primary-id',
  clientSecret: 'primary-secret',
  tokenEndpoint: 'https://primary.auth.com/token',
});

const fallback = createAuthProvider({
  method: AuthType.ApiKey,
  apiKey: process.env.FALLBACK_API_KEY!,
});

const dynamicProvider = new DynamicAuthProvider(primary, fallback);
```
