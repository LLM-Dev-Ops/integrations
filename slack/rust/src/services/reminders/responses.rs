//! Response types for reminders service.

use serde::Deserialize;

/// Response from reminders.add
#[derive(Debug, Clone, Deserialize)]
pub struct AddReminderResponse {
    /// Success indicator
    pub ok: bool,
    /// Created reminder
    pub reminder: Reminder,
}

/// Response from reminders.complete
#[derive(Debug, Clone, Deserialize)]
pub struct CompleteReminderResponse {
    /// Success indicator
    pub ok: bool,
}

/// Response from reminders.delete
#[derive(Debug, Clone, Deserialize)]
pub struct DeleteReminderResponse {
    /// Success indicator
    pub ok: bool,
}

/// Response from reminders.info
#[derive(Debug, Clone, Deserialize)]
pub struct InfoReminderResponse {
    /// Success indicator
    pub ok: bool,
    /// Reminder information
    pub reminder: Reminder,
}

/// Response from reminders.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListRemindersResponse {
    /// Success indicator
    pub ok: bool,
    /// List of reminders
    #[serde(default)]
    pub reminders: Vec<Reminder>,
}

/// Reminder representation
#[derive(Debug, Clone, Deserialize)]
pub struct Reminder {
    /// Reminder ID
    pub id: String,
    /// User who created the reminder
    pub creator: String,
    /// User who will receive the reminder
    pub user: String,
    /// Reminder text
    pub text: String,
    /// Whether recurring
    #[serde(default)]
    pub recurring: bool,
    /// Time the reminder will fire (Unix timestamp)
    pub time: i64,
    /// Whether the reminder is complete
    #[serde(default)]
    pub complete_ts: Option<i64>,
}

impl Reminder {
    /// Check if the reminder has been completed
    pub fn is_completed(&self) -> bool {
        self.complete_ts.is_some()
    }

    /// Check if the reminder is recurring
    pub fn is_recurring(&self) -> bool {
        self.recurring
    }

    /// Get the reminder time as a timestamp
    pub fn fire_time(&self) -> i64 {
        self.time
    }
}
