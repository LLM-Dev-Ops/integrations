# AWS Credentials Module

Comprehensive credential management for AWS services with support for multiple providers, caching, and the standard AWS credential chain.

## Overview

This module provides a robust credential management system that follows AWS SDK conventions and supports multiple credential sources:

- **Static credentials**: Hard-coded credentials for testing or specific use cases
- **Environment variables**: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
- **Shared credentials file**: ~/.aws/credentials
- **Shared config file**: ~/.aws/config with profile support
- **EC2 Instance Metadata Service (IMDS)**: Both IMDSv1 and IMDSv2
- **Credential chaining**: Try multiple providers in sequence
- **Credential caching**: Cache credentials with automatic refresh

## Quick Start

### Using the Default Provider Chain

The easiest way to get started is with the default provider chain, which automatically tries environment variables, shared credentials, and IMDS:

```typescript
import { defaultProvider } from '@integrations/aws-ses/credentials';

const provider = defaultProvider();
const credentials = await provider.getCredentials();

console.log('Access Key ID:', credentials.accessKeyId);
```

### Using Environment Variables

```typescript
import { EnvironmentCredentialProvider } from '@integrations/aws-ses/credentials';

// Set environment variables
process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

const provider = new EnvironmentCredentialProvider();
const credentials = await provider.getCredentials();
```

### Using Static Credentials

```typescript
import { StaticCredentialProvider } from '@integrations/aws-ses/credentials';

const provider = new StaticCredentialProvider({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
});

const credentials = await provider.getCredentials();
```

## Credential Providers

### StaticCredentialProvider

Provides static, pre-configured credentials. Useful for testing or when credentials are known at initialization time.

```typescript
import { StaticCredentialProvider } from '@integrations/aws-ses/credentials';

// Long-term credentials
const provider = new StaticCredentialProvider({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
});

// Temporary credentials with session token and expiration
const tempProvider = new StaticCredentialProvider({
  accessKeyId: 'ASIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  sessionToken: 'AQoDYXdzEJr...',
  expiration: new Date(Date.now() + 3600000) // 1 hour from now
});
```

**Features:**
- Validates credentials on construction
- Checks expiration for temporary credentials
- Throws `CredentialError` if expired

### EnvironmentCredentialProvider

Reads credentials from standard AWS environment variables.

```typescript
import { EnvironmentCredentialProvider } from '@integrations/aws-ses/credentials';

const provider = new EnvironmentCredentialProvider();
const credentials = await provider.getCredentials();
```

**Environment variables:**
- `AWS_ACCESS_KEY_ID` (required)
- `AWS_SECRET_ACCESS_KEY` (required)
- `AWS_SESSION_TOKEN` (optional, for temporary credentials)

**Features:**
- Validates that required variables are set and non-empty
- Trims whitespace from values
- Supports custom environment objects for testing

### ProfileCredentialProvider

Reads credentials from AWS shared configuration files.

```typescript
import { ProfileCredentialProvider } from '@integrations/aws-ses/credentials';

// Use default profile
const provider = new ProfileCredentialProvider();

// Use named profile
const prodProvider = new ProfileCredentialProvider({
  profile: 'production'
});

// Custom file paths
const customProvider = new ProfileCredentialProvider({
  credentialsFile: '/custom/path/credentials',
  configFile: '/custom/path/config'
});
```

**Configuration:**
- `profile`: Profile name (default: 'default' or AWS_PROFILE env var)
- `credentialsFile`: Path to credentials file (default: ~/.aws/credentials)
- `configFile`: Path to config file (default: ~/.aws/config)

**Supported files:**
- `~/.aws/credentials`: Contains access keys
- `~/.aws/config`: Contains additional configuration

**Features:**
- Parses INI format files
- Supports multiple profiles
- Handles `source_profile` for role assumption chains
- Respects AWS_PROFILE, AWS_SHARED_CREDENTIALS_FILE, AWS_CONFIG_FILE environment variables

**Example credentials file:**
```ini
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

[production]
aws_access_key_id = AKIAIOSFODNN7PRODKEY
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYPRODKEY
```

### IMDSCredentialProvider

Retrieves temporary credentials from EC2 Instance Metadata Service.

```typescript
import { IMDSCredentialProvider } from '@integrations/aws-ses/credentials';

// Use defaults (IMDSv2, 5s timeout, 3 retries)
const provider = new IMDSCredentialProvider();

// Custom configuration
const customProvider = new IMDSCredentialProvider({
  timeout: 10000,        // 10 second timeout
  maxRetries: 5,         // 5 retry attempts
  useIMDSv2: true,       // Use IMDSv2 (session token-based)
  endpoint: 'http://169.254.169.254'  // Custom endpoint
});

const credentials = await provider.getCredentials();
```

**Configuration:**
- `endpoint`: IMDS endpoint URL (default: http://169.254.169.254)
- `timeout`: Request timeout in milliseconds (default: 5000)
- `maxRetries`: Maximum retry attempts (default: 3)
- `useIMDSv2`: Use IMDSv2 with session tokens (default: true)

**Features:**
- Supports both IMDSv1 and IMDSv2
- Automatic credential refresh based on expiration
- Exponential backoff retry logic
- Caches credentials until near expiration (5 min buffer)
- Session token caching for IMDSv2

**Security:**
- IMDSv2 is recommended and enabled by default
- Session tokens prevent SSRF attacks

### ChainCredentialProvider

Tries multiple credential providers in sequence until one succeeds.

```typescript
import {
  ChainCredentialProvider,
  StaticCredentialProvider,
  EnvironmentCredentialProvider,
  ProfileCredentialProvider
} from '@integrations/aws-ses/credentials';

const provider = new ChainCredentialProvider([
  new StaticCredentialProvider({ /* ... */ }),
  new EnvironmentCredentialProvider(),
  new ProfileCredentialProvider()
]);

const credentials = await provider.getCredentials();
```

**Features:**
- Tries providers in order
- Returns credentials from first successful provider
- Caches the successful provider for subsequent calls
- Provides detailed error messages showing all failures

**Default Provider Chain:**

The `defaultProvider()` function creates a standard AWS credential chain:

```typescript
import { defaultProvider } from '@integrations/aws-ses/credentials';

const provider = defaultProvider();
// Tries: Environment → Profile → IMDS
```

### CachedCredentialProvider

Wraps any provider to add caching with automatic refresh.

```typescript
import {
  CachedCredentialProvider,
  IMDSCredentialProvider
} from '@integrations/aws-ses/credentials';

const baseProvider = new IMDSCredentialProvider();
const cachedProvider = new CachedCredentialProvider(baseProvider, {
  ttl: 30 * 60 * 1000,      // Cache for 30 minutes
  refreshBuffer: 5 * 60 * 1000  // Refresh 5 minutes before expiry
});

// First call fetches from IMDS
const creds1 = await cachedProvider.getCredentials();

// Subsequent calls use cache
const creds2 = await cachedProvider.getCredentials();

// Clear cache manually if needed
cachedProvider.clearCache();

// Get cache statistics
const stats = cachedProvider.getCacheStats();
if (stats) {
  console.log('Cached at:', stats.cachedAt);
  console.log('Expires at:', stats.expiresAt);
}
```

**Configuration:**
- `ttl`: Time-to-live in milliseconds (default: uses credential expiration or 1 hour)
- `refreshBuffer`: Time before expiration to refresh (default: 5 minutes)

**Features:**
- Automatic refresh before expiration
- Thread-safe refresh operations
- Respects credential expiration times
- Manual cache clearing
- Cache statistics

## Error Handling

All providers throw `CredentialError` with specific error codes:

```typescript
import { CredentialError } from '@integrations/aws-ses/credentials';

try {
  const credentials = await provider.getCredentials();
} catch (error) {
  if (error instanceof CredentialError) {
    switch (error.code) {
      case 'MISSING':
        console.error('Credentials not found');
        break;
      case 'INVALID':
        console.error('Credentials are invalid');
        break;
      case 'EXPIRED':
        console.error('Credentials have expired');
        break;
      case 'LOAD_FAILED':
        console.error('Failed to load credentials');
        break;
      case 'IMDS_ERROR':
        console.error('IMDS service error');
        break;
      case 'PROFILE_ERROR':
        console.error('Profile configuration error');
        break;
    }
    console.error(error.message);
  }
}
```

**Error Codes:**
- `MISSING`: Credentials not found in the expected location
- `INVALID`: Credentials are malformed or incomplete
- `EXPIRED`: Credentials have passed their expiration time
- `LOAD_FAILED`: Failed to load credentials from source (used by chain)
- `IMDS_ERROR`: Instance metadata service error
- `PROFILE_ERROR`: Profile file parsing or configuration error

## Types

### AwsCredentials

```typescript
interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}
```

### CredentialProvider

```typescript
interface CredentialProvider {
  getCredentials(): Promise<AwsCredentials>;
  isExpired?(): boolean;
}
```

## Best Practices

### 1. Use the Default Provider Chain in Production

```typescript
import { defaultProvider } from '@integrations/aws-ses/credentials';

const provider = defaultProvider();
```

This works in most environments without configuration:
- Local development: Uses environment variables or ~/.aws/credentials
- EC2 instances: Uses instance metadata service
- Containers: Uses environment variables or task roles

### 2. Add Caching for Frequent Credential Access

```typescript
import { CachedCredentialProvider, defaultProvider } from '@integrations/aws-ses/credentials';

const provider = new CachedCredentialProvider(defaultProvider());
```

### 3. Use Static Credentials Only for Testing

```typescript
import { StaticCredentialProvider } from '@integrations/aws-ses/credentials';

if (process.env.NODE_ENV === 'test') {
  provider = new StaticCredentialProvider({
    accessKeyId: 'test',
    secretAccessKey: 'test'
  });
}
```

### 4. Handle Errors Appropriately

```typescript
try {
  const credentials = await provider.getCredentials();
} catch (error) {
  if (error instanceof CredentialError) {
    // Log detailed error information
    console.error(`Credential error [${error.code}]: ${error.message}`);

    // Take appropriate action based on error code
    if (error.code === 'EXPIRED') {
      // Trigger credential refresh
    }
  }
  throw error;
}
```

### 5. Use Environment Variables for Deployments

Set these in your deployment environment:
```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
# Optional for temporary credentials:
export AWS_SESSION_TOKEN=your-session-token
```

### 6. Use Named Profiles for Multiple Environments

```typescript
import { ProfileCredentialProvider } from '@integrations/aws-ses/credentials';

const env = process.env.NODE_ENV || 'development';
const provider = new ProfileCredentialProvider({
  profile: env
});
```

## Advanced Usage

### Custom Credential Provider

Implement the `CredentialProvider` interface for custom sources:

```typescript
import { AwsCredentials, CredentialProvider } from '@integrations/aws-ses/credentials';

class CustomCredentialProvider implements CredentialProvider {
  async getCredentials(): Promise<AwsCredentials> {
    // Fetch credentials from your custom source
    const data = await fetchFromCustomSource();

    return {
      accessKeyId: data.keyId,
      secretAccessKey: data.secret,
      sessionToken: data.token,
      expiration: new Date(data.expiresAt)
    };
  }

  isExpired(): boolean {
    // Check if credentials are expired
    return false;
  }
}
```

### Custom Provider Chain

```typescript
import { ChainCredentialProvider } from '@integrations/aws-ses/credentials';

const provider = new ChainCredentialProvider([
  new CustomCredentialProvider(),
  new EnvironmentCredentialProvider(),
  new IMDSCredentialProvider()
]);
```

### Credential Refresh Strategy

```typescript
import { CachedCredentialProvider, IMDSCredentialProvider } from '@integrations/aws-ses/credentials';

// Refresh 10 minutes before expiration
const provider = new CachedCredentialProvider(
  new IMDSCredentialProvider(),
  { refreshBuffer: 10 * 60 * 1000 }
);

// Check if refresh is needed
if (provider.isExpired()) {
  console.log('Credentials will be refreshed on next call');
}
```

## Testing

### Mocking Credentials

```typescript
import { StaticCredentialProvider } from '@integrations/aws-ses/credentials';

const mockProvider = new StaticCredentialProvider({
  accessKeyId: 'mock-key-id',
  secretAccessKey: 'mock-secret-key'
});
```

### Testing with Custom Environment

```typescript
import { EnvironmentCredentialProvider } from '@integrations/aws-ses/credentials';

const mockEnv = {
  AWS_ACCESS_KEY_ID: 'test-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret'
};

const provider = new EnvironmentCredentialProvider(mockEnv);
```

### Testing Expiration

```typescript
import { StaticCredentialProvider } from '@integrations/aws-ses/credentials';

const provider = new StaticCredentialProvider({
  accessKeyId: 'test',
  secretAccessKey: 'test',
  expiration: new Date(Date.now() + 1000) // Expires in 1 second
});

// Wait for expiration
await new Promise(resolve => setTimeout(resolve, 1100));

// Should throw CredentialError with code 'EXPIRED'
try {
  await provider.getCredentials();
} catch (error) {
  console.log('Credentials expired as expected');
}
```

## Performance Considerations

1. **Caching**: Always use `CachedCredentialProvider` when making frequent credential requests
2. **IMDS Timeout**: Adjust IMDS timeout based on your network conditions
3. **Provider Order**: In chains, put faster providers first (e.g., environment before IMDS)
4. **Refresh Buffer**: Use appropriate refresh buffer to avoid credential expiration during operations

## Security Considerations

1. **Never log credentials**: Credentials should never be logged or printed
2. **Use IMDSv2**: Always use IMDSv2 on EC2 for enhanced security
3. **Rotate credentials**: Implement credential rotation policies
4. **Use temporary credentials**: Prefer temporary credentials with expiration
5. **Protect credential files**: Ensure ~/.aws/credentials has appropriate file permissions (0600)

## Troubleshooting

### Credentials Not Found

```
CredentialError [MISSING]: AWS_ACCESS_KEY_ID environment variable not set or empty
```

**Solution**: Set environment variables or configure credentials file.

### IMDS Connection Timeout

```
CredentialError [IMDS_ERROR]: IMDS request failed after 4 attempts
```

**Solution**:
- Check if running on EC2
- Increase timeout: `new IMDSCredentialProvider({ timeout: 10000 })`
- Verify IAM role is attached to instance

### Profile Not Found

```
CredentialError [PROFILE_ERROR]: Profile 'production' not found
```

**Solution**:
- Check profile name in ~/.aws/credentials
- Verify AWS_PROFILE environment variable
- Ensure credentials file exists and is readable

### All Providers Failed

```
CredentialError [LOAD_FAILED]: Could not load credentials from any provider in the chain
```

**Solution**: Check each provider's specific error in the detailed message.

## License

MIT
