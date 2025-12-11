//! User-related types for the Slack API.

use super::{TeamId, UserId};
use serde::{Deserialize, Serialize};

/// Slack user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    /// User ID
    pub id: UserId,
    /// Team ID
    #[serde(default)]
    pub team_id: Option<TeamId>,
    /// Username
    #[serde(default)]
    pub name: Option<String>,
    /// Real name
    #[serde(default)]
    pub real_name: Option<String>,
    /// Display name
    #[serde(default)]
    pub display_name: Option<String>,
    /// Whether deleted/deactivated
    #[serde(default)]
    pub deleted: bool,
    /// User color
    #[serde(default)]
    pub color: Option<String>,
    /// Timezone
    #[serde(default)]
    pub tz: Option<String>,
    /// Timezone label
    #[serde(default)]
    pub tz_label: Option<String>,
    /// Timezone offset
    #[serde(default)]
    pub tz_offset: Option<i32>,
    /// User profile
    #[serde(default)]
    pub profile: Option<UserProfile>,
    /// Whether admin
    #[serde(default)]
    pub is_admin: bool,
    /// Whether owner
    #[serde(default)]
    pub is_owner: bool,
    /// Whether primary owner
    #[serde(default)]
    pub is_primary_owner: bool,
    /// Whether restricted
    #[serde(default)]
    pub is_restricted: bool,
    /// Whether ultra restricted
    #[serde(default)]
    pub is_ultra_restricted: bool,
    /// Whether bot
    #[serde(default)]
    pub is_bot: bool,
    /// Whether app user
    #[serde(default)]
    pub is_app_user: bool,
    /// Whether has 2FA
    #[serde(default)]
    pub has_2fa: bool,
    /// Updated timestamp
    #[serde(default)]
    pub updated: Option<i64>,
    /// Whether email confirmed
    #[serde(default)]
    pub is_email_confirmed: Option<bool>,
    /// Who invited this user
    #[serde(default)]
    pub who_can_share_contact_card: Option<String>,
    /// Locale
    #[serde(default)]
    pub locale: Option<String>,
}

impl User {
    /// Get the best display name for this user
    pub fn display_name_or_name(&self) -> &str {
        self.display_name
            .as_deref()
            .filter(|s| !s.is_empty())
            .or(self.real_name.as_deref())
            .or(self.name.as_deref())
            .unwrap_or(&self.id.0)
    }

    /// Check if this is a regular user (not bot, not deleted)
    pub fn is_regular_user(&self) -> bool {
        !self.is_bot && !self.deleted && !self.is_app_user
    }

    /// Get the user's email if available
    pub fn email(&self) -> Option<&str> {
        self.profile.as_ref().and_then(|p| p.email.as_deref())
    }

    /// Get the user's avatar URL
    pub fn avatar_url(&self) -> Option<&str> {
        self.profile.as_ref().and_then(|p| {
            p.image_192
                .as_deref()
                .or(p.image_72.as_deref())
                .or(p.image_48.as_deref())
                .or(p.image_32.as_deref())
                .or(p.image_24.as_deref())
        })
    }
}

/// User profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    /// Avatar hash
    #[serde(default)]
    pub avatar_hash: Option<String>,
    /// Status text
    #[serde(default)]
    pub status_text: Option<String>,
    /// Status emoji
    #[serde(default)]
    pub status_emoji: Option<String>,
    /// Status expiration
    #[serde(default)]
    pub status_expiration: Option<i64>,
    /// Real name
    #[serde(default)]
    pub real_name: Option<String>,
    /// Real name normalized
    #[serde(default)]
    pub real_name_normalized: Option<String>,
    /// Display name
    #[serde(default)]
    pub display_name: Option<String>,
    /// Display name normalized
    #[serde(default)]
    pub display_name_normalized: Option<String>,
    /// Email
    #[serde(default)]
    pub email: Option<String>,
    /// First name
    #[serde(default)]
    pub first_name: Option<String>,
    /// Last name
    #[serde(default)]
    pub last_name: Option<String>,
    /// Title
    #[serde(default)]
    pub title: Option<String>,
    /// Phone
    #[serde(default)]
    pub phone: Option<String>,
    /// Skype
    #[serde(default)]
    pub skype: Option<String>,
    /// Image 24x24
    #[serde(rename = "image_24")]
    pub image_24: Option<String>,
    /// Image 32x32
    #[serde(rename = "image_32")]
    pub image_32: Option<String>,
    /// Image 48x48
    #[serde(rename = "image_48")]
    pub image_48: Option<String>,
    /// Image 72x72
    #[serde(rename = "image_72")]
    pub image_72: Option<String>,
    /// Image 192x192
    #[serde(rename = "image_192")]
    pub image_192: Option<String>,
    /// Image 512x512
    #[serde(rename = "image_512")]
    pub image_512: Option<String>,
    /// Image 1024x1024
    #[serde(rename = "image_1024")]
    pub image_1024: Option<String>,
    /// Original image
    #[serde(rename = "image_original")]
    pub image_original: Option<String>,
    /// Team
    #[serde(default)]
    pub team: Option<TeamId>,
    /// Bot ID if bot
    #[serde(default)]
    pub bot_id: Option<String>,
    /// API app ID
    #[serde(default)]
    pub api_app_id: Option<String>,
    /// Always active
    #[serde(default)]
    pub always_active: bool,
    /// Huddle state
    #[serde(default)]
    pub huddle_state: Option<String>,
    /// Huddle state expiration timestamp
    #[serde(default)]
    pub huddle_state_expiration_ts: Option<i64>,
    /// Custom fields
    #[serde(default)]
    pub fields: Option<serde_json::Value>,
}

impl UserProfile {
    /// Get the status message
    pub fn status(&self) -> Option<String> {
        match (&self.status_emoji, &self.status_text) {
            (Some(emoji), Some(text)) if !text.is_empty() => Some(format!("{} {}", emoji, text)),
            (Some(emoji), _) => Some(emoji.clone()),
            (_, Some(text)) if !text.is_empty() => Some(text.clone()),
            _ => None,
        }
    }

    /// Get the full name
    pub fn full_name(&self) -> Option<String> {
        match (&self.first_name, &self.last_name) {
            (Some(first), Some(last)) => Some(format!("{} {}", first, last)),
            (Some(first), None) => Some(first.clone()),
            (None, Some(last)) => Some(last.clone()),
            _ => self.real_name.clone(),
        }
    }
}

/// User presence status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresenceStatus {
    /// User is active
    Active,
    /// User is away
    Away,
}

/// User presence information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPresence {
    /// Presence status
    pub presence: PresenceStatus,
    /// Whether online
    #[serde(default)]
    pub online: bool,
    /// Whether auto away
    #[serde(default)]
    pub auto_away: bool,
    /// Whether manual away
    #[serde(default)]
    pub manual_away: bool,
    /// Connection count
    #[serde(default)]
    pub connection_count: Option<i32>,
    /// Last activity timestamp
    #[serde(default)]
    pub last_activity: Option<i64>,
}

/// User identity (from auth.test)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserIdentity {
    /// User ID
    pub user_id: UserId,
    /// Username
    pub user: String,
    /// Team ID
    pub team_id: TeamId,
    /// Team name
    pub team: String,
    /// Bot ID if bot token
    #[serde(default)]
    pub bot_id: Option<String>,
    /// Enterprise ID
    #[serde(default)]
    pub enterprise_id: Option<String>,
    /// Whether the token is enterprise install
    #[serde(default)]
    pub is_enterprise_install: bool,
}

/// Do Not Disturb status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DndStatus {
    /// DND enabled
    pub dnd_enabled: bool,
    /// Next DND start time
    #[serde(default)]
    pub next_dnd_start_ts: Option<i64>,
    /// Next DND end time
    #[serde(default)]
    pub next_dnd_end_ts: Option<i64>,
    /// Snooze enabled
    #[serde(default)]
    pub snooze_enabled: bool,
    /// Snooze end time
    #[serde(default)]
    pub snooze_endtime: Option<i64>,
    /// Snooze remaining
    #[serde(default)]
    pub snooze_remaining: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_display_name() {
        let user = User {
            id: UserId::new("U123"),
            team_id: None,
            name: Some("jdoe".to_string()),
            real_name: Some("John Doe".to_string()),
            display_name: Some("Johnny".to_string()),
            deleted: false,
            color: None,
            tz: None,
            tz_label: None,
            tz_offset: None,
            profile: None,
            is_admin: false,
            is_owner: false,
            is_primary_owner: false,
            is_restricted: false,
            is_ultra_restricted: false,
            is_bot: false,
            is_app_user: false,
            has_2fa: false,
            updated: None,
            is_email_confirmed: None,
            who_can_share_contact_card: None,
            locale: None,
        };

        assert_eq!(user.display_name_or_name(), "Johnny");
        assert!(user.is_regular_user());
    }

    #[test]
    fn test_user_profile_status() {
        let profile = UserProfile {
            avatar_hash: None,
            status_text: Some("Working".to_string()),
            status_emoji: Some(":computer:".to_string()),
            status_expiration: None,
            real_name: None,
            real_name_normalized: None,
            display_name: None,
            display_name_normalized: None,
            email: None,
            first_name: Some("John".to_string()),
            last_name: Some("Doe".to_string()),
            title: None,
            phone: None,
            skype: None,
            image_24: None,
            image_32: None,
            image_48: None,
            image_72: None,
            image_192: None,
            image_512: None,
            image_1024: None,
            image_original: None,
            team: None,
            bot_id: None,
            api_app_id: None,
            always_active: false,
            huddle_state: None,
            huddle_state_expiration_ts: None,
            fields: None,
        };

        assert_eq!(profile.status(), Some(":computer: Working".to_string()));
        assert_eq!(profile.full_name(), Some("John Doe".to_string()));
    }

    #[test]
    fn test_presence_deserialization() {
        let json = r#"{"presence": "active", "online": true}"#;
        let presence: UserPresence = serde_json::from_str(json).unwrap();
        assert_eq!(presence.presence, PresenceStatus::Active);
        assert!(presence.online);
    }
}
