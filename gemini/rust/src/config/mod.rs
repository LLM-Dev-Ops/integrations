//! Configuration types for the Gemini API client.

use secrecy::SecretString;
use std::time::Duration;
use url::Url;
use crate::error::{GeminiError, ConfigurationError};

/// Default Gemini API base URL.
pub const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com";

/// Default API version.
pub const DEFAULT_API_VERSION: &str = "v1beta";

/// Default request timeout (120 seconds).
pub const DEFAULT_TIMEOUT_SECS: u64 = 120;

/// Default connect timeout (30 seconds).
pub const DEFAULT_CONNECT_TIMEOUT_SECS: u64 = 30;

/// Default max retries.
pub const DEFAULT_MAX_RETRIES: u32 = 3;

/// Authentication method for API key.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum AuthMethod {
    /// Use x-goog-api-key header (recommended).
    #[default]
    Header,
    /// Use ?key= query parameter.
    QueryParam,
}

/// Log level for the client.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum LogLevel {
    /// Error level - only errors.
    Error,
    /// Warning level - errors and warnings.
    Warn,
    /// Info level - general information.
    #[default]
    Info,
    /// Debug level - detailed information.
    Debug,
    /// Trace level - very detailed information.
    Trace,
}

/// Retry configuration.
#[derive(Clone, Debug)]
pub struct RetryConfig {
    /// Maximum number of retry attempts.
    pub max_attempts: u32,
    /// Initial delay between retries.
    pub initial_delay: Duration,
    /// Maximum delay between retries.
    pub max_delay: Duration,
    /// Multiplier for exponential backoff.
    pub multiplier: f64,
    /// Jitter factor (0.0 to 1.0).
    pub jitter: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay: Duration::from_millis(1000),
            max_delay: Duration::from_secs(60),
            multiplier: 2.0,
            jitter: 0.25,
        }
    }
}

/// Circuit breaker configuration.
#[derive(Clone, Debug)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening circuit.
    pub failure_threshold: u32,
    /// Number of successes to close circuit.
    pub success_threshold: u32,
    /// Duration circuit stays open.
    pub open_duration: Duration,
    /// Maximum requests in half-open state.
    pub half_open_max_requests: u32,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            open_duration: Duration::from_secs(30),
            half_open_max_requests: 1,
        }
    }
}

/// Rate limit configuration.
#[derive(Clone, Debug)]
pub struct RateLimitConfig {
    /// Requests per minute.
    pub requests_per_minute: u32,
    /// Tokens per minute (optional).
    pub tokens_per_minute: Option<u32>,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            requests_per_minute: 60,
            tokens_per_minute: Some(1_000_000),
        }
    }
}

/// Configuration for the Gemini client.
#[derive(Clone)]
pub struct GeminiConfig {
    /// API key (required).
    pub api_key: SecretString,
    /// Base URL for the API.
    pub base_url: Url,
    /// API version.
    pub api_version: String,
    /// Default timeout for requests.
    pub timeout: Duration,
    /// Connect timeout.
    pub connect_timeout: Duration,
    /// Maximum retries for transient failures.
    pub max_retries: u32,
    /// Retry configuration.
    pub retry_config: RetryConfig,
    /// Circuit breaker configuration.
    pub circuit_breaker_config: CircuitBreakerConfig,
    /// Rate limit configuration.
    pub rate_limit_config: Option<RateLimitConfig>,
    /// Use HTTP/2 only.
    pub http2_only: bool,
    /// Maximum idle connections per host.
    pub pool_max_idle_per_host: usize,
    /// Idle connection timeout.
    pub pool_idle_timeout: Duration,
    /// Enable tracing.
    pub enable_tracing: bool,
    /// Enable metrics.
    pub enable_metrics: bool,
    /// Log level.
    pub log_level: LogLevel,
    /// Authentication method.
    pub auth_method: AuthMethod,
}

impl GeminiConfig {
    /// Create a new configuration builder.
    pub fn builder() -> GeminiConfigBuilder {
        GeminiConfigBuilder::default()
    }

    /// Create configuration from environment variables.
    pub fn from_env() -> Result<Self, GeminiError> {
        let api_key = std::env::var("GEMINI_API_KEY")
            .or_else(|_| std::env::var("GOOGLE_API_KEY"))
            .map_err(|_| ConfigurationError::MissingApiKey)?;

        let base_url = std::env::var("GEMINI_BASE_URL")
            .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());

        let timeout_secs: u64 = std::env::var("GEMINI_TIMEOUT_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_TIMEOUT_SECS);

        let max_retries: u32 = std::env::var("GEMINI_MAX_RETRIES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_MAX_RETRIES);

        let api_version = std::env::var("GEMINI_API_VERSION")
            .unwrap_or_else(|_| DEFAULT_API_VERSION.to_string());

        Self::builder()
            .api_key(SecretString::new(api_key.into()))
            .base_url(&base_url)?
            .api_version(&api_version)
            .timeout(Duration::from_secs(timeout_secs))
            .max_retries(max_retries)
            .build()
    }
}

/// Builder for GeminiConfig.
#[derive(Default)]
pub struct GeminiConfigBuilder {
    api_key: Option<SecretString>,
    base_url: Option<Url>,
    api_version: Option<String>,
    timeout: Option<Duration>,
    connect_timeout: Option<Duration>,
    max_retries: Option<u32>,
    retry_config: Option<RetryConfig>,
    circuit_breaker_config: Option<CircuitBreakerConfig>,
    rate_limit_config: Option<RateLimitConfig>,
    http2_only: Option<bool>,
    pool_max_idle_per_host: Option<usize>,
    pool_idle_timeout: Option<Duration>,
    enable_tracing: Option<bool>,
    enable_metrics: Option<bool>,
    log_level: Option<LogLevel>,
    auth_method: Option<AuthMethod>,
}

impl GeminiConfigBuilder {
    /// Set the API key.
    pub fn api_key(mut self, api_key: SecretString) -> Self {
        self.api_key = Some(api_key);
        self
    }

    /// Set the base URL.
    pub fn base_url(mut self, base_url: &str) -> Result<Self, GeminiError> {
        self.base_url = Some(Url::parse(base_url)?);
        Ok(self)
    }

    /// Set the API version.
    pub fn api_version(mut self, version: &str) -> Self {
        self.api_version = Some(version.to_string());
        self
    }

    /// Set the request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Set the connect timeout.
    pub fn connect_timeout(mut self, timeout: Duration) -> Self {
        self.connect_timeout = Some(timeout);
        self
    }

    /// Set the maximum retry attempts.
    pub fn max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = Some(max_retries);
        self
    }

    /// Set the retry configuration.
    pub fn retry_config(mut self, config: RetryConfig) -> Self {
        self.retry_config = Some(config);
        self
    }

    /// Set the circuit breaker configuration.
    pub fn circuit_breaker_config(mut self, config: CircuitBreakerConfig) -> Self {
        self.circuit_breaker_config = Some(config);
        self
    }

    /// Set the rate limit configuration.
    pub fn rate_limit_config(mut self, config: RateLimitConfig) -> Self {
        self.rate_limit_config = Some(config);
        self
    }

    /// Set HTTP/2 only mode.
    pub fn http2_only(mut self, http2_only: bool) -> Self {
        self.http2_only = Some(http2_only);
        self
    }

    /// Set maximum idle connections per host.
    pub fn pool_max_idle_per_host(mut self, size: usize) -> Self {
        self.pool_max_idle_per_host = Some(size);
        self
    }

    /// Set idle connection timeout.
    pub fn pool_idle_timeout(mut self, timeout: Duration) -> Self {
        self.pool_idle_timeout = Some(timeout);
        self
    }

    /// Enable or disable tracing.
    pub fn enable_tracing(mut self, enable: bool) -> Self {
        self.enable_tracing = Some(enable);
        self
    }

    /// Enable or disable metrics.
    pub fn enable_metrics(mut self, enable: bool) -> Self {
        self.enable_metrics = Some(enable);
        self
    }

    /// Set the log level.
    pub fn log_level(mut self, level: LogLevel) -> Self {
        self.log_level = Some(level);
        self
    }

    /// Set the authentication method.
    pub fn auth_method(mut self, method: AuthMethod) -> Self {
        self.auth_method = Some(method);
        self
    }

    /// Build the configuration.
    pub fn build(self) -> Result<GeminiConfig, GeminiError> {
        let api_key = self.api_key
            .ok_or(ConfigurationError::MissingApiKey)?;

        let base_url = self.base_url
            .unwrap_or_else(|| Url::parse(DEFAULT_BASE_URL).unwrap());

        Ok(GeminiConfig {
            api_key,
            base_url,
            api_version: self.api_version.unwrap_or_else(|| DEFAULT_API_VERSION.to_string()),
            timeout: self.timeout.unwrap_or(Duration::from_secs(DEFAULT_TIMEOUT_SECS)),
            connect_timeout: self.connect_timeout.unwrap_or(Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS)),
            max_retries: self.max_retries.unwrap_or(DEFAULT_MAX_RETRIES),
            retry_config: self.retry_config.unwrap_or_default(),
            circuit_breaker_config: self.circuit_breaker_config.unwrap_or_default(),
            rate_limit_config: self.rate_limit_config,
            http2_only: self.http2_only.unwrap_or(false),
            pool_max_idle_per_host: self.pool_max_idle_per_host.unwrap_or(10),
            pool_idle_timeout: self.pool_idle_timeout.unwrap_or(Duration::from_secs(90)),
            enable_tracing: self.enable_tracing.unwrap_or(true),
            enable_metrics: self.enable_metrics.unwrap_or(true),
            log_level: self.log_level.unwrap_or_default(),
            auth_method: self.auth_method.unwrap_or_default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use secrecy::ExposeSecret;

    #[test]
    fn test_default_config() {
        let config = GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap();

        assert_eq!(config.base_url.as_str(), "https://generativelanguage.googleapis.com/");
        assert_eq!(config.api_version, "v1beta");
        assert_eq!(config.timeout, Duration::from_secs(120));
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.auth_method, AuthMethod::Header);
    }

    #[test]
    fn test_custom_config() {
        let config = GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .api_version("v1")
            .timeout(Duration::from_secs(60))
            .auth_method(AuthMethod::QueryParam)
            .build()
            .unwrap();

        assert_eq!(config.api_version, "v1");
        assert_eq!(config.timeout, Duration::from_secs(60));
        assert_eq!(config.auth_method, AuthMethod::QueryParam);
    }

    #[test]
    fn test_missing_api_key() {
        let result = GeminiConfig::builder().build();
        assert!(result.is_err());
    }
}
