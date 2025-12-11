//! Authentication management for the Slack client.
//!
//! Handles token management, OAuth flows, and authorization headers.

use crate::config::{SlackConfig, SlackToken, TokenType};
use crate::errors::{AuthenticationError, SlackError, SlackResult};
use http::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use secrecy::{ExposeSecret, SecretString};
use std::sync::Arc;

/// Authentication manager for Slack API requests
#[derive(Clone)]
pub struct AuthManager {
    config: Arc<SlackConfig>,
}

impl AuthManager {
    /// Create a new authentication manager
    pub fn new(config: Arc<SlackConfig>) -> Self {
        Self { config }
    }

    /// Get headers for API request with bot token
    pub fn get_bot_headers(&self) -> SlackResult<HeaderMap> {
        let token = self
            .config
            .bot_token()
            .ok_or(SlackError::Authentication(AuthenticationError::InvalidAuth))?;
        self.build_headers(token)
    }

    /// Get headers for API request with user token
    pub fn get_user_headers(&self) -> SlackResult<HeaderMap> {
        let token = self
            .config
            .user_token()
            .ok_or(SlackError::Authentication(AuthenticationError::InvalidAuth))?;
        self.build_headers(token)
    }

    /// Get headers for API request with app token (Socket Mode)
    pub fn get_app_headers(&self) -> SlackResult<HeaderMap> {
        let token = self
            .config
            .app_token()
            .ok_or(SlackError::Authentication(AuthenticationError::InvalidAuth))?;
        self.build_headers(token)
    }

    /// Get headers using the primary token (bot preferred, then user)
    pub fn get_primary_headers(&self) -> SlackResult<HeaderMap> {
        let token = self
            .config
            .primary_token()
            .ok_or(SlackError::Authentication(AuthenticationError::InvalidAuth))?;
        self.build_headers(token)
    }

    /// Build headers with the given token
    fn build_headers(&self, token: &SlackToken) -> SlackResult<HeaderMap> {
        let mut headers = self.config.default_headers.clone();

        // Add authorization header
        let auth_value = format!("Bearer {}", token.expose());
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&auth_value).map_err(|_| {
                SlackError::Authentication(AuthenticationError::InvalidAuth)
            })?,
        );

        // Add content type if not present
        if !headers.contains_key(CONTENT_TYPE) {
            headers.insert(
                CONTENT_TYPE,
                HeaderValue::from_static("application/json; charset=utf-8"),
            );
        }

        Ok(headers)
    }

    /// Get the token type for a specific token
    pub fn get_token_type(&self, token_kind: TokenKind) -> Option<TokenType> {
        match token_kind {
            TokenKind::Bot => self.config.bot_token().map(|t| t.token_type()),
            TokenKind::User => self.config.user_token().map(|t| t.token_type()),
            TokenKind::App => self.config.app_token().map(|t| t.token_type()),
        }
    }

    /// Check if a specific token type is available
    pub fn has_token(&self, token_kind: TokenKind) -> bool {
        match token_kind {
            TokenKind::Bot => self.config.bot_token().is_some(),
            TokenKind::User => self.config.user_token().is_some(),
            TokenKind::App => self.config.app_token().is_some(),
        }
    }

    /// Validate that required tokens are present for an operation
    pub fn validate_tokens(&self, required: &[TokenKind]) -> SlackResult<()> {
        for kind in required {
            if !self.has_token(*kind) {
                return Err(SlackError::Authentication(AuthenticationError::InvalidAuth));
            }
        }
        Ok(())
    }
}

/// Token kind selector
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenKind {
    /// Bot token (xoxb-*)
    Bot,
    /// User token (xoxp-*)
    User,
    /// App-level token (xapp-*)
    App,
}

impl std::fmt::Debug for AuthManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthManager")
            .field("has_bot_token", &self.has_token(TokenKind::Bot))
            .field("has_user_token", &self.has_token(TokenKind::User))
            .field("has_app_token", &self.has_token(TokenKind::App))
            .finish()
    }
}

/// OAuth helper for Slack OAuth 2.0 flows
pub struct OAuthHelper {
    client_id: String,
    client_secret: SecretString,
    redirect_uri: Option<String>,
}

impl OAuthHelper {
    /// Create a new OAuth helper
    pub fn new(client_id: String, client_secret: String) -> Self {
        Self {
            client_id,
            client_secret: SecretString::new(client_secret),
            redirect_uri: None,
        }
    }

    /// Set the redirect URI
    pub fn with_redirect_uri(mut self, uri: String) -> Self {
        self.redirect_uri = Some(uri);
        self
    }

    /// Build the authorization URL for OAuth
    pub fn build_authorize_url(&self, scopes: &[&str], state: Option<&str>) -> String {
        let mut url = format!(
            "https://slack.com/oauth/v2/authorize?client_id={}&scope={}",
            self.client_id,
            scopes.join(",")
        );

        if let Some(redirect) = &self.redirect_uri {
            url.push_str(&format!("&redirect_uri={}", urlencoding::encode(redirect)));
        }

        if let Some(state) = state {
            url.push_str(&format!("&state={}", urlencoding::encode(state)));
        }

        url
    }

    /// Get the client ID
    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    /// Expose the client secret (use with caution)
    pub(crate) fn expose_client_secret(&self) -> &str {
        self.client_secret.expose_secret()
    }
}

impl std::fmt::Debug for OAuthHelper {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OAuthHelper")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[REDACTED]")
            .field("redirect_uri", &self.redirect_uri)
            .finish()
    }
}

/// URL encoding helper
mod urlencoding {
    pub fn encode(s: &str) -> String {
        let mut result = String::new();
        for c in s.chars() {
            match c {
                'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => {
                    result.push(c);
                }
                _ => {
                    for b in c.to_string().as_bytes() {
                        result.push_str(&format!("%{:02X}", b));
                    }
                }
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::SlackConfigBuilder;

    fn test_config() -> Arc<SlackConfig> {
        Arc::new(
            SlackConfigBuilder::new()
                .bot_token("xoxb-test-token-123")
                .unwrap()
                .build_unchecked(),
        )
    }

    #[test]
    fn test_auth_manager_get_bot_headers() {
        let auth = AuthManager::new(test_config());
        let headers = auth.get_bot_headers().unwrap();

        assert!(headers.contains_key(AUTHORIZATION));
        let auth_value = headers.get(AUTHORIZATION).unwrap().to_str().unwrap();
        assert!(auth_value.starts_with("Bearer "));
    }

    #[test]
    fn test_auth_manager_has_token() {
        let auth = AuthManager::new(test_config());

        assert!(auth.has_token(TokenKind::Bot));
        assert!(!auth.has_token(TokenKind::User));
        assert!(!auth.has_token(TokenKind::App));
    }

    #[test]
    fn test_oauth_helper_build_url() {
        let helper = OAuthHelper::new("client123".to_string(), "secret456".to_string())
            .with_redirect_uri("https://example.com/callback".to_string());

        let url = helper.build_authorize_url(&["chat:write", "channels:read"], Some("state123"));

        assert!(url.contains("client_id=client123"));
        assert!(url.contains("scope=chat:write,channels:read"));
        assert!(url.contains("redirect_uri="));
        assert!(url.contains("state=state123"));
    }

    #[test]
    fn test_validate_tokens() {
        let auth = AuthManager::new(test_config());

        assert!(auth.validate_tokens(&[TokenKind::Bot]).is_ok());
        assert!(auth.validate_tokens(&[TokenKind::User]).is_err());
    }
}
