use std::fmt;
use thiserror::Error;

#[derive(Error, Debug, Clone)]
pub enum ConfigurationError {
    #[error("Missing API key: {0}")]
    MissingApiKey(String),

    #[error("Invalid API key format: {0}")]
    InvalidApiKeyFormat(String),

    #[error("Invalid base URL: {0}")]
    InvalidBaseUrl(String),

    #[error("Invalid timeout: {0}")]
    InvalidTimeout(String),

    #[error("Invalid retry configuration: {0}")]
    InvalidRetryConfig(String),

    #[error("Missing required configuration: {0}")]
    MissingConfiguration(String),
}

#[derive(Error, Debug, Clone)]
pub enum AuthenticationError {
    #[error("Invalid API key: {0}")]
    InvalidApiKey(String),

    #[error("Expired API key: {0}")]
    ExpiredApiKey(String),

    #[error("Insufficient permissions: {0}")]
    InsufficientPermissions(String),

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Invalid organization ID: {0}")]
    InvalidOrganizationId(String),

    #[error("Invalid project ID: {0}")]
    InvalidProjectId(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),
}

#[derive(Error, Debug, Clone)]
pub enum ValidationError {
    #[error("Invalid parameter: {parameter} - {reason}")]
    InvalidParameter { parameter: String, reason: String },

    #[error("Missing required field: {0}")]
    MissingRequiredField(String),

    #[error("Invalid model: {0}")]
    InvalidModel(String),

    #[error("Invalid messages: {0}")]
    InvalidMessages(String),

    #[error("Invalid parameters: {0}")]
    InvalidParameters(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Value out of range: {field} must be between {min} and {max}, got {value}")]
    ValueOutOfRange {
        field: String,
        min: String,
        max: String,
        value: String,
    },

    #[error("Invalid file format: expected {expected}, got {actual}")]
    InvalidFileFormat { expected: String, actual: String },

    #[error("File too large: max size is {max_size} bytes, got {actual_size} bytes")]
    FileTooLarge { max_size: u64, actual_size: u64 },
}

#[derive(Error, Debug, Clone)]
pub enum RateLimitError {
    #[error("Rate limit exceeded: {message}")]
    RateLimitExceeded {
        message: String,
    },

    #[error("Quota exceeded: {0}")]
    QuotaExceeded(String),

    #[error("Too many requests: {message}")]
    TooManyRequests {
        message: String,
        retry_after_secs: Option<u64>,
    },

    #[error("Token limit exceeded: {0}")]
    TokenLimitExceeded(String),
}

impl RateLimitError {
    pub fn retry_after(&self) -> Option<u64> {
        match self {
            RateLimitError::TooManyRequests { retry_after_secs, .. } => *retry_after_secs,
            _ => None,
        }
    }
}

#[derive(Error, Debug, Clone)]
pub enum NetworkError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Request failed: {0}")]
    RequestFailed(String),

    #[error("Connection timeout: {0}")]
    ConnectionTimeout(String),

    #[error("DNS resolution failed: {0}")]
    DnsResolution(String),

    #[error("TLS error: {0}")]
    TlsError(String),

    #[error("SSL/TLS error: {0}")]
    SslError(String),

    #[error("Proxy error: {0}")]
    ProxyError(String),
}

#[derive(Error, Debug, Clone)]
pub enum ServerError {
    #[error("Internal server error: {0}")]
    InternalError(String),

    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),

    #[error("Bad gateway: {0}")]
    BadGateway(String),

    #[error("Gateway timeout: {0}")]
    GatewayTimeout(String),

    #[error("Server overloaded: {0}")]
    Overloaded(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limit_retry_after() {
        let error = RateLimitError::TooManyRequests {
            message: "Rate limit exceeded".to_string(),
            retry_after_secs: Some(30),
        };
        assert_eq!(error.retry_after(), Some(30));

        let error_no_retry = RateLimitError::TooManyRequests {
            message: "Rate limit exceeded".to_string(),
            retry_after_secs: None,
        };
        assert_eq!(error_no_retry.retry_after(), None);
    }

    #[test]
    fn test_validation_error_display() {
        let error = ValidationError::InvalidParameter {
            parameter: "temperature".to_string(),
            reason: "must be between 0 and 2".to_string(),
        };
        assert!(error.to_string().contains("temperature"));
    }
}
