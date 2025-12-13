# Buildkite Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/buildkite`

---

## 1. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM Dev Ops Platform                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Orchestration Layer                            │  │
│  │  - CI/CD coordination                                             │  │
│  │  - Pipeline monitoring                                            │  │
│  │  - Build automation                                               │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
│                              │                                          │
│  ┌───────────────────────────▼──────────────────────────────────────┐  │
│  │               Buildkite Integration Module                        │  │
│  │  - Thin adapter layer                                             │  │
│  │  - Build triggers & monitoring                                    │  │
│  │  - Job/artifact management                                        │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               │ HTTPS/REST
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Buildkite Platform                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │   REST API v2   │  │   Webhooks      │  │   Agents        │        │
│  │  - Pipelines    │  │  - Build events │  │  (Out of scope) │        │
│  │  - Builds/Jobs  │  │  - Job events   │  │                 │        │
│  │  - Artifacts    │  │                 │  │                 │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Container Diagram (C4 Level 2)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       Buildkite Integration Module                          │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │ OrganizationSvc │  │  PipelineService│  │  BuildService   │            │
│  │                 │  │                 │  │                 │            │
│  │ - list_orgs     │  │ - list          │  │ - create        │            │
│  │ - get_org       │  │ - get           │  │ - list/get      │            │
│  └────────┬────────┘  │ - get_builds    │  │ - cancel        │            │
│           │           └────────┬────────┘  │ - rebuild       │            │
│           │                    │           │ - wait          │            │
│           │                    │           └────────┬────────┘            │
│           │                    │                    │                     │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌───────┴─────────┐           │
│  │   JobService    │  │ ArtifactService │  │AnnotationServic│           │
│  │                 │  │                 │  │                 │           │
│  │ - list/get      │  │ - list          │  │ - list          │           │
│  │ - retry         │  │ - download      │  │ - create        │           │
│  │ - unblock       │  │ - list_by_job   │  │ - delete        │           │
│  │ - get_log       │  │                 │  │                 │           │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│           │                    │                    │                     │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌───────┴─────────┐           │
│  │ MetadataService │  │  ClusterService │  │   AgentService  │           │
│  │                 │  │                 │  │   (read-only)   │           │
│  │ - get/set       │  │ - list_clusters │  │ - list          │           │
│  │ - list_keys     │  │ - list_queues   │  │ - get           │           │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│           │                    │                    │                     │
│           └────────────────────┼────────────────────┘                     │
│                                │                                          │
│  ┌─────────────────────────────▼─────────────────────────────────────┐   │
│  │                      BuildkiteClient (Core)                        │   │
│  │  - Request execution                                               │   │
│  │  - Response parsing                                                │   │
│  │  - Error mapping                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                │                                          │
│  ┌─────────────────────────────▼─────────────────────────────────────┐   │
│  │                       WebhookHandler                               │   │
│  │  - Token validation                                                │   │
│  │  - Event parsing                                                   │   │
│  │  - Dispatch to handlers                                            │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
                                │
      ┌─────────────────────────┼─────────────────────────┐
      ▼                         ▼                         ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ buildkite/auth│      │shared/resilien│      │shared/observab│
│               │      │               │      │               │
│ - API Token   │      │ - Retry       │      │ - Metrics     │
│ - Webhook tok │      │ - Circuit     │      │ - Tracing     │
│               │      │ - Rate limit  │      │ - Logging     │
└───────────────┘      └───────────────┘      └───────────────┘
```

---

## 3. Component Diagram (C4 Level 3)

### 3.1 Core Client Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          BuildkiteClient                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        RequestExecutor                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │AuthIntercepto│  │RetryIntercept│  │MetricsInterc │          │   │
│  │  │   - Bearer   │  │  - Backoff   │  │  - Latency   │          │   │
│  │  │   - Token    │  │  - Jitter    │  │  - Counters  │          │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │   │
│  │         └─────────────────┼─────────────────┘                   │   │
│  │                           ▼                                      │   │
│  │              ┌──────────────────────┐                           │   │
│  │              │     HttpTransport    │                           │   │
│  │              │  - Connection pool   │                           │   │
│  │              │  - Link header parse │                           │   │
│  │              │  - Stream support    │                           │   │
│  │              └──────────────────────┘                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ResponseProcessor                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │  JsonParser  │  │ ErrorMapper  │  │ TypeRegistry │          │   │
│  │  │  - Serde     │  │  - Status    │  │  - Build     │          │   │
│  │  │              │  │  - Body      │  │  - Job       │          │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    OrganizationContext                           │   │
│  │  - org_slug: String                                              │   │
│  │  - Build paths with org context                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Build Monitoring Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Build Monitoring Pipeline                         │
│                                                                         │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐     │
│  │  Trigger  │───▶│  Poller   │───▶│  Tracker  │───▶│ Notifier  │     │
│  │           │    │           │    │           │    │           │     │
│  │ - Create  │    │ - Status  │    │ - Jobs    │    │ - Webhook │     │
│  │ - Rebuild │    │ - Polling │    │ - State   │    │ - Events  │     │
│  └───────────┘    └───────────┘    └───────────┘    └───────────┘     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     BuildStateManager                            │   │
│  │                                                                   │   │
│  │  States: Scheduled → Running → [Terminal]                        │   │
│  │                ↓          ↓                                       │   │
│  │             Blocked   Canceling                                   │   │
│  │                ↓          ↓                                       │   │
│  │           (unblock)   Canceled                                    │   │
│  │                                                                   │   │
│  │  Terminal: Passed | Failed | Canceled | Skipped | NotRun         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       LogStreamer                                │   │
│  │  - Poll-based streaming                                          │   │
│  │  - Job completion detection                                      │   │
│  │  - Incremental log delivery                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Build Creation Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Client   │     │  Build   │     │ Request  │     │   Auth   │     │Buildkite │
│          │     │ Service  │     │ Executor │     │ Provider │     │   API    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ create_build() │                │                │                │
     │───────────────▶│                │                │                │
     │                │                │                │                │
     │                │ validate()     │                │                │
     │                │────────────────┤                │                │
     │                │                │                │                │
     │                │                │ get_token()    │                │
     │                │                │───────────────▶│                │
     │                │                │                │                │
     │                │                │     token      │                │
     │                │                │◀───────────────│                │
     │                │                │                │                │
     │                │                │ POST /builds   │                │
     │                │                │───────────────────────────────▶│
     │                │                │                │                │
     │                │                │   201 Created  │                │
     │                │                │◀───────────────────────────────│
     │                │                │                │                │
     │                │  parse_build() │                │                │
     │                │◀───────────────│                │                │
     │                │                │                │                │
     │      Build     │                │                │                │
     │◀───────────────│                │                │                │
```

### 4.2 Job Unblock Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Client   │     │   Job    │     │  Build   │     │Buildkite │
│          │     │ Service  │     │ Service  │     │   API    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ unblock_job()  │                │                │
     │───────────────▶│                │                │
     │                │                │                │
     │                │ validate_job_type()             │
     │                │────────────────┤                │
     │                │                │                │
     │                │ PUT /unblock   │                │
     │                │───────────────────────────────▶│
     │                │                │                │
     │                │     Job        │                │
     │                │◀───────────────────────────────│
     │                │                │                │
     │                │ refresh_build()│                │
     │                │───────────────▶│                │
     │                │                │ GET /build     │
     │                │                │───────────────▶│
     │                │                │     Build      │
     │                │                │◀───────────────│
     │                │                │                │
     │      Job       │                │                │
     │◀───────────────│                │                │
```

### 4.3 Webhook Processing Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Buildkite │     │ Webhook  │     │   Auth   │     │  Event   │
│          │     │ Handler  │     │ Module   │     │ Dispatch │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ POST /webhook  │                │                │
     │───────────────▶│                │                │
     │                │                │                │
     │                │ validate_token()                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │     valid      │                │
     │                │◀───────────────│                │
     │                │                │                │
     │                │ parse_event()  │                │
     │                │────────────────┤                │
     │                │                │                │
     │                │           dispatch()            │
     │                │───────────────────────────────▶│
     │                │                │                │
     │                │                │  handler(event)│
     │                │                │───────────────▶│
     │                │                │                │
     │   200 OK       │                │                │
     │◀───────────────│                │                │
```

---

## 5. Module Structure

### 5.1 Rust Crate Structure

```
integrations/buildkite/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public exports
│   ├── client.rs                 # BuildkiteClient
│   ├── config.rs                 # Configuration types
│   ├── error.rs                  # Error types
│   │
│   ├── services/
│   │   ├── mod.rs
│   │   ├── organization.rs       # OrganizationService
│   │   ├── pipeline.rs           # PipelineService
│   │   ├── build.rs              # BuildService
│   │   ├── job.rs                # JobService
│   │   ├── artifact.rs           # ArtifactService
│   │   ├── annotation.rs         # AnnotationService
│   │   ├── metadata.rs           # MetadataService
│   │   ├── cluster.rs            # ClusterService
│   │   ├── agent.rs              # AgentService
│   │   └── webhook.rs            # WebhookHandler
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── organization.rs       # Organization
│   │   ├── pipeline.rs           # Pipeline, PipelineStep
│   │   ├── build.rs              # Build, BuildState, CreateBuildRequest
│   │   ├── job.rs                # Job, JobState, JobType
│   │   ├── artifact.rs           # Artifact, ArtifactState
│   │   ├── annotation.rs         # Annotation, AnnotationStyle
│   │   ├── cluster.rs            # Cluster, Queue
│   │   ├── agent.rs              # Agent, ConnectionState
│   │   └── webhook.rs            # WebhookEvent, WebhookPayload
│   │
│   ├── transport/
│   │   ├── mod.rs
│   │   ├── executor.rs           # Request execution
│   │   ├── pagination.rs         # Link header parsing
│   │   └── stream.rs             # Streaming downloads
│   │
│   ├── monitoring/
│   │   ├── mod.rs
│   │   ├── poller.rs             # Build status polling
│   │   ├── log_streamer.rs       # Log streaming
│   │   └── state_machine.rs      # Build/Job state tracking
│   │
│   └── simulation/
│       ├── mod.rs
│       ├── mock_client.rs        # Mock implementation
│       ├── build_simulator.rs    # Build progression
│       ├── recorder.rs           # Operation recording
│       └── replay.rs             # Replay engine
│
└── tests/
    ├── integration/
    │   ├── build_tests.rs
    │   ├── job_tests.rs
    │   └── artifact_tests.rs
    └── unit/
        ├── pagination_tests.rs
        └── state_machine_tests.rs
```

### 5.2 TypeScript Package Structure

```
integrations/buildkite/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # BuildkiteClient
│   ├── config.ts                 # Configuration types
│   ├── errors.ts                 # Error types
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── OrganizationService.ts
│   │   ├── PipelineService.ts
│   │   ├── BuildService.ts
│   │   ├── JobService.ts
│   │   ├── ArtifactService.ts
│   │   ├── AnnotationService.ts
│   │   ├── MetadataService.ts
│   │   ├── ClusterService.ts
│   │   ├── AgentService.ts
│   │   └── WebhookHandler.ts
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── organization.ts
│   │   ├── pipeline.ts
│   │   ├── build.ts
│   │   ├── job.ts
│   │   ├── artifact.ts
│   │   ├── annotation.ts
│   │   ├── cluster.ts
│   │   ├── agent.ts
│   │   └── webhook.ts
│   │
│   ├── monitoring/
│   │   ├── index.ts
│   │   ├── BuildPoller.ts
│   │   ├── LogStreamer.ts
│   │   └── StateMachine.ts
│   │
│   └── simulation/
│       ├── index.ts
│       ├── MockClient.ts
│       ├── BuildSimulator.ts
│       ├── Recorder.ts
│       └── Replayer.ts
│
└── tests/
    ├── services/
    ├── monitoring/
    └── simulation/
```

---

## 6. Interface Contracts

### 6.1 Service Trait (Rust)

```rust
#[async_trait]
pub trait BuildServiceTrait: Send + Sync {
    async fn create_build(
        &self,
        pipeline_slug: &str,
        request: CreateBuildRequest,
    ) -> Result<Build, BuildkiteError>;

    async fn list_builds(
        &self,
        options: ListBuildsOptions,
    ) -> Result<BuildList, BuildkiteError>;

    async fn get_build(
        &self,
        pipeline_slug: &str,
        build_number: i32,
    ) -> Result<Build, BuildkiteError>;

    async fn cancel_build(
        &self,
        pipeline_slug: &str,
        build_number: i32,
    ) -> Result<Build, BuildkiteError>;

    async fn rebuild(
        &self,
        pipeline_slug: &str,
        build_number: i32,
    ) -> Result<Build, BuildkiteError>;

    async fn wait_for_completion(
        &self,
        pipeline_slug: &str,
        build_number: i32,
        options: WaitOptions,
    ) -> Result<Build, BuildkiteError>;
}
```

### 6.2 Service Interface (TypeScript)

```typescript
interface IBuildService {
    createBuild(pipelineSlug: string, request: CreateBuildRequest): Promise<Build>;
    listBuilds(options?: ListBuildsOptions): Promise<BuildList>;
    getBuild(pipelineSlug: string, buildNumber: number): Promise<Build>;
    cancelBuild(pipelineSlug: string, buildNumber: number): Promise<Build>;
    rebuild(pipelineSlug: string, buildNumber: number): Promise<Build>;
    waitForCompletion(
        pipelineSlug: string,
        buildNumber: number,
        options?: WaitOptions
    ): Promise<Build>;
}
```

---

## 7. Pagination Architecture

### 7.1 Link Header Parsing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Pagination Architecture                          │
│                                                                         │
│  Response Headers:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Link: <https://api.buildkite.com/v2/...?page=2>; rel="next",   │   │
│  │        <https://api.buildkite.com/v2/...?page=5>; rel="last"    │   │
│  │  X-Total-Count: 142                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     LinkHeaderParser                             │   │
│  │  - Extract rel="next" URL                                        │   │
│  │  - Extract rel="prev" URL                                        │   │
│  │  - Extract rel="first" URL                                       │   │
│  │  - Extract rel="last" URL                                        │   │
│  │  - Parse page number from URL                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      PaginatedList<T>                            │   │
│  │  - items: Vec<T>                                                 │   │
│  │  - next_page: Option<u32>                                        │   │
│  │  - prev_page: Option<u32>                                        │   │
│  │  - total_count: Option<u32>                                      │   │
│  │  - has_next(): bool                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Auto-Pagination Iterator

```
FUNCTION fetch_all_pages<T>(
    client: BuildkiteClient,
    initial_request: Fn() -> PaginatedList<T>
) -> Vec<T>:
    all_items = []
    current_page = 1

    WHILE true:
        result = initial_request(page: current_page)
        all_items.extend(result.items)

        IF result.next_page IS null:
            BREAK

        current_page = result.next_page

        // Safety limit
        IF all_items.length > 10000:
            LOG.warn("Large result set, stopping pagination")
            BREAK

    RETURN all_items
```

---

## 8. Caching Architecture

### 8.1 Cache Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Cache Architecture                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Request Deduplication                        │   │
│  │  - In-flight request coalescing                                  │   │
│  │  - Same build fetched concurrently → single request              │   │
│  │  - TTL: Duration of request                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Short-Term Cache                             │   │
│  │  - Pipeline list (5 min TTL)                                     │   │
│  │  - Completed build data (30 min TTL)                             │   │
│  │  - Cluster/Queue list (10 min TTL)                               │   │
│  │  - Agent list (1 min TTL)                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      No-Cache Layer                              │   │
│  │  - In-progress build status (always fresh)                       │   │
│  │  - Job status during execution (always fresh)                    │   │
│  │  - Artifact content (stream, no cache)                           │   │
│  │  - Logs (stream, no cache)                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Cache Invalidation

```
Event                          → Invalidation
─────────────────────────────────────────────────
Webhook: build.finished        → Clear build cache entry
Webhook: job.finished          → Clear job cache for build
Webhook: agent.*               → Clear agent cache
Build create/cancel            → Clear pipeline builds cache
Manual cache clear             → Clear all caches
```

---

## 9. Resilience Architecture

### 9.1 Retry Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Retry Configuration                            │
│                                                                         │
│  Transient Errors (Retry with backoff):                                │
│  ├── 429 Rate Limited         → Wait per Retry-After header           │
│  ├── 500 Internal Error       → Exponential backoff (1s, 2s, 4s)       │
│  ├── 502 Bad Gateway          → Exponential backoff                    │
│  ├── 503 Service Unavailable  → Exponential backoff                    │
│  └── 504 Gateway Timeout      → Exponential backoff                    │
│                                                                         │
│  Permanent Errors (No retry):                                          │
│  ├── 400 Bad Request          → InvalidBuildRequest                    │
│  ├── 401 Unauthorized         → Unauthorized                           │
│  ├── 403 Forbidden            → AccessDenied                           │
│  ├── 404 Not Found            → *NotFound                              │
│  └── 422 Unprocessable        → BuildAlreadyFinished/JobNotBlockable   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Circuit Breaker States

```
       ┌──────────────────────────────────────────────────────────┐
       │                                                          │
       ▼                                                          │
┌─────────────┐    5 failures    ┌─────────────┐    timeout     │
│   CLOSED    │─────────────────▶│    OPEN     │────────────────┤
│             │                  │             │                │
│ All requests│                  │Fail fast all│                │
│   allowed   │                  │  requests   │                │
└─────────────┘                  └──────┬──────┘                │
       ▲                                │                        │
       │                                │ 30s timeout            │
       │                                ▼                        │
       │                         ┌─────────────┐                 │
       │         success         │  HALF-OPEN  │    failure     │
       └─────────────────────────│             │─────────────────┘
                                 │Allow 1 test │
                                 │  request    │
                                 └─────────────┘
```

---

## 10. Security Architecture

### 10.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Authentication Architecture                        │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     buildkite/auth Module                         │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │                    API Token Provider                        │ │  │
│  │  │                                                              │ │  │
│  │  │  - Token stored as SecretString                              │ │  │
│  │  │  - Bearer token authentication                               │ │  │
│  │  │  - Scopes: read_builds, write_builds, read_pipelines, etc.  │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │                  Webhook Token Validator                     │ │  │
│  │  │                                                              │ │  │
│  │  │  - Timing-safe comparison                                    │ │  │
│  │  │  - Token from X-Buildkite-Token header                       │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Permission Model

```
Required Permissions by Operation:
─────────────────────────────────────────────────────────────────────
Operation                    Token Scope Required
─────────────────────────────────────────────────────────────────────
list_pipelines              read_pipelines
get_pipeline                read_pipelines
list_builds                 read_builds
get_build                   read_builds
create_build                write_builds
cancel_build                write_builds
rebuild                     write_builds
get_job                     read_builds
retry_job                   write_builds
unblock_job                 write_builds
get_job_log                 read_builds
list_artifacts              read_artifacts
download_artifact           read_artifacts
list_agents                 read_agents
get_agent                   read_agents
```

---

## 11. Observability Integration

### 11.1 Metrics

```
Metric Name                              Type        Labels
────────────────────────────────────────────────────────────────────────
buildkite.requests.total                 Counter     method, path, status
buildkite.requests.duration_ms           Histogram   method, path
buildkite.builds.created                 Counter     pipeline, branch
buildkite.builds.cancelled               Counter     pipeline
buildkite.builds.rebuilt                 Counter     pipeline
buildkite.builds.state                   Gauge       pipeline, state
buildkite.builds.duration_ms             Histogram   pipeline, state
buildkite.jobs.retried                   Counter     pipeline
buildkite.jobs.unblocked                 Counter     pipeline
buildkite.jobs.duration_ms               Histogram   job_type, state
buildkite.artifacts.download_bytes       Histogram   -
buildkite.rate_limit.remaining           Gauge       -
buildkite.circuit_breaker.state          Gauge       state
buildkite.webhooks.received              Counter     event_type
```

### 11.2 Tracing Spans

```
Span Name                    Attributes
────────────────────────────────────────────────────────────────────────
buildkite.request            method, path, status_code, duration_ms
buildkite.build.create       pipeline, branch, commit
buildkite.build.wait         pipeline, build_number, final_state, duration_ms
buildkite.job.unblock        pipeline, build_number, job_id
buildkite.artifact.download  artifact_id, size_bytes
buildkite.webhook.process    event_type
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-buildkite.md | Complete |
| 2. Pseudocode | pseudocode-buildkite.md | Complete |
| 3. Architecture | architecture-buildkite.md | Complete |
| 4. Refinement | refinement-buildkite.md | Pending |
| 5. Completion | completion-buildkite.md | Pending |

---

*Phase 3: Architecture - Complete*
