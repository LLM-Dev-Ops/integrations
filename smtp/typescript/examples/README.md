# SMTP TypeScript Examples

This directory contains comprehensive examples demonstrating various features of the SMTP client library.

## Prerequisites

Before running these examples, make sure you have:

1. Node.js installed (v16 or higher recommended)
2. TypeScript installed (`npm install -g typescript`)
3. The SMTP library installed (`npm install @integrations/smtp`)
4. Valid SMTP server credentials

## Examples Overview

### 1. Basic Send (`basic-send.ts`)

**What it demonstrates:**
- Creating an SMTP client with the builder pattern
- Building a simple text email
- Sending an email and handling the result
- Error handling with SMTP-specific errors
- Proper client cleanup

**When to use:**
- Learning the basics of the library
- Sending simple text emails
- Understanding error handling

**Run:**
```bash
npx ts-node basic-send.ts
```

### 2. HTML Email (`html-email.ts`)

**What it demonstrates:**
- Sending multipart/alternative emails (HTML + text)
- Creating emails with styled HTML content
- Adding display names to email addresses
- Setting custom headers (CC, BCC, custom headers)
- Email list management headers

**When to use:**
- Sending newsletters or marketing emails
- Creating rich email content with styling
- Ensuring email clients without HTML support can still read your content

**Run:**
```bash
npx ts-node html-email.ts
```

### 3. Attachments (`attachments.ts`)

**What it demonstrates:**
- Adding file attachments to emails
- Creating attachments from various sources (files, buffers)
- Embedding inline images in HTML (using CID)
- Sending multiple attachments
- Batch sending with attachments using connection pooling

**When to use:**
- Sending reports, documents, or files
- Creating emails with embedded images in HTML
- Sending bulk emails with shared attachments

**Run:**
```bash
npx ts-node attachments.ts
```

**Note:** This example references local files. You'll need to either:
- Create sample files in the appropriate directories, or
- Modify the file paths to point to existing files

### 4. OAuth2 Gmail (`oauth2-gmail.ts`)

**What it demonstrates:**
- Authenticating with Gmail using OAuth2 (XOAUTH2)
- Implementing a custom OAuth2 token provider
- Refreshing access tokens automatically
- Gmail-specific configuration and best practices
- Rate limiting for Gmail's sending limits

**When to use:**
- Sending emails through Gmail without app passwords
- Implementing secure, revocable authentication
- Building applications that send on behalf of users

**Run:**
```bash
npx ts-node oauth2-gmail.ts
```

**Setup required:**
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Gmail API
3. Create OAuth 2.0 credentials (OAuth client ID)
4. Get a refresh token using the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
5. Update the `GMAIL_CONFIG` object with your credentials

**Important Gmail Notes:**
- Free Gmail: 500 emails/day, ~100/minute
- Google Workspace: 2000 emails/day, ~200/minute
- Always store credentials securely (environment variables, secrets manager)
- Never commit OAuth credentials to version control

### 5. Connection Pooling (`connection-pooling.ts`)

**What it demonstrates:**
- Configuring connection pools for efficient batch sending
- Monitoring pool status in real-time
- High-performance batch email sending
- Rate limiting and circuit breakers
- Graceful shutdown handling
- Metrics collection and reporting

**When to use:**
- Sending large volumes of emails
- Optimizing for high throughput
- Monitoring email sending performance
- Building production email services

**Run individual examples:**
```bash
npx ts-node connection-pooling.ts
```

**What each example shows:**
- `basicPoolingExample()`: Simple batch sending with a pool
- `poolMonitoringExample()`: Real-time pool status monitoring
- `highPerformanceExample()`: Optimized settings for 1000+ emails
- `gracefulShutdownExample()`: Handling shutdown signals properly

## Configuration Guide

### Common SMTP Providers

#### Gmail
```typescript
.host('smtp.gmail.com')
.port(587)
.tlsMode(TlsMode.StartTls)
```

#### Outlook/Office 365
```typescript
.host('smtp.office365.com')
.port(587)
.tlsMode(TlsMode.StartTls)
```

#### SendGrid
```typescript
.host('smtp.sendgrid.net')
.port(587)
.tlsMode(TlsMode.StartTls)
.credentials('apikey', 'your-api-key')
```

#### Amazon SES
```typescript
.host('email-smtp.us-east-1.amazonaws.com')
.port(587)
.tlsMode(TlsMode.StartTls)
.credentials('your-smtp-username', 'your-smtp-password')
```

#### Mailgun
```typescript
.host('smtp.mailgun.org')
.port(587)
.tlsMode(TlsMode.StartTls)
```

### TLS Modes

- **StartTls**: Start with plaintext, upgrade to TLS (port 587) - Most common
- **ImplicitTls**: TLS from the start (port 465)
- **None**: No encryption (port 25) - Not recommended for production

### Authentication Methods

- **Plain**: Username and password (most common)
- **Login**: Similar to Plain
- **XOAuth2**: OAuth2 tokens (Gmail, Outlook)
- **CramMd5**: Challenge-response authentication

## Best Practices

### 1. Security
- Always use TLS encryption in production
- Store credentials in environment variables or a secrets manager
- Use OAuth2 when possible instead of passwords
- Rotate credentials regularly

### 2. Performance
- Use connection pooling for batch sends
- Configure rate limits to match your provider
- Monitor metrics to identify bottlenecks
- Reuse connections instead of creating new ones

### 3. Reliability
- Implement retry logic with exponential backoff
- Use circuit breakers to fail fast when servers are down
- Handle errors gracefully and log them
- Monitor send success rates

### 4. Email Best Practices
- Always provide both text and HTML versions
- Use meaningful subject lines
- Include unsubscribe links for bulk email
- Set up SPF, DKIM, and DMARC records
- Monitor bounce rates and feedback loops

### 5. Resource Management
- Always call `client.close()` when done
- Use try/finally blocks to ensure cleanup
- Handle shutdown signals gracefully
- Monitor connection pool utilization

## Troubleshooting

### Connection Issues

**Problem:** `connection_error` or timeout
```typescript
// Increase timeouts
.connectTimeout(30000)
.commandTimeout(60000)
```

**Problem:** TLS handshake fails
```typescript
// Try different TLS mode
.tlsMode(TlsMode.ImplicitTls)
.port(465)
```

### Authentication Issues

**Problem:** Authentication failed
- Verify credentials are correct
- Check if "less secure apps" needs to be enabled (Gmail)
- Ensure OAuth2 tokens are valid and not expired
- Check if 2FA is enabled (may need app password)

### Rate Limiting

**Problem:** 421 Too many connections
```typescript
// Reduce max connections
.poolConfig({
  maxConnections: 3,
})
```

**Problem:** 450/451 Temporary rate limit
```typescript
// Add rate limiting
.rateLimitConfig({
  maxPerSecond: 1,
  maxPerMinute: 50,
})
```

### Email Delivery

**Problem:** Emails go to spam
- Set up SPF, DKIM, and DMARC
- Use a reputable SMTP provider
- Avoid spam trigger words
- Include unsubscribe links
- Authenticate your domain

**Problem:** Attachments too large
- Check server's max message size
- Compress large files
- Consider using links instead of attachments

## Environment Variables

For production use, store credentials in environment variables:

```bash
# .env file
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASSWORD=your-password

# For Gmail OAuth2
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
```

Then load them in your code:
```typescript
import * as dotenv from 'dotenv';
dotenv.config();

const client = smtpClient()
  .host(process.env.SMTP_HOST!)
  .port(parseInt(process.env.SMTP_PORT!))
  .credentials(process.env.SMTP_USER!, process.env.SMTP_PASSWORD!)
  .build();
```

## Additional Resources

- [SMTP Protocol RFC 5321](https://tools.ietf.org/html/rfc5321)
- [MIME Format RFC 2045](https://tools.ietf.org/html/rfc2045)
- [Email Authentication (SPF, DKIM, DMARC)](https://www.cloudflare.com/learning/email-security/)
- [Google OAuth2 Setup](https://developers.google.com/identity/protocols/oauth2)
- [Email Best Practices](https://sendgrid.com/blog/email-best-practices/)

## Need Help?

If you encounter issues:
1. Check the error message and enhanced status code
2. Review the troubleshooting section above
3. Enable debug logging to see detailed protocol information
4. Check your SMTP provider's documentation
5. Open an issue on GitHub with details about your problem

## Contributing

Found a bug or have an improvement? Contributions are welcome!
Please submit pull requests or open issues on the GitHub repository.
