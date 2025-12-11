//! Response types for users service.

use crate::types::{Channel, DndStatus, ResponseMetadata, User, UserPresence, UserProfile};
use serde::Deserialize;

/// Response from users.info
#[derive(Debug, Clone, Deserialize)]
pub struct GetUserResponse {
    /// Success indicator
    pub ok: bool,
    /// User info
    pub user: User,
}

/// Response from users.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListUsersResponse {
    /// Success indicator
    pub ok: bool,
    /// List of users
    #[serde(default)]
    pub members: Vec<User>,
    /// Cache timestamp
    #[serde(default)]
    pub cache_ts: Option<i64>,
    /// Response metadata for pagination
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

impl ListUsersResponse {
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

/// Response from users.getPresence
#[derive(Debug, Clone, Deserialize)]
pub struct GetUserPresenceResponse {
    /// Success indicator
    pub ok: bool,
    /// Presence status
    pub presence: String,
    /// Online status
    #[serde(default)]
    pub online: Option<bool>,
    /// Auto away
    #[serde(default)]
    pub auto_away: Option<bool>,
    /// Manual away
    #[serde(default)]
    pub manual_away: Option<bool>,
    /// Connection count
    #[serde(default)]
    pub connection_count: Option<i32>,
    /// Last activity
    #[serde(default)]
    pub last_activity: Option<i64>,
}

/// Response from users.setPresence
#[derive(Debug, Clone, Deserialize)]
pub struct SetUserPresenceResponse {
    /// Success indicator
    pub ok: bool,
}

/// Response from users.lookupByEmail
#[derive(Debug, Clone, Deserialize)]
pub struct LookupByEmailResponse {
    /// Success indicator
    pub ok: bool,
    /// User info
    pub user: User,
}

/// Response from users.profile.get
#[derive(Debug, Clone, Deserialize)]
pub struct GetUserProfileResponse {
    /// Success indicator
    pub ok: bool,
    /// User profile
    pub profile: UserProfile,
}

/// Response from users.profile.set
#[derive(Debug, Clone, Deserialize)]
pub struct SetUserProfileResponse {
    /// Success indicator
    pub ok: bool,
    /// Updated profile
    pub profile: UserProfile,
    /// Username if changed
    #[serde(default)]
    pub username: Option<String>,
}

/// Response from users.conversations
#[derive(Debug, Clone, Deserialize)]
pub struct UserConversationsResponse {
    /// Success indicator
    pub ok: bool,
    /// User's channels
    #[serde(default)]
    pub channels: Vec<Channel>,
    /// Response metadata for pagination
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

impl UserConversationsResponse {
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

/// Response from users.setPhoto
#[derive(Debug, Clone, Deserialize)]
pub struct SetUserPhotoResponse {
    /// Success indicator
    pub ok: bool,
    /// Profile with updated images
    pub profile: PhotoProfile,
}

/// Profile with photo information
#[derive(Debug, Clone, Deserialize)]
pub struct PhotoProfile {
    /// Avatar hash
    #[serde(default)]
    pub avatar_hash: Option<String>,
    /// Image 24
    #[serde(rename = "image_24")]
    pub image_24: Option<String>,
    /// Image 32
    #[serde(rename = "image_32")]
    pub image_32: Option<String>,
    /// Image 48
    #[serde(rename = "image_48")]
    pub image_48: Option<String>,
    /// Image 72
    #[serde(rename = "image_72")]
    pub image_72: Option<String>,
    /// Image 192
    #[serde(rename = "image_192")]
    pub image_192: Option<String>,
    /// Image 512
    #[serde(rename = "image_512")]
    pub image_512: Option<String>,
    /// Image 1024
    #[serde(rename = "image_1024")]
    pub image_1024: Option<String>,
    /// Original image
    #[serde(rename = "image_original")]
    pub image_original: Option<String>,
}

/// Response from users.deletePhoto
#[derive(Debug, Clone, Deserialize)]
pub struct DeleteUserPhotoResponse {
    /// Success indicator
    pub ok: bool,
}

/// Response from users.identity
#[derive(Debug, Clone, Deserialize)]
pub struct UserIdentityResponse {
    /// Success indicator
    pub ok: bool,
    /// User identity
    pub user: UserIdentity,
    /// Team identity
    pub team: TeamIdentity,
}

/// User identity from users.identity
#[derive(Debug, Clone, Deserialize)]
pub struct UserIdentity {
    /// User ID
    pub id: String,
    /// User name
    pub name: String,
    /// User email
    #[serde(default)]
    pub email: Option<String>,
    /// Avatar 24
    #[serde(rename = "image_24")]
    pub image_24: Option<String>,
    /// Avatar 32
    #[serde(rename = "image_32")]
    pub image_32: Option<String>,
    /// Avatar 48
    #[serde(rename = "image_48")]
    pub image_48: Option<String>,
    /// Avatar 72
    #[serde(rename = "image_72")]
    pub image_72: Option<String>,
    /// Avatar 192
    #[serde(rename = "image_192")]
    pub image_192: Option<String>,
    /// Avatar 512
    #[serde(rename = "image_512")]
    pub image_512: Option<String>,
}

/// Team identity from users.identity
#[derive(Debug, Clone, Deserialize)]
pub struct TeamIdentity {
    /// Team ID
    pub id: String,
    /// Team name
    pub name: String,
    /// Team domain
    #[serde(default)]
    pub domain: Option<String>,
    /// Team image 34
    #[serde(rename = "image_34")]
    pub image_34: Option<String>,
    /// Team image 44
    #[serde(rename = "image_44")]
    pub image_44: Option<String>,
    /// Team image 68
    #[serde(rename = "image_68")]
    pub image_68: Option<String>,
    /// Team image 88
    #[serde(rename = "image_88")]
    pub image_88: Option<String>,
    /// Team image 102
    #[serde(rename = "image_102")]
    pub image_102: Option<String>,
    /// Team image 132
    #[serde(rename = "image_132")]
    pub image_132: Option<String>,
    /// Team image 230
    #[serde(rename = "image_230")]
    pub image_230: Option<String>,
    /// Default team image
    #[serde(rename = "image_default")]
    pub image_default: Option<bool>,
}
