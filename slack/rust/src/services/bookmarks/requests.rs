//! Request types for bookmarks service.

use crate::types::ChannelId;
use serde::Serialize;

/// Request to add a bookmark
#[derive(Debug, Clone, Serialize)]
pub struct AddBookmarkRequest {
    /// Channel to add bookmark to
    pub channel_id: ChannelId,
    /// Title of the bookmark
    pub title: String,
    /// Type of bookmark (link)
    #[serde(rename = "type")]
    pub bookmark_type: String,
    /// Link URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    /// Emoji to use as the icon
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
    /// ID of an entity to associate with this bookmark
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    /// ID of the parent bookmark folder
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

impl AddBookmarkRequest {
    /// Create a new link bookmark
    pub fn new_link(
        channel: impl Into<ChannelId>,
        title: impl Into<String>,
        link: impl Into<String>,
    ) -> Self {
        Self {
            channel_id: channel.into(),
            title: title.into(),
            bookmark_type: "link".to_string(),
            link: Some(link.into()),
            emoji: None,
            entity_id: None,
            parent_id: None,
        }
    }

    /// Set the emoji icon
    pub fn emoji(mut self, emoji: impl Into<String>) -> Self {
        self.emoji = Some(emoji.into());
        self
    }

    /// Set the parent folder
    pub fn parent_id(mut self, parent_id: impl Into<String>) -> Self {
        self.parent_id = Some(parent_id.into());
        self
    }
}

/// Request to edit a bookmark
#[derive(Debug, Clone, Serialize)]
pub struct EditBookmarkRequest {
    /// Bookmark ID to edit
    pub bookmark_id: String,
    /// Channel containing the bookmark
    pub channel_id: ChannelId,
    /// New title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// New emoji
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
    /// New link
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
}

impl EditBookmarkRequest {
    /// Create a new edit request
    pub fn new(bookmark_id: impl Into<String>, channel: impl Into<ChannelId>) -> Self {
        Self {
            bookmark_id: bookmark_id.into(),
            channel_id: channel.into(),
            title: None,
            emoji: None,
            link: None,
        }
    }

    /// Set new title
    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    /// Set new emoji
    pub fn emoji(mut self, emoji: impl Into<String>) -> Self {
        self.emoji = Some(emoji.into());
        self
    }

    /// Set new link
    pub fn link(mut self, link: impl Into<String>) -> Self {
        self.link = Some(link.into());
        self
    }
}

/// Request to list bookmarks
#[derive(Debug, Clone, Serialize)]
pub struct ListBookmarksRequest {
    /// Channel to list bookmarks from
    pub channel_id: ChannelId,
}

impl ListBookmarksRequest {
    /// Create a new list request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel_id: channel.into(),
        }
    }
}

/// Request to remove a bookmark
#[derive(Debug, Clone, Serialize)]
pub struct RemoveBookmarkRequest {
    /// Bookmark ID to remove
    pub bookmark_id: String,
    /// Channel containing the bookmark
    pub channel_id: ChannelId,
}

impl RemoveBookmarkRequest {
    /// Create a new remove request
    pub fn new(bookmark_id: impl Into<String>, channel: impl Into<ChannelId>) -> Self {
        Self {
            bookmark_id: bookmark_id.into(),
            channel_id: channel.into(),
        }
    }
}
