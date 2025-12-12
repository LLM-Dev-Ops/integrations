//! Response types for search service.

use crate::types::Message;
use serde::Deserialize;

/// Response from search.messages
#[derive(Debug, Clone, Deserialize)]
pub struct SearchMessagesResponse {
    /// Success indicator
    pub ok: bool,
    /// Search query
    pub query: String,
    /// Messages search results
    pub messages: SearchResults,
}

/// Response from search.files
#[derive(Debug, Clone, Deserialize)]
pub struct SearchFilesResponse {
    /// Success indicator
    pub ok: bool,
    /// Search query
    pub query: String,
    /// Files search results
    pub files: SearchResults,
}

/// Response from search.all
#[derive(Debug, Clone, Deserialize)]
pub struct SearchAllResponse {
    /// Success indicator
    pub ok: bool,
    /// Search query
    pub query: String,
    /// Messages search results
    pub messages: SearchResults,
    /// Files search results
    pub files: SearchResults,
}

/// Search results container
#[derive(Debug, Clone, Deserialize)]
pub struct SearchResults {
    /// Total number of matches
    pub total: i32,
    /// Pagination information
    #[serde(default)]
    pub pagination: Option<SearchPagination>,
    /// Paging information (legacy)
    #[serde(default)]
    pub paging: Option<SearchPaging>,
    /// Matched items (messages or files)
    #[serde(default)]
    pub matches: Vec<SearchMatch>,
}

impl SearchResults {
    /// Check if there are more results
    pub fn has_more(&self) -> bool {
        if let Some(pagination) = &self.pagination {
            pagination.page < pagination.page_count
        } else if let Some(paging) = &self.paging {
            paging.page < paging.pages
        } else {
            false
        }
    }

    /// Get the total number of results
    pub fn total_count(&self) -> i32 {
        self.total
    }
}

/// Pagination information
#[derive(Debug, Clone, Deserialize)]
pub struct SearchPagination {
    /// Total count
    pub total_count: i32,
    /// Current page (1-indexed)
    pub page: i32,
    /// Items per page
    pub per_page: i32,
    /// Total number of pages
    pub page_count: i32,
    /// First item index
    pub first: i32,
    /// Last item index
    pub last: i32,
}

/// Paging information (legacy)
#[derive(Debug, Clone, Deserialize)]
pub struct SearchPaging {
    /// Total count
    pub count: i32,
    /// Total number of items
    pub total: i32,
    /// Current page
    pub page: i32,
    /// Total number of pages
    pub pages: i32,
}

/// Search match (can be a message or file)
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum SearchMatch {
    /// Message match
    Message(MessageMatch),
    /// File match
    File(FileMatch),
}

/// Message search match
#[derive(Debug, Clone, Deserialize)]
pub struct MessageMatch {
    /// Type (should be "message")
    #[serde(rename = "type")]
    pub match_type: String,
    /// Channel information
    #[serde(default)]
    pub channel: Option<ChannelInfo>,
    /// User ID who posted the message
    #[serde(default)]
    pub user: Option<String>,
    /// Username who posted the message
    #[serde(default)]
    pub username: Option<String>,
    /// Message timestamp
    #[serde(default)]
    pub ts: Option<String>,
    /// Message text
    #[serde(default)]
    pub text: Option<String>,
    /// Permalink
    #[serde(default)]
    pub permalink: Option<String>,
    /// Previous message (for context)
    #[serde(default)]
    pub previous: Option<Message>,
    /// Previous message (alternate field)
    #[serde(default)]
    pub previous_2: Option<Message>,
    /// Next message (for context)
    #[serde(default)]
    pub next: Option<Message>,
    /// Next message (alternate field)
    #[serde(default)]
    pub next_2: Option<Message>,
}

/// File search match
#[derive(Debug, Clone, Deserialize)]
pub struct FileMatch {
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
    /// Pretty type
    #[serde(default)]
    pub pretty_type: Option<String>,
    /// User who created the file
    #[serde(default)]
    pub user: Option<String>,
    /// User name who created the file
    #[serde(default)]
    pub username: Option<String>,
    /// Created timestamp
    #[serde(default)]
    pub created: Option<i64>,
    /// Updated timestamp
    #[serde(default)]
    pub timestamp: Option<i64>,
    /// Permalink
    #[serde(default)]
    pub permalink: Option<String>,
    /// Permalink public
    #[serde(default)]
    pub permalink_public: Option<String>,
    /// File size
    #[serde(default)]
    pub size: Option<i64>,
    /// Preview text
    #[serde(default)]
    pub preview: Option<String>,
    /// Channels the file is in
    #[serde(default)]
    pub channels: Vec<String>,
    /// Groups the file is in
    #[serde(default)]
    pub groups: Vec<String>,
    /// IMs the file is in
    #[serde(default)]
    pub ims: Vec<String>,
}

/// Channel information in search results
#[derive(Debug, Clone, Deserialize)]
pub struct ChannelInfo {
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
