//! Authorization Code Flow
//!
//! RFC 6749 Section 4.1 - Authorization Code Grant.

use async_trait::async_trait;
use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;

use crate::core::{HttpMethod, HttpRequest, HttpTransport, StateManager};
use crate::error::{AuthorizationError, OAuth2Error, ProviderError};
use crate::types::{
    AuthorizationParams, AuthorizationUrl, CallbackParams, ClientAuthMethod,
    CodeExchangeRequest, OAuth2Config, TokenResponse,
};
use crate::error::create_error_from_response;

/// Authorization Code Flow interface.
#[async_trait]
pub trait AuthorizationCodeFlow: Send + Sync {
    /// Build authorization URL for user redirect.
    fn build_authorization_url(&self, params: AuthorizationParams) -> AuthorizationUrl;

    /// Exchange authorization code for tokens.
    async fn exchange_code(&self, request: CodeExchangeRequest) -> Result<TokenResponse, OAuth2Error>;

    /// Handle authorization callback.
    async fn handle_callback(&self, callback: CallbackParams) -> Result<TokenResponse, OAuth2Error>;
}

/// Authorization Code Flow implementation.
pub struct AuthorizationCodeFlowImpl<T: HttpTransport, S: StateManager> {
    config: OAuth2Config,
    transport: Arc<T>,
    state_manager: Arc<S>,
}

impl<T: HttpTransport, S: StateManager> AuthorizationCodeFlowImpl<T, S> {
    /// Create new Authorization Code Flow.
    pub fn new(config: OAuth2Config, transport: Arc<T>, state_manager: Arc<S>) -> Self {
        Self {
            config,
            transport,
            state_manager,
        }
    }

    fn build_auth_url_params(&self, params: &AuthorizationParams) -> HashMap<String, String> {
        let mut url_params = HashMap::new();

        // Required parameters
        url_params.insert("response_type".to_string(), "code".to_string());
        url_params.insert("client_id".to_string(), self.config.credentials.client_id.clone());
        url_params.insert("redirect_uri".to_string(), params.redirect_uri.clone());

        // Scopes
        let scopes = params
            .scopes
            .as_ref()
            .or(Some(&self.config.default_scopes));
        if let Some(s) = scopes {
            if !s.is_empty() {
                url_params.insert("scope".to_string(), s.join(" "));
            }
        }

        // Optional parameters
        if let Some(prompt) = &params.prompt {
            url_params.insert("prompt".to_string(), prompt.as_str().to_string());
        }
        if let Some(login_hint) = &params.login_hint {
            url_params.insert("login_hint".to_string(), login_hint.clone());
        }

        // Extra parameters
        for (key, value) in &params.extra_params {
            url_params.insert(key.clone(), value.clone());
        }

        url_params
    }

    fn build_token_request_body(&self, request: &CodeExchangeRequest) -> String {
        let mut params = vec![
            ("grant_type", "authorization_code".to_string()),
            ("code", request.code.clone()),
            ("redirect_uri", request.redirect_uri.clone()),
            ("client_id", self.config.credentials.client_id.clone()),
        ];

        // Add client secret if using post method
        if self.config.credentials.auth_method == ClientAuthMethod::ClientSecretPost {
            if let Some(secret) = &self.config.credentials.client_secret {
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

    fn build_token_request_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/x-www-form-urlencoded".to_string());
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
impl<T: HttpTransport, S: StateManager> AuthorizationCodeFlow for AuthorizationCodeFlowImpl<T, S> {
    fn build_authorization_url(&self, params: AuthorizationParams) -> AuthorizationUrl {
        let mut url_params = self.build_auth_url_params(&params);

        // Generate state if not provided
        let state = params.state.unwrap_or_else(|| {
            let metadata = crate::types::StateMetadata::new(
                params.redirect_uri.clone(),
                params.scopes.clone().unwrap_or_else(|| self.config.default_scopes.clone()),
            );
            self.state_manager.generate(metadata)
        });

        url_params.insert("state".to_string(), state.clone());

        // Build URL
        let query = url_params
            .into_iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(&k), urlencoding::encode(&v)))
            .collect::<Vec<_>>()
            .join("&");

        let url = format!("{}?{}", self.config.provider.authorization_endpoint, query);

        AuthorizationUrl { url, state }
    }

    async fn exchange_code(&self, request: CodeExchangeRequest) -> Result<TokenResponse, OAuth2Error> {
        let body = self.build_token_request_body(&request);
        let headers = self.build_token_request_headers();

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

        let token_response: TokenResponse = serde_json::from_str(&response.body)
            .map_err(|e| OAuth2Error::Protocol(crate::error::ProtocolError::InvalidJson {
                message: e.to_string(),
            }))?;

        Ok(token_response)
    }

    async fn handle_callback(&self, callback: CallbackParams) -> Result<TokenResponse, OAuth2Error> {
        // Check for error in callback
        if let Some(error) = &callback.error {
            return Err(OAuth2Error::Authorization(AuthorizationError::AccessDenied {
                error_description: callback.error_description.clone(),
                error_uri: callback.error_uri.clone(),
            }));
        }

        // Validate code is present
        let code = callback.code.ok_or_else(|| {
            OAuth2Error::Authorization(AuthorizationError::InvalidRequest {
                message: "Missing authorization code in callback".to_string(),
                error_uri: None,
            })
        })?;

        // Validate state
        let state = callback.state.ok_or_else(|| {
            OAuth2Error::Authorization(AuthorizationError::StateMismatch {
                expected: "state parameter".to_string(),
                received: "missing".to_string(),
            })
        })?;

        let metadata = self.state_manager.consume(&state).ok_or_else(|| {
            OAuth2Error::Authorization(AuthorizationError::StateMismatch {
                expected: "valid state".to_string(),
                received: state.clone(),
            })
        })?;

        // Exchange code for tokens
        self.exchange_code(CodeExchangeRequest {
            code,
            redirect_uri: metadata.redirect_uri,
            state: Some(state),
        })
        .await
    }
}

/// Mock Authorization Code Flow for testing.
#[derive(Default)]
pub struct MockAuthorizationCodeFlow {
    build_url_history: std::sync::Mutex<Vec<AuthorizationParams>>,
    exchange_history: std::sync::Mutex<Vec<CodeExchangeRequest>>,
    callback_history: std::sync::Mutex<Vec<CallbackParams>>,
    next_token_response: std::sync::Mutex<Option<TokenResponse>>,
    next_error: std::sync::Mutex<Option<OAuth2Error>>,
}

impl MockAuthorizationCodeFlow {
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

    /// Get build URL history.
    pub fn get_build_url_history(&self) -> Vec<AuthorizationParams> {
        self.build_url_history.lock().unwrap().clone()
    }

    /// Get exchange history.
    pub fn get_exchange_history(&self) -> Vec<CodeExchangeRequest> {
        self.exchange_history.lock().unwrap().clone()
    }
}

#[async_trait]
impl AuthorizationCodeFlow for MockAuthorizationCodeFlow {
    fn build_authorization_url(&self, params: AuthorizationParams) -> AuthorizationUrl {
        self.build_url_history.lock().unwrap().push(params.clone());
        AuthorizationUrl {
            url: format!("https://mock.example.com/authorize?redirect_uri={}", params.redirect_uri),
            state: "mock-state".to_string(),
        }
    }

    async fn exchange_code(&self, request: CodeExchangeRequest) -> Result<TokenResponse, OAuth2Error> {
        self.exchange_history.lock().unwrap().push(request);

        if let Some(error) = self.next_error.lock().unwrap().take() {
            return Err(error);
        }

        if let Some(response) = self.next_token_response.lock().unwrap().take() {
            return Ok(response);
        }

        Ok(TokenResponse {
            access_token: "mock-access-token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: Some("mock-refresh-token".to_string()),
            scope: Some("openid profile email".to_string()),
            id_token: None,
            extra: HashMap::new(),
        })
    }

    async fn handle_callback(&self, callback: CallbackParams) -> Result<TokenResponse, OAuth2Error> {
        self.callback_history.lock().unwrap().push(callback.clone());

        if callback.error.is_some() {
            return Err(OAuth2Error::Authorization(AuthorizationError::AccessDenied {
                error_description: callback.error_description,
                error_uri: callback.error_uri,
            }));
        }

        self.exchange_code(CodeExchangeRequest {
            code: callback.code.unwrap_or_default(),
            redirect_uri: "https://example.com/callback".to_string(),
            state: callback.state,
        })
        .await
    }
}

/// Create mock Authorization Code Flow for testing.
pub fn create_mock_authorization_code_flow() -> MockAuthorizationCodeFlow {
    MockAuthorizationCodeFlow::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_authorization_code_flow() {
        let flow = MockAuthorizationCodeFlow::new();

        let params = AuthorizationParams {
            redirect_uri: "https://example.com/callback".to_string(),
            scopes: Some(vec!["openid".to_string()]),
            ..Default::default()
        };

        let url = flow.build_authorization_url(params);
        assert!(url.url.contains("mock.example.com"));
        assert_eq!(url.state, "mock-state");

        let history = flow.get_build_url_history();
        assert_eq!(history.len(), 1);
    }

    #[tokio::test]
    async fn test_mock_exchange_code() {
        let flow = MockAuthorizationCodeFlow::new();

        let request = CodeExchangeRequest {
            code: "test-code".to_string(),
            redirect_uri: "https://example.com/callback".to_string(),
            state: Some("test-state".to_string()),
        };

        let response = flow.exchange_code(request).await.unwrap();
        assert_eq!(response.access_token, "mock-access-token");
        assert_eq!(response.token_type, "Bearer");
    }
}
