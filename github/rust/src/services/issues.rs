//! Issue operations.

use crate::client::GitHubClient;
use crate::errors::GitHubResult;
use crate::types::{Comment, Issue, IssueState, Label, Milestone, MilestoneState, User};
use serde::{Deserialize, Serialize};

/// Service for issue operations.
pub struct IssuesService<'a> {
    client: &'a GitHubClient,
}

impl<'a> IssuesService<'a> {
    /// Creates a new issues service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    /// Lists issues in a repository.
    pub async fn list(&self, owner: &str, repo: &str) -> GitHubResult<Vec<Issue>> {
        self.list_with_params(owner, repo, &ListIssuesParams::default())
            .await
    }

    /// Lists issues with parameters.
    pub async fn list_with_params(
        &self,
        owner: &str,
        repo: &str,
        params: &ListIssuesParams,
    ) -> GitHubResult<Vec<Issue>> {
        self.client
            .get_with_params(&format!("/repos/{}/{}/issues", owner, repo), params)
            .await
    }

    /// Gets an issue.
    pub async fn get(&self, owner: &str, repo: &str, issue_number: u32) -> GitHubResult<Issue> {
        self.client
            .get(&format!("/repos/{}/{}/issues/{}", owner, repo, issue_number))
            .await
    }

    /// Creates an issue.
    pub async fn create(
        &self,
        owner: &str,
        repo: &str,
        request: &CreateIssueRequest,
    ) -> GitHubResult<Issue> {
        self.client
            .post(&format!("/repos/{}/{}/issues", owner, repo), request)
            .await
    }

    /// Updates an issue.
    pub async fn update(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u32,
        request: &UpdateIssueRequest,
    ) -> GitHubResult<Issue> {
        self.client
            .patch(
                &format!("/repos/{}/{}/issues/{}", owner, repo, issue_number),
                request,
            )
            .await
    }

    /// Locks an issue.
    pub async fn lock(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u32,
        lock_reason: Option<LockReason>,
    ) -> GitHubResult<()> {
        let body = LockRequest { lock_reason };
        self.client
            .put_no_response(
                &format!("/repos/{}/{}/issues/{}/lock", owner, repo, issue_number),
                &body,
            )
            .await
    }

    /// Unlocks an issue.
    pub async fn unlock(&self, owner: &str, repo: &str, issue_number: u32) -> GitHubResult<()> {
        self.client
            .delete(&format!("/repos/{}/{}/issues/{}/lock", owner, repo, issue_number))
            .await
    }

    // Comments

    /// Lists comments on an issue.
    pub async fn list_comments(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u32,
    ) -> GitHubResult<Vec<Comment>> {
        self.client
            .get(&format!(
                "/repos/{}/{}/issues/{}/comments",
                owner, repo, issue_number
            ))
            .await
    }

    /// Gets a comment.
    pub async fn get_comment(
        &self,
        owner: &str,
        repo: &str,
        comment_id: u64,
    ) -> GitHubResult<Comment> {
        self.client
            .get(&format!(
                "/repos/{}/{}/issues/comments/{}",
                owner, repo, comment_id
            ))
            .await
    }

    /// Creates a comment.
    pub async fn create_comment(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u32,
        body: &str,
    ) -> GitHubResult<Comment> {
        let request = CreateCommentRequest {
            body: body.to_string(),
        };
        self.client
            .post(
                &format!("/repos/{}/{}/issues/{}/comments", owner, repo, issue_number),
                &request,
            )
            .await
    }

    /// Updates a comment.
    pub async fn update_comment(
        &self,
        owner: &str,
        repo: &str,
        comment_id: u64,
        body: &str,
    ) -> GitHubResult<Comment> {
        let request = UpdateCommentRequest {
            body: body.to_string(),
        };
        self.client
            .patch(
                &format!("/repos/{}/{}/issues/comments/{}", owner, repo, comment_id),
                &request,
            )
            .await
    }

    /// Deletes a comment.
    pub async fn delete_comment(
        &self,
        owner: &str,
        repo: &str,
        comment_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/issues/comments/{}",
                owner, repo, comment_id
            ))
            .await
    }

    // Labels

    /// Lists labels in a repository.
    pub async fn list_labels(&self, owner: &str, repo: &str) -> GitHubResult<Vec<Label>> {
        self.client
            .get(&format!("/repos/{}/{}/labels", owner, repo))
            .await
    }

    /// Gets a label.
    pub async fn get_label(&self, owner: &str, repo: &str, name: &str) -> GitHubResult<Label> {
        self.client
            .get(&format!("/repos/{}/{}/labels/{}", owner, repo, name))
            .await
    }

    /// Creates a label.
    pub async fn create_label(
        &self,
        owner: &str,
        repo: &str,
        request: &CreateLabelRequest,
    ) -> GitHubResult<Label> {
        self.client
            .post(&format!("/repos/{}/{}/labels", owner, repo), request)
            .await
    }

    /// Updates a label.
    pub async fn update_label(
        &self,
        owner: &str,
        repo: &str,
        name: &str,
        request: &UpdateLabelRequest,
    ) -> GitHubResult<Label> {
        self.client
            .patch(&format!("/repos/{}/{}/labels/{}", owner, repo, name), request)
            .await
    }

    /// Deletes a label.
    pub async fn delete_label(&self, owner: &str, repo: &str, name: &str) -> GitHubResult<()> {
        self.client
            .delete(&format!("/repos/{}/{}/labels/{}", owner, repo, name))
            .await
    }

    /// Adds labels to an issue.
    pub async fn add_labels(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u32,
        labels: &[String],
    ) -> GitHubResult<Vec<Label>> {
        let request = AddLabelsRequest {
            labels: labels.to_vec(),
        };
        self.client
            .post(
                &format!("/repos/{}/{}/issues/{}/labels", owner, repo, issue_number),
                &request,
            )
            .await
    }

    /// Removes a label from an issue.
    pub async fn remove_label(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u32,
        label: &str,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/issues/{}/labels/{}",
                owner, repo, issue_number, label
            ))
            .await
    }

    // Milestones

    /// Lists milestones.
    pub async fn list_milestones(&self, owner: &str, repo: &str) -> GitHubResult<Vec<Milestone>> {
        self.client
            .get(&format!("/repos/{}/{}/milestones", owner, repo))
            .await
    }

    /// Gets a milestone.
    pub async fn get_milestone(
        &self,
        owner: &str,
        repo: &str,
        milestone_number: u32,
    ) -> GitHubResult<Milestone> {
        self.client
            .get(&format!(
                "/repos/{}/{}/milestones/{}",
                owner, repo, milestone_number
            ))
            .await
    }

    /// Creates a milestone.
    pub async fn create_milestone(
        &self,
        owner: &str,
        repo: &str,
        request: &CreateMilestoneRequest,
    ) -> GitHubResult<Milestone> {
        self.client
            .post(&format!("/repos/{}/{}/milestones", owner, repo), request)
            .await
    }

    /// Updates a milestone.
    pub async fn update_milestone(
        &self,
        owner: &str,
        repo: &str,
        milestone_number: u32,
        request: &UpdateMilestoneRequest,
    ) -> GitHubResult<Milestone> {
        self.client
            .patch(
                &format!("/repos/{}/{}/milestones/{}", owner, repo, milestone_number),
                request,
            )
            .await
    }

    /// Deletes a milestone.
    pub async fn delete_milestone(
        &self,
        owner: &str,
        repo: &str,
        milestone_number: u32,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/milestones/{}",
                owner, repo, milestone_number
            ))
            .await
    }

    // Assignees

    /// Adds assignees to an issue.
    pub async fn add_assignees(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u32,
        assignees: &[String],
    ) -> GitHubResult<Issue> {
        let request = AssigneesRequest {
            assignees: assignees.to_vec(),
        };
        self.client
            .post(
                &format!("/repos/{}/{}/issues/{}/assignees", owner, repo, issue_number),
                &request,
            )
            .await
    }

    /// Removes assignees from an issue.
    pub async fn remove_assignees(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u32,
        assignees: &[String],
    ) -> GitHubResult<Issue> {
        let request = AssigneesRequest {
            assignees: assignees.to_vec(),
        };
        // GitHub uses DELETE with body
        self.client
            .raw_request(
                reqwest::Method::DELETE,
                &format!("/repos/{}/{}/issues/{}/assignees", owner, repo, issue_number),
                Some(&request),
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

/// Parameters for listing issues.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ListIssuesParams {
    /// Filter by milestone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestone: Option<String>,
    /// Filter by state.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<IssueStateFilter>,
    /// Filter by assignee.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    /// Filter by creator.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator: Option<String>,
    /// Filter by mentioned user.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mentioned: Option<String>,
    /// Filter by labels (comma-separated).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<String>,
    /// Sort field.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<IssueSort>,
    /// Sort direction.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<SortDirection>,
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

/// Issue state filter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueStateFilter {
    Open,
    Closed,
    All,
}

/// Issue sort field.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueSort {
    Created,
    Updated,
    Comments,
}

/// Sort direction.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    Desc,
}

/// Request to create an issue.
#[derive(Debug, Clone, Serialize)]
pub struct CreateIssueRequest {
    /// Issue title.
    pub title: String,
    /// Issue body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Assignees.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignees: Option<Vec<String>>,
    /// Milestone number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestone: Option<u32>,
    /// Labels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
}

/// Request to update an issue.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateIssueRequest {
    /// Issue title.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Issue body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Issue state.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<IssueState>,
    /// State reason.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_reason: Option<StateReason>,
    /// Assignees.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignees: Option<Vec<String>>,
    /// Milestone number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestone: Option<u32>,
    /// Labels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
}

/// State reason for closing an issue.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StateReason {
    Completed,
    NotPlanned,
    Reopened,
}

/// Lock reason.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LockReason {
    OffTopic,
    TooHeated,
    Resolved,
    Spam,
}

#[derive(Debug, Clone, Serialize)]
struct LockRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    lock_reason: Option<LockReason>,
}

#[derive(Debug, Clone, Serialize)]
struct CreateCommentRequest {
    body: String,
}

#[derive(Debug, Clone, Serialize)]
struct UpdateCommentRequest {
    body: String,
}

/// Request to create a label.
#[derive(Debug, Clone, Serialize)]
pub struct CreateLabelRequest {
    /// Label name.
    pub name: String,
    /// Label color (hex without #).
    pub color: String,
    /// Label description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Request to update a label.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateLabelRequest {
    /// New label name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_name: Option<String>,
    /// Label color.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Label description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct AddLabelsRequest {
    labels: Vec<String>,
}

/// Request to create a milestone.
#[derive(Debug, Clone, Serialize)]
pub struct CreateMilestoneRequest {
    /// Milestone title.
    pub title: String,
    /// Milestone state.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<MilestoneState>,
    /// Milestone description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Due date (ISO 8601 format).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_on: Option<String>,
}

/// Request to update a milestone.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateMilestoneRequest {
    /// Milestone title.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Milestone state.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<MilestoneState>,
    /// Milestone description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Due date.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_on: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct AssigneesRequest {
    assignees: Vec<String>,
}
