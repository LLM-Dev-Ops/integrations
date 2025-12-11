//! Request types for conversations service.

use crate::types::{ChannelId, ChannelType, Cursor, Timestamp, UserId};
use serde::Serialize;

/// Request to create a new channel
#[derive(Debug, Clone, Serialize)]
pub struct CreateConversationRequest {
    /// Channel name (without #)
    pub name: String,
    /// Whether the channel should be private
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_private: Option<bool>,
    /// Team ID for Enterprise Grid
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl CreateConversationRequest {
    /// Create a new request
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            is_private: None,
            team_id: None,
        }
    }

    /// Set whether the channel is private
    pub fn is_private(mut self, private: bool) -> Self {
        self.is_private = Some(private);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, id: impl Into<String>) -> Self {
        self.team_id = Some(id.into());
        self
    }
}

/// Request to archive a conversation
#[derive(Debug, Clone, Serialize)]
pub struct ArchiveConversationRequest {
    /// Channel ID
    pub channel: ChannelId,
}

impl ArchiveConversationRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: channel.into(),
        }
    }
}

/// Request to unarchive a conversation
#[derive(Debug, Clone, Serialize)]
pub struct UnarchiveConversationRequest {
    /// Channel ID
    pub channel: ChannelId,
}

impl UnarchiveConversationRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: channel.into(),
        }
    }
}

/// Request to close a conversation (DM/MPIM)
#[derive(Debug, Clone, Serialize)]
pub struct CloseConversationRequest {
    /// Channel ID
    pub channel: ChannelId,
}

impl CloseConversationRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: channel.into(),
        }
    }
}

/// Request to get conversation history
#[derive(Debug, Clone, Serialize)]
pub struct ConversationHistoryRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// Cursor for pagination
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<Cursor>,
    /// Include all metadata about each message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_all_metadata: Option<bool>,
    /// Only messages after this timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oldest: Option<Timestamp>,
    /// Only messages before this timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<Timestamp>,
    /// Number of messages to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    /// Include messages with oldest or latest timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inclusive: Option<bool>,
}

impl ConversationHistoryRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: channel.into(),
            cursor: None,
            include_all_metadata: None,
            oldest: None,
            latest: None,
            limit: None,
            inclusive: None,
        }
    }

    /// Set pagination cursor
    pub fn cursor(mut self, cursor: impl Into<Cursor>) -> Self {
        self.cursor = Some(cursor.into());
        self
    }

    /// Include all metadata
    pub fn include_all_metadata(mut self, include: bool) -> Self {
        self.include_all_metadata = Some(include);
        self
    }

    /// Set oldest timestamp
    pub fn oldest(mut self, ts: impl Into<Timestamp>) -> Self {
        self.oldest = Some(ts.into());
        self
    }

    /// Set latest timestamp
    pub fn latest(mut self, ts: impl Into<Timestamp>) -> Self {
        self.latest = Some(ts.into());
        self
    }

    /// Set result limit
    pub fn limit(mut self, n: i32) -> Self {
        self.limit = Some(n);
        self
    }

    /// Include boundary messages
    pub fn inclusive(mut self, inclusive: bool) -> Self {
        self.inclusive = Some(inclusive);
        self
    }
}

/// Request to get conversation info
#[derive(Debug, Clone, Serialize)]
pub struct ConversationInfoRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// Include locale info
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_locale: Option<bool>,
    /// Include number of members
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_num_members: Option<bool>,
}

impl ConversationInfoRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: channel.into(),
            include_locale: None,
            include_num_members: None,
        }
    }

    /// Include locale information
    pub fn include_locale(mut self, include: bool) -> Self {
        self.include_locale = Some(include);
        self
    }

    /// Include member count
    pub fn include_num_members(mut self, include: bool) -> Self {
        self.include_num_members = Some(include);
        self
    }
}

/// Request to invite users to a conversation
#[derive(Debug, Clone, Serialize)]
pub struct InviteToConversationRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// User IDs to invite
    pub users: String, // Comma-separated
}

impl InviteToConversationRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>, users: &[UserId]) -> Self {
        Self {
            channel: channel.into(),
            users: users
                .iter()
                .map(|u| u.as_str())
                .collect::<Vec<_>>()
                .join(","),
        }
    }
}

/// Request to join a conversation
#[derive(Debug, Clone, Serialize)]
pub struct JoinConversationRequest {
    /// Channel ID
    pub channel: ChannelId,
}

impl JoinConversationRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: channel.into(),
        }
    }
}

/// Request to kick a user from a conversation
#[derive(Debug, Clone, Serialize)]
pub struct KickFromConversationRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// User to kick
    pub user: UserId,
}

impl KickFromConversationRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>, user: impl Into<UserId>) -> Self {
        Self {
            channel: channel.into(),
            user: user.into(),
        }
    }
}

/// Request to leave a conversation
#[derive(Debug, Clone, Serialize)]
pub struct LeaveConversationRequest {
    /// Channel ID
    pub channel: ChannelId,
}

impl LeaveConversationRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: channel.into(),
        }
    }
}

/// Request to list conversations
#[derive(Debug, Clone, Serialize)]
pub struct ListConversationsRequest {
    /// Cursor for pagination
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<Cursor>,
    /// Exclude archived channels
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclude_archived: Option<bool>,
    /// Number of results to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    /// Team ID for Enterprise Grid
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    /// Types of conversations to include
    #[serde(skip_serializing_if = "Option::is_none")]
    pub types: Option<String>,
}

impl Default for ListConversationsRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl ListConversationsRequest {
    /// Create a new request
    pub fn new() -> Self {
        Self {
            cursor: None,
            exclude_archived: None,
            limit: None,
            team_id: None,
            types: None,
        }
    }

    /// Set pagination cursor
    pub fn cursor(mut self, cursor: impl Into<Cursor>) -> Self {
        self.cursor = Some(cursor.into());
        self
    }

    /// Exclude archived channels
    pub fn exclude_archived(mut self, exclude: bool) -> Self {
        self.exclude_archived = Some(exclude);
        self
    }

    /// Set result limit
    pub fn limit(mut self, n: i32) -> Self {
        self.limit = Some(n);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, id: impl Into<String>) -> Self {
        self.team_id = Some(id.into());
        self
    }

    /// Set conversation types
    pub fn types(mut self, types: &[ChannelType]) -> Self {
        self.types = Some(
            types
                .iter()
                .map(|t| t.as_api_filter())
                .collect::<Vec<_>>()
                .join(","),
        );
        self
    }
}

/// Request to list conversation members
#[derive(Debug, Clone, Serialize)]
pub struct ConversationMembersRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// Cursor for pagination
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<Cursor>,
    /// Number of results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
}

impl ConversationMembersRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: channel.into(),
            cursor: None,
            limit: None,
        }
    }

    /// Set pagination cursor
    pub fn cursor(mut self, cursor: impl Into<Cursor>) -> Self {
        self.cursor = Some(cursor.into());
        self
    }

    /// Set result limit
    pub fn limit(mut self, n: i32) -> Self {
        self.limit = Some(n);
        self
    }
}

/// Request to open/create a DM
#[derive(Debug, Clone, Serialize)]
pub struct OpenConversationRequest {
    /// Channel ID (to re-open)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelId>,
    /// User IDs (to create new DM/MPIM)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub users: Option<String>,
    /// Return existing conversation if it exists
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_im: Option<bool>,
}

impl OpenConversationRequest {
    /// Open a DM with a single user
    pub fn dm(user: impl Into<UserId>) -> Self {
        Self {
            channel: None,
            users: Some(user.into().0),
            return_im: Some(true),
        }
    }

    /// Open a multi-party DM
    pub fn mpim(users: &[UserId]) -> Self {
        Self {
            channel: None,
            users: Some(
                users
                    .iter()
                    .map(|u| u.as_str())
                    .collect::<Vec<_>>()
                    .join(","),
            ),
            return_im: None,
        }
    }

    /// Re-open an existing conversation
    pub fn reopen(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: Some(channel.into()),
            users: None,
            return_im: None,
        }
    }
}

/// Request to rename a conversation
#[derive(Debug, Clone, Serialize)]
pub struct RenameConversationRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// New name
    pub name: String,
}

impl RenameConversationRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>, name: impl Into<String>) -> Self {
        Self {
            channel: channel.into(),
            name: name.into(),
        }
    }
}

/// Request to get thread replies
#[derive(Debug, Clone, Serialize)]
pub struct ConversationRepliesRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// Thread parent timestamp
    pub ts: Timestamp,
    /// Cursor for pagination
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<Cursor>,
    /// Include all metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_all_metadata: Option<bool>,
    /// Only messages after this timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oldest: Option<Timestamp>,
    /// Only messages before this timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<Timestamp>,
    /// Number of results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    /// Include boundary messages
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inclusive: Option<bool>,
}

impl ConversationRepliesRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>, ts: impl Into<Timestamp>) -> Self {
        Self {
            channel: channel.into(),
            ts: ts.into(),
            cursor: None,
            include_all_metadata: None,
            oldest: None,
            latest: None,
            limit: None,
            inclusive: None,
        }
    }

    /// Set pagination cursor
    pub fn cursor(mut self, cursor: impl Into<Cursor>) -> Self {
        self.cursor = Some(cursor.into());
        self
    }

    /// Set result limit
    pub fn limit(mut self, n: i32) -> Self {
        self.limit = Some(n);
        self
    }
}

/// Request to set conversation purpose
#[derive(Debug, Clone, Serialize)]
pub struct SetConversationPurposeRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// Purpose text
    pub purpose: String,
}

impl SetConversationPurposeRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>, purpose: impl Into<String>) -> Self {
        Self {
            channel: channel.into(),
            purpose: purpose.into(),
        }
    }
}

/// Request to set conversation topic
#[derive(Debug, Clone, Serialize)]
pub struct SetConversationTopicRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// Topic text
    pub topic: String,
}

impl SetConversationTopicRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>, topic: impl Into<String>) -> Self {
        Self {
            channel: channel.into(),
            topic: topic.into(),
        }
    }
}

/// Request to mark a conversation as read
#[derive(Debug, Clone, Serialize)]
pub struct MarkConversationRequest {
    /// Channel ID
    pub channel: ChannelId,
    /// Timestamp to mark as read
    pub ts: Timestamp,
}

impl MarkConversationRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>, ts: impl Into<Timestamp>) -> Self {
        Self {
            channel: channel.into(),
            ts: ts.into(),
        }
    }
}
