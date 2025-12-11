//! Types for the Connectors service.

use crate::types::ApiMeta;
use serde::{Deserialize, Serialize};

/// Authentication type for connectors
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectorAuthType {
    /// OAuth 2.0 authentication
    Oauth,
    /// Service account authentication
    ServiceAccount,
}

/// OAuth configuration for a connector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorOAuth {
    /// Client ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Client secret (only in create requests)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    /// Authorization URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authorize_url: Option<String>,
    /// Token URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_url: Option<String>,
    /// Scopes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scopes: Option<Vec<String>>,
}

impl ConnectorOAuth {
    /// Create a new OAuth configuration
    pub fn new() -> Self {
        Self {
            client_id: None,
            client_secret: None,
            authorize_url: None,
            token_url: None,
            scopes: None,
        }
    }
}

impl Default for ConnectorOAuth {
    fn default() -> Self {
        Self::new()
    }
}

/// Service account configuration for a connector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorServiceAccount {
    /// Service account JSON (only in create requests)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub json: Option<String>,
}

impl ConnectorServiceAccount {
    /// Create a new service account configuration
    pub fn new(json: impl Into<String>) -> Self {
        Self {
            json: Some(json.into()),
        }
    }
}

/// A connector
#[derive(Debug, Clone, Deserialize)]
pub struct Connector {
    /// Connector ID
    pub id: String,
    /// Connector name
    pub name: String,
    /// Connector description
    #[serde(default)]
    pub description: Option<String>,
    /// Connector URL
    #[serde(default)]
    pub url: Option<String>,
    /// Authentication type
    #[serde(default)]
    pub auth_type: Option<ConnectorAuthType>,
    /// OAuth configuration
    #[serde(default)]
    pub oauth: Option<ConnectorOAuth>,
    /// Whether the connector is active
    #[serde(default)]
    pub active: Option<bool>,
    /// Whether the connector continues on failure
    #[serde(default)]
    pub continue_on_failure: Option<bool>,
    /// Creation time
    #[serde(default)]
    pub created_at: Option<String>,
    /// Last update time
    #[serde(default)]
    pub updated_at: Option<String>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

/// Request to create a connector
#[derive(Debug, Clone, Serialize)]
pub struct CreateConnectorRequest {
    /// Connector name
    pub name: String,
    /// Connector URL
    pub url: String,
    /// Connector description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Authentication type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_type: Option<ConnectorAuthType>,
    /// OAuth configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth: Option<ConnectorOAuth>,
    /// Service account configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_auth: Option<ConnectorServiceAccount>,
    /// Whether to continue on failure
    #[serde(skip_serializing_if = "Option::is_none")]
    pub continue_on_failure: Option<bool>,
}

impl CreateConnectorRequest {
    /// Create a new connector request
    pub fn new(name: impl Into<String>, url: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            url: url.into(),
            description: None,
            auth_type: None,
            oauth: None,
            service_auth: None,
            continue_on_failure: None,
        }
    }

    /// Add a description
    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set OAuth authentication
    pub fn oauth(mut self, oauth: ConnectorOAuth) -> Self {
        self.auth_type = Some(ConnectorAuthType::Oauth);
        self.oauth = Some(oauth);
        self
    }

    /// Set service account authentication
    pub fn service_account(mut self, service_auth: ConnectorServiceAccount) -> Self {
        self.auth_type = Some(ConnectorAuthType::ServiceAccount);
        self.service_auth = Some(service_auth);
        self
    }

    /// Set continue on failure
    pub fn continue_on_failure(mut self, continue_on_failure: bool) -> Self {
        self.continue_on_failure = Some(continue_on_failure);
        self
    }
}

/// Request to update a connector
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateConnectorRequest {
    /// New name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// New URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// New description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

impl UpdateConnectorRequest {
    /// Create a new update request
    pub fn new() -> Self {
        Self::default()
    }

    /// Update name
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    /// Update URL
    pub fn url(mut self, url: impl Into<String>) -> Self {
        self.url = Some(url.into());
        self
    }

    /// Update description
    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_connector_request() {
        let request = CreateConnectorRequest::new("my-connector", "https://example.com/api")
            .description("A test connector")
            .continue_on_failure(true);

        assert_eq!(request.name, "my-connector");
        assert_eq!(request.url, "https://example.com/api");
        assert!(request.description.is_some());
    }

    #[test]
    fn test_update_connector_request() {
        let request = UpdateConnectorRequest::new()
            .name("new-name")
            .description("new description");

        assert_eq!(request.name, Some("new-name".to_string()));
        assert_eq!(request.description, Some("new description".to_string()));
    }
}
