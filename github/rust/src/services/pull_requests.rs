//! Pull request operations.

use crate::client::GitHubClient;
use crate::errors::GitHubResult;
use crate::types::{Comment, PullRequest, PullRequestState, User};
use serde::{Deserialize, Serialize};

/// Service for pull request operations.
pub struct PullRequestsService<'a> {
    client: &'a GitHubClient,
}

impl<'a> PullRequestsService<'a> {
    /// Creates a new pull requests service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    /// Lists pull requests in a repository.
    pub async fn list(&self, owner: &str, repo: &str) -> GitHubResult<Vec<PullRequest>> {
        self.list_with_params(owner, repo, &ListPullRequestsParams::default())
            .await
    }

    /// Lists pull requests with parameters.
    pub async fn list_with_params(
        &self,
        owner: &str,
        repo: &str,
        params: &ListPullRequestsParams,
    ) -> GitHubResult<Vec<PullRequest>> {
        self.client
            .get_with_params(&format!("/repos/{}/{}/pulls", owner, repo), params)
            .await
    }

    /// Gets a pull request.
    pub async fn get(&self, owner: &str, repo: &str, pr_number: u32) -> GitHubResult<PullRequest> {
        self.client
            .get(&format!("/repos/{}/{}/pulls/{}", owner, repo, pr_number))
            .await
    }

    /// Creates a pull request.
    pub async fn create(
        &self,
        owner: &str,
        repo: &str,
        request: &CreatePullRequestRequest,
    ) -> GitHubResult<PullRequest> {
        self.client
            .post(&format!("/repos/{}/{}/pulls", owner, repo), request)
            .await
    }

    /// Updates a pull request.
    pub async fn update(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        request: &UpdatePullRequestRequest,
    ) -> GitHubResult<PullRequest> {
        self.client
            .patch(
                &format!("/repos/{}/{}/pulls/{}", owner, repo, pr_number),
                request,
            )
            .await
    }

    /// Checks if a pull request is merged.
    pub async fn is_merged(&self, owner: &str, repo: &str, pr_number: u32) -> GitHubResult<bool> {
        let response = self
            .client
            .raw_request(
                reqwest::Method::GET,
                &format!("/repos/{}/{}/pulls/{}/merge", owner, repo, pr_number),
                Option::<()>::None,
            )
            .await;

        match response {
            Ok(_) => Ok(true),
            Err(e) if e.status_code() == Some(404) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Merges a pull request.
    pub async fn merge(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        request: &MergePullRequestRequest,
    ) -> GitHubResult<MergeResult> {
        self.client
            .put(
                &format!("/repos/{}/{}/pulls/{}/merge", owner, repo, pr_number),
                request,
            )
            .await
    }

    /// Updates a pull request branch with the base branch.
    pub async fn update_branch(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        expected_head_sha: Option<&str>,
    ) -> GitHubResult<UpdateBranchResponse> {
        let request = UpdateBranchRequest {
            expected_head_sha: expected_head_sha.map(String::from),
        };
        self.client
            .put(
                &format!("/repos/{}/{}/pulls/{}/update-branch", owner, repo, pr_number),
                &request,
            )
            .await
    }

    /// Lists commits in a pull request.
    pub async fn list_commits(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
    ) -> GitHubResult<Vec<PullRequestCommit>> {
        self.client
            .get(&format!(
                "/repos/{}/{}/pulls/{}/commits",
                owner, repo, pr_number
            ))
            .await
    }

    /// Lists files changed in a pull request.
    pub async fn list_files(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
    ) -> GitHubResult<Vec<PullRequestFile>> {
        self.client
            .get(&format!(
                "/repos/{}/{}/pulls/{}/files",
                owner, repo, pr_number
            ))
            .await
    }

    // Reviews

    /// Lists reviews on a pull request.
    pub async fn list_reviews(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
    ) -> GitHubResult<Vec<Review>> {
        self.client
            .get(&format!(
                "/repos/{}/{}/pulls/{}/reviews",
                owner, repo, pr_number
            ))
            .await
    }

    /// Gets a review.
    pub async fn get_review(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        review_id: u64,
    ) -> GitHubResult<Review> {
        self.client
            .get(&format!(
                "/repos/{}/{}/pulls/{}/reviews/{}",
                owner, repo, pr_number, review_id
            ))
            .await
    }

    /// Creates a review.
    pub async fn create_review(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        request: &CreateReviewRequest,
    ) -> GitHubResult<Review> {
        self.client
            .post(
                &format!("/repos/{}/{}/pulls/{}/reviews", owner, repo, pr_number),
                request,
            )
            .await
    }

    /// Submits a pending review.
    pub async fn submit_review(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        review_id: u64,
        request: &SubmitReviewRequest,
    ) -> GitHubResult<Review> {
        self.client
            .post(
                &format!(
                    "/repos/{}/{}/pulls/{}/reviews/{}/events",
                    owner, repo, pr_number, review_id
                ),
                request,
            )
            .await
    }

    /// Dismisses a review.
    pub async fn dismiss_review(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        review_id: u64,
        message: &str,
    ) -> GitHubResult<Review> {
        let request = DismissReviewRequest {
            message: message.to_string(),
        };
        self.client
            .put(
                &format!(
                    "/repos/{}/{}/pulls/{}/reviews/{}/dismissals",
                    owner, repo, pr_number, review_id
                ),
                &request,
            )
            .await
    }

    /// Deletes a pending review.
    pub async fn delete_review(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        review_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/pulls/{}/reviews/{}",
                owner, repo, pr_number, review_id
            ))
            .await
    }

    // Review Comments

    /// Lists review comments on a pull request.
    pub async fn list_review_comments(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
    ) -> GitHubResult<Vec<ReviewComment>> {
        self.client
            .get(&format!(
                "/repos/{}/{}/pulls/{}/comments",
                owner, repo, pr_number
            ))
            .await
    }

    /// Gets a review comment.
    pub async fn get_review_comment(
        &self,
        owner: &str,
        repo: &str,
        comment_id: u64,
    ) -> GitHubResult<ReviewComment> {
        self.client
            .get(&format!(
                "/repos/{}/{}/pulls/comments/{}",
                owner, repo, comment_id
            ))
            .await
    }

    /// Creates a review comment.
    pub async fn create_review_comment(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        request: &CreateReviewCommentRequest,
    ) -> GitHubResult<ReviewComment> {
        self.client
            .post(
                &format!("/repos/{}/{}/pulls/{}/comments", owner, repo, pr_number),
                request,
            )
            .await
    }

    /// Creates a reply to a review comment.
    pub async fn create_review_comment_reply(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        comment_id: u64,
        body: &str,
    ) -> GitHubResult<ReviewComment> {
        let request = CreateReviewCommentReplyRequest {
            body: body.to_string(),
        };
        self.client
            .post(
                &format!(
                    "/repos/{}/{}/pulls/{}/comments/{}/replies",
                    owner, repo, pr_number, comment_id
                ),
                &request,
            )
            .await
    }

    /// Updates a review comment.
    pub async fn update_review_comment(
        &self,
        owner: &str,
        repo: &str,
        comment_id: u64,
        body: &str,
    ) -> GitHubResult<ReviewComment> {
        let request = UpdateReviewCommentRequest {
            body: body.to_string(),
        };
        self.client
            .patch(
                &format!("/repos/{}/{}/pulls/comments/{}", owner, repo, comment_id),
                &request,
            )
            .await
    }

    /// Deletes a review comment.
    pub async fn delete_review_comment(
        &self,
        owner: &str,
        repo: &str,
        comment_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/pulls/comments/{}",
                owner, repo, comment_id
            ))
            .await
    }

    /// Requests reviewers for a pull request.
    pub async fn request_reviewers(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        request: &RequestReviewersRequest,
    ) -> GitHubResult<PullRequest> {
        self.client
            .post(
                &format!(
                    "/repos/{}/{}/pulls/{}/requested_reviewers",
                    owner, repo, pr_number
                ),
                request,
            )
            .await
    }

    /// Removes requested reviewers from a pull request.
    pub async fn remove_requested_reviewers(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        request: &RequestReviewersRequest,
    ) -> GitHubResult<PullRequest> {
        self.client
            .raw_request(
                reqwest::Method::DELETE,
                &format!(
                    "/repos/{}/{}/pulls/{}/requested_reviewers",
                    owner, repo, pr_number
                ),
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
}

/// Parameters for listing pull requests.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ListPullRequestsParams {
    /// Filter by state.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<PullRequestStateFilter>,
    /// Filter by head branch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head: Option<String>,
    /// Filter by base branch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
    /// Sort field.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<PullRequestSort>,
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

/// Pull request state filter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PullRequestStateFilter {
    Open,
    Closed,
    All,
}

/// Pull request sort field.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PullRequestSort {
    Created,
    Updated,
    Popularity,
    LongRunning,
}

/// Sort direction.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    Desc,
}

/// Request to create a pull request.
#[derive(Debug, Clone, Serialize)]
pub struct CreatePullRequestRequest {
    /// PR title.
    pub title: String,
    /// Head branch.
    pub head: String,
    /// Base branch.
    pub base: String,
    /// PR body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Whether to allow maintainer edits.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maintainer_can_modify: Option<bool>,
    /// Whether to create as draft.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft: Option<bool>,
}

/// Request to update a pull request.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdatePullRequestRequest {
    /// PR title.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// PR body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// PR state.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<PullRequestState>,
    /// Base branch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
    /// Whether to allow maintainer edits.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maintainer_can_modify: Option<bool>,
}

/// Request to merge a pull request.
#[derive(Debug, Clone, Default, Serialize)]
pub struct MergePullRequestRequest {
    /// Commit title.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_title: Option<String>,
    /// Commit message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_message: Option<String>,
    /// Expected SHA of the head commit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha: Option<String>,
    /// Merge method.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_method: Option<MergeMethod>,
}

/// Merge method.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MergeMethod {
    Merge,
    Squash,
    Rebase,
}

/// Result of merging a pull request.
#[derive(Debug, Clone, Deserialize)]
pub struct MergeResult {
    /// Commit SHA.
    pub sha: String,
    /// Whether the merge was successful.
    pub merged: bool,
    /// Message.
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
struct UpdateBranchRequest {
    expected_head_sha: Option<String>,
}

/// Response from updating a branch.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateBranchResponse {
    /// Message.
    pub message: String,
    /// URL.
    pub url: String,
}

/// Commit in a pull request.
#[derive(Debug, Clone, Deserialize)]
pub struct PullRequestCommit {
    /// Commit SHA.
    pub sha: String,
    /// Commit details.
    pub commit: CommitDetails,
    /// Author.
    pub author: Option<User>,
    /// Committer.
    pub committer: Option<User>,
}

/// Commit details.
#[derive(Debug, Clone, Deserialize)]
pub struct CommitDetails {
    /// Commit message.
    pub message: String,
    /// Author.
    pub author: CommitAuthor,
    /// Committer.
    pub committer: CommitAuthor,
}

/// Commit author.
#[derive(Debug, Clone, Deserialize)]
pub struct CommitAuthor {
    /// Name.
    pub name: String,
    /// Email.
    pub email: String,
    /// Date.
    pub date: String,
}

/// File changed in a pull request.
#[derive(Debug, Clone, Deserialize)]
pub struct PullRequestFile {
    /// Filename.
    pub filename: String,
    /// Status (added, removed, modified, etc.).
    pub status: String,
    /// Additions.
    pub additions: u32,
    /// Deletions.
    pub deletions: u32,
    /// Changes.
    pub changes: u32,
    /// SHA.
    pub sha: String,
    /// Blob URL.
    pub blob_url: String,
    /// Raw URL.
    pub raw_url: String,
    /// Patch (may be large).
    pub patch: Option<String>,
}

/// Review on a pull request.
#[derive(Debug, Clone, Deserialize)]
pub struct Review {
    /// Review ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// User who created the review.
    pub user: User,
    /// Review body.
    pub body: Option<String>,
    /// Review state.
    pub state: ReviewState,
    /// HTML URL.
    pub html_url: String,
    /// Pull request URL.
    pub pull_request_url: String,
    /// Commit ID.
    pub commit_id: String,
    /// Submitted time.
    pub submitted_at: Option<String>,
}

/// Review state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewState {
    Pending,
    Approved,
    ChangesRequested,
    Commented,
    Dismissed,
}

/// Request to create a review.
#[derive(Debug, Clone, Serialize)]
pub struct CreateReviewRequest {
    /// Commit ID to review.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_id: Option<String>,
    /// Review body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Review event (APPROVE, REQUEST_CHANGES, COMMENT).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<ReviewEvent>,
    /// Comments.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comments: Option<Vec<ReviewCommentInput>>,
}

/// Review event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewEvent {
    Approve,
    RequestChanges,
    Comment,
}

/// Review comment input.
#[derive(Debug, Clone, Serialize)]
pub struct ReviewCommentInput {
    /// Path to the file.
    pub path: String,
    /// Line position (deprecated, use line).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<u32>,
    /// Comment body.
    pub body: String,
    /// Line number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    /// Side (LEFT or RIGHT).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<String>,
    /// Start line.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_line: Option<u32>,
    /// Start side.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_side: Option<String>,
}

/// Request to submit a review.
#[derive(Debug, Clone, Serialize)]
pub struct SubmitReviewRequest {
    /// Review body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Review event.
    pub event: ReviewEvent,
}

#[derive(Debug, Clone, Serialize)]
struct DismissReviewRequest {
    message: String,
}

/// Review comment.
#[derive(Debug, Clone, Deserialize)]
pub struct ReviewComment {
    /// Comment ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Diff hunk.
    pub diff_hunk: String,
    /// Path.
    pub path: String,
    /// Position.
    pub position: Option<u32>,
    /// Original position.
    pub original_position: Option<u32>,
    /// Commit ID.
    pub commit_id: String,
    /// Original commit ID.
    pub original_commit_id: String,
    /// User.
    pub user: User,
    /// Body.
    pub body: String,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
    /// HTML URL.
    pub html_url: String,
    /// Pull request URL.
    pub pull_request_url: String,
    /// In reply to ID.
    pub in_reply_to_id: Option<u64>,
    /// Line.
    pub line: Option<u32>,
    /// Original line.
    pub original_line: Option<u32>,
    /// Side.
    pub side: Option<String>,
    /// Start line.
    pub start_line: Option<u32>,
    /// Original start line.
    pub original_start_line: Option<u32>,
    /// Start side.
    pub start_side: Option<String>,
}

/// Request to create a review comment.
#[derive(Debug, Clone, Serialize)]
pub struct CreateReviewCommentRequest {
    /// Comment body.
    pub body: String,
    /// Commit ID.
    pub commit_id: String,
    /// Path.
    pub path: String,
    /// Line (for single-line comment).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    /// Side.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<String>,
    /// Start line (for multi-line comment).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_line: Option<u32>,
    /// Start side.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_side: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct CreateReviewCommentReplyRequest {
    body: String,
}

#[derive(Debug, Clone, Serialize)]
struct UpdateReviewCommentRequest {
    body: String,
}

/// Request to request or remove reviewers.
#[derive(Debug, Clone, Serialize)]
pub struct RequestReviewersRequest {
    /// Reviewers (usernames).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewers: Option<Vec<String>>,
    /// Team reviewers (slugs).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_reviewers: Option<Vec<String>>,
}
