//! Request types for usergroups service.

use crate::types::UserId;
use serde::Serialize;

/// Request to create a usergroup
#[derive(Debug, Clone, Serialize)]
pub struct CreateUsergroupRequest {
    /// Name of the usergroup
    pub name: String,
    /// Handle for the usergroup (alphanumeric + underscore)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// Description of the usergroup
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Channel IDs the usergroup should be in
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<Vec<String>>,
    /// Whether to include the number of users in the usergroup
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_count: Option<bool>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl CreateUsergroupRequest {
    /// Create a new usergroup request
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            handle: None,
            description: None,
            channels: None,
            include_count: None,
            team_id: None,
        }
    }

    /// Set the handle
    pub fn handle(mut self, handle: impl Into<String>) -> Self {
        self.handle = Some(handle.into());
        self
    }

    /// Set the description
    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set the channels
    pub fn channels(mut self, channels: Vec<String>) -> Self {
        self.channels = Some(channels);
        self
    }

    /// Include count in response
    pub fn include_count(mut self, include: bool) -> Self {
        self.include_count = Some(include);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to disable a usergroup
#[derive(Debug, Clone, Serialize)]
pub struct DisableUsergroupRequest {
    /// Usergroup ID
    pub usergroup: String,
    /// Whether to include the number of users
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_count: Option<bool>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl DisableUsergroupRequest {
    /// Create a new disable usergroup request
    pub fn new(usergroup: impl Into<String>) -> Self {
        Self {
            usergroup: usergroup.into(),
            include_count: None,
            team_id: None,
        }
    }

    /// Include count in response
    pub fn include_count(mut self, include: bool) -> Self {
        self.include_count = Some(include);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to enable a usergroup
#[derive(Debug, Clone, Serialize)]
pub struct EnableUsergroupRequest {
    /// Usergroup ID
    pub usergroup: String,
    /// Whether to include the number of users
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_count: Option<bool>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl EnableUsergroupRequest {
    /// Create a new enable usergroup request
    pub fn new(usergroup: impl Into<String>) -> Self {
        Self {
            usergroup: usergroup.into(),
            include_count: None,
            team_id: None,
        }
    }

    /// Include count in response
    pub fn include_count(mut self, include: bool) -> Self {
        self.include_count = Some(include);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to list usergroups
#[derive(Debug, Clone, Serialize)]
pub struct ListUsergroupsRequest {
    /// Include disabled usergroups
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_disabled: Option<bool>,
    /// Include the number of users in each usergroup
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_count: Option<bool>,
    /// Include users in each usergroup
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_users: Option<bool>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl Default for ListUsergroupsRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl ListUsergroupsRequest {
    /// Create a new list usergroups request
    pub fn new() -> Self {
        Self {
            include_disabled: None,
            include_count: None,
            include_users: None,
            team_id: None,
        }
    }

    /// Include disabled usergroups
    pub fn include_disabled(mut self, include: bool) -> Self {
        self.include_disabled = Some(include);
        self
    }

    /// Include count
    pub fn include_count(mut self, include: bool) -> Self {
        self.include_count = Some(include);
        self
    }

    /// Include users
    pub fn include_users(mut self, include: bool) -> Self {
        self.include_users = Some(include);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to update a usergroup
#[derive(Debug, Clone, Serialize)]
pub struct UpdateUsergroupRequest {
    /// Usergroup ID
    pub usergroup: String,
    /// New name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// New handle
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// New description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// New channels
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<Vec<String>>,
    /// Whether to include count
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_count: Option<bool>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl UpdateUsergroupRequest {
    /// Create a new update usergroup request
    pub fn new(usergroup: impl Into<String>) -> Self {
        Self {
            usergroup: usergroup.into(),
            name: None,
            handle: None,
            description: None,
            channels: None,
            include_count: None,
            team_id: None,
        }
    }

    /// Set new name
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    /// Set new handle
    pub fn handle(mut self, handle: impl Into<String>) -> Self {
        self.handle = Some(handle.into());
        self
    }

    /// Set new description
    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set new channels
    pub fn channels(mut self, channels: Vec<String>) -> Self {
        self.channels = Some(channels);
        self
    }

    /// Include count in response
    pub fn include_count(mut self, include: bool) -> Self {
        self.include_count = Some(include);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to list users in a usergroup
#[derive(Debug, Clone, Serialize)]
pub struct UsersListRequest {
    /// Usergroup ID
    pub usergroup: String,
    /// Include disabled users
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_disabled: Option<bool>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl UsersListRequest {
    /// Create a new users list request
    pub fn new(usergroup: impl Into<String>) -> Self {
        Self {
            usergroup: usergroup.into(),
            include_disabled: None,
            team_id: None,
        }
    }

    /// Include disabled users
    pub fn include_disabled(mut self, include: bool) -> Self {
        self.include_disabled = Some(include);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to update users in a usergroup
#[derive(Debug, Clone, Serialize)]
pub struct UsersUpdateRequest {
    /// Usergroup ID
    pub usergroup: String,
    /// User IDs to set as members
    pub users: Vec<UserId>,
    /// Include count in response
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_count: Option<bool>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl UsersUpdateRequest {
    /// Create a new users update request
    pub fn new(usergroup: impl Into<String>, users: Vec<UserId>) -> Self {
        Self {
            usergroup: usergroup.into(),
            users,
            include_count: None,
            team_id: None,
        }
    }

    /// Include count in response
    pub fn include_count(mut self, include: bool) -> Self {
        self.include_count = Some(include);
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}
