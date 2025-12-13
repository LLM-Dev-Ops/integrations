# GitLab Pipelines Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gitlab-pipelines`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements for the GitLab Pipelines Integration Module, providing a production-ready interface for triggering, monitoring, and coordinating GitLab CI/CD pipelines within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The GitLab Pipelines Integration Module provides a **thin adapter layer** that:
- Triggers pipelines with variables and refs
- Monitors pipeline, stage, and job status
- Retrieves job logs and artifacts
- Cancels and retries pipelines/jobs
- Processes webhook events for real-time updates
- Tracks pipeline metrics and durations
- Supports multi-project pipeline coordination
- Enables simulation/replay of pipeline executions

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Pipeline Triggers** | Create pipelines with variables, refs, sources |
| **Status Tracking** | Monitor pipeline/job/stage states |
| **Job Management** | Retry, cancel, play manual jobs |
| **Log Retrieval** | Stream and fetch job logs |
| **Artifact Access** | Download job artifacts |
| **Webhook Processing** | Handle pipeline/job events |
| **Multi-Project** | Coordinate downstream pipelines |
| **Permission Scoping** | Validate token scopes |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Pipeline CRUD | Create, read, cancel, retry |
| Job operations | Get status, logs, retry, cancel, play |
| Stage tracking | List stages, stage jobs |
| Artifact download | Job artifacts, artifact browsing |
| Variables | Pipeline variables, CI/CD variables |
| Webhooks | Pipeline, job, deployment events |
| Environments | Environment status, deployments |
| Triggers | Pipeline triggers, trigger tokens |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Runner management | Infrastructure provisioning |
| Pipeline YAML editing | Repository management |
| Project creation | GitLab administration |
| User management | Identity management |
| Merge request pipelines | MR module responsibility |
| Container registry | Separate integration |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first | I/O-bound operations |
| No panics | Reliability |
| Trait-based | Testability |
| Personal/Project/Group tokens | GitLab auth standard |
| Pagination handling | Large result sets |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | GitLab tokens |
| `shared/resilience` | Retry, circuit breaker |
| `shared/observability` | Logging, metrics, tracing |
| `shared/http` | HTTP transport |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `reqwest` | HTTP client |
| `serde` / `serde_json` | Serialization |
| `async-trait` | Async trait support |
| `thiserror` | Error derivation |
| `chrono` | Timestamps, durations |
| `tokio-tungstenite` | WebSocket for log streaming |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `gitlab-rs` | This module IS the integration |
| Full GitLab SDK | Use internal implementations |

---

## 4. API Coverage

### 4.1 GitLab REST API Endpoints

**Base URL:** `https://gitlab.com/api/v4` (or self-hosted)

#### Pipeline Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List pipelines | GET | `/projects/{id}/pipelines` |
| Get pipeline | GET | `/projects/{id}/pipelines/{pipeline_id}` |
| Create pipeline | POST | `/projects/{id}/pipeline` |
| Cancel pipeline | POST | `/projects/{id}/pipelines/{pipeline_id}/cancel` |
| Retry pipeline | POST | `/projects/{id}/pipelines/{pipeline_id}/retry` |
| Delete pipeline | DELETE | `/projects/{id}/pipelines/{pipeline_id}` |
| Get variables | GET | `/projects/{id}/pipelines/{pipeline_id}/variables` |

#### Job Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List jobs | GET | `/projects/{id}/pipelines/{pipeline_id}/jobs` |
| Get job | GET | `/projects/{id}/jobs/{job_id}` |
| Get job log | GET | `/projects/{id}/jobs/{job_id}/trace` |
| Retry job | POST | `/projects/{id}/jobs/{job_id}/retry` |
| Cancel job | POST | `/projects/{id}/jobs/{job_id}/cancel` |
| Play job | POST | `/projects/{id}/jobs/{job_id}/play` |
| Erase job | POST | `/projects/{id}/jobs/{job_id}/erase` |

#### Artifact Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Get artifacts | GET | `/projects/{id}/jobs/{job_id}/artifacts` |
| Download artifact | GET | `/projects/{id}/jobs/{job_id}/artifacts/{artifact_path}` |
| Browse artifacts | GET | `/projects/{id}/jobs/{job_id}/artifacts/browse` |

#### Trigger Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Trigger pipeline | POST | `/projects/{id}/trigger/pipeline` |
| List triggers | GET | `/projects/{id}/triggers` |
| Get trigger | GET | `/projects/{id}/triggers/{trigger_id}` |

#### Environment Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List environments | GET | `/projects/{id}/environments` |
| Get environment | GET | `/projects/{id}/environments/{env_id}` |
| Stop environment | POST | `/projects/{id}/environments/{env_id}/stop` |

### 4.2 Pipeline Response Structure

```json
{
  "id": 123456,
  "iid": 42,
  "project_id": 789,
  "sha": "abc123def456",
  "ref": "main",
  "status": "success",
  "source": "push",
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:05:00Z",
  "started_at": "2025-01-01T00:00:05Z",
  "finished_at": "2025-01-01T00:05:00Z",
  "duration": 295,
  "queued_duration": 5,
  "web_url": "https://gitlab.com/org/repo/-/pipelines/123456",
  "user": { "id": 1, "username": "user" }
}
```

### 4.3 Job Response Structure

```json
{
  "id": 987654,
  "name": "build",
  "stage": "build",
  "status": "success",
  "ref": "main",
  "created_at": "2025-01-01T00:00:00Z",
  "started_at": "2025-01-01T00:00:10Z",
  "finished_at": "2025-01-01T00:02:00Z",
  "duration": 110.5,
  "queued_duration": 10.2,
  "allow_failure": false,
  "pipeline": { "id": 123456 },
  "artifacts": [{ "filename": "build.zip", "size": 1024 }],
  "runner": { "id": 1, "description": "shared-runner" },
  "web_url": "https://gitlab.com/org/repo/-/jobs/987654"
}
```

### 4.4 Webhook Event Structure

```json
{
  "object_kind": "pipeline",
  "object_attributes": {
    "id": 123456,
    "ref": "main",
    "status": "success",
    "stages": ["build", "test", "deploy"],
    "created_at": "2025-01-01T00:00:00Z",
    "finished_at": "2025-01-01T00:05:00Z",
    "duration": 300
  },
  "project": { "id": 789, "path_with_namespace": "org/repo" },
  "builds": [{ "id": 987654, "name": "build", "status": "success" }]
}
```

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
GitLabPipelinesError
├── ConfigurationError
│   ├── InvalidBaseUrl
│   ├── InvalidProjectId
│   └── InvalidCredentials
│
├── AuthenticationError
│   ├── TokenExpired
│   ├── InvalidToken
│   ├── InsufficientScopes
│   └── TokenRevoked
│
├── AccessError
│   ├── ProjectNotFound
│   ├── PipelineNotFound
│   ├── JobNotFound
│   ├── PermissionDenied
│   └── ArtifactNotFound
│
├── PipelineError
│   ├── InvalidRef
│   ├── InvalidVariable
│   ├── PipelineCreationFailed
│   ├── CannotCancel
│   └── CannotRetry
│
├── JobError
│   ├── JobNotPlayable
│   ├── JobNotCancellable
│   ├── JobNotRetryable
│   └── LogsNotAvailable
│
├── RateLimitError
│   ├── ThrottledRequest
│   └── TooManyRequests
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   └── DnsResolutionFailed
│
└── ServerError
    ├── InternalError
    └── ServiceUnavailable
```

### 5.2 HTTP Status Mapping

| Status | Error Type | Retryable |
|--------|------------|-----------|
| 400 | `PipelineError` / `JobError` | No |
| 401 | `AuthenticationError` | Yes (refresh) |
| 403 | `AccessError::PermissionDenied` | No |
| 404 | `AccessError::*NotFound` | No |
| 409 | `PipelineError::CannotCancel` | No |
| 429 | `RateLimitError` | Yes |
| 500 | `ServerError::InternalError` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |

---

## 6. Resilience Requirements

### 6.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `RateLimitError` (429) | Yes | 5 | Respect RateLimit-Reset |
| `ServiceUnavailable` (503) | Yes | 3 | Exponential (2s base) |
| `InternalError` (500) | Yes | 3 | Exponential (1s base) |
| `Timeout` | Yes | 3 | Fixed (1s) |
| `TokenExpired` | Yes | 1 | Immediate (refresh) |

### 6.2 Rate Limiting (Client-Side)

| Limit Type | Default | Notes |
|------------|---------|-------|
| Requests per minute | 600 | GitLab.com default |
| Requests per second | 10 | Per token |
| Log streaming | 1 connection | Per job |

### 6.3 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |

---

## 7. Observability Requirements

### 7.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `gitlab.pipeline.create` | `project_id`, `ref`, `source` |
| `gitlab.pipeline.get` | `project_id`, `pipeline_id` |
| `gitlab.pipeline.cancel` | `project_id`, `pipeline_id` |
| `gitlab.job.get` | `project_id`, `job_id` |
| `gitlab.job.log` | `project_id`, `job_id`, `bytes` |
| `gitlab.artifact.download` | `project_id`, `job_id`, `size` |
| `gitlab.webhook.receive` | `event_type`, `project_id` |

### 7.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `gitlab_pipelines_triggered_total` | Counter | `project`, `ref`, `source` |
| `gitlab_pipelines_completed_total` | Counter | `project`, `status` |
| `gitlab_pipeline_duration_seconds` | Histogram | `project`, `status` |
| `gitlab_jobs_total` | Counter | `project`, `stage`, `status` |
| `gitlab_job_duration_seconds` | Histogram | `project`, `stage` |
| `gitlab_artifacts_downloaded_bytes` | Counter | `project` |
| `gitlab_webhook_events_total` | Counter | `event_type` |
| `gitlab_errors_total` | Counter | `error_type` |
| `gitlab_rate_limit_remaining` | Gauge | - |

### 7.3 Logging

| Level | When |
|-------|------|
| ERROR | Pipeline failures, auth errors |
| WARN | Rate limiting, retries, job failures |
| INFO | Pipelines triggered/completed, jobs started |
| DEBUG | Request/response details |
| TRACE | Full payloads, log content |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Token never logged | `SecretString` wrapper |
| Trigger tokens protected | Separate secret store |
| Webhook secrets secured | HMAC validation |

### 8.2 Token Types

| Token Type | Scope | Use Case |
|------------|-------|----------|
| Personal Access Token | `api`, `read_api` | Full access |
| Project Access Token | `api` | Project-scoped |
| Group Access Token | `api` | Group-scoped |
| CI Job Token | Limited | Within pipelines |
| Trigger Token | Pipeline trigger only | Automation |

### 8.3 Required Scopes

| Operation | Minimum Scope |
|-----------|---------------|
| Read pipelines | `read_api` |
| Trigger pipelines | `api` |
| Cancel/retry | `api` |
| Download artifacts | `read_api` |
| Job logs | `read_api` |

### 8.4 Webhook Security

| Requirement | Implementation |
|-------------|----------------|
| Token validation | `X-Gitlab-Token` header |
| Source IP validation | GitLab IP ranges (optional) |
| Event filtering | Webhook settings |

---

## 9. Performance Requirements

### 9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Get pipeline | < 100ms | < 400ms |
| Trigger pipeline | < 200ms | < 800ms |
| List jobs | < 150ms | < 500ms |
| Get job log (1MB) | < 500ms | < 2s |
| Download artifact (10MB) | < 2s | < 5s |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Operations per second | 10+ |
| Concurrent pipelines monitored | 100+ |
| Webhook events per second | 50+ |

---

## 10. Enterprise Features

### 10.1 Pipeline Coordination

| Feature | Description |
|---------|-------------|
| Multi-project triggers | Trigger downstream pipelines |
| Parent-child pipelines | Track child pipeline status |
| Pipeline dependencies | Wait for upstream completion |
| Variable passing | Pass variables between pipelines |

### 10.2 Status Polling

| Feature | Description |
|---------|-------------|
| Polling intervals | Configurable backoff |
| Status callbacks | Notify on state changes |
| Timeout handling | Max wait duration |
| Concurrent polling | Multiple pipelines |

### 10.3 Log Streaming

| Feature | Description |
|---------|-------------|
| Real-time streaming | WebSocket or polling |
| Log pagination | Handle large logs |
| ANSI parsing | Color code handling |
| Log search | Pattern matching in logs |

### 10.4 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | Simulate pipeline operations |
| Record mode | Capture API interactions |
| Replay mode | Deterministic testing |
| Status simulation | Simulate pipeline progression |

---

## 11. Acceptance Criteria

### 11.1 Functional

- [ ] Pipeline: Trigger with ref and variables
- [ ] Pipeline: Get status by ID
- [ ] Pipeline: List with filters
- [ ] Pipeline: Cancel running pipeline
- [ ] Pipeline: Retry failed pipeline
- [ ] Pipeline: Delete pipeline
- [ ] Job: List jobs in pipeline
- [ ] Job: Get job details
- [ ] Job: Get job log
- [ ] Job: Retry failed job
- [ ] Job: Cancel running job
- [ ] Job: Play manual job
- [ ] Artifact: Download job artifacts
- [ ] Artifact: Browse artifact contents
- [ ] Trigger: Use trigger token
- [ ] Webhook: Validate and parse events
- [ ] Webhook: Handle pipeline events
- [ ] Webhook: Handle job events
- [ ] Environment: List environments
- [ ] Environment: Stop environment

### 11.2 Non-Functional

- [ ] No panics
- [ ] Tokens protected
- [ ] Retry works correctly
- [ ] Circuit breaker functions
- [ ] Project IDs redacted in logs
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Core algorithms for pipeline triggers, status polling, log streaming, and webhook processing.
