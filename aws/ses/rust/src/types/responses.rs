//! Response types for SES v2 API operations.

use serde::{Deserialize, Serialize};
use super::{
    EmailIdentity, IdentityInfo, ConfigurationSet,
    SuppressedDestination, TemplateContent,
};

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
    /// Status of each bulk email entry.
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

/// Response from creating an email template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateEmailTemplateResponse {}

/// Response from getting an email template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetEmailTemplateResponse {
    /// Template name.
    pub template_name: String,
    /// Template content.
    pub template_content: TemplateContent,
}

/// Response from listing email templates.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListEmailTemplatesResponse {
    /// Templates metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub templates_metadata: Option<Vec<EmailTemplateMetadata>>,
    /// Next token for pagination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

/// Email template metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EmailTemplateMetadata {
    /// Template name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_name: Option<String>,
    /// Created timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_timestamp: Option<String>,
}

/// Response from testing template rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct TestRenderEmailTemplateResponse {
    /// Rendered subject.
    pub rendered_subject: String,
    /// Rendered HTML part.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rendered_html_part: Option<String>,
    /// Rendered text part.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rendered_text_part: Option<String>,
}

/// Response from creating an email identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateEmailIdentityResponse {
    /// Identity type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_type: Option<String>,
    /// Verified for sending domain.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_for_sending_status: Option<bool>,
    /// DKIM attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dkim_attributes: Option<super::DkimAttributes>,
}

/// Response from getting an email identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetEmailIdentityResponse {
    /// Identity type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_type: Option<String>,
    /// Feedback forwarding status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_forwarding_status: Option<bool>,
    /// Verified for sending status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_for_sending_status: Option<bool>,
    /// DKIM attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dkim_attributes: Option<super::DkimAttributes>,
    /// MAIL FROM attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mail_from_attributes: Option<super::MailFromAttributes>,
    /// Policies.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policies: Option<std::collections::HashMap<String, String>>,
    /// Tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<super::Tag>>,
    /// Configuration set name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
}

/// Response from listing email identities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListEmailIdentitiesResponse {
    /// Email identities.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_identities: Option<Vec<IdentityInfo>>,
    /// Next token for pagination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

/// Response from getting a configuration set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetConfigurationSetResponse {
    /// Configuration set name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
    /// Tracking options.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracking_options: Option<super::TrackingOptions>,
    /// Delivery options.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery_options: Option<super::DeliveryOptions>,
    /// Reputation options.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reputation_options: Option<super::ReputationOptions>,
    /// Sending options.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sending_options: Option<super::SendingOptions>,
    /// Tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<super::Tag>>,
    /// Suppression options.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppression_options: Option<super::SuppressionOptions>,
}

/// Response from listing configuration sets.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListConfigurationSetsResponse {
    /// Configuration sets.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_sets: Option<Vec<String>>,
    /// Next token for pagination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

/// Response from getting a suppressed destination.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetSuppressedDestinationResponse {
    /// Suppressed destination.
    pub suppressed_destination: SuppressedDestination,
}

/// Response from listing suppressed destinations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListSuppressedDestinationsResponse {
    /// Suppressed destination summaries.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppressed_destination_summaries: Option<Vec<SuppressedDestination>>,
    /// Next token for pagination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

/// Response from getting account details.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetAccountResponse {
    /// Sending enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sending_enabled: Option<bool>,
    /// Dedicated IP auto warmup enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dedicated_ip_auto_warmup_enabled: Option<bool>,
    /// Enforcement status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enforcement_status: Option<String>,
    /// Production access enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub production_access_enabled: Option<bool>,
    /// Send quota.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_quota: Option<SendQuota>,
    /// Suppression attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppression_attributes: Option<super::SuppressionOptions>,
}

/// Send quota information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SendQuota {
    /// Maximum send rate (per second).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_send_rate: Option<f64>,
    /// Maximum 24-hour send.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max24_hour_send: Option<f64>,
    /// Sent last 24 hours.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sent_last24_hours: Option<f64>,
}

/// Response from getting a dedicated IP.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetDedicatedIpResponse {
    /// Dedicated IP.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dedicated_ip: Option<DedicatedIp>,
}

/// Dedicated IP information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DedicatedIp {
    /// IP address.
    pub ip: String,
    /// Warmup status.
    pub warmup_status: WarmupStatus,
    /// Warmup percentage.
    pub warmup_percentage: i32,
    /// Pool name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pool_name: Option<String>,
}

/// Warmup status for dedicated IPs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WarmupStatus {
    /// In progress.
    InProgress,
    /// Done.
    Done,
}

/// Response from listing dedicated IPs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListDedicatedIpsResponse {
    /// Dedicated IPs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dedicated_ips: Option<Vec<DedicatedIp>>,
    /// Next token for pagination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_send_email_response() {
        let response = SendEmailResponse {
            message_id: "msg-12345".to_string(),
        };
        assert_eq!(response.message_id, "msg-12345");
    }

    #[test]
    fn test_bulk_email_status() {
        assert_eq!(BulkEmailStatus::Success, BulkEmailStatus::Success);
        assert_ne!(BulkEmailStatus::Success, BulkEmailStatus::Failed);
    }

    #[test]
    fn test_send_quota() {
        let quota = SendQuota {
            max_send_rate: Some(14.0),
            max24_hour_send: Some(50000.0),
            sent_last24_hours: Some(1234.0),
        };
        assert_eq!(quota.max_send_rate, Some(14.0));
        assert_eq!(quota.max24_hour_send, Some(50000.0));
    }

    #[test]
    fn test_warmup_status() {
        assert_eq!(WarmupStatus::Done, WarmupStatus::Done);
        assert_ne!(WarmupStatus::InProgress, WarmupStatus::Done);
    }
}
