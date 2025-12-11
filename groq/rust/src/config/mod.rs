//! Configuration module for the Groq client.
//!
//! Provides configuration management including API keys, base URLs,
//! timeouts, and retry settings optimized for Groq's ultra-low latency API.

use secrecy::{ExposeSecret, SecretString};
use std::time::Duration;

use crate::errors::{GroqError, GroqResult};

/// Default base URL for the Groq API.
pub const DEFAULT_BASE_URL: &str = "https://api.groq.com/openai/v1";

/// Default request timeout (60 seconds).
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(60);

/// Default maximum retry attempts.
pub const DEFAULT_MAX_RETRIES: u32 = 3;

/// Configuration for the Groq client.
#[derive(Clone)]
pub struct GroqConfig {
    /// API key for authentication (stored securely).
    pub(crate) api_key: SecretString,
    /// Base URL for API requests.
    pub base_url: String,
    /// Request timeout.
    pub timeout: Duration,
    /// Maximum retry attempts.
    pub max_retries: u32,
    /// Custom headers to include in requests.
    pub custom_headers: Vec<(String, String)>,
}

impl GroqConfig {
    /// Creates a new configuration builder.
    pub fn builder() -> GroqConfigBuilder {
        GroqConfigBuilder::new()
    }

    /// Creates a configuration from environment variables.
    ///
    /// # Environment Variables
    ///
    /// - `GROQ_API_KEY` (required): API key for authentication
    /// - `GROQ_BASE_URL` (optional): Custom base URL
    /// - `GROQ_TIMEOUT` (optional): Request timeout in seconds
    /// - `GROQ_MAX_RETRIES` (optional): Maximum retry attempts
    pub fn from_env() -> GroqResult<Self> {
        let api_key = std::env::var("GROQ_API_KEY").map_err(|_| GroqError::Configuration {
            message: "GROQ_API_KEY environment variable not set".to_string(),
        })?;

        let mut builder = GroqConfigBuilder::new().api_key(api_key);

        if let Ok(base_url) = std::env::var("GROQ_BASE_URL") {
            builder = builder.base_url(base_url);
        }

        if let Ok(timeout_str) = std::env::var("GROQ_TIMEOUT") {
            if let Ok(timeout_secs) = timeout_str.parse::<u64>() {
                builder = builder.timeout(Duration::from_secs(timeout_secs));
            }
        }

        if let Ok(retries_str) = std::env::var("GROQ_MAX_RETRIES") {
            if let Ok(retries) = retries_str.parse::<u32>() {
                builder = builder.max_retries(retries);
            }
        }

        builder.build()
    }

    /// Returns the API key (exposing the secret).
    pub(crate) fn api_key(&self) -> &str {
        self.api_key.expose_secret()
    }

    /// Returns the API key hint (last 4 characters) for debugging.
    pub fn api_key_hint(&self) -> String {
        let key = self.api_key.expose_secret();
        if key.len() > 4 {
            format!("...{}", &key[key.len() - 4..])
        } else {
            "****".to_string()
        }
    }

    /// Returns the full URL for an endpoint.
    pub fn endpoint_url(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path.trim_start_matches('/'))
    }
}

impl std::fmt::Debug for GroqConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GroqConfig")
            .field("api_key", &"[REDACTED]")
            .field("base_url", &self.base_url)
            .field("timeout", &self.timeout)
            .field("max_retries", &self.max_retries)
            .finish()
    }
}

/// Builder for `GroqConfig`.
#[derive(Default)]
pub struct GroqConfigBuilder {
    api_key: Option<String>,
    base_url: Option<String>,
    timeout: Option<Duration>,
    max_retries: Option<u32>,
    custom_headers: Vec<(String, String)>,
}

impl GroqConfigBuilder {
    /// Creates a new configuration builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the API key.
    pub fn api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    /// Sets the API key from an environment variable.
    pub fn api_key_from_env(mut self, var_name: &str) -> GroqResult<Self> {
        let api_key = std::env::var(var_name).map_err(|_| GroqError::Configuration {
            message: format!("Environment variable {} not set", var_name),
        })?;
        self.api_key = Some(api_key);
        Ok(self)
    }

    /// Sets the base URL.
    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = Some(base_url.into());
        self
    }

    /// Sets the request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Sets the timeout in seconds.
    pub fn timeout_secs(mut self, secs: u64) -> Self {
        self.timeout = Some(Duration::from_secs(secs));
        self
    }

    /// Sets the maximum retry attempts.
    pub fn max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = Some(max_retries);
        self
    }

    /// Adds a custom header.
    pub fn header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.custom_headers.push((name.into(), value.into()));
        self
    }

    /// Builds the configuration.
    pub fn build(self) -> GroqResult<GroqConfig> {
        let api_key = self.api_key.ok_or_else(|| GroqError::Configuration {
            message: "API key is required".to_string(),
        })?;

        // Validate API key format
        if api_key.is_empty() {
            return Err(GroqError::Configuration {
                message: "API key cannot be empty".to_string(),
            });
        }

        // Warn if API key doesn't match expected Groq format
        if !api_key.starts_with("gsk_") {
            tracing::warn!("API key does not match expected Groq format (gsk_*)");
        }

        let base_url = self
            .base_url
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
            .trim_end_matches('/')
            .to_string();

        // Validate base URL
        if !base_url.starts_with("https://") {
            return Err(GroqError::Configuration {
                message: "Base URL must use HTTPS".to_string(),
            });
        }

        Ok(GroqConfig {
            api_key: SecretString::new(api_key),
            base_url,
            timeout: self.timeout.unwrap_or(DEFAULT_TIMEOUT),
            max_retries: self.max_retries.unwrap_or(DEFAULT_MAX_RETRIES),
            custom_headers: self.custom_headers,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_builder_success() {
        let config = GroqConfig::builder()
            .api_key("gsk_test_api_key_12345")
            .base_url("https://custom.api.groq.com/openai/v1")
            .timeout(Duration::from_secs(30))
            .max_retries(5)
            .build()
            .unwrap();

        assert_eq!(config.api_key(), "gsk_test_api_key_12345");
        assert_eq!(config.base_url, "https://custom.api.groq.com/openai/v1");
        assert_eq!(config.timeout, Duration::from_secs(30));
        assert_eq!(config.max_retries, 5);
    }

    #[test]
    fn test_config_builder_defaults() {
        let config = GroqConfig::builder()
            .api_key("gsk_test_key")
            .build()
            .unwrap();

        assert_eq!(config.base_url, DEFAULT_BASE_URL);
        assert_eq!(config.timeout, DEFAULT_TIMEOUT);
        assert_eq!(config.max_retries, DEFAULT_MAX_RETRIES);
    }

    #[test]
    fn test_config_builder_missing_api_key() {
        let result = GroqConfig::builder().build();
        assert!(result.is_err());
    }

    #[test]
    fn test_config_builder_empty_api_key() {
        let result = GroqConfig::builder().api_key("").build();
        assert!(result.is_err());
    }

    #[test]
    fn test_config_builder_invalid_base_url() {
        let result = GroqConfig::builder()
            .api_key("gsk_test_key")
            .base_url("http://insecure.api.groq.com")
            .build();
        assert!(result.is_err());
    }

    #[test]
    fn test_endpoint_url() {
        let config = GroqConfig::builder()
            .api_key("gsk_test_key")
            .build()
            .unwrap();

        assert_eq!(
            config.endpoint_url("chat/completions"),
            "https://api.groq.com/openai/v1/chat/completions"
        );
    }

    #[test]
    fn test_api_key_hint() {
        let config = GroqConfig::builder()
            .api_key("gsk_secret_key_12345")
            .build()
            .unwrap();

        let hint = config.api_key_hint();
        assert_eq!(hint, "...2345");
        assert!(!hint.contains("secret"));
    }

    #[test]
    fn test_config_debug_redacts_api_key() {
        let config = GroqConfig::builder()
            .api_key("gsk_secret_key")
            .build()
            .unwrap();

        let debug_str = format!("{:?}", config);
        assert!(debug_str.contains("[REDACTED]"));
        assert!(!debug_str.contains("gsk_secret_key"));
    }
}
