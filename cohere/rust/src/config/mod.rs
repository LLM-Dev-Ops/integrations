//! Configuration types for the Cohere API client.

use crate::errors::{CohereError, CohereResult};
use crate::{DEFAULT_API_VERSION, DEFAULT_BASE_URL, DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT_SECS};
use secrecy::SecretString;
use std::time::Duration;

/// Configuration for the Cohere API client.
#[derive(Clone)]
pub struct CohereConfig {
    /// API key for authentication
    pub api_key: SecretString,
    /// Base URL for the Cohere API
    pub base_url: String,
    /// API version to use (for version headers)
    pub api_version: String,
    /// Request timeout
    pub timeout: Duration,
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Client name for identification (optional)
    pub client_name: Option<String>,
    /// Custom user agent suffix (optional)
    pub user_agent_suffix: Option<String>,
}

impl std::fmt::Debug for CohereConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CohereConfig")
            .field("api_key", &"[REDACTED]")
            .field("base_url", &self.base_url)
            .field("api_version", &self.api_version)
            .field("timeout", &self.timeout)
            .field("max_retries", &self.max_retries)
            .field("client_name", &self.client_name)
            .field("user_agent_suffix", &self.user_agent_suffix)
            .finish()
    }
}

impl CohereConfig {
    /// Creates a new configuration builder
    pub fn builder() -> CohereConfigBuilder {
        CohereConfigBuilder::default()
    }

    /// Creates a configuration from environment variables
    ///
    /// Supported environment variables:
    /// - `COHERE_API_KEY` (required): API key for authentication
    /// - `COHERE_BASE_URL` (optional): Base URL (defaults to https://api.cohere.ai)
    /// - `COHERE_API_VERSION` (optional): API version header
    /// - `COHERE_TIMEOUT` (optional): Timeout in seconds
    /// - `COHERE_MAX_RETRIES` (optional): Maximum retry attempts
    pub fn from_env() -> CohereResult<Self> {
        let api_key = std::env::var("COHERE_API_KEY").map_err(|_| CohereError::Configuration {
            message: "COHERE_API_KEY environment variable not set".to_string(),
        })?;

        let base_url =
            std::env::var("COHERE_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());

        let api_version = std::env::var("COHERE_API_VERSION")
            .unwrap_or_else(|_| DEFAULT_API_VERSION.to_string());

        let timeout_secs = std::env::var("COHERE_TIMEOUT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_TIMEOUT_SECS);

        let max_retries = std::env::var("COHERE_MAX_RETRIES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_MAX_RETRIES);

        let client_name = std::env::var("COHERE_CLIENT_NAME").ok();

        Ok(Self {
            api_key: SecretString::new(api_key),
            base_url,
            api_version,
            timeout: Duration::from_secs(timeout_secs),
            max_retries,
            client_name,
            user_agent_suffix: None,
        })
    }

    /// Validate the configuration
    pub fn validate(&self) -> CohereResult<()> {
        use secrecy::ExposeSecret;

        // Validate API key
        let key = self.api_key.expose_secret();
        if key.is_empty() {
            return Err(CohereError::Configuration {
                message: "API key cannot be empty".to_string(),
            });
        }

        // Validate base URL
        if self.base_url.is_empty() {
            return Err(CohereError::Configuration {
                message: "Base URL cannot be empty".to_string(),
            });
        }

        // Validate base URL is a valid URL
        url::Url::parse(&self.base_url).map_err(|e| CohereError::Configuration {
            message: format!("Invalid base URL: {}", e),
        })?;

        // Validate timeout
        if self.timeout.is_zero() {
            return Err(CohereError::Configuration {
                message: "Timeout cannot be zero".to_string(),
            });
        }

        Ok(())
    }
}

/// Builder for CohereConfig
#[derive(Default)]
pub struct CohereConfigBuilder {
    api_key: Option<SecretString>,
    base_url: Option<String>,
    api_version: Option<String>,
    timeout: Option<Duration>,
    max_retries: Option<u32>,
    client_name: Option<String>,
    user_agent_suffix: Option<String>,
}

impl CohereConfigBuilder {
    /// Sets the API key
    pub fn api_key(mut self, api_key: SecretString) -> Self {
        self.api_key = Some(api_key);
        self
    }

    /// Sets the base URL
    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = Some(base_url.into());
        self
    }

    /// Sets the API version
    pub fn api_version(mut self, api_version: impl Into<String>) -> Self {
        self.api_version = Some(api_version.into());
        self
    }

    /// Sets the request timeout
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Sets the request timeout in seconds
    pub fn timeout_secs(mut self, secs: u64) -> Self {
        self.timeout = Some(Duration::from_secs(secs));
        self
    }

    /// Sets the maximum number of retries
    pub fn max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = Some(max_retries);
        self
    }

    /// Sets the client name for identification
    pub fn client_name(mut self, client_name: impl Into<String>) -> Self {
        self.client_name = Some(client_name.into());
        self
    }

    /// Sets a custom user agent suffix
    pub fn user_agent_suffix(mut self, suffix: impl Into<String>) -> Self {
        self.user_agent_suffix = Some(suffix.into());
        self
    }

    /// Builds the configuration
    pub fn build(self) -> CohereResult<CohereConfig> {
        let api_key = self.api_key.ok_or_else(|| CohereError::Configuration {
            message: "API key is required".to_string(),
        })?;

        let config = CohereConfig {
            api_key,
            base_url: self.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            api_version: self
                .api_version
                .unwrap_or_else(|| DEFAULT_API_VERSION.to_string()),
            timeout: self
                .timeout
                .unwrap_or(Duration::from_secs(DEFAULT_TIMEOUT_SECS)),
            max_retries: self.max_retries.unwrap_or(DEFAULT_MAX_RETRIES),
            client_name: self.client_name,
            user_agent_suffix: self.user_agent_suffix,
        };

        // Validate the configuration
        config.validate()?;

        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_builder() {
        let config = CohereConfig::builder()
            .api_key(SecretString::new("test-api-key".to_string()))
            .build()
            .unwrap();

        assert_eq!(config.base_url, DEFAULT_BASE_URL);
        assert_eq!(config.api_version, DEFAULT_API_VERSION);
        assert_eq!(config.timeout, Duration::from_secs(DEFAULT_TIMEOUT_SECS));
        assert_eq!(config.max_retries, DEFAULT_MAX_RETRIES);
    }

    #[test]
    fn test_config_builder_custom() {
        let config = CohereConfig::builder()
            .api_key(SecretString::new("test-api-key".to_string()))
            .base_url("https://custom.api.com")
            .api_version("2024-06-01")
            .timeout(Duration::from_secs(120))
            .max_retries(5)
            .client_name("my-app")
            .build()
            .unwrap();

        assert_eq!(config.base_url, "https://custom.api.com");
        assert_eq!(config.api_version, "2024-06-01");
        assert_eq!(config.timeout, Duration::from_secs(120));
        assert_eq!(config.max_retries, 5);
        assert_eq!(config.client_name, Some("my-app".to_string()));
    }

    #[test]
    fn test_config_builder_missing_api_key() {
        let result = CohereConfig::builder().build();
        assert!(result.is_err());
        match result {
            Err(CohereError::Configuration { message }) => {
                assert!(message.contains("API key is required"));
            }
            _ => panic!("Expected Configuration error"),
        }
    }

    #[test]
    fn test_config_debug_redacts_api_key() {
        let config = CohereConfig::builder()
            .api_key(SecretString::new("secret-key".to_string()))
            .build()
            .unwrap();

        let debug_output = format!("{:?}", config);
        assert!(debug_output.contains("[REDACTED]"));
        assert!(!debug_output.contains("secret-key"));
    }

    #[test]
    fn test_config_validate_invalid_url() {
        // We can't easily create an invalid config through the builder,
        // but we can test the validation logic
        let config = CohereConfig {
            api_key: SecretString::new("test".to_string()),
            base_url: "not-a-valid-url".to_string(),
            api_version: DEFAULT_API_VERSION.to_string(),
            timeout: Duration::from_secs(30),
            max_retries: 3,
            client_name: None,
            user_agent_suffix: None,
        };

        let result = config.validate();
        assert!(result.is_err());
    }
}
