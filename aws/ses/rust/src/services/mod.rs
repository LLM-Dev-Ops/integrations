//! Services module for AWS SES v2 operations.
//!
//! This module implements service adapters following hexagonal architecture principles.
//! Services are organized by domain operations and interact with the HTTP client
//! to execute AWS SES v2 API calls.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────┐
//! │                  Domain Layer                            │
//! │  (Business Logic & Use Cases)                           │
//! └──────────────────────┬──────────────────────────────────┘
//!                        │
//!                        ▼
//! ┌─────────────────────────────────────────────────────────┐
//! │              Service Adapters (this module)             │
//! │  - emails: Email sending operations                     │
//! │  - templates: Template management                        │
//! │  - identities: Identity verification & management       │
//! │  - configuration_sets: Configuration management         │
//! │  - suppression: Suppression list management             │
//! │  - dedicated_ips: Dedicated IP operations               │
//! │  - account: Account-level operations                    │
//! └──────────────────────┬──────────────────────────────────┘
//!                        │
//!                        ▼
//! ┌─────────────────────────────────────────────────────────┐
//! │                   HTTP Client                            │
//! │  (Request signing, retry logic, rate limiting)          │
//! └─────────────────────────────────────────────────────────┘
//! ```
//!
//! # Service Modules
//!
//! - **emails**: Send emails, bulk emails, and raw messages
//! - **templates**: Create, update, delete, and test email templates
//! - **identities**: Manage email addresses and domains for sending
//! - **configuration_sets**: Configure email sending behavior
//! - **suppression**: Manage bounced/complained email addresses
//! - **dedicated_ips**: Manage dedicated IP addresses
//! - **account**: Query and update account-level settings
//!
//! # Examples
//!
//! ```rust,no_run
//! use integrations_aws_ses::services::emails::EmailService;
//! use integrations_aws_ses::http::SesHttpClient;
//! use integrations_aws_ses::config::SesConfig;
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! let config = SesConfig::builder()
//!     .region("us-east-1")
//!     .credentials("access_key", "secret_key")
//!     .build()?;
//!
//! let http_client = SesHttpClient::new(config).await?;
//! let email_service = EmailService::new(http_client);
//!
//! // Use the email service to send emails
//! # Ok(())
//! # }
//! ```

pub mod account;
pub mod configuration_sets;
pub mod dedicated_ips;
pub mod emails;
pub mod identities;
pub mod suppression;
pub mod templates;

pub use account::AccountService;
pub use configuration_sets::ConfigurationSetService;
pub use dedicated_ips::DedicatedIpService;
pub use emails::EmailService;
pub use identities::IdentityService;
pub use suppression::SuppressionService;
pub use templates::TemplateService;

use std::sync::Arc;
use crate::http::HttpClient;
use crate::error::SesResult;

/// Common trait for all SES services.
///
/// This trait provides the foundation for service implementations,
/// allowing them to share HTTP client access while maintaining
/// separation of concerns.
pub trait SesService: Send + Sync {
    /// Get a reference to the HTTP client.
    fn http_client(&self) -> &Arc<dyn HttpClient>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_module_exports() {
        // Verify all service types are accessible
        let _: Option<EmailService> = None;
        let _: Option<TemplateService> = None;
        let _: Option<IdentityService> = None;
        let _: Option<ConfigurationSetService> = None;
        let _: Option<SuppressionService> = None;
        let _: Option<DedicatedIpService> = None;
        let _: Option<AccountService> = None;
    }
}
