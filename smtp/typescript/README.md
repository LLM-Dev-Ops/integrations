# SMTP TypeScript Client

[![npm version](https://badge.fury.io/js/@integrations%2Fsmtp.svg)](https://www.npmjs.com/package/@integrations/smtp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

A production-ready SMTP client library for TypeScript/Node.js featuring connection pooling, comprehensive TLS support, multiple authentication methods, and enterprise-grade resilience patterns.

## Overview

`@integrations/smtp` is a robust, feature-complete SMTP client designed for production environments. It provides a modern, type-safe API with built-in support for connection pooling, TLS encryption, five authentication methods, automatic retries, circuit breakers, rate limiting, and comprehensive observability.

### Key Features

- **5 Authentication Methods**: PLAIN, LOGIN, CRAM-MD5, XOAUTH2, OAUTHBEARER
- **TLS Support**: Multiple modes including STARTTLS and implicit TLS with configurable cipher suites
- **Connection Pooling**: Efficient connection reuse with health checks and automatic lifecycle management
- **Resilience Patterns**: Automatic retries with exponential backoff, circuit breaker, and rate limiting
- **MIME Support**: Full multipart messages with attachments, inline images, and HTML emails
- **Observability**: Built-in metrics collection, structured logging, and distributed tracing hooks
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Mock Infrastructure**: Complete testing utilities for unit and integration tests
- **Provider Compatibility**: Works with Gmail, AWS SES, SendGrid, Mailgun, Postfix, and more

## Installation

```bash
npm install @integrations/smtp
```

```bash
yarn add @integrations/smtp
```

```bash
pnpm add @integrations/smtp
```

## Quick Start

```typescript
import { smtpClient, EmailBuilder, TlsMode } from '@integrations/smtp';

// Create client with builder pattern
const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .tlsMode(TlsMode.StartTls)
  .build();

// Build and send an email
const email = new EmailBuilder()
  .from('sender@example.com')
  .to('recipient@example.com')
  .subject('Hello World')
  .text('This is a plain text message.')
  .html('<h1>Hello World</h1><p>This is an HTML message.</p>')
  .build();

const result = await client.send(email);
console.log('Message sent:', result.messageId);
console.log('Accepted recipients:', result.accepted.length);
console.log('Duration:', result.durationMs, 'ms');

// Close client when done
await client.close();
```

## Configuration

### SMTP Configuration

Configure the client using the builder pattern or configuration objects:

```typescript
import { SmtpConfigBuilder, TlsMode, TlsVersion } from '@integrations/smtp';

// Using builder pattern (recommended)
const config = new SmtpConfigBuilder()
  .host('smtp.gmail.com')
  .port(587)
  .credentials('user@gmail.com', 'app-password')
  .tlsMode(TlsMode.StartTls)
  .connectTimeout(30000)
  .commandTimeout(60000)
  .build();

// Using configuration object
import { createSmtpConfig } from '@integrations/smtp';

const config = createSmtpConfig({
  host: 'smtp.gmail.com',
  port: 587,
  username: 'user@gmail.com',
  password: 'app-password',
  tls: {
    mode: TlsMode.StartTls,
    minVersion: TlsVersion.Tls12,
    verifyCertificate: true,
    acceptInvalidCerts: false,
  },
});
```

### TLS Configuration

```typescript
import { TlsMode, TlsVersion } from '@integrations/smtp';

const client = smtpClient()
  .host('smtp.example.com')
  .port(465)
  .credentials('user@example.com', 'password')
  .tls({
    mode: TlsMode.Implicit,        // Implicit TLS on port 465
    minVersion: TlsVersion.Tls13,  // Require TLS 1.3
    verifyCertificate: true,       // Verify server certificate
    acceptInvalidCerts: false,     // Reject invalid certificates
  })
  .build();

// STARTTLS (recommended for port 587)
const clientStartTls = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .tlsMode(TlsMode.StartTls)
  .build();
```

### Connection Pool Configuration

```typescript
const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .pool({
    maxConnections: 10,          // Maximum concurrent connections
    minIdle: 2,                  // Minimum idle connections
    acquireTimeout: 30000,       // Connection acquisition timeout (ms)
    idleTimeout: 300000,         // Idle connection timeout (5 minutes)
    maxLifetime: 3600000,        // Max connection lifetime (1 hour)
    healthCheckEnabled: true,    // Enable periodic health checks
    healthCheckInterval: 60000,  // Health check interval (1 minute)
  })
  .build();

// Check pool status
const status = await client.getPoolStatus();
console.log(`Pool: ${status.inUse}/${status.total} connections in use`);
console.log(`Idle: ${status.idle}, Pending: ${status.pending}`);
```

## Authentication

### PLAIN Authentication

```typescript
const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .authMethod(AuthMethod.Plain)
  .build();
```

### LOGIN Authentication

```typescript
import { AuthMethod } from '@integrations/smtp';

const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .authMethod(AuthMethod.Login)
  .build();
```

### OAuth2 Authentication

```typescript
import { createOAuth2Authenticator, AuthMethod } from '@integrations/smtp';

// For Google Gmail/Workspace
const client = smtpClient()
  .host('smtp.gmail.com')
  .port(587)
  .build();

// Create OAuth2 authenticator
const authenticator = createOAuth2Authenticator(
  'user@gmail.com',
  'ya29.a0ARrdaM...',  // Access token
  new Date(Date.now() + 3600000),  // Expires in 1 hour
  AuthMethod.XOAuth2
);

// Use with custom authentication
// (Advanced: requires access to client internals)
```

### CRAM-MD5 Authentication

```typescript
const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .authMethod(AuthMethod.CramMd5)
  .build();
```

### Custom Credential Provider

```typescript
import { CredentialProvider, Credentials, SecretString } from '@integrations/smtp';

class AwsSecretsProvider implements CredentialProvider {
  async getCredentials(): Promise<Credentials> {
    // Fetch from AWS Secrets Manager
    const secret = await fetchFromSecretsManager();
    return {
      username: secret.username,
      password: new SecretString(secret.password),
    };
  }

  async isValid(): Promise<boolean> {
    return true;
  }
}

// Use custom provider (requires manual client construction)
```

## Email Building

### Simple Text Email

```typescript
const email = new EmailBuilder()
  .from('sender@example.com')
  .to('recipient@example.com')
  .subject('Simple Text Email')
  .text('This is the email body.')
  .build();

await client.send(email);
```

### HTML Email with Plain Text Fallback

```typescript
const email = new EmailBuilder()
  .from('sender@example.com')
  .to('recipient@example.com')
  .subject('HTML Email')
  .text('This is the plain text version.')
  .html(`
    <html>
      <body>
        <h1>Welcome!</h1>
        <p>This is an <strong>HTML</strong> email.</p>
      </body>
    </html>
  `)
  .build();

await client.send(email);
```

### Email with Attachments

```typescript
import { createAttachment, createAttachmentFromFile } from '@integrations/smtp';
import { readFileSync } from 'fs';

const pdfData = readFileSync('./document.pdf');
const attachment = createAttachment(
  'document.pdf',
  'application/pdf',
  pdfData
);

// Or with auto-detected content type
const imageData = readFileSync('./photo.jpg');
const imageAttachment = createAttachmentFromFile('photo.jpg', imageData);

const email = new EmailBuilder()
  .from('sender@example.com')
  .to('recipient@example.com')
  .subject('Email with Attachments')
  .text('Please find attached files.')
  .attachment(attachment)
  .attachment(imageAttachment)
  .build();

await client.send(email);
```

### Email with Inline Images

```typescript
import { createInlineImage } from '@integrations/smtp';
import { readFileSync } from 'fs';

const logoData = readFileSync('./logo.png');
const logo = createInlineImage('logo', 'image/png', logoData);

const email = new EmailBuilder()
  .from('sender@example.com')
  .to('recipient@example.com')
  .subject('Email with Inline Image')
  .html(`
    <html>
      <body>
        <h1>Company Newsletter</h1>
        <img src="cid:logo" alt="Company Logo" />
        <p>Check out our logo above!</p>
      </body>
    </html>
  `)
  .inlineImage(logo)
  .build();

await client.send(email);
```

### Multiple Recipients

```typescript
const email = new EmailBuilder()
  .from('sender@example.com')
  .to('recipient1@example.com')
  .to('recipient2@example.com')
  .cc('manager@example.com')
  .bcc('archive@example.com')
  .replyTo('support@example.com')
  .subject('Multiple Recipients')
  .text('This email goes to multiple recipients.')
  .build();

await client.send(email);
```

### Custom Headers

```typescript
const email = new EmailBuilder()
  .from('sender@example.com')
  .to('recipient@example.com')
  .subject('Email with Custom Headers')
  .text('This email has custom headers.')
  .header('X-Priority', '1')
  .header('X-Custom-Header', 'value')
  .messageId('<custom-id@example.com>')
  .build();

await client.send(email);
```

## Resilience

### Retry Configuration

Automatic retries with exponential backoff and jitter:

```typescript
const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .retry({
    maxAttempts: 3,         // Retry up to 3 times
    initialDelay: 500,      // Start with 500ms delay
    maxDelay: 30000,        // Max delay of 30 seconds
    multiplier: 2,          // Double delay each attempt
    jitter: true,           // Add random jitter
    enabled: true,
  })
  .build();
```

### Circuit Breaker

Prevent cascading failures with circuit breaker pattern:

```typescript
const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .circuitBreaker({
    failureThreshold: 5,      // Open after 5 failures
    failureWindow: 60000,     // In 60 second window
    recoveryTimeout: 30000,   // Try recovery after 30 seconds
    successThreshold: 3,      // Close after 3 successes
    enabled: true,
  })
  .build();
```

### Rate Limiting

Control email sending rate:

```typescript
import { OnLimitBehavior } from '@integrations/smtp';

const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .rateLimit({
    maxEmails: 100,                    // Max 100 emails
    window: 60000,                     // Per minute
    onLimit: OnLimitBehavior.Wait,     // Wait when limit reached
    enabled: true,
  })
  .build();
```

### Disable Resilience Features

```typescript
const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .noRetry()              // Disable retries
  .noCircuitBreaker()     // Disable circuit breaker
  .build();
```

## Observability

### Metrics Collection

```typescript
const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .build();

// Send some emails
await client.send(email1);
await client.send(email2);

// Get metrics
const metrics = client.getMetrics();
console.log('Total sent:', metrics.totalSent);
console.log('Total failed:', metrics.totalFailed);
console.log('Average latency:', metrics.averageLatencyMs, 'ms');
console.log('Connection pool usage:', metrics.poolMetrics.peakConnections);
console.log('Circuit breaker trips:', metrics.circuitBreakerTrips);
```

### Structured Logging

```typescript
import { Logger, LogLevel, LogEntry } from '@integrations/smtp';

class CustomLogger implements Logger {
  log(entry: LogEntry): void {
    console.log(JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      context: entry.context,
    }));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log({ timestamp: new Date(), level: LogLevel.Debug, message, context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log({ timestamp: new Date(), level: LogLevel.Info, message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log({ timestamp: new Date(), level: LogLevel.Warn, message, context });
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log({
      timestamp: new Date(),
      level: LogLevel.Error,
      message,
      context: { ...context, error: error?.message },
    });
  }
}

const client = smtpClient()
  .host('smtp.example.com')
  .port(587)
  .credentials('user@example.com', 'password')
  .build();

// Note: Logger must be passed via SmtpClient constructor options
// const client = new SmtpClient({ ...config, logger: new CustomLogger() });
```

### Distributed Tracing

```typescript
import { TracingHook, RequestContext } from '@integrations/smtp';

const tracingHook: TracingHook = {
  onOperationStart(context: RequestContext): void {
    console.log(`Starting ${context.operation}`, context.metadata);
  },

  onOperationSuccess(context: RequestContext, durationMs: number): void {
    console.log(`Success ${context.operation} in ${durationMs}ms`);
  },

  onOperationFailure(context: RequestContext, error: Error, durationMs: number): void {
    console.log(`Failed ${context.operation} after ${durationMs}ms:`, error.message);
  },

  onEmailSent(messageId: string, recipientCount: number, durationMs: number): void {
    console.log(`Sent email ${messageId} to ${recipientCount} recipients in ${durationMs}ms`);
  },

  onConnectionAcquired(durationMs: number): void {
    console.log(`Acquired connection in ${durationMs}ms`);
  },

  onConnectionReleased(durationMs: number): void {
    console.log(`Released connection after ${durationMs}ms`);
  },
};

// Note: Tracing hooks must be passed via SmtpClient constructor options
// const client = new SmtpClient({ ...config, tracingHooks: [tracingHook] });
```

## Error Handling

```typescript
import {
  SmtpError,
  SmtpErrorKind,
  isRetryableError,
  isSmtpError,
} from '@integrations/smtp';

try {
  const result = await client.send(email);
  console.log('Email sent successfully:', result.messageId);
} catch (error) {
  if (isSmtpError(error)) {
    const smtpError = error as SmtpError;

    switch (smtpError.kind) {
      case SmtpErrorKind.AuthenticationFailed:
        console.error('Authentication failed - check credentials');
        break;

      case SmtpErrorKind.InvalidRecipientAddress:
        console.error('Invalid recipient address');
        break;

      case SmtpErrorKind.MessageTooLarge:
        console.error('Message exceeds size limit');
        break;

      case SmtpErrorKind.NetworkError:
        console.error('Network error - connection failed');
        if (isRetryableError(error)) {
          console.log('This error is retryable');
        }
        break;

      case SmtpErrorKind.ServerError:
        console.error('Server returned error:', smtpError.message);
        break;

      case SmtpErrorKind.Timeout:
        console.error('Operation timed out');
        break;

      default:
        console.error('SMTP error:', smtpError.kind, smtpError.message);
    }

    // Enhanced status code (if available)
    if (smtpError.enhancedStatusCode) {
      console.log('Enhanced code:', smtpError.enhancedStatusCode);
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Handling Partial Failures

```typescript
const result = await client.send(email);

if (result.rejected.length > 0) {
  console.log('Some recipients were rejected:');
  for (const rejected of result.rejected) {
    console.log(`  - ${rejected.address.email}: ${rejected.message}`);
  }
}

if (result.accepted.length > 0) {
  console.log(`Successfully sent to ${result.accepted.length} recipients`);
}
```

## Testing

### Mock Transport

```typescript
import {
  createMockTransport,
  MockTransportConfig,
  SmtpClient,
} from '@integrations/smtp';

// Create mock transport for testing
const mockConfig: MockTransportConfig = {
  autoConnect: true,
  autoAuthenticate: true,
  simulateDelay: 10,  // Simulate 10ms delay
};

const mockTransport = createMockTransport(mockConfig);

// Configure mock responses
mockTransport.queueResponse({ code: 250, message: 'OK', isMultiline: false });

// Use in tests
describe('Email sending', () => {
  it('should send email successfully', async () => {
    const client = smtpClient()
      .host('smtp.test.com')
      .port(587)
      .credentials('test@test.com', 'password')
      .build();

    const email = new EmailBuilder()
      .from('sender@test.com')
      .to('recipient@test.com')
      .subject('Test')
      .text('Test message')
      .build();

    const result = await client.send(email);

    expect(result.accepted.length).toBe(1);
    expect(result.accepted[0].email).toBe('recipient@test.com');

    // Verify sent commands
    const commands = mockTransport.getRecordedCommands();
    expect(commands).toContainEqual(expect.objectContaining({
      type: 'MAIL',
    }));
  });
});
```

### Mock Credential Provider

```typescript
import { createMockCredentialProvider } from '@integrations/smtp';

const mockProvider = createMockCredentialProvider('user@test.com', 'password');

const credentials = await mockProvider.getCredentials();
expect(credentials.username).toBe('user@test.com');
expect(credentials.password.expose()).toBe('password');
```

### Test Fixtures

```typescript
import { TestFixtures } from '@integrations/smtp';

// Get sample email for testing
const sampleEmail = TestFixtures.createSampleEmail();

// Get sample email with attachments
const emailWithAttachments = TestFixtures.createEmailWithAttachment();

// Get sample HTML email
const htmlEmail = TestFixtures.createHtmlEmail();
```

## Provider Compatibility

### Gmail

```typescript
const client = smtpClient()
  .host('smtp.gmail.com')
  .port(587)
  .credentials('user@gmail.com', 'app-password')  // Use app password
  .tlsMode(TlsMode.StartTls)
  .build();
```

### AWS SES

```typescript
const client = smtpClient()
  .host('email-smtp.us-east-1.amazonaws.com')
  .port(587)
  .credentials('AKIAIOSFODNN7EXAMPLE', 'smtp-credentials')
  .tlsMode(TlsMode.StartTls)
  .build();
```

### SendGrid

```typescript
const client = smtpClient()
  .host('smtp.sendgrid.net')
  .port(587)
  .credentials('apikey', 'SG.your-api-key')
  .authMethod(AuthMethod.Plain)
  .tlsMode(TlsMode.StartTls)
  .build();
```

### Mailgun

```typescript
const client = smtpClient()
  .host('smtp.mailgun.org')
  .port(587)
  .credentials('postmaster@your-domain.mailgun.org', 'password')
  .tlsMode(TlsMode.StartTls)
  .build();
```

### Postfix (Self-hosted)

```typescript
const client = smtpClient()
  .host('mail.example.com')
  .port(25)
  .noTls()  // Or use TLS based on your configuration
  .build();
```

## API Reference

### Core Classes

#### `SmtpClient`

Main client for sending emails.

**Methods:**
- `send(email: Email | EmailOptions): Promise<SendResult>` - Send a single email
- `sendBatch(emails: Email[]): Promise<BatchSendResult>` - Send multiple emails
- `getPoolStatus(): Promise<PoolStatus>` - Get connection pool status
- `getConnectionInfo(): Promise<ConnectionInfo>` - Get connection information
- `getMetrics(): SmtpMetrics` - Get collected metrics
- `close(): Promise<void>` - Close all connections

#### `EmailBuilder`

Fluent builder for constructing emails.

**Methods:**
- `from(address: string | Address): this` - Set sender
- `to(address: string | Address): this` - Add recipient
- `cc(address: string | Address): this` - Add CC recipient
- `bcc(address: string | Address): this` - Add BCC recipient
- `subject(subject: string): this` - Set subject
- `text(text: string): this` - Set plain text body
- `html(html: string): this` - Set HTML body
- `attachment(attachment: Attachment): this` - Add attachment
- `inlineImage(image: InlineImage): this` - Add inline image
- `header(name: string, value: string): this` - Add custom header
- `build(): Email` - Build the email

#### `SmtpConfigBuilder`

Fluent builder for client configuration.

**Methods:**
- `host(host: string): this` - Set SMTP server host
- `port(port: number): this` - Set SMTP server port
- `credentials(username: string, password: string): this` - Set credentials
- `authMethod(method: AuthMethod): this` - Set auth method
- `tlsMode(mode: TlsMode): this` - Set TLS mode
- `tls(config: Partial<TlsConfig>): this` - Set TLS configuration
- `pool(config: Partial<PoolConfig>): this` - Set pool configuration
- `retry(config: Partial<RetryConfig>): this` - Set retry configuration
- `circuitBreaker(config: Partial<CircuitBreakerConfig>): this` - Set circuit breaker config
- `rateLimit(config: Partial<RateLimitConfig>): this` - Set rate limit config
- `build(): SmtpConfig` - Build the configuration

### Key Interfaces

#### `Email`

Complete email message structure.

**Properties:**
- `from: Address` - Sender address
- `to: Address[]` - Primary recipients
- `cc: Address[]` - CC recipients
- `bcc: Address[]` - BCC recipients
- `subject: string` - Email subject
- `text?: string` - Plain text body
- `html?: string` - HTML body
- `attachments: Attachment[]` - File attachments
- `inlineImages: InlineImage[]` - Inline images
- `headers: Record<string, string>` - Custom headers

#### `SendResult`

Result of sending an email.

**Properties:**
- `messageId: string` - Message ID
- `accepted: Address[]` - Accepted recipients
- `rejected: RejectedRecipient[]` - Rejected recipients
- `response: string` - Server response
- `durationMs: number` - Send duration

#### `SmtpConfig`

Complete SMTP client configuration.

**Properties:**
- `host: string` - Server hostname
- `port: number` - Server port
- `username?: string` - Auth username
- `password?: string` - Auth password
- `tls: TlsConfig` - TLS configuration
- `pool: PoolConfig` - Pool configuration
- `retry: RetryConfig` - Retry configuration
- `circuitBreaker: CircuitBreakerConfig` - Circuit breaker config
- `rateLimit: RateLimitConfig` - Rate limit config

### Enums

#### `TlsMode`

- `None` - No TLS (insecure)
- `StartTls` - Opportunistic STARTTLS
- `StartTlsRequired` - Required STARTTLS
- `Implicit` - Implicit TLS (port 465)

#### `AuthMethod`

- `Plain` - PLAIN authentication
- `Login` - LOGIN authentication
- `CramMd5` - CRAM-MD5 challenge-response
- `XOAuth2` - Google/Microsoft XOAUTH2
- `OAuthBearer` - OAuth 2.0 Bearer Token

#### `SmtpErrorKind`

- `NetworkError` - Network/connection errors
- `Timeout` - Operation timeout
- `AuthenticationFailed` - Authentication failure
- `InvalidFromAddress` - Invalid sender address
- `InvalidRecipientAddress` - Invalid recipient address
- `MessageTooLarge` - Message exceeds size limit
- `ServerError` - SMTP server error
- `TlsError` - TLS-related error
- And more...

## License

MIT

---

**Documentation:** [Full API Documentation](https://github.com/integrations/smtp)
**Issues:** [GitHub Issues](https://github.com/integrations/smtp/issues)
**Contributing:** Contributions welcome! Please read our contributing guidelines.
