//! Error types for the Groq client.
//!
//! Provides a comprehensive error taxonomy covering all possible failure modes
//! including API errors, network errors, validation errors, and Groq-specific errors.

use std::time::Duration;
use thiserror::Error;

/// Result type alias for Groq operations.
pub type GroqResult<T> = Result<T, GroqError>;

/// Comprehensive error type for Groq client operations.
#[derive(Debug, Error)]
pub enum GroqError {
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
        /// Hint about the API key (last 4 chars).
        api_key_hint: Option<String>,
    },

    /// Authorization error (insufficient permissions).
    #[error("Authorization failed: {message}")]
    Authorization {
        /// Error message describing the authorization issue.
        message: String,
        /// Required permission.
        required_permission: Option<String>,
    },

    /// Validation error (request validation failed).
    #[error("Validation error: {message}")]
    Validation {
        /// Error message describing the validation issue.
        message: String,
        /// The parameter that caused the error.
        param: Option<String>,
        /// The invalid value.
        value: Option<String>,
    },

    /// Model error (model not found or unavailable).
    #[error("Model error: {message}")]
    Model {
        /// Error message.
        message: String,
        /// The model ID that caused the error.
        model: String,
        /// Available models.
        available_models: Option<Vec<String>>,
    },

    /// Context length exceeded.
    #[error("Context length exceeded: {message}")]
    ContextLength {
        /// Error message.
        message: String,
        /// Maximum context length.
        max_context: u32,
        /// Requested context length.
        requested: u32,
    },

    /// Content filter triggered.
    #[error("Content filter triggered: {message}")]
    ContentFilter {
        /// Error message.
        message: String,
        /// Filtered categories.
        filtered_categories: Vec<String>,
    },

    /// Rate limit exceeded.
    #[error("Rate limit exceeded: {message}")]
    RateLimit {
        /// Error message.
        message: String,
        /// Duration to wait before retrying.
        retry_after: Option<Duration>,
        /// Type of rate limit (requests, tokens).
        limit_type: RateLimitType,
    },

    /// Server error (5xx status codes).
    #[error("Server error (HTTP {status_code}): {message}")]
    Server {
        /// Error message.
        message: String,
        /// HTTP status code.
        status_code: u16,
        /// Request ID for debugging.
        request_id: Option<String>,
    },

    /// Network/connection error.
    #[error("Network error: {message}")]
    Network {
        /// Error message.
        message: String,
        /// Underlying cause.
        cause: Option<String>,
    },

    /// Timeout error.
    #[error("Request timeout: {message}")]
    Timeout {
        /// Error message.
        message: String,
    },

    /// Streaming error.
    #[error("Stream error: {message}")]
    Stream {
        /// Error message.
        message: String,
        /// Partial content received before error.
        partial_content: Option<String>,
    },

    /// Serialization/deserialization error.
    #[error("Serialization error: {message}")]
    Serialization {
        /// Error message.
        message: String,
    },

    /// Circuit breaker open.
    #[error("Circuit breaker open: service temporarily unavailable")]
    CircuitOpen,

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
}

/// Type of rate limit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RateLimitType {
    /// Request-based rate limit.
    Requests,
    /// Token-based rate limit.
    Tokens,
}

impl GroqError {
    /// Returns true if this error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GroqError::RateLimit { .. }
                | GroqError::Server { status_code: 500..=504, .. }
                | GroqError::Timeout { .. }
                | GroqError::Network { .. }
                | GroqError::CircuitOpen
        )
    }

    /// Returns the retry-after duration if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GroqError::RateLimit { retry_after, .. } => *retry_after,
            _ => None,
        }
    }

    /// Returns true if this error should trigger the circuit breaker.
    pub fn should_circuit_break(&self) -> bool {
        matches!(
            self,
            GroqError::Server { status_code: 500..=504, .. }
                | GroqError::Timeout { .. }
        )
    }

    /// Creates a validation error.
    pub fn validation(message: impl Into<String>) -> Self {
        GroqError::Validation {
            message: message.into(),
            param: None,
            value: None,
        }
    }

    /// Creates a validation error with parameter.
    pub fn validation_param(
        message: impl Into<String>,
        param: impl Into<String>,
        value: Option<String>,
    ) -> Self {
        GroqError::Validation {
            message: message.into(),
            param: Some(param.into()),
            value,
        }
    }

    /// Creates an authentication error.
    pub fn authentication(message: impl Into<String>) -> Self {
        GroqError::Authentication {
            message: message.into(),
            api_key_hint: None,
        }
    }

    /// Creates a model not found error.
    pub fn model_not_found(model: impl Into<String>) -> Self {
        let model = model.into();
        GroqError::Model {
            message: format!("Model '{}' not found", model),
            model,
            available_models: None,
        }
    }

    /// Creates a server error.
    pub fn server(status_code: u16, message: impl Into<String>) -> Self {
        GroqError::Server {
            message: message.into(),
            status_code,
            request_id: None,
        }
    }
}

/// API error response from Groq.
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

impl From<reqwest::Error> for GroqError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            GroqError::Timeout {
                message: err.to_string(),
            }
        } else if err.is_connect() {
            GroqError::Network {
                message: err.to_string(),
                cause: None,
            }
        } else {
            GroqError::Unknown {
                status: err.status().map(|s| s.as_u16()).unwrap_or(0),
                message: err.to_string(),
                body: None,
            }
        }
    }
}

impl From<serde_json::Error> for GroqError {
    fn from(err: serde_json::Error) -> Self {
        GroqError::Serialization {
            message: err.to_string(),
        }
    }
}

impl From<url::ParseError> for GroqError {
    fn from(err: url::ParseError) -> Self {
        GroqError::Configuration {
            message: format!("Invalid URL: {}", err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_is_retryable() {
        assert!(GroqError::RateLimit {
            message: "test".to_string(),
            retry_after: None,
            limit_type: RateLimitType::Requests,
        }
        .is_retryable());

        assert!(GroqError::Server {
            message: "test".to_string(),
            status_code: 503,
            request_id: None,
        }
        .is_retryable());

        assert!(!GroqError::Authentication {
            message: "test".to_string(),
            api_key_hint: None,
        }
        .is_retryable());

        assert!(!GroqError::Validation {
            message: "test".to_string(),
            param: None,
            value: None,
        }
        .is_retryable());
    }

    #[test]
    fn test_error_retry_after() {
        let error = GroqError::RateLimit {
            message: "test".to_string(),
            retry_after: Some(Duration::from_secs(30)),
            limit_type: RateLimitType::Requests,
        };

        assert_eq!(error.retry_after(), Some(Duration::from_secs(30)));
    }

    #[test]
    fn test_should_circuit_break() {
        assert!(GroqError::Server {
            message: "test".to_string(),
            status_code: 500,
            request_id: None,
        }
        .should_circuit_break());

        assert!(GroqError::Timeout {
            message: "test".to_string()
        }
        .should_circuit_break());

        assert!(!GroqError::RateLimit {
            message: "test".to_string(),
            retry_after: None,
            limit_type: RateLimitType::Requests,
        }
        .should_circuit_break());
    }

    #[test]
    fn test_model_not_found_helper() {
        let error = GroqError::model_not_found("llama-unknown");

        if let GroqError::Model { message, model, .. } = error {
            assert!(message.contains("llama-unknown"));
            assert_eq!(model, "llama-unknown");
        } else {
            panic!("Expected Model error");
        }
    }
}
