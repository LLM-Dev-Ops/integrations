//! Client Credentials Flow
//!
//! RFC 6749 Section 4.4 - Client Credentials Grant.

use async_trait::async_trait;
use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;

use crate::core::{HttpMethod, HttpRequest, HttpTransport};
use crate::error::{OAuth2Error, ProtocolError};
use crate::types::{ClientAuthMethod, OAuth2Config, TokenResponse};
use crate::error::create_error_from_response;

/// Client Credentials Flow request parameters.
#[derive(Debug, Clone, Default)]
pub struct ClientCredentialsRequest {
    /// Requested scopes.
    pub scopes: Option<Vec<String>>,
    /// Additional parameters.
    pub extra_params: HashMap<String, String>,
}

/// Client Credentials Flow interface.
#[async_trait]
pub trait ClientCredentialsFlow: Send + Sync {
    /// Request access token using client credentials.
    async fn request_token(
        &self,
        request: ClientCredentialsRequest,
    ) -> Result<TokenResponse, OAuth2Error>;
}

/// Client Credentials Flow implementation.
pub struct ClientCredentialsFlowImpl<T: HttpTransport> {
    config: OAuth2Config,
    transport: Arc<T>,
}

impl<T: HttpTransport> ClientCredentialsFlowImpl<T> {
    /// Create new Client Credentials Flow.
    pub fn new(config: OAuth2Config, transport: Arc<T>) -> Self {
        Self { config, transport }
    }

    fn build_request_body(&self, request: &ClientCredentialsRequest) -> String {
        let mut params = vec![("grant_type", "client_credentials".to_string())];

        // Scopes
        let scopes = request
            .scopes
            .as_ref()
            .or(Some(&self.config.default_scopes));
        if let Some(s) = scopes {
            if !s.is_empty() {
                params.push(("scope", s.join(" ")));
            }
        }

        // Client credentials in body if using post method
        if self.config.credentials.auth_method == ClientAuthMethod::ClientSecretPost {
            params.push(("client_id", self.config.credentials.client_id.clone()));
            if let Some(secret) = &self.config.credentials.client_secret {
                use secrecy::ExposeSecret;
                params.push(("client_secret", secret.expose_secret().to_string()));
            }
        }

        // Extra parameters
        for (key, value) in &request.extra_params {
            params.push((key.as_str(), value.clone()));
        }

        params
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
impl<T: HttpTransport> ClientCredentialsFlow for ClientCredentialsFlowImpl<T> {
    async fn request_token(
        &self,
        request: ClientCredentialsRequest,
    ) -> Result<TokenResponse, OAuth2Error> {
        let body = self.build_request_body(&request);
        let headers = self.build_request_headers();

        let http_request = HttpRequest {
            method: HttpMethod::Post,
            url: self.config.provider.token_endpoint.clone(),
            headers,
            body: Some(body),
            timeout: Some(self.config.timeout),
        };

        let response = self.transport.send(http_request).await?;

        if response.status != 200 {
            return Err(create_error_from_response(response.status, &response.body));
        }

        let token_response: TokenResponse = serde_json::from_str(&response.body).map_err(|e| {
            OAuth2Error::Protocol(ProtocolError::InvalidJson {
                message: e.to_string(),
            })
        })?;

        Ok(token_response)
    }
}

/// Mock Client Credentials Flow for testing.
#[derive(Default)]
pub struct MockClientCredentialsFlow {
    request_history: std::sync::Mutex<Vec<ClientCredentialsRequest>>,
    next_token_response: std::sync::Mutex<Option<TokenResponse>>,
    next_error: std::sync::Mutex<Option<OAuth2Error>>,
}

impl MockClientCredentialsFlow {
    /// Create new mock flow.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set next token response.
    pub fn set_next_token_response(&self, response: TokenResponse) -> &Self {
        *self.next_token_response.lock().unwrap() = Some(response);
        self
    }

    /// Set next error.
    pub fn set_next_error(&self, error: OAuth2Error) -> &Self {
        *self.next_error.lock().unwrap() = Some(error);
        self
    }

    /// Get request history.
    pub fn get_request_history(&self) -> Vec<ClientCredentialsRequest> {
        self.request_history.lock().unwrap().clone()
    }
}

#[async_trait]
impl ClientCredentialsFlow for MockClientCredentialsFlow {
    async fn request_token(
        &self,
        request: ClientCredentialsRequest,
    ) -> Result<TokenResponse, OAuth2Error> {
        self.request_history.lock().unwrap().push(request);

        if let Some(error) = self.next_error.lock().unwrap().take() {
            return Err(error);
        }

        if let Some(response) = self.next_token_response.lock().unwrap().take() {
            return Ok(response);
        }

        Ok(TokenResponse {
            access_token: "mock-client-credentials-token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: None, // Client credentials typically don't get refresh tokens
            scope: Some("api:read api:write".to_string()),
            id_token: None,
            extra: HashMap::new(),
        })
    }
}

/// Create mock Client Credentials Flow for testing.
pub fn create_mock_client_credentials_flow() -> MockClientCredentialsFlow {
    MockClientCredentialsFlow::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_client_credentials_flow() {
        let flow = MockClientCredentialsFlow::new();

        let request = ClientCredentialsRequest {
            scopes: Some(vec!["api:read".to_string()]),
            ..Default::default()
        };

        let response = flow.request_token(request).await.unwrap();
        assert_eq!(response.access_token, "mock-client-credentials-token");
        assert!(response.refresh_token.is_none());

        let history = flow.get_request_history();
        assert_eq!(history.len(), 1);
    }

    #[tokio::test]
    async fn test_mock_with_custom_response() {
        let flow = MockClientCredentialsFlow::new();
        flow.set_next_token_response(TokenResponse {
            access_token: "custom-token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(7200),
            refresh_token: None,
            scope: None,
            id_token: None,
            extra: HashMap::new(),
        });

        let request = ClientCredentialsRequest::default();
        let response = flow.request_token(request).await.unwrap();
        assert_eq!(response.access_token, "custom-token");
        assert_eq!(response.expires_in, Some(7200));
    }

    #[tokio::test]
    async fn test_mock_with_error() {
        let flow = MockClientCredentialsFlow::new();
        flow.set_next_error(OAuth2Error::Token(crate::error::TokenError::InvalidGrant {
            message: "Test error".to_string(),
        }));

        let request = ClientCredentialsRequest::default();
        let result = flow.request_token(request).await;
        assert!(result.is_err());
    }
}
