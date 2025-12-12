//! Response types for apps service.

use crate::types::ResponseMetadata;
use serde::Deserialize;

/// Response from apps.connections.open
#[derive(Debug, Clone, Deserialize)]
pub struct ConnectionsOpenResponse {
    /// Success indicator
    pub ok: bool,
    /// WebSocket URL for Socket Mode
    pub url: String,
}

impl ConnectionsOpenResponse {
    /// Get the WebSocket URL
    pub fn websocket_url(&self) -> &str {
        &self.url
    }
}

/// Response from apps.event.authorizations.list
#[derive(Debug, Clone, Deserialize)]
pub struct EventAuthorizationsListResponse {
    /// Success indicator
    pub ok: bool,
    /// List of authorizations
    #[serde(default)]
    pub authorizations: Vec<Authorization>,
    /// Response metadata for pagination
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

/// Authorization information
#[derive(Debug, Clone, Deserialize)]
pub struct Authorization {
    /// Enterprise ID
    #[serde(default)]
    pub enterprise_id: Option<String>,
    /// Team ID
    pub team_id: String,
    /// User ID
    pub user_id: String,
    /// Whether the app is a bot
    #[serde(default)]
    pub is_bot: bool,
    /// Whether this is an enterprise install
    #[serde(default)]
    pub is_enterprise_install: Option<bool>,
}

impl Authorization {
    /// Check if this is an enterprise-wide installation
    pub fn is_enterprise_wide(&self) -> bool {
        self.is_enterprise_install.unwrap_or(false)
    }
}

/// Response from apps.uninstall
#[derive(Debug, Clone, Deserialize)]
pub struct UninstallResponse {
    /// Success indicator
    pub ok: bool,
}
