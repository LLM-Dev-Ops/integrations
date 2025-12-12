//! OAuth2 Client
//!
//! High-level OAuth2 client that combines all flows and token management.

use std::sync::Arc;

use crate::core::{
    DefaultDiscoveryClient, DefaultPkceGenerator, DiscoveryClient, HttpTransport,
    InMemoryStateManager, PkceGenerator, ReqwestHttpTransport, StateManager,
};
use crate::error::OAuth2Error;
use crate::flows::{
    AuthorizationCodeFlow, AuthorizationCodeFlowImpl, ClientCredentialsFlow,
    ClientCredentialsFlowImpl, ClientCredentialsRequest, DeviceAuthorizationFlow,
    DeviceAuthorizationFlowImpl, PkceAuthorizationCodeFlow, PkceAuthorizationCodeFlowImpl,
};
use crate::token::{
    DefaultTokenIntrospector, DefaultTokenManager, DefaultTokenRevoker, InMemoryTokenStorage,
    TokenIntrospector, TokenManager, TokenManagerConfig, TokenRevoker, TokenStorage,
};
use crate::types::{
    AuthorizationParams, AuthorizationUrl, CallbackParams, CodeExchangeRequest,
    DeviceAuthorizationResponse, DeviceCodeParams, IntrospectionParams, IntrospectionResponse,
    OAuth2Config, PkceAuthorizationParams, PkceAuthorizationUrl, PkceMethod, PkceParams,
    RevocationParams, TokenResponse,
};

/// OAuth2 client for managing OAuth2 flows and token lifecycle.
pub struct OAuth2Client<
    T: HttpTransport = ReqwestHttpTransport,
    S: StateManager = InMemoryStateManager,
    P: PkceGenerator = DefaultPkceGenerator,
    TS: TokenStorage = InMemoryTokenStorage,
> {
    config: OAuth2Config,
    transport: Arc<T>,
    state_manager: Arc<S>,
    pkce_generator: Arc<P>,
    token_storage: Arc<TS>,
}

impl OAuth2Client<ReqwestHttpTransport, InMemoryStateManager, DefaultPkceGenerator, InMemoryTokenStorage>
{
    /// Create a new OAuth2 client with default implementations.
    pub fn new(config: OAuth2Config) -> Result<Self, OAuth2Error> {
        let transport = Arc::new(ReqwestHttpTransport::new()?);
        let state_manager = Arc::new(InMemoryStateManager::new());
        let pkce_generator = Arc::new(DefaultPkceGenerator::new());
        let token_storage = Arc::new(InMemoryTokenStorage::new());

        Ok(Self {
            config,
            transport,
            state_manager,
            pkce_generator,
            token_storage,
        })
    }
}

impl<T: HttpTransport, S: StateManager, P: PkceGenerator, TS: TokenStorage>
    OAuth2Client<T, S, P, TS>
{
    /// Create a client with custom implementations.
    pub fn with_components(
        config: OAuth2Config,
        transport: T,
        state_manager: S,
        pkce_generator: P,
        token_storage: TS,
    ) -> Self {
        Self {
            config,
            transport: Arc::new(transport),
            state_manager: Arc::new(state_manager),
            pkce_generator: Arc::new(pkce_generator),
            token_storage: Arc::new(token_storage),
        }
    }

    /// Get the OAuth2 configuration.
    pub fn config(&self) -> &OAuth2Config {
        &self.config
    }

    // ========== Authorization Code Flow ==========

    /// Build authorization URL for the standard Authorization Code flow.
    pub fn build_authorization_url(&self, params: AuthorizationParams) -> AuthorizationUrl {
        let flow = AuthorizationCodeFlowImpl::new(
            self.config.clone(),
            self.transport.clone(),
            self.state_manager.clone(),
        );
        flow.build_authorization_url(params)
    }

    /// Exchange authorization code for tokens.
    pub async fn exchange_code(
        &self,
        request: CodeExchangeRequest,
    ) -> Result<TokenResponse, OAuth2Error> {
        let flow = AuthorizationCodeFlowImpl::new(
            self.config.clone(),
            self.transport.clone(),
            self.state_manager.clone(),
        );
        flow.exchange_code(request).await
    }

    /// Handle authorization callback.
    pub async fn handle_callback(
        &self,
        callback: CallbackParams,
    ) -> Result<TokenResponse, OAuth2Error> {
        let flow = AuthorizationCodeFlowImpl::new(
            self.config.clone(),
            self.transport.clone(),
            self.state_manager.clone(),
        );
        flow.handle_callback(callback).await
    }

    // ========== PKCE Authorization Code Flow ==========

    /// Generate PKCE parameters.
    pub fn generate_pkce(&self, method: PkceMethod) -> PkceParams {
        self.pkce_generator.generate(method)
    }

    /// Build authorization URL with PKCE.
    pub fn build_pkce_authorization_url(
        &self,
        params: PkceAuthorizationParams,
    ) -> PkceAuthorizationUrl {
        let flow = PkceAuthorizationCodeFlowImpl::new(
            self.config.clone(),
            self.transport.clone(),
            self.state_manager.clone(),
            self.pkce_generator.clone(),
        );
        flow.build_authorization_url(params)
    }

    /// Exchange code with PKCE verifier.
    pub async fn exchange_code_with_pkce(
        &self,
        request: CodeExchangeRequest,
        code_verifier: &str,
    ) -> Result<TokenResponse, OAuth2Error> {
        let flow = PkceAuthorizationCodeFlowImpl::new(
            self.config.clone(),
            self.transport.clone(),
            self.state_manager.clone(),
            self.pkce_generator.clone(),
        );
        flow.exchange_code(request, code_verifier).await
    }

    /// Handle PKCE callback.
    pub async fn handle_pkce_callback(
        &self,
        callback: CallbackParams,
        code_verifier: &str,
    ) -> Result<TokenResponse, OAuth2Error> {
        let flow = PkceAuthorizationCodeFlowImpl::new(
            self.config.clone(),
            self.transport.clone(),
            self.state_manager.clone(),
            self.pkce_generator.clone(),
        );
        flow.handle_callback(callback, code_verifier).await
    }

    // ========== Client Credentials Flow ==========

    /// Request token using client credentials.
    pub async fn client_credentials(
        &self,
        request: ClientCredentialsRequest,
    ) -> Result<TokenResponse, OAuth2Error> {
        let flow = ClientCredentialsFlowImpl::new(self.config.clone(), self.transport.clone());
        flow.request_token(request).await
    }

    // ========== Device Authorization Flow ==========

    /// Request device code for device authorization flow.
    pub async fn request_device_code(
        &self,
        params: DeviceCodeParams,
    ) -> Result<DeviceAuthorizationResponse, OAuth2Error> {
        let flow = DeviceAuthorizationFlowImpl::new(self.config.clone(), self.transport.clone());
        flow.request_device_code(params).await
    }

    /// Poll for token in device flow.
    pub async fn poll_device_token(
        &self,
        device_code: &str,
    ) -> Result<crate::types::DeviceTokenResult, OAuth2Error> {
        let flow = DeviceAuthorizationFlowImpl::new(self.config.clone(), self.transport.clone());
        flow.poll_for_token(device_code).await
    }

    /// Poll for token until complete or expired.
    pub async fn poll_device_token_until_complete(
        &self,
        device_code: &str,
        interval: std::time::Duration,
        expires_in: std::time::Duration,
    ) -> Result<TokenResponse, OAuth2Error> {
        let flow = DeviceAuthorizationFlowImpl::new(self.config.clone(), self.transport.clone());
        flow.poll_until_complete(device_code, interval, expires_in)
            .await
    }

    // ========== Token Management ==========

    /// Get access token, refreshing if necessary.
    pub async fn get_access_token(&self, key: &str) -> Result<String, OAuth2Error> {
        let manager = DefaultTokenManager::new(
            self.config.clone(),
            TokenManagerConfig::default(),
            self.transport.clone(),
            self.token_storage.clone(),
        );
        manager.get_access_token(key).await
    }

    /// Store tokens.
    pub async fn store_tokens(
        &self,
        key: &str,
        response: TokenResponse,
    ) -> Result<(), OAuth2Error> {
        let manager = DefaultTokenManager::new(
            self.config.clone(),
            TokenManagerConfig::default(),
            self.transport.clone(),
            self.token_storage.clone(),
        );
        manager.store_tokens(key, response).await
    }

    /// Refresh tokens.
    pub async fn refresh_tokens(&self, key: &str) -> Result<TokenResponse, OAuth2Error> {
        let manager = DefaultTokenManager::new(
            self.config.clone(),
            TokenManagerConfig::default(),
            self.transport.clone(),
            self.token_storage.clone(),
        );
        manager.refresh_tokens(key).await
    }

    /// Delete tokens.
    pub async fn delete_tokens(&self, key: &str) -> Result<bool, OAuth2Error> {
        let manager = DefaultTokenManager::new(
            self.config.clone(),
            TokenManagerConfig::default(),
            self.transport.clone(),
            self.token_storage.clone(),
        );
        manager.delete_tokens(key).await
    }

    // ========== Token Introspection ==========

    /// Introspect a token.
    pub async fn introspect(
        &self,
        params: IntrospectionParams,
    ) -> Result<IntrospectionResponse, OAuth2Error> {
        let introspector =
            DefaultTokenIntrospector::new(self.config.clone(), self.transport.clone());
        introspector.introspect(params).await
    }

    /// Check if a token is active.
    pub async fn is_token_active(&self, token: &str) -> Result<bool, OAuth2Error> {
        let introspector =
            DefaultTokenIntrospector::new(self.config.clone(), self.transport.clone());
        introspector.is_token_active(token).await
    }

    // ========== Token Revocation ==========

    /// Revoke a token.
    pub async fn revoke(&self, params: RevocationParams) -> Result<(), OAuth2Error> {
        let revoker = DefaultTokenRevoker::new(self.config.clone(), self.transport.clone());
        revoker.revoke(params).await
    }

    /// Revoke an access token.
    pub async fn revoke_access_token(&self, token: &str) -> Result<(), OAuth2Error> {
        let revoker = DefaultTokenRevoker::new(self.config.clone(), self.transport.clone());
        revoker.revoke_access_token(token).await
    }

    /// Revoke a refresh token.
    pub async fn revoke_refresh_token(&self, token: &str) -> Result<(), OAuth2Error> {
        let revoker = DefaultTokenRevoker::new(self.config.clone(), self.transport.clone());
        revoker.revoke_refresh_token(token).await
    }

    // ========== Discovery ==========

    /// Fetch OIDC discovery document.
    pub async fn discover(
        &self,
        issuer: &str,
    ) -> Result<crate::types::OIDCDiscoveryDocument, OAuth2Error> {
        let discovery = DefaultDiscoveryClient::new(self.transport.as_ref().clone());
        discovery.fetch(issuer).await
    }
}

/// Create a new OAuth2 client builder.
pub fn oauth2_client(config: OAuth2Config) -> Result<OAuth2Client, OAuth2Error> {
    OAuth2Client::new(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::builders::oauth2_config;
    use crate::types::ClientAuthMethod;

    fn create_test_config() -> OAuth2Config {
        oauth2_config()
            .client_id("test-client")
            .client_secret("test-secret")
            .authorization_endpoint("https://example.com/authorize")
            .token_endpoint("https://example.com/token")
            .auth_method(ClientAuthMethod::ClientSecretBasic)
            .build()
            .unwrap()
    }

    #[test]
    fn test_client_creation() {
        let config = create_test_config();
        let client = OAuth2Client::new(config);
        assert!(client.is_ok());
    }

    #[test]
    fn test_build_authorization_url() {
        let config = create_test_config();
        let client = OAuth2Client::new(config).unwrap();

        let params = AuthorizationParams {
            redirect_uri: "https://example.com/callback".to_string(),
            scopes: Some(vec!["openid".to_string()]),
            ..Default::default()
        };

        let auth_url = client.build_authorization_url(params);
        assert!(auth_url.url.contains("example.com/authorize"));
        assert!(!auth_url.state.is_empty());
    }

    #[test]
    fn test_build_pkce_authorization_url() {
        let config = create_test_config();
        let client = OAuth2Client::new(config).unwrap();

        let params = PkceAuthorizationParams {
            redirect_uri: "https://example.com/callback".to_string(),
            scopes: Some(vec!["openid".to_string()]),
            pkce_method: Some(PkceMethod::S256),
            ..Default::default()
        };

        let auth_url = client.build_pkce_authorization_url(params);
        assert!(auth_url.url.contains("example.com/authorize"));
        assert!(!auth_url.code_verifier.is_empty());
        assert!(!auth_url.code_challenge.is_empty());
    }

    #[test]
    fn test_generate_pkce() {
        let config = create_test_config();
        let client = OAuth2Client::new(config).unwrap();

        let pkce = client.generate_pkce(PkceMethod::S256);
        assert!(!pkce.code_verifier.is_empty());
        assert!(!pkce.code_challenge.is_empty());
        assert_eq!(pkce.code_challenge_method, PkceMethod::S256);
    }
}
