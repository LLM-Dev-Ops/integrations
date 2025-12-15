# AWS IAM Configuration Module

This module provides configuration types, builders, and utilities for the AWS IAM/STS integration following the SPARC hexagonal architecture pattern.

## Overview

The configuration module enables flexible and type-safe configuration of the IAM client with support for:

- Regional and global STS endpoints
- Credential caching with configurable refresh
- Retry logic with exponential backoff
- Circuit breaker pattern for resilience
- Cross-account role assumption
- Session tagging for audit trails

## Core Types

### IamConfig

Main configuration interface for the IAM client:

```typescript
interface IamConfig {
  region: string;
  endpoint?: string;
  baseCredentialsProvider: CredentialProvider;
  useRegionalSts?: boolean;        // default: true
  timeout?: number;                 // default: 30000ms
  cacheConfig?: CacheConfig;
  retryConfig?: RetryConfig;
  circuitBreakerConfig?: CircuitBreakerConfig;
}
```

### CacheConfig

Controls credential caching behavior:

```typescript
interface CacheConfig {
  refreshBuffer?: number;     // default: 300000ms (5 minutes)
  maxEntries?: number;        // default: 100
  asyncRefresh?: boolean;     // default: true
}
```

### RetryConfig

Controls retry behavior with exponential backoff:

```typescript
interface RetryConfig {
  maxAttempts: number;        // default: 3
  initialBackoff: number;     // default: 100ms
  maxBackoff: number;         // default: 20000ms
  backoffMultiplier: number;  // default: 2
  jitter: boolean;            // default: true
}
```

### CircuitBreakerConfig

Controls circuit breaker for fault tolerance:

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;   // default: 5
  successThreshold: number;   // default: 2
  resetTimeout: number;       // default: 30000ms
}
```

### CrossAccountRoleConfig

Configuration for cross-account role assumption:

```typescript
interface CrossAccountRoleConfig {
  accountId: string;
  roleName: string;
  externalId?: string;
  sessionNamePrefix: string;
  duration?: number;          // default: 3600 seconds
  sessionTags?: SessionTag[];
}
```

## Configuration Builder

### IamConfigBuilder

Fluent API for building IAM configuration:

```typescript
const config = new IamConfigBuilder()
  .region('us-east-1')
  .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalr...')
  .useRegionalSts(true)
  .timeout(60000)
  .cacheConfig({
    refreshBuffer: 600000,
    maxEntries: 200
  })
  .retryConfig({
    maxAttempts: 5,
    initialBackoff: 200,
    maxBackoff: 30000,
    backoffMultiplier: 2,
    jitter: true
  })
  .build();
```

### Builder Methods

- `region(region: string)` - Set AWS region
- `endpoint(endpoint: string)` - Set custom STS endpoint
- `credentials(accessKey, secretKey, sessionToken?)` - Set static credentials
- `credentialsProvider(provider)` - Set custom credential provider
- `useRegionalSts(boolean)` - Use regional (true) or global (false) STS
- `timeout(ms)` - Set request timeout
- `cacheConfig(config)` - Configure credential caching
- `retryConfig(config)` - Configure retry behavior
- `circuitBreakerConfig(config)` - Configure circuit breaker
- `fromEnv()` - Load configuration from environment variables
- `build()` - Build and validate configuration

### Environment Variables

The `fromEnv()` method reads:

- `AWS_REGION` or `AWS_DEFAULT_REGION` - AWS region
- `AWS_ENDPOINT_URL_STS` or `AWS_ENDPOINT_URL` - Custom STS endpoint
- `AWS_STS_REGIONAL_ENDPOINTS` - 'regional' or 'legacy' (global)

## Utility Functions

### resolveStsEndpoint(config, region?)

Resolves the STS API endpoint URL:

```typescript
const endpoint = resolveStsEndpoint(config);
// Returns: 'https://sts.us-east-1.amazonaws.com' (regional)
// or:      'https://sts.amazonaws.com' (global)
```

### resolveIamEndpoint()

Returns the global IAM endpoint:

```typescript
const endpoint = resolveIamEndpoint();
// Returns: 'https://iam.amazonaws.com'
```

### Validation Functions

- `validateRoleArn(roleArn)` - Validates IAM role ARN format
- `validateSessionName(sessionName)` - Validates session name (2-64 chars, [\w+=,.@-]+)
- `validateSessionDuration(duration)` - Validates duration (900-43200 seconds)
- `validateExternalId(externalId)` - Validates external ID (2-1224 chars)

## Examples

### Basic Configuration

```typescript
import { IamConfigBuilder } from './config';
import { StaticCredentialProvider } from './credentials/static';

const config = new IamConfigBuilder()
  .region('us-east-1')
  .credentialsProvider(new StaticCredentialProvider({
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  }))
  .build();
```

### Cross-Account Configuration

```typescript
const crossAccountRole: CrossAccountRoleConfig = {
  accountId: '123456789012',
  roleName: 'CrossAccountRole',
  externalId: 'unique-external-id',
  sessionNamePrefix: 'app-session',
  duration: 3600,
  sessionTags: [
    { key: 'Department', value: 'Engineering' },
    { key: 'Application', value: 'DataPipeline' }
  ]
};
```

### Environment-Based Configuration

```typescript
const config = new IamConfigBuilder()
  .fromEnv()
  .credentialsProvider(credProvider)
  .build();
```

### Custom Retry and Cache

```typescript
const config = new IamConfigBuilder()
  .region('us-east-1')
  .credentialsProvider(credProvider)
  .retryConfig({
    maxAttempts: 5,
    initialBackoff: 200,
    maxBackoff: 30000,
    backoffMultiplier: 2,
    jitter: true
  })
  .cacheConfig({
    refreshBuffer: 600000,  // 10 minutes
    maxEntries: 200,
    asyncRefresh: true
  })
  .circuitBreakerConfig({
    failureThreshold: 10,
    successThreshold: 3,
    resetTimeout: 60000
  })
  .build();
```

## Default Values

```typescript
const DEFAULT_CONFIG = {
  useRegionalSts: true,
  timeout: 30000,
  retryConfig: {
    maxAttempts: 3,
    initialBackoff: 100,
    maxBackoff: 20000,
    backoffMultiplier: 2,
    jitter: true
  },
  circuitBreakerConfig: {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeout: 30000
  },
  cacheConfig: {
    refreshBuffer: 300000,
    maxEntries: 100,
    asyncRefresh: true
  }
};
```

## Best Practices

1. **Use Regional STS Endpoints**: Always use `useRegionalSts: true` for better reliability and lower latency
2. **Configure Credential Refresh**: Set appropriate `refreshBuffer` to avoid credential expiration during operations
3. **Enable Async Refresh**: Keep `asyncRefresh: true` to avoid blocking during credential refresh
4. **Set Appropriate Timeouts**: Balance between allowing enough time for operations and failing fast
5. **Use Session Tags**: Always tag sessions for audit trail and compliance
6. **Validate Input**: Use validation functions before making API calls
7. **Handle Errors**: Catch and handle `IamError` instances appropriately

## Related Modules

- `credentials/types` - Credential provider interface
- `error` - Error types and utilities
- `sts` - STS service implementation
- `iam` - IAM service implementation
