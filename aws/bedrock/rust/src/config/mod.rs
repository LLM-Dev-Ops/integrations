//! Configuration for AWS Bedrock client.

use crate::credentials::{AwsCredentials, ChainCredentialsProvider, CredentialsProvider, StaticCredentialsProvider};
use crate::error::{BedrockError, ConfigurationError};
use std::sync::Arc;
use std::time::Duration;

/// Configuration for the Bedrock client.
#[derive(Debug, Clone)]
pub struct BedrockConfig {
    /// AWS region.
    pub region: String,
    /// Custom endpoint URL (for testing or custom deployments).
    pub endpoint_url: Option<String>,
    /// Request timeout.
    pub timeout: Duration,
    /// Maximum retries.
    pub max_retries: u32,
    /// Base retry delay.
    pub retry_delay: Duration,
    /// Per-chunk timeout for streaming.
    pub stream_chunk_timeout: Duration,
    /// Maximum stream duration.
    pub max_stream_duration: Option<Duration>,
}

impl BedrockConfig {
    /// Create a new config builder.
    pub fn builder() -> BedrockConfigBuilder {
        BedrockConfigBuilder::new()
    }

    /// Get the Bedrock Runtime endpoint URL.
    pub fn runtime_endpoint(&self) -> String {
        if let Some(custom) = &self.endpoint_url {
            custom.clone()
        } else {
            format!("https://bedrock-runtime.{}.amazonaws.com", self.region)
        }
    }

    /// Get the Bedrock API endpoint URL (for model discovery).
    pub fn api_endpoint(&self) -> String {
        if let Some(custom) = &self.endpoint_url {
            custom.clone()
        } else {
            format!("https://bedrock.{}.amazonaws.com", self.region)
        }
    }
}

impl Default for BedrockConfig {
    fn default() -> Self {
        Self {
            region: "us-east-1".to_string(),
            endpoint_url: None,
            timeout: Duration::from_secs(60),
            max_retries: 3,
            retry_delay: Duration::from_millis(100),
            stream_chunk_timeout: Duration::from_secs(120),
            max_stream_duration: None,
        }
    }
}

/// Builder for BedrockConfig.
#[derive(Debug, Default)]
pub struct BedrockConfigBuilder {
    region: Option<String>,
    endpoint_url: Option<String>,
    timeout: Option<Duration>,
    max_retries: Option<u32>,
    retry_delay: Option<Duration>,
    stream_chunk_timeout: Option<Duration>,
    max_stream_duration: Option<Duration>,
}

impl BedrockConfigBuilder {
    /// Create a new builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the AWS region.
    pub fn region(mut self, region: impl Into<String>) -> Self {
        self.region = Some(region.into());
        self
    }

    /// Set a custom endpoint URL.
    pub fn endpoint_url(mut self, url: impl Into<String>) -> Self {
        self.endpoint_url = Some(url.into());
        self
    }

    /// Set the request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Set maximum retries.
    pub fn max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = Some(max_retries);
        self
    }

    /// Set base retry delay.
    pub fn retry_delay(mut self, delay: Duration) -> Self {
        self.retry_delay = Some(delay);
        self
    }

    /// Set per-chunk timeout for streaming.
    pub fn stream_chunk_timeout(mut self, timeout: Duration) -> Self {
        self.stream_chunk_timeout = Some(timeout);
        self
    }

    /// Set maximum stream duration.
    pub fn max_stream_duration(mut self, duration: Duration) -> Self {
        self.max_stream_duration = Some(duration);
        self
    }

    /// Build the configuration from environment variables.
    pub fn from_env(mut self) -> Self {
        if self.region.is_none() {
            self.region = std::env::var("AWS_REGION")
                .or_else(|_| std::env::var("AWS_DEFAULT_REGION"))
                .ok();
        }

        if self.endpoint_url.is_none() {
            self.endpoint_url = std::env::var("AWS_ENDPOINT_URL_BEDROCK")
                .or_else(|_| std::env::var("AWS_ENDPOINT_URL"))
                .ok();
        }

        self
    }

    /// Build the configuration.
    pub fn build(self) -> Result<BedrockConfig, BedrockError> {
        let region = self.region.ok_or_else(|| {
            BedrockError::Configuration(ConfigurationError::MissingRegion)
        })?;

        // Validate region
        if !is_valid_region(&region) {
            return Err(BedrockError::Configuration(
                ConfigurationError::UnsupportedRegion {
                    region: region.clone(),
                },
            ));
        }

        Ok(BedrockConfig {
            region,
            endpoint_url: self.endpoint_url,
            timeout: self.timeout.unwrap_or(Duration::from_secs(60)),
            max_retries: self.max_retries.unwrap_or(3),
            retry_delay: self.retry_delay.unwrap_or(Duration::from_millis(100)),
            stream_chunk_timeout: self.stream_chunk_timeout.unwrap_or(Duration::from_secs(120)),
            max_stream_duration: self.max_stream_duration,
        })
    }
}

/// Validate AWS region format.
fn is_valid_region(region: &str) -> bool {
    // Basic validation: should match pattern like "us-east-1", "eu-west-2", etc.
    let parts: Vec<&str> = region.split('-').collect();
    if parts.len() < 3 {
        return false;
    }

    // First part should be geographic identifier
    let valid_prefixes = [
        "us", "eu", "ap", "sa", "ca", "me", "af", "cn", "il",
    ];
    if !valid_prefixes.contains(&parts[0]) {
        // Allow for custom/local endpoints
        return region.starts_with("local") || region == "localhost";
    }

    true
}

/// Regions known to support Bedrock.
pub const BEDROCK_REGIONS: &[&str] = &[
    "us-east-1",
    "us-west-2",
    "eu-west-1",
    "eu-west-3",
    "eu-central-1",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
];

/// Check if a region supports Bedrock.
pub fn is_bedrock_region(region: &str) -> bool {
    BEDROCK_REGIONS.contains(&region)
}

/// Stream configuration.
#[derive(Debug, Clone)]
pub struct StreamConfig {
    /// Timeout for receiving each chunk.
    pub chunk_timeout: Duration,
    /// Maximum total stream duration.
    pub max_duration: Option<Duration>,
    /// Buffer size for accumulating partial messages.
    pub buffer_size: usize,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            chunk_timeout: Duration::from_secs(120),
            max_duration: None,
            buffer_size: 64 * 1024, // 64KB
        }
    }
}

/// Retry configuration.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retries.
    pub max_retries: u32,
    /// Base delay before first retry.
    pub base_delay: Duration,
    /// Maximum delay between retries.
    pub max_delay: Duration,
    /// Exponential backoff multiplier.
    pub multiplier: f64,
    /// Add random jitter to delays.
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(30),
            multiplier: 2.0,
            jitter: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_builder() {
        let config = BedrockConfig::builder()
            .region("us-west-2")
            .timeout(Duration::from_secs(30))
            .max_retries(5)
            .build()
            .unwrap();

        assert_eq!(config.region, "us-west-2");
        assert_eq!(config.timeout, Duration::from_secs(30));
        assert_eq!(config.max_retries, 5);
    }

    #[test]
    fn test_config_missing_region() {
        let result = BedrockConfig::builder().build();
        assert!(result.is_err());
    }

    #[test]
    fn test_runtime_endpoint() {
        let config = BedrockConfig::builder()
            .region("us-east-1")
            .build()
            .unwrap();

        assert_eq!(
            config.runtime_endpoint(),
            "https://bedrock-runtime.us-east-1.amazonaws.com"
        );
    }

    #[test]
    fn test_custom_endpoint() {
        let config = BedrockConfig::builder()
            .region("us-east-1")
            .endpoint_url("http://localhost:4566")
            .build()
            .unwrap();

        assert_eq!(config.runtime_endpoint(), "http://localhost:4566");
    }

    #[test]
    fn test_is_valid_region() {
        assert!(is_valid_region("us-east-1"));
        assert!(is_valid_region("eu-west-2"));
        assert!(is_valid_region("ap-southeast-1"));
        assert!(!is_valid_region("invalid"));
        assert!(!is_valid_region("us"));
    }

    #[test]
    fn test_bedrock_regions() {
        assert!(is_bedrock_region("us-east-1"));
        assert!(is_bedrock_region("us-west-2"));
        assert!(!is_bedrock_region("us-west-1"));
    }
}
