//! Request types for OAuth service.

use serde::Serialize;

/// Request for OAuth v2 access
#[derive(Debug, Clone, Serialize)]
pub struct V2AccessRequest {
    /// Client ID
    pub client_id: String,
    /// Client secret
    pub client_secret: String,
    /// Authorization code
    pub code: String,
    /// Redirect URI (must match the one used in authorization)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_uri: Option<String>,
}

impl V2AccessRequest {
    /// Create a new OAuth v2 access request
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

    /// Set the redirect URI
    pub fn redirect_uri(mut self, uri: impl Into<String>) -> Self {
        self.redirect_uri = Some(uri.into());
        self
    }
}

/// Request for OAuth v2 token exchange
#[derive(Debug, Clone, Serialize)]
pub struct V2ExchangeRequest {
    /// Client ID
    pub client_id: String,
    /// Client secret
    pub client_secret: String,
    /// Token to exchange
    pub token: String,
}

impl V2ExchangeRequest {
    /// Create a new token exchange request
    pub fn new(
        client_id: impl Into<String>,
        client_secret: impl Into<String>,
        token: impl Into<String>,
    ) -> Self {
        Self {
            client_id: client_id.into(),
            client_secret: client_secret.into(),
            token: token.into(),
        }
    }
}

/// Request for OpenID Connect token
#[derive(Debug, Clone, Serialize)]
pub struct OpenIdConnectTokenRequest {
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

impl OpenIdConnectTokenRequest {
    /// Create a new OpenID Connect token request
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

    /// Set the redirect URI
    pub fn redirect_uri(mut self, uri: impl Into<String>) -> Self {
        self.redirect_uri = Some(uri.into());
        self
    }
}

/// Request for OpenID Connect user info
#[derive(Debug, Clone, Serialize, Default)]
pub struct OpenIdConnectUserInfoRequest {}

impl OpenIdConnectUserInfoRequest {
    /// Create a new user info request
    pub fn new() -> Self {
        Self::default()
    }
}
