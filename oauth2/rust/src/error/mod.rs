//! OAuth2 Error Types
//!
//! Comprehensive error hierarchy following SPARC specification.

use std::time::Duration;
use thiserror::Error;

/// Root error type for OAuth2 integration.
#[derive(Error, Debug)]
pub enum OAuth2Error {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    #[error("Token error: {0}")]
    Token(#[from] TokenError),

    #[error("Device flow error: {0}")]
    DeviceFlow(#[from] DeviceFlowError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Storage error: {0}")]
    Storage(#[from] StorageError),

    #[error("Protocol error: {0}")]
    Protocol(#[from] ProtocolError),

    #[error("Provider error: {0}")]
    Provider(#[from] ProviderError),
}

impl OAuth2Error {
    /// Get error code for telemetry.
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::Configuration(_) => "OAUTH2_CONFIG",
            Self::Authorization(_) => "OAUTH2_AUTH",
            Self::Token(_) => "OAUTH2_TOKEN",
            Self::DeviceFlow(_) => "OAUTH2_DEVICE",
            Self::Network(_) => "OAUTH2_NETWORK",
            Self::Storage(_) => "OAUTH2_STORAGE",
            Self::Protocol(_) => "OAUTH2_PROTOCOL",
            Self::Provider(_) => "OAUTH2_PROVIDER",
        }
    }

    /// Check if error is retryable.
    pub fn is_retryable(&self) -> bool {
        match self {
            Self::Network(e) => e.is_retryable(),
            Self::DeviceFlow(DeviceFlowError::AuthorizationPending) => true,
            Self::DeviceFlow(DeviceFlowError::SlowDown { .. }) => true,
            Self::Provider(ProviderError::ServerError { .. }) => true,
            Self::Provider(ProviderError::TemporarilyUnavailable { .. }) => true,
            _ => false,
        }
    }

    /// Get retry-after duration if applicable.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            Self::DeviceFlow(DeviceFlowError::SlowDown { interval }) => {
                Some(Duration::from_secs(*interval as u64))
            }
            Self::Provider(ProviderError::TemporarilyUnavailable { retry_after }) => *retry_after,
            Self::Network(NetworkError::RateLimited { retry_after }) => {
                Some(Duration::from_secs(*retry_after as u64))
            }
            _ => None,
        }
    }

    /// Check if error requires re-authentication.
    pub fn needs_reauth(&self) -> bool {
        match self {
            Self::Token(TokenError::Expired) => true,
            Self::Token(TokenError::NoRefreshToken) => true,
            Self::Token(TokenError::RefreshFailed { .. }) => true,
            Self::Provider(ProviderError::InvalidGrant { .. }) => true,
            Self::Authorization(AuthorizationError::AccessDenied { .. }) => true,
            _ => false,
        }
    }
}

/// Configuration error.
#[derive(Error, Debug)]
pub enum ConfigurationError {
    #[error("Invalid configuration: {message}")]
    InvalidConfig { message: String },

    #[error("Missing required field: {field}")]
    MissingRequired { field: String },

    #[error("Invalid endpoint URL: {url}")]
    InvalidEndpoint { url: String },

    #[error("Discovery failed: {message}")]
    DiscoveryFailed { message: String },
}

/// Authorization flow error.
#[derive(Error, Debug)]
pub enum AuthorizationError {
    #[error("Access denied by user")]
    AccessDenied {
        error_description: Option<String>,
        error_uri: Option<String>,
    },

    #[error("Invalid scope: {scope}")]
    InvalidScope {
        scope: String,
        error_uri: Option<String>,
    },

    #[error("Unauthorized client")]
    UnauthorizedClient { error_description: Option<String> },

    #[error("State parameter mismatch (possible CSRF attack)")]
    StateMismatch { expected: String, received: String },

    #[error("State parameter expired")]
    StateExpired { state: String },

    #[error("Invalid request: {message}")]
    InvalidRequest {
        message: String,
        error_uri: Option<String>,
    },

    #[error("Server error: {message}")]
    ServerError { message: String },

    #[error("Server temporarily unavailable")]
    TemporarilyUnavailable { retry_after: Option<Duration> },
}

/// Token-related error.
#[derive(Error, Debug)]
pub enum TokenError {
    #[error("Token not found for key: {key}")]
    NotFound { key: String },

    #[error("Token expired")]
    Expired,

    #[error("Token refresh failed: {message}")]
    RefreshFailed { message: String },

    #[error("No refresh token available")]
    NoRefreshToken,

    #[error("Invalid token format")]
    InvalidToken { message: String },

    #[error("Token storage failed: {message}")]
    StorageFailed { message: String },
}

/// Device flow error.
#[derive(Error, Debug)]
pub enum DeviceFlowError {
    #[error("Authorization pending - user has not yet completed authorization")]
    AuthorizationPending,

    #[error("Slow down - increase polling interval to {interval} seconds")]
    SlowDown { interval: u32 },

    #[error("Access denied by user")]
    AccessDenied,

    #[error("Device code expired")]
    ExpiredToken,

    #[error("Polling timeout after {elapsed:?}")]
    PollingTimeout { elapsed: Duration },
}

/// Network/transport error.
#[derive(Error, Debug)]
pub enum NetworkError {
    #[error("Connection failed: {message}")]
    ConnectionFailed { message: String },

    #[error("Request timeout after {timeout:?}")]
    Timeout { timeout: Duration },

    #[error("DNS resolution failed: {host}")]
    DnsResolutionFailed { host: String },

    #[error("TLS error: {message}")]
    TlsError { message: String },

    #[error("Rate limited, retry after {retry_after} seconds")]
    RateLimited { retry_after: u32 },

    #[error("Circuit breaker is open")]
    CircuitOpen,
}

impl NetworkError {
    /// Check if error is retryable.
    pub fn is_retryable(&self) -> bool {
        !matches!(self, Self::TlsError { .. } | Self::CircuitOpen)
    }
}

/// Protocol/response parsing error.
#[derive(Error, Debug)]
pub enum ProtocolError {
    #[error("Invalid response: {message}")]
    InvalidResponse { message: String },

    #[error("Missing required field: {field}")]
    MissingField { field: String },

    #[error("Unexpected redirect to: {location}")]
    UnexpectedRedirect { location: String },

    #[error("Response too large: {size} bytes")]
    ResponseTooLarge { size: usize },

    #[error("Invalid JSON: {message}")]
    InvalidJson { message: String },
}

/// Storage error.
#[derive(Error, Debug)]
pub enum StorageError {
    #[error("Read failed: {message}")]
    ReadFailed { message: String },

    #[error("Write failed: {message}")]
    WriteFailed { message: String },

    #[error("Delete failed: {message}")]
    DeleteFailed { message: String },

    #[error("Corrupted data: {message}")]
    CorruptedData { message: String },

    #[error("Permission denied: {path}")]
    PermissionDenied { path: String },

    #[error("Encryption failed: {message}")]
    EncryptionFailed { message: String },

    #[error("Decryption failed: {message}")]
    DecryptionFailed { message: String },
}

/// Provider (OAuth2 server) error.
#[derive(Error, Debug)]
pub enum ProviderError {
    #[error("Invalid client credentials")]
    InvalidClient { error_description: Option<String> },

    #[error("Invalid grant: {message}")]
    InvalidGrant { message: String },

    #[error("Invalid request: {message}")]
    InvalidRequest { message: String },

    #[error("Invalid scope: {scope}")]
    InvalidScope { scope: String },

    #[error("Unauthorized client for this grant type")]
    UnauthorizedClient { error_description: Option<String> },

    #[error("Unsupported grant type: {grant_type}")]
    UnsupportedGrantType { grant_type: String },

    #[error("Server error: {message}")]
    ServerError { message: String },

    #[error("Server temporarily unavailable")]
    TemporarilyUnavailable { retry_after: Option<Duration> },
}

/// Result type for OAuth2 operations.
pub type OAuth2Result<T> = Result<T, OAuth2Error>;

/// OAuth2 error response from provider.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct OAuth2ErrorResponse {
    pub error: String,
    #[serde(default)]
    pub error_description: Option<String>,
    #[serde(default)]
    pub error_uri: Option<String>,
}

/// Map authorization error response to error type.
pub fn map_authorization_error(response: &OAuth2ErrorResponse) -> AuthorizationError {
    match response.error.as_str() {
        "access_denied" => AuthorizationError::AccessDenied {
            error_description: response.error_description.clone(),
            error_uri: response.error_uri.clone(),
        },
        "invalid_scope" => AuthorizationError::InvalidScope {
            scope: response.error_description.clone().unwrap_or_default(),
            error_uri: response.error_uri.clone(),
        },
        "unauthorized_client" => AuthorizationError::UnauthorizedClient {
            error_description: response.error_description.clone(),
        },
        "server_error" => AuthorizationError::ServerError {
            message: response
                .error_description
                .clone()
                .unwrap_or_else(|| "Server error".to_string()),
        },
        "temporarily_unavailable" => AuthorizationError::TemporarilyUnavailable { retry_after: None },
        _ => AuthorizationError::InvalidRequest {
            message: response
                .error_description
                .clone()
                .unwrap_or_else(|| response.error.clone()),
            error_uri: response.error_uri.clone(),
        },
    }
}

/// Map token error response to error type.
pub fn map_token_error(response: &OAuth2ErrorResponse) -> ProviderError {
    match response.error.as_str() {
        "invalid_client" => ProviderError::InvalidClient {
            error_description: response.error_description.clone(),
        },
        "invalid_grant" => ProviderError::InvalidGrant {
            message: response
                .error_description
                .clone()
                .unwrap_or_else(|| "Invalid grant".to_string()),
        },
        "invalid_request" => ProviderError::InvalidRequest {
            message: response
                .error_description
                .clone()
                .unwrap_or_else(|| "Invalid request".to_string()),
        },
        "invalid_scope" => ProviderError::InvalidScope {
            scope: response.error_description.clone().unwrap_or_default(),
        },
        "unauthorized_client" => ProviderError::UnauthorizedClient {
            error_description: response.error_description.clone(),
        },
        "unsupported_grant_type" => ProviderError::UnsupportedGrantType {
            grant_type: response.error_description.clone().unwrap_or_default(),
        },
        "server_error" => ProviderError::ServerError {
            message: response
                .error_description
                .clone()
                .unwrap_or_else(|| "Server error".to_string()),
        },
        "temporarily_unavailable" => ProviderError::TemporarilyUnavailable { retry_after: None },
        _ => ProviderError::InvalidRequest {
            message: response
                .error_description
                .clone()
                .unwrap_or_else(|| response.error.clone()),
        },
    }
}

/// Parse error response from HTTP body.
pub fn parse_error_response(body: &str) -> Option<OAuth2ErrorResponse> {
    serde_json::from_str(body).ok()
}

/// Create error from HTTP response.
pub fn create_error_from_response(status: u16, body: &str) -> OAuth2Error {
    if let Some(response) = parse_error_response(body) {
        return OAuth2Error::Provider(map_token_error(&response));
    }

    let error = match status {
        400 => ProviderError::InvalidRequest {
            message: "Bad request".to_string(),
        },
        401 => ProviderError::InvalidClient {
            error_description: Some("Unauthorized".to_string()),
        },
        403 => ProviderError::UnauthorizedClient {
            error_description: Some("Forbidden".to_string()),
        },
        429 => ProviderError::TemporarilyUnavailable {
            retry_after: Some(Duration::from_secs(60)),
        },
        500 | 502 | 503 | 504 => ProviderError::ServerError {
            message: format!("HTTP {}", status),
        },
        _ => ProviderError::ServerError {
            message: format!("HTTP {}", status),
        },
    };

    OAuth2Error::Provider(error)
}

/// Get user-friendly error message.
pub fn get_user_message(error: &OAuth2Error) -> String {
    match error {
        OAuth2Error::Token(TokenError::Expired) => {
            "Your session has expired. Please sign in again.".to_string()
        }
        OAuth2Error::Token(TokenError::NoRefreshToken) => {
            "Your session cannot be renewed. Please sign in again.".to_string()
        }
        OAuth2Error::Token(TokenError::RefreshFailed { .. }) => {
            "Failed to refresh your session. Please sign in again.".to_string()
        }
        OAuth2Error::Authorization(AuthorizationError::AccessDenied { .. }) => {
            "Access was denied. Please try signing in again and grant the requested permissions."
                .to_string()
        }
        OAuth2Error::Authorization(AuthorizationError::StateMismatch { .. }) => {
            "Security validation failed. Please restart the sign-in process.".to_string()
        }
        OAuth2Error::Network(NetworkError::Timeout { .. }) => {
            "The request timed out. Please check your connection and try again.".to_string()
        }
        OAuth2Error::Network(NetworkError::RateLimited { .. }) => {
            "Too many requests. Please wait a moment and try again.".to_string()
        }
        OAuth2Error::Provider(ProviderError::ServerError { .. })
        | OAuth2Error::Provider(ProviderError::TemporarilyUnavailable { .. }) => {
            "The authentication service is temporarily unavailable. Please try again later."
                .to_string()
        }
        _ => "An authentication error occurred. Please try again.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_is_retryable() {
        assert!(OAuth2Error::DeviceFlow(DeviceFlowError::AuthorizationPending).is_retryable());
        assert!(OAuth2Error::DeviceFlow(DeviceFlowError::SlowDown { interval: 5 }).is_retryable());
        assert!(
            OAuth2Error::Network(NetworkError::Timeout {
                timeout: Duration::from_secs(30)
            })
            .is_retryable()
        );
        assert!(!OAuth2Error::Network(NetworkError::CircuitOpen).is_retryable());
    }

    #[test]
    fn test_retry_after() {
        let error = OAuth2Error::DeviceFlow(DeviceFlowError::SlowDown { interval: 10 });
        assert_eq!(error.retry_after(), Some(Duration::from_secs(10)));

        let error = OAuth2Error::Token(TokenError::Expired);
        assert_eq!(error.retry_after(), None);
    }

    #[test]
    fn test_needs_reauth() {
        assert!(OAuth2Error::Token(TokenError::Expired).needs_reauth());
        assert!(OAuth2Error::Token(TokenError::NoRefreshToken).needs_reauth());
        assert!(!OAuth2Error::Network(NetworkError::CircuitOpen).needs_reauth());
    }

    #[test]
    fn test_parse_error_response() {
        let body = r#"{"error":"invalid_grant","error_description":"The token is expired"}"#;
        let response = parse_error_response(body).unwrap();
        assert_eq!(response.error, "invalid_grant");
        assert_eq!(
            response.error_description,
            Some("The token is expired".to_string())
        );
    }
}
