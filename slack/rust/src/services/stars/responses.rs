//! Response types for stars service.

use crate::types::{Message, ResponseMetadata};
use serde::Deserialize;

/// Response from stars.add
#[derive(Debug, Clone, Deserialize)]
pub struct AddStarResponse {
    /// Success indicator
    pub ok: bool,
}

/// Response from stars.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListStarsResponse {
    /// Success indicator
    pub ok: bool,
    /// Starred items
    #[serde(default)]
    pub items: Vec<StarredItem>,
    /// Paging information
    #[serde(default)]
    pub paging: Option<StarsPaging>,
    /// Response metadata for cursor-based pagination
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

/// Paging information for starred items
#[derive(Debug, Clone, Deserialize)]
pub struct StarsPaging {
    /// Total count
    pub count: i32,
    /// Total number
    pub total: i32,
    /// Current page
    pub page: i32,
    /// Total pages
    pub pages: i32,
}

impl StarsPaging {
    /// Check if there are more pages
    pub fn has_more(&self) -> bool {
        self.page < self.pages
    }
}

/// A starred item (can be message, file, channel, etc.)
#[derive(Debug, Clone, Deserialize)]
pub struct StarredItem {
    /// Type of starred item
    #[serde(rename = "type")]
    pub item_type: String,
    /// Channel ID (for messages)
    #[serde(default)]
    pub channel: Option<String>,
    /// Message (if type is message)
    #[serde(default)]
    pub message: Option<Message>,
    /// File (if type is file)
    #[serde(default)]
    pub file: Option<StarredFile>,
    /// File comment (if type is file_comment)
    #[serde(default)]
    pub file_comment: Option<StarredFileComment>,
    /// Channel info (if type is channel)
    #[serde(default)]
    pub channel_info: Option<StarredChannel>,
    /// IM info (if type is im)
    #[serde(default)]
    pub im: Option<StarredIm>,
    /// Group info (if type is group)
    #[serde(default)]
    pub group: Option<StarredGroup>,
    /// Date starred (Unix timestamp)
    #[serde(default)]
    pub date_create: Option<i64>,
}

impl StarredItem {
    /// Check if this is a starred message
    pub fn is_message(&self) -> bool {
        self.item_type == "message"
    }

    /// Check if this is a starred file
    pub fn is_file(&self) -> bool {
        self.item_type == "file"
    }

    /// Check if this is a starred channel
    pub fn is_channel(&self) -> bool {
        self.item_type == "channel"
    }
}

/// Starred file information
#[derive(Debug, Clone, Deserialize)]
pub struct StarredFile {
    /// File ID
    pub id: String,
    /// File name
    #[serde(default)]
    pub name: Option<String>,
    /// File title
    #[serde(default)]
    pub title: Option<String>,
    /// MIME type
    #[serde(default)]
    pub mimetype: Option<String>,
    /// File type
    #[serde(default)]
    pub filetype: Option<String>,
    /// User who created the file
    #[serde(default)]
    pub user: Option<String>,
    /// Created timestamp
    #[serde(default)]
    pub created: Option<i64>,
    /// Permalink
    #[serde(default)]
    pub permalink: Option<String>,
    /// File size
    #[serde(default)]
    pub size: Option<i64>,
}

/// Starred file comment
#[derive(Debug, Clone, Deserialize)]
pub struct StarredFileComment {
    /// Comment ID
    pub id: String,
    /// Comment text
    #[serde(default)]
    pub comment: Option<String>,
    /// User who created the comment
    #[serde(default)]
    pub user: Option<String>,
    /// Created timestamp
    #[serde(default)]
    pub created: Option<i64>,
}

/// Starred channel information
#[derive(Debug, Clone, Deserialize)]
pub struct StarredChannel {
    /// Channel ID
    pub id: String,
    /// Channel name
    #[serde(default)]
    pub name: Option<String>,
    /// Whether channel is private
    #[serde(default)]
    pub is_private: Option<bool>,
    /// Whether user is a member
    #[serde(default)]
    pub is_member: Option<bool>,
}

/// Starred IM information
#[derive(Debug, Clone, Deserialize)]
pub struct StarredIm {
    /// IM ID
    pub id: String,
    /// User ID
    #[serde(default)]
    pub user: Option<String>,
}

/// Starred group information
#[derive(Debug, Clone, Deserialize)]
pub struct StarredGroup {
    /// Group ID
    pub id: String,
    /// Group name
    #[serde(default)]
    pub name: Option<String>,
}

/// Response from stars.remove
#[derive(Debug, Clone, Deserialize)]
pub struct RemoveStarResponse {
    /// Success indicator
    pub ok: bool,
}
