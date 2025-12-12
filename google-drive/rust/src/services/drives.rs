//! Shared drives operations service.

use crate::client::GoogleDriveClient;
use crate::error::GoogleDriveResult;
use crate::types::*;
use serde::{Deserialize, Serialize};

/// Service for shared drives operations.
pub struct DrivesService<'a> {
    client: &'a GoogleDriveClient,
}

impl<'a> DrivesService<'a> {
    /// Creates a new drives service.
    pub fn new(client: &'a GoogleDriveClient) -> Self {
        Self { client }
    }

    /// Lists shared drives.
    pub async fn list(&self, params: Option<ListDrivesParams>) -> GoogleDriveResult<DriveList> {
        if let Some(p) = params {
            self.client.get_with_params("/drives", &p).await
        } else {
            self.client.get("/drives").await
        }
    }

    /// Gets a shared drive.
    pub async fn get(
        &self,
        drive_id: &str,
        params: Option<GetDriveParams>,
    ) -> GoogleDriveResult<Drive> {
        let path = format!("/drives/{}", drive_id);
        if let Some(p) = params {
            self.client.get_with_params(&path, &p).await
        } else {
            self.client.get(&path).await
        }
    }

    /// Creates a shared drive.
    pub async fn create(
        &self,
        request_id: &str,
        request: CreateDriveRequest,
    ) -> GoogleDriveResult<Drive> {
        let path = format!("/drives?requestId={}", request_id);
        self.client.post(&path, &request).await
    }

    /// Updates a shared drive.
    pub async fn update(
        &self,
        drive_id: &str,
        request: UpdateDriveRequest,
    ) -> GoogleDriveResult<Drive> {
        let path = format!("/drives/{}", drive_id);
        self.client.patch(&path, &request).await
    }

    /// Deletes a shared drive.
    pub async fn delete(&self, drive_id: &str) -> GoogleDriveResult<()> {
        let path = format!("/drives/{}", drive_id);
        self.client.delete(&path).await
    }

    /// Hides a shared drive.
    pub async fn hide(&self, drive_id: &str) -> GoogleDriveResult<Drive> {
        let path = format!("/drives/{}/hide", drive_id);
        self.client.post(&path, &serde_json::json!({})).await
    }

    /// Unhides a shared drive.
    pub async fn unhide(&self, drive_id: &str) -> GoogleDriveResult<Drive> {
        let path = format!("/drives/{}/unhide", drive_id);
        self.client.post(&path, &serde_json::json!({})).await
    }
}

// Request/Response types

/// Parameters for listing drives.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListDrivesParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_domain_admin_access: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Parameters for getting a drive.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetDriveParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_domain_admin_access: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Request to create a drive.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDriveRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme_id: Option<String>,
}

/// Request to update a drive.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDriveRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_rgb: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme_id: Option<String>,
}
