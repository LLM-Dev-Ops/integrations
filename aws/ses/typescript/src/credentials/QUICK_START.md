# AWS Credentials Quick Start

Get started with AWS credentials in under 5 minutes.

## Installation

The credentials module is included with the AWS SES TypeScript package. No additional installation needed.

## Basic Usage

### 1. Default Provider (Recommended)

The easiest way to get credentials - tries environment variables, profile files, and IMDS automatically:

```typescript
import { defaultProvider } from '@integrations/aws-ses/credentials';

const provider = defaultProvider();
const credentials = await provider.getCredentials();

// Use credentials for AWS requests
console.log('Access Key:', credentials.accessKeyId);
```

### 2. Environment Variables

Set environment variables and use the environment provider:

```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

```typescript
import { EnvironmentCredentialProvider } from '@integrations/aws-ses/credentials';

const provider = new EnvironmentCredentialProvider();
const credentials = await provider.getCredentials();
```

### 3. AWS Profile

Use named profiles from `~/.aws/credentials`:

```typescript
import { ProfileCredentialProvider } from '@integrations/aws-ses/credentials';

const provider = new ProfileCredentialProvider({ profile: 'production' });
const credentials = await provider.getCredentials();
```

### 4. Static Credentials (Testing Only)

Hard-code credentials for testing:

```typescript
import { StaticCredentialProvider } from '@integrations/aws-ses/credentials';

const provider = new StaticCredentialProvider({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
});

const credentials = await provider.getCredentials();
```

## Common Patterns

### With Caching

Improve performance by caching credentials:

```typescript
import { CachedCredentialProvider, defaultProvider } from '@integrations/aws-ses/credentials';

const provider = new CachedCredentialProvider(defaultProvider());
const credentials = await provider.getCredentials();
```

### Error Handling

Always handle credential errors:

```typescript
import { defaultProvider, CredentialError } from '@integrations/aws-ses/credentials';

try {
  const provider = defaultProvider();
  const credentials = await provider.getCredentials();
} catch (error) {
  if (error instanceof CredentialError) {
    console.error(`Credential error [${error.code}]: ${error.message}`);
  }
  throw error;
}
```

### Custom Chain

Create a custom provider chain:

```typescript
import {
  ChainCredentialProvider,
  EnvironmentCredentialProvider,
  ProfileCredentialProvider
} from '@integrations/aws-ses/credentials';

const provider = new ChainCredentialProvider([
  new EnvironmentCredentialProvider(),
  new ProfileCredentialProvider({ profile: 'production' })
]);

const credentials = await provider.getCredentials();
```

## Configuration Options

### Environment Provider

No configuration needed - reads from environment variables.

### Profile Provider

```typescript
new ProfileCredentialProvider({
  profile: 'production',                    // Profile name
  credentialsFile: '/path/to/credentials',  // Custom credentials file
  configFile: '/path/to/config'             // Custom config file
})
```

### IMDS Provider

```typescript
new IMDSCredentialProvider({
  timeout: 5000,        // Request timeout (ms)
  maxRetries: 3,        // Max retry attempts
  useIMDSv2: true       // Use IMDSv2 (recommended)
})
```

### Cached Provider

```typescript
new CachedCredentialProvider(baseProvider, {
  ttl: 3600000,              // Cache duration (ms)
  refreshBuffer: 300000      // Refresh before expiry (ms)
})
```

## Deployment Scenarios

### Local Development

Option 1: Use environment variables
```bash
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
```

Option 2: Use AWS profile
```bash
# ~/.aws/credentials
[default]
aws_access_key_id = your-key
aws_secret_access_key = your-secret
```

Then use `defaultProvider()` in your code.

### Docker Container

Set environment variables in your Dockerfile or docker-compose.yml:

```yaml
environment:
  - AWS_ACCESS_KEY_ID=your-key
  - AWS_SECRET_ACCESS_KEY=your-secret
```

### EC2 Instance

No configuration needed! Attach an IAM role to your instance and use `defaultProvider()`:

```typescript
// Works automatically on EC2 with IAM role
const provider = defaultProvider();
const credentials = await provider.getCredentials();
```

### Kubernetes

Use environment variables from secrets:

```yaml
env:
  - name: AWS_ACCESS_KEY_ID
    valueFrom:
      secretKeyRef:
        name: aws-credentials
        key: access-key-id
  - name: AWS_SECRET_ACCESS_KEY
    valueFrom:
      secretKeyRef:
        name: aws-credentials
        key: secret-access-key
```

### Lambda Function

No configuration needed! Use the execution role:

```typescript
// Works automatically with Lambda execution role
const provider = defaultProvider();
const credentials = await provider.getCredentials();
```

## Troubleshooting

### "Credentials not found" error

**Problem:** `CredentialError [MISSING]`

**Solution:**
1. Check environment variables are set
2. Verify `~/.aws/credentials` exists and has correct profile
3. On EC2, ensure IAM role is attached to instance

### "All providers failed" error

**Problem:** `CredentialError [LOAD_FAILED]` with chain

**Solution:**
- Check the detailed error message for each provider
- Ensure at least one credential source is configured

### IMDS timeout

**Problem:** `CredentialError [IMDS_ERROR]`

**Solution:**
1. Verify you're running on EC2
2. Check IAM role is attached
3. Increase timeout: `new IMDSCredentialProvider({ timeout: 10000 })`

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use IAM roles** on EC2/ECS/Lambda instead of static credentials
3. **Rotate credentials** regularly
4. **Use temporary credentials** when possible (with expiration)
5. **Set file permissions** on `~/.aws/credentials` to 0600

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check [credentials-example.ts](../../examples/credentials-example.ts) for more examples
- Implement proper error handling in your application
- Add credential refresh logic for long-running processes

## Quick Reference

| Provider | Use Case | Priority in Chain |
|----------|----------|-------------------|
| `StaticCredentialProvider` | Testing, known credentials | Manual |
| `EnvironmentCredentialProvider` | Environment variables | 1st (highest) |
| `ProfileCredentialProvider` | AWS CLI profiles | 2nd |
| `IMDSCredentialProvider` | EC2 instances | 3rd (lowest) |
| `ChainCredentialProvider` | Multiple sources with fallback | Custom |
| `CachedCredentialProvider` | Performance optimization | Wrapper |

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `MISSING` | Credentials not found | Check configuration |
| `INVALID` | Malformed credentials | Verify format |
| `EXPIRED` | Credentials expired | Refresh credentials |
| `LOAD_FAILED` | Chain provider failed | Check all providers |
| `IMDS_ERROR` | Metadata service error | Verify EC2 setup |
| `PROFILE_ERROR` | Profile file error | Check file format |

## Support

For more help:
- See [README.md](./README.md) for comprehensive documentation
- Check [examples](../../examples/) for working code samples
- Review error messages for specific guidance
