//! Token Revocation
//!
//! RFC 7009 - OAuth 2.0 Token Revocation.

use async_trait::async_trait;
use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;

use crate::core::{HttpMethod, HttpRequest, HttpTransport};
use crate::error::{OAuth2Error, TokenError};
use crate::types::{ClientAuthMethod, OAuth2Config, RevocationParams};
use crate::error::create_error_from_response;

/// Token revoker interface.
#[async_trait]
pub trait TokenRevoker: Send + Sync {
    /// Revoke a token.
    async fn revoke(&self, params: RevocationParams) -> Result<(), OAuth2Error>;

    /// Revoke an access token.
    async fn revoke_access_token(&self, token: &str) -> Result<(), OAuth2Error>;

    /// Revoke a refresh token.
    async fn revoke_refresh_token(&self, token: &str) -> Result<(), OAuth2Error>;
}

/// Default token revoker implementation.
pub struct DefaultTokenRevoker<T: HttpTransport> {
    config: OAuth2Config,
    transport: Arc<T>,
}

impl<T: HttpTransport> DefaultTokenRevoker<T> {
    /// Create new token revoker.
    pub fn new(config: OAuth2Config, transport: Arc<T>) -> Self {
        Self { config, transport }
    }

    fn build_request_body(&self, params: &RevocationParams) -> String {
        let mut request_params = vec![("token", params.token.clone())];

        if let Some(hint) = &params.token_type_hint {
            request_params.push(("token_type_hint", hint.as_str().to_string()));
        }

        // Client credentials in body if using post method
        if self.config.credentials.auth_method == ClientAuthMethod::ClientSecretPost {
            request_params.push(("client_id", self.config.credentials.client_id.clone()));
            if let Some(secret) = &self.config.credentials.client_secret {
                use secrecy::ExposeSecret;
                request_params.push(("client_secret", secret.expose_secret().to_string()));
            }
        }

        request_params
            .into_iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(&v)))
            .collect::<Vec<_>>()
            .join("&")
    }

    fn build_request_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert(
            "content-type".to_string(),
            "application/x-www-form-urlencoded".to_string(),
        );
        headers.insert("accept".to_string(), "application/json".to_string());

        // Add Basic auth header if using that method
        if self.config.credentials.auth_method == ClientAuthMethod::ClientSecretBasic {
            if let Some(secret) = &self.config.credentials.client_secret {
                use secrecy::ExposeSecret;
                let credentials = format!(
                    "{}:{}",
                    self.config.credentials.client_id,
                    secret.expose_secret()
                );
                let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
                headers.insert("authorization".to_string(), format!("Basic {}", encoded));
            }
        }

        headers
    }
}

#[async_trait]
impl<T: HttpTransport> TokenRevoker for DefaultTokenRevoker<T> {
    async fn revoke(&self, params: RevocationParams) -> Result<(), OAuth2Error> {
        // Get revocation endpoint
        let revocation_endpoint =
            self.config
                .provider
                .revocation_endpoint
                .as_ref()
                .ok_or_else(|| {
                    OAuth2Error::Token(TokenError::RevocationFailed {
                        message: "Revocation endpoint not configured".to_string(),
                    })
                })?;

        let body = self.build_request_body(&params);
        let headers = self.build_request_headers();

        let http_request = HttpRequest {
            method: HttpMethod::Post,
            url: revocation_endpoint.clone(),
            headers,
            body: Some(body),
            timeout: Some(self.config.timeout),
        };

        let response = self.transport.send(http_request).await?;

        // RFC 7009: The authorization server responds with HTTP status code 200
        // if the token has been revoked successfully or if the client submitted
        // an invalid token.
        if response.status != 200 {
            return Err(create_error_from_response(response.status, &response.body));
        }

        Ok(())
    }

    async fn revoke_access_token(&self, token: &str) -> Result<(), OAuth2Error> {
        self.revoke(RevocationParams {
            token: token.to_string(),
            token_type_hint: Some(crate::types::TokenTypeHint::AccessToken),
        })
        .await
    }

    async fn revoke_refresh_token(&self, token: &str) -> Result<(), OAuth2Error> {
        self.revoke(RevocationParams {
            token: token.to_string(),
            token_type_hint: Some(crate::types::TokenTypeHint::RefreshToken),
        })
        .await
    }
}

/// Mock token revoker for testing.
#[derive(Default)]
pub struct MockTokenRevoker {
    revoke_history: std::sync::Mutex<Vec<RevocationParams>>,
    revoked_tokens: std::sync::Mutex<Vec<String>>,
    next_error: std::sync::Mutex<Option<OAuth2Error>>,
    should_fail: std::sync::Mutex<bool>,
}

impl MockTokenRevoker {
    /// Create new mock revoker.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set next error.
    pub fn set_next_error(&self, error: OAuth2Error) -> &Self {
        *self.next_error.lock().unwrap() = Some(error);
        self
    }

    /// Set revoker to fail all operations.
    pub fn set_should_fail(&self, should_fail: bool) -> &Self {
        *self.should_fail.lock().unwrap() = should_fail;
        self
    }

    /// Get revocation history.
    pub fn get_revoke_history(&self) -> Vec<RevocationParams> {
        self.revoke_history.lock().unwrap().clone()
    }

    /// Get list of revoked tokens.
    pub fn get_revoked_tokens(&self) -> Vec<String> {
        self.revoked_tokens.lock().unwrap().clone()
    }

    /// Check if a specific token was revoked.
    pub fn was_revoked(&self, token: &str) -> bool {
        self.revoked_tokens
            .lock()
            .unwrap()
            .contains(&token.to_string())
    }

    fn check_error(&self) -> Result<(), OAuth2Error> {
        if *self.should_fail.lock().unwrap() {
            return Err(OAuth2Error::Token(TokenError::RevocationFailed {
                message: "Mock revocation failure".to_string(),
            }));
        }

        if let Some(error) = self.next_error.lock().unwrap().take() {
            return Err(error);
        }

        Ok(())
    }
}

#[async_trait]
impl TokenRevoker for MockTokenRevoker {
    async fn revoke(&self, params: RevocationParams) -> Result<(), OAuth2Error> {
        self.check_error()?;

        self.revoke_history.lock().unwrap().push(params.clone());
        self.revoked_tokens
            .lock()
            .unwrap()
            .push(params.token.clone());

        Ok(())
    }

    async fn revoke_access_token(&self, token: &str) -> Result<(), OAuth2Error> {
        self.revoke(RevocationParams {
            token: token.to_string(),
            token_type_hint: Some(crate::types::TokenTypeHint::AccessToken),
        })
        .await
    }

    async fn revoke_refresh_token(&self, token: &str) -> Result<(), OAuth2Error> {
        self.revoke(RevocationParams {
            token: token.to_string(),
            token_type_hint: Some(crate::types::TokenTypeHint::RefreshToken),
        })
        .await
    }
}

/// Create mock token revoker for testing.
pub fn create_mock_token_revoker() -> MockTokenRevoker {
    MockTokenRevoker::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::TokenTypeHint;

    #[tokio::test]
    async fn test_mock_revoke() {
        let revoker = MockTokenRevoker::new();

        let params = RevocationParams {
            token: "test-token".to_string(),
            token_type_hint: Some(TokenTypeHint::AccessToken),
        };

        revoker.revoke(params).await.unwrap();

        let history = revoker.get_revoke_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].token, "test-token");

        assert!(revoker.was_revoked("test-token"));
    }

    #[tokio::test]
    async fn test_mock_revoke_access_token() {
        let revoker = MockTokenRevoker::new();

        revoker.revoke_access_token("access-token").await.unwrap();

        let history = revoker.get_revoke_history();
        assert_eq!(history.len(), 1);
        assert_eq!(
            history[0].token_type_hint,
            Some(TokenTypeHint::AccessToken)
        );
    }

    #[tokio::test]
    async fn test_mock_revoke_refresh_token() {
        let revoker = MockTokenRevoker::new();

        revoker.revoke_refresh_token("refresh-token").await.unwrap();

        let history = revoker.get_revoke_history();
        assert_eq!(history.len(), 1);
        assert_eq!(
            history[0].token_type_hint,
            Some(TokenTypeHint::RefreshToken)
        );
    }

    #[tokio::test]
    async fn test_mock_revoke_failure() {
        let revoker = MockTokenRevoker::new();
        revoker.set_should_fail(true);

        let params = RevocationParams {
            token: "test-token".to_string(),
            token_type_hint: None,
        };

        let result = revoker.revoke(params).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_mock_revoked_tokens_list() {
        let revoker = MockTokenRevoker::new();

        revoker.revoke_access_token("token1").await.unwrap();
        revoker.revoke_refresh_token("token2").await.unwrap();

        let revoked = revoker.get_revoked_tokens();
        assert_eq!(revoked.len(), 2);
        assert!(revoked.contains(&"token1".to_string()));
        assert!(revoked.contains(&"token2".to_string()));
    }
}
