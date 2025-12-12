//! Request types for stars service.

use crate::types::{ChannelId, FileId, Timestamp};
use serde::Serialize;

/// Request to add a star
#[derive(Debug, Clone, Serialize)]
pub struct AddStarRequest {
    /// Channel ID to star (for messages)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelId>,
    /// File ID to star
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<FileId>,
    /// File comment ID to star
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_comment: Option<String>,
    /// Message timestamp to star
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<Timestamp>,
}

impl AddStarRequest {
    /// Create a new add star request
    pub fn new() -> Self {
        Self {
            channel: None,
            file: None,
            file_comment: None,
            timestamp: None,
        }
    }

    /// Star a message
    pub fn message(channel: impl Into<ChannelId>, timestamp: impl Into<Timestamp>) -> Self {
        Self {
            channel: Some(channel.into()),
            file: None,
            file_comment: None,
            timestamp: Some(timestamp.into()),
        }
    }

    /// Star a file
    pub fn file(file_id: impl Into<FileId>) -> Self {
        Self {
            channel: None,
            file: Some(file_id.into()),
            file_comment: None,
            timestamp: None,
        }
    }

    /// Star a file comment
    pub fn file_comment(file_comment_id: impl Into<String>) -> Self {
        Self {
            channel: None,
            file: None,
            file_comment: Some(file_comment_id.into()),
            timestamp: None,
        }
    }
}

impl Default for AddStarRequest {
    fn default() -> Self {
        Self::new()
    }
}

/// Request to list starred items
#[derive(Debug, Clone, Serialize)]
pub struct ListStarsRequest {
    /// Number of items to return per page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i32>,
    /// Cursor for pagination
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    /// Maximum number of items to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    /// Page number (1-indexed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<i32>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl Default for ListStarsRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl ListStarsRequest {
    /// Create a new list stars request
    pub fn new() -> Self {
        Self {
            count: None,
            cursor: None,
            limit: None,
            page: None,
            team_id: None,
        }
    }

    /// Set the count
    pub fn count(mut self, count: i32) -> Self {
        self.count = Some(count);
        self
    }

    /// Set the cursor for pagination
    pub fn cursor(mut self, cursor: impl Into<String>) -> Self {
        self.cursor = Some(cursor.into());
        self
    }

    /// Set the limit
    pub fn limit(mut self, limit: i32) -> Self {
        self.limit = Some(limit);
        self
    }

    /// Set the page
    pub fn page(mut self, page: i32) -> Self {
        self.page = Some(page);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to remove a star
#[derive(Debug, Clone, Serialize)]
pub struct RemoveStarRequest {
    /// Channel ID (for messages)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelId>,
    /// File ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<FileId>,
    /// File comment ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_comment: Option<String>,
    /// Message timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<Timestamp>,
}

impl RemoveStarRequest {
    /// Create a new remove star request
    pub fn new() -> Self {
        Self {
            channel: None,
            file: None,
            file_comment: None,
            timestamp: None,
        }
    }

    /// Unstar a message
    pub fn message(channel: impl Into<ChannelId>, timestamp: impl Into<Timestamp>) -> Self {
        Self {
            channel: Some(channel.into()),
            file: None,
            file_comment: None,
            timestamp: Some(timestamp.into()),
        }
    }

    /// Unstar a file
    pub fn file(file_id: impl Into<FileId>) -> Self {
        Self {
            channel: None,
            file: Some(file_id.into()),
            file_comment: None,
            timestamp: None,
        }
    }

    /// Unstar a file comment
    pub fn file_comment(file_comment_id: impl Into<String>) -> Self {
        Self {
            channel: None,
            file: None,
            file_comment: Some(file_comment_id.into()),
            timestamp: None,
        }
    }
}

impl Default for RemoveStarRequest {
    fn default() -> Self {
        Self::new()
    }
}
