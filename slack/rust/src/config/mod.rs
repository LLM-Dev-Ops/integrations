//! Configuration management for the Slack client.
//!
//! Supports configuration via:
//! - Explicit values
//! - Environment variables
//! - Builder pattern

use crate::errors::{ConfigurationError, SlackError, SlackResult};
use http::HeaderMap;
use secrecy::{ExposeSecret, SecretString};
use std::time::Duration;
use url::Url;

/// Token type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenType {
    /// Bot token (xoxb-*)
    Bot,
    /// User token (xoxp-*)
    User,
    /// App-level token (xapp-*)
    App,
}

impl TokenType {
    /// Detect token type from prefix
    pub fn from_token(token: &str) -> Result<Self, ConfigurationError> {
        if token.starts_with("xoxb-") {
            Ok(TokenType::Bot)
        } else if token.starts_with("xoxp-") {
            Ok(TokenType::User)
        } else if token.starts_with("xapp-") {
            Ok(TokenType::App)
        } else {
            Err(ConfigurationError::InvalidToken(
                "Token must start with xoxb-, xoxp-, or xapp-".to_string(),
            ))
        }
    }
}

/// Secure wrapper for Slack tokens
#[derive(Clone)]
pub struct SlackToken {
    token: SecretString,
    token_type: TokenType,
}

impl SlackToken {
    /// Create a new token
    pub fn new(token: impl Into<String>) -> Result<Self, ConfigurationError> {
        let token_str = token.into();
        let token_type = TokenType::from_token(&token_str)?;
        Ok(Self {
            token: SecretString::new(token_str),
            token_type,
        })
    }

    /// Get the token type
    pub fn token_type(&self) -> TokenType {
        self.token_type
    }

    /// Expose the token for use in requests
    pub(crate) fn expose(&self) -> &str {
        self.token.expose_secret()
    }
}

impl std::fmt::Debug for SlackToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "SlackToken({:?}, [REDACTED])", self.token_type)
    }
}

/// Socket Mode configuration
#[derive(Debug, Clone)]
pub struct SocketModeConfig {
    /// Enable Socket Mode
    pub enabled: bool,
    /// Ping interval
    pub ping_interval: Duration,
    /// Connection timeout
    pub connect_timeout: Duration,
    /// Maximum reconnection attempts
    pub max_reconnect_attempts: u32,
    /// Reconnection delay
    pub reconnect_delay: Duration,
}

impl Default for SocketModeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            ping_interval: Duration::from_secs(30),
            connect_timeout: Duration::from_secs(30),
            max_reconnect_attempts: 5,
            reconnect_delay: Duration::from_secs(5),
        }
    }
}

/// Configuration for the Slack client
#[derive(Clone)]
pub struct SlackConfig {
    /// Bot token for authentication (xoxb-*)
    pub(crate) bot_token: Option<SlackToken>,
    /// User token for user-level operations (xoxp-*)
    pub(crate) user_token: Option<SlackToken>,
    /// App-level token for Socket Mode (xapp-*)
    pub(crate) app_token: Option<SlackToken>,
    /// Signing secret for webhook verification
    pub(crate) signing_secret: Option<SecretString>,
    /// Client ID for OAuth flows
    pub(crate) client_id: Option<String>,
    /// Client secret for OAuth flows
    pub(crate) client_secret: Option<SecretString>,
    /// Base URL for API requests
    pub base_url: Url,
    /// Request timeout
    pub timeout: Duration,
    /// Maximum retries
    pub max_retries: u32,
    /// Default headers
    pub default_headers: HeaderMap,
    /// Socket Mode configuration
    pub socket_mode: SocketModeConfig,
}

impl std::fmt::Debug for SlackConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SlackConfig")
            .field("bot_token", &self.bot_token.as_ref().map(|t| t.token_type))
            .field("user_token", &self.user_token.as_ref().map(|t| t.token_type))
            .field("app_token", &self.app_token.as_ref().map(|t| t.token_type))
            .field("signing_secret", &self.signing_secret.is_some())
            .field("client_id", &self.client_id)
            .field("base_url", &self.base_url)
            .field("timeout", &self.timeout)
            .field("max_retries", &self.max_retries)
            .field("socket_mode", &self.socket_mode)
            .finish()
    }
}

impl Default for SlackConfig {
    fn default() -> Self {
        Self {
            bot_token: None,
            user_token: None,
            app_token: None,
            signing_secret: None,
            client_id: None,
            client_secret: None,
            base_url: Url::parse(crate::DEFAULT_BASE_URL).unwrap(),
            timeout: Duration::from_secs(crate::DEFAULT_TIMEOUT_SECS),
            max_retries: crate::DEFAULT_MAX_RETRIES,
            default_headers: HeaderMap::new(),
            socket_mode: SocketModeConfig::default(),
        }
    }
}

impl SlackConfig {
    /// Create a new configuration builder
    pub fn builder() -> SlackConfigBuilder {
        SlackConfigBuilder::new()
    }

    /// Create configuration from environment variables
    pub fn from_env() -> SlackResult<Self> {
        let mut builder = SlackConfigBuilder::new();

        // Bot token
        if let Ok(token) = std::env::var("SLACK_BOT_TOKEN") {
            builder = builder.bot_token(&token)?;
        }

        // User token
        if let Ok(token) = std::env::var("SLACK_USER_TOKEN") {
            builder = builder.user_token(&token)?;
        }

        // App token
        if let Ok(token) = std::env::var("SLACK_APP_TOKEN") {
            builder = builder.app_token(&token)?;
        }

        // Signing secret
        if let Ok(secret) = std::env::var("SLACK_SIGNING_SECRET") {
            builder = builder.signing_secret(&secret);
        }

        // Client ID/Secret
        if let Ok(id) = std::env::var("SLACK_CLIENT_ID") {
            builder = builder.client_id(&id);
        }
        if let Ok(secret) = std::env::var("SLACK_CLIENT_SECRET") {
            builder = builder.client_secret(&secret);
        }

        // Base URL
        if let Ok(url) = std::env::var("SLACK_BASE_URL") {
            builder = builder.base_url(&url)?;
        }

        // Timeout
        if let Ok(timeout) = std::env::var("SLACK_TIMEOUT") {
            if let Ok(secs) = timeout.parse::<u64>() {
                builder = builder.timeout(Duration::from_secs(secs));
            }
        }

        // Max retries
        if let Ok(retries) = std::env::var("SLACK_MAX_RETRIES") {
            if let Ok(n) = retries.parse::<u32>() {
                builder = builder.max_retries(n);
            }
        }

        builder.build()
    }

    /// Get the bot token if available
    pub fn bot_token(&self) -> Option<&SlackToken> {
        self.bot_token.as_ref()
    }

    /// Get the user token if available
    pub fn user_token(&self) -> Option<&SlackToken> {
        self.user_token.as_ref()
    }

    /// Get the app token if available
    pub fn app_token(&self) -> Option<&SlackToken> {
        self.app_token.as_ref()
    }

    /// Get the signing secret if available
    pub fn signing_secret(&self) -> Option<&SecretString> {
        self.signing_secret.as_ref()
    }

    /// Get the primary token (bot token preferred, then user token)
    pub fn primary_token(&self) -> Option<&SlackToken> {
        self.bot_token.as_ref().or(self.user_token.as_ref())
    }

    /// Build the full URL for an endpoint
    pub fn build_url(&self, endpoint: &str) -> String {
        let base = self.base_url.as_str().trim_end_matches('/');
        let path = endpoint.trim_start_matches('/');
        format!("{}/{}", base, path)
    }

    /// Validate the configuration
    pub fn validate(&self) -> SlackResult<()> {
        // At least one token should be present
        if self.bot_token.is_none() && self.user_token.is_none() {
            return Err(SlackError::Configuration(ConfigurationError::MissingToken));
        }

        // Socket Mode requires app token
        if self.socket_mode.enabled && self.app_token.is_none() {
            return Err(SlackError::SocketMode(
                crate::errors::SocketModeError::MissingAppToken,
            ));
        }

        Ok(())
    }
}

/// Builder for SlackConfig
#[derive(Default)]
pub struct SlackConfigBuilder {
    config: SlackConfig,
}

impl SlackConfigBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self {
            config: SlackConfig::default(),
        }
    }

    /// Set the bot token
    pub fn bot_token(mut self, token: &str) -> Result<Self, ConfigurationError> {
        self.config.bot_token = Some(SlackToken::new(token)?);
        Ok(self)
    }

    /// Set the user token
    pub fn user_token(mut self, token: &str) -> Result<Self, ConfigurationError> {
        self.config.user_token = Some(SlackToken::new(token)?);
        Ok(self)
    }

    /// Set the app token
    pub fn app_token(mut self, token: &str) -> Result<Self, ConfigurationError> {
        self.config.app_token = Some(SlackToken::new(token)?);
        Ok(self)
    }

    /// Set the signing secret
    pub fn signing_secret(mut self, secret: &str) -> Self {
        self.config.signing_secret = Some(SecretString::new(secret.to_string()));
        self
    }

    /// Set the client ID
    pub fn client_id(mut self, id: &str) -> Self {
        self.config.client_id = Some(id.to_string());
        self
    }

    /// Set the client secret
    pub fn client_secret(mut self, secret: &str) -> Self {
        self.config.client_secret = Some(SecretString::new(secret.to_string()));
        self
    }

    /// Set the base URL
    pub fn base_url(mut self, url: &str) -> Result<Self, ConfigurationError> {
        self.config.base_url =
            Url::parse(url).map_err(|e| ConfigurationError::InvalidConfiguration {
                message: format!("Invalid URL: {}", e),
            })?;
        Ok(self)
    }

    /// Set the timeout
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.config.timeout = timeout;
        self
    }

    /// Set the maximum retries
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.config.max_retries = retries;
        self
    }

    /// Add a default header
    pub fn default_header(mut self, name: &str, value: &str) -> Self {
        if let Ok(header_name) = name.parse::<http::header::HeaderName>() {
            if let Ok(header_value) = value.parse::<http::header::HeaderValue>() {
                self.config.default_headers.insert(header_name, header_value);
            }
        }
        self
    }

    /// Enable Socket Mode
    pub fn enable_socket_mode(mut self) -> Self {
        self.config.socket_mode.enabled = true;
        self
    }

    /// Configure Socket Mode
    pub fn socket_mode(mut self, config: SocketModeConfig) -> Self {
        self.config.socket_mode = config;
        self
    }

    /// Build the configuration
    pub fn build(self) -> SlackResult<SlackConfig> {
        self.config.validate()?;
        Ok(self.config)
    }

    /// Build the configuration without validation (for testing)
    pub fn build_unchecked(self) -> SlackConfig {
        self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_type_detection() {
        assert_eq!(TokenType::from_token("xoxb-123").unwrap(), TokenType::Bot);
        assert_eq!(TokenType::from_token("xoxp-456").unwrap(), TokenType::User);
        assert_eq!(TokenType::from_token("xapp-789").unwrap(), TokenType::App);
        assert!(TokenType::from_token("invalid").is_err());
    }

    #[test]
    fn test_config_builder() {
        let config = SlackConfigBuilder::new()
            .bot_token("xoxb-test-token-123")
            .unwrap()
            .timeout(Duration::from_secs(60))
            .max_retries(5)
            .build()
            .unwrap();

        assert!(config.bot_token.is_some());
        assert_eq!(config.timeout, Duration::from_secs(60));
        assert_eq!(config.max_retries, 5);
    }

    #[test]
    fn test_build_url() {
        let config = SlackConfigBuilder::new()
            .bot_token("xoxb-test")
            .unwrap()
            .build()
            .unwrap();

        assert_eq!(
            config.build_url("/chat.postMessage"),
            "https://slack.com/api/chat.postMessage"
        );
        assert_eq!(
            config.build_url("users.info"),
            "https://slack.com/api/users.info"
        );
    }

    #[test]
    fn test_validation_missing_token() {
        let result = SlackConfigBuilder::new().build();
        assert!(result.is_err());
    }
}
