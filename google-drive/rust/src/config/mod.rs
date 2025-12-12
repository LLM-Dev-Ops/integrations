//! Configuration for Google Drive client.

use crate::auth::AuthProvider;
use crate::errors::{ConfigurationError, GoogleDriveError, GoogleDriveResult};
use std::sync::Arc;
use std::time::Duration;
use url::Url;

/// OAuth 2.0 scopes for Google Drive.
pub mod scopes {
    /// Full access to Drive files.
    pub const DRIVE: &str = "https://www.googleapis.com/auth/drive";

    /// Read-only access to file metadata and content.
    pub const DRIVE_READONLY: &str = "https://www.googleapis.com/auth/drive.readonly";

    /// Access to files created by the app.
    pub const DRIVE_FILE: &str = "https://www.googleapis.com/auth/drive.file";

    /// Access to app data folder.
    pub const DRIVE_APPDATA: &str = "https://www.googleapis.com/auth/drive.appdata";

    /// Read-only access to file metadata (no content).
    pub const DRIVE_METADATA_READONLY: &str =
        "https://www.googleapis.com/auth/drive.metadata.readonly";

    /// Access to file metadata (read/write).
    pub const DRIVE_METADATA: &str = "https://www.googleapis.com/auth/drive.metadata";

    /// Access to Google Photos.
    pub const DRIVE_PHOTOS_READONLY: &str = "https://www.googleapis.com/auth/drive.photos.readonly";
}

/// Configuration for the Google Drive client.
#[derive(Clone)]
pub struct GoogleDriveConfig {
    /// Authentication provider.
    pub auth_provider: Arc<dyn AuthProvider>,

    /// Base URL for the API.
    pub base_url: Url,

    /// Upload URL for the API.
    pub upload_url: Url,

    /// Default timeout for requests.
    pub timeout: Duration,

    /// Maximum retries for transient failures.
    pub max_retries: u32,

    /// Chunk size for resumable uploads (must be multiple of 256KB).
    pub upload_chunk_size: usize,

    /// User agent string.
    pub user_agent: String,

    /// Fields to always include in responses.
    pub default_fields: Option<String>,

    /// Connection timeout.
    pub connect_timeout: Duration,

    /// Pool configuration.
    pub pool: PoolConfig,
}

/// Connection pool configuration.
#[derive(Clone, Debug)]
pub struct PoolConfig {
    /// Maximum idle connections per host.
    pub max_idle_per_host: usize,

    /// Idle timeout.
    pub idle_timeout: Option<Duration>,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_idle_per_host: 10,
            idle_timeout: Some(Duration::from_secs(90)),
        }
    }
}

impl GoogleDriveConfig {
    /// Creates a new configuration builder.
    pub fn builder() -> GoogleDriveConfigBuilder {
        GoogleDriveConfigBuilder::new()
    }

    /// Validates the configuration.
    pub fn validate(&self) -> GoogleDriveResult<()> {
        // Validate upload chunk size (must be multiple of 256KB)
        if self.upload_chunk_size % (256 * 1024) != 0 {
            return Err(GoogleDriveError::Configuration(
                ConfigurationError::InvalidConfiguration(
                    "Upload chunk size must be a multiple of 256KB".to_string(),
                ),
            ));
        }

        // Validate URLs
        if self.base_url.scheme() != "https" {
            return Err(GoogleDriveError::Configuration(
                ConfigurationError::InvalidConfiguration(
                    "Base URL must use HTTPS".to_string(),
                ),
            ));
        }

        if self.upload_url.scheme() != "https" {
            return Err(GoogleDriveError::Configuration(
                ConfigurationError::InvalidConfiguration(
                    "Upload URL must use HTTPS".to_string(),
                ),
            ));
        }

        Ok(())
    }
}

/// Builder for GoogleDriveConfig.
pub struct GoogleDriveConfigBuilder {
    auth_provider: Option<Arc<dyn AuthProvider>>,
    base_url: Option<Url>,
    upload_url: Option<Url>,
    timeout: Duration,
    connect_timeout: Duration,
    max_retries: u32,
    upload_chunk_size: usize,
    user_agent: Option<String>,
    default_fields: Option<String>,
    pool: PoolConfig,
}

impl GoogleDriveConfigBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self {
            auth_provider: None,
            base_url: None,
            upload_url: None,
            timeout: Duration::from_secs(300),
            connect_timeout: Duration::from_secs(30),
            max_retries: 3,
            upload_chunk_size: 8 * 1024 * 1024, // 8MB
            user_agent: None,
            default_fields: None,
            pool: PoolConfig::default(),
        }
    }

    /// Sets the authentication provider.
    pub fn auth_provider<A: AuthProvider + 'static>(mut self, provider: A) -> Self {
        self.auth_provider = Some(Arc::new(provider));
        self
    }

    /// Sets the authentication provider from an Arc.
    pub fn auth_provider_arc(mut self, provider: Arc<dyn AuthProvider>) -> Self {
        self.auth_provider = Some(provider);
        self
    }

    /// Sets the base URL.
    pub fn base_url(mut self, url: impl AsRef<str>) -> Self {
        self.base_url = Some(Url::parse(url.as_ref()).expect("Invalid base URL"));
        self
    }

    /// Sets the upload URL.
    pub fn upload_url(mut self, url: impl AsRef<str>) -> Self {
        self.upload_url = Some(Url::parse(url.as_ref()).expect("Invalid upload URL"));
        self
    }

    /// Sets the request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Sets the connection timeout.
    pub fn connect_timeout(mut self, timeout: Duration) -> Self {
        self.connect_timeout = timeout;
        self
    }

    /// Sets the maximum number of retries.
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.max_retries = retries;
        self
    }

    /// Sets the upload chunk size (must be multiple of 256KB).
    pub fn upload_chunk_size(mut self, size: usize) -> Self {
        self.upload_chunk_size = size;
        self
    }

    /// Sets the user agent string.
    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.user_agent = Some(ua.into());
        self
    }

    /// Sets the default fields to include in responses.
    pub fn default_fields(mut self, fields: impl Into<String>) -> Self {
        self.default_fields = Some(fields.into());
        self
    }

    /// Sets the pool configuration.
    pub fn pool(mut self, pool: PoolConfig) -> Self {
        self.pool = pool;
        self
    }

    /// Builds the configuration.
    pub fn build(self) -> GoogleDriveResult<GoogleDriveConfig> {
        let auth_provider = self.auth_provider.ok_or_else(|| {
            GoogleDriveError::Configuration(ConfigurationError::MissingCredentials(
                "Authentication provider is required".to_string(),
            ))
        })?;

        let base_url = self.base_url.unwrap_or_else(|| {
            Url::parse("https://www.googleapis.com/drive/v3").expect("Invalid default base URL")
        });

        let upload_url = self.upload_url.unwrap_or_else(|| {
            Url::parse("https://www.googleapis.com/upload/drive/v3")
                .expect("Invalid default upload URL")
        });

        let user_agent = self
            .user_agent
            .unwrap_or_else(|| format!("integrations-google-drive/{}", env!("CARGO_PKG_VERSION")));

        let config = GoogleDriveConfig {
            auth_provider,
            base_url,
            upload_url,
            timeout: self.timeout,
            connect_timeout: self.connect_timeout,
            max_retries: self.max_retries,
            upload_chunk_size: self.upload_chunk_size,
            user_agent,
            default_fields: self.default_fields,
            pool: self.pool,
        };

        config.validate()?;

        Ok(config)
    }
}

impl Default for GoogleDriveConfigBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockAuthProvider;

    #[async_trait::async_trait]
    impl AuthProvider for MockAuthProvider {
        async fn get_access_token(
            &self,
        ) -> Result<crate::auth::AccessToken, crate::errors::AuthenticationError> {
            unimplemented!()
        }

        async fn refresh_token(
            &self,
        ) -> Result<crate::auth::AccessToken, crate::errors::AuthenticationError> {
            unimplemented!()
        }

        fn is_expired(&self) -> bool {
            false
        }
    }

    #[test]
    fn test_default_config() {
        let config = GoogleDriveConfig::builder()
            .auth_provider(MockAuthProvider)
            .build()
            .unwrap();

        assert_eq!(config.base_url.as_str(), "https://www.googleapis.com/drive/v3");
        assert_eq!(
            config.upload_url.as_str(),
            "https://www.googleapis.com/upload/drive/v3"
        );
        assert_eq!(config.timeout, Duration::from_secs(300));
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.upload_chunk_size, 8 * 1024 * 1024);
    }

    #[test]
    fn test_custom_config() {
        let config = GoogleDriveConfig::builder()
            .auth_provider(MockAuthProvider)
            .timeout(Duration::from_secs(60))
            .max_retries(5)
            .upload_chunk_size(16 * 1024 * 1024)
            .user_agent("test-agent/1.0")
            .build()
            .unwrap();

        assert_eq!(config.timeout, Duration::from_secs(60));
        assert_eq!(config.max_retries, 5);
        assert_eq!(config.upload_chunk_size, 16 * 1024 * 1024);
        assert_eq!(config.user_agent, "test-agent/1.0");
    }

    #[test]
    fn test_invalid_chunk_size() {
        let result = GoogleDriveConfig::builder()
            .auth_provider(MockAuthProvider)
            .upload_chunk_size(1024 * 1024) // 1MB, not multiple of 256KB
            .build();

        assert!(result.is_err());
    }

    #[test]
    fn test_missing_auth_provider() {
        let result = GoogleDriveConfig::builder().build();
        assert!(result.is_err());
    }
}
