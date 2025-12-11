//! Core data types for GitHub API.

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// GitHub user (minimal representation).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    /// User ID.
    pub id: u64,
    /// Username (login).
    pub login: String,
    /// User node ID.
    pub node_id: String,
    /// Avatar URL.
    pub avatar_url: String,
    /// User type (User, Organization, Bot).
    #[serde(rename = "type")]
    pub user_type: String,
    /// Site admin flag.
    pub site_admin: bool,
    /// Profile URL.
    pub html_url: String,
}

/// GitHub repository.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    /// Repository ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Repository name.
    pub name: String,
    /// Full name (owner/repo).
    pub full_name: String,
    /// Owner information.
    pub owner: User,
    /// Whether the repository is private.
    pub private: bool,
    /// Repository description.
    pub description: Option<String>,
    /// Whether the repository is a fork.
    pub fork: bool,
    /// Repository URL.
    pub url: String,
    /// HTML URL.
    pub html_url: String,
    /// Clone URL.
    pub clone_url: String,
    /// SSH URL.
    pub ssh_url: String,
    /// Default branch.
    pub default_branch: String,
    /// Primary language.
    pub language: Option<String>,
    /// Fork count.
    pub forks_count: u32,
    /// Stargazer count.
    pub stargazers_count: u32,
    /// Watcher count.
    pub watchers_count: u32,
    /// Open issue count.
    pub open_issues_count: u32,
    /// Repository size in KB.
    pub size: u64,
    /// Topics.
    #[serde(default)]
    pub topics: Vec<String>,
    /// Whether issues are enabled.
    #[serde(default = "default_true")]
    pub has_issues: bool,
    /// Whether projects are enabled.
    #[serde(default = "default_true")]
    pub has_projects: bool,
    /// Whether wiki is enabled.
    #[serde(default = "default_true")]
    pub has_wiki: bool,
    /// Whether downloads are enabled.
    #[serde(default = "default_true")]
    pub has_downloads: bool,
    /// Whether the repository is archived.
    #[serde(default)]
    pub archived: bool,
    /// Whether the repository is disabled.
    #[serde(default)]
    pub disabled: bool,
    /// License information.
    pub license: Option<License>,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
    /// Last push time.
    pub pushed_at: Option<DateTime<Utc>>,
}

fn default_true() -> bool {
    true
}

/// Repository license.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct License {
    /// License key.
    pub key: String,
    /// License name.
    pub name: String,
    /// SPDX ID.
    pub spdx_id: Option<String>,
    /// License URL.
    pub url: Option<String>,
}

/// GitHub branch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    /// Branch name.
    pub name: String,
    /// Commit reference.
    pub commit: BranchCommit,
    /// Whether branch is protected.
    pub protected: bool,
}

/// Branch commit reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchCommit {
    /// Commit SHA.
    pub sha: String,
    /// Commit URL.
    pub url: String,
}

/// GitHub issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    /// Issue ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Issue number.
    pub number: u32,
    /// Issue title.
    pub title: String,
    /// Issue body.
    pub body: Option<String>,
    /// Issue state.
    pub state: IssueState,
    /// Issue author.
    pub user: User,
    /// Labels.
    #[serde(default)]
    pub labels: Vec<Label>,
    /// Assignees.
    #[serde(default)]
    pub assignees: Vec<User>,
    /// Milestone.
    pub milestone: Option<Milestone>,
    /// Whether the issue is locked.
    #[serde(default)]
    pub locked: bool,
    /// Lock reason.
    pub active_lock_reason: Option<String>,
    /// Comment count.
    pub comments: u32,
    /// HTML URL.
    pub html_url: String,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
    /// Close time.
    pub closed_at: Option<DateTime<Utc>>,
    /// User who closed the issue.
    pub closed_by: Option<User>,
}

/// Issue state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IssueState {
    /// Open issue.
    Open,
    /// Closed issue.
    Closed,
}

/// GitHub label.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Label {
    /// Label ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Label name.
    pub name: String,
    /// Label description.
    pub description: Option<String>,
    /// Label color (hex).
    pub color: String,
    /// Default label flag.
    #[serde(default)]
    pub default: bool,
}

/// GitHub milestone.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Milestone {
    /// Milestone ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Milestone number.
    pub number: u32,
    /// Milestone title.
    pub title: String,
    /// Milestone description.
    pub description: Option<String>,
    /// Milestone state.
    pub state: MilestoneState,
    /// Creator.
    pub creator: User,
    /// Open issue count.
    pub open_issues: u32,
    /// Closed issue count.
    pub closed_issues: u32,
    /// Due date.
    pub due_on: Option<DateTime<Utc>>,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
    /// Close time.
    pub closed_at: Option<DateTime<Utc>>,
}

/// Milestone state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MilestoneState {
    /// Open milestone.
    Open,
    /// Closed milestone.
    Closed,
}

/// GitHub pull request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    /// PR ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// PR number.
    pub number: u32,
    /// PR title.
    pub title: String,
    /// PR body.
    pub body: Option<String>,
    /// PR state.
    pub state: PullRequestState,
    /// PR author.
    pub user: User,
    /// Head branch info.
    pub head: PullRequestRef,
    /// Base branch info.
    pub base: PullRequestRef,
    /// Labels.
    #[serde(default)]
    pub labels: Vec<Label>,
    /// Assignees.
    #[serde(default)]
    pub assignees: Vec<User>,
    /// Requested reviewers.
    #[serde(default)]
    pub requested_reviewers: Vec<User>,
    /// Milestone.
    pub milestone: Option<Milestone>,
    /// Whether the PR is locked.
    #[serde(default)]
    pub locked: bool,
    /// Whether the PR is a draft.
    #[serde(default)]
    pub draft: bool,
    /// Whether the PR is merged.
    #[serde(default)]
    pub merged: bool,
    /// Merge commit SHA.
    pub merge_commit_sha: Option<String>,
    /// User who merged the PR.
    pub merged_by: Option<User>,
    /// Merged time.
    pub merged_at: Option<DateTime<Utc>>,
    /// Whether the PR is mergeable.
    pub mergeable: Option<bool>,
    /// Mergeable state.
    pub mergeable_state: Option<String>,
    /// Comment count.
    pub comments: u32,
    /// Review comment count.
    pub review_comments: u32,
    /// Commit count.
    pub commits: u32,
    /// Additions.
    pub additions: u32,
    /// Deletions.
    pub deletions: u32,
    /// Changed files count.
    pub changed_files: u32,
    /// HTML URL.
    pub html_url: String,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
    /// Close time.
    pub closed_at: Option<DateTime<Utc>>,
}

/// Pull request state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PullRequestState {
    /// Open PR.
    Open,
    /// Closed PR.
    Closed,
}

/// Pull request branch reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestRef {
    /// Branch label.
    pub label: String,
    /// Branch name.
    #[serde(rename = "ref")]
    pub ref_name: String,
    /// Commit SHA.
    pub sha: String,
    /// User.
    pub user: User,
    /// Repository.
    pub repo: Option<Repository>,
}

/// GitHub release.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Release {
    /// Release ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Tag name.
    pub tag_name: String,
    /// Target commitish.
    pub target_commitish: String,
    /// Release name.
    pub name: Option<String>,
    /// Release body.
    pub body: Option<String>,
    /// Whether it's a draft.
    pub draft: bool,
    /// Whether it's a prerelease.
    pub prerelease: bool,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Publish time.
    pub published_at: Option<DateTime<Utc>>,
    /// Author.
    pub author: User,
    /// Assets.
    #[serde(default)]
    pub assets: Vec<ReleaseAsset>,
    /// HTML URL.
    pub html_url: String,
    /// Tarball URL.
    pub tarball_url: Option<String>,
    /// Zipball URL.
    pub zipball_url: Option<String>,
}

/// Release asset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseAsset {
    /// Asset ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Asset name.
    pub name: String,
    /// Asset label.
    pub label: Option<String>,
    /// Content type.
    pub content_type: String,
    /// Asset state.
    pub state: String,
    /// Asset size in bytes.
    pub size: u64,
    /// Download count.
    pub download_count: u64,
    /// Browser download URL.
    pub browser_download_url: String,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
    /// Uploader.
    pub uploader: User,
}

/// Repository content (file or directory).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    /// Content type.
    #[serde(rename = "type")]
    pub content_type: ContentType,
    /// Content encoding.
    pub encoding: Option<String>,
    /// Content size.
    pub size: u64,
    /// Content name.
    pub name: String,
    /// Content path.
    pub path: String,
    /// Content (base64 encoded for files).
    pub content: Option<String>,
    /// Git SHA.
    pub sha: String,
    /// Content URL.
    pub url: String,
    /// HTML URL.
    pub html_url: String,
    /// Git URL.
    pub git_url: Option<String>,
    /// Download URL.
    pub download_url: Option<String>,
}

/// Content type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    /// File content.
    File,
    /// Directory content.
    Dir,
    /// Symbolic link.
    Symlink,
    /// Git submodule.
    Submodule,
}

/// Workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    /// Workflow ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Workflow name.
    pub name: String,
    /// Workflow path.
    pub path: String,
    /// Workflow state.
    pub state: WorkflowState,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
    /// HTML URL.
    pub html_url: String,
    /// Badge URL.
    pub badge_url: String,
}

/// Workflow state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowState {
    /// Active workflow.
    Active,
    /// Deleted workflow.
    Deleted,
    /// Disabled by user.
    DisabledFork,
    /// Disabled by inactivity.
    DisabledInactivity,
    /// Disabled manually.
    DisabledManually,
    /// Unknown state.
    Unknown,
}

/// Workflow run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRun {
    /// Run ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Run name.
    pub name: Option<String>,
    /// Workflow ID.
    pub workflow_id: u64,
    /// Run number.
    pub run_number: u32,
    /// Run attempt.
    pub run_attempt: u32,
    /// Event that triggered the run.
    pub event: String,
    /// Run status.
    pub status: Option<WorkflowRunStatus>,
    /// Run conclusion.
    pub conclusion: Option<WorkflowRunConclusion>,
    /// Head branch.
    pub head_branch: Option<String>,
    /// Head SHA.
    pub head_sha: String,
    /// HTML URL.
    pub html_url: String,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
    /// Run start time.
    pub run_started_at: Option<DateTime<Utc>>,
}

/// Workflow run status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowRunStatus {
    /// Queued.
    Queued,
    /// In progress.
    InProgress,
    /// Completed.
    Completed,
    /// Waiting.
    Waiting,
    /// Requested.
    Requested,
    /// Pending.
    Pending,
}

/// Workflow run conclusion.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowRunConclusion {
    /// Success.
    Success,
    /// Failure.
    Failure,
    /// Neutral.
    Neutral,
    /// Cancelled.
    Cancelled,
    /// Skipped.
    Skipped,
    /// Timed out.
    TimedOut,
    /// Action required.
    ActionRequired,
    /// Stale.
    Stale,
}

/// Organization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    /// Organization ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Organization login.
    pub login: String,
    /// Organization name.
    pub name: Option<String>,
    /// Description.
    pub description: Option<String>,
    /// Company.
    pub company: Option<String>,
    /// Blog URL.
    pub blog: Option<String>,
    /// Location.
    pub location: Option<String>,
    /// Email.
    pub email: Option<String>,
    /// Twitter username.
    pub twitter_username: Option<String>,
    /// Avatar URL.
    pub avatar_url: String,
    /// HTML URL.
    pub html_url: String,
    /// Public repos count.
    pub public_repos: u32,
    /// Public gists count.
    pub public_gists: u32,
    /// Followers count.
    pub followers: u32,
    /// Following count.
    pub following: u32,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
}

/// Team.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    /// Team ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Team slug.
    pub slug: String,
    /// Team name.
    pub name: String,
    /// Team description.
    pub description: Option<String>,
    /// Privacy level.
    pub privacy: TeamPrivacy,
    /// Permission level.
    pub permission: String,
    /// HTML URL.
    pub html_url: String,
    /// Members count.
    pub members_count: u32,
    /// Repos count.
    pub repos_count: u32,
    /// Parent team.
    pub parent: Option<Box<Team>>,
}

/// Team privacy level.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TeamPrivacy {
    /// Secret team.
    Secret,
    /// Closed team.
    Closed,
}

/// Gist.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gist {
    /// Gist ID.
    pub id: String,
    /// Node ID.
    pub node_id: String,
    /// Gist description.
    pub description: Option<String>,
    /// Whether the gist is public.
    pub public: bool,
    /// Gist owner.
    pub owner: Option<User>,
    /// Gist files.
    pub files: std::collections::HashMap<String, GistFile>,
    /// Comment count.
    pub comments: u32,
    /// HTML URL.
    pub html_url: String,
    /// Git pull URL.
    pub git_pull_url: String,
    /// Git push URL.
    pub git_push_url: String,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
}

/// Gist file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GistFile {
    /// Filename.
    pub filename: String,
    /// File type.
    #[serde(rename = "type")]
    pub file_type: String,
    /// File language.
    pub language: Option<String>,
    /// Raw URL.
    pub raw_url: String,
    /// File size.
    pub size: u64,
    /// File content (may be truncated).
    pub content: Option<String>,
    /// Whether content is truncated.
    #[serde(default)]
    pub truncated: bool,
}

/// Comment (generic for issues, PRs, gists).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    /// Comment ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Comment body.
    pub body: String,
    /// Comment author.
    pub user: User,
    /// HTML URL.
    pub html_url: String,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
}

/// Webhook configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookConfig {
    /// Webhook URL.
    pub url: String,
    /// Content type.
    pub content_type: String,
    /// Secret (redacted in responses).
    pub secret: Option<String>,
    /// Whether to allow insecure SSL.
    pub insecure_ssl: String,
}

/// Webhook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Webhook {
    /// Webhook ID.
    pub id: u64,
    /// Webhook type.
    #[serde(rename = "type")]
    pub hook_type: String,
    /// Webhook name.
    pub name: String,
    /// Whether the webhook is active.
    pub active: bool,
    /// Events that trigger the webhook.
    pub events: Vec<String>,
    /// Webhook configuration.
    pub config: WebhookConfig,
    /// Last response.
    pub last_response: Option<WebhookLastResponse>,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last update time.
    pub updated_at: DateTime<Utc>,
}

/// Webhook last response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookLastResponse {
    /// Response code.
    pub code: Option<i32>,
    /// Response status.
    pub status: Option<String>,
    /// Response message.
    pub message: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_user() {
        let json = r#"{
            "id": 1,
            "login": "octocat",
            "node_id": "MDQ6VXNlcjE=",
            "avatar_url": "https://github.com/images/error/octocat_happy.gif",
            "type": "User",
            "site_admin": false,
            "html_url": "https://github.com/octocat"
        }"#;

        let user: User = serde_json::from_str(json).unwrap();
        assert_eq!(user.login, "octocat");
        assert_eq!(user.id, 1);
    }

    #[test]
    fn test_issue_state() {
        assert_eq!(
            serde_json::from_str::<IssueState>(r#""open""#).unwrap(),
            IssueState::Open
        );
        assert_eq!(
            serde_json::from_str::<IssueState>(r#""closed""#).unwrap(),
            IssueState::Closed
        );
    }
}
