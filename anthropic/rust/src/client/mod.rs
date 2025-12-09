//! Client interface and implementation for the Anthropic API.

use crate::auth::{AuthManager, BearerAuthManager};
use crate::config::AnthropicConfig;
use crate::errors::{AnthropicError, AnthropicResult};
use crate::transport::{HttpTransport, ReqwestTransport};
use std::sync::Arc;

/// Trait defining the main Anthropic client interface
pub trait AnthropicClient: Send + Sync {
    // Service accessors will be added here as services are implemented
    // fn messages(&self) -> Arc<dyn MessagesService>;
    // fn models(&self) -> Arc<dyn ModelsService>;
    // fn batches(&self) -> Arc<dyn BatchesService>;
}

/// Implementation of the Anthropic client
pub struct AnthropicClientImpl {
    config: Arc<AnthropicConfig>,
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
}

impl AnthropicClientImpl {
    /// Create a new client from configuration
    pub fn new(config: AnthropicConfig) -> AnthropicResult<Self> {
        let config = Arc::new(config);

        let transport = Arc::new(ReqwestTransport::new(config.timeout)?)
            as Arc<dyn HttpTransport>;

        let auth_manager = Arc::new(BearerAuthManager::new(
            config.api_key.clone(),
            config.api_version.clone(),
            config.beta_features.clone(),
        )) as Arc<dyn AuthManager>;

        // Validate API key
        auth_manager.validate_api_key().map_err(|e| {
            AnthropicError::Configuration {
                message: format!("Invalid API key: {}", e),
            }
        })?;

        Ok(Self {
            config,
            transport,
            auth_manager,
        })
    }

    /// Create a new client with custom transport and auth manager (for testing)
    #[cfg(test)]
    pub fn with_dependencies(
        config: AnthropicConfig,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
    ) -> Self {
        Self {
            config: Arc::new(config),
            transport,
            auth_manager,
        }
    }

    /// Get the configuration
    pub fn config(&self) -> &AnthropicConfig {
        &self.config
    }

    /// Get the transport
    pub fn transport(&self) -> Arc<dyn HttpTransport> {
        self.transport.clone()
    }

    /// Get the auth manager
    pub fn auth_manager(&self) -> Arc<dyn AuthManager> {
        self.auth_manager.clone()
    }
}

impl AnthropicClient for AnthropicClientImpl {
    // Service implementations will be added here
}

/// Create a new Anthropic client from configuration
pub fn create_client(config: AnthropicConfig) -> AnthropicResult<AnthropicClientImpl> {
    AnthropicClientImpl::new(config)
}

/// Create a new Anthropic client from environment variables
pub fn create_client_from_env() -> AnthropicResult<AnthropicClientImpl> {
    let config = AnthropicConfig::from_env()?;
    create_client(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AnthropicConfig;
    use secrecy::SecretString;

    #[test]
    fn test_create_client() {
        let config = AnthropicConfig::builder()
            .api_key(SecretString::new("sk-ant-test123456789012345".to_string()))
            .build()
            .unwrap();

        let client = create_client(config);
        assert!(client.is_ok());
    }

    #[test]
    fn test_create_client_invalid_key() {
        let config = AnthropicConfig::builder()
            .api_key(SecretString::new("invalid".to_string()))
            .build()
            .unwrap();

        let client = create_client(config);
        assert!(client.is_err());
    }
}
