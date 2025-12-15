//! Error types for the AWS Bedrock integration module.
//!
//! This module defines a comprehensive error hierarchy following the SPARC specification.
//! Errors are categorized by their source and nature to enable appropriate handling.

mod mapping;

pub use mapping::map_bedrock_error;

use std::time::Duration;
use thiserror::Error;

/// Top-level error type for the Bedrock integration.
#[derive(Debug, Error)]
pub enum BedrockError {
    /// Configuration-related errors.
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    /// Credential-related errors.
    #[error("Credentials error: {0}")]
    Credentials(#[from] CredentialsError),

    /// Authentication and authorization errors.
    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    /// Model-related errors.
    #[error("Model error: {0}")]
    Model(#[from] ModelError),

    /// Request validation errors.
    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    /// Rate limiting errors.
    #[error("Rate limit error: {0}")]
    RateLimit(#[from] RateLimitError),

    /// Server-side errors.
    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    /// Streaming errors.
    #[error("Stream error: {0}")]
    Stream(#[from] StreamError),

    /// Network errors.
    #[error("Network error: {0}")]
    Network(#[from] NetworkError),
}

impl BedrockError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        match self {
            BedrockError::RateLimit(_) => true,
            BedrockError::Server(e) => e.is_retryable(),
            BedrockError::Network(e) => e.is_retryable(),
            BedrockError::Stream(StreamError::StreamInterrupted { .. }) => false, // Don't retry mid-stream
            _ => false,
        }
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            BedrockError::RateLimit(RateLimitError::TooManyRequests { retry_after, .. }) => {
                *retry_after
            }
            BedrockError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => {
                *retry_after
            }
            _ => None,
        }
    }

    /// Returns the HTTP status code if applicable.
    pub fn status_code(&self) -> Option<u16> {
        match self {
            BedrockError::Request(_) => Some(400),
            BedrockError::Authentication(_) => Some(403),
            BedrockError::Model(ModelError::NotFound { .. }) => Some(404),
            BedrockError::Model(ModelError::NotAccessible { .. }) => Some(403),
            BedrockError::RateLimit(_) => Some(429),
            BedrockError::Server(ServerError::InternalError { .. }) => Some(500),
            BedrockError::Server(ServerError::ServiceUnavailable { .. }) => Some(503),
            _ => None,
        }
    }

    /// Returns the AWS error code if available.
    pub fn aws_error_code(&self) -> Option<&str> {
        match self {
            BedrockError::Model(e) => Some(e.code()),
            BedrockError::Authentication(e) => Some(e.code()),
            BedrockError::RateLimit(e) => Some(e.code()),
            BedrockError::Server(e) => Some(e.code()),
            _ => None,
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            BedrockError::Model(e) => e.request_id(),
            BedrockError::Authentication(e) => e.request_id(),
            BedrockError::RateLimit(e) => e.request_id(),
            BedrockError::Server(e) => e.request_id(),
            BedrockError::Stream(e) => e.request_id(),
            _ => None,
        }
    }
}

/// Configuration-related errors.
#[derive(Debug, Error)]
pub enum ConfigurationError {
    /// Missing required region configuration.
    #[error("Missing region: region must be specified via config or environment")]
    MissingRegion,

    /// Missing required credentials.
    #[error("Missing credentials: credentials must be specified via config or environment")]
    MissingCredentials,

    /// Invalid configuration value.
    #[error("Invalid configuration: {field} - {message}")]
    InvalidConfiguration {
        /// The configuration field name.
        field: String,
        /// Error message.
        message: String,
    },

    /// Region does not support Bedrock.
    #[error("Region '{region}' does not support AWS Bedrock")]
    UnsupportedRegion {
        /// The unsupported region.
        region: String,
    },
}

/// Credential-related errors.
#[derive(Debug, Error)]
pub enum CredentialsError {
    /// No credentials could be found.
    #[error("Credentials not found: no credentials could be loaded from any source")]
    NotFound,

    /// Credentials have expired.
    #[error("Credentials expired: session credentials expired at {expiration}")]
    Expired {
        /// When the credentials expired.
        expiration: String,
    },

    /// Credentials are invalid.
    #[error("Invalid credentials: {message}")]
    Invalid {
        /// Details about why credentials are invalid.
        message: String,
    },

    /// Credential refresh failed.
    #[error("Credential refresh failed: {message}")]
    RefreshFailed {
        /// Details about the refresh failure.
        message: String,
    },
}

/// Authentication and authorization errors.
#[derive(Debug, Error)]
pub enum AuthenticationError {
    /// Access denied by IAM policy.
    #[error("Access denied: {message}")]
    AccessDenied {
        /// Error message.
        message: Option<String>,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Invalid signature.
    #[error("Signature verification failed")]
    SignatureError {
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Expired token.
    #[error("Token has expired")]
    ExpiredToken {
        /// AWS request ID.
        request_id: Option<String>,
    },
}

impl AuthenticationError {
    /// Returns the AWS error code.
    pub fn code(&self) -> &str {
        match self {
            AuthenticationError::AccessDenied { .. } => "AccessDeniedException",
            AuthenticationError::SignatureError { .. } => "SignatureDoesNotMatch",
            AuthenticationError::ExpiredToken { .. } => "ExpiredTokenException",
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            AuthenticationError::AccessDenied { request_id, .. }
            | AuthenticationError::SignatureError { request_id }
            | AuthenticationError::ExpiredToken { request_id } => request_id.as_deref(),
        }
    }
}

/// Model-related errors.
#[derive(Debug, Error)]
pub enum ModelError {
    /// Model not found.
    #[error("Model not found: '{model_id}'")]
    NotFound {
        /// The model ID.
        model_id: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Model not accessible in region.
    #[error("Model '{model_id}' is not accessible in region '{region}'")]
    NotAccessible {
        /// The model ID.
        model_id: String,
        /// The AWS region.
        region: String,
        /// Suggestion for the user.
        suggestion: Option<String>,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Model not ready (provisioned model still starting).
    #[error("Model not ready: '{model_id}'")]
    NotReady {
        /// The model ID.
        model_id: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Model overloaded.
    #[error("Model overloaded: '{model_id}'")]
    Overloaded {
        /// The model ID.
        model_id: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Unknown model family.
    #[error("Unknown model family for model ID: '{model_id}'")]
    UnknownFamily {
        /// The model ID.
        model_id: String,
    },
}

impl ModelError {
    /// Returns the AWS error code.
    pub fn code(&self) -> &str {
        match self {
            ModelError::NotFound { .. } => "ResourceNotFoundException",
            ModelError::NotAccessible { .. } => "AccessDeniedException",
            ModelError::NotReady { .. } => "ModelNotReadyException",
            ModelError::Overloaded { .. } => "ModelErrorException",
            ModelError::UnknownFamily { .. } => "ValidationException",
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            ModelError::NotFound { request_id, .. }
            | ModelError::NotAccessible { request_id, .. }
            | ModelError::NotReady { request_id, .. }
            | ModelError::Overloaded { request_id, .. } => request_id.as_deref(),
            ModelError::UnknownFamily { .. } => None,
        }
    }
}

/// Request validation errors.
#[derive(Debug, Error)]
pub enum RequestError {
    /// General validation error.
    #[error("Validation error: {message}")]
    Validation {
        /// Details about the validation error.
        message: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Payload too large.
    #[error("Payload too large: request exceeds maximum size")]
    PayloadTooLarge {
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Content filtered by safety policy.
    #[error("Content filtered: {message}")]
    ContentFiltered {
        /// Details about why content was filtered.
        message: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Context length exceeded.
    #[error("Context length exceeded: input tokens ({input_tokens}) exceed model limit ({max_tokens})")]
    ContextLengthExceeded {
        /// Number of input tokens.
        input_tokens: u32,
        /// Maximum allowed tokens.
        max_tokens: u32,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Invalid model parameters.
    #[error("Invalid parameter '{parameter}': {message}")]
    InvalidParameter {
        /// The invalid parameter name.
        parameter: String,
        /// Error message.
        message: String,
    },
}

/// Rate limiting errors.
#[derive(Debug, Error)]
pub enum RateLimitError {
    /// Too many requests.
    #[error("Too many requests: rate limit exceeded")]
    TooManyRequests {
        /// Retry after duration hint.
        retry_after: Option<Duration>,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Token rate limited.
    #[error("Token rate limit exceeded")]
    TokenRateLimited {
        /// AWS request ID.
        request_id: Option<String>,
    },
}

impl RateLimitError {
    /// Returns the AWS error code.
    pub fn code(&self) -> &str {
        match self {
            RateLimitError::TooManyRequests { .. } => "ThrottlingException",
            RateLimitError::TokenRateLimited { .. } => "ServiceQuotaExceededException",
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            RateLimitError::TooManyRequests { request_id, .. }
            | RateLimitError::TokenRateLimited { request_id } => request_id.as_deref(),
        }
    }
}

/// Server-side errors.
#[derive(Debug, Error)]
pub enum ServerError {
    /// Internal server error (500).
    #[error("Internal server error")]
    InternalError {
        /// Error message.
        message: Option<String>,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Service unavailable (503).
    #[error("Service unavailable")]
    ServiceUnavailable {
        /// Retry after duration hint.
        retry_after: Option<Duration>,
        /// AWS request ID.
        request_id: Option<String>,
    },
}

impl ServerError {
    /// Returns the AWS error code.
    pub fn code(&self) -> &str {
        match self {
            ServerError::InternalError { .. } => "InternalServerException",
            ServerError::ServiceUnavailable { .. } => "ServiceUnavailableException",
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            ServerError::InternalError { request_id, .. }
            | ServerError::ServiceUnavailable { request_id, .. } => request_id.as_deref(),
        }
    }

    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        true
    }
}

/// Streaming errors.
#[derive(Debug, Error)]
pub enum StreamError {
    /// Parse error in event stream.
    #[error("Event stream parse error: {message}")]
    ParseError {
        /// Error message.
        message: String,
    },

    /// CRC mismatch in event stream.
    #[error("Event stream CRC mismatch")]
    CrcMismatch,

    /// Stream interrupted.
    #[error("Stream interrupted after {chunks_received} chunks: {message}")]
    StreamInterrupted {
        /// Number of chunks received before interruption.
        chunks_received: usize,
        /// Error message.
        message: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Stream timeout.
    #[error("Stream timeout after {timeout:?} waiting for chunk")]
    StreamTimeout {
        /// Timeout duration.
        timeout: Duration,
        /// Number of chunks received before timeout.
        chunks_received: usize,
    },

    /// Model error during streaming.
    #[error("Model error during streaming: {message}")]
    ModelError {
        /// Error message.
        message: String,
        /// AWS request ID.
        request_id: Option<String>,
    },
}

impl StreamError {
    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            StreamError::StreamInterrupted { request_id, .. }
            | StreamError::ModelError { request_id, .. } => request_id.as_deref(),
            _ => None,
        }
    }
}

/// Network errors.
#[derive(Debug, Error)]
pub enum NetworkError {
    /// Connection failed.
    #[error("Connection failed: {message}")]
    ConnectionFailed {
        /// Error message.
        message: String,
    },

    /// Request timed out.
    #[error("Request timed out after {duration:?}")]
    Timeout {
        /// The timeout duration.
        duration: Duration,
    },

    /// DNS resolution failed.
    #[error("DNS resolution failed for '{host}'")]
    DnsResolutionFailed {
        /// The host that could not be resolved.
        host: String,
    },

    /// TLS/SSL error.
    #[error("TLS error: {message}")]
    TlsError {
        /// Error message.
        message: String,
    },

    /// Connection reset.
    #[error("Connection reset by peer")]
    ConnectionReset,
}

impl NetworkError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            NetworkError::ConnectionFailed { .. }
                | NetworkError::Timeout { .. }
                | NetworkError::ConnectionReset
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bedrock_error_is_retryable() {
        let rate_limit = BedrockError::RateLimit(RateLimitError::TooManyRequests {
            retry_after: Some(Duration::from_secs(30)),
            request_id: None,
        });
        assert!(rate_limit.is_retryable());

        let server_error = BedrockError::Server(ServerError::InternalError {
            message: None,
            request_id: None,
        });
        assert!(server_error.is_retryable());

        let access_denied = BedrockError::Authentication(AuthenticationError::AccessDenied {
            message: None,
            request_id: None,
        });
        assert!(!access_denied.is_retryable());
    }

    #[test]
    fn test_bedrock_error_status_code() {
        let access_denied = BedrockError::Authentication(AuthenticationError::AccessDenied {
            message: None,
            request_id: None,
        });
        assert_eq!(access_denied.status_code(), Some(403));

        let not_found = BedrockError::Model(ModelError::NotFound {
            model_id: "test".into(),
            request_id: None,
        });
        assert_eq!(not_found.status_code(), Some(404));

        let rate_limit = BedrockError::RateLimit(RateLimitError::TooManyRequests {
            retry_after: None,
            request_id: None,
        });
        assert_eq!(rate_limit.status_code(), Some(429));
    }

    #[test]
    fn test_retry_after() {
        let rate_limit = BedrockError::RateLimit(RateLimitError::TooManyRequests {
            retry_after: Some(Duration::from_secs(30)),
            request_id: None,
        });
        assert_eq!(rate_limit.retry_after(), Some(Duration::from_secs(30)));

        let not_found = BedrockError::Model(ModelError::NotFound {
            model_id: "test".into(),
            request_id: None,
        });
        assert!(not_found.retry_after().is_none());
    }
}
