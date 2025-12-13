# Architecture: Snowflake Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/snowflake`

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
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    ┌──────────────┐         ┌──────────────────────────────────┐            │
│    │   Platform   │         │      Snowflake Integration       │            │
│    │   Services   │◄───────►│           Module                 │            │
│    │              │         │                                  │            │
│    │  - Workflows │         │  - Query Execution               │            │
│    │  - Features  │         │  - Data Ingestion                │            │
│    │  - Analytics │         │  - Cost Monitoring               │            │
│    │  - Reporting │         │  - Warehouse Routing             │            │
│    └──────────────┘         └──────────────┬───────────────────┘            │
│                                            │                                 │
│                                            │ HTTPS (REST API)                │
│                                            │ TLS 1.2+                        │
│                                            ▼                                 │
│                             ┌──────────────────────────────────┐            │
│                             │       Snowflake Cloud            │            │
│                             │                                  │            │
│                             │  ┌────────────────────────────┐  │            │
│                             │  │    Virtual Warehouses      │  │            │
│                             │  │  ┌──────┐ ┌──────┐ ┌─────┐ │  │            │
│                             │  │  │ XS   │ │  M   │ │ XL  │ │  │            │
│                             │  │  └──────┘ └──────┘ └─────┘ │  │            │
│                             │  └────────────────────────────┘  │            │
│                             │                                  │            │
│                             │  ┌────────────────────────────┐  │            │
│                             │  │     Cloud Services         │  │            │
│                             │  │  Auth, Metadata, Optimizer │  │            │
│                             │  └────────────────────────────┘  │            │
│                             │                                  │            │
│                             │  ┌────────────────────────────┐  │            │
│                             │  │     Cloud Storage          │  │            │
│                             │  │   (S3/GCS/Azure Blob)      │  │            │
│                             │  └────────────────────────────┘  │            │
│                             └──────────────────────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 External Dependencies

| System | Interaction | Protocol |
|--------|-------------|----------|
| Snowflake Cloud | Query execution, data storage | HTTPS REST |
| Cloud Storage (S3/GCS/Azure) | Stage file upload | HTTPS |
| Platform Auth | Credential retrieval | Internal API |
| Metrics Service | Telemetry export | gRPC/HTTP |
| Workflow Engine | Query completion triggers | Internal Events |

---

## 2. Container Architecture

### 2.1 C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONTAINER ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   Snowflake Integration Module                       │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │    │
│  │  │   Client    │  │   Query     │  │    Data     │  │  Warehouse │  │    │
│  │  │   Manager   │  │   Engine    │  │  Ingestion  │  │   Router   │  │    │
│  │  │             │  │             │  │             │  │            │  │    │
│  │  │ - Sessions  │  │ - Sync exec │  │ - Stage PUT │  │ - Status   │  │    │
│  │  │ - Pooling   │  │ - Async exec│  │ - COPY INTO │  │ - Routing  │  │    │
│  │  │ - Auth      │  │ - Streaming │  │ - Bulk load │  │ - Hints    │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘  │    │
│  │         │                │                │               │         │    │
│  │         └────────────────┼────────────────┼───────────────┘         │    │
│  │                          │                │                          │    │
│  │                          ▼                ▼                          │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │    │
│  │  │    Cost     │  │   Result    │  │  Metadata   │  │ Simulation │  │    │
│  │  │   Monitor   │  │   Handler   │  │   Service   │  │   Layer    │  │    │
│  │  │             │  │             │  │             │  │            │  │    │
│  │  │ - Credits   │  │ - Parsing   │  │ - Discovery │  │ - Record   │  │    │
│  │  │ - Estimates │  │ - Streaming │  │ - History   │  │ - Replay   │  │    │
│  │  │ - Alerts    │  │ - Export    │  │ - Stats     │  │ - Fingerp. │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                     Shared Components                        │    │    │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │    │    │
│  │  │  │   HTTP   │  │   Auth   │  │  Metrics │  │   Error  │    │    │    │
│  │  │  │  Client  │  │ Provider │  │ Collector│  │  Handler │    │    │    │
│  │  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Container Responsibilities

| Container | Responsibility | Dependencies |
|-----------|---------------|--------------|
| Client Manager | Session lifecycle, authentication | HTTP Client, Auth |
| Query Engine | SQL execution, async handling | Client Manager |
| Data Ingestion | Stage uploads, COPY operations | Client Manager, HTTP |
| Warehouse Router | Workload routing, status | Client Manager |
| Cost Monitor | Credit tracking, estimation | Query Engine |
| Result Handler | Parsing, streaming, export | Query Engine |
| Metadata Service | Schema discovery, history | Query Engine |
| Simulation Layer | Record/replay for testing | Result Handler |

---

## 3. Component Architecture

### 3.1 Client Manager Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT MANAGER COMPONENTS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                        SnowflakeClient                              │     │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │     │
│  │  │   Connection    │  │  Authentication │  │     Session     │    │     │
│  │  │      Pool       │  │    Handler      │  │     Cache       │    │     │
│  │  │                 │  │                 │  │                 │    │     │
│  │  │ min/max_conns   │  │ Password        │  │ session_id      │    │     │
│  │  │ idle_timeout    │  │ KeyPair + JWT   │  │ token           │    │     │
│  │  │ acquire()       │  │ OAuth + refresh │  │ master_token    │    │     │
│  │  │ release()       │  │ ExternalBrowser │  │ expiry tracking │    │     │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │     │
│  │                                                                    │     │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │     │
│  │  │   HTTP Client   │  │  TLS Manager    │  │  Context Mgmt   │    │     │
│  │  │                 │  │                 │  │                 │    │     │
│  │  │ connection_pool │  │ cert validation │  │ USE DATABASE    │    │     │
│  │  │ timeout config  │  │ min TLS 1.2     │  │ USE SCHEMA      │    │     │
│  │  │ retry logic     │  │ proxy support   │  │ USE WAREHOUSE   │    │     │
│  │  │ rate limiting   │  │                 │  │ USE ROLE        │    │     │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Query Engine Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUERY ENGINE COMPONENTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                        QueryBuilder                                │      │
│  │                                                                    │      │
│  │  sql: String           params: Vec<QueryParam>                    │      │
│  │  warehouse: Option     timeout: Option<Duration>                  │      │
│  │  tag: Option           async_exec: bool                           │      │
│  │  context: Option       build() -> QueryRequest                    │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐                     │
│  │   SyncQueryExecutor    │  │   AsyncQueryExecutor   │                     │
│  │                        │  │                        │                     │
│  │  execute()             │  │  submit()              │                     │
│  │  execute_multi()       │  │  poll_status()         │                     │
│  │  execute_stream()      │  │  get_result()          │                     │
│  │                        │  │  cancel()              │                     │
│  │                        │  │  wait_with_timeout()   │                     │
│  └────────────────────────┘  └────────────────────────┘                     │
│                                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐                     │
│  │   ParameterBinder      │  │   QueryTagging         │                     │
│  │                        │  │                        │                     │
│  │  bind_positional()     │  │  set_query_tag()       │                     │
│  │  bind_named()          │  │  get_query_tag()       │                     │
│  │  convert_types()       │  │  tag_format: String    │                     │
│  │  validate_params()     │  │                        │                     │
│  └────────────────────────┘  └────────────────────────┘                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Data Ingestion Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DATA INGESTION COMPONENTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                         StageManager                                │     │
│  │                                                                     │     │
│  │   put_file()           list_stage()          remove_file()         │     │
│  │   get_presigned_url()  upload_to_cloud()     download_from_stage() │     │
│  │                                                                     │     │
│  │   Cloud Storage Adapters:                                           │     │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐                         │     │
│  │   │   S3     │  │   GCS    │  │  Azure   │                         │     │
│  │   │ Uploader │  │ Uploader │  │ Uploader │                         │     │
│  │   └──────────┘  └──────────┘  └──────────┘                         │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                       CopyIntoBuilder                               │     │
│  │                                                                     │     │
│  │   target_table: String       stage: String                         │     │
│  │   file_pattern: Option       file_format: FileFormat               │     │
│  │   copy_options: CopyOptions  transform: Option<String>             │     │
│  │                                                                     │     │
│  │   build_statement()          validate()                            │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐                     │
│  │     FileFormat         │  │     CopyOptions        │                     │
│  │                        │  │                        │                     │
│  │  CSV / JSON / PARQUET  │  │  on_error: OnError     │                     │
│  │  AVRO / ORC / XML      │  │  purge: bool           │                     │
│  │  compression settings  │  │  force: bool           │                     │
│  │  delimiters, headers   │  │  size_limit: Option    │                     │
│  │  null_if, date_format  │  │  match_by_column_name  │                     │
│  └────────────────────────┘  └────────────────────────┘                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Warehouse Router Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WAREHOUSE ROUTER COMPONENTS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                       WarehouseRouter                               │     │
│  │                                                                     │     │
│  │   warehouses: HashMap<String, WarehouseConfig>                     │     │
│  │   default_warehouse: String                                         │     │
│  │                                                                     │     │
│  │   select_warehouse(workload, size_hint) -> String                  │     │
│  │   get_warehouse_statuses() -> HashMap                              │     │
│  │   refresh_status_cache()                                            │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐                     │
│  │   WarehouseConfig      │  │   WarehouseInfo        │                     │
│  │                        │  │                        │                     │
│  │  name: String          │  │  name: String          │                     │
│  │  size: WarehouseSize   │  │  state: State          │                     │
│  │  max_queue_depth: u32  │  │  size: WarehouseSize   │                     │
│  │  preferred_workloads   │  │  cluster_count: u8     │                     │
│  │                        │  │  queued/running: u32   │                     │
│  └────────────────────────┘  └────────────────────────┘                     │
│                                                                              │
│  Workload Types:                                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │Interactive │ │   Batch    │ │ Analytics  │ │DataScience │ │Reporting │  │
│  │ XS-S, low  │ │ L-XL, high │ │ M-L, med   │ │ M-XL, ML   │ │ S-M, sched│ │
│  │ latency    │ │ throughput │ │ complex    │ │ features   │ │ queries  │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Query Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          QUERY EXECUTION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Application                                                                 │
│      │                                                                       │
│      │  QueryBuilder::new("SELECT...").warehouse("WH").build()              │
│      ▼                                                                       │
│  ┌───────────────┐                                                          │
│  │ SnowflakeClient│                                                         │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  1. Check simulation mode                                        │
│          ▼                                                                   │
│  ┌───────────────────┐     ┌───────────────────┐                           │
│  │ Simulation Layer  │────►│ Return recorded   │  (replay mode)            │
│  └───────┬───────────┘     └───────────────────┘                           │
│          │                                                                   │
│          │  2. Acquire session from pool                                    │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │Connection Pool│──► Session { token, context }                            │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  3. Apply context (warehouse, role, database)                    │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │Context Manager│──► USE WAREHOUSE / ROLE / DATABASE                       │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  4. Build and send request                                       │
│          ▼                                                                   │
│  ┌───────────────┐     ┌───────────────────────────────────────┐           │
│  │ HTTP Client   │────►│  POST /queries/v1/query-request       │           │
│  │               │     │  Authorization: Snowflake Token="..."  │           │
│  │               │     │  Body: { sqlText, bindings, ... }      │           │
│  └───────┬───────┘     └───────────────────────────────────────┘           │
│          │                                                                   │
│          │  5. Snowflake processes query                                    │
│          ▼                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                    Snowflake Cloud                             │          │
│  │  Cloud Services ──► Query Optimizer ──► Warehouse ──► Storage │          │
│  └───────────────────────────────────────────────────────────────┘          │
│          │                                                                   │
│          │  6. Parse response                                               │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │Result Handler │──► Parse columns, rows, stats                            │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  7. Record metrics and simulation data                           │
│          ▼                                                                   │
│  ┌───────────────┐  ┌───────────────┐                                       │
│  │   Metrics     │  │  Simulation   │                                       │
│  │  Collector    │  │   Recorder    │                                       │
│  └───────────────┘  └───────────────┘                                       │
│          │                                                                   │
│          ▼                                                                   │
│     QueryResult { query_id, columns, rows, stats }                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Async Query Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ASYNC QUERY FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  execute_async(query)                                                       │
│      │                                                                       │
│      │  Submit with async_exec: true                                        │
│      ▼                                                                       │
│  ┌───────────────┐     ┌───────────────────┐                               │
│  │  Snowflake    │────►│  Query Queued     │                               │
│  │    API        │     │  query_id: "abc"  │                               │
│  └───────────────┘     └───────────────────┘                               │
│      │                                                                       │
│      │  Return immediately                                                  │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                    AsyncQueryHandle                            │          │
│  │                                                                │          │
│  │   query_id: "abc"                                             │          │
│  │   status: Arc<RwLock<QueryStatus>>                            │          │
│  │                                                                │          │
│  │   Methods:                                                     │          │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │          │
│  │   │  poll() │  │ wait()  │  │ cancel()│  │wait_with_timeout│ │          │
│  │   └────┬────┘  └────┬────┘  └────┬────┘  └────────┬────────┘ │          │
│  │        │            │            │                │           │          │
│  └────────┼────────────┼────────────┼────────────────┼───────────┘          │
│           │            │            │                │                       │
│           ▼            ▼            ▼                ▼                       │
│  ┌────────────────────────────────────────────────────────────────┐         │
│  │                      Poll Loop                                  │         │
│  │                                                                 │         │
│  │   GET /monitoring/queries/{query_id}                           │         │
│  │                                                                 │         │
│  │   Status: QUEUED ──► RUNNING ──► SUCCESS/FAILED                │         │
│  │              │           │           │                          │         │
│  │              └───────────┴───────────┘                          │         │
│  │                   sleep(500ms)                                  │         │
│  └────────────────────────────────────────────────────────────────┘         │
│           │                                                                  │
│           │  On Success                                                     │
│           ▼                                                                  │
│  ┌───────────────────┐                                                      │
│  │  Fetch Results    │──► GET /queries/v1/query-request?requestId=abc      │
│  └───────────────────┘                                                      │
│           │                                                                  │
│           ▼                                                                  │
│     QueryResult                                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Data Ingestion Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA INGESTION FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  bulk_insert(table, records)                                                │
│      │                                                                       │
│      │  1. Serialize records to file                                        │
│      ▼                                                                       │
│  ┌───────────────┐                                                          │
│  │  Serializer   │──► temp_file.csv / .json / .parquet                      │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  2. Upload to stage                                              │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │ Stage Manager │                                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  PUT 'file://...' @%table                                        │
│          ▼                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                  Stage Upload Process                          │          │
│  │                                                                │          │
│  │  a. Get presigned URL from Snowflake                          │          │
│  │  b. Compress file (if auto_compress)                          │          │
│  │  c. Upload to cloud storage                                   │          │
│  │                                                                │          │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │          │
│  │  │  AWS S3     │  │  GCS        │  │  Azure Blob │           │          │
│  │  │  PUT object │  │  PUT object │  │  PUT blob   │           │          │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │          │
│  └───────────────────────────────────────────────────────────────┘          │
│          │                                                                   │
│          │  3. Execute COPY INTO                                            │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │CopyIntoBuilder│                                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  COPY INTO table FROM @%table                                    │
│          │  FILE_FORMAT = (TYPE = CSV ...)                                  │
│          │  ON_ERROR = CONTINUE                                             │
│          │  PURGE = TRUE                                                    │
│          ▼                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                  Snowflake COPY Engine                         │          │
│  │                                                                │          │
│  │  Stage Files ──► Parse ──► Validate ──► Load to Table         │          │
│  │                                                                │          │
│  └───────────────────────────────────────────────────────────────┘          │
│          │                                                                   │
│          ▼                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                     CopyResult                                 │          │
│  │                                                                │          │
│  │  files_processed: 1                                           │          │
│  │  rows_loaded: 10000                                           │          │
│  │  results: [LoadResult { file, status, rows, errors }]         │          │
│  └───────────────────────────────────────────────────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Result Streaming Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESULT STREAMING FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  execute_stream(query)                                                      │
│      │                                                                       │
│      │  Execute query                                                       │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                   Initial Response                             │          │
│  │                                                                │          │
│  │  {                                                             │          │
│  │    "rowset": [...first batch...],                              │          │
│  │    "chunkHeaders": {...},                                      │          │
│  │    "chunks": [                                                 │          │
│  │      { "url": "https://...", "rowCount": 10000 },             │          │
│  │      { "url": "https://...", "rowCount": 10000 },             │          │
│  │    ]                                                           │          │
│  │  }                                                             │          │
│  └───────────────────────────────────────────────────────────────┘          │
│      │                                                                       │
│      │  Create ResultStream                                                 │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                     ResultStream                               │          │
│  │                                                                │          │
│  │   current_chunk: Vec<Row>     chunk_index: 0                  │          │
│  │   chunk_urls: Vec<String>     row_index: 0                    │          │
│  └───────────────────────────────────────────────────────────────┘          │
│      │                                                                       │
│      │  Application iterates                                                │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                    Stream Iteration                            │          │
│  │                                                                │          │
│  │   while let Some(row) = stream.next().await {                 │          │
│  │       process(row);                                            │          │
│  │   }                                                            │          │
│  │                                                                │          │
│  │   Chunk 0 (inline) ──► Chunk 1 (fetch) ──► Chunk 2 (fetch)   │          │
│  │        │                    │                   │              │          │
│  │        ▼                    ▼                   ▼              │          │
│  │   rows 0-9999         rows 10000-19999    rows 20000-29999    │          │
│  │                                                                │          │
│  └───────────────────────────────────────────────────────────────┘          │
│      │                                                                       │
│      │  Chunk fetching (lazy)                                               │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                   Chunk Download                               │          │
│  │                                                                │          │
│  │  GET {chunk_url}                                              │          │
│  │  Headers: Authorization: Snowflake Token="..."                │          │
│  │                                                                │          │
│  │  Response: [[row1_values], [row2_values], ...]                │          │
│  └───────────────────────────────────────────────────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Concurrency Model

### 5.1 Session Pool Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SESSION POOL ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Connection Pool                               │    │
│  │                                                                      │    │
│  │   Configuration:                                                     │    │
│  │   ├── min_connections: 2                                            │    │
│  │   ├── max_connections: 10                                           │    │
│  │   ├── idle_timeout: 30min                                           │    │
│  │   ├── max_lifetime: 4hr                                             │    │
│  │   └── acquire_timeout: 30s                                          │    │
│  │                                                                      │    │
│  │   ┌─────────────────────────────────────────────────────────────┐   │    │
│  │   │                   Session Pool                               │   │    │
│  │   │                                                              │   │    │
│  │   │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │   │    │
│  │   │   │Session 1│ │Session 2│ │Session 3│ │   ...   │          │   │    │
│  │   │   │ (idle)  │ │(in_use) │ │ (idle)  │ │         │          │   │    │
│  │   │   └─────────┘ └─────────┘ └─────────┘ └─────────┘          │   │    │
│  │   │                                                              │   │    │
│  │   └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   Semaphore: controls max concurrent acquisitions                   │    │
│  │                                                                      │    │
│  │   Session Lifecycle:                                                 │    │
│  │   ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐             │    │
│  │   │ Create │───►│  Idle  │◄──►│ In Use │───►│ Expire │             │    │
│  │   └────────┘    └────────┘    └────────┘    └────────┘             │    │
│  │       │              ▲                           │                  │    │
│  │       │              │                           │                  │    │
│  │       └──────────────┴───────────────────────────┘                  │    │
│  │              (4hr max lifetime or idle timeout)                     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Query Concurrency

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUERY CONCURRENCY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Multiple Concurrent Queries:                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   // Parallel queries with tokio::join!                             │    │
│  │   let (r1, r2, r3) = tokio::join!(                                  │    │
│  │       client.execute(query1),                                       │    │
│  │       client.execute(query2),                                       │    │
│  │       client.execute(query3),                                       │    │
│  │   );                                                                 │    │
│  │                                                                      │    │
│  │   // Each gets own session from pool                                │    │
│  │   Session 1 ──► Query 1 ──► Warehouse A                            │    │
│  │   Session 2 ──► Query 2 ──► Warehouse A (queued)                   │    │
│  │   Session 3 ──► Query 3 ──► Warehouse B                            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Warehouse Queue Management:                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   Warehouse: ANALYTICS_WH (Medium, 8 slots)                        │    │
│  │                                                                      │    │
│  │   Running: [Q1] [Q2] [Q3] [Q4] [Q5] [Q6] [Q7] [Q8]                │    │
│  │   Queued:  [Q9] [Q10] ...                                          │    │
│  │                                                                      │    │
│  │   Router can redirect to less-loaded warehouse:                     │    │
│  │   if queued > threshold:                                            │    │
│  │       use ANALYTICS_WH_2 instead                                    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Streaming with Backpressure:                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   // Bounded buffer for chunk processing                            │    │
│  │   stream.buffer_unordered(4)  // Max 4 chunks in flight            │    │
│  │         .for_each_concurrent(2, process_row)                        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Error Handling Architecture

### 6.1 Error Classification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR CLASSIFICATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       SnowflakeError                                 │    │
│  │                                                                      │    │
│  │   ┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐  │    │
│  │   │  Authentication │     │    Connection   │     │    Query     │  │    │
│  │   │     Errors      │     │     Errors      │     │   Errors     │  │    │
│  │   │                 │     │                 │     │              │  │    │
│  │   │ - InvalidCreds  │     │ - Timeout       │     │ - Syntax     │  │    │
│  │   │ - ExpiredToken  │     │ - PoolExhausted │     │ - Execution  │  │    │
│  │   │ - KeyPairError  │     │ - NetworkError  │     │ - Cancelled  │  │    │
│  │   │ - OAuthError    │     │ - TlsError      │     │ - Timeout    │  │    │
│  │   └─────────────────┘     └─────────────────┘     └──────────────┘  │    │
│  │                                                                      │    │
│  │   ┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐  │    │
│  │   │   Ingestion     │     │    Warehouse    │     │  Simulation  │  │    │
│  │   │    Errors       │     │     Errors      │     │   Errors     │  │    │
│  │   │                 │     │                 │     │              │  │    │
│  │   │ - StageUpload   │     │ - NotFound      │     │ - Mismatch   │  │    │
│  │   │ - CopyFailed    │     │ - Suspended     │     │ - NotRecorded│  │    │
│  │   │ - FileFormat    │     │ - QueueFull     │     │ - TypeError  │  │    │
│  │   │ - DataError     │     │ - Resizing      │     │              │  │    │
│  │   └─────────────────┘     └─────────────────┘     └──────────────┘  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Retry Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RETRY STRATEGY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Retryable Errors:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   ├── Network timeout (connection, read)                            │    │
│  │   ├── Session expired (re-authenticate)                             │    │
│  │   ├── HTTP 429 Too Many Requests (rate limit)                       │    │
│  │   ├── HTTP 503 Service Unavailable                                  │    │
│  │   └── Transient query errors (warehouse starting)                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Non-Retryable Errors:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   ├── Authentication failed (invalid credentials)                   │    │
│  │   ├── Authorization denied (missing permissions)                    │    │
│  │   ├── SQL syntax errors                                             │    │
│  │   ├── Object not found (table, warehouse)                          │    │
│  │   └── Data validation errors                                        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Retry Logic:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   max_retries: 3                                                    │    │
│  │   base_delay: 100ms                                                 │    │
│  │   max_delay: 10s                                                    │    │
│  │   exponential_base: 2                                               │    │
│  │   jitter: 0-100ms                                                   │    │
│  │                                                                      │    │
│  │   Attempt 1: immediate                                              │    │
│  │   Attempt 2: 100ms + jitter                                         │    │
│  │   Attempt 3: 200ms + jitter                                         │    │
│  │   Attempt 4: 400ms + jitter (final)                                 │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Integration Patterns

### 7.1 Feature Extraction Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FEATURE EXTRACTION PATTERN                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ML Feature Pipeline:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   // Extract features from Snowflake                                │    │
│  │   let query = QueryBuilder::new("                                   │    │
│  │       SELECT user_id,                                               │    │
│  │              AVG(purchase_amount) as avg_purchase,                  │    │
│  │              COUNT(*) as purchase_count,                            │    │
│  │              DATEDIFF('day', MIN(date), MAX(date)) as tenure       │    │
│  │       FROM transactions                                             │    │
│  │       GROUP BY user_id                                              │    │
│  │   ")                                                                 │    │
│  │   .warehouse("ML_COMPUTE_WH")                                       │    │
│  │   .tag("feature_extraction")                                        │    │
│  │   .build();                                                         │    │
│  │                                                                      │    │
│  │   let features = client.execute_stream(query).await?;              │    │
│  │                                                                      │    │
│  │   // Store in feature store / vector memory                         │    │
│  │   features.for_each(|row| {                                         │    │
│  │       feature_store.upsert(row.user_id, row.to_feature_vector());  │    │
│  │   });                                                                │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Reporting Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REPORTING PATTERN                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Scheduled Report Generation:                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   // Select appropriate warehouse for reporting workload            │    │
│  │   let warehouse = router.select_warehouse(                          │    │
│  │       WorkloadType::Reporting,                                      │    │
│  │       Some(WarehouseSize::Medium)                                   │    │
│  │   ).await?;                                                         │    │
│  │                                                                      │    │
│  │   // Execute report query                                           │    │
│  │   let result = client.execute(                                      │    │
│  │       QueryBuilder::new(report_sql)                                 │    │
│  │           .warehouse(&warehouse)                                    │    │
│  │           .tag("daily_sales_report")                                │    │
│  │           .build()                                                  │    │
│  │   ).await?;                                                         │    │
│  │                                                                      │    │
│  │   // Export to various formats                                      │    │
│  │   result.export_csv(&mut csv_writer).await?;                       │    │
│  │   result.export_parquet("s3://reports/daily.parquet").await?;      │    │
│  │                                                                      │    │
│  │   // Track cost                                                     │    │
│  │   let cost = client.get_query_cost(&result.query_id).await?;       │    │
│  │   metrics.report_cost("daily_sales", cost.total_credits);          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 ETL/ELT Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ETL/ELT PATTERN                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Batch Data Pipeline:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   // 1. Extract: Upload source data to stage                        │    │
│  │   client.put_file(                                                  │    │
│  │       &source_file,                                                 │    │
│  │       "@RAW_DATA_STAGE",                                            │    │
│  │       PutOptions { auto_compress: true, parallel: 4 }               │    │
│  │   ).await?;                                                         │    │
│  │                                                                      │    │
│  │   // 2. Load: COPY INTO staging table                               │    │
│  │   client.copy_into(CopyIntoRequest {                                │    │
│  │       target_table: "RAW.STAGING_TABLE".to_string(),                │    │
│  │       stage: "@RAW_DATA_STAGE".to_string(),                         │    │
│  │       file_format: FileFormat::csv(),                               │    │
│  │       copy_options: CopyOptions {                                   │    │
│  │           on_error: OnError::Continue,                              │    │
│  │           purge: true,                                              │    │
│  │           ..Default::default()                                      │    │
│  │       },                                                            │    │
│  │       ..Default::default()                                          │    │
│  │   }).await?;                                                        │    │
│  │                                                                      │    │
│  │   // 3. Transform: ELT in Snowflake                                 │    │
│  │   client.execute(QueryBuilder::new("                                │    │
│  │       INSERT INTO PROD.CLEAN_TABLE                                  │    │
│  │       SELECT transform(col1), clean(col2), ...                     │    │
│  │       FROM RAW.STAGING_TABLE                                        │    │
│  │       WHERE valid(col3)                                             │    │
│  │   ").warehouse("ETL_WH_XL").build()).await?;                       │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Architecture

### 8.1 Kubernetes Deployment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       KUBERNETES DEPLOYMENT                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  apiVersion: apps/v1                                                        │
│  kind: Deployment                                                           │
│  metadata:                                                                  │
│    name: snowflake-integration                                              │
│  spec:                                                                      │
│    replicas: 3                                                              │
│    template:                                                                │
│      spec:                                                                  │
│        containers:                                                          │
│        - name: snowflake-integration                                        │
│          image: llm-devops/snowflake:latest                                │
│          env:                                                               │
│          - name: SNOWFLAKE_ACCOUNT                                          │
│            valueFrom:                                                       │
│              secretKeyRef:                                                  │
│                name: snowflake-credentials                                  │
│                key: account                                                 │
│          - name: SNOWFLAKE_USER                                             │
│            valueFrom:                                                       │
│              secretKeyRef:                                                  │
│                name: snowflake-credentials                                  │
│                key: user                                                    │
│          - name: SNOWFLAKE_PRIVATE_KEY                                      │
│            valueFrom:                                                       │
│              secretKeyRef:                                                  │
│                name: snowflake-credentials                                  │
│                key: private_key                                             │
│          - name: SNOWFLAKE_WAREHOUSE                                        │
│            value: "COMPUTE_WH"                                              │
│          - name: SNOWFLAKE_DATABASE                                         │
│            value: "ANALYTICS"                                               │
│          volumeMounts:                                                      │
│          - name: private-key                                                │
│            mountPath: /etc/snowflake                                        │
│            readOnly: true                                                   │
│          resources:                                                         │
│            requests:                                                        │
│              memory: "256Mi"                                                │
│              cpu: "100m"                                                    │
│            limits:                                                          │
│              memory: "512Mi"                                                │
│              cpu: "500m"                                                    │
│        volumes:                                                             │
│        - name: private-key                                                  │
│          secret:                                                            │
│            secretName: snowflake-keypair                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Environment Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ENVIRONMENT CONFIGURATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Development:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │   SNOWFLAKE_ACCOUNT=myorg-dev                                       │    │
│  │   SNOWFLAKE_USER=dev_user                                           │    │
│  │   SNOWFLAKE_AUTH_TYPE=password                                      │    │
│  │   SNOWFLAKE_WAREHOUSE=DEV_XS                                        │    │
│  │   SNOWFLAKE_DATABASE=DEV_DB                                         │    │
│  │   SNOWFLAKE_POOL_MIN=1                                              │    │
│  │   SNOWFLAKE_POOL_MAX=5                                              │    │
│  │   SNOWFLAKE_SIMULATION_MODE=record                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Production:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │   SNOWFLAKE_ACCOUNT=myorg-prod                                      │    │
│  │   SNOWFLAKE_USER=svc_analytics                                      │    │
│  │   SNOWFLAKE_AUTH_TYPE=keypair                                       │    │
│  │   SNOWFLAKE_PRIVATE_KEY_PATH=/etc/snowflake/rsa_key.p8             │    │
│  │   SNOWFLAKE_WAREHOUSE=ANALYTICS_WH                                  │    │
│  │   SNOWFLAKE_DATABASE=PROD_ANALYTICS                                 │    │
│  │   SNOWFLAKE_POOL_MIN=5                                              │    │
│  │   SNOWFLAKE_POOL_MAX=20                                             │    │
│  │   SNOWFLAKE_QUERY_TIMEOUT=300s                                      │    │
│  │   SNOWFLAKE_SIMULATION_MODE=disabled                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Monitoring Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MONITORING INTEGRATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Prometheus Metrics:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   # Query metrics                                                   │    │
│  │   snowflake_queries_total{warehouse="WH", status="success"}        │    │
│  │   snowflake_query_duration_seconds{warehouse="WH", quantile="0.99"}│    │
│  │   snowflake_query_bytes_scanned{warehouse="WH"}                    │    │
│  │                                                                      │    │
│  │   # Cost metrics                                                    │    │
│  │   snowflake_credits_used_total{warehouse="WH"}                     │    │
│  │   snowflake_credits_estimated{query_tag="etl"}                     │    │
│  │                                                                      │    │
│  │   # Session pool metrics                                            │    │
│  │   snowflake_pool_sessions{state="idle"}                            │    │
│  │   snowflake_pool_sessions{state="in_use"}                          │    │
│  │   snowflake_pool_acquire_duration_seconds                          │    │
│  │                                                                      │    │
│  │   # Warehouse metrics                                               │    │
│  │   snowflake_warehouse_state{warehouse="WH", state="STARTED"}       │    │
│  │   snowflake_warehouse_queued_queries{warehouse="WH"}               │    │
│  │                                                                      │    │
│  │   # Ingestion metrics                                               │    │
│  │   snowflake_copy_rows_loaded_total{table="T"}                      │    │
│  │   snowflake_copy_errors_total{table="T"}                           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Health Endpoint:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │   GET /health/snowflake                                             │    │
│  │                                                                      │    │
│  │   {                                                                  │    │
│  │     "status": "healthy",                                            │    │
│  │     "account": "myorg-prod",                                        │    │
│  │     "latency_ms": 45,                                               │    │
│  │     "pool": {                                                        │    │
│  │       "idle": 3,                                                    │    │
│  │       "in_use": 2,                                                  │    │
│  │       "max": 20                                                     │    │
│  │     },                                                               │    │
│  │     "default_warehouse": {                                          │    │
│  │       "name": "ANALYTICS_WH",                                       │    │
│  │       "state": "STARTED",                                           │    │
│  │       "size": "MEDIUM"                                              │    │
│  │     }                                                                │    │
│  │   }                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-SNOW-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*Proceed to Refinement phase upon approval.*
