//! Response types for usergroups service.

use crate::types::UserId;
use serde::Deserialize;

/// Response from usergroups.create
#[derive(Debug, Clone, Deserialize)]
pub struct CreateUsergroupResponse {
    /// Success indicator
    pub ok: bool,
    /// Created usergroup
    pub usergroup: Usergroup,
}

/// Response from usergroups.disable
#[derive(Debug, Clone, Deserialize)]
pub struct DisableUsergroupResponse {
    /// Success indicator
    pub ok: bool,
    /// Disabled usergroup
    pub usergroup: Usergroup,
}

/// Response from usergroups.enable
#[derive(Debug, Clone, Deserialize)]
pub struct EnableUsergroupResponse {
    /// Success indicator
    pub ok: bool,
    /// Enabled usergroup
    pub usergroup: Usergroup,
}

/// Response from usergroups.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListUsergroupsResponse {
    /// Success indicator
    pub ok: bool,
    /// List of usergroups
    #[serde(default)]
    pub usergroups: Vec<Usergroup>,
}

/// Response from usergroups.update
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUsergroupResponse {
    /// Success indicator
    pub ok: bool,
    /// Updated usergroup
    pub usergroup: Usergroup,
}

/// Response from usergroups.users.list
#[derive(Debug, Clone, Deserialize)]
pub struct UsersListResponse {
    /// Success indicator
    pub ok: bool,
    /// List of user IDs
    #[serde(default)]
    pub users: Vec<UserId>,
}

/// Response from usergroups.users.update
#[derive(Debug, Clone, Deserialize)]
pub struct UsersUpdateResponse {
    /// Success indicator
    pub ok: bool,
    /// Updated usergroup
    pub usergroup: Usergroup,
}

/// Usergroup (User Group / Team) representation
#[derive(Debug, Clone, Deserialize)]
pub struct Usergroup {
    /// Usergroup ID
    pub id: String,
    /// Team ID
    pub team_id: String,
    /// Whether this is a usergroup (always true)
    pub is_usergroup: bool,
    /// Whether this is an external usergroup
    #[serde(default)]
    pub is_external: Option<bool>,
    /// Name of the usergroup
    pub name: String,
    /// Description
    #[serde(default)]
    pub description: Option<String>,
    /// Handle (unique identifier)
    pub handle: String,
    /// Whether subteams are enabled (legacy)
    #[serde(default)]
    pub is_subteam: Option<bool>,
    /// Auto type
    #[serde(default)]
    pub auto_type: Option<String>,
    /// Auto provision
    #[serde(default)]
    pub auto_provision: Option<bool>,
    /// Enterprise subteam ID
    #[serde(default)]
    pub enterprise_subteam_id: Option<String>,
    /// Created by user ID
    pub created_by: String,
    /// Updated by user ID
    #[serde(default)]
    pub updated_by: Option<String>,
    /// Deleted by user ID
    #[serde(default)]
    pub deleted_by: Option<String>,
    /// Preferences
    #[serde(default)]
    pub prefs: Option<UsergroupPrefs>,
    /// User IDs in the group
    #[serde(default)]
    pub users: Vec<UserId>,
    /// Number of users in the group
    #[serde(default)]
    pub user_count: Option<i32>,
    /// Channel IDs the group is in
    #[serde(default)]
    pub channel_count: Option<i32>,
    /// Date created (Unix timestamp)
    pub date_create: i64,
    /// Date updated (Unix timestamp)
    pub date_update: i64,
    /// Date deleted (Unix timestamp)
    #[serde(default)]
    pub date_delete: Option<i64>,
}

impl Usergroup {
    /// Check if the usergroup is deleted
    pub fn is_deleted(&self) -> bool {
        self.date_delete.is_some()
    }

    /// Check if the usergroup is active
    pub fn is_active(&self) -> bool {
        !self.is_deleted()
    }

    /// Get the number of users in the group
    pub fn member_count(&self) -> Option<i32> {
        self.user_count
    }
}

/// Usergroup preferences
#[derive(Debug, Clone, Deserialize)]
pub struct UsergroupPrefs {
    /// Channel IDs the group should be in
    #[serde(default)]
    pub channels: Vec<String>,
    /// Group IDs
    #[serde(default)]
    pub groups: Vec<String>,
}
