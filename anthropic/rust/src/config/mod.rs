//! Configuration types for the Anthropic API client.

use crate::errors::{AnthropicError, AnthropicResult};
use crate::{DEFAULT_API_VERSION, DEFAULT_BASE_URL, DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT_SECS};
use secrecy::SecretString;
use std::time::Duration;

/// Beta features available in the Anthropic API.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BetaFeature {
    /// Extended thinking feature (2024-12-20)
    ExtendedThinking,
    /// PDF support feature (2024-09-25)
    PdfSupport,
    /// Prompt caching feature (2024-07-31)
    PromptCaching,
    /// Token counting feature (2024-11-01)
    TokenCounting,
    /// Message batches feature (2024-09-24)
    MessageBatches,
    /// Computer use feature (2024-10-22)
    ComputerUse,
    /// Custom beta feature
    Custom(String),
}

impl BetaFeature {
    /// Returns the header value for this beta feature
    pub fn header_value(&self) -> String {
        match self {
            BetaFeature::ExtendedThinking => "extended-thinking-2024-12-20".to_string(),
            BetaFeature::PdfSupport => "pdfs-2024-09-25".to_string(),
            BetaFeature::PromptCaching => "prompt-caching-2024-07-31".to_string(),
            BetaFeature::TokenCounting => "token-counting-2024-11-01".to_string(),
            BetaFeature::MessageBatches => "message-batches-2024-09-24".to_string(),
            BetaFeature::ComputerUse => "computer-use-2024-10-22".to_string(),
            BetaFeature::Custom(s) => s.clone(),
        }
    }
}

/// Configuration for the Anthropic API client.
#[derive(Clone)]
pub struct AnthropicConfig {
    /// API key for authentication
    pub api_key: SecretString,
    /// Base URL for the Anthropic API
    pub base_url: String,
    /// API version to use
    pub api_version: String,
    /// Request timeout
    pub timeout: Duration,
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Beta features to enable
    pub beta_features: Vec<BetaFeature>,
}

impl AnthropicConfig {
    /// Creates a new configuration builder
    pub fn builder() -> AnthropicConfigBuilder {
        AnthropicConfigBuilder::default()
    }

    /// Creates a configuration from environment variables
    pub fn from_env() -> AnthropicResult<Self> {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| AnthropicError::Configuration {
                message: "ANTHROPIC_API_KEY environment variable not set".to_string(),
            })?;

        let base_url = std::env::var("ANTHROPIC_BASE_URL")
            .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());

        let api_version = std::env::var("ANTHROPIC_API_VERSION")
            .unwrap_or_else(|_| DEFAULT_API_VERSION.to_string());

        let timeout_secs = std::env::var("ANTHROPIC_TIMEOUT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_TIMEOUT_SECS);

        let max_retries = std::env::var("ANTHROPIC_MAX_RETRIES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_MAX_RETRIES);

        Ok(Self {
            api_key: SecretString::new(api_key),
            base_url,
            api_version,
            timeout: Duration::from_secs(timeout_secs),
            max_retries,
            beta_features: Vec::new(),
        })
    }
}

/// Builder for AnthropicConfig
#[derive(Default)]
pub struct AnthropicConfigBuilder {
    api_key: Option<SecretString>,
    base_url: Option<String>,
    api_version: Option<String>,
    timeout: Option<Duration>,
    max_retries: Option<u32>,
    beta_features: Vec<BetaFeature>,
}

impl AnthropicConfigBuilder {
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

    /// Sets the maximum number of retries
    pub fn max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = Some(max_retries);
        self
    }

    /// Adds a beta feature
    pub fn add_beta_feature(mut self, feature: BetaFeature) -> Self {
        self.beta_features.push(feature);
        self
    }

    /// Sets beta features
    pub fn beta_features(mut self, features: Vec<BetaFeature>) -> Self {
        self.beta_features = features;
        self
    }

    /// Builds the configuration
    pub fn build(self) -> AnthropicResult<AnthropicConfig> {
        let api_key = self.api_key.ok_or_else(|| AnthropicError::Configuration {
            message: "API key is required".to_string(),
        })?;

        Ok(AnthropicConfig {
            api_key,
            base_url: self.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            api_version: self.api_version.unwrap_or_else(|| DEFAULT_API_VERSION.to_string()),
            timeout: self.timeout.unwrap_or(Duration::from_secs(DEFAULT_TIMEOUT_SECS)),
            max_retries: self.max_retries.unwrap_or(DEFAULT_MAX_RETRIES),
            beta_features: self.beta_features,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_beta_feature_header_value() {
        assert_eq!(
            BetaFeature::ExtendedThinking.header_value(),
            "extended-thinking-2024-12-20"
        );
        assert_eq!(
            BetaFeature::PdfSupport.header_value(),
            "pdfs-2024-09-25"
        );
        assert_eq!(
            BetaFeature::Custom("custom-feature".to_string()).header_value(),
            "custom-feature"
        );
    }

    #[test]
    fn test_config_builder() {
        let config = AnthropicConfig::builder()
            .api_key(SecretString::new("sk-ant-test".to_string()))
            .build()
            .unwrap();

        assert_eq!(config.base_url, DEFAULT_BASE_URL);
        assert_eq!(config.api_version, DEFAULT_API_VERSION);
        assert_eq!(config.timeout, Duration::from_secs(DEFAULT_TIMEOUT_SECS));
        assert_eq!(config.max_retries, DEFAULT_MAX_RETRIES);
    }

    #[test]
    fn test_config_builder_custom() {
        let config = AnthropicConfig::builder()
            .api_key(SecretString::new("sk-ant-test".to_string()))
            .base_url("https://custom.api.com")
            .api_version("2024-01-01")
            .timeout(Duration::from_secs(120))
            .max_retries(5)
            .add_beta_feature(BetaFeature::ExtendedThinking)
            .build()
            .unwrap();

        assert_eq!(config.base_url, "https://custom.api.com");
        assert_eq!(config.api_version, "2024-01-01");
        assert_eq!(config.timeout, Duration::from_secs(120));
        assert_eq!(config.max_retries, 5);
        assert_eq!(config.beta_features.len(), 1);
    }
}
