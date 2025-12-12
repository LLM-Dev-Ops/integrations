//! Revision operations service.

use crate::client::GoogleDriveClient;
use crate::error::GoogleDriveResult;
use crate::types::*;
use bytes::Bytes;
use serde::{Deserialize, Serialize};

/// Service for revision operations.
pub struct RevisionsService<'a> {
    client: &'a GoogleDriveClient,
}

impl<'a> RevisionsService<'a> {
    /// Creates a new revisions service.
    pub fn new(client: &'a GoogleDriveClient) -> Self {
        Self { client }
    }

    /// Lists revisions for a file.
    pub async fn list(
        &self,
        file_id: &str,
        params: Option<ListRevisionsParams>,
    ) -> GoogleDriveResult<RevisionList> {
        let path = format!("/files/{}/revisions", file_id);
        if let Some(p) = params {
            self.client.get_with_params(&path, &p).await
        } else {
            self.client.get(&path).await
        }
    }

    /// Gets a specific revision.
    pub async fn get(
        &self,
        file_id: &str,
        revision_id: &str,
        params: Option<GetRevisionParams>,
    ) -> GoogleDriveResult<Revision> {
        let path = format!("/files/{}/revisions/{}", file_id, revision_id);
        if let Some(p) = params {
            self.client.get_with_params(&path, &p).await
        } else {
            self.client.get(&path).await
        }
    }

    /// Downloads a specific revision.
    pub async fn download(
        &self,
        file_id: &str,
        revision_id: &str,
    ) -> GoogleDriveResult<Bytes> {
        let path = format!("/files/{}/revisions/{}?alt=media", file_id, revision_id);
        self.client.get_bytes(&path).await
    }

    /// Updates a revision.
    pub async fn update(
        &self,
        file_id: &str,
        revision_id: &str,
        request: UpdateRevisionRequest,
    ) -> GoogleDriveResult<Revision> {
        let path = format!("/files/{}/revisions/{}", file_id, revision_id);
        self.client.patch(&path, &request).await
    }

    /// Deletes a revision.
    pub async fn delete(&self, file_id: &str, revision_id: &str) -> GoogleDriveResult<()> {
        let path = format!("/files/{}/revisions/{}", file_id, revision_id);
        self.client.delete(&path).await
    }
}

// Request/Response types

/// Parameters for listing revisions.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListRevisionsParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Parameters for getting a revision.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetRevisionParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acknowledge_abuse: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Request to update a revision.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRevisionRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keep_forever: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publish_auto: Option<bool>,
}
