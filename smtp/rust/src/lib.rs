//! # SMTP Integration Library
//!
//! A production-ready SMTP client implementation with:
//! - Full RFC 5321 SMTP and RFC 5322 message format compliance
//! - Multiple authentication methods (PLAIN, LOGIN, CRAM-MD5, XOAUTH2, OAUTHBEARER)
//! - Transport security (STARTTLS, implicit TLS)
//! - Connection pooling with health checks
//! - MIME message construction with attachments
//! - Resilience patterns (retry, circuit breaker, rate limiting)
//! - Comprehensive observability
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use integrations_smtp::{SmtpClient, SmtpConfig, EmailBuilder, Address};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create client from configuration
//!     let config = SmtpConfig::builder()
//!         .host("smtp.example.com")
//!         .port(587)
//!         .credentials("user@example.com", "password")
//!         .build()?;
//!
//!     let client = SmtpClient::new(config).await?;
//!
//!     // Build and send an email
//!     let email = EmailBuilder::new()
//!         .from("sender@example.com")
//!         .to("recipient@example.com")
//!         .subject("Hello from Rust!")
//!         .text("This is a test email.")
//!         .build()?;
//!
//!     let result = client.send(email).await?;
//!     println!("Message sent with ID: {:?}", result.message_id);
//!
//!     Ok(())
//! }
//! ```

#![warn(missing_docs)]
#![warn(clippy::all)]

// Core modules
pub mod config;
pub mod errors;
pub mod types;

// Protocol layer
pub mod protocol;

// Transport layer
pub mod transport;

// Authentication
pub mod auth;

// MIME encoding
pub mod mime;

// Resilience
pub mod resilience;

// Observability
pub mod observability;

// Client
pub mod client;

// Mocks for testing
pub mod mocks;

// Re-exports for convenience
pub use client::{SmtpClient, SmtpClientBuilder};
pub use config::{
    SmtpConfig, SmtpConfigBuilder, TlsConfig, TlsMode, TlsVersion,
    PoolConfig, RetryConfig, CircuitBreakerConfig, RateLimitConfig, OnLimitBehavior,
};
pub use errors::{SmtpError, SmtpErrorKind, SmtpResult};
pub use types::{
    Email, EmailBuilder, Address, Attachment, InlineImage,
    SendResult, BatchSendResult, RejectedRecipient,
    ConnectionInfo, PoolStatus,
};
pub use auth::{AuthMethod, Credentials, CredentialProvider};
pub use protocol::{SmtpCommand, SmtpResponse, EsmtpCapabilities};
pub use transport::SmtpTransport;
pub use mime::{MimeEncoder, ContentType, TransferEncoding};
pub use resilience::{RetryExecutor, CircuitBreaker, RateLimiter};
