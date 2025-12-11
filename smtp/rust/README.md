# SMTP Integration - Rust

[![Crates.io](https://img.shields.io/crates/v/integrations-smtp.svg)](https://crates.io/crates/integrations-smtp)
[![Documentation](https://docs.rs/integrations-smtp/badge.svg)](https://docs.rs/integrations-smtp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/github/workflow/status/integrations/smtp/CI)](https://github.com/integrations/smtp/actions)

A production-ready SMTP client library for Rust with enterprise-grade features including multiple authentication methods, TLS support, connection pooling, and comprehensive resilience patterns.

## Overview

`integrations-smtp` is a fully-featured, async SMTP client implementation built on Tokio. It provides a robust foundation for sending emails at scale with:

- **RFC Compliance**: Full RFC 5321 (SMTP) and RFC 5322 (message format) compliance
- **Security First**: Transport-layer encryption with STARTTLS and implicit TLS support
- **Multiple Authentication Methods**: PLAIN, LOGIN, CRAM-MD5, XOAUTH2, and OAUTHBEARER
- **High Performance**: Connection pooling with health checks and automatic lifecycle management
- **Resilience**: Built-in retry with exponential backoff, circuit breaker, and rate limiting
- **Rich MIME Support**: HTML emails, attachments, inline images, and multipart messages
- **Observability**: Comprehensive tracing and metrics integration
- **Type Safety**: Strongly-typed APIs with builder patterns and compile-time guarantees

## Features

### Authentication Methods
- **PLAIN** (RFC 4616) - Simple username/password authentication
- **LOGIN** - Legacy authentication method (widely supported)
- **CRAM-MD5** (RFC 2195) - Challenge-response authentication
- **XOAUTH2** - OAuth2 for Gmail and Microsoft services
- **OAUTHBEARER** (RFC 7628) - Modern OAuth 2.0 bearer token authentication

### Transport Security
- **STARTTLS** - Opportunistic or required TLS upgrade
- **Implicit TLS** - Direct TLS connection (port 465)
- **TLS 1.2/1.3** - Modern TLS versions with configurable minimums
- **Certificate Verification** - Full certificate chain validation
- **mTLS Support** - Mutual TLS with client certificates

### Connection Management
- **Connection Pooling** - Efficient connection reuse with configurable pool size
- **Health Checks** - Automatic connection validation and lifecycle management
- **Idle Timeout** - Automatic cleanup of stale connections
- **Connection Limits** - Per-host connection limits

### Resilience Patterns
- **Retry with Exponential Backoff** - Automatic retry with configurable backoff strategies
- **Circuit Breaker** - Fail-fast pattern to prevent cascading failures
- **Rate Limiting** - Control email send rate and concurrent connections
- **Timeout Management** - Configurable timeouts for all operations

### MIME & Message Building
- **HTML Emails** - Rich HTML content with proper encoding
- **Plain Text** - Text-only or multipart alternative messages
- **File Attachments** - Binary attachments with automatic content-type detection
- **Inline Images** - Embedded images for HTML emails (CID references)
- **Custom Headers** - Full control over email headers
- **Thread Support** - In-Reply-To and References headers for email threads

## Quick Start

Add this to your `Cargo.toml`:

```toml
[dependencies]
integrations-smtp = "0.1"
tokio = { version = "1", features = ["full"] }
```

### Basic Example

```rust
use integrations_smtp::{SmtpClient, SmtpConfig, EmailBuilder};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create client configuration
    let config = SmtpConfig::builder()
        .host("smtp.example.com")
        .port(587)
        .credentials("user@example.com", "password")
        .build()?;

    // Initialize the SMTP client
    let client = SmtpClient::new(config).await?;

    // Build an email
    let email = EmailBuilder::new()
        .from("sender@example.com")?
        .to("recipient@example.com")?
        .subject("Hello from Rust!")
        .text("This is a test email sent using the integrations-smtp library.")
        .build()?;

    // Send the email
    let result = client.send(email).await?;
    println!("Email sent successfully! Message ID: {}", result.message_id);

    Ok(())
}
```

## Configuration

### SMTP Configuration

Configure the SMTP client with various options:

```rust
use integrations_smtp::{SmtpConfig, TlsMode, TlsVersion};
use std::time::Duration;

let config = SmtpConfig::builder()
    .host("smtp.gmail.com")
    .port(587)
    .credentials("user@gmail.com", "app-password")
    .tls_mode(TlsMode::StartTlsRequired)
    .connect_timeout(Duration::from_secs(30))
    .command_timeout(Duration::from_secs(60))
    .max_message_size(25 * 1024 * 1024) // 25 MB
    .client_id("my-application")
    .build()?;
```

### TLS Configuration

Advanced TLS settings for secure connections:

```rust
use integrations_smtp::{TlsConfig, TlsMode, TlsVersion};

let tls_config = TlsConfig::builder()
    .mode(TlsMode::StartTlsRequired)
    .min_version(TlsVersion::Tls13)
    .verify_certificate(true)
    .verify_hostname(true)
    .ca_cert_path("/path/to/ca-cert.pem")
    .build()?;

let config = SmtpConfig::builder()
    .host("smtp.example.com")
    .port(587)
    .tls(tls_config)
    .credentials("user", "password")
    .build()?;
```

### Connection Pool Configuration

Optimize performance with connection pooling:

```rust
use integrations_smtp::PoolConfig;
use std::time::Duration;

let pool_config = PoolConfig {
    max_connections: 10,
    min_idle: 2,
    acquire_timeout: Duration::from_secs(30),
    idle_timeout: Duration::from_secs(300),
    max_lifetime: Duration::from_secs(3600),
    health_check_enabled: true,
    health_check_interval: Duration::from_secs(60),
};

let config = SmtpConfig::builder()
    .host("smtp.example.com")
    .port(587)
    .credentials("user", "password")
    .pool(pool_config)
    .build()?;
```

## Authentication

### PLAIN Authentication

Simple username/password authentication (requires TLS):

```rust
let config = SmtpConfig::builder()
    .host("smtp.example.com")
    .port(587)
    .credentials("username", "password")
    .auth_method(AuthMethod::Plain)
    .build()?;
```

### LOGIN Authentication

Legacy authentication method (widely supported):

```rust
use integrations_smtp::AuthMethod;

let config = SmtpConfig::builder()
    .host("smtp.example.com")
    .port(587)
    .credentials("username", "password")
    .auth_method(AuthMethod::Login)
    .build()?;
```

### OAuth2 Authentication

OAuth2 for Gmail and Microsoft services:

```rust
use integrations_smtp::{SmtpClient, Credentials, AuthMethod};

// XOAUTH2 for Gmail
let credentials = Credentials::xoauth2(
    "user@gmail.com",
    "ya29.a0AfH6SMBx..." // OAuth2 access token
);

let config = SmtpConfig::builder()
    .host("smtp.gmail.com")
    .port(587)
    .username("user@gmail.com")
    .auth_method(AuthMethod::XOAuth2)
    .build()?;

// Note: You'll need to provide credentials via a custom credential provider
```

### OAuth Bearer Token

Modern OAuth 2.0 bearer token authentication:

```rust
use integrations_smtp::{Credentials, AuthMethod};

let credentials = Credentials::oauth_bearer("access_token_here");

let config = SmtpConfig::builder()
    .host("smtp.example.com")
    .port(587)
    .auth_method(AuthMethod::OAuthBearer)
    .build()?;
```

## Email Building

### HTML Emails

Send rich HTML content:

```rust
let email = EmailBuilder::new()
    .from("sender@example.com")?
    .to("recipient@example.com")?
    .subject("HTML Newsletter")
    .html(r#"
        <html>
            <body>
                <h1>Welcome!</h1>
                <p>This is a <strong>HTML</strong> email.</p>
            </body>
        </html>
    "#)
    .build()?;

client.send(email).await?;
```

### Multipart Alternative (Text + HTML)

Provide both text and HTML versions:

```rust
let email = EmailBuilder::new()
    .from("sender@example.com")?
    .to("recipient@example.com")?
    .subject("Multipart Email")
    .text("This is the plain text version.")
    .html("<p>This is the <b>HTML</b> version.</p>")
    .build()?;
```

### Attachments

Add file attachments to your emails:

```rust
use integrations_smtp::Attachment;
use std::fs;

// Read file contents
let pdf_data = fs::read("document.pdf")?;

// Create attachment with auto-detected content type
let attachment = Attachment::from_file("document.pdf", pdf_data);

let email = EmailBuilder::new()
    .from("sender@example.com")?
    .to("recipient@example.com")?
    .subject("Document Attached")
    .text("Please find the document attached.")
    .attachment(attachment)
    .build()?;

client.send(email).await?;
```

### Inline Images

Embed images in HTML emails:

```rust
use integrations_smtp::InlineImage;

let image_data = fs::read("logo.png")?;
let inline_image = InlineImage::new(
    "logo",
    "image/png",
    image_data
);

let html = format!(
    r#"<html><body>
        <img src="{}" alt="Logo" />
        <p>Company Newsletter</p>
    </body></html>"#,
    inline_image.cid_reference()
);

let email = EmailBuilder::new()
    .from("sender@example.com")?
    .to("recipient@example.com")?
    .subject("Newsletter with Image")
    .html(html)
    .inline_image(inline_image)
    .build()?;
```

### Multiple Recipients

Send to multiple recipients with CC and BCC:

```rust
let email = EmailBuilder::new()
    .from("sender@example.com")?
    .to("recipient1@example.com")?
    .to("recipient2@example.com")?
    .cc("manager@example.com")?
    .bcc("archive@example.com")?
    .subject("Team Update")
    .text("This email is sent to multiple recipients.")
    .build()?;
```

### Custom Headers

Add custom email headers:

```rust
let email = EmailBuilder::new()
    .from("sender@example.com")?
    .to("recipient@example.com")?
    .subject("Custom Headers")
    .text("Email with custom headers")
    .header("X-Priority", "1")
    .header("X-Mailer", "MyApp/1.0")
    .header("List-Unsubscribe", "<mailto:unsubscribe@example.com>")
    .build()?;
```

## Resilience

### Retry Configuration

Automatic retry with exponential backoff:

```rust
use integrations_smtp::RetryConfig;
use std::time::Duration;

let retry_config = RetryConfig {
    enabled: true,
    max_attempts: 3,
    initial_delay: Duration::from_millis(500),
    max_delay: Duration::from_secs(30),
    multiplier: 2.0,
    jitter: true,
};

let config = SmtpConfig::builder()
    .host("smtp.example.com")
    .port(587)
    .credentials("user", "password")
    .retry(retry_config)
    .build()?;
```

### Circuit Breaker

Prevent cascading failures with circuit breaker pattern:

```rust
use integrations_smtp::CircuitBreakerConfig;
use std::time::Duration;

let circuit_breaker_config = CircuitBreakerConfig {
    enabled: true,
    failure_threshold: 5,          // Open after 5 failures
    failure_window: Duration::from_secs(60),
    recovery_timeout: Duration::from_secs(30),
    success_threshold: 3,          // Close after 3 successes
};

let config = SmtpConfig::builder()
    .host("smtp.example.com")
    .port(587)
    .credentials("user", "password")
    .circuit_breaker(circuit_breaker_config)
    .build()?;
```

### Rate Limiting

Control email send rate:

```rust
use integrations_smtp::{RateLimitConfig, OnLimitBehavior};
use std::time::Duration;

let rate_limit_config = RateLimitConfig {
    enabled: true,
    max_emails: Some(100),         // Max 100 emails
    window: Duration::from_secs(60), // Per minute
    max_connections: Some(5),
    on_limit: OnLimitBehavior::Wait,
};

let config = SmtpConfig::builder()
    .host("smtp.example.com")
    .port(587)
    .credentials("user", "password")
    .rate_limit(rate_limit_config)
    .build()?;
```

## Observability

### Tracing

Enable tracing for debugging and monitoring:

```toml
[dependencies]
integrations-smtp = { version = "0.1", features = ["tracing"] }
tracing = "0.1"
tracing-subscriber = "0.3"
```

```rust
use tracing_subscriber;

// Initialize tracing
tracing_subscriber::fmt::init();

// All SMTP operations will now emit tracing events
let client = SmtpClient::new(config).await?;
let result = client.send(email).await?;
```

### Metrics

Collect metrics with OpenTelemetry:

```toml
[dependencies]
integrations-smtp = { version = "0.1", features = ["metrics"] }
opentelemetry = "0.21"
```

The library automatically tracks:
- Email send duration
- Success/failure rates
- Connection pool statistics
- Retry attempts
- Circuit breaker state changes

## Error Handling

The library provides detailed error types for robust error handling:

```rust
use integrations_smtp::{SmtpError, SmtpErrorKind};

match client.send(email).await {
    Ok(result) => {
        println!("Email sent: {}", result.message_id);
    }
    Err(e) => {
        match e.kind() {
            SmtpErrorKind::ConnectionFailed => {
                eprintln!("Failed to connect to SMTP server: {}", e);
            }
            SmtpErrorKind::AuthenticationFailed => {
                eprintln!("Authentication failed: {}", e);
            }
            SmtpErrorKind::InvalidRecipientAddress => {
                eprintln!("Invalid recipient address: {}", e);
            }
            SmtpErrorKind::MessageRejected => {
                eprintln!("Server rejected the message: {}", e);
            }
            SmtpErrorKind::Timeout => {
                eprintln!("Operation timed out: {}", e);
            }
            _ => {
                eprintln!("SMTP error: {}", e);
            }
        }
    }
}
```

### Checking Retryability

```rust
if error.is_retryable() {
    // This error can be retried
    println!("Temporary error, will retry");
} else {
    // Permanent error, don't retry
    println!("Permanent error: {}", error);
}
```

### Partial Send Results

Handle cases where some recipients are accepted and others rejected:

```rust
let result = client.send(email).await?;

if result.is_complete_success() {
    println!("All recipients accepted");
} else if result.is_partial_success() {
    println!("Accepted: {:?}", result.accepted);
    println!("Rejected: {:?}", result.rejected);
}
```

## Testing

### Mock Infrastructure

The library provides comprehensive mocking support for testing:

```rust
use integrations_smtp::mocks::{MockSmtpServer, MockSmtpClient};

#[tokio::test]
async fn test_email_sending() {
    let mock_server = MockSmtpServer::new();

    // Configure mock behavior
    mock_server
        .expect_send()
        .times(1)
        .returning(|_| Ok(SendResult { /* ... */ }));

    // Use mock in tests
    let client = MockSmtpClient::new(mock_server);
    let email = EmailBuilder::new()
        .from("test@example.com")?
        .to("recipient@example.com")?
        .subject("Test")
        .text("Test message")
        .build()?;

    let result = client.send(email).await?;
    assert!(result.is_complete_success());
}
```

### Integration Testing

Run integration tests against a real SMTP server:

```rust
#[tokio::test]
#[ignore] // Run with --ignored flag
async fn test_real_smtp_server() {
    let config = SmtpConfig::builder()
        .host("localhost")
        .port(1025) // MailHog/MailDev port
        .no_tls()
        .build()?;

    let client = SmtpClient::new(config).await?;
    // ... test with real server
}
```

## Provider Compatibility

The library has been tested and works with major email service providers:

### Gmail

```rust
let config = SmtpConfig::builder()
    .host("smtp.gmail.com")
    .port(587)
    .credentials("user@gmail.com", "app-password")
    .tls_mode(TlsMode::StartTlsRequired)
    .build()?;
```

Note: Use App Passwords, not your regular Gmail password. Enable 2FA and generate an app password.

### AWS SES

```rust
let config = SmtpConfig::builder()
    .host("email-smtp.us-east-1.amazonaws.com")
    .port(587)
    .credentials("AKIAIOSFODNN7EXAMPLE", "smtp-password")
    .tls_mode(TlsMode::StartTlsRequired)
    .build()?;
```

### SendGrid

```rust
let config = SmtpConfig::builder()
    .host("smtp.sendgrid.net")
    .port(587)
    .credentials("apikey", "SG.your-api-key")
    .tls_mode(TlsMode::StartTlsRequired)
    .build()?;
```

### Mailgun

```rust
let config = SmtpConfig::builder()
    .host("smtp.mailgun.org")
    .port(587)
    .credentials("postmaster@your-domain.mailgun.org", "password")
    .tls_mode(TlsMode::StartTlsRequired)
    .build()?;
```

### Postfix (Self-Hosted)

```rust
let config = SmtpConfig::builder()
    .host("mail.example.com")
    .port(587)
    .credentials("user@example.com", "password")
    .tls_mode(TlsMode::StartTls)
    .build()?;
```

## Advanced Usage

### Batch Sending

Send multiple emails efficiently:

```rust
let emails = vec![email1, email2, email3];
let results = client.send_batch(emails).await?;

println!("Sent: {}/{}", results.succeeded, results.total);
for (i, result) in results.results.iter().enumerate() {
    match result {
        Ok(send_result) => println!("Email {} sent: {}", i, send_result.message_id),
        Err(e) => eprintln!("Email {} failed: {}", i, e),
    }
}
```

### Connection Pool Status

Monitor connection pool health:

```rust
let status = client.pool_status().await?;
println!("Pool status:");
println!("  Total connections: {}", status.total);
println!("  Idle connections: {}", status.idle);
println!("  In-use connections: {}", status.in_use);
println!("  Pending requests: {}", status.pending);
```

### Connection Information

Get detailed connection information:

```rust
let info = client.connection_info().await?;
println!("Connected to: {}:{}", info.host, info.port);
println!("TLS enabled: {}", info.tls_enabled);
println!("Server capabilities: {:?}", info.capabilities);
```

## Performance Tips

1. **Use Connection Pooling**: Enable connection pooling for high-throughput scenarios
2. **Configure Timeouts**: Set appropriate timeouts based on your network conditions
3. **Batch Operations**: Use batch sending for multiple emails
4. **Enable TLS Session Resumption**: Reduces TLS handshake overhead
5. **Tune Pool Size**: Match pool size to your workload (typically 5-10 connections)
6. **Use Rate Limiting**: Prevent hitting provider limits
7. **Enable Health Checks**: Detect and replace failed connections automatically

## Security Best Practices

1. **Always Use TLS**: Never send credentials over unencrypted connections
2. **Verify Certificates**: Keep certificate verification enabled in production
3. **Use App Passwords**: For services like Gmail, use app-specific passwords
4. **Rotate Credentials**: Implement credential rotation policies
5. **Secure Storage**: Use secure secret management (e.g., HashiCorp Vault, AWS Secrets Manager)
6. **Monitor Access**: Enable logging and monitoring for security events
7. **Update Dependencies**: Keep the library and dependencies up to date

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- Documentation: https://docs.rs/integrations-smtp
- Issues: https://github.com/integrations/smtp/issues
- Discussions: https://github.com/integrations/smtp/discussions

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and changes.
