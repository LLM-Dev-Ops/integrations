//! Slack client implementation.
//!
//! Provides the main entry point for interacting with Slack APIs.

use crate::auth::AuthManager;
use crate::config::SlackConfig;
use crate::errors::{SlackError, SlackResult};
use crate::transport::{HttpTransport, ReqwestTransport};
use std::sync::Arc;

/// Trait defining the Slack client interface
pub trait SlackClient: Send + Sync {
    /// Get the configuration
    fn config(&self) -> &SlackConfig;

    /// Get the authentication manager
    fn auth_manager(&self) -> &AuthManager;
}

/// Main Slack client implementation
pub struct SlackClientImpl {
    config: Arc<SlackConfig>,
    auth: AuthManager,
    transport: Arc<dyn HttpTransport>,
}

impl SlackClientImpl {
    /// Create a new Slack client with the given configuration
    pub fn new(config: SlackConfig) -> SlackResult<Self> {
        let config = Arc::new(config);
        let auth = AuthManager::new(config.clone());
        let transport = Arc::new(ReqwestTransport::new(config.timeout)?);

        Ok(Self {
            config,
            auth,
            transport,
        })
    }

    /// Create a new Slack client with a custom transport
    pub fn with_transport(
        config: SlackConfig,
        transport: Arc<dyn HttpTransport>,
    ) -> SlackResult<Self> {
        let config = Arc::new(config);
        let auth = AuthManager::new(config.clone());

        Ok(Self {
            config,
            auth,
            transport,
        })
    }

    /// Get a reference to the HTTP transport
    pub fn transport(&self) -> &Arc<dyn HttpTransport> {
        &self.transport
    }

    /// Get a reference to the base URL
    pub fn base_url(&self) -> &str {
        self.config.base_url.as_str()
    }

    /// Build a full URL for an endpoint
    pub fn build_url(&self, endpoint: &str) -> String {
        self.config.build_url(endpoint)
    }

    // Service accessors will be added in Phase 3
    // pub fn conversations(&self) -> ConversationsService { ... }
    // pub fn messages(&self) -> MessagesService { ... }
    // pub fn users(&self) -> UsersService { ... }
}

impl SlackClient for SlackClientImpl {
    fn config(&self) -> &SlackConfig {
        &self.config
    }

    fn auth_manager(&self) -> &AuthManager {
        &self.auth
    }
}

impl std::fmt::Debug for SlackClientImpl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SlackClientImpl")
            .field("config", &self.config)
            .field("auth", &self.auth)
            .finish()
    }
}

impl Clone for SlackClientImpl {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            auth: self.auth.clone(),
            transport: self.transport.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::SlackConfigBuilder;

    fn test_config() -> SlackConfig {
        SlackConfigBuilder::new()
            .bot_token("xoxb-test-token-123")
            .unwrap()
            .build_unchecked()
    }

    #[test]
    fn test_client_creation() {
        let client = SlackClientImpl::new(test_config()).unwrap();
        assert!(client.config().bot_token().is_some());
    }

    #[test]
    fn test_build_url() {
        let client = SlackClientImpl::new(test_config()).unwrap();
        assert_eq!(
            client.build_url("chat.postMessage"),
            "https://slack.com/api/chat.postMessage"
        );
    }

    #[test]
    fn test_client_clone() {
        let client = SlackClientImpl::new(test_config()).unwrap();
        let cloned = client.clone();
        assert_eq!(client.base_url(), cloned.base_url());
    }
}
