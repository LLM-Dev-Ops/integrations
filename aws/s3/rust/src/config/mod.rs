//! Configuration types for the S3 client.
//!
//! This module provides the `S3Config` type for configuring the S3 client,
//! including region, credentials, timeouts, and resilience settings.

use crate::credentials::{ChainCredentialsProvider, CredentialsProvider};
use crate::error::{ConfigurationError, S3Error};
use std::sync::Arc;
use std::time::Duration;
use url::Url;

/// Configuration for the S3 client.
#[derive(Clone)]
pub struct S3Config {
    /// AWS region (e.g., "us-east-1").
    pub region: String,

    /// Credentials provider.
    pub credentials_provider: Arc<dyn CredentialsProvider>,

    /// Custom endpoint URL (for S3-compatible services).
    pub endpoint: Option<Url>,

    /// Use path-style addressing instead of virtual-hosted style.
    ///
    /// Path-style: `https://s3.region.amazonaws.com/bucket/key`
    /// Virtual-hosted: `https://bucket.s3.region.amazonaws.com/key`
    pub path_style: bool,

    /// Use dual-stack (IPv4/IPv6) endpoints.
    pub use_dual_stack: bool,

    /// Use FIPS endpoints.
    pub use_fips: bool,

    /// Connection timeout.
    pub connect_timeout: Duration,

    /// Read timeout for individual operations.
    pub read_timeout: Duration,

    /// Overall operation timeout.
    pub operation_timeout: Duration,

    /// Maximum number of retries for transient failures.
    pub max_retries: u32,

    /// Initial backoff delay for retries.
    pub initial_backoff: Duration,

    /// Maximum backoff delay.
    pub max_backoff: Duration,

    /// Backoff multiplier for exponential backoff.
    pub backoff_multiplier: f64,

    /// Circuit breaker failure threshold.
    pub circuit_breaker_threshold: u32,

    /// Circuit breaker reset timeout.
    pub circuit_breaker_reset_timeout: Duration,

    /// Rate limit in requests per second (None = no limit).
    pub rate_limit_rps: Option<u32>,

    /// Rate limit burst size.
    pub rate_limit_burst: Option<u32>,

    /// Maximum connections in the pool.
    pub max_connections: u32,

    /// Idle connection timeout.
    pub idle_timeout: Duration,

    /// Multipart upload threshold (bytes).
    /// Objects larger than this will use multipart upload.
    pub multipart_threshold: u64,

    /// Multipart upload part size (bytes).
    pub multipart_part_size: u64,

    /// Maximum concurrent multipart upload parts.
    pub multipart_concurrency: u32,

    /// Verify SSL certificates.
    pub verify_ssl: bool,
}

impl std::fmt::Debug for S3Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("S3Config")
            .field("region", &self.region)
            .field("endpoint", &self.endpoint)
            .field("path_style", &self.path_style)
            .field("use_dual_stack", &self.use_dual_stack)
            .field("use_fips", &self.use_fips)
            .field("connect_timeout", &self.connect_timeout)
            .field("read_timeout", &self.read_timeout)
            .field("operation_timeout", &self.operation_timeout)
            .field("max_retries", &self.max_retries)
            .field("max_connections", &self.max_connections)
            .field("multipart_threshold", &self.multipart_threshold)
            .field("multipart_part_size", &self.multipart_part_size)
            .field("multipart_concurrency", &self.multipart_concurrency)
            .field("verify_ssl", &self.verify_ssl)
            // Intentionally omit credentials_provider for security
            .finish_non_exhaustive()
    }
}

impl Default for S3Config {
    fn default() -> Self {
        Self {
            region: "us-east-1".to_string(),
            credentials_provider: Arc::new(ChainCredentialsProvider::default()),
            endpoint: None,
            path_style: false,
            use_dual_stack: false,
            use_fips: false,
            connect_timeout: Duration::from_secs(5),
            read_timeout: Duration::from_secs(30),
            operation_timeout: Duration::from_secs(300), // 5 minutes
            max_retries: 3,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(20),
            backoff_multiplier: 2.0,
            circuit_breaker_threshold: 5,
            circuit_breaker_reset_timeout: Duration::from_secs(30),
            rate_limit_rps: None,
            rate_limit_burst: None,
            max_connections: 100,
            idle_timeout: Duration::from_secs(90),
            multipart_threshold: 100 * 1024 * 1024, // 100 MB
            multipart_part_size: 8 * 1024 * 1024,   // 8 MB
            multipart_concurrency: 4,
            verify_ssl: true,
        }
    }
}

impl S3Config {
    /// Create a new configuration builder.
    pub fn builder() -> S3ConfigBuilder {
        S3ConfigBuilder::default()
    }

    /// Resolve the endpoint URL for a given bucket.
    pub fn resolve_endpoint(&self, bucket: Option<&str>) -> Url {
        if let Some(endpoint) = &self.endpoint {
            return endpoint.clone();
        }

        let host = if self.use_fips && self.use_dual_stack {
            format!("s3-fips.dualstack.{}.amazonaws.com", self.region)
        } else if self.use_fips {
            format!("s3-fips.{}.amazonaws.com", self.region)
        } else if self.use_dual_stack {
            format!("s3.dualstack.{}.amazonaws.com", self.region)
        } else {
            format!("s3.{}.amazonaws.com", self.region)
        };

        let url_str = if self.path_style || bucket.is_none() {
            format!("https://{}", host)
        } else {
            format!("https://{}.{}", bucket.unwrap(), host)
        };

        Url::parse(&url_str).expect("Failed to construct endpoint URL")
    }

    /// Build the path for an S3 request.
    pub fn build_path(&self, bucket: &str, key: Option<&str>) -> String {
        if self.path_style || self.endpoint.is_some() {
            match key {
                Some(k) => format!("/{}/{}", bucket, k),
                None => format!("/{}", bucket),
            }
        } else {
            match key {
                Some(k) => format!("/{}", k),
                None => "/".to_string(),
            }
        }
    }
}

/// Builder for S3 configuration.
#[derive(Default)]
pub struct S3ConfigBuilder {
    region: Option<String>,
    credentials_provider: Option<Arc<dyn CredentialsProvider>>,
    endpoint: Option<Url>,
    path_style: Option<bool>,
    use_dual_stack: Option<bool>,
    use_fips: Option<bool>,
    connect_timeout: Option<Duration>,
    read_timeout: Option<Duration>,
    operation_timeout: Option<Duration>,
    max_retries: Option<u32>,
    initial_backoff: Option<Duration>,
    max_backoff: Option<Duration>,
    backoff_multiplier: Option<f64>,
    circuit_breaker_threshold: Option<u32>,
    circuit_breaker_reset_timeout: Option<Duration>,
    rate_limit_rps: Option<u32>,
    rate_limit_burst: Option<u32>,
    max_connections: Option<u32>,
    idle_timeout: Option<Duration>,
    multipart_threshold: Option<u64>,
    multipart_part_size: Option<u64>,
    multipart_concurrency: Option<u32>,
    verify_ssl: Option<bool>,
}

impl S3ConfigBuilder {
    /// Create a new builder with default values.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the AWS region.
    pub fn region(mut self, region: impl Into<String>) -> Self {
        self.region = Some(region.into());
        self
    }

    /// Set the credentials provider.
    pub fn credentials_provider(mut self, provider: Arc<dyn CredentialsProvider>) -> Self {
        self.credentials_provider = Some(provider);
        self
    }

    /// Set a custom endpoint URL.
    pub fn endpoint(mut self, endpoint: impl Into<String>) -> Result<Self, S3Error> {
        let url_str = endpoint.into();
        let url = Url::parse(&url_str).map_err(|e| {
            S3Error::Configuration(ConfigurationError::InvalidEndpoint {
                url: url_str,
                details: e.to_string(),
            })
        })?;
        self.endpoint = Some(url);
        Ok(self)
    }

    /// Set a custom endpoint URL (infallible version).
    pub fn endpoint_url(mut self, endpoint: Url) -> Self {
        self.endpoint = Some(endpoint);
        self
    }

    /// Enable path-style addressing.
    pub fn path_style(mut self, enabled: bool) -> Self {
        self.path_style = Some(enabled);
        self
    }

    /// Enable dual-stack endpoints.
    pub fn dual_stack(mut self, enabled: bool) -> Self {
        self.use_dual_stack = Some(enabled);
        self
    }

    /// Enable FIPS endpoints.
    pub fn fips(mut self, enabled: bool) -> Self {
        self.use_fips = Some(enabled);
        self
    }

    /// Set the connection timeout.
    pub fn connect_timeout(mut self, timeout: Duration) -> Self {
        self.connect_timeout = Some(timeout);
        self
    }

    /// Set the read timeout.
    pub fn read_timeout(mut self, timeout: Duration) -> Self {
        self.read_timeout = Some(timeout);
        self
    }

    /// Set the overall operation timeout.
    pub fn operation_timeout(mut self, timeout: Duration) -> Self {
        self.operation_timeout = Some(timeout);
        self
    }

    /// Set the maximum number of retries.
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.max_retries = Some(retries);
        self
    }

    /// Set the initial backoff delay.
    pub fn initial_backoff(mut self, delay: Duration) -> Self {
        self.initial_backoff = Some(delay);
        self
    }

    /// Set the maximum backoff delay.
    pub fn max_backoff(mut self, delay: Duration) -> Self {
        self.max_backoff = Some(delay);
        self
    }

    /// Set the backoff multiplier.
    pub fn backoff_multiplier(mut self, multiplier: f64) -> Self {
        self.backoff_multiplier = Some(multiplier);
        self
    }

    /// Set the circuit breaker failure threshold.
    pub fn circuit_breaker_threshold(mut self, threshold: u32) -> Self {
        self.circuit_breaker_threshold = Some(threshold);
        self
    }

    /// Set the circuit breaker reset timeout.
    pub fn circuit_breaker_reset_timeout(mut self, timeout: Duration) -> Self {
        self.circuit_breaker_reset_timeout = Some(timeout);
        self
    }

    /// Set the rate limit in requests per second.
    pub fn rate_limit(mut self, rps: u32) -> Self {
        self.rate_limit_rps = Some(rps);
        self
    }

    /// Set the rate limit burst size.
    pub fn rate_limit_burst(mut self, burst: u32) -> Self {
        self.rate_limit_burst = Some(burst);
        self
    }

    /// Set the maximum connections in the pool.
    pub fn max_connections(mut self, connections: u32) -> Self {
        self.max_connections = Some(connections);
        self
    }

    /// Set the idle connection timeout.
    pub fn idle_timeout(mut self, timeout: Duration) -> Self {
        self.idle_timeout = Some(timeout);
        self
    }

    /// Set the multipart upload threshold.
    pub fn multipart_threshold(mut self, threshold: u64) -> Self {
        self.multipart_threshold = Some(threshold);
        self
    }

    /// Set the multipart upload part size.
    pub fn multipart_part_size(mut self, size: u64) -> Self {
        self.multipart_part_size = Some(size);
        self
    }

    /// Set the maximum concurrent multipart upload parts.
    pub fn multipart_concurrency(mut self, concurrency: u32) -> Self {
        self.multipart_concurrency = Some(concurrency);
        self
    }

    /// Enable or disable SSL verification.
    pub fn verify_ssl(mut self, verify: bool) -> Self {
        self.verify_ssl = Some(verify);
        self
    }

    /// Load configuration from environment variables.
    pub fn from_env(mut self) -> Self {
        // AWS standard environment variables
        if let Ok(region) = std::env::var("AWS_REGION") {
            self.region = Some(region);
        } else if let Ok(region) = std::env::var("AWS_DEFAULT_REGION") {
            self.region = Some(region);
        }

        // Custom endpoint
        if let Ok(endpoint) = std::env::var("AWS_ENDPOINT_URL_S3") {
            if let Ok(url) = Url::parse(&endpoint) {
                self.endpoint = Some(url);
            }
        } else if let Ok(endpoint) = std::env::var("AWS_ENDPOINT_URL") {
            if let Ok(url) = Url::parse(&endpoint) {
                self.endpoint = Some(url);
            }
        }

        // FIPS and dual-stack
        if let Ok(val) = std::env::var("AWS_USE_FIPS_ENDPOINT") {
            self.use_fips = Some(val.to_lowercase() == "true");
        }
        if let Ok(val) = std::env::var("AWS_USE_DUALSTACK_ENDPOINT") {
            self.use_dual_stack = Some(val.to_lowercase() == "true");
        }

        // Integration-specific settings
        if let Ok(val) = std::env::var("S3_INTEGRATION_PATH_STYLE") {
            self.path_style = Some(val.to_lowercase() == "true");
        }
        if let Ok(val) = std::env::var("S3_INTEGRATION_MAX_RETRIES") {
            if let Ok(retries) = val.parse() {
                self.max_retries = Some(retries);
            }
        }
        if let Ok(val) = std::env::var("S3_INTEGRATION_TIMEOUT_MS") {
            if let Ok(ms) = val.parse() {
                self.operation_timeout = Some(Duration::from_millis(ms));
            }
        }
        if let Ok(val) = std::env::var("S3_INTEGRATION_MULTIPART_THRESHOLD") {
            if let Ok(threshold) = val.parse() {
                self.multipart_threshold = Some(threshold);
            }
        }
        if let Ok(val) = std::env::var("S3_INTEGRATION_MULTIPART_PART_SIZE") {
            if let Ok(size) = val.parse() {
                self.multipart_part_size = Some(size);
            }
        }
        if let Ok(val) = std::env::var("S3_INTEGRATION_MULTIPART_CONCURRENCY") {
            if let Ok(concurrency) = val.parse() {
                self.multipart_concurrency = Some(concurrency);
            }
        }

        self
    }

    /// Build the configuration.
    pub fn build(self) -> Result<S3Config, S3Error> {
        let defaults = S3Config::default();

        // Validate multipart settings
        let multipart_part_size = self.multipart_part_size.unwrap_or(defaults.multipart_part_size);
        const MIN_PART_SIZE: u64 = 5 * 1024 * 1024; // 5 MB
        const MAX_PART_SIZE: u64 = 5 * 1024 * 1024 * 1024; // 5 GB

        if multipart_part_size < MIN_PART_SIZE {
            return Err(S3Error::Configuration(
                ConfigurationError::InvalidConfiguration {
                    field: "multipart_part_size".to_string(),
                    message: format!(
                        "Part size must be at least {} bytes",
                        MIN_PART_SIZE
                    ),
                },
            ));
        }

        if multipart_part_size > MAX_PART_SIZE {
            return Err(S3Error::Configuration(
                ConfigurationError::InvalidConfiguration {
                    field: "multipart_part_size".to_string(),
                    message: format!(
                        "Part size must not exceed {} bytes",
                        MAX_PART_SIZE
                    ),
                },
            ));
        }

        Ok(S3Config {
            region: self.region.unwrap_or(defaults.region),
            credentials_provider: self
                .credentials_provider
                .unwrap_or(defaults.credentials_provider),
            endpoint: self.endpoint,
            path_style: self.path_style.unwrap_or(defaults.path_style),
            use_dual_stack: self.use_dual_stack.unwrap_or(defaults.use_dual_stack),
            use_fips: self.use_fips.unwrap_or(defaults.use_fips),
            connect_timeout: self.connect_timeout.unwrap_or(defaults.connect_timeout),
            read_timeout: self.read_timeout.unwrap_or(defaults.read_timeout),
            operation_timeout: self.operation_timeout.unwrap_or(defaults.operation_timeout),
            max_retries: self.max_retries.unwrap_or(defaults.max_retries),
            initial_backoff: self.initial_backoff.unwrap_or(defaults.initial_backoff),
            max_backoff: self.max_backoff.unwrap_or(defaults.max_backoff),
            backoff_multiplier: self.backoff_multiplier.unwrap_or(defaults.backoff_multiplier),
            circuit_breaker_threshold: self
                .circuit_breaker_threshold
                .unwrap_or(defaults.circuit_breaker_threshold),
            circuit_breaker_reset_timeout: self
                .circuit_breaker_reset_timeout
                .unwrap_or(defaults.circuit_breaker_reset_timeout),
            rate_limit_rps: self.rate_limit_rps.or(defaults.rate_limit_rps),
            rate_limit_burst: self.rate_limit_burst.or(defaults.rate_limit_burst),
            max_connections: self.max_connections.unwrap_or(defaults.max_connections),
            idle_timeout: self.idle_timeout.unwrap_or(defaults.idle_timeout),
            multipart_threshold: self.multipart_threshold.unwrap_or(defaults.multipart_threshold),
            multipart_part_size,
            multipart_concurrency: self
                .multipart_concurrency
                .unwrap_or(defaults.multipart_concurrency),
            verify_ssl: self.verify_ssl.unwrap_or(defaults.verify_ssl),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = S3Config::default();
        assert_eq!(config.region, "us-east-1");
        assert!(config.endpoint.is_none());
        assert!(!config.path_style);
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.multipart_part_size, 8 * 1024 * 1024);
    }

    #[test]
    fn test_builder() {
        let config = S3Config::builder()
            .region("eu-west-1")
            .max_retries(5)
            .path_style(true)
            .build()
            .unwrap();

        assert_eq!(config.region, "eu-west-1");
        assert_eq!(config.max_retries, 5);
        assert!(config.path_style);
    }

    #[test]
    fn test_invalid_part_size() {
        let result = S3Config::builder()
            .multipart_part_size(1024) // Too small
            .build();

        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_endpoint_default() {
        let config = S3Config::default();
        let endpoint = config.resolve_endpoint(Some("my-bucket"));
        assert_eq!(
            endpoint.as_str(),
            "https://my-bucket.s3.us-east-1.amazonaws.com/"
        );
    }

    #[test]
    fn test_resolve_endpoint_path_style() {
        let config = S3Config::builder().path_style(true).build().unwrap();
        let endpoint = config.resolve_endpoint(Some("my-bucket"));
        assert_eq!(endpoint.as_str(), "https://s3.us-east-1.amazonaws.com/");
    }

    #[test]
    fn test_resolve_endpoint_custom() {
        let config = S3Config::builder()
            .endpoint("http://localhost:9000")
            .unwrap()
            .build()
            .unwrap();
        let endpoint = config.resolve_endpoint(Some("my-bucket"));
        assert_eq!(endpoint.as_str(), "http://localhost:9000/");
    }

    #[test]
    fn test_build_path_virtual_hosted() {
        let config = S3Config::default();
        assert_eq!(config.build_path("bucket", Some("key/path")), "/key/path");
        assert_eq!(config.build_path("bucket", None), "/");
    }

    #[test]
    fn test_build_path_path_style() {
        let config = S3Config::builder().path_style(true).build().unwrap();
        assert_eq!(
            config.build_path("bucket", Some("key/path")),
            "/bucket/key/path"
        );
        assert_eq!(config.build_path("bucket", None), "/bucket");
    }
}
