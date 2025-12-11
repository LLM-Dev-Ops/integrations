//! Mistral API client.

use std::sync::Arc;
use std::time::Duration;

use crate::config::MistralConfig;
use crate::errors::{MistralError, MistralResult};
use crate::observability::metrics::{DefaultMetricsCollector, MetricsCollector};
use crate::resilience::{
    CircuitBreaker, DefaultResilienceOrchestrator, RateLimiter, ResilienceConfig,
    ResilienceOrchestrator, RetryExecutor,
};
use crate::services::{
    AgentsService, BatchService, ChatService, DefaultAgentsService, DefaultBatchService,
    DefaultChatService, DefaultEmbeddingsService, DefaultFilesService, DefaultFineTuningService,
    DefaultModelsService, EmbeddingsService, FilesService, FineTuningService, ModelsService,
};
use crate::transport::{ReqwestTransport, TransportConfig};

/// The main Mistral client.
pub struct MistralClient {
    config: MistralConfig,
    transport: Arc<ReqwestTransport>,
    resilience: Arc<dyn ResilienceOrchestrator>,
    metrics: Arc<dyn MetricsCollector>,
}

impl MistralClient {
    /// Creates a new Mistral client with the given configuration.
    pub fn new(config: MistralConfig) -> MistralResult<Self> {
        let transport_config = TransportConfig {
            base_url: config.base_url.clone(),
            api_key: config.api_key.expose_secret().to_string(),
            timeout: config.timeout,
        };

        let transport = Arc::new(ReqwestTransport::with_config(transport_config)?);

        let resilience_config = ResilienceConfig::default();
        let retry = RetryExecutor::new(resilience_config.retry.clone());
        let circuit_breaker = CircuitBreaker::new(resilience_config.circuit_breaker.clone());
        let rate_limiter = RateLimiter::new(resilience_config.rate_limiter.clone());

        let resilience = Arc::new(DefaultResilienceOrchestrator::new(
            retry,
            circuit_breaker,
            rate_limiter,
        ));

        let metrics = Arc::new(DefaultMetricsCollector::new());

        Ok(Self {
            config,
            transport,
            resilience,
            metrics,
        })
    }

    /// Creates a new client builder.
    pub fn builder() -> MistralClientBuilder {
        MistralClientBuilder::new()
    }

    /// Creates a client from an API key.
    pub fn from_api_key(api_key: impl Into<String>) -> MistralResult<Self> {
        let config = MistralConfig::builder()
            .api_key(api_key)
            .build()?;
        Self::new(config)
    }

    /// Creates a client from the environment.
    pub fn from_env() -> MistralResult<Self> {
        let config = MistralConfig::from_env()?;
        Self::new(config)
    }

    /// Returns the chat service.
    pub fn chat(&self) -> impl ChatService + '_ {
        DefaultChatService::new(self.transport.as_ref())
    }

    /// Returns the embeddings service.
    pub fn embeddings(&self) -> impl EmbeddingsService + '_ {
        DefaultEmbeddingsService::new(self.transport.as_ref())
    }

    /// Returns the models service.
    pub fn models(&self) -> impl ModelsService + '_ {
        DefaultModelsService::new(self.transport.as_ref())
    }

    /// Returns the files service.
    pub fn files(&self) -> impl FilesService + '_ {
        DefaultFilesService::new(self.transport.as_ref())
    }

    /// Returns the fine-tuning service.
    pub fn fine_tuning(&self) -> impl FineTuningService + '_ {
        DefaultFineTuningService::new(self.transport.as_ref())
    }

    /// Returns the agents service.
    pub fn agents(&self) -> impl AgentsService + '_ {
        DefaultAgentsService::new(self.transport.as_ref())
    }

    /// Returns the batch service.
    pub fn batch(&self) -> impl BatchService + '_ {
        DefaultBatchService::new(self.transport.as_ref())
    }

    /// Returns the metrics collector.
    pub fn metrics(&self) -> &dyn MetricsCollector {
        self.metrics.as_ref()
    }

    /// Returns the resilience orchestrator.
    pub fn resilience(&self) -> &dyn ResilienceOrchestrator {
        self.resilience.as_ref()
    }

    /// Returns the client configuration.
    pub fn config(&self) -> &MistralConfig {
        &self.config
    }
}

/// Builder for the Mistral client.
pub struct MistralClientBuilder {
    api_key: Option<String>,
    base_url: Option<String>,
    timeout: Option<Duration>,
    max_retries: Option<u32>,
    resilience_config: Option<ResilienceConfig>,
    metrics: Option<Arc<dyn MetricsCollector>>,
}

impl Default for MistralClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl MistralClientBuilder {
    /// Creates a new client builder.
    pub fn new() -> Self {
        Self {
            api_key: None,
            base_url: None,
            timeout: None,
            max_retries: None,
            resilience_config: None,
            metrics: None,
        }
    }

    /// Sets the API key.
    pub fn api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    /// Sets the base URL.
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }

    /// Sets the request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Sets the maximum number of retries.
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.max_retries = Some(retries);
        self
    }

    /// Sets the resilience configuration.
    pub fn resilience_config(mut self, config: ResilienceConfig) -> Self {
        self.resilience_config = Some(config);
        self
    }

    /// Sets the metrics collector.
    pub fn metrics(mut self, metrics: Arc<dyn MetricsCollector>) -> Self {
        self.metrics = Some(metrics);
        self
    }

    /// Builds the client.
    pub fn build(self) -> MistralResult<MistralClient> {
        let api_key = self.api_key.or_else(|| std::env::var("MISTRAL_API_KEY").ok());

        let api_key = api_key.ok_or_else(|| MistralError::Configuration {
            message: "API key not provided and MISTRAL_API_KEY not set".to_string(),
        })?;

        let mut config_builder = MistralConfig::builder().api_key(api_key);

        if let Some(base_url) = self.base_url {
            config_builder = config_builder.base_url(base_url);
        }

        if let Some(timeout) = self.timeout {
            config_builder = config_builder.timeout(timeout);
        }

        if let Some(max_retries) = self.max_retries {
            config_builder = config_builder.max_retries(max_retries);
        }

        let config = config_builder.build()?;

        let transport_config = TransportConfig {
            base_url: config.base_url.clone(),
            api_key: config.api_key.expose_secret().to_string(),
            timeout: config.timeout,
        };

        let transport = Arc::new(ReqwestTransport::with_config(transport_config)?);

        let resilience_config = self.resilience_config.unwrap_or_default();
        let retry = RetryExecutor::new(resilience_config.retry.clone());
        let circuit_breaker = CircuitBreaker::new(resilience_config.circuit_breaker.clone());
        let rate_limiter = RateLimiter::new(resilience_config.rate_limiter.clone());

        let resilience = Arc::new(DefaultResilienceOrchestrator::new(
            retry,
            circuit_breaker,
            rate_limiter,
        ));

        let metrics = self
            .metrics
            .unwrap_or_else(|| Arc::new(DefaultMetricsCollector::new()));

        Ok(MistralClient {
            config,
            transport,
            resilience,
            metrics,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_builder() {
        let result = MistralClient::builder()
            .api_key("test-key")
            .base_url("https://test.api.com")
            .timeout(Duration::from_secs(60))
            .build();

        assert!(result.is_ok());
        let client = result.unwrap();
        assert_eq!(client.config().base_url, "https://test.api.com");
    }

    #[test]
    fn test_client_from_api_key() {
        let result = MistralClient::from_api_key("test-key");
        assert!(result.is_ok());
    }

    #[test]
    fn test_client_without_api_key_fails() {
        std::env::remove_var("MISTRAL_API_KEY");
        let result = MistralClient::builder().build();
        assert!(result.is_err());
    }
}
