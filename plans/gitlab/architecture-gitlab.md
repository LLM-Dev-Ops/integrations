# Architecture: GitLab Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/gitlab`

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Container Architecture](#2-container-architecture)
3. [Component Design](#3-component-design)
4. [Data Flow](#4-data-flow)
5. [Module Structure](#5-module-structure)
6. [Concurrency Model](#6-concurrency-model)
7. [Webhook Architecture](#7-webhook-architecture)
8. [Simulation Architecture](#8-simulation-architecture)
9. [Error Handling Strategy](#9-error-handling-strategy)
10. [Integration Patterns](#10-integration-patterns)

---

## 1. System Context

### 1.1 C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SYSTEM CONTEXT                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│    ┌──────────────┐         ┌──────────────────────────┐                │
│    │   LLM Dev    │         │   GitLab Instance        │                │
│    │   Ops Core   │         │   (SaaS or Self-hosted)  │                │
│    └──────┬───────┘         └────────────▲─────────────┘                │
│           │                              │                               │
│           │ Uses                         │ HTTPS/REST API v4             │
│           ▼                              │                               │
│    ┌──────────────────────────────────────────────────┐                 │
│    │           GitLab Integration Module              │                 │
│    │                                                  │                 │
│    │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │                 │
│    │  │   Client    │  │  Webhook    │  │  Shared  │ │                 │
│    │  │   Layer     │  │  Handler    │  │  Auth    │ │                 │
│    │  └─────────────┘  └─────────────┘  └──────────┘ │                 │
│    └──────────────────────────────────────────────────┘                 │
│           │                     ▲                                        │
│           │ Uses                │ Webhook Events                         │
│           ▼                     │                                        │
│    ┌──────────────────────────────────────────────────┐                 │
│    │              Shared Primitives                   │                 │
│    │  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐  │                 │
│    │  │  Auth  │ │Logging │ │Metrics │ │  Retry   │  │                 │
│    │  └────────┘ └────────┘ └────────┘ └──────────┘  │                 │
│    └──────────────────────────────────────────────────┘                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 External Dependencies

| System | Purpose | Protocol |
|--------|---------|----------|
| GitLab API | DevOps operations | HTTPS REST v4 |
| GitLab Webhooks | Event notifications | HTTPS POST |
| Shared Auth | Token management | Internal |
| Logging | Structured logging | Internal |
| Metrics | Observability | Internal |

---

## 2. Container Architecture

### 2.1 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GITLAB INTEGRATION                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         PUBLIC API                                  │ │
│  │  ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────┐ ┌────────┐ ┌───────┐ │ │
│  │  │ Repos  │ │  MRs   │ │Pipelines │ │ Jobs │ │ Issues │ │Webhook│ │ │
│  │  └───┬────┘ └───┬────┘ └────┬─────┘ └──┬───┘ └───┬────┘ └───┬───┘ │ │
│  └──────┼──────────┼───────────┼──────────┼─────────┼──────────┼─────┘ │
│         │          │           │          │         │          │       │
│         ▼          ▼           ▼          ▼         ▼          │       │
│  ┌────────────────────────────────────────────────────────┐    │       │
│  │                     GITLAB CLIENT                       │    │       │
│  │                                                         │    │       │
│  │   ┌──────────────┐    ┌──────────────┐                 │    │       │
│  │   │   Request    │───▶│     Rate     │                 │    │       │
│  │   │   Builder    │    │   Limiter    │                 │    │       │
│  │   └──────────────┘    └──────┬───────┘                 │    │       │
│  │                              │                          │    │       │
│  │                              ▼                          │    │       │
│  │   ┌──────────────┐    ┌──────────────┐                 │    │       │
│  │   │  Simulation  │◀───│     HTTP     │                 │    │       │
│  │   │    Layer     │    │   Executor   │                 │    │       │
│  │   └──────────────┘    └──────────────┘                 │    │       │
│  └────────────────────────────────────────────────────────┘    │       │
│                                                                 │       │
│  ┌────────────────────────────────────────────────────────┐    │       │
│  │                   WEBHOOK HANDLER                       │◀───┘       │
│  │   ┌──────────────┐    ┌──────────────┐                 │            │
│  │   │   Validator  │───▶│    Parser    │                 │            │
│  │   └──────────────┘    └──────────────┘                 │            │
│  └────────────────────────────────────────────────────────┘            │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                           TYPES                                     │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │ │
│  │  │  Refs  │ │ Status │ │  MR    │ │Pipeline│ │  Job   │ │ Event │ │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └───────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Design

### 3.1 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| GitLabClient | Request orchestration, auth injection |
| RequestBuilder | URL construction, query params |
| RateLimiter | Header-driven rate limit enforcement |
| HttpExecutor | Request execution, retry logic |
| SimulationLayer | Record/replay operations |
| WebhookHandler | Validation and event parsing |
| WebhookValidator | X-Gitlab-Token verification |
| EventParser | Typed event deserialization |

### 3.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         COMPONENT DETAIL                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  GitLabClient                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │   ┌─────────────────────────────────────────────────────────────┐  │ │
│  │   │                    Operation Layer                           │  │ │
│  │   │  ┌──────┐ ┌──────┐ ┌────────┐ ┌──────┐ ┌──────┐ ┌────────┐  │  │ │
│  │   │  │Repos │ │ MRs  │ │Pipeline│ │ Jobs │ │Issues│ │Project │  │  │ │
│  │   │  └──┬───┘ └──┬───┘ └───┬────┘ └──┬───┘ └──┬───┘ └───┬────┘  │  │ │
│  │   └─────┼────────┼─────────┼─────────┼────────┼─────────┼───────┘  │ │
│  │         │        │         │         │        │         │          │ │
│  │         └────────┴─────────┼─────────┴────────┴─────────┘          │ │
│  │                            ▼                                        │ │
│  │   ┌─────────────────────────────────────────────────────────────┐  │ │
│  │   │                   Request Pipeline                           │  │ │
│  │   │                                                              │  │ │
│  │   │   ┌──────────┐    ┌──────────┐    ┌──────────┐              │  │ │
│  │   │   │  Build   │───▶│   Auth   │───▶│   Rate   │              │  │ │
│  │   │   │ Endpoint │    │  Inject  │    │  Limit   │              │  │ │
│  │   │   └──────────┘    └──────────┘    └────┬─────┘              │  │ │
│  │   │                                        │                     │  │ │
│  │   │                                        ▼                     │  │ │
│  │   │   ┌──────────┐    ┌──────────┐    ┌──────────┐              │  │ │
│  │   │   │  Parse   │◀───│  Retry   │◀───│ Execute  │              │  │ │
│  │   │   │ Response │    │  Logic   │    │   HTTP   │              │  │ │
│  │   │   └──────────┘    └──────────┘    └──────────┘              │  │ │
│  │   │        │                                                     │  │ │
│  │   │        ▼                                                     │  │ │
│  │   │   ┌──────────┐                                               │  │ │
│  │   │   │Simulation│  (Record or Replay)                          │  │ │
│  │   │   │  Layer   │                                               │  │ │
│  │   │   └──────────┘                                               │  │ │
│  │   │                                                              │  │ │
│  │   └─────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  WebhookHandler                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │   Request ──▶ ┌───────────┐ ──▶ ┌───────────┐ ──▶ WebhookEvent     │ │
│  │               │ Validate  │     │   Parse   │                      │ │
│  │               │  Token    │     │   Event   │                      │ │
│  │               └───────────┘     └───────────┘                      │ │
│  │                                                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Type Hierarchy

```
Types
├── refs/
│   ├── ProjectRef      (Id | Path | Url)
│   ├── MergeRequestRef (project + iid)
│   ├── PipelineRef     (project + id)
│   ├── JobRef          (project + id)
│   └── CommitRef       (Sha | Branch | Tag)
│
├── resources/
│   ├── Project
│   ├── MergeRequest
│   ├── Pipeline
│   ├── Job
│   ├── Commit
│   ├── Branch
│   ├── Issue
│   └── Note
│
├── status/
│   ├── PipelineStatus  (11 variants)
│   ├── JobStatus       (9 variants)
│   ├── MergeRequestState
│   └── MergeStatus
│
├── events/
│   ├── WebhookEvent    (7 variants)
│   ├── PushEvent
│   ├── MergeRequestEvent
│   ├── PipelineEvent
│   ├── JobEvent
│   └── MergeRequestAction
│
├── requests/
│   ├── CreateMergeRequest
│   ├── UpdateMergeRequest
│   ├── MergeOptions
│   ├── CreateFileRequest
│   └── PipelineQuery
│
└── errors/
    └── GitLabError
```

---

## 4. Data Flow

### 4.1 API Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          API REQUEST FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Caller                                                                 │
│     │                                                                    │
│     ▼                                                                    │
│   ┌─────────────────┐                                                   │
│   │ Operation Method│  (create_mr, trigger_pipeline, etc.)              │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐     ┌─────────────────┐                           │
│   │ Build Endpoint  │────▶│ Check Simulation│                           │
│   │ (project path   │     │ Replay Mode     │                           │
│   │  encoding)      │     └────────┬────────┘                           │
│   └─────────────────┘              │                                    │
│                                    │                                    │
│            ┌───────────────────────┼───────────────────────┐            │
│            │ Replay Hit            │ Replay Miss / Live    │            │
│            ▼                       ▼                       │            │
│   ┌─────────────────┐     ┌─────────────────┐             │            │
│   │ Return Cached   │     │ Acquire Rate    │             │            │
│   │ Response        │     │ Limit Permit    │             │            │
│   └─────────────────┘     └────────┬────────┘             │            │
│                                    │                       │            │
│                                    ▼                       │            │
│                           ┌─────────────────┐             │            │
│                           │ Inject Auth     │             │            │
│                           │ (PRIVATE-TOKEN) │             │            │
│                           └────────┬────────┘             │            │
│                                    │                       │            │
│                                    ▼                       │            │
│                           ┌─────────────────┐             │            │
│                           │ Execute HTTP    │◀────────┐   │            │
│                           │ Request         │         │   │            │
│                           └────────┬────────┘         │   │            │
│                                    │                  │   │            │
│                    ┌───────────────┼──────────────┐   │   │            │
│                    │               │              │   │   │            │
│                    ▼               ▼              ▼   │   │            │
│              ┌──────────┐   ┌──────────┐   ┌──────────┐   │            │
│              │ 2xx OK   │   │ 429 Rate │   │ 5xx Err  │   │            │
│              └────┬─────┘   │ Limited  │   └────┬─────┘   │            │
│                   │         └────┬─────┘        │         │            │
│                   │              │              │ Retry?  │            │
│                   │  Update      │ Wait         │         │            │
│                   │  Headers     │ Retry-After  └─────────┘            │
│                   │              │                                     │
│                   ▼              └────────────────────────►            │
│           ┌─────────────────┐                                          │
│           │ Update Rate     │                                          │
│           │ Limit State     │                                          │
│           └────────┬────────┘                                          │
│                    │                                                    │
│                    ▼                                                    │
│           ┌─────────────────┐                                          │
│           │ Record if       │                                          │
│           │ Recording Mode  │                                          │
│           └────────┬────────┘                                          │
│                    │                                                    │
│                    ▼                                                    │
│           ┌─────────────────┐                                          │
│           │ Parse & Return  │                                          │
│           └─────────────────┘                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Job Log Streaming Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       JOB LOG STREAMING FLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   stream_job_log(job_ref)                                                │
│     │                                                                    │
│     ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Streaming Loop                                │   │
│   │                                                                  │   │
│   │   offset = 0                                                     │   │
│   │                                                                  │   │
│   │   LOOP:                                                          │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ GET /projects/{id}/jobs/{id}/trace?offset={offset}    │   │   │
│   │     └───────────────────────────┬───────────────────────────┘   │   │
│   │                                 │                                │   │
│   │                                 ▼                                │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ Response {                                            │   │   │
│   │     │   Headers: X-Gitlab-Trace-Size: {size}                │   │   │
│   │     │   Body: {new log content}                             │   │   │
│   │     │ }                                                     │   │   │
│   │     └───────────────────────────┬───────────────────────────┘   │   │
│   │                                 │                                │   │
│   │                                 ▼                                │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ IF size > offset:                                     │   │   │
│   │     │   yield new content                                   │   │   │
│   │     │   offset = size                                       │   │   │
│   │     └───────────────────────────┬───────────────────────────┘   │   │
│   │                                 │                                │   │
│   │                                 ▼                                │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ GET /projects/{id}/jobs/{id} (check status)           │   │   │
│   │     │                                                       │   │   │
│   │     │ IF job.status.is_finished():                          │   │   │
│   │     │   BREAK                                               │   │   │
│   │     │ ELSE:                                                 │   │   │
│   │     │   sleep(2s)                                           │   │   │
│   │     │   CONTINUE                                            │   │   │
│   │     └───────────────────────────────────────────────────────┘   │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Module Structure

### 5.1 File Layout

```
integrations/gitlab/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Public API exports
│   │
│   ├── client/
│   │   ├── mod.rs             # GitLabClient
│   │   ├── config.rs          # GitLabConfig, Builder
│   │   └── request.rs         # Request building, pagination
│   │
│   ├── operations/
│   │   ├── mod.rs
│   │   ├── repository.rs      # Files, branches, commits
│   │   ├── merge_requests.rs  # MR operations
│   │   ├── pipelines.rs       # Pipeline operations
│   │   ├── jobs.rs            # Job operations, log streaming
│   │   ├── issues.rs          # Issue operations
│   │   └── projects.rs        # Project metadata
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── refs.rs            # ProjectRef, MergeRequestRef, etc.
│   │   ├── status.rs          # PipelineStatus, JobStatus, etc.
│   │   ├── resources.rs       # Project, MR, Pipeline, Job
│   │   ├── requests.rs        # CreateMR, MergeOptions, etc.
│   │   └── responses.rs       # PaginatedResults
│   │
│   ├── webhooks/
│   │   ├── mod.rs             # WebhookHandler
│   │   ├── validator.rs       # Token validation
│   │   ├── parser.rs          # Event parsing
│   │   └── events.rs          # WebhookEvent types
│   │
│   ├── rate_limit/
│   │   └── mod.rs             # Header-driven RateLimiter
│   │
│   ├── simulation/
│   │   ├── mod.rs             # SimulationLayer
│   │   ├── recording.rs       # Recording mode
│   │   └── replay.rs          # Replay mode
│   │
│   └── error.rs               # GitLabError
│
└── tests/
    ├── integration/
    │   ├── repository_test.rs
    │   ├── merge_requests_test.rs
    │   ├── pipelines_test.rs
    │   └── jobs_test.rs
    │
    ├── webhooks/
    │   └── event_parsing_test.rs
    │
    └── simulation/
        └── replay_test.rs
```

### 5.2 Public API Surface

```rust
// lib.rs exports
pub use client::{GitLabClient, GitLabConfig, GitLabConfigBuilder};
pub use types::{
    // Refs
    ProjectRef, MergeRequestRef, PipelineRef, JobRef, CommitRef,
    // Status
    PipelineStatus, JobStatus, MergeRequestState, MergeStatus,
    // Resources
    Project, MergeRequest, Pipeline, Job, Commit, Branch, Issue, Note,
    // Requests
    CreateMergeRequest, UpdateMergeRequest, MergeOptions,
    CreateFileRequest, PipelineQuery, MergeRequestQuery,
    // Responses
    PaginatedResults, FileContent, CompareResult,
};
pub use webhooks::{WebhookHandler, WebhookEvent, MergeRequestAction};
pub use error::GitLabError;
pub use simulation::SimulationMode;
```

---

## 6. Concurrency Model

### 6.1 Thread Safety

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CONCURRENCY MODEL                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   GitLabClient (Clone-safe, Send + Sync)                                │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │   Arc<GitLabConfig>         ─── Immutable, shared              │    │
│   │                                                                 │    │
│   │   Arc<dyn TokenProvider>    ─── Thread-safe auth               │    │
│   │                                                                 │    │
│   │   Arc<HttpClient>           ─── Reqwest (clone-safe)           │    │
│   │                                                                 │    │
│   │   Arc<RateLimiter>                                             │    │
│   │   ┌─────────────────────────────────────────────────────────┐  │    │
│   │   │ Arc<Semaphore>          ─── Burst control               │  │    │
│   │   │ Arc<AtomicU32>          ─── Limit from headers          │  │    │
│   │   │ Arc<AtomicU32>          ─── Remaining from headers      │  │    │
│   │   │ Arc<AtomicU64>          ─── Reset timestamp             │  │    │
│   │   └─────────────────────────────────────────────────────────┘  │    │
│   │                                                                 │    │
│   │   Arc<SimulationLayer>                                         │    │
│   │   ┌─────────────────────────────────────────────────────────┐  │    │
│   │   │ Arc<RwLock<HashMap>>    ─── Recorded responses          │  │    │
│   │   └─────────────────────────────────────────────────────────┘  │    │
│   │                                                                 │    │
│   │   Arc<MetricsCollector>     ─── Thread-safe metrics           │    │
│   │                                                                 │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Parallel Operations

```rust
// Safe for concurrent use across threads
let client = Arc::new(gitlab_client);

// Parallel pipeline monitoring
let handles: Vec<_> = pipeline_ids.iter().map(|id| {
    let client = client.clone();
    tokio::spawn(async move {
        client.get_pipeline(PipelineRef { project, id: *id }).await
    })
}).collect();

let results = futures::future::join_all(handles).await;

// Rate limiter coordinates across all clones
```

---

## 7. Webhook Architecture

### 7.1 Webhook Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WEBHOOK PROCESSING FLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   GitLab Instance                                                        │
│        │                                                                 │
│        │ POST /webhooks/gitlab                                           │
│        │ Headers: X-Gitlab-Token, X-Gitlab-Event                        │
│        │ Body: JSON payload                                              │
│        ▼                                                                 │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    WebhookHandler                                │   │
│   │                                                                  │   │
│   │   ┌───────────────────────────────────────────────────────────┐ │   │
│   │   │                 1. Validate                                │ │   │
│   │   │                                                            │ │   │
│   │   │   X-Gitlab-Token ──▶ constant_time_compare(expected)      │ │   │
│   │   │                                                            │ │   │
│   │   │   IF mismatch:                                             │ │   │
│   │   │     RETURN Err(WebhookValidationFailed)                   │ │   │
│   │   │                                                            │ │   │
│   │   └───────────────────────────────────────────────────────────┘ │   │
│   │                         │                                        │   │
│   │                         ▼                                        │   │
│   │   ┌───────────────────────────────────────────────────────────┐ │   │
│   │   │                 2. Route by Event Type                     │ │   │
│   │   │                                                            │ │   │
│   │   │   X-Gitlab-Event ─┬─▶ "Push Hook"                         │ │   │
│   │   │                   ├─▶ "Merge Request Hook"                │ │   │
│   │   │                   ├─▶ "Pipeline Hook"                     │ │   │
│   │   │                   ├─▶ "Job Hook"                          │ │   │
│   │   │                   ├─▶ "Issue Hook"                        │ │   │
│   │   │                   ├─▶ "Note Hook"                         │ │   │
│   │   │                   └─▶ "Tag Push Hook"                     │ │   │
│   │   │                                                            │ │   │
│   │   └───────────────────────────────────────────────────────────┘ │   │
│   │                         │                                        │   │
│   │                         ▼                                        │   │
│   │   ┌───────────────────────────────────────────────────────────┐ │   │
│   │   │                 3. Parse Payload                           │ │   │
│   │   │                                                            │ │   │
│   │   │   JSON ──▶ Typed WebhookEvent                             │ │   │
│   │   │                                                            │ │   │
│   │   └───────────────────────────────────────────────────────────┘ │   │
│   │                         │                                        │   │
│   └─────────────────────────┼────────────────────────────────────────┘   │
│                             ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Platform Handler                              │   │
│   │                                                                  │   │
│   │   MATCH event:                                                   │   │
│   │     Push { ref, commits } ──▶ Trigger analysis                  │   │
│   │     MergeRequest { action: Merge } ──▶ Deploy workflow          │   │
│   │     Pipeline { status: Failed } ──▶ Alert notification          │   │
│   │     ...                                                          │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Event Type Mapping

```
X-Gitlab-Event Header          WebhookEvent Variant
──────────────────────         ────────────────────
"Push Hook"                 → Push { ref, commits, project }
"Merge Request Hook"        → MergeRequest { action, mr, project }
"Pipeline Hook"             → Pipeline { status, pipeline, builds }
"Job Hook"                  → Job { status, job, project }
"Issue Hook"                → Issue { action, issue, project }
"Note Hook"                 → Note { note, noteable_type, project }
"Tag Push Hook"             → TagPush { ref, project }
```

---

## 8. Simulation Architecture

### 8.1 Simulation Modes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SIMULATION ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   SimulationMode::Disabled                                               │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │ Request ──────────────────────────────────────────▶ GitLab API │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   SimulationMode::Recording                                              │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │ Request ─────────────────────────────────────────▶ GitLab API  │    │
│   │    │                                                    │       │    │
│   │    │ cache_key = SHA256(method + endpoint + body)       ▼       │    │
│   │    │                                               Response     │    │
│   │    │                                                    │       │    │
│   │    ▼                                                    │       │    │
│   │ ┌────────────────────────────────────────────────────┐  │       │    │
│   │ │              Recording Storage                     │◀─┘       │    │
│   │ │                                                    │          │    │
│   │ │  { cache_key: RecordedResponse }                  │          │    │
│   │ │                                                    │          │    │
│   │ │        │ Persist                                  │          │    │
│   │ │        ▼                                          │          │    │
│   │ │  gitlab_recordings.json                           │          │    │
│   │ └────────────────────────────────────────────────────┘          │    │
│   │                                                                 │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   SimulationMode::Replay                                                 │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │ Request                                                         │    │
│   │    │                                                            │    │
│   │    │ cache_key = SHA256(method + endpoint + body)               │    │
│   │    ▼                                                            │    │
│   │ ┌────────────────────────────────────────────────────┐          │    │
│   │ │              Replay Storage                        │          │    │
│   │ │                                                    │          │    │
│   │ │  Load: gitlab_recordings.json                     │          │    │
│   │ │                                                    │          │    │
│   │ └──────────────────────┬─────────────────────────────┘          │    │
│   │                        │                                        │    │
│   │         ┌──────────────┴──────────────┐                         │    │
│   │         │ Found                       │ Not Found               │    │
│   │         ▼                             ▼                         │    │
│   │   Return cached               SimulationMiss Error              │    │
│   │   response                                                      │    │
│   │                                                                 │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Error Handling Strategy

### 9.1 Error Categories

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ERROR HANDLING                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   GitLabError                                                            │
│   ├── API Errors (from GitLab)                                          │
│   │   ├── BadRequest (400)          → Not retryable                    │
│   │   ├── Unauthorized (401)        → Not retryable, check token       │
│   │   ├── Forbidden (403)           → Not retryable, check permissions │
│   │   ├── NotFound (404)            → Not retryable                    │
│   │   ├── Conflict (409)            → Not retryable (MR conflicts)     │
│   │   ├── RateLimited (429)         → Retryable, wait Retry-After      │
│   │   ├── InternalError (500)       → Retryable                        │
│   │   └── ServiceUnavailable (503)  → Retryable                        │
│   │                                                                      │
│   ├── Client Errors                                                      │
│   │   ├── InvalidProjectRef         → Validation failure               │
│   │   ├── InvalidUrl                → URL parsing failure              │
│   │   ├── SerializationError        → JSON error                       │
│   │   ├── Network                   → Retryable                        │
│   │   └── Timeout                   → Retryable                        │
│   │                                                                      │
│   ├── Webhook Errors                                                     │
│   │   ├── WebhookValidationFailed   → Token mismatch                   │
│   │   ├── InvalidWebhookEvent       → Missing event header             │
│   │   └── UnknownWebhookEvent       → Unsupported event type           │
│   │                                                                      │
│   └── Simulation Errors                                                  │
│       ├── SimulationMiss            → Cache key not found              │
│       └── SimulationCorrupted       → File parse error                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Retry Strategy

```
┌─────────────────┐
│   Error         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     No      ┌─────────────────┐
│ is_retryable()? │────────────▶│  Return Error   │
└────────┬────────┘             └─────────────────┘
         │ Yes
         ▼
┌─────────────────┐     No      ┌─────────────────┐
│ retries < max?  │────────────▶│  Return Error   │
└────────┬────────┘             └─────────────────┘
         │ Yes
         ▼
┌─────────────────┐
│ RateLimited?    │
└────────┬────────┘
    Yes  │  No
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌──────────────┐
│ Wait  │ │ Exponential  │
│Retry- │ │ Backoff      │
│After  │ │ 1s, 2s, 4s   │
└───┬───┘ └──────┬───────┘
    │            │
    └────────────┘
         │
         ▼
┌─────────────────┐
│  Retry Request  │
└─────────────────┘
```

---

## 10. Integration Patterns

### 10.1 Platform Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PLATFORM INTEGRATION                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   LLM Dev Ops Platform                                                   │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │   ┌─────────────────┐                                          │    │
│   │   │  Code Analysis  │                                          │    │
│   │   └────────┬────────┘                                          │    │
│   │            │                                                    │    │
│   │            │ Get MR diff, analyze changes                      │    │
│   │            ▼                                                    │    │
│   │   ┌─────────────────┐     ┌─────────────────┐                  │    │
│   │   │  Vector Memory  │◀────│   Repository    │                  │    │
│   │   │  (Code Index)   │     │   Content       │                  │    │
│   │   └─────────────────┘     └────────┬────────┘                  │    │
│   │                                    │                            │    │
│   │                                    │                            │    │
│   │                           ┌────────┴────────┐                  │    │
│   │                           │ GitLab Client   │                  │    │
│   │                           └────────┬────────┘                  │    │
│   │                                    │                            │    │
│   │   ┌─────────────────┐              │                            │    │
│   │   │ Workflow Engine │◀─────────────┤ Webhook events            │    │
│   │   └─────────────────┘              │                            │    │
│   │            │                       │                            │    │
│   │            │ Trigger pipelines     │                            │    │
│   │            ▼                       │                            │    │
│   │   ┌─────────────────┐              │                            │    │
│   │   │  Notification   │◀─────────────┤ Pipeline failures         │    │
│   │   └─────────────────┘              │                            │    │
│   │                                    │                            │    │
│   └────────────────────────────────────┼────────────────────────────┘    │
│                                        │                                 │
│                                        ▼                                 │
│                               ┌─────────────────┐                       │
│                               │   GitLab API    │                       │
│                               └─────────────────┘                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Usage Patterns

```rust
// Pattern 1: MR Review Automation
async fn review_merge_request(client: &GitLabClient, mr_ref: MergeRequestRef) {
    // Get MR details and changes
    let mr = client.get_merge_request(mr_ref.clone()).await?;
    let changes = client.get_mr_changes(mr_ref.clone()).await?;

    // Analyze diff
    let analysis = analyze_code_changes(&changes).await?;

    // Post review comment
    client.add_mr_note(mr_ref, analysis.summary).await?;

    // Approve if passing
    if analysis.is_approved {
        client.approve_merge_request(mr_ref, Some(mr.sha)).await?;
    }
}

// Pattern 2: Pipeline Monitoring
async fn monitor_pipeline(client: &GitLabClient, pipeline_ref: PipelineRef) {
    loop {
        let pipeline = client.get_pipeline(pipeline_ref.clone()).await?;

        match pipeline.status {
            PipelineStatus::Success => {
                notify_success(&pipeline).await;
                break;
            }
            PipelineStatus::Failed => {
                let jobs = client.get_pipeline_jobs(pipeline_ref.clone(), None).await?;
                let failed = jobs.results.iter().filter(|j| j.status == JobStatus::Failed);

                for job in failed {
                    let log = client.get_job_log(JobRef::from(&job)).await?;
                    analyze_failure(&job, &log).await;
                }
                notify_failure(&pipeline).await;
                break;
            }
            _ => sleep(Duration::from_secs(10)).await,
        }
    }
}

// Pattern 3: Webhook-driven automation
async fn handle_webhook(handler: &WebhookHandler, req: Request) -> Result<()> {
    let event = handler.parse(req.headers(), req.body()).await?;

    match event {
        WebhookEvent::MergeRequest { action: MergeRequestAction::Open, mr, .. } => {
            // Auto-assign reviewers, run initial checks
            assign_reviewers(&mr).await?;
        }
        WebhookEvent::Pipeline { status: PipelineStatus::Failed, pipeline, .. } => {
            // Alert on failure
            send_alert(&pipeline).await?;
        }
        _ => {}
    }
    Ok(())
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GITLAB-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*Proceed to Refinement phase upon approval.*
