# GitLab Pipelines Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gitlab-pipelines`

---

## 1. Module Structure

### 1.1 Directory Layout

```
integrations/gitlab-pipelines/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # GitLabClient core
│   ├── config.rs                 # Configuration types
│   ├── error.rs                  # Error hierarchy
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── token.rs              # Token authentication
│   │   └── scopes.rs             # Scope validation
│   ├── services/
│   │   ├── mod.rs
│   │   ├── pipeline.rs           # Pipeline operations
│   │   ├── job.rs                # Job operations
│   │   ├── artifact.rs           # Artifact operations
│   │   ├── trigger.rs            # Trigger operations
│   │   └── environment.rs        # Environment operations
│   ├── polling/
│   │   ├── mod.rs
│   │   ├── waiter.rs             # Pipeline waiter
│   │   ├── coordinator.rs        # Multi-pipeline coordination
│   │   └── log_streamer.rs       # Log streaming
│   ├── webhook/
│   │   ├── mod.rs
│   │   ├── handler.rs            # Webhook processing
│   │   ├── validator.rs          # Token validation
│   │   └── events.rs             # Event types
│   ├── types/
│   │   ├── mod.rs
│   │   ├── pipeline.rs           # Pipeline types
│   │   ├── job.rs                # Job types
│   │   ├── artifact.rs           # Artifact types
│   │   └── common.rs             # Shared types
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── mock.rs               # Mock client
│   │   ├── recorder.rs           # Call recorder
│   │   └── replayer.rs           # Replay engine
│   └── util/
│       ├── mod.rs
│       ├── rate_limiter.rs       # GitLab rate limiter
│       └── pagination.rs         # Pagination helpers
├── tests/
│   ├── integration/
│   │   ├── pipeline_tests.rs
│   │   ├── job_tests.rs
│   │   ├── artifact_tests.rs
│   │   └── webhook_tests.rs
│   └── unit/
│       ├── auth_tests.rs
│       ├── polling_tests.rs
│       └── rate_limiter_tests.rs
└── typescript/
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── client.ts
    │   ├── services/
    │   └── types/
    └── tests/
```

### 1.2 Component Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                         Public API                               │
│  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌─────────┐ │
│  │ Pipeline │ │   Job   │ │ Artifact │ │ Trigger │ │ Webhook │ │
│  │ Service  │ │ Service │ │ Service  │ │ Service │ │ Handler │ │
│  └────┬─────┘ └────┬────┘ └────┬─────┘ └────┬────┘ └────┬────┘ │
└───────┼────────────┼───────────┼────────────┼───────────┼───────┘
        │            │           │            │           │
        └────────────┴───────────┴────────────┴───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
      ┌───────────────┐ ┌───────────┐ ┌─────────────────┐
      │ PipelineWaiter│ │  Log      │ │   Coordinator   │
      │               │ │ Streamer  │ │ (Multi-Pipeline)│
      └───────┬───────┘ └─────┬─────┘ └────────┬────────┘
              │               │                │
              └───────────────┴────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   GitLabClient    │
                    │  ┌─────────────┐  │
                    │  │ HTTP Client │  │
                    │  └─────────────┘  │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐   ┌─────────▼─────────┐   ┌──────▼──────┐
│ Token Auth    │   │  Rate Limiter     │   │  Circuit    │
│ ┌───────────┐ │   │ (RateLimit-Reset) │   │  Breaker    │
│ │ Personal  │ │   └───────────────────┘   └─────────────┘
│ │ Project   │ │
│ │ Trigger   │ │
│ └───────────┘ │
└───────────────┘
        │
┌───────▼───────────────────────────────────────────────────────┐
│                     Shared Modules                             │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │ credentials  │ │ resilience  │ │     observability       │ │
│  └──────────────┘ └─────────────┘ └─────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 GitLabClient Core

```
┌─────────────────────────────────────────────────────────────┐
│                       GitLabClient                           │
├─────────────────────────────────────────────────────────────┤
│ Configuration                                                │
│ ┌─────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
│ │  base_url   │ │  token_type  │ │    retry_config        │ │
│ └─────────────┘ └──────────────┘ └────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Request Pipeline                                             │
│                                                              │
│  Request → [Auth] → [Rate Limit] → [Circuit] → [HTTP] →     │
│         ← [Parse] ← [Track Limits] ←────────── Response     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Services (Lazy Initialized)                                  │
│ ┌──────────┐ ┌──────┐ ┌──────────┐ ┌─────────┐ ┌─────────┐ │
│ │pipelines │ │ jobs │ │artifacts │ │triggers │ │  envs   │ │
│ └──────────┘ └──────┘ └──────────┘ └─────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Service Layer Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Service Trait                             │
├─────────────────────────────────────────────────────────────┤
│  trait PipelineService {                                     │
│      fn create(&self, project, input) -> Result<Pipeline>   │
│      fn get(&self, project, id) -> Result<Pipeline>         │
│      fn list(&self, project, options) -> Result<Vec<...>>   │
│      fn cancel(&self, project, id) -> Result<Pipeline>      │
│      fn retry(&self, project, id) -> Result<Pipeline>       │
│  }                                                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐      ┌─────────────────────┐       │
│  │ PipelineServiceImpl │      │ MockPipelineService │       │
│  │ (Production)        │      │ (Testing)           │       │
│  └──────────┬──────────┘      └──────────┬──────────┘       │
│             │                            │                   │
│             └────────────┬───────────────┘                   │
│                          │                                   │
│                    implements                                │
│                          │                                   │
│                 ┌────────▼────────┐                         │
│                 │ PipelineService │                         │
│                 │      Trait      │                         │
│                 └─────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Authentication Flow

### 3.1 Token Authentication

```
┌──────────┐                    ┌─────────────┐                ┌──────────┐
│  Client  │                    │  TokenAuth  │                │  GitLab  │
└────┬─────┘                    └──────┬──────┘                └────┬─────┘
     │                                 │                            │
     │ execute_request(req)            │                            │
     │────────────────────────────────▶│                            │
     │                                 │                            │
     │                                 │ determine token type       │
     │                                 │─────────┐                  │
     │                                 │◀────────┘                  │
     │                                 │                            │
     │                                 │ MATCH token_type:          │
     │                                 │  Personal/Project/Group    │
     │                                 │   → PRIVATE-TOKEN header   │
     │                                 │  CIJob                     │
     │                                 │   → JOB-TOKEN header       │
     │                                 │  Trigger                   │
     │                                 │   → token in form body     │
     │                                 │                            │
     │                                 │ authenticated request      │
     │                                 │───────────────────────────▶│
     │                                 │                            │
     │                                 │◀───────────────────────────│
     │◀────────────────────────────────│         response           │
     │                                 │                            │
```

### 3.2 Rate Limit Handling Flow

```
┌──────────┐          ┌──────────────┐          ┌──────────┐
│  Client  │          │ RateLimiter  │          │  GitLab  │
└────┬─────┘          └──────┬───────┘          └────┬─────┘
     │                       │                       │
     │ request               │                       │
     │──────────────────────▶│                       │
     │                       │                       │
     │                       │ check tokens          │
     │                       │─────────┐             │
     │                       │◀────────┘             │
     │                       │                       │
     │                       │ (tokens available)    │
     │                       │──────────────────────▶│
     │                       │                       │
     │                       │◀──────────────────────│
     │                       │ 429 + RateLimit-Reset │
     │                       │                       │
     │                       │ parse reset header    │
     │                       │ schedule backoff      │
     │                       │─────────┐             │
     │                       │◀────────┘             │
     │                       │                       │
     │◀──────────────────────│                       │
     │   Err(RateLimited)    │                       │
     │                       │                       │
     │ (after reset time)    │                       │
     │──────────────────────▶│                       │
     │                       │──────────────────────▶│
     │                       │◀──────────────────────│
     │◀──────────────────────│       200 OK         │
```

---

## 4. Data Flow Diagrams

### 4.1 Pipeline Trigger Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Pipeline Trigger Flow                             │
└──────────────────────────────────────────────────────────────────────────┘

  CreatePipelineInput                                          Pipeline
  ┌────────────────┐                                    ┌──────────────────┐
  │ ref: "main"    │                                    │ id: 123456       │
  │ variables: []  │                                    │ status: pending  │
  └───────┬────────┘                                    │ web_url: "..."   │
          │                                             └────────▲─────────┘
          │                                                      │
          ▼                                                      │
  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │
  │   Validate    │───▶│ Build Request │───▶│  Add Auth     │   │
  │   Ref Format  │    │   JSON Body   │    │   Header      │   │
  └───────────────┘    └───────────────┘    └───────┬───────┘   │
                                                    │           │
                                                    ▼           │
  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │
  │ Record        │◀───│  Parse        │◀───│ POST          │   │
  │ Metrics       │    │  Response     │    │ /pipeline     │   │
  └───────┬───────┘    └───────────────┘    └───────────────┘   │
          │                                                      │
          └──────────────────────────────────────────────────────┘
```

### 4.2 Pipeline Wait Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Pipeline Wait Flow                               │
└──────────────────────────────────────────────────────────────────────────┘

  wait_for_completion(project_id, pipeline_id)

       ┌────────────────────────────────────────────────────────────┐
       │                       Poll Loop                            │
       │                                                            │
       │   ┌─────────────┐                                          │
       │   │ Check       │                                          │
       │   │ Timeout     │──────────▶ Err(Timeout)                  │
       │   └──────┬──────┘   (exceeded)                             │
       │          │                                                 │
       │          ▼ (ok)                                            │
       │   ┌─────────────┐                                          │
       │   │ GET         │                                          │
       │   │ Pipeline    │                                          │
       │   └──────┬──────┘                                          │
       │          │                                                 │
       │          ▼                                                 │
       │   ┌─────────────┐    ┌─────────────┐                       │
       │   │ Status      │───▶│ Callback    │ (if changed)          │
       │   │ Changed?    │    │ Notify      │                       │
       │   └──────┬──────┘    └─────────────┘                       │
       │          │                                                 │
       │          ▼                                                 │
       │   ┌─────────────┐                                          │
       │   │ Terminal    │──────────▶ Ok(Pipeline)                  │
       │   │ Status?     │   (yes)                                  │
       │   └──────┬──────┘                                          │
       │          │ (no)                                            │
       │          ▼                                                 │
       │   ┌─────────────┐                                          │
       │   │ Adaptive    │                                          │
       │   │ Sleep       │────────────────┐                         │
       │   └─────────────┘                │                         │
       │          ▲                       │                         │
       │          └───────────────────────┘                         │
       └────────────────────────────────────────────────────────────┘
```

### 4.3 Log Streaming Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Log Streaming Flow                               │
└──────────────────────────────────────────────────────────────────────────┘

  stream_log(project_id, job_id, callback)

  offset = 0
       │
       ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                         Stream Loop                                     │
  │                                                                         │
  │   ┌─────────────────┐                                                  │
  │   │ GET job status  │                                                  │
  │   └────────┬────────┘                                                  │
  │            │                                                           │
  │            ▼                                                           │
  │   ┌─────────────────┐                                                  │
  │   │ GET /trace      │                                                  │
  │   │ Range: bytes=   │                                                  │
  │   │   {offset}-     │                                                  │
  │   └────────┬────────┘                                                  │
  │            │                                                           │
  │            ▼                                                           │
  │   ┌─────────────────┐    ┌─────────────────┐                           │
  │   │ 206 Partial?    │───▶│ callback.       │                           │
  │   │                 │yes │ on_log_chunk()  │                           │
  │   └────────┬────────┘    └────────┬────────┘                           │
  │            │                      │                                    │
  │            │                      ▼                                    │
  │            │             ┌─────────────────┐                           │
  │            │             │ offset +=       │                           │
  │            │             │ chunk.len()     │                           │
  │            │             └─────────────────┘                           │
  │            ▼                                                           │
  │   ┌─────────────────┐                                                  │
  │   │ Job Terminal?   │──────────▶ callback.on_complete()                │
  │   └────────┬────────┘   (yes)                                          │
  │            │ (no)                                                      │
  │            ▼                                                           │
  │   ┌─────────────────┐                                                  │
  │   │ sleep(interval) │─────────────────────┐                            │
  │   └─────────────────┘                     │                            │
  │            ▲                              │                            │
  │            └──────────────────────────────┘                            │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 5. State Machines

### 5.1 Pipeline Status State Machine

```
                           ┌─────────────────┐
            (trigger)      │                 │
           ───────────────▶│    CREATED      │
                           │                 │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │ WAITING_FOR_    │
                           │   RESOURCE      │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │   PREPARING     │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │    PENDING      │
                           └────────┬────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
           ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
           │   MANUAL    │ │   RUNNING   │ │  SCHEDULED  │
           │ (awaiting)  │ │             │ │             │
           └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                  │               │               │
                  │    ┌──────────┴──────────┐    │
                  │    │                     │    │
                  ▼    ▼                     ▼    ▼
           ┌───────────────┐           ┌───────────────┐
           │    SUCCESS    │           │    FAILED     │
           └───────────────┘           └───────────────┘
                                              │
                                              │ (retry)
                                              ▼
                                       ┌───────────────┐
                                       │   PENDING     │
                                       │   (retry)     │
                                       └───────────────┘

           ┌───────────────┐           ┌───────────────┐
           │   CANCELED    │           │   SKIPPED     │
           │  (user/api)   │           │ (conditions)  │
           └───────────────┘           └───────────────┘

  Terminal States: SUCCESS, FAILED, CANCELED, SKIPPED
  Cancelable: RUNNING, PENDING, WAITING_FOR_RESOURCE, PREPARING
  Retryable: FAILED, CANCELED
```

### 5.2 Job Status State Machine

```
                           ┌─────────────────┐
                           │    CREATED      │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │ WAITING_FOR_    │
                           │   RESOURCE      │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │   PREPARING     │
                           └────────┬────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
           ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
           │   PENDING   │ │   MANUAL    │ │  SKIPPED    │
           │             │ │  (playable) │ │             │
           └──────┬──────┘ └──────┬──────┘ └─────────────┘
                  │               │
                  │         (play)│
                  │               │
                  └───────┬───────┘
                          ▼
                  ┌─────────────┐
                  │   RUNNING   │
                  └──────┬──────┘
                         │
           ┌─────────────┼─────────────┐
           │             │             │
           ▼             ▼             ▼
    ┌───────────┐ ┌───────────┐ ┌───────────┐
    │  SUCCESS  │ │  FAILED   │ │ CANCELED  │
    └───────────┘ └─────┬─────┘ └───────────┘
                        │
                        │ (retry)
                        ▼
                 ┌───────────┐
                 │  PENDING  │
                 └───────────┘
```

### 5.3 Circuit Breaker State Machine

```
                         ┌───────────────────────────────────┐
                         │                                   │
                         │ (success_threshold reached)       │
                         │                                   │
    ┌────────────────────┴────┐                    ┌─────────▼─────────┐
    │                         │                    │                   │
    │       HALF-OPEN         │                    │      CLOSED       │
    │  (testing recovery)     │                    │  (normal ops)     │
    │                         │                    │                   │
    └────────────┬────────────┘                    └─────────┬─────────┘
                 │                                           │
                 │ (failure)                                 │ (failure_threshold)
                 │                                           │
                 │         ┌─────────────────────┐           │
                 │         │                     │           │
                 └────────▶│       OPEN          │◀──────────┘
                           │  (rejecting reqs)   │
                           │                     │
                           └──────────┬──────────┘
                                      │
                                      │ (reset_timeout elapsed)
                                      │
                                      └─────────────────┐
                                                        │
                                      ┌─────────────────▼──┐
                                      │     HALF-OPEN      │
                                      └────────────────────┘
```

---

## 6. Multi-Pipeline Coordination

### 6.1 Coordinator Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Pipeline Coordinator                                 │
└──────────────────────────────────────────────────────────────────────────┘

  Input: [(project_1, pipeline_1), (project_2, pipeline_2), ...]

  ┌─────────────────────────────────────────────────────────────────────┐
  │                     Concurrent Waiters                               │
  │                                                                      │
  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
  │   │  Waiter 1   │  │  Waiter 2   │  │  Waiter N   │                 │
  │   │  (p1, pl1)  │  │  (p2, pl2)  │  │  (pN, plN)  │                 │
  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
  │          │                │                │                         │
  │          │ poll           │ poll           │ poll                    │
  │          ▼                ▼                ▼                         │
  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
  │   │  GitLab     │  │  GitLab     │  │  GitLab     │                 │
  │   │  API        │  │  API        │  │  API        │                 │
  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
  │          │                │                │                         │
  │          └────────────────┼────────────────┘                         │
  │                           │                                          │
  │                           ▼                                          │
  │                  ┌─────────────────┐                                 │
  │                  │ join_all()      │                                 │
  │                  │ Aggregate       │                                 │
  │                  └────────┬────────┘                                 │
  │                           │                                          │
  └───────────────────────────┼──────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Results:        │
                    │ - pipelines: [] │
                    │ - errors: []    │
                    └─────────────────┘
```

### 6.2 Downstream Pipeline Triggering

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Downstream Pipeline Flow                               │
└──────────────────────────────────────────────────────────────────────────┘

  Upstream Pipeline (Project A)
  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │  build ──────▶ test ──────▶ trigger_downstream ──────▶ deploy         │
  │                                     │                                  │
  └─────────────────────────────────────┼──────────────────────────────────┘
                                        │
                                        │ trigger with variables
                                        │ - UPSTREAM_PIPELINE_ID
                                        │ - UPSTREAM_COMMIT_SHA
                                        ▼
  Downstream Pipeline (Project B)
  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │  setup ──────▶ integration_test ──────▶ report                        │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘

  Coordination Pattern:
  ┌───────────────────────────────────────────────────────────────────────┐
  │ 1. Trigger upstream pipeline                                          │
  │ 2. Wait for upstream completion                                       │
  │ 3. If success, trigger downstream with upstream context               │
  │ 4. Wait for downstream completion                                     │
  │ 5. Aggregate results                                                  │
  └───────────────────────────────────────────────────────────────────────┘
```

---

## 7. Webhook Architecture

### 7.1 Webhook Processing Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Webhook Processing Pipeline                           │
└──────────────────────────────────────────────────────────────────────────┘

  Incoming Webhook
  ┌───────────────────────────────────────────────────────────────────────┐
  │ Headers:                                                               │
  │   X-Gitlab-Event: Pipeline Hook                                       │
  │   X-Gitlab-Token: <secret>                                            │
  │ Body: { "object_kind": "pipeline", ... }                              │
  └───────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │                        Validation Layer                                │
  │                                                                        │
  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐   │
  │  │ Token Check     │───▶│ Parse Event     │───▶│ Validate        │   │
  │  │ X-Gitlab-Token  │    │ Type            │    │ Payload         │   │
  │  └─────────────────┘    └─────────────────┘    └─────────────────┘   │
  │          │                                                            │
  │          ▼ (invalid)                                                  │
  │   ┌─────────────┐                                                     │
  │   │ 401 Unauth  │                                                     │
  │   └─────────────┘                                                     │
  └───────────────────────────────┬───────────────────────────────────────┘
                                  │ (valid)
                                  ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │                         Event Router                                   │
  │                                                                        │
  │  object_kind ─────────────────┬────────────────────────────────────   │
  │                               │                                        │
  │      ┌────────────────────────┼────────────────────────┐              │
  │      │                        │                        │              │
  │      ▼                        ▼                        ▼              │
  │ ┌──────────┐           ┌──────────┐           ┌──────────────┐       │
  │ │ pipeline │           │  build   │           │ deployment   │       │
  │ │ handler  │           │ handler  │           │ handler      │       │
  │ └──────────┘           └──────────┘           └──────────────┘       │
  └───────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │                      Event Bus (Publish)                               │
  │  ┌─────────────────────────────────────────────────────────────────┐  │
  │  │ PipelineStatusChanged { project_id, pipeline_id, status, ... }  │  │
  │  └─────────────────────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Architecture

### 8.1 Tracing Hierarchy

```
gitlab.request (root span)
├── gitlab.auth.add_header
├── gitlab.rate_limiter.acquire
├── gitlab.http.execute
│   ├── http.connect
│   └── http.response
└── gitlab.response.parse

gitlab.pipeline.create
├── gitlab.request
└── gitlab.metrics.record

gitlab.pipeline.wait
├── gitlab.pipeline.get (×N polls)
│   └── gitlab.request
├── gitlab.callback.notify (on change)
└── gitlab.metrics.record_duration

gitlab.job.stream_log
├── gitlab.job.get
├── gitlab.job.trace (×N fetches)
└── gitlab.callback.on_chunk (×N)
```

### 8.2 Metrics Collection Points

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Metrics Collection                                │
└─────────────────────────────────────────────────────────────────────────┘

  Pipeline Lifecycle:
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Trigger  │───▶│ Running  │───▶│ Complete │───▶│ Duration │
  │ Counter  │    │ Gauge    │    │ Counter  │    │Histogram │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘

  Job Lifecycle:
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Started  │───▶│ Complete │───▶│ Duration │
  │ Counter  │    │ Counter  │    │Histogram │
  └──────────┘    └──────────┘    └──────────┘

  API Health:
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Rate     │    │ Circuit  │    │ Error    │    │ Latency  │
  │ Limit    │    │ Breaker  │    │ Rate     │    │ p50/p99  │
  │ Remaining│    │ State    │    │ Counter  │    │Histogram │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

---

## 9. Integration Points

### 9.1 Shared Module Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Shared Module Integration                            │
└─────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────┐
  │ GitLab Pipelines  │
  │     Module        │
  └─────────┬─────────┘
            │
            │ uses
            ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                        Shared Modules                                │
  │                                                                      │
  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
  │  │   credentials    │  │    resilience    │  │  observability   │  │
  │  │                  │  │                  │  │                  │  │
  │  │ - SecretString   │  │ - RetryPolicy    │  │ - Tracer         │  │
  │  │ - CredentialStore│  │ - CircuitBreaker │  │ - MetricsRegistry│  │
  │  │ - TokenRotation  │  │ - RateLimiter    │  │ - Logger         │  │
  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
  │                                                                      │
  │  ┌──────────────────┐                                               │
  │  │      http        │                                               │
  │  │                  │                                               │
  │  │ - HttpClient     │                                               │
  │  │ - Request/Resp   │                                               │
  │  │ - TLS config     │                                               │
  │  └──────────────────┘                                               │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Deployment Architecture

### 10.1 Runtime Configuration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Configuration Hierarchy                              │
└─────────────────────────────────────────────────────────────────────────┘

  Priority (highest to lowest):

  1. Environment Variables
     ┌─────────────────────────────────────────────────────────────────┐
     │ GITLAB_BASE_URL=https://gitlab.com                              │
     │ GITLAB_TOKEN=<from secrets manager>                             │
     │ GITLAB_TOKEN_TYPE=personal_access_token                         │
     └─────────────────────────────────────────────────────────────────┘

  2. Configuration File
     ┌─────────────────────────────────────────────────────────────────┐
     │ gitlab:                                                         │
     │   base_url: "https://gitlab.com"                                │
     │   rate_limit_rps: 10                                            │
     │   timeout_seconds: 30                                           │
     │   poll_interval_seconds: 5                                      │
     │   max_wait_minutes: 60                                          │
     │   circuit_breaker:                                              │
     │     failure_threshold: 5                                        │
     │     reset_timeout_seconds: 30                                   │
     └─────────────────────────────────────────────────────────────────┘

  3. Defaults (in code)
     ┌─────────────────────────────────────────────────────────────────┐
     │ const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);      │
     │ const DEFAULT_RATE_LIMIT: u32 = 10;                             │
     │ const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(5); │
     └─────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture |

---

**Next Phase:** Refinement - Edge cases, error recovery, performance optimizations, and security hardening.
