//! Token Introspection
//!
//! RFC 7662 - OAuth 2.0 Token Introspection.

use async_trait::async_trait;
use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;

use crate::core::{HttpMethod, HttpRequest, HttpTransport};
use crate::error::{OAuth2Error, ProtocolError, TokenError};
use crate::types::{ClientAuthMethod, IntrospectionParams, IntrospectionResponse, OAuth2Config};
use crate::error::create_error_from_response;

/// Token introspection interface.
#[async_trait]
pub trait TokenIntrospector: Send + Sync {
    /// Introspect an access token.
    async fn introspect(
        &self,
        params: IntrospectionParams,
    ) -> Result<IntrospectionResponse, OAuth2Error>;

    /// Check if a token is active.
    async fn is_token_active(&self, token: &str) -> Result<bool, OAuth2Error>;
}

/// Default token introspector implementation.
pub struct DefaultTokenIntrospector<T: HttpTransport> {
    config: OAuth2Config,
    transport: Arc<T>,
}

impl<T: HttpTransport> DefaultTokenIntrospector<T> {
    /// Create new token introspector.
    pub fn new(config: OAuth2Config, transport: Arc<T>) -> Self {
        Self { config, transport }
    }

    fn build_request_body(&self, params: &IntrospectionParams) -> String {
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
impl<T: HttpTransport> TokenIntrospector for DefaultTokenIntrospector<T> {
    async fn introspect(
        &self,
        params: IntrospectionParams,
    ) -> Result<IntrospectionResponse, OAuth2Error> {
        // Get introspection endpoint
        let introspection_endpoint =
            self.config
                .provider
                .introspection_endpoint
                .as_ref()
                .ok_or_else(|| {
                    OAuth2Error::Token(TokenError::IntrospectionFailed {
                        message: "Introspection endpoint not configured".to_string(),
                    })
                })?;

        let body = self.build_request_body(&params);
        let headers = self.build_request_headers();

        let http_request = HttpRequest {
            method: HttpMethod::Post,
            url: introspection_endpoint.clone(),
            headers,
            body: Some(body),
            timeout: Some(self.config.timeout),
        };

        let response = self.transport.send(http_request).await?;

        if response.status != 200 {
            return Err(create_error_from_response(response.status, &response.body));
        }

        let introspection_response: IntrospectionResponse =
            serde_json::from_str(&response.body).map_err(|e| {
                OAuth2Error::Protocol(ProtocolError::InvalidJson {
                    message: e.to_string(),
                })
            })?;

        Ok(introspection_response)
    }

    async fn is_token_active(&self, token: &str) -> Result<bool, OAuth2Error> {
        let params = IntrospectionParams {
            token: token.to_string(),
            token_type_hint: None,
        };

        let response = self.introspect(params).await?;
        Ok(response.active)
    }
}

/// Mock token introspector for testing.
#[derive(Default)]
pub struct MockTokenIntrospector {
    introspect_history: std::sync::Mutex<Vec<IntrospectionParams>>,
    next_response: std::sync::Mutex<Option<IntrospectionResponse>>,
    next_error: std::sync::Mutex<Option<OAuth2Error>>,
    active_tokens: std::sync::Mutex<HashMap<String, IntrospectionResponse>>,
}

impl MockTokenIntrospector {
    /// Create new mock introspector.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set next introspection response.
    pub fn set_next_response(&self, response: IntrospectionResponse) -> &Self {
        *self.next_response.lock().unwrap() = Some(response);
        self
    }

    /// Set next error.
    pub fn set_next_error(&self, error: OAuth2Error) -> &Self {
        *self.next_error.lock().unwrap() = Some(error);
        self
    }

    /// Register an active token.
    pub fn add_active_token(&self, token: &str, response: IntrospectionResponse) -> &Self {
        self.active_tokens
            .lock()
            .unwrap()
            .insert(token.to_string(), response);
        self
    }

    /// Get introspection history.
    pub fn get_introspect_history(&self) -> Vec<IntrospectionParams> {
        self.introspect_history.lock().unwrap().clone()
    }
}

#[async_trait]
impl TokenIntrospector for MockTokenIntrospector {
    async fn introspect(
        &self,
        params: IntrospectionParams,
    ) -> Result<IntrospectionResponse, OAuth2Error> {
        self.introspect_history.lock().unwrap().push(params.clone());

        if let Some(error) = self.next_error.lock().unwrap().take() {
            return Err(error);
        }

        if let Some(response) = self.next_response.lock().unwrap().take() {
            return Ok(response);
        }

        // Check registered active tokens
        if let Some(response) = self.active_tokens.lock().unwrap().get(&params.token) {
            return Ok(response.clone());
        }

        // Default: return inactive
        Ok(IntrospectionResponse {
            active: false,
            scope: None,
            client_id: None,
            username: None,
            token_type: None,
            exp: None,
            iat: None,
            nbf: None,
            sub: None,
            aud: None,
            iss: None,
            jti: None,
        })
    }

    async fn is_token_active(&self, token: &str) -> Result<bool, OAuth2Error> {
        let params = IntrospectionParams {
            token: token.to_string(),
            token_type_hint: None,
        };

        let response = self.introspect(params).await?;
        Ok(response.active)
    }
}

/// Create mock token introspector for testing.
pub fn create_mock_token_introspector() -> MockTokenIntrospector {
    MockTokenIntrospector::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_introspect_inactive() {
        let introspector = MockTokenIntrospector::new();

        let params = IntrospectionParams {
            token: "unknown-token".to_string(),
            token_type_hint: None,
        };

        let response = introspector.introspect(params).await.unwrap();
        assert!(!response.active);
    }

    #[tokio::test]
    async fn test_mock_introspect_active() {
        let introspector = MockTokenIntrospector::new();
        introspector.add_active_token(
            "valid-token",
            IntrospectionResponse {
                active: true,
                scope: Some("openid profile".to_string()),
                client_id: Some("test-client".to_string()),
                username: Some("testuser".to_string()),
                token_type: Some("Bearer".to_string()),
                exp: Some(1234567890),
                iat: Some(1234564290),
                nbf: None,
                sub: Some("user123".to_string()),
                aud: None,
                iss: Some("https://example.com".to_string()),
                jti: None,
            },
        );

        let params = IntrospectionParams {
            token: "valid-token".to_string(),
            token_type_hint: None,
        };

        let response = introspector.introspect(params).await.unwrap();
        assert!(response.active);
        assert_eq!(response.username, Some("testuser".to_string()));
    }

    #[tokio::test]
    async fn test_mock_is_token_active() {
        let introspector = MockTokenIntrospector::new();
        introspector.add_active_token(
            "active-token",
            IntrospectionResponse {
                active: true,
                ..Default::default()
            },
        );

        assert!(introspector.is_token_active("active-token").await.unwrap());
        assert!(!introspector.is_token_active("inactive-token").await.unwrap());
    }

    #[tokio::test]
    async fn test_mock_introspect_history() {
        let introspector = MockTokenIntrospector::new();

        let params = IntrospectionParams {
            token: "test-token".to_string(),
            token_type_hint: None,
        };

        introspector.introspect(params).await.unwrap();

        let history = introspector.get_introspect_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].token, "test-token");
    }
}
