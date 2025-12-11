//! GitHub Actions operations.

use crate::client::GitHubClient;
use crate::errors::GitHubResult;
use crate::types::{Workflow, WorkflowRun, WorkflowState};
use serde::{Deserialize, Serialize};

/// Service for GitHub Actions operations.
pub struct ActionsService<'a> {
    client: &'a GitHubClient,
}

impl<'a> ActionsService<'a> {
    /// Creates a new actions service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    // Workflows

    /// Lists workflows in a repository.
    pub async fn list_workflows(&self, owner: &str, repo: &str) -> GitHubResult<WorkflowsResponse> {
        self.client
            .get(&format!("/repos/{}/{}/actions/workflows", owner, repo))
            .await
    }

    /// Gets a workflow.
    pub async fn get_workflow(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: WorkflowId,
    ) -> GitHubResult<Workflow> {
        let id = workflow_id.to_string();
        self.client
            .get(&format!("/repos/{}/{}/actions/workflows/{}", owner, repo, id))
            .await
    }

    /// Disables a workflow.
    pub async fn disable_workflow(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: WorkflowId,
    ) -> GitHubResult<()> {
        let id = workflow_id.to_string();
        self.client
            .put_no_response(
                &format!(
                    "/repos/{}/{}/actions/workflows/{}/disable",
                    owner, repo, id
                ),
                &(),
            )
            .await
    }

    /// Enables a workflow.
    pub async fn enable_workflow(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: WorkflowId,
    ) -> GitHubResult<()> {
        let id = workflow_id.to_string();
        self.client
            .put_no_response(
                &format!(
                    "/repos/{}/{}/actions/workflows/{}/enable",
                    owner, repo, id
                ),
                &(),
            )
            .await
    }

    /// Triggers a workflow dispatch event.
    pub async fn create_workflow_dispatch(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: WorkflowId,
        request: &WorkflowDispatchRequest,
    ) -> GitHubResult<()> {
        let id = workflow_id.to_string();
        self.client
            .post_no_response(
                &format!(
                    "/repos/{}/{}/actions/workflows/{}/dispatches",
                    owner, repo, id
                ),
                request,
            )
            .await
    }

    // Workflow Runs

    /// Lists workflow runs for a repository.
    pub async fn list_workflow_runs(
        &self,
        owner: &str,
        repo: &str,
    ) -> GitHubResult<WorkflowRunsResponse> {
        self.list_workflow_runs_with_params(owner, repo, &ListWorkflowRunsParams::default())
            .await
    }

    /// Lists workflow runs with parameters.
    pub async fn list_workflow_runs_with_params(
        &self,
        owner: &str,
        repo: &str,
        params: &ListWorkflowRunsParams,
    ) -> GitHubResult<WorkflowRunsResponse> {
        self.client
            .get_with_params(&format!("/repos/{}/{}/actions/runs", owner, repo), params)
            .await
    }

    /// Lists runs for a specific workflow.
    pub async fn list_runs_for_workflow(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: WorkflowId,
    ) -> GitHubResult<WorkflowRunsResponse> {
        let id = workflow_id.to_string();
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/workflows/{}/runs",
                owner, repo, id
            ))
            .await
    }

    /// Gets a workflow run.
    pub async fn get_workflow_run(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<WorkflowRun> {
        self.client
            .get(&format!("/repos/{}/{}/actions/runs/{}", owner, repo, run_id))
            .await
    }

    /// Deletes a workflow run.
    pub async fn delete_workflow_run(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!("/repos/{}/{}/actions/runs/{}", owner, repo, run_id))
            .await
    }

    /// Re-runs a workflow.
    pub async fn rerun_workflow(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .post_no_response(
                &format!("/repos/{}/{}/actions/runs/{}/rerun", owner, repo, run_id),
                &(),
            )
            .await
    }

    /// Re-runs failed jobs in a workflow.
    pub async fn rerun_failed_jobs(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .post_no_response(
                &format!(
                    "/repos/{}/{}/actions/runs/{}/rerun-failed-jobs",
                    owner, repo, run_id
                ),
                &(),
            )
            .await
    }

    /// Cancels a workflow run.
    pub async fn cancel_workflow_run(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .post_no_response(
                &format!(
                    "/repos/{}/{}/actions/runs/{}/cancel",
                    owner, repo, run_id
                ),
                &(),
            )
            .await
    }

    /// Approves a workflow run for a fork pull request.
    pub async fn approve_workflow_run(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .post_no_response(
                &format!(
                    "/repos/{}/{}/actions/runs/{}/approve",
                    owner, repo, run_id
                ),
                &(),
            )
            .await
    }

    /// Gets workflow run usage.
    pub async fn get_workflow_run_usage(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<WorkflowRunUsage> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/runs/{}/timing",
                owner, repo, run_id
            ))
            .await
    }

    // Jobs

    /// Lists jobs for a workflow run.
    pub async fn list_jobs_for_workflow_run(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<JobsResponse> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/runs/{}/jobs",
                owner, repo, run_id
            ))
            .await
    }

    /// Gets a job for a workflow run.
    pub async fn get_job(&self, owner: &str, repo: &str, job_id: u64) -> GitHubResult<Job> {
        self.client
            .get(&format!("/repos/{}/{}/actions/jobs/{}", owner, repo, job_id))
            .await
    }

    /// Downloads job logs.
    pub async fn download_job_logs(
        &self,
        owner: &str,
        repo: &str,
        job_id: u64,
    ) -> GitHubResult<String> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/jobs/{}/logs",
                owner, repo, job_id
            ))
            .await
    }

    /// Downloads workflow run logs.
    pub async fn download_workflow_run_logs(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<String> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/runs/{}/logs",
                owner, repo, run_id
            ))
            .await
    }

    /// Deletes workflow run logs.
    pub async fn delete_workflow_run_logs(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/actions/runs/{}/logs",
                owner, repo, run_id
            ))
            .await
    }

    // Artifacts

    /// Lists artifacts for a repository.
    pub async fn list_artifacts(&self, owner: &str, repo: &str) -> GitHubResult<ArtifactsResponse> {
        self.client
            .get(&format!("/repos/{}/{}/actions/artifacts", owner, repo))
            .await
    }

    /// Lists artifacts for a workflow run.
    pub async fn list_artifacts_for_run(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> GitHubResult<ArtifactsResponse> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/runs/{}/artifacts",
                owner, repo, run_id
            ))
            .await
    }

    /// Gets an artifact.
    pub async fn get_artifact(
        &self,
        owner: &str,
        repo: &str,
        artifact_id: u64,
    ) -> GitHubResult<Artifact> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/artifacts/{}",
                owner, repo, artifact_id
            ))
            .await
    }

    /// Deletes an artifact.
    pub async fn delete_artifact(
        &self,
        owner: &str,
        repo: &str,
        artifact_id: u64,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/actions/artifacts/{}",
                owner, repo, artifact_id
            ))
            .await
    }

    // Secrets

    /// Lists repository secrets.
    pub async fn list_secrets(&self, owner: &str, repo: &str) -> GitHubResult<SecretsResponse> {
        self.client
            .get(&format!("/repos/{}/{}/actions/secrets", owner, repo))
            .await
    }

    /// Gets a repository secret.
    pub async fn get_secret(&self, owner: &str, repo: &str, name: &str) -> GitHubResult<Secret> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/secrets/{}",
                owner, repo, name
            ))
            .await
    }

    /// Creates or updates a repository secret.
    pub async fn create_or_update_secret(
        &self,
        owner: &str,
        repo: &str,
        name: &str,
        request: &CreateSecretRequest,
    ) -> GitHubResult<()> {
        self.client
            .put_no_response(
                &format!("/repos/{}/{}/actions/secrets/{}", owner, repo, name),
                request,
            )
            .await
    }

    /// Deletes a repository secret.
    pub async fn delete_secret(&self, owner: &str, repo: &str, name: &str) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/actions/secrets/{}",
                owner, repo, name
            ))
            .await
    }

    /// Gets repository public key for encrypting secrets.
    pub async fn get_public_key(&self, owner: &str, repo: &str) -> GitHubResult<PublicKey> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/secrets/public-key",
                owner, repo
            ))
            .await
    }

    // Variables

    /// Lists repository variables.
    pub async fn list_variables(
        &self,
        owner: &str,
        repo: &str,
    ) -> GitHubResult<VariablesResponse> {
        self.client
            .get(&format!("/repos/{}/{}/actions/variables", owner, repo))
            .await
    }

    /// Gets a repository variable.
    pub async fn get_variable(
        &self,
        owner: &str,
        repo: &str,
        name: &str,
    ) -> GitHubResult<Variable> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/variables/{}",
                owner, repo, name
            ))
            .await
    }

    /// Creates a repository variable.
    pub async fn create_variable(
        &self,
        owner: &str,
        repo: &str,
        request: &CreateVariableRequest,
    ) -> GitHubResult<()> {
        self.client
            .post_no_response(&format!("/repos/{}/{}/actions/variables", owner, repo), request)
            .await
    }

    /// Updates a repository variable.
    pub async fn update_variable(
        &self,
        owner: &str,
        repo: &str,
        name: &str,
        request: &UpdateVariableRequest,
    ) -> GitHubResult<()> {
        self.client
            .patch_no_response(
                &format!("/repos/{}/{}/actions/variables/{}", owner, repo, name),
                request,
            )
            .await
    }

    /// Deletes a repository variable.
    pub async fn delete_variable(&self, owner: &str, repo: &str, name: &str) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/actions/variables/{}",
                owner, repo, name
            ))
            .await
    }

    // Self-hosted Runners

    /// Lists self-hosted runners for a repository.
    pub async fn list_runners(&self, owner: &str, repo: &str) -> GitHubResult<RunnersResponse> {
        self.client
            .get(&format!("/repos/{}/{}/actions/runners", owner, repo))
            .await
    }

    /// Gets a self-hosted runner.
    pub async fn get_runner(&self, owner: &str, repo: &str, runner_id: u64) -> GitHubResult<Runner> {
        self.client
            .get(&format!(
                "/repos/{}/{}/actions/runners/{}",
                owner, repo, runner_id
            ))
            .await
    }

    /// Deletes a self-hosted runner.
    pub async fn delete_runner(&self, owner: &str, repo: &str, runner_id: u64) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/repos/{}/{}/actions/runners/{}",
                owner, repo, runner_id
            ))
            .await
    }

    /// Creates a registration token for a self-hosted runner.
    pub async fn create_registration_token(
        &self,
        owner: &str,
        repo: &str,
    ) -> GitHubResult<RunnerToken> {
        self.client
            .post(
                &format!(
                    "/repos/{}/{}/actions/runners/registration-token",
                    owner, repo
                ),
                &(),
            )
            .await
    }

    /// Creates a removal token for a self-hosted runner.
    pub async fn create_removal_token(
        &self,
        owner: &str,
        repo: &str,
    ) -> GitHubResult<RunnerToken> {
        self.client
            .post(
                &format!("/repos/{}/{}/actions/runners/remove-token", owner, repo),
                &(),
            )
            .await
    }
}

/// Workflow identifier (ID or filename).
#[derive(Debug, Clone)]
pub enum WorkflowId {
    /// Numeric workflow ID.
    Id(u64),
    /// Workflow filename (e.g., "ci.yml").
    Filename(String),
}

impl std::fmt::Display for WorkflowId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkflowId::Id(id) => write!(f, "{}", id),
            WorkflowId::Filename(name) => write!(f, "{}", name),
        }
    }
}

impl From<u64> for WorkflowId {
    fn from(id: u64) -> Self {
        WorkflowId::Id(id)
    }
}

impl From<&str> for WorkflowId {
    fn from(name: &str) -> Self {
        WorkflowId::Filename(name.to_string())
    }
}

impl From<String> for WorkflowId {
    fn from(name: String) -> Self {
        WorkflowId::Filename(name)
    }
}

/// Response containing workflows.
#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowsResponse {
    /// Total count.
    pub total_count: u32,
    /// Workflows.
    pub workflows: Vec<Workflow>,
}

/// Response containing workflow runs.
#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowRunsResponse {
    /// Total count.
    pub total_count: u32,
    /// Workflow runs.
    pub workflow_runs: Vec<WorkflowRun>,
}

/// Parameters for listing workflow runs.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ListWorkflowRunsParams {
    /// Filter by actor.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor: Option<String>,
    /// Filter by branch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// Filter by event.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    /// Filter by status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<WorkflowRunStatus>,
    /// Filter by created date.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<String>,
    /// Exclude pull requests.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclude_pull_requests: Option<bool>,
    /// Check suite ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_suite_id: Option<u64>,
    /// Head SHA.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    /// Page number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    /// Items per page.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_page: Option<u32>,
}

/// Workflow run status filter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowRunStatus {
    Completed,
    ActionRequired,
    Cancelled,
    Failure,
    Neutral,
    Skipped,
    Stale,
    Success,
    TimedOut,
    InProgress,
    Queued,
    Requested,
    Waiting,
    Pending,
}

/// Request to trigger a workflow dispatch.
#[derive(Debug, Clone, Serialize)]
pub struct WorkflowDispatchRequest {
    /// Git ref (branch or tag).
    #[serde(rename = "ref")]
    pub git_ref: String,
    /// Input parameters for the workflow.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inputs: Option<std::collections::HashMap<String, String>>,
}

/// Workflow run usage information.
#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowRunUsage {
    /// Billable time.
    pub billable: BillableTime,
    /// Run duration in milliseconds.
    pub run_duration_ms: u64,
}

/// Billable time breakdown.
#[derive(Debug, Clone, Deserialize)]
pub struct BillableTime {
    /// Ubuntu runner time.
    #[serde(rename = "UBUNTU")]
    pub ubuntu: Option<RunnerTime>,
    /// macOS runner time.
    #[serde(rename = "MACOS")]
    pub macos: Option<RunnerTime>,
    /// Windows runner time.
    #[serde(rename = "WINDOWS")]
    pub windows: Option<RunnerTime>,
}

/// Runner time information.
#[derive(Debug, Clone, Deserialize)]
pub struct RunnerTime {
    /// Total milliseconds.
    pub total_ms: u64,
    /// Number of jobs.
    pub jobs: u32,
}

/// Response containing jobs.
#[derive(Debug, Clone, Deserialize)]
pub struct JobsResponse {
    /// Total count.
    pub total_count: u32,
    /// Jobs.
    pub jobs: Vec<Job>,
}

/// A workflow job.
#[derive(Debug, Clone, Deserialize)]
pub struct Job {
    /// Job ID.
    pub id: u64,
    /// Run ID.
    pub run_id: u64,
    /// Run URL.
    pub run_url: String,
    /// Node ID.
    pub node_id: String,
    /// Head SHA.
    pub head_sha: String,
    /// URL.
    pub url: String,
    /// HTML URL.
    pub html_url: Option<String>,
    /// Status.
    pub status: JobStatus,
    /// Conclusion.
    pub conclusion: Option<JobConclusion>,
    /// Started at.
    pub started_at: Option<String>,
    /// Completed at.
    pub completed_at: Option<String>,
    /// Job name.
    pub name: String,
    /// Steps.
    pub steps: Option<Vec<JobStep>>,
    /// Check run URL.
    pub check_run_url: String,
    /// Labels.
    pub labels: Vec<String>,
    /// Runner ID.
    pub runner_id: Option<u64>,
    /// Runner name.
    pub runner_name: Option<String>,
    /// Runner group ID.
    pub runner_group_id: Option<u64>,
    /// Runner group name.
    pub runner_group_name: Option<String>,
}

/// Job status.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Queued,
    InProgress,
    Completed,
    Waiting,
}

/// Job conclusion.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobConclusion {
    Success,
    Failure,
    Neutral,
    Cancelled,
    Skipped,
    TimedOut,
    ActionRequired,
}

/// A job step.
#[derive(Debug, Clone, Deserialize)]
pub struct JobStep {
    /// Step name.
    pub name: String,
    /// Status.
    pub status: JobStatus,
    /// Conclusion.
    pub conclusion: Option<JobConclusion>,
    /// Step number.
    pub number: u32,
    /// Started at.
    pub started_at: Option<String>,
    /// Completed at.
    pub completed_at: Option<String>,
}

/// Response containing artifacts.
#[derive(Debug, Clone, Deserialize)]
pub struct ArtifactsResponse {
    /// Total count.
    pub total_count: u32,
    /// Artifacts.
    pub artifacts: Vec<Artifact>,
}

/// A workflow artifact.
#[derive(Debug, Clone, Deserialize)]
pub struct Artifact {
    /// Artifact ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Name.
    pub name: String,
    /// Size in bytes.
    pub size_in_bytes: u64,
    /// URL.
    pub url: String,
    /// Archive download URL.
    pub archive_download_url: String,
    /// Whether expired.
    pub expired: bool,
    /// Created at.
    pub created_at: Option<String>,
    /// Expires at.
    pub expires_at: Option<String>,
    /// Updated at.
    pub updated_at: Option<String>,
}

/// Response containing secrets.
#[derive(Debug, Clone, Deserialize)]
pub struct SecretsResponse {
    /// Total count.
    pub total_count: u32,
    /// Secrets.
    pub secrets: Vec<Secret>,
}

/// A repository secret (metadata only, not the value).
#[derive(Debug, Clone, Deserialize)]
pub struct Secret {
    /// Secret name.
    pub name: String,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
}

/// Request to create or update a secret.
#[derive(Debug, Clone, Serialize)]
pub struct CreateSecretRequest {
    /// Encrypted value (base64 encoded, encrypted with repo public key).
    pub encrypted_value: String,
    /// Key ID used for encryption.
    pub key_id: String,
}

/// Public key for encrypting secrets.
#[derive(Debug, Clone, Deserialize)]
pub struct PublicKey {
    /// Key ID.
    pub key_id: String,
    /// Public key (base64 encoded).
    pub key: String,
}

/// Response containing variables.
#[derive(Debug, Clone, Deserialize)]
pub struct VariablesResponse {
    /// Total count.
    pub total_count: u32,
    /// Variables.
    pub variables: Vec<Variable>,
}

/// A repository variable.
#[derive(Debug, Clone, Deserialize)]
pub struct Variable {
    /// Variable name.
    pub name: String,
    /// Variable value.
    pub value: String,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
}

/// Request to create a variable.
#[derive(Debug, Clone, Serialize)]
pub struct CreateVariableRequest {
    /// Variable name.
    pub name: String,
    /// Variable value.
    pub value: String,
}

/// Request to update a variable.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateVariableRequest {
    /// Variable name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Variable value.
    pub value: String,
}

/// Response containing runners.
#[derive(Debug, Clone, Deserialize)]
pub struct RunnersResponse {
    /// Total count.
    pub total_count: u32,
    /// Runners.
    pub runners: Vec<Runner>,
}

/// A self-hosted runner.
#[derive(Debug, Clone, Deserialize)]
pub struct Runner {
    /// Runner ID.
    pub id: u64,
    /// Runner name.
    pub name: String,
    /// OS.
    pub os: String,
    /// Status.
    pub status: RunnerStatus,
    /// Whether busy.
    pub busy: bool,
    /// Labels.
    pub labels: Vec<RunnerLabel>,
}

/// Runner status.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RunnerStatus {
    Online,
    Offline,
}

/// A runner label.
#[derive(Debug, Clone, Deserialize)]
pub struct RunnerLabel {
    /// Label ID.
    pub id: Option<u64>,
    /// Label name.
    pub name: String,
    /// Label type.
    #[serde(rename = "type")]
    pub label_type: Option<String>,
}

/// Runner registration or removal token.
#[derive(Debug, Clone, Deserialize)]
pub struct RunnerToken {
    /// Token value.
    pub token: String,
    /// Expires at.
    pub expires_at: String,
}
