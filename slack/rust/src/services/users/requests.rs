//! Request types for users service.

use crate::types::{Cursor, UserId};
use serde::Serialize;

/// Request to get user info
#[derive(Debug, Clone, Serialize)]
pub struct GetUserRequest {
    /// User ID
    pub user: UserId,
    /// Include user's locale
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_locale: Option<bool>,
}

impl GetUserRequest {
    /// Create a new request
    pub fn new(user: impl Into<UserId>) -> Self {
        Self {
            user: user.into(),
            include_locale: None,
        }
    }

    /// Include locale information
    pub fn include_locale(mut self, include: bool) -> Self {
        self.include_locale = Some(include);
        self
    }
}

/// Request to list users
#[derive(Debug, Clone, Serialize)]
pub struct ListUsersRequest {
    /// Pagination cursor
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<Cursor>,
    /// Include locale
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_locale: Option<bool>,
    /// Number of results to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    /// Team ID for Enterprise Grid
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl Default for ListUsersRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl ListUsersRequest {
    /// Create a new request
    pub fn new() -> Self {
        Self {
            cursor: None,
            include_locale: None,
            limit: None,
            team_id: None,
        }
    }

    /// Set pagination cursor
    pub fn cursor(mut self, cursor: impl Into<Cursor>) -> Self {
        self.cursor = Some(cursor.into());
        self
    }

    /// Include locale information
    pub fn include_locale(mut self, include: bool) -> Self {
        self.include_locale = Some(include);
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
}

/// Request to get user's presence
#[derive(Debug, Clone, Serialize)]
pub struct GetUserPresenceRequest {
    /// User ID
    pub user: UserId,
}

impl GetUserPresenceRequest {
    /// Create a new request
    pub fn new(user: impl Into<UserId>) -> Self {
        Self { user: user.into() }
    }
}

/// Request to set user's presence
#[derive(Debug, Clone, Serialize)]
pub struct SetUserPresenceRequest {
    /// Presence status
    pub presence: String, // "auto" or "away"
}

impl SetUserPresenceRequest {
    /// Set presence to auto
    pub fn auto() -> Self {
        Self {
            presence: "auto".to_string(),
        }
    }

    /// Set presence to away
    pub fn away() -> Self {
        Self {
            presence: "away".to_string(),
        }
    }
}

/// Request to look up user by email
#[derive(Debug, Clone, Serialize)]
pub struct LookupByEmailRequest {
    /// Email address
    pub email: String,
}

impl LookupByEmailRequest {
    /// Create a new request
    pub fn new(email: impl Into<String>) -> Self {
        Self {
            email: email.into(),
        }
    }
}

/// Request to get user's profile
#[derive(Debug, Clone, Serialize)]
pub struct GetUserProfileRequest {
    /// User ID (optional, defaults to authed user)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserId>,
    /// Include labels for custom profile fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_labels: Option<bool>,
}

impl Default for GetUserProfileRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl GetUserProfileRequest {
    /// Create a new request
    pub fn new() -> Self {
        Self {
            user: None,
            include_labels: None,
        }
    }

    /// Get specific user's profile
    pub fn user(mut self, user: impl Into<UserId>) -> Self {
        self.user = Some(user.into());
        self
    }

    /// Include labels
    pub fn include_labels(mut self, include: bool) -> Self {
        self.include_labels = Some(include);
        self
    }
}

/// Request to set user's profile
#[derive(Debug, Clone, Serialize)]
pub struct SetUserProfileRequest {
    /// Profile fields to set
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<ProfileUpdate>,
    /// User ID (admin only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserId>,
    /// Name of a single field to set
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Value for single field
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

impl SetUserProfileRequest {
    /// Create a new request with profile object
    pub fn with_profile(profile: ProfileUpdate) -> Self {
        Self {
            profile: Some(profile),
            user: None,
            name: None,
            value: None,
        }
    }

    /// Create a new request with single field
    pub fn with_field(name: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            profile: None,
            user: None,
            name: Some(name.into()),
            value: Some(value.into()),
        }
    }

    /// Set target user (admin only)
    pub fn user(mut self, user: impl Into<UserId>) -> Self {
        self.user = Some(user.into());
        self
    }
}

/// Profile update fields
#[derive(Debug, Clone, Default, Serialize)]
pub struct ProfileUpdate {
    /// First name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_name: Option<String>,
    /// Last name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_name: Option<String>,
    /// Email
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// Phone
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    /// Title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Display name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Real name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub real_name: Option<String>,
    /// Status text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_text: Option<String>,
    /// Status emoji
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_emoji: Option<String>,
    /// Status expiration (Unix timestamp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_expiration: Option<i64>,
    /// Custom fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<serde_json::Value>,
}

impl ProfileUpdate {
    /// Create a new profile update
    pub fn new() -> Self {
        Self::default()
    }

    /// Set status
    pub fn status(mut self, text: impl Into<String>, emoji: impl Into<String>) -> Self {
        self.status_text = Some(text.into());
        self.status_emoji = Some(emoji.into());
        self
    }

    /// Set status with expiration
    pub fn status_with_expiration(
        mut self,
        text: impl Into<String>,
        emoji: impl Into<String>,
        expiration: i64,
    ) -> Self {
        self.status_text = Some(text.into());
        self.status_emoji = Some(emoji.into());
        self.status_expiration = Some(expiration);
        self
    }

    /// Set display name
    pub fn display_name(mut self, name: impl Into<String>) -> Self {
        self.display_name = Some(name.into());
        self
    }

    /// Set title
    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }
}

/// Request to list conversations for a user
#[derive(Debug, Clone, Serialize)]
pub struct UserConversationsRequest {
    /// User ID (optional, defaults to authed user)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserId>,
    /// Pagination cursor
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<Cursor>,
    /// Exclude archived channels
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclude_archived: Option<bool>,
    /// Number of results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    /// Team ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    /// Channel types
    #[serde(skip_serializing_if = "Option::is_none")]
    pub types: Option<String>,
}

impl Default for UserConversationsRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl UserConversationsRequest {
    /// Create a new request
    pub fn new() -> Self {
        Self {
            user: None,
            cursor: None,
            exclude_archived: None,
            limit: None,
            team_id: None,
            types: None,
        }
    }

    /// Get conversations for specific user
    pub fn user(mut self, user: impl Into<UserId>) -> Self {
        self.user = Some(user.into());
        self
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

    /// Exclude archived channels
    pub fn exclude_archived(mut self, exclude: bool) -> Self {
        self.exclude_archived = Some(exclude);
        self
    }
}

/// Request to get user photo
#[derive(Debug, Clone, Serialize)]
pub struct SetUserPhotoRequest {
    /// Image file content (base64 encoded)
    pub image: String,
    /// Crop x coordinate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crop_x: Option<i32>,
    /// Crop y coordinate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crop_y: Option<i32>,
    /// Crop width
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crop_w: Option<i32>,
}

impl SetUserPhotoRequest {
    /// Create a new request
    pub fn new(image: impl Into<String>) -> Self {
        Self {
            image: image.into(),
            crop_x: None,
            crop_y: None,
            crop_w: None,
        }
    }

    /// Set crop coordinates
    pub fn crop(mut self, x: i32, y: i32, w: i32) -> Self {
        self.crop_x = Some(x);
        self.crop_y = Some(y);
        self.crop_w = Some(w);
        self
    }
}

/// Request to delete user photo
#[derive(Debug, Clone, Serialize)]
pub struct DeleteUserPhotoRequest {}

impl Default for DeleteUserPhotoRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl DeleteUserPhotoRequest {
    /// Create a new request
    pub fn new() -> Self {
        Self {}
    }
}
