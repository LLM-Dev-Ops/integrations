//! GitHub Webhooks handling with signature verification.

use crate::errors::{GitHubError, GitHubErrorKind, GitHubResult};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;

type HmacSha256 = Hmac<Sha256>;

/// Webhook signature verification.
pub struct WebhookVerifier {
    /// Secret used for HMAC verification.
    secret: String,
}

impl WebhookVerifier {
    /// Creates a new webhook verifier with the given secret.
    pub fn new(secret: impl Into<String>) -> Self {
        Self {
            secret: secret.into(),
        }
    }

    /// Verifies the webhook signature using HMAC-SHA256.
    ///
    /// The signature should be in the format "sha256=<hex-digest>".
    /// Uses constant-time comparison to prevent timing attacks.
    pub fn verify(&self, signature: &str, payload: &[u8]) -> GitHubResult<bool> {
        let signature = signature
            .strip_prefix("sha256=")
            .ok_or_else(|| {
                GitHubError::new(
                    GitHubErrorKind::WebhookSignatureInvalid,
                    "Invalid signature format: must start with 'sha256='",
                )
            })?;

        let signature_bytes = hex::decode(signature).map_err(|e| {
            GitHubError::new(
                GitHubErrorKind::WebhookSignatureInvalid,
                format!("Invalid signature hex encoding: {}", e),
            )
        })?;

        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes()).map_err(|e| {
            GitHubError::new(
                GitHubErrorKind::WebhookSignatureInvalid,
                format!("Failed to create HMAC: {}", e),
            )
        })?;

        mac.update(payload);

        // Constant-time comparison
        mac.verify_slice(&signature_bytes)
            .map(|_| true)
            .map_err(|_| {
                GitHubError::new(
                    GitHubErrorKind::WebhookSignatureInvalid,
                    "Signature verification failed",
                )
            })
    }

    /// Verifies and parses a webhook payload.
    pub fn verify_and_parse<T: for<'de> Deserialize<'de>>(
        &self,
        signature: &str,
        payload: &[u8],
    ) -> GitHubResult<T> {
        self.verify(signature, payload)?;
        serde_json::from_slice(payload).map_err(|e| {
            GitHubError::new(
                GitHubErrorKind::WebhookPayloadInvalid,
                format!("Failed to parse webhook payload: {}", e),
            )
        })
    }
}

/// Computes the HMAC-SHA256 signature for a payload.
pub fn compute_signature(secret: &str, payload: &[u8]) -> GitHubResult<String> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).map_err(|e| {
        GitHubError::new(
            GitHubErrorKind::Unknown,
            format!("Failed to create HMAC: {}", e),
        )
    })?;

    mac.update(payload);
    let result = mac.finalize();
    Ok(format!("sha256={}", hex::encode(result.into_bytes())))
}

/// Webhook event types.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebhookEventType {
    /// Branch or tag created.
    Create,
    /// Branch or tag deleted.
    Delete,
    /// Deployment created.
    Deployment,
    /// Deployment status updated.
    DeploymentStatus,
    /// Fork created.
    Fork,
    /// Gollum (wiki) event.
    Gollum,
    /// Issue comment created, edited, or deleted.
    IssueComment,
    /// Issue opened, edited, deleted, transferred, closed, etc.
    Issues,
    /// Member added to repository.
    Member,
    /// Membership changed in organization.
    Membership,
    /// Milestone created, closed, opened, edited, or deleted.
    Milestone,
    /// Organization event.
    Organization,
    /// Member's organization membership made public.
    OrgBlock,
    /// Activity on a project board.
    Project,
    /// Project card created, updated, or deleted.
    ProjectCard,
    /// Project column created, updated, or deleted.
    ProjectColumn,
    /// Repository made public.
    Public,
    /// Pull request opened, closed, etc.
    PullRequest,
    /// Pull request review submitted.
    PullRequestReview,
    /// Pull request review comment added.
    PullRequestReviewComment,
    /// Pull request review thread resolved/unresolved.
    PullRequestReviewThread,
    /// Push to repository.
    Push,
    /// Release published, unpublished, created, etc.
    Release,
    /// Repository created, deleted, archived, etc.
    Repository,
    /// Repository dispatch event.
    RepositoryDispatch,
    /// Security advisory affected repository.
    RepositoryVulnerabilityAlert,
    /// Star added or removed.
    Star,
    /// Check run completed.
    CheckRun,
    /// Check suite completed.
    CheckSuite,
    /// Code scanning alert created, updated.
    CodeScanningAlert,
    /// Commit comment created.
    CommitComment,
    /// Discussion created, edited, etc.
    Discussion,
    /// Discussion comment created, edited, etc.
    DiscussionComment,
    /// Installation created, deleted, etc.
    Installation,
    /// Installation repositories added/removed.
    InstallationRepositories,
    /// Installation target updated.
    InstallationTarget,
    /// Label created, edited, or deleted.
    Label,
    /// Marketplace purchase event.
    MarketplacePurchase,
    /// GitHub App authorized for user.
    Meta,
    /// Package published or updated.
    Package,
    /// Page build status.
    PageBuild,
    /// App event (ping).
    Ping,
    /// Secret scanning alert.
    SecretScanningAlert,
    /// Security and analysis settings changed.
    SecurityAndAnalysis,
    /// Sponsorship event.
    Sponsorship,
    /// Status on git commit.
    Status,
    /// Team added or removed.
    Team,
    /// Team added to repository.
    TeamAdd,
    /// User event.
    Watch,
    /// Workflow dispatch manually triggered.
    WorkflowDispatch,
    /// Workflow job started, completed.
    WorkflowJob,
    /// Workflow run requested, completed.
    WorkflowRun,
    /// Unknown event type.
    #[serde(other)]
    Unknown,
}

impl std::fmt::Display for WebhookEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            WebhookEventType::Create => "create",
            WebhookEventType::Delete => "delete",
            WebhookEventType::Deployment => "deployment",
            WebhookEventType::DeploymentStatus => "deployment_status",
            WebhookEventType::Fork => "fork",
            WebhookEventType::Gollum => "gollum",
            WebhookEventType::IssueComment => "issue_comment",
            WebhookEventType::Issues => "issues",
            WebhookEventType::Member => "member",
            WebhookEventType::Membership => "membership",
            WebhookEventType::Milestone => "milestone",
            WebhookEventType::Organization => "organization",
            WebhookEventType::OrgBlock => "org_block",
            WebhookEventType::Project => "project",
            WebhookEventType::ProjectCard => "project_card",
            WebhookEventType::ProjectColumn => "project_column",
            WebhookEventType::Public => "public",
            WebhookEventType::PullRequest => "pull_request",
            WebhookEventType::PullRequestReview => "pull_request_review",
            WebhookEventType::PullRequestReviewComment => "pull_request_review_comment",
            WebhookEventType::PullRequestReviewThread => "pull_request_review_thread",
            WebhookEventType::Push => "push",
            WebhookEventType::Release => "release",
            WebhookEventType::Repository => "repository",
            WebhookEventType::RepositoryDispatch => "repository_dispatch",
            WebhookEventType::RepositoryVulnerabilityAlert => "repository_vulnerability_alert",
            WebhookEventType::Star => "star",
            WebhookEventType::CheckRun => "check_run",
            WebhookEventType::CheckSuite => "check_suite",
            WebhookEventType::CodeScanningAlert => "code_scanning_alert",
            WebhookEventType::CommitComment => "commit_comment",
            WebhookEventType::Discussion => "discussion",
            WebhookEventType::DiscussionComment => "discussion_comment",
            WebhookEventType::Installation => "installation",
            WebhookEventType::InstallationRepositories => "installation_repositories",
            WebhookEventType::InstallationTarget => "installation_target",
            WebhookEventType::Label => "label",
            WebhookEventType::MarketplacePurchase => "marketplace_purchase",
            WebhookEventType::Meta => "meta",
            WebhookEventType::Package => "package",
            WebhookEventType::PageBuild => "page_build",
            WebhookEventType::Ping => "ping",
            WebhookEventType::SecretScanningAlert => "secret_scanning_alert",
            WebhookEventType::SecurityAndAnalysis => "security_and_analysis",
            WebhookEventType::Sponsorship => "sponsorship",
            WebhookEventType::Status => "status",
            WebhookEventType::Team => "team",
            WebhookEventType::TeamAdd => "team_add",
            WebhookEventType::Watch => "watch",
            WebhookEventType::WorkflowDispatch => "workflow_dispatch",
            WebhookEventType::WorkflowJob => "workflow_job",
            WebhookEventType::WorkflowRun => "workflow_run",
            WebhookEventType::Unknown => "unknown",
        };
        write!(f, "{}", s)
    }
}

impl std::str::FromStr for WebhookEventType {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s {
            "create" => WebhookEventType::Create,
            "delete" => WebhookEventType::Delete,
            "deployment" => WebhookEventType::Deployment,
            "deployment_status" => WebhookEventType::DeploymentStatus,
            "fork" => WebhookEventType::Fork,
            "gollum" => WebhookEventType::Gollum,
            "issue_comment" => WebhookEventType::IssueComment,
            "issues" => WebhookEventType::Issues,
            "member" => WebhookEventType::Member,
            "membership" => WebhookEventType::Membership,
            "milestone" => WebhookEventType::Milestone,
            "organization" => WebhookEventType::Organization,
            "org_block" => WebhookEventType::OrgBlock,
            "project" => WebhookEventType::Project,
            "project_card" => WebhookEventType::ProjectCard,
            "project_column" => WebhookEventType::ProjectColumn,
            "public" => WebhookEventType::Public,
            "pull_request" => WebhookEventType::PullRequest,
            "pull_request_review" => WebhookEventType::PullRequestReview,
            "pull_request_review_comment" => WebhookEventType::PullRequestReviewComment,
            "pull_request_review_thread" => WebhookEventType::PullRequestReviewThread,
            "push" => WebhookEventType::Push,
            "release" => WebhookEventType::Release,
            "repository" => WebhookEventType::Repository,
            "repository_dispatch" => WebhookEventType::RepositoryDispatch,
            "repository_vulnerability_alert" => WebhookEventType::RepositoryVulnerabilityAlert,
            "star" => WebhookEventType::Star,
            "check_run" => WebhookEventType::CheckRun,
            "check_suite" => WebhookEventType::CheckSuite,
            "code_scanning_alert" => WebhookEventType::CodeScanningAlert,
            "commit_comment" => WebhookEventType::CommitComment,
            "discussion" => WebhookEventType::Discussion,
            "discussion_comment" => WebhookEventType::DiscussionComment,
            "installation" => WebhookEventType::Installation,
            "installation_repositories" => WebhookEventType::InstallationRepositories,
            "installation_target" => WebhookEventType::InstallationTarget,
            "label" => WebhookEventType::Label,
            "marketplace_purchase" => WebhookEventType::MarketplacePurchase,
            "meta" => WebhookEventType::Meta,
            "package" => WebhookEventType::Package,
            "page_build" => WebhookEventType::PageBuild,
            "ping" => WebhookEventType::Ping,
            "secret_scanning_alert" => WebhookEventType::SecretScanningAlert,
            "security_and_analysis" => WebhookEventType::SecurityAndAnalysis,
            "sponsorship" => WebhookEventType::Sponsorship,
            "status" => WebhookEventType::Status,
            "team" => WebhookEventType::Team,
            "team_add" => WebhookEventType::TeamAdd,
            "watch" => WebhookEventType::Watch,
            "workflow_dispatch" => WebhookEventType::WorkflowDispatch,
            "workflow_job" => WebhookEventType::WorkflowJob,
            "workflow_run" => WebhookEventType::WorkflowRun,
            _ => WebhookEventType::Unknown,
        })
    }
}

/// Common webhook payload structure.
#[derive(Debug, Clone, Deserialize)]
pub struct WebhookPayload {
    /// Action that triggered the webhook.
    pub action: Option<String>,
    /// Sender (user who triggered the event).
    pub sender: Option<WebhookSender>,
    /// Repository the event relates to.
    pub repository: Option<WebhookRepository>,
    /// Organization the event relates to.
    pub organization: Option<WebhookOrganization>,
    /// Installation the event relates to.
    pub installation: Option<WebhookInstallation>,
}

/// Webhook sender information.
#[derive(Debug, Clone, Deserialize)]
pub struct WebhookSender {
    /// User ID.
    pub id: u64,
    /// Username.
    pub login: String,
    /// Node ID.
    pub node_id: String,
    /// Avatar URL.
    pub avatar_url: String,
    /// User type.
    #[serde(rename = "type")]
    pub user_type: String,
}

/// Webhook repository information.
#[derive(Debug, Clone, Deserialize)]
pub struct WebhookRepository {
    /// Repository ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Repository name.
    pub name: String,
    /// Full repository name (owner/repo).
    pub full_name: String,
    /// Whether private.
    pub private: bool,
    /// Owner.
    pub owner: WebhookSender,
    /// HTML URL.
    pub html_url: String,
    /// Description.
    pub description: Option<String>,
    /// Whether a fork.
    pub fork: bool,
    /// Default branch.
    pub default_branch: String,
}

/// Webhook organization information.
#[derive(Debug, Clone, Deserialize)]
pub struct WebhookOrganization {
    /// Organization ID.
    pub id: u64,
    /// Organization login.
    pub login: String,
    /// Node ID.
    pub node_id: String,
    /// Avatar URL.
    pub avatar_url: String,
}

/// Webhook installation information.
#[derive(Debug, Clone, Deserialize)]
pub struct WebhookInstallation {
    /// Installation ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
}

/// Push event payload.
#[derive(Debug, Clone, Deserialize)]
pub struct PushEvent {
    /// Ref that was pushed.
    #[serde(rename = "ref")]
    pub git_ref: String,
    /// Before SHA.
    pub before: String,
    /// After SHA.
    pub after: String,
    /// Whether the push created the ref.
    pub created: bool,
    /// Whether the push deleted the ref.
    pub deleted: bool,
    /// Whether it was a force push.
    pub forced: bool,
    /// Base ref.
    pub base_ref: Option<String>,
    /// Compare URL.
    pub compare: String,
    /// Commits included in the push.
    pub commits: Vec<PushCommit>,
    /// Head commit.
    pub head_commit: Option<PushCommit>,
    /// Repository.
    pub repository: WebhookRepository,
    /// Pusher.
    pub pusher: PushAuthor,
    /// Sender.
    pub sender: WebhookSender,
}

/// A commit in a push event.
#[derive(Debug, Clone, Deserialize)]
pub struct PushCommit {
    /// Commit SHA.
    pub id: String,
    /// Tree SHA.
    pub tree_id: String,
    /// Whether distinct from any previous commit.
    pub distinct: bool,
    /// Commit message.
    pub message: String,
    /// Timestamp.
    pub timestamp: String,
    /// Commit URL.
    pub url: String,
    /// Author.
    pub author: PushAuthor,
    /// Committer.
    pub committer: PushAuthor,
    /// Files added.
    pub added: Vec<String>,
    /// Files removed.
    pub removed: Vec<String>,
    /// Files modified.
    pub modified: Vec<String>,
}

/// Author/committer in a push event.
#[derive(Debug, Clone, Deserialize)]
pub struct PushAuthor {
    /// Name.
    pub name: String,
    /// Email.
    pub email: String,
    /// Username (if applicable).
    pub username: Option<String>,
}

/// Pull request event payload.
#[derive(Debug, Clone, Deserialize)]
pub struct PullRequestEvent {
    /// Action.
    pub action: String,
    /// Pull request number.
    pub number: u32,
    /// Pull request.
    pub pull_request: PullRequestWebhook,
    /// Repository.
    pub repository: WebhookRepository,
    /// Sender.
    pub sender: WebhookSender,
    /// Label (for labeled/unlabeled actions).
    pub label: Option<WebhookLabel>,
    /// Requested reviewer (for review_requested action).
    pub requested_reviewer: Option<WebhookSender>,
}

/// Pull request in webhook payload.
#[derive(Debug, Clone, Deserialize)]
pub struct PullRequestWebhook {
    /// Pull request ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Pull request number.
    pub number: u32,
    /// State.
    pub state: String,
    /// Title.
    pub title: String,
    /// Body.
    pub body: Option<String>,
    /// User who created the PR.
    pub user: WebhookSender,
    /// HTML URL.
    pub html_url: String,
    /// Diff URL.
    pub diff_url: String,
    /// Patch URL.
    pub patch_url: String,
    /// Head branch info.
    pub head: PullRequestRef,
    /// Base branch info.
    pub base: PullRequestRef,
    /// Whether draft.
    pub draft: bool,
    /// Whether merged.
    pub merged: bool,
    /// Whether mergeable.
    pub mergeable: Option<bool>,
    /// Merge commit SHA.
    pub merge_commit_sha: Option<String>,
    /// Merged at.
    pub merged_at: Option<String>,
    /// Merged by.
    pub merged_by: Option<WebhookSender>,
    /// Number of comments.
    pub comments: u32,
    /// Number of review comments.
    pub review_comments: u32,
    /// Number of commits.
    pub commits: u32,
    /// Number of additions.
    pub additions: u32,
    /// Number of deletions.
    pub deletions: u32,
    /// Number of changed files.
    pub changed_files: u32,
}

/// Pull request ref (head or base).
#[derive(Debug, Clone, Deserialize)]
pub struct PullRequestRef {
    /// Branch name.
    #[serde(rename = "ref")]
    pub git_ref: String,
    /// SHA.
    pub sha: String,
    /// User.
    pub user: WebhookSender,
    /// Repository.
    pub repo: Option<WebhookRepository>,
}

/// Issue event payload.
#[derive(Debug, Clone, Deserialize)]
pub struct IssueEvent {
    /// Action.
    pub action: String,
    /// Issue.
    pub issue: IssueWebhook,
    /// Repository.
    pub repository: WebhookRepository,
    /// Sender.
    pub sender: WebhookSender,
    /// Label (for labeled/unlabeled actions).
    pub label: Option<WebhookLabel>,
    /// Assignee (for assigned/unassigned actions).
    pub assignee: Option<WebhookSender>,
}

/// Issue in webhook payload.
#[derive(Debug, Clone, Deserialize)]
pub struct IssueWebhook {
    /// Issue ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Issue number.
    pub number: u32,
    /// Title.
    pub title: String,
    /// Body.
    pub body: Option<String>,
    /// State.
    pub state: String,
    /// User who created the issue.
    pub user: WebhookSender,
    /// Labels.
    pub labels: Vec<WebhookLabel>,
    /// Assignees.
    pub assignees: Vec<WebhookSender>,
    /// HTML URL.
    pub html_url: String,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
    /// Closed at.
    pub closed_at: Option<String>,
}

/// Label in webhook payload.
#[derive(Debug, Clone, Deserialize)]
pub struct WebhookLabel {
    /// Label ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Name.
    pub name: String,
    /// Color (hex without #).
    pub color: String,
    /// Description.
    pub description: Option<String>,
    /// Whether default.
    pub default: bool,
}

/// Workflow run event payload.
#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowRunEvent {
    /// Action.
    pub action: String,
    /// Workflow run.
    pub workflow_run: WorkflowRunWebhook,
    /// Workflow.
    pub workflow: WorkflowWebhook,
    /// Repository.
    pub repository: WebhookRepository,
    /// Sender.
    pub sender: WebhookSender,
}

/// Workflow run in webhook payload.
#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowRunWebhook {
    /// Run ID.
    pub id: u64,
    /// Run number.
    pub run_number: u32,
    /// Event that triggered the run.
    pub event: String,
    /// Status.
    pub status: String,
    /// Conclusion.
    pub conclusion: Option<String>,
    /// Workflow ID.
    pub workflow_id: u64,
    /// Head SHA.
    pub head_sha: String,
    /// Head branch.
    pub head_branch: Option<String>,
    /// HTML URL.
    pub html_url: String,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
}

/// Workflow in webhook payload.
#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowWebhook {
    /// Workflow ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Name.
    pub name: String,
    /// Path.
    pub path: String,
    /// State.
    pub state: String,
}

/// Webhook handler trait for processing events.
pub trait WebhookHandler: Send + Sync {
    /// Handles a push event.
    fn on_push(&self, _event: &PushEvent) -> GitHubResult<()> {
        Ok(())
    }

    /// Handles a pull request event.
    fn on_pull_request(&self, _event: &PullRequestEvent) -> GitHubResult<()> {
        Ok(())
    }

    /// Handles an issue event.
    fn on_issue(&self, _event: &IssueEvent) -> GitHubResult<()> {
        Ok(())
    }

    /// Handles a workflow run event.
    fn on_workflow_run(&self, _event: &WorkflowRunEvent) -> GitHubResult<()> {
        Ok(())
    }

    /// Handles an unknown event.
    fn on_unknown(&self, _event_type: &str, _payload: &[u8]) -> GitHubResult<()> {
        Ok(())
    }
}

/// Webhook processor that verifies and dispatches events.
pub struct WebhookProcessor<H: WebhookHandler> {
    verifier: WebhookVerifier,
    handler: H,
}

impl<H: WebhookHandler> WebhookProcessor<H> {
    /// Creates a new webhook processor.
    pub fn new(secret: impl Into<String>, handler: H) -> Self {
        Self {
            verifier: WebhookVerifier::new(secret),
            handler,
        }
    }

    /// Processes a webhook request.
    pub fn process(
        &self,
        event_type: &str,
        signature: &str,
        payload: &[u8],
    ) -> GitHubResult<()> {
        // Verify signature first
        self.verifier.verify(signature, payload)?;

        // Parse and dispatch based on event type
        let event_type: WebhookEventType = event_type.parse().unwrap_or(WebhookEventType::Unknown);

        match event_type {
            WebhookEventType::Push => {
                let event: PushEvent = serde_json::from_slice(payload).map_err(|e| {
                    GitHubError::new(
                        GitHubErrorKind::WebhookPayloadInvalid,
                        format!("Failed to parse push event: {}", e),
                    )
                })?;
                self.handler.on_push(&event)
            }
            WebhookEventType::PullRequest => {
                let event: PullRequestEvent = serde_json::from_slice(payload).map_err(|e| {
                    GitHubError::new(
                        GitHubErrorKind::WebhookPayloadInvalid,
                        format!("Failed to parse pull request event: {}", e),
                    )
                })?;
                self.handler.on_pull_request(&event)
            }
            WebhookEventType::Issues => {
                let event: IssueEvent = serde_json::from_slice(payload).map_err(|e| {
                    GitHubError::new(
                        GitHubErrorKind::WebhookPayloadInvalid,
                        format!("Failed to parse issue event: {}", e),
                    )
                })?;
                self.handler.on_issue(&event)
            }
            WebhookEventType::WorkflowRun => {
                let event: WorkflowRunEvent = serde_json::from_slice(payload).map_err(|e| {
                    GitHubError::new(
                        GitHubErrorKind::WebhookPayloadInvalid,
                        format!("Failed to parse workflow run event: {}", e),
                    )
                })?;
                self.handler.on_workflow_run(&event)
            }
            _ => self.handler.on_unknown(&event_type.to_string(), payload),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_signature() {
        let secret = "test_secret";
        let payload = b"test payload";

        // Compute expected signature
        let signature = compute_signature(secret, payload).unwrap();

        let verifier = WebhookVerifier::new(secret);
        assert!(verifier.verify(&signature, payload).is_ok());
    }

    #[test]
    fn test_invalid_signature() {
        let verifier = WebhookVerifier::new("secret");
        let result = verifier.verify("sha256=invalid", b"payload");
        assert!(result.is_err());
    }

    #[test]
    fn test_event_type_parsing() {
        assert_eq!("push".parse::<WebhookEventType>().unwrap(), WebhookEventType::Push);
        assert_eq!("pull_request".parse::<WebhookEventType>().unwrap(), WebhookEventType::PullRequest);
        assert_eq!("unknown_event".parse::<WebhookEventType>().unwrap(), WebhookEventType::Unknown);
    }
}
