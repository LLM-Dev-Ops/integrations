//! Main error type for the Gemini API client.

use std::time::Duration;
use thiserror::Error;
use super::categories::*;

/// Result type alias for Gemini operations.
pub type GeminiResult<T> = Result<T, GeminiError>;

/// Top-level error type for the Gemini integration.
#[derive(Error, Debug, Clone)]
pub enum GeminiError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Rate limit error: {0}")]
    RateLimit(#[from] RateLimitError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    #[error("Content error: {0}")]
    Content(#[from] ContentError),

    #[error("Resource error: {0}")]
    Resource(#[from] ResourceError),
}

impl GeminiError {
    /// Returns true if this error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GeminiError::RateLimit(_)
                | GeminiError::Network(NetworkError::Timeout { .. })
                | GeminiError::Network(NetworkError::ConnectionFailed { .. })
                | GeminiError::Server(ServerError::ServiceUnavailable { .. })
                | GeminiError::Server(ServerError::ModelOverloaded { .. })
        )
    }

    /// Returns the retry-after duration if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GeminiError::RateLimit(e) => e.retry_after(),
            GeminiError::Server(ServerError::ServiceUnavailable { retry_after }) => *retry_after,
            _ => None,
        }
    }
}

// Implement From for common error types
impl From<reqwest::Error> for GeminiError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            GeminiError::Network(NetworkError::Timeout {
                duration: Duration::from_secs(0), // Unknown actual duration
            })
        } else if err.is_connect() {
            GeminiError::Network(NetworkError::ConnectionFailed {
                message: err.to_string(),
            })
        } else {
            GeminiError::Network(NetworkError::ConnectionFailed {
                message: err.to_string(),
            })
        }
    }
}

impl From<serde_json::Error> for GeminiError {
    fn from(err: serde_json::Error) -> Self {
        GeminiError::Response(ResponseError::DeserializationError {
            message: err.to_string(),
        })
    }
}

impl From<url::ParseError> for GeminiError {
    fn from(err: url::ParseError) -> Self {
        GeminiError::Configuration(ConfigurationError::InvalidBaseUrl {
            url: err.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_is_retryable() {
        let rate_limit = GeminiError::RateLimit(RateLimitError::TooManyRequests {
            retry_after: Some(Duration::from_secs(30)),
        });
        assert!(rate_limit.is_retryable());

        let auth_error = GeminiError::Authentication(AuthenticationError::InvalidApiKey);
        assert!(!auth_error.is_retryable());

        let server_error = GeminiError::Server(ServerError::ServiceUnavailable {
            retry_after: Some(Duration::from_secs(60)),
        });
        assert!(server_error.is_retryable());
    }

    #[test]
    fn test_retry_after() {
        let rate_limit = GeminiError::RateLimit(RateLimitError::TooManyRequests {
            retry_after: Some(Duration::from_secs(30)),
        });
        assert_eq!(rate_limit.retry_after(), Some(Duration::from_secs(30)));

        let config_error = GeminiError::Configuration(ConfigurationError::MissingApiKey);
        assert_eq!(config_error.retry_after(), None);
    }
}
