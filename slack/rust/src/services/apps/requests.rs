//! Request types for apps service.

use serde::Serialize;

/// Request to open a WebSocket connection (Socket Mode)
#[derive(Debug, Clone, Serialize, Default)]
pub struct ConnectionsOpenRequest {}

impl ConnectionsOpenRequest {
    /// Create a new connections open request
    pub fn new() -> Self {
        Self::default()
    }
}

/// Request to list event authorizations
#[derive(Debug, Clone, Serialize)]
pub struct EventAuthorizationsListRequest {
    /// Event context token
    pub event_context: String,
    /// Cursor for pagination
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    /// Maximum number of items to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
}

impl EventAuthorizationsListRequest {
    /// Create a new event authorizations list request
    pub fn new(event_context: impl Into<String>) -> Self {
        Self {
            event_context: event_context.into(),
            cursor: None,
            limit: None,
        }
    }

    /// Set pagination cursor
    pub fn cursor(mut self, cursor: impl Into<String>) -> Self {
        self.cursor = Some(cursor.into());
        self
    }

    /// Set limit
    pub fn limit(mut self, limit: i32) -> Self {
        self.limit = Some(limit);
        self
    }
}

/// Request to uninstall an app
#[derive(Debug, Clone, Serialize, Default)]
pub struct UninstallRequest {
    /// Client ID of the app
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Client secret of the app
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
}

impl UninstallRequest {
    /// Create a new uninstall request
    pub fn new() -> Self {
        Self::default()
    }

    /// Set client credentials
    pub fn with_credentials(
        client_id: impl Into<String>,
        client_secret: impl Into<String>,
    ) -> Self {
        Self {
            client_id: Some(client_id.into()),
            client_secret: Some(client_secret.into()),
        }
    }
}
