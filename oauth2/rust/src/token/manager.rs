//! Token Manager
//!
//! Manages token lifecycle including refresh, caching, and automatic renewal.

use async_trait::async_trait;
use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::core::{HttpMethod, HttpRequest, HttpTransport};
use crate::error::{OAuth2Error, ProtocolError, TokenError};
use crate::token::TokenStorage;
use crate::types::{
    ClientAuthMethod, OAuth2Config, RefreshTokenParams, StoredTokens, TokenResponse,
};
use crate::error::create_error_from_response;

/// Token manager interface.
#[async_trait]
pub trait TokenManager: Send + Sync {
    /// Get valid access token, refreshing if necessary.
    async fn get_access_token(&self, key: &str) -> Result<String, OAuth2Error>;

    /// Store tokens from a token response.
    async fn store_tokens(&self, key: &str, response: TokenResponse) -> Result<(), OAuth2Error>;

    /// Refresh tokens for a key.
    async fn refresh_tokens(&self, key: &str) -> Result<TokenResponse, OAuth2Error>;

    /// Delete tokens for a key.
    async fn delete_tokens(&self, key: &str) -> Result<bool, OAuth2Error>;

    /// Check if tokens exist and are valid.
    async fn has_valid_tokens(&self, key: &str) -> Result<bool, OAuth2Error>;

    /// Get stored tokens without automatic refresh.
    async fn get_stored_tokens(&self, key: &str) -> Result<Option<StoredTokens>, OAuth2Error>;
}

/// Token manager configuration.
#[derive(Debug, Clone)]
pub struct TokenManagerConfig {
    /// Buffer time before expiration to trigger refresh (default: 5 minutes).
    pub refresh_buffer: Duration,
    /// Whether to automatically refresh expired tokens.
    pub auto_refresh: bool,
}

impl Default for TokenManagerConfig {
    fn default() -> Self {
        Self {
            refresh_buffer: Duration::from_secs(300), // 5 minutes
            auto_refresh: true,
        }
    }
}

/// Default token manager implementation.
pub struct DefaultTokenManager<T: HttpTransport, S: TokenStorage> {
    oauth_config: OAuth2Config,
    manager_config: TokenManagerConfig,
    transport: Arc<T>,
    storage: Arc<S>,
}

impl<T: HttpTransport, S: TokenStorage> DefaultTokenManager<T, S> {
    /// Create new token manager.
    pub fn new(
        oauth_config: OAuth2Config,
        manager_config: TokenManagerConfig,
        transport: Arc<T>,
        storage: Arc<S>,
    ) -> Self {
        Self {
            oauth_config,
            manager_config,
            transport,
            storage,
        }
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    fn is_token_expired(&self, expires_at: Option<u64>) -> bool {
        match expires_at {
            Some(exp) => {
                let now = Self::now_ms();
                let buffer_ms = self.manager_config.refresh_buffer.as_millis() as u64;
                now + buffer_ms >= exp
            }
            None => false, // No expiration = never expires
        }
    }

    fn build_refresh_request_body(&self, refresh_token: &str) -> String {
        let mut params = vec![
            ("grant_type", "refresh_token".to_string()),
            ("refresh_token", refresh_token.to_string()),
        ];

        // Client credentials in body if using post method
        if self.oauth_config.credentials.auth_method == ClientAuthMethod::ClientSecretPost {
            params.push((
                "client_id",
                self.oauth_config.credentials.client_id.clone(),
            ));
            if let Some(secret) = &self.oauth_config.credentials.client_secret {
                use secrecy::ExposeSecret;
                params.push(("client_secret", secret.expose_secret().to_string()));
            }
        }

        params
            .into_iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(&v)))
            .collect::<Vec<_>>()
            .join("&")
    }

    fn build_refresh_request_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert(
            "content-type".to_string(),
            "application/x-www-form-urlencoded".to_string(),
        );
        headers.insert("accept".to_string(), "application/json".to_string());

        // Add Basic auth header if using that method
        if self.oauth_config.credentials.auth_method == ClientAuthMethod::ClientSecretBasic {
            if let Some(secret) = &self.oauth_config.credentials.client_secret {
                use secrecy::ExposeSecret;
                let credentials = format!(
                    "{}:{}",
                    self.oauth_config.credentials.client_id,
                    secret.expose_secret()
                );
                let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
                headers.insert("authorization".to_string(), format!("Basic {}", encoded));
            }
        }

        headers
    }

    fn token_response_to_stored(&self, response: TokenResponse) -> StoredTokens {
        let now = Self::now_ms();
        let expires_at = response.expires_in.map(|exp| now + (exp as u64 * 1000));

        StoredTokens {
            access_token: response.access_token,
            token_type: response.token_type,
            refresh_token: response.refresh_token,
            access_token_expires_at: expires_at,
            refresh_token_expires_at: None, // Most providers don't include this
            scope: response.scope,
            id_token: response.id_token,
            created_at: now,
            updated_at: now,
        }
    }
}

#[async_trait]
impl<T: HttpTransport, S: TokenStorage> TokenManager for DefaultTokenManager<T, S> {
    async fn get_access_token(&self, key: &str) -> Result<String, OAuth2Error> {
        let stored = self
            .storage
            .retrieve(key)
            .await?
            .ok_or_else(|| OAuth2Error::Token(TokenError::TokenNotFound))?;

        // Check if token is expired or about to expire
        if self.is_token_expired(stored.access_token_expires_at) {
            if self.manager_config.auto_refresh {
                // Try to refresh
                let refreshed = self.refresh_tokens(key).await?;
                return Ok(refreshed.access_token);
            } else {
                return Err(OAuth2Error::Token(TokenError::TokenExpired));
            }
        }

        Ok(stored.access_token)
    }

    async fn store_tokens(&self, key: &str, response: TokenResponse) -> Result<(), OAuth2Error> {
        let stored = self.token_response_to_stored(response);
        self.storage.store(key, stored).await
    }

    async fn refresh_tokens(&self, key: &str) -> Result<TokenResponse, OAuth2Error> {
        let stored = self
            .storage
            .retrieve(key)
            .await?
            .ok_or_else(|| OAuth2Error::Token(TokenError::TokenNotFound))?;

        let refresh_token = stored.refresh_token.ok_or_else(|| {
            OAuth2Error::Token(TokenError::RefreshFailed {
                message: "No refresh token available".to_string(),
            })
        })?;

        let body = self.build_refresh_request_body(&refresh_token);
        let headers = self.build_refresh_request_headers();

        let http_request = HttpRequest {
            method: HttpMethod::Post,
            url: self.oauth_config.provider.token_endpoint.clone(),
            headers,
            body: Some(body),
            timeout: Some(self.oauth_config.timeout),
        };

        let response = self.transport.send(http_request).await?;

        if response.status != 200 {
            return Err(create_error_from_response(response.status, &response.body));
        }

        let mut token_response: TokenResponse =
            serde_json::from_str(&response.body).map_err(|e| {
                OAuth2Error::Protocol(ProtocolError::InvalidJson {
                    message: e.to_string(),
                })
            })?;

        // Preserve refresh token if not returned in response
        if token_response.refresh_token.is_none() {
            token_response.refresh_token = Some(refresh_token);
        }

        // Store updated tokens
        self.store_tokens(key, token_response.clone()).await?;

        Ok(token_response)
    }

    async fn delete_tokens(&self, key: &str) -> Result<bool, OAuth2Error> {
        self.storage.delete(key).await
    }

    async fn has_valid_tokens(&self, key: &str) -> Result<bool, OAuth2Error> {
        match self.storage.retrieve(key).await? {
            Some(stored) => Ok(!self.is_token_expired(stored.access_token_expires_at)
                || stored.refresh_token.is_some()),
            None => Ok(false),
        }
    }

    async fn get_stored_tokens(&self, key: &str) -> Result<Option<StoredTokens>, OAuth2Error> {
        self.storage.retrieve(key).await
    }
}

/// Mock token manager for testing.
#[derive(Default)]
pub struct MockTokenManager {
    tokens: std::sync::Mutex<HashMap<String, StoredTokens>>,
    get_access_token_history: std::sync::Mutex<Vec<String>>,
    store_tokens_history: std::sync::Mutex<Vec<(String, TokenResponse)>>,
    refresh_history: std::sync::Mutex<Vec<String>>,
    next_access_token: std::sync::Mutex<Option<String>>,
    next_refresh_response: std::sync::Mutex<Option<TokenResponse>>,
    next_error: std::sync::Mutex<Option<OAuth2Error>>,
}

impl MockTokenManager {
    /// Create new mock token manager.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set next access token to return.
    pub fn set_next_access_token(&self, token: String) -> &Self {
        *self.next_access_token.lock().unwrap() = Some(token);
        self
    }

    /// Set next refresh response.
    pub fn set_next_refresh_response(&self, response: TokenResponse) -> &Self {
        *self.next_refresh_response.lock().unwrap() = Some(response);
        self
    }

    /// Set next error.
    pub fn set_next_error(&self, error: OAuth2Error) -> &Self {
        *self.next_error.lock().unwrap() = Some(error);
        self
    }

    /// Pre-populate tokens.
    pub fn add_tokens(&self, key: &str, tokens: StoredTokens) -> &Self {
        self.tokens.lock().unwrap().insert(key.to_string(), tokens);
        self
    }

    /// Get access token retrieval history.
    pub fn get_access_token_history(&self) -> Vec<String> {
        self.get_access_token_history.lock().unwrap().clone()
    }

    /// Get store tokens history.
    pub fn get_store_tokens_history(&self) -> Vec<(String, TokenResponse)> {
        self.store_tokens_history.lock().unwrap().clone()
    }

    /// Get refresh history.
    pub fn get_refresh_history(&self) -> Vec<String> {
        self.refresh_history.lock().unwrap().clone()
    }

    fn check_error(&self) -> Result<(), OAuth2Error> {
        if let Some(error) = self.next_error.lock().unwrap().take() {
            return Err(error);
        }
        Ok(())
    }
}

#[async_trait]
impl TokenManager for MockTokenManager {
    async fn get_access_token(&self, key: &str) -> Result<String, OAuth2Error> {
        self.check_error()?;

        self.get_access_token_history
            .lock()
            .unwrap()
            .push(key.to_string());

        if let Some(token) = self.next_access_token.lock().unwrap().take() {
            return Ok(token);
        }

        self.tokens
            .lock()
            .unwrap()
            .get(key)
            .map(|t| t.access_token.clone())
            .ok_or_else(|| OAuth2Error::Token(TokenError::TokenNotFound))
    }

    async fn store_tokens(&self, key: &str, response: TokenResponse) -> Result<(), OAuth2Error> {
        self.check_error()?;

        self.store_tokens_history
            .lock()
            .unwrap()
            .push((key.to_string(), response.clone()));

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let stored = StoredTokens {
            access_token: response.access_token,
            token_type: response.token_type,
            refresh_token: response.refresh_token,
            access_token_expires_at: response.expires_in.map(|exp| now + (exp as u64 * 1000)),
            refresh_token_expires_at: None,
            scope: response.scope,
            id_token: response.id_token,
            created_at: now,
            updated_at: now,
        };

        self.tokens.lock().unwrap().insert(key.to_string(), stored);
        Ok(())
    }

    async fn refresh_tokens(&self, key: &str) -> Result<TokenResponse, OAuth2Error> {
        self.check_error()?;

        self.refresh_history.lock().unwrap().push(key.to_string());

        if let Some(response) = self.next_refresh_response.lock().unwrap().take() {
            return Ok(response);
        }

        Ok(TokenResponse {
            access_token: format!("refreshed-token-for-{}", key),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: Some("new-refresh-token".to_string()),
            scope: None,
            id_token: None,
            extra: HashMap::new(),
        })
    }

    async fn delete_tokens(&self, key: &str) -> Result<bool, OAuth2Error> {
        self.check_error()?;
        Ok(self.tokens.lock().unwrap().remove(key).is_some())
    }

    async fn has_valid_tokens(&self, key: &str) -> Result<bool, OAuth2Error> {
        self.check_error()?;
        Ok(self.tokens.lock().unwrap().contains_key(key))
    }

    async fn get_stored_tokens(&self, key: &str) -> Result<Option<StoredTokens>, OAuth2Error> {
        self.check_error()?;
        Ok(self.tokens.lock().unwrap().get(key).cloned())
    }
}

/// Create mock token manager for testing.
pub fn create_mock_token_manager() -> MockTokenManager {
    MockTokenManager::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_tokens() -> StoredTokens {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        StoredTokens {
            access_token: "test-access-token".to_string(),
            token_type: "Bearer".to_string(),
            refresh_token: Some("test-refresh-token".to_string()),
            access_token_expires_at: Some(now + 3600000),
            refresh_token_expires_at: None,
            scope: Some("openid".to_string()),
            id_token: None,
            created_at: now,
            updated_at: now,
        }
    }

    #[tokio::test]
    async fn test_mock_get_access_token() {
        let manager = MockTokenManager::new();
        manager.add_tokens("user1", create_test_tokens());

        let token = manager.get_access_token("user1").await.unwrap();
        assert_eq!(token, "test-access-token");

        let history = manager.get_access_token_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0], "user1");
    }

    #[tokio::test]
    async fn test_mock_store_tokens() {
        let manager = MockTokenManager::new();

        let response = TokenResponse {
            access_token: "new-token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: None,
            scope: None,
            id_token: None,
            extra: HashMap::new(),
        };

        manager.store_tokens("user1", response).await.unwrap();

        let history = manager.get_store_tokens_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].0, "user1");

        let stored = manager.get_stored_tokens("user1").await.unwrap();
        assert!(stored.is_some());
    }

    #[tokio::test]
    async fn test_mock_refresh_tokens() {
        let manager = MockTokenManager::new();

        let response = manager.refresh_tokens("user1").await.unwrap();
        assert!(response.access_token.contains("refreshed-token"));

        let history = manager.get_refresh_history();
        assert_eq!(history.len(), 1);
    }

    #[tokio::test]
    async fn test_mock_not_found() {
        let manager = MockTokenManager::new();

        let result = manager.get_access_token("nonexistent").await;
        assert!(result.is_err());
    }
}
