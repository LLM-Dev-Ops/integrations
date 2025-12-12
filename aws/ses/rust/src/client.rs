//! SES Client implementation.
//!
//! This module provides the main SES client interface and builder, following
//! the service accessor pattern from the SPARC architecture.
//!
//! # Architecture
//!
//! The `SesClient` struct is the main entry point for all SES operations.
//! It uses lazy initialization for service objects, creating them only when
//! first accessed. This provides:
//!
//! - Memory efficiency (services created only when needed)
//! - Thread safety (Arc for shared ownership)
//! - Clean API (service accessor methods)
//!
//! # Example
//!
//! ```rust,no_run
//! use aws_ses_rust::{SesClient, EmailBuilder};
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Create client
//! let client = SesClient::builder()
//!     .region("us-east-1")
//!     .credentials("AKID", "SECRET")
//!     .build()
//!     .await?;
//!
//! // Send an email
//! let request = EmailBuilder::new()
//!     .from("sender@example.com")
//!     .to("recipient@example.com")
//!     .subject("Hello")
//!     .text("Email body")
//!     .build()?;
//!
//! let response = client.send_email(request).await?;
//! # Ok(())
//! # }
//! ```

use crate::config::{RateLimiter, SesConfig};
use crate::credentials::{CredentialProvider, DefaultCredentialProvider};
use crate::error::{SesError, SesResult};
use crate::http::SesHttpClient;
use crate::types::{SendEmailRequest, SendEmailResponse, SendBulkEmailRequest, SendBulkEmailResponse};
use once_cell::sync::OnceCell;
use std::sync::Arc;

// Import services when they are implemented
// use crate::services::{
//     AccountService, ConfigurationSetService, DedicatedIpService, EmailService,
//     IdentityService, SuppressionService, TemplateService,
// };

/// Main SES client for interacting with AWS SES v2 API.
///
/// The client provides access to various SES services through dedicated
/// service accessor methods. It manages shared resources like HTTP client,
/// configuration, and rate limiters.
///
/// # Thread Safety
///
/// `SesClient` is `Send + Sync` and can be shared across threads using `Arc`.
/// All internal state is protected by appropriate synchronization primitives.
///
/// # Cloning
///
/// The client can be cloned cheaply as it uses `Arc` for shared resources.
/// Clones share the same underlying HTTP client and rate limiter.
///
/// # Example
///
/// ```rust,no_run
/// use aws_ses_rust::SesClient;
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let client = SesClient::from_env().await?;
///
/// // Clone for use in another task
/// let client_clone = client.clone();
/// tokio::spawn(async move {
///     // Use client_clone...
/// });
/// # Ok(())
/// # }
/// ```
#[derive(Clone)]
pub struct SesClient {
    /// Client configuration
    config: Arc<SesConfig>,

    /// HTTP client for making requests
    http_client: Arc<SesHttpClient>,

    /// Optional rate limiter for request throttling
    rate_limiter: Option<Arc<RateLimiter>>,

    // Lazy-initialized services
    // These are created on first access using OnceCell
    // email_service: OnceCell<EmailService>,
    // template_service: OnceCell<TemplateService>,
    // identity_service: OnceCell<IdentityService>,
    // configuration_set_service: OnceCell<ConfigurationSetService>,
    // suppression_service: OnceCell<SuppressionService>,
    // dedicated_ip_service: OnceCell<DedicatedIpService>,
    // account_service: OnceCell<AccountService>,
}

impl SesClient {
    /// Create a new SES client with the given configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - The SES configuration
    ///
    /// # Returns
    ///
    /// A new `SesClient` instance.
    ///
    /// # Errors
    ///
    /// Returns `SesError` if the HTTP client cannot be initialized.
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use aws_ses_rust::{SesClient, SesConfig};
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let config = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .credentials("AKID", "SECRET")
    ///     .build()?;
    ///
    /// let client = SesClient::new(config).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn new(config: SesConfig) -> SesResult<Self> {
        // Create rate limiter if configured
        let rate_limiter = config
            .rate_limit
            .as_ref()
            .map(|rate_config| Arc::new(RateLimiter::new(rate_config.clone())));

        // Create HTTP client
        let http_client = Arc::new(SesHttpClient::new(config.clone()).await?);

        Ok(Self {
            config: Arc::new(config),
            http_client,
            rate_limiter,
            // email_service: OnceCell::new(),
            // template_service: OnceCell::new(),
            // identity_service: OnceCell::new(),
            // configuration_set_service: OnceCell::new(),
            // suppression_service: OnceCell::new(),
            // dedicated_ip_service: OnceCell::new(),
            // account_service: OnceCell::new(),
        })
    }

    /// Create a new SES client from environment variables.
    ///
    /// This method reads configuration from:
    /// - `AWS_REGION` or `AWS_DEFAULT_REGION` for the region
    /// - Uses the default credential chain for authentication
    ///
    /// # Returns
    ///
    /// A new `SesClient` instance configured from environment.
    ///
    /// # Errors
    ///
    /// Returns `SesError` if required environment variables are missing or
    /// if client initialization fails.
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use aws_ses_rust::SesClient;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let client = SesClient::from_env().await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn from_env() -> SesResult<Self> {
        let config = SesConfig::from_env()?;
        Self::new(config).await
    }

    /// Create a new SES client builder.
    ///
    /// # Returns
    ///
    /// A new `SesClientBuilder` instance.
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use aws_ses_rust::SesClient;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let client = SesClient::builder()
    ///     .region("us-east-1")
    ///     .credentials("AKID", "SECRET")
    ///     .build()
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn builder() -> SesClientBuilder {
        SesClientBuilder::default()
    }

    /// Get the client configuration.
    ///
    /// # Returns
    ///
    /// A reference to the client's configuration.
    pub fn config(&self) -> &SesConfig {
        &self.config
    }

    /// Get the HTTP client.
    ///
    /// # Returns
    ///
    /// A reference to the HTTP client.
    pub fn http_client(&self) -> &SesHttpClient {
        &self.http_client
    }

    // Service accessor methods (to be implemented when services are ready)

    // /// Get the email service.
    // ///
    // /// This service provides methods for sending emails, both simple and templated.
    // ///
    // /// # Returns
    // ///
    // /// A reference to the email service.
    // pub fn emails(&self) -> &EmailService {
    //     self.email_service.get_or_init(|| {
    //         EmailService::new(
    //             self.config.clone(),
    //             self.http_client.clone(),
    //         )
    //     })
    // }

    // /// Get the template service.
    // ///
    // /// This service provides methods for managing email templates.
    // ///
    // /// # Returns
    // ///
    // /// A reference to the template service.
    // pub fn templates(&self) -> &TemplateService {
    //     self.template_service.get_or_init(|| {
    //         TemplateService::new(
    //             self.config.clone(),
    //             self.http_client.clone(),
    //         )
    //     })
    // }

    // /// Get the identity service.
    // ///
    // /// This service provides methods for managing email identities (domains and addresses).
    // ///
    // /// # Returns
    // ///
    // /// A reference to the identity service.
    // pub fn identities(&self) -> &IdentityService {
    //     self.identity_service.get_or_init(|| {
    //         IdentityService::new(
    //             self.config.clone(),
    //             self.http_client.clone(),
    //         )
    //     })
    // }

    // /// Get the configuration set service.
    // ///
    // /// This service provides methods for managing configuration sets.
    // ///
    // /// # Returns
    // ///
    // /// A reference to the configuration set service.
    // pub fn configuration_sets(&self) -> &ConfigurationSetService {
    //     self.configuration_set_service.get_or_init(|| {
    //         ConfigurationSetService::new(
    //             self.config.clone(),
    //             self.http_client.clone(),
    //         )
    //     })
    // }

    // /// Get the suppression service.
    // ///
    // /// This service provides methods for managing the account suppression list.
    // ///
    // /// # Returns
    // ///
    // /// A reference to the suppression service.
    // pub fn suppression(&self) -> &SuppressionService {
    //     self.suppression_service.get_or_init(|| {
    //         SuppressionService::new(
    //             self.config.clone(),
    //             self.http_client.clone(),
    //         )
    //     })
    // }

    // /// Get the dedicated IP service.
    // ///
    // /// This service provides methods for managing dedicated IP addresses.
    // ///
    // /// # Returns
    // ///
    // /// A reference to the dedicated IP service.
    // pub fn dedicated_ips(&self) -> &DedicatedIpService {
    //     self.dedicated_ip_service.get_or_init(|| {
    //         DedicatedIpService::new(
    //             self.config.clone(),
    //             self.http_client.clone(),
    //         )
    //     })
    // }

    // /// Get the account service.
    // ///
    // /// This service provides methods for managing account-level settings.
    // ///
    // /// # Returns
    // ///
    // /// A reference to the account service.
    // pub fn account(&self) -> &AccountService {
    //     self.account_service.get_or_init(|| {
    //         AccountService::new(
    //             self.config.clone(),
    //             self.http_client.clone(),
    //         )
    //     })
    // }

    // Convenience methods that delegate to services

    /// Send an email.
    ///
    /// This is a convenience method that delegates to the email service.
    ///
    /// # Arguments
    ///
    /// * `request` - The email request
    ///
    /// # Returns
    ///
    /// The email response containing the message ID.
    ///
    /// # Errors
    ///
    /// Returns `SesError` if the email cannot be sent.
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use aws_ses_rust::{SesClient, EmailBuilder};
    ///
    /// # async fn example(client: &SesClient) -> Result<(), Box<dyn std::error::Error>> {
    /// let request = EmailBuilder::new()
    ///     .from("sender@example.com")
    ///     .to("recipient@example.com")
    ///     .subject("Test Email")
    ///     .text("Email body text")
    ///     .build()?;
    ///
    /// let response = client.send_email(request).await?;
    /// println!("Message ID: {}", response.message_id);
    /// # Ok(())
    /// # }
    /// ```
    pub async fn send_email(&self, request: SendEmailRequest) -> SesResult<SendEmailResponse> {
        // This will delegate to self.emails().send_email(request).await
        // For now, return a placeholder error
        Err(SesError::Unknown {
            message: "Email service not yet implemented".to_string(),
        })
    }

    /// Send a bulk email.
    ///
    /// This is a convenience method that delegates to the email service.
    ///
    /// # Arguments
    ///
    /// * `request` - The bulk email request
    ///
    /// # Returns
    ///
    /// The bulk email response containing status for each message.
    ///
    /// # Errors
    ///
    /// Returns `SesError` if the bulk email cannot be sent.
    pub async fn send_bulk_email(
        &self,
        request: SendBulkEmailRequest,
    ) -> SesResult<SendBulkEmailResponse> {
        // This will delegate to self.emails().send_bulk_email(request).await
        // For now, return a placeholder error
        Err(SesError::Unknown {
            message: "Email service not yet implemented".to_string(),
        })
    }
}

impl std::fmt::Debug for SesClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SesClient")
            .field("config", &self.config)
            .field("has_rate_limiter", &self.rate_limiter.is_some())
            .finish_non_exhaustive()
    }
}

/// Builder for creating SES clients.
///
/// The builder provides a fluent interface for configuring the SES client
/// before creating it.
///
/// # Example
///
/// ```rust,no_run
/// use aws_ses_rust::SesClient;
/// use std::time::Duration;
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let client = SesClient::builder()
///     .region("us-east-1")
///     .credentials("AKID", "SECRET")
///     .timeout(Duration::from_secs(60))
///     .max_retries(5)
///     .build()
///     .await?;
/// # Ok(())
/// # }
/// ```
#[derive(Default)]
pub struct SesClientBuilder {
    config: Option<SesConfig>,
    from_env: bool,
}

impl SesClientBuilder {
    /// Create a new builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Use the provided configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - The SES configuration to use
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use aws_ses_rust::{SesClient, SesConfig};
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let config = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .credentials("AKID", "SECRET")
    ///     .build()?;
    ///
    /// let client = SesClient::builder()
    ///     .config(config)
    ///     .build()
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn config(mut self, config: SesConfig) -> Self {
        self.config = Some(config);
        self
    }

    /// Load configuration from environment variables.
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use aws_ses_rust::SesClient;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let client = SesClient::builder()
    ///     .from_env()
    ///     .build()
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn from_env(mut self) -> Self {
        self.from_env = true;
        self
    }

    /// Set the AWS region.
    ///
    /// # Arguments
    ///
    /// * `region` - The AWS region (e.g., "us-east-1")
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use aws_ses_rust::SesClient;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let client = SesClient::builder()
    ///     .region("us-west-2")
    ///     .credentials("AKID", "SECRET")
    ///     .build()
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn region(mut self, region: impl Into<String>) -> Self {
        let config = self.config.take().unwrap_or_else(|| {
            SesConfig::builder()
                .region("")
                .credentials("", "")
                .build()
                .unwrap()
        });

        self.config = Some(SesConfig {
            region: region.into(),
            ..config
        });
        self
    }

    /// Set static credentials.
    ///
    /// # Arguments
    ///
    /// * `access_key` - AWS access key ID
    /// * `secret_key` - AWS secret access key
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use aws_ses_rust::SesClient;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let client = SesClient::builder()
    ///     .region("us-east-1")
    ///     .credentials("AKID", "SECRET")
    ///     .build()
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn credentials(self, access_key: &str, secret_key: &str) -> Self {
        // This will need to be implemented properly with SesConfig builder
        // For now, just return self
        self
    }

    /// Set the request timeout.
    ///
    /// # Arguments
    ///
    /// * `duration` - The timeout duration
    pub fn timeout(self, duration: std::time::Duration) -> Self {
        // This will need to be implemented with SesConfig builder
        self
    }

    /// Set the maximum number of retry attempts.
    ///
    /// # Arguments
    ///
    /// * `retries` - Maximum number of retries
    pub fn max_retries(self, retries: u32) -> Self {
        // This will need to be implemented with SesConfig builder
        self
    }

    /// Build the SES client.
    ///
    /// # Returns
    ///
    /// A new `SesClient` instance.
    ///
    /// # Errors
    ///
    /// Returns `SesError` if the client cannot be created due to missing
    /// configuration or initialization failure.
    pub async fn build(self) -> SesResult<SesClient> {
        let config = if let Some(config) = self.config {
            config
        } else if self.from_env {
            SesConfig::from_env()?
        } else {
            return Err(SesError::Configuration {
                message: "No configuration provided. Use config(), from_env(), or region() with credentials()".to_string(),
                source: None,
            });
        };

        SesClient::new(config).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_client_debug() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("AKID", "SECRET")
            .build()
            .unwrap();

        let client = SesClient::new(config).await.unwrap();
        let debug = format!("{:?}", client);
        assert!(debug.contains("SesClient"));
    }

    #[test]
    fn test_builder_new() {
        let _builder = SesClientBuilder::new();
        let _builder = SesClient::builder();
    }
}
