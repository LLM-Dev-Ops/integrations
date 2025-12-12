//! Bulk email builder for sending emails to multiple recipients.

use crate::builders::BuilderError;
use crate::types::{BulkEmailEntry, EmailAddress};
use serde::{Deserialize, Serialize};

/// Request to send bulk emails via AWS SES v2.
///
/// This request is constructed using [`BulkEmailBuilder`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SendBulkEmailRequest {
    /// The email address to send from.
    pub from_email_address: EmailAddress,
    /// Default template name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_template_name: Option<String>,
    /// Default template data (JSON).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_template_data: Option<String>,
    /// Bulk email entries (one per recipient/destination).
    pub bulk_email_entries: Vec<BulkEmailEntry>,
    /// Configuration set name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
    /// Reply-to addresses.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_addresses: Option<Vec<EmailAddress>>,
    /// Feedback forwarding email address.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_forwarding_email_address: Option<EmailAddress>,
}

/// Builder for constructing [`SendBulkEmailRequest`] with a fluent API.
///
/// This builder provides methods for sending the same email template to multiple
/// recipients, with optional per-recipient customization via template data.
///
/// Bulk sending is more efficient than sending individual emails when you need
/// to send the same content to many recipients. AWS SES processes bulk sends
/// more efficiently and provides better throughput.
///
/// # Examples
///
/// ## Basic bulk send with template
///
/// ```rust
/// use integrations_aws_ses::builders::BulkEmailBuilder;
/// use integrations_aws_ses::types::{Destination, BulkEmailEntry};
///
/// let dest1 = Destination::new().add_to("user1@example.com");
/// let entry1 = BulkEmailEntry::new(dest1);
///
/// let dest2 = Destination::new().add_to("user2@example.com");
/// let entry2 = BulkEmailEntry::new(dest2);
///
/// let request = BulkEmailBuilder::new()
///     .from("newsletter@example.com")
///     .default_template("monthly-newsletter")
///     .add_recipient(entry1)
///     .add_recipient(entry2)
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## Bulk send with default template data
///
/// ```rust
/// use integrations_aws_ses::builders::BulkEmailBuilder;
/// use integrations_aws_ses::types::{Destination, BulkEmailEntry};
/// use serde_json::json;
///
/// let default_data = json!({
///     "company": "Acme Corp",
///     "year": 2024
/// });
///
/// let dest1 = Destination::new().add_to("user1@example.com");
/// let entry1 = BulkEmailEntry::new(dest1)
///     .with_template_data(json!({"name": "Alice"}));
///
/// let dest2 = Destination::new().add_to("user2@example.com");
/// let entry2 = BulkEmailEntry::new(dest2)
///     .with_template_data(json!({"name": "Bob"}));
///
/// let request = BulkEmailBuilder::new()
///     .from("marketing@example.com")
///     .default_template("welcome")
///     .default_template_data(default_data)
///     .add_recipient(entry1)
///     .add_recipient(entry2)
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## Bulk send with configuration set
///
/// ```rust
/// use integrations_aws_ses::builders::BulkEmailBuilder;
/// use integrations_aws_ses::types::{Destination, BulkEmailEntry};
///
/// let entries: Vec<BulkEmailEntry> = vec![
///     "user1@example.com",
///     "user2@example.com",
///     "user3@example.com",
/// ]
/// .into_iter()
/// .map(|email| {
///     let dest = Destination::new().add_to(email);
///     BulkEmailEntry::new(dest)
/// })
/// .collect();
///
/// let mut builder = BulkEmailBuilder::new()
///     .from("announcements@example.com")
///     .default_template("product-launch")
///     .configuration_set("marketing-campaigns");
///
/// for entry in entries {
///     builder = builder.add_recipient(entry);
/// }
///
/// let request = builder.build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## Bulk send with personalization
///
/// ```rust
/// use integrations_aws_ses::builders::BulkEmailBuilder;
/// use integrations_aws_ses::types::{Destination, BulkEmailEntry};
/// use serde_json::json;
///
/// // Each recipient gets personalized data
/// let users = vec![
///     ("alice@example.com", "Alice", "Premium"),
///     ("bob@example.com", "Bob", "Standard"),
///     ("charlie@example.com", "Charlie", "Premium"),
/// ];
///
/// let mut builder = BulkEmailBuilder::new()
///     .from("support@example.com")
///     .default_template("account-update");
///
/// for (email, name, tier) in users {
///     let dest = Destination::new().add_to(email);
///     let entry = BulkEmailEntry::new(dest)
///         .with_template_data(json!({
///             "name": name,
///             "tier": tier,
///             "renewal_date": "2024-12-31"
///         }));
///     builder = builder.add_recipient(entry);
/// }
///
/// let request = builder.build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
#[derive(Debug, Default)]
pub struct BulkEmailBuilder {
    from: Option<EmailAddress>,
    default_template: Option<String>,
    default_template_data: Option<String>,
    recipients: Vec<BulkEmailEntry>,
    configuration_set: Option<String>,
    reply_to: Vec<EmailAddress>,
    feedback_forwarding_email: Option<EmailAddress>,
}

impl BulkEmailBuilder {
    /// Create a new bulk email builder.
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
    /// use integrations_aws_ses::builders::BulkEmailBuilder;
    ///
    /// let builder = BulkEmailBuilder::new()
    ///     .from("newsletter@example.com");
    /// ```
    pub fn from(mut self, email: impl Into<EmailAddress>) -> Self {
        self.from = Some(email.into());
        self
    }

    /// Set the default template name.
    ///
    /// This template will be used for all recipients unless overridden in
    /// individual [`BulkEmailEntry`] instances.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::BulkEmailBuilder;
    ///
    /// let builder = BulkEmailBuilder::new()
    ///     .default_template("monthly-newsletter");
    /// ```
    pub fn default_template(mut self, name: impl Into<String>) -> Self {
        self.default_template = Some(name.into());
        self
    }

    /// Set the default template data.
    ///
    /// This data will be merged with per-recipient template data. If a recipient
    /// has their own template data, it will override these defaults.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::BulkEmailBuilder;
    /// use serde_json::json;
    ///
    /// let default_data = json!({
    ///     "company_name": "Acme Corp",
    ///     "year": 2024
    /// });
    ///
    /// let builder = BulkEmailBuilder::new()
    ///     .default_template_data(default_data);
    /// ```
    pub fn default_template_data(mut self, json: serde_json::Value) -> Self {
        self.default_template_data = Some(json.to_string());
        self
    }

    /// Add a recipient entry.
    ///
    /// Each entry contains a destination (email addresses) and optional
    /// per-recipient template data. Can be called multiple times to add
    /// multiple recipients.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::BulkEmailBuilder;
    /// use integrations_aws_ses::types::{Destination, BulkEmailEntry};
    /// use serde_json::json;
    ///
    /// let dest = Destination::new().add_to("user@example.com");
    /// let entry = BulkEmailEntry::new(dest)
    ///     .with_template_data(json!({"name": "John"}));
    ///
    /// let builder = BulkEmailBuilder::new()
    ///     .add_recipient(entry);
    /// ```
    pub fn add_recipient(mut self, entry: BulkEmailEntry) -> Self {
        self.recipients.push(entry);
        self
    }

    /// Set the configuration set name.
    ///
    /// Configuration sets allow you to track and customize bulk email sending behavior.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::BulkEmailBuilder;
    ///
    /// let builder = BulkEmailBuilder::new()
    ///     .configuration_set("marketing-campaigns");
    /// ```
    pub fn configuration_set(mut self, name: impl Into<String>) -> Self {
        self.configuration_set = Some(name.into());
        self
    }

    /// Add a "Reply-To" email address.
    ///
    /// Can be called multiple times to add multiple reply-to addresses.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::BulkEmailBuilder;
    ///
    /// let builder = BulkEmailBuilder::new()
    ///     .reply_to("support@example.com");
    /// ```
    pub fn reply_to(mut self, email: impl Into<EmailAddress>) -> Self {
        self.reply_to.push(email.into());
        self
    }

    /// Set the feedback forwarding email address.
    ///
    /// This address will receive bounce and complaint notifications.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::BulkEmailBuilder;
    ///
    /// let builder = BulkEmailBuilder::new()
    ///     .feedback_forwarding_email("bounces@example.com");
    /// ```
    pub fn feedback_forwarding_email(mut self, email: impl Into<EmailAddress>) -> Self {
        self.feedback_forwarding_email = Some(email.into());
        self
    }

    /// Build the [`SendBulkEmailRequest`].
    ///
    /// Returns an error if required fields are missing or invalid.
    ///
    /// # Errors
    ///
    /// - [`BuilderError::MissingField`] if `from` is not set
    /// - [`BuilderError::MissingField`] if no recipients are added
    /// - [`BuilderError::InvalidValue`] if recipient list is too large (> 50 recipients)
    pub fn build(self) -> Result<SendBulkEmailRequest, BuilderError> {
        // Validate required fields
        let from_email_address = self
            .from
            .ok_or_else(|| BuilderError::missing_field("from"))?;

        // Check that we have at least one recipient
        if self.recipients.is_empty() {
            return Err(BuilderError::missing_field("recipients"));
        }

        // AWS SES bulk send limit is 50 recipients per request
        if self.recipients.len() > 50 {
            return Err(BuilderError::invalid_value(
                "recipients",
                format!(
                    "Too many recipients ({}). AWS SES bulk send supports up to 50 recipients per request",
                    self.recipients.len()
                ),
            ));
        }

        // Validate that each recipient has a valid destination
        for (index, entry) in self.recipients.iter().enumerate() {
            if entry.destination.recipient_count() == 0 {
                return Err(BuilderError::invalid_value(
                    "recipients",
                    format!("Recipient at index {} has no email addresses", index),
                ));
            }
        }

        Ok(SendBulkEmailRequest {
            from_email_address,
            default_template_name: self.default_template,
            default_template_data: self.default_template_data,
            bulk_email_entries: self.recipients,
            configuration_set_name: self.configuration_set,
            reply_to_addresses: if self.reply_to.is_empty() {
                None
            } else {
                Some(self.reply_to)
            },
            feedback_forwarding_email_address: self.feedback_forwarding_email,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Destination;

    #[test]
    fn test_basic_bulk_email() {
        let dest1 = Destination::new().add_to("user1@example.com");
        let entry1 = BulkEmailEntry::new(dest1);

        let dest2 = Destination::new().add_to("user2@example.com");
        let entry2 = BulkEmailEntry::new(dest2);

        let request = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("newsletter")
            .add_recipient(entry1)
            .add_recipient(entry2)
            .build()
            .unwrap();

        assert_eq!(request.from_email_address.email, "sender@example.com");
        assert_eq!(
            request.default_template_name,
            Some("newsletter".to_string())
        );
        assert_eq!(request.bulk_email_entries.len(), 2);
    }

    #[test]
    fn test_bulk_with_template_data() {
        let data = serde_json::json!({"company": "Acme"});

        let dest = Destination::new().add_to("user@example.com");
        let entry = BulkEmailEntry::new(dest);

        let request = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("welcome")
            .default_template_data(data)
            .add_recipient(entry)
            .build()
            .unwrap();

        assert!(request.default_template_data.is_some());
    }

    #[test]
    fn test_bulk_with_configuration_set() {
        let dest = Destination::new().add_to("user@example.com");
        let entry = BulkEmailEntry::new(dest);

        let request = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("test")
            .configuration_set("marketing")
            .add_recipient(entry)
            .build()
            .unwrap();

        assert_eq!(
            request.configuration_set_name,
            Some("marketing".to_string())
        );
    }

    #[test]
    fn test_bulk_with_reply_to() {
        let dest = Destination::new().add_to("user@example.com");
        let entry = BulkEmailEntry::new(dest);

        let request = BulkEmailBuilder::new()
            .from("noreply@example.com")
            .default_template("test")
            .reply_to("support@example.com")
            .add_recipient(entry)
            .build()
            .unwrap();

        assert!(request.reply_to_addresses.is_some());
        assert_eq!(request.reply_to_addresses.unwrap().len(), 1);
    }

    #[test]
    fn test_bulk_with_feedback_email() {
        let dest = Destination::new().add_to("user@example.com");
        let entry = BulkEmailEntry::new(dest);

        let request = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("test")
            .feedback_forwarding_email("bounces@example.com")
            .add_recipient(entry)
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

    #[test]
    fn test_missing_from() {
        let dest = Destination::new().add_to("user@example.com");
        let entry = BulkEmailEntry::new(dest);

        let result = BulkEmailBuilder::new()
            .default_template("test")
            .add_recipient(entry)
            .build();

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), BuilderError::missing_field("from"));
    }

    #[test]
    fn test_missing_recipients() {
        let result = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("test")
            .build();

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            BuilderError::missing_field("recipients")
        );
    }

    #[test]
    fn test_too_many_recipients() {
        let mut builder = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("test");

        // Add 51 recipients (exceeds AWS SES limit of 50)
        for i in 0..51 {
            let dest = Destination::new().add_to(format!("user{}@example.com", i));
            let entry = BulkEmailEntry::new(dest);
            builder = builder.add_recipient(entry);
        }

        let result = builder.build();
        assert!(result.is_err());

        match result.unwrap_err() {
            BuilderError::InvalidValue { field, message } => {
                assert_eq!(field, "recipients");
                assert!(message.contains("Too many recipients"));
                assert!(message.contains("50"));
            }
            _ => panic!("Expected InvalidValue error"),
        }
    }

    #[test]
    fn test_recipient_with_no_addresses() {
        let dest = Destination::new(); // Empty destination
        let entry = BulkEmailEntry::new(dest);

        let result = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("test")
            .add_recipient(entry)
            .build();

        assert!(result.is_err());
        match result.unwrap_err() {
            BuilderError::InvalidValue { field, message } => {
                assert_eq!(field, "recipients");
                assert!(message.contains("no email addresses"));
            }
            _ => panic!("Expected InvalidValue error"),
        }
    }

    #[test]
    fn test_multiple_recipients_with_personalization() {
        let dest1 = Destination::new().add_to("alice@example.com");
        let entry1 = BulkEmailEntry::new(dest1)
            .with_template_data(serde_json::json!({"name": "Alice"}));

        let dest2 = Destination::new().add_to("bob@example.com");
        let entry2 =
            BulkEmailEntry::new(dest2).with_template_data(serde_json::json!({"name": "Bob"}));

        let request = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("welcome")
            .add_recipient(entry1)
            .add_recipient(entry2)
            .build()
            .unwrap();

        assert_eq!(request.bulk_email_entries.len(), 2);
        assert!(request.bulk_email_entries[0]
            .replacement_template_data
            .is_some());
        assert!(request.bulk_email_entries[1]
            .replacement_template_data
            .is_some());
    }

    #[test]
    fn test_max_recipients() {
        let mut builder = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("test");

        // Add exactly 50 recipients (the limit)
        for i in 0..50 {
            let dest = Destination::new().add_to(format!("user{}@example.com", i));
            let entry = BulkEmailEntry::new(dest);
            builder = builder.add_recipient(entry);
        }

        let result = builder.build();
        assert!(result.is_ok());
        assert_eq!(result.unwrap().bulk_email_entries.len(), 50);
    }

    #[test]
    fn test_multiple_reply_to() {
        let dest = Destination::new().add_to("user@example.com");
        let entry = BulkEmailEntry::new(dest);

        let request = BulkEmailBuilder::new()
            .from("sender@example.com")
            .default_template("test")
            .reply_to("support@example.com")
            .reply_to("info@example.com")
            .add_recipient(entry)
            .build()
            .unwrap();

        assert!(request.reply_to_addresses.is_some());
        assert_eq!(request.reply_to_addresses.unwrap().len(), 2);
    }
}
