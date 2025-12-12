//! Request types for reminders service.

use serde::Serialize;

/// Request to add a reminder
#[derive(Debug, Clone, Serialize)]
pub struct AddReminderRequest {
    /// Text of the reminder
    pub text: String,
    /// When the reminder should occur (Unix timestamp or natural language)
    pub time: String,
    /// User to receive the reminder (defaults to authed user)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl AddReminderRequest {
    /// Create a new reminder request
    pub fn new(text: impl Into<String>, time: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            time: time.into(),
            user: None,
            team_id: None,
        }
    }

    /// Set the user to remind
    pub fn user(mut self, user: impl Into<String>) -> Self {
        self.user = Some(user.into());
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to complete a reminder
#[derive(Debug, Clone, Serialize)]
pub struct CompleteReminderRequest {
    /// Reminder ID
    pub reminder: String,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl CompleteReminderRequest {
    /// Create a new complete reminder request
    pub fn new(reminder_id: impl Into<String>) -> Self {
        Self {
            reminder: reminder_id.into(),
            team_id: None,
        }
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to delete a reminder
#[derive(Debug, Clone, Serialize)]
pub struct DeleteReminderRequest {
    /// Reminder ID
    pub reminder: String,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl DeleteReminderRequest {
    /// Create a new delete reminder request
    pub fn new(reminder_id: impl Into<String>) -> Self {
        Self {
            reminder: reminder_id.into(),
            team_id: None,
        }
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to get reminder info
#[derive(Debug, Clone, Serialize)]
pub struct InfoReminderRequest {
    /// Reminder ID
    pub reminder: String,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl InfoReminderRequest {
    /// Create a new info reminder request
    pub fn new(reminder_id: impl Into<String>) -> Self {
        Self {
            reminder: reminder_id.into(),
            team_id: None,
        }
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to list reminders
#[derive(Debug, Clone, Serialize, Default)]
pub struct ListRemindersRequest {
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl ListRemindersRequest {
    /// Create a new list reminders request
    pub fn new() -> Self {
        Self::default()
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}
