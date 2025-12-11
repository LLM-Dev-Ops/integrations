//! Events API types and handlers.
//!
//! Types for handling Slack Events API callbacks.

use crate::types::{ChannelId, Message, TeamId, Timestamp, UserId};
use serde::{Deserialize, Serialize};

/// Event wrapper from Slack Events API
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum SlackEvent {
    /// URL verification challenge
    #[serde(rename = "url_verification")]
    UrlVerification {
        /// Challenge token to return
        challenge: String,
        /// Verification token
        token: String,
    },

    /// Event callback
    #[serde(rename = "event_callback")]
    EventCallback(EventCallback),

    /// App rate limited
    #[serde(rename = "app_rate_limited")]
    AppRateLimited {
        /// Token (deprecated)
        token: String,
        /// Team ID
        team_id: TeamId,
        /// Minute rate limited
        minute_rate_limited: i64,
        /// API app ID
        api_app_id: String,
    },
}

/// Event callback wrapper
#[derive(Debug, Clone, Deserialize)]
pub struct EventCallback {
    /// Verification token (deprecated)
    pub token: String,
    /// Team ID
    pub team_id: TeamId,
    /// API app ID
    pub api_app_id: String,
    /// The actual event
    pub event: InnerEvent,
    /// Event ID
    pub event_id: String,
    /// Event time (Unix timestamp)
    pub event_time: i64,
    /// Authorizations
    #[serde(default)]
    pub authorizations: Vec<Authorization>,
    /// Context team ID
    #[serde(default)]
    pub event_context: Option<String>,
    /// Is enterprise install
    #[serde(default)]
    pub is_ext_shared_channel: bool,
}

/// Authorization info
#[derive(Debug, Clone, Deserialize)]
pub struct Authorization {
    /// Enterprise ID
    #[serde(default)]
    pub enterprise_id: Option<String>,
    /// Team ID
    pub team_id: TeamId,
    /// User ID
    pub user_id: UserId,
    /// Is bot
    #[serde(default)]
    pub is_bot: bool,
    /// Is enterprise install
    #[serde(default)]
    pub is_enterprise_install: bool,
}

/// Inner event types
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum InnerEvent {
    /// App home opened
    #[serde(rename = "app_home_opened")]
    AppHomeOpened {
        /// User who opened
        user: UserId,
        /// Channel ID
        channel: ChannelId,
        /// Event timestamp
        event_ts: String,
        /// Tab opened (home, messages)
        tab: String,
        /// View info
        #[serde(default)]
        view: Option<serde_json::Value>,
    },

    /// App mention
    #[serde(rename = "app_mention")]
    AppMention {
        /// User who mentioned
        user: UserId,
        /// Text content
        text: String,
        /// Timestamp
        ts: Timestamp,
        /// Channel
        channel: ChannelId,
        /// Event timestamp
        event_ts: String,
        /// Thread timestamp
        #[serde(default)]
        thread_ts: Option<Timestamp>,
    },

    /// Message event
    #[serde(rename = "message")]
    Message(MessageEvent),

    /// Message channels type
    #[serde(rename = "message.channels")]
    MessageChannels(MessageEvent),

    /// Message groups type
    #[serde(rename = "message.groups")]
    MessageGroups(MessageEvent),

    /// Message IM type
    #[serde(rename = "message.im")]
    MessageIm(MessageEvent),

    /// Message MPIM type
    #[serde(rename = "message.mpim")]
    MessageMpim(MessageEvent),

    /// Member joined channel
    #[serde(rename = "member_joined_channel")]
    MemberJoinedChannel {
        /// User who joined
        user: UserId,
        /// Channel joined
        channel: ChannelId,
        /// Channel type
        channel_type: String,
        /// Team
        team: TeamId,
        /// Inviter (if invited)
        #[serde(default)]
        inviter: Option<UserId>,
        /// Event timestamp
        event_ts: String,
    },

    /// Member left channel
    #[serde(rename = "member_left_channel")]
    MemberLeftChannel {
        /// User who left
        user: UserId,
        /// Channel left
        channel: ChannelId,
        /// Channel type
        channel_type: String,
        /// Team
        team: TeamId,
        /// Event timestamp
        event_ts: String,
    },

    /// Channel created
    #[serde(rename = "channel_created")]
    ChannelCreated {
        /// Channel info
        channel: ChannelCreatedInfo,
    },

    /// Channel deleted
    #[serde(rename = "channel_deleted")]
    ChannelDeleted {
        /// Channel ID
        channel: ChannelId,
    },

    /// Channel renamed
    #[serde(rename = "channel_rename")]
    ChannelRename {
        /// Channel info
        channel: ChannelRenameInfo,
    },

    /// Channel archive
    #[serde(rename = "channel_archive")]
    ChannelArchive {
        /// Channel ID
        channel: ChannelId,
        /// User who archived
        user: UserId,
    },

    /// Channel unarchive
    #[serde(rename = "channel_unarchive")]
    ChannelUnarchive {
        /// Channel ID
        channel: ChannelId,
        /// User who unarchived
        user: UserId,
    },

    /// Reaction added
    #[serde(rename = "reaction_added")]
    ReactionAdded {
        /// User who reacted
        user: UserId,
        /// Reaction emoji
        reaction: String,
        /// Item type
        item_user: Option<UserId>,
        /// Item
        item: ReactionItem,
        /// Event timestamp
        event_ts: String,
    },

    /// Reaction removed
    #[serde(rename = "reaction_removed")]
    ReactionRemoved {
        /// User who unreacted
        user: UserId,
        /// Reaction emoji
        reaction: String,
        /// Item
        item: ReactionItem,
        /// Event timestamp
        event_ts: String,
    },

    /// User profile changed
    #[serde(rename = "user_change")]
    UserChange {
        /// Updated user info
        user: serde_json::Value,
    },

    /// Team join
    #[serde(rename = "team_join")]
    TeamJoin {
        /// New user info
        user: serde_json::Value,
    },

    /// File shared
    #[serde(rename = "file_shared")]
    FileShared {
        /// File ID
        file_id: String,
        /// User who shared
        user_id: UserId,
        /// File info
        file: Option<serde_json::Value>,
        /// Channel ID
        channel_id: Option<ChannelId>,
        /// Event timestamp
        event_ts: String,
    },

    /// Unknown event type (catch-all)
    #[serde(other)]
    Unknown,
}

/// Message event structure
#[derive(Debug, Clone, Deserialize)]
pub struct MessageEvent {
    /// Subtype (if any)
    #[serde(default)]
    pub subtype: Option<String>,
    /// User who sent
    #[serde(default)]
    pub user: Option<UserId>,
    /// Bot ID (if bot)
    #[serde(default)]
    pub bot_id: Option<String>,
    /// Message text
    #[serde(default)]
    pub text: Option<String>,
    /// Timestamp
    pub ts: Timestamp,
    /// Channel
    pub channel: ChannelId,
    /// Event timestamp
    pub event_ts: String,
    /// Thread timestamp
    #[serde(default)]
    pub thread_ts: Option<Timestamp>,
    /// Channel type
    #[serde(default)]
    pub channel_type: Option<String>,
    /// Blocks
    #[serde(default)]
    pub blocks: Vec<serde_json::Value>,
    /// Attachments
    #[serde(default)]
    pub attachments: Vec<serde_json::Value>,
    /// Files
    #[serde(default)]
    pub files: Vec<serde_json::Value>,
    /// Hidden flag
    #[serde(default)]
    pub hidden: Option<bool>,
    /// Previous message (for edits)
    #[serde(default)]
    pub previous_message: Option<Box<MessageEvent>>,
    /// Message that was deleted
    #[serde(default)]
    pub deleted_ts: Option<Timestamp>,
}

impl MessageEvent {
    /// Check if this is a message from a bot
    pub fn is_bot_message(&self) -> bool {
        self.bot_id.is_some() || self.subtype.as_deref() == Some("bot_message")
    }

    /// Check if this is a thread reply
    pub fn is_thread_reply(&self) -> bool {
        self.thread_ts.is_some() && self.thread_ts.as_ref() != Some(&self.ts)
    }

    /// Check if this is a message edit
    pub fn is_edit(&self) -> bool {
        self.subtype.as_deref() == Some("message_changed")
    }

    /// Check if this is a message deletion
    pub fn is_deletion(&self) -> bool {
        self.subtype.as_deref() == Some("message_deleted")
    }
}

/// Channel created info
#[derive(Debug, Clone, Deserialize)]
pub struct ChannelCreatedInfo {
    /// Channel ID
    pub id: ChannelId,
    /// Channel name
    pub name: String,
    /// Created timestamp
    pub created: i64,
    /// Creator
    pub creator: UserId,
}

/// Channel rename info
#[derive(Debug, Clone, Deserialize)]
pub struct ChannelRenameInfo {
    /// Channel ID
    pub id: ChannelId,
    /// New name
    pub name: String,
    /// Created timestamp
    pub created: i64,
}

/// Reaction item reference
#[derive(Debug, Clone, Deserialize)]
pub struct ReactionItem {
    /// Item type (message, file, file_comment)
    #[serde(rename = "type")]
    pub item_type: String,
    /// Channel (for messages)
    #[serde(default)]
    pub channel: Option<ChannelId>,
    /// Timestamp (for messages)
    #[serde(default)]
    pub ts: Option<Timestamp>,
    /// File ID (for files)
    #[serde(default)]
    pub file: Option<String>,
    /// File comment ID
    #[serde(default)]
    pub file_comment: Option<String>,
}

/// URL verification response
#[derive(Debug, Clone, Serialize)]
pub struct UrlVerificationResponse {
    /// Challenge token to echo back
    pub challenge: String,
}

impl UrlVerificationResponse {
    /// Create a new response
    pub fn new(challenge: impl Into<String>) -> Self {
        Self {
            challenge: challenge.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_url_verification() {
        let json = r#"{
            "type": "url_verification",
            "token": "test_token",
            "challenge": "test_challenge"
        }"#;

        let event: SlackEvent = serde_json::from_str(json).unwrap();
        match event {
            SlackEvent::UrlVerification { challenge, token } => {
                assert_eq!(challenge, "test_challenge");
                assert_eq!(token, "test_token");
            }
            _ => panic!("Expected URL verification"),
        }
    }

    #[test]
    fn test_message_event_helpers() {
        let msg = MessageEvent {
            subtype: Some("bot_message".to_string()),
            user: None,
            bot_id: Some("B123".to_string()),
            text: Some("Hello".to_string()),
            ts: Timestamp::new("1234567890.123456"),
            channel: ChannelId::new("C123"),
            event_ts: "1234567890.123456".to_string(),
            thread_ts: None,
            channel_type: None,
            blocks: vec![],
            attachments: vec![],
            files: vec![],
            hidden: None,
            previous_message: None,
            deleted_ts: None,
        };

        assert!(msg.is_bot_message());
        assert!(!msg.is_thread_reply());
        assert!(!msg.is_edit());
    }
}
