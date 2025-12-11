//! Error category types for granular error handling.

use std::time::Duration;
use thiserror::Error;

/// Configuration-related errors.
#[derive(Error, Debug, Clone)]
pub enum ConfigurationError {
    #[error("Missing API key")]
    MissingApiKey,

    #[error("Invalid base URL: {url}")]
    InvalidBaseUrl { url: String },

    #[error("Invalid configuration: {message}")]
    InvalidConfiguration { message: String },
}

/// Authentication-related errors.
#[derive(Error, Debug, Clone)]
pub enum AuthenticationError {
    #[error("Invalid API key")]
    InvalidApiKey,

    #[error("API key has expired")]
    ExpiredApiKey,

    #[error("Quota exceeded for API key")]
    QuotaExceeded,
}

/// Request validation errors.
#[derive(Error, Debug, Clone)]
pub enum RequestError {
    #[error("Validation error: {message}")]
    ValidationError { message: String, details: Vec<ValidationDetail> },

    #[error("Invalid model: {model}")]
    InvalidModel { model: String },

    #[error("Invalid parameter: {parameter} - {message}")]
    InvalidParameter { parameter: String, message: String },

    #[error("Payload too large: {size} bytes (max: {max_size})")]
    PayloadTooLarge { size: usize, max_size: usize },

    #[error("Unsupported media type: {mime_type}")]
    UnsupportedMediaType { mime_type: String },
}

/// Validation detail for field-level errors.
#[derive(Debug, Clone)]
pub struct ValidationDetail {
    pub field: String,
    pub description: String,
}

/// Rate limiting errors.
#[derive(Error, Debug, Clone)]
pub enum RateLimitError {
    #[error("Too many requests")]
    TooManyRequests { retry_after: Option<Duration> },

    #[error("Token limit exceeded")]
    TokenLimitExceeded,

    #[error("Quota exceeded")]
    QuotaExceeded { retry_after: Option<Duration> },
}

impl RateLimitError {
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            RateLimitError::TooManyRequests { retry_after } => *retry_after,
            RateLimitError::QuotaExceeded { retry_after } => *retry_after,
            _ => None,
        }
    }
}

/// Network-related errors.
#[derive(Error, Debug, Clone)]
pub enum NetworkError {
    #[error("Connection failed: {message}")]
    ConnectionFailed { message: String },

    #[error("Request timed out after {duration:?}")]
    Timeout { duration: Duration },

    #[error("DNS resolution failed: {host}")]
    DnsResolutionFailed { host: String },

    #[error("TLS error: {message}")]
    TlsError { message: String },
}

/// Server-side errors.
#[derive(Error, Debug, Clone)]
pub enum ServerError {
    #[error("Internal server error: {message}")]
    InternalError { message: String },

    #[error("Service unavailable")]
    ServiceUnavailable { retry_after: Option<Duration> },

    #[error("Model overloaded: {model}")]
    ModelOverloaded { model: String },
}

/// Response parsing errors.
#[derive(Error, Debug, Clone)]
pub enum ResponseError {
    #[error("Failed to deserialize response: {message}")]
    DeserializationError { message: String },

    #[error("Unexpected response format: {message}")]
    UnexpectedFormat { message: String },

    #[error("Stream interrupted: {message}")]
    StreamInterrupted { message: String },

    #[error("Malformed chunk: {message}")]
    MalformedChunk { message: String },
}

/// Content safety errors.
#[derive(Error, Debug, Clone)]
pub enum ContentError {
    #[error("Content blocked due to safety: {reason:?}")]
    SafetyBlocked {
        reason: String,
        safety_ratings: Vec<SafetyRatingInfo>,
    },

    #[error("Content blocked due to recitation")]
    RecitationBlocked {
        safety_ratings: Vec<SafetyRatingInfo>,
    },

    #[error("Prohibited content detected")]
    ProhibitedContent,

    #[error("Unsupported content type: {mime_type}")]
    UnsupportedContent { mime_type: String },
}

/// Information about a safety rating for error reporting.
#[derive(Debug, Clone)]
pub struct SafetyRatingInfo {
    pub category: String,
    pub probability: String,
}

/// Resource-related errors.
#[derive(Error, Debug, Clone)]
pub enum ResourceError {
    #[error("File not found: {file_name}")]
    FileNotFound { file_name: String },

    #[error("File processing failed: {file_name} - {message}")]
    FileProcessingFailed { file_name: String, message: String },

    #[error("Cached content not found: {name}")]
    CachedContentNotFound { name: String },

    #[error("Model not found: {model}")]
    ModelNotFound { model: String },
}
