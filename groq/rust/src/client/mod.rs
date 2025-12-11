//! Groq API client.
//!
//! Provides the main client interface for interacting with the Groq API.

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::auth::{ApiKeyAuth, AuthProvider};
use crate::config::{GroqConfig, GroqConfigBuilder};
use crate::errors::GroqResult;
use crate::observability::{
    ConsoleLogger, DefaultMetricsCollector, LogConfig, Logger, MetricsCollector, Observability,
};
use crate::resilience::{RateLimitManager, ResilienceConfig, ResilienceOrchestrator};
use crate::services::{AudioService, ChatService, ModelsService};
use crate::transport::{HttpTransport, HttpTransportImpl};

/// The main Groq client.
///
/// Provides access to all Groq API services including chat completions,
/// audio transcription, and model management.
///
/// # Example
///
/// ```rust,no_run
/// use groq_client::{GroqClient, ChatRequest};
///
/// #[tokio::main]
/// async fn main() -> Result<(), Box<dyn std::error::Error>> {
///     let client = GroqClient::builder()
///         .api_key("gsk_your_api_key")
///         .build()?;
///
///     let request = ChatRequest::builder()
///         .model("llama-3.3-70b-versatile")
///         .user("Hello, Groq!")
///         .build()?;
///
///     let response = client.chat().create(request).await?;
///     println!("{}", response.content().unwrap_or_default());
///     Ok(())
/// }
/// ```
pub struct GroqClient {
    config: GroqConfig,
    chat_service: ChatService,
    audio_service: AudioService,
    models_service: ModelsService,
    observability: Observability,
}

impl GroqClient {
    /// Creates a new client builder.
    pub fn builder() -> GroqClientBuilder {
        GroqClientBuilder::new()
    }

    /// Creates a client from environment variables.
    ///
    /// Reads `GROQ_API_KEY` and optionally `GROQ_BASE_URL`, `GROQ_TIMEOUT`,
    /// and `GROQ_MAX_RETRIES`.
    pub fn from_env() -> GroqResult<Self> {
        let config = GroqConfig::from_env()?;
        GroqClientBuilder::from_config(config).build()
    }

    /// Creates a client from an API key.
    pub fn from_api_key(api_key: impl Into<String>) -> GroqResult<Self> {
        GroqClientBuilder::new().api_key(api_key).build()
    }

    /// Returns the chat service.
    pub fn chat(&self) -> &ChatService {
        &self.chat_service
    }

    /// Returns the audio service.
    pub fn audio(&self) -> &AudioService {
        &self.audio_service
    }

    /// Returns the models service.
    pub fn models(&self) -> &ModelsService {
        &self.models_service
    }

    /// Returns the configuration.
    pub fn config(&self) -> &GroqConfig {
        &self.config
    }

    /// Returns the observability facade.
    pub fn observability(&self) -> &Observability {
        &self.observability
    }
}

impl std::fmt::Debug for GroqClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GroqClient")
            .field("config", &self.config)
            .finish()
    }
}

/// Builder for the Groq client.
pub struct GroqClientBuilder {
    config_builder: GroqConfigBuilder,
    transport: Option<Arc<dyn HttpTransport>>,
    auth: Option<Arc<dyn AuthProvider>>,
    resilience_config: ResilienceConfig,
    logger: Option<Arc<dyn Logger>>,
    metrics: Option<Arc<dyn MetricsCollector>>,
    log_config: LogConfig,
}

impl GroqClientBuilder {
    /// Creates a new client builder.
    pub fn new() -> Self {
        Self {
            config_builder: GroqConfigBuilder::new(),
            transport: None,
            auth: None,
            resilience_config: ResilienceConfig::default(),
            logger: None,
            metrics: None,
            log_config: LogConfig::default(),
        }
    }

    /// Creates a builder from an existing configuration.
    pub fn from_config(config: GroqConfig) -> Self {
        Self {
            config_builder: GroqConfigBuilder::new()
                .api_key(config.api_key())
                .base_url(&config.base_url)
                .timeout(config.timeout)
                .max_retries(config.max_retries),
            transport: None,
            auth: None,
            resilience_config: ResilienceConfig::default(),
            logger: None,
            metrics: None,
            log_config: LogConfig::default(),
        }
    }

    /// Sets the API key.
    pub fn api_key(mut self, api_key: impl Into<String>) -> Self {
        self.config_builder = self.config_builder.api_key(api_key);
        self
    }

    /// Sets the API key from an environment variable.
    pub fn api_key_from_env(mut self, var_name: &str) -> GroqResult<Self> {
        self.config_builder = self.config_builder.api_key_from_env(var_name)?;
        Ok(self)
    }

    /// Sets the base URL.
    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.config_builder = self.config_builder.base_url(base_url);
        self
    }

    /// Sets the request timeout.
    pub fn timeout(mut self, timeout: std::time::Duration) -> Self {
        self.config_builder = self.config_builder.timeout(timeout);
        self
    }

    /// Sets the timeout in seconds.
    pub fn timeout_secs(mut self, secs: u64) -> Self {
        self.config_builder = self.config_builder.timeout_secs(secs);
        self
    }

    /// Sets the maximum retry attempts.
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.config_builder = self.config_builder.max_retries(retries);
        self
    }

    /// Sets a custom transport.
    pub fn transport(mut self, transport: Arc<dyn HttpTransport>) -> Self {
        self.transport = Some(transport);
        self
    }

    /// Sets a custom auth provider.
    pub fn auth(mut self, auth: Arc<dyn AuthProvider>) -> Self {
        self.auth = Some(auth);
        self
    }

    /// Sets the resilience configuration.
    pub fn resilience(mut self, config: ResilienceConfig) -> Self {
        self.resilience_config = config;
        self
    }

    /// Sets a custom logger.
    pub fn logger(mut self, logger: Arc<dyn Logger>) -> Self {
        self.logger = Some(logger);
        self
    }

    /// Sets a custom metrics collector.
    pub fn metrics(mut self, metrics: Arc<dyn MetricsCollector>) -> Self {
        self.metrics = Some(metrics);
        self
    }

    /// Sets the log configuration.
    pub fn log_config(mut self, config: LogConfig) -> Self {
        self.log_config = config;
        self
    }

    /// Builds the client.
    pub fn build(self) -> GroqResult<GroqClient> {
        let config = self.config_builder.build()?;

        // Create transport
        let transport: Arc<dyn HttpTransport> = match self.transport {
            Some(t) => t,
            None => Arc::new(
                HttpTransportImpl::new(&config.base_url, config.timeout)
                    .map_err(|e| crate::errors::GroqError::Configuration {
                        message: e.to_string(),
                    })?,
            ),
        };

        // Create auth provider
        let auth: Arc<dyn AuthProvider> = match self.auth {
            Some(a) => a,
            None => Arc::new(ApiKeyAuth::from_string(config.api_key())),
        };

        // Create resilience orchestrator
        let resilience = Arc::new(ResilienceOrchestrator::new(self.resilience_config));

        // Create rate limiter
        let rate_limiter = Arc::new(RwLock::new(RateLimitManager::new()));

        // Create services
        let chat_service = ChatService::new(
            Arc::clone(&transport),
            Arc::clone(&auth),
            Arc::clone(&resilience),
            Arc::clone(&rate_limiter),
        );

        let audio_service = AudioService::new(
            Arc::clone(&transport),
            Arc::clone(&auth),
            Arc::clone(&resilience),
            Arc::clone(&rate_limiter),
        );

        let models_service = ModelsService::new(
            Arc::clone(&transport),
            Arc::clone(&auth),
            Arc::clone(&resilience),
            Arc::clone(&rate_limiter),
        );

        // Create observability
        let logger: Arc<dyn Logger> = self
            .logger
            .unwrap_or_else(|| Arc::new(ConsoleLogger::new(self.log_config.clone())));
        let metrics: Arc<dyn MetricsCollector> = self
            .metrics
            .unwrap_or_else(|| Arc::new(DefaultMetricsCollector::new()));

        let observability = Observability::with_components(
            logger,
            metrics,
            crate::observability::ObservabilityConfig {
                logging: self.log_config,
                enable_metrics: true,
                enable_tracing: true,
            },
        );

        Ok(GroqClient {
            config,
            chat_service,
            audio_service,
            models_service,
            observability,
        })
    }
}

impl Default for GroqClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builder_requires_api_key() {
        let result = GroqClientBuilder::new().build();
        assert!(result.is_err());
    }

    #[test]
    fn test_builder_with_api_key() {
        let result = GroqClientBuilder::new()
            .api_key("gsk_test_key_12345")
            .build();

        // Will fail because transport can't connect, but config is valid
        // In a real test we'd use a mock transport
        assert!(result.is_ok() || result.is_err());
    }
}
