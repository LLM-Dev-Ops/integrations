//! Message-related types for the Slack API.

use super::{ChannelId, FileId, Timestamp, UserId};
use serde::{Deserialize, Serialize};

/// Slack message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    /// Message type
    #[serde(rename = "type")]
    pub message_type: String,
    /// Message subtype
    #[serde(default)]
    pub subtype: Option<String>,
    /// Message text
    #[serde(default)]
    pub text: Option<String>,
    /// User who sent the message
    #[serde(default)]
    pub user: Option<UserId>,
    /// Bot ID if sent by a bot
    #[serde(default)]
    pub bot_id: Option<String>,
    /// Message timestamp (unique ID)
    pub ts: Timestamp,
    /// Thread timestamp (if in a thread)
    #[serde(default)]
    pub thread_ts: Option<Timestamp>,
    /// Parent user ID (if in a thread)
    #[serde(default)]
    pub parent_user_id: Option<UserId>,
    /// Reply count (if thread parent)
    #[serde(default)]
    pub reply_count: Option<i32>,
    /// Reply users count
    #[serde(default)]
    pub reply_users_count: Option<i32>,
    /// Latest reply timestamp
    #[serde(default)]
    pub latest_reply: Option<Timestamp>,
    /// Reply users (sample)
    #[serde(default)]
    pub reply_users: Vec<UserId>,
    /// Whether this is starred
    #[serde(default)]
    pub is_starred: Option<bool>,
    /// Reactions on this message
    #[serde(default)]
    pub reactions: Vec<Reaction>,
    /// Attachments
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    /// Block Kit blocks
    #[serde(default)]
    pub blocks: Vec<Block>,
    /// Files attached to message
    #[serde(default)]
    pub files: Vec<File>,
    /// Channel ID (included in some responses)
    #[serde(default)]
    pub channel: Option<ChannelId>,
    /// Team ID
    #[serde(default)]
    pub team: Option<String>,
    /// Edited info
    #[serde(default)]
    pub edited: Option<MessageEdited>,
    /// Permalink
    #[serde(default)]
    pub permalink: Option<String>,
    /// Whether this is a bot message
    #[serde(default)]
    pub bot_profile: Option<BotProfile>,
    /// App ID if sent by an app
    #[serde(default)]
    pub app_id: Option<String>,
    /// Icons
    #[serde(default)]
    pub icons: Option<MessageIcons>,
    /// Username (for bot messages)
    #[serde(default)]
    pub username: Option<String>,
    /// Metadata
    #[serde(default)]
    pub metadata: Option<MessageMetadata>,
}

impl Message {
    /// Check if this message is a thread parent
    pub fn is_thread_parent(&self) -> bool {
        self.reply_count.map(|c| c > 0).unwrap_or(false)
    }

    /// Check if this message is a thread reply
    pub fn is_thread_reply(&self) -> bool {
        self.thread_ts.is_some() && self.thread_ts.as_ref() != Some(&self.ts)
    }

    /// Check if this message is from a bot
    pub fn is_bot_message(&self) -> bool {
        self.bot_id.is_some() || self.subtype.as_deref() == Some("bot_message")
    }

    /// Get the effective text content
    pub fn content(&self) -> &str {
        self.text.as_deref().unwrap_or("")
    }
}

/// Message edit information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageEdited {
    /// User who edited
    pub user: UserId,
    /// Edit timestamp
    pub ts: Timestamp,
}

/// Bot profile information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotProfile {
    /// Bot ID
    pub id: String,
    /// App ID
    #[serde(default)]
    pub app_id: Option<String>,
    /// Bot name
    #[serde(default)]
    pub name: Option<String>,
    /// Bot icons
    #[serde(default)]
    pub icons: Option<BotIcons>,
    /// Whether deleted
    #[serde(default)]
    pub deleted: bool,
    /// Team ID
    #[serde(default)]
    pub team_id: Option<String>,
}

/// Bot icons
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotIcons {
    /// 36x36 icon
    #[serde(rename = "image_36")]
    pub image_36: Option<String>,
    /// 48x48 icon
    #[serde(rename = "image_48")]
    pub image_48: Option<String>,
    /// 72x72 icon
    #[serde(rename = "image_72")]
    pub image_72: Option<String>,
}

/// Message icons
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageIcons {
    /// Emoji icon
    #[serde(default)]
    pub emoji: Option<String>,
    /// Image URL
    #[serde(rename = "image_64")]
    pub image_64: Option<String>,
}

/// Message metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageMetadata {
    /// Event type
    pub event_type: String,
    /// Event payload
    #[serde(default)]
    pub event_payload: serde_json::Value,
}

/// Reaction on a message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    /// Emoji name (without colons)
    pub name: String,
    /// Users who reacted
    pub users: Vec<UserId>,
    /// Reaction count
    pub count: i32,
}

/// Message attachment (legacy)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    /// Attachment ID
    #[serde(default)]
    pub id: Option<i32>,
    /// Fallback text
    #[serde(default)]
    pub fallback: Option<String>,
    /// Color bar
    #[serde(default)]
    pub color: Option<String>,
    /// Pretext
    #[serde(default)]
    pub pretext: Option<String>,
    /// Author name
    #[serde(default)]
    pub author_name: Option<String>,
    /// Author link
    #[serde(default)]
    pub author_link: Option<String>,
    /// Author icon
    #[serde(default)]
    pub author_icon: Option<String>,
    /// Title
    #[serde(default)]
    pub title: Option<String>,
    /// Title link
    #[serde(default)]
    pub title_link: Option<String>,
    /// Main text
    #[serde(default)]
    pub text: Option<String>,
    /// Fields
    #[serde(default)]
    pub fields: Vec<AttachmentField>,
    /// Image URL
    #[serde(default)]
    pub image_url: Option<String>,
    /// Thumb URL
    #[serde(default)]
    pub thumb_url: Option<String>,
    /// Footer
    #[serde(default)]
    pub footer: Option<String>,
    /// Footer icon
    #[serde(default)]
    pub footer_icon: Option<String>,
    /// Timestamp
    #[serde(default)]
    pub ts: Option<i64>,
    /// Mrkdwn in fields
    #[serde(default)]
    pub mrkdwn_in: Vec<String>,
    /// Actions (interactive)
    #[serde(default)]
    pub actions: Vec<AttachmentAction>,
    /// Callback ID
    #[serde(default)]
    pub callback_id: Option<String>,
}

/// Attachment field
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentField {
    /// Field title
    pub title: String,
    /// Field value
    pub value: String,
    /// Whether short (side-by-side)
    #[serde(default)]
    pub short: bool,
}

/// Attachment action (interactive)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentAction {
    /// Action type
    #[serde(rename = "type")]
    pub action_type: String,
    /// Action text
    #[serde(default)]
    pub text: Option<String>,
    /// Action name
    #[serde(default)]
    pub name: Option<String>,
    /// Action value
    #[serde(default)]
    pub value: Option<String>,
    /// Button style
    #[serde(default)]
    pub style: Option<String>,
    /// Confirmation dialog
    #[serde(default)]
    pub confirm: Option<ActionConfirm>,
}

/// Action confirmation dialog
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionConfirm {
    /// Title
    #[serde(default)]
    pub title: Option<String>,
    /// Text
    pub text: String,
    /// OK button text
    #[serde(default)]
    pub ok_text: Option<String>,
    /// Dismiss button text
    #[serde(default)]
    pub dismiss_text: Option<String>,
}

/// Block Kit block (simplified)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    /// Block type
    #[serde(rename = "type")]
    pub block_type: String,
    /// Block ID
    #[serde(default)]
    pub block_id: Option<String>,
    /// Block elements (structure varies by type)
    #[serde(flatten)]
    pub data: serde_json::Value,
}

/// File attached to message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct File {
    /// File ID
    pub id: FileId,
    /// File name
    #[serde(default)]
    pub name: Option<String>,
    /// File title
    #[serde(default)]
    pub title: Option<String>,
    /// MIME type
    #[serde(default)]
    pub mimetype: Option<String>,
    /// File type (Slack's classification)
    #[serde(default)]
    pub filetype: Option<String>,
    /// Pretty type name
    #[serde(default)]
    pub pretty_type: Option<String>,
    /// User who uploaded
    #[serde(default)]
    pub user: Option<UserId>,
    /// Upload mode
    #[serde(default)]
    pub mode: Option<String>,
    /// Whether editable
    #[serde(default)]
    pub editable: bool,
    /// Whether external
    #[serde(default)]
    pub is_external: bool,
    /// External type
    #[serde(default)]
    pub external_type: Option<String>,
    /// File size in bytes
    #[serde(default)]
    pub size: Option<i64>,
    /// URL to private file
    #[serde(default)]
    pub url_private: Option<String>,
    /// URL to private download
    #[serde(default)]
    pub url_private_download: Option<String>,
    /// Original width (images)
    #[serde(default)]
    pub original_w: Option<i32>,
    /// Original height (images)
    #[serde(default)]
    pub original_h: Option<i32>,
    /// Thumbnail URLs
    #[serde(default)]
    pub thumb_64: Option<String>,
    #[serde(default)]
    pub thumb_80: Option<String>,
    #[serde(default)]
    pub thumb_360: Option<String>,
    #[serde(default)]
    pub thumb_480: Option<String>,
    #[serde(default)]
    pub thumb_720: Option<String>,
    #[serde(default)]
    pub thumb_960: Option<String>,
    #[serde(default)]
    pub thumb_1024: Option<String>,
    /// Permalink
    #[serde(default)]
    pub permalink: Option<String>,
    /// Permalink public
    #[serde(default)]
    pub permalink_public: Option<String>,
    /// Created timestamp
    #[serde(default)]
    pub created: Option<i64>,
    /// Updated timestamp
    #[serde(default)]
    pub timestamp: Option<i64>,
    /// Channels shared to
    #[serde(default)]
    pub channels: Vec<ChannelId>,
    /// Groups shared to
    #[serde(default)]
    pub groups: Vec<ChannelId>,
    /// IMs shared to
    #[serde(default)]
    pub ims: Vec<ChannelId>,
}

impl File {
    /// Check if this is an image
    pub fn is_image(&self) -> bool {
        self.mimetype
            .as_ref()
            .map(|m| m.starts_with("image/"))
            .unwrap_or(false)
    }

    /// Get the best available thumbnail URL
    pub fn best_thumbnail(&self) -> Option<&str> {
        self.thumb_1024
            .as_deref()
            .or(self.thumb_960.as_deref())
            .or(self.thumb_720.as_deref())
            .or(self.thumb_480.as_deref())
            .or(self.thumb_360.as_deref())
            .or(self.thumb_80.as_deref())
            .or(self.thumb_64.as_deref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_is_thread_reply() {
        let message = Message {
            message_type: "message".to_string(),
            subtype: None,
            text: Some("Hello".to_string()),
            user: Some(UserId::new("U123")),
            bot_id: None,
            ts: Timestamp::new("1234567890.123456"),
            thread_ts: Some(Timestamp::new("1234567890.000000")),
            parent_user_id: None,
            reply_count: None,
            reply_users_count: None,
            latest_reply: None,
            reply_users: vec![],
            is_starred: None,
            reactions: vec![],
            attachments: vec![],
            blocks: vec![],
            files: vec![],
            channel: None,
            team: None,
            edited: None,
            permalink: None,
            bot_profile: None,
            app_id: None,
            icons: None,
            username: None,
            metadata: None,
        };

        assert!(message.is_thread_reply());
        assert!(!message.is_thread_parent());
    }

    #[test]
    fn test_file_is_image() {
        let mut file = File {
            id: FileId::new("F123"),
            name: Some("test.png".to_string()),
            title: None,
            mimetype: Some("image/png".to_string()),
            filetype: None,
            pretty_type: None,
            user: None,
            mode: None,
            editable: false,
            is_external: false,
            external_type: None,
            size: None,
            url_private: None,
            url_private_download: None,
            original_w: None,
            original_h: None,
            thumb_64: None,
            thumb_80: None,
            thumb_360: Some("https://example.com/thumb_360.png".to_string()),
            thumb_480: None,
            thumb_720: None,
            thumb_960: None,
            thumb_1024: None,
            permalink: None,
            permalink_public: None,
            created: None,
            timestamp: None,
            channels: vec![],
            groups: vec![],
            ims: vec![],
        };

        assert!(file.is_image());
        assert_eq!(
            file.best_thumbnail(),
            Some("https://example.com/thumb_360.png")
        );

        file.mimetype = Some("application/pdf".to_string());
        assert!(!file.is_image());
    }
}
