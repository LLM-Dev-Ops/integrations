//! API request types for SES v2.

use serde::{Deserialize, Serialize};
use super::{
    BulkEmailEntry, Destination, DkimSigningAttributes,
    EmailContent, EventDestination, MailFromAttributes, MessageTag,
    SuppressionListReason, Topic,
};

/// Request to send an email.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SendEmailRequest {
    /// The email address to use as the "From" address.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_email_address: Option<String>,
    /// An alternative "From" address to use (for authorized senders).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_email_address_identity_arn: Option<String>,
    /// Destination (recipients).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub destination: Option<Destination>,
    /// Reply-to addresses.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_addresses: Option<Vec<String>>,
    /// Email address for bounces and complaints.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_forwarding_email_address: Option<String>,
    /// Email content.
    pub content: EmailContent,
    /// Message tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_tags: Option<Vec<MessageTag>>,
    /// Configuration set name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
    /// List management options.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub list_management_options: Option<ListManagementOptions>,
}

impl SendEmailRequest {
    /// Create a new send email request.
    pub fn new(content: EmailContent) -> Self {
        Self {
            from_email_address: None,
            from_email_address_identity_arn: None,
            destination: None,
            reply_to_addresses: None,
            feedback_forwarding_email_address: None,
            content,
            email_tags: None,
            configuration_set_name: None,
            list_management_options: None,
        }
    }

    /// Set the from address.
    pub fn with_from(mut self, from: impl Into<String>) -> Self {
        self.from_email_address = Some(from.into());
        self
    }

    /// Set destination.
    pub fn with_destination(mut self, destination: Destination) -> Self {
        self.destination = Some(destination);
        self
    }

    /// Add a reply-to address.
    pub fn add_reply_to(mut self, reply_to: impl Into<String>) -> Self {
        self.reply_to_addresses
            .get_or_insert_with(Vec::new)
            .push(reply_to.into());
        self
    }

    /// Set configuration set.
    pub fn with_configuration_set(mut self, name: impl Into<String>) -> Self {
        self.configuration_set_name = Some(name.into());
        self
    }

    /// Add a message tag.
    pub fn add_tag(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.email_tags
            .get_or_insert_with(Vec::new)
            .push(MessageTag::new(name, value));
        self
    }
}

/// Request to send bulk email.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SendBulkEmailRequest {
    /// The email address to use as the "From" address.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_email_address: Option<String>,
    /// An alternative "From" address to use.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_email_address_identity_arn: Option<String>,
    /// Reply-to addresses.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_addresses: Option<Vec<String>>,
    /// Feedback forwarding email address.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_forwarding_email_address: Option<String>,
    /// Default email content.
    pub default_content: EmailContent,
    /// Bulk email entries.
    pub bulk_email_entries: Vec<BulkEmailEntry>,
    /// Configuration set name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
    /// Default email tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_email_tags: Option<Vec<MessageTag>>,
}

impl SendBulkEmailRequest {
    /// Create a new bulk email request.
    pub fn new(default_content: EmailContent, entries: Vec<BulkEmailEntry>) -> Self {
        Self {
            from_email_address: None,
            from_email_address_identity_arn: None,
            reply_to_addresses: None,
            feedback_forwarding_email_address: None,
            default_content,
            bulk_email_entries: entries,
            configuration_set_name: None,
            default_email_tags: None,
        }
    }

    /// Set from address.
    pub fn with_from(mut self, from: impl Into<String>) -> Self {
        self.from_email_address = Some(from.into());
        self
    }

    /// Set configuration set.
    pub fn with_configuration_set(mut self, name: impl Into<String>) -> Self {
        self.configuration_set_name = Some(name.into());
        self
    }
}

/// List management options for email.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListManagementOptions {
    /// The name of the contact list.
    pub contact_list_name: String,
    /// The name of the topic.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_name: Option<String>,
}

/// Request to create an email identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateEmailIdentityRequest {
    /// The email address or domain to verify.
    pub email_identity: String,
    /// Tags to associate with the identity.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<super::Tag>>,
    /// DKIM signing attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dkim_signing_attributes: Option<DkimSigningAttributes>,
    /// Configuration set name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
}

impl CreateEmailIdentityRequest {
    /// Create a new email identity request.
    pub fn new(email_identity: impl Into<String>) -> Self {
        Self {
            email_identity: email_identity.into(),
            tags: None,
            dkim_signing_attributes: None,
            configuration_set_name: None,
        }
    }

    /// Add a tag.
    pub fn add_tag(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.tags
            .get_or_insert_with(Vec::new)
            .push(super::Tag::new(key, value));
        self
    }

    /// Set configuration set.
    pub fn with_configuration_set(mut self, name: impl Into<String>) -> Self {
        self.configuration_set_name = Some(name.into());
        self
    }
}

/// Request to delete an email identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteEmailIdentityRequest {
    /// The email identity to delete.
    pub email_identity: String,
}

/// Request to create a configuration set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateConfigurationSetRequest {
    /// The name of the configuration set.
    pub configuration_set_name: String,
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

impl CreateConfigurationSetRequest {
    /// Create a new configuration set request.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            configuration_set_name: name.into(),
            tracking_options: None,
            delivery_options: None,
            reputation_options: None,
            sending_options: None,
            tags: None,
            suppression_options: None,
        }
    }
}

/// Request to delete a configuration set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteConfigurationSetRequest {
    /// The name of the configuration set.
    pub configuration_set_name: String,
}

/// Request to create an email template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateEmailTemplateRequest {
    /// The name of the template.
    pub template_name: String,
    /// Template content.
    pub template_content: TemplateContent,
}

impl CreateEmailTemplateRequest {
    /// Create a new template request.
    pub fn new(name: impl Into<String>, content: TemplateContent) -> Self {
        Self {
            template_name: name.into(),
            template_content: content,
        }
    }
}

/// Template content.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct TemplateContent {
    /// The subject line of the email.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    /// The HTML body of the email.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    /// The plain text body of the email.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

impl TemplateContent {
    /// Create new template content.
    pub fn new() -> Self {
        Self {
            subject: None,
            html: None,
            text: None,
        }
    }

    /// Set subject.
    pub fn with_subject(mut self, subject: impl Into<String>) -> Self {
        self.subject = Some(subject.into());
        self
    }

    /// Set HTML body.
    pub fn with_html(mut self, html: impl Into<String>) -> Self {
        self.html = Some(html.into());
        self
    }

    /// Set text body.
    pub fn with_text(mut self, text: impl Into<String>) -> Self {
        self.text = Some(text.into());
        self
    }
}

impl Default for TemplateContent {
    fn default() -> Self {
        Self::new()
    }
}

/// Request to update an email template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct UpdateEmailTemplateRequest {
    /// The name of the template.
    pub template_name: String,
    /// Template content.
    pub template_content: TemplateContent,
}

/// Request to delete an email template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteEmailTemplateRequest {
    /// The name of the template.
    pub template_name: String,
}

/// Request to create a contact list.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateContactListRequest {
    /// The name of the contact list.
    pub contact_list_name: String,
    /// Topics for the contact list.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topics: Option<Vec<Topic>>,
    /// Description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<super::Tag>>,
}

impl CreateContactListRequest {
    /// Create a new contact list request.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            contact_list_name: name.into(),
            topics: None,
            description: None,
            tags: None,
        }
    }

    /// Set description.
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set topics.
    pub fn with_topics(mut self, topics: Vec<Topic>) -> Self {
        self.topics = Some(topics);
        self
    }
}

/// Request to delete a contact list.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteContactListRequest {
    /// The name of the contact list.
    pub contact_list_name: String,
}

/// Request to create a contact.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateContactRequest {
    /// The name of the contact list.
    pub contact_list_name: String,
    /// The contact's email address.
    pub email_address: String,
    /// Topic preferences.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_preferences: Option<Vec<super::TopicPreference>>,
    /// Unsubscribe all status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unsubscribe_all: Option<bool>,
    /// Custom attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attributes_data: Option<String>,
}

impl CreateContactRequest {
    /// Create a new contact request.
    pub fn new(contact_list_name: impl Into<String>, email: impl Into<String>) -> Self {
        Self {
            contact_list_name: contact_list_name.into(),
            email_address: email.into(),
            topic_preferences: None,
            unsubscribe_all: None,
            attributes_data: None,
        }
    }
}

/// Request to delete a contact.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteContactRequest {
    /// The name of the contact list.
    pub contact_list_name: String,
    /// The contact's email address.
    pub email_address: String,
}

/// Request to add destinations to suppression list.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutSuppressedDestinationRequest {
    /// The email address to suppress.
    pub email_address: String,
    /// The reason for suppression.
    pub reason: SuppressionListReason,
}

impl PutSuppressedDestinationRequest {
    /// Create a new suppressed destination request.
    pub fn new(email: impl Into<String>, reason: SuppressionListReason) -> Self {
        Self {
            email_address: email.into(),
            reason,
        }
    }
}

/// Request to remove destination from suppression list.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteSuppressedDestinationRequest {
    /// The email address to remove from suppression.
    pub email_address: String,
}

/// Request to create an event destination.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateConfigurationSetEventDestinationRequest {
    /// The name of the configuration set.
    pub configuration_set_name: String,
    /// The event destination details.
    pub event_destination: EventDestination,
    /// The name of the event destination.
    pub event_destination_name: String,
}

/// Request to delete an event destination.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteConfigurationSetEventDestinationRequest {
    /// The name of the configuration set.
    pub configuration_set_name: String,
    /// The name of the event destination.
    pub event_destination_name: String,
}

/// Request to put email identity DKIM attributes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutEmailIdentityDkimAttributesRequest {
    /// The email identity.
    pub email_identity: String,
    /// Whether DKIM signing is enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signing_enabled: Option<bool>,
}

/// Request to put email identity mail from attributes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutEmailIdentityMailFromAttributesRequest {
    /// The email identity.
    pub email_identity: String,
    /// The MAIL FROM domain.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mail_from_domain: Option<String>,
    /// Behavior on MX failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub behavior_on_mx_failure: Option<super::BehaviorOnMxFailure>,
}

/// Request to put email identity feedback attributes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutEmailIdentityFeedbackAttributesRequest {
    /// The email identity.
    pub email_identity: String,
    /// Whether to forward bounce and complaint notifications.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_forwarding_enabled: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Content, Destination as EmailDest};

    #[test]
    fn test_send_email_request() {
        let content = EmailContent::new("Test Subject")
            .with_text("Test body");

        let request = SendEmailRequest::new(content)
            .with_from("sender@example.com")
            .with_configuration_set("my-config-set")
            .add_tag("campaign", "newsletter");

        assert_eq!(request.from_email_address, Some("sender@example.com".to_string()));
        assert_eq!(request.configuration_set_name, Some("my-config-set".to_string()));
        assert_eq!(request.email_tags.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn test_create_email_identity_request() {
        let request = CreateEmailIdentityRequest::new("example.com")
            .add_tag("Environment", "Production")
            .with_configuration_set("default");

        assert_eq!(request.email_identity, "example.com");
        assert_eq!(request.tags.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn test_template_content() {
        let content = TemplateContent::new()
            .with_subject("Welcome {{name}}")
            .with_html("<h1>Hello {{name}}</h1>")
            .with_text("Hello {{name}}");

        assert_eq!(content.subject, Some("Welcome {{name}}".to_string()));
        assert!(content.html.is_some());
        assert!(content.text.is_some());
    }
}
