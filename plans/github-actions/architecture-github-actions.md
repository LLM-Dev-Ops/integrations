# GitHub Actions Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/github/actions`

---

## 1. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM Dev Ops Platform                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Orchestration Layer                            │  │
│  │  - CI/CD coordination                                             │  │
│  │  - Pipeline monitoring                                            │  │
│  │  - Deployment automation                                          │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
│                              │                                          │
│  ┌───────────────────────────▼──────────────────────────────────────┐  │
│  │             GitHub Actions Integration Module                     │  │
│  │  - Thin adapter layer                                             │  │
│  │  - Workflow dispatch & monitoring                                 │  │
│  │  - Job/artifact management                                        │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               │ HTTPS/REST
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           GitHub Platform                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │  Actions API    │  │  Webhooks       │  │  Runners        │        │
│  │  - Workflows    │  │  - Events       │  │  (Out of scope) │        │
│  │  - Runs/Jobs    │  │  - Signatures   │  │                 │        │
│  │  - Artifacts    │  │                 │  │                 │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Container Diagram (C4 Level 2)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                      GitHub Actions Integration Module                      │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │ WorkflowService │  │WorkflowRunServic│  │   JobService    │            │
│  │                 │  │                 │  │                 │            │
│  │ - list          │  │ - dispatch      │  │ - list_jobs     │            │
│  │ - get           │  │ - list_runs     │  │ - get_job       │            │
│  │ - enable/disable│  │ - get_run       │  │ - get_logs      │            │
│  └────────┬────────┘  │ - wait          │  └────────┬────────┘            │
│           │           │ - rerun/cancel  │           │                     │
│           │           └────────┬────────┘           │                     │
│           │                    │                    │                     │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌───────┴─────────┐           │
│  │ ArtifactService │  │   LogService    │  │EnvironmentServ │           │
│  │                 │  │                 │  │                 │           │
│  │ - list          │  │ - get_run_logs  │  │ - list          │           │
│  │ - download      │  │ - stream_logs   │  │ - get_pending   │           │
│  │ - delete        │  │ - delete        │  │ - approve       │           │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│           │                    │                    │                     │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌───────┴─────────┐           │
│  │ VariableService │  │  CacheService   │  │  SecretService  │           │
│  │                 │  │                 │  │                 │           │
│  │ - list/get      │  │ - list          │  │ - list          │           │
│  │ - create/update │  │ - delete        │  │ - exists        │           │
│  │ - delete        │  │ - get_usage     │  │                 │           │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│           │                    │                    │                     │
│           └────────────────────┼────────────────────┘                     │
│                                │                                          │
│  ┌─────────────────────────────▼─────────────────────────────────────┐   │
│  │                       ActionsClient (Core)                         │   │
│  │  - Request execution with adaptive rate limiting                   │   │
│  │  - Response parsing                                                │   │
│  │  - Error mapping                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                │                                          │
│  ┌─────────────────────────────▼─────────────────────────────────────┐   │
│  │                       WebhookHandler                               │   │
│  │  - Signature validation                                            │   │
│  │  - Event parsing                                                   │   │
│  │  - Dispatch to handlers                                            │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
                                │
      ┌─────────────────────────┼─────────────────────────┐
      ▼                         ▼                         ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│  github/auth  │      │shared/resilien│      │shared/observab│
│               │      │               │      │               │
│ - GitHub App  │      │ - Retry       │      │ - Metrics     │
│ - PAT         │      │ - Circuit     │      │ - Tracing     │
│ - OAuth       │      │ - Rate limit  │      │ - Logging     │
└───────────────┘      └───────────────┘      └───────────────┘
```

---

## 3. Component Diagram (C4 Level 3)

### 3.1 Core Client Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            ActionsClient                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        RequestExecutor                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │AuthIntercepto│  │AdaptiveRate  │  │MetricsInterc │          │   │
│  │  │   - Token    │  │  Limiter     │  │  - Latency   │          │   │
│  │  │   - App auth │  │  - X-Rate*   │  │  - Counters  │          │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │   │
│  │         └─────────────────┼─────────────────┘                   │   │
│  │                           ▼                                      │   │
│  │              ┌──────────────────────┐                           │   │
│  │              │     HttpTransport    │                           │   │
│  │              │  - Connection pool   │                           │   │
│  │              │  - Redirect handling │                           │   │
│  │              │  - Stream support    │                           │   │
│  │              └──────────────────────┘                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ResponseProcessor                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │  JsonParser  │  │ ErrorMapper  │  │ TypeRegistry │          │   │
│  │  │  - Serde     │  │  - Status    │  │  - Workflow  │          │   │
│  │  │  - Streaming │  │  - Headers   │  │  - Run, Job  │          │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      RepositoryContext                           │   │
│  │  - owner: String                                                 │   │
│  │  - repo: String                                                  │   │
│  │  - Build paths with context                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Run Monitoring Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Run Monitoring Pipeline                           │
│                                                                         │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐     │
│  │  Dispatch │───▶│  Poller   │───▶│  Tracker  │───▶│ Notifier  │     │
│  │           │    │           │    │           │    │           │     │
│  │ - Trigger │    │ - Status  │    │ - Jobs    │    │ - Webhook │     │
│  │ - Inputs  │    │ - Polling │    │ - Steps   │    │ - Events  │     │
│  └───────────┘    └───────────┘    └───────────┘    └───────────┘     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      RunStateManager                             │   │
│  │                                                                   │   │
│  │  States: Queued → InProgress → Completed                         │   │
│  │                     ↓            ↓                                │   │
│  │                  Waiting    [Success|Failure|Cancelled|...]      │   │
│  │                     ↓                                             │   │
│  │               (approval)                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       LogStreamer                                │   │
│  │  - Poll-based streaming (no WebSocket)                           │   │
│  │  - Job completion detection                                      │   │
│  │  - Incremental log delivery                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Workflow Dispatch Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Client   │     │  Run     │     │ Request  │     │   Auth   │     │  GitHub  │
│          │     │ Service  │     │ Executor │     │ Provider │     │   API    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ dispatch()     │                │                │                │
     │───────────────▶│                │                │                │
     │                │                │                │                │
     │                │ validate_inputs│                │                │
     │                │────────────────┤                │                │
     │                │                │                │                │
     │                │                │ get_token()    │                │
     │                │                │───────────────▶│                │
     │                │                │                │                │
     │                │                │     token      │                │
     │                │                │◀───────────────│                │
     │                │                │                │                │
     │                │                │ POST /dispatches               │
     │                │                │───────────────────────────────▶│
     │                │                │                │                │
     │                │                │   204 No Content               │
     │                │                │◀───────────────────────────────│
     │                │                │                │                │
     │                │ poll_for_run() │                │                │
     │                │────────────────┤                │                │
     │                │                │                │                │
     │                │                │ GET /runs      │                │
     │                │                │───────────────────────────────▶│
     │                │                │                │                │
     │                │                │    Run data    │                │
     │                │                │◀───────────────────────────────│
     │                │                │                │                │
     │  WorkflowRun   │                │                │                │
     │◀───────────────│                │                │                │
```

### 4.2 Log Streaming Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Client   │     │   Log    │     │   Job    │     │  GitHub  │
│          │     │ Streamer │     │ Service  │     │   API    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ stream_logs()  │                │                │
     │───────────────▶│                │                │
     │                │                │                │
     │                │  ┌─────────────────────────────────────┐
     │                │  │        POLLING LOOP                 │
     │                │  │                                     │
     │                │  │ list_jobs()  │                │     │
     │                │  │─────────────▶│                │     │
     │                │  │              │ GET /jobs      │     │
     │                │  │              │───────────────▶│     │
     │                │  │              │    Jobs        │     │
     │                │  │              │◀───────────────│     │
     │                │  │    Jobs      │                │     │
     │                │  │◀─────────────│                │     │
     │                │  │                                     │
     │                │  │ FOR each completed job:             │
     │                │  │   get_job_logs()                    │
     │                │  │   ──────────────────────────▶       │
     │                │  │                    Logs             │
     │                │  │   ◀──────────────────────────       │
     │                │  │                                     │
     │  LogChunk      │  │                                     │
     │◀───────────────│  │                                     │
     │                │  │                                     │
     │                │  │ IF run.completed: BREAK             │
     │                │  │ ELSE: SLEEP(poll_interval)          │
     │                │  └─────────────────────────────────────┘
     │                │                │                │
     │  Complete      │                │                │
     │◀───────────────│                │                │
```

### 4.3 Webhook Processing Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  GitHub  │     │ Webhook  │     │   Auth   │     │  Event   │
│          │     │ Handler  │     │ Module   │     │ Dispatch │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ POST /webhook  │                │                │
     │───────────────▶│                │                │
     │                │                │                │
     │                │ validate_sig() │                │
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
integrations/github/actions/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public exports
│   ├── client.rs                 # ActionsClient
│   ├── config.rs                 # Configuration types
│   ├── error.rs                  # Error types
│   │
│   ├── services/
│   │   ├── mod.rs
│   │   ├── workflow.rs           # WorkflowService
│   │   ├── run.rs                # WorkflowRunService
│   │   ├── job.rs                # JobService
│   │   ├── artifact.rs           # ArtifactService
│   │   ├── log.rs                # LogService
│   │   ├── environment.rs        # EnvironmentService
│   │   ├── secret.rs             # SecretService
│   │   ├── variable.rs           # VariableService
│   │   ├── cache.rs              # CacheService
│   │   └── webhook.rs            # WebhookHandler
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── workflow.rs           # Workflow, WorkflowState
│   │   ├── run.rs                # WorkflowRun, RunStatus, RunConclusion
│   │   ├── job.rs                # Job, Step, JobStatus
│   │   ├── artifact.rs           # Artifact, ArtifactDownload
│   │   ├── environment.rs        # Environment, Deployment
│   │   ├── secret.rs             # Secret, SecretVisibility
│   │   ├── variable.rs           # Variable, VariableScope
│   │   ├── cache.rs              # ActionCache, CacheUsage
│   │   └── webhook.rs            # WebhookEvent, WebhookPayload
│   │
│   ├── transport/
│   │   ├── mod.rs
│   │   ├── executor.rs           # Request execution
│   │   ├── rate_limiter.rs       # Adaptive rate limiting
│   │   └── stream.rs             # Streaming downloads
│   │
│   ├── monitoring/
│   │   ├── mod.rs
│   │   ├── poller.rs             # Run status polling
│   │   ├── log_streamer.rs       # Log streaming
│   │   └── state_machine.rs      # Run state tracking
│   │
│   └── simulation/
│       ├── mod.rs
│       ├── mock_client.rs        # Mock implementation
│       ├── run_simulator.rs      # Run progression
│       ├── recorder.rs           # Operation recording
│       └── replay.rs             # Replay engine
│
└── tests/
    ├── integration/
    │   ├── workflow_tests.rs
    │   ├── run_tests.rs
    │   └── artifact_tests.rs
    └── unit/
        ├── rate_limiter_tests.rs
        └── state_machine_tests.rs
```

### 5.2 TypeScript Package Structure

```
integrations/github/actions/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # ActionsClient
│   ├── config.ts                 # Configuration types
│   ├── errors.ts                 # Error types
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── WorkflowService.ts
│   │   ├── WorkflowRunService.ts
│   │   ├── JobService.ts
│   │   ├── ArtifactService.ts
│   │   ├── LogService.ts
│   │   ├── EnvironmentService.ts
│   │   ├── SecretService.ts
│   │   ├── VariableService.ts
│   │   ├── CacheService.ts
│   │   └── WebhookHandler.ts
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── workflow.ts
│   │   ├── run.ts
│   │   ├── job.ts
│   │   ├── artifact.ts
│   │   ├── environment.ts
│   │   ├── secret.ts
│   │   ├── variable.ts
│   │   ├── cache.ts
│   │   └── webhook.ts
│   │
│   ├── monitoring/
│   │   ├── index.ts
│   │   ├── RunPoller.ts
│   │   ├── LogStreamer.ts
│   │   └── StateMachine.ts
│   │
│   └── simulation/
│       ├── index.ts
│       ├── MockClient.ts
│       ├── RunSimulator.ts
│       ├── Recorder.ts
│       └── Replayer.ts
│
└── tests/
    ├── services/
    └── monitoring/
```

---

## 6. Interface Contracts

### 6.1 Service Trait (Rust)

```rust
#[async_trait]
pub trait WorkflowRunServiceTrait: Send + Sync {
    async fn dispatch(
        &self,
        workflow_id: WorkflowId,
        request: DispatchRequest,
    ) -> Result<WorkflowRun, ActionsError>;

    async fn list_runs(
        &self,
        options: ListRunsOptions,
    ) -> Result<WorkflowRunList, ActionsError>;

    async fn get_run(&self, run_id: i64) -> Result<WorkflowRun, ActionsError>;

    async fn wait_for_completion(
        &self,
        run_id: i64,
        options: WaitOptions,
    ) -> Result<WorkflowRun, ActionsError>;

    async fn rerun(&self, run_id: i64) -> Result<WorkflowRun, ActionsError>;

    async fn rerun_failed_jobs(&self, run_id: i64) -> Result<WorkflowRun, ActionsError>;

    async fn cancel(&self, run_id: i64) -> Result<(), ActionsError>;
}
```

### 6.2 Service Interface (TypeScript)

```typescript
interface IWorkflowRunService {
    dispatch(workflowId: WorkflowId, request: DispatchRequest): Promise<WorkflowRun>;
    listRuns(options?: ListRunsOptions): Promise<WorkflowRunList>;
    getRun(runId: number): Promise<WorkflowRun>;
    waitForCompletion(runId: number, options?: WaitOptions): Promise<WorkflowRun>;
    rerun(runId: number): Promise<WorkflowRun>;
    rerunFailedJobs(runId: number): Promise<WorkflowRun>;
    cancel(runId: number): Promise<void>;
}
```

---

## 7. Adaptive Rate Limiting Architecture

### 7.1 Rate Limiter Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Adaptive Rate Limiter                              │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Request Flow                                 │   │
│  │                                                                   │   │
│  │  acquire() ──▶ check_budget() ──▶ wait_if_needed() ──▶ proceed   │   │
│  │                      │                                            │   │
│  │                      ▼                                            │   │
│  │              ┌──────────────┐                                    │   │
│  │              │ Token Bucket │                                    │   │
│  │              │  - Remaining │                                    │   │
│  │              │  - Reset     │                                    │   │
│  │              └──────────────┘                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   Response Processing                            │   │
│  │                                                                   │   │
│  │  response ──▶ extract_headers() ──▶ update_state()               │   │
│  │                      │                                            │   │
│  │                      ▼                                            │   │
│  │  Headers:                                                         │   │
│  │    X-RateLimit-Limit: 5000                                       │   │
│  │    X-RateLimit-Remaining: 4998                                   │   │
│  │    X-RateLimit-Reset: 1699876543                                 │   │
│  │    X-RateLimit-Used: 2                                           │   │
│  │    X-RateLimit-Resource: core                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                  Secondary Rate Limit Handling                   │   │
│  │                                                                   │   │
│  │  403 + "secondary rate limit" ──▶ exponential_backoff()          │   │
│  │                                         │                         │   │
│  │                                         ▼                         │   │
│  │                                  Wait: 60s, 120s, 240s...        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Rate Limit State

```
RateLimitState:
  // Primary rate limit
  limit: i32              # Total requests allowed
  remaining: i32          # Remaining requests
  reset_at: DateTime      # When limit resets
  used: i32               # Requests used this period

  // Secondary rate limit tracking
  concurrent_requests: AtomicI32
  last_secondary_limit: Option<DateTime>
  backoff_multiplier: f64

  // Per-resource tracking (optional)
  resources: Map<String, ResourceLimit>
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
│  │  - Same run_id fetched concurrently → single request             │   │
│  │  - TTL: Duration of request                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Short-Term Cache                             │   │
│  │  - Workflow list (5 min TTL)                                     │   │
│  │  - Completed run data (10 min TTL)                               │   │
│  │  - Environment list (5 min TTL)                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      No-Cache Layer                              │   │
│  │  - In-progress run status (always fresh)                         │   │
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
Webhook: workflow_run.*        → Clear run cache entry
Webhook: workflow_job.*        → Clear job cache for run
Workflow enable/disable        → Clear workflow cache
Variable create/update/delete  → Clear variable cache
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
│  Special Handling:                                                      │
│  └── 403 Secondary Rate Limit → Long backoff (60s base)                │
│                                                                         │
│  Permanent Errors (No retry):                                          │
│  ├── 400 Bad Request          → InvalidInputs                          │
│  ├── 401 Unauthorized         → Unauthorized                           │
│  ├── 403 Permission           → AccessDenied                           │
│  ├── 404 Not Found            → *NotFound                              │
│  ├── 409 Conflict             → RunInProgress                          │
│  ├── 410 Gone                 → ArtifactExpired                        │
│  └── 422 Unprocessable        → InvalidInputs/WorkflowDisabled         │
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
│  │                      github/auth Module                           │  │
│  │                                                                   │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │  │
│  │  │   GitHub App    │  │      PAT        │  │     OAuth       │  │  │
│  │  │   Provider      │  │   Provider      │  │   Provider      │  │  │
│  │  │                 │  │                 │  │                 │  │  │
│  │  │ - app_id        │  │ - token         │  │ - token         │  │  │
│  │  │ - private_key   │  │ - scopes        │  │ - refresh       │  │  │
│  │  │ - installation  │  │                 │  │                 │  │  │
│  │  │ - JWT → token   │  │                 │  │                 │  │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │  │
│  │           └────────────────────┼────────────────────┘           │  │
│  │                                ▼                                 │  │
│  │                    ┌─────────────────────┐                      │  │
│  │                    │   AuthProvider      │                      │  │
│  │                    │   (trait/interface) │                      │  │
│  │                    │                     │                      │  │
│  │                    │ get_access_token()  │                      │  │
│  │                    └─────────────────────┘                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  GitHub App Token Lifecycle:                                            │
│  ├── JWT valid for 10 minutes                                          │
│  ├── Installation token valid for 1 hour                               │
│  └── Auto-refresh 5 minutes before expiry                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Permission Model

```
Required Permissions by Operation:
─────────────────────────────────────────────────────────────────────
Operation                    Permission Required
─────────────────────────────────────────────────────────────────────
list_workflows              actions:read
dispatch_workflow           actions:write + contents:read
get_run / list_runs         actions:read
rerun / cancel              actions:write
get_job_logs                actions:read
download_artifact           actions:read
list_environments           actions:read
approve_deployment          actions:write
list_secrets                secrets:read (metadata only)
list_variables              variables:read
create/update_variable      variables:write
delete_cache                actions:write
```

---

## 11. Observability Integration

### 11.1 Metrics

```
Metric Name                              Type        Labels
────────────────────────────────────────────────────────────────────────
actions.requests.total                   Counter     method, path, status
actions.requests.duration_ms             Histogram   method, path
actions.dispatches.total                 Counter     workflow_id
actions.dispatches.success               Counter     workflow_id
actions.runs.status                      Gauge       status, workflow_id
actions.runs.duration_ms                 Histogram   workflow_id, conclusion
actions.jobs.duration_ms                 Histogram   job_name, conclusion
actions.artifacts.downloaded_bytes       Histogram   -
actions.artifacts.deleted                Counter     -
actions.rate_limit.remaining             Gauge       resource
actions.rate_limit.blocked               Counter     type (primary/secondary)
actions.circuit_breaker.state            Gauge       state
actions.webhooks.received                Counter     event_type
```

### 11.2 Tracing Spans

```
Span Name                    Attributes
────────────────────────────────────────────────────────────────────────
actions.request              method, path, status_code, duration_ms
actions.dispatch             workflow_id, ref, input_count
actions.run.wait             run_id, final_status, duration_ms
actions.run.poll             run_id, status
actions.job.get_logs         job_id, log_size_bytes
actions.artifact.download    artifact_id, size_bytes
actions.webhook.process      event_type, action
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-github-actions.md | Complete |
| 2. Pseudocode | pseudocode-github-actions.md | Complete |
| 3. Architecture | architecture-github-actions.md | Complete |
| 4. Refinement | refinement-github-actions.md | Pending |
| 5. Completion | completion-github-actions.md | Pending |

---

*Phase 3: Architecture - Complete*
