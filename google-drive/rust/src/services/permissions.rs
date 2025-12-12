//! Permission operations service.

use crate::client::GoogleDriveClient;
use crate::error::GoogleDriveResult;
use crate::types::*;
use serde::{Deserialize, Serialize};

/// Service for permission operations.
pub struct PermissionsService<'a> {
    client: &'a GoogleDriveClient,
}

impl<'a> PermissionsService<'a> {
    /// Creates a new permissions service.
    pub fn new(client: &'a GoogleDriveClient) -> Self {
        Self { client }
    }

    /// Creates a new permission.
    pub async fn create(
        &self,
        file_id: &str,
        request: CreatePermissionRequest,
    ) -> GoogleDriveResult<Permission> {
        let path = format!("/files/{}/permissions", file_id);
        self.client.post(&path, &request).await
    }

    /// Lists permissions for a file.
    pub async fn list(
        &self,
        file_id: &str,
        params: Option<ListPermissionsParams>,
    ) -> GoogleDriveResult<PermissionList> {
        let path = format!("/files/{}/permissions", file_id);
        if let Some(p) = params {
            self.client.get_with_params(&path, &p).await
        } else {
            self.client.get(&path).await
        }
    }

    /// Gets a specific permission.
    pub async fn get(
        &self,
        file_id: &str,
        permission_id: &str,
        params: Option<GetPermissionParams>,
    ) -> GoogleDriveResult<Permission> {
        let path = format!("/files/{}/permissions/{}", file_id, permission_id);
        if let Some(p) = params {
            self.client.get_with_params(&path, &p).await
        } else {
            self.client.get(&path).await
        }
    }

    /// Updates a permission.
    pub async fn update(
        &self,
        file_id: &str,
        permission_id: &str,
        request: UpdatePermissionRequest,
    ) -> GoogleDriveResult<Permission> {
        let path = format!("/files/{}/permissions/{}", file_id, permission_id);
        self.client.patch(&path, &request).await
    }

    /// Deletes a permission.
    pub async fn delete(
        &self,
        file_id: &str,
        permission_id: &str,
        params: Option<DeletePermissionParams>,
    ) -> GoogleDriveResult<()> {
        let mut path = format!("/files/{}/permissions/{}", file_id, permission_id);
        if let Some(p) = params {
            if p.supports_all_drives {
                path.push_str("?supportsAllDrives=true");
            }
        }
        self.client.delete(&path).await
    }
}

// Request/Response types

/// Request to create a permission.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePermissionRequest {
    pub role: String,
    #[serde(rename = "type")]
    pub permission_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_file_discovery: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_notification_email: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_message: Option<String>,
}

/// Parameters for listing permissions.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListPermissionsParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_all_drives: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Parameters for getting a permission.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetPermissionParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_all_drives: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Request to update a permission.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePermissionRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_time: Option<String>,
}

/// Parameters for deleting a permission.
#[derive(Debug, Clone, Default)]
pub struct DeletePermissionParams {
    pub supports_all_drives: bool,
}
