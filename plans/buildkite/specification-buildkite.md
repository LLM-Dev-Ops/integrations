# Buildkite Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/buildkite`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to trigger, observe, and coordinate Buildkite pipelines for CI/CD automation, including build creation, job monitoring, artifact awareness, and pipeline coordination.

### 1.2 Scope

**In Scope:**
- Organization and pipeline listing
- Build creation and triggering
- Build status monitoring
- Job and step-level observability
- Build log retrieval
- Artifact listing and metadata
- Annotation management
- Build metadata operations
- Environment variable management (non-secret)
- Webhooks for build events
- Cluster and queue awareness
- Simulation and replay

**Out of Scope:**
- Agent provisioning and management
- Pipeline YAML authoring/editing
- Cluster administration
- SSO/SAML configuration
- Billing and usage management
- Secrets management (use Buildkite Secrets)
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| API token authentication | `buildkite/auth` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Vector embeddings | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 OrganizationService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_organizations` | GET | List accessible organizations |
| `get_organization` | GET | Get organization by slug |

### 2.2 PipelineService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_pipelines` | GET | List pipelines in organization |
| `get_pipeline` | GET | Get pipeline by slug |
| `get_pipeline_builds` | GET | Get builds for pipeline |

### 2.3 BuildService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_builds` | GET | List builds with filters |
| `get_build` | GET | Get build by number |
| `create_build` | POST | Create/trigger new build |
| `cancel_build` | PUT | Cancel running build |
| `rebuild` | POST | Rebuild existing build |
| `get_build_by_id` | GET | Get build by UUID |

### 2.4 JobService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_jobs` | GET | List jobs in a build |
| `get_job` | GET | Get specific job |
| `retry_job` | PUT | Retry failed job |
| `unblock_job` | PUT | Unblock blocked job |
| `get_job_log` | GET | Get job log output |
| `get_job_env` | GET | Get job environment variables |

### 2.5 ArtifactService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_artifacts` | GET | List build artifacts |
| `get_artifact` | GET | Get artifact metadata |
| `download_artifact` | GET | Download artifact content |
| `list_job_artifacts` | GET | List artifacts for specific job |

### 2.6 AnnotationService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_annotations` | GET | List build annotations |
| `create_annotation` | POST | Create annotation |
| `delete_annotation` | DELETE | Delete annotation |

### 2.7 MetadataService

| Operation | Method | Description |
|-----------|--------|-------------|
| `get_metadata` | GET | Get build metadata |
| `set_metadata` | POST | Set metadata key-value |
| `list_metadata_keys` | GET | List all metadata keys |

### 2.8 ClusterService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_clusters` | GET | List organization clusters |
| `get_cluster` | GET | Get cluster details |
| `list_queues` | GET | List queues in cluster |

### 2.9 WebhookService

| Operation | Method | Description |
|-----------|--------|-------------|
| `process_event` | - | Handle webhook event |
| `validate_signature` | - | Validate webhook token |

### 2.10 AgentService (Read-Only)

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_agents` | GET | List connected agents |
| `get_agent` | GET | Get agent details |
| `get_agent_metrics` | GET | Get agent metrics |

---

## 3. Core Types

### 3.1 Organization Types

```
Organization:
  id: String
  graphql_id: String
  slug: String
  name: String
  url: String
  web_url: String
  pipelines_url: String
  agents_url: String
  created_at: DateTime
```

### 3.2 Pipeline Types

```
Pipeline:
  id: String
  graphql_id: String
  slug: String
  name: String
  description: Option<String>
  repository: String
  branch_configuration: Option<String>
  default_branch: String
  visibility: PipelineVisibility
  steps: Vec<PipelineStep>
  provider: ProviderSettings
  builds_url: String
  web_url: String
  created_at: DateTime
  scheduled_builds_count: i32
  running_builds_count: i32
  scheduled_jobs_count: i32
  running_jobs_count: i32
  waiting_jobs_count: i32

PipelineVisibility:
  | Private
  | Public

PipelineStep:
  type: StepType
  name: Option<String>
  command: Option<String>
  label: Option<String>

StepType:
  | Script
  | Waiter
  | Block
  | Trigger
  | Input
```

### 3.3 Build Types

```
Build:
  id: String
  graphql_id: String
  number: i32
  state: BuildState
  blocked: bool
  message: String
  commit: String
  branch: String
  tag: Option<String>
  source: BuildSource
  author: Author
  creator: Creator
  env: Map<String, String>
  web_url: String
  jobs: Vec<Job>
  created_at: DateTime
  scheduled_at: Option<DateTime>
  started_at: Option<DateTime>
  finished_at: Option<DateTime>
  meta_data: Map<String, String>
  pull_request: Option<PullRequest>
  pipeline: PipelineRef
  rebuilt_from: Option<BuildRef>

BuildState:
  | Scheduled
  | Running
  | Passed
  | Failed
  | Blocked
  | Canceled
  | Canceling
  | Skipped
  | NotRun
  | Waiting

BuildSource:
  | Webhook
  | Api
  | Ui
  | Trigger
  | Schedule

Author:
  name: String
  email: String

Creator:
  id: String
  name: String
  email: String
  avatar_url: String
  created_at: DateTime

CreateBuildRequest:
  commit: String
  branch: String
  message: Option<String>
  author: Option<Author>
  env: Option<Map<String, String>>
  meta_data: Option<Map<String, String>>
  ignore_pipeline_branch_filters: Option<bool>
  clean_checkout: Option<bool>
```

### 3.4 Job Types

```
Job:
  id: String
  graphql_id: String
  type: JobType
  name: Option<String>
  label: Option<String>
  step_key: Option<String>
  state: JobState
  web_url: String
  log_url: Option<String>
  raw_log_url: Option<String>
  command: Option<String>
  exit_status: Option<i32>
  artifact_paths: Option<String>
  agent: Option<AgentRef>
  created_at: DateTime
  scheduled_at: Option<DateTime>
  runnable_at: Option<DateTime>
  started_at: Option<DateTime>
  finished_at: Option<DateTime>
  retried: bool
  retried_in_job_id: Option<String>
  retries_count: i32
  parallel_group_index: Option<i32>
  parallel_group_total: Option<i32>
  soft_failed: bool
  unblocked_by: Option<Creator>
  unblocked_at: Option<DateTime>
  unblock_url: Option<String>

JobType:
  | Script
  | Waiter
  | Block
  | Trigger
  | Manual

JobState:
  | Pending
  | Waiting
  | WaitingFailed
  | Blocked
  | Unblocked
  | Limiting
  | Limited
  | Scheduled
  | Assigned
  | Accepted
  | Running
  | Passed
  | Failed
  | Canceling
  | Canceled
  | TimedOut
  | Skipped
  | BrokenSoft
  | Expired

UnblockRequest:
  unblocker: Option<Creator>
  fields: Map<String, String>  // Block step input fields
```

### 3.5 Artifact Types

```
Artifact:
  id: String
  job_id: String
  path: String
  state: ArtifactState
  sha1sum: String
  file_size: u64
  glob_path: String
  original_path: String
  download_url: String

ArtifactState:
  | New
  | Error
  | Finished
  | Deleted
```

### 3.6 Annotation Types

```
Annotation:
  id: String
  context: String
  style: AnnotationStyle
  body_html: String
  created_at: DateTime
  updated_at: DateTime

AnnotationStyle:
  | Success
  | Info
  | Warning
  | Error

CreateAnnotationRequest:
  context: String
  style: AnnotationStyle
  body: String  // Markdown content
  append: Option<bool>
```

### 3.7 Cluster Types

```
Cluster:
  id: String
  graphql_id: String
  name: String
  description: Option<String>
  emoji: Option<String>
  color: Option<String>
  default_queue_id: Option<String>
  created_at: DateTime
  created_by: Creator

Queue:
  id: String
  graphql_id: String
  key: String
  description: Option<String>
  cluster_id: String
  created_at: DateTime
```

### 3.8 Agent Types

```
Agent:
  id: String
  graphql_id: String
  name: String
  connection_state: ConnectionState
  hostname: String
  ip_address: String
  user_agent: String
  version: String
  creator: Option<Creator>
  created_at: DateTime
  last_job_finished_at: Option<DateTime>
  priority: i32
  meta_data: Vec<String>
  job: Option<JobRef>

ConnectionState:
  | Connected
  | Disconnected
  | Lost
  | NeverConnected
  | Stopped
  | Stopping
```

### 3.9 Webhook Types

```
BuildkiteWebhookEvent:
  | BuildScheduled
  | BuildRunning
  | BuildFinished
  | BuildCanceled
  | JobScheduled
  | JobStarted
  | JobFinished
  | JobActivated
  | AgentConnected
  | AgentDisconnected
  | AgentStopped
  | AgentLost

WebhookPayload:
  event: BuildkiteWebhookEvent
  build: Option<Build>
  job: Option<Job>
  agent: Option<Agent>
  pipeline: PipelineRef
  sender: Creator
```

---

## 4. Configuration

```
BuildkiteConfig:
  # Authentication
  auth: AuthConfig
  organization_slug: String

  # API settings
  api_base_url: Option<String>  # Default: https://api.buildkite.com/v2
  graphql_url: Option<String>   # Default: https://graphql.buildkite.com/v1

  # Resilience
  max_retries: u32              # Default: 3
  request_timeout_ms: u64       # Default: 30000

  # Rate limiting
  requests_per_second: f64      # Default: 10

  # Log streaming
  log_poll_interval_ms: u64     # Default: 5000
  log_max_poll_attempts: u32    # Default: 360

AuthConfig:
  | ApiToken { token: SecretString }
  | AccessToken { token: SecretString }  # For GraphQL
```

---

## 5. Error Taxonomy

| Error Type | HTTP Status | Retryable | Description |
|------------|-------------|-----------|-------------|
| `OrganizationNotFound` | 404 | No | Organization does not exist |
| `PipelineNotFound` | 404 | No | Pipeline not found |
| `BuildNotFound` | 404 | No | Build not found |
| `JobNotFound` | 404 | No | Job not found |
| `ArtifactNotFound` | 404 | No | Artifact not found |
| `AccessDenied` | 403 | No | Insufficient permissions |
| `Unauthorized` | 401 | No | Invalid authentication |
| `RateLimited` | 429 | Yes | API rate limit exceeded |
| `BuildAlreadyFinished` | 422 | No | Cannot modify finished build |
| `JobNotBlockable` | 422 | No | Job is not a block step |
| `InvalidBuildRequest` | 400 | No | Invalid build parameters |
| `ServiceUnavailable` | 503 | Yes | Buildkite unavailable |

---

## 6. Rate Limits and Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| REST API requests | 200/min | Per token |
| GraphQL API | 200 points/min | Per token |
| Webhook delivery | Unlimited | Per org |
| Build creation | No limit | Per pipeline |
| Artifact retention | 6 months | Default |
| Log retention | 6 months | Default |

---

## 7. Security Requirements

### 7.1 Credential Protection
- API tokens stored via `SecretString`
- Token scopes validated before operations
- Webhook tokens validated with timing-safe comparison
- No token logging

### 7.2 Access Scoping
- Required API token scopes:
  - `read_builds` - View builds
  - `write_builds` - Create/cancel builds
  - `read_pipelines` - View pipelines
  - `read_artifacts` - Download artifacts
  - `read_agents` - View agent status
- Support for read-only mode
- Per-organization access validation

### 7.3 Log Security
- Build IDs and job IDs in logs (not secrets)
- Environment values not logged
- Artifact contents not logged
- Webhook payloads logged without sensitive fields

---

## 8. Simulation Requirements

### 8.1 MockBuildkiteClient
- Simulate all API operations
- Configurable build/job states
- Inject errors for testing
- Track operation history

### 8.2 Pipeline Replay
- Record build triggers and results
- Replay for regression testing
- Capture job sequences and timing

### 8.3 Local Execution Model
- In-memory build state machine
- Simulate job progression
- Mock artifact storage

---

## 9. Integration Points

### 9.1 Shared Modules

```
buildkite/auth:
  - get_api_token() -> SecretString
  - validate_webhook_token(payload, token) -> bool

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per organization
  - RateLimiter (200 req/min)

shared/observability:
  - Metrics: buildkite.builds, buildkite.jobs, buildkite.latency
  - Traces: span per operation
  - Logs: structured, secret-redacted

shared/vector-memory:
  - store_build_embedding(build_id, content)
  - search_similar_builds(query)
```

### 9.2 Related Integrations

```
github/repositories:
  - Webhook sources
  - Commit information
  - PR context

slack:
  - Build notifications
  - Block step approvals
```

---

## 10. API Version and Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Buildkite REST API | v2 | Primary |
| Buildkite GraphQL API | v1 | For complex queries |
| Webhook payload | v2 | Current format |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-buildkite.md | Complete |
| 2. Pseudocode | pseudocode-buildkite.md | Pending |
| 3. Architecture | architecture-buildkite.md | Pending |
| 4. Refinement | refinement-buildkite.md | Pending |
| 5. Completion | completion-buildkite.md | Pending |

---

*Phase 1: Specification - Complete*
