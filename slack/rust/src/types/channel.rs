//! Channel-related types for the Slack API.

use super::{ChannelId, TeamId, Timestamp, UserId};
use serde::{Deserialize, Serialize};

/// Slack channel/conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    /// Channel ID
    pub id: ChannelId,
    /// Channel name (without #)
    #[serde(default)]
    pub name: Option<String>,
    /// Normalized name
    #[serde(default)]
    pub name_normalized: Option<String>,
    /// Whether this is a channel
    #[serde(default)]
    pub is_channel: bool,
    /// Whether this is a group (private channel)
    #[serde(default)]
    pub is_group: bool,
    /// Whether this is an IM (direct message)
    #[serde(default)]
    pub is_im: bool,
    /// Whether this is an MPIM (multi-party IM)
    #[serde(default)]
    pub is_mpim: bool,
    /// Whether this is a private channel
    #[serde(default)]
    pub is_private: bool,
    /// Whether this is archived
    #[serde(default)]
    pub is_archived: bool,
    /// Whether this is general
    #[serde(default)]
    pub is_general: bool,
    /// Whether this is shared
    #[serde(default)]
    pub is_shared: bool,
    /// Whether this is externally shared
    #[serde(default)]
    pub is_ext_shared: bool,
    /// Whether this is org shared
    #[serde(default)]
    pub is_org_shared: bool,
    /// Whether this is pending external
    #[serde(default)]
    pub is_pending_ext_shared: bool,
    /// Whether the current user is a member
    #[serde(default)]
    pub is_member: bool,
    /// Creator user ID
    #[serde(default)]
    pub creator: Option<UserId>,
    /// Creation timestamp (Unix)
    #[serde(default)]
    pub created: Option<i64>,
    /// Unread count
    #[serde(default)]
    pub unread_count: Option<i32>,
    /// Unread count display
    #[serde(default)]
    pub unread_count_display: Option<i32>,
    /// Last read timestamp
    #[serde(default)]
    pub last_read: Option<Timestamp>,
    /// Channel topic
    #[serde(default)]
    pub topic: Option<ChannelTopic>,
    /// Channel purpose
    #[serde(default)]
    pub purpose: Option<ChannelPurpose>,
    /// Previous channel names
    #[serde(default)]
    pub previous_names: Vec<String>,
    /// Number of members
    #[serde(default)]
    pub num_members: Option<i32>,
    /// Locale (for DMs)
    #[serde(default)]
    pub locale: Option<String>,
    /// Priority
    #[serde(default)]
    pub priority: Option<f64>,
    /// User ID (for DMs)
    #[serde(default)]
    pub user: Option<UserId>,
    /// Context team ID
    #[serde(default)]
    pub context_team_id: Option<TeamId>,
    /// Conversation host ID
    #[serde(default)]
    pub conversation_host_id: Option<TeamId>,
    /// Internal team IDs
    #[serde(default)]
    pub internal_team_ids: Vec<TeamId>,
    /// Pending shared
    #[serde(default)]
    pub pending_shared: Vec<String>,
    /// Shared team IDs
    #[serde(default)]
    pub shared_team_ids: Vec<TeamId>,
    /// Pending connected team IDs
    #[serde(default)]
    pub pending_connected_team_ids: Vec<TeamId>,
    /// Whether this is open (for DMs)
    #[serde(default)]
    pub is_open: Option<bool>,
}

impl Channel {
    /// Get the display name for this channel
    pub fn display_name(&self) -> &str {
        self.name.as_deref().unwrap_or(&self.id.0)
    }

    /// Check if this is a direct message
    pub fn is_direct_message(&self) -> bool {
        self.is_im
    }

    /// Check if this is a group message (MPIM)
    pub fn is_group_message(&self) -> bool {
        self.is_mpim
    }

    /// Check if this is a standard channel (public or private)
    pub fn is_standard_channel(&self) -> bool {
        self.is_channel || self.is_group
    }
}

/// Channel topic
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelTopic {
    /// Topic value
    pub value: String,
    /// Who set the topic
    pub creator: UserId,
    /// When the topic was set (Unix timestamp)
    pub last_set: i64,
}

/// Channel purpose
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelPurpose {
    /// Purpose value
    pub value: String,
    /// Who set the purpose
    pub creator: UserId,
    /// When the purpose was set (Unix timestamp)
    pub last_set: i64,
}

/// Channel type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChannelType {
    /// Public channel
    PublicChannel,
    /// Private channel
    PrivateChannel,
    /// Multi-party IM
    Mpim,
    /// Direct message
    Im,
}

impl ChannelType {
    /// Get the API filter string for this channel type
    pub fn as_api_filter(&self) -> &'static str {
        match self {
            ChannelType::PublicChannel => "public_channel",
            ChannelType::PrivateChannel => "private_channel",
            ChannelType::Mpim => "mpim",
            ChannelType::Im => "im",
        }
    }
}

/// Minimal channel info returned by some endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelInfo {
    /// Channel ID
    pub id: ChannelId,
    /// Channel name
    #[serde(default)]
    pub name: Option<String>,
}

/// Channel member
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMember {
    /// Member user ID
    pub user: UserId,
    /// Date joined
    #[serde(default)]
    pub date_joined: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_channel_type_api_filter() {
        assert_eq!(ChannelType::PublicChannel.as_api_filter(), "public_channel");
        assert_eq!(ChannelType::PrivateChannel.as_api_filter(), "private_channel");
        assert_eq!(ChannelType::Mpim.as_api_filter(), "mpim");
        assert_eq!(ChannelType::Im.as_api_filter(), "im");
    }

    #[test]
    fn test_channel_deserialize() {
        let json = r#"{
            "id": "C1234567890",
            "name": "general",
            "is_channel": true,
            "is_member": true,
            "created": 1234567890
        }"#;

        let channel: Channel = serde_json::from_str(json).unwrap();
        assert_eq!(channel.id.as_str(), "C1234567890");
        assert_eq!(channel.name.as_deref(), Some("general"));
        assert!(channel.is_channel);
        assert!(channel.is_member);
    }
}
