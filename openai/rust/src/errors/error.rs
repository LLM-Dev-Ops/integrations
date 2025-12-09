use crate::errors::categories::{
    AuthenticationError, ConfigurationError, NetworkError, RateLimitError, ServerError,
    ValidationError,
};
use std::fmt;
use thiserror::Error;

pub type OpenAIResult<T> = Result<T, OpenAIError>;

#[derive(Error, Debug)]
pub enum OpenAIError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Validation error: {0}")]
    Validation(#[from] ValidationError),

    #[error("Rate limit error: {0}")]
    RateLimit(#[from] RateLimitError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Request error: {status_code} - {message}")]
    Request {
        status_code: u16,
        message: String,
        error_type: Option<String>,
        error_code: Option<String>,
    },

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Deserialization error: {0}")]
    Deserialization(String),

    #[error("Timeout error: operation timed out after {timeout_ms}ms")]
    Timeout { timeout_ms: u64 },

    #[error("Stream error: {0}")]
    Stream(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl OpenAIError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            OpenAIError::RateLimit(_)
                | OpenAIError::Network(_)
                | OpenAIError::Server(ServerError::ServiceUnavailable(_))
                | OpenAIError::Server(ServerError::InternalError(_))
                | OpenAIError::Timeout { .. }
        )
    }

    pub fn is_authentication_error(&self) -> bool {
        matches!(self, OpenAIError::Authentication(_))
    }

    pub fn is_rate_limit_error(&self) -> bool {
        matches!(self, OpenAIError::RateLimit(_))
    }

    pub fn error_code(&self) -> Option<&str> {
        match self {
            OpenAIError::Request { error_code, .. } => error_code.as_deref(),
            _ => None,
        }
    }

    pub fn status_code(&self) -> Option<u16> {
        match self {
            OpenAIError::Request { status_code, .. } => Some(*status_code),
            OpenAIError::Authentication(_) => Some(401),
            OpenAIError::RateLimit(_) => Some(429),
            OpenAIError::Server(ServerError::InternalError(_)) => Some(500),
            OpenAIError::Server(ServerError::ServiceUnavailable(_)) => Some(503),
            _ => None,
        }
    }
}

impl From<reqwest::Error> for OpenAIError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            OpenAIError::Timeout {
                timeout_ms: err
                    .url()
                    .and_then(|_| Some(60000))
                    .unwrap_or(60000),
            }
        } else if err.is_connect() {
            OpenAIError::Network(NetworkError::ConnectionFailed(err.to_string()))
        } else {
            OpenAIError::Network(NetworkError::RequestFailed(err.to_string()))
        }
    }
}

impl From<serde_json::Error> for OpenAIError {
    fn from(err: serde_json::Error) -> Self {
        if err.is_data() {
            OpenAIError::Deserialization(err.to_string())
        } else {
            OpenAIError::Serialization(err.to_string())
        }
    }
}

impl From<url::ParseError> for OpenAIError {
    fn from(err: url::ParseError) -> Self {
        OpenAIError::Configuration(ConfigurationError::InvalidBaseUrl(err.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_is_retryable() {
        let rate_limit_error =
            OpenAIError::RateLimit(RateLimitError::QuotaExceeded("test".to_string()));
        assert!(rate_limit_error.is_retryable());

        let auth_error =
            OpenAIError::Authentication(AuthenticationError::InvalidApiKey("test".to_string()));
        assert!(!auth_error.is_retryable());
    }

    #[test]
    fn test_error_status_code() {
        let request_error = OpenAIError::Request {
            status_code: 404,
            message: "Not found".to_string(),
            error_type: None,
            error_code: None,
        };
        assert_eq!(request_error.status_code(), Some(404));
    }
}
