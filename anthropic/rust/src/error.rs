//! Error types for the Anthropic integration

use thiserror::Error;

/// Main error type for the Anthropic integration
#[derive(Debug, Error)]
pub enum AnthropicError {
    /// Configuration error
    #[error("Configuration error: {0}")]
    Configuration(String),

    /// Validation error
    #[error("Validation error: {0}")]
    Validation(#[from] ValidationError),

    /// Authentication error
    #[error("Authentication error: {0}")]
    Authentication(String),

    /// API error from Anthropic
    #[error("API error: {status} - {message}")]
    Api {
        status: u16,
        message: String,
        error_type: String,
    },

    /// Network error
    #[error("Network error: {0}")]
    Network(String),

    /// Timeout error
    #[error("Request timeout")]
    Timeout,

    /// Rate limit error
    #[error("Rate limit exceeded: {0}")]
    RateLimit(String),

    /// Serialization/deserialization error
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Stream error
    #[error("Stream error: {0}")]
    Stream(String),

    /// Internal error
    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<reqwest::Error> for AnthropicError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            AnthropicError::Timeout
        } else if err.is_connect() || err.is_request() {
            AnthropicError::Network(err.to_string())
        } else {
            AnthropicError::Internal(err.to_string())
        }
    }
}

impl From<serde_json::Error> for AnthropicError {
    fn from(err: serde_json::Error) -> Self {
        AnthropicError::Serialization(err.to_string())
    }
}

impl From<url::ParseError> for AnthropicError {
    fn from(err: url::ParseError) -> Self {
        AnthropicError::Configuration(format!("Invalid URL: {}", err))
    }
}

/// Validation error types
#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("Field '{field}' is required")]
    Required { field: String },

    #[error("Field '{field}' is invalid: {reason}")]
    Invalid { field: String, reason: String },

    #[error("Value out of range for '{field}': {reason}")]
    OutOfRange { field: String, reason: String },

    #[error("Invalid message format: {0}")]
    InvalidMessageFormat(String),

    #[error("Invalid tool definition: {0}")]
    InvalidTool(String),
}

/// API error response from Anthropic
#[derive(Debug, serde::Deserialize)]
pub struct ApiErrorResponse {
    #[serde(rename = "type")]
    pub error_type: String,
    pub error: ApiErrorDetail,
}

#[derive(Debug, serde::Deserialize)]
pub struct ApiErrorDetail {
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
}

/// Stream error types
#[derive(Debug, Error)]
pub enum StreamError {
    #[error("Stream parsing error: {0}")]
    Parse(String),

    #[error("Stream connection closed")]
    ConnectionClosed,

    #[error("Invalid event: {0}")]
    InvalidEvent(String),
}
