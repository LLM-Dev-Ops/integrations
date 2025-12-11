//! Error types for the SMTP client.
//!
//! Provides comprehensive error handling with SMTP-specific error codes,
//! retryability detection, and severity classification.

use std::fmt;
use thiserror::Error;

/// Result type for SMTP operations.
pub type SmtpResult<T> = Result<T, SmtpError>;

/// SMTP error kinds categorizing different failure modes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SmtpErrorKind {
    // Connection errors
    /// DNS resolution failed.
    DnsResolution,
    /// Connection was refused.
    ConnectionRefused,
    /// Connection timed out.
    ConnectionTimeout,
    /// Connection was reset.
    ConnectionReset,
    /// Network is unreachable.
    NetworkUnreachable,

    // TLS errors
    /// TLS handshake failed.
    TlsHandshakeFailed,
    /// Certificate is invalid.
    CertificateInvalid,
    /// Certificate has expired.
    CertificateExpired,
    /// Certificate issuer is not trusted.
    CertificateUntrusted,
    /// TLS protocol version mismatch.
    TlsVersionMismatch,
    /// STARTTLS not supported by server.
    StarttlsNotSupported,

    // Authentication errors
    /// Credentials are invalid.
    CredentialsInvalid,
    /// Credentials have expired (OAuth tokens).
    CredentialsExpired,
    /// Authentication method not supported.
    AuthMethodNotSupported,
    /// Authentication is required.
    AuthenticationRequired,
    /// Too many authentication attempts.
    TooManyAuthAttempts,

    // Protocol errors
    /// Invalid response from server.
    InvalidResponse,
    /// Unexpected response code.
    UnexpectedResponse,
    /// Command sequence error.
    CommandSequenceError,
    /// Server is shutting down (421).
    ServerShutdown,
    /// Capability mismatch.
    CapabilityMismatch,

    // Message errors
    /// Invalid sender address.
    InvalidFromAddress,
    /// Invalid recipient address.
    InvalidRecipientAddress,
    /// Message exceeds size limit.
    MessageTooLarge,
    /// Invalid header format.
    InvalidHeader,
    /// Encoding failed.
    EncodingFailed,
    /// Attachment error.
    AttachmentError,

    // Timeout errors
    /// Connect timeout.
    ConnectTimeout,
    /// Read timeout.
    ReadTimeout,
    /// Write timeout.
    WriteTimeout,
    /// Command timeout.
    CommandTimeout,

    // Rate limit errors
    /// Local rate limit exceeded.
    LocalRateLimitExceeded,
    /// Server rate limit exceeded.
    ServerRateLimitExceeded,

    // Circuit breaker
    /// Circuit breaker is open.
    CircuitBreakerOpen,

    // Pool errors
    /// Connection pool exhausted.
    PoolExhausted,
    /// Pool acquire timeout.
    AcquireTimeout,
    /// Connection is unhealthy.
    ConnectionUnhealthy,

    // Configuration errors
    /// Configuration is invalid.
    ConfigurationInvalid,

    // Generic
    /// Unknown or internal error.
    Unknown,
}

impl SmtpErrorKind {
    /// Returns true if this error kind is typically retryable.
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

    /// Returns the severity level of this error kind.
    pub fn severity(&self) -> ErrorSeverity {
        match self {
            // Critical - requires attention
            SmtpErrorKind::CredentialsInvalid
            | SmtpErrorKind::CertificateInvalid
            | SmtpErrorKind::CertificateExpired
            | SmtpErrorKind::CertificateUntrusted
            | SmtpErrorKind::ConfigurationInvalid => ErrorSeverity::Critical,

            // Error - operation failed
            SmtpErrorKind::DnsResolution
            | SmtpErrorKind::ConnectionRefused
            | SmtpErrorKind::NetworkUnreachable
            | SmtpErrorKind::TlsHandshakeFailed
            | SmtpErrorKind::InvalidFromAddress
            | SmtpErrorKind::InvalidRecipientAddress
            | SmtpErrorKind::MessageTooLarge
            | SmtpErrorKind::InvalidHeader
            | SmtpErrorKind::EncodingFailed
            | SmtpErrorKind::AttachmentError
            | SmtpErrorKind::AuthMethodNotSupported
            | SmtpErrorKind::AuthenticationRequired => ErrorSeverity::Error,

            // Warning - temporary issue
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
            | SmtpErrorKind::ServerRateLimitExceeded
            | SmtpErrorKind::CircuitBreakerOpen => ErrorSeverity::Warning,

            // Info - expected scenarios
            SmtpErrorKind::CredentialsExpired
            | SmtpErrorKind::TooManyAuthAttempts => ErrorSeverity::Info,

            _ => ErrorSeverity::Error,
        }
    }
}

impl fmt::Display for SmtpErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SmtpErrorKind::DnsResolution => write!(f, "DNS resolution failed"),
            SmtpErrorKind::ConnectionRefused => write!(f, "Connection refused"),
            SmtpErrorKind::ConnectionTimeout => write!(f, "Connection timed out"),
            SmtpErrorKind::ConnectionReset => write!(f, "Connection reset"),
            SmtpErrorKind::NetworkUnreachable => write!(f, "Network unreachable"),
            SmtpErrorKind::TlsHandshakeFailed => write!(f, "TLS handshake failed"),
            SmtpErrorKind::CertificateInvalid => write!(f, "Invalid certificate"),
            SmtpErrorKind::CertificateExpired => write!(f, "Certificate expired"),
            SmtpErrorKind::CertificateUntrusted => write!(f, "Certificate not trusted"),
            SmtpErrorKind::TlsVersionMismatch => write!(f, "TLS version mismatch"),
            SmtpErrorKind::StarttlsNotSupported => write!(f, "STARTTLS not supported"),
            SmtpErrorKind::CredentialsInvalid => write!(f, "Invalid credentials"),
            SmtpErrorKind::CredentialsExpired => write!(f, "Credentials expired"),
            SmtpErrorKind::AuthMethodNotSupported => write!(f, "Auth method not supported"),
            SmtpErrorKind::AuthenticationRequired => write!(f, "Authentication required"),
            SmtpErrorKind::TooManyAuthAttempts => write!(f, "Too many auth attempts"),
            SmtpErrorKind::InvalidResponse => write!(f, "Invalid server response"),
            SmtpErrorKind::UnexpectedResponse => write!(f, "Unexpected response"),
            SmtpErrorKind::CommandSequenceError => write!(f, "Command sequence error"),
            SmtpErrorKind::ServerShutdown => write!(f, "Server shutting down"),
            SmtpErrorKind::CapabilityMismatch => write!(f, "Capability mismatch"),
            SmtpErrorKind::InvalidFromAddress => write!(f, "Invalid sender address"),
            SmtpErrorKind::InvalidRecipientAddress => write!(f, "Invalid recipient address"),
            SmtpErrorKind::MessageTooLarge => write!(f, "Message too large"),
            SmtpErrorKind::InvalidHeader => write!(f, "Invalid header"),
            SmtpErrorKind::EncodingFailed => write!(f, "Encoding failed"),
            SmtpErrorKind::AttachmentError => write!(f, "Attachment error"),
            SmtpErrorKind::ConnectTimeout => write!(f, "Connect timeout"),
            SmtpErrorKind::ReadTimeout => write!(f, "Read timeout"),
            SmtpErrorKind::WriteTimeout => write!(f, "Write timeout"),
            SmtpErrorKind::CommandTimeout => write!(f, "Command timeout"),
            SmtpErrorKind::LocalRateLimitExceeded => write!(f, "Local rate limit exceeded"),
            SmtpErrorKind::ServerRateLimitExceeded => write!(f, "Server rate limit exceeded"),
            SmtpErrorKind::CircuitBreakerOpen => write!(f, "Circuit breaker open"),
            SmtpErrorKind::PoolExhausted => write!(f, "Connection pool exhausted"),
            SmtpErrorKind::AcquireTimeout => write!(f, "Pool acquire timeout"),
            SmtpErrorKind::ConnectionUnhealthy => write!(f, "Connection unhealthy"),
            SmtpErrorKind::ConfigurationInvalid => write!(f, "Invalid configuration"),
            SmtpErrorKind::Unknown => write!(f, "Unknown error"),
        }
    }
}

/// Error severity levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ErrorSeverity {
    /// Informational - expected scenario.
    Info,
    /// Warning - temporary issue, may recover.
    Warning,
    /// Error - operation failed.
    Error,
    /// Critical - requires immediate attention.
    Critical,
}

/// Enhanced SMTP status code (RFC 2034).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnhancedStatusCode {
    /// Class (2=success, 4=temporary, 5=permanent).
    pub class: u8,
    /// Subject (e.g., 1=addressing, 2=mailbox, 3=mail system).
    pub subject: u16,
    /// Detail code.
    pub detail: u16,
}

impl EnhancedStatusCode {
    /// Creates a new enhanced status code.
    pub fn new(class: u8, subject: u16, detail: u16) -> Self {
        Self { class, subject, detail }
    }

    /// Parses an enhanced status code from a string (e.g., "5.1.1").
    pub fn parse(s: &str) -> Option<Self> {
        let parts: Vec<&str> = s.split('.').collect();
        if parts.len() != 3 {
            return None;
        }
        Some(Self {
            class: parts[0].parse().ok()?,
            subject: parts[1].parse().ok()?,
            detail: parts[2].parse().ok()?,
        })
    }

    /// Returns true if this is a success status.
    pub fn is_success(&self) -> bool {
        self.class == 2
    }

    /// Returns true if this is a temporary failure.
    pub fn is_temporary(&self) -> bool {
        self.class == 4
    }

    /// Returns true if this is a permanent failure.
    pub fn is_permanent(&self) -> bool {
        self.class == 5
    }
}

impl fmt::Display for EnhancedStatusCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}.{}", self.class, self.subject, self.detail)
    }
}

/// SMTP error with detailed information.
#[derive(Error, Debug)]
pub struct SmtpError {
    /// Error kind.
    kind: SmtpErrorKind,
    /// Human-readable message.
    message: String,
    /// SMTP status code if available.
    smtp_code: Option<u16>,
    /// Enhanced status code if available.
    enhanced_code: Option<EnhancedStatusCode>,
    /// Underlying cause.
    #[source]
    cause: Option<Box<dyn std::error::Error + Send + Sync>>,
}

impl SmtpError {
    /// Creates a new SMTP error.
    pub fn new(kind: SmtpErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            smtp_code: None,
            enhanced_code: None,
            cause: None,
        }
    }

    /// Sets the SMTP status code.
    pub fn with_smtp_code(mut self, code: u16) -> Self {
        self.smtp_code = Some(code);
        self
    }

    /// Sets the enhanced status code.
    pub fn with_enhanced_code(mut self, code: EnhancedStatusCode) -> Self {
        self.enhanced_code = Some(code);
        self
    }

    /// Sets the underlying cause.
    pub fn with_cause<E: std::error::Error + Send + Sync + 'static>(mut self, cause: E) -> Self {
        self.cause = Some(Box::new(cause));
        self
    }

    /// Returns the error kind.
    pub fn kind(&self) -> SmtpErrorKind {
        self.kind
    }

    /// Returns the error message.
    pub fn message(&self) -> &str {
        &self.message
    }

    /// Returns the SMTP status code if available.
    pub fn smtp_code(&self) -> Option<u16> {
        self.smtp_code
    }

    /// Returns the enhanced status code if available.
    pub fn enhanced_code(&self) -> Option<&EnhancedStatusCode> {
        self.enhanced_code.as_ref()
    }

    /// Returns true if this error is retryable.
    pub fn is_retryable(&self) -> bool {
        // Check SMTP code first
        if let Some(code) = self.smtp_code {
            return matches!(code, 421 | 450 | 451 | 452);
        }
        // Fall back to kind-based detection
        self.kind.is_retryable()
    }

    /// Returns the error severity.
    pub fn severity(&self) -> ErrorSeverity {
        self.kind.severity()
    }

    // Convenience constructors

    /// Creates a connection error.
    pub fn connection(message: impl Into<String>) -> Self {
        Self::new(SmtpErrorKind::ConnectionRefused, message)
    }

    /// Creates a timeout error.
    pub fn timeout(kind: SmtpErrorKind, message: impl Into<String>) -> Self {
        Self::new(kind, message)
    }

    /// Creates a TLS error.
    pub fn tls(message: impl Into<String>) -> Self {
        Self::new(SmtpErrorKind::TlsHandshakeFailed, message)
    }

    /// Creates an authentication error.
    pub fn authentication(message: impl Into<String>) -> Self {
        Self::new(SmtpErrorKind::CredentialsInvalid, message)
    }

    /// Creates a protocol error.
    pub fn protocol(message: impl Into<String>) -> Self {
        Self::new(SmtpErrorKind::InvalidResponse, message)
    }

    /// Creates a message error.
    pub fn message_error(kind: SmtpErrorKind, message: impl Into<String>) -> Self {
        Self::new(kind, message)
    }

    /// Creates a configuration error.
    pub fn configuration(message: impl Into<String>) -> Self {
        Self::new(SmtpErrorKind::ConfigurationInvalid, message)
    }

    /// Creates a circuit breaker open error.
    pub fn circuit_open() -> Self {
        Self::new(
            SmtpErrorKind::CircuitBreakerOpen,
            "Circuit breaker is open, service temporarily unavailable",
        )
    }

    /// Creates a rate limit error.
    pub fn rate_limit(message: impl Into<String>) -> Self {
        Self::new(SmtpErrorKind::LocalRateLimitExceeded, message)
    }

    /// Creates a pool error.
    pub fn pool(kind: SmtpErrorKind, message: impl Into<String>) -> Self {
        Self::new(kind, message)
    }

    /// Creates an error from an SMTP response.
    pub fn from_smtp_response(code: u16, message: impl Into<String>) -> Self {
        let msg = message.into();
        let kind = match code {
            421 => SmtpErrorKind::ServerShutdown,
            450 | 451 | 452 => SmtpErrorKind::UnexpectedResponse,
            500 | 501 | 502 | 503 => SmtpErrorKind::InvalidResponse,
            530 => SmtpErrorKind::AuthenticationRequired,
            535 => SmtpErrorKind::CredentialsInvalid,
            550 => SmtpErrorKind::InvalidRecipientAddress,
            552 => SmtpErrorKind::MessageTooLarge,
            553 => SmtpErrorKind::InvalidFromAddress,
            554 => SmtpErrorKind::UnexpectedResponse,
            _ if code >= 400 && code < 500 => SmtpErrorKind::UnexpectedResponse,
            _ if code >= 500 => SmtpErrorKind::UnexpectedResponse,
            _ => SmtpErrorKind::Unknown,
        };
        Self::new(kind, msg).with_smtp_code(code)
    }
}

impl fmt::Display for SmtpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.kind, self.message)?;
        if let Some(code) = self.smtp_code {
            write!(f, " (SMTP {})", code)?;
        }
        if let Some(enhanced) = &self.enhanced_code {
            write!(f, " [{}]", enhanced)?;
        }
        Ok(())
    }
}

/// Type alias for checking if an error is retryable.
pub trait IsRetryable {
    /// Returns true if the error is retryable.
    fn is_retryable(&self) -> bool;
}

impl IsRetryable for SmtpError {
    fn is_retryable(&self) -> bool {
        SmtpError::is_retryable(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_kind_retryable() {
        assert!(SmtpErrorKind::ConnectionTimeout.is_retryable());
        assert!(SmtpErrorKind::ServerShutdown.is_retryable());
        assert!(!SmtpErrorKind::CredentialsInvalid.is_retryable());
        assert!(!SmtpErrorKind::InvalidFromAddress.is_retryable());
    }

    #[test]
    fn test_enhanced_status_code_parse() {
        let code = EnhancedStatusCode::parse("5.1.1").unwrap();
        assert_eq!(code.class, 5);
        assert_eq!(code.subject, 1);
        assert_eq!(code.detail, 1);
        assert!(code.is_permanent());
        assert!(!code.is_temporary());
    }

    #[test]
    fn test_smtp_error_from_response() {
        let err = SmtpError::from_smtp_response(535, "Authentication failed");
        assert_eq!(err.kind(), SmtpErrorKind::CredentialsInvalid);
        assert_eq!(err.smtp_code(), Some(535));
        assert!(!err.is_retryable());

        let err = SmtpError::from_smtp_response(421, "Service unavailable");
        assert_eq!(err.kind(), SmtpErrorKind::ServerShutdown);
        assert!(err.is_retryable());
    }

    #[test]
    fn test_error_severity() {
        assert_eq!(
            SmtpErrorKind::CredentialsInvalid.severity(),
            ErrorSeverity::Critical
        );
        assert_eq!(
            SmtpErrorKind::ConnectionTimeout.severity(),
            ErrorSeverity::Warning
        );
        assert_eq!(
            SmtpErrorKind::InvalidFromAddress.severity(),
            ErrorSeverity::Error
        );
    }
}
