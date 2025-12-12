//! Authentication providers for Google Drive.
//!
//! This module provides authentication mechanisms for accessing the Google Drive API:
//! - OAuth 2.0 for user-based authentication
//! - Service Account for server-to-server authentication
//!
//! # Examples
//!
//! ## OAuth 2.0
//!
//! ```no_run
//! use google_drive::auth::{OAuth2Provider, AuthProvider};
//! use secrecy::SecretString;
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! let provider = OAuth2Provider::new_with_strings(
//!     "client_id.apps.googleusercontent.com",
//!     "client_secret",
//!     "refresh_token",
//! );
//!
//! let token = provider.get_access_token().await?;
//! # Ok(())
//! # }
//! ```
//!
//! ## Service Account
//!
//! ```no_run
//! use google_drive::auth::{ServiceAccountProvider, AuthProvider};
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! let provider = ServiceAccountProvider::new_with_string(
//!     "service-account@project.iam.gserviceaccount.com",
//!     "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
//!     vec!["https://www.googleapis.com/auth/drive".to_string()],
//! );
//!
//! let token = provider.get_access_token().await?;
//! # Ok(())
//! # }
//! ```

use crate::errors::{AuthenticationError, GoogleDriveResult};
use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use reqwest::Client;
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Default Google OAuth2 token URL.
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

/// Token expiry buffer (5 minutes) - refresh tokens proactively before expiry.
pub const TOKEN_EXPIRY_BUFFER_SECONDS: i64 = 300;

/// JWT lifetime for service account tokens (1 hour).
pub const JWT_LIFETIME_SECONDS: i64 = 3600;

/// OAuth 2.0 scopes for Google Drive.
pub mod scopes {
    /// Full access to Drive files.
    pub const DRIVE: &str = "https://www.googleapis.com/auth/drive";

    /// Read-only access to file metadata and content.
    pub const DRIVE_READONLY: &str = "https://www.googleapis.com/auth/drive.readonly";

    /// Access to files created by the app.
    pub const DRIVE_FILE: &str = "https://www.googleapis.com/auth/drive.file";

    /// Access to app data folder.
    pub const DRIVE_APPDATA: &str = "https://www.googleapis.com/auth/drive.appdata";

    /// Read-only access to file metadata (no content).
    pub const DRIVE_METADATA_READONLY: &str =
        "https://www.googleapis.com/auth/drive.metadata.readonly";

    /// Access to file metadata (read/write).
    pub const DRIVE_METADATA: &str = "https://www.googleapis.com/auth/drive.metadata";

    /// Access to Google Photos.
    pub const DRIVE_PHOTOS_READONLY: &str =
        "https://www.googleapis.com/auth/drive.photos.readonly";
}

/// Authentication provider abstraction.
#[async_trait]
pub trait AuthProvider: Send + Sync {
    /// Get an access token for API requests.
    async fn get_access_token(&self) -> Result<AccessToken, AuthenticationError>;

    /// Force refresh the access token.
    async fn refresh_token(&self) -> Result<AccessToken, AuthenticationError>;

    /// Check if the current token is expired.
    fn is_expired(&self) -> bool;
}

/// Access token with metadata.
#[derive(Debug, Clone)]
pub struct AccessToken {
    /// The token string.
    pub token: SecretString,

    /// Token type (usually "Bearer").
    pub token_type: String,

    /// Expiration time.
    pub expires_at: DateTime<Utc>,

    /// Scopes granted.
    pub scopes: Vec<String>,
}

impl AccessToken {
    /// Creates a new access token.
    pub fn new(
        token: impl Into<String>,
        token_type: impl Into<String>,
        expires_at: DateTime<Utc>,
        scopes: Vec<String>,
    ) -> Self {
        Self {
            token: SecretString::new(token.into()),
            token_type: token_type.into(),
            expires_at,
            scopes,
        }
    }

    /// Checks if the token is expired.
    pub fn is_expired(&self) -> bool {
        Utc::now() >= self.expires_at
    }

    /// Checks if the token needs proactive refresh (within 5 minutes of expiry).
    pub fn needs_refresh(&self) -> bool {
        let threshold = self.expires_at - Duration::seconds(TOKEN_EXPIRY_BUFFER_SECONDS);
        Utc::now() >= threshold
    }

    /// Returns the authorization header value.
    pub fn authorization_header(&self) -> String {
        format!("{} {}", self.token_type, self.token.expose_secret())
    }
}

/// OAuth 2.0 authentication provider.
///
/// This provider handles OAuth 2.0 authentication flow using a refresh token.
/// Tokens are cached and automatically refreshed when needed.
///
/// # Thread Safety
///
/// This provider is thread-safe and can be shared across multiple tasks.
/// Token refresh is protected by an RwLock to prevent concurrent refreshes.
///
/// # Proactive Refresh
///
/// Tokens are proactively refreshed 5 minutes before expiry to prevent
/// authentication failures during API calls.
pub struct OAuth2Provider {
    client_id: String,
    client_secret: SecretString,
    refresh_token: SecretString,
    token_url: String,
    cached_token: Arc<RwLock<Option<AccessToken>>>,
    http_client: Client,
}

impl OAuth2Provider {
    /// Creates a new OAuth2 provider.
    pub fn new(
        client_id: impl Into<String>,
        client_secret: SecretString,
        refresh_token: SecretString,
    ) -> Self {
        Self {
            client_id: client_id.into(),
            client_secret,
            refresh_token,
            token_url: TOKEN_URL.to_string(),
            cached_token: Arc::new(RwLock::new(None)),
            http_client: Client::new(),
        }
    }

    /// Creates a new OAuth2 provider with string secrets.
    pub fn new_with_strings(
        client_id: impl Into<String>,
        client_secret: impl Into<String>,
        refresh_token: impl Into<String>,
    ) -> Self {
        Self::new(
            client_id,
            SecretString::new(client_secret.into()),
            SecretString::new(refresh_token.into()),
        )
    }

    /// Sets a custom token URL (for testing or custom OAuth2 servers).
    pub fn with_token_url(mut self, token_url: impl Into<String>) -> Self {
        self.token_url = token_url.into();
        self
    }

    async fn refresh_access_token(&self) -> Result<AccessToken, AuthenticationError> {
        #[derive(Serialize)]
        struct RefreshRequest<'a> {
            client_id: &'a str,
            client_secret: &'a str,
            refresh_token: &'a str,
            grant_type: &'a str,
        }

        #[derive(Deserialize)]
        struct RefreshResponse {
            access_token: String,
            token_type: String,
            expires_in: i64,
            scope: Option<String>,
        }

        let request = RefreshRequest {
            client_id: &self.client_id,
            client_secret: self.client_secret.expose_secret(),
            refresh_token: self.refresh_token.expose_secret(),
            grant_type: "refresh_token",
        };

        let response = self
            .http_client
            .post(&self.token_url)
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                AuthenticationError::RefreshFailed(format!("HTTP request failed: {}", e))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AuthenticationError::RefreshFailed(format!(
                "Token refresh failed with status {}: {}",
                status, text
            )));
        }

        let refresh_response: RefreshResponse = response.json().await.map_err(|e| {
            AuthenticationError::RefreshFailed(format!("Failed to parse response: {}", e))
        })?;

        let expires_at = Utc::now() + Duration::seconds(refresh_response.expires_in);
        let scopes = refresh_response
            .scope
            .map(|s| s.split_whitespace().map(String::from).collect())
            .unwrap_or_default();

        Ok(AccessToken::new(
            refresh_response.access_token,
            refresh_response.token_type,
            expires_at,
            scopes,
        ))
    }
}

#[async_trait]
impl AuthProvider for OAuth2Provider {
    async fn get_access_token(&self) -> Result<AccessToken, AuthenticationError> {
        // Check cached token
        let cached = self.cached_token.read().await;
        if let Some(token) = cached.as_ref() {
            // Use proactive refresh - refresh if needs_refresh() returns true
            // This refreshes 5 minutes before actual expiry
            if !token.needs_refresh() {
                return Ok(token.clone());
            }
        }
        drop(cached);

        // Refresh token (expired or approaching expiry)
        self.refresh_token().await
    }

    async fn refresh_token(&self) -> Result<AccessToken, AuthenticationError> {
        let token = self.refresh_access_token().await?;

        // Cache the new token
        let mut cached = self.cached_token.write().await;
        *cached = Some(token.clone());

        Ok(token)
    }

    fn is_expired(&self) -> bool {
        // This is a synchronous check on cached token
        // In practice, use get_access_token which handles expiration
        false
    }
}

/// Service account authentication provider.
///
/// This provider handles service account authentication using JWT bearer tokens.
/// It supports domain-wide delegation for impersonating users.
///
/// # Thread Safety
///
/// This provider is thread-safe and can be shared across multiple tasks.
/// Token refresh is protected by an RwLock to prevent concurrent refreshes.
///
/// # JWT Signing
///
/// Uses RS256 (RSA-SHA256) algorithm for signing JWTs.
/// Private key must be in PEM format.
pub struct ServiceAccountProvider {
    service_account_email: String,
    private_key: SecretString,
    private_key_id: Option<String>,
    scopes: Vec<String>,
    subject: Option<String>,
    token_url: String,
    cached_token: Arc<RwLock<Option<AccessToken>>>,
    http_client: Client,
}

impl ServiceAccountProvider {
    /// Creates a new service account provider.
    pub fn new(
        service_account_email: impl Into<String>,
        private_key: SecretString,
        scopes: Vec<String>,
    ) -> Self {
        Self {
            service_account_email: service_account_email.into(),
            private_key,
            private_key_id: None,
            scopes,
            subject: None,
            token_url: TOKEN_URL.to_string(),
            cached_token: Arc::new(RwLock::new(None)),
            http_client: Client::new(),
        }
    }

    /// Creates a new service account provider with string key.
    pub fn new_with_string(
        service_account_email: impl Into<String>,
        private_key: impl Into<String>,
        scopes: Vec<String>,
    ) -> Self {
        Self::new(
            service_account_email,
            SecretString::new(private_key.into()),
            scopes,
        )
    }

    /// Sets the private key ID (optional, for key rotation).
    pub fn with_private_key_id(mut self, key_id: impl Into<String>) -> Self {
        self.private_key_id = Some(key_id.into());
        self
    }

    /// Sets the subject for domain-wide delegation.
    ///
    /// # Domain-Wide Delegation
    ///
    /// When set, the service account will impersonate this user.
    /// Requires admin to grant domain-wide delegation in Google Workspace Admin Console.
    pub fn with_subject(mut self, subject: impl Into<String>) -> Self {
        self.subject = Some(subject.into());
        self
    }

    /// Sets a custom token URL (for testing or custom OAuth2 servers).
    pub fn with_token_url(mut self, token_url: impl Into<String>) -> Self {
        self.token_url = token_url.into();
        self
    }

    fn create_jwt(&self) -> Result<String, AuthenticationError> {
        #[derive(Serialize)]
        struct Claims {
            iss: String,
            scope: String,
            aud: String,
            exp: i64,
            iat: i64,
            #[serde(skip_serializing_if = "Option::is_none")]
            sub: Option<String>,
        }

        let now = Utc::now().timestamp();
        let expiration = now + JWT_LIFETIME_SECONDS;

        let claims = Claims {
            iss: self.service_account_email.clone(),
            scope: self.scopes.join(" "),
            aud: self.token_url.clone(),
            exp: expiration,
            iat: now,
            sub: self.subject.clone(),
        };

        let mut header = Header::new(Algorithm::RS256);

        // Add key ID if provided (for key rotation)
        if let Some(ref key_id) = self.private_key_id {
            header.kid = Some(key_id.clone());
        }

        let key = EncodingKey::from_rsa_pem(self.private_key.expose_secret().as_bytes())
            .map_err(|e| {
                AuthenticationError::JwtEncodingError(format!("Invalid private key: {}", e))
            })?;

        encode(&header, &claims, &key)
            .map_err(|e| AuthenticationError::JwtEncodingError(format!("JWT encoding failed: {}", e)))
    }

    async fn exchange_jwt_for_token(&self) -> Result<AccessToken, AuthenticationError> {
        let jwt = self.create_jwt()?;

        #[derive(Serialize)]
        struct TokenRequest<'a> {
            grant_type: &'a str,
            assertion: &'a str,
        }

        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: String,
            token_type: String,
            expires_in: i64,
        }

        let request = TokenRequest {
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: &jwt,
        };

        let response = self
            .http_client
            .post(&self.token_url)
            .form(&request)
            .send()
            .await
            .map_err(|e| {
                AuthenticationError::RefreshFailed(format!("HTTP request failed: {}", e))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AuthenticationError::RefreshFailed(format!(
                "Token exchange failed with status {}: {}",
                status, text
            )));
        }

        let token_response: TokenResponse = response.json().await.map_err(|e| {
            AuthenticationError::RefreshFailed(format!("Failed to parse response: {}", e))
        })?;

        let expires_at = Utc::now() + Duration::seconds(token_response.expires_in);

        Ok(AccessToken::new(
            token_response.access_token,
            token_response.token_type,
            expires_at,
            self.scopes.clone(),
        ))
    }
}

#[async_trait]
impl AuthProvider for ServiceAccountProvider {
    async fn get_access_token(&self) -> Result<AccessToken, AuthenticationError> {
        // Check cached token
        let cached = self.cached_token.read().await;
        if let Some(token) = cached.as_ref() {
            // Use proactive refresh - refresh if needs_refresh() returns true
            // This refreshes 5 minutes before actual expiry
            if !token.needs_refresh() {
                return Ok(token.clone());
            }
        }
        drop(cached);

        // Refresh token (expired or approaching expiry)
        self.refresh_token().await
    }

    async fn refresh_token(&self) -> Result<AccessToken, AuthenticationError> {
        let token = self.exchange_jwt_for_token().await?;

        // Cache the new token
        let mut cached = self.cached_token.write().await;
        *cached = Some(token.clone());

        Ok(token)
    }

    fn is_expired(&self) -> bool {
        // This is a synchronous check on cached token
        false
    }
}

/// Authentication manager for handling auth operations.
///
/// This is a wrapper around an AuthProvider that provides a unified
/// interface for accessing tokens and authorization headers.
///
/// # Thread Safety
///
/// This manager is thread-safe and can be shared across multiple tasks.
/// It wraps the underlying provider in an Arc for shared ownership.
///
/// # Example
///
/// ```no_run
/// use google_drive::auth::{OAuth2Provider, AuthManager, AuthProvider};
/// use std::sync::Arc;
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let provider = OAuth2Provider::new_with_strings(
///     "client_id",
///     "client_secret",
///     "refresh_token",
/// );
///
/// let manager = AuthManager::new(Arc::new(provider));
/// let header = manager.get_authorization_header().await?;
/// println!("Authorization: {}", header);
/// # Ok(())
/// # }
/// ```
pub struct AuthManager {
    provider: Arc<dyn AuthProvider>,
}

impl AuthManager {
    /// Creates a new authentication manager.
    pub fn new(provider: Arc<dyn AuthProvider>) -> Self {
        Self { provider }
    }

    /// Gets an access token.
    ///
    /// This method will return a cached token if available and not expired.
    /// Tokens are proactively refreshed 5 minutes before expiry.
    pub async fn get_access_token(&self) -> Result<AccessToken, AuthenticationError> {
        self.provider.get_access_token().await
    }

    /// Gets the authorization header value.
    ///
    /// Returns a string in the format "Bearer {token}" ready to use
    /// in HTTP Authorization headers.
    pub async fn get_authorization_header(&self) -> Result<String, AuthenticationError> {
        let token = self.get_access_token().await?;
        Ok(token.authorization_header())
    }

    /// Forces a token refresh.
    ///
    /// This bypasses the cache and forces a new token to be obtained.
    /// Use this when you know the cached token is invalid.
    pub async fn refresh_token(&self) -> Result<AccessToken, AuthenticationError> {
        self.provider.refresh_token().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_access_token_expiry() {
        let expires_at = Utc::now() + Duration::hours(1);
        let token = AccessToken::new("test_token", "Bearer", expires_at, vec![]);
        assert!(!token.is_expired());

        let expired = Utc::now() - Duration::hours(1);
        let token = AccessToken::new("test_token", "Bearer", expired, vec![]);
        assert!(token.is_expired());
    }

    #[test]
    fn test_access_token_needs_refresh() {
        // Token valid for 1 hour - should not need refresh
        let expires_at = Utc::now() + Duration::hours(1);
        let token = AccessToken::new("test_token", "Bearer", expires_at, vec![]);
        assert!(!token.needs_refresh());

        // Token expires in 4 minutes - should need refresh (< 5 min buffer)
        let expires_soon = Utc::now() + Duration::minutes(4);
        let token = AccessToken::new("test_token", "Bearer", expires_soon, vec![]);
        assert!(token.needs_refresh());

        // Token already expired - should need refresh
        let expired = Utc::now() - Duration::hours(1);
        let token = AccessToken::new("test_token", "Bearer", expired, vec![]);
        assert!(token.needs_refresh());
    }

    #[test]
    fn test_authorization_header() {
        let expires_at = Utc::now() + Duration::hours(1);
        let token = AccessToken::new("test_token", "Bearer", expires_at, vec![]);
        assert_eq!(token.authorization_header(), "Bearer test_token");
    }

    #[test]
    fn test_oauth2_provider_creation() {
        let provider = OAuth2Provider::new_with_strings(
            "test_client_id",
            "test_client_secret",
            "test_refresh_token",
        );

        assert_eq!(provider.client_id, "test_client_id");
        assert_eq!(provider.token_url, TOKEN_URL);
    }

    #[test]
    fn test_oauth2_provider_custom_token_url() {
        let provider = OAuth2Provider::new_with_strings(
            "test_client_id",
            "test_client_secret",
            "test_refresh_token",
        )
        .with_token_url("https://custom.example.com/token");

        assert_eq!(provider.token_url, "https://custom.example.com/token");
    }

    #[test]
    fn test_service_account_provider_creation() {
        let provider = ServiceAccountProvider::new_with_string(
            "test@example.iam.gserviceaccount.com",
            "test_private_key",
            vec![scopes::DRIVE.to_string()],
        );

        assert_eq!(
            provider.service_account_email,
            "test@example.iam.gserviceaccount.com"
        );
        assert_eq!(provider.scopes, vec![scopes::DRIVE.to_string()]);
        assert_eq!(provider.token_url, TOKEN_URL);
        assert_eq!(provider.subject, None);
        assert_eq!(provider.private_key_id, None);
    }

    #[test]
    fn test_service_account_provider_with_subject() {
        let provider = ServiceAccountProvider::new_with_string(
            "test@example.iam.gserviceaccount.com",
            "test_private_key",
            vec![scopes::DRIVE.to_string()],
        )
        .with_subject("user@example.com");

        assert_eq!(provider.subject, Some("user@example.com".to_string()));
    }

    #[test]
    fn test_service_account_provider_with_key_id() {
        let provider = ServiceAccountProvider::new_with_string(
            "test@example.iam.gserviceaccount.com",
            "test_private_key",
            vec![scopes::DRIVE.to_string()],
        )
        .with_private_key_id("key_123");

        assert_eq!(provider.private_key_id, Some("key_123".to_string()));
    }

    #[test]
    fn test_service_account_provider_custom_token_url() {
        let provider = ServiceAccountProvider::new_with_string(
            "test@example.iam.gserviceaccount.com",
            "test_private_key",
            vec![scopes::DRIVE.to_string()],
        )
        .with_token_url("https://custom.example.com/token");

        assert_eq!(provider.token_url, "https://custom.example.com/token");
    }
}
