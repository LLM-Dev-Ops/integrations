//! Gist operations.

use crate::client::GitHubClient;
use crate::errors::GitHubResult;
use crate::types::{Gist, User};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Service for gist operations.
pub struct GistsService<'a> {
    client: &'a GitHubClient,
}

impl<'a> GistsService<'a> {
    /// Creates a new gists service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    /// Lists gists for the authenticated user.
    pub async fn list(&self) -> GitHubResult<Vec<Gist>> {
        self.list_with_params(&ListGistsParams::default()).await
    }

    /// Lists gists with parameters.
    pub async fn list_with_params(&self, params: &ListGistsParams) -> GitHubResult<Vec<Gist>> {
        self.client.get_with_params("/gists", params).await
    }

    /// Lists public gists.
    pub async fn list_public(&self) -> GitHubResult<Vec<Gist>> {
        self.client.get("/gists/public").await
    }

    /// Lists starred gists.
    pub async fn list_starred(&self) -> GitHubResult<Vec<Gist>> {
        self.client.get("/gists/starred").await
    }

    /// Lists gists for a user.
    pub async fn list_for_user(&self, username: &str) -> GitHubResult<Vec<Gist>> {
        self.client.get(&format!("/users/{}/gists", username)).await
    }

    /// Gets a gist.
    pub async fn get(&self, gist_id: &str) -> GitHubResult<GistFull> {
        self.client.get(&format!("/gists/{}", gist_id)).await
    }

    /// Gets a specific revision of a gist.
    pub async fn get_revision(&self, gist_id: &str, sha: &str) -> GitHubResult<GistFull> {
        self.client
            .get(&format!("/gists/{}/{}", gist_id, sha))
            .await
    }

    /// Creates a gist.
    pub async fn create(&self, request: &CreateGistRequest) -> GitHubResult<GistFull> {
        self.client.post("/gists", request).await
    }

    /// Updates a gist.
    pub async fn update(&self, gist_id: &str, request: &UpdateGistRequest) -> GitHubResult<GistFull> {
        self.client
            .patch(&format!("/gists/{}", gist_id), request)
            .await
    }

    /// Deletes a gist.
    pub async fn delete(&self, gist_id: &str) -> GitHubResult<()> {
        self.client.delete(&format!("/gists/{}", gist_id)).await
    }

    // Stars

    /// Checks if a gist is starred.
    pub async fn is_starred(&self, gist_id: &str) -> GitHubResult<bool> {
        let response = self
            .client
            .raw_request(
                reqwest::Method::GET,
                &format!("/gists/{}/star", gist_id),
                Option::<()>::None,
            )
            .await;

        match response {
            Ok(_) => Ok(true),
            Err(e) if e.status_code() == Some(404) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Stars a gist.
    pub async fn star(&self, gist_id: &str) -> GitHubResult<()> {
        self.client
            .put_no_response(&format!("/gists/{}/star", gist_id), &())
            .await
    }

    /// Unstars a gist.
    pub async fn unstar(&self, gist_id: &str) -> GitHubResult<()> {
        self.client
            .delete(&format!("/gists/{}/star", gist_id))
            .await
    }

    // Forks

    /// Lists gist forks.
    pub async fn list_forks(&self, gist_id: &str) -> GitHubResult<Vec<GistFork>> {
        self.client
            .get(&format!("/gists/{}/forks", gist_id))
            .await
    }

    /// Forks a gist.
    pub async fn fork(&self, gist_id: &str) -> GitHubResult<Gist> {
        self.client
            .post(&format!("/gists/{}/forks", gist_id), &())
            .await
    }

    // Comments

    /// Lists comments on a gist.
    pub async fn list_comments(&self, gist_id: &str) -> GitHubResult<Vec<GistComment>> {
        self.client
            .get(&format!("/gists/{}/comments", gist_id))
            .await
    }

    /// Gets a gist comment.
    pub async fn get_comment(&self, gist_id: &str, comment_id: u64) -> GitHubResult<GistComment> {
        self.client
            .get(&format!("/gists/{}/comments/{}", gist_id, comment_id))
            .await
    }

    /// Creates a gist comment.
    pub async fn create_comment(&self, gist_id: &str, body: &str) -> GitHubResult<GistComment> {
        let request = CreateCommentRequest {
            body: body.to_string(),
        };
        self.client
            .post(&format!("/gists/{}/comments", gist_id), &request)
            .await
    }

    /// Updates a gist comment.
    pub async fn update_comment(
        &self,
        gist_id: &str,
        comment_id: u64,
        body: &str,
    ) -> GitHubResult<GistComment> {
        let request = UpdateCommentRequest {
            body: body.to_string(),
        };
        self.client
            .patch(
                &format!("/gists/{}/comments/{}", gist_id, comment_id),
                &request,
            )
            .await
    }

    /// Deletes a gist comment.
    pub async fn delete_comment(&self, gist_id: &str, comment_id: u64) -> GitHubResult<()> {
        self.client
            .delete(&format!("/gists/{}/comments/{}", gist_id, comment_id))
            .await
    }

    // Commits

    /// Lists gist commits.
    pub async fn list_commits(&self, gist_id: &str) -> GitHubResult<Vec<GistCommit>> {
        self.client
            .get(&format!("/gists/{}/commits", gist_id))
            .await
    }
}

/// Parameters for listing gists.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ListGistsParams {
    /// Filter by update time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<String>,
    /// Page number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    /// Items per page.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_page: Option<u32>,
}

/// Full gist with file contents.
#[derive(Debug, Clone, Deserialize)]
pub struct GistFull {
    /// Gist ID.
    pub id: String,
    /// Node ID.
    pub node_id: String,
    /// URL.
    pub url: String,
    /// Forks URL.
    pub forks_url: String,
    /// Commits URL.
    pub commits_url: String,
    /// Git pull URL.
    pub git_pull_url: String,
    /// Git push URL.
    pub git_push_url: String,
    /// HTML URL.
    pub html_url: String,
    /// Whether public.
    pub public: bool,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
    /// Description.
    pub description: Option<String>,
    /// Comments count.
    pub comments: u32,
    /// Comments URL.
    pub comments_url: String,
    /// Owner.
    pub owner: Option<User>,
    /// Files.
    pub files: HashMap<String, GistFile>,
    /// Truncated.
    pub truncated: Option<bool>,
    /// Forks.
    pub forks: Option<Vec<GistFork>>,
    /// History.
    pub history: Option<Vec<GistCommit>>,
}

/// A gist file.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GistFile {
    /// Filename.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    /// File type.
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    /// Language.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Raw URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_url: Option<String>,
    /// Size in bytes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    /// Whether truncated.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
    /// Content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

/// A gist fork.
#[derive(Debug, Clone, Deserialize)]
pub struct GistFork {
    /// Fork ID.
    pub id: String,
    /// URL.
    pub url: String,
    /// User.
    pub user: User,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
}

/// A gist commit.
#[derive(Debug, Clone, Deserialize)]
pub struct GistCommit {
    /// Version (SHA).
    pub version: String,
    /// URL.
    pub url: String,
    /// User.
    pub user: Option<User>,
    /// Change status.
    pub change_status: ChangeStatus,
    /// Committed at.
    pub committed_at: String,
}

/// Change status for a commit.
#[derive(Debug, Clone, Deserialize)]
pub struct ChangeStatus {
    /// Deletions.
    pub deletions: u32,
    /// Additions.
    pub additions: u32,
    /// Total.
    pub total: u32,
}

/// A gist comment.
#[derive(Debug, Clone, Deserialize)]
pub struct GistComment {
    /// Comment ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// URL.
    pub url: String,
    /// Body.
    pub body: String,
    /// User.
    pub user: User,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
}

/// Request to create a gist.
#[derive(Debug, Clone, Serialize)]
pub struct CreateGistRequest {
    /// Gist description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Whether the gist is public.
    pub public: bool,
    /// Files to include (filename -> content).
    pub files: HashMap<String, GistFileContent>,
}

/// Content for a gist file in create/update requests.
#[derive(Debug, Clone, Serialize)]
pub struct GistFileContent {
    /// File content.
    pub content: String,
}

/// Request to update a gist.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateGistRequest {
    /// Gist description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Files to update (filename -> content or null to delete).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<HashMap<String, Option<GistFileUpdate>>>,
}

/// Update content for a gist file.
#[derive(Debug, Clone, Serialize)]
pub struct GistFileUpdate {
    /// New filename (to rename).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    /// File content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct CreateCommentRequest {
    body: String,
}

#[derive(Debug, Clone, Serialize)]
struct UpdateCommentRequest {
    body: String,
}
