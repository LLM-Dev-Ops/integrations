# Architecture: Airtable API Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-14
**Status:** Draft
**Module:** `integrations/airtable-api`

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Container Architecture](#2-container-architecture)
3. [Component Architecture](#3-component-architecture)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [Concurrency Model](#5-concurrency-model)
6. [Error Handling Architecture](#6-error-handling-architecture)
7. [Integration Patterns](#7-integration-patterns)
8. [Deployment Architecture](#8-deployment-architecture)

---

## 1. System Context

### 1.1 C4 Context Diagram

```
+-----------------------------------------------------------------------------+
|                              SYSTEM CONTEXT                                  |
+-----------------------------------------------------------------------------+
|                                                                              |
|    +----------------+         +--------------------------------+             |
|    |   Platform     |         |    Airtable Integration        |             |
|    |   Services     |<------->|         Module                 |             |
|    |                |         |                                |             |
|    |  - Workflows   |         |  - Record Operations           |             |
|    |  - Events      |         |  - Batch Processing            |             |
|    |  - Metrics     |         |  - Pagination/Streaming        |             |
|    |  - Config      |         |  - Webhook Processing          |             |
|    +----------------+         |  - Rate Limit Management       |             |
|                               +---------------+----------------+             |
|                                               |                              |
|                                               | HTTPS REST API               |
|                                               | (TLS 1.2+, Bearer Auth)      |
|                                               v                              |
|                               +--------------------------------+             |
|                               |        Airtable Cloud          |             |
|                               |                                |             |
|                               |  +----------+  +----------+    |             |
|                               |  |  Base A  |  |  Base B  | ...|             |
|                               |  | (Tables) |  | (Tables) |    |             |
|                               |  +----------+  +----------+    |             |
|                               |                                |             |
|                               |  - Rate: 5 req/sec per base    |             |
|                               |  - Webhooks: 7-day expiry      |             |
|                               +--------------------------------+             |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### 1.2 External Dependencies

| System | Interaction | Protocol |
|--------|-------------|----------|
| Airtable API | Record CRUD, metadata | HTTPS REST |
| Airtable Webhooks | Change notifications | HTTPS POST |
| Platform Auth | Token retrieval | Internal API |
| Metrics Service | Telemetry export | gRPC/HTTP |
| Workflow Engine | Event triggers | Internal Events |
| Vector Memory | Record embeddings | Shared Store |

---

## 2. Container Architecture

### 2.1 C4 Container Diagram

```
+-----------------------------------------------------------------------------+
|                         CONTAINER ARCHITECTURE                               |
+-----------------------------------------------------------------------------+
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |                    Airtable Integration Module                         |  |
|  +-----------------------------------------------------------------------+  |
|  |                                                                        |  |
|  |  +-------------+  +-------------+  +-------------+  +--------------+  |  |
|  |  |   Client    |  |   Record    |  |    List     |  |   Webhook    |  |  |
|  |  |   Manager   |  |   Service   |  |   Service   |  |   Service    |  |  |
|  |  |             |  |             |  |             |  |              |  |  |
|  |  | - Builder   |  | - CRUD      |  | - Query     |  | - Register   |  |  |
|  |  | - Handles   |  | - Batch     |  | - Paginate  |  | - Verify     |  |  |
|  |  | - Config    |  | - Upsert    |  | - Stream    |  | - Process    |  |  |
|  |  +------+------+  +------+------+  +------+------+  +------+-------+  |  |
|  |         |                |                |                |          |  |
|  |         +----------------+----------------+----------------+          |  |
|  |                                   |                                   |  |
|  |                                   v                                   |  |
|  |  +-------------+  +-------------+  +-------------+  +--------------+  |  |
|  |  |    Rate     |  |    HTTP     |  | Simulation  |  |   Metrics    |  |  |
|  |  |   Limiter   |  |   Client    |  |    Layer    |  |  Collector   |  |  |
|  |  |             |  |             |  |             |  |              |  |  |
|  |  | - Token     |  | - Retry     |  | - Record    |  | - Counters   |  |  |
|  |  |   bucket    |  | - Timeout   |  | - Replay    |  | - Latency    |  |  |
|  |  | - Per-base  |  | - TLS       |  | - Mock      |  | - Errors     |  |  |
|  |  +-------------+  +-------------+  +-------------+  +--------------+  |  |
|  |                                                                        |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### 2.2 Container Responsibilities

| Container | Responsibility | Key Interfaces |
|-----------|---------------|----------------|
| Client Manager | Client lifecycle, configuration | `AirtableClient`, `BaseHandle`, `TableHandle` |
| Record Service | CRUD, batch, upsert operations | `RecordOps` trait |
| List Service | Query building, pagination, streaming | `ListBuilder`, `RecordStream` |
| Webhook Service | Registration, verification, processing | `WebhookProcessor` |
| Rate Limiter | Per-base throttling, backoff | `RateLimiter`, `TokenBucket` |
| HTTP Client | Request execution, retry logic | `HttpExecutor` trait |
| Simulation Layer | Record/replay for testing | `SimulationLayer` |
| Metrics Collector | Observability data collection | `MetricsCollector` |

---

## 3. Component Architecture

### 3.1 Client Manager Components

```
+-----------------------------------------------------------------------+
|                        CLIENT MANAGER                                  |
+-----------------------------------------------------------------------+
|                                                                        |
|  +------------------+     +------------------+     +----------------+  |
|  | AirtableClient   |     | TokenProvider    |     | ConfigLoader   |  |
|  | Builder          |---->| (trait)          |     |                |  |
|  |                  |     |                  |     | - Environment  |  |
|  | - with_token()   |     | - StaticToken    |     | - File         |  |
|  | - with_timeout() |     | - RefreshToken   |     | - Vault        |  |
|  | - build()        |     | - VaultProvider  |     +----------------+  |
|  +------------------+     +------------------+                         |
|           |                                                            |
|           v                                                            |
|  +------------------+     +------------------+     +----------------+  |
|  | AirtableClient   |---->| BaseHandle       |---->| TableHandle    |  |
|  |                  |     |                  |     |                |  |
|  | - base()         |     | - table()        |     | - create()     |  |
|  | - list_bases()   |     | - schema()       |     | - get()        |  |
|  | - health_check() |     | - webhooks()     |     | - update()     |  |
|  +------------------+     +------------------+     | - list()       |  |
|                                                    +----------------+  |
|                                                                        |
+-----------------------------------------------------------------------+
```

### 3.2 Record Service Components

```
+-----------------------------------------------------------------------+
|                        RECORD SERVICE                                  |
+-----------------------------------------------------------------------+
|                                                                        |
|  +----------------------+         +----------------------+             |
|  |   SingleRecordOps    |         |   BatchRecordOps     |             |
|  |                      |         |                      |             |
|  | - create_record()    |         | - create_records()   |             |
|  | - get_record()       |         | - update_records()   |             |
|  | - update_record()    |         | - delete_records()   |             |
|  | - delete_record()    |         | - upsert_records()   |             |
|  +----------+-----------+         +----------+-----------+             |
|             |                                |                         |
|             +----------------+---------------+                         |
|                              |                                         |
|                              v                                         |
|             +--------------------------------+                         |
|             |       FieldSerializer          |                         |
|             |                                |                         |
|             | - serialize_fields()           |                         |
|             | - deserialize_fields()         |                         |
|             | - handle_attachments()         |                         |
|             | - handle_linked_records()      |                         |
|             +--------------------------------+                         |
|                                                                        |
+-----------------------------------------------------------------------+
```

### 3.3 List Service Components

```
+-----------------------------------------------------------------------+
|                         LIST SERVICE                                   |
+-----------------------------------------------------------------------+
|                                                                        |
|  +----------------------+                                              |
|  | ListRecordsBuilder   |                                              |
|  |                      |                                              |
|  | - filter_by_formula()|                                              |
|  | - sort_by()          |-------+                                      |
|  | - select_fields()    |       |                                      |
|  | - in_view()          |       |                                      |
|  | - page_size()        |       |                                      |
|  +----------------------+       |                                      |
|                                 v                                      |
|       +--------------------+    +--------------------+                 |
|       |   page()           |    |   all()            |                 |
|       |                    |    |                    |                 |
|       | Single page fetch  |    | Auto-paginate all  |                 |
|       | Returns offset     |    | Returns Vec        |                 |
|       +--------------------+    +--------------------+                 |
|                                          |                             |
|                                          v                             |
|                            +--------------------+                      |
|                            |   stream()         |                      |
|                            |                    |                      |
|                            | Async iterator     |                      |
|                            | Memory efficient   |                      |
|                            +--------------------+                      |
|                                                                        |
+-----------------------------------------------------------------------+
```

### 3.4 Webhook Service Components

```
+-----------------------------------------------------------------------+
|                        WEBHOOK SERVICE                                 |
+-----------------------------------------------------------------------+
|                                                                        |
|  +----------------------+         +----------------------+             |
|  | WebhookManager       |         | WebhookProcessor     |             |
|  |                      |         |                      |             |
|  | - create_webhook()   |         | - register_secret()  |             |
|  | - list_webhooks()    |         | - verify_signature() |             |
|  | - refresh_webhook()  |         | - parse_payload()    |             |
|  | - delete_webhook()   |         | - fetch_changes()    |             |
|  +----------+-----------+         +----------+-----------+             |
|             |                                |                         |
|             v                                v                         |
|  +----------------------+         +----------------------+             |
|  | WebhookRefresher     |         | ChangeDispatcher     |             |
|  | (Background Task)    |         |                      |             |
|  |                      |         | - dispatch_created() |             |
|  | - Monitor expiry     |         | - dispatch_updated() |             |
|  | - Auto-refresh       |         | - dispatch_deleted() |             |
|  | - Alert on failure   |         | - to_event_bus()     |             |
|  +----------------------+         +----------------------+             |
|                                                                        |
+-----------------------------------------------------------------------+
```

---

## 4. Data Flow Diagrams

### 4.1 Record Create Flow

```
+--------+     +--------+     +---------+     +--------+     +----------+
| Caller |     | Table  |     |  Rate   |     |  HTTP  |     | Airtable |
|        |     | Handle |     | Limiter |     | Client |     |   API    |
+---+----+     +---+----+     +----+----+     +---+----+     +----+-----+
    |              |               |              |               |
    | create()     |               |              |               |
    |------------->|               |              |               |
    |              | acquire()     |              |               |
    |              |-------------->|              |               |
    |              |               |              |               |
    |              |   [wait if    |              |               |
    |              |    limited]   |              |               |
    |              |<--------------|              |               |
    |              |               |              |               |
    |              | execute()     |              |               |
    |              |---------------------------->|               |
    |              |               |              | POST /base/   |
    |              |               |              | table         |
    |              |               |              |-------------->|
    |              |               |              |               |
    |              |               |              |   201 Created |
    |              |               |              |<--------------|
    |              |               |              |               |
    |              | record metrics|              |               |
    |              |<----------------------------|               |
    |              |               |              |               |
    |   Record     |               |              |               |
    |<-------------|               |              |               |
    |              |               |              |               |
```

### 4.2 Paginated List Flow

```
+--------+     +---------+     +--------+     +----------+
| Caller |     |  List   |     |  HTTP  |     | Airtable |
|        |     | Builder |     | Client |     |   API    |
+---+----+     +----+----+     +---+----+     +----+-----+
    |               |              |               |
    | all()         |              |               |
    |-------------->|              |               |
    |               |              |               |
    |               |  page(None)  |               |
    |               |------------->| GET /records  |
    |               |              |-------------->|
    |               |              |    records,   |
    |               |              |    offset     |
    |               |              |<--------------|
    |               |              |               |
    |               |  [offset     |               |
    |               |   present?]  |               |
    |               |              |               |
    |               | page(offset) |               |
    |               |------------->| GET /records  |
    |               |              | ?offset=xxx   |
    |               |              |-------------->|
    |               |              |    records,   |
    |               |              |    None       |
    |               |              |<--------------|
    |               |              |               |
    |  Vec<Record>  |              |               |
    |<--------------|              |               |
    |               |              |               |
```

### 4.3 Webhook Processing Flow

```
+----------+     +-----------+     +------------+     +---------+
| Airtable |     | Webhook   |     |  Webhook   |     |  Event  |
| (Push)   |     | Endpoint  |     | Processor  |     |   Bus   |
+----+-----+     +-----+-----+     +------+-----+     +----+----+
     |                 |                  |                |
     | POST /webhook   |                  |                |
     | (signed)        |                  |                |
     |---------------->|                  |                |
     |                 | verify_and_      |                |
     |                 | parse()          |                |
     |                 |----------------->|                |
     |                 |                  |                |
     |                 |     [verify      |                |
     |                 |      HMAC]       |                |
     |                 |                  |                |
     |                 |     [parse       |                |
     |                 |      payload]    |                |
     |                 |                  |                |
     |                 |                  | fetch_changes()|
     |                 |                  |--------------->|
     |                 |                  |                |
     |                 |                  | dispatch()     |
     |                 |                  |--------------->|
     |                 |                  |                |
     |                 |   200 OK         |                |
     |<----------------|                  |                |
     |                 |                  |                |
```

### 4.4 Rate Limit Handling Flow

```
+--------+     +---------+     +--------+     +----------+
| Caller |     |  Rate   |     |  HTTP  |     | Airtable |
|        |     | Limiter |     | Client |     |   API    |
+---+----+     +----+----+     +---+----+     +----+-----+
    |               |              |               |
    | request       |              |               |
    |-------------->|              |               |
    |               | try_acquire()|               |
    |               |---+          |               |
    |               |   | [bucket  |               |
    |               |<--+ empty]   |               |
    |               |              |               |
    |               | [strategy:   |               |
    |               |  blocking]   |               |
    |               |              |               |
    |               | sleep(200ms) |               |
    |               |---+          |               |
    |               |<--+          |               |
    |               |              |               |
    |               | try_acquire()|               |
    |               |---+          |               |
    |               |   | [got     |               |
    |               |<--+ token]   |               |
    |               |              |               |
    |               | execute()    |               |
    |               |------------->|               |
    |               |              |   429 (rare)  |
    |               |              |<--------------|
    |               |              |               |
    |               | handle_429() |               |
    |               |<-------------|               |
    |               |              |               |
    |               | [drain       |               |
    |               |  bucket]     |               |
    |               |              |               |
    |               | [wait        |               |
    |               |  Retry-After]|               |
    |               |              |               |
```

---

## 5. Concurrency Model

### 5.1 Thread Safety Architecture

```
+-----------------------------------------------------------------------+
|                        CONCURRENCY MODEL                               |
+-----------------------------------------------------------------------+
|                                                                        |
|  +---------------------------+                                         |
|  |    AirtableClient         |                                         |
|  |    (Arc<Self>)            |                                         |
|  +-------------+-------------+                                         |
|                |                                                       |
|    +-----------+-----------+-----------+                               |
|    |           |           |           |                               |
|    v           v           v           v                               |
|  +------+   +------+   +------+   +------+                             |
|  |Task 1|   |Task 2|   |Task 3|   |Task N|   Tokio tasks               |
|  +--+---+   +--+---+   +--+---+   +--+---+                             |
|     |          |          |          |                                 |
|     +----------+----------+----------+                                 |
|                |                                                       |
|                v                                                       |
|  +---------------------------+                                         |
|  |      RateLimiter          |                                         |
|  |      (shared state)       |                                         |
|  +---------------------------+                                         |
|  |                           |                                         |
|  |  DashMap<BaseId, Bucket>  |  Lock-free per-base buckets             |
|  |                           |                                         |
|  |  AtomicU32 tokens         |  Atomic token operations                |
|  |  AtomicU64 last_refill    |                                         |
|  |                           |                                         |
|  +---------------------------+                                         |
|                                                                        |
+-----------------------------------------------------------------------+
```

### 5.2 Synchronization Primitives

| Component | Primitive | Purpose |
|-----------|-----------|---------|
| Token Bucket | `AtomicU32`, `AtomicU64` | Lock-free token management |
| Base Slots | `DashMap` | Concurrent per-base access |
| Request Queue | `Mutex<VecDeque>` | Queued strategy ordering |
| Simulation Recordings | `RwLock<Vec>` | Read-heavy recording access |
| Webhook Secrets | `DashMap` | Concurrent secret lookup |

### 5.3 Async Task Model

```
+-----------------------------------------------------------------------+
|                         ASYNC TASK MODEL                               |
+-----------------------------------------------------------------------+
|                                                                        |
|  Tokio Runtime                                                         |
|  +-------------------------------------------------------------------+ |
|  |                                                                    | |
|  |  +-----------------+  +-----------------+  +-----------------+    | |
|  |  | Request Tasks   |  | Stream Tasks    |  | Background      |    | |
|  |  |                 |  |                 |  | Tasks           |    | |
|  |  | - HTTP calls    |  | - Pagination    |  |                 |    | |
|  |  | - Bounded by    |  | - Memory        |  | - Webhook       |    | |
|  |  |   rate limiter  |  |   efficient     |  |   refresh       |    | |
|  |  |                 |  | - Backpressure  |  | - Metrics       |    | |
|  |  +-----------------+  +-----------------+  |   flush         |    | |
|  |                                           | - Health check   |    | |
|  |                                           +-----------------+    | |
|  |                                                                    | |
|  +-------------------------------------------------------------------+ |
|                                                                        |
+-----------------------------------------------------------------------+
```

### 5.4 Per-Base Isolation

```
Base A requests:  [R1]--[R2]--[R3]--[R4]--[R5]--|wait|--[R6]-->
                   |    |    |    |    |        200ms
                   v    v    v    v    v
                  5 tokens consumed, refill

Base B requests:  [R1]--[R2]--[R3]------------------------>
                   |    |    |
                   v    v    v
                  Independent bucket, no contention
```

---

## 6. Error Handling Architecture

### 6.1 Error Type Hierarchy

```
AirtableError
+-- ConfigError
|   +-- MissingCredentials
|   +-- InvalidBaseUrl
|   +-- InvalidTimeout
|
+-- AuthError
|   +-- Unauthorized
|   +-- TokenExpired
|   +-- InsufficientScope
|
+-- RateLimitError
|   +-- RateLimitExceeded { retry_after: Duration }
|   +-- RateLimitExhausted { attempts: u32 }
|   +-- QueueTimeout
|
+-- RequestError
|   +-- Timeout
|   +-- ConnectionFailed
|   +-- TlsError
|
+-- ResponseError
|   +-- NotFound { resource: String }
|   +-- ValidationError { message: String, field: Option<String> }
|   +-- ServerError { status: u16 }
|   +-- UnexpectedStatus { status: u16 }
|
+-- BatchError
|   +-- BatchSizeExceeded { max: usize, actual: usize }
|   +-- PartialFailure { succeeded: Vec<String>, failed: Vec<BatchItemError> }
|
+-- WebhookError
|   +-- MissingSignature
|   +-- InvalidSignature
|   +-- UnknownWebhook
|   +-- PayloadParseError
|
+-- SimulationError
    +-- NotInReplayMode
    +-- ReplayExhausted
    +-- ReplayMismatch { expected: Op, actual: Op }
```

### 6.2 Retry Decision Matrix

| Error Type | Retry | Strategy |
|------------|-------|----------|
| `RateLimitExceeded` | Yes | Wait `Retry-After` |
| `ServerError (5xx)` | Yes | Exponential backoff |
| `Timeout` | Yes | Immediate retry |
| `ConnectionFailed` | Yes | Exponential backoff |
| `Unauthorized` | No | Surface to caller |
| `ValidationError` | No | Surface to caller |
| `NotFound` | No | Surface to caller |
| `BatchSizeExceeded` | No | Surface to caller |

### 6.3 Circuit Breaker States

```
+----------+     failures >= threshold     +----------+
|  CLOSED  |------------------------------>|   OPEN   |
|          |                               |          |
| Normal   |                               | Fail     |
| operation|     success after timeout     | fast     |
|          |<------------------------------|          |
+----+-----+                               +----+-----+
     ^                                          |
     |              +------------+              |
     |              | HALF-OPEN  |              |
     +--------------|            |<-------------+
       success      | Test with  |  timeout
                    | single req |  elapsed
                    +------------+
```

---

## 7. Integration Patterns

### 7.1 Platform Service Integration

```
+-----------------------------------------------------------------------+
|                     PLATFORM INTEGRATION                               |
+-----------------------------------------------------------------------+
|                                                                        |
|  +-------------------+                     +-------------------+       |
|  |  Airtable Module  |                     |  Platform Auth    |       |
|  +--------+----------+                     +--------+----------+       |
|           |                                         |                  |
|           | get_token()                             |                  |
|           |---------------------------------------->|                  |
|           |                                         |                  |
|           |               SecretString              |                  |
|           |<----------------------------------------|                  |
|           |                                         |                  |
|  +--------v----------+                     +--------v----------+       |
|  |  Airtable Module  |                     |  Metrics Service  |       |
|  +--------+----------+                     +--------+----------+       |
|           |                                         |                  |
|           | record_metric()                         |                  |
|           |---------------------------------------->|                  |
|           |                                         |                  |
|  +--------v----------+                     +--------v----------+       |
|  |  Airtable Module  |                     |    Event Bus      |       |
|  +--------+----------+                     +--------+----------+       |
|           |                                         |                  |
|           | publish(WebhookEvent)                   |                  |
|           |---------------------------------------->|                  |
|           |                                         |                  |
+-----------------------------------------------------------------------+
```

### 7.2 Event Publishing Pattern

```rust
// Webhook events published to platform event bus
enum AirtableEvent {
    RecordCreated {
        base_id: String,
        table_id: String,
        record_id: String,
        fields: HashMap<String, FieldValue>,
    },
    RecordUpdated {
        base_id: String,
        table_id: String,
        record_id: String,
        changed_fields: Vec<String>,
    },
    RecordDeleted {
        base_id: String,
        table_id: String,
        record_id: String,
    },
}
```

### 7.3 Configuration Table Pattern

```
+-----------------------------------------------------------------------+
|                  CONFIGURATION TABLE PATTERN                           |
+-----------------------------------------------------------------------+
|                                                                        |
|  Airtable Base: "Platform Config"                                      |
|  +---------------------------------------------------------------+    |
|  | Table: feature_flags                                          |    |
|  +---------------------------------------------------------------+    |
|  | flag_name     | enabled | rollout_pct | metadata              |    |
|  |---------------|---------|-------------|------------------------|    |
|  | dark_mode     | true    | 100         | {"version": "2.0"}    |    |
|  | new_dashboard | true    | 25          | {"experiment": "A"}   |    |
|  +---------------------------------------------------------------+    |
|                                                                        |
|  Usage in Platform:                                                    |
|  +---------------------------------------------------------------+    |
|  | let config_table = client                                      |    |
|  |     .base("appXXX")                                            |    |
|  |     .table("feature_flags");                                   |    |
|  |                                                                |    |
|  | let flags = config_table                                       |    |
|  |     .list()                                                    |    |
|  |     .filter_by_formula("{enabled} = TRUE()")                   |    |
|  |     .all()                                                     |    |
|  |     .await?;                                                   |    |
|  +---------------------------------------------------------------+    |
|                                                                        |
+-----------------------------------------------------------------------+
```

---

## 8. Deployment Architecture

### 8.1 Container Deployment

```
+-----------------------------------------------------------------------+
|                      KUBERNETES DEPLOYMENT                             |
+-----------------------------------------------------------------------+
|                                                                        |
|  +-------------------------------------------------------------------+ |
|  |  Namespace: integrations                                          | |
|  +-------------------------------------------------------------------+ |
|  |                                                                    | |
|  |  +--------------------+          +--------------------+           | |
|  |  |  Deployment:       |          |  Deployment:       |           | |
|  |  |  airtable-service  |          |  airtable-webhook  |           | |
|  |  |                    |          |                    |           | |
|  |  |  Replicas: 3       |          |  Replicas: 2       |           | |
|  |  |                    |          |                    |           | |
|  |  |  +-------------+   |          |  +-------------+   |           | |
|  |  |  | Container   |   |          |  | Container   |   |           | |
|  |  |  |             |   |          |  |             |   |           | |
|  |  |  | CPU: 500m   |   |          |  | CPU: 250m   |   |           | |
|  |  |  | Mem: 512Mi  |   |          |  | Mem: 256Mi  |   |           | |
|  |  |  +-------------+   |          |  +-------------+   |           | |
|  |  +--------------------+          +--------------------+           | |
|  |           |                               |                       | |
|  |           v                               v                       | |
|  |  +--------------------+          +--------------------+           | |
|  |  |  Service:          |          |  Ingress:          |           | |
|  |  |  airtable-internal |          |  airtable-webhook  |           | |
|  |  |  ClusterIP         |          |  /webhook/airtable |           | |
|  |  +--------------------+          +--------------------+           | |
|  |                                                                    | |
|  +-------------------------------------------------------------------+ |
|                                                                        |
|  +-------------------------------------------------------------------+ |
|  |  Secrets                                                          | |
|  |  +-------------------------------------------------------------+  | |
|  |  | airtable-credentials:                                       |  | |
|  |  |   api_token: <encrypted>                                    |  | |
|  |  |   webhook_secret: <encrypted>                               |  | |
|  |  +-------------------------------------------------------------+  | |
|  +-------------------------------------------------------------------+ |
|                                                                        |
+-----------------------------------------------------------------------+
```

### 8.2 Configuration Management

```yaml
# ConfigMap: airtable-config
apiVersion: v1
kind: ConfigMap
metadata:
  name: airtable-config
data:
  AIRTABLE_BASE_URL: "https://api.airtable.com/v0"
  AIRTABLE_TIMEOUT_MS: "30000"
  AIRTABLE_MAX_RETRIES: "3"
  AIRTABLE_RATE_LIMIT_STRATEGY: "blocking"
  AIRTABLE_SIMULATION_MODE: "disabled"
```

### 8.3 Health Check Endpoints

| Endpoint | Purpose | Frequency |
|----------|---------|-----------|
| `/health/live` | Process alive | 10s |
| `/health/ready` | Can serve requests | 5s |
| `/health/airtable` | API connectivity | 30s |

### 8.4 Observability Stack

```
+-----------------------------------------------------------------------+
|                       OBSERVABILITY                                    |
+-----------------------------------------------------------------------+
|                                                                        |
|  Metrics (Prometheus)                                                  |
|  +-------------------------------------------------------------------+ |
|  | airtable_requests_total{base, table, operation, status}           | |
|  | airtable_request_duration_seconds{operation}                      | |
|  | airtable_rate_limit_waits_total{base}                             | |
|  | airtable_rate_limit_wait_seconds{base}                            | |
|  | airtable_webhook_events_total{base, table, type}                  | |
|  | airtable_circuit_breaker_state{base}                              | |
|  +-------------------------------------------------------------------+ |
|                                                                        |
|  Traces (OpenTelemetry)                                                |
|  +-------------------------------------------------------------------+ |
|  | airtable.record.create                                            | |
|  | airtable.record.batch_update                                      | |
|  | airtable.list.paginate                                            | |
|  | airtable.webhook.verify                                           | |
|  | airtable.webhook.process                                          | |
|  +-------------------------------------------------------------------+ |
|                                                                        |
|  Logs (Structured JSON)                                                |
|  +-------------------------------------------------------------------+ |
|  | { "level": "info", "operation": "create", "base": "appXXX",       | |
|  |   "table": "tblYYY", "duration_ms": 142 }                         | |
|  +-------------------------------------------------------------------+ |
|                                                                        |
+-----------------------------------------------------------------------+
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AIRTABLE-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-14 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*Proceed to Refinement phase upon approval.*
