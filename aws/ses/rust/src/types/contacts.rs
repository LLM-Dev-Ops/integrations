//! Contact management types for SES v2.
//!
//! These types support contact list management and email subscriptions.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Contact information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Contact {
    /// The contact's email address.
    pub email_address: String,
    /// Topic preferences for the contact.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_preferences: Option<Vec<TopicPreference>>,
    /// Default topic preferences.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_default_preferences: Option<Vec<TopicPreference>>,
    /// Subscription status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unsubscribe_all: Option<bool>,
    /// Custom attributes for the contact.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attributes_data: Option<String>,
    /// Creation timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_timestamp: Option<String>,
    /// Last updated timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated_timestamp: Option<String>,
}

impl Contact {
    /// Create a new contact with the given email address.
    pub fn new(email: impl Into<String>) -> Self {
        Self {
            email_address: email.into(),
            topic_preferences: None,
            topic_default_preferences: None,
            unsubscribe_all: None,
            attributes_data: None,
            created_timestamp: None,
            last_updated_timestamp: None,
        }
    }

    /// Set topic preferences.
    pub fn with_topic_preferences(mut self, preferences: Vec<TopicPreference>) -> Self {
        self.topic_preferences = Some(preferences);
        self
    }

    /// Add a topic preference.
    pub fn add_topic_preference(mut self, preference: TopicPreference) -> Self {
        self.topic_preferences
            .get_or_insert_with(Vec::new)
            .push(preference);
        self
    }

    /// Set unsubscribe all status.
    pub fn with_unsubscribe_all(mut self, unsubscribe: bool) -> Self {
        self.unsubscribe_all = Some(unsubscribe);
        self
    }

    /// Set custom attributes as JSON string.
    pub fn with_attributes(mut self, attributes: serde_json::Value) -> Self {
        self.attributes_data = Some(attributes.to_string());
        self
    }
}

/// Contact list information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ContactList {
    /// The name of the contact list.
    pub contact_list_name: String,
    /// Description of the contact list.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Topics associated with the contact list.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topics: Option<Vec<Topic>>,
    /// Creation timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_timestamp: Option<String>,
    /// Last updated timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated_timestamp: Option<String>,
}

impl ContactList {
    /// Create a new contact list with the given name.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            contact_list_name: name.into(),
            description: None,
            topics: None,
            created_timestamp: None,
            last_updated_timestamp: None,
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

    /// Add a topic.
    pub fn add_topic(mut self, topic: Topic) -> Self {
        self.topics.get_or_insert_with(Vec::new).push(topic);
        self
    }
}

/// Topic preference for a contact.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct TopicPreference {
    /// The name of the topic.
    pub topic_name: String,
    /// Subscription status for this topic.
    pub subscription_status: SubscriptionStatus,
}

impl TopicPreference {
    /// Create a new topic preference.
    pub fn new(topic_name: impl Into<String>, status: SubscriptionStatus) -> Self {
        Self {
            topic_name: topic_name.into(),
            subscription_status: status,
        }
    }

    /// Create a subscribed topic preference.
    pub fn subscribed(topic_name: impl Into<String>) -> Self {
        Self::new(topic_name, SubscriptionStatus::OptIn)
    }

    /// Create an unsubscribed topic preference.
    pub fn unsubscribed(topic_name: impl Into<String>) -> Self {
        Self::new(topic_name, SubscriptionStatus::OptOut)
    }
}

/// Topic information for a contact list.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Topic {
    /// The name of the topic.
    pub topic_name: String,
    /// The display name for the topic.
    pub display_name: String,
    /// Description of the topic.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Default subscription status.
    pub default_subscription_status: SubscriptionStatus,
}

impl Topic {
    /// Create a new topic.
    pub fn new(
        topic_name: impl Into<String>,
        display_name: impl Into<String>,
        default_status: SubscriptionStatus,
    ) -> Self {
        Self {
            topic_name: topic_name.into(),
            display_name: display_name.into(),
            description: None,
            default_subscription_status: default_status,
        }
    }

    /// Set description.
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }
}

/// Subscription status for a topic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SubscriptionStatus {
    /// Contact has opted in to receive emails for this topic.
    OptIn,
    /// Contact has opted out of receiving emails for this topic.
    OptOut,
}

impl SubscriptionStatus {
    /// Check if the contact is subscribed.
    pub fn is_subscribed(&self) -> bool {
        matches!(self, SubscriptionStatus::OptIn)
    }

    /// Check if the contact is unsubscribed.
    pub fn is_unsubscribed(&self) -> bool {
        matches!(self, SubscriptionStatus::OptOut)
    }
}

/// Import destination for contact list.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ImportDestination {
    /// Contact list destination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_list_destination: Option<ContactListDestination>,
    /// Suppression list destination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppression_list_destination: Option<SuppressionListDestination>,
}

/// Contact list destination for imports.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ContactListDestination {
    /// The name of the contact list.
    pub contact_list_name: String,
    /// How to handle contacts that already exist.
    pub contact_list_import_action: ContactListImportAction,
}

/// Action to take when importing contacts that already exist.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ContactListImportAction {
    /// Delete existing contacts.
    Delete,
    /// Add new contacts to the list.
    Put,
}

/// Suppression list destination for imports.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SuppressionListDestination {
    /// The suppression list import action.
    pub suppression_list_import_action: SuppressionListImportAction,
}

/// Action to take when importing to suppression list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SuppressionListImportAction {
    /// Delete existing suppressed destinations.
    Delete,
    /// Add destinations to the suppression list.
    Put,
}

/// Data format for contact import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DataFormat {
    /// CSV format.
    Csv,
    /// JSON format.
    Json,
}

/// Import job summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ImportJobSummary {
    /// Job ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_id: Option<String>,
    /// Import destination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub import_destination: Option<ImportDestination>,
    /// Job status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_status: Option<JobStatus>,
    /// Creation timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_timestamp: Option<String>,
}

/// Job status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JobStatus {
    /// Job is being created.
    Created,
    /// Job is processing.
    Processing,
    /// Job completed successfully.
    Completed,
    /// Job failed.
    Failed,
    /// Job was cancelled.
    Cancelled,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contact_creation() {
        let contact = Contact::new("user@example.com")
            .add_topic_preference(TopicPreference::subscribed("newsletter"))
            .with_unsubscribe_all(false);

        assert_eq!(contact.email_address, "user@example.com");
        assert_eq!(contact.topic_preferences.as_ref().unwrap().len(), 1);
        assert_eq!(contact.unsubscribe_all, Some(false));
    }

    #[test]
    fn test_contact_list_creation() {
        let contact_list = ContactList::new("my-list")
            .with_description("My contact list")
            .add_topic(Topic::new(
                "news",
                "Newsletter",
                SubscriptionStatus::OptOut,
            ));

        assert_eq!(contact_list.contact_list_name, "my-list");
        assert_eq!(contact_list.description, Some("My contact list".to_string()));
        assert_eq!(contact_list.topics.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn test_topic_preference() {
        let pref = TopicPreference::subscribed("newsletter");
        assert_eq!(pref.topic_name, "newsletter");
        assert!(pref.subscription_status.is_subscribed());
        assert!(!pref.subscription_status.is_unsubscribed());
    }

    #[test]
    fn test_subscription_status() {
        assert!(SubscriptionStatus::OptIn.is_subscribed());
        assert!(!SubscriptionStatus::OptIn.is_unsubscribed());
        assert!(!SubscriptionStatus::OptOut.is_subscribed());
        assert!(SubscriptionStatus::OptOut.is_unsubscribed());
    }

    #[test]
    fn test_topic_creation() {
        let topic = Topic::new("updates", "Product Updates", SubscriptionStatus::OptIn)
            .with_description("Weekly product updates");

        assert_eq!(topic.topic_name, "updates");
        assert_eq!(topic.display_name, "Product Updates");
        assert_eq!(topic.description, Some("Weekly product updates".to_string()));
    }
}
