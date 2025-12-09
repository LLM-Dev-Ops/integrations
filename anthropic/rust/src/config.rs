//! Configuration for the Anthropic client

use crate::error::AnthropicError;
use secrecy::{ExposeSecret, SecretString};
use std::time::Duration;

/// Configuration for the Anthropic client
#[derive(Debug, Clone)]
pub struct AnthropicConfig {
    /// API key for authentication
    pub api_key: SecretString,

    /// Base URL for the API (default: https://api.anthropic.com)
    pub base_url: String,

    /// API version (default: 2023-06-01)
    pub api_version: String,

    /// Request timeout (default: 600 seconds)
    pub timeout: Duration,

    /// Maximum number of retries (default: 3)
    pub max_retries: u32,

    /// Beta features to enable
    pub beta_features: Vec<BetaFeature>,
}

impl Default for AnthropicConfig {
    fn default() -> Self {
        Self {
            api_key: SecretString::new("".to_string()),
            base_url: "https://api.anthropic.com".to_string(),
            api_version: "2023-06-01".to_string(),
            timeout: Duration::from_secs(600),
            max_retries: 3,
            beta_features: Vec::new(),
        }
    }
}

impl AnthropicConfig {
    /// Create a new configuration with the given API key
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            api_key: SecretString::new(api_key.into()),
            ..Default::default()
        }
    }

    /// Create configuration from environment variables
    pub fn from_env() -> Result<Self, AnthropicError> {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| AnthropicError::Configuration(
                "ANTHROPIC_API_KEY environment variable not set".to_string()
            ))?;

        let mut config = Self::new(api_key);

        if let Ok(base_url) = std::env::var("ANTHROPIC_BASE_URL") {
            config.base_url = base_url;
        }

        if let Ok(api_version) = std::env::var("ANTHROPIC_API_VERSION") {
            config.api_version = api_version;
        }

        if let Ok(timeout) = std::env::var("ANTHROPIC_TIMEOUT") {
            if let Ok(timeout_secs) = timeout.parse::<u64>() {
                config.timeout = Duration::from_secs(timeout_secs);
            }
        }

        if let Ok(max_retries) = std::env::var("ANTHROPIC_MAX_RETRIES") {
            if let Ok(retries) = max_retries.parse::<u32>() {
                config.max_retries = retries;
            }
        }

        Ok(config)
    }

    /// Set the base URL
    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into();
        self
    }

    /// Set the API version
    pub fn with_api_version(mut self, api_version: impl Into<String>) -> Self {
        self.api_version = api_version.into();
        self
    }

    /// Set the timeout
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Set the maximum number of retries
    pub fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    /// Add a beta feature
    pub fn with_beta_feature(mut self, feature: BetaFeature) -> Self {
        self.beta_features.push(feature);
        self
    }

    /// Add multiple beta features
    pub fn with_beta_features(mut self, features: Vec<BetaFeature>) -> Self {
        self.beta_features.extend(features);
        self
    }
}

/// Beta features available in the Anthropic API
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BetaFeature {
    /// Extended thinking feature
    ExtendedThinking,
    /// Prompt caching
    PromptCaching,
    /// PDF support
    PdfSupport,
    /// Token counting
    TokenCounting,
    /// Custom feature (for future features)
    Custom(String),
}

impl BetaFeature {
    /// Get the header value for this beta feature
    pub fn header_value(&self) -> String {
        match self {
            BetaFeature::ExtendedThinking => "extended-thinking-2024-12-01".to_string(),
            BetaFeature::PromptCaching => "prompt-caching-2024-07-31".to_string(),
            BetaFeature::PdfSupport => "pdfs-2024-09-25".to_string(),
            BetaFeature::TokenCounting => "token-counting-2024-11-01".to_string(),
            BetaFeature::Custom(value) => value.clone(),
        }
    }
}
