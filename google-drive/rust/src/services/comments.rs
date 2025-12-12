//! Comment operations service.

use crate::client::GoogleDriveClient;
use crate::error::GoogleDriveResult;
use crate::types::*;
use serde::{Deserialize, Serialize};

/// Service for comment operations.
pub struct CommentsService<'a> {
    client: &'a GoogleDriveClient,
}

impl<'a> CommentsService<'a> {
    /// Creates a new comments service.
    pub fn new(client: &'a GoogleDriveClient) -> Self {
        Self { client }
    }

    /// Creates a new comment.
    pub async fn create(
        &self,
        file_id: &str,
        request: CreateCommentRequest,
    ) -> GoogleDriveResult<Comment> {
        let path = format!("/files/{}/comments", file_id);
        self.client.post(&path, &request).await
    }

    /// Lists comments for a file.
    pub async fn list(
        &self,
        file_id: &str,
        params: Option<ListCommentsParams>,
    ) -> GoogleDriveResult<CommentList> {
        let path = format!("/files/{}/comments", file_id);
        if let Some(p) = params {
            self.client.get_with_params(&path, &p).await
        } else {
            self.client.get(&path).await
        }
    }

    /// Gets a specific comment.
    pub async fn get(
        &self,
        file_id: &str,
        comment_id: &str,
        params: Option<GetCommentParams>,
    ) -> GoogleDriveResult<Comment> {
        let path = format!("/files/{}/comments/{}", file_id, comment_id);
        if let Some(p) = params {
            self.client.get_with_params(&path, &p).await
        } else {
            self.client.get(&path).await
        }
    }

    /// Updates a comment.
    pub async fn update(
        &self,
        file_id: &str,
        comment_id: &str,
        request: UpdateCommentRequest,
    ) -> GoogleDriveResult<Comment> {
        let path = format!("/files/{}/comments/{}", file_id, comment_id);
        self.client.patch(&path, &request).await
    }

    /// Deletes a comment.
    pub async fn delete(&self, file_id: &str, comment_id: &str) -> GoogleDriveResult<()> {
        let path = format!("/files/{}/comments/{}", file_id, comment_id);
        self.client.delete(&path).await
    }
}

// Request/Response types

/// Request to create a comment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommentRequest {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
}

/// Parameters for listing comments.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListCommentsParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_deleted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_modified_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Parameters for getting a comment.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetCommentParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_deleted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Request to update a comment.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCommentRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}
