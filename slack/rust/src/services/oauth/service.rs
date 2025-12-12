//! OAuth service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for OAuth service operations
#[async_trait]
pub trait OAuthServiceTrait: Send + Sync {
    /// Exchange an authorization code for an access token (OAuth v2)
    async fn v2_access(&self, request: V2AccessRequest) -> SlackResult<V2AccessResponse>;

    /// Exchange a legacy token for a new token
    async fn v2_exchange(&self, request: V2ExchangeRequest) -> SlackResult<V2ExchangeResponse>;

    /// Get an OpenID Connect token
    async fn openid_connect_token(
        &self,
        request: OpenIdConnectTokenRequest,
    ) -> SlackResult<OpenIdConnectTokenResponse>;

    /// Get user information using OpenID Connect
    async fn openid_connect_userinfo(
        &self,
        request: OpenIdConnectUserInfoRequest,
    ) -> SlackResult<OpenIdConnectUserInfoResponse>;
}

/// OAuth service implementation
pub struct OAuthService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl OAuthService {
    /// Create a new OAuth service
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth: AuthManager,
        base_url: String,
        resilience: Arc<ResilienceOrchestrator>,
    ) -> Self {
        Self {
            transport,
            auth,
            base_url,
            resilience,
        }
    }

    fn build_url(&self, endpoint: &str) -> String {
        format!("{}/{}", self.base_url.trim_end_matches('/'), endpoint)
    }
}

#[async_trait]
impl OAuthServiceTrait for OAuthService {
    #[instrument(skip(self, request), fields(client_id = %request.client_id))]
    async fn v2_access(&self, request: V2AccessRequest) -> SlackResult<V2AccessResponse> {
        let url = self.build_url("oauth.v2.access");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("oauth.v2.access", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self, request), fields(client_id = %request.client_id))]
    async fn v2_exchange(&self, request: V2ExchangeRequest) -> SlackResult<V2ExchangeResponse> {
        let url = self.build_url("oauth.v2.exchange");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("oauth.v2.exchange", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self, request), fields(client_id = %request.client_id))]
    async fn openid_connect_token(
        &self,
        request: OpenIdConnectTokenRequest,
    ) -> SlackResult<OpenIdConnectTokenResponse> {
        let url = self.build_url("openid.connect.token");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("openid.connect.token", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self))]
    async fn openid_connect_userinfo(
        &self,
        request: OpenIdConnectUserInfoRequest,
    ) -> SlackResult<OpenIdConnectUserInfoResponse> {
        let url = self.build_url("openid.connect.userInfo");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("openid.connect.userInfo", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }
}
