//! Error types for the GitHub client.

use std::fmt;
use thiserror::Error;
use chrono::{DateTime, Utc};

/// Result type alias for GitHub operations.
pub type GitHubResult<T> = Result<T, GitHubError>;

/// Error kinds for categorizing GitHub errors.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitHubErrorKind {
    // Configuration errors
    /// Missing authentication configuration.
    MissingAuth,
    /// Invalid base URL.
    InvalidBaseUrl,
    /// Invalid GitHub App credentials.
    InvalidAppCredentials,
    /// Invalid configuration.
    InvalidConfiguration,

    // Authentication errors
    /// Invalid token format or value.
    InvalidToken,
    /// Token has expired.
    ExpiredToken,
    /// Token lacks required scopes.
    InsufficientScopes,
    /// Bad credentials.
    BadCredentials,
    /// GitHub App authentication failed.
    AppAuthenticationFailed,

    // Authorization errors
    /// Access forbidden.
    Forbidden,
    /// Resource not accessible.
    ResourceNotAccessible,
    /// SSO required.
    SsoRequired,

    // Request errors
    /// Request validation failed.
    ValidationError,
    /// Invalid parameter.
    InvalidParameter,
    /// Missing required parameter.
    MissingParameter,
    /// Unprocessable entity (422).
    UnprocessableEntity,

    // Resource errors
    /// Resource not found (404).
    NotFound,
    /// Resource is gone (410).
    Gone,
    /// Resource conflict (409).
    Conflict,
    /// Resource already exists.
    AlreadyExists,

    // Rate limit errors
    /// Primary rate limit exceeded.
    PrimaryRateLimitExceeded,
    /// Secondary rate limit exceeded.
    SecondaryRateLimitExceeded,
    /// Abuse detection triggered.
    AbuseDetected,

    // Network errors
    /// Connection failed.
    ConnectionFailed,
    /// Request timeout.
    Timeout,
    /// DNS resolution failed.
    DnsResolutionFailed,
    /// TLS error.
    TlsError,

    // Server errors
    /// Internal server error (500).
    InternalError,
    /// Bad gateway (502).
    BadGateway,
    /// Service unavailable (503).
    ServiceUnavailable,

    // Response errors
    /// Failed to deserialize response.
    DeserializationError,
    /// Unexpected response format.
    UnexpectedFormat,
    /// Invalid JSON in response.
    InvalidJson,

    // Webhook errors
    /// Invalid webhook signature.
    InvalidSignature,
    /// Unsupported webhook event.
    UnsupportedEvent,
    /// Webhook payload parse error.
    PayloadParseError,

    // GraphQL errors
    /// GraphQL query error.
    QueryError,
    /// GraphQL rate limit exceeded.
    GraphQlRateLimitExceeded,
    /// GraphQL node limit exceeded.
    NodeLimitExceeded,

    // Generic
    /// Unknown error.
    Unknown,
}

impl fmt::Display for GitHubErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingAuth => write!(f, "missing_auth"),
            Self::InvalidBaseUrl => write!(f, "invalid_base_url"),
            Self::InvalidAppCredentials => write!(f, "invalid_app_credentials"),
            Self::InvalidConfiguration => write!(f, "invalid_configuration"),
            Self::InvalidToken => write!(f, "invalid_token"),
            Self::ExpiredToken => write!(f, "expired_token"),
            Self::InsufficientScopes => write!(f, "insufficient_scopes"),
            Self::BadCredentials => write!(f, "bad_credentials"),
            Self::AppAuthenticationFailed => write!(f, "app_auth_failed"),
            Self::Forbidden => write!(f, "forbidden"),
            Self::ResourceNotAccessible => write!(f, "resource_not_accessible"),
            Self::SsoRequired => write!(f, "sso_required"),
            Self::ValidationError => write!(f, "validation_error"),
            Self::InvalidParameter => write!(f, "invalid_parameter"),
            Self::MissingParameter => write!(f, "missing_parameter"),
            Self::UnprocessableEntity => write!(f, "unprocessable_entity"),
            Self::NotFound => write!(f, "not_found"),
            Self::Gone => write!(f, "gone"),
            Self::Conflict => write!(f, "conflict"),
            Self::AlreadyExists => write!(f, "already_exists"),
            Self::PrimaryRateLimitExceeded => write!(f, "primary_rate_limit_exceeded"),
            Self::SecondaryRateLimitExceeded => write!(f, "secondary_rate_limit_exceeded"),
            Self::AbuseDetected => write!(f, "abuse_detected"),
            Self::ConnectionFailed => write!(f, "connection_failed"),
            Self::Timeout => write!(f, "timeout"),
            Self::DnsResolutionFailed => write!(f, "dns_resolution_failed"),
            Self::TlsError => write!(f, "tls_error"),
            Self::InternalError => write!(f, "internal_error"),
            Self::BadGateway => write!(f, "bad_gateway"),
            Self::ServiceUnavailable => write!(f, "service_unavailable"),
            Self::DeserializationError => write!(f, "deserialization_error"),
            Self::UnexpectedFormat => write!(f, "unexpected_format"),
            Self::InvalidJson => write!(f, "invalid_json"),
            Self::InvalidSignature => write!(f, "invalid_signature"),
            Self::UnsupportedEvent => write!(f, "unsupported_event"),
            Self::PayloadParseError => write!(f, "payload_parse_error"),
            Self::QueryError => write!(f, "query_error"),
            Self::GraphQlRateLimitExceeded => write!(f, "graphql_rate_limit_exceeded"),
            Self::NodeLimitExceeded => write!(f, "node_limit_exceeded"),
            Self::Unknown => write!(f, "unknown"),
        }
    }
}

/// Rate limit information extracted from error.
#[derive(Debug, Clone)]
pub struct RateLimitInfo {
    /// Maximum requests allowed.
    pub limit: u32,
    /// Remaining requests in current window.
    pub remaining: u32,
    /// Time when the rate limit resets.
    pub reset_at: DateTime<Utc>,
    /// Retry-After header value in seconds (if present).
    pub retry_after: Option<u64>,
    /// Resource category.
    pub resource: Option<String>,
}

/// GitHub API error with detailed information.
#[derive(Error, Debug)]
pub struct GitHubError {
    /// Error kind.
    kind: GitHubErrorKind,
    /// Error message.
    message: String,
    /// HTTP status code.
    status_code: Option<u16>,
    /// GitHub request ID.
    request_id: Option<String>,
    /// Documentation URL.
    documentation_url: Option<String>,
    /// Rate limit info (if applicable).
    rate_limit: Option<RateLimitInfo>,
    /// Underlying cause.
    #[source]
    cause: Option<Box<dyn std::error::Error + Send + Sync>>,
}

impl fmt::Display for GitHubError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.kind, self.message)?;
        if let Some(code) = self.status_code {
            write!(f, " (HTTP {})", code)?;
        }
        if let Some(ref id) = self.request_id {
            write!(f, " [request_id: {}]", id)?;
        }
        Ok(())
    }
}

impl GitHubError {
    /// Creates a new GitHub error.
    pub fn new(kind: GitHubErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            status_code: None,
            request_id: None,
            documentation_url: None,
            rate_limit: None,
            cause: None,
        }
    }

    /// Sets the HTTP status code.
    pub fn with_status(mut self, code: u16) -> Self {
        self.status_code = Some(code);
        self
    }

    /// Sets the GitHub request ID.
    pub fn with_request_id(mut self, id: impl Into<String>) -> Self {
        self.request_id = Some(id.into());
        self
    }

    /// Sets the documentation URL.
    pub fn with_documentation_url(mut self, url: impl Into<String>) -> Self {
        self.documentation_url = Some(url.into());
        self
    }

    /// Sets the rate limit info.
    pub fn with_rate_limit(mut self, info: RateLimitInfo) -> Self {
        self.rate_limit = Some(info);
        self
    }

    /// Sets the underlying cause.
    pub fn with_cause(mut self, cause: impl std::error::Error + Send + Sync + 'static) -> Self {
        self.cause = Some(Box::new(cause));
        self
    }

    /// Gets the error kind.
    pub fn kind(&self) -> &GitHubErrorKind {
        &self.kind
    }

    /// Gets the HTTP status code.
    pub fn status_code(&self) -> Option<u16> {
        self.status_code
    }

    /// Gets the request ID.
    pub fn request_id(&self) -> Option<&str> {
        self.request_id.as_deref()
    }

    /// Gets the documentation URL.
    pub fn documentation_url(&self) -> Option<&str> {
        self.documentation_url.as_deref()
    }

    /// Gets the rate limit info.
    pub fn rate_limit(&self) -> Option<&RateLimitInfo> {
        self.rate_limit.as_ref()
    }

    /// Returns the retry-after duration in seconds.
    pub fn retry_after(&self) -> Option<u64> {
        self.rate_limit.as_ref().and_then(|r| r.retry_after).or_else(|| {
            if let Some(ref rl) = self.rate_limit {
                let now = Utc::now();
                if rl.reset_at > now {
                    Some((rl.reset_at - now).num_seconds() as u64)
                } else {
                    None
                }
            } else {
                None
            }
        })
    }

    /// Returns true if this error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self.kind,
            GitHubErrorKind::PrimaryRateLimitExceeded
                | GitHubErrorKind::SecondaryRateLimitExceeded
                | GitHubErrorKind::AbuseDetected
                | GitHubErrorKind::ConnectionFailed
                | GitHubErrorKind::Timeout
                | GitHubErrorKind::DnsResolutionFailed
                | GitHubErrorKind::InternalError
                | GitHubErrorKind::BadGateway
                | GitHubErrorKind::ServiceUnavailable
        )
    }

    /// Creates an error from an HTTP status code and GitHub error response.
    pub fn from_response(
        status: u16,
        message: String,
        documentation_url: Option<String>,
        request_id: Option<String>,
    ) -> Self {
        let kind = Self::kind_from_status(status);
        let mut error = Self::new(kind, message).with_status(status);

        if let Some(url) = documentation_url {
            error = error.with_documentation_url(url);
        }
        if let Some(id) = request_id {
            error = error.with_request_id(id);
        }

        error
    }

    /// Maps HTTP status code to error kind.
    fn kind_from_status(status: u16) -> GitHubErrorKind {
        match status {
            400 => GitHubErrorKind::ValidationError,
            401 => GitHubErrorKind::BadCredentials,
            403 => GitHubErrorKind::Forbidden,
            404 => GitHubErrorKind::NotFound,
            409 => GitHubErrorKind::Conflict,
            410 => GitHubErrorKind::Gone,
            422 => GitHubErrorKind::UnprocessableEntity,
            429 => GitHubErrorKind::SecondaryRateLimitExceeded,
            500 => GitHubErrorKind::InternalError,
            502 => GitHubErrorKind::BadGateway,
            503 => GitHubErrorKind::ServiceUnavailable,
            _ => GitHubErrorKind::Unknown,
        }
    }

    // Convenience constructors

    /// Creates a configuration error.
    pub fn configuration(message: impl Into<String>) -> Self {
        Self::new(GitHubErrorKind::InvalidConfiguration, message)
    }

    /// Creates an authentication error.
    pub fn authentication(message: impl Into<String>) -> Self {
        Self::new(GitHubErrorKind::BadCredentials, message)
    }

    /// Creates a not found error.
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(GitHubErrorKind::NotFound, message).with_status(404)
    }

    /// Creates a rate limit error.
    pub fn rate_limit(info: RateLimitInfo) -> Self {
        Self::new(
            GitHubErrorKind::PrimaryRateLimitExceeded,
            "Rate limit exceeded",
        )
        .with_status(403)
        .with_rate_limit(info)
    }

    /// Creates a timeout error.
    pub fn timeout(message: impl Into<String>) -> Self {
        Self::new(GitHubErrorKind::Timeout, message)
    }

    /// Creates a webhook signature error.
    pub fn invalid_signature(message: impl Into<String>) -> Self {
        Self::new(GitHubErrorKind::InvalidSignature, message)
    }

    /// Creates a deserialization error.
    pub fn deserialization(message: impl Into<String>) -> Self {
        Self::new(GitHubErrorKind::DeserializationError, message)
    }
}

/// Type guard for GitHubError.
pub fn is_github_error(error: &dyn std::error::Error) -> bool {
    error.downcast_ref::<GitHubError>().is_some()
}

/// Checks if an error is a rate limit error.
pub fn is_rate_limit_error(error: &GitHubError) -> bool {
    matches!(
        error.kind(),
        GitHubErrorKind::PrimaryRateLimitExceeded
            | GitHubErrorKind::SecondaryRateLimitExceeded
            | GitHubErrorKind::AbuseDetected
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let error = GitHubError::new(GitHubErrorKind::NotFound, "Repository not found")
            .with_status(404)
            .with_request_id("abc123");

        let display = format!("{}", error);
        assert!(display.contains("not_found"));
        assert!(display.contains("Repository not found"));
        assert!(display.contains("404"));
        assert!(display.contains("abc123"));
    }

    #[test]
    fn test_is_retryable() {
        let retryable = GitHubError::new(GitHubErrorKind::Timeout, "timeout");
        assert!(retryable.is_retryable());

        let not_retryable = GitHubError::new(GitHubErrorKind::NotFound, "not found");
        assert!(!not_retryable.is_retryable());
    }

    #[test]
    fn test_from_response() {
        let error = GitHubError::from_response(
            404,
            "Not Found".to_string(),
            Some("https://docs.github.com".to_string()),
            Some("req-123".to_string()),
        );

        assert_eq!(*error.kind(), GitHubErrorKind::NotFound);
        assert_eq!(error.status_code(), Some(404));
        assert_eq!(error.documentation_url(), Some("https://docs.github.com"));
        assert_eq!(error.request_id(), Some("req-123"));
    }
}
