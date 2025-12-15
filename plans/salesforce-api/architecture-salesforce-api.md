# Salesforce API Integration - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/salesforce_api`

---

## 1. Overview

This document defines the architectural design for the Salesforce API Integration, a thin adapter layer enabling the LLM Dev Ops platform to interact with Salesforce for CRM data access, workflow automation, event-driven integrations, and enterprise system synchronization.

### 1.1 Design Philosophy

1. **Thin Adapter Pattern**: Minimal translation layer; delegate to shared primitives
2. **Multi-API Surface**: REST API, SOQL, Bulk API 2.0, Pub/Sub gRPC
3. **OAuth-First**: Token-based authentication with automatic refresh
4. **Rate-Limit Aware**: Proactive tracking of org API limits
5. **Testability**: Simulation record/replay for deterministic testing

### 1.2 Key Salesforce Characteristics

| Aspect | Salesforce Approach | Implementation Impact |
|--------|---------------------|----------------------|
| Authentication | OAuth 2.0 flows | Token management, auto-refresh |
| API Versioning | Per-version endpoints | Version pinning in config |
| Multi-tenancy | Per-org instance URLs | Dynamic endpoint construction |
| Rate Limits | Org-based quotas | Rate tracker, limit awareness |
| Events | Pub/Sub gRPC | Dual HTTP/gRPC transports |

---

## 2. C4 Model Diagrams

### 2.1 Level 1: System Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           External Systems                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────┐                                                 │
│  │    Salesforce      │                                                 │
│  │    Platform        │◀────────────────────┐                           │
│  │                    │   REST/gRPC APIs    │                           │
│  │   - SObjects       │                     │                           │
│  │   - SOQL           │                     │                           │
│  │   - Bulk API 2.0   │                     │                           │
│  │   - Pub/Sub API    │                     │                           │
│  └────────────────────┘                     │                           │
│                                             │                           │
│  ┌──────────────────────────────────────────┼───────────────────────┐   │
│  │             LLM DevOps Platform          │                       │   │
│  │                                          │                       │   │
│  │  ┌──────────────┐    ┌──────────────────────────────────────┐   │   │
│  │  │ LLM Engine   │───▶│                                      │   │   │
│  │  └──────────────┘    │    Salesforce API Integration        │───┘   │
│  │                      │    Module                             │       │
│  │  ┌──────────────┐    │                                      │       │
│  │  │Agent Runtime │───▶│    - SObject CRUD                    │       │
│  │  └──────────────┘    │    - SOQL queries                    │       │
│  │                      │    - Bulk operations                  │       │
│  │  ┌──────────────┐    │    - Event streaming                  │       │
│  │  │ Orchestrator │───▶│                                      │       │
│  │  └──────────────┘    └──────────────────────────────────────┘       │
│  │                                                                      │
│  └──────────────────────────────────────────────────────────────────────┘
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Level 2: Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LLM DevOps Platform                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │   LLM Engine    │  │  Agent Runtime  │  │     Orchestrator        │  │
│  │                 │  │                 │  │                         │  │
│  │  - CRM queries  │  │  - Tool calls   │  │  - Workflow triggers    │  │
│  │  - Data sync    │  │  - Data updates │  │  - Event handling       │  │
│  └────────┬────────┘  └────────┬────────┘  └───────────┬─────────────┘  │
│           │                    │                       │                 │
│           │      Salesforce operations                 │                 │
│           ▼                    ▼                       ▼                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                  Salesforce API Integration                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │  │
│  │  │  SObject    │  │   Query     │  │    Bulk     │  │   Event   │ │  │
│  │  │  Service    │  │   Service   │  │   Service   │  │  Service  │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │  │
│  │  ┌─────────────┐  ┌─────────────┐                                 │  │
│  │  │   Limits    │  │ Simulation  │                                 │  │
│  │  │   Service   │  │   Support   │                                 │  │
│  │  └─────────────┘  └─────────────┘                                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│           │                                                              │
│           │ uses                                                         │
│           ▼                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Shared Infrastructure                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │   Auth   │  │  Logging │  │  Metrics │  │  Tracing │           │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │  │
│  │  ┌──────────┐  ┌──────────────────┐  ┌─────────────────────┐      │  │
│  │  │  Retry   │  │  Circuit Breaker │  │  Config Manager     │      │  │
│  │  └──────────┘  └──────────────────┘  └─────────────────────┘      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
            │                          │
            │ HTTPS (REST API)         │ gRPC (Pub/Sub)
            ▼                          ▼
┌───────────────────────────────────────┐
│         Salesforce Platform           │
│                                       │
│   https://<instance>.salesforce.com   │
│   api.pubsub.salesforce.com:7443      │
└───────────────────────────────────────┘
```

### 2.3 Level 3: Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Salesforce API Integration Module                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         Public API Layer                           │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐  │  │
│  │  │ SalesforceClient│  │ ClientBuilder   │  │ SalesforceConfig  │  │  │
│  │  │   (Facade)      │  │                 │  │                   │  │  │
│  │  │                 │  │  - from_env()   │  │  - instance_url   │  │  │
│  │  │  - sobjects()   │  │  - credentials()│  │  - api_version    │  │  │
│  │  │  - query()      │  │  - api_version()│  │  - credentials    │  │  │
│  │  │  - bulk()       │  │  - build()      │  │  - timeout        │  │  │
│  │  │  - events()     │  │                 │  │  - track_limits   │  │  │
│  │  │  - limits()     │  │                 │  │                   │  │  │
│  │  └────────┬────────┘  └─────────────────┘  └───────────────────┘  │  │
│  └───────────┼───────────────────────────────────────────────────────┘  │
│              │                                                           │
│              ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       Service Layer                                │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    SObjectService                            │  │  │
│  │  │  create()  get()  update()  upsert()  delete()  describe()  │  │  │
│  │  │  composite()                                                 │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │  ┌───────────────────────┐  ┌────────────────────────────────┐   │  │
│  │  │     QueryService      │  │        BulkService             │   │  │
│  │  │                       │  │                                │   │  │
│  │  │  query()              │  │  create_job()                  │   │  │
│  │  │  query_more()         │  │  upload_data()                 │   │  │
│  │  │  query_all()          │  │  close_job()                   │   │  │
│  │  │  explain()            │  │  get_results()                 │   │  │
│  │  └───────────────────────┘  └────────────────────────────────┘   │  │
│  │  ┌───────────────────────┐  ┌────────────────────────────────┐   │  │
│  │  │     EventService      │  │       LimitsService            │   │  │
│  │  │                       │  │                                │   │  │
│  │  │  publish()            │  │  get_limits()                  │   │  │
│  │  │  subscribe()          │  │  check_available()             │   │  │
│  │  │  subscribe_cdc()      │  │                                │   │  │
│  │  └───────────────────────┘  └────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│              │                                                           │
│              ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      Core Infrastructure                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │  │
│  │  │TokenManager │  │ HttpClient  │  │   ResilienceLayer      │   │  │
│  │  │             │  │             │  │                         │   │  │
│  │  │- get_token()│  │  - send()   │  │  - RetryExecutor       │   │  │
│  │  │- refresh()  │  │  - stream() │  │  - CircuitBreaker      │   │  │
│  │  │- invalidate()│ │             │  │  - RateLimitTracker    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │  │
│  │  ┌─────────────┐  ┌─────────────┐                                │  │
│  │  │ GrpcClient  │  │ AuthProvider│                                │  │
│  │  │ (Pub/Sub)   │  │ (OAuth)     │                                │  │
│  │  └─────────────┘  └─────────────┘                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│              │                                                           │
│              ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       Support Components                           │  │
│  │  ┌─────────────────┐  ┌───────────────┐  ┌─────────────────────┐  │  │
│  │  │  JSON Parser    │  │  CSV Handler  │  │  Simulation Layer   │  │  │
│  │  │                 │  │               │  │                     │  │  │
│  │  │  - Responses    │  │  - Bulk upload│  │  - SfRecorder       │  │  │
│  │  │  - Errors       │  │  - Results    │  │  - SfReplayer       │  │  │
│  │  │  - Query results│  │               │  │  - ReplayClient     │  │  │
│  │  └─────────────────┘  └───────────────┘  └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### 3.1 SObject CRUD Flow

```
┌──────────────┐
│  Application │
│              │
│  create(     │
│    "Account",│
│    record    │
│  )           │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        SObjectService                             │
│                                                                   │
│  1. Validate SObject type and record fields                      │
│  2. Build request URL: /services/data/vXX.0/sobjects/{type}/     │
│  3. Serialize record to JSON                                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        TokenManager                               │
│                                                                   │
│  1. Check token validity (expiration - threshold)                │
│  2. If expired: trigger refresh flow via AuthProvider            │
│  3. Return valid access token                                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                       ResilienceLayer                             │
│                                                                   │
│  1. Check circuit breaker state                                  │
│  2. Execute with retry on transient failures                     │
│  3. Handle 401 → token refresh → retry                          │
│  4. Update circuit breaker based on result                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        HttpClient                                 │
│                                                                   │
│  POST https://<instance>.salesforce.com/services/data/v59.0/     │
│       sobjects/Account/                                          │
│                                                                   │
│  Headers:                                                        │
│    Authorization: Bearer <access_token>                          │
│    Content-Type: application/json                                │
│                                                                   │
│  Body: { "Name": "Acme Corp", ... }                             │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Salesforce                                  │
│                                                                   │
│  Response: 201 Created                                           │
│  Body: { "id": "001xx...", "success": true, "errors": [] }      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Observability                                  │
│                                                                   │
│  - Emit: sf_requests_total{operation=create,sobject=Account}     │
│  - Complete trace span with attributes                           │
│  - Log: INFO "Record created" sobject=Account id=001xx...        │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│   Return     │
│              │
│ CreateResult │
│ {            │
│   id,        │
│   success    │
│ }            │
└──────────────┘
```

### 3.2 SOQL Query with Pagination

```
┌──────────────┐
│  Application │
│              │
│ query_all(   │
│  "SELECT ... │
│   FROM       │
│   Account"   │
│ )            │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        QueryService                               │
│                                                                   │
│  1. URL-encode SOQL query                                        │
│  2. Execute initial query                                        │
│  3. Return stream that handles pagination automatically          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Initial Query Request                          │
│                                                                   │
│  GET /services/data/v59.0/query?q=SELECT+...+FROM+Account        │
│                                                                   │
│  Response:                                                       │
│  {                                                               │
│    "totalSize": 5000,                                           │
│    "done": false,                                                │
│    "nextRecordsUrl": "/services/data/v59.0/query/01g...-2000",  │
│    "records": [ ... first 2000 records ... ]                    │
│  }                                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       │ yield records 1-2000
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Pagination Request (automatic)                 │
│                                                                   │
│  GET /services/data/v59.0/query/01g...-2000                     │
│                                                                   │
│  Response:                                                       │
│  {                                                               │
│    "totalSize": 5000,                                           │
│    "done": false,                                                │
│    "nextRecordsUrl": "/services/data/v59.0/query/01g...-4000",  │
│    "records": [ ... records 2001-4000 ... ]                     │
│  }                                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       │ yield records 2001-4000
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Final Pagination Request                       │
│                                                                   │
│  GET /services/data/v59.0/query/01g...-4000                     │
│                                                                   │
│  Response:                                                       │
│  {                                                               │
│    "totalSize": 5000,                                           │
│    "done": true,                                                 │
│    "records": [ ... records 4001-5000 ... ]                     │
│  }                                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       │ yield records 4001-5000
       ▼
┌──────────────┐
│   Stream     │
│   Complete   │
└──────────────┘
```

### 3.3 Bulk API 2.0 Job Flow

```
┌──────────────┐
│  Application │
│              │
│execute_bulk( │
│  "Account",  │
│  "insert",   │
│  csv_data    │
│)             │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Step 1: Create Bulk Job                              │
│                                                                   │
│  POST /services/data/v59.0/jobs/ingest                          │
│                                                                   │
│  Body: { "object": "Account", "operation": "insert" }           │
│                                                                   │
│  Response: { "id": "750...", "state": "Open" }                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Step 2: Upload CSV Data                              │
│                                                                   │
│  PUT /services/data/v59.0/jobs/ingest/750.../batches            │
│  Content-Type: text/csv                                          │
│                                                                   │
│  Body:                                                           │
│  Name,Industry,AnnualRevenue                                     │
│  "Acme Corp","Technology",1000000                               │
│  "Beta Inc","Healthcare",500000                                  │
│  ...                                                             │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Step 3: Close Job to Start Processing                │
│                                                                   │
│  PATCH /services/data/v59.0/jobs/ingest/750...                  │
│  Body: { "state": "UploadComplete" }                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Step 4: Poll for Completion                          │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  LOOP with configurable poll_interval (default: 5s)        │ │
│  │                                                             │ │
│  │  GET /services/data/v59.0/jobs/ingest/750...              │ │
│  │                                                             │ │
│  │  States: Open → UploadComplete → InProgress → JobComplete  │ │
│  │                                                             │ │
│  │  Exit when: JobComplete, Failed, or Aborted               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Step 5: Get Results                                  │
│                                                                   │
│  GET /services/data/v59.0/jobs/ingest/750.../successfulResults  │
│  → CSV of successfully processed records                        │
│                                                                   │
│  GET /services/data/v59.0/jobs/ingest/750.../failedResults      │
│  → CSV of failed records with error details                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│   Return     │
│              │
│ BulkResult { │
│   processed, │
│   failed,    │
│   job_id     │
│ }            │
└──────────────┘
```

### 3.4 Event Subscription Flow (Pub/Sub API)

```
┌──────────────┐
│  Application │
│              │
│ subscribe(   │
│  "OrderEvent"│
│ )            │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        EventService                               │
│                                                                   │
│  1. Build topic name: /event/OrderEvent__e                       │
│  2. Initialize gRPC client if not connected                      │
│  3. Get OAuth token for gRPC metadata                            │
│  4. Start streaming subscription                                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     gRPC Connection Setup                         │
│                                                                   │
│  Target: api.pubsub.salesforce.com:7443                         │
│                                                                   │
│  Metadata:                                                       │
│    accesstoken: <OAuth token>                                    │
│    instanceurl: <Salesforce instance URL>                        │
│    tenantid: <Org ID>                                           │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Subscribe RPC (Streaming)                       │
│                                                                   │
│  FetchRequest {                                                  │
│    topic_name: "/event/OrderEvent__e"                           │
│    replay_preset: LATEST                                         │
│    num_requested: 100                                            │
│  }                                                               │
│                                                                   │
│  ─────────────────────────────────────────────────────────────  │
│                                                                   │
│  FetchResponse (stream) {                                        │
│    events: [                                                     │
│      { replay_id: bytes, event: { id, payload } },              │
│      ...                                                         │
│    ],                                                            │
│    schema_id: "abc123"                                          │
│  }                                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Decode Avro payload
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Event Processing                                │
│                                                                   │
│  1. Decode Avro payload using schema_id                         │
│  2. Map to EventMessage struct                                   │
│  3. Emit to application stream                                   │
│  4. Track replay_id for resume capability                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Async Stream yields │
│                      │
│  EventMessage {      │
│    replay_id,        │
│    payload: JSON,    │
│    event_uuid        │
│  }                   │
└──────────────────────┘
```

---

## 4. Module Structure

### 4.1 Rust Implementation

```
src/integrations/salesforce_api/
├── mod.rs                      # Module exports
├── lib.rs                      # Public API surface
│
├── client/
│   ├── mod.rs
│   ├── client.rs               # SalesforceClientImpl
│   ├── builder.rs              # SalesforceClientBuilder
│   └── config.rs               # SalesforceConfig, validation
│
├── auth/
│   ├── mod.rs
│   ├── provider.rs             # AuthProvider trait
│   ├── jwt_bearer.rs           # JWT Bearer flow
│   ├── refresh_token.rs        # Refresh token flow
│   └── token_manager.rs        # Token caching and refresh
│
├── sobjects/
│   ├── mod.rs
│   ├── service.rs              # SObjectServiceImpl
│   ├── create.rs               # Create record
│   ├── read.rs                 # Get record(s)
│   ├── update.rs               # Update record
│   ├── upsert.rs               # Upsert by external ID
│   ├── delete.rs               # Delete record
│   ├── describe.rs             # Describe SObject
│   └── composite.rs            # Composite requests
│
├── query/
│   ├── mod.rs
│   ├── service.rs              # QueryServiceImpl
│   ├── execute.rs              # query(), query_more()
│   ├── stream.rs               # query_all() streaming
│   └── explain.rs              # Query explain plans
│
├── bulk/
│   ├── mod.rs
│   ├── service.rs              # BulkServiceImpl
│   ├── job.rs                  # Job lifecycle
│   ├── upload.rs               # CSV upload
│   ├── poll.rs                 # Status polling
│   ├── results.rs              # Results retrieval
│   └── orchestrator.rs         # High-level bulk orchestration
│
├── events/
│   ├── mod.rs
│   ├── service.rs              # EventServiceImpl
│   ├── publish.rs              # Platform Event publishing
│   ├── pubsub/
│   │   ├── mod.rs
│   │   ├── client.rs           # gRPC client wrapper
│   │   ├── subscribe.rs        # Subscription handling
│   │   └── avro.rs             # Avro decoding
│   └── cdc.rs                  # Change Data Capture
│
├── limits/
│   ├── mod.rs
│   ├── service.rs              # LimitsServiceImpl
│   └── tracker.rs              # Rate limit tracking
│
├── transport/
│   ├── mod.rs
│   ├── http.rs                 # HTTP client trait
│   ├── reqwest_client.rs       # Reqwest implementation
│   └── grpc.rs                 # gRPC client setup
│
├── resilience/
│   ├── mod.rs
│   └── executor.rs             # Retry + circuit breaker
│
├── error/
│   ├── mod.rs
│   ├── error.rs                # SfError enum
│   └── mapping.rs              # Salesforce code → error mapping
│
├── simulation/
│   ├── mod.rs
│   ├── recorder.rs             # SimulationRecorder
│   ├── replayer.rs             # SimulationReplayer
│   └── replay_client.rs        # ReplayHttpClient
│
├── types/
│   ├── mod.rs
│   ├── requests.rs             # Request structs
│   ├── responses.rs            # Response structs
│   └── common.rs               # Shared types
│
└── testing/
    ├── mod.rs
    ├── mock_client.rs          # MockSalesforceClient
    ├── mock_services.rs        # Mock service implementations
    └── fixtures.rs             # Test data fixtures
```

### 4.2 TypeScript Implementation

```
src/integrations/salesforce-api/
├── index.ts                    # Public exports
│
├── client/
│   ├── index.ts
│   ├── client.ts               # SalesforceClient class
│   ├── builder.ts              # SalesforceClientBuilder
│   └── config.ts               # SalesforceConfig interface
│
├── auth/
│   ├── index.ts
│   ├── provider.ts             # AuthProvider interface
│   ├── jwt-bearer.ts           # JWT Bearer flow
│   ├── refresh-token.ts        # Refresh token flow
│   └── token-manager.ts        # Token caching
│
├── sobjects/
│   ├── index.ts
│   ├── service.ts              # SObjectService implementation
│   ├── crud.ts                 # CRUD operations
│   ├── describe.ts             # Describe API
│   └── composite.ts            # Composite requests
│
├── query/
│   ├── index.ts
│   ├── service.ts              # QueryService implementation
│   ├── execute.ts              # Query execution
│   └── stream.ts               # Async iteration
│
├── bulk/
│   ├── index.ts
│   ├── service.ts              # BulkService implementation
│   ├── job.ts                  # Job operations
│   └── orchestrator.ts         # High-level API
│
├── events/
│   ├── index.ts
│   ├── service.ts              # EventService implementation
│   ├── publish.ts              # Event publishing
│   ├── pubsub/
│   │   ├── index.ts
│   │   ├── client.ts           # gRPC client
│   │   └── subscribe.ts        # Subscription handling
│   └── cdc.ts                  # CDC subscription
│
├── limits/
│   ├── index.ts
│   ├── service.ts              # LimitsService
│   └── tracker.ts              # Rate tracking
│
├── transport/
│   ├── index.ts
│   ├── http-client.ts          # HTTP client interface
│   ├── fetch-client.ts         # Fetch-based implementation
│   └── grpc-client.ts          # gRPC client
│
├── errors/
│   ├── index.ts
│   ├── sf-error.ts             # Error class hierarchy
│   └── mapping.ts              # Error code mapping
│
├── simulation/
│   ├── index.ts
│   ├── recorder.ts             # Recording
│   ├── replayer.ts             # Replay
│   └── replay-client.ts        # Replay HTTP client
│
├── types/
│   ├── index.ts
│   ├── requests.ts             # Request interfaces
│   ├── responses.ts            # Response interfaces
│   └── common.ts               # Shared types
│
└── testing/
    ├── index.ts
    ├── mock-client.ts          # Mock implementation
    └── fixtures.ts             # Test fixtures
```

---

## 5. Integration Patterns

### 5.1 With Shared Authentication

```
┌────────────────────────────────────────────────────────────────┐
│                    Credential Flow                              │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐      ┌──────────────────────────────────┐ │
│  │ClientBuilder    │      │         shared-auth              │ │
│  │                 │      │                                  │ │
│  │.credentials()   │─────▶│  OAuthProvider                   │ │
│  │                 │      │    .get("salesforce")            │ │
│  └─────────────────┘      │                                  │ │
│                           │  Returns:                        │ │
│                           │    - client_id                   │ │
│                           │    - private_key (JWT) OR        │ │
│                           │    - refresh_token               │ │
│                           │                                  │ │
│                           │  Features:                       │ │
│                           │    - Token refresh               │ │
│                           │    - Rotation support            │ │
│                           │    - Vault integration           │ │
│                           └──────────────────────────────────┘ │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 With Shared Tracing

```rust
impl SObjectServiceImpl {
    async fn create(&self, sobject: &str, record: JsonValue) -> Result<CreateResult, SfError> {
        let span = shared_tracing::span!("sf.sobjects.create", {
            "sf.instance_url" = %self.config.instance_url,
            "sf.sobject" = %sobject,
            "sf.api_version" = %self.config.api_version,
        });

        let _guard = span.enter();

        // ... operation logic ...

        span.set_attribute("sf.record_id", &output.id);
        span.set_status(Status::Ok);

        Ok(output)
    }
}
```

### 5.3 With Shared Metrics

```rust
struct SalesforceMetrics {
    requests_total: CounterVec,
    request_duration: HistogramVec,
    records_processed: CounterVec,
    errors_total: CounterVec,
    rate_limit_remaining: GaugeVec,
    bulk_records: CounterVec,
    events_total: CounterVec,
}

impl SalesforceMetrics {
    fn new(registry: &MetricsRegistry) -> Self {
        Self {
            requests_total: registry.counter_vec(
                "sf_requests_total",
                "Total Salesforce API requests",
                &["operation", "sobject", "status"],
            ),
            request_duration: registry.histogram_vec(
                "sf_request_duration_seconds",
                "Salesforce request latency",
                &["operation", "sobject"],
                vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
            ),
            rate_limit_remaining: registry.gauge_vec(
                "sf_rate_limit_remaining",
                "Remaining API calls",
                &["limit_type"],
            ),
            // ...
        }
    }
}
```

### 5.4 With Shared Configuration

```yaml
# config.yaml integration
salesforce:
  instance_url: "${SF_INSTANCE_URL}"
  api_version: "59.0"
  credentials:
    source: "shared-auth"  # or "environment", "vault"
    type: "jwt_bearer"     # or "refresh_token"
  timeout_seconds: 30
  max_retries: 3
  track_limits: true
  resilience:
    retry:
      max_attempts: 3
      initial_backoff_ms: 500
      max_backoff_ms: 60000
    circuit_breaker:
      failure_threshold: 5
      reset_timeout_seconds: 60
  bulk:
    poll_interval_seconds: 5
    timeout_seconds: 3600
  pubsub:
    endpoint: "api.pubsub.salesforce.com:7443"
    replay_preset: "LATEST"
  simulation:
    enabled: false
    recording_path: "./recordings/salesforce"
```

---

## 6. Testing Architecture

### 6.1 Test Pyramid

```
                     ┌─────────────────────┐
                     │   E2E Tests         │  Real Salesforce (sandbox)
                     │   (few, optional)   │  Full integration validation
                     └──────────┬──────────┘
                                │
                     ┌──────────▼──────────┐
                     │  Integration Tests  │  Simulation replay
                     │  (moderate)         │  Full request/response cycle
                     │                     │  OAuth flow validation
                     └──────────┬──────────┘
                                │
         ┌──────────────────────▼──────────────────────┐
         │              Unit Tests (many)              │
         │                                             │
         │  - OAuth JWT construction                  │
         │  - SOQL URL encoding                       │
         │  - JSON response parsing                   │
         │  - CSV handling for Bulk API               │
         │  - Error mapping                           │
         │  - Pagination logic                        │
         │  - Rate limit tracking                     │
         │  - Avro decoding                           │
         └─────────────────────────────────────────────┘
```

### 6.2 Mock Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                         Unit Test Scope                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Component Under Test                         │   │
│  │                                                           │   │
│  │  Real: TokenManager, QueryService, BulkOrchestrator,     │   │
│  │        SObjectService, ErrorMapper, RateLimitTracker     │   │
│  │                                                           │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             │                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│          Mock Boundary      │                                     │
│  ┌──────────────────────────▼────────────────────────────────┐   │
│  │                      Mocked                                │   │
│  │                                                            │   │
│  │  - HttpClient (returns canned responses)                  │   │
│  │  - AuthProvider (returns fixed tokens)                    │   │
│  │  - Clock (fixed timestamps for token expiry)              │   │
│  │  - GrpcClient (canned event streams)                     │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 7. Architecture Decision Records

### ADR-001: OAuth Token Management via Shared-Auth

**Context**: Salesforce requires OAuth 2.0 authentication with multiple flow options.

**Decision**: Delegate credential storage to shared-auth; implement token management locally.

**Rationale**:
- Credentials managed centrally (vault, rotation)
- Token caching and refresh specific to Salesforce OAuth semantics
- Automatic refresh before expiration

**Consequences**:
- TokenManager handles caching, refresh timing
- AuthProvider interface for different OAuth flows
- Thread-safe token access with RwLock

### ADR-002: API Version Pinning

**Context**: Salesforce releases new API versions regularly (3x/year).

**Decision**: Pin API version in configuration, default to recent stable version.

**Rationale**:
- Prevents unexpected breaking changes
- Explicit upgrade path via configuration
- Matches enterprise stability requirements

**Consequences**:
- All endpoints include version: `/services/data/v59.0/...`
- Version configurable per client instance
- No automatic version detection

### ADR-003: Dual Transport (HTTP + gRPC)

**Context**: Salesforce Pub/Sub API uses gRPC while REST API uses HTTP.

**Decision**: Support both transports with shared authentication.

**Rationale**:
- Pub/Sub API is gRPC-only for efficiency
- REST API covers all other operations
- Same OAuth token works for both

**Consequences**:
- HttpClient for REST operations
- GrpcClient for Pub/Sub subscription
- TokenManager provides tokens to both
- Additional dependency on tonic/grpc-js

### ADR-004: Rate Limit Tracking

**Context**: Salesforce enforces per-org API limits.

**Decision**: Proactive rate limit tracking via Limits API.

**Rationale**:
- Avoid hitting limits unexpectedly
- Enable proactive throttling
- Surface metrics for monitoring

**Consequences**:
- Periodic Limits API calls (configurable)
- RateLimitTracker maintains current state
- Warnings when approaching limits
- Optional request throttling

### ADR-005: Bulk API 2.0 Only

**Context**: Salesforce has legacy Bulk API 1.0 and modern Bulk API 2.0.

**Decision**: Support Bulk API 2.0 only.

**Rationale**:
- 2.0 is simpler (no batch management)
- Better performance characteristics
- CSV-based (easier than XML)
- 1.0 is maintenance mode

**Consequences**:
- Simpler implementation
- No XML handling for bulk
- Job-level error handling
- 150M record limit per job sufficient

### ADR-006: Simulation as First-Class Feature

**Context**: Need deterministic testing without real Salesforce org.

**Decision**: Build record/replay simulation into the transport layer.

**Rationale**:
- Enables testing without Salesforce credentials
- Fast CI/CD pipelines (no network)
- Reproducible failure scenarios
- OAuth flow testing without real credentials

**Consequences**:
- SfRecorder trait for recording mode
- SfReplayer trait for replay mode
- ReplayHttpClient wraps recorded responses
- Recording files in JSON format

---

## 8. Security Considerations

### 8.1 Credential Security

| Requirement | Implementation |
|-------------|----------------|
| Credentials never logged | `SecretString` with `Display` redaction |
| Zeroize on drop | `Zeroize` trait implementation |
| Token rotation | Automatic refresh before expiry |
| Key storage | Delegate to shared-auth/vault |

### 8.2 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | HTTP/gRPC client configuration |
| HTTPS enforced | Reject HTTP endpoints |
| Certificate validation | System CA store |
| gRPC TLS | Required for Pub/Sub API |

### 8.3 Permission Scoping

| Requirement | Implementation |
|-------------|----------------|
| Minimal OAuth scopes | Only request needed scopes |
| Connected App limits | Document required permissions |
| FLS/Sharing respect | API enforces automatically |
| Audit logging | All operations traced |

---

## 9. Performance Considerations

### 9.1 Latency Targets

| Operation | Target p50 | Target p99 |
|-----------|------------|------------|
| Single record CRUD | < 200ms | < 1s |
| SOQL query (< 200 records) | < 300ms | < 2s |
| Composite (25 subrequests) | < 1s | < 5s |
| Bulk job creation | < 500ms | < 2s |
| Event receive (Pub/Sub) | < 100ms | < 500ms |

### 9.2 Connection Management

| Resource | Configuration |
|----------|---------------|
| HTTP connection pool | 20 connections |
| gRPC channel | Single channel, multiplexed |
| Idle timeout | 90s |
| Keep-alive | Enabled |

### 9.3 Memory Budgets

| Resource | Budget |
|----------|--------|
| Per REST request | < 1MB |
| Bulk CSV streaming | Chunked |
| Event buffer | Configurable |
| Query result page | < 2MB |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-15 | SPARC Generator | Initial Architecture |

---

**Next Phase:** Refinement - Implementation details, edge cases, performance optimization, and security hardening.
