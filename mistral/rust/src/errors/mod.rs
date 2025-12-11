//! Error types for the Mistral client.
//!
//! Provides a comprehensive error taxonomy covering all possible failure modes
//! including API errors, network errors, and validation errors.

use std::time::Duration;
use thiserror::Error;

/// Result type alias for Mistral operations.
pub type MistralResult<T> = Result<T, MistralError>;

/// Comprehensive error type for Mistral client operations.
#[derive(Debug, Error)]
pub enum MistralError {
    /// Configuration error (invalid API key, base URL, etc.)
    #[error("Configuration error: {message}")]
    Configuration {
        /// Error message describing the configuration issue.
        message: String,
    },

    /// Authentication error (invalid or missing API key).
    #[error("Authentication failed: {message}")]
    Authentication {
        /// Error message from the API.
        message: String,
    },

    /// Permission denied (insufficient access rights).
    #[error("Permission denied: {message}")]
    Permission {
        /// Error message describing the permission issue.
        message: String,
    },

    /// Bad request (invalid request parameters).
    #[error("Bad request: {message}")]
    BadRequest {
        /// Error message describing the validation issue.
        message: String,
        /// The type of error.
        error_type: Option<String>,
        /// The parameter that caused the error.
        param: Option<String>,
        /// Error code from the API.
        code: Option<String>,
    },

    /// Validation error (request validation failed).
    #[error("Validation error: {message}")]
    Validation {
        /// Error message describing the validation issue.
        message: String,
        /// Field-level errors.
        errors: Vec<FieldError>,
    },

    /// Resource not found.
    #[error("Not found: {message}")]
    NotFound {
        /// Error message.
        message: String,
        /// The type of resource that was not found.
        resource: Option<String>,
    },

    /// Rate limit exceeded.
    #[error("Rate limit exceeded: {message}")]
    RateLimit {
        /// Error message.
        message: String,
        /// Duration to wait before retrying.
        retry_after: Option<Duration>,
    },

    /// Internal server error.
    #[error("Internal server error: {message}")]
    Internal {
        /// Error message.
        message: String,
        /// Request ID for debugging.
        request_id: Option<String>,
    },

    /// Bad gateway error.
    #[error("Bad gateway: {message}")]
    BadGateway {
        /// Error message.
        message: String,
    },

    /// Service unavailable.
    #[error("Service unavailable: {message}")]
    ServiceUnavailable {
        /// Error message.
        message: String,
        /// Duration to wait before retrying.
        retry_after: Option<Duration>,
    },

    /// Gateway timeout.
    #[error("Gateway timeout: {message}")]
    GatewayTimeout {
        /// Error message.
        message: String,
    },

    /// Request timeout.
    #[error("Request timeout: {message}")]
    Timeout {
        /// Error message.
        message: String,
    },

    /// Network/connection error.
    #[error("Connection error: {message}")]
    Connection {
        /// Error message.
        message: String,
    },

    /// Streaming error.
    #[error("Stream error: {message}")]
    Stream {
        /// Error message.
        message: String,
    },

    /// Serialization/deserialization error.
    #[error("Serialization error: {message}")]
    Serialization {
        /// Error message.
        message: String,
    },

    /// Unknown error.
    #[error("Unknown error (HTTP {status}): {message}")]
    Unknown {
        /// HTTP status code.
        status: u16,
        /// Error message.
        message: String,
        /// Raw response body.
        body: Option<String>,
    },

    /// Circuit breaker open.
    #[error("Circuit breaker open: service temporarily unavailable")]
    CircuitOpen,
}

/// Field-level validation error.
#[derive(Debug, Clone)]
pub struct FieldError {
    /// The field that failed validation.
    pub field: String,
    /// The validation error message.
    pub message: String,
    /// The error code.
    pub code: String,
}

impl MistralError {
    /// Returns true if this error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            MistralError::RateLimit { .. }
                | MistralError::ServiceUnavailable { .. }
                | MistralError::GatewayTimeout { .. }
                | MistralError::BadGateway { .. }
                | MistralError::Internal { .. }
                | MistralError::Timeout { .. }
                | MistralError::Connection { .. }
        )
    }

    /// Returns the retry-after duration if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            MistralError::RateLimit { retry_after, .. } => *retry_after,
            MistralError::ServiceUnavailable { retry_after, .. } => *retry_after,
            _ => None,
        }
    }

    /// Returns true if this error should trigger the circuit breaker.
    pub fn should_circuit_break(&self) -> bool {
        matches!(
            self,
            MistralError::ServiceUnavailable { .. }
                | MistralError::Internal { .. }
                | MistralError::BadGateway { .. }
                | MistralError::GatewayTimeout { .. }
        )
    }

    /// Creates a validation error from field errors.
    pub fn validation(message: impl Into<String>, errors: Vec<FieldError>) -> Self {
        MistralError::Validation {
            message: message.into(),
            errors,
        }
    }

    /// Creates a not found error.
    pub fn not_found(resource: impl Into<String>, id: impl Into<String>) -> Self {
        let resource = resource.into();
        let id = id.into();
        MistralError::NotFound {
            message: format!("{} '{}' not found", resource, id),
            resource: Some(resource),
        }
    }
}

/// API error response from Mistral.
#[derive(Debug, serde::Deserialize)]
pub struct ApiErrorResponse {
    /// The error details.
    pub error: ApiErrorDetail,
}

/// Detailed API error information.
#[derive(Debug, serde::Deserialize)]
pub struct ApiErrorDetail {
    /// The error type.
    #[serde(rename = "type")]
    pub error_type: Option<String>,
    /// The error message.
    pub message: String,
    /// The parameter that caused the error.
    pub param: Option<String>,
    /// The error code.
    pub code: Option<String>,
}

impl From<reqwest::Error> for MistralError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            MistralError::Timeout {
                message: err.to_string(),
            }
        } else if err.is_connect() {
            MistralError::Connection {
                message: err.to_string(),
            }
        } else {
            MistralError::Unknown {
                status: err.status().map(|s| s.as_u16()).unwrap_or(0),
                message: err.to_string(),
                body: None,
            }
        }
    }
}

impl From<serde_json::Error> for MistralError {
    fn from(err: serde_json::Error) -> Self {
        MistralError::Serialization {
            message: err.to_string(),
        }
    }
}

impl From<url::ParseError> for MistralError {
    fn from(err: url::ParseError) -> Self {
        MistralError::Configuration {
            message: format!("Invalid URL: {}", err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_is_retryable() {
        assert!(MistralError::RateLimit {
            message: "test".to_string(),
            retry_after: None
        }
        .is_retryable());

        assert!(MistralError::ServiceUnavailable {
            message: "test".to_string(),
            retry_after: None
        }
        .is_retryable());

        assert!(!MistralError::Authentication {
            message: "test".to_string()
        }
        .is_retryable());

        assert!(!MistralError::BadRequest {
            message: "test".to_string(),
            error_type: None,
            param: None,
            code: None
        }
        .is_retryable());
    }

    #[test]
    fn test_error_retry_after() {
        let error = MistralError::RateLimit {
            message: "test".to_string(),
            retry_after: Some(Duration::from_secs(30)),
        };

        assert_eq!(error.retry_after(), Some(Duration::from_secs(30)));
    }

    #[test]
    fn test_not_found_helper() {
        let error = MistralError::not_found("File", "file-123");

        if let MistralError::NotFound { message, resource } = error {
            assert!(message.contains("File"));
            assert!(message.contains("file-123"));
            assert_eq!(resource, Some("File".to_string()));
        } else {
            panic!("Expected NotFound error");
        }
    }
}
