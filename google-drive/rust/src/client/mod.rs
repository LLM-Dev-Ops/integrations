//! Google Drive API client implementation.

use crate::auth::AuthProvider;
use crate::config::GoogleDriveConfig;
use crate::errors::{GoogleDriveError, GoogleDriveResult};
use crate::services::*;
use crate::transport::{HttpTransport, ReqwestTransport};
use std::sync::Arc;

mod executor;
pub use executor::RequestExecutor;

/// Google Drive API client.
///
/// This is the main entry point for interacting with the Google Drive API.
/// It provides access to all service modules and handles authentication,
/// transport, and resilience patterns.
pub struct GoogleDriveClient {
    /// Configuration.
    config: GoogleDriveConfig,
    /// HTTP transport.
    transport: Arc<dyn HttpTransport>,
    /// Authentication provider.
    auth: Arc<dyn AuthProvider>,
    /// Request executor (handles resilience, auth, etc).
    executor: Arc<RequestExecutor>,
}

impl GoogleDriveClient {
    /// Creates a new Google Drive client with the given configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - Configuration for the client
    ///
    /// # Returns
    ///
    /// A new client instance or an error if configuration is invalid
    ///
    /// # Example
    ///
    /// ```no_run
    /// use google_drive_rust::{GoogleDriveClient, GoogleDriveConfig, OAuth2Provider};
    /// use secrecy::SecretString;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let auth = OAuth2Provider::new_with_strings(
    ///     "client_id",
    ///     "client_secret",
    ///     "refresh_token"
    /// );
    ///
    /// let config = GoogleDriveConfig::builder()
    ///     .auth_provider(auth)
    ///     .build()?;
    ///
    /// let client = GoogleDriveClient::new(config)?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn new(config: GoogleDriveConfig) -> GoogleDriveResult<Self> {
        // Validate configuration
        config.validate()?;

        // Create transport
        let transport = Arc::new(
            ReqwestTransport::default()
                .map_err(|e| GoogleDriveError::configuration(format!("Failed to create transport: {}", e)))?
        );

        // Get auth provider
        let auth = config.auth_provider.clone();

        // Create request executor
        let executor = Arc::new(RequestExecutor::new(
            config.clone(),
            transport.clone(),
            auth.clone(),
        ));

        Ok(Self {
            config,
            transport,
            auth,
            executor,
        })
    }

    /// Creates a new client builder.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use google_drive_rust::{GoogleDriveClient, OAuth2Provider};
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let auth = OAuth2Provider::new_with_strings(
    ///     "client_id",
    ///     "client_secret",
    ///     "refresh_token"
    /// );
    ///
    /// let client = GoogleDriveClient::builder()
    ///     .auth_provider(auth)
    ///     .timeout(std::time::Duration::from_secs(60))
    ///     .build()?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn builder() -> GoogleDriveClientBuilder {
        GoogleDriveClientBuilder::new()
    }

    // Service accessors

    /// Access the files service for file operations.
    ///
    /// # Returns
    ///
    /// A `FilesService` instance for managing files
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use google_drive_rust::GoogleDriveClient;
    /// # async fn example(client: GoogleDriveClient) -> Result<(), Box<dyn std::error::Error>> {
    /// let files = client.files();
    /// let file_list = files.list(None).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn files(&self) -> FilesService {
        FilesService::new(self.executor.clone())
    }

    /// Access the permissions service for managing file permissions.
    pub fn permissions(&self) -> PermissionsService {
        PermissionsService::new(self.executor.clone())
    }

    /// Access the comments service for managing file comments.
    pub fn comments(&self) -> CommentsService {
        CommentsService::new(self.executor.clone())
    }

    /// Access the replies service for managing comment replies.
    pub fn replies(&self) -> RepliesService {
        RepliesService::new(self.executor.clone())
    }

    /// Access the revisions service for managing file revisions.
    pub fn revisions(&self) -> RevisionsService {
        RevisionsService::new(self.executor.clone())
    }

    /// Access the changes service for tracking file changes.
    pub fn changes(&self) -> ChangesService {
        ChangesService::new(self.executor.clone())
    }

    /// Access the drives service for managing shared drives.
    pub fn drives(&self) -> DrivesService {
        DrivesService::new(self.executor.clone())
    }

    /// Access the about service for storage quota and user info.
    pub fn about(&self) -> AboutService {
        AboutService::new(self.executor.clone())
    }

    /// Gets the base URL for the API.
    pub fn base_url(&self) -> &str {
        self.config.base_url.as_str()
    }

    /// Gets the upload URL for the API.
    pub fn upload_url(&self) -> &str {
        self.config.upload_url.as_str()
    }

    /// Gets the configuration.
    pub fn config(&self) -> &GoogleDriveConfig {
        &self.config
    }

    /// Gets the request executor (for advanced use cases).
    pub fn executor(&self) -> &Arc<RequestExecutor> {
        &self.executor
    }
}

/// Builder for GoogleDriveClient.
///
/// Provides a fluent API for constructing a client with custom configuration.
pub struct GoogleDriveClientBuilder {
    config_builder: crate::config::GoogleDriveConfigBuilder,
}

impl GoogleDriveClientBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self {
            config_builder: GoogleDriveConfig::builder(),
        }
    }

    /// Sets the authentication provider.
    pub fn auth_provider<A: AuthProvider + 'static>(mut self, provider: A) -> Self {
        self.config_builder = self.config_builder.auth_provider(provider);
        self
    }

    /// Sets the authentication provider from an Arc.
    pub fn auth_provider_arc(mut self, provider: Arc<dyn AuthProvider>) -> Self {
        self.config_builder = self.config_builder.auth_provider_arc(provider);
        self
    }

    /// Sets the base URL.
    pub fn base_url(mut self, url: impl AsRef<str>) -> Self {
        self.config_builder = self.config_builder.base_url(url);
        self
    }

    /// Sets the upload URL.
    pub fn upload_url(mut self, url: impl AsRef<str>) -> Self {
        self.config_builder = self.config_builder.upload_url(url);
        self
    }

    /// Sets the timeout.
    pub fn timeout(mut self, timeout: std::time::Duration) -> Self {
        self.config_builder = self.config_builder.timeout(timeout);
        self
    }

    /// Sets the connection timeout.
    pub fn connect_timeout(mut self, timeout: std::time::Duration) -> Self {
        self.config_builder = self.config_builder.connect_timeout(timeout);
        self
    }

    /// Sets the maximum number of retries.
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.config_builder = self.config_builder.max_retries(retries);
        self
    }

    /// Sets the user agent.
    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.config_builder = self.config_builder.user_agent(ua);
        self
    }

    /// Sets the upload chunk size.
    pub fn upload_chunk_size(mut self, size: usize) -> Self {
        self.config_builder = self.config_builder.upload_chunk_size(size);
        self
    }

    /// Sets the default fields to include in responses.
    pub fn default_fields(mut self, fields: impl Into<String>) -> Self {
        self.config_builder = self.config_builder.default_fields(fields);
        self
    }

    /// Builds the client.
    pub fn build(self) -> GoogleDriveResult<GoogleDriveClient> {
        let config = self.config_builder.build()?;
        GoogleDriveClient::new(config)
    }
}

impl Default for GoogleDriveClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::OAuth2Provider;

    #[test]
    fn test_client_builder() {
        let auth = OAuth2Provider::new_with_strings(
            "client_id",
            "client_secret",
            "refresh_token"
        );

        let result = GoogleDriveClient::builder()
            .auth_provider(auth)
            .timeout(std::time::Duration::from_secs(60))
            .build();

        assert!(result.is_ok());
    }
}
