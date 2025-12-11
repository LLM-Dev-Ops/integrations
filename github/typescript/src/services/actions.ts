/**
 * GitHub Actions Service
 * Provides access to GitHub Actions workflows, runs, jobs, artifacts, secrets, and variables
 */

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

export interface ResilienceOrchestrator {
  request<T>(options: RequestConfig): Promise<T>;
}

export interface RequestConfig {
  method: string;
  path: string;
  timeout?: number;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

// Workflow types
export interface Workflow {
  id: number;
  node_id: string;
  name: string;
  path: string;
  state: 'active' | 'deleted' | 'disabled_fork' | 'disabled_inactivity' | 'disabled_manually';
  created_at: string;
  updated_at: string;
  url: string;
  html_url: string;
  badge_url: string;
}

export interface WorkflowList {
  total_count: number;
  workflows: Workflow[];
}

export interface WorkflowDispatchRequest {
  ref: string;
  inputs?: Record<string, string>;
}

// Workflow Run types
export interface WorkflowRun {
  id: number;
  name?: string;
  node_id: string;
  head_branch?: string;
  head_sha: string;
  run_number: number;
  run_attempt?: number;
  event: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'neutral' | 'stale' | 'startup_failure';
  workflow_id: number;
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  jobs_url: string;
  logs_url: string;
  artifacts_url: string;
  cancel_url: string;
  rerun_url: string;
}

export interface WorkflowRunList {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

export interface ListWorkflowRunsParams {
  actor?: string;
  branch?: string;
  event?: string;
  status?: string;
  created?: string;
  exclude_pull_requests?: boolean;
  per_page?: number;
  page?: number;
}

// Job types
export interface Job {
  id: number;
  run_id: number;
  run_url: string;
  node_id: string;
  head_sha: string;
  url: string;
  html_url: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'neutral';
  started_at: string;
  completed_at?: string;
  name: string;
  steps?: JobStep[];
  check_run_url: string;
  labels: string[];
  runner_id?: number;
  runner_name?: string;
  runner_group_id?: number;
  runner_group_name?: string;
}

export interface JobStep {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: string;
  number: number;
  started_at?: string;
  completed_at?: string;
}

export interface JobList {
  total_count: number;
  jobs: Job[];
}

// Artifact types
export interface Artifact {
  id: number;
  node_id: string;
  name: string;
  size_in_bytes: number;
  url: string;
  archive_download_url: string;
  expired: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface ArtifactList {
  total_count: number;
  artifacts: Artifact[];
}

export interface ListArtifactsParams {
  per_page?: number;
  page?: number;
}

// Secret types
export interface PublicKey {
  key_id: string;
  key: string;
}

export interface Secret {
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SecretList {
  total_count: number;
  secrets: Secret[];
}

// Variable types
export interface Variable {
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface VariableList {
  total_count: number;
  variables: Variable[];
}

export interface CreateVariableRequest {
  name: string;
  value: string;
}

export interface UpdateVariableRequest {
  name?: string;
  value?: string;
}

/**
 * Actions Service
 */
export class ActionsService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  // Workflow methods
  async listWorkflows(owner: string, repo: string, options?: RequestOptions): Promise<WorkflowList> {
    return this.orchestrator.request<WorkflowList>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows`,
      ...options,
    });
  }

  async getWorkflow(
    owner: string,
    repo: string,
    workflowId: number | string,
    options?: RequestOptions
  ): Promise<Workflow> {
    return this.orchestrator.request<Workflow>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowId.toString())}`,
      ...options,
    });
  }

  async dispatchWorkflow(
    owner: string,
    repo: string,
    workflowId: number | string,
    request: WorkflowDispatchRequest,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'POST',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowId.toString())}/dispatches`,
      body: request,
      ...options,
    });
  }

  async enableWorkflow(
    owner: string,
    repo: string,
    workflowId: number | string,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'PUT',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowId.toString())}/enable`,
      ...options,
    });
  }

  async disableWorkflow(
    owner: string,
    repo: string,
    workflowId: number | string,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'PUT',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowId.toString())}/disable`,
      ...options,
    });
  }

  // Workflow Run methods
  async listWorkflowRuns(
    owner: string,
    repo: string,
    params?: ListWorkflowRunsParams,
    options?: RequestOptions
  ): Promise<WorkflowRunList> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.actor) query.actor = params.actor;
      if (params.branch) query.branch = params.branch;
      if (params.event) query.event = params.event;
      if (params.status) query.status = params.status;
      if (params.created) query.created = params.created;
      if (params.exclude_pull_requests !== undefined) query.exclude_pull_requests = params.exclude_pull_requests.toString();
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    return this.orchestrator.request<WorkflowRunList>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs`,
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async getWorkflowRun(
    owner: string,
    repo: string,
    runId: number,
    options?: RequestOptions
  ): Promise<WorkflowRun> {
    return this.orchestrator.request<WorkflowRun>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}`,
      ...options,
    });
  }

  async rerunWorkflow(
    owner: string,
    repo: string,
    runId: number,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'POST',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/rerun`,
      ...options,
    });
  }

  async cancelWorkflowRun(
    owner: string,
    repo: string,
    runId: number,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'POST',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/cancel`,
      ...options,
    });
  }

  async downloadWorkflowRunLogs(
    owner: string,
    repo: string,
    runId: number,
    options?: RequestOptions
  ): Promise<ArrayBuffer> {
    return this.orchestrator.request<ArrayBuffer>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/logs`,
      ...options,
    });
  }

  // Job methods
  async listJobs(
    owner: string,
    repo: string,
    runId: number,
    options?: RequestOptions
  ): Promise<JobList> {
    return this.orchestrator.request<JobList>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/jobs`,
      ...options,
    });
  }

  async getJob(
    owner: string,
    repo: string,
    jobId: number,
    options?: RequestOptions
  ): Promise<Job> {
    return this.orchestrator.request<Job>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/jobs/${jobId}`,
      ...options,
    });
  }

  async downloadJobLogs(
    owner: string,
    repo: string,
    jobId: number,
    options?: RequestOptions
  ): Promise<string> {
    return this.orchestrator.request<string>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/jobs/${jobId}/logs`,
      ...options,
    });
  }

  // Artifact methods
  async listArtifacts(
    owner: string,
    repo: string,
    params?: ListArtifactsParams,
    options?: RequestOptions
  ): Promise<ArtifactList> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    return this.orchestrator.request<ArtifactList>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts`,
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async getArtifact(
    owner: string,
    repo: string,
    artifactId: number,
    options?: RequestOptions
  ): Promise<Artifact> {
    return this.orchestrator.request<Artifact>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts/${artifactId}`,
      ...options,
    });
  }

  async deleteArtifact(
    owner: string,
    repo: string,
    artifactId: number,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts/${artifactId}`,
      ...options,
    });
  }

  async downloadArtifact(
    owner: string,
    repo: string,
    artifactId: number,
    options?: RequestOptions
  ): Promise<ArrayBuffer> {
    return this.orchestrator.request<ArrayBuffer>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts/${artifactId}/zip`,
      ...options,
    });
  }

  // Secret methods
  async listSecrets(owner: string, repo: string, options?: RequestOptions): Promise<SecretList> {
    return this.orchestrator.request<SecretList>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets`,
      ...options,
    });
  }

  async getSecret(
    owner: string,
    repo: string,
    secretName: string,
    options?: RequestOptions
  ): Promise<Secret> {
    return this.orchestrator.request<Secret>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets/${encodeURIComponent(secretName)}`,
      ...options,
    });
  }

  async createOrUpdateSecret(
    owner: string,
    repo: string,
    secretName: string,
    encryptedValue: string,
    keyId: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'PUT',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets/${encodeURIComponent(secretName)}`,
      body: {
        encrypted_value: encryptedValue,
        key_id: keyId,
      },
      ...options,
    });
  }

  async deleteSecret(
    owner: string,
    repo: string,
    secretName: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets/${encodeURIComponent(secretName)}`,
      ...options,
    });
  }

  async getPublicKey(owner: string, repo: string, options?: RequestOptions): Promise<PublicKey> {
    return this.orchestrator.request<PublicKey>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets/public-key`,
      ...options,
    });
  }

  // Variable methods
  async listVariables(owner: string, repo: string, options?: RequestOptions): Promise<VariableList> {
    return this.orchestrator.request<VariableList>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables`,
      ...options,
    });
  }

  async getVariable(
    owner: string,
    repo: string,
    variableName: string,
    options?: RequestOptions
  ): Promise<Variable> {
    return this.orchestrator.request<Variable>({
      method: 'GET',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables/${encodeURIComponent(variableName)}`,
      ...options,
    });
  }

  async createVariable(
    owner: string,
    repo: string,
    request: CreateVariableRequest,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'POST',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables`,
      body: request,
      ...options,
    });
  }

  async updateVariable(
    owner: string,
    repo: string,
    variableName: string,
    request: UpdateVariableRequest,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'PATCH',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables/${encodeURIComponent(variableName)}`,
      body: request,
      ...options,
    });
  }

  async deleteVariable(
    owner: string,
    repo: string,
    variableName: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables/${encodeURIComponent(variableName)}`,
      ...options,
    });
  }
}
