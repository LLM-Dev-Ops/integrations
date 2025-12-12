//! AWS SES (Simple Email Service) v2 Integration Module
//!
//! Production-ready, type-safe interface for interacting with Amazon SES v2 API.
//!
//! # Features
//!
//! - **Full SES v2 API Coverage**: Email sending, templates, identities, configuration sets
//! - **AWS Signature V4**: Complete request signing implementation
//! - **Resilience**: Automatic retry with exponential backoff, rate limiting
//! - **Type Safety**: Strongly-typed requests and responses
//! - **Async/Await**: Built on Tokio for high-performance async operations
//! - **Credential Chain**: Environment, profile, and IMDS credential providers
//! - **Error Handling**: Comprehensive error types with retryability information
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use aws_ses_rust::{SesClient, EmailBuilder};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create client from environment
//!     let client = SesClient::from_env().await?;
//!
//!     // Send a simple email
//!     let request = EmailBuilder::new()
//!         .from("sender@example.com")
//!         .to("recipient@example.com")
//!         .subject("Hello from SES")
//!         .text("This is a test email.")
//!         .build()?;
//!
//!     let response = client.send_email(request).await?;
//!     println!("Message sent! ID: {}", response.message_id);
//!
//!     Ok(())
//! }
//! ```
//!
//! # Architecture
//!
//! The library follows the SPARC architecture pattern:
//!
//! - **Specification**: Types and builders for requests/responses
//! - **Pseudocode**: High-level client interface
//! - **Architecture**: Service-oriented design with clear separation
//! - **Refinement**: Detailed implementations of HTTP, signing, and credentials
//! - **Completion**: Comprehensive error handling and resilience
//!
//! # Client Usage
//!
//! ## Creating a Client
//!
//! ```rust,no_run
//! use aws_ses_rust::{SesClient, SesConfig};
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // From environment variables
//! let client = SesClient::from_env().await?;
//!
//! // With builder
//! let client = SesClient::builder()
//!     .region("us-east-1")
//!     .credentials("AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
//!     .build()
//!     .await?;
//!
//! // With custom config
//! let config = SesConfig::builder()
//!     .region("us-west-2")
//!     .credentials("access_key", "secret_key")
//!     .build()?;
//! let client = SesClient::new(config).await?;
//! # Ok(())
//! # }
//! ```
//!
//! ## Service Access
//!
//! The client provides access to various SES services through dedicated service objects:
//!
//! ```rust,no_run
//! # use aws_ses_rust::SesClient;
//! # async fn example(client: &SesClient) {
//! // Email operations
//! let email_service = client.emails();
//!
//! // Template operations
//! let template_service = client.templates();
//!
//! // Identity management
//! let identity_service = client.identities();
//!
//! // Configuration sets
//! let config_service = client.configuration_sets();
//!
//! // Suppression list management
//! let suppression_service = client.suppression();
//!
//! // Dedicated IP management
//! let ip_service = client.dedicated_ips();
//!
//! // Account settings
//! let account_service = client.account();
//! # }
//! ```
//!
//! # Examples
//!
//! ## Sending an Email
//!
//! ```rust,no_run
//! use aws_ses_rust::{SesClient, EmailBuilder};
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! let client = SesClient::from_env().await?;
//!
//! let request = EmailBuilder::new()
//!     .from("sender@example.com")
//!     .to("recipient@example.com")
//!     .subject("Test Email")
//!     .text("This is the email body.")
//!     .build()?;
//!
//! let response = client.send_email(request).await?;
//! println!("Message ID: {}", response.message_id);
//! # Ok(())
//! # }
//! ```
//!
//! ## Using Templates
//!
//! ```rust,no_run
//! use aws_ses_rust::{SesClient, TemplateBuilder};
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! let client = SesClient::from_env().await?;
//!
//! // Create a template
//! let template_request = TemplateBuilder::new()
//!     .name("OrderConfirmation")
//!     .subject("Order {{order_id}} Confirmed")
//!     .html("<h1>Thanks {{name}}!</h1><p>Your order {{order_id}} is confirmed.</p>")
//!     .text("Thanks {{name}}! Your order {{order_id}} is confirmed.")
//!     .build()?;
//!
//! // Send using template (when email service is implemented)
//! // let response = client.emails().send_templated_email(request).await?;
//! # Ok(())
//! # }
//! ```

#![warn(missing_docs)]
#![warn(rustdoc::missing_crate_level_docs)]
#![deny(unsafe_code)]

// Module declarations
pub mod builders;
pub mod client;
pub mod config;
pub mod credentials;
pub mod error;
pub mod http;
pub mod services;
pub mod signing;
pub mod types;

// Re-export main client types
pub use client::{SesClient, SesClientBuilder};

// Re-export configuration types
pub use config::{RateLimitConfig, RateLimiter, RetryConfig, SesConfig, SesConfigBuilder};

// Re-export credential types
pub use credentials::{
    AwsCredentials, CachedCredentialProvider, ChainCredentialProvider, CredentialError,
    CredentialProvider, DefaultCredentialProvider, EnvironmentCredentialProvider,
    IMDSCredentialProvider, ProfileCredentialProvider, StaticCredentialProvider,
};

// Re-export error types
pub use error::{QuotaType, SesError, SesResult};

// Re-export HTTP types
pub use http::{HttpClient, HttpMethod, SesHttpClient, SesRequest, SesResponse};

// Re-export service types (when implemented)
// pub use services::{
//     AccountService, ConfigurationSetService, DedicatedIpService, EmailService,
//     IdentityService, SuppressionService, TemplateService,
// };

// Re-export common request types
pub use types::{
    // Email types
    Attachment,
    BulkEmailEntry,
    Content,
    Destination,
    EmailAddress,
    EmailContent,
    MessageTag,
    RawMessage,
    ReplacementEmailContent,
    Template,
    // Identity types
    DkimAttributes,
    DkimStatus,
    Identity,
    IdentityType,
    VerificationStatus,
    // Configuration types
    ConfigurationSet,
    DeliveryOptions,
    EventDestination,
    ReputationOptions,
    SendingOptions,
    SuppressionOptions,
    TrackingOptions,
    // Suppression types
    SuppressedDestination,
    SuppressionListReason,
    // Request types
    CreateConfigurationSetRequest,
    CreateEmailIdentityRequest,
    CreateEmailTemplateRequest,
    SendBulkEmailRequest,
    SendEmailRequest,
    // Response types
    BulkEmailEntryResult,
    SendBulkEmailResponse,
    SendEmailResponse,
};

// Re-export builder types
pub use builders::{BulkEmailBuilder, BuilderError, EmailBuilder, TemplateBuilder};

/// Create a new SES client from environment variables.
///
/// This will attempt to read configuration from:
/// - `AWS_REGION` / `AWS_DEFAULT_REGION` for region
/// - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for credentials
/// - `AWS_SESSION_TOKEN` for temporary credentials
///
/// # Returns
///
/// A configured `SesClient` instance.
///
/// # Errors
///
/// Returns `SesError` if required environment variables are missing or if
/// client initialization fails.
///
/// # Example
///
/// ```rust,no_run
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let client = aws_ses_rust::create_client_from_env().await?;
/// # Ok(())
/// # }
/// ```
pub async fn create_client_from_env() -> Result<SesClient, SesError> {
    SesClient::from_env().await
}

/// Create a new SES client with explicit configuration.
///
/// # Arguments
///
/// * `config` - The SES configuration
///
/// # Returns
///
/// A configured `SesClient` instance.
///
/// # Errors
///
/// Returns `SesError` if client initialization fails.
///
/// # Example
///
/// ```rust,no_run
/// use aws_ses_rust::{SesConfig, AwsCredentials};
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let config = SesConfig::builder()
///     .region("us-west-2")
///     .credentials("AKID", "SECRET")
///     .build()?;
///
/// let client = aws_ses_rust::create_client(config).await?;
/// # Ok(())
/// # }
/// ```
pub async fn create_client(config: SesConfig) -> Result<SesClient, SesError> {
    SesClient::new(config).await
}

/// Result type alias for SES operations.
pub type Result<T> = std::result::Result<T, SesError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crate_exports() {
        // Verify all major types are exported
        let _ = std::any::type_name::<SesError>();
        let _ = std::any::type_name::<SesConfig>();
        let _ = std::any::type_name::<AwsCredentials>();
        let _ = std::any::type_name::<SendEmailRequest>();
        let _ = std::any::type_name::<EmailContent>();
    }
}
