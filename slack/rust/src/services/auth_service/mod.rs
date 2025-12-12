//! Auth service for Slack API.
//!
//! Provides methods for authentication testing and OAuth.

use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use crate::types::{TeamId, UserId};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::instrument;

/// Response from auth.test
#[derive(Debug, Clone, Deserialize)]
pub struct AuthTestResponse {
    /// Success indicator
    pub ok: bool,
    /// URL of the workspace
    pub url: String,
    /// Team name
    pub team: String,
    /// User name
    pub user: String,
    /// Team ID
    pub team_id: TeamId,
    /// User ID
    pub user_id: UserId,
    /// Bot ID (if bot token)
    #[serde(default)]
    pub bot_id: Option<String>,
    /// Enterprise ID
    #[serde(default)]
    pub enterprise_id: Option<String>,
    /// Whether enterprise install
    #[serde(default)]
    pub is_enterprise_install: bool,
}

/// Response from auth.revoke
#[derive(Debug, Clone, Deserialize)]
pub struct AuthRevokeResponse {
    /// Success indicator
    pub ok: bool,
    /// Whether token was revoked
    pub revoked: bool,
}

/// Request for OAuth access
#[derive(Debug, Clone, Serialize)]
pub struct OAuthAccessRequest {
    /// Client ID
    pub client_id: String,
    /// Client secret
    pub client_secret: String,
    /// Authorization code
    pub code: String,
    /// Redirect URI
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_uri: Option<String>,
}

impl OAuthAccessRequest {
    /// Create a new request
    pub fn new(
        client_id: impl Into<String>,
        client_secret: impl Into<String>,
        code: impl Into<String>,
    ) -> Self {
        Self {
            client_id: client_id.into(),
            client_secret: client_secret.into(),
            code: code.into(),
            redirect_uri: None,
        }
    }

    /// Set redirect URI
    pub fn redirect_uri(mut self, uri: impl Into<String>) -> Self {
        self.redirect_uri = Some(uri.into());
        self
    }
}

/// Response from oauth.v2.access
#[derive(Debug, Clone, Deserialize)]
pub struct OAuthV2AccessResponse {
    /// Success indicator
    pub ok: bool,
    /// Access token
    pub access_token: String,
    /// Token type (always "bot" for v2)
    pub token_type: String,
    /// Scopes granted
    pub scope: String,
    /// Bot user ID
    #[serde(default)]
    pub bot_user_id: Option<String>,
    /// App ID
    pub app_id: String,
    /// Team info
    pub team: OAuthTeam,
    /// Enterprise info
    #[serde(default)]
    pub enterprise: Option<OAuthEnterprise>,
    /// Authed user info
    #[serde(default)]
    pub authed_user: Option<OAuthAuthedUser>,
    /// Incoming webhook info
    #[serde(default)]
    pub incoming_webhook: Option<OAuthIncomingWebhook>,
    /// Whether enterprise install
    #[serde(default)]
    pub is_enterprise_install: bool,
}

/// OAuth team info
#[derive(Debug, Clone, Deserialize)]
pub struct OAuthTeam {
    /// Team ID
    pub id: String,
    /// Team name
    pub name: String,
}

/// OAuth enterprise info
#[derive(Debug, Clone, Deserialize)]
pub struct OAuthEnterprise {
    /// Enterprise ID
    pub id: String,
    /// Enterprise name
    pub name: String,
}

/// OAuth authed user info
#[derive(Debug, Clone, Deserialize)]
pub struct OAuthAuthedUser {
    /// User ID
    pub id: String,
    /// User scopes
    #[serde(default)]
    pub scope: Option<String>,
    /// User access token
    #[serde(default)]
    pub access_token: Option<String>,
    /// User token type
    #[serde(default)]
    pub token_type: Option<String>,
}

/// OAuth incoming webhook info
#[derive(Debug, Clone, Deserialize)]
pub struct OAuthIncomingWebhook {
    /// Channel the webhook posts to
    pub channel: String,
    /// Channel ID
    pub channel_id: String,
    /// Configuration URL
    pub configuration_url: String,
    /// Webhook URL
    pub url: String,
}

/// Trait for auth service operations
#[async_trait]
pub trait AuthServiceTrait: Send + Sync {
    /// Test authentication
    async fn test(&self) -> SlackResult<AuthTestResponse>;

    /// Revoke the current token
    async fn revoke(&self, test: bool) -> SlackResult<AuthRevokeResponse>;

    /// Exchange OAuth code for token (v2)
    async fn oauth_v2_access(&self, request: OAuthAccessRequest) -> SlackResult<OAuthV2AccessResponse>;
}

/// Auth service implementation
#[derive(Clone)]
pub struct AuthService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl AuthService {
    /// Create a new auth service
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
impl AuthServiceTrait for AuthService {
    #[instrument(skip(self))]
    async fn test(&self) -> SlackResult<AuthTestResponse> {
        let url = self.build_url("auth.test");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("auth.test", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json::<(), AuthTestResponse>(TransportRequest::post(
                            url,
                            headers,
                            (),
                        ))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self))]
    async fn revoke(&self, test: bool) -> SlackResult<AuthRevokeResponse> {
        let url = self.build_url("auth.revoke");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        #[derive(Serialize, Clone)]
        struct RevokeRequest {
            test: bool,
        }

        self.resilience
            .execute("auth.revoke", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, RevokeRequest { test }))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self, request))]
    async fn oauth_v2_access(&self, request: OAuthAccessRequest) -> SlackResult<OAuthV2AccessResponse> {
        let url = self.build_url("oauth.v2.access");
        // OAuth requests don't use bearer token auth
        let headers = http::HeaderMap::new();
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
}
