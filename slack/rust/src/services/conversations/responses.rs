//! Response types for conversations service.

use crate::types::{Channel, Message, ResponseMetadata, UserId};
use serde::Deserialize;

/// Response from conversations.create
#[derive(Debug, Clone, Deserialize)]
pub struct CreateConversationResponse {
    /// Success indicator
    pub ok: bool,
    /// Created channel
    pub channel: Channel,
}

/// Response from conversations.archive/unarchive
#[derive(Debug, Clone, Deserialize)]
pub struct ArchiveConversationResponse {
    /// Success indicator
    pub ok: bool,
}

/// Response from conversations.close
#[derive(Debug, Clone, Deserialize)]
pub struct CloseConversationResponse {
    /// Success indicator
    pub ok: bool,
    /// Whether the conversation was already closed
    #[serde(default)]
    pub already_closed: bool,
    /// Whether there is a no-op (nothing changed)
    #[serde(default)]
    pub no_op: bool,
}

/// Response from conversations.history
#[derive(Debug, Clone, Deserialize)]
pub struct ConversationHistoryResponse {
    /// Success indicator
    pub ok: bool,
    /// Messages in the conversation
    #[serde(default)]
    pub messages: Vec<Message>,
    /// Whether there are more messages
    #[serde(default)]
    pub has_more: bool,
    /// Pin count
    #[serde(default)]
    pub pin_count: Option<i32>,
    /// Response metadata for pagination
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

/// Response from conversations.info
#[derive(Debug, Clone, Deserialize)]
pub struct ConversationInfoResponse {
    /// Success indicator
    pub ok: bool,
    /// Channel information
    pub channel: Channel,
}

/// Response from conversations.invite
#[derive(Debug, Clone, Deserialize)]
pub struct InviteToConversationResponse {
    /// Success indicator
    pub ok: bool,
    /// Updated channel
    pub channel: Channel,
}

/// Response from conversations.join
#[derive(Debug, Clone, Deserialize)]
pub struct JoinConversationResponse {
    /// Success indicator
    pub ok: bool,
    /// Joined channel
    pub channel: Channel,
    /// Warning message
    #[serde(default)]
    pub warning: Option<String>,
    /// Response metadata
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

/// Response from conversations.kick
#[derive(Debug, Clone, Deserialize)]
pub struct KickFromConversationResponse {
    /// Success indicator
    pub ok: bool,
}

/// Response from conversations.leave
#[derive(Debug, Clone, Deserialize)]
pub struct LeaveConversationResponse {
    /// Success indicator
    pub ok: bool,
    /// Whether the bot has not left the conversation
    #[serde(default)]
    pub not_in_channel: bool,
}

/// Response from conversations.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListConversationsResponse {
    /// Success indicator
    pub ok: bool,
    /// List of channels
    #[serde(default)]
    pub channels: Vec<Channel>,
    /// Response metadata for pagination
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

impl ListConversationsResponse {
    /// Check if there are more results
    pub fn has_more(&self) -> bool {
        self.response_metadata
            .as_ref()
            .map(|m| m.has_more())
            .unwrap_or(false)
    }

    /// Get the next cursor if available
    pub fn next_cursor(&self) -> Option<&str> {
        self.response_metadata
            .as_ref()
            .and_then(|m| m.next_cursor.as_deref())
            .filter(|c| !c.is_empty())
    }
}

/// Response from conversations.members
#[derive(Debug, Clone, Deserialize)]
pub struct ConversationMembersResponse {
    /// Success indicator
    pub ok: bool,
    /// Member user IDs
    #[serde(default)]
    pub members: Vec<UserId>,
    /// Response metadata for pagination
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

impl ConversationMembersResponse {
    /// Check if there are more results
    pub fn has_more(&self) -> bool {
        self.response_metadata
            .as_ref()
            .map(|m| m.has_more())
            .unwrap_or(false)
    }

    /// Get the next cursor if available
    pub fn next_cursor(&self) -> Option<&str> {
        self.response_metadata
            .as_ref()
            .and_then(|m| m.next_cursor.as_deref())
            .filter(|c| !c.is_empty())
    }
}

/// Response from conversations.open
#[derive(Debug, Clone, Deserialize)]
pub struct OpenConversationResponse {
    /// Success indicator
    pub ok: bool,
    /// Opened channel
    pub channel: Channel,
    /// Whether a new conversation was created
    #[serde(default)]
    pub no_op: bool,
    /// Whether the conversation already existed
    #[serde(default)]
    pub already_open: bool,
}

/// Response from conversations.rename
#[derive(Debug, Clone, Deserialize)]
pub struct RenameConversationResponse {
    /// Success indicator
    pub ok: bool,
    /// Updated channel
    pub channel: Channel,
}

/// Response from conversations.replies
#[derive(Debug, Clone, Deserialize)]
pub struct ConversationRepliesResponse {
    /// Success indicator
    pub ok: bool,
    /// Thread messages (includes parent)
    #[serde(default)]
    pub messages: Vec<Message>,
    /// Whether there are more messages
    #[serde(default)]
    pub has_more: bool,
    /// Response metadata for pagination
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

/// Response from conversations.setPurpose
#[derive(Debug, Clone, Deserialize)]
pub struct SetConversationPurposeResponse {
    /// Success indicator
    pub ok: bool,
    /// New purpose
    pub purpose: String,
}

/// Response from conversations.setTopic
#[derive(Debug, Clone, Deserialize)]
pub struct SetConversationTopicResponse {
    /// Success indicator
    pub ok: bool,
    /// New topic
    pub topic: String,
}

/// Response from conversations.mark
#[derive(Debug, Clone, Deserialize)]
pub struct MarkConversationResponse {
    /// Success indicator
    pub ok: bool,
}
