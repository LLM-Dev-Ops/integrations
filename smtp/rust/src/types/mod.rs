//! Core types for the SMTP client.
//!
//! This module provides:
//! - Email message structures
//! - Address types with validation
//! - Attachment and inline image handling
//! - Send result types

use std::collections::HashMap;
use std::fmt;
use std::time::Duration;
use serde::{Deserialize, Serialize};

use crate::errors::{SmtpError, SmtpErrorKind, SmtpResult};

/// Email address with optional display name.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Address {
    /// Display name (e.g., "John Doe").
    pub name: Option<String>,
    /// Email address (e.g., "john@example.com").
    pub email: String,
}

impl Address {
    /// Creates a new address with just an email.
    pub fn new(email: impl Into<String>) -> SmtpResult<Self> {
        let email = email.into();
        Self::validate_email(&email)?;
        Ok(Self { name: None, email })
    }

    /// Creates a new address with display name and email.
    pub fn with_name(name: impl Into<String>, email: impl Into<String>) -> SmtpResult<Self> {
        let email = email.into();
        Self::validate_email(&email)?;
        Ok(Self {
            name: Some(name.into()),
            email,
        })
    }

    /// Parses an address from a string (e.g., "John Doe <john@example.com>").
    pub fn parse(s: &str) -> SmtpResult<Self> {
        let s = s.trim();

        // Check for "Name <email>" format
        if let Some(start) = s.find('<') {
            if let Some(end) = s.find('>') {
                let name = s[..start].trim().trim_matches('"');
                let email = s[start + 1..end].trim();
                return Self::with_name(name, email);
            }
        }

        // Plain email address
        Self::new(s)
    }

    /// Validates an email address according to RFC 5321/5322.
    fn validate_email(email: &str) -> SmtpResult<()> {
        if email.is_empty() {
            return Err(SmtpError::message_error(
                SmtpErrorKind::InvalidFromAddress,
                "Email address cannot be empty",
            ));
        }

        // Check total length
        if email.len() > 254 {
            return Err(SmtpError::message_error(
                SmtpErrorKind::InvalidFromAddress,
                "Email address too long (max 254 characters)",
            ));
        }

        // Must have exactly one @
        let at_count = email.chars().filter(|c| *c == '@').count();
        if at_count != 1 {
            return Err(SmtpError::message_error(
                SmtpErrorKind::InvalidFromAddress,
                "Email address must contain exactly one @",
            ));
        }

        let parts: Vec<&str> = email.split('@').collect();
        let local = parts[0];
        let domain = parts[1];

        // Local part validation
        if local.is_empty() || local.len() > 64 {
            return Err(SmtpError::message_error(
                SmtpErrorKind::InvalidFromAddress,
                "Local part must be 1-64 characters",
            ));
        }

        // Domain validation
        if domain.is_empty() {
            return Err(SmtpError::message_error(
                SmtpErrorKind::InvalidFromAddress,
                "Domain cannot be empty",
            ));
        }

        // Check for control characters
        if email.chars().any(|c| c.is_control()) {
            return Err(SmtpError::message_error(
                SmtpErrorKind::InvalidFromAddress,
                "Email address cannot contain control characters",
            ));
        }

        Ok(())
    }

    /// Returns the email part only.
    pub fn email(&self) -> &str {
        &self.email
    }

    /// Returns the display name if present.
    pub fn name(&self) -> Option<&str> {
        self.name.as_deref()
    }

    /// Formats the address for SMTP MAIL FROM/RCPT TO commands.
    pub fn to_smtp(&self) -> String {
        format!("<{}>", self.email)
    }

    /// Formats the address for email headers.
    pub fn to_header(&self) -> String {
        match &self.name {
            Some(name) => {
                // Quote name if it contains special characters
                if name.contains(|c: char| !c.is_alphanumeric() && c != ' ') {
                    format!("\"{}\" <{}>", name, self.email)
                } else {
                    format!("{} <{}>", name, self.email)
                }
            }
            None => self.email.clone(),
        }
    }
}

impl fmt::Display for Address {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_header())
    }
}

impl TryFrom<&str> for Address {
    type Error = SmtpError;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        Address::parse(s)
    }
}

impl TryFrom<String> for Address {
    type Error = SmtpError;

    fn try_from(s: String) -> Result<Self, Self::Error> {
        Address::parse(&s)
    }
}

/// File attachment.
#[derive(Debug, Clone)]
pub struct Attachment {
    /// Filename.
    pub filename: String,
    /// MIME content type.
    pub content_type: String,
    /// Binary content.
    pub data: Vec<u8>,
    /// Content disposition (attachment or inline).
    pub disposition: ContentDisposition,
}

impl Attachment {
    /// Creates a new attachment.
    pub fn new(filename: impl Into<String>, content_type: impl Into<String>, data: Vec<u8>) -> Self {
        Self {
            filename: filename.into(),
            content_type: content_type.into(),
            data,
            disposition: ContentDisposition::Attachment,
        }
    }

    /// Creates an attachment with auto-detected content type.
    pub fn from_file(filename: impl Into<String>, data: Vec<u8>) -> Self {
        let filename = filename.into();
        let content_type = mime_guess::from_path(&filename)
            .first_or_octet_stream()
            .to_string();
        Self::new(filename, content_type, data)
    }

    /// Sets the content disposition to inline.
    pub fn inline(mut self) -> Self {
        self.disposition = ContentDisposition::Inline;
        self
    }
}

/// Content disposition for attachments.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ContentDisposition {
    /// Regular attachment.
    #[default]
    Attachment,
    /// Inline content.
    Inline,
}

impl fmt::Display for ContentDisposition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ContentDisposition::Attachment => write!(f, "attachment"),
            ContentDisposition::Inline => write!(f, "inline"),
        }
    }
}

/// Inline image for HTML emails.
#[derive(Debug, Clone)]
pub struct InlineImage {
    /// Content ID (used in HTML src="cid:...").
    pub content_id: String,
    /// MIME content type.
    pub content_type: String,
    /// Binary content.
    pub data: Vec<u8>,
}

impl InlineImage {
    /// Creates a new inline image.
    pub fn new(content_id: impl Into<String>, content_type: impl Into<String>, data: Vec<u8>) -> Self {
        Self {
            content_id: content_id.into(),
            content_type: content_type.into(),
            data,
        }
    }

    /// Returns the CID reference for use in HTML (e.g., "cid:image1").
    pub fn cid_reference(&self) -> String {
        format!("cid:{}", self.content_id)
    }
}

/// Complete email message.
#[derive(Debug, Clone)]
pub struct Email {
    /// Sender address.
    pub from: Address,
    /// Primary recipients.
    pub to: Vec<Address>,
    /// CC recipients.
    pub cc: Vec<Address>,
    /// BCC recipients.
    pub bcc: Vec<Address>,
    /// Reply-to address.
    pub reply_to: Option<Address>,
    /// Email subject.
    pub subject: String,
    /// Plain text body.
    pub text: Option<String>,
    /// HTML body.
    pub html: Option<String>,
    /// File attachments.
    pub attachments: Vec<Attachment>,
    /// Inline images.
    pub inline_images: Vec<InlineImage>,
    /// Additional headers.
    pub headers: HashMap<String, String>,
    /// Message ID (generated if not set).
    pub message_id: Option<String>,
    /// In-Reply-To header.
    pub in_reply_to: Option<String>,
    /// References header.
    pub references: Vec<String>,
}

impl Email {
    /// Creates a new email builder.
    pub fn builder() -> EmailBuilder {
        EmailBuilder::default()
    }

    /// Returns all recipients (to + cc + bcc).
    pub fn all_recipients(&self) -> impl Iterator<Item = &Address> {
        self.to.iter().chain(self.cc.iter()).chain(self.bcc.iter())
    }

    /// Returns the count of all recipients.
    pub fn recipient_count(&self) -> usize {
        self.to.len() + self.cc.len() + self.bcc.len()
    }

    /// Returns true if the email has any attachments.
    pub fn has_attachments(&self) -> bool {
        !self.attachments.is_empty()
    }

    /// Returns true if the email has inline images.
    pub fn has_inline_images(&self) -> bool {
        !self.inline_images.is_empty()
    }

    /// Returns true if the email has both text and HTML parts.
    pub fn is_multipart_alternative(&self) -> bool {
        self.text.is_some() && self.html.is_some()
    }
}

/// Builder for Email messages.
#[derive(Debug, Default)]
pub struct EmailBuilder {
    from: Option<Address>,
    to: Vec<Address>,
    cc: Vec<Address>,
    bcc: Vec<Address>,
    reply_to: Option<Address>,
    subject: String,
    text: Option<String>,
    html: Option<String>,
    attachments: Vec<Attachment>,
    inline_images: Vec<InlineImage>,
    headers: HashMap<String, String>,
    message_id: Option<String>,
    in_reply_to: Option<String>,
    references: Vec<String>,
}

impl EmailBuilder {
    /// Sets the sender address.
    pub fn from(mut self, address: impl TryInto<Address, Error = SmtpError>) -> SmtpResult<Self> {
        self.from = Some(address.try_into()?);
        Ok(self)
    }

    /// Adds a primary recipient.
    pub fn to(mut self, address: impl TryInto<Address, Error = SmtpError>) -> SmtpResult<Self> {
        self.to.push(address.try_into()?);
        Ok(self)
    }

    /// Adds multiple primary recipients.
    pub fn to_many<I, A>(mut self, addresses: I) -> SmtpResult<Self>
    where
        I: IntoIterator<Item = A>,
        A: TryInto<Address, Error = SmtpError>,
    {
        for addr in addresses {
            self.to.push(addr.try_into()?);
        }
        Ok(self)
    }

    /// Adds a CC recipient.
    pub fn cc(mut self, address: impl TryInto<Address, Error = SmtpError>) -> SmtpResult<Self> {
        self.cc.push(address.try_into()?);
        Ok(self)
    }

    /// Adds a BCC recipient.
    pub fn bcc(mut self, address: impl TryInto<Address, Error = SmtpError>) -> SmtpResult<Self> {
        self.bcc.push(address.try_into()?);
        Ok(self)
    }

    /// Sets the reply-to address.
    pub fn reply_to(mut self, address: impl TryInto<Address, Error = SmtpError>) -> SmtpResult<Self> {
        self.reply_to = Some(address.try_into()?);
        Ok(self)
    }

    /// Sets the subject.
    pub fn subject(mut self, subject: impl Into<String>) -> Self {
        self.subject = subject.into();
        self
    }

    /// Sets the plain text body.
    pub fn text(mut self, text: impl Into<String>) -> Self {
        self.text = Some(text.into());
        self
    }

    /// Sets the HTML body.
    pub fn html(mut self, html: impl Into<String>) -> Self {
        self.html = Some(html.into());
        self
    }

    /// Adds an attachment.
    pub fn attachment(mut self, attachment: Attachment) -> Self {
        self.attachments.push(attachment);
        self
    }

    /// Adds an inline image.
    pub fn inline_image(mut self, image: InlineImage) -> Self {
        self.inline_images.push(image);
        self
    }

    /// Adds a custom header.
    pub fn header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(name.into(), value.into());
        self
    }

    /// Sets the message ID.
    pub fn message_id(mut self, id: impl Into<String>) -> Self {
        self.message_id = Some(id.into());
        self
    }

    /// Sets the In-Reply-To header.
    pub fn in_reply_to(mut self, id: impl Into<String>) -> Self {
        self.in_reply_to = Some(id.into());
        self
    }

    /// Adds a reference.
    pub fn reference(mut self, id: impl Into<String>) -> Self {
        self.references.push(id.into());
        self
    }

    /// Builds the email.
    pub fn build(self) -> SmtpResult<Email> {
        let from = self.from.ok_or_else(|| {
            SmtpError::message_error(SmtpErrorKind::InvalidFromAddress, "From address is required")
        })?;

        if self.to.is_empty() && self.cc.is_empty() && self.bcc.is_empty() {
            return Err(SmtpError::message_error(
                SmtpErrorKind::InvalidRecipientAddress,
                "At least one recipient is required",
            ));
        }

        if self.text.is_none() && self.html.is_none() {
            return Err(SmtpError::message_error(
                SmtpErrorKind::EncodingFailed,
                "Email body is required (text or HTML)",
            ));
        }

        Ok(Email {
            from,
            to: self.to,
            cc: self.cc,
            bcc: self.bcc,
            reply_to: self.reply_to,
            subject: self.subject,
            text: self.text,
            html: self.html,
            attachments: self.attachments,
            inline_images: self.inline_images,
            headers: self.headers,
            message_id: self.message_id,
            in_reply_to: self.in_reply_to,
            references: self.references,
        })
    }
}

/// Result of sending a single email.
#[derive(Debug, Clone)]
pub struct SendResult {
    /// Client-generated message ID.
    pub message_id: String,
    /// Server-assigned ID (if provided).
    pub server_id: Option<String>,
    /// Successfully accepted recipients.
    pub accepted: Vec<Address>,
    /// Rejected recipients.
    pub rejected: Vec<RejectedRecipient>,
    /// Server response message.
    pub response: String,
    /// Send duration.
    pub duration: Duration,
}

impl SendResult {
    /// Returns true if all recipients were accepted.
    pub fn is_complete_success(&self) -> bool {
        self.rejected.is_empty()
    }

    /// Returns true if at least one recipient was accepted.
    pub fn is_partial_success(&self) -> bool {
        !self.accepted.is_empty()
    }
}

/// Result of sending multiple emails.
#[derive(Debug, Clone)]
pub struct BatchSendResult {
    /// Individual results.
    pub results: Vec<Result<SendResult, SmtpError>>,
    /// Total emails attempted.
    pub total: usize,
    /// Successfully sent count.
    pub succeeded: usize,
    /// Failed count.
    pub failed: usize,
    /// Total duration.
    pub duration: Duration,
}

impl BatchSendResult {
    /// Returns true if all emails were sent successfully.
    pub fn is_complete_success(&self) -> bool {
        self.failed == 0
    }

    /// Returns an iterator over successful results.
    pub fn successes(&self) -> impl Iterator<Item = &SendResult> {
        self.results.iter().filter_map(|r| r.as_ref().ok())
    }

    /// Returns an iterator over failed results.
    pub fn failures(&self) -> impl Iterator<Item = &SmtpError> {
        self.results.iter().filter_map(|r| r.as_ref().err())
    }
}

/// A recipient that was rejected by the server.
#[derive(Debug, Clone)]
pub struct RejectedRecipient {
    /// The rejected address.
    pub address: Address,
    /// SMTP status code.
    pub code: u16,
    /// Error message from server.
    pub message: String,
}

/// Connection pool status.
#[derive(Debug, Clone, Default)]
pub struct PoolStatus {
    /// Total connections in pool.
    pub total: usize,
    /// Idle connections.
    pub idle: usize,
    /// In-use connections.
    pub in_use: usize,
    /// Pending connection requests.
    pub pending: usize,
    /// Maximum pool size.
    pub max_size: usize,
}

/// Information about an SMTP connection.
#[derive(Debug, Clone)]
pub struct ConnectionInfo {
    /// Server hostname.
    pub host: String,
    /// Server port.
    pub port: u16,
    /// TLS status.
    pub tls_enabled: bool,
    /// TLS version if enabled.
    pub tls_version: Option<String>,
    /// Server capabilities.
    pub capabilities: Vec<String>,
    /// Server banner message.
    pub banner: String,
    /// Authenticated user.
    pub authenticated_user: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_address_parse() {
        // Simple email
        let addr = Address::parse("test@example.com").unwrap();
        assert_eq!(addr.email, "test@example.com");
        assert!(addr.name.is_none());

        // With name
        let addr = Address::parse("John Doe <john@example.com>").unwrap();
        assert_eq!(addr.email, "john@example.com");
        assert_eq!(addr.name, Some("John Doe".to_string()));

        // Quoted name
        let addr = Address::parse("\"John, Doe\" <john@example.com>").unwrap();
        assert_eq!(addr.email, "john@example.com");
        assert_eq!(addr.name, Some("John, Doe".to_string()));
    }

    #[test]
    fn test_address_validation() {
        // Valid
        assert!(Address::new("test@example.com").is_ok());
        assert!(Address::new("test.name@sub.example.com").is_ok());

        // Invalid
        assert!(Address::new("").is_err());
        assert!(Address::new("no-at-sign").is_err());
        assert!(Address::new("two@@signs.com").is_err());
        assert!(Address::new("@no-local.com").is_err());
        assert!(Address::new("no-domain@").is_err());
    }

    #[test]
    fn test_email_builder() {
        let email = Email::builder()
            .from("sender@example.com").unwrap()
            .to("recipient@example.com").unwrap()
            .subject("Test")
            .text("Hello!")
            .build()
            .unwrap();

        assert_eq!(email.from.email, "sender@example.com");
        assert_eq!(email.to.len(), 1);
        assert_eq!(email.subject, "Test");
        assert_eq!(email.text, Some("Hello!".to_string()));
    }

    #[test]
    fn test_email_builder_validation() {
        // Missing from
        let result = Email::builder()
            .to("test@example.com").unwrap()
            .text("Hello")
            .build();
        assert!(result.is_err());

        // Missing recipients
        let result = Email::builder()
            .from("test@example.com").unwrap()
            .text("Hello")
            .build();
        assert!(result.is_err());

        // Missing body
        let result = Email::builder()
            .from("test@example.com").unwrap()
            .to("test@example.com").unwrap()
            .build();
        assert!(result.is_err());
    }

    #[test]
    fn test_attachment() {
        let attachment = Attachment::from_file("test.pdf", vec![1, 2, 3]);
        assert_eq!(attachment.filename, "test.pdf");
        assert_eq!(attachment.content_type, "application/pdf");
        assert_eq!(attachment.disposition, ContentDisposition::Attachment);

        let inline = attachment.inline();
        assert_eq!(inline.disposition, ContentDisposition::Inline);
    }
}
