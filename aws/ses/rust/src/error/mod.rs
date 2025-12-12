//! Error types for the AWS SES v2 integration module.
//!
//! This module defines a comprehensive error hierarchy for AWS SES operations.
//! Errors are categorized by their source and nature to enable appropriate handling,
//! including retry logic, quota management, and credential issues.
//!
//! # Error Hierarchy
//!
//! The main [`SesError`] enum contains variants for different error categories:
//! - Configuration errors (invalid settings, missing credentials)
//! - Authentication and authorization errors
//! - Rate limiting and quota errors
//! - Resource not found errors (templates, identities, etc.)
//! - Network and transport errors
//! - AWS API errors with specific error codes
//!
//! # Examples
//!
//! ```rust
//! use integrations_aws_ses::error::{SesError, QuotaType};
//!
//! fn handle_ses_error(error: &SesError) {
//!     if error.is_retryable() {
//!         println!("Error is retryable");
//!         if let Some(duration) = error.retry_after() {
//!             println!("Retry after: {:?}", duration);
//!         }
//!     }
//!
//!     if let Some(code) = error.error_code() {
//!         println!("AWS error code: {}", code);
//!     }
//! }
//! ```

mod mapping;
mod result;

pub use mapping::{map_aws_error, parse_error_response, AwsErrorResponse};
pub use result::{retry_with_backoff, retry_with_jitter, SesResult, SesResultExt};

use std::time::Duration;
use thiserror::Error;

/// Top-level error type for the AWS SES v2 integration.
///
/// This enum represents all possible errors that can occur when interacting
/// with AWS SES v2. Each variant provides specific context about the error
/// and supports inspection for retryability and error codes.
#[derive(Debug, Error)]
pub enum SesError {
    /// Configuration-related errors.
    ///
    /// These errors occur when the SES client is misconfigured or when
    /// configuration values are invalid.
    #[error("Configuration error: {message}")]
    Configuration {
        /// Description of the configuration error.
        message: String,
        /// Optional underlying error source.
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// Credential-related errors.
    ///
    /// These errors occur when AWS credentials are missing, invalid, or expired.
    #[error("Credential error: {message}")]
    Credential {
        /// Description of the credential error.
        message: String,
    },

    /// AWS Signature V4 signing errors.
    ///
    /// These errors occur when request signing fails due to invalid
    /// timestamps, missing keys, or signature calculation issues.
    #[error("Signing error: {message}")]
    Signing {
        /// Description of the signing error.
        message: String,
    },

    /// Transport and network errors.
    ///
    /// These errors occur during HTTP communication with the SES API,
    /// including connection failures and DNS resolution issues.
    #[error("Transport error: {message}")]
    Transport {
        /// Description of the transport error.
        message: String,
        /// Optional underlying error source.
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
        /// Whether this error is retryable.
        retryable: bool,
    },

    /// Request timeout errors.
    ///
    /// These errors occur when a request to AWS SES times out.
    #[error("Timeout: {message}")]
    Timeout {
        /// Description of the timeout.
        message: String,
        /// Whether this timeout is retryable.
        retryable: bool,
    },

    /// Rate limiting errors.
    ///
    /// These errors occur when AWS SES throttles requests due to exceeding
    /// the maximum request rate. The `retry_after` field provides a hint
    /// for when to retry the request.
    #[error("Rate limited: {message}")]
    RateLimited {
        /// Description of the rate limiting.
        message: String,
        /// Optional duration to wait before retrying.
        retry_after: Option<Duration>,
    },

    /// Account suspended errors.
    ///
    /// These errors occur when the AWS account has been suspended,
    /// typically due to compliance or billing issues.
    #[error("Account suspended: {message}")]
    AccountSuspended {
        /// Description of the suspension.
        message: String,
    },

    /// Sending paused errors.
    ///
    /// These errors occur when email sending has been paused for the account,
    /// typically due to reputation issues or manual intervention.
    #[error("Sending paused: {message}")]
    SendingPaused {
        /// Description of why sending is paused.
        message: String,
    },

    /// Quota exceeded errors.
    ///
    /// These errors occur when a sending quota has been exceeded.
    /// The `quota_type` field indicates which quota was exceeded.
    #[error("Quota exceeded: {message}")]
    QuotaExceeded {
        /// Description of the quota violation.
        message: String,
        /// Type of quota that was exceeded.
        quota_type: QuotaType,
    },

    /// Identity not verified errors.
    ///
    /// These errors occur when attempting to send from an email address
    /// or domain that has not been verified in SES.
    #[error("Identity not verified: {identity}")]
    IdentityNotVerified {
        /// The unverified email address or domain.
        identity: String,
    },

    /// Configuration set not found errors.
    ///
    /// These errors occur when referencing a configuration set that
    /// does not exist in the AWS account.
    #[error("Configuration set not found: {name}")]
    ConfigurationSetNotFound {
        /// The name of the configuration set.
        name: String,
    },

    /// Template not found errors.
    ///
    /// These errors occur when referencing an email template that
    /// does not exist in the AWS account.
    #[error("Template not found: {name}")]
    TemplateNotFound {
        /// The name of the template.
        name: String,
    },

    /// Contact list not found errors.
    ///
    /// These errors occur when referencing a contact list that
    /// does not exist in the AWS account.
    #[error("Contact list not found: {name}")]
    ContactListNotFound {
        /// The name of the contact list.
        name: String,
    },

    /// Invalid parameter errors.
    ///
    /// These errors occur when a parameter value is invalid according
    /// to AWS SES validation rules.
    #[error("Invalid parameter: {parameter} - {message}")]
    InvalidParameter {
        /// The name of the invalid parameter.
        parameter: String,
        /// Description of why the parameter is invalid.
        message: String,
    },

    /// Validation errors.
    ///
    /// These errors occur when request validation fails, either on the
    /// client side or server side.
    #[error("Validation error: {message}")]
    Validation {
        /// Description of the validation error.
        message: String,
        /// Optional field name that failed validation.
        field: Option<String>,
    },

    /// Serialization errors.
    ///
    /// These errors occur when serializing request data or deserializing
    /// response data fails.
    #[error("Serialization error: {message}")]
    Serialization {
        /// Description of the serialization error.
        message: String,
    },

    /// AWS API errors.
    ///
    /// These errors represent errors returned by the AWS SES API with
    /// specific error codes. The `retryable` field indicates whether
    /// the error should be retried.
    #[error("AWS API error: {code} - {message}")]
    AwsApi {
        /// AWS error code (e.g., "MessageRejected").
        code: String,
        /// Human-readable error message.
        message: String,
        /// AWS request ID for debugging.
        request_id: Option<String>,
        /// Whether this error is retryable.
        retryable: bool,
    },

    /// Unknown errors.
    ///
    /// These errors represent unexpected or unmapped error conditions.
    #[error("Unknown error: {message}")]
    Unknown {
        /// Description of the unknown error.
        message: String,
    },
}

impl SesError {
    /// Returns true if the error is retryable.
    ///
    /// Retryable errors include:
    /// - Network and transport errors (connection failures, timeouts)
    /// - Rate limiting errors (throttling)
    /// - Server errors (500-level HTTP status codes)
    /// - Some AWS API errors marked as retryable
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::error::SesError;
    ///
    /// let error = SesError::RateLimited {
    ///     message: "Request throttled".to_string(),
    ///     retry_after: None,
    /// };
    ///
    /// assert!(error.is_retryable());
    /// ```
    pub fn is_retryable(&self) -> bool {
        match self {
            SesError::Transport { retryable, .. } => *retryable,
            SesError::Timeout { retryable, .. } => *retryable,
            SesError::RateLimited { .. } => true,
            SesError::AwsApi { retryable, .. } => *retryable,
            _ => false,
        }
    }

    /// Returns the AWS error code if available.
    ///
    /// This is useful for programmatic error handling based on specific
    /// AWS error codes.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::error::SesError;
    ///
    /// let error = SesError::AwsApi {
    ///     code: "MessageRejected".to_string(),
    ///     message: "Email address is not verified".to_string(),
    ///     request_id: Some("abc-123".to_string()),
    ///     retryable: false,
    /// };
    ///
    /// assert_eq!(error.error_code(), Some("MessageRejected"));
    /// ```
    pub fn error_code(&self) -> Option<&str> {
        match self {
            SesError::AwsApi { code, .. } => Some(code.as_str()),
            _ => None,
        }
    }

    /// Returns the AWS request ID if available.
    ///
    /// The request ID can be used for debugging and support tickets with AWS.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::error::SesError;
    ///
    /// let error = SesError::AwsApi {
    ///     code: "ServiceUnavailable".to_string(),
    ///     message: "Service temporarily unavailable".to_string(),
    ///     request_id: Some("xyz-789".to_string()),
    ///     retryable: true,
    /// };
    ///
    /// assert_eq!(error.request_id(), Some("xyz-789"));
    /// ```
    pub fn request_id(&self) -> Option<&str> {
        match self {
            SesError::AwsApi { request_id, .. } => request_id.as_deref(),
            _ => None,
        }
    }

    /// Returns the suggested retry delay if available.
    ///
    /// Some errors provide a hint for how long to wait before retrying.
    /// This is particularly useful for rate limiting errors.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::error::SesError;
    /// use std::time::Duration;
    ///
    /// let error = SesError::RateLimited {
    ///     message: "Too many requests".to_string(),
    ///     retry_after: Some(Duration::from_secs(30)),
    /// };
    ///
    /// assert_eq!(error.retry_after(), Some(Duration::from_secs(30)));
    /// ```
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            SesError::RateLimited { retry_after, .. } => *retry_after,
            _ => None,
        }
    }
}

/// Type of quota that was exceeded.
///
/// AWS SES enforces several types of quotas to prevent abuse and ensure
/// service reliability. This enum identifies which quota was exceeded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QuotaType {
    /// Daily sending quota exceeded.
    ///
    /// The account has exceeded the maximum number of emails that can be
    /// sent in a 24-hour period.
    Daily,

    /// Per-second sending rate exceeded.
    ///
    /// The account has exceeded the maximum number of emails that can be
    /// sent per second.
    PerSecond,

    /// Maximum recipients per message exceeded.
    ///
    /// The message contains too many recipients (To, CC, BCC combined).
    Recipients,

    /// Maximum message size exceeded.
    ///
    /// The message (including attachments) exceeds the maximum allowed size
    /// (typically 10 MB including headers).
    MessageSize,
}

// From implementations for common error types

impl From<std::io::Error> for SesError {
    fn from(err: std::io::Error) -> Self {
        SesError::Transport {
            message: err.to_string(),
            source: Some(Box::new(err)),
            retryable: true,
        }
    }
}

impl From<serde_json::Error> for SesError {
    fn from(err: serde_json::Error) -> Self {
        SesError::Serialization {
            message: err.to_string(),
        }
    }
}

impl From<reqwest::Error> for SesError {
    fn from(err: reqwest::Error) -> Self {
        let retryable = err.is_timeout() || err.is_connect() || err.status().map_or(false, |s| s.is_server_error());

        if err.is_timeout() {
            SesError::Timeout {
                message: err.to_string(),
                retryable: true,
            }
        } else {
            SesError::Transport {
                message: err.to_string(),
                source: Some(Box::new(err)),
                retryable,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ses_error_is_retryable() {
        // Retryable errors
        let rate_limited = SesError::RateLimited {
            message: "Throttled".to_string(),
            retry_after: None,
        };
        assert!(rate_limited.is_retryable());

        let transport_error = SesError::Transport {
            message: "Connection failed".to_string(),
            source: None,
            retryable: true,
        };
        assert!(transport_error.is_retryable());

        let timeout = SesError::Timeout {
            message: "Request timed out".to_string(),
            retryable: true,
        };
        assert!(timeout.is_retryable());

        let aws_retryable = SesError::AwsApi {
            code: "ServiceUnavailable".to_string(),
            message: "Service temporarily unavailable".to_string(),
            request_id: None,
            retryable: true,
        };
        assert!(aws_retryable.is_retryable());

        // Non-retryable errors
        let not_verified = SesError::IdentityNotVerified {
            identity: "test@example.com".to_string(),
        };
        assert!(!not_verified.is_retryable());

        let validation = SesError::Validation {
            message: "Invalid email".to_string(),
            field: Some("to".to_string()),
        };
        assert!(!validation.is_retryable());

        let aws_non_retryable = SesError::AwsApi {
            code: "MessageRejected".to_string(),
            message: "Invalid recipient".to_string(),
            request_id: None,
            retryable: false,
        };
        assert!(!aws_non_retryable.is_retryable());
    }

    #[test]
    fn test_ses_error_code() {
        let aws_error = SesError::AwsApi {
            code: "MessageRejected".to_string(),
            message: "Email rejected".to_string(),
            request_id: Some("abc-123".to_string()),
            retryable: false,
        };
        assert_eq!(aws_error.error_code(), Some("MessageRejected"));

        let other_error = SesError::Validation {
            message: "Invalid".to_string(),
            field: None,
        };
        assert_eq!(other_error.error_code(), None);
    }

    #[test]
    fn test_request_id() {
        let aws_error = SesError::AwsApi {
            code: "InternalFailure".to_string(),
            message: "Internal error".to_string(),
            request_id: Some("xyz-789".to_string()),
            retryable: true,
        };
        assert_eq!(aws_error.request_id(), Some("xyz-789"));

        let other_error = SesError::Configuration {
            message: "Missing region".to_string(),
            source: None,
        };
        assert_eq!(other_error.request_id(), None);
    }

    #[test]
    fn test_retry_after() {
        let rate_limited = SesError::RateLimited {
            message: "Throttled".to_string(),
            retry_after: Some(Duration::from_secs(60)),
        };
        assert_eq!(rate_limited.retry_after(), Some(Duration::from_secs(60)));

        let no_retry = SesError::Validation {
            message: "Invalid".to_string(),
            field: None,
        };
        assert_eq!(no_retry.retry_after(), None);
    }

    #[test]
    fn test_quota_types() {
        let daily = QuotaType::Daily;
        let per_second = QuotaType::PerSecond;
        let recipients = QuotaType::Recipients;
        let message_size = QuotaType::MessageSize;

        assert_eq!(daily, QuotaType::Daily);
        assert_eq!(per_second, QuotaType::PerSecond);
        assert_eq!(recipients, QuotaType::Recipients);
        assert_eq!(message_size, QuotaType::MessageSize);
    }

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::ConnectionRefused, "Connection refused");
        let ses_err: SesError = io_err.into();

        assert!(matches!(ses_err, SesError::Transport { retryable: true, .. }));
        assert!(ses_err.is_retryable());
    }

    #[test]
    fn test_from_serde_error() {
        let json_err = serde_json::from_str::<serde_json::Value>("invalid json").unwrap_err();
        let ses_err: SesError = json_err.into();

        assert!(matches!(ses_err, SesError::Serialization { .. }));
    }

    #[test]
    fn test_error_display() {
        let error = SesError::IdentityNotVerified {
            identity: "unverified@example.com".to_string(),
        };
        assert_eq!(error.to_string(), "Identity not verified: unverified@example.com");

        let error = SesError::QuotaExceeded {
            message: "Daily quota exceeded".to_string(),
            quota_type: QuotaType::Daily,
        };
        assert_eq!(error.to_string(), "Quota exceeded: Daily quota exceeded");
    }
}
