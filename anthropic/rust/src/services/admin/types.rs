//! Type definitions for the Admin API.

use serde::{Deserialize, Serialize};

/// Organization resource
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Organization {
    /// Unique identifier for the organization
    pub id: String,
    /// Name of the organization
    pub name: String,
    /// ISO 8601 timestamp when the organization was created
    pub created_at: String,
    /// ISO 8601 timestamp when the organization was last updated
    pub updated_at: String,
}

/// Workspace resource
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Workspace {
    /// Unique identifier for the workspace
    pub id: String,
    /// Name of the workspace
    pub name: String,
    /// Organization ID that the workspace belongs to
    pub organization_id: String,
    /// ISO 8601 timestamp when the workspace was created
    pub created_at: String,
    /// ISO 8601 timestamp when the workspace was archived (if archived)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
}

/// Role of a workspace member
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceMemberRole {
    /// Workspace administrator with full permissions
    WorkspaceAdmin,
    /// Developer with access to development features
    WorkspaceDeveloper,
    /// Regular user with basic access
    WorkspaceUser,
    /// Billing administrator
    WorkspaceBilling,
}

/// Workspace member resource
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceMember {
    /// User ID of the member
    pub user_id: String,
    /// Workspace ID the member belongs to
    pub workspace_id: String,
    /// Role of the member in the workspace
    pub role: WorkspaceMemberRole,
    /// ISO 8601 timestamp when the member was added
    pub added_at: String,
}

/// Status of an API key
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApiKeyStatus {
    /// Key is active and can be used
    Active,
    /// Key has been disabled
    Disabled,
    /// Key has been archived
    Archived,
}

/// API key resource (without the secret)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApiKey {
    /// Unique identifier for the API key
    pub id: String,
    /// Name of the API key
    pub name: String,
    /// Workspace ID the key belongs to
    pub workspace_id: String,
    /// ISO 8601 timestamp when the key was created
    pub created_at: String,
    /// Current status of the key
    pub status: ApiKeyStatus,
    /// Partial hint of the key for identification (last 4 characters)
    pub partial_key_hint: String,
}

/// API key resource with secret (only returned on creation)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApiKeyWithSecret {
    /// The API key resource
    #[serde(flatten)]
    pub api_key: ApiKey,
    /// The full API key secret (only available on creation)
    pub api_key_secret: String,
}

/// Status of an invite
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InviteStatus {
    /// Invite is pending acceptance
    Pending,
    /// Invite has been accepted
    Accepted,
    /// Invite has expired
    Expired,
    /// Invite has been deleted
    Deleted,
}

/// Invite resource
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Invite {
    /// Unique identifier for the invite
    pub id: String,
    /// Email address of the invitee
    pub email: String,
    /// Workspace ID the invite is for
    pub workspace_id: String,
    /// Role the invitee will have
    pub role: WorkspaceMemberRole,
    /// Current status of the invite
    pub status: InviteStatus,
    /// ISO 8601 timestamp when the invite was created
    pub created_at: String,
    /// ISO 8601 timestamp when the invite expires
    pub expires_at: String,
}

/// User resource
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct User {
    /// Unique identifier for the user
    pub id: String,
    /// Email address of the user
    pub email: String,
    /// Display name of the user
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// ISO 8601 timestamp when the user was created
    pub created_at: String,
}

// Request types

/// Request to update an organization
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UpdateOrganizationRequest {
    /// New name for the organization
    pub name: String,
}

/// Request to create a workspace
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreateWorkspaceRequest {
    /// Name of the workspace
    pub name: String,
}

/// Request to update a workspace
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UpdateWorkspaceRequest {
    /// New name for the workspace (if provided)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Request to add a workspace member
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AddWorkspaceMemberRequest {
    /// User ID to add to the workspace
    pub user_id: String,
    /// Role to assign to the member
    pub role: WorkspaceMemberRole,
}

/// Request to update a workspace member
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UpdateWorkspaceMemberRequest {
    /// New role for the member
    pub role: WorkspaceMemberRole,
}

/// Request to create an API key
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreateApiKeyRequest {
    /// Name of the API key
    pub name: String,
    /// Workspace ID the key will belong to
    pub workspace_id: String,
}

/// Request to update an API key
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UpdateApiKeyRequest {
    /// New name for the API key
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// New status for the API key
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<ApiKeyStatus>,
}

/// Request to create an invite
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreateInviteRequest {
    /// Email address to invite
    pub email: String,
    /// Workspace ID to invite to
    pub workspace_id: String,
    /// Role to assign to the invitee
    pub role: WorkspaceMemberRole,
}

// List params and responses

/// Parameters for list operations
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ListParams {
    /// Return results before this ID (for pagination)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before_id: Option<String>,
    /// Return results after this ID (for pagination)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after_id: Option<String>,
    /// Maximum number of results to return (default: 20, max: 100)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

/// Response for list operations
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ListResponse<T> {
    /// The list of items
    pub data: Vec<T>,
    /// Whether there are more results available
    pub has_more: bool,
    /// ID of the first item in the list
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_id: Option<String>,
    /// ID of the last item in the list
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_member_role_serialization() {
        let role = WorkspaceMemberRole::WorkspaceAdmin;
        let json = serde_json::to_string(&role).unwrap();
        assert_eq!(json, "\"workspace_admin\"");

        let deserialized: WorkspaceMemberRole = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, role);
    }

    #[test]
    fn test_api_key_status_serialization() {
        let status = ApiKeyStatus::Active;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"active\"");

        let deserialized: ApiKeyStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, status);
    }

    #[test]
    fn test_invite_status_serialization() {
        let status = InviteStatus::Pending;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"pending\"");

        let deserialized: InviteStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, status);
    }

    #[test]
    fn test_list_params_default() {
        let params = ListParams::default();
        assert!(params.before_id.is_none());
        assert!(params.after_id.is_none());
        assert!(params.limit.is_none());
    }

    #[test]
    fn test_api_key_with_secret_flatten() {
        let api_key_with_secret = ApiKeyWithSecret {
            api_key: ApiKey {
                id: "key-123".to_string(),
                name: "Test Key".to_string(),
                workspace_id: "ws-123".to_string(),
                created_at: "2024-01-01T00:00:00Z".to_string(),
                status: ApiKeyStatus::Active,
                partial_key_hint: "1234".to_string(),
            },
            api_key_secret: "sk-ant-secret123".to_string(),
        };

        let json = serde_json::to_string(&api_key_with_secret).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        // Verify that api_key fields are flattened
        assert!(value.get("id").is_some());
        assert!(value.get("name").is_some());
        assert!(value.get("api_key_secret").is_some());
        assert!(value.get("api_key").is_none()); // Should be flattened
    }
}
