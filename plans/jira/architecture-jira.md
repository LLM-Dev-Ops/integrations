# Jira Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/jira`

---

## 1. Module Structure

### 1.1 Directory Layout

```
integrations/jira/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # JiraClient core
│   ├── config.rs                 # Configuration types
│   ├── error.rs                  # Error hierarchy
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── api_token.rs          # Basic auth provider
│   │   ├── oauth.rs              # OAuth 2.0 provider
│   │   └── connect_jwt.rs        # Atlassian Connect JWT
│   ├── services/
│   │   ├── mod.rs
│   │   ├── issue.rs              # Issue CRUD + transitions
│   │   ├── search.rs             # JQL search
│   │   ├── comment.rs            # Comment operations
│   │   ├── attachment.rs         # Attachment operations
│   │   ├── bulk.rs               # Bulk operations
│   │   └── link.rs               # Issue link operations
│   ├── webhook/
│   │   ├── mod.rs
│   │   ├── handler.rs            # Webhook processing
│   │   ├── validator.rs          # Signature validation
│   │   └── events.rs             # Event types
│   ├── types/
│   │   ├── mod.rs
│   │   ├── issue.rs              # Issue types
│   │   ├── field.rs              # Field types
│   │   ├── user.rs               # User types
│   │   ├── project.rs            # Project types
│   │   ├── transition.rs         # Workflow types
│   │   └── adf.rs                # Atlassian Document Format
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── mock.rs               # Mock client
│   │   ├── recorder.rs           # Call recorder
│   │   └── replayer.rs           # Replay engine
│   └── util/
│       ├── mod.rs
│       ├── rate_limiter.rs       # Token bucket
│       └── jql.rs                # JQL utilities
├── tests/
│   ├── integration/
│   │   ├── issue_tests.rs
│   │   ├── search_tests.rs
│   │   ├── webhook_tests.rs
│   │   └── bulk_tests.rs
│   └── unit/
│       ├── auth_tests.rs
│       ├── adf_tests.rs
│       └── jql_tests.rs
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
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐ │
│  │ Issue   │ │ Search  │ │ Comment │ │  Bulk   │ │  Webhook  │ │
│  │ Service │ │ Service │ │ Service │ │ Service │ │  Handler  │ │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └─────┬─────┘ │
└───────┼──────────┼──────────┼──────────┼─────────────┼─────────┘
        │          │          │          │             │
        └──────────┴──────────┴──────────┴─────────────┘
                              │
                    ┌─────────▼─────────┐
                    │    JiraClient     │
                    │  ┌─────────────┐  │
                    │  │ HTTP Client │  │
                    │  └─────────────┘  │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐   ┌─────────▼─────────┐   ┌──────▼──────┐
│ Auth Provider │   │  Rate Limiter     │   │  Circuit    │
│ ┌───────────┐ │   │  (Token Bucket)   │   │  Breaker    │
│ │ API Token │ │   └───────────────────┘   └─────────────┘
│ │  OAuth    │ │
│ │   JWT     │ │
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

### 2.1 JiraClient Core

```
┌─────────────────────────────────────────────────────────────┐
│                       JiraClient                             │
├─────────────────────────────────────────────────────────────┤
│ Configuration                                                │
│ ┌─────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
│ │  site_url   │ │ auth_method  │ │    retry_config        │ │
│ └─────────────┘ └──────────────┘ └────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Request Pipeline                                             │
│                                                              │
│  Request → [Auth] → [Rate Limit] → [Circuit] → [HTTP] →     │
│         ← [Parse] ← [Retry] ←──────────────── Response      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Services (Lazy Initialized)                                  │
│ ┌─────────┐ ┌────────┐ ┌─────────┐ ┌──────┐ ┌────────────┐ │
│ │ issues  │ │ search │ │comments │ │ bulk │ │attachments │ │
│ └─────────┘ └────────┘ └─────────┘ └──────┘ └────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Service Layer Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Service Trait                             │
├─────────────────────────────────────────────────────────────┤
│  trait IssueService {                                        │
│      fn create(&self, input) -> Result<Issue>               │
│      fn get(&self, key) -> Result<Issue>                    │
│      fn update(&self, key, input) -> Result<()>             │
│      fn delete(&self, key) -> Result<()>                    │
│      fn transition(&self, key, input) -> Result<()>         │
│  }                                                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐      ┌─────────────────────┐       │
│  │ IssueServiceImpl    │      │  MockIssueService   │       │
│  │ (Production)        │      │  (Testing)          │       │
│  └──────────┬──────────┘      └──────────┬──────────┘       │
│             │                            │                   │
│             └────────────┬───────────────┘                   │
│                          │                                   │
│                    implements                                │
│                          │                                   │
│                 ┌────────▼────────┐                         │
│                 │  IssueService   │                         │
│                 │     Trait       │                         │
│                 └─────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Authentication Flow

### 3.1 API Token Authentication

```
┌──────────┐                    ┌─────────────┐                ┌──────────┐
│  Client  │                    │ AuthProvider│                │  Jira    │
└────┬─────┘                    └──────┬──────┘                └────┬─────┘
     │                                 │                            │
     │ execute_request(req)            │                            │
     │────────────────────────────────▶│                            │
     │                                 │                            │
     │                                 │ add Basic auth header      │
     │                                 │ (base64(email:token))      │
     │                                 │                            │
     │                                 │ authenticated request      │
     │                                 │───────────────────────────▶│
     │                                 │                            │
     │                                 │◀───────────────────────────│
     │◀────────────────────────────────│         response           │
     │                                 │                            │
```

### 3.2 OAuth 2.0 Token Refresh Flow

```
┌──────────┐          ┌──────────────┐          ┌──────────────┐          ┌──────┐
│  Client  │          │ OAuthProvider│          │ Token Server │          │ Jira │
└────┬─────┘          └──────┬───────┘          └──────┬───────┘          └──┬───┘
     │                       │                         │                     │
     │ execute_request(req)  │                         │                     │
     │──────────────────────▶│                         │                     │
     │                       │                         │                     │
     │                       │ check token validity    │                     │
     │                       │─────────┐               │                     │
     │                       │◀────────┘               │                     │
     │                       │ (expired)               │                     │
     │                       │                         │                     │
     │                       │ POST /oauth/token       │                     │
     │                       │ {refresh_token}         │                     │
     │                       │────────────────────────▶│                     │
     │                       │                         │                     │
     │                       │◀────────────────────────│                     │
     │                       │ {access_token, expires} │                     │
     │                       │                         │                     │
     │                       │ cache new token         │                     │
     │                       │─────────┐               │                     │
     │                       │◀────────┘               │                     │
     │                       │                         │                     │
     │                       │ add Bearer header       │                     │
     │                       │─────────────────────────────────────────────▶│
     │                       │                         │                     │
     │◀──────────────────────│◀────────────────────────────────────────────│
     │      response         │                         │                     │
```

---

## 4. Data Flow Diagrams

### 4.1 Issue Creation Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Issue Creation Flow                               │
└──────────────────────────────────────────────────────────────────────────┘

  CreateIssueInput                                              Issue
  ┌────────────────┐                                    ┌──────────────────┐
  │ project_key    │                                    │ id: "10001"      │
  │ issue_type     │                                    │ key: "PROJ-123"  │
  │ summary        │                                    │ fields: {...}    │
  │ description    │                                    └────────▲─────────┘
  │ custom_fields  │                                             │
  └───────┬────────┘                                             │
          │                                                      │
          ▼                                                      │
  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │
  │   Validate    │───▶│ Build Request │───▶│  Add Auth     │   │
  │   Input       │    │   Body (ADF)  │    │   Header      │   │
  └───────────────┘    └───────────────┘    └───────┬───────┘   │
                                                    │           │
                                                    ▼           │
  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │
  │ Return Issue  │◀───│  Fetch Full   │◀───│  POST /issue  │   │
  │               │    │   Issue       │    │               │   │
  └───────────────┘    └───────────────┘    └───────────────┘   │
          │                    │                                 │
          └────────────────────┴─────────────────────────────────┘
```

### 4.2 Workflow Transition Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       Workflow Transition Flow                            │
└──────────────────────────────────────────────────────────────────────────┘

  TransitionInput              Available                     Updated
  ┌──────────────┐            Transitions                    Issue
  │ issue_key    │         ┌──────────────┐             ┌──────────────┐
  │ transition_id│         │ To Do → In   │             │ status: "In  │
  │ fields       │         │   Progress   │             │   Progress"  │
  └──────┬───────┘         │ In Progress  │             └──────▲───────┘
         │                 │   → Done     │                    │
         │                 └──────────────┘                    │
         ▼                        ▲                            │
  ┌──────────────┐                │                            │
  │ GET current  │                │                            │
  │   issue      │────────────────┘                            │
  └──────┬───────┘                                             │
         │                                                     │
         ▼                                                     │
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
  │ GET available│───▶│  Validate    │───▶│    POST      │────┘
  │  transitions │    │  transition  │    │ /transitions │
  └──────────────┘    │  allowed     │    └──────────────┘
                      └──────────────┘
                             │
                             ▼ (if not allowed)
                      ┌──────────────┐
                      │ Return Error │
                      │ Transition   │
                      │ NotAllowed   │
                      └──────────────┘
```

### 4.3 Webhook Processing Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       Webhook Processing Flow                             │
└──────────────────────────────────────────────────────────────────────────┘

  Incoming Webhook                                        Event Handlers
  ┌──────────────────┐                               ┌────────────────────┐
  │ Headers:         │                               │ IssueCreated       │
  │  X-Hub-Signature │                               │ IssueUpdated       │
  │  X-Timestamp     │                               │ CommentAdded       │
  │ Body: {...}      │                               │ StatusChanged      │
  └────────┬─────────┘                               └─────────▲──────────┘
           │                                                   │
           ▼                                                   │
  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
  │ Validate       │───▶│ Check          │───▶│ Parse Event    │
  │ Signature      │    │ Timestamp      │    │ Type           │
  │ (HMAC-SHA256)  │    │ (< 5 min)      │    │                │
  └────────────────┘    └────────────────┘    └───────┬────────┘
         │                     │                      │
         ▼ (invalid)           ▼ (stale)              ▼
  ┌────────────┐       ┌────────────┐         ┌────────────────┐
  │ 401        │       │ 400 Stale  │         │ Check          │
  │ Unauthorized│       │ Webhook    │         │ Idempotency    │
  └────────────┘       └────────────┘         │ Cache          │
                                              └───────┬────────┘
                                                      │
                                    ┌─────────────────┼─────────────────┐
                                    │ (duplicate)     │ (new)           │
                                    ▼                 ▼                 │
                             ┌────────────┐   ┌────────────────┐        │
                             │ Return 200 │   │ Dispatch to    │────────┘
                             │ (no-op)    │   │ Event Handler  │
                             └────────────┘   └────────────────┘
```

---

## 5. State Machines

### 5.1 Issue Lifecycle State Machine

```
                              ┌─────────────────┐
                              │                 │
            ┌────────────────▶│     OPEN        │◀────────────────┐
            │  (reopen)       │                 │    (create)     │
            │                 └────────┬────────┘                 │
            │                          │                          │
            │                          │ (start work)             │
            │                          ▼                          │
            │                 ┌─────────────────┐                 │
            │                 │                 │                 │
            │                 │  IN PROGRESS    │                 │
            │                 │                 │                 │
            │                 └────────┬────────┘                 │
            │                          │                          │
            │         ┌────────────────┼────────────────┐         │
            │         │                │                │         │
            │         ▼ (block)        ▼ (review)       ▼ (done)  │
            │ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │ │               │ │               │ │               │
            │ │    BLOCKED    │ │   IN REVIEW   │ │     DONE      │
            │ │               │ │               │ │               │
            │ └───────┬───────┘ └───────┬───────┘ └───────────────┘
            │         │                 │
            │         │ (unblock)       │ (reject)
            └─────────┴─────────────────┘

  Status Categories:
  ┌────────────────┬────────────────┬────────────────┐
  │     TO DO      │  IN PROGRESS   │      DONE      │
  │ ┌──────────┐   │ ┌────────────┐ │ ┌────────────┐ │
  │ │   OPEN   │   │ │IN PROGRESS │ │ │    DONE    │ │
  │ └──────────┘   │ │  BLOCKED   │ │ └────────────┘ │
  │                │ │ IN REVIEW  │ │                │
  │                │ └────────────┘ │                │
  └────────────────┴────────────────┴────────────────┘
```

### 5.2 Circuit Breaker State Machine

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
                                      └──────────────────────────┐
                                                                 │
                                      ┌────────────────────┐     │
                                      │     HALF-OPEN      │◀────┘
                                      └────────────────────┘
```

### 5.3 OAuth Token State Machine

```
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │ (token refreshed)                                           │
    │                                                             │
    │         ┌────────────────────┐      ┌────────────────────┐  │
    │         │                    │      │                    │  │
    └────────▶│       VALID        │─────▶│      EXPIRING      │──┘
              │  (token usable)    │      │  (refresh soon)    │
              │                    │ near │                    │
              └────────────────────┘expiry└─────────┬──────────┘
                                                    │
                                                    │ (expired)
                                                    ▼
              ┌────────────────────┐      ┌────────────────────┐
              │                    │      │                    │
              │   REFRESH_FAILED   │◀─────│      EXPIRED       │
              │  (needs re-auth)   │fail  │  (must refresh)    │
              │                    │      │                    │
              └────────────────────┘      └────────────────────┘
```

---

## 6. Bulk Operations Architecture

### 6.1 Batch Processing Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Bulk Operations Pipeline                             │
└──────────────────────────────────────────────────────────────────────────┘

  Input: Vec<CreateIssueInput>
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [Issue1] [Issue2] [Issue3] ... [Issue75]                            │
  └───────────────────────────────┬─────────────────────────────────────┘
                                  │
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                         Chunk (50 max)                               │
  │  ┌─────────────────────────┐    ┌─────────────────────────┐         │
  │  │ Batch 1: Issues 1-50    │    │ Batch 2: Issues 51-75   │         │
  │  └────────────┬────────────┘    └────────────┬────────────┘         │
  └───────────────┼──────────────────────────────┼──────────────────────┘
                  │                              │
                  ▼                              ▼
  ┌───────────────────────────┐  ┌───────────────────────────┐
  │ POST /issue/bulk          │  │ POST /issue/bulk          │
  │ (sequential)              │  │ (after batch 1)           │
  └─────────────┬─────────────┘  └─────────────┬─────────────┘
                │                              │
                ▼                              ▼
  ┌───────────────────────────┐  ┌───────────────────────────┐
  │ BulkResult                │  │ BulkResult                │
  │ - created: [...]          │  │ - created: [...]          │
  │ - errors: [...]           │  │ - errors: [...]           │
  └─────────────┬─────────────┘  └─────────────┬─────────────┘
                │                              │
                └──────────────┬───────────────┘
                               ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                     Aggregate Results                                │
  │  BulkCreateResult { issues: [...], errors: [...] }                  │
  └─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Concurrent Transition Execution

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   Concurrent Transitions (Semaphore-Limited)             │
└──────────────────────────────────────────────────────────────────────────┘

  Input: [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12]

  Semaphore: permits = 10
  ┌─────────────────────────────────────────────────────────────────────┐
  │ ████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  │ (10 permits used)                    (2 waiting)                    │
  └─────────────────────────────────────────────────────────────────────┘

  Execution Timeline:
  ─────────────────────────────────────────────────────────────────▶ time

  T1  ████████████
  T2  ██████████████████
  T3  ████████
  T4  ██████████████
  T5  ████████████████
  T6  ██████
  T7  ████████████████████
  T8  ██████████
  T9  ████████████
  T10 ██████████████████
  T11         ████████████████  (started when T3 released permit)
  T12           ██████████████  (started when T6 released permit)

  Result Aggregation:
  ┌─────────────────────────────────────────────────────────────────────┐
  │ successes: 10                                                       │
  │ failures: [(T7, "Transition not allowed"), (T12, "Permission denied")]│
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Security Architecture

### 7.1 Credential Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Credential Flow                                   │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
  │   Vault /    │         │   Shared     │         │   Jira       │
  │   Secrets    │────────▶│ Credentials  │────────▶│   Auth       │
  │   Manager    │         │   Module     │         │  Provider    │
  └──────────────┘         └──────────────┘         └──────┬───────┘
                                                          │
                                                          ▼
                                                   ┌──────────────┐
                                                   │ SecretString │
                                                   │ (zeroized)   │
                                                   └──────────────┘
                                                          │
                                                          │ Never logged
                                                          │ Never serialized
                                                          ▼
                                                   ┌──────────────┐
                                                   │  Auth Header │
                                                   │  (in-memory) │
                                                   └──────────────┘
```

### 7.2 Webhook Validation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Webhook Signature Validation                         │
└─────────────────────────────────────────────────────────────────────────┘

  Incoming Request:
  ┌───────────────────────────────────────────────────────────────────────┐
  │ Headers:                                                               │
  │   X-Hub-Signature: sha256=a1b2c3d4e5f6...                             │
  │   X-Atlassian-Webhook-Timestamp: 1704067200000                        │
  │ Body: {"webhookEvent":"jira:issue_updated",...}                       │
  └───────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │ Validation Steps:                                                      │
  │                                                                        │
  │ 1. Extract signature from header                                       │
  │    ┌─────────────────────────────────────────────────────────────┐    │
  │    │ "sha256=a1b2c3d4e5f6..." → algorithm="sha256", sig="a1b2c3d4"│    │
  │    └─────────────────────────────────────────────────────────────┘    │
  │                                                                        │
  │ 2. Compute expected signature                                          │
  │    ┌─────────────────────────────────────────────────────────────┐    │
  │    │ HMAC-SHA256(webhook_secret, request_body) → "a1b2c3d4..."   │    │
  │    └─────────────────────────────────────────────────────────────┘    │
  │                                                                        │
  │ 3. Constant-time comparison                                            │
  │    ┌─────────────────────────────────────────────────────────────┐    │
  │    │ constant_time_eq(provided_sig, computed_sig)                │    │
  │    └─────────────────────────────────────────────────────────────┘    │
  │                                                                        │
  │ 4. Timestamp freshness (< 5 minutes)                                   │
  │    ┌─────────────────────────────────────────────────────────────┐    │
  │    │ now() - timestamp < Duration::minutes(5)                    │    │
  │    └─────────────────────────────────────────────────────────────┘    │
  └───────────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Architecture

### 8.1 Tracing Hierarchy

```
jira.request (root span)
├── jira.auth.authenticate
│   └── jira.auth.token_refresh (if needed)
├── jira.rate_limiter.acquire
├── jira.http.execute
│   ├── http.connect
│   └── http.response
└── jira.response.parse

jira.issue.create
├── jira.request
├── jira.issue.get (fetch full issue)
└── jira.metrics.record

jira.bulk.transition
├── jira.semaphore.acquire
├── jira.issue.transition (×N concurrent)
│   └── jira.request
└── jira.bulk.aggregate_results
```

### 8.2 Metrics Collection Points

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Metrics Collection                                │
└─────────────────────────────────────────────────────────────────────────┘

  Request Flow:
  ┌──────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────┐
  │Start │───▶│ Rate     │───▶│ Circuit  │───▶│  HTTP    │───▶│ End  │
  │      │    │ Limiter  │    │ Breaker  │    │ Execute  │    │      │
  └──┬───┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    └──┬───┘
     │             │               │               │             │
     │             ▼               ▼               ▼             │
     │        ┌─────────┐    ┌─────────┐    ┌─────────────┐     │
     │        │rate_    │    │circuit_ │    │operation_   │     │
     │        │limit_   │    │breaker_ │    │latency_     │     │
     │        │hits     │    │state    │    │seconds      │     │
     │        └─────────┘    └─────────┘    └─────────────┘     │
     │                                                          │
     └──────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            ┌─────────────┐
                            │operations_  │
                            │total        │
                            │{op, status} │
                            └─────────────┘
```

---

## 9. Integration Points

### 9.1 Shared Module Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Shared Module Integration                            │
└─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────┐
  │  Jira Module    │
  └────────┬────────┘
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
  │  │ - TokenCache     │  │ - RateLimiter    │  │ - Logger         │  │
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
     │ JIRA_SITE_URL=https://company.atlassian.net                     │
     │ JIRA_AUTH_EMAIL=bot@company.com                                 │
     │ JIRA_API_TOKEN=<from secrets manager>                           │
     └─────────────────────────────────────────────────────────────────┘

  2. Configuration File
     ┌─────────────────────────────────────────────────────────────────┐
     │ jira:                                                           │
     │   rate_limit_rps: 10                                            │
     │   timeout_seconds: 30                                           │
     │   bulk_batch_size: 50                                           │
     │   circuit_breaker:                                              │
     │     failure_threshold: 5                                        │
     │     reset_timeout_seconds: 30                                   │
     └─────────────────────────────────────────────────────────────────┘

  3. Defaults (in code)
     ┌─────────────────────────────────────────────────────────────────┐
     │ const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);      │
     │ const DEFAULT_RATE_LIMIT: u32 = 10;                             │
     │ const DEFAULT_BATCH_SIZE: u32 = 50;                             │
     └─────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture |

---

**Next Phase:** Refinement - Edge cases, error recovery, performance optimizations, and security hardening.
