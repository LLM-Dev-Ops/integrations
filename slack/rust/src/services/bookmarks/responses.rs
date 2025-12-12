//! Response types for bookmarks service.

use serde::Deserialize;

/// Response from bookmarks.add
#[derive(Debug, Clone, Deserialize)]
pub struct AddBookmarkResponse {
    /// Success indicator
    pub ok: bool,
    /// Created bookmark
    pub bookmark: Bookmark,
}

/// Response from bookmarks.edit
#[derive(Debug, Clone, Deserialize)]
pub struct EditBookmarkResponse {
    /// Success indicator
    pub ok: bool,
    /// Updated bookmark
    pub bookmark: Bookmark,
}

/// Response from bookmarks.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListBookmarksResponse {
    /// Success indicator
    pub ok: bool,
    /// List of bookmarks
    #[serde(default)]
    pub bookmarks: Vec<Bookmark>,
}

/// Response from bookmarks.remove
#[derive(Debug, Clone, Deserialize)]
pub struct RemoveBookmarkResponse {
    /// Success indicator
    pub ok: bool,
}

/// Bookmark representation
#[derive(Debug, Clone, Deserialize)]
pub struct Bookmark {
    /// Bookmark ID
    pub id: String,
    /// Channel ID
    pub channel_id: String,
    /// Bookmark title
    pub title: String,
    /// Link URL
    #[serde(default)]
    pub link: Option<String>,
    /// Emoji icon
    #[serde(default)]
    pub emoji: Option<String>,
    /// Icon URL
    #[serde(default)]
    pub icon_url: Option<String>,
    /// Type of bookmark
    #[serde(rename = "type")]
    pub bookmark_type: String,
    /// Entity ID
    #[serde(default)]
    pub entity_id: Option<String>,
    /// Date created (Unix timestamp)
    pub date_created: i64,
    /// Date updated (Unix timestamp)
    pub date_updated: i64,
    /// Rank (position in list)
    pub rank: String,
    /// Last updated by user ID
    #[serde(default)]
    pub last_updated_by_user_id: Option<String>,
    /// Last updated by team ID
    #[serde(default)]
    pub last_updated_by_team_id: Option<String>,
    /// Shortcut ID
    #[serde(default)]
    pub shortcut_id: Option<String>,
    /// App ID
    #[serde(default)]
    pub app_id: Option<String>,
    /// Parent ID (for folders)
    #[serde(default)]
    pub parent_id: Option<String>,
}

impl Bookmark {
    /// Check if this is a link bookmark
    pub fn is_link(&self) -> bool {
        self.bookmark_type == "link"
    }

    /// Get the effective URL
    pub fn url(&self) -> Option<&str> {
        self.link.as_deref()
    }
}
