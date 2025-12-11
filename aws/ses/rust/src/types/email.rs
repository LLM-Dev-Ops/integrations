//! Email message types for SES v2.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents an email address with optional display name.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EmailAddress {
    /// Email address (e.g., "user@example.com").
    pub email: String,
    /// Display name (e.g., "John Doe").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

impl EmailAddress {
    /// Create a new email address without a display name.
    pub fn new(email: impl Into<String>) -> Self {
        Self {
            email: email.into(),
            display_name: None,
        }
    }

    /// Create a new email address with a display name.
    pub fn with_name(email: impl Into<String>, display_name: impl Into<String>) -> Self {
        Self {
            email: email.into(),
            display_name: Some(display_name.into()),
        }
    }

    /// Format the email address for use in email headers.
    pub fn format(&self) -> String {
        match &self.display_name {
            Some(name) => format!("{} <{}>", name, self.email),
            None => self.email.clone(),
        }
    }
}

impl From<String> for EmailAddress {
    fn from(email: String) -> Self {
        Self::new(email)
    }
}

impl From<&str> for EmailAddress {
    fn from(email: &str) -> Self {
        Self::new(email)
    }
}

/// Email destination (recipients).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Destination {
    /// "To" recipients.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_addresses: Option<Vec<EmailAddress>>,
    /// "CC" recipients.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cc_addresses: Option<Vec<EmailAddress>>,
    /// "BCC" recipients.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bcc_addresses: Option<Vec<EmailAddress>>,
}

impl Destination {
    /// Create a new destination.
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a "To" recipient.
    pub fn add_to(mut self, email: impl Into<EmailAddress>) -> Self {
        self.to_addresses
            .get_or_insert_with(Vec::new)
            .push(email.into());
        self
    }

    /// Add multiple "To" recipients.
    pub fn with_to(mut self, addresses: Vec<EmailAddress>) -> Self {
        self.to_addresses = Some(addresses);
        self
    }

    /// Add a "CC" recipient.
    pub fn add_cc(mut self, email: impl Into<EmailAddress>) -> Self {
        self.cc_addresses
            .get_or_insert_with(Vec::new)
            .push(email.into());
        self
    }

    /// Add multiple "CC" recipients.
    pub fn with_cc(mut self, addresses: Vec<EmailAddress>) -> Self {
        self.cc_addresses = Some(addresses);
        self
    }

    /// Add a "BCC" recipient.
    pub fn add_bcc(mut self, email: impl Into<EmailAddress>) -> Self {
        self.bcc_addresses
            .get_or_insert_with(Vec::new)
            .push(email.into());
        self
    }

    /// Add multiple "BCC" recipients.
    pub fn with_bcc(mut self, addresses: Vec<EmailAddress>) -> Self {
        self.bcc_addresses = Some(addresses);
        self
    }

    /// Get total number of recipients.
    pub fn recipient_count(&self) -> usize {
        let to = self.to_addresses.as_ref().map_or(0, |v| v.len());
        let cc = self.cc_addresses.as_ref().map_or(0, |v| v.len());
        let bcc = self.bcc_addresses.as_ref().map_or(0, |v| v.len());
        to + cc + bcc
    }
}

/// Email content with subject and body.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EmailContent {
    /// Email subject.
    pub subject: Content,
    /// Plain text body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<Content>,
    /// HTML body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<Content>,
    /// Template content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<Template>,
}

impl EmailContent {
    /// Create email content with subject only.
    pub fn new(subject: impl Into<String>) -> Self {
        Self {
            subject: Content::new(subject),
            text: None,
            html: None,
            template: None,
        }
    }

    /// Set plain text body.
    pub fn with_text(mut self, text: impl Into<String>) -> Self {
        self.text = Some(Content::new(text));
        self
    }

    /// Set HTML body.
    pub fn with_html(mut self, html: impl Into<String>) -> Self {
        self.html = Some(Content::new(html));
        self
    }

    /// Set template.
    pub fn with_template(mut self, template: Template) -> Self {
        self.template = Some(template);
        self
    }
}

/// Content with data and optional charset.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Content {
    /// Content data.
    pub data: String,
    /// Character set (defaults to UTF-8).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub charset: Option<String>,
}

impl Content {
    /// Create new content with UTF-8 charset.
    pub fn new(data: impl Into<String>) -> Self {
        Self {
            data: data.into(),
            charset: Some("UTF-8".to_string()),
        }
    }

    /// Create content with custom charset.
    pub fn with_charset(data: impl Into<String>, charset: impl Into<String>) -> Self {
        Self {
            data: data.into(),
            charset: Some(charset.into()),
        }
    }
}

/// Raw email message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct RawMessage {
    /// Raw MIME message data (base64-encoded).
    pub data: Vec<u8>,
}

impl RawMessage {
    /// Create a new raw message.
    pub fn new(data: Vec<u8>) -> Self {
        Self { data }
    }

    /// Create from a MIME string.
    pub fn from_mime(mime: impl Into<String>) -> Self {
        Self {
            data: mime.into().into_bytes(),
        }
    }
}

/// Entry for bulk email sending.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct BulkEmailEntry {
    /// Destination for this entry.
    pub destination: Destination,
    /// Replacement template data (JSON).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replacement_template_data: Option<String>,
    /// Replacement tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replacement_tags: Option<Vec<MessageTag>>,
    /// Replacement email content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replacement_email_content: Option<ReplacementEmailContent>,
}

impl BulkEmailEntry {
    /// Create a new bulk email entry.
    pub fn new(destination: Destination) -> Self {
        Self {
            destination,
            replacement_template_data: None,
            replacement_tags: None,
            replacement_email_content: None,
        }
    }

    /// Set replacement template data.
    pub fn with_template_data(mut self, data: serde_json::Value) -> Self {
        self.replacement_template_data = Some(data.to_string());
        self
    }

    /// Add a replacement tag.
    pub fn add_tag(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.replacement_tags
            .get_or_insert_with(Vec::new)
            .push(MessageTag::new(name, value));
        self
    }
}

/// Replacement email content for bulk sending.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ReplacementEmailContent {
    /// Replacement template.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replacement_template: Option<ReplacementTemplate>,
}

/// Replacement template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ReplacementTemplate {
    /// Template data (JSON).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replacement_template_data: Option<String>,
}

/// Email template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Template {
    /// Template name.
    pub template_name: String,
    /// Template data (JSON).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_data: Option<String>,
    /// Template ARN.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_arn: Option<String>,
}

impl Template {
    /// Create a new template.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            template_name: name.into(),
            template_data: None,
            template_arn: None,
        }
    }

    /// Set template data from a JSON value.
    pub fn with_data(mut self, data: serde_json::Value) -> Self {
        self.template_data = Some(data.to_string());
        self
    }

    /// Set template ARN.
    pub fn with_arn(mut self, arn: impl Into<String>) -> Self {
        self.template_arn = Some(arn.into());
        self
    }
}

/// Email attachment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Attachment {
    /// Filename.
    pub filename: String,
    /// Content type (MIME type).
    pub content_type: String,
    /// Attachment data (base64-encoded).
    pub data: Vec<u8>,
    /// Content ID (for inline attachments).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_id: Option<String>,
    /// Content disposition (attachment or inline).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disposition: Option<String>,
}

impl Attachment {
    /// Create a new attachment.
    pub fn new(
        filename: impl Into<String>,
        content_type: impl Into<String>,
        data: Vec<u8>,
    ) -> Self {
        Self {
            filename: filename.into(),
            content_type: content_type.into(),
            data,
            content_id: None,
            disposition: Some("attachment".to_string()),
        }
    }

    /// Create an inline attachment.
    pub fn inline(
        filename: impl Into<String>,
        content_type: impl Into<String>,
        data: Vec<u8>,
        content_id: impl Into<String>,
    ) -> Self {
        Self {
            filename: filename.into(),
            content_type: content_type.into(),
            data,
            content_id: Some(content_id.into()),
            disposition: Some("inline".to_string()),
        }
    }
}

/// Message tag for categorization and filtering.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MessageTag {
    /// Tag name.
    pub name: String,
    /// Tag value.
    pub value: String,
}

impl MessageTag {
    /// Create a new message tag.
    pub fn new(name: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            value: value.into(),
        }
    }
}

/// List of message tags.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MessageTagList {
    /// Tags.
    pub tags: Vec<MessageTag>,
}

impl MessageTagList {
    /// Create a new tag list.
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a tag.
    pub fn add(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.tags.push(MessageTag::new(name, value));
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_address_creation() {
        let addr = EmailAddress::new("test@example.com");
        assert_eq!(addr.email, "test@example.com");
        assert_eq!(addr.display_name, None);

        let addr_with_name = EmailAddress::with_name("test@example.com", "Test User");
        assert_eq!(addr_with_name.display_name, Some("Test User".to_string()));
    }

    #[test]
    fn test_email_address_format() {
        let addr = EmailAddress::new("test@example.com");
        assert_eq!(addr.format(), "test@example.com");

        let addr_with_name = EmailAddress::with_name("test@example.com", "Test User");
        assert_eq!(addr_with_name.format(), "Test User <test@example.com>");
    }

    #[test]
    fn test_destination_builder() {
        let dest = Destination::new()
            .add_to("to@example.com")
            .add_cc("cc@example.com")
            .add_bcc("bcc@example.com");

        assert_eq!(dest.recipient_count(), 3);
    }

    #[test]
    fn test_email_content() {
        let content = EmailContent::new("Test Subject")
            .with_text("Plain text body")
            .with_html("<p>HTML body</p>");

        assert_eq!(content.subject.data, "Test Subject");
        assert!(content.text.is_some());
        assert!(content.html.is_some());
    }

    #[test]
    fn test_template_with_data() {
        let data = serde_json::json!({"name": "John"});
        let template = Template::new("welcome-email").with_data(data);

        assert_eq!(template.template_name, "welcome-email");
        assert!(template.template_data.is_some());
    }

    #[test]
    fn test_message_tag() {
        let tag = MessageTag::new("campaign", "newsletter");
        assert_eq!(tag.name, "campaign");
        assert_eq!(tag.value, "newsletter");
    }
}
