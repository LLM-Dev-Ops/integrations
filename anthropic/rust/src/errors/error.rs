//! Error types for the Anthropic API client.

use crate::errors::categories::ValidationDetail;
use std::time::Duration;
use thiserror::Error;

/// Result type alias for Anthropic operations
pub type AnthropicResult<T> = Result<T, AnthropicError>;

/// Main error type for the Anthropic API client.
///
/// This enum covers all possible error scenarios with rich context for debugging
/// and proper retry handling.
#[derive(Error, Debug, Clone)]
pub enum AnthropicError {
    /// Configuration error (invalid settings, missing required fields)
    #[error("Configuration error: {message}")]
    Configuration {
        /// Error message describing the configuration issue
        message: String,
    },

    /// Authentication error (invalid API key, missing credentials)
    #[error("Authentication error: {message}")]
    Authentication {
        /// Error message describing the authentication issue
        message: String,
    },

    /// Validation error (invalid request parameters, constraints violated)
    #[error("Validation error: {message}")]
    Validation {
        /// Error message describing the validation issue
        message: String,
        /// List of specific validation failures
        details: Vec<ValidationDetail>,
    },

    /// Rate limit error (too many requests, quota exceeded)
    #[error("Rate limit error: {message}")]
    RateLimit {
        /// Error message describing the rate limit issue
        message: String,
        /// Duration to wait before retrying (if provided by API)
        retry_after: Option<Duration>,
    },

    /// Network error (connection failed, timeout, DNS issues)
    #[error("Network error: {message}")]
    Network {
        /// Error message describing the network issue
        message: String,
    },

    /// Server error (5xx responses from Anthropic API)
    #[error("Server error: {message}")]
    Server {
        /// Error message from the server
        message: String,
        /// HTTP status code
        status_code: Option<u16>,
    },

    /// Resource not found error
    #[error("Not found: {resource_type} {message}")]
    NotFound {
        /// Error message
        message: String,
        /// Type of resource that was not found
        resource_type: String,
    },

    /// Streaming error (SSE parsing failures, stream interruption)
    #[error("Stream error: {message}")]
    StreamError {
        /// Error message describing the stream issue
        message: String,
    },

    /// Internal error (unexpected conditions, library bugs)
    #[error("Internal error: {message}")]
    Internal {
        /// Error message describing the internal issue
        message: String,
    },
}

impl AnthropicError {
    /// Returns true if this error is retryable with exponential backoff.
    ///
    /// Retryable errors include:
    /// - Rate limit errors (429)
    /// - Network errors (connection issues, timeouts)
    /// - Server errors (500, 503, 529)
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            AnthropicError::RateLimit { .. }
                | AnthropicError::Network { .. }
                | AnthropicError::Server {
                    status_code: Some(500) | Some(503) | Some(529),
                    ..
                }
        )
    }

    /// Returns the retry-after duration if available.
    ///
    /// This is typically set in rate limit errors when the API provides
    /// a Retry-After header.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            AnthropicError::RateLimit { retry_after, .. } => *retry_after,
            _ => None,
        }
    }
}

// Conversions from common error types
impl From<reqwest::Error> for AnthropicError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            AnthropicError::Network {
                message: format!("Request timed out: {}", err),
            }
        } else if err.is_connect() {
            AnthropicError::Network {
                message: format!("Connection failed: {}", err),
            }
        } else {
            AnthropicError::Network {
                message: format!("Network error: {}", err),
            }
        }
    }
}

impl From<serde_json::Error> for AnthropicError {
    fn from(err: serde_json::Error) -> Self {
        AnthropicError::Internal {
            message: format!("JSON serialization/deserialization error: {}", err),
        }
    }
}

impl From<url::ParseError> for AnthropicError {
    fn from(err: url::ParseError) -> Self {
        AnthropicError::Configuration {
            message: format!("Invalid URL: {}", err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_is_retryable() {
        let rate_limit_error = AnthropicError::RateLimit {
            message: "Too many requests".to_string(),
            retry_after: Some(Duration::from_secs(30)),
        };
        assert!(rate_limit_error.is_retryable());

        let auth_error = AnthropicError::Authentication {
            message: "Invalid API key".to_string(),
        };
        assert!(!auth_error.is_retryable());

        let server_error = AnthropicError::Server {
            message: "Service unavailable".to_string(),
            status_code: Some(503),
        };
        assert!(server_error.is_retryable());
    }

    #[test]
    fn test_retry_after() {
        let rate_limit = AnthropicError::RateLimit {
            message: "Too many requests".to_string(),
            retry_after: Some(Duration::from_secs(30)),
        };
        assert_eq!(rate_limit.retry_after(), Some(Duration::from_secs(30)));

        let network_error = AnthropicError::Network {
            message: "Connection failed".to_string(),
        };
        assert_eq!(network_error.retry_after(), None);
    }
}
