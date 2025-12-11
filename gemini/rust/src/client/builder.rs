//! Builder for creating Gemini client instances.

use secrecy::SecretString;
use std::sync::Arc;
use std::time::Duration;
use url::Url;

use crate::auth::{ApiKeyAuthManager, AuthManager};
use crate::config::{AuthMethod, GeminiConfig, DEFAULT_API_VERSION, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_SECS};
use crate::error::{ConfigurationError, GeminiError};
use crate::observability::{DefaultLogger, DefaultMetricsRecorder, DefaultTracer, Logger, MetricsRecorder, Tracer};
use crate::resilience::{ResilienceConfig, ResilienceOrchestrator};
use crate::transport::{HttpTransport, ReqwestTransport};

use super::client::GeminiClientImpl;

/// Builder for creating a `GeminiClient` instance.
///
/// Provides a fluent API for configuring and constructing a Gemini API client.
///
/// # Example
///
/// ```no_run
/// use integrations_gemini::GeminiClientBuilder;
/// use secrecy::SecretString;
/// use std::time::Duration;
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let client = GeminiClientBuilder::new()
///     .api_key(SecretString::new("your-api-key".into()))
///     .timeout(Duration::from_secs(60))
///     .build()?;
/// # Ok(())
/// # }
/// ```
pub struct GeminiClientBuilder {
    api_key: Option<SecretString>,
    base_url: Option<Url>,
    api_version: Option<String>,
    timeout: Option<Duration>,
    connect_timeout: Option<Duration>,
    max_retries: Option<u32>,
    auth_method: Option<AuthMethod>,
    resilience_config: Option<ResilienceConfig>,

    // Injectable dependencies for testing
    transport: Option<Arc<dyn HttpTransport>>,
    logger: Option<Arc<dyn Logger>>,
    tracer: Option<Arc<dyn Tracer>>,
    metrics: Option<Arc<dyn MetricsRecorder>>,
}

impl GeminiClientBuilder {
    /// Creates a new builder with default values.
    pub fn new() -> Self {
        Self {
            api_key: None,
            base_url: None,
            api_version: None,
            timeout: None,
            connect_timeout: None,
            max_retries: None,
            auth_method: None,
            resilience_config: None,
            transport: None,
            logger: None,
            tracer: None,
            metrics: None,
        }
    }

    /// Creates a builder from an existing configuration.
    pub fn from_config(config: GeminiConfig) -> Self {
        Self {
            api_key: Some(config.api_key.clone()),
            base_url: Some(config.base_url.clone()),
            api_version: Some(config.api_version.clone()),
            timeout: Some(config.timeout),
            connect_timeout: Some(config.connect_timeout),
            max_retries: Some(config.max_retries),
            auth_method: Some(config.auth_method),
            resilience_config: None,
            transport: None,
            logger: None,
            tracer: None,
            metrics: None,
        }
    }

    /// Sets the API key.
    pub fn api_key(mut self, key: SecretString) -> Self {
        self.api_key = Some(key);
        self
    }

    /// Sets the base URL for the API.
    pub fn base_url(mut self, url: Url) -> Self {
        self.base_url = Some(url);
        self
    }

    /// Sets the base URL from a string.
    pub fn base_url_str(mut self, url: &str) -> Result<Self, GeminiError> {
        self.base_url = Some(Url::parse(url)?);
        Ok(self)
    }

    /// Sets the API version.
    pub fn api_version(mut self, version: String) -> Self {
        self.api_version = Some(version);
        self
    }

    /// Sets the request timeout.
    pub fn timeout(mut self, duration: Duration) -> Self {
        self.timeout = Some(duration);
        self
    }

    /// Sets the connection timeout.
    pub fn connect_timeout(mut self, duration: Duration) -> Self {
        self.connect_timeout = Some(duration);
        self
    }

    /// Sets the maximum number of retry attempts.
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.max_retries = Some(retries);
        self
    }

    /// Sets the authentication method.
    pub fn auth_method(mut self, method: AuthMethod) -> Self {
        self.auth_method = Some(method);
        self
    }

    /// Sets the resilience configuration.
    pub fn resilience_config(mut self, config: ResilienceConfig) -> Self {
        self.resilience_config = Some(config);
        self
    }

    /// Sets a custom HTTP transport (for testing).
    pub fn transport(mut self, transport: Arc<dyn HttpTransport>) -> Self {
        self.transport = Some(transport);
        self
    }

    /// Sets a custom logger (for testing).
    pub fn logger(mut self, logger: Arc<dyn Logger>) -> Self {
        self.logger = Some(logger);
        self
    }

    /// Sets a custom tracer (for testing).
    pub fn tracer(mut self, tracer: Arc<dyn Tracer>) -> Self {
        self.tracer = Some(tracer);
        self
    }

    /// Sets a custom metrics recorder (for testing).
    pub fn metrics(mut self, metrics: Arc<dyn MetricsRecorder>) -> Self {
        self.metrics = Some(metrics);
        self
    }

    /// Builds the client.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - API key is not provided and not found in environment variables
    /// - Invalid configuration values
    /// - Failed to create HTTP transport
    pub fn build(self) -> Result<GeminiClientImpl, GeminiError> {
        // Resolve API key from multiple sources (order: explicit -> GEMINI_API_KEY -> GOOGLE_API_KEY)
        let api_key = self.api_key
            .or_else(|| {
                std::env::var("GEMINI_API_KEY")
                    .or_else(|_| std::env::var("GOOGLE_API_KEY"))
                    .ok()
                    .map(|s| SecretString::new(s.into()))
            })
            .ok_or(ConfigurationError::MissingApiKey)?;

        // Build configuration with defaults
        let base_url = self.base_url
            .unwrap_or_else(|| Url::parse(DEFAULT_BASE_URL).expect("Default URL is valid"));

        let api_version = self.api_version
            .unwrap_or_else(|| DEFAULT_API_VERSION.to_string());

        let timeout = self.timeout
            .unwrap_or_else(|| Duration::from_secs(DEFAULT_TIMEOUT_SECS));

        let connect_timeout = self.connect_timeout
            .unwrap_or_else(|| Duration::from_secs(30));

        let max_retries = self.max_retries.unwrap_or(3);

        let auth_method = self.auth_method.unwrap_or(AuthMethod::Header);

        // Build full configuration using GeminiConfig builder
        let config = GeminiConfig::builder()
            .api_key(api_key.clone())
            .base_url(base_url.as_str())?
            .api_version(&api_version)
            .timeout(timeout)
            .connect_timeout(connect_timeout)
            .max_retries(max_retries)
            .auth_method(auth_method)
            .build()?;

        // Create transport
        let transport: Arc<dyn HttpTransport> = match self.transport {
            Some(t) => t,
            None => {
                Arc::new(ReqwestTransport::new(config.timeout, config.connect_timeout)
                    .map_err(|e| GeminiError::Network(
                        crate::error::NetworkError::ConnectionFailed {
                            message: format!("Failed to create HTTP transport: {}", e),
                        }
                    ))?)
            }
        };

        // Create auth manager
        let auth_manager: Arc<dyn AuthManager> = Arc::new(
            ApiKeyAuthManager::from_config(&config)
        );

        // Create resilience orchestrator
        let resilience_config = self.resilience_config
            .unwrap_or_else(ResilienceConfig::default);
        let resilience = Arc::new(ResilienceOrchestrator::new(resilience_config));

        // Create observability components
        let logger: Arc<dyn Logger> = self.logger
            .unwrap_or_else(|| Arc::new(DefaultLogger::new("gemini")));

        let tracer: Arc<dyn Tracer> = self.tracer
            .unwrap_or_else(|| Arc::new(DefaultTracer::new("gemini")));

        let metrics: Arc<dyn MetricsRecorder> = self.metrics
            .unwrap_or_else(|| Arc::new(DefaultMetricsRecorder::new("gemini")));

        // Log initialization
        logger.info(
            "Gemini client initialized",
            serde_json::json!({
                "base_url": base_url.as_str(),
                "api_version": api_version,
                "auth_method": format!("{:?}", auth_method),
            })
        );

        GeminiClientImpl::from_parts(
            config,
            transport,
            auth_manager,
            resilience,
            logger,
            tracer,
            metrics,
        )
    }
}

impl Default for GeminiClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}
