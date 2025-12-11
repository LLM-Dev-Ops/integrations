//! Request types for messages service.

use crate::types::{Attachment, Block, ChannelId, Timestamp};
use serde::Serialize;

/// Request to post a message
#[derive(Debug, Clone, Serialize)]
pub struct PostMessageRequest {
    /// Channel, DM, or MPIM to send to
    pub channel: ChannelId,
    /// Message text (can be combined with blocks)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Block Kit blocks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocks: Option<Vec<Block>>,
    /// Legacy attachments
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Attachment>>,
    /// Thread timestamp to reply to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_ts: Option<Timestamp>,
    /// Broadcast reply to channel
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_broadcast: Option<bool>,
    /// Parse mode (full, none)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse: Option<String>,
    /// Enable link unfurling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unfurl_links: Option<bool>,
    /// Enable media unfurling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unfurl_media: Option<bool>,
    /// Custom username
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    /// Bot icon emoji
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_emoji: Option<String>,
    /// Bot icon URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    /// Whether to linkify channel names and usernames
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_names: Option<bool>,
    /// Disable markdown formatting
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mrkdwn: Option<bool>,
    /// Message metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<MessageMetadataInput>,
}

impl PostMessageRequest {
    /// Create a new message request
    pub fn new(channel: impl Into<ChannelId>, text: impl Into<String>) -> Self {
        Self {
            channel: channel.into(),
            text: Some(text.into()),
            blocks: None,
            attachments: None,
            thread_ts: None,
            reply_broadcast: None,
            parse: None,
            unfurl_links: None,
            unfurl_media: None,
            username: None,
            icon_emoji: None,
            icon_url: None,
            link_names: None,
            mrkdwn: None,
            metadata: None,
        }
    }

    /// Create a message with blocks
    pub fn with_blocks(channel: impl Into<ChannelId>, blocks: Vec<Block>) -> Self {
        Self {
            channel: channel.into(),
            text: None,
            blocks: Some(blocks),
            attachments: None,
            thread_ts: None,
            reply_broadcast: None,
            parse: None,
            unfurl_links: None,
            unfurl_media: None,
            username: None,
            icon_emoji: None,
            icon_url: None,
            link_names: None,
            mrkdwn: None,
            metadata: None,
        }
    }

    /// Set the text
    pub fn text(mut self, text: impl Into<String>) -> Self {
        self.text = Some(text.into());
        self
    }

    /// Set blocks
    pub fn blocks(mut self, blocks: Vec<Block>) -> Self {
        self.blocks = Some(blocks);
        self
    }

    /// Set attachments
    pub fn attachments(mut self, attachments: Vec<Attachment>) -> Self {
        self.attachments = Some(attachments);
        self
    }

    /// Reply in a thread
    pub fn thread_ts(mut self, ts: impl Into<Timestamp>) -> Self {
        self.thread_ts = Some(ts.into());
        self
    }

    /// Broadcast reply to channel
    pub fn reply_broadcast(mut self, broadcast: bool) -> Self {
        self.reply_broadcast = Some(broadcast);
        self
    }

    /// Set parse mode
    pub fn parse(mut self, mode: impl Into<String>) -> Self {
        self.parse = Some(mode.into());
        self
    }

    /// Enable/disable link unfurling
    pub fn unfurl_links(mut self, unfurl: bool) -> Self {
        self.unfurl_links = Some(unfurl);
        self
    }

    /// Enable/disable media unfurling
    pub fn unfurl_media(mut self, unfurl: bool) -> Self {
        self.unfurl_media = Some(unfurl);
        self
    }

    /// Set custom username
    pub fn username(mut self, name: impl Into<String>) -> Self {
        self.username = Some(name.into());
        self
    }

    /// Set icon emoji
    pub fn icon_emoji(mut self, emoji: impl Into<String>) -> Self {
        self.icon_emoji = Some(emoji.into());
        self
    }

    /// Set icon URL
    pub fn icon_url(mut self, url: impl Into<String>) -> Self {
        self.icon_url = Some(url.into());
        self
    }

    /// Enable/disable mrkdwn formatting
    pub fn mrkdwn(mut self, enabled: bool) -> Self {
        self.mrkdwn = Some(enabled);
        self
    }

    /// Set message metadata
    pub fn metadata(mut self, metadata: MessageMetadataInput) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// Message metadata input
#[derive(Debug, Clone, Serialize)]
pub struct MessageMetadataInput {
    /// Event type
    pub event_type: String,
    /// Event payload
    pub event_payload: serde_json::Value,
}

impl MessageMetadataInput {
    /// Create new metadata
    pub fn new(event_type: impl Into<String>, payload: serde_json::Value) -> Self {
        Self {
            event_type: event_type.into(),
            event_payload: payload,
        }
    }
}

/// Request to update a message
#[derive(Debug, Clone, Serialize)]
pub struct UpdateMessageRequest {
    /// Channel containing the message
    pub channel: ChannelId,
    /// Timestamp of the message
    pub ts: Timestamp,
    /// New text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// New blocks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocks: Option<Vec<Block>>,
    /// New attachments
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Attachment>>,
    /// Parse mode
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse: Option<String>,
    /// Link names
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_names: Option<bool>,
    /// Metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<MessageMetadataInput>,
}

impl UpdateMessageRequest {
    /// Create a new update request
    pub fn new(channel: impl Into<ChannelId>, ts: impl Into<Timestamp>) -> Self {
        Self {
            channel: channel.into(),
            ts: ts.into(),
            text: None,
            blocks: None,
            attachments: None,
            parse: None,
            link_names: None,
            metadata: None,
        }
    }

    /// Set new text
    pub fn text(mut self, text: impl Into<String>) -> Self {
        self.text = Some(text.into());
        self
    }

    /// Set new blocks
    pub fn blocks(mut self, blocks: Vec<Block>) -> Self {
        self.blocks = Some(blocks);
        self
    }

    /// Set new attachments
    pub fn attachments(mut self, attachments: Vec<Attachment>) -> Self {
        self.attachments = Some(attachments);
        self
    }
}

/// Request to delete a message
#[derive(Debug, Clone, Serialize)]
pub struct DeleteMessageRequest {
    /// Channel containing the message
    pub channel: ChannelId,
    /// Timestamp of the message
    pub ts: Timestamp,
}

impl DeleteMessageRequest {
    /// Create a new delete request
    pub fn new(channel: impl Into<ChannelId>, ts: impl Into<Timestamp>) -> Self {
        Self {
            channel: channel.into(),
            ts: ts.into(),
        }
    }
}

/// Request to get a message permalink
#[derive(Debug, Clone, Serialize)]
pub struct GetPermalinkRequest {
    /// Channel containing the message
    pub channel: ChannelId,
    /// Timestamp of the message
    pub message_ts: Timestamp,
}

impl GetPermalinkRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>, ts: impl Into<Timestamp>) -> Self {
        Self {
            channel: channel.into(),
            message_ts: ts.into(),
        }
    }
}

/// Request to schedule a message
#[derive(Debug, Clone, Serialize)]
pub struct ScheduleMessageRequest {
    /// Channel to post to
    pub channel: ChannelId,
    /// Unix timestamp to post at
    pub post_at: i64,
    /// Message text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Blocks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocks: Option<Vec<Block>>,
    /// Attachments
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Attachment>>,
    /// Thread to reply to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_ts: Option<Timestamp>,
    /// Reply broadcast
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_broadcast: Option<bool>,
    /// Enable link unfurling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unfurl_links: Option<bool>,
    /// Enable media unfurling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unfurl_media: Option<bool>,
    /// Metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<MessageMetadataInput>,
}

impl ScheduleMessageRequest {
    /// Create a new schedule request
    pub fn new(channel: impl Into<ChannelId>, post_at: i64, text: impl Into<String>) -> Self {
        Self {
            channel: channel.into(),
            post_at,
            text: Some(text.into()),
            blocks: None,
            attachments: None,
            thread_ts: None,
            reply_broadcast: None,
            unfurl_links: None,
            unfurl_media: None,
            metadata: None,
        }
    }

    /// Set blocks
    pub fn blocks(mut self, blocks: Vec<Block>) -> Self {
        self.blocks = Some(blocks);
        self
    }

    /// Set thread
    pub fn thread_ts(mut self, ts: impl Into<Timestamp>) -> Self {
        self.thread_ts = Some(ts.into());
        self
    }
}

/// Request to delete a scheduled message
#[derive(Debug, Clone, Serialize)]
pub struct DeleteScheduledMessageRequest {
    /// Channel where the message was scheduled
    pub channel: ChannelId,
    /// Scheduled message ID
    pub scheduled_message_id: String,
}

impl DeleteScheduledMessageRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>, scheduled_message_id: impl Into<String>) -> Self {
        Self {
            channel: channel.into(),
            scheduled_message_id: scheduled_message_id.into(),
        }
    }
}

/// Request to list scheduled messages
#[derive(Debug, Clone, Serialize)]
pub struct ListScheduledMessagesRequest {
    /// Channel to filter by
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelId>,
    /// Cursor for pagination
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    /// Number of results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    /// Oldest timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oldest: Option<i64>,
    /// Latest timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<i64>,
    /// Team ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl Default for ListScheduledMessagesRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl ListScheduledMessagesRequest {
    /// Create a new request
    pub fn new() -> Self {
        Self {
            channel: None,
            cursor: None,
            limit: None,
            oldest: None,
            latest: None,
            team_id: None,
        }
    }

    /// Filter by channel
    pub fn channel(mut self, channel: impl Into<ChannelId>) -> Self {
        self.channel = Some(channel.into());
        self
    }

    /// Set limit
    pub fn limit(mut self, n: i32) -> Self {
        self.limit = Some(n);
        self
    }
}

/// Request to post an ephemeral message
#[derive(Debug, Clone, Serialize)]
pub struct PostEphemeralRequest {
    /// Channel to post to
    pub channel: ChannelId,
    /// User to show the message to
    pub user: String,
    /// Message text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Blocks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocks: Option<Vec<Block>>,
    /// Attachments
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Attachment>>,
    /// Thread to post in
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_ts: Option<Timestamp>,
}

impl PostEphemeralRequest {
    /// Create a new request
    pub fn new(
        channel: impl Into<ChannelId>,
        user: impl Into<String>,
        text: impl Into<String>,
    ) -> Self {
        Self {
            channel: channel.into(),
            user: user.into(),
            text: Some(text.into()),
            blocks: None,
            attachments: None,
            thread_ts: None,
        }
    }

    /// Set blocks
    pub fn blocks(mut self, blocks: Vec<Block>) -> Self {
        self.blocks = Some(blocks);
        self
    }

    /// Set thread
    pub fn thread_ts(mut self, ts: impl Into<Timestamp>) -> Self {
        self.thread_ts = Some(ts.into());
        self
    }
}
