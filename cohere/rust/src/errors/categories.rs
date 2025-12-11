//! Error categories and validation details for the Cohere API client.

use serde::{Deserialize, Serialize};

/// Detailed information about a validation failure.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ValidationDetail {
    /// The field that failed validation
    pub field: String,
    /// The error message for this field
    pub message: String,
    /// The invalid value (if available and safe to include)
    pub value: Option<String>,
}

impl ValidationDetail {
    /// Create a new validation detail
    pub fn new(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            field: field.into(),
            message: message.into(),
            value: None,
        }
    }

    /// Create a new validation detail with a value
    pub fn with_value(
        field: impl Into<String>,
        message: impl Into<String>,
        value: impl Into<String>,
    ) -> Self {
        Self {
            field: field.into(),
            message: message.into(),
            value: Some(value.into()),
        }
    }
}

/// Error category for classification and handling.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ErrorCategory {
    /// Client configuration errors
    Configuration,
    /// Authentication failures
    Authentication,
    /// Request validation errors
    Validation,
    /// Rate limiting
    RateLimit,
    /// Network connectivity issues
    Network,
    /// Server-side errors
    Server,
    /// Resource not found
    NotFound,
    /// Streaming errors
    Streaming,
    /// Internal library errors
    Internal,
}

impl ErrorCategory {
    /// Check if errors in this category are retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            ErrorCategory::RateLimit | ErrorCategory::Network | ErrorCategory::Server
        )
    }

    /// Get a human-readable description of this category
    pub fn description(&self) -> &'static str {
        match self {
            ErrorCategory::Configuration => "Configuration error",
            ErrorCategory::Authentication => "Authentication error",
            ErrorCategory::Validation => "Validation error",
            ErrorCategory::RateLimit => "Rate limit exceeded",
            ErrorCategory::Network => "Network error",
            ErrorCategory::Server => "Server error",
            ErrorCategory::NotFound => "Resource not found",
            ErrorCategory::Streaming => "Streaming error",
            ErrorCategory::Internal => "Internal error",
        }
    }
}

/// API error response structure from Cohere
#[derive(Debug, Clone, Deserialize)]
pub struct ApiErrorResponse {
    /// Error message
    pub message: String,
    /// Error code (optional)
    #[serde(default)]
    pub code: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_detail() {
        let detail = ValidationDetail::new("model", "Model is required");
        assert_eq!(detail.field, "model");
        assert_eq!(detail.message, "Model is required");
        assert!(detail.value.is_none());

        let detail_with_value = ValidationDetail::with_value(
            "max_tokens",
            "Must be between 1 and 4096",
            "10000",
        );
        assert_eq!(detail_with_value.field, "max_tokens");
        assert_eq!(detail_with_value.value, Some("10000".to_string()));
    }

    #[test]
    fn test_error_category_retryable() {
        assert!(ErrorCategory::RateLimit.is_retryable());
        assert!(ErrorCategory::Network.is_retryable());
        assert!(ErrorCategory::Server.is_retryable());
        assert!(!ErrorCategory::Authentication.is_retryable());
        assert!(!ErrorCategory::Validation.is_retryable());
    }

    #[test]
    fn test_api_error_response_deserialize() {
        let json = r#"{"message": "Invalid API key", "code": "invalid_api_key"}"#;
        let error: ApiErrorResponse = serde_json::from_str(json).unwrap();
        assert_eq!(error.message, "Invalid API key");
        assert_eq!(error.code, Some("invalid_api_key".to_string()));
    }
}
