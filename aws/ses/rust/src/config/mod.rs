//! Configuration module for the AWS SES client.
//!
//! This module provides configuration types and builders for creating and customizing
//! the SES client behavior, including:
//!
//! - Region and endpoint configuration
//! - Credential provider configuration
//! - Timeout and retry settings
//! - Rate limiting
//! - User agent customization

use std::sync::Arc;
use std::time::Duration;

pub mod error;
pub mod rate_limit;
pub mod retry;

pub use error::ConfigError;
pub use rate_limit::{RateLimitConfig, RateLimiter};
pub use retry::RetryConfig;

use crate::credentials::{CredentialProvider, StaticCredentialProvider, DefaultCredentialProvider};

/// Configuration for the SES client.
#[derive(Clone)]
pub struct SesConfig {
    /// AWS region (e.g., "us-east-1").
    pub region: String,

    /// Custom endpoint URL (for LocalStack or custom implementations).
    pub endpoint: Option<String>,

    /// Credential provider for AWS authentication.
    pub credentials_provider: Arc<dyn CredentialProvider + Send + Sync>,

    /// Timeout for the entire request.
    pub timeout: Duration,

    /// Timeout for establishing connections.
    pub connect_timeout: Duration,

    /// Maximum number of retry attempts.
    pub max_retries: u32,

    /// Retry configuration.
    pub retry_config: RetryConfig,

    /// Rate limiting configuration.
    pub rate_limit: Option<RateLimitConfig>,

    /// Custom user agent string.
    pub user_agent: Option<String>,
}

impl SesConfig {
    /// Create a new configuration builder.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let config = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .credentials("access_key", "secret_key")
    ///     .build()?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn builder() -> SesConfigBuilder {
        SesConfigBuilder::default()
    }

    /// Create a configuration from environment variables.
    ///
    /// This method reads the following environment variables:
    /// - `AWS_REGION` or `AWS_DEFAULT_REGION` for the region
    /// - Uses the default credential chain for authentication
    ///
    /// # Returns
    ///
    /// A configured `SesConfig` instance or an error if required variables are missing.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let config = SesConfig::from_env()?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn from_env() -> Result<Self, ConfigError> {
        let region = std::env::var("AWS_REGION")
            .or_else(|_| std::env::var("AWS_DEFAULT_REGION"))
            .map_err(|_| ConfigError::Environment {
                message: "AWS_REGION or AWS_DEFAULT_REGION must be set".to_string(),
            })?;

        Ok(Self::builder()
            .region(region)
            .credentials_provider(DefaultCredentialProvider::new())
            .build()?)
    }

    /// Get the SES endpoint URL for this configuration.
    ///
    /// Returns the custom endpoint if configured, otherwise constructs the
    /// standard AWS SES endpoint for the configured region.
    ///
    /// # Returns
    ///
    /// The endpoint URL as a string.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let config = SesConfig::builder()
    ///     .region("us-west-2")
    ///     .credentials("access_key", "secret_key")
    ///     .build()?;
    ///
    /// assert_eq!(config.ses_endpoint(), "https://email.us-west-2.amazonaws.com");
    /// # Ok(())
    /// # }
    /// ```
    pub fn ses_endpoint(&self) -> String {
        self.endpoint.clone().unwrap_or_else(|| {
            format!("https://email.{}.amazonaws.com", self.region)
        })
    }
}

/// Builder for creating SES client configurations.
#[derive(Default)]
pub struct SesConfigBuilder {
    region: Option<String>,
    endpoint: Option<String>,
    credentials_provider: Option<Arc<dyn CredentialProvider + Send + Sync>>,
    timeout: Option<Duration>,
    connect_timeout: Option<Duration>,
    max_retries: Option<u32>,
    retry_config: Option<RetryConfig>,
    rate_limit: Option<RateLimitConfig>,
    user_agent: Option<String>,
}

impl SesConfigBuilder {
    /// Set the AWS region.
    ///
    /// # Arguments
    ///
    /// * `region` - The AWS region (e.g., "us-east-1").
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// let builder = SesConfig::builder().region("us-east-1");
    /// ```
    pub fn region(mut self, region: impl Into<String>) -> Self {
        self.region = Some(region.into());
        self
    }

    /// Set a custom endpoint URL.
    ///
    /// This is useful for testing with LocalStack or using custom SES implementations.
    ///
    /// # Arguments
    ///
    /// * `endpoint` - The custom endpoint URL.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// let builder = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .endpoint("http://localhost:4566");
    /// ```
    pub fn endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = Some(endpoint.into());
        self
    }

    /// Set a custom credential provider.
    ///
    /// # Arguments
    ///
    /// * `provider` - A credential provider implementation.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::SesConfig;
    /// use aws_ses_rust::credentials::DefaultCredentialProvider;
    ///
    /// let builder = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .credentials_provider(DefaultCredentialProvider::new());
    /// ```
    pub fn credentials_provider(
        mut self,
        provider: impl CredentialProvider + Send + Sync + 'static,
    ) -> Self {
        self.credentials_provider = Some(Arc::new(provider));
        self
    }

    /// Set static credentials (convenience method).
    ///
    /// # Arguments
    ///
    /// * `access_key` - AWS access key ID.
    /// * `secret_key` - AWS secret access key.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// let builder = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .credentials("AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    /// ```
    pub fn credentials(self, access_key: &str, secret_key: &str) -> Self {
        self.credentials_provider(StaticCredentialProvider::new(
            access_key.to_string(),
            secret_key.to_string(),
            None,
        ))
    }

    /// Set the request timeout.
    ///
    /// # Arguments
    ///
    /// * `duration` - The timeout duration.
    ///
    /// # Example
    ///
    /// ```
    /// use std::time::Duration;
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// let builder = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .timeout(Duration::from_secs(60));
    /// ```
    pub fn timeout(mut self, duration: Duration) -> Self {
        self.timeout = Some(duration);
        self
    }

    /// Set the connection timeout.
    ///
    /// # Arguments
    ///
    /// * `duration` - The connection timeout duration.
    ///
    /// # Example
    ///
    /// ```
    /// use std::time::Duration;
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// let builder = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .connect_timeout(Duration::from_secs(5));
    /// ```
    pub fn connect_timeout(mut self, duration: Duration) -> Self {
        self.connect_timeout = Some(duration);
        self
    }

    /// Set the maximum number of retry attempts.
    ///
    /// # Arguments
    ///
    /// * `retries` - Maximum number of retries.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// let builder = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .max_retries(5);
    /// ```
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.max_retries = Some(retries);
        self
    }

    /// Set the retry configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - Retry configuration.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::{SesConfig, RetryConfig};
    ///
    /// let retry_config = RetryConfig::default();
    /// let builder = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .retry_config(retry_config);
    /// ```
    pub fn retry_config(mut self, config: RetryConfig) -> Self {
        self.retry_config = Some(config);
        self
    }

    /// Set the rate limiting configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - Rate limit configuration.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::{SesConfig, RateLimitConfig};
    ///
    /// let rate_limit = RateLimitConfig {
    ///     requests_per_second: 10.0,
    ///     burst_size: 20,
    /// };
    /// let builder = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .rate_limit(rate_limit);
    /// ```
    pub fn rate_limit(mut self, config: RateLimitConfig) -> Self {
        self.rate_limit = Some(config);
        self
    }

    /// Set a custom user agent string.
    ///
    /// # Arguments
    ///
    /// * `ua` - The user agent string.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// let builder = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .user_agent("MyApp/1.0");
    /// ```
    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.user_agent = Some(ua.into());
        self
    }

    /// Build the configuration.
    ///
    /// # Returns
    ///
    /// A configured `SesConfig` instance or an error if required fields are missing.
    ///
    /// # Errors
    ///
    /// Returns `ConfigError::MissingField` if the region or credentials provider is not set.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::SesConfig;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let config = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .credentials("access_key", "secret_key")
    ///     .build()?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn build(self) -> Result<SesConfig, ConfigError> {
        let region = self.region.ok_or_else(|| ConfigError::MissingField {
            field: "region".to_string(),
        })?;

        let credentials_provider = self.credentials_provider.ok_or_else(|| {
            ConfigError::MissingField {
                field: "credentials_provider".to_string(),
            }
        })?;

        Ok(SesConfig {
            region,
            endpoint: self.endpoint,
            credentials_provider,
            timeout: self.timeout.unwrap_or(Duration::from_secs(30)),
            connect_timeout: self.connect_timeout.unwrap_or(Duration::from_secs(10)),
            max_retries: self.max_retries.unwrap_or(3),
            retry_config: self.retry_config.unwrap_or_default(),
            rate_limit: self.rate_limit,
            user_agent: self.user_agent,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builder_with_required_fields() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("access_key", "secret_key")
            .build()
            .unwrap();

        assert_eq!(config.region, "us-east-1");
        assert_eq!(config.timeout, Duration::from_secs(30));
        assert_eq!(config.connect_timeout, Duration::from_secs(10));
        assert_eq!(config.max_retries, 3);
    }

    #[test]
    fn test_builder_with_custom_endpoint() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .endpoint("http://localhost:4566")
            .credentials("access_key", "secret_key")
            .build()
            .unwrap();

        assert_eq!(config.endpoint, Some("http://localhost:4566".to_string()));
        assert_eq!(config.ses_endpoint(), "http://localhost:4566");
    }

    #[test]
    fn test_builder_with_custom_timeouts() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("access_key", "secret_key")
            .timeout(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .unwrap();

        assert_eq!(config.timeout, Duration::from_secs(60));
        assert_eq!(config.connect_timeout, Duration::from_secs(5));
    }

    #[test]
    fn test_builder_with_custom_retries() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("access_key", "secret_key")
            .max_retries(5)
            .build()
            .unwrap();

        assert_eq!(config.max_retries, 5);
    }

    #[test]
    fn test_builder_with_rate_limit() {
        let rate_limit = RateLimitConfig {
            requests_per_second: 10.0,
            burst_size: 20,
        };

        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("access_key", "secret_key")
            .rate_limit(rate_limit.clone())
            .build()
            .unwrap();

        assert!(config.rate_limit.is_some());
        let config_rate_limit = config.rate_limit.unwrap();
        assert_eq!(config_rate_limit.requests_per_second, 10.0);
        assert_eq!(config_rate_limit.burst_size, 20);
    }

    #[test]
    fn test_builder_with_user_agent() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("access_key", "secret_key")
            .user_agent("MyApp/1.0")
            .build()
            .unwrap();

        assert_eq!(config.user_agent, Some("MyApp/1.0".to_string()));
    }

    #[test]
    fn test_builder_missing_region() {
        let result = SesConfig::builder()
            .credentials("access_key", "secret_key")
            .build();

        assert!(result.is_err());
        match result.unwrap_err() {
            ConfigError::MissingField { field } => assert_eq!(field, "region"),
            _ => panic!("Expected MissingField error"),
        }
    }

    #[test]
    fn test_builder_missing_credentials() {
        let result = SesConfig::builder()
            .region("us-east-1")
            .build();

        assert!(result.is_err());
        match result.unwrap_err() {
            ConfigError::MissingField { field } => assert_eq!(field, "credentials_provider"),
            _ => panic!("Expected MissingField error"),
        }
    }

    #[test]
    fn test_ses_endpoint_default() {
        let config = SesConfig::builder()
            .region("eu-west-1")
            .credentials("access_key", "secret_key")
            .build()
            .unwrap();

        assert_eq!(config.ses_endpoint(), "https://email.eu-west-1.amazonaws.com");
    }

    #[test]
    fn test_ses_endpoint_custom() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .endpoint("http://localhost:4566")
            .credentials("access_key", "secret_key")
            .build()
            .unwrap();

        assert_eq!(config.ses_endpoint(), "http://localhost:4566");
    }
}
