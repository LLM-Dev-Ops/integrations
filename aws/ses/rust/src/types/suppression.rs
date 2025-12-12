//! Suppression list types for SES v2.
//!
//! The suppression list helps prevent sending to addresses that have bounced or complained.

use serde::{Deserialize, Serialize};

/// Information about a suppressed destination.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SuppressedDestination {
    /// The email address that is suppressed.
    pub email_address: String,
    /// The reason the email address was added to the suppression list.
    pub reason: SuppressionReason,
    /// The date and time when the email address was added to the suppression list.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_update_time: Option<String>,
    /// Additional attributes about the suppressed destination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attributes: Option<SuppressionAttributes>,
}

impl SuppressedDestination {
    /// Create a new suppressed destination.
    pub fn new(email: impl Into<String>, reason: SuppressionReason) -> Self {
        Self {
            email_address: email.into(),
            reason,
            last_update_time: None,
            attributes: None,
        }
    }

    /// Set last update time.
    pub fn with_last_update_time(mut self, time: impl Into<String>) -> Self {
        self.last_update_time = Some(time.into());
        self
    }

    /// Set suppression attributes.
    pub fn with_attributes(mut self, attributes: SuppressionAttributes) -> Self {
        self.attributes = Some(attributes);
        self
    }
}

/// Summary information about a suppressed destination.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SuppressedDestinationSummary {
    /// The email address that is suppressed.
    pub email_address: String,
    /// The reason the email address was added to the suppression list.
    pub reason: SuppressionReason,
    /// The date and time when the email address was added to the suppression list.
    pub last_update_time: String,
}

impl SuppressedDestinationSummary {
    /// Create a new suppressed destination summary.
    pub fn new(
        email: impl Into<String>,
        reason: SuppressionReason,
        last_update_time: impl Into<String>,
    ) -> Self {
        Self {
            email_address: email.into(),
            reason,
            last_update_time: last_update_time.into(),
        }
    }
}

/// The reason an email address was added to the suppression list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SuppressionReason {
    /// The email bounced.
    Bounce,
    /// The recipient complained about the email.
    Complaint,
}

impl SuppressionReason {
    /// Returns the string representation for the SES API.
    pub fn as_str(&self) -> &'static str {
        match self {
            SuppressionReason::Bounce => "BOUNCE",
            SuppressionReason::Complaint => "COMPLAINT",
        }
    }

    /// Check if this is a bounce suppression.
    pub fn is_bounce(&self) -> bool {
        matches!(self, SuppressionReason::Bounce)
    }

    /// Check if this is a complaint suppression.
    pub fn is_complaint(&self) -> bool {
        matches!(self, SuppressionReason::Complaint)
    }
}

/// Additional attributes about a suppressed destination.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SuppressionAttributes {
    /// The unique identifier for the bounce or complaint event.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    /// The feedback ID for the bounce or complaint.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_id: Option<String>,
}

impl SuppressionAttributes {
    /// Create new suppression attributes.
    pub fn new() -> Self {
        Self {
            message_id: None,
            feedback_id: None,
        }
    }

    /// Set message ID.
    pub fn with_message_id(mut self, message_id: impl Into<String>) -> Self {
        self.message_id = Some(message_id.into());
        self
    }

    /// Set feedback ID.
    pub fn with_feedback_id(mut self, feedback_id: impl Into<String>) -> Self {
        self.feedback_id = Some(feedback_id.into());
        self
    }
}

impl Default for SuppressionAttributes {
    fn default() -> Self {
        Self::new()
    }
}

/// Reasons for suppressing email addresses in suppression list configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SuppressionListReason {
    /// Suppress bounced email addresses.
    Bounce,
    /// Suppress email addresses that generated complaints.
    Complaint,
}

impl SuppressionListReason {
    /// Returns the string representation for the SES API.
    pub fn as_str(&self) -> &'static str {
        match self {
            SuppressionListReason::Bounce => "BOUNCE",
            SuppressionListReason::Complaint => "COMPLAINT",
        }
    }
}

impl From<SuppressionReason> for SuppressionListReason {
    fn from(reason: SuppressionReason) -> Self {
        match reason {
            SuppressionReason::Bounce => SuppressionListReason::Bounce,
            SuppressionReason::Complaint => SuppressionListReason::Complaint,
        }
    }
}

impl From<SuppressionListReason> for SuppressionReason {
    fn from(reason: SuppressionListReason) -> Self {
        match reason {
            SuppressionListReason::Bounce => SuppressionReason::Bounce,
            SuppressionListReason::Complaint => SuppressionReason::Complaint,
        }
    }
}

// Re-export SuppressedDestinationAttributes as an alias for SuppressionAttributes
// for backward compatibility
pub use SuppressionAttributes as SuppressedDestinationAttributes;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_suppressed_destination() {
        let dest = SuppressedDestination::new("bounce@example.com", SuppressionReason::Bounce)
            .with_last_update_time("2024-01-01T00:00:00Z");

        assert_eq!(dest.email_address, "bounce@example.com");
        assert_eq!(dest.reason, SuppressionReason::Bounce);
        assert!(dest.reason.is_bounce());
        assert!(!dest.reason.is_complaint());
    }

    #[test]
    fn test_suppression_reason() {
        assert_eq!(SuppressionReason::Bounce.as_str(), "BOUNCE");
        assert_eq!(SuppressionReason::Complaint.as_str(), "COMPLAINT");

        assert!(SuppressionReason::Bounce.is_bounce());
        assert!(!SuppressionReason::Bounce.is_complaint());

        assert!(!SuppressionReason::Complaint.is_bounce());
        assert!(SuppressionReason::Complaint.is_complaint());
    }

    #[test]
    fn test_suppression_attributes() {
        let attrs = SuppressionAttributes::new()
            .with_message_id("msg-123")
            .with_feedback_id("feedback-456");

        assert_eq!(attrs.message_id, Some("msg-123".to_string()));
        assert_eq!(attrs.feedback_id, Some("feedback-456".to_string()));
    }

    #[test]
    fn test_conversion_between_suppression_types() {
        let reason = SuppressionReason::Bounce;
        let list_reason: SuppressionListReason = reason.into();
        assert_eq!(list_reason, SuppressionListReason::Bounce);

        let back: SuppressionReason = list_reason.into();
        assert_eq!(back, reason);
    }
}
