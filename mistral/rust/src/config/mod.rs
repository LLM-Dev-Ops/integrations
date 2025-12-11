//! Configuration module for the Mistral client.
//!
//! Provides configuration management including API keys, base URLs,
//! timeouts, and retry settings.

use secrecy::{ExposeSecret, SecretString};
use std::time::Duration;

use crate::errors::{MistralError, MistralResult};

/// Default base URL for the Mistral API.
pub const DEFAULT_BASE_URL: &str = "https://api.mistral.ai";

/// Default API version.
pub const DEFAULT_API_VERSION: &str = "v1";

/// Default request timeout (10 minutes for long-running operations).
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(600);

/// Default maximum retry attempts.
pub const DEFAULT_MAX_RETRIES: u32 = 3;

/// Configuration for the Mistral client.
#[derive(Clone)]
pub struct MistralConfig {
    /// API key for authentication (stored securely).
    pub(crate) api_key: SecretString,
    /// Base URL for API requests.
    pub base_url: String,
    /// API version.
    pub api_version: String,
    /// Request timeout.
    pub timeout: Duration,
    /// Maximum retry attempts.
    pub max_retries: u32,
    /// Custom headers to include in requests.
    pub custom_headers: Vec<(String, String)>,
}

impl MistralConfig {
    /// Creates a new configuration builder.
    pub fn builder() -> MistralConfigBuilder {
        MistralConfigBuilder::new()
    }

    /// Creates a configuration from environment variables.
    ///
    /// # Environment Variables
    ///
    /// - `MISTRAL_API_KEY` (required): API key for authentication
    /// - `MISTRAL_BASE_URL` (optional): Custom base URL
    /// - `MISTRAL_TIMEOUT` (optional): Request timeout in seconds
    /// - `MISTRAL_MAX_RETRIES` (optional): Maximum retry attempts
    pub fn from_env() -> MistralResult<Self> {
        let api_key = std::env::var("MISTRAL_API_KEY").map_err(|_| {
            MistralError::Configuration {
                message: "MISTRAL_API_KEY environment variable not set".to_string(),
            }
        })?;

        let mut builder = MistralConfigBuilder::new().api_key(api_key);

        if let Ok(base_url) = std::env::var("MISTRAL_BASE_URL") {
            builder = builder.base_url(base_url);
        }

        if let Ok(timeout_str) = std::env::var("MISTRAL_TIMEOUT") {
            if let Ok(timeout_secs) = timeout_str.parse::<u64>() {
                builder = builder.timeout(Duration::from_secs(timeout_secs));
            }
        }

        if let Ok(retries_str) = std::env::var("MISTRAL_MAX_RETRIES") {
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

    /// Returns the full URL for an endpoint.
    pub fn endpoint_url(&self, path: &str) -> String {
        format!("{}/{}/{}", self.base_url, self.api_version, path.trim_start_matches('/'))
    }
}

impl std::fmt::Debug for MistralConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MistralConfig")
            .field("api_key", &"[REDACTED]")
            .field("base_url", &self.base_url)
            .field("api_version", &self.api_version)
            .field("timeout", &self.timeout)
            .field("max_retries", &self.max_retries)
            .finish()
    }
}

/// Builder for `MistralConfig`.
#[derive(Default)]
pub struct MistralConfigBuilder {
    api_key: Option<String>,
    base_url: Option<String>,
    api_version: Option<String>,
    timeout: Option<Duration>,
    max_retries: Option<u32>,
    custom_headers: Vec<(String, String)>,
}

impl MistralConfigBuilder {
    /// Creates a new configuration builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the API key.
    pub fn api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    /// Sets the base URL.
    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = Some(base_url.into());
        self
    }

    /// Sets the API version.
    pub fn api_version(mut self, api_version: impl Into<String>) -> Self {
        self.api_version = Some(api_version.into());
        self
    }

    /// Sets the request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
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
    pub fn build(self) -> MistralResult<MistralConfig> {
        let api_key = self.api_key.ok_or_else(|| MistralError::Configuration {
            message: "API key is required".to_string(),
        })?;

        // Validate API key format
        if api_key.is_empty() {
            return Err(MistralError::Configuration {
                message: "API key cannot be empty".to_string(),
            });
        }

        let base_url = self
            .base_url
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
            .trim_end_matches('/')
            .to_string();

        // Validate base URL
        if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
            return Err(MistralError::Configuration {
                message: "Base URL must start with http:// or https://".to_string(),
            });
        }

        Ok(MistralConfig {
            api_key: SecretString::new(api_key),
            base_url,
            api_version: self.api_version.unwrap_or_else(|| DEFAULT_API_VERSION.to_string()),
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
        let config = MistralConfig::builder()
            .api_key("test-api-key")
            .base_url("https://custom.api.mistral.ai")
            .timeout(Duration::from_secs(30))
            .max_retries(5)
            .build()
            .unwrap();

        assert_eq!(config.api_key(), "test-api-key");
        assert_eq!(config.base_url, "https://custom.api.mistral.ai");
        assert_eq!(config.timeout, Duration::from_secs(30));
        assert_eq!(config.max_retries, 5);
    }

    #[test]
    fn test_config_builder_defaults() {
        let config = MistralConfig::builder()
            .api_key("test-key")
            .build()
            .unwrap();

        assert_eq!(config.base_url, DEFAULT_BASE_URL);
        assert_eq!(config.api_version, DEFAULT_API_VERSION);
        assert_eq!(config.timeout, DEFAULT_TIMEOUT);
        assert_eq!(config.max_retries, DEFAULT_MAX_RETRIES);
    }

    #[test]
    fn test_config_builder_missing_api_key() {
        let result = MistralConfig::builder().build();
        assert!(result.is_err());
    }

    #[test]
    fn test_config_builder_empty_api_key() {
        let result = MistralConfig::builder().api_key("").build();
        assert!(result.is_err());
    }

    #[test]
    fn test_config_builder_invalid_base_url() {
        let result = MistralConfig::builder()
            .api_key("test-key")
            .base_url("invalid-url")
            .build();
        assert!(result.is_err());
    }

    #[test]
    fn test_endpoint_url() {
        let config = MistralConfig::builder()
            .api_key("test-key")
            .build()
            .unwrap();

        assert_eq!(
            config.endpoint_url("chat/completions"),
            "https://api.mistral.ai/v1/chat/completions"
        );
    }

    #[test]
    fn test_config_debug_redacts_api_key() {
        let config = MistralConfig::builder()
            .api_key("secret-key")
            .build()
            .unwrap();

        let debug_str = format!("{:?}", config);
        assert!(debug_str.contains("[REDACTED]"));
        assert!(!debug_str.contains("secret-key"));
    }
}
