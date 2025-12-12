//! Email builder for constructing send email requests.

use crate::builders::BuilderError;
use crate::types::{
    Attachment, Content, Destination, EmailAddress, EmailContent, MessageTag, Template,
};
use serde::{Deserialize, Serialize};

/// Request to send an email via AWS SES v2.
///
/// This request is constructed using [`EmailBuilder`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SendEmailRequest {
    /// The email address to send from.
    pub from_email_address: EmailAddress,
    /// Email destination (recipients).
    pub destination: Destination,
    /// Email content.
    pub content: EmailContent,
    /// Reply-to addresses.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_addresses: Option<Vec<EmailAddress>>,
    /// Feedback forwarding email address.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_forwarding_email_address: Option<EmailAddress>,
    /// Configuration set name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
    /// Email tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_tags: Option<Vec<MessageTag>>,
    /// Attachments.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Attachment>>,
}

/// Builder for constructing [`SendEmailRequest`] with a fluent API.
///
/// This builder provides methods for setting all email properties including
/// sender, recipients, subject, body content, templates, attachments, and more.
///
/// # Examples
///
/// ## Simple email with plain text and HTML
///
/// ```rust
/// use integrations_aws_ses::builders::EmailBuilder;
///
/// let request = EmailBuilder::new()
///     .from("sender@example.com")
///     .to("recipient@example.com")
///     .subject("Hello World")
///     .text("This is the plain text version")
///     .html("<p>This is the <strong>HTML</strong> version</p>")
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## Email with CC, BCC, and reply-to
///
/// ```rust
/// use integrations_aws_ses::builders::EmailBuilder;
///
/// let request = EmailBuilder::new()
///     .from("sender@example.com")
///     .to("recipient1@example.com")
///     .to("recipient2@example.com")
///     .cc("cc@example.com")
///     .bcc("bcc@example.com")
///     .reply_to("replyto@example.com")
///     .subject("Meeting Invitation")
///     .html("<p>You're invited to our meeting</p>")
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## Email with template
///
/// ```rust
/// use integrations_aws_ses::builders::EmailBuilder;
/// use serde_json::json;
///
/// let template_data = json!({
///     "name": "John Doe",
///     "account_id": "12345"
/// });
///
/// let request = EmailBuilder::new()
///     .from("noreply@example.com")
///     .to("user@example.com")
///     .template("welcome-email", template_data)
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## Email with attachments
///
/// ```rust
/// use integrations_aws_ses::builders::EmailBuilder;
///
/// let pdf_data = vec![0x25, 0x50, 0x44, 0x46]; // PDF header
/// let image_data = vec![0x89, 0x50, 0x4E, 0x47]; // PNG header
///
/// let request = EmailBuilder::new()
///     .from("sender@example.com")
///     .to("recipient@example.com")
///     .subject("Document Attached")
///     .text("Please find the attached document")
///     .attachment("report.pdf", "application/pdf", pdf_data)
///     .inline_attachment("logo.png", "image/png", image_data, "logo123")
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## Email with tags and configuration set
///
/// ```rust
/// use integrations_aws_ses::builders::EmailBuilder;
///
/// let request = EmailBuilder::new()
///     .from("marketing@example.com")
///     .to("customer@example.com")
///     .subject("Special Offer")
///     .html("<p>Check out our latest deals!</p>")
///     .tag("campaign", "spring-sale")
///     .tag("segment", "premium-customers")
///     .configuration_set("marketing-emails")
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
#[derive(Debug, Default)]
pub struct EmailBuilder {
    from: Option<EmailAddress>,
    destination: Destination,
    subject: Option<String>,
    text_body: Option<String>,
    html_body: Option<String>,
    template: Option<Template>,
    reply_to: Vec<EmailAddress>,
    feedback_forwarding_email: Option<EmailAddress>,
    configuration_set: Option<String>,
    tags: Vec<MessageTag>,
    attachments: Vec<Attachment>,
}

impl EmailBuilder {
    /// Create a new email builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the sender email address.
    ///
    /// This is a required field. The email address must be verified in AWS SES.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .from("sender@example.com");
    /// ```
    pub fn from(mut self, email: impl Into<EmailAddress>) -> Self {
        self.from = Some(email.into());
        self
    }

    /// Add a "To" recipient.
    ///
    /// Can be called multiple times to add multiple recipients.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .to("recipient1@example.com")
    ///     .to("recipient2@example.com");
    /// ```
    pub fn to(mut self, email: impl Into<EmailAddress>) -> Self {
        self.destination = self.destination.add_to(email);
        self
    }

    /// Add a "CC" recipient.
    ///
    /// Can be called multiple times to add multiple CC recipients.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .cc("cc1@example.com")
    ///     .cc("cc2@example.com");
    /// ```
    pub fn cc(mut self, email: impl Into<EmailAddress>) -> Self {
        self.destination = self.destination.add_cc(email);
        self
    }

    /// Add a "BCC" recipient.
    ///
    /// Can be called multiple times to add multiple BCC recipients.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .bcc("bcc1@example.com")
    ///     .bcc("bcc2@example.com");
    /// ```
    pub fn bcc(mut self, email: impl Into<EmailAddress>) -> Self {
        self.destination = self.destination.add_bcc(email);
        self
    }

    /// Add a "Reply-To" email address.
    ///
    /// Can be called multiple times to add multiple reply-to addresses.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .reply_to("support@example.com");
    /// ```
    pub fn reply_to(mut self, email: impl Into<EmailAddress>) -> Self {
        self.reply_to.push(email.into());
        self
    }

    /// Set the email subject.
    ///
    /// This is required unless using a template.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .subject("Important Announcement");
    /// ```
    pub fn subject(mut self, text: impl Into<String>) -> Self {
        self.subject = Some(text.into());
        self
    }

    /// Set the plain text body.
    ///
    /// At least one of `text()`, `html()`, or `template()` must be set.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .text("This is the plain text version of the email.");
    /// ```
    pub fn text(mut self, body: impl Into<String>) -> Self {
        self.text_body = Some(body.into());
        self
    }

    /// Set the HTML body.
    ///
    /// At least one of `text()`, `html()`, or `template()` must be set.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .html("<h1>Welcome</h1><p>Thanks for signing up!</p>");
    /// ```
    pub fn html(mut self, body: impl Into<String>) -> Self {
        self.html_body = Some(body.into());
        self
    }

    /// Use an email template.
    ///
    /// When using a template, the subject is defined in the template,
    /// so calling `subject()` is not required.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    /// use serde_json::json;
    ///
    /// let data = json!({
    ///     "username": "johndoe",
    ///     "confirmation_link": "https://example.com/confirm/abc123"
    /// });
    ///
    /// let builder = EmailBuilder::new()
    ///     .template("email-verification", data);
    /// ```
    pub fn template(mut self, name: impl Into<String>, data: serde_json::Value) -> Self {
        self.template = Some(Template::new(name).with_data(data));
        self
    }

    /// Add an attachment to the email.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let pdf_data = vec![0x25, 0x50, 0x44, 0x46]; // PDF data
    ///
    /// let builder = EmailBuilder::new()
    ///     .attachment("document.pdf", "application/pdf", pdf_data);
    /// ```
    pub fn attachment(
        mut self,
        name: impl Into<String>,
        content_type: impl Into<String>,
        data: Vec<u8>,
    ) -> Self {
        self.attachments
            .push(Attachment::new(name, content_type, data));
        self
    }

    /// Add an inline attachment to the email.
    ///
    /// Inline attachments are typically used for embedded images in HTML emails.
    /// The `content_id` can be referenced in the HTML using `src="cid:content_id"`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let image_data = vec![0x89, 0x50, 0x4E, 0x47]; // PNG data
    ///
    /// let builder = EmailBuilder::new()
    ///     .html(r#"<img src="cid:logo123">"#)
    ///     .inline_attachment("logo.png", "image/png", image_data, "logo123");
    /// ```
    pub fn inline_attachment(
        mut self,
        name: impl Into<String>,
        content_type: impl Into<String>,
        data: Vec<u8>,
        content_id: impl Into<String>,
    ) -> Self {
        self.attachments
            .push(Attachment::inline(name, content_type, data, content_id));
        self
    }

    /// Set the configuration set name.
    ///
    /// Configuration sets allow you to track and customize email sending behavior.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .configuration_set("production-emails");
    /// ```
    pub fn configuration_set(mut self, name: impl Into<String>) -> Self {
        self.configuration_set = Some(name.into());
        self
    }

    /// Add a message tag.
    ///
    /// Tags are used for categorizing and filtering emails. Can be called
    /// multiple times to add multiple tags.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .tag("campaign", "product-launch")
    ///     .tag("priority", "high");
    /// ```
    pub fn tag(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.tags.push(MessageTag::new(name, value));
        self
    }

    /// Set the feedback forwarding email address.
    ///
    /// This address will receive bounce and complaint notifications.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::EmailBuilder;
    ///
    /// let builder = EmailBuilder::new()
    ///     .feedback_forwarding_email("bounces@example.com");
    /// ```
    pub fn feedback_forwarding_email(mut self, email: impl Into<EmailAddress>) -> Self {
        self.feedback_forwarding_email = Some(email.into());
        self
    }

    /// Build the [`SendEmailRequest`].
    ///
    /// Returns an error if required fields are missing or invalid.
    ///
    /// # Errors
    ///
    /// - [`BuilderError::MissingField`] if `from` is not set
    /// - [`BuilderError::MissingField`] if no recipients are specified
    /// - [`BuilderError::MissingField`] if `subject` is not set and no template is used
    /// - [`BuilderError::MissingField`] if no body content or template is provided
    pub fn build(self) -> Result<SendEmailRequest, BuilderError> {
        // Validate required fields
        let from_email_address = self
            .from
            .ok_or_else(|| BuilderError::missing_field("from"))?;

        // Check that we have at least one recipient
        if self.destination.recipient_count() == 0 {
            return Err(BuilderError::missing_field("recipients"));
        }

        // Build email content
        let content = if let Some(template) = self.template {
            // When using a template, subject comes from the template
            EmailContent {
                subject: Content::new(""), // Template will provide subject
                text: None,
                html: None,
                template: Some(template),
            }
        } else {
            // When not using a template, subject is required
            let subject = self
                .subject
                .ok_or_else(|| BuilderError::missing_field("subject"))?;

            // At least one of text or HTML must be present
            if self.text_body.is_none() && self.html_body.is_none() {
                return Err(BuilderError::missing_field("body (text or html)"));
            }

            let mut content = EmailContent::new(subject);
            if let Some(text) = self.text_body {
                content = content.with_text(text);
            }
            if let Some(html) = self.html_body {
                content = content.with_html(html);
            }
            content
        };

        Ok(SendEmailRequest {
            from_email_address,
            destination: self.destination,
            content,
            reply_to_addresses: if self.reply_to.is_empty() {
                None
            } else {
                Some(self.reply_to)
            },
            feedback_forwarding_email_address: self.feedback_forwarding_email,
            configuration_set_name: self.configuration_set,
            email_tags: if self.tags.is_empty() {
                None
            } else {
                Some(self.tags)
            },
            attachments: if self.attachments.is_empty() {
                None
            } else {
                Some(self.attachments)
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_email() {
        let request = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .subject("Test Email")
            .text("This is a test email")
            .build()
            .unwrap();

        assert_eq!(request.from_email_address.email, "sender@example.com");
        assert_eq!(request.destination.recipient_count(), 1);
        assert_eq!(request.content.subject.data, "Test Email");
        assert!(request.content.text.is_some());
    }

    #[test]
    fn test_html_email() {
        let request = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .subject("HTML Test")
            .html("<p>HTML content</p>")
            .build()
            .unwrap();

        assert!(request.content.html.is_some());
        assert_eq!(
            request.content.html.unwrap().data,
            "<p>HTML content</p>"
        );
    }

    #[test]
    fn test_multipart_email() {
        let request = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .subject("Multipart Test")
            .text("Plain text")
            .html("<p>HTML content</p>")
            .build()
            .unwrap();

        assert!(request.content.text.is_some());
        assert!(request.content.html.is_some());
    }

    #[test]
    fn test_multiple_recipients() {
        let request = EmailBuilder::new()
            .from("sender@example.com")
            .to("to1@example.com")
            .to("to2@example.com")
            .cc("cc@example.com")
            .bcc("bcc@example.com")
            .subject("Multiple Recipients")
            .text("Test")
            .build()
            .unwrap();

        assert_eq!(request.destination.recipient_count(), 4);
    }

    #[test]
    fn test_reply_to() {
        let request = EmailBuilder::new()
            .from("noreply@example.com")
            .to("recipient@example.com")
            .reply_to("support@example.com")
            .subject("Test")
            .text("Test")
            .build()
            .unwrap();

        assert!(request.reply_to_addresses.is_some());
        assert_eq!(request.reply_to_addresses.unwrap().len(), 1);
    }

    #[test]
    fn test_template_email() {
        let data = serde_json::json!({"name": "John"});
        let request = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .template("welcome", data)
            .build()
            .unwrap();

        assert!(request.content.template.is_some());
    }

    #[test]
    fn test_attachments() {
        let request = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .subject("With Attachments")
            .text("See attached")
            .attachment("file.pdf", "application/pdf", vec![1, 2, 3])
            .inline_attachment("logo.png", "image/png", vec![4, 5, 6], "logo123")
            .build()
            .unwrap();

        assert!(request.attachments.is_some());
        let attachments = request.attachments.unwrap();
        assert_eq!(attachments.len(), 2);
    }

    #[test]
    fn test_tags() {
        let request = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .subject("Tagged Email")
            .text("Test")
            .tag("campaign", "newsletter")
            .tag("priority", "high")
            .build()
            .unwrap();

        assert!(request.email_tags.is_some());
        let tags = request.email_tags.unwrap();
        assert_eq!(tags.len(), 2);
    }

    #[test]
    fn test_configuration_set() {
        let request = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .subject("Test")
            .text("Test")
            .configuration_set("production")
            .build()
            .unwrap();

        assert_eq!(
            request.configuration_set_name,
            Some("production".to_string())
        );
    }

    #[test]
    fn test_missing_from() {
        let result = EmailBuilder::new()
            .to("recipient@example.com")
            .subject("Test")
            .text("Test")
            .build();

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            BuilderError::missing_field("from")
        );
    }

    #[test]
    fn test_missing_recipients() {
        let result = EmailBuilder::new()
            .from("sender@example.com")
            .subject("Test")
            .text("Test")
            .build();

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            BuilderError::missing_field("recipients")
        );
    }

    #[test]
    fn test_missing_subject() {
        let result = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .text("Test")
            .build();

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            BuilderError::missing_field("subject")
        );
    }

    #[test]
    fn test_missing_body() {
        let result = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .subject("Test")
            .build();

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            BuilderError::missing_field("body (text or html)")
        );
    }

    #[test]
    fn test_feedback_forwarding_email() {
        let request = EmailBuilder::new()
            .from("sender@example.com")
            .to("recipient@example.com")
            .subject("Test")
            .text("Test")
            .feedback_forwarding_email("bounces@example.com")
            .build()
            .unwrap();

        assert!(request.feedback_forwarding_email_address.is_some());
        assert_eq!(
            request
                .feedback_forwarding_email_address
                .unwrap()
                .email,
            "bounces@example.com"
        );
    }
}
