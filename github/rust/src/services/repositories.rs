//! Repository operations.

use crate::client::GitHubClient;
use crate::errors::GitHubResult;
use crate::pagination::{Page, PaginationParams};
use crate::types::{Branch, Content, Release, ReleaseAsset, Repository};
use serde::{Deserialize, Serialize};

/// Service for repository operations.
pub struct RepositoriesService<'a> {
    client: &'a GitHubClient,
}

impl<'a> RepositoriesService<'a> {
    /// Creates a new repositories service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    /// Lists repositories for a user.
    pub async fn list_for_user(&self, username: &str) -> GitHubResult<Vec<Repository>> {
        self.list_for_user_paginated(username, &ListReposParams::default())
            .await
    }

    /// Lists repositories for a user with pagination.
    pub async fn list_for_user_paginated(
        &self,
        username: &str,
        params: &ListReposParams,
    ) -> GitHubResult<Vec<Repository>> {
        self.client
            .get_with_params(&format!("/users/{}/repos", username), params)
            .await
    }

    /// Lists repositories for an organization.
    pub async fn list_for_org(&self, org: &str) -> GitHubResult<Vec<Repository>> {
        self.list_for_org_paginated(org, &ListReposParams::default())
            .await
    }

    /// Lists repositories for an organization with pagination.
    pub async fn list_for_org_paginated(
        &self,
        org: &str,
        params: &ListReposParams,
    ) -> GitHubResult<Vec<Repository>> {
        self.client
            .get_with_params(&format!("/orgs/{}/repos", org), params)
            .await
    }

    /// Lists repositories for the authenticated user.
    pub async fn list_for_authenticated_user(&self) -> GitHubResult<Vec<Repository>> {
        self.client.get("/user/repos").await
    }

    /// Gets a repository.
    pub async fn get(&self, owner: &str, repo: &str) -> GitHubResult<Repository> {
        self.client
            .get(&format!("/repos/{}/{}", owner, repo))
            .await
    }

    /// Creates a repository.
    pub async fn create(&self, request: &CreateRepoRequest) -> GitHubResult<Repository> {
        self.client.post("/user/repos", request).await
    }

    /// Creates a repository for an organization.
    pub async fn create_for_org(
        &self,
        org: &str,
        request: &CreateRepoRequest,
    ) -> GitHubResult<Repository> {
        self.client
            .post(&format!("/orgs/{}/repos", org), request)
            .await
    }

    /// Updates a repository.
    pub async fn update(
        &self,
        owner: &str,
        repo: &str,
        request: &UpdateRepoRequest,
    ) -> GitHubResult<Repository> {
        self.client
            .patch(&format!("/repos/{}/{}", owner, repo), request)
            .await
    }

    /// Deletes a repository.
    pub async fn delete(&self, owner: &str, repo: &str) -> GitHubResult<()> {
        self.client
            .delete(&format!("/repos/{}/{}", owner, repo))
            .await
    }

    // Branches

    /// Lists branches in a repository.
    pub async fn list_branches(&self, owner: &str, repo: &str) -> GitHubResult<Vec<Branch>> {
        self.client
            .get(&format!("/repos/{}/{}/branches", owner, repo))
            .await
    }

    /// Gets a branch.
    pub async fn get_branch(&self, owner: &str, repo: &str, branch: &str) -> GitHubResult<Branch> {
        self.client
            .get(&format!("/repos/{}/{}/branches/{}", owner, repo, branch))
            .await
    }

    // Contents

    /// Gets repository contents (file or directory).
    pub async fn get_contents(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        git_ref: Option<&str>,
    ) -> GitHubResult<Content> {
        let mut url = format!("/repos/{}/{}/contents/{}", owner, repo, path);
        if let Some(r) = git_ref {
            url = format!("{}?ref={}", url, r);
        }
        self.client.get(&url).await
    }

    /// Creates or updates a file.
    pub async fn create_or_update_file(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        request: &CreateOrUpdateFileRequest,
    ) -> GitHubResult<FileCommitResponse> {
        self.client
            .put(&format!("/repos/{}/{}/contents/{}", owner, repo, path), request)
            .await
    }

    /// Deletes a file.
    pub async fn delete_file(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        request: &DeleteFileRequest,
    ) -> GitHubResult<FileCommitResponse> {
        // GitHub uses DELETE with a body for this operation
        self.client
            .raw_request(
                reqwest::Method::DELETE,
                &format!("/repos/{}/{}/contents/{}", owner, repo, path),
                Some(request),
            )
            .await?
            .json()
            .await
            .map_err(|e| {
                crate::errors::GitHubError::deserialization(format!(
                    "Failed to deserialize response: {}",
                    e
                ))
            })
    }

    /// Gets the README.
    pub async fn get_readme(&self, owner: &str, repo: &str) -> GitHubResult<Content> {
        self.client
            .get(&format!("/repos/{}/{}/readme", owner, repo))
            .await
    }

    // Releases

    /// Lists releases.
    pub async fn list_releases(&self, owner: &str, repo: &str) -> GitHubResult<Vec<Release>> {
        self.client
            .get(&format!("/repos/{}/{}/releases", owner, repo))
            .await
    }

    /// Gets a release.
    pub async fn get_release(&self, owner: &str, repo: &str, release_id: u64) -> GitHubResult<Release> {
        self.client
            .get(&format!("/repos/{}/{}/releases/{}", owner, repo, release_id))
            .await
    }

    /// Gets the latest release.
    pub async fn get_latest_release(&self, owner: &str, repo: &str) -> GitHubResult<Release> {
        self.client
            .get(&format!("/repos/{}/{}/releases/latest", owner, repo))
            .await
    }

    /// Gets a release by tag.
    pub async fn get_release_by_tag(
        &self,
        owner: &str,
        repo: &str,
        tag: &str,
    ) -> GitHubResult<Release> {
        self.client
            .get(&format!("/repos/{}/{}/releases/tags/{}", owner, repo, tag))
            .await
    }

    /// Creates a release.
    pub async fn create_release(
        &self,
        owner: &str,
        repo: &str,
        request: &CreateReleaseRequest,
    ) -> GitHubResult<Release> {
        self.client
            .post(&format!("/repos/{}/{}/releases", owner, repo), request)
            .await
    }

    /// Updates a release.
    pub async fn update_release(
        &self,
        owner: &str,
        repo: &str,
        release_id: u64,
        request: &UpdateReleaseRequest,
    ) -> GitHubResult<Release> {
        self.client
            .patch(
                &format!("/repos/{}/{}/releases/{}", owner, repo, release_id),
                request,
            )
            .await
    }

    /// Deletes a release.
    pub async fn delete_release(&self, owner: &str, repo: &str, release_id: u64) -> GitHubResult<()> {
        self.client
            .delete(&format!("/repos/{}/{}/releases/{}", owner, repo, release_id))
            .await
    }
}

/// Parameters for listing repositories.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ListReposParams {
    /// Type filter.
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub repo_type: Option<RepoType>,
    /// Sort field.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<RepoSort>,
    /// Sort direction.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<SortDirection>,
    /// Page number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    /// Items per page.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_page: Option<u32>,
}

/// Repository type filter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RepoType {
    All,
    Owner,
    Public,
    Private,
    Member,
}

/// Repository sort field.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RepoSort {
    Created,
    Updated,
    Pushed,
    FullName,
}

/// Sort direction.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    Desc,
}

/// Request to create a repository.
#[derive(Debug, Clone, Serialize)]
pub struct CreateRepoRequest {
    /// Repository name.
    pub name: String,
    /// Repository description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Homepage URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    /// Whether the repository is private.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private: Option<bool>,
    /// Whether issues are enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_issues: Option<bool>,
    /// Whether projects are enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_projects: Option<bool>,
    /// Whether wiki is enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_wiki: Option<bool>,
    /// Auto-initialize with README.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_init: Option<bool>,
    /// Gitignore template.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gitignore_template: Option<String>,
    /// License template.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_template: Option<String>,
}

/// Request to update a repository.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateRepoRequest {
    /// Repository name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Repository description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Homepage URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    /// Whether the repository is private.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private: Option<bool>,
    /// Default branch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_branch: Option<String>,
    /// Whether the repository is archived.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
}

/// Request to create or update a file.
#[derive(Debug, Clone, Serialize)]
pub struct CreateOrUpdateFileRequest {
    /// Commit message.
    pub message: String,
    /// File content (base64 encoded).
    pub content: String,
    /// SHA of the file being replaced (for updates).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha: Option<String>,
    /// Branch name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// Committer information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub committer: Option<CommitAuthor>,
    /// Author information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<CommitAuthor>,
}

/// Request to delete a file.
#[derive(Debug, Clone, Serialize)]
pub struct DeleteFileRequest {
    /// Commit message.
    pub message: String,
    /// SHA of the file being deleted.
    pub sha: String,
    /// Branch name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// Committer information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub committer: Option<CommitAuthor>,
    /// Author information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<CommitAuthor>,
}

/// Commit author information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitAuthor {
    /// Author name.
    pub name: String,
    /// Author email.
    pub email: String,
}

/// Response from file commit operations.
#[derive(Debug, Clone, Deserialize)]
pub struct FileCommitResponse {
    /// The committed content.
    pub content: Option<Content>,
    /// The commit.
    pub commit: FileCommit,
}

/// Commit information from file operations.
#[derive(Debug, Clone, Deserialize)]
pub struct FileCommit {
    /// Commit SHA.
    pub sha: String,
    /// Commit message.
    pub message: String,
    /// Commit URL.
    pub html_url: String,
}

/// Request to create a release.
#[derive(Debug, Clone, Serialize)]
pub struct CreateReleaseRequest {
    /// Tag name.
    pub tag_name: String,
    /// Target commitish.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_commitish: Option<String>,
    /// Release name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Release body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Whether it's a draft.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft: Option<bool>,
    /// Whether it's a prerelease.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prerelease: Option<bool>,
    /// Generate release notes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generate_release_notes: Option<bool>,
}

/// Request to update a release.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateReleaseRequest {
    /// Tag name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag_name: Option<String>,
    /// Target commitish.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_commitish: Option<String>,
    /// Release name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Release body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Whether it's a draft.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft: Option<bool>,
    /// Whether it's a prerelease.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prerelease: Option<bool>,
}
