use crate::auth::AuthManager;
use crate::client::{OpenAIClient, OpenAIClientImpl, OpenAIConfig};
use crate::errors::{ConfigurationError, OpenAIError, OpenAIResult};
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;
use std::sync::Arc;

pub struct OpenAIClientBuilder {
    config: Option<OpenAIConfig>,
    transport: Option<Arc<dyn HttpTransport>>,
    auth_manager: Option<Arc<dyn AuthManager>>,
    resilience: Option<Arc<dyn ResilienceOrchestrator>>,
}

impl OpenAIClientBuilder {
    pub fn new() -> Self {
        Self {
            config: None,
            transport: None,
            auth_manager: None,
            resilience: None,
        }
    }

    pub fn with_config(mut self, config: OpenAIConfig) -> Self {
        self.config = Some(config);
        self
    }

    pub fn with_api_key(mut self, api_key: impl Into<String>) -> Self {
        self.config = Some(OpenAIConfig::new(api_key));
        self
    }

    pub fn with_transport(mut self, transport: Arc<dyn HttpTransport>) -> Self {
        self.transport = Some(transport);
        self
    }

    pub fn with_auth_manager(mut self, auth_manager: Arc<dyn AuthManager>) -> Self {
        self.auth_manager = Some(auth_manager);
        self
    }

    pub fn with_resilience(mut self, resilience: Arc<dyn ResilienceOrchestrator>) -> Self {
        self.resilience = Some(resilience);
        self
    }

    pub fn build(self) -> OpenAIResult<Arc<dyn OpenAIClient>> {
        let config = self.config.ok_or_else(|| {
            OpenAIError::Configuration(ConfigurationError::MissingApiKey(
                "API key must be provided".to_string(),
            ))
        })?;

        let transport = self
            .transport
            .unwrap_or_else(|| Arc::new(crate::transport::ReqwestTransport::new(&config)));

        let auth_manager = self
            .auth_manager
            .unwrap_or_else(|| Arc::new(crate::auth::OpenAIAuthManager::new(config.clone())));

        let resilience = self.resilience.unwrap_or_else(|| {
            Arc::new(crate::resilience::OpenAIResilienceOrchestrator::new(
                &config,
            ))
        });

        Ok(Arc::new(OpenAIClientImpl::new(
            config,
            transport,
            auth_manager,
            resilience,
        )))
    }
}

impl Default for OpenAIClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builder_requires_config() {
        let result = OpenAIClientBuilder::new().build();
        assert!(result.is_err());
    }

    #[test]
    fn test_builder_with_api_key() {
        let result = OpenAIClientBuilder::new()
            .with_api_key("test-key")
            .build();
        assert!(result.is_ok());
    }
}
