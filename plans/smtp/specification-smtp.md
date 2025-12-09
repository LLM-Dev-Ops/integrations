# SMTP Integration Module - Specification

**Module:** `integrations-smtp`
**Version:** 1.0.0
**Status:** SPARC Phase 1 - Specification
**Last Updated:** 2025-12-09
**Authors:** Integration Team
**Reviewers:** Architecture Board

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Module Purpose and Scope](#2-module-purpose-and-scope)
3. [Dependency Policy](#3-dependency-policy)
4. [Protocol Coverage](#4-protocol-coverage)
5. [Interface Definitions](#5-interface-definitions)
6. [Error Taxonomy](#6-error-taxonomy)
7. [Resilience Hooks](#7-resilience-hooks)
8. [Security Requirements](#8-security-requirements)
9. [Observability Requirements](#9-observability-requirements)
10. [Performance Requirements](#10-performance-requirements)
11. [Future-Proofing](#11-future-proofing)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Executive Summary

### 1.1 Overview

The `integrations-smtp` module provides a comprehensive, protocol-level SMTP (Simple Mail Transfer Protocol) client implementation for sending emails through any standards-compliant SMTP server. Unlike REST API-based email services (AWS SES, SendGrid API), this module implements the SMTP protocol directly (RFC 5321) with full support for modern extensions (ESMTP), secure transport (STARTTLS/TLS), authentication mechanisms (RFC 4954), and MIME message construction (RFC 2045-2049).

This module enables applications to send emails through:
- Corporate SMTP servers
- Cloud email providers via SMTP interface (Gmail SMTP, AWS SES SMTP, SendGrid SMTP, Mailgun SMTP)
- Self-hosted mail transfer agents (Postfix, Sendmail, Exim)
- Development mail servers (Mailhog, Mailcatcher, MailDev)

### 1.2 Key Capabilities

| Capability | Description |
|------------|-------------|
| **Protocol Compliance** | Full RFC 5321 SMTP, RFC 5322 message format, ESMTP extensions |
| **Authentication** | PLAIN, LOGIN, CRAM-MD5, XOAUTH2, OAUTHBEARER |
| **Transport Security** | STARTTLS, implicit TLS (port 465), certificate validation |
| **MIME Support** | Multipart messages, attachments, HTML/text alternatives |
| **Connection Management** | Connection pooling, keepalive, automatic reconnection |
| **Resilience** | Retry with backoff, circuit breaker, rate limiting |
| **Observability** | OpenTelemetry tracing, structured logging, metrics |

### 1.3 Responsibilities Matrix

| Responsibility | This Module | Shared Primitives | Application |
|----------------|-------------|-------------------|-------------|
| SMTP protocol implementation | **PRIMARY** | - | - |
| MIME message encoding | **PRIMARY** | - | - |
| Connection lifecycle | **PRIMARY** | - | - |
| Authentication execution | **PRIMARY** | - | - |
| Retry orchestration | INTEGRATE | **PRIMARY** | - |
| Circuit breaker state | INTEGRATE | **PRIMARY** | - |
| Rate limit enforcement | INTEGRATE | **PRIMARY** | - |
| Distributed tracing | INTEGRATE | **PRIMARY** | - |
| Credential storage | - | - | **PRIMARY** |
| Email composition UI | - | - | **PRIMARY** |
| Delivery tracking | - | - | **PRIMARY** |

---

## 2. Module Purpose and Scope

### 2.1 Problem Statement

Applications require a reliable, secure, and observable way to send emails via SMTP protocol. Existing solutions often:
- Lack comprehensive authentication support
- Provide poor observability and debugging capabilities
- Have insufficient resilience for production workloads
- Mix concerns between transport and application logic

### 2.2 Solution Overview

The `integrations-smtp` module provides:
1. **Protocol-level SMTP client** with stateful connection management
2. **Fluent email builder** for MIME message construction
3. **Pluggable authentication** supporting modern OAuth2 flows
4. **Production-grade resilience** via shared integration primitives
5. **Comprehensive observability** with tracing, metrics, and logging

### 2.3 Scope Boundaries

#### 2.3.1 In Scope

| Category | Included Features |
|----------|-------------------|
| **SMTP Client** | Connect, authenticate, send, disconnect, connection pooling |
| **Authentication** | PLAIN, LOGIN, CRAM-MD5, XOAUTH2, OAUTHBEARER |
| **Transport Security** | STARTTLS negotiation, implicit TLS, certificate validation |
| **MIME Construction** | Email builder, multipart bodies, attachments, inline images |
| **Email Components** | Headers, body (text/HTML), recipients (To/Cc/Bcc), attachments |
| **Resilience** | Retry integration, circuit breaker integration, rate limit integration |
| **Observability** | Tracing spans, structured logs, metrics export |
| **Testing Support** | Mock SMTP server, test fixtures, protocol simulators |

#### 2.3.2 Out of Scope

| Category | Excluded Features | Rationale |
|----------|-------------------|-----------|
| **SMTP Server** | Receiving emails, MX handling | Separate module (smtp-server) |
| **IMAP/POP3** | Email retrieval protocols | Separate modules |
| **Email Parsing** | Parsing received emails | Not applicable to send-only client |
| **Email Storage** | Mailbox management, folders | Application responsibility |
| **Delivery Tracking** | Webhooks, open tracking | Service-specific, use SES/SendGrid APIs |
| **Template Engine** | Email templating, merge fields | Application responsibility |
| **Queue Management** | Persistent email queue | Application responsibility |
| **DNS/MX Lookup** | Direct-to-MX delivery | Relay through configured server |
| **DKIM/SPF/DMARC** | Email authentication records | Server/DNS responsibility |

### 2.4 Target Users

| User Type | Use Case |
|-----------|----------|
| **Application Developers** | Integrate email sending into applications |
| **DevOps Engineers** | Configure SMTP connections, monitor delivery |
| **Platform Teams** | Build email infrastructure on integration layer |
| **QA Engineers** | Test email functionality with mocks |

---

## 3. Dependency Policy

### 3.1 Dependency Rules

#### 3.1.1 MUST Depend On

The `integrations-smtp` module **MUST** depend on the following shared primitives:

| Primitive | Purpose | Version Constraint |
|-----------|---------|-------------------|
| `integrations-errors` | Base error types, error conversion traits | `^1.0` |
| `integrations-retry` | Retry executor, backoff strategies | `^1.0` |
| `integrations-circuit-breaker` | Circuit breaker state machine | `^1.0` |
| `integrations-rate-limit` | Rate limiting (token bucket, sliding window) | `^1.0` |
| `integrations-tracing` | Distributed tracing abstraction | `^1.0` |
| `integrations-logging` | Structured logging abstraction | `^1.0` |
| `integrations-types` | Shared type definitions | `^1.0` |
| `integrations-config` | Configuration management | `^1.0` |

#### 3.1.2 MUST NOT Depend On

| Dependency | Rationale |
|------------|-----------|
| `ruvbase` | Layer 0 external dependency - integration modules are Layer 1 |
| `integrations-ses` | Cross-module dependency forbidden |
| `integrations-sendgrid` | Cross-module dependency forbidden |
| `integrations-mailgun` | Cross-module dependency forbidden |
| Any other `integrations-*` module | Strict module isolation |

#### 3.1.3 MAY Depend On

| Dependency | Purpose | Constraint |
|------------|---------|------------|
| Standard library | Core Rust/TS functionality | Stable APIs only |
| `tokio` (Rust) | Async runtime, TCP streams | `^1.0` |
| `rustls` (Rust) | TLS implementation | `^0.23` |
| `base64` (Rust) | MIME encoding | `^0.22` |
| `nodemailer` (TS) | Reference only, not runtime | Development only |

### 3.2 Dependency Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Application Layer                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        integrations-smtp                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ SmtpClient  │  │ EmailBuilder│  │ MimeEncoder │  │ SmtpTransport│    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                    │                                     │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                ▼           ▼           ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌────────┐  ┌────────┐  ┌─────────────┐
│integrations-│  │integrations-│  │integra-│  │integra-│  │integrations-│
│   errors    │  │    retry    │  │tions-  │  │tions-  │  │   tracing   │
│             │  │             │  │circuit │  │rate-   │  │             │
│             │  │             │  │breaker │  │limit   │  │             │
└─────────────┘  └─────────────┘  └────────┘  └────────┘  └─────────────┘
        │                │             │           │              │
        └────────────────┴─────────────┴───────────┴──────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Shared Integration Primitives                        │
│         (integrations-types, integrations-config, integrations-logging) │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Standard Library / Runtime                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Protocol Coverage

### 4.1 SMTP Protocol Compliance

#### 4.1.1 Core SMTP (RFC 5321)

| Command | Support | Description |
|---------|---------|-------------|
| `HELO` | **FULL** | Basic SMTP handshake |
| `EHLO` | **FULL** | Extended SMTP handshake with capability discovery |
| `MAIL FROM` | **FULL** | Specify sender address with SIZE extension |
| `RCPT TO` | **FULL** | Specify recipient(s) |
| `DATA` | **FULL** | Begin message transmission |
| `RSET` | **FULL** | Reset current transaction |
| `NOOP` | **FULL** | Keep connection alive |
| `QUIT` | **FULL** | Close connection gracefully |
| `VRFY` | OPTIONAL | Verify address (often disabled on servers) |
| `EXPN` | OPTIONAL | Expand mailing list (often disabled) |
| `HELP` | NOT SUPPORTED | Rarely useful for clients |

#### 4.1.2 ESMTP Extensions

| Extension | RFC | Support | Description |
|-----------|-----|---------|-------------|
| `SIZE` | 1870 | **FULL** | Message size declaration |
| `8BITMIME` | 6152 | **FULL** | 8-bit MIME transport |
| `STARTTLS` | 3207 | **FULL** | TLS upgrade |
| `AUTH` | 4954 | **FULL** | Authentication |
| `PIPELINING` | 2920 | **FULL** | Command pipelining |
| `SMTPUTF8` | 6531 | PARTIAL | Internationalized email addresses |
| `CHUNKING` | 3030 | PARTIAL | BDAT command for large messages |
| `DSN` | 3461 | NOT YET | Delivery status notifications |
| `ENHANCEDSTATUSCODES` | 2034 | **FULL** | Enhanced status codes |

#### 4.1.3 SMTP Response Codes

| Code Range | Category | Handling |
|------------|----------|----------|
| 2xx | Success | Continue operation |
| 3xx | Intermediate | Await next step (e.g., DATA ready) |
| 4xx | Temporary Failure | Retry with backoff |
| 5xx | Permanent Failure | Fail operation, no retry |

**Key Response Codes:**

| Code | Meaning | Action |
|------|---------|--------|
| 220 | Service ready | Proceed with EHLO |
| 221 | Service closing | Connection closed normally |
| 235 | Authentication successful | Proceed with MAIL FROM |
| 250 | OK | Command completed |
| 334 | Auth challenge | Provide auth response |
| 354 | Start mail input | Send message body |
| 421 | Service unavailable | Retry later |
| 450 | Mailbox unavailable | Retry later |
| 451 | Local error | Retry later |
| 452 | Insufficient storage | Retry later |
| 500 | Syntax error | Fix command |
| 501 | Parameter error | Fix parameters |
| 503 | Bad command sequence | Reset and retry |
| 530 | Authentication required | Authenticate first |
| 535 | Authentication failed | Invalid credentials |
| 550 | Mailbox not found | Permanent failure |
| 552 | Message too large | Reduce size |
| 553 | Invalid address | Fix address |
| 554 | Transaction failed | Permanent failure |

### 4.2 Authentication Methods (RFC 4954)

| Method | Support | Security | Use Case |
|--------|---------|----------|----------|
| `PLAIN` | **FULL** | Requires TLS | Most common, simple username/password |
| `LOGIN` | **FULL** | Requires TLS | Legacy, still widely used |
| `CRAM-MD5` | **FULL** | Challenge-response | Avoids sending password |
| `XOAUTH2` | **FULL** | OAuth2 token | Google, Microsoft services |
| `OAUTHBEARER` | **FULL** | OAuth2 token | Modern RFC 7628 standard |
| `DIGEST-MD5` | NOT SUPPORTED | Deprecated | Security concerns |
| `NTLM` | NOT SUPPORTED | Windows-specific | Out of scope |
| `GSSAPI` | NOT SUPPORTED | Kerberos | Out of scope |

#### 4.2.1 Authentication Flow

```
CLIENT                                SERVER
   │                                     │
   │─────────── EHLO hostname ──────────▶│
   │◀────── 250-SIZE, AUTH PLAIN LOGIN ──│
   │                                     │
   │─────── AUTH PLAIN <base64> ────────▶│
   │◀──────────── 235 OK ────────────────│
   │                                     │
   │           [Authenticated]           │
```

### 4.3 Message Format (RFC 5322)

#### 4.3.1 Required Headers

| Header | Type | Description |
|--------|------|-------------|
| `Date` | REQUIRED | Message timestamp (RFC 5322 format) |
| `From` | REQUIRED | Sender address |
| `To` | CONDITIONAL | Primary recipients (at least one of To/Cc/Bcc) |
| `Subject` | RECOMMENDED | Message subject |
| `Message-ID` | RECOMMENDED | Unique message identifier |
| `MIME-Version` | REQUIRED (MIME) | Must be "1.0" for MIME messages |
| `Content-Type` | REQUIRED (MIME) | Media type of body |

#### 4.3.2 Optional Headers

| Header | Description |
|--------|-------------|
| `Cc` | Carbon copy recipients |
| `Bcc` | Blind carbon copy (stripped from message) |
| `Reply-To` | Preferred reply address |
| `In-Reply-To` | Reference to parent message |
| `References` | Thread references |
| `Content-Transfer-Encoding` | Encoding for body (7bit, quoted-printable, base64) |
| `X-*` | Custom headers |

### 4.4 MIME Encoding (RFC 2045-2049)

#### 4.4.1 Content Types

| Type | Use Case | Encoding |
|------|----------|----------|
| `text/plain` | Plain text body | UTF-8, quoted-printable |
| `text/html` | HTML body | UTF-8, quoted-printable |
| `multipart/alternative` | Text + HTML versions | Boundary-separated |
| `multipart/mixed` | Body + attachments | Boundary-separated |
| `multipart/related` | Body + inline images | Content-ID references |
| `application/octet-stream` | Binary attachment | Base64 |
| `application/pdf` | PDF attachment | Base64 |
| `image/*` | Image attachment/inline | Base64 |

#### 4.4.2 Transfer Encodings

| Encoding | Use Case | Overhead |
|----------|----------|----------|
| `7bit` | ASCII-only content | None |
| `8bit` | UTF-8 text (requires 8BITMIME) | None |
| `quoted-printable` | Mostly ASCII with some UTF-8 | ~10-20% |
| `base64` | Binary content | ~33% |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Core Traits

```rust
//! SMTP Integration Module - Core Traits
//!
//! This module defines the core abstractions for SMTP client functionality.
//! All implementations follow London-School TDD principles with mockable
//! trait boundaries.

use async_trait::async_trait;
use std::time::Duration;

// ============================================================================
// SmtpClient - Primary Client Interface
// ============================================================================

/// Primary interface for SMTP client operations.
///
/// This trait defines the high-level API for sending emails via SMTP.
/// Implementations handle connection management, authentication, and
/// message transmission.
///
/// # Example
/// ```rust
/// let client = SmtpClientBuilder::new()
///     .host("smtp.example.com")
///     .port(587)
///     .credentials(Credentials::plain("user", "pass"))
///     .build()?;
///
/// let email = EmailBuilder::new()
///     .from("sender@example.com")
///     .to("recipient@example.com")
///     .subject("Hello")
///     .text_body("Hello, World!")
///     .build()?;
///
/// let result = client.send(&email).await?;
/// ```
#[async_trait]
pub trait SmtpClient: Send + Sync {
    /// Send a single email message.
    ///
    /// # Arguments
    /// * `email` - The email message to send
    ///
    /// # Returns
    /// * `Ok(SendResult)` - Message accepted by server
    /// * `Err(SmtpError)` - Send failed
    ///
    /// # Errors
    /// * `SmtpError::Connection` - Failed to connect to server
    /// * `SmtpError::Authentication` - Authentication failed
    /// * `SmtpError::Protocol` - SMTP protocol error
    /// * `SmtpError::Message` - Invalid message format
    async fn send(&self, email: &Email) -> Result<SendResult, SmtpError>;

    /// Send multiple email messages in batch.
    ///
    /// Messages are sent sequentially over the same connection when possible.
    /// The method returns partial success - check individual results.
    ///
    /// # Arguments
    /// * `emails` - Slice of email messages to send
    ///
    /// # Returns
    /// * `Ok(BatchSendResult)` - Batch completed (may have partial failures)
    /// * `Err(SmtpError)` - Batch failed entirely (e.g., connection lost)
    async fn send_batch(&self, emails: &[Email]) -> Result<BatchSendResult, SmtpError>;

    /// Test the connection and authentication without sending.
    ///
    /// Useful for validating configuration during startup.
    ///
    /// # Returns
    /// * `Ok(ConnectionInfo)` - Connection successful
    /// * `Err(SmtpError)` - Connection or auth failed
    async fn test_connection(&self) -> Result<ConnectionInfo, SmtpError>;

    /// Get current connection pool status.
    ///
    /// # Returns
    /// Pool statistics including active connections, available slots, etc.
    fn pool_status(&self) -> PoolStatus;

    /// Gracefully shutdown the client.
    ///
    /// Closes all pooled connections and releases resources.
    async fn shutdown(&self) -> Result<(), SmtpError>;
}

// ============================================================================
// SmtpTransport - Low-Level Transport Interface
// ============================================================================

/// Low-level SMTP transport for protocol operations.
///
/// This trait abstracts the underlying network transport, enabling
/// testing with mock implementations. Production code uses TCP/TLS,
/// while tests use in-memory transports.
#[async_trait]
pub trait SmtpTransport: Send + Sync {
    /// Establish connection to SMTP server.
    ///
    /// # Arguments
    /// * `host` - Server hostname
    /// * `port` - Server port
    /// * `timeout` - Connection timeout
    ///
    /// # Returns
    /// * `Ok(())` - Connection established
    /// * `Err(SmtpError::Connection)` - Connection failed
    async fn connect(
        &mut self,
        host: &str,
        port: u16,
        timeout: Duration,
    ) -> Result<(), SmtpError>;

    /// Upgrade connection to TLS via STARTTLS.
    ///
    /// # Arguments
    /// * `config` - TLS configuration
    ///
    /// # Returns
    /// * `Ok(())` - TLS handshake successful
    /// * `Err(SmtpError::Tls)` - TLS upgrade failed
    async fn upgrade_tls(&mut self, config: &TlsConfig) -> Result<(), SmtpError>;

    /// Send an SMTP command and receive response.
    ///
    /// # Arguments
    /// * `command` - SMTP command to send
    /// * `timeout` - Read timeout
    ///
    /// # Returns
    /// * `Ok(SmtpResponse)` - Server response received
    /// * `Err(SmtpError)` - Command failed
    async fn command(
        &mut self,
        command: &SmtpCommand,
        timeout: Duration,
    ) -> Result<SmtpResponse, SmtpError>;

    /// Send raw data (for DATA command body).
    ///
    /// # Arguments
    /// * `data` - Raw bytes to send
    /// * `timeout` - Write timeout
    ///
    /// # Returns
    /// * `Ok(usize)` - Bytes written
    /// * `Err(SmtpError::Network)` - Write failed
    async fn send_data(&mut self, data: &[u8], timeout: Duration) -> Result<usize, SmtpError>;

    /// Close the connection.
    async fn close(&mut self) -> Result<(), SmtpError>;

    /// Check if connection is still alive.
    fn is_connected(&self) -> bool;

    /// Get the server's ESMTP capabilities.
    fn capabilities(&self) -> Option<&EsmtpCapabilities>;
}

// ============================================================================
// EmailBuilder - Fluent Email Construction
// ============================================================================

/// Fluent builder for constructing email messages.
///
/// # Example
/// ```rust
/// let email = EmailBuilder::new()
///     .from("sender@example.com")
///     .to("recipient@example.com")
///     .cc("cc@example.com")
///     .subject("Meeting Tomorrow")
///     .text_body("Please confirm your attendance.")
///     .html_body("<p>Please <b>confirm</b> your attendance.</p>")
///     .attach_file("/path/to/document.pdf")?
///     .header("X-Priority", "1")
///     .build()?;
/// ```
pub trait EmailBuilder: Send {
    /// Set the From address.
    fn from(self, address: impl Into<Address>) -> Self;

    /// Set the sender (if different from From).
    fn sender(self, address: impl Into<Address>) -> Self;

    /// Add a To recipient.
    fn to(self, address: impl Into<Address>) -> Self;

    /// Add multiple To recipients.
    fn to_many(self, addresses: impl IntoIterator<Item = impl Into<Address>>) -> Self;

    /// Add a Cc recipient.
    fn cc(self, address: impl Into<Address>) -> Self;

    /// Add multiple Cc recipients.
    fn cc_many(self, addresses: impl IntoIterator<Item = impl Into<Address>>) -> Self;

    /// Add a Bcc recipient.
    fn bcc(self, address: impl Into<Address>) -> Self;

    /// Add multiple Bcc recipients.
    fn bcc_many(self, addresses: impl IntoIterator<Item = impl Into<Address>>) -> Self;

    /// Set the Reply-To address.
    fn reply_to(self, address: impl Into<Address>) -> Self;

    /// Set the Subject.
    fn subject(self, subject: impl Into<String>) -> Self;

    /// Set plain text body.
    fn text_body(self, body: impl Into<String>) -> Self;

    /// Set HTML body.
    fn html_body(self, body: impl Into<String>) -> Self;

    /// Add a file attachment from path.
    fn attach_file(self, path: impl AsRef<Path>) -> Result<Self, SmtpError>
    where
        Self: Sized;

    /// Add an attachment from bytes.
    fn attach_bytes(
        self,
        filename: impl Into<String>,
        content_type: impl Into<String>,
        data: Vec<u8>,
    ) -> Self;

    /// Add an inline image (for HTML body).
    fn inline_image(
        self,
        content_id: impl Into<String>,
        content_type: impl Into<String>,
        data: Vec<u8>,
    ) -> Self;

    /// Add a custom header.
    fn header(self, name: impl Into<String>, value: impl Into<String>) -> Self;

    /// Set the Message-ID (auto-generated if not set).
    fn message_id(self, id: impl Into<String>) -> Self;

    /// Set In-Reply-To header.
    fn in_reply_to(self, message_id: impl Into<String>) -> Self;

    /// Add References header.
    fn references(self, message_ids: impl IntoIterator<Item = impl Into<String>>) -> Self;

    /// Set message priority (X-Priority header).
    fn priority(self, priority: Priority) -> Self;

    /// Build the email, validating all fields.
    fn build(self) -> Result<Email, SmtpError>;
}

// ============================================================================
// MimeEncoder - MIME Message Encoding
// ============================================================================

/// Encodes email messages to MIME format.
///
/// Handles multipart boundaries, transfer encoding, and header encoding.
#[async_trait]
pub trait MimeEncoder: Send + Sync {
    /// Encode email to MIME format for transmission.
    ///
    /// # Arguments
    /// * `email` - Email to encode
    ///
    /// # Returns
    /// * `Ok(Vec<u8>)` - Encoded MIME message
    /// * `Err(SmtpError::Message)` - Encoding failed
    fn encode(&self, email: &Email) -> Result<Vec<u8>, SmtpError>;

    /// Encode a header value (RFC 2047 encoded-word).
    fn encode_header(&self, value: &str) -> String;

    /// Encode body with appropriate transfer encoding.
    fn encode_body(&self, body: &[u8], encoding: TransferEncoding) -> Vec<u8>;

    /// Generate a unique boundary for multipart messages.
    fn generate_boundary(&self) -> String;

    /// Generate a unique Message-ID.
    fn generate_message_id(&self, domain: &str) -> String;
}

// ============================================================================
// CredentialProvider - Authentication Credentials
// ============================================================================

/// Provides authentication credentials for SMTP.
///
/// Abstraction allows for secure credential storage, refresh of
/// OAuth2 tokens, and testing with mock credentials.
#[async_trait]
pub trait CredentialProvider: Send + Sync {
    /// Get credentials for authentication.
    ///
    /// # Returns
    /// * `Ok(Credentials)` - Credentials available
    /// * `Err(SmtpError::Authentication)` - Credentials unavailable
    async fn get_credentials(&self) -> Result<Credentials, SmtpError>;

    /// Refresh credentials if needed (e.g., OAuth2 token refresh).
    ///
    /// # Returns
    /// * `Ok(true)` - Credentials refreshed
    /// * `Ok(false)` - No refresh needed
    /// * `Err(SmtpError::Authentication)` - Refresh failed
    async fn refresh(&self) -> Result<bool, SmtpError>;

    /// Check if credentials are valid/not expired.
    fn is_valid(&self) -> bool;

    /// Get the authentication method.
    fn auth_method(&self) -> AuthMethod;
}

// ============================================================================
// ConnectionPool - Connection Pooling
// ============================================================================

/// Manages a pool of SMTP connections for reuse.
///
/// Connection pooling reduces latency by avoiding repeated TCP/TLS
/// handshakes for high-volume sending.
#[async_trait]
pub trait ConnectionPool: Send + Sync {
    /// Acquire a connection from the pool.
    ///
    /// Returns an existing idle connection or creates a new one
    /// if capacity allows.
    ///
    /// # Arguments
    /// * `timeout` - Maximum time to wait for a connection
    ///
    /// # Returns
    /// * `Ok(PooledConnection)` - Connection acquired
    /// * `Err(SmtpError::Connection)` - No connection available
    async fn acquire(&self, timeout: Duration) -> Result<PooledConnection, SmtpError>;

    /// Return a connection to the pool.
    ///
    /// Connection may be dropped if unhealthy or pool is full.
    async fn release(&self, conn: PooledConnection);

    /// Get current pool statistics.
    fn status(&self) -> PoolStatus;

    /// Close all connections in the pool.
    async fn close_all(&self);

    /// Set pool configuration dynamically.
    fn configure(&self, config: PoolConfig);
}
```

#### 5.1.2 Data Types

```rust
//! SMTP Integration Module - Data Types
//!
//! Core data structures for SMTP operations.

use chrono::{DateTime, Utc};
use secrecy::SecretString;
use std::collections::HashMap;
use std::path::PathBuf;

// ============================================================================
// Email Message Types
// ============================================================================

/// A complete email message ready for sending.
#[derive(Debug, Clone)]
pub struct Email {
    /// Sender address (From header)
    pub from: Address,

    /// Sender address for envelope (may differ from From)
    pub sender: Option<Address>,

    /// Primary recipients
    pub to: Vec<Address>,

    /// Carbon copy recipients
    pub cc: Vec<Address>,

    /// Blind carbon copy recipients
    pub bcc: Vec<Address>,

    /// Reply-To address
    pub reply_to: Option<Address>,

    /// Email subject
    pub subject: String,

    /// Plain text body
    pub text_body: Option<String>,

    /// HTML body
    pub html_body: Option<String>,

    /// File attachments
    pub attachments: Vec<Attachment>,

    /// Inline images (for HTML body)
    pub inline_images: Vec<InlineImage>,

    /// Custom headers
    pub headers: HashMap<String, String>,

    /// Message ID (auto-generated if not set)
    pub message_id: Option<String>,

    /// In-Reply-To header
    pub in_reply_to: Option<String>,

    /// References header
    pub references: Vec<String>,

    /// Message priority
    pub priority: Option<Priority>,

    /// Message timestamp (defaults to now)
    pub date: DateTime<Utc>,
}

/// Email address with optional display name.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Address {
    /// Display name (e.g., "John Doe")
    pub name: Option<String>,

    /// Email address (e.g., "john@example.com")
    pub email: String,
}

impl Address {
    /// Create address from email only.
    pub fn new(email: impl Into<String>) -> Self {
        Self {
            name: None,
            email: email.into(),
        }
    }

    /// Create address with display name.
    pub fn with_name(name: impl Into<String>, email: impl Into<String>) -> Self {
        Self {
            name: Some(name.into()),
            email: email.into(),
        }
    }

    /// Format for SMTP envelope (just email).
    pub fn envelope_format(&self) -> String {
        format!("<{}>", self.email)
    }

    /// Format for message header (with name if present).
    pub fn header_format(&self) -> String {
        match &self.name {
            Some(name) => format!("\"{}\" <{}>", name, self.email),
            None => self.email.clone(),
        }
    }
}

/// File attachment.
#[derive(Debug, Clone)]
pub struct Attachment {
    /// Filename for Content-Disposition
    pub filename: String,

    /// MIME content type
    pub content_type: String,

    /// Raw file data
    pub data: Vec<u8>,

    /// Content-ID for inline attachments
    pub content_id: Option<String>,
}

/// Inline image for HTML body.
#[derive(Debug, Clone)]
pub struct InlineImage {
    /// Content-ID (referenced in HTML as cid:xxx)
    pub content_id: String,

    /// MIME content type (e.g., "image/png")
    pub content_type: String,

    /// Image data
    pub data: Vec<u8>,
}

/// Message priority level.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    Highest = 1,
    High = 2,
    Normal = 3,
    Low = 4,
    Lowest = 5,
}

// ============================================================================
// SMTP Protocol Types
// ============================================================================

/// SMTP command to send to server.
#[derive(Debug, Clone)]
pub enum SmtpCommand {
    /// EHLO command with client hostname
    Ehlo(String),

    /// HELO command (fallback)
    Helo(String),

    /// STARTTLS command
    StartTls,

    /// AUTH command with mechanism and initial response
    Auth(AuthMethod, Option<String>),

    /// AUTH continuation response
    AuthResponse(String),

    /// MAIL FROM command
    MailFrom {
        address: String,
        size: Option<u64>,
        body: Option<BodyType>,
    },

    /// RCPT TO command
    RcptTo(String),

    /// DATA command
    Data,

    /// RSET command
    Reset,

    /// NOOP command
    Noop,

    /// QUIT command
    Quit,

    /// VRFY command (optional)
    Verify(String),
}

impl SmtpCommand {
    /// Convert to wire format.
    pub fn to_bytes(&self) -> Vec<u8> {
        match self {
            Self::Ehlo(hostname) => format!("EHLO {}\r\n", hostname).into_bytes(),
            Self::Helo(hostname) => format!("HELO {}\r\n", hostname).into_bytes(),
            Self::StartTls => b"STARTTLS\r\n".to_vec(),
            Self::Auth(method, response) => {
                match response {
                    Some(r) => format!("AUTH {} {}\r\n", method.as_str(), r).into_bytes(),
                    None => format!("AUTH {}\r\n", method.as_str()).into_bytes(),
                }
            }
            Self::AuthResponse(response) => format!("{}\r\n", response).into_bytes(),
            Self::MailFrom { address, size, body } => {
                let mut cmd = format!("MAIL FROM:<{}>", address);
                if let Some(s) = size {
                    cmd.push_str(&format!(" SIZE={}", s));
                }
                if let Some(b) = body {
                    cmd.push_str(&format!(" BODY={}", b.as_str()));
                }
                cmd.push_str("\r\n");
                cmd.into_bytes()
            }
            Self::RcptTo(address) => format!("RCPT TO:<{}>\r\n", address).into_bytes(),
            Self::Data => b"DATA\r\n".to_vec(),
            Self::Reset => b"RSET\r\n".to_vec(),
            Self::Noop => b"NOOP\r\n".to_vec(),
            Self::Quit => b"QUIT\r\n".to_vec(),
            Self::Verify(address) => format!("VRFY {}\r\n", address).into_bytes(),
        }
    }
}

/// SMTP response from server.
#[derive(Debug, Clone)]
pub struct SmtpResponse {
    /// Status code (e.g., 250, 535)
    pub code: u16,

    /// Enhanced status code (e.g., "2.0.0")
    pub enhanced_code: Option<String>,

    /// Response message lines
    pub message: Vec<String>,

    /// Whether this is a multiline response
    pub is_multiline: bool,
}

impl SmtpResponse {
    /// Check if response indicates success (2xx).
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.code)
    }

    /// Check if response indicates temporary failure (4xx).
    pub fn is_temporary_failure(&self) -> bool {
        (400..500).contains(&self.code)
    }

    /// Check if response indicates permanent failure (5xx).
    pub fn is_permanent_failure(&self) -> bool {
        (500..600).contains(&self.code)
    }

    /// Check if ready for data input (354).
    pub fn is_ready_for_data(&self) -> bool {
        self.code == 354
    }

    /// Get full message as single string.
    pub fn full_message(&self) -> String {
        self.message.join("\n")
    }
}

/// ESMTP body type declaration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BodyType {
    SevenBit,
    EightBitMime,
}

impl BodyType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SevenBit => "7BIT",
            Self::EightBitMime => "8BITMIME",
        }
    }
}

/// ESMTP capabilities advertised by server.
#[derive(Debug, Clone, Default)]
pub struct EsmtpCapabilities {
    /// Maximum message size (SIZE extension)
    pub max_size: Option<u64>,

    /// Supported auth mechanisms
    pub auth_mechanisms: Vec<AuthMethod>,

    /// STARTTLS supported
    pub starttls: bool,

    /// 8BITMIME supported
    pub eight_bit_mime: bool,

    /// PIPELINING supported
    pub pipelining: bool,

    /// SMTPUTF8 supported
    pub utf8: bool,

    /// CHUNKING/BDAT supported
    pub chunking: bool,

    /// Enhanced status codes supported
    pub enhanced_status_codes: bool,

    /// DSN supported
    pub dsn: bool,

    /// All capability strings
    pub raw: Vec<String>,
}

// ============================================================================
// Authentication Types
// ============================================================================

/// Authentication method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AuthMethod {
    Plain,
    Login,
    CramMd5,
    XOAuth2,
    OAuthBearer,
}

impl AuthMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Plain => "PLAIN",
            Self::Login => "LOGIN",
            Self::CramMd5 => "CRAM-MD5",
            Self::XOAuth2 => "XOAUTH2",
            Self::OAuthBearer => "OAUTHBEARER",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_uppercase().as_str() {
            "PLAIN" => Some(Self::Plain),
            "LOGIN" => Some(Self::Login),
            "CRAM-MD5" => Some(Self::CramMd5),
            "XOAUTH2" => Some(Self::XOAuth2),
            "OAUTHBEARER" => Some(Self::OAuthBearer),
            _ => None,
        }
    }
}

/// Authentication credentials.
#[derive(Clone)]
pub enum Credentials {
    /// Username and password (for PLAIN, LOGIN, CRAM-MD5)
    Plain {
        username: String,
        password: SecretString,
    },

    /// OAuth2 access token (for XOAUTH2)
    XOAuth2 {
        username: String,
        access_token: SecretString,
    },

    /// OAuth Bearer token (for OAUTHBEARER)
    OAuthBearer {
        access_token: SecretString,
    },
}

impl std::fmt::Debug for Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Plain { username, .. } => {
                f.debug_struct("Plain")
                    .field("username", username)
                    .field("password", &"[REDACTED]")
                    .finish()
            }
            Self::XOAuth2 { username, .. } => {
                f.debug_struct("XOAuth2")
                    .field("username", username)
                    .field("access_token", &"[REDACTED]")
                    .finish()
            }
            Self::OAuthBearer { .. } => {
                f.debug_struct("OAuthBearer")
                    .field("access_token", &"[REDACTED]")
                    .finish()
            }
        }
    }
}

// ============================================================================
// Configuration Types
// ============================================================================

/// SMTP client configuration.
#[derive(Debug, Clone)]
pub struct SmtpConfig {
    /// Server hostname
    pub host: String,

    /// Server port
    pub port: u16,

    /// TLS configuration
    pub tls: TlsMode,

    /// TLS settings
    pub tls_config: TlsConfig,

    /// Authentication credentials
    pub credentials: Option<Credentials>,

    /// Preferred authentication method (auto-detect if None)
    pub auth_method: Option<AuthMethod>,

    /// Connection timeout
    pub connect_timeout: Duration,

    /// Read/write timeout
    pub io_timeout: Duration,

    /// Hostname to use in EHLO
    pub local_hostname: String,

    /// Connection pool settings
    pub pool: PoolConfig,

    /// Retry settings
    pub retry: RetryConfig,

    /// Circuit breaker settings
    pub circuit_breaker: CircuitBreakerConfig,

    /// Rate limit settings
    pub rate_limit: Option<RateLimitConfig>,
}

impl Default for SmtpConfig {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: 587,
            tls: TlsMode::StartTls,
            tls_config: TlsConfig::default(),
            credentials: None,
            auth_method: None,
            connect_timeout: Duration::from_secs(30),
            io_timeout: Duration::from_secs(60),
            local_hostname: hostname::get()
                .map(|h| h.to_string_lossy().into_owned())
                .unwrap_or_else(|_| "localhost".to_string()),
            pool: PoolConfig::default(),
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            rate_limit: None,
        }
    }
}

/// TLS mode for SMTP connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TlsMode {
    /// No TLS (plaintext) - NOT RECOMMENDED
    None,

    /// Upgrade via STARTTLS command (port 587)
    #[default]
    StartTls,

    /// Implicit TLS from connection start (port 465)
    Implicit,

    /// Require STARTTLS, fail if unavailable
    StartTlsRequired,
}

/// TLS configuration.
#[derive(Debug, Clone)]
pub struct TlsConfig {
    /// Verify server certificate
    pub verify_certificates: bool,

    /// Allow self-signed certificates (dev only)
    pub accept_invalid_certs: bool,

    /// Custom CA certificate path
    pub ca_cert_path: Option<PathBuf>,

    /// Client certificate path (for mTLS)
    pub client_cert_path: Option<PathBuf>,

    /// Client key path (for mTLS)
    pub client_key_path: Option<PathBuf>,

    /// Minimum TLS version
    pub min_version: TlsVersion,

    /// Server name for SNI (defaults to host)
    pub server_name: Option<String>,
}

impl Default for TlsConfig {
    fn default() -> Self {
        Self {
            verify_certificates: true,
            accept_invalid_certs: false,
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            min_version: TlsVersion::Tls12,
            server_name: None,
        }
    }
}

/// TLS version.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TlsVersion {
    Tls10, // NOT RECOMMENDED
    Tls11, // NOT RECOMMENDED
    #[default]
    Tls12,
    Tls13,
}

/// Connection pool configuration.
#[derive(Debug, Clone)]
pub struct PoolConfig {
    /// Maximum number of connections
    pub max_connections: usize,

    /// Minimum idle connections to maintain
    pub min_idle: usize,

    /// Maximum time to wait for connection
    pub acquire_timeout: Duration,

    /// Maximum idle time before connection is closed
    pub idle_timeout: Duration,

    /// Maximum lifetime of a connection
    pub max_lifetime: Duration,

    /// Enable connection health checks
    pub health_check: bool,

    /// Health check interval
    pub health_check_interval: Duration,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_connections: 5,
            min_idle: 1,
            acquire_timeout: Duration::from_secs(30),
            idle_timeout: Duration::from_secs(300),
            max_lifetime: Duration::from_secs(3600),
            health_check: true,
            health_check_interval: Duration::from_secs(60),
        }
    }
}

/// Retry configuration.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum retry attempts
    pub max_attempts: u32,

    /// Initial backoff delay
    pub initial_delay: Duration,

    /// Maximum backoff delay
    pub max_delay: Duration,

    /// Backoff multiplier
    pub multiplier: f64,

    /// Add jitter to delays
    pub jitter: bool,

    /// Retry on which errors
    pub retry_on: RetryConditions,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
            multiplier: 2.0,
            jitter: true,
            retry_on: RetryConditions::default(),
        }
    }
}

/// Conditions for retry.
#[derive(Debug, Clone, Default)]
pub struct RetryConditions {
    /// Retry on connection errors
    pub connection_errors: bool,

    /// Retry on timeout
    pub timeouts: bool,

    /// Retry on 4xx temporary failures
    pub temporary_failures: bool,

    /// Specific error codes to retry
    pub error_codes: Vec<u16>,
}

impl Default for RetryConditions {
    fn default() -> Self {
        Self {
            connection_errors: true,
            timeouts: true,
            temporary_failures: true,
            error_codes: vec![421, 450, 451, 452],
        }
    }
}

/// Circuit breaker configuration.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures to open circuit
    pub failure_threshold: u32,

    /// Time window for counting failures
    pub failure_window: Duration,

    /// Time to wait before attempting recovery
    pub recovery_timeout: Duration,

    /// Number of successes to close circuit
    pub success_threshold: u32,

    /// Enable circuit breaker
    pub enabled: bool,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            failure_window: Duration::from_secs(60),
            recovery_timeout: Duration::from_secs(30),
            success_threshold: 3,
            enabled: true,
        }
    }
}

/// Rate limit configuration.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Maximum emails per time window
    pub max_emails: u32,

    /// Time window
    pub window: Duration,

    /// Maximum connections per time window
    pub max_connections: Option<u32>,

    /// Behavior when limit exceeded
    pub on_limit: RateLimitBehavior,
}

/// Rate limit exceeded behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RateLimitBehavior {
    /// Return error immediately
    #[default]
    Reject,

    /// Wait until capacity available
    Wait,

    /// Wait with maximum timeout
    WaitWithTimeout,
}

// ============================================================================
// Result Types
// ============================================================================

/// Result of sending a single email.
#[derive(Debug, Clone)]
pub struct SendResult {
    /// Message ID assigned by this module
    pub message_id: String,

    /// Server-assigned queue ID
    pub server_id: Option<String>,

    /// Recipients that were accepted
    pub accepted: Vec<String>,

    /// Recipients that were rejected
    pub rejected: Vec<RejectedRecipient>,

    /// Server response message
    pub response: String,

    /// Duration of send operation
    pub duration: Duration,
}

/// A rejected recipient with reason.
#[derive(Debug, Clone)]
pub struct RejectedRecipient {
    /// Email address
    pub address: String,

    /// SMTP error code
    pub code: u16,

    /// Error message
    pub message: String,
}

/// Result of batch send operation.
#[derive(Debug, Clone)]
pub struct BatchSendResult {
    /// Results for each email (same order as input)
    pub results: Vec<Result<SendResult, SmtpError>>,

    /// Total emails attempted
    pub total: usize,

    /// Emails successfully sent
    pub succeeded: usize,

    /// Emails that failed
    pub failed: usize,

    /// Total duration
    pub duration: Duration,
}

/// Connection pool status.
#[derive(Debug, Clone)]
pub struct PoolStatus {
    /// Total connections in pool
    pub total: usize,

    /// Idle connections available
    pub idle: usize,

    /// Connections in use
    pub in_use: usize,

    /// Pending connection requests
    pub pending: usize,

    /// Maximum pool size
    pub max_size: usize,
}

/// Information about an established connection.
#[derive(Debug, Clone)]
pub struct ConnectionInfo {
    /// Server hostname
    pub host: String,

    /// Server port
    pub port: u16,

    /// Whether TLS is active
    pub tls_active: bool,

    /// TLS version if active
    pub tls_version: Option<TlsVersion>,

    /// Server capabilities
    pub capabilities: EsmtpCapabilities,

    /// Server banner message
    pub banner: String,

    /// Authenticated username if authenticated
    pub authenticated_as: Option<String>,
}

/// MIME transfer encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TransferEncoding {
    SevenBit,
    #[default]
    EightBit,
    QuotedPrintable,
    Base64,
}

impl TransferEncoding {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SevenBit => "7bit",
            Self::EightBit => "8bit",
            Self::QuotedPrintable => "quoted-printable",
            Self::Base64 => "base64",
        }
    }
}

/// Pooled connection wrapper for RAII release.
#[derive(Debug)]
pub struct PooledConnection {
    /// The underlying transport
    pub transport: Box<dyn SmtpTransport>,

    /// Connection ID for tracking
    pub id: String,

    /// Time acquired
    pub acquired_at: std::time::Instant,

    /// Pool reference for release
    pool: std::sync::Weak<dyn ConnectionPool>,
}

impl Drop for PooledConnection {
    fn drop(&mut self) {
        if let Some(pool) = self.pool.upgrade() {
            // Return to pool asynchronously
            // Note: actual implementation would use a runtime handle
        }
    }
}
```

### 5.2 TypeScript Interfaces

```typescript
/**
 * SMTP Integration Module - TypeScript Interfaces
 *
 * Type definitions for SMTP client functionality.
 * Mirrors Rust API surface for consistency.
 */

// ============================================================================
// Core Client Interface
// ============================================================================

/**
 * Primary interface for SMTP client operations.
 */
export interface SmtpClient {
  /**
   * Send a single email message.
   * @param email - The email message to send
   * @returns Promise resolving to send result
   */
  send(email: Email): Promise<SendResult>;

  /**
   * Send multiple email messages in batch.
   * @param emails - Array of email messages
   * @returns Promise resolving to batch result
   */
  sendBatch(emails: Email[]): Promise<BatchSendResult>;

  /**
   * Test connection and authentication.
   * @returns Promise resolving to connection info
   */
  testConnection(): Promise<ConnectionInfo>;

  /**
   * Get current connection pool status.
   */
  poolStatus(): PoolStatus;

  /**
   * Gracefully shutdown the client.
   */
  shutdown(): Promise<void>;
}

/**
 * Low-level SMTP transport interface.
 */
export interface SmtpTransport {
  connect(host: string, port: number, timeout: number): Promise<void>;
  upgradeTls(config: TlsConfig): Promise<void>;
  command(command: SmtpCommand, timeout: number): Promise<SmtpResponse>;
  sendData(data: Uint8Array, timeout: number): Promise<number>;
  close(): Promise<void>;
  isConnected(): boolean;
  capabilities(): EsmtpCapabilities | null;
}

/**
 * Email builder interface.
 */
export interface EmailBuilder {
  from(address: AddressLike): this;
  sender(address: AddressLike): this;
  to(address: AddressLike): this;
  toMany(addresses: AddressLike[]): this;
  cc(address: AddressLike): this;
  ccMany(addresses: AddressLike[]): this;
  bcc(address: AddressLike): this;
  bccMany(addresses: AddressLike[]): this;
  replyTo(address: AddressLike): this;
  subject(subject: string): this;
  textBody(body: string): this;
  htmlBody(body: string): this;
  attachFile(path: string): Promise<this>;
  attachBuffer(filename: string, contentType: string, data: Buffer): this;
  inlineImage(contentId: string, contentType: string, data: Buffer): this;
  header(name: string, value: string): this;
  messageId(id: string): this;
  inReplyTo(messageId: string): this;
  references(messageIds: string[]): this;
  priority(priority: Priority): this;
  build(): Email;
}

/**
 * MIME encoder interface.
 */
export interface MimeEncoder {
  encode(email: Email): Uint8Array;
  encodeHeader(value: string): string;
  encodeBody(body: Uint8Array, encoding: TransferEncoding): Uint8Array;
  generateBoundary(): string;
  generateMessageId(domain: string): string;
}

/**
 * Credential provider interface.
 */
export interface CredentialProvider {
  getCredentials(): Promise<Credentials>;
  refresh(): Promise<boolean>;
  isValid(): boolean;
  authMethod(): AuthMethod;
}

/**
 * Connection pool interface.
 */
export interface ConnectionPool {
  acquire(timeout: number): Promise<PooledConnection>;
  release(conn: PooledConnection): Promise<void>;
  status(): PoolStatus;
  closeAll(): Promise<void>;
  configure(config: PoolConfig): void;
}

// ============================================================================
// Email Types
// ============================================================================

/**
 * Complete email message.
 */
export interface Email {
  from: Address;
  sender?: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo?: Address;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  attachments: Attachment[];
  inlineImages: InlineImage[];
  headers: Record<string, string>;
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  priority?: Priority;
  date: Date;
}

/**
 * Email address with optional display name.
 */
export interface Address {
  name?: string;
  email: string;
}

/**
 * Union type for address input.
 */
export type AddressLike = string | Address;

/**
 * File attachment.
 */
export interface Attachment {
  filename: string;
  contentType: string;
  data: Buffer;
  contentId?: string;
}

/**
 * Inline image for HTML body.
 */
export interface InlineImage {
  contentId: string;
  contentType: string;
  data: Buffer;
}

/**
 * Message priority.
 */
export enum Priority {
  Highest = 1,
  High = 2,
  Normal = 3,
  Low = 4,
  Lowest = 5,
}

// ============================================================================
// Protocol Types
// ============================================================================

/**
 * SMTP command types.
 */
export type SmtpCommand =
  | { type: 'ehlo'; hostname: string }
  | { type: 'helo'; hostname: string }
  | { type: 'starttls' }
  | { type: 'auth'; method: AuthMethod; response?: string }
  | { type: 'authResponse'; response: string }
  | { type: 'mailFrom'; address: string; size?: number; body?: BodyType }
  | { type: 'rcptTo'; address: string }
  | { type: 'data' }
  | { type: 'reset' }
  | { type: 'noop' }
  | { type: 'quit' }
  | { type: 'verify'; address: string };

/**
 * SMTP server response.
 */
export interface SmtpResponse {
  code: number;
  enhancedCode?: string;
  message: string[];
  isMultiline: boolean;
}

/**
 * ESMTP capabilities.
 */
export interface EsmtpCapabilities {
  maxSize?: number;
  authMechanisms: AuthMethod[];
  starttls: boolean;
  eightBitMime: boolean;
  pipelining: boolean;
  utf8: boolean;
  chunking: boolean;
  enhancedStatusCodes: boolean;
  dsn: boolean;
  raw: string[];
}

/**
 * Body type for MAIL FROM.
 */
export enum BodyType {
  SevenBit = '7BIT',
  EightBitMime = '8BITMIME',
}

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * Authentication method.
 */
export enum AuthMethod {
  Plain = 'PLAIN',
  Login = 'LOGIN',
  CramMd5 = 'CRAM-MD5',
  XOAuth2 = 'XOAUTH2',
  OAuthBearer = 'OAUTHBEARER',
}

/**
 * Authentication credentials.
 */
export type Credentials =
  | { type: 'plain'; username: string; password: string }
  | { type: 'xoauth2'; username: string; accessToken: string }
  | { type: 'oauthBearer'; accessToken: string };

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * SMTP client configuration.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  tls: TlsMode;
  tlsConfig?: TlsConfig;
  credentials?: Credentials;
  authMethod?: AuthMethod;
  connectTimeout?: number;
  ioTimeout?: number;
  localHostname?: string;
  pool?: PoolConfig;
  retry?: RetryConfig;
  circuitBreaker?: CircuitBreakerConfig;
  rateLimit?: RateLimitConfig;
}

/**
 * TLS mode.
 */
export enum TlsMode {
  None = 'none',
  StartTls = 'starttls',
  Implicit = 'implicit',
  StartTlsRequired = 'starttls_required',
}

/**
 * TLS configuration.
 */
export interface TlsConfig {
  verifyCertificates?: boolean;
  acceptInvalidCerts?: boolean;
  caCertPath?: string;
  clientCertPath?: string;
  clientKeyPath?: string;
  minVersion?: TlsVersion;
  serverName?: string;
}

/**
 * TLS version.
 */
export enum TlsVersion {
  Tls10 = 'tls1.0',
  Tls11 = 'tls1.1',
  Tls12 = 'tls1.2',
  Tls13 = 'tls1.3',
}

/**
 * Connection pool configuration.
 */
export interface PoolConfig {
  maxConnections?: number;
  minIdle?: number;
  acquireTimeout?: number;
  idleTimeout?: number;
  maxLifetime?: number;
  healthCheck?: boolean;
  healthCheckInterval?: number;
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  multiplier?: number;
  jitter?: boolean;
  retryOn?: RetryConditions;
}

/**
 * Retry conditions.
 */
export interface RetryConditions {
  connectionErrors?: boolean;
  timeouts?: boolean;
  temporaryFailures?: boolean;
  errorCodes?: number[];
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  failureThreshold?: number;
  failureWindow?: number;
  recoveryTimeout?: number;
  successThreshold?: number;
  enabled?: boolean;
}

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  maxEmails: number;
  window: number;
  maxConnections?: number;
  onLimit?: RateLimitBehavior;
}

/**
 * Rate limit behavior.
 */
export enum RateLimitBehavior {
  Reject = 'reject',
  Wait = 'wait',
  WaitWithTimeout = 'wait_with_timeout',
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of sending a single email.
 */
export interface SendResult {
  messageId: string;
  serverId?: string;
  accepted: string[];
  rejected: RejectedRecipient[];
  response: string;
  duration: number;
}

/**
 * Rejected recipient info.
 */
export interface RejectedRecipient {
  address: string;
  code: number;
  message: string;
}

/**
 * Result of batch send.
 */
export interface BatchSendResult {
  results: Array<SendResult | SmtpError>;
  total: number;
  succeeded: number;
  failed: number;
  duration: number;
}

/**
 * Pool status.
 */
export interface PoolStatus {
  total: number;
  idle: number;
  inUse: number;
  pending: number;
  maxSize: number;
}

/**
 * Connection info.
 */
export interface ConnectionInfo {
  host: string;
  port: number;
  tlsActive: boolean;
  tlsVersion?: TlsVersion;
  capabilities: EsmtpCapabilities;
  banner: string;
  authenticatedAs?: string;
}

/**
 * Transfer encoding.
 */
export enum TransferEncoding {
  SevenBit = '7bit',
  EightBit = '8bit',
  QuotedPrintable = 'quoted-printable',
  Base64 = 'base64',
}

/**
 * Pooled connection.
 */
export interface PooledConnection {
  transport: SmtpTransport;
  id: string;
  acquiredAt: Date;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * SMTP error type.
 */
export interface SmtpError {
  kind: SmtpErrorKind;
  message: string;
  code?: number;
  enhancedCode?: string;
  cause?: Error;
  retryable: boolean;
}

/**
 * Error kind enumeration.
 */
export enum SmtpErrorKind {
  Connection = 'connection',
  Authentication = 'authentication',
  Protocol = 'protocol',
  Message = 'message',
  Tls = 'tls',
  Timeout = 'timeout',
  RateLimit = 'rate_limit',
  CircuitOpen = 'circuit_open',
  Pool = 'pool',
  Cancelled = 'cancelled',
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
SmtpError
├── ConnectionError
│   ├── DnsResolutionFailed
│   ├── ConnectionRefused
│   ├── ConnectionTimeout
│   ├── ConnectionReset
│   └── NetworkUnreachable
├── TlsError
│   ├── HandshakeFailed
│   ├── CertificateInvalid
│   ├── CertificateExpired
│   ├── CertificateUntrusted
│   ├── ProtocolVersionMismatch
│   └── StartTlsNotSupported
├── AuthenticationError
│   ├── CredentialsInvalid
│   ├── CredentialsExpired
│   ├── MethodNotSupported
│   ├── AuthenticationRequired
│   └── TooManyAttempts
├── ProtocolError
│   ├── InvalidResponse
│   ├── UnexpectedResponse
│   ├── CommandSequenceError
│   ├── ServerShutdown
│   └── CapabilityMismatch
├── MessageError
│   ├── InvalidFromAddress
│   ├── InvalidRecipientAddress
│   ├── MessageTooLarge
│   ├── InvalidHeader
│   ├── EncodingFailed
│   └── AttachmentError
├── TimeoutError
│   ├── ConnectTimeout
│   ├── ReadTimeout
│   ├── WriteTimeout
│   └── CommandTimeout
├── RateLimitError
│   ├── LocalRateLimitExceeded
│   └── ServerRateLimitExceeded
├── CircuitBreakerError
│   └── CircuitOpen
└── PoolError
    ├── PoolExhausted
    ├── AcquireTimeout
    └── ConnectionUnhealthy
```

### 6.2 Error Definitions (Rust)

```rust
//! SMTP Integration Module - Error Types
//!
//! Comprehensive error taxonomy following integration-errors patterns.

use integrations_errors::{IntegrationError, ErrorKind, ErrorSeverity};
use std::fmt;

/// Primary error type for SMTP operations.
#[derive(Debug)]
pub struct SmtpError {
    /// Error kind for categorization
    pub kind: SmtpErrorKind,

    /// Human-readable message
    pub message: String,

    /// SMTP response code (if applicable)
    pub code: Option<u16>,

    /// Enhanced status code (if applicable)
    pub enhanced_code: Option<String>,

    /// Underlying cause
    pub cause: Option<Box<dyn std::error::Error + Send + Sync>>,

    /// Whether this error is retryable
    pub retryable: bool,

    /// Error severity
    pub severity: ErrorSeverity,
}

/// Enumeration of SMTP error kinds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SmtpErrorKind {
    // Connection errors
    Connection,
    DnsResolutionFailed,
    ConnectionRefused,
    ConnectionTimeout,
    ConnectionReset,
    NetworkUnreachable,

    // TLS errors
    Tls,
    TlsHandshakeFailed,
    CertificateInvalid,
    CertificateExpired,
    CertificateUntrusted,
    TlsVersionMismatch,
    StartTlsNotSupported,

    // Authentication errors
    Authentication,
    CredentialsInvalid,
    CredentialsExpired,
    AuthMethodNotSupported,
    AuthenticationRequired,
    TooManyAuthAttempts,

    // Protocol errors
    Protocol,
    InvalidResponse,
    UnexpectedResponse,
    CommandSequenceError,
    ServerShutdown,
    CapabilityMismatch,

    // Message errors
    Message,
    InvalidFromAddress,
    InvalidRecipientAddress,
    MessageTooLarge,
    InvalidHeader,
    EncodingFailed,
    AttachmentError,

    // Timeout errors
    Timeout,
    ConnectTimeout,
    ReadTimeout,
    WriteTimeout,
    CommandTimeout,

    // Resource errors
    RateLimit,
    LocalRateLimitExceeded,
    ServerRateLimitExceeded,
    CircuitOpen,
    PoolExhausted,
    AcquireTimeout,
    ConnectionUnhealthy,

    // Cancellation
    Cancelled,
}

impl SmtpError {
    /// Create a new SMTP error.
    pub fn new(kind: SmtpErrorKind, message: impl Into<String>) -> Self {
        let retryable = kind.is_retryable();
        let severity = kind.severity();
        Self {
            kind,
            message: message.into(),
            code: None,
            enhanced_code: None,
            cause: None,
            retryable,
            severity,
        }
    }

    /// Create error with SMTP response code.
    pub fn with_code(mut self, code: u16) -> Self {
        self.code = Some(code);
        // Update retryable based on code
        self.retryable = self.retryable || (400..500).contains(&code);
        self
    }

    /// Create error with enhanced status code.
    pub fn with_enhanced_code(mut self, code: impl Into<String>) -> Self {
        self.enhanced_code = Some(code.into());
        self
    }

    /// Create error with cause.
    pub fn with_cause<E: std::error::Error + Send + Sync + 'static>(mut self, cause: E) -> Self {
        self.cause = Some(Box::new(cause));
        self
    }

    /// Check if error is retryable.
    pub fn is_retryable(&self) -> bool {
        self.retryable
    }

    /// Check if error is a temporary failure.
    pub fn is_temporary(&self) -> bool {
        matches!(self.code, Some(code) if (400..500).contains(&code))
    }

    /// Check if error is a permanent failure.
    pub fn is_permanent(&self) -> bool {
        matches!(self.code, Some(code) if (500..600).contains(&code))
    }

    // Convenience constructors

    pub fn connection_refused(host: &str, port: u16) -> Self {
        Self::new(
            SmtpErrorKind::ConnectionRefused,
            format!("Connection refused to {}:{}", host, port),
        )
    }

    pub fn connection_timeout(host: &str, port: u16, timeout: std::time::Duration) -> Self {
        Self::new(
            SmtpErrorKind::ConnectionTimeout,
            format!("Connection timeout to {}:{} after {:?}", host, port, timeout),
        )
    }

    pub fn tls_handshake_failed(reason: &str) -> Self {
        Self::new(
            SmtpErrorKind::TlsHandshakeFailed,
            format!("TLS handshake failed: {}", reason),
        )
    }

    pub fn credentials_invalid() -> Self {
        Self::new(
            SmtpErrorKind::CredentialsInvalid,
            "Authentication failed: invalid credentials",
        )
    }

    pub fn auth_method_not_supported(method: AuthMethod) -> Self {
        Self::new(
            SmtpErrorKind::AuthMethodNotSupported,
            format!("Authentication method {} not supported by server", method.as_str()),
        )
    }

    pub fn protocol_error(code: u16, message: &str) -> Self {
        Self::new(
            SmtpErrorKind::Protocol,
            format!("SMTP error {}: {}", code, message),
        ).with_code(code)
    }

    pub fn invalid_address(address: &str, reason: &str) -> Self {
        Self::new(
            SmtpErrorKind::InvalidRecipientAddress,
            format!("Invalid address '{}': {}", address, reason),
        )
    }

    pub fn message_too_large(size: u64, max_size: u64) -> Self {
        Self::new(
            SmtpErrorKind::MessageTooLarge,
            format!("Message size {} exceeds server limit {}", size, max_size),
        )
    }

    pub fn circuit_open(until: std::time::Instant) -> Self {
        Self::new(
            SmtpErrorKind::CircuitOpen,
            format!("Circuit breaker open, retry after {:?}", until.duration_since(std::time::Instant::now())),
        )
    }

    pub fn rate_limited(retry_after: Option<std::time::Duration>) -> Self {
        let msg = match retry_after {
            Some(d) => format!("Rate limit exceeded, retry after {:?}", d),
            None => "Rate limit exceeded".to_string(),
        };
        Self::new(SmtpErrorKind::RateLimit, msg)
    }

    pub fn pool_exhausted() -> Self {
        Self::new(
            SmtpErrorKind::PoolExhausted,
            "Connection pool exhausted",
        )
    }
}

impl SmtpErrorKind {
    /// Check if this error kind is typically retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            SmtpErrorKind::ConnectionTimeout
                | SmtpErrorKind::ConnectionReset
                | SmtpErrorKind::ReadTimeout
                | SmtpErrorKind::WriteTimeout
                | SmtpErrorKind::CommandTimeout
                | SmtpErrorKind::ServerShutdown
                | SmtpErrorKind::PoolExhausted
                | SmtpErrorKind::AcquireTimeout
                | SmtpErrorKind::ConnectionUnhealthy
                | SmtpErrorKind::LocalRateLimitExceeded
        )
    }

    /// Get severity for this error kind.
    pub fn severity(&self) -> ErrorSeverity {
        match self {
            // Critical - immediate attention
            SmtpErrorKind::CredentialsInvalid
            | SmtpErrorKind::CertificateInvalid
            | SmtpErrorKind::CertificateExpired => ErrorSeverity::Critical,

            // Error - operation failed
            SmtpErrorKind::ConnectionRefused
            | SmtpErrorKind::Authentication
            | SmtpErrorKind::Protocol
            | SmtpErrorKind::Message => ErrorSeverity::Error,

            // Warning - temporary issues
            SmtpErrorKind::ConnectionTimeout
            | SmtpErrorKind::RateLimit
            | SmtpErrorKind::CircuitOpen => ErrorSeverity::Warning,

            // Info - expected scenarios
            SmtpErrorKind::Cancelled => ErrorSeverity::Info,

            _ => ErrorSeverity::Error,
        }
    }
}

impl fmt::Display for SmtpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{:?}] {}", self.kind, self.message)?;
        if let Some(code) = self.code {
            write!(f, " (SMTP {})", code)?;
        }
        if let Some(ref enhanced) = self.enhanced_code {
            write!(f, " [{}]", enhanced)?;
        }
        Ok(())
    }
}

impl std::error::Error for SmtpError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.cause.as_ref().map(|e| e.as_ref() as &(dyn std::error::Error + 'static))
    }
}

// Convert to integration error for unified error handling
impl From<SmtpError> for IntegrationError {
    fn from(err: SmtpError) -> Self {
        IntegrationError::new(
            ErrorKind::External,
            err.message.clone(),
        )
        .with_severity(err.severity)
        .with_retryable(err.retryable)
    }
}
```

### 6.3 Error Mapping from SMTP Codes

| SMTP Code | Error Kind | Retryable | Handling |
|-----------|------------|-----------|----------|
| 421 | `ServerShutdown` | Yes | Retry with new connection |
| 450 | `Protocol` (temp) | Yes | Retry with backoff |
| 451 | `Protocol` (temp) | Yes | Retry with backoff |
| 452 | `Protocol` (temp) | Yes | Retry with backoff |
| 500 | `Protocol` (syntax) | No | Fix command |
| 501 | `InvalidAddress` | No | Fix address format |
| 502 | `CapabilityMismatch` | No | Use different command |
| 503 | `CommandSequenceError` | No | Reset and retry |
| 504 | `AuthMethodNotSupported` | No | Use different auth |
| 530 | `AuthenticationRequired` | No | Authenticate first |
| 534 | `AuthMethodNotSupported` | No | Use different auth |
| 535 | `CredentialsInvalid` | No | Check credentials |
| 550 | `InvalidRecipientAddress` | No | Check recipient |
| 551 | `InvalidRecipientAddress` | No | Use correct address |
| 552 | `MessageTooLarge` | No | Reduce message size |
| 553 | `InvalidFromAddress` | No | Check sender address |
| 554 | `Protocol` (perm) | No | Transaction failed |

---

## 7. Resilience Hooks

### 7.1 Integration with Shared Primitives

The SMTP module integrates with the following shared resilience primitives:

#### 7.1.1 Retry Integration

```rust
use integrations_retry::{RetryExecutor, RetryPolicy, RetryResult};

impl SmtpClientImpl {
    /// Send with retry.
    async fn send_with_retry(&self, email: &Email) -> Result<SendResult, SmtpError> {
        let executor = RetryExecutor::new(self.config.retry.clone());

        executor.execute(|| async {
            self.send_inner(email).await
        })
        .await
        .map_err(|e| SmtpError::from(e))
    }
}

/// SMTP-specific retry policy.
pub fn smtp_retry_policy() -> RetryPolicy {
    RetryPolicy::builder()
        .max_attempts(3)
        .initial_delay(Duration::from_millis(500))
        .max_delay(Duration::from_secs(30))
        .exponential_backoff(2.0)
        .jitter(true)
        .retry_if(|err: &SmtpError| err.is_retryable())
        .build()
}
```

#### 7.1.2 Circuit Breaker Integration

```rust
use integrations_circuit_breaker::{CircuitBreaker, CircuitState};

impl SmtpClientImpl {
    /// Send with circuit breaker protection.
    async fn send_protected(&self, email: &Email) -> Result<SendResult, SmtpError> {
        // Check circuit state
        match self.circuit_breaker.state() {
            CircuitState::Open => {
                return Err(SmtpError::circuit_open(
                    self.circuit_breaker.recovery_time()
                ));
            }
            CircuitState::HalfOpen | CircuitState::Closed => {}
        }

        // Execute with circuit breaker
        let result = self.send_inner(email).await;

        // Record result
        match &result {
            Ok(_) => self.circuit_breaker.record_success(),
            Err(e) if e.is_permanent() => {
                // Don't count permanent failures (e.g., invalid address)
            }
            Err(_) => self.circuit_breaker.record_failure(),
        }

        result
    }
}

/// SMTP circuit breaker configuration.
pub fn smtp_circuit_breaker_config() -> CircuitBreakerConfig {
    CircuitBreakerConfig {
        failure_threshold: 5,
        failure_window: Duration::from_secs(60),
        recovery_timeout: Duration::from_secs(30),
        success_threshold: 3,
        enabled: true,
    }
}
```

#### 7.1.3 Rate Limit Integration

```rust
use integrations_rate_limit::{RateLimiter, TokenBucket};

impl SmtpClientImpl {
    /// Send with rate limiting.
    async fn send_rate_limited(&self, email: &Email) -> Result<SendResult, SmtpError> {
        // Acquire rate limit permit
        if let Some(ref limiter) = self.rate_limiter {
            match self.config.rate_limit.on_limit {
                RateLimitBehavior::Reject => {
                    if !limiter.try_acquire() {
                        return Err(SmtpError::rate_limited(limiter.retry_after()));
                    }
                }
                RateLimitBehavior::Wait => {
                    limiter.acquire().await;
                }
                RateLimitBehavior::WaitWithTimeout => {
                    if !limiter.acquire_timeout(self.config.rate_limit.timeout).await {
                        return Err(SmtpError::rate_limited(None));
                    }
                }
            }
        }

        self.send_inner(email).await
    }
}
```

### 7.2 Resilience Flow Diagram

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  Send Email │────▶│ Rate Limiter │────▶│ Circuit Breaker│────▶│ Retry Loop   │
└─────────────┘     └──────────────┘     └────────────────┘     └──────────────┘
                           │                     │                      │
                           │                     │                      │
                    ┌──────▼──────┐       ┌──────▼──────┐        ┌──────▼──────┐
                    │  Exceeded?  │       │   Open?     │        │ Send Inner  │
                    └──────┬──────┘       └──────┬──────┘        └──────┬──────┘
                           │                     │                      │
                    ┌──────▼──────┐       ┌──────▼──────┐        ┌──────▼──────┐
                    │Wait/Reject  │       │Return Error │        │ Success?    │
                    └─────────────┘       └─────────────┘        └──────┬──────┘
                                                                        │
                                                            ┌───────────┴───────────┐
                                                            │                       │
                                                     ┌──────▼──────┐         ┌──────▼──────┐
                                                     │   Return    │         │  Retryable? │
                                                     │   Result    │         └──────┬──────┘
                                                     └─────────────┘                │
                                                                         ┌──────────┴──────────┐
                                                                         │                     │
                                                                  ┌──────▼──────┐       ┌──────▼──────┐
                                                                  │ Retry with  │       │Return Error │
                                                                  │  Backoff    │       └─────────────┘
                                                                  └─────────────┘
```

---

## 8. Security Requirements

### 8.1 Transport Security

#### 8.1.1 TLS Requirements

| Requirement | Level | Description |
|-------------|-------|-------------|
| **TLS 1.2+ Required** | MUST | No TLS 1.0 or 1.1 in production |
| **TLS 1.3 Preferred** | SHOULD | Use TLS 1.3 when available |
| **Certificate Validation** | MUST | Verify server certificates |
| **STARTTLS Required** | SHOULD | Require STARTTLS for port 587 |
| **Implicit TLS Option** | MUST | Support port 465 (implicit TLS) |

#### 8.1.2 Certificate Handling

```rust
/// Certificate validation policy.
pub struct CertificatePolicy {
    /// Verify certificate chain
    pub verify_chain: bool,

    /// Verify hostname matches certificate
    pub verify_hostname: bool,

    /// Allow expired certificates (NEVER in production)
    pub allow_expired: bool,

    /// Allow self-signed (development only)
    pub allow_self_signed: bool,

    /// Custom CA certificates
    pub ca_certs: Vec<PathBuf>,

    /// Certificate pinning (optional)
    pub pinned_certs: Vec<String>,
}
```

### 8.2 Credential Security

#### 8.2.1 Credential Handling Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Never log credentials** | Use `secrecy::SecretString` |
| **Encrypted at rest** | Application responsibility |
| **Short-lived tokens** | Prefer OAuth2 over passwords |
| **Secure memory** | Zero on drop |
| **No hardcoding** | Configuration/environment only |

#### 8.2.2 SecretString Usage

```rust
use secrecy::{SecretString, ExposeSecret};

/// Credential that wraps password securely.
pub struct SecureCredentials {
    username: String,
    password: SecretString,
}

impl SecureCredentials {
    /// Get password for authentication (careful!).
    pub(crate) fn expose_password(&self) -> &str {
        self.password.expose_secret()
    }
}

impl std::fmt::Debug for SecureCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SecureCredentials")
            .field("username", &self.username)
            .field("password", &"[REDACTED]")
            .finish()
    }
}
```

### 8.3 Authentication Security

#### 8.3.1 Auth Method Selection

```
Priority Order (most to least secure):
1. OAUTHBEARER (RFC 7628) - Modern OAuth2
2. XOAUTH2 - Google/Microsoft OAuth2
3. CRAM-MD5 - Challenge-response (no plaintext)
4. PLAIN - Only with TLS
5. LOGIN - Legacy, only with TLS
```

#### 8.3.2 OAuth2 Token Management

```rust
/// OAuth2 token with refresh capability.
pub struct OAuth2Token {
    /// Access token (short-lived)
    access_token: SecretString,

    /// Refresh token (long-lived)
    refresh_token: Option<SecretString>,

    /// Token expiry
    expires_at: DateTime<Utc>,

    /// Token endpoint for refresh
    token_endpoint: Option<String>,
}

impl OAuth2Token {
    /// Check if token needs refresh.
    pub fn needs_refresh(&self) -> bool {
        // Refresh 5 minutes before expiry
        self.expires_at - Duration::minutes(5) <= Utc::now()
    }
}
```

### 8.4 Input Validation

#### 8.4.1 Email Address Validation

```rust
/// Validate email address per RFC 5321/5322.
pub fn validate_email_address(address: &str) -> Result<(), SmtpError> {
    // Basic validation rules:
    // 1. Contains exactly one '@'
    // 2. Local part: 1-64 characters
    // 3. Domain part: valid domain name
    // 4. No null bytes or control characters
    // 5. Total length <= 254 characters

    // Implementation uses established regex or parser
}
```

#### 8.4.2 Header Injection Prevention

```rust
/// Sanitize header value to prevent injection.
pub fn sanitize_header_value(value: &str) -> String {
    // Remove CR, LF, and null bytes
    // Encode non-ASCII with RFC 2047
    value
        .chars()
        .filter(|c| *c != '\r' && *c != '\n' && *c != '\0')
        .collect()
}
```

### 8.5 Security Checklist

| Category | Requirement | Verification |
|----------|-------------|--------------|
| Transport | TLS 1.2+ enforced | Config validation |
| Transport | Certificate verification | Connection test |
| Credentials | SecretString for passwords | Code review |
| Credentials | No credential logging | Log audit |
| Credentials | OAuth2 token refresh | Integration test |
| Input | Address validation | Unit tests |
| Input | Header injection prevention | Fuzzing |
| Memory | Secrets zeroed on drop | Valgrind check |

---

## 9. Observability Requirements

### 9.1 Tracing Integration

#### 9.1.1 Span Structure

```
smtp.send                           (root span)
├── smtp.connection.acquire         (pool acquisition)
├── smtp.connect                    (TCP connection)
│   └── dns.resolve                 (DNS lookup)
├── smtp.tls.upgrade                (STARTTLS/TLS)
│   └── tls.handshake               (TLS negotiation)
├── smtp.auth                       (authentication)
├── smtp.transaction                (MAIL/RCPT/DATA)
│   ├── smtp.mail_from              (MAIL FROM)
│   ├── smtp.rcpt_to                (RCPT TO, per recipient)
│   └── smtp.data                   (DATA command + body)
└── smtp.connection.release         (return to pool)
```

#### 9.1.2 Span Attributes

```rust
use integrations_tracing::{Span, SpanKind};

/// Create span for send operation.
fn create_send_span(email: &Email) -> Span {
    Span::new("smtp.send")
        .kind(SpanKind::Client)
        .attribute("smtp.host", &config.host)
        .attribute("smtp.port", config.port)
        .attribute("smtp.from", &email.from.email)
        .attribute("smtp.recipients.count", email.all_recipients().len())
        .attribute("smtp.has_attachments", !email.attachments.is_empty())
        .attribute("smtp.message_size", estimated_size(email))
}

/// Create span for connection.
fn create_connect_span(host: &str, port: u16) -> Span {
    Span::new("smtp.connect")
        .kind(SpanKind::Client)
        .attribute("net.peer.name", host)
        .attribute("net.peer.port", port)
        .attribute("net.transport", "tcp")
}
```

### 9.2 Metrics

#### 9.2.1 Required Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `smtp_emails_sent_total` | Counter | `host`, `status` | Emails sent |
| `smtp_emails_failed_total` | Counter | `host`, `error_kind` | Send failures |
| `smtp_send_duration_seconds` | Histogram | `host` | Send latency |
| `smtp_connection_duration_seconds` | Histogram | `host` | Connection lifetime |
| `smtp_connection_pool_size` | Gauge | `host`, `state` | Pool connections |
| `smtp_connection_acquire_duration_seconds` | Histogram | `host` | Pool wait time |
| `smtp_auth_attempts_total` | Counter | `host`, `method`, `status` | Auth attempts |
| `smtp_tls_upgrades_total` | Counter | `host`, `status` | TLS upgrades |
| `smtp_message_size_bytes` | Histogram | `host` | Message sizes |
| `smtp_recipients_per_message` | Histogram | `host` | Recipients count |
| `smtp_circuit_breaker_state` | Gauge | `host` | Circuit state |
| `smtp_rate_limit_exceeded_total` | Counter | `host` | Rate limit hits |
| `smtp_retries_total` | Counter | `host`, `attempt` | Retry count |

#### 9.2.2 Metrics Implementation

```rust
use integrations_metrics::{Counter, Histogram, Gauge};

pub struct SmtpMetrics {
    emails_sent: Counter,
    emails_failed: Counter,
    send_duration: Histogram,
    connection_pool_size: Gauge,
    // ... etc
}

impl SmtpMetrics {
    pub fn record_send_success(&self, host: &str, duration: Duration) {
        self.emails_sent.with_label("host", host).with_label("status", "success").inc();
        self.send_duration.with_label("host", host).observe(duration.as_secs_f64());
    }

    pub fn record_send_failure(&self, host: &str, error: &SmtpError) {
        self.emails_sent.with_label("host", host).with_label("status", "failure").inc();
        self.emails_failed.with_label("host", host).with_label("error_kind", error.kind.as_str()).inc();
    }
}
```

### 9.3 Logging

#### 9.3.1 Log Levels

| Level | Events |
|-------|--------|
| ERROR | Send failures, auth failures, TLS errors |
| WARN | Retries, circuit breaker state changes, rate limits |
| INFO | Successful sends (summary), connection events |
| DEBUG | Protocol commands/responses, detailed flow |
| TRACE | Raw data (with secrets redacted) |

#### 9.3.2 Structured Log Fields

```rust
use integrations_logging::{info, error, LogField};

// Success log
info!(
    message = "Email sent successfully",
    smtp.host = config.host,
    smtp.port = config.port,
    smtp.message_id = result.message_id,
    smtp.recipients = email.all_recipients().len(),
    smtp.duration_ms = duration.as_millis(),
);

// Error log
error!(
    message = "Email send failed",
    smtp.host = config.host,
    smtp.error_kind = error.kind.as_str(),
    smtp.error_code = error.code,
    smtp.retryable = error.is_retryable(),
    error = %error,
);
```

#### 9.3.3 Sensitive Data Handling

| Field | Logging Policy |
|-------|----------------|
| `password` | NEVER log |
| `access_token` | NEVER log |
| `email body` | Log only if DEBUG + opt-in |
| `email addresses` | Log local part only in production |
| `headers` | Log selected headers only |
| `attachments` | Log filenames only |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | P50 Target | P99 Target | Notes |
|-----------|------------|------------|-------|
| Connection (cold) | <500ms | <2s | Includes DNS + TLS |
| Connection (pooled) | <10ms | <50ms | From pool |
| Authentication | <100ms | <500ms | PLAIN/LOGIN |
| Send (small email) | <200ms | <1s | <10KB, local network |
| Send (with attachment) | <500ms | <2s | <1MB |
| Send (large attachment) | <2s | <10s | 1-25MB |

### 10.2 Throughput Targets

| Scenario | Target | Configuration |
|----------|--------|---------------|
| Sequential sends | 10 emails/sec | Single connection |
| Pooled sends | 50 emails/sec | 5 connections |
| Batch sends | 100 emails/sec | 5 connections + pipelining |

### 10.3 Resource Limits

| Resource | Default | Maximum | Notes |
|----------|---------|---------|-------|
| Pool connections | 5 | 20 | Per host |
| Message size | 10MB | 25MB | Server dependent |
| Attachments per message | 10 | 50 | Application configurable |
| Recipients per message | 50 | 100 | Server dependent |
| Connection lifetime | 1 hour | 4 hours | Prevent stale connections |
| Idle timeout | 5 minutes | 30 minutes | Pool efficiency |

### 10.4 Connection Pooling Requirements

#### 10.4.1 Pool Behavior

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Connection Pool                                   │
│                                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │  Conn 1 │  │  Conn 2 │  │  Conn 3 │  │  Conn 4 │  │  Conn 5 │      │
│  │  [IDLE] │  │  [BUSY] │  │  [IDLE] │  │  [BUSY] │  │ [HEALTH]│      │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │
│                                                                         │
│  Pool Stats:                                                            │
│  - Total: 5                                                             │
│  - Idle: 2                                                              │
│  - In Use: 2                                                            │
│  - Health Check: 1                                                      │
│  - Pending Requests: 0                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 10.4.2 Pool Configuration

```rust
pub struct OptimalPoolConfig {
    // Size based on expected concurrency
    max_connections: 5,
    min_idle: 1,

    // Timeouts
    acquire_timeout: Duration::from_secs(30),
    idle_timeout: Duration::from_secs(300),
    max_lifetime: Duration::from_secs(3600),

    // Health management
    health_check: true,
    health_check_interval: Duration::from_secs(60),
}
```

### 10.5 Benchmark Requirements

| Benchmark | Baseline | Target |
|-----------|----------|--------|
| Cold connection | <1s | <500ms |
| Warm connection | <100ms | <50ms |
| Auth (PLAIN) | <200ms | <100ms |
| Send 1KB email | <500ms | <200ms |
| Send 1MB email | <2s | <1s |
| 100 emails sequential | <30s | <15s |
| 100 emails parallel (5 conn) | <10s | <5s |

---

## 11. Future-Proofing

### 11.1 Extension Points

#### 11.1.1 Pluggable Authentication

```rust
/// Trait for custom authentication mechanisms.
pub trait AuthMechanism: Send + Sync {
    /// Get mechanism name for AUTH command.
    fn name(&self) -> &str;

    /// Generate initial response.
    fn initial_response(&self, credentials: &Credentials) -> Option<String>;

    /// Handle challenge from server.
    fn respond_to_challenge(
        &self,
        challenge: &str,
        credentials: &Credentials,
    ) -> Result<String, SmtpError>;

    /// Check if authentication is complete.
    fn is_complete(&self) -> bool;
}
```

#### 11.1.2 Pluggable Transport

```rust
/// Trait for custom transport implementations.
pub trait TransportProvider: Send + Sync {
    /// Create a new transport connection.
    fn create(&self, config: &SmtpConfig) -> Box<dyn SmtpTransport>;

    /// Transport name for logging.
    fn name(&self) -> &str;
}

// Allows for:
// - Custom TLS implementations
// - Testing with mock transports
// - Proxy support
// - Unix socket connections
```

#### 11.1.3 Middleware/Interceptors

```rust
/// Interceptor for request/response processing.
#[async_trait]
pub trait SmtpInterceptor: Send + Sync {
    /// Called before sending email.
    async fn before_send(&self, email: &mut Email) -> Result<(), SmtpError>;

    /// Called after receiving response.
    async fn after_send(&self, email: &Email, result: &SendResult) -> Result<(), SmtpError>;

    /// Called on error.
    async fn on_error(&self, email: &Email, error: &SmtpError);
}
```

### 11.2 ESMTP Extension Support

| Extension | RFC | Status | Future Support |
|-----------|-----|--------|----------------|
| BINARYMIME | 3030 | Future | v1.1 |
| DSN | 3461 | Future | v1.1 |
| DELIVERBY | 2852 | Future | v1.2 |
| MTRK | 3885 | Future | v1.2 |
| REQUIRETLS | 8689 | Future | v1.1 |
| SMTPUTF8 | 6531 | Partial | v1.0 (full in v1.1) |

### 11.3 API Evolution Strategy

1. **Additive Changes Only** - New methods, not breaking changes
2. **Feature Flags** - New features behind feature flags
3. **Deprecation Warnings** - 2 versions before removal
4. **Versioned Traits** - `SmtpClientV2` for breaking changes

---

## 12. Acceptance Criteria

### 12.1 Functional Requirements

#### 12.1.1 Connection Management

| ID | Requirement | Verification |
|----|-------------|--------------|
| F-CONN-01 | Connect to SMTP server on port 25, 587, or 465 | Integration test |
| F-CONN-02 | Support EHLO with capability parsing | Unit test |
| F-CONN-03 | Fallback to HELO if EHLO fails | Unit test |
| F-CONN-04 | Connection pooling with configurable size | Integration test |
| F-CONN-05 | Connection health checks | Integration test |
| F-CONN-06 | Graceful connection shutdown (QUIT) | Unit test |

#### 12.1.2 Transport Security

| ID | Requirement | Verification |
|----|-------------|--------------|
| F-TLS-01 | STARTTLS upgrade on port 587 | Integration test |
| F-TLS-02 | Implicit TLS on port 465 | Integration test |
| F-TLS-03 | Certificate validation | Unit test with mocks |
| F-TLS-04 | TLS 1.2 minimum version | Configuration test |
| F-TLS-05 | Custom CA certificate support | Integration test |

#### 12.1.3 Authentication

| ID | Requirement | Verification |
|----|-------------|--------------|
| F-AUTH-01 | AUTH PLAIN | Integration test |
| F-AUTH-02 | AUTH LOGIN | Integration test |
| F-AUTH-03 | AUTH CRAM-MD5 | Unit test |
| F-AUTH-04 | AUTH XOAUTH2 | Integration test (Gmail) |
| F-AUTH-05 | AUTH OAUTHBEARER | Unit test |
| F-AUTH-06 | Auto-select best auth method | Unit test |

#### 12.1.4 Email Sending

| ID | Requirement | Verification |
|----|-------------|--------------|
| F-SEND-01 | Send plain text email | Integration test |
| F-SEND-02 | Send HTML email | Integration test |
| F-SEND-03 | Send multipart alternative (text + HTML) | Integration test |
| F-SEND-04 | Send with attachments | Integration test |
| F-SEND-05 | Send with inline images | Integration test |
| F-SEND-06 | Send to multiple recipients | Integration test |
| F-SEND-07 | Handle partial recipient rejection | Unit test |
| F-SEND-08 | Batch send with error collection | Integration test |

#### 12.1.5 MIME Construction

| ID | Requirement | Verification |
|----|-------------|--------------|
| F-MIME-01 | RFC 5322 compliant headers | Unit test |
| F-MIME-02 | Base64 encoding for attachments | Unit test |
| F-MIME-03 | Quoted-printable for text | Unit test |
| F-MIME-04 | Proper boundary generation | Unit test |
| F-MIME-05 | Header encoding (RFC 2047) | Unit test |
| F-MIME-06 | Message-ID generation | Unit test |

### 12.2 Non-Functional Requirements

#### 12.2.1 Performance

| ID | Requirement | Verification |
|----|-------------|--------------|
| NF-PERF-01 | Cold connection <2s P99 | Benchmark |
| NF-PERF-02 | Pooled connection <50ms P99 | Benchmark |
| NF-PERF-03 | 50 emails/sec throughput (5 connections) | Load test |
| NF-PERF-04 | Handle 25MB attachments | Integration test |

#### 12.2.2 Reliability

| ID | Requirement | Verification |
|----|-------------|--------------|
| NF-REL-01 | Retry transient failures | Unit test |
| NF-REL-02 | Circuit breaker prevents cascade failures | Unit test |
| NF-REL-03 | Graceful handling of connection drops | Integration test |
| NF-REL-04 | No message loss on network errors | Integration test |

#### 12.2.3 Security

| ID | Requirement | Verification |
|----|-------------|--------------|
| NF-SEC-01 | No credential logging | Code review + log audit |
| NF-SEC-02 | TLS 1.2+ enforced | Configuration test |
| NF-SEC-03 | Certificate verification by default | Configuration test |
| NF-SEC-04 | Header injection prevention | Fuzzing |

#### 12.2.4 Observability

| ID | Requirement | Verification |
|----|-------------|--------------|
| NF-OBS-01 | Distributed tracing spans | Integration test |
| NF-OBS-02 | All metrics exported | Unit test |
| NF-OBS-03 | Structured logging | Log format test |
| NF-OBS-04 | Error classification | Unit test |

### 12.3 Provider Compatibility Matrix

| Provider | Port | Auth | TLS | Status |
|----------|------|------|-----|--------|
| Gmail SMTP | 587 | XOAUTH2 | STARTTLS | Required |
| AWS SES SMTP | 587 | PLAIN | STARTTLS | Required |
| SendGrid SMTP | 587 | PLAIN | STARTTLS | Required |
| Mailgun SMTP | 587 | PLAIN | STARTTLS | Required |
| Postfix | 25/587 | PLAIN | STARTTLS | Required |
| Office 365 | 587 | XOAUTH2 | STARTTLS | Recommended |
| Mailhog | 1025 | None | None | Development |
| Mailcatcher | 1025 | None | None | Development |

### 12.4 Test Coverage Requirements

| Category | Line Coverage | Branch Coverage |
|----------|---------------|-----------------|
| Core Client | ≥85% | ≥75% |
| Transport | ≥80% | ≥70% |
| MIME Encoding | ≥90% | ≥80% |
| Authentication | ≥85% | ≥75% |
| Error Handling | ≥80% | ≥70% |
| **Overall** | **≥80%** | **≥70%** |

### 12.5 Documentation Requirements

| Document | Required |
|----------|----------|
| API Reference (rustdoc) | Yes |
| TypeScript Type Docs | Yes |
| Integration Guide | Yes |
| Provider-Specific Guides | Gmail, AWS SES, SendGrid |
| Troubleshooting Guide | Yes |
| Security Guidelines | Yes |
| Performance Tuning | Yes |

---

## Appendix A: Reference RFCs

| RFC | Title | Relevance |
|-----|-------|-----------|
| 5321 | Simple Mail Transfer Protocol | Core SMTP protocol |
| 5322 | Internet Message Format | Email message structure |
| 3207 | SMTP Service Extension for Secure SMTP over TLS | STARTTLS |
| 4954 | SMTP Service Extension for Authentication | AUTH command |
| 2045-2049 | MIME | Message encoding |
| 2047 | MIME Part Three: Message Header Extensions | Header encoding |
| 6152 | SMTP Service Extension for 8-bit MIME Transport | 8BITMIME |
| 2920 | SMTP Service Extension for Command Pipelining | PIPELINING |
| 6531 | SMTP Extension for Internationalized Email | SMTPUTF8 |
| 7628 | A Set of SASL Mechanisms for OAuth | OAUTHBEARER |

---

## Appendix B: Provider-Specific Notes

### Gmail SMTP

```
Host: smtp.gmail.com
Port: 587 (STARTTLS) or 465 (Implicit TLS)
Auth: XOAUTH2 (recommended) or App Password with PLAIN
Limits: 500 emails/day (free), rate limiting applies
Notes: Requires "Less secure app access" or OAuth2
```

### AWS SES SMTP

```
Host: email-smtp.<region>.amazonaws.com
Port: 587 (STARTTLS) or 465 (Implicit TLS)
Auth: PLAIN with SES credentials (NOT IAM credentials)
Limits: Based on sending quota (start: 200/day)
Notes: Must verify sender addresses/domains
```

### SendGrid SMTP

```
Host: smtp.sendgrid.net
Port: 587 (STARTTLS) or 465 (Implicit TLS)
Auth: PLAIN with API key as password, "apikey" as username
Limits: Based on plan
Notes: API key authentication
```

### Mailgun SMTP

```
Host: smtp.mailgun.org
Port: 587 (STARTTLS) or 465 (Implicit TLS)
Auth: PLAIN with domain credentials
Limits: Based on plan
Notes: Requires domain verification
```

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **DSN** | Delivery Status Notification - bounce/delivery reports |
| **ESMTP** | Extended SMTP - modern SMTP with extensions |
| **HELO** | Basic SMTP greeting command |
| **EHLO** | Extended SMTP greeting with capability discovery |
| **MIME** | Multipurpose Internet Mail Extensions |
| **MTA** | Mail Transfer Agent (mail server) |
| **MUA** | Mail User Agent (email client) |
| **STARTTLS** | Command to upgrade plaintext to TLS |
| **Envelope** | SMTP-level addressing (MAIL FROM, RCPT TO) |
| **Headers** | Message-level addressing (From, To, Subject) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | Integration Team | Initial specification |

---

*End of Specification Document*
