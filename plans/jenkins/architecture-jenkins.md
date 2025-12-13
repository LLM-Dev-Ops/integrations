# Architecture: Jenkins Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/jenkins`

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Container Architecture](#2-container-architecture)
3. [Component Design](#3-component-design)
4. [Data Flow](#4-data-flow)
5. [Module Structure](#5-module-structure)
6. [Concurrency Model](#6-concurrency-model)
7. [Crumb/CSRF Architecture](#7-crumbcsrf-architecture)
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
│    │   LLM Dev    │         │    Jenkins Server(s)     │                │
│    │   Ops Core   │         │    (Self-hosted)         │                │
│    └──────┬───────┘         └────────────▲─────────────┘                │
│           │                              │                               │
│           │ Uses                         │ HTTPS/REST + Basic Auth       │
│           ▼                              │                               │
│    ┌──────────────────────────────────────────────────┐                 │
│    │          Jenkins Integration Module              │                 │
│    │                                                  │                 │
│    │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │                 │
│    │  │   Client    │  │   Crumb     │  │  Shared  │ │                 │
│    │  │   Layer     │  │   Manager   │  │  Auth    │ │                 │
│    │  └─────────────┘  └─────────────┘  └──────────┘ │                 │
│    └──────────────────────────────────────────────────┘                 │
│           │                                                              │
│           │ Uses                                                         │
│           ▼                                                              │
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
| Jenkins API | CI/CD operations | HTTPS REST |
| Shared Auth | Credential management | Internal |
| Logging | Structured logging | Internal |
| Metrics | Observability | Internal |

---

## 2. Container Architecture

### 2.1 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       JENKINS INTEGRATION                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         PUBLIC API                                  │ │
│  │  ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────┐ ┌─────────────────┐ │ │
│  │  │  Jobs  │ │ Builds │ │ Pipeline │ │ Queue │ │    Artifacts    │ │ │
│  │  └───┬────┘ └───┬────┘ └────┬─────┘ └───┬───┘ └────────┬────────┘ │ │
│  └──────┼──────────┼───────────┼───────────┼──────────────┼──────────┘ │
│         │          │           │           │              │            │
│         ▼          ▼           ▼           ▼              ▼            │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      JENKINS CLIENT                                 │ │
│  │                                                                     │ │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐        │ │
│  │   │   Request    │───▶│    Crumb     │───▶│     HTTP     │        │ │
│  │   │   Builder    │    │   Injector   │    │   Executor   │        │ │
│  │   └──────────────┘    └──────────────┘    └──────┬───────┘        │ │
│  │                              ▲                    │                │ │
│  │                              │                    │                │ │
│  │                       ┌──────┴───────┐            │                │ │
│  │                       │    Crumb     │            │                │ │
│  │                       │    Cache     │            │                │ │
│  │                       └──────────────┘            │                │ │
│  │                                                   │                │ │
│  │   ┌──────────────┐    ┌──────────────┐           │                │ │
│  │   │  Simulation  │◀───│    Retry     │◀──────────┘                │ │
│  │   │    Layer     │    │   Handler    │                            │ │
│  │   └──────────────┘    └──────────────┘                            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                           TYPES                                     │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │ │
│  │  │  Refs  │ │ Status │ │  Job   │ │ Build  │ │Pipeline│ │ Queue │ │ │
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
| JenkinsClient | Request orchestration, auth injection |
| RequestBuilder | URL construction, path encoding |
| CrumbManager | CSRF token fetch, cache, refresh |
| HttpExecutor | Request execution, retry logic |
| SimulationLayer | Record/replay operations |
| ConsoleStreamer | Progressive log output |
| QueueWaiter | Poll queue until build starts |

### 3.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         COMPONENT DETAIL                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  JenkinsClient                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │   ┌─────────────────────────────────────────────────────────────┐  │ │
│  │   │                    Operation Layer                           │  │ │
│  │   │  ┌──────┐ ┌──────┐ ┌────────┐ ┌───────┐ ┌─────┐ ┌────────┐  │  │ │
│  │   │  │ Jobs │ │Builds│ │Pipeline│ │ Queue │ │Artif│ │Console │  │  │ │
│  │   │  └──┬───┘ └──┬───┘ └───┬────┘ └───┬───┘ └──┬──┘ └───┬────┘  │  │ │
│  │   └─────┼────────┼─────────┼──────────┼────────┼────────┼───────┘  │ │
│  │         │        │         │          │        │        │          │ │
│  │         └────────┴─────────┼──────────┴────────┴────────┘          │ │
│  │                            ▼                                        │ │
│  │   ┌─────────────────────────────────────────────────────────────┐  │ │
│  │   │                   Request Pipeline                           │  │ │
│  │   │                                                              │  │ │
│  │   │   ┌──────────┐    ┌──────────┐    ┌──────────┐              │  │ │
│  │   │   │  Build   │───▶│  Basic   │───▶│  Crumb   │              │  │ │
│  │   │   │   URL    │    │   Auth   │    │  Inject  │              │  │ │
│  │   │   └──────────┘    └──────────┘    └────┬─────┘              │  │ │
│  │   │                                        │                     │  │ │
│  │   │                        ┌───────────────┘                     │  │ │
│  │   │                        ▼                                     │  │ │
│  │   │   ┌──────────┐    ┌──────────┐    ┌──────────┐              │  │ │
│  │   │   │  Parse   │◀───│  Retry   │◀───│ Execute  │              │  │ │
│  │   │   │ Response │    │  Logic   │    │   HTTP   │              │  │ │
│  │   │   └──────────┘    └────┬─────┘    └──────────┘              │  │ │
│  │   │                        │                                     │  │ │
│  │   │                        │ On 403                              │  │ │
│  │   │                        ▼                                     │  │ │
│  │   │                   ┌──────────┐                               │  │ │
│  │   │                   │ Refresh  │                               │  │ │
│  │   │                   │  Crumb   │                               │  │ │
│  │   │                   └──────────┘                               │  │ │
│  │   │                                                              │  │ │
│  │   └─────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Type Hierarchy

```
Types
├── refs/
│   ├── JobRef          (Simple | Folder | Url)
│   ├── BuildRef        (Number | Last | LastSuccessful | ...)
│   └── QueueRef        (id)
│
├── status/
│   ├── BuildResult     (Success | Unstable | Failure | ...)
│   ├── BuildStatus     (Building | Queued | Completed)
│   └── StageStatus     (Success | Failed | InProgress | ...)
│
├── resources/
│   ├── Job
│   ├── Build
│   ├── PipelineRun
│   ├── Stage
│   ├── QueueItem
│   └── Artifact
│
├── requests/
│   ├── TriggerBuildRequest
│   └── InputSubmitRequest
│
└── errors/
    └── JenkinsError
```

---

## 4. Data Flow

### 4.1 Build Trigger Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BUILD TRIGGER FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   trigger_build(job_ref, params)                                         │
│     │                                                                    │
│     ▼                                                                    │
│   ┌─────────────────┐                                                   │
│   │ Build Endpoint  │  /job/{name}/build or /buildWithParameters        │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐                                                   │
│   │ Get/Cache Crumb │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐                                                   │
│   │ POST with Crumb │  Header: Jenkins-Crumb: {value}                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐                                                   │
│   │ Response 201    │  Location: /queue/item/{id}/                      │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐                                                   │
│   │ Extract Queue   │  Parse ID from Location header                    │
│   │ Item ID         │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   Return QueueRef { id }                                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Queue to Build Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       QUEUE TO BUILD FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   wait_for_build(queue_ref, timeout)                                     │
│     │                                                                    │
│     ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Polling Loop                                  │   │
│   │                                                                  │   │
│   │   poll_interval = 1s                                             │   │
│   │                                                                  │   │
│   │   LOOP:                                                          │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ GET /queue/item/{id}/api/json                         │   │   │
│   │     └───────────────────────────┬───────────────────────────┘   │   │
│   │                                 │                                │   │
│   │                                 ▼                                │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ QueueItem {                                           │   │   │
│   │     │   blocked: bool,                                      │   │   │
│   │     │   stuck: bool,                                        │   │   │
│   │     │   cancelled: bool,                                    │   │   │
│   │     │   executable: Option<{ number, url }>                 │   │   │
│   │     │ }                                                     │   │   │
│   │     └───────────────────────────┬───────────────────────────┘   │   │
│   │                                 │                                │   │
│   │         ┌───────────────────────┼───────────────────┐           │   │
│   │         │                       │                   │           │   │
│   │         ▼                       ▼                   ▼           │   │
│   │   ┌──────────┐           ┌──────────┐         ┌──────────┐     │   │
│   │   │executable│           │ cancelled│         │  waiting │     │   │
│   │   │ present  │           │          │         │          │     │   │
│   │   └────┬─────┘           └────┬─────┘         └────┬─────┘     │   │
│   │        │                      │                    │           │   │
│   │        ▼                      ▼                    ▼           │   │
│   │   Return              Return Error         sleep(poll_interval)│   │
│   │   BuildRef::Number    QueueCancelled       poll_interval *= 2  │   │
│   │                                            (max 5s)            │   │
│   │                                            CONTINUE            │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Console Streaming Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CONSOLE STREAMING FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   stream_console_output(job_ref, build_ref)                              │
│     │                                                                    │
│     ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Streaming Loop                                │   │
│   │                                                                  │   │
│   │   offset = 0                                                     │   │
│   │                                                                  │   │
│   │   LOOP:                                                          │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ GET /job/{name}/{num}/logText/progressiveText?start=N │   │   │
│   │     └───────────────────────────┬───────────────────────────┘   │   │
│   │                                 │                                │   │
│   │                                 ▼                                │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ Response {                                            │   │   │
│   │     │   Headers:                                            │   │   │
│   │     │     X-Text-Size: {new_offset}                         │   │   │
│   │     │     X-More-Data: true|false                           │   │   │
│   │     │   Body: {log_content}                                 │   │   │
│   │     │ }                                                     │   │   │
│   │     └───────────────────────────┬───────────────────────────┘   │   │
│   │                                 │                                │   │
│   │                                 ▼                                │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ IF new_offset > offset:                               │   │   │
│   │     │   yield log_content                                   │   │   │
│   │     │   offset = new_offset                                 │   │   │
│   │     │                                                       │   │   │
│   │     │ IF X-More-Data == false:                              │   │   │
│   │     │   BREAK                                               │   │   │
│   │     │ ELSE:                                                 │   │   │
│   │     │   sleep(1s)                                           │   │   │
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
integrations/jenkins/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Public API exports
│   │
│   ├── client/
│   │   ├── mod.rs             # JenkinsClient
│   │   ├── config.rs          # JenkinsConfig, Builder
│   │   ├── request.rs         # Request building
│   │   └── crumb.rs           # CrumbManager
│   │
│   ├── operations/
│   │   ├── mod.rs
│   │   ├── jobs.rs            # Job operations
│   │   ├── builds.rs          # Build operations
│   │   ├── pipelines.rs       # Pipeline/wfapi operations
│   │   ├── queue.rs           # Queue operations
│   │   ├── artifacts.rs       # Artifact operations
│   │   └── console.rs         # Console streaming
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── refs.rs            # JobRef, BuildRef, QueueRef
│   │   ├── status.rs          # BuildResult, BuildStatus, StageStatus
│   │   ├── resources.rs       # Job, Build, PipelineRun, Stage
│   │   └── responses.rs       # API response types
│   │
│   ├── simulation/
│   │   ├── mod.rs             # SimulationLayer
│   │   ├── recording.rs       # Recording mode
│   │   └── replay.rs          # Replay mode
│   │
│   └── error.rs               # JenkinsError
│
└── tests/
    ├── integration/
    │   ├── jobs_test.rs
    │   ├── builds_test.rs
    │   ├── pipelines_test.rs
    │   └── queue_test.rs
    │
    └── simulation/
        └── replay_test.rs
```

### 5.2 Public API Surface

```rust
// lib.rs exports
pub use client::{JenkinsClient, JenkinsConfig, JenkinsConfigBuilder};
pub use types::{
    // Refs
    JobRef, BuildRef, QueueRef,
    // Status
    BuildResult, BuildStatus, StageStatus,
    // Resources
    Job, Build, BuildSummary, PipelineRun, Stage, QueueItem, Artifact,
};
pub use error::JenkinsError;
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
│   JenkinsClient (Clone-safe, Send + Sync)                               │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │   Arc<JenkinsConfig>        ─── Immutable, shared              │    │
│   │                                                                 │    │
│   │   Arc<dyn TokenProvider>    ─── Thread-safe auth               │    │
│   │                                                                 │    │
│   │   Arc<HttpClient>           ─── Reqwest (clone-safe)           │    │
│   │                                                                 │    │
│   │   Arc<RwLock<Option<Crumb>>>                                   │    │
│   │   ┌─────────────────────────────────────────────────────────┐  │    │
│   │   │ Crumb {                                                 │  │    │
│   │   │   field: String,       // "Jenkins-Crumb"               │  │    │
│   │   │   value: String,       // Token value                   │  │    │
│   │   │   expires_at: Instant  // Cache expiry                  │  │    │
│   │   │ }                                                       │  │    │
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
// Safe for concurrent job monitoring
let client = Arc::new(jenkins_client);

// Monitor multiple builds in parallel
let handles: Vec<_> = build_refs.iter().map(|(job, build)| {
    let client = client.clone();
    let job = job.clone();
    let build = build.clone();
    tokio::spawn(async move {
        client.get_build_status(job, build).await
    })
}).collect();

let statuses = futures::future::join_all(handles).await;

// Crumb cache shared across all clones
```

---

## 7. Crumb/CSRF Architecture

### 7.1 Crumb Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       CRUMB LIFECYCLE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Mutation Request (POST/DELETE)                                         │
│     │                                                                    │
│     ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                 Crumb Check                                      │   │
│   │                                                                  │   │
│   │   cache = crumb_cache.read()                                     │   │
│   │                                                                  │   │
│   │   ┌─────────────────────────────────────────────────────────┐   │   │
│   │   │ Cache Status                                            │   │   │
│   │   └───────────────────────┬─────────────────────────────────┘   │   │
│   │                           │                                      │   │
│   │         ┌─────────────────┼─────────────────┐                   │   │
│   │         ▼                 ▼                 ▼                   │   │
│   │   ┌──────────┐     ┌──────────┐      ┌──────────┐              │   │
│   │   │ Valid    │     │ Expired  │      │  None    │              │   │
│   │   │ Crumb    │     │ Crumb    │      │  (cold)  │              │   │
│   │   └────┬─────┘     └────┬─────┘      └────┬─────┘              │   │
│   │        │                │                  │                    │   │
│   │        │                └──────────────────┘                    │   │
│   │        │                         │                              │   │
│   │        ▼                         ▼                              │   │
│   │   Use cached             Fetch new crumb                        │   │
│   │   crumb                  GET /crumbIssuer/api/json              │   │
│   │        │                         │                              │   │
│   │        │                         ▼                              │   │
│   │        │                  Update cache                          │   │
│   │        │                  expires_at = now + 5min               │   │
│   │        │                         │                              │   │
│   │        └─────────────────────────┘                              │   │
│   │                    │                                            │   │
│   └────────────────────┼────────────────────────────────────────────┘   │
│                        ▼                                                 │
│   Add header: {crumb.field}: {crumb.value}                              │
│     │                                                                    │
│     ▼                                                                    │
│   Execute request                                                        │
│     │                                                                    │
│     ├─── 2xx Success ─────────────────────▶ Return response             │
│     │                                                                    │
│     └─── 403 Forbidden ──┐                                              │
│                          ▼                                               │
│                    Invalidate cache                                      │
│                    Fetch new crumb                                       │
│                    Retry request (once)                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
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
│   │ Request ───────────────────────────────────────▶ Jenkins API   │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   SimulationMode::Recording                                              │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │ Request ────────────────────────────────────▶ Jenkins API      │    │
│   │    │                                               │            │    │
│   │    │ cache_key = SHA256(method + path + body)      ▼            │    │
│   │    │                                          Response          │    │
│   │    │                                               │            │    │
│   │    ▼                                               │            │    │
│   │ ┌────────────────────────────────────────────────┐ │            │    │
│   │ │              Recording Storage                 │◀┘            │    │
│   │ │                                                │              │    │
│   │ │  { cache_key: RecordedResponse }              │              │    │
│   │ │                                                │              │    │
│   │ │        │ Persist                              │              │    │
│   │ │        ▼                                      │              │    │
│   │ │  jenkins_recordings.json                      │              │    │
│   │ └────────────────────────────────────────────────┘              │    │
│   │                                                                 │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   SimulationMode::Replay                                                 │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │ Request                                                         │    │
│   │    │                                                            │    │
│   │    │ cache_key = SHA256(method + path + body)                   │    │
│   │    ▼                                                            │    │
│   │ ┌────────────────────────────────────────────────────┐          │    │
│   │ │              Replay Storage                        │          │    │
│   │ │                                                    │          │    │
│   │ │  Load: jenkins_recordings.json                    │          │    │
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
│   JenkinsError                                                           │
│   ├── API Errors (from Jenkins)                                         │
│   │   ├── BadRequest (400)          → Not retryable                    │
│   │   ├── Unauthorized (401)        → Not retryable, check creds       │
│   │   ├── Forbidden (403)           → Retry once with new crumb        │
│   │   ├── NotFound (404)            → Not retryable                    │
│   │   ├── Conflict (409)            → Not retryable                    │
│   │   ├── InternalError (500)       → Retryable                        │
│   │   └── ServiceUnavailable (503)  → Retryable                        │
│   │                                                                      │
│   ├── Client Errors                                                      │
│   │   ├── InvalidJobRef             → Validation failure               │
│   │   ├── InvalidBuildRef           → Validation failure               │
│   │   ├── InvalidQueueLocation      → Response parsing failure         │
│   │   ├── NoQueueLocation           → Missing Location header          │
│   │   ├── Network                   → Retryable                        │
│   │   └── Timeout                   → Retryable                        │
│   │                                                                      │
│   ├── Crumb Errors                                                       │
│   │   ├── CrumbNotEnabled           → Disable crumb for server        │
│   │   └── CrumbFetchFailed          → Auth/network issue               │
│   │                                                                      │
│   ├── Queue Errors                                                       │
│   │   ├── QueueTimeout              → Polling exceeded timeout         │
│   │   └── QueueCancelled            → Build was cancelled              │
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
┌─────────────────┐
│ Is 403 + POST?  │
└────────┬────────┘
    Yes  │  No
    ┌────┴────────────────────────┐
    ▼                             ▼
┌───────────┐            ┌─────────────────┐
│ Refresh   │            │ is_retryable()? │
│ Crumb     │            └────────┬────────┘
│ Retry x1  │                Yes  │  No
└───────────┘                ┌────┴────┐
                             ▼         ▼
                    ┌──────────┐  ┌──────────┐
                    │ retries  │  │  Return  │
                    │ < max?   │  │  Error   │
                    └────┬─────┘  └──────────┘
                    Yes  │  No
                    ┌────┴────┐
                    ▼         ▼
            ┌──────────┐  ┌──────────┐
            │Exponential│  │  Return  │
            │ Backoff   │  │  Error   │
            │ 1s,2s,4s  │  └──────────┘
            └────┬──────┘
                 │
                 ▼
            ┌──────────┐
            │  Retry   │
            └──────────┘
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
│   │   │  Build Analysis │                                          │    │
│   │   └────────┬────────┘                                          │    │
│   │            │                                                    │    │
│   │            │ Index logs, analyze failures                      │    │
│   │            ▼                                                    │    │
│   │   ┌─────────────────┐     ┌─────────────────┐                  │    │
│   │   │  Vector Memory  │◀────│  Console Output │                  │    │
│   │   │  (Log Index)    │     │   (Streaming)   │                  │    │
│   │   └─────────────────┘     └────────┬────────┘                  │    │
│   │                                    │                            │    │
│   │                           ┌────────┴────────┐                  │    │
│   │                           │ Jenkins Client  │                  │    │
│   │                           └────────┬────────┘                  │    │
│   │                                    │                            │    │
│   │   ┌─────────────────┐              │                            │    │
│   │   │ Workflow Engine │◀─────────────┤ Poll for completion       │    │
│   │   └─────────────────┘              │                            │    │
│   │            │                       │                            │    │
│   │            │ Trigger next steps    │                            │    │
│   │            ▼                       │                            │    │
│   │   ┌─────────────────┐              │                            │    │
│   │   │  Notification   │◀─────────────┤ Alert on failure          │    │
│   │   └─────────────────┘              │                            │    │
│   │                                    │                            │    │
│   └────────────────────────────────────┼────────────────────────────┘    │
│                                        │                                 │
│                                        ▼                                 │
│                               ┌─────────────────┐                       │
│                               │  Jenkins Server │                       │
│                               └─────────────────┘                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Usage Patterns

```rust
// Pattern 1: Trigger and wait for build
async fn trigger_and_wait(
    client: &JenkinsClient,
    job: JobRef,
    params: HashMap<String, String>,
    timeout: Duration,
) -> Result<Build> {
    // Trigger build
    let queue_ref = client.trigger_build(job.clone(), Some(params)).await?;

    // Wait for queue to resolve
    let build_ref = client.wait_for_build(queue_ref, timeout).await?;

    // Poll for completion
    loop {
        let status = client.get_build_status(job.clone(), build_ref.clone()).await?;

        match status {
            BuildStatus::Completed(result) => {
                return client.get_build(job, build_ref).await;
            }
            BuildStatus::Building => {
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
            _ => {}
        }
    }
}

// Pattern 2: Stream logs with analysis
async fn stream_and_analyze(
    client: &JenkinsClient,
    job: JobRef,
    build: BuildRef,
) -> Result<()> {
    let mut stream = client.stream_console_output(job, build);

    while let Some(chunk) = stream.next().await {
        let content = chunk?;

        // Index for search
        vector_store.index(&content).await?;

        // Check for error patterns
        if content.contains("ERROR") || content.contains("FAILED") {
            analyze_error(&content).await?;
        }
    }

    Ok(())
}

// Pattern 3: Pipeline stage monitoring
async fn monitor_pipeline(
    client: &JenkinsClient,
    job: JobRef,
    build: BuildRef,
) -> Result<()> {
    loop {
        let run = client.get_pipeline_run(job.clone(), build.clone()).await?;

        for stage in &run.stages {
            match stage.status {
                StageStatus::Failed => {
                    let logs = client.get_stage_logs(
                        job.clone(), build.clone(), &stage.id
                    ).await?;
                    notify_failure(&stage.name, &logs).await?;
                }
                StageStatus::Paused => {
                    // Handle input step
                    handle_input(&client, &job, &build).await?;
                }
                _ => {}
            }
        }

        if run.status == "FINISHED" {
            break;
        }

        tokio::time::sleep(Duration::from_secs(5)).await;
    }

    Ok(())
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-JENKINS-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*Proceed to Refinement phase upon approval.*
