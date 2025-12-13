# GitHub Actions Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/github/actions`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to trigger, observe, and coordinate GitHub Actions workflows for CI/CD automation, including workflow dispatches, job monitoring, artifact management, and pipeline coordination.

### 1.2 Scope

**In Scope:**
- Workflow listing and inspection
- Workflow dispatch (manual triggers)
- Workflow run monitoring and status tracking
- Job and step-level observability
- Workflow run logs retrieval
- Artifact upload and download
- Environment and deployment tracking
- Secrets reference (existence check, not values)
- Variables management
- Webhooks for workflow events
- Reusable workflow coordination
- Simulation and replay

**Out of Scope:**
- Repository hosting and management
- Runner provisioning and management
- Workflow YAML authoring/editing
- GitHub App installation
- Organization/Enterprise administration
- Billing and usage quotas
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| GitHub App/PAT authentication | `github/auth` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Vector embeddings | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 WorkflowService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_workflows` | GET | List repository workflows |
| `get_workflow` | GET | Get workflow by ID or filename |
| `get_workflow_usage` | GET | Get workflow billing usage |
| `enable_workflow` | PUT | Enable a disabled workflow |
| `disable_workflow` | PUT | Disable a workflow |

### 2.2 WorkflowRunService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_runs` | GET | List workflow runs with filters |
| `get_run` | GET | Get specific workflow run |
| `dispatch` | POST | Trigger workflow_dispatch event |
| `rerun` | POST | Re-run entire workflow |
| `rerun_failed_jobs` | POST | Re-run only failed jobs |
| `cancel` | POST | Cancel in-progress run |
| `delete` | DELETE | Delete workflow run |
| `get_run_timing` | GET | Get run timing breakdown |
| `approve_pending` | POST | Approve pending deployment |

### 2.3 JobService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_jobs` | GET | List jobs for a workflow run |
| `get_job` | GET | Get specific job details |
| `get_job_logs` | GET | Download job logs |
| `list_steps` | GET | List steps within a job |

### 2.4 ArtifactService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_artifacts` | GET | List workflow run artifacts |
| `get_artifact` | GET | Get artifact metadata |
| `download_artifact` | GET | Download artifact content |
| `delete_artifact` | DELETE | Delete an artifact |
| `list_repo_artifacts` | GET | List all repository artifacts |

### 2.5 LogService

| Operation | Method | Description |
|-----------|--------|-------------|
| `get_run_logs` | GET | Download full run logs (zip) |
| `get_job_logs` | GET | Download specific job logs |
| `stream_logs` | GET | Stream live logs (polling) |
| `delete_run_logs` | DELETE | Delete run logs |

### 2.6 EnvironmentService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_environments` | GET | List repository environments |
| `get_environment` | GET | Get environment details |
| `list_deployments` | GET | List deployments for environment |
| `get_deployment_status` | GET | Get deployment protection status |

### 2.7 SecretService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_secrets` | GET | List repository secrets (names only) |
| `get_secret` | GET | Get secret metadata (not value) |
| `secret_exists` | GET | Check if secret exists |
| `list_org_secrets` | GET | List organization secrets available |

### 2.8 VariableService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_variables` | GET | List repository variables |
| `get_variable` | GET | Get variable value |
| `create_variable` | POST | Create new variable |
| `update_variable` | PATCH | Update variable value |
| `delete_variable` | DELETE | Delete variable |

### 2.9 WebhookService

| Operation | Method | Description |
|-----------|--------|-------------|
| `process_event` | - | Handle workflow webhook event |
| `validate_signature` | - | Validate webhook signature |

### 2.10 CacheService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_caches` | GET | List repository action caches |
| `get_cache` | GET | Get cache entry details |
| `delete_cache` | DELETE | Delete cache entry |
| `get_cache_usage` | GET | Get cache storage usage |

---

## 3. Core Types

### 3.1 Workflow Types

```
Workflow:
  id: i64
  node_id: String
  name: String
  path: String
  state: WorkflowState
  created_at: DateTime
  updated_at: DateTime
  url: String
  html_url: String
  badge_url: String

WorkflowState:
  | Active
  | Deleted
  | DisabledFork
  | DisabledInactivity
  | DisabledManually
```

### 3.2 Workflow Run Types

```
WorkflowRun:
  id: i64
  name: String
  node_id: String
  head_branch: String
  head_sha: String
  run_number: i32
  run_attempt: i32
  event: TriggerEvent
  status: RunStatus
  conclusion: Option<RunConclusion>
  workflow_id: i64
  created_at: DateTime
  updated_at: DateTime
  actor: Actor
  triggering_actor: Actor
  run_started_at: DateTime
  jobs_url: String
  logs_url: String
  artifacts_url: String

RunStatus:
  | Queued
  | InProgress
  | Completed
  | Waiting
  | Requested
  | Pending

RunConclusion:
  | Success
  | Failure
  | Cancelled
  | Skipped
  | TimedOut
  | ActionRequired
  | Neutral
  | Stale

TriggerEvent:
  | Push
  | PullRequest
  | PullRequestTarget
  | WorkflowDispatch
  | Schedule
  | RepositoryDispatch
  | Release
  | WorkflowCall
  | WorkflowRun
  | Custom(String)

DispatchRequest:
  ref: String
  inputs: Map<String, String>
```

### 3.3 Job Types

```
Job:
  id: i64
  run_id: i64
  node_id: String
  name: String
  status: JobStatus
  conclusion: Option<JobConclusion>
  started_at: Option<DateTime>
  completed_at: Option<DateTime>
  steps: Vec<Step>
  runner_id: Option<i64>
  runner_name: Option<String>
  runner_group_id: Option<i64>
  runner_group_name: Option<String>

JobStatus:
  | Queued
  | InProgress
  | Completed
  | Waiting

JobConclusion:
  | Success
  | Failure
  | Cancelled
  | Skipped

Step:
  name: String
  number: i32
  status: StepStatus
  conclusion: Option<StepConclusion>
  started_at: Option<DateTime>
  completed_at: Option<DateTime>
```

### 3.4 Artifact Types

```
Artifact:
  id: i64
  node_id: String
  name: String
  size_in_bytes: u64
  archive_download_url: String
  expired: bool
  created_at: DateTime
  expires_at: DateTime
  updated_at: DateTime

ArtifactDownload:
  artifact: Artifact
  content: Bytes
```

### 3.5 Environment Types

```
Environment:
  id: i64
  node_id: String
  name: String
  url: String
  html_url: String
  created_at: DateTime
  updated_at: DateTime
  protection_rules: Vec<ProtectionRule>
  deployment_branch_policy: Option<BranchPolicy>

ProtectionRule:
  id: i64
  node_id: String
  type: ProtectionType
  wait_timer: Option<i32>
  reviewers: Vec<Reviewer>

ProtectionType:
  | RequiredReviewers
  | WaitTimer
  | BranchPolicy

Deployment:
  id: i64
  node_id: String
  sha: String
  ref: String
  task: String
  environment: String
  creator: Actor
  created_at: DateTime
  updated_at: DateTime
  statuses_url: String
```

### 3.6 Secret and Variable Types

```
Secret:
  name: String
  created_at: DateTime
  updated_at: DateTime
  visibility: SecretVisibility

SecretVisibility:
  | All
  | Private
  | Selected

Variable:
  name: String
  value: String
  created_at: DateTime
  updated_at: DateTime

VariableScope:
  | Repository
  | Environment(String)
  | Organization
```

### 3.7 Cache Types

```
ActionCache:
  id: i64
  ref: String
  key: String
  version: String
  size_in_bytes: u64
  created_at: DateTime
  last_accessed_at: DateTime

CacheUsage:
  full_name: String
  active_caches_size_in_bytes: u64
  active_caches_count: i32
```

### 3.8 Webhook Types

```
WorkflowWebhookEvent:
  | WorkflowRunRequested
  | WorkflowRunCompleted
  | WorkflowRunInProgress
  | WorkflowJobQueued
  | WorkflowJobInProgress
  | WorkflowJobCompleted
  | WorkflowJobWaiting
  | CheckRunCreated
  | CheckRunCompleted
  | DeploymentCreated
  | DeploymentStatusCreated

WorkflowWebhookPayload:
  action: String
  workflow: Option<Workflow>
  workflow_run: Option<WorkflowRun>
  workflow_job: Option<Job>
  repository: RepositoryRef
  sender: Actor
```

---

## 4. Configuration

```
GitHubActionsConfig:
  # Authentication
  auth: AuthConfig

  # Repository context
  owner: String
  repo: String

  # API settings
  api_version: String       # Default: "2022-11-28"
  base_url: Option<String>  # Default: api.github.com

  # Resilience
  max_retries: u32          # Default: 3
  request_timeout_ms: u64   # Default: 30000

  # Rate limiting
  requests_per_second: f64  # Default: 10

  # Log streaming
  log_poll_interval_ms: u64   # Default: 5000
  log_max_poll_attempts: u32  # Default: 360 (30 min)

AuthConfig:
  | GitHubApp { app_id: String, private_key: SecretString, installation_id: i64 }
  | PersonalAccessToken { token: SecretString }
  | OAuthToken { token: SecretString }
```

---

## 5. Error Taxonomy

| Error Type | HTTP Status | Retryable | Description |
|------------|-------------|-----------|-------------|
| `WorkflowNotFound` | 404 | No | Workflow does not exist |
| `RunNotFound` | 404 | No | Workflow run not found |
| `JobNotFound` | 404 | No | Job does not exist |
| `ArtifactNotFound` | 404 | No | Artifact not found |
| `ArtifactExpired` | 410 | No | Artifact has expired |
| `EnvironmentNotFound` | 404 | No | Environment not found |
| `AccessDenied` | 403 | No | Insufficient permissions |
| `Unauthorized` | 401 | No | Invalid authentication |
| `RateLimited` | 403/429 | Yes | API rate limit exceeded |
| `RunInProgress` | 409 | No | Cannot modify running workflow |
| `WorkflowDisabled` | 422 | No | Workflow is disabled |
| `InvalidInputs` | 422 | No | Invalid dispatch inputs |
| `SecondaryRateLimit` | 403 | Yes | Secondary rate limit |
| `ServiceUnavailable` | 503 | Yes | GitHub unavailable |

---

## 6. Rate Limits and Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| Primary rate limit | 5000/hour (App), 5000/hour (PAT) | Per auth |
| Secondary rate limit | 100 concurrent | Per endpoint |
| Workflow dispatch | 500/10 min | Per repo |
| Log download | 1000/hour | Per repo |
| Artifact retention | 90 days default | Per org setting |
| Artifact size | 500 MB (uncompressed) | Per artifact |
| Artifacts per run | Unlimited | Practical limit ~10GB |

---

## 7. Security Requirements

### 7.1 Credential Protection
- GitHub App private keys stored via `SecretString`
- PAT tokens encrypted at rest
- Token scopes validated before operations
- Webhook secrets validated with HMAC-SHA256

### 7.2 Access Scoping
- Required permissions for GitHub App:
  - `actions:read` - View workflows and runs
  - `actions:write` - Trigger and manage runs
  - `contents:read` - Access workflow files
- Support for read-only mode
- Per-repository access validation

### 7.3 Log Security
- Workflow run IDs and job IDs in logs (not secrets)
- Input values not logged (may contain secrets)
- Artifact contents not logged
- Webhook payloads logged without sensitive fields

---

## 8. Simulation Requirements

### 8.1 MockActionsClient
- Simulate all API operations
- Configurable workflow/run states
- Inject errors for testing
- Track operation history

### 8.2 Pipeline Replay
- Record workflow dispatch and results
- Replay for regression testing
- Capture job sequences and timing

### 8.3 Local Execution Model
- In-memory workflow run state machine
- Simulate job progression
- Mock artifact storage

---

## 9. Integration Points

### 9.1 Shared Modules

```
github/auth:
  - get_access_token() -> AccessToken
  - get_installation_token(installation_id) -> AccessToken
  - validate_webhook_signature(payload, signature) -> bool

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per repository
  - RateLimiter (adaptive based on headers)

shared/observability:
  - Metrics: actions.dispatches, actions.runs, actions.latency
  - Traces: span per operation
  - Logs: structured, secret-redacted

shared/vector-memory:
  - store_workflow_embedding(workflow_id, content)
  - search_similar_workflows(query)
```

### 9.2 Related Integrations

```
github/repositories:
  - Repository metadata
  - Branch protection
  - Commit references

github/pull-requests:
  - PR-triggered workflows
  - Status checks

github/issues:
  - Workflow-created issues
  - Error reporting
```

---

## 10. API Version and Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| GitHub REST API | 2022-11-28 | Primary |
| GitHub GraphQL API | - | Not used (REST sufficient) |
| Webhook payload | v2 | Current format |
| Artifact API | v4 | Zip download format |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-github-actions.md | Complete |
| 2. Pseudocode | pseudocode-github-actions.md | Pending |
| 3. Architecture | architecture-github-actions.md | Pending |
| 4. Refinement | refinement-github-actions.md | Pending |
| 5. Completion | completion-github-actions.md | Pending |

---

*Phase 1: Specification - Complete*
