//! Authentication mechanisms for SMTP.
//!
//! Supports multiple authentication methods:
//! - PLAIN (RFC 4616)
//! - LOGIN (obsolete but widely used)
//! - CRAM-MD5 (RFC 2195)
//! - XOAUTH2 (Google/Microsoft)
//! - OAUTHBEARER (RFC 7628)

use async_trait::async_trait;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use hmac::{Hmac, Mac};
use md5::Md5;
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use std::fmt;

use crate::errors::{SmtpError, SmtpErrorKind, SmtpResult};

/// Authentication methods supported by the SMTP client.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    /// PLAIN authentication (RFC 4616).
    Plain,
    /// LOGIN authentication (obsolete).
    Login,
    /// CRAM-MD5 challenge-response.
    CramMd5,
    /// Google/Microsoft XOAUTH2.
    XOAuth2,
    /// OAuth 2.0 Bearer Token (RFC 7628).
    OAuthBearer,
}

impl AuthMethod {
    /// Returns the SMTP AUTH mechanism name.
    pub fn mechanism_name(&self) -> &'static str {
        match self {
            AuthMethod::Plain => "PLAIN",
            AuthMethod::Login => "LOGIN",
            AuthMethod::CramMd5 => "CRAM-MD5",
            AuthMethod::XOAuth2 => "XOAUTH2",
            AuthMethod::OAuthBearer => "OAUTHBEARER",
        }
    }

    /// Returns the priority for auto-selection (higher is better).
    pub fn priority(&self) -> u8 {
        match self {
            AuthMethod::OAuthBearer => 5,
            AuthMethod::XOAuth2 => 4,
            AuthMethod::CramMd5 => 3,
            AuthMethod::Plain => 2,
            AuthMethod::Login => 1,
        }
    }

    /// Parses from SMTP capability string.
    pub fn from_capability(s: &str) -> Option<Self> {
        match s.to_uppercase().as_str() {
            "PLAIN" => Some(AuthMethod::Plain),
            "LOGIN" => Some(AuthMethod::Login),
            "CRAM-MD5" => Some(AuthMethod::CramMd5),
            "XOAUTH2" => Some(AuthMethod::XOAuth2),
            "OAUTHBEARER" => Some(AuthMethod::OAuthBearer),
            _ => None,
        }
    }

    /// Returns true if this method requires TLS.
    pub fn requires_tls(&self) -> bool {
        matches!(self, AuthMethod::Plain | AuthMethod::Login)
    }
}

impl fmt::Display for AuthMethod {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.mechanism_name())
    }
}

/// Credential types for authentication.
#[derive(Clone)]
pub enum Credentials {
    /// Plain username and password.
    Plain {
        /// Username.
        username: String,
        /// Password (protected).
        password: SecretString,
    },
    /// OAuth2 token (XOAUTH2 format).
    XOAuth2 {
        /// Username/email.
        username: String,
        /// Access token (protected).
        access_token: SecretString,
    },
    /// OAuth 2.0 Bearer Token.
    OAuthBearer {
        /// Access token (protected).
        access_token: SecretString,
    },
}

impl Credentials {
    /// Creates plain credentials.
    pub fn plain(username: impl Into<String>, password: impl Into<String>) -> Self {
        Self::Plain {
            username: username.into(),
            password: SecretString::new(password.into()),
        }
    }

    /// Creates XOAUTH2 credentials.
    pub fn xoauth2(username: impl Into<String>, access_token: impl Into<String>) -> Self {
        Self::XOAuth2 {
            username: username.into(),
            access_token: SecretString::new(access_token.into()),
        }
    }

    /// Creates OAUTHBEARER credentials.
    pub fn oauth_bearer(access_token: impl Into<String>) -> Self {
        Self::OAuthBearer {
            access_token: SecretString::new(access_token.into()),
        }
    }

    /// Returns the username if applicable.
    pub fn username(&self) -> Option<&str> {
        match self {
            Credentials::Plain { username, .. } => Some(username),
            Credentials::XOAuth2 { username, .. } => Some(username),
            Credentials::OAuthBearer { .. } => None,
        }
    }

    /// Returns the compatible authentication methods.
    pub fn compatible_methods(&self) -> Vec<AuthMethod> {
        match self {
            Credentials::Plain { .. } => vec![
                AuthMethod::Plain,
                AuthMethod::Login,
                AuthMethod::CramMd5,
            ],
            Credentials::XOAuth2 { .. } => vec![AuthMethod::XOAuth2],
            Credentials::OAuthBearer { .. } => vec![AuthMethod::OAuthBearer],
        }
    }
}

impl fmt::Debug for Credentials {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Credentials::Plain { username, .. } => f
                .debug_struct("Plain")
                .field("username", username)
                .field("password", &"[REDACTED]")
                .finish(),
            Credentials::XOAuth2 { username, .. } => f
                .debug_struct("XOAuth2")
                .field("username", username)
                .field("access_token", &"[REDACTED]")
                .finish(),
            Credentials::OAuthBearer { .. } => f
                .debug_struct("OAuthBearer")
                .field("access_token", &"[REDACTED]")
                .finish(),
        }
    }
}

/// Provider for credentials with optional token refresh.
#[async_trait]
pub trait CredentialProvider: Send + Sync + fmt::Debug {
    /// Returns the current credentials.
    async fn get_credentials(&self) -> SmtpResult<Credentials>;

    /// Refreshes credentials if needed (e.g., OAuth token refresh).
    async fn refresh(&self) -> SmtpResult<()>;

    /// Returns true if credentials need refresh.
    fn needs_refresh(&self) -> bool {
        false
    }
}

/// Static credential provider (no refresh).
#[derive(Debug, Clone)]
pub struct StaticCredentialProvider {
    credentials: Credentials,
}

impl StaticCredentialProvider {
    /// Creates a new static provider.
    pub fn new(credentials: Credentials) -> Self {
        Self { credentials }
    }

    /// Creates a provider with plain credentials.
    pub fn plain(username: impl Into<String>, password: impl Into<String>) -> Self {
        Self::new(Credentials::plain(username, password))
    }
}

#[async_trait]
impl CredentialProvider for StaticCredentialProvider {
    async fn get_credentials(&self) -> SmtpResult<Credentials> {
        Ok(self.credentials.clone())
    }

    async fn refresh(&self) -> SmtpResult<()> {
        Ok(()) // No-op for static credentials
    }
}

/// Authentication mechanism implementation.
pub struct Authenticator;

impl Authenticator {
    /// Generates the initial response for PLAIN authentication.
    pub fn plain_initial_response(username: &str, password: &SecretString) -> String {
        // Format: \0username\0password
        let response = format!("\0{}\0{}", username, password.expose_secret());
        BASE64.encode(response)
    }

    /// Generates LOGIN username response.
    pub fn login_username(username: &str) -> String {
        BASE64.encode(username)
    }

    /// Generates LOGIN password response.
    pub fn login_password(password: &SecretString) -> String {
        BASE64.encode(password.expose_secret())
    }

    /// Generates CRAM-MD5 response.
    pub fn cram_md5_response(
        challenge: &str,
        username: &str,
        password: &SecretString,
    ) -> SmtpResult<String> {
        // Decode the challenge
        let challenge_bytes = BASE64
            .decode(challenge)
            .map_err(|e| SmtpError::authentication(format!("Invalid CRAM-MD5 challenge: {}", e)))?;

        // Create HMAC-MD5
        type HmacMd5 = Hmac<Md5>;
        let mut mac = HmacMd5::new_from_slice(password.expose_secret().as_bytes())
            .map_err(|e| SmtpError::authentication(format!("HMAC error: {}", e)))?;
        mac.update(&challenge_bytes);
        let result = mac.finalize();
        let digest = result.into_bytes();

        // Format: username space hex-digest
        let hex_digest: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
        let response = format!("{} {}", username, hex_digest);
        Ok(BASE64.encode(response))
    }

    /// Generates XOAUTH2 initial response.
    pub fn xoauth2_initial_response(username: &str, access_token: &SecretString) -> String {
        // Format: user=username\x01auth=Bearer token\x01\x01
        let response = format!(
            "user={}\x01auth=Bearer {}\x01\x01",
            username,
            access_token.expose_secret()
        );
        BASE64.encode(response)
    }

    /// Generates OAUTHBEARER initial response.
    pub fn oauth_bearer_initial_response(
        access_token: &SecretString,
        host: Option<&str>,
        port: Option<u16>,
    ) -> String {
        // Format: n,a=user,\x01host=hostname\x01port=port\x01auth=Bearer token\x01\x01
        let mut parts = vec!["n,".to_string()];

        if let Some(h) = host {
            parts.push(format!("\x01host={}", h));
        }
        if let Some(p) = port {
            parts.push(format!("\x01port={}", p));
        }
        parts.push(format!("\x01auth=Bearer {}\x01\x01", access_token.expose_secret()));

        let response = parts.join("");
        BASE64.encode(response)
    }

    /// Selects the best authentication method from available options.
    pub fn select_best_method(
        available: &[AuthMethod],
        credentials: &Credentials,
        tls_enabled: bool,
    ) -> SmtpResult<AuthMethod> {
        let compatible = credentials.compatible_methods();

        // Filter by compatibility and TLS requirement
        let mut candidates: Vec<_> = available
            .iter()
            .filter(|m| compatible.contains(m))
            .filter(|m| !m.requires_tls() || tls_enabled)
            .copied()
            .collect();

        if candidates.is_empty() {
            return Err(SmtpError::new(
                SmtpErrorKind::AuthMethodNotSupported,
                "No compatible authentication method available",
            ));
        }

        // Sort by priority (descending)
        candidates.sort_by(|a, b| b.priority().cmp(&a.priority()));

        Ok(candidates[0])
    }
}

/// OAuth2 token with expiry information.
#[derive(Debug, Clone)]
pub struct OAuth2Token {
    /// Access token.
    pub access_token: SecretString,
    /// Refresh token (optional).
    pub refresh_token: Option<SecretString>,
    /// Token expiry time (Unix timestamp).
    pub expires_at: Option<u64>,
    /// Token endpoint for refresh.
    pub token_endpoint: Option<String>,
}

impl OAuth2Token {
    /// Creates a new token.
    pub fn new(access_token: impl Into<String>) -> Self {
        Self {
            access_token: SecretString::new(access_token.into()),
            refresh_token: None,
            expires_at: None,
            token_endpoint: None,
        }
    }

    /// Sets the refresh token.
    pub fn with_refresh_token(mut self, token: impl Into<String>) -> Self {
        self.refresh_token = Some(SecretString::new(token.into()));
        self
    }

    /// Sets the expiry time.
    pub fn with_expires_at(mut self, timestamp: u64) -> Self {
        self.expires_at = Some(timestamp);
        self
    }

    /// Sets the token endpoint for refresh.
    pub fn with_token_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.token_endpoint = Some(endpoint.into());
        self
    }

    /// Returns true if the token is expired or will expire soon (5 min buffer).
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            // 5 minute buffer
            expires_at <= now + 300
        } else {
            false
        }
    }

    /// Returns true if the token can be refreshed.
    pub fn can_refresh(&self) -> bool {
        self.refresh_token.is_some() && self.token_endpoint.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_method_from_capability() {
        assert_eq!(
            AuthMethod::from_capability("PLAIN"),
            Some(AuthMethod::Plain)
        );
        assert_eq!(
            AuthMethod::from_capability("login"),
            Some(AuthMethod::Login)
        );
        assert_eq!(
            AuthMethod::from_capability("CRAM-MD5"),
            Some(AuthMethod::CramMd5)
        );
        assert_eq!(
            AuthMethod::from_capability("XOAUTH2"),
            Some(AuthMethod::XOAuth2)
        );
        assert_eq!(AuthMethod::from_capability("UNKNOWN"), None);
    }

    #[test]
    fn test_plain_initial_response() {
        let password = SecretString::new("password".to_string());
        let response = Authenticator::plain_initial_response("user", &password);
        // \0user\0password in base64
        let decoded = BASE64.decode(&response).unwrap();
        assert_eq!(decoded, b"\0user\0password");
    }

    #[test]
    fn test_xoauth2_initial_response() {
        let token = SecretString::new("test_token".to_string());
        let response = Authenticator::xoauth2_initial_response("user@example.com", &token);
        let decoded = String::from_utf8(BASE64.decode(&response).unwrap()).unwrap();
        assert!(decoded.contains("user=user@example.com"));
        assert!(decoded.contains("auth=Bearer test_token"));
    }

    #[test]
    fn test_select_best_method() {
        let available = vec![AuthMethod::Plain, AuthMethod::Login, AuthMethod::CramMd5];
        let creds = Credentials::plain("user", "pass");

        // With TLS, should prefer CRAM-MD5
        let method = Authenticator::select_best_method(&available, &creds, true).unwrap();
        assert_eq!(method, AuthMethod::CramMd5);

        // Without TLS, only CRAM-MD5 is available
        let method = Authenticator::select_best_method(&available, &creds, false).unwrap();
        assert_eq!(method, AuthMethod::CramMd5);
    }

    #[test]
    fn test_oauth2_token_expiry() {
        let token = OAuth2Token::new("test")
            .with_expires_at(0); // Already expired
        assert!(token.is_expired());

        let future_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 3600; // 1 hour from now
        let token = OAuth2Token::new("test")
            .with_expires_at(future_time);
        assert!(!token.is_expired());
    }

    #[test]
    fn test_credentials_debug() {
        let creds = Credentials::plain("user", "secret_password");
        let debug_str = format!("{:?}", creds);
        assert!(debug_str.contains("[REDACTED]"));
        assert!(!debug_str.contains("secret_password"));
    }
}
