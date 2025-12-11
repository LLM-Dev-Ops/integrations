//! Main client implementation for Gemini API.

use async_trait::async_trait;
use once_cell::sync::OnceCell;
use std::sync::Arc;

use crate::auth::AuthManager;
use crate::config::GeminiConfig;
use crate::error::GeminiError;
use crate::observability::{Logger, MetricsRecorder, Tracer};
use crate::resilience::ResilienceOrchestrator;
use crate::services::{
    CachedContentService, ContentService, EmbeddingsService, EmbeddingsServiceImpl, FilesService,
    ModelsService,
};
use crate::transport::HttpTransport;

use super::builder::GeminiClientBuilder;
use super::traits::GeminiClient;

/// Implementation of the Gemini API client.
///
/// This struct provides access to all Gemini API services through a unified interface.
/// Services are lazily initialized on first access.
///
/// # Example
///
/// ```no_run
/// use integrations_gemini::GeminiClientImpl;
/// use secrecy::SecretString;
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let client = GeminiClientImpl::builder()
///     .api_key(SecretString::new("your-api-key".into()))
///     .build()?;
///
/// let embeddings = client.embeddings();
/// # Ok(())
/// # }
/// ```
pub struct GeminiClientImpl {
    config: GeminiConfig,
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<ResilienceOrchestrator>,

    // Lazy-initialized services
    content_service: OnceCell<Box<dyn ContentService>>,
    embeddings_service: OnceCell<EmbeddingsServiceImpl>,
    models_service: OnceCell<Box<dyn ModelsService>>,
    files_service: OnceCell<Box<dyn FilesService>>,
    cached_content_service: OnceCell<Box<dyn CachedContentService>>,

    // Observability
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    metrics: Arc<dyn MetricsRecorder>,
}

impl GeminiClientImpl {
    /// Creates a new client builder.
    pub fn builder() -> GeminiClientBuilder {
        GeminiClientBuilder::new()
    }

    /// Creates a client from environment variables.
    ///
    /// Reads configuration from:
    /// - `GEMINI_API_KEY` or `GOOGLE_API_KEY` (required)
    /// - `GEMINI_BASE_URL` (optional)
    /// - `GEMINI_API_VERSION` (optional)
    /// - `GEMINI_TIMEOUT_SECS` (optional)
    /// - `GEMINI_MAX_RETRIES` (optional)
    pub fn from_env() -> Result<Self, GeminiError> {
        let config = GeminiConfig::from_env()?;
        Self::new(config)
    }

    /// Creates a client from a configuration object.
    pub fn new(config: GeminiConfig) -> Result<Self, GeminiError> {
        GeminiClientBuilder::from_config(config).build()
    }

    /// Creates a client from pre-constructed parts (used by builder).
    pub(super) fn from_parts(
        config: GeminiConfig,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        resilience: Arc<ResilienceOrchestrator>,
        logger: Arc<dyn Logger>,
        tracer: Arc<dyn Tracer>,
        metrics: Arc<dyn MetricsRecorder>,
    ) -> Result<Self, GeminiError> {
        Ok(Self {
            config,
            transport,
            auth_manager,
            resilience,
            content_service: OnceCell::new(),
            embeddings_service: OnceCell::new(),
            models_service: OnceCell::new(),
            files_service: OnceCell::new(),
            cached_content_service: OnceCell::new(),
            logger,
            tracer,
            metrics,
        })
    }

    /// Returns the client configuration.
    pub fn config(&self) -> &GeminiConfig {
        &self.config
    }
}

#[async_trait]
impl GeminiClient for GeminiClientImpl {
    fn content(&self) -> &dyn ContentService {
        todo!("ContentService implementation pending")
    }

    fn embeddings(&self) -> &dyn EmbeddingsService {
        self.embeddings_service.get_or_init(|| {
            EmbeddingsServiceImpl::new(
                Arc::clone(&self.transport),
                Arc::clone(&self.auth_manager),
                self.config.clone(),
            )
        })
    }

    fn models(&self) -> &dyn ModelsService {
        todo!("ModelsService implementation pending")
    }

    fn files(&self) -> &dyn FilesService {
        todo!("FilesService implementation pending")
    }

    fn cached_content(&self) -> &dyn CachedContentService {
        todo!("CachedContentService implementation pending")
    }
}

impl std::fmt::Debug for GeminiClientImpl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GeminiClientImpl")
            .field("config", &"<redacted>")
            .finish()
    }
}

/// Create a client from configuration.
pub fn create_client(config: GeminiConfig) -> Result<Arc<dyn GeminiClient>, GeminiError> {
    let client = GeminiClientImpl::new(config)?;
    Ok(Arc::new(client))
}

/// Create a client from environment variables.
pub fn create_client_from_env() -> Result<Arc<dyn GeminiClient>, GeminiError> {
    let config = GeminiConfig::from_env()?;
    create_client(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AuthMethod, DEFAULT_API_VERSION, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_SECS};
    use secrecy::SecretString;
    use std::time::Duration;

    #[test]
    fn test_builder_requires_api_key() {
        // Should fail when no API key is provided and env vars are not set
        std::env::remove_var("GEMINI_API_KEY");
        std::env::remove_var("GOOGLE_API_KEY");

        let result = GeminiClientBuilder::new().build();
        assert!(result.is_err());

        if let Err(GeminiError::Configuration(crate::error::ConfigurationError::MissingApiKey)) = result {
            // Expected error
        } else {
            panic!("Expected MissingApiKey error");
        }
    }

    #[test]
    fn test_builder_with_api_key() {
        let result = GeminiClientBuilder::new()
            .api_key(SecretString::new("test-api-key".into()))
            .build();

        assert!(result.is_ok());
        let client = result.unwrap();
        assert_eq!(client.config().api_version, DEFAULT_API_VERSION);
        assert_eq!(client.config().auth_method, AuthMethod::Header);
    }

    #[test]
    fn test_builder_custom_settings() {
        let result = GeminiClientBuilder::new()
            .api_key(SecretString::new("test-api-key".into()))
            .api_version("v1".to_string())
            .timeout(Duration::from_secs(60))
            .auth_method(AuthMethod::QueryParam)
            .build();

        assert!(result.is_ok());
        let client = result.unwrap();
        assert_eq!(client.config().api_version, "v1");
        assert_eq!(client.config().timeout, Duration::from_secs(60));
        assert_eq!(client.config().auth_method, AuthMethod::QueryParam);
    }

    #[test]
    fn test_from_env_with_api_key() {
        std::env::set_var("GEMINI_API_KEY", "test-key-from-env");

        let result = GeminiClientBuilder::new().build();
        assert!(result.is_ok());

        std::env::remove_var("GEMINI_API_KEY");
    }

    #[test]
    fn test_from_env_with_google_api_key_fallback() {
        std::env::remove_var("GEMINI_API_KEY");
        std::env::set_var("GOOGLE_API_KEY", "test-google-key");

        let result = GeminiClientBuilder::new().build();
        assert!(result.is_ok());

        std::env::remove_var("GOOGLE_API_KEY");
    }

    #[test]
    fn test_new_from_config() {
        let config = GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap();

        let result = GeminiClientImpl::new(config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_builder_from_config() {
        let config = GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .api_version("v1")
            .build()
            .unwrap();

        let result = GeminiClientBuilder::from_config(config).build();
        assert!(result.is_ok());

        let client = result.unwrap();
        assert_eq!(client.config().api_version, "v1");
    }

    #[test]
    fn test_api_key_resolution_order() {
        // Test that explicit api_key takes precedence over env vars
        std::env::set_var("GEMINI_API_KEY", "env-key");
        std::env::set_var("GOOGLE_API_KEY", "google-env-key");

        let result = GeminiClientBuilder::new()
            .api_key(SecretString::new("explicit-key".into()))
            .build();

        assert!(result.is_ok());

        std::env::remove_var("GEMINI_API_KEY");
        std::env::remove_var("GOOGLE_API_KEY");
    }

    #[test]
    fn test_default_values() {
        let client = GeminiClientBuilder::new()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap();

        assert_eq!(client.config().base_url.as_str(), format!("{}/", DEFAULT_BASE_URL));
        assert_eq!(client.config().api_version, DEFAULT_API_VERSION);
        assert_eq!(client.config().timeout, Duration::from_secs(DEFAULT_TIMEOUT_SECS));
        assert_eq!(client.config().auth_method, AuthMethod::Header);
    }
}
