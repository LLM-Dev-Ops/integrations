//! Common types for the Slack API.
//!
//! Defines shared data structures used across services.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub mod channel;
pub mod message;
pub mod user;

pub use channel::*;
pub use message::*;
pub use user::*;

/// Slack timestamp (ts) - unique identifier for messages
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Timestamp(pub String);

impl Timestamp {
    /// Create a new timestamp
    pub fn new(ts: impl Into<String>) -> Self {
        Self(ts.into())
    }

    /// Get the timestamp as a string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Parse timestamp to DateTime
    pub fn to_datetime(&self) -> Option<DateTime<Utc>> {
        let parts: Vec<&str> = self.0.split('.').collect();
        if let Some(secs_str) = parts.first() {
            if let Ok(secs) = secs_str.parse::<i64>() {
                return DateTime::from_timestamp(secs, 0);
            }
        }
        None
    }
}

impl From<String> for Timestamp {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for Timestamp {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl std::fmt::Display for Timestamp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Slack channel ID
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ChannelId(pub String);

impl ChannelId {
    /// Create a new channel ID
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Get the ID as a string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Check if this is a public channel ID (starts with C)
    pub fn is_public_channel(&self) -> bool {
        self.0.starts_with('C')
    }

    /// Check if this is a private channel ID (starts with G)
    pub fn is_private_channel(&self) -> bool {
        self.0.starts_with('G')
    }

    /// Check if this is a DM channel ID (starts with D)
    pub fn is_dm(&self) -> bool {
        self.0.starts_with('D')
    }

    /// Check if this is an MPDM ID (starts with G)
    pub fn is_mpdm(&self) -> bool {
        self.0.starts_with('G')
    }
}

impl From<String> for ChannelId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for ChannelId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl std::fmt::Display for ChannelId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Slack user ID
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct UserId(pub String);

impl UserId {
    /// Create a new user ID
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Get the ID as a string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Check if this is a bot user ID (starts with B)
    pub fn is_bot(&self) -> bool {
        self.0.starts_with('B')
    }

    /// Check if this is a regular user ID (starts with U or W)
    pub fn is_user(&self) -> bool {
        self.0.starts_with('U') || self.0.starts_with('W')
    }
}

impl From<String> for UserId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for UserId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl std::fmt::Display for UserId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Slack team/workspace ID
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct TeamId(pub String);

impl TeamId {
    /// Create a new team ID
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Get the ID as a string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for TeamId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for TeamId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl std::fmt::Display for TeamId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Slack file ID
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct FileId(pub String);

impl FileId {
    /// Create a new file ID
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Get the ID as a string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for FileId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for FileId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl std::fmt::Display for FileId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Cursor for pagination
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Cursor(pub String);

impl Cursor {
    /// Create a new cursor
    pub fn new(cursor: impl Into<String>) -> Self {
        Self(cursor.into())
    }

    /// Get the cursor as a string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for Cursor {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for Cursor {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

/// Response metadata for pagination
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseMetadata {
    /// Next cursor for pagination
    #[serde(default)]
    pub next_cursor: Option<String>,
}

impl ResponseMetadata {
    /// Check if there are more results
    pub fn has_more(&self) -> bool {
        self.next_cursor
            .as_ref()
            .map(|c| !c.is_empty())
            .unwrap_or(false)
    }
}

/// Base response structure for Slack API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackResponse<T> {
    /// Whether the request was successful
    pub ok: bool,
    /// Error code if not successful
    #[serde(default)]
    pub error: Option<String>,
    /// Warning message
    #[serde(default)]
    pub warning: Option<String>,
    /// Response metadata
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
    /// The actual response data (flattened)
    #[serde(flatten)]
    pub data: Option<T>,
}

/// Icon URLs for profiles/apps
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IconUrls {
    /// 36x36 icon
    #[serde(rename = "image_36")]
    pub image_36: Option<String>,
    /// 48x48 icon
    #[serde(rename = "image_48")]
    pub image_48: Option<String>,
    /// 72x72 icon
    #[serde(rename = "image_72")]
    pub image_72: Option<String>,
    /// 192x192 icon
    #[serde(rename = "image_192")]
    pub image_192: Option<String>,
    /// 512x512 icon
    #[serde(rename = "image_512")]
    pub image_512: Option<String>,
    /// Original icon
    #[serde(rename = "image_original")]
    pub image_original: Option<String>,
}

/// Emoji representation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Emoji {
    /// Standard emoji name
    Name(String),
    /// Custom emoji URL
    Url { url: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timestamp_parsing() {
        let ts = Timestamp::new("1234567890.123456");
        assert_eq!(ts.as_str(), "1234567890.123456");

        let dt = ts.to_datetime().unwrap();
        assert_eq!(dt.timestamp(), 1234567890);
    }

    #[test]
    fn test_channel_id_types() {
        let public = ChannelId::new("C1234567890");
        assert!(public.is_public_channel());
        assert!(!public.is_dm());

        let dm = ChannelId::new("D1234567890");
        assert!(dm.is_dm());
        assert!(!dm.is_public_channel());

        let private = ChannelId::new("G1234567890");
        assert!(private.is_private_channel());
    }

    #[test]
    fn test_user_id_types() {
        let user = UserId::new("U1234567890");
        assert!(user.is_user());
        assert!(!user.is_bot());

        let bot = UserId::new("B1234567890");
        assert!(bot.is_bot());
        assert!(!bot.is_user());
    }

    #[test]
    fn test_response_metadata_has_more() {
        let meta = ResponseMetadata {
            next_cursor: Some("dGVhbTpDMDYxRkE1UEI=".to_string()),
        };
        assert!(meta.has_more());

        let empty_meta = ResponseMetadata {
            next_cursor: Some("".to_string()),
        };
        assert!(!empty_meta.has_more());

        let none_meta = ResponseMetadata { next_cursor: None };
        assert!(!none_meta.has_more());
    }
}
