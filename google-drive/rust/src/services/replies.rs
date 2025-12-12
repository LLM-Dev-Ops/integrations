//! Reply operations service.

use crate::client::GoogleDriveClient;
use crate::error::GoogleDriveResult;
use crate::types::*;
use serde::{Deserialize, Serialize};

/// Service for reply operations.
pub struct RepliesService<'a> {
    client: &'a GoogleDriveClient,
}

impl<'a> RepliesService<'a> {
    /// Creates a new replies service.
    pub fn new(client: &'a GoogleDriveClient) -> Self {
        Self { client }
    }

    /// Creates a new reply.
    pub async fn create(
        &self,
        file_id: &str,
        comment_id: &str,
        request: CreateReplyRequest,
    ) -> GoogleDriveResult<Reply> {
        let path = format!("/files/{}/comments/{}/replies", file_id, comment_id);
        self.client.post(&path, &request).await
    }

    /// Lists replies for a comment.
    pub async fn list(
        &self,
        file_id: &str,
        comment_id: &str,
        params: Option<ListRepliesParams>,
    ) -> GoogleDriveResult<ReplyList> {
        let path = format!("/files/{}/comments/{}/replies", file_id, comment_id);
        if let Some(p) = params {
            self.client.get_with_params(&path, &p).await
        } else {
            self.client.get(&path).await
        }
    }

    /// Gets a specific reply.
    pub async fn get(
        &self,
        file_id: &str,
        comment_id: &str,
        reply_id: &str,
        params: Option<GetReplyParams>,
    ) -> GoogleDriveResult<Reply> {
        let path = format!("/files/{}/comments/{}/replies/{}", file_id, comment_id, reply_id);
        if let Some(p) = params {
            self.client.get_with_params(&path, &p).await
        } else {
            self.client.get(&path).await
        }
    }

    /// Updates a reply.
    pub async fn update(
        &self,
        file_id: &str,
        comment_id: &str,
        reply_id: &str,
        request: UpdateReplyRequest,
    ) -> GoogleDriveResult<Reply> {
        let path = format!("/files/{}/comments/{}/replies/{}", file_id, comment_id, reply_id);
        self.client.patch(&path, &request).await
    }

    /// Deletes a reply.
    pub async fn delete(
        &self,
        file_id: &str,
        comment_id: &str,
        reply_id: &str,
    ) -> GoogleDriveResult<()> {
        let path = format!("/files/{}/comments/{}/replies/{}", file_id, comment_id, reply_id);
        self.client.delete(&path).await
    }
}

// Request/Response types

/// Request to create a reply.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReplyRequest {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

/// Parameters for listing replies.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListRepliesParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_deleted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Parameters for getting a reply.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetReplyParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_deleted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Request to update a reply.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReplyRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}
