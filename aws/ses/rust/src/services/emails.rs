//! Email sending operations for SES v2.
//!
//! This module provides methods for sending emails using the AWS SES v2 API,
//! including single emails, bulk emails, and raw MIME messages.

use std::sync::Arc;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};

use crate::error::{SesError, SesResult};
use crate::http::{HttpClient, SesRequest, HttpMethod};
use crate::types::{
    Destination, EmailContent, RawMessage, BulkEmailEntry, MessageTag,
    EmailAddress,
};
use super::SesService;

/// Service for email sending operations.
///
/// This service provides methods for:
/// - Sending single emails with the SendEmail API
/// - Sending bulk emails with the SendBulkEmail API
/// - Sending raw MIME messages with the SendEmail API using RawMessage
///
/// # Examples
///
/// ```rust,no_run
/// use integrations_aws_ses::services::emails::EmailService;
/// use integrations_aws_ses::types::{EmailContent, Destination};
/// # use integrations_aws_ses::http::SesHttpClient;
/// # use integrations_aws_ses::config::SesConfig;
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// # let config = SesConfig::builder()
/// #     .region("us-east-1")
/// #     .credentials("key", "secret")
/// #     .build()?;
/// # let http_client = SesHttpClient::new(config).await?;
/// let service = EmailService::new(http_client);
///
/// let content = EmailContent::new("Test Subject")
///     .with_text("Hello, World!")
///     .with_html("<p>Hello, World!</p>");
///
/// let destination = Destination::new()
///     .add_to("recipient@example.com");
///
/// let response = service.send_email(
///     Some("sender@example.com"),
///     destination,
///     content,
///     None,
///     None,
/// ).await?;
///
/// println!("Message ID: {}", response.message_id);
/// # Ok(())
/// # }
/// ```
pub struct EmailService {
    http_client: Arc<dyn HttpClient>,
}

impl EmailService {
    /// Create a new email service.
    ///
    /// # Arguments
    ///
    /// * `http_client` - HTTP client for making API requests
    pub fn new(http_client: impl HttpClient + 'static) -> Self {
        Self {
            http_client: Arc::new(http_client),
        }
    }

    /// Send an email using the SES v2 API.
    ///
    /// # Arguments
    ///
    /// * `from_email_address` - Optional sender email address
    /// * `destination` - Email recipients (To, CC, BCC)
    /// * `content` - Email content (subject and body)
    /// * `configuration_set_name` - Optional configuration set
    /// * `email_tags` - Optional message tags for categorization
    ///
    /// # Returns
    ///
    /// A `SendEmailResponse` containing the message ID
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The sender email is not verified
    /// - The request is throttled
    /// - The request fails validation
    /// - A network error occurs
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// # use integrations_aws_ses::services::emails::EmailService;
    /// # use integrations_aws_ses::types::{EmailContent, Destination};
    /// # use integrations_aws_ses::http::SesHttpClient;
    /// # use integrations_aws_ses::config::SesConfig;
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// # let config = SesConfig::builder().region("us-east-1").credentials("k", "s").build()?;
    /// # let client = SesHttpClient::new(config).await?;
    /// # let service = EmailService::new(client);
    /// let content = EmailContent::new("Subject").with_text("Body");
    /// let dest = Destination::new().add_to("user@example.com");
    ///
    /// let response = service.send_email(
    ///     Some("sender@example.com"),
    ///     dest,
    ///     content,
    ///     None,
    ///     None,
    /// ).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn send_email(
        &self,
        from_email_address: Option<&str>,
        destination: Destination,
        content: EmailContent,
        configuration_set_name: Option<&str>,
        email_tags: Option<Vec<MessageTag>>,
    ) -> SesResult<SendEmailResponse> {
        let request = SendEmailRequest {
            from_email_address: from_email_address.map(|s| s.to_string()),
            destination,
            content,
            configuration_set_name: configuration_set_name.map(|s| s.to_string()),
            email_tags,
            feedback_forwarding_email_address: None,
            reply_to_addresses: None,
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize SendEmail request: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Post, "/v2/email/outbound-emails")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize SendEmail response: {}", e),
            })
    }

    /// Send a bulk email to multiple recipients.
    ///
    /// Bulk email allows you to send the same email to multiple recipients
    /// with personalization using template data for each recipient.
    ///
    /// # Arguments
    ///
    /// * `from_email_address` - Optional sender email address
    /// * `bulk_email_entries` - List of recipients with optional template data
    /// * `default_content` - Default email content for all recipients
    /// * `configuration_set_name` - Optional configuration set
    /// * `default_email_tags` - Optional default tags for all messages
    ///
    /// # Returns
    ///
    /// A `SendBulkEmailResponse` containing status for each recipient
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The request is malformed
    /// - The sender email is not verified
    /// - The request is throttled
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// # use integrations_aws_ses::services::emails::EmailService;
    /// # use integrations_aws_ses::types::{EmailContent, Destination, BulkEmailEntry};
    /// # use integrations_aws_ses::http::SesHttpClient;
    /// # use integrations_aws_ses::config::SesConfig;
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// # let config = SesConfig::builder().region("us-east-1").credentials("k", "s").build()?;
    /// # let client = SesHttpClient::new(config).await?;
    /// # let service = EmailService::new(client);
    /// let content = EmailContent::new("Subject").with_text("Hello");
    /// let entries = vec![
    ///     BulkEmailEntry::new(Destination::new().add_to("user1@example.com")),
    ///     BulkEmailEntry::new(Destination::new().add_to("user2@example.com")),
    /// ];
    ///
    /// let response = service.send_bulk_email(
    ///     Some("sender@example.com"),
    ///     entries,
    ///     content,
    ///     None,
    ///     None,
    /// ).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn send_bulk_email(
        &self,
        from_email_address: Option<&str>,
        bulk_email_entries: Vec<BulkEmailEntry>,
        default_content: EmailContent,
        configuration_set_name: Option<&str>,
        default_email_tags: Option<Vec<MessageTag>>,
    ) -> SesResult<SendBulkEmailResponse> {
        let request = SendBulkEmailRequest {
            from_email_address: from_email_address.map(|s| s.to_string()),
            bulk_email_entries,
            default_content,
            configuration_set_name: configuration_set_name.map(|s| s.to_string()),
            default_email_tags,
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize SendBulkEmail request: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Post, "/v2/email/outbound-bulk-emails")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize SendBulkEmail response: {}", e),
            })
    }

    /// Send a raw email message.
    ///
    /// This allows you to send a raw MIME message, giving you full control
    /// over the email format, headers, and structure.
    ///
    /// # Arguments
    ///
    /// * `from_email_address` - Optional sender email address
    /// * `raw_message` - Raw MIME message data
    /// * `configuration_set_name` - Optional configuration set
    ///
    /// # Returns
    ///
    /// A `SendEmailResponse` containing the message ID
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The raw message is malformed
    /// - The sender email is not verified
    /// - The request is throttled
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// # use integrations_aws_ses::services::emails::EmailService;
    /// # use integrations_aws_ses::types::RawMessage;
    /// # use integrations_aws_ses::http::SesHttpClient;
    /// # use integrations_aws_ses::config::SesConfig;
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// # let config = SesConfig::builder().region("us-east-1").credentials("k", "s").build()?;
    /// # let client = SesHttpClient::new(config).await?;
    /// # let service = EmailService::new(client);
    /// let mime = "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody";
    /// let raw_message = RawMessage::from_mime(mime);
    ///
    /// let response = service.send_raw_email(
    ///     Some("sender@example.com"),
    ///     raw_message,
    ///     None,
    /// ).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn send_raw_email(
        &self,
        from_email_address: Option<&str>,
        raw_message: RawMessage,
        configuration_set_name: Option<&str>,
    ) -> SesResult<SendEmailResponse> {
        let request = SendRawEmailRequest {
            from_email_address: from_email_address.map(|s| s.to_string()),
            raw_message,
            configuration_set_name: configuration_set_name.map(|s| s.to_string()),
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize SendRawEmail request: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Post, "/v2/email/outbound-emails")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize SendRawEmail response: {}", e),
            })
    }
}

impl SesService for EmailService {
    fn http_client(&self) -> &Arc<dyn HttpClient> {
        &self.http_client
    }
}

// Request types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SendEmailRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    from_email_address: Option<String>,
    destination: Destination,
    content: EmailContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    configuration_set_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    email_tags: Option<Vec<MessageTag>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    feedback_forwarding_email_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reply_to_addresses: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SendBulkEmailRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    from_email_address: Option<String>,
    bulk_email_entries: Vec<BulkEmailEntry>,
    default_content: EmailContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    configuration_set_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_email_tags: Option<Vec<MessageTag>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SendRawEmailRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    from_email_address: Option<String>,
    raw_message: RawMessage,
    #[serde(skip_serializing_if = "Option::is_none")]
    configuration_set_name: Option<String>,
}

// Response types

/// Response from sending an email.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SendEmailResponse {
    /// Message ID assigned by SES.
    pub message_id: String,
}

/// Response from sending a bulk email.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SendBulkEmailResponse {
    /// Results for each bulk email entry.
    pub bulk_email_entry_results: Vec<BulkEmailEntryResult>,
}

/// Result of a single bulk email entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct BulkEmailEntryResult {
    /// Status of the entry.
    pub status: BulkEmailStatus,
    /// Error message if failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Message ID if successful.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
}

/// Status of a bulk email entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BulkEmailStatus {
    /// Successfully sent.
    Success,
    /// Message rejected.
    MessageRejected,
    /// MAIL FROM domain not verified.
    MailFromDomainNotVerified,
    /// Configuration set not found.
    ConfigurationSetNotFound,
    /// Template not found.
    TemplateNotFound,
    /// Account suspended.
    AccountSuspended,
    /// Account throttled.
    AccountThrottled,
    /// Account daily quota exceeded.
    AccountDailyQuotaExceeded,
    /// Invalid parameter value.
    InvalidParameterValue,
    /// Transient failure.
    TransientFailure,
    /// Failed.
    Failed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_send_email_request_serialization() {
        let content = EmailContent::new("Test Subject").with_text("Test body");
        let destination = Destination::new().add_to("test@example.com");

        let request = SendEmailRequest {
            from_email_address: Some("sender@example.com".to_string()),
            destination,
            content,
            configuration_set_name: None,
            email_tags: None,
            feedback_forwarding_email_address: None,
            reply_to_addresses: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("Test Subject"));
        assert!(json.contains("sender@example.com"));
    }

    #[test]
    fn test_bulk_email_status() {
        assert_eq!(BulkEmailStatus::Success, BulkEmailStatus::Success);
        assert_ne!(BulkEmailStatus::Success, BulkEmailStatus::Failed);
    }
}
