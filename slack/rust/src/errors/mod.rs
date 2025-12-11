//! Error types for the Slack client.
//!
//! Provides a comprehensive error hierarchy mapping Slack API errors
//! to semantic error types with retry and circuit breaker support.

use std::fmt;
use std::time::Duration;
use thiserror::Error;

/// Result type for Slack operations
pub type SlackResult<T> = Result<T, SlackError>;

/// Root error type for Slack integration
#[derive(Error, Debug)]
pub enum SlackError {
    /// Configuration error
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    /// Authentication error
    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    /// Authorization error
    #[error("Authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    /// Request validation error
    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    /// Rate limit error
    #[error("Rate limit error: {0}")]
    RateLimit(#[from] RateLimitError),

    /// Network error
    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    /// Socket Mode error
    #[error("Socket Mode error: {0}")]
    SocketMode(#[from] SocketModeError),

    /// Server error
    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    /// Response parsing error
    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    /// Webhook error
    #[error("Webhook error: {0}")]
    Webhook(#[from] WebhookError),

    /// Channel-related error
    #[error("Channel error: {0}")]
    Channel(#[from] ChannelError),

    /// Generic API error
    #[error("API error: {code} - {message}")]
    Api {
        /// Slack error code
        code: String,
        /// Error message
        message: String,
    },
}

impl SlackError {
    /// Get the error code for this error
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::Configuration(_) => "SLACK_CONFIG",
            Self::Authentication(_) => "SLACK_AUTH",
            Self::Authorization(_) => "SLACK_AUTHZ",
            Self::Request(_) => "SLACK_REQUEST",
            Self::RateLimit(_) => "SLACK_RATE_LIMIT",
            Self::Network(_) => "SLACK_NETWORK",
            Self::SocketMode(_) => "SLACK_SOCKET_MODE",
            Self::Server(_) => "SLACK_SERVER",
            Self::Response(_) => "SLACK_RESPONSE",
            Self::Webhook(_) => "SLACK_WEBHOOK",
            Self::Channel(_) => "SLACK_CHANNEL",
            Self::Api { .. } => "SLACK_API",
        }
    }

    /// Check if this error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::Network(NetworkError::Timeout)
                | Self::Network(NetworkError::ConnectionFailed { .. })
                | Self::RateLimit(RateLimitError::RateLimited { .. })
                | Self::Server(ServerError::ServiceUnavailable)
                | Self::Server(ServerError::InternalError)
                | Self::SocketMode(SocketModeError::ConnectionClosed { .. })
        )
    }

    /// Get retry-after duration if applicable
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            Self::RateLimit(RateLimitError::RateLimited { retry_after, .. }) => Some(*retry_after),
            _ => None,
        }
    }

    /// Get HTTP status code if applicable
    pub fn http_status(&self) -> Option<u16> {
        match self {
            Self::Authentication(_) => Some(401),
            Self::Authorization(_) => Some(403),
            Self::RateLimit(_) => Some(429),
            Self::Server(ServerError::ServiceUnavailable) => Some(503),
            Self::Server(ServerError::InternalError) => Some(500),
            Self::Request(_) => Some(400),
            _ => None,
        }
    }

    /// Create an API error from a Slack error response
    pub fn from_slack_error(code: &str, message: Option<&str>) -> Self {
        let msg = message.unwrap_or("Unknown error").to_string();

        match code {
            "invalid_auth" => Self::Authentication(AuthenticationError::InvalidAuth),
            "account_inactive" => Self::Authentication(AuthenticationError::AccountInactive),
            "token_revoked" => Self::Authentication(AuthenticationError::TokenRevoked),
            "token_expired" => Self::Authentication(AuthenticationError::TokenExpired),
            "not_authed" => Self::Authorization(AuthorizationError::NotAuthed),
            "missing_scope" => Self::Authorization(AuthorizationError::MissingScope { scope: msg }),
            "channel_not_found" => Self::Authorization(AuthorizationError::ChannelNotFound),
            "user_not_found" => Self::Authorization(AuthorizationError::UserNotFound),
            "not_in_channel" => Self::Authorization(AuthorizationError::NotInChannel),
            "invalid_arguments" => Self::Request(RequestError::InvalidArguments { message: msg }),
            "invalid_json" => Self::Request(RequestError::InvalidJson { message: msg }),
            "msg_too_long" => Self::Request(RequestError::MessageTooLong),
            "channel_is_archived" => Self::Channel(ChannelError::ChannelArchived),
            "already_in_channel" => Self::Channel(ChannelError::AlreadyInChannel),
            "internal_error" => Self::Server(ServerError::InternalError),
            "service_unavailable" => Self::Server(ServerError::ServiceUnavailable),
            _ => Self::Api {
                code: code.to_string(),
                message: msg,
            },
        }
    }
}

/// Configuration errors
#[derive(Error, Debug)]
pub enum ConfigurationError {
    /// Missing token
    #[error("Bot token is missing")]
    MissingToken,

    /// Invalid token format
    #[error("Invalid token format: {0}")]
    InvalidToken(String),

    /// Missing signing secret
    #[error("Signing secret is missing")]
    MissingSigningSecret,

    /// Invalid configuration
    #[error("Invalid configuration: {message}")]
    InvalidConfiguration {
        /// Error message
        message: String,
    },

    /// Environment variable error
    #[error("Environment variable error: {0}")]
    EnvVar(String),
}

/// Authentication errors
#[derive(Error, Debug)]
pub enum AuthenticationError {
    /// Invalid authentication credentials
    #[error("Invalid authentication credentials")]
    InvalidAuth,

    /// Account is inactive
    #[error("Account is inactive")]
    AccountInactive,

    /// Token has been revoked
    #[error("Token has been revoked")]
    TokenRevoked,

    /// Token has expired
    #[error("Token has expired")]
    TokenExpired,

    /// Enterprise Grid restriction
    #[error("Enterprise Grid restriction")]
    EnterpriseIsRestricted,
}

/// Authorization errors
#[derive(Error, Debug)]
pub enum AuthorizationError {
    /// Not authenticated
    #[error("Not authenticated")]
    NotAuthed,

    /// Missing required scope
    #[error("Missing scope: {scope}")]
    MissingScope {
        /// The missing scope
        scope: String,
    },

    /// Channel not found
    #[error("Channel not found")]
    ChannelNotFound,

    /// User not found
    #[error("User not found")]
    UserNotFound,

    /// User not visible
    #[error("User not visible")]
    UserNotVisible,

    /// Not in channel
    #[error("Not in channel")]
    NotInChannel,

    /// Cannot find channel
    #[error("Cannot find channel")]
    CannotFindChannel,
}

/// Request validation errors
#[derive(Error, Debug)]
pub enum RequestError {
    /// Invalid arguments
    #[error("Invalid arguments: {message}")]
    InvalidArguments {
        /// Error message
        message: String,
    },

    /// Invalid form data
    #[error("Invalid form data: {message}")]
    InvalidFormData {
        /// Error message
        message: String,
    },

    /// Invalid JSON
    #[error("Invalid JSON: {message}")]
    InvalidJson {
        /// Error message
        message: String,
    },

    /// JSON not object
    #[error("JSON payload must be an object")]
    JsonNotObject,

    /// Request timeout
    #[error("Request timed out")]
    Timeout,

    /// Too many attachments
    #[error("Too many attachments")]
    TooManyAttachments,

    /// Message too long
    #[error("Message is too long")]
    MessageTooLong,
}

/// Rate limit errors
#[derive(Error, Debug)]
pub enum RateLimitError {
    /// Rate limited with retry information
    #[error("Rate limited, retry after {retry_after:?}")]
    RateLimited {
        /// Duration to wait before retrying
        retry_after: Duration,
        /// Rate limit tier
        tier: Option<String>,
    },

    /// Too many requests
    #[error("Too many requests")]
    TooManyRequests,
}

/// Network errors
#[derive(Error, Debug)]
pub enum NetworkError {
    /// Connection failed
    #[error("Connection failed: {message}")]
    ConnectionFailed {
        /// Error message
        message: String,
    },

    /// Request timeout
    #[error("Request timed out")]
    Timeout,

    /// DNS resolution failed
    #[error("DNS resolution failed: {message}")]
    DnsResolutionFailed {
        /// Error message
        message: String,
    },

    /// TLS error
    #[error("TLS error: {message}")]
    TlsError {
        /// Error message
        message: String,
    },

    /// HTTP error
    #[error("HTTP error: {0}")]
    Http(String),
}

impl From<reqwest::Error> for NetworkError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            NetworkError::Timeout
        } else if err.is_connect() {
            NetworkError::ConnectionFailed {
                message: err.to_string(),
            }
        } else {
            NetworkError::Http(err.to_string())
        }
    }
}

/// Socket Mode errors
#[derive(Error, Debug)]
pub enum SocketModeError {
    /// Connection failed
    #[error("Failed to connect: {message}")]
    ConnectionFailed {
        /// Error message
        message: String,
    },

    /// Connection closed
    #[error("Connection closed: {reason}")]
    ConnectionClosed {
        /// Reason for closure
        reason: String,
    },

    /// Reconnection failed
    #[error("Failed to reconnect after {attempts} attempts")]
    ReconnectFailed {
        /// Number of attempts
        attempts: u32,
    },

    /// Acknowledgment timeout
    #[error("Acknowledgment timeout for envelope {envelope_id}")]
    AcknowledgmentTimeout {
        /// Envelope ID
        envelope_id: String,
    },

    /// Invalid envelope
    #[error("Invalid envelope: {message}")]
    InvalidEnvelope {
        /// Error message
        message: String,
    },

    /// Missing app token
    #[error("App token is required for Socket Mode")]
    MissingAppToken,

    /// WebSocket error
    #[error("WebSocket error: {message}")]
    WebSocket {
        /// Error message
        message: String,
    },
}

/// Server errors
#[derive(Error, Debug)]
pub enum ServerError {
    /// Internal server error
    #[error("Internal server error")]
    InternalError,

    /// Service unavailable
    #[error("Service unavailable")]
    ServiceUnavailable,

    /// Team added to org (migration)
    #[error("Team added to org")]
    TeamAddedToOrg,

    /// Fatal error
    #[error("Fatal error: {message}")]
    FatalError {
        /// Error message
        message: String,
    },
}

/// Response parsing errors
#[derive(Error, Debug)]
pub enum ResponseError {
    /// JSON deserialization error
    #[error("Deserialization error: {message}")]
    DeserializationError {
        /// Error message
        message: String,
    },

    /// Unexpected response format
    #[error("Unexpected response: {message}")]
    UnexpectedResponse {
        /// Error message
        message: String,
    },

    /// Missing "ok" field
    #[error("Missing 'ok' field in response")]
    MissingOkField,
}

impl From<serde_json::Error> for ResponseError {
    fn from(err: serde_json::Error) -> Self {
        ResponseError::DeserializationError {
            message: err.to_string(),
        }
    }
}

/// Webhook errors
#[derive(Error, Debug)]
pub enum WebhookError {
    /// Invalid signature
    #[error("Invalid signature")]
    InvalidSignature,

    /// Expired timestamp
    #[error("Timestamp is too old: {timestamp}")]
    ExpiredTimestamp {
        /// The expired timestamp
        timestamp: i64,
    },

    /// Invalid payload
    #[error("Invalid payload: {message}")]
    InvalidPayload {
        /// Error message
        message: String,
    },
}

/// Channel errors
#[derive(Error, Debug)]
pub enum ChannelError {
    /// Channel is archived
    #[error("Channel is archived")]
    ChannelArchived,

    /// Channel is not archived
    #[error("Channel is not archived")]
    ChannelNotArchived,

    /// Channel is MPDM
    #[error("Channel is an MPDM")]
    ChannelIsMpim,

    /// Method not supported for channel type
    #[error("Method not supported for this channel type")]
    MethodNotSupportedForChannelType,

    /// Already in channel
    #[error("Already in channel")]
    AlreadyInChannel,
}

/// Parse a rate limit from response headers
pub fn parse_rate_limit_error(retry_after_secs: u64, tier: Option<String>) -> RateLimitError {
    RateLimitError::RateLimited {
        retry_after: Duration::from_secs(retry_after_secs),
        tier,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_is_retryable() {
        assert!(SlackError::Network(NetworkError::Timeout).is_retryable());
        assert!(SlackError::RateLimit(RateLimitError::RateLimited {
            retry_after: Duration::from_secs(5),
            tier: None
        })
        .is_retryable());
        assert!(SlackError::Server(ServerError::ServiceUnavailable).is_retryable());

        assert!(!SlackError::Authentication(AuthenticationError::InvalidAuth).is_retryable());
        assert!(!SlackError::Authorization(AuthorizationError::NotAuthed).is_retryable());
    }

    #[test]
    fn test_from_slack_error() {
        assert!(matches!(
            SlackError::from_slack_error("invalid_auth", None),
            SlackError::Authentication(AuthenticationError::InvalidAuth)
        ));

        assert!(matches!(
            SlackError::from_slack_error("channel_not_found", None),
            SlackError::Authorization(AuthorizationError::ChannelNotFound)
        ));

        assert!(matches!(
            SlackError::from_slack_error("unknown_error", Some("test")),
            SlackError::Api { code, message } if code == "unknown_error" && message == "test"
        ));
    }

    #[test]
    fn test_retry_after() {
        let err = SlackError::RateLimit(RateLimitError::RateLimited {
            retry_after: Duration::from_secs(10),
            tier: Some("tier_1".to_string()),
        });
        assert_eq!(err.retry_after(), Some(Duration::from_secs(10)));

        let err2 = SlackError::Network(NetworkError::Timeout);
        assert_eq!(err2.retry_after(), None);
    }
}
