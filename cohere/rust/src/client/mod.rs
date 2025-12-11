//! Client interface and implementation for the Cohere API.

use crate::auth::{AuthManager, BearerAuthManager};
use crate::config::CohereConfig;
use crate::errors::{CohereError, CohereResult};
use crate::services::chat::{ChatService, ChatServiceImpl};
use crate::services::classify::{ClassifyService, ClassifyServiceImpl};
use crate::services::embed::{EmbedService, EmbedServiceImpl};
use crate::services::generate::{GenerateService, GenerateServiceImpl};
use crate::services::models::{ModelsService, ModelsServiceImpl};
use crate::services::rerank::{RerankService, RerankServiceImpl};
use crate::services::summarize::{SummarizeService, SummarizeServiceImpl};
use crate::services::tokenize::{TokenizeService, TokenizeServiceImpl};
use crate::transport::{HttpTransport, ReqwestTransport};
use std::sync::Arc;
use url::Url;

#[cfg(feature = "datasets")]
use crate::services::datasets::{DatasetsService, DatasetsServiceImpl};

#[cfg(feature = "connectors")]
use crate::services::connectors::{ConnectorsService, ConnectorsServiceImpl};

#[cfg(feature = "finetune")]
use crate::services::finetune::{FinetuneService, FinetuneServiceImpl};

/// Trait defining the main Cohere client interface
pub trait CohereClient: Send + Sync {
    /// Get the chat service
    fn chat(&self) -> Arc<dyn ChatService>;

    /// Get the generate service
    fn generate(&self) -> Arc<dyn GenerateService>;

    /// Get the embed service
    fn embed(&self) -> Arc<dyn EmbedService>;

    /// Get the rerank service
    fn rerank(&self) -> Arc<dyn RerankService>;

    /// Get the classify service
    fn classify(&self) -> Arc<dyn ClassifyService>;

    /// Get the summarize service
    fn summarize(&self) -> Arc<dyn SummarizeService>;

    /// Get the tokenize service
    fn tokenize(&self) -> Arc<dyn TokenizeService>;

    /// Get the models service
    fn models(&self) -> Arc<dyn ModelsService>;

    /// Get the datasets service (requires 'datasets' feature)
    #[cfg(feature = "datasets")]
    fn datasets(&self) -> Arc<dyn DatasetsService>;

    /// Get the connectors service (requires 'connectors' feature)
    #[cfg(feature = "connectors")]
    fn connectors(&self) -> Arc<dyn ConnectorsService>;

    /// Get the finetune service (requires 'finetune' feature)
    #[cfg(feature = "finetune")]
    fn finetune(&self) -> Arc<dyn FinetuneService>;
}

/// Implementation of the Cohere client
pub struct CohereClientImpl {
    config: Arc<CohereConfig>,
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,

    // Lazily initialized services
    chat_service: once_cell::sync::OnceCell<Arc<dyn ChatService>>,
    generate_service: once_cell::sync::OnceCell<Arc<dyn GenerateService>>,
    embed_service: once_cell::sync::OnceCell<Arc<dyn EmbedService>>,
    rerank_service: once_cell::sync::OnceCell<Arc<dyn RerankService>>,
    classify_service: once_cell::sync::OnceCell<Arc<dyn ClassifyService>>,
    summarize_service: once_cell::sync::OnceCell<Arc<dyn SummarizeService>>,
    tokenize_service: once_cell::sync::OnceCell<Arc<dyn TokenizeService>>,
    models_service: once_cell::sync::OnceCell<Arc<dyn ModelsService>>,
    #[cfg(feature = "datasets")]
    datasets_service: once_cell::sync::OnceCell<Arc<dyn DatasetsService>>,
    #[cfg(feature = "connectors")]
    connectors_service: once_cell::sync::OnceCell<Arc<dyn ConnectorsService>>,
    #[cfg(feature = "finetune")]
    finetune_service: once_cell::sync::OnceCell<Arc<dyn FinetuneService>>,
}

impl CohereClientImpl {
    /// Create a new client from configuration
    pub fn new(config: CohereConfig) -> CohereResult<Self> {
        // Validate configuration
        config.validate()?;

        let base_url = Url::parse(&config.base_url)?;
        let config = Arc::new(config);

        let transport =
            Arc::new(ReqwestTransport::new(config.timeout)?) as Arc<dyn HttpTransport>;

        let auth_manager = Arc::new(BearerAuthManager::with_options(
            config.api_key.clone(),
            config.client_name.clone(),
            config.user_agent_suffix.clone(),
        )) as Arc<dyn AuthManager>;

        // Validate API key format
        auth_manager.validate_api_key().map_err(|e| {
            CohereError::Configuration {
                message: format!("Invalid API key: {}", e),
            }
        })?;

        Ok(Self {
            config,
            transport,
            auth_manager,
            base_url,
            chat_service: once_cell::sync::OnceCell::new(),
            generate_service: once_cell::sync::OnceCell::new(),
            embed_service: once_cell::sync::OnceCell::new(),
            rerank_service: once_cell::sync::OnceCell::new(),
            classify_service: once_cell::sync::OnceCell::new(),
            summarize_service: once_cell::sync::OnceCell::new(),
            tokenize_service: once_cell::sync::OnceCell::new(),
            models_service: once_cell::sync::OnceCell::new(),
            #[cfg(feature = "datasets")]
            datasets_service: once_cell::sync::OnceCell::new(),
            #[cfg(feature = "connectors")]
            connectors_service: once_cell::sync::OnceCell::new(),
            #[cfg(feature = "finetune")]
            finetune_service: once_cell::sync::OnceCell::new(),
        })
    }

    /// Create a new client with custom transport and auth manager (for testing)
    #[cfg(test)]
    pub fn with_dependencies(
        config: CohereConfig,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
    ) -> CohereResult<Self> {
        let base_url = Url::parse(&config.base_url)?;

        Ok(Self {
            config: Arc::new(config),
            transport,
            auth_manager,
            base_url,
            chat_service: once_cell::sync::OnceCell::new(),
            generate_service: once_cell::sync::OnceCell::new(),
            embed_service: once_cell::sync::OnceCell::new(),
            rerank_service: once_cell::sync::OnceCell::new(),
            classify_service: once_cell::sync::OnceCell::new(),
            summarize_service: once_cell::sync::OnceCell::new(),
            tokenize_service: once_cell::sync::OnceCell::new(),
            models_service: once_cell::sync::OnceCell::new(),
            #[cfg(feature = "datasets")]
            datasets_service: once_cell::sync::OnceCell::new(),
            #[cfg(feature = "connectors")]
            connectors_service: once_cell::sync::OnceCell::new(),
            #[cfg(feature = "finetune")]
            finetune_service: once_cell::sync::OnceCell::new(),
        })
    }

    /// Get the configuration
    pub fn config(&self) -> &CohereConfig {
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

    /// Get the base URL
    pub fn base_url(&self) -> &Url {
        &self.base_url
    }
}

impl CohereClient for CohereClientImpl {
    fn chat(&self) -> Arc<dyn ChatService> {
        self.chat_service
            .get_or_init(|| {
                Arc::new(ChatServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn ChatService>
            })
            .clone()
    }

    fn generate(&self) -> Arc<dyn GenerateService> {
        self.generate_service
            .get_or_init(|| {
                Arc::new(GenerateServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn GenerateService>
            })
            .clone()
    }

    fn embed(&self) -> Arc<dyn EmbedService> {
        self.embed_service
            .get_or_init(|| {
                Arc::new(EmbedServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn EmbedService>
            })
            .clone()
    }

    fn rerank(&self) -> Arc<dyn RerankService> {
        self.rerank_service
            .get_or_init(|| {
                Arc::new(RerankServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn RerankService>
            })
            .clone()
    }

    fn classify(&self) -> Arc<dyn ClassifyService> {
        self.classify_service
            .get_or_init(|| {
                Arc::new(ClassifyServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn ClassifyService>
            })
            .clone()
    }

    fn summarize(&self) -> Arc<dyn SummarizeService> {
        self.summarize_service
            .get_or_init(|| {
                Arc::new(SummarizeServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn SummarizeService>
            })
            .clone()
    }

    fn tokenize(&self) -> Arc<dyn TokenizeService> {
        self.tokenize_service
            .get_or_init(|| {
                Arc::new(TokenizeServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn TokenizeService>
            })
            .clone()
    }

    fn models(&self) -> Arc<dyn ModelsService> {
        self.models_service
            .get_or_init(|| {
                Arc::new(ModelsServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn ModelsService>
            })
            .clone()
    }

    #[cfg(feature = "datasets")]
    fn datasets(&self) -> Arc<dyn DatasetsService> {
        self.datasets_service
            .get_or_init(|| {
                Arc::new(DatasetsServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn DatasetsService>
            })
            .clone()
    }

    #[cfg(feature = "connectors")]
    fn connectors(&self) -> Arc<dyn ConnectorsService> {
        self.connectors_service
            .get_or_init(|| {
                Arc::new(ConnectorsServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn ConnectorsService>
            })
            .clone()
    }

    #[cfg(feature = "finetune")]
    fn finetune(&self) -> Arc<dyn FinetuneService> {
        self.finetune_service
            .get_or_init(|| {
                Arc::new(FinetuneServiceImpl::new(
                    self.transport.clone(),
                    self.auth_manager.clone(),
                    self.base_url.clone(),
                )) as Arc<dyn FinetuneService>
            })
            .clone()
    }
}

/// Create a new Cohere client from configuration
pub fn create_client(config: CohereConfig) -> CohereResult<CohereClientImpl> {
    CohereClientImpl::new(config)
}

/// Create a new Cohere client from environment variables
pub fn create_client_from_env() -> CohereResult<CohereClientImpl> {
    let config = CohereConfig::from_env()?;
    create_client(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::CohereConfig;
    use secrecy::SecretString;

    #[test]
    fn test_create_client() {
        let config = CohereConfig::builder()
            .api_key(SecretString::new("test-api-key-12345678".to_string()))
            .build()
            .unwrap();

        let client = create_client(config);
        assert!(client.is_ok());
    }

    #[test]
    fn test_create_client_short_key() {
        let config = CohereConfig::builder()
            .api_key(SecretString::new("short".to_string()))
            .build()
            .unwrap();

        let client = create_client(config);
        assert!(client.is_err());
    }

    #[test]
    fn test_client_services_are_cached() {
        let config = CohereConfig::builder()
            .api_key(SecretString::new("test-api-key-12345678".to_string()))
            .build()
            .unwrap();

        let client = create_client(config).unwrap();

        // Get services twice and ensure they're the same instance
        let chat1 = client.chat();
        let chat2 = client.chat();

        // They should be the same Arc pointer
        assert!(Arc::ptr_eq(&chat1, &chat2));
    }
}
