//! Configuration types for the GitHub client.

use crate::errors::{GitHubError, GitHubErrorKind};
use crate::auth::AuthMethod;
use std::time::Duration;

/// Default GitHub API base URL.
pub const DEFAULT_BASE_URL: &str = "https://api.github.com";

/// Default GitHub API version (date-based).
pub const DEFAULT_API_VERSION: &str = "2022-11-28";

/// Default request timeout.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Default connect timeout.
pub const DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Default User-Agent header.
pub const DEFAULT_USER_AGENT: &str = "integrations-github/0.1.0";

/// Retry configuration.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum retry attempts.
    pub max_attempts: u32,
    /// Initial backoff delay.
    pub initial_backoff: Duration,
    /// Maximum backoff delay.
    pub max_backoff: Duration,
    /// Backoff multiplier.
    pub multiplier: f64,
    /// Jitter factor (0.0 to 1.0).
    pub jitter: f64,
    /// Enable retries.
    pub enabled: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(60),
            multiplier: 2.0,
            jitter: 0.1,
            enabled: true,
        }
    }
}

/// Circuit breaker configuration.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Failure threshold to open circuit.
    pub failure_threshold: u32,
    /// Success threshold to close circuit.
    pub success_threshold: u32,
    /// Reset timeout when circuit is open.
    pub reset_timeout: Duration,
    /// Enable circuit breaker.
    pub enabled: bool,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(60),
            enabled: true,
        }
    }
}

/// Rate limit configuration.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Buffer percentage to keep before throttling (0.0 to 1.0).
    pub buffer_percentage: f64,
    /// Enable preemptive throttling.
    pub preemptive_throttling: bool,
    /// Enable rate limit tracking.
    pub enabled: bool,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            buffer_percentage: 0.1,
            preemptive_throttling: true,
            enabled: true,
        }
    }
}

/// Connection pool configuration.
#[derive(Debug, Clone)]
pub struct PoolConfig {
    /// Maximum idle connections per host.
    pub max_idle_per_host: usize,
    /// Idle connection timeout.
    pub idle_timeout: Duration,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_idle_per_host: 20,
            idle_timeout: Duration::from_secs(90),
        }
    }
}

/// GitHub client configuration.
#[derive(Debug, Clone)]
pub struct GitHubConfig {
    /// API base URL.
    pub base_url: String,
    /// API version header.
    pub api_version: String,
    /// Authentication method.
    pub auth: Option<AuthMethod>,
    /// Request timeout.
    pub timeout: Duration,
    /// Connect timeout.
    pub connect_timeout: Duration,
    /// User-Agent header.
    pub user_agent: String,
    /// Retry configuration.
    pub retry: RetryConfig,
    /// Circuit breaker configuration.
    pub circuit_breaker: CircuitBreakerConfig,
    /// Rate limit configuration.
    pub rate_limit: RateLimitConfig,
    /// Connection pool configuration.
    pub pool: PoolConfig,
}

impl Default for GitHubConfig {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.to_string(),
            api_version: DEFAULT_API_VERSION.to_string(),
            auth: None,
            timeout: DEFAULT_TIMEOUT,
            connect_timeout: DEFAULT_CONNECT_TIMEOUT,
            user_agent: DEFAULT_USER_AGENT.to_string(),
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            rate_limit: RateLimitConfig::default(),
            pool: PoolConfig::default(),
        }
    }
}

impl GitHubConfig {
    /// Creates a new configuration builder.
    pub fn builder() -> GitHubConfigBuilder {
        GitHubConfigBuilder::new()
    }

    /// Validates the configuration.
    pub fn validate(&self) -> Result<(), GitHubError> {
        if self.base_url.is_empty() {
            return Err(GitHubError::new(
                GitHubErrorKind::InvalidBaseUrl,
                "Base URL cannot be empty",
            ));
        }

        if !self.base_url.starts_with("http://") && !self.base_url.starts_with("https://") {
            return Err(GitHubError::new(
                GitHubErrorKind::InvalidBaseUrl,
                "Base URL must start with http:// or https://",
            ));
        }

        if self.user_agent.is_empty() {
            return Err(GitHubError::configuration("User-Agent is required by GitHub API"));
        }

        Ok(())
    }
}

/// Builder for GitHubConfig.
#[derive(Debug, Default)]
pub struct GitHubConfigBuilder {
    base_url: Option<String>,
    api_version: Option<String>,
    auth: Option<AuthMethod>,
    timeout: Option<Duration>,
    connect_timeout: Option<Duration>,
    user_agent: Option<String>,
    retry: Option<RetryConfig>,
    circuit_breaker: Option<CircuitBreakerConfig>,
    rate_limit: Option<RateLimitConfig>,
    pool: Option<PoolConfig>,
}

impl GitHubConfigBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the base URL.
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }

    /// Sets the API version.
    pub fn api_version(mut self, version: impl Into<String>) -> Self {
        self.api_version = Some(version.into());
        self
    }

    /// Sets the authentication method.
    pub fn auth(mut self, auth: AuthMethod) -> Self {
        self.auth = Some(auth);
        self
    }

    /// Sets the request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Sets the connect timeout.
    pub fn connect_timeout(mut self, timeout: Duration) -> Self {
        self.connect_timeout = Some(timeout);
        self
    }

    /// Sets the User-Agent header.
    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.user_agent = Some(ua.into());
        self
    }

    /// Sets the retry configuration.
    pub fn retry(mut self, config: RetryConfig) -> Self {
        self.retry = Some(config);
        self
    }

    /// Disables retries.
    pub fn no_retry(mut self) -> Self {
        self.retry = Some(RetryConfig {
            enabled: false,
            ..Default::default()
        });
        self
    }

    /// Sets the circuit breaker configuration.
    pub fn circuit_breaker(mut self, config: CircuitBreakerConfig) -> Self {
        self.circuit_breaker = Some(config);
        self
    }

    /// Disables circuit breaker.
    pub fn no_circuit_breaker(mut self) -> Self {
        self.circuit_breaker = Some(CircuitBreakerConfig {
            enabled: false,
            ..Default::default()
        });
        self
    }

    /// Sets the rate limit configuration.
    pub fn rate_limit(mut self, config: RateLimitConfig) -> Self {
        self.rate_limit = Some(config);
        self
    }

    /// Sets the connection pool configuration.
    pub fn pool(mut self, config: PoolConfig) -> Self {
        self.pool = Some(config);
        self
    }

    /// Builds the configuration.
    pub fn build(self) -> Result<GitHubConfig, GitHubError> {
        let config = GitHubConfig {
            base_url: self.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            api_version: self.api_version.unwrap_or_else(|| DEFAULT_API_VERSION.to_string()),
            auth: self.auth,
            timeout: self.timeout.unwrap_or(DEFAULT_TIMEOUT),
            connect_timeout: self.connect_timeout.unwrap_or(DEFAULT_CONNECT_TIMEOUT),
            user_agent: self.user_agent.unwrap_or_else(|| DEFAULT_USER_AGENT.to_string()),
            retry: self.retry.unwrap_or_default(),
            circuit_breaker: self.circuit_breaker.unwrap_or_default(),
            rate_limit: self.rate_limit.unwrap_or_default(),
            pool: self.pool.unwrap_or_default(),
        };

        config.validate()?;
        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = GitHubConfig::default();
        assert_eq!(config.base_url, DEFAULT_BASE_URL);
        assert_eq!(config.api_version, DEFAULT_API_VERSION);
        assert!(config.auth.is_none());
    }

    #[test]
    fn test_config_builder() {
        let config = GitHubConfig::builder()
            .base_url("https://github.example.com/api/v3")
            .user_agent("test-client/1.0")
            .timeout(Duration::from_secs(60))
            .build()
            .unwrap();

        assert_eq!(config.base_url, "https://github.example.com/api/v3");
        assert_eq!(config.user_agent, "test-client/1.0");
        assert_eq!(config.timeout, Duration::from_secs(60));
    }

    #[test]
    fn test_invalid_base_url() {
        let result = GitHubConfig::builder()
            .base_url("invalid-url")
            .build();

        assert!(result.is_err());
    }
}
