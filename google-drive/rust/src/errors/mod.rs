//! Error types for Google Drive integration.

use reqwest::StatusCode;
use std::time::Duration;
use thiserror::Error;

/// Result type for Google Drive operations.
pub type GoogleDriveResult<T> = Result<T, GoogleDriveError>;

/// Top-level error type for the Google Drive integration.
#[derive(Debug, Error)]
pub enum GoogleDriveError {
    /// Configuration error.
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    /// Authentication error.
    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    /// Authorization error.
    #[error("Authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    /// Request error.
    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    /// Resource error.
    #[error("Resource error: {0}")]
    Resource(#[from] ResourceError),

    /// Quota error.
    #[error("Quota error: {0}")]
    Quota(#[from] QuotaError),

    /// Upload error.
    #[error("Upload error: {0}")]
    Upload(#[from] UploadError),

    /// Export error.
    #[error("Export error: {0}")]
    Export(#[from] ExportError),

    /// Network error.
    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    /// Server error.
    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    /// Response error.
    #[error("Response error: {0}")]
    Response(#[from] ResponseError),
}

impl GoogleDriveError {
    /// Creates a configuration error.
    pub fn configuration(msg: impl Into<String>) -> Self {
        GoogleDriveError::Configuration(ConfigurationError::InvalidConfiguration(msg.into()))
    }

    /// Creates an authentication error.
    pub fn authentication(msg: impl Into<String>) -> Self {
        GoogleDriveError::Authentication(AuthenticationError::InvalidToken(msg.into()))
    }

    /// Creates an authorization error.
    pub fn authorization(msg: impl Into<String>) -> Self {
        GoogleDriveError::Authorization(AuthorizationError::Forbidden(msg.into()))
    }

    /// Creates a request error.
    pub fn request(msg: impl Into<String>) -> Self {
        GoogleDriveError::Request(RequestError::ValidationError(msg.into()))
    }

    /// Creates a not found error.
    pub fn not_found(msg: impl Into<String>) -> Self {
        GoogleDriveError::Resource(ResourceError::FileNotFound(msg.into()))
    }

    /// Creates a rate limit error.
    pub fn rate_limit(msg: impl Into<String>) -> Self {
        GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
            message: msg.into(),
            retry_after: None,
        })
    }

    /// Creates a quota error.
    pub fn quota(msg: impl Into<String>) -> Self {
        GoogleDriveError::Quota(QuotaError::StorageQuotaExceeded {
            message: msg.into(),
            limit: 0,
            used: 0,
        })
    }

    /// Creates a server error.
    pub fn server(msg: impl Into<String>) -> Self {
        GoogleDriveError::Server(ServerError::InternalError(msg.into()))
    }

    /// Creates a network error.
    pub fn network(msg: impl Into<String>) -> Self {
        GoogleDriveError::Network(NetworkError::ConnectionFailed(msg.into()))
    }

    /// Creates a timeout error.
    pub fn timeout(msg: impl Into<String>) -> Self {
        GoogleDriveError::Network(NetworkError::Timeout(msg.into()))
    }

    /// Creates a deserialization error.
    pub fn deserialization(msg: impl Into<String>) -> Self {
        GoogleDriveError::Response(ResponseError::DeserializationError(msg.into()))
    }

    /// Creates an unknown error.
    pub fn unknown(msg: impl Into<String>) -> Self {
        GoogleDriveError::Server(ServerError::InternalError(msg.into()))
    }

    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded { .. })
                | GoogleDriveError::Network(NetworkError::Timeout { .. })
                | GoogleDriveError::Network(NetworkError::ConnectionFailed { .. })
                | GoogleDriveError::Server(ServerError::InternalError { .. })
                | GoogleDriveError::Server(ServerError::ServiceUnavailable { .. })
                | GoogleDriveError::Server(ServerError::BackendError { .. })
                | GoogleDriveError::Upload(UploadError::UploadInterrupted { .. })
        )
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded { retry_after, .. }) => {
                *retry_after
            }
            GoogleDriveError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => {
                *retry_after
            }
            _ => None,
        }
    }

    /// Returns the HTTP status code if applicable.
    pub fn status_code(&self) -> Option<StatusCode> {
        match self {
            GoogleDriveError::Authentication(_) => Some(StatusCode::UNAUTHORIZED),
            GoogleDriveError::Authorization(_) => Some(StatusCode::FORBIDDEN),
            GoogleDriveError::Request(_) => Some(StatusCode::BAD_REQUEST),
            GoogleDriveError::Resource(ResourceError::FileNotFound { .. }) => {
                Some(StatusCode::NOT_FOUND)
            }
            GoogleDriveError::Resource(ResourceError::FolderNotFound { .. }) => {
                Some(StatusCode::NOT_FOUND)
            }
            GoogleDriveError::Quota(_) => Some(StatusCode::TOO_MANY_REQUESTS),
            GoogleDriveError::Server(ServerError::InternalError { .. }) => {
                Some(StatusCode::INTERNAL_SERVER_ERROR)
            }
            GoogleDriveError::Server(ServerError::ServiceUnavailable { .. }) => {
                Some(StatusCode::SERVICE_UNAVAILABLE)
            }
            GoogleDriveError::Server(ServerError::BadGateway { .. }) => {
                Some(StatusCode::BAD_GATEWAY)
            }
            _ => None,
        }
    }
}

/// Configuration errors.
#[derive(Debug, Error)]
pub enum ConfigurationError {
    /// Missing credentials.
    #[error("Missing credentials: {0}")]
    MissingCredentials(String),

    /// Invalid credentials.
    #[error("Invalid credentials: {0}")]
    InvalidCredentials(String),

    /// Invalid configuration.
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),

    /// Missing scope.
    #[error("Missing scope: {0}")]
    MissingScope(String),
}

/// Authentication errors.
#[derive(Debug, Error)]
pub enum AuthenticationError {
    /// Invalid token.
    #[error("Invalid token: {0}")]
    InvalidToken(String),

    /// Expired token.
    #[error("Expired token: {0}")]
    ExpiredToken(String),

    /// Refresh failed.
    #[error("Token refresh failed: {0}")]
    RefreshFailed(String),

    /// Invalid grant.
    #[error("Invalid grant: {0}")]
    InvalidGrant(String),

    /// Insufficient permissions.
    #[error("Insufficient permissions: {0}")]
    InsufficientPermissions(String),

    /// JWT encoding error.
    #[error("JWT encoding error: {0}")]
    JwtEncodingError(String),

    /// JWT decoding error.
    #[error("JWT decoding error: {0}")]
    JwtDecodingError(String),
}

/// Authorization errors.
#[derive(Debug, Error)]
pub enum AuthorizationError {
    /// Forbidden.
    #[error("Forbidden: {0}")]
    Forbidden(String),

    /// Insufficient permissions.
    #[error("Insufficient permissions: {0}")]
    InsufficientPermissions(String),

    /// File not accessible.
    #[error("File not accessible: {0}")]
    FileNotAccessible(String),

    /// Domain policy.
    #[error("Domain policy violation: {0}")]
    DomainPolicy(String),

    /// User rate limit exceeded.
    #[error("User rate limit exceeded: {0}")]
    UserRateLimitExceeded(String),
}

/// Request errors.
#[derive(Debug, Error)]
pub enum RequestError {
    /// Validation error.
    #[error("Validation error: {0}")]
    ValidationError(String),

    /// Invalid parameter.
    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    /// Missing parameter.
    #[error("Missing parameter: {0}")]
    MissingParameter(String),

    /// Invalid query.
    #[error("Invalid query: {0}")]
    InvalidQuery(String),

    /// Invalid range.
    #[error("Invalid range: {0}")]
    InvalidRange(String),

    /// Invalid MIME type.
    #[error("Invalid MIME type: {0}")]
    InvalidMimeType(String),
}

/// Resource errors.
#[derive(Debug, Error)]
pub enum ResourceError {
    /// File not found.
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// Folder not found.
    #[error("Folder not found: {0}")]
    FolderNotFound(String),

    /// Permission not found.
    #[error("Permission not found: {0}")]
    PermissionNotFound(String),

    /// Comment not found.
    #[error("Comment not found: {0}")]
    CommentNotFound(String),

    /// Revision not found.
    #[error("Revision not found: {0}")]
    RevisionNotFound(String),

    /// Drive not found.
    #[error("Drive not found: {0}")]
    DriveNotFound(String),

    /// Already exists.
    #[error("Resource already exists: {0}")]
    AlreadyExists(String),

    /// Cannot modify.
    #[error("Cannot modify resource: {0}")]
    CannotModify(String),
}

/// Quota errors.
#[derive(Debug, Error)]
pub enum QuotaError {
    /// Storage quota exceeded.
    #[error("Storage quota exceeded: {message} (limit: {limit}, used: {used})")]
    StorageQuotaExceeded {
        /// Error message.
        message: String,
        /// Storage limit in bytes.
        limit: u64,
        /// Storage used in bytes.
        used: u64,
    },

    /// User rate limit exceeded.
    #[error("User rate limit exceeded: {message}")]
    UserRateLimitExceeded {
        /// Error message.
        message: String,
        /// Retry after duration.
        retry_after: Option<Duration>,
    },

    /// Daily limit exceeded.
    #[error("Daily limit exceeded: {message}")]
    DailyLimitExceeded {
        /// Error message.
        message: String,
        /// Domain name.
        domain: Option<String>,
    },

    /// Project rate limit exceeded.
    #[error("Project rate limit exceeded: {message}")]
    ProjectRateLimitExceeded {
        /// Error message.
        message: String,
        /// Retry after duration.
        retry_after: Option<Duration>,
    },
}

/// Upload errors.
#[derive(Debug, Error)]
pub enum UploadError {
    /// Upload interrupted.
    #[error("Upload interrupted: {0}")]
    UploadInterrupted(String),

    /// Upload failed.
    #[error("Upload failed: {0}")]
    UploadFailed(String),

    /// Invalid upload request.
    #[error("Invalid upload request: {0}")]
    InvalidUploadRequest(String),

    /// Upload size exceeded.
    #[error("Upload size exceeded: {0}")]
    UploadSizeExceeded(String),

    /// Resumable upload expired.
    #[error("Resumable upload expired: {0}")]
    ResumableUploadExpired(String),

    /// Chunk size mismatch.
    #[error("Chunk size mismatch: {0}")]
    ChunkSizeMismatch(String),
}

/// Export errors.
#[derive(Debug, Error)]
pub enum ExportError {
    /// Export not supported.
    #[error("Export not supported: {0}")]
    ExportNotSupported(String),

    /// Export size exceeded.
    #[error("Export size exceeded (max 10MB): {0}")]
    ExportSizeExceeded(String),

    /// Invalid export format.
    #[error("Invalid export format: {0}")]
    InvalidExportFormat(String),
}

/// Network errors.
#[derive(Debug, Error)]
pub enum NetworkError {
    /// Connection failed.
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    /// Timeout.
    #[error("Request timeout: {0}")]
    Timeout(String),

    /// DNS resolution failed.
    #[error("DNS resolution failed: {0}")]
    DnsResolutionFailed(String),

    /// TLS error.
    #[error("TLS error: {0}")]
    TlsError(String),
}

/// Server errors.
#[derive(Debug, Error)]
pub enum ServerError {
    /// Internal error.
    #[error("Internal server error: {0}")]
    InternalError(String),

    /// Backend error.
    #[error("Backend error: {0}")]
    BackendError(String),

    /// Service unavailable.
    #[error("Service unavailable: {message}")]
    ServiceUnavailable {
        /// Error message.
        message: String,
        /// Retry after duration.
        retry_after: Option<Duration>,
    },

    /// Bad gateway.
    #[error("Bad gateway: {0}")]
    BadGateway(String),
}

/// Response errors.
#[derive(Debug, Error)]
pub enum ResponseError {
    /// Deserialization error.
    #[error("Deserialization error: {0}")]
    DeserializationError(String),

    /// Unexpected format.
    #[error("Unexpected response format: {0}")]
    UnexpectedFormat(String),

    /// Invalid JSON.
    #[error("Invalid JSON: {0}")]
    InvalidJson(String),
}

/// Transport errors.
#[derive(Debug, Error)]
pub enum TransportError {
    /// Network error.
    #[error("Network error: {0}")]
    Network(String),

    /// Timeout error.
    #[error("Timeout: {0}")]
    Timeout(String),

    /// HTTP error.
    #[error("HTTP error: {0}")]
    Http(String),

    /// Serialization error.
    #[error("Serialization error: {0}")]
    Serialization(String),
}

impl From<reqwest::Error> for TransportError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            TransportError::Timeout(err.to_string())
        } else if err.is_connect() {
            TransportError::Network(err.to_string())
        } else {
            TransportError::Http(err.to_string())
        }
    }
}

impl From<TransportError> for GoogleDriveError {
    fn from(err: TransportError) -> Self {
        match err {
            TransportError::Timeout(msg) => {
                GoogleDriveError::Network(NetworkError::Timeout(msg))
            }
            TransportError::Network(msg) => {
                GoogleDriveError::Network(NetworkError::ConnectionFailed(msg))
            }
            TransportError::Http(msg) | TransportError::Serialization(msg) => {
                GoogleDriveError::Response(ResponseError::UnexpectedFormat(msg))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_retryable() {
        let error = GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
            message: "Rate limit exceeded".to_string(),
            retry_after: None,
        });
        assert!(error.is_retryable());

        let error = GoogleDriveError::Network(NetworkError::Timeout("Timeout".to_string()));
        assert!(error.is_retryable());

        let error = GoogleDriveError::Resource(ResourceError::FileNotFound("test".to_string()));
        assert!(!error.is_retryable());
    }

    #[test]
    fn test_status_code() {
        let error = GoogleDriveError::Authentication(AuthenticationError::InvalidToken(
            "test".to_string(),
        ));
        assert_eq!(error.status_code(), Some(StatusCode::UNAUTHORIZED));

        let error = GoogleDriveError::Authorization(AuthorizationError::Forbidden(
            "test".to_string(),
        ));
        assert_eq!(error.status_code(), Some(StatusCode::FORBIDDEN));

        let error = GoogleDriveError::Resource(ResourceError::FileNotFound("test".to_string()));
        assert_eq!(error.status_code(), Some(StatusCode::NOT_FOUND));
    }
}
