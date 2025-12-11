//! Response types for messages service.

use crate::types::{Message, ResponseMetadata, Timestamp};
use serde::Deserialize;

/// Response from chat.postMessage
#[derive(Debug, Clone, Deserialize)]
pub struct PostMessageResponse {
    /// Success indicator
    pub ok: bool,
    /// Channel where message was posted
    pub channel: String,
    /// Message timestamp
    pub ts: Timestamp,
    /// Posted message
    #[serde(default)]
    pub message: Option<Message>,
}

/// Response from chat.update
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMessageResponse {
    /// Success indicator
    pub ok: bool,
    /// Channel containing message
    pub channel: String,
    /// Updated message timestamp
    pub ts: Timestamp,
    /// Updated message text
    #[serde(default)]
    pub text: Option<String>,
    /// Updated message
    #[serde(default)]
    pub message: Option<Message>,
}

/// Response from chat.delete
#[derive(Debug, Clone, Deserialize)]
pub struct DeleteMessageResponse {
    /// Success indicator
    pub ok: bool,
    /// Channel containing message
    pub channel: String,
    /// Deleted message timestamp
    pub ts: Timestamp,
}

/// Response from chat.getPermalink
#[derive(Debug, Clone, Deserialize)]
pub struct GetPermalinkResponse {
    /// Success indicator
    pub ok: bool,
    /// Channel ID
    pub channel: String,
    /// Permalink URL
    pub permalink: String,
}

/// Response from chat.scheduleMessage
#[derive(Debug, Clone, Deserialize)]
pub struct ScheduleMessageResponse {
    /// Success indicator
    pub ok: bool,
    /// Channel where message will be posted
    pub channel: String,
    /// Scheduled message ID
    pub scheduled_message_id: String,
    /// Timestamp when message will be posted
    pub post_at: i64,
    /// Scheduled message
    #[serde(default)]
    pub message: Option<ScheduledMessageInfo>,
}

/// Scheduled message info
#[derive(Debug, Clone, Deserialize)]
pub struct ScheduledMessageInfo {
    /// Message text
    #[serde(default)]
    pub text: Option<String>,
    /// Bot ID
    #[serde(default)]
    pub bot_id: Option<String>,
    /// Message type
    #[serde(rename = "type")]
    pub message_type: Option<String>,
    /// User who scheduled
    #[serde(default)]
    pub user: Option<String>,
}

/// Response from chat.deleteScheduledMessage
#[derive(Debug, Clone, Deserialize)]
pub struct DeleteScheduledMessageResponse {
    /// Success indicator
    pub ok: bool,
}

/// Response from chat.scheduledMessages.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListScheduledMessagesResponse {
    /// Success indicator
    pub ok: bool,
    /// Scheduled messages
    #[serde(default)]
    pub scheduled_messages: Vec<ScheduledMessage>,
    /// Response metadata for pagination
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

/// Scheduled message details
#[derive(Debug, Clone, Deserialize)]
pub struct ScheduledMessage {
    /// Scheduled message ID
    pub id: String,
    /// Channel ID
    pub channel_id: String,
    /// Unix timestamp when message will be posted
    pub post_at: i64,
    /// Date created (Unix timestamp)
    #[serde(default)]
    pub date_created: Option<i64>,
    /// Message text
    #[serde(default)]
    pub text: Option<String>,
}

/// Response from chat.postEphemeral
#[derive(Debug, Clone, Deserialize)]
pub struct PostEphemeralResponse {
    /// Success indicator
    pub ok: bool,
    /// Ephemeral message timestamp
    pub message_ts: Timestamp,
}

/// Response from chat.meMessage
#[derive(Debug, Clone, Deserialize)]
pub struct MeMessageResponse {
    /// Success indicator
    pub ok: bool,
    /// Channel
    pub channel: String,
    /// Message timestamp
    pub ts: Timestamp,
}

/// Response from chat.unfurl
#[derive(Debug, Clone, Deserialize)]
pub struct UnfurlResponse {
    /// Success indicator
    pub ok: bool,
}
