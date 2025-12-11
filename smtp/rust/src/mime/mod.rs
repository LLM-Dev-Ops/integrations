//! MIME encoding for email messages.
//!
//! Provides RFC 5322 compliant message formatting with:
//! - Header encoding (RFC 2047)
//! - Quoted-printable and Base64 content encoding
//! - Multipart message construction
//! - Attachment and inline image handling

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use uuid::Uuid;

use crate::errors::{SmtpError, SmtpErrorKind, SmtpResult};
use crate::types::{Address, Attachment, ContentDisposition, Email, InlineImage};

/// MIME content types.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentType {
    /// Plain text.
    TextPlain,
    /// HTML content.
    TextHtml,
    /// Multipart alternative (text + HTML).
    MultipartAlternative(String),
    /// Multipart mixed (body + attachments).
    MultipartMixed(String),
    /// Multipart related (HTML + inline images).
    MultipartRelated(String),
    /// Other content type.
    Other(String),
}

impl ContentType {
    /// Returns the MIME type string.
    pub fn mime_type(&self) -> String {
        match self {
            ContentType::TextPlain => "text/plain; charset=utf-8".to_string(),
            ContentType::TextHtml => "text/html; charset=utf-8".to_string(),
            ContentType::MultipartAlternative(boundary) => {
                format!("multipart/alternative; boundary=\"{}\"", boundary)
            }
            ContentType::MultipartMixed(boundary) => {
                format!("multipart/mixed; boundary=\"{}\"", boundary)
            }
            ContentType::MultipartRelated(boundary) => {
                format!("multipart/related; boundary=\"{}\"", boundary)
            }
            ContentType::Other(s) => s.clone(),
        }
    }
}

/// Transfer encoding types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TransferEncoding {
    /// 7-bit ASCII (no encoding).
    SevenBit,
    /// 8-bit data.
    EightBit,
    /// Quoted-printable encoding.
    #[default]
    QuotedPrintable,
    /// Base64 encoding.
    Base64,
}

impl TransferEncoding {
    /// Returns the header value.
    pub fn header_value(&self) -> &'static str {
        match self {
            TransferEncoding::SevenBit => "7bit",
            TransferEncoding::EightBit => "8bit",
            TransferEncoding::QuotedPrintable => "quoted-printable",
            TransferEncoding::Base64 => "base64",
        }
    }
}

/// MIME encoder for email messages.
pub struct MimeEncoder {
    /// Date for the message.
    date: DateTime<Utc>,
    /// Domain for message IDs.
    domain: String,
}

impl MimeEncoder {
    /// Creates a new encoder.
    pub fn new(domain: impl Into<String>) -> Self {
        Self {
            date: Utc::now(),
            domain: domain.into(),
        }
    }

    /// Encodes an email to RFC 5322 format.
    pub fn encode(&self, email: &Email) -> SmtpResult<Vec<u8>> {
        let mut output = Vec::new();

        // Generate message ID if not provided
        let message_id = email.message_id.clone().unwrap_or_else(|| self.generate_message_id());

        // Required headers
        self.write_header(&mut output, "Date", &self.format_date())?;
        self.write_header(&mut output, "From", &email.from.to_header())?;

        if !email.to.is_empty() {
            let to_list: Vec<String> = email.to.iter().map(|a| a.to_header()).collect();
            self.write_header(&mut output, "To", &to_list.join(", "))?;
        }

        if !email.cc.is_empty() {
            let cc_list: Vec<String> = email.cc.iter().map(|a| a.to_header()).collect();
            self.write_header(&mut output, "Cc", &cc_list.join(", "))?;
        }

        // Note: BCC is not included in headers

        if let Some(reply_to) = &email.reply_to {
            self.write_header(&mut output, "Reply-To", &reply_to.to_header())?;
        }

        self.write_header(&mut output, "Subject", &self.encode_header(&email.subject))?;
        self.write_header(&mut output, "Message-ID", &format!("<{}>", message_id))?;

        if let Some(in_reply_to) = &email.in_reply_to {
            self.write_header(&mut output, "In-Reply-To", &format!("<{}>", in_reply_to))?;
        }

        if !email.references.is_empty() {
            let refs: Vec<String> = email.references.iter().map(|r| format!("<{}>", r)).collect();
            self.write_header(&mut output, "References", &refs.join(" "))?;
        }

        // Custom headers
        for (name, value) in &email.headers {
            self.write_header(&mut output, name, &self.encode_header(value))?;
        }

        // MIME headers
        self.write_header(&mut output, "MIME-Version", "1.0")?;

        // Determine content structure
        let has_attachments = !email.attachments.is_empty();
        let has_inline = !email.inline_images.is_empty();
        let has_text = email.text.is_some();
        let has_html = email.html.is_some();
        let is_alternative = has_text && has_html;

        if has_attachments {
            // multipart/mixed with body + attachments
            let mixed_boundary = self.generate_boundary();
            self.write_header(&mut output, "Content-Type", &ContentType::MultipartMixed(mixed_boundary.clone()).mime_type())?;
            output.extend_from_slice(b"\r\n");

            output.extend_from_slice(format!("--{}\r\n", mixed_boundary).as_bytes());

            if has_inline {
                // multipart/related for HTML + inline images
                let related_boundary = self.generate_boundary();
                self.write_header(&mut output, "Content-Type", &ContentType::MultipartRelated(related_boundary.clone()).mime_type())?;
                output.extend_from_slice(b"\r\n");

                self.write_body_part(&mut output, email, &related_boundary)?;

                // Inline images
                for image in &email.inline_images {
                    output.extend_from_slice(format!("--{}\r\n", related_boundary).as_bytes());
                    self.write_inline_image(&mut output, image)?;
                }

                output.extend_from_slice(format!("--{}--\r\n", related_boundary).as_bytes());
            } else {
                self.write_body_part(&mut output, email, &mixed_boundary)?;
            }

            // Attachments
            for attachment in &email.attachments {
                output.extend_from_slice(format!("--{}\r\n", mixed_boundary).as_bytes());
                self.write_attachment(&mut output, attachment)?;
            }

            output.extend_from_slice(format!("--{}--\r\n", mixed_boundary).as_bytes());
        } else if has_inline {
            // multipart/related for HTML + inline images
            let related_boundary = self.generate_boundary();
            self.write_header(&mut output, "Content-Type", &ContentType::MultipartRelated(related_boundary.clone()).mime_type())?;
            output.extend_from_slice(b"\r\n");

            self.write_body_part(&mut output, email, &related_boundary)?;

            for image in &email.inline_images {
                output.extend_from_slice(format!("--{}\r\n", related_boundary).as_bytes());
                self.write_inline_image(&mut output, image)?;
            }

            output.extend_from_slice(format!("--{}--\r\n", related_boundary).as_bytes());
        } else if is_alternative {
            // multipart/alternative for text + HTML
            let alt_boundary = self.generate_boundary();
            self.write_header(&mut output, "Content-Type", &ContentType::MultipartAlternative(alt_boundary.clone()).mime_type())?;
            output.extend_from_slice(b"\r\n");

            self.write_alternative_body(&mut output, email, &alt_boundary)?;
        } else if has_html {
            // HTML only
            self.write_header(&mut output, "Content-Type", &ContentType::TextHtml.mime_type())?;
            self.write_header(&mut output, "Content-Transfer-Encoding", TransferEncoding::QuotedPrintable.header_value())?;
            output.extend_from_slice(b"\r\n");
            output.extend_from_slice(&self.encode_quoted_printable(email.html.as_ref().unwrap()));
        } else {
            // Text only
            self.write_header(&mut output, "Content-Type", &ContentType::TextPlain.mime_type())?;
            self.write_header(&mut output, "Content-Transfer-Encoding", TransferEncoding::QuotedPrintable.header_value())?;
            output.extend_from_slice(b"\r\n");
            output.extend_from_slice(&self.encode_quoted_printable(email.text.as_ref().unwrap_or(&String::new())));
        }

        Ok(output)
    }

    /// Writes a header line.
    fn write_header(&self, output: &mut Vec<u8>, name: &str, value: &str) -> SmtpResult<()> {
        // Validate header name (no control characters, CRLF)
        if name.chars().any(|c| c.is_control() || c == ':') {
            return Err(SmtpError::message_error(
                SmtpErrorKind::InvalidHeader,
                format!("Invalid header name: {}", name),
            ));
        }

        // Fold long header lines
        let header = format!("{}: {}", name, value);
        let folded = self.fold_header(&header);
        output.extend_from_slice(folded.as_bytes());
        output.extend_from_slice(b"\r\n");
        Ok(())
    }

    /// Folds a header line at 78 characters.
    fn fold_header(&self, header: &str) -> String {
        if header.len() <= 78 {
            return header.to_string();
        }

        let mut result = String::new();
        let mut current_line = String::new();

        for word in header.split(' ') {
            if current_line.is_empty() {
                current_line = word.to_string();
            } else if current_line.len() + 1 + word.len() <= 76 {
                current_line.push(' ');
                current_line.push_str(word);
            } else {
                result.push_str(&current_line);
                result.push_str("\r\n ");
                current_line = word.to_string();
            }
        }

        result.push_str(&current_line);
        result
    }

    /// Encodes a header value using RFC 2047.
    fn encode_header(&self, value: &str) -> String {
        // Check if encoding is needed
        if value.chars().all(|c| c.is_ascii() && !c.is_control()) {
            return value.to_string();
        }

        // Use Base64 encoding for non-ASCII
        let encoded = BASE64.encode(value.as_bytes());
        format!("=?UTF-8?B?{}?=", encoded)
    }

    /// Encodes text using quoted-printable.
    fn encode_quoted_printable(&self, text: &str) -> Vec<u8> {
        quoted_printable::encode(text.as_bytes())
    }

    /// Generates a unique message ID.
    fn generate_message_id(&self) -> String {
        let uuid = Uuid::new_v4();
        format!("{}.{}@{}", uuid, self.date.timestamp(), self.domain)
    }

    /// Generates a unique boundary.
    fn generate_boundary(&self) -> String {
        format!("----=_Part_{}", Uuid::new_v4().simple())
    }

    /// Formats the date for the Date header.
    fn format_date(&self) -> String {
        self.date.format("%a, %d %b %Y %H:%M:%S %z").to_string()
    }

    /// Writes body part (handles alternative text/HTML).
    fn write_body_part(&self, output: &mut Vec<u8>, email: &Email, boundary: &str) -> SmtpResult<()> {
        let has_text = email.text.is_some();
        let has_html = email.html.is_some();

        if has_text && has_html {
            // Nested multipart/alternative
            let alt_boundary = self.generate_boundary();
            self.write_header(output, "Content-Type", &ContentType::MultipartAlternative(alt_boundary.clone()).mime_type())?;
            output.extend_from_slice(b"\r\n");

            self.write_alternative_body(output, email, &alt_boundary)?;
        } else if has_html {
            self.write_header(output, "Content-Type", &ContentType::TextHtml.mime_type())?;
            self.write_header(output, "Content-Transfer-Encoding", TransferEncoding::QuotedPrintable.header_value())?;
            output.extend_from_slice(b"\r\n");
            output.extend_from_slice(&self.encode_quoted_printable(email.html.as_ref().unwrap()));
        } else if has_text {
            self.write_header(output, "Content-Type", &ContentType::TextPlain.mime_type())?;
            self.write_header(output, "Content-Transfer-Encoding", TransferEncoding::QuotedPrintable.header_value())?;
            output.extend_from_slice(b"\r\n");
            output.extend_from_slice(&self.encode_quoted_printable(email.text.as_ref().unwrap()));
        }

        Ok(())
    }

    /// Writes multipart/alternative body (text + HTML).
    fn write_alternative_body(&self, output: &mut Vec<u8>, email: &Email, boundary: &str) -> SmtpResult<()> {
        // Text part
        if let Some(text) = &email.text {
            output.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
            self.write_header(output, "Content-Type", &ContentType::TextPlain.mime_type())?;
            self.write_header(output, "Content-Transfer-Encoding", TransferEncoding::QuotedPrintable.header_value())?;
            output.extend_from_slice(b"\r\n");
            output.extend_from_slice(&self.encode_quoted_printable(text));
            output.extend_from_slice(b"\r\n");
        }

        // HTML part
        if let Some(html) = &email.html {
            output.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
            self.write_header(output, "Content-Type", &ContentType::TextHtml.mime_type())?;
            self.write_header(output, "Content-Transfer-Encoding", TransferEncoding::QuotedPrintable.header_value())?;
            output.extend_from_slice(b"\r\n");
            output.extend_from_slice(&self.encode_quoted_printable(html));
            output.extend_from_slice(b"\r\n");
        }

        output.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());
        Ok(())
    }

    /// Writes an attachment.
    fn write_attachment(&self, output: &mut Vec<u8>, attachment: &Attachment) -> SmtpResult<()> {
        self.write_header(output, "Content-Type", &format!("{}; name=\"{}\"", attachment.content_type, attachment.filename))?;
        self.write_header(output, "Content-Transfer-Encoding", TransferEncoding::Base64.header_value())?;
        self.write_header(output, "Content-Disposition", &format!("{}; filename=\"{}\"", attachment.disposition, attachment.filename))?;
        output.extend_from_slice(b"\r\n");

        // Base64 encode with line wrapping
        let encoded = BASE64.encode(&attachment.data);
        for chunk in encoded.as_bytes().chunks(76) {
            output.extend_from_slice(chunk);
            output.extend_from_slice(b"\r\n");
        }

        Ok(())
    }

    /// Writes an inline image.
    fn write_inline_image(&self, output: &mut Vec<u8>, image: &InlineImage) -> SmtpResult<()> {
        self.write_header(output, "Content-Type", &image.content_type)?;
        self.write_header(output, "Content-Transfer-Encoding", TransferEncoding::Base64.header_value())?;
        self.write_header(output, "Content-ID", &format!("<{}>", image.content_id))?;
        self.write_header(output, "Content-Disposition", "inline")?;
        output.extend_from_slice(b"\r\n");

        // Base64 encode with line wrapping
        let encoded = BASE64.encode(&image.data);
        for chunk in encoded.as_bytes().chunks(76) {
            output.extend_from_slice(chunk);
            output.extend_from_slice(b"\r\n");
        }

        Ok(())
    }

    /// Prepares the DATA content with dot-stuffing.
    pub fn prepare_data_content(encoded_email: &[u8]) -> Vec<u8> {
        let mut output = Vec::with_capacity(encoded_email.len() + 100);
        let mut at_line_start = true;

        for &byte in encoded_email {
            if at_line_start && byte == b'.' {
                // Dot-stuffing: double dots at start of line
                output.push(b'.');
            }

            output.push(byte);
            at_line_start = byte == b'\n';
        }

        // Ensure CRLF at end
        if !output.ends_with(b"\r\n") {
            if output.ends_with(b"\n") {
                output.pop();
                output.extend_from_slice(b"\r\n");
            } else {
                output.extend_from_slice(b"\r\n");
            }
        }

        // End with <CRLF>.<CRLF>
        output.extend_from_slice(b".\r\n");

        output
    }
}

impl Default for MimeEncoder {
    fn default() -> Self {
        Self::new("localhost")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_encoding() {
        let encoder = MimeEncoder::new("example.com");

        // ASCII
        assert_eq!(encoder.encode_header("Hello"), "Hello");

        // Non-ASCII
        let encoded = encoder.encode_header("Héllo");
        assert!(encoded.starts_with("=?UTF-8?B?"));
    }

    #[test]
    fn test_quoted_printable() {
        let encoder = MimeEncoder::new("example.com");
        let text = "Hello World!";
        let encoded = encoder.encode_quoted_printable(text);
        // Should encode without much change for ASCII
        assert!(!encoded.is_empty());
    }

    #[test]
    fn test_boundary_generation() {
        let encoder = MimeEncoder::new("example.com");
        let b1 = encoder.generate_boundary();
        let b2 = encoder.generate_boundary();
        assert_ne!(b1, b2);
    }

    #[test]
    fn test_message_id_generation() {
        let encoder = MimeEncoder::new("example.com");
        let id = encoder.generate_message_id();
        assert!(id.ends_with("@example.com"));
    }

    #[test]
    fn test_dot_stuffing() {
        let input = b"Hello\r\n.World\r\n..Test\r\n";
        let output = MimeEncoder::prepare_data_content(input);
        // Dots at start of lines should be doubled
        let output_str = String::from_utf8_lossy(&output);
        assert!(output_str.contains("\r\n..World"));
        assert!(output_str.contains("\r\n...Test"));
        assert!(output_str.ends_with("\r\n.\r\n"));
    }

    #[test]
    fn test_simple_email_encoding() {
        let email = Email {
            from: Address::new("sender@example.com").unwrap(),
            to: vec![Address::new("recipient@example.com").unwrap()],
            cc: vec![],
            bcc: vec![],
            reply_to: None,
            subject: "Test Subject".to_string(),
            text: Some("Hello World!".to_string()),
            html: None,
            attachments: vec![],
            inline_images: vec![],
            headers: HashMap::new(),
            message_id: None,
            in_reply_to: None,
            references: vec![],
        };

        let encoder = MimeEncoder::new("example.com");
        let encoded = encoder.encode(&email).unwrap();
        let content = String::from_utf8_lossy(&encoded);

        assert!(content.contains("From: sender@example.com"));
        assert!(content.contains("To: recipient@example.com"));
        assert!(content.contains("Subject: Test Subject"));
        assert!(content.contains("MIME-Version: 1.0"));
    }
}
