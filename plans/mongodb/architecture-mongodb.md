# Architecture: MongoDB Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/mongodb`

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
│    │   Platform   │         │      MongoDB Integration         │            │
│    │   Services   │◄───────►│          Module                  │            │
│    │              │         │                                  │            │
│    │  - Workflows │         │  - Connection Management         │            │
│    │  - Events    │         │  - CRUD Operations               │            │
│    │  - Metrics   │         │  - Aggregation Pipeline          │            │
│    │  - Vector    │         │  - Change Streams                │            │
│    └──────────────┘         │  - Transactions                  │            │
│                             └──────────────┬───────────────────┘            │
│                                            │                                 │
│                                            │ MongoDB Wire Protocol           │
│                                            │ (OP_MSG, TLS)                   │
│                                            ▼                                 │
│                             ┌──────────────────────────────────┐            │
│                             │       MongoDB Cluster            │            │
│                             │                                  │            │
│                             │  ┌────────┐  ┌────────┐         │            │
│                             │  │Primary │  │Secondary│ ...     │            │
│                             │  └────────┘  └────────┘         │            │
│                             │                                  │            │
│                             │  - Replica Set / Sharded         │            │
│                             │  - Atlas / Self-hosted           │            │
│                             └──────────────────────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 External Dependencies

| System | Interaction | Protocol |
|--------|-------------|----------|
| MongoDB Server | Document storage, queries | Wire Protocol (OP_MSG) |
| Platform Auth | Credential retrieval | Internal API |
| Metrics Service | Telemetry export | gRPC/HTTP |
| Workflow Engine | Event triggers | Internal Events |
| Vector Memory | Embedding metadata | Shared Store |

---

## 2. Container Architecture

### 2.1 C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONTAINER ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    MongoDB Integration Module                        │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │    │
│  │  │   Client    │  │  Document   │  │   Query     │  │  Change   │  │    │
│  │  │   Manager   │  │  Operations │  │   Engine    │  │  Stream   │  │    │
│  │  │             │  │             │  │             │  │  Manager  │  │    │
│  │  │ - Pool mgmt │  │ - CRUD      │  │ - Filters   │  │           │  │    │
│  │  │ - Topology  │  │ - Bulk ops  │  │ - Pipeline  │  │ - Watch   │  │    │
│  │  │ - Health    │  │ - GridFS    │  │ - Pagination│  │ - Resume  │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │    │
│  │         │                │                │               │        │    │
│  │         └────────────────┼────────────────┼───────────────┘        │    │
│  │                          │                │                         │    │
│  │                          ▼                ▼                         │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │    │
│  │  │ Transaction │  │    BSON     │  │  Simulation │  │  Metrics  │  │    │
│  │  │   Manager   │  │  Converter  │  │    Layer    │  │ Collector │  │    │
│  │  │             │  │             │  │             │  │           │  │    │
│  │  │ - Sessions  │  │ - Serialize │  │ - Record    │  │ - Ops     │  │    │
│  │  │ - Retry     │  │ - Deserial  │  │ - Replay    │  │ - Latency │  │    │
│  │  │ - Rollback  │  │ - Types     │  │ - Hash      │  │ - Errors  │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Container Responsibilities

| Container | Responsibility | Dependencies |
|-----------|---------------|--------------|
| Client Manager | Connection lifecycle, pooling | mongodb driver |
| Document Operations | CRUD, bulk writes | BSON Converter |
| Query Engine | Filters, aggregation | Client Manager |
| Change Stream Manager | Real-time events | Client Manager |
| Transaction Manager | ACID operations | Client Manager |
| BSON Converter | Type serialization | bson crate |
| Simulation Layer | Testing support | Filesystem |
| Metrics Collector | Observability | Platform metrics |

---

## 3. Component Architecture

### 3.1 Client Manager Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT MANAGER COMPONENTS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                         MongoClient                                 │     │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │     │
│  │  │   Connection    │  │    Topology     │  │    Credential   │    │     │
│  │  │      Pool       │  │    Monitor      │  │    Provider     │    │     │
│  │  │                 │  │                 │  │                 │    │     │
│  │  │ min_size: u32   │  │ primary: Addr   │  │ get_creds()     │    │     │
│  │  │ max_size: u32   │  │ secondaries: [] │  │ refresh()       │    │     │
│  │  │ idle_timeout    │  │ type: topology  │  │ expires_at      │    │     │
│  │  │ acquire()       │  │ heartbeat()     │  │                 │    │     │
│  │  │ release()       │  │ on_change()     │  │                 │    │     │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │     │
│  │                                                                    │     │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │     │
│  │  │  Read Pref      │  │  Write Concern  │  │   TLS Config    │    │     │
│  │  │   Router        │  │   Handler       │  │    Manager      │    │     │
│  │  │                 │  │                 │  │                 │    │     │
│  │  │ Primary         │  │ w: 0/1/majority │  │ ca_cert         │    │     │
│  │  │ Secondary       │  │ j: bool         │  │ client_cert     │    │     │
│  │  │ Nearest         │  │ wtimeout        │  │ verify          │    │     │
│  │  │ select_server() │  │ validate()      │  │ reload()        │    │     │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Document Operations Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DOCUMENT OPERATIONS COMPONENTS                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐                     │
│  │    Collection<T>       │  │    BulkWriteBuilder    │                     │
│  │                        │  │                        │                     │
│  │  insert_one()          │  │  insert()              │                     │
│  │  insert_many()         │  │  update_one()          │                     │
│  │  find_one()            │  │  update_many()         │                     │
│  │  find()                │  │  delete_one()          │                     │
│  │  update_one()          │  │  delete_many()         │                     │
│  │  update_many()         │  │  replace_one()         │                     │
│  │  delete_one()          │  │  ordered()             │                     │
│  │  delete_many()         │  │  execute()             │                     │
│  └────────────────────────┘  └────────────────────────┘                     │
│                                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐                     │
│  │     DocBuilder         │  │    FilterBuilder       │                     │
│  │                        │  │                        │                     │
│  │  field(k, v)           │  │  eq(field, value)      │                     │
│  │  nested(k, builder)    │  │  ne(field, value)      │                     │
│  │  array(k, values)      │  │  gt/gte/lt/lte()       │                     │
│  │  build()               │  │  in_array()            │                     │
│  │                        │  │  regex()               │                     │
│  │                        │  │  and/or()              │                     │
│  │                        │  │  build()               │                     │
│  └────────────────────────┘  └────────────────────────┘                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Query Engine Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUERY ENGINE COMPONENTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                        QueryBuilder<T>                             │      │
│  │                                                                    │      │
│  │  filter(Document)     project(Document)     sort(Document)        │      │
│  │  skip(u64)           limit(i64)            hint(Document)         │      │
│  │  read_preference()   execute()             stream()               │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                       PipelineBuilder                              │      │
│  │                                                                    │      │
│  │  Stages:                                                           │      │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │      │
│  │  │ $match  │ │ $group  │ │$project │ │ $sort   │ │ $limit  │     │      │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │      │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │      │
│  │  │ $skip   │ │ $unwind │ │ $lookup │ │ $facet  │ │$addFlds │     │      │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                      PaginatedResult<T>                            │      │
│  │                                                                    │      │
│  │  items: Vec<T>    total: u64    page: u64    page_size: u64       │      │
│  │  has_next: bool   has_prev: bool                                  │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Transaction Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSACTION COMPONENTS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                          Session                                 │        │
│  │                                                                  │        │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │        │
│  │  │   Session ID    │  │  Cluster Time   │  │  Transaction    │  │        │
│  │  │                 │  │                 │  │    State        │  │        │
│  │  │  UUID           │  │  timestamp      │  │                 │  │        │
│  │  │                 │  │  operation_time │  │  None           │  │        │
│  │  │                 │  │                 │  │  InProgress     │  │        │
│  │  │                 │  │                 │  │  Committed      │  │        │
│  │  │                 │  │                 │  │  Aborted        │  │        │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                     Transaction Lifecycle                        │        │
│  │                                                                  │        │
│  │   start_session() ──► start_transaction() ──► operations        │        │
│  │         │                    │                    │              │        │
│  │         │                    │                    ▼              │        │
│  │         │                    │            commit() / abort()     │        │
│  │         │                    │                    │              │        │
│  │         │                    ▼                    │              │        │
│  │         │         retry on transient error ◄─────┘              │        │
│  │         │                    │                                   │        │
│  │         └────────────────────┴──► end_session()                 │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    TransactionOptions                            │        │
│  │                                                                  │        │
│  │  read_concern: ReadConcern     write_concern: WriteConcern      │        │
│  │  read_preference: ReadPref     max_commit_time: Duration        │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 CRUD Operation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CRUD OPERATION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Application                                                                 │
│      │                                                                       │
│      │  insert_one(doc)                                                     │
│      ▼                                                                       │
│  ┌───────────────┐                                                          │
│  │  Collection   │                                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  1. Check simulation mode                                        │
│          ▼                                                                   │
│  ┌───────────────────┐     ┌───────────────────┐                           │
│  │ Simulation Layer  │────►│ Return recorded   │  (replay mode)            │
│  └───────┬───────────┘     └───────────────────┘                           │
│          │                                                                   │
│          │  2. Serialize to BSON                                            │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │ BSON Converter│                                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  3. Build options (write concern)                                │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │ Write Concern │                                                          │
│  │   Handler     │                                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  4. Select server (based on write concern)                       │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │ Server Select │──► Primary node                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  5. Execute OP_MSG                                               │
│          ▼                                                                   │
│  ┌───────────────┐     ┌───────────────────┐                               │
│  │ MongoDB Driver│────►│  MongoDB Server   │                               │
│  └───────┬───────┘     └───────────────────┘                               │
│          │                                                                   │
│          │  6. Process response                                             │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │ Metrics       │──► Record latency, operation count                       │
│  │ Collector     │                                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  7. Record for simulation (if record mode)                       │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │ Simulation    │──► Store operation + result                              │
│  │ Recorder      │                                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          ▼                                                                   │
│     InsertOneResult { inserted_id }                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Aggregation Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AGGREGATION PIPELINE FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PipelineBuilder                                                            │
│      │                                                                       │
│      │  .match_stage()                                                      │
│      │  .group()                                                            │
│      │  .project()                                                          │
│      │  .sort()                                                             │
│      │  .build()                                                            │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                    Pipeline: Vec<Document>                     │          │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │          │
│  │  │ $match  │─►│ $group  │─►│$project │─►│ $sort   │          │          │
│  │  │{status: │  │{_id:    │  │{total:1 │  │{total:  │          │          │
│  │  │"active"}│  │"$region"│  │ count:1}│  │ -1}     │          │          │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │          │
│  └───────────────────────────────────────────────────────────────┘          │
│      │                                                                       │
│      │  aggregate(pipeline, options)                                        │
│      ▼                                                                       │
│  ┌───────────────┐                                                          │
│  │  Collection   │                                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  Options: allowDiskUse, batchSize, maxTime                       │
│          ▼                                                                   │
│  ┌───────────────┐     ┌───────────────────────────────────────┐           │
│  │ MongoDB Driver│────►│  MongoDB Aggregation Engine           │           │
│  └───────┬───────┘     │                                       │           │
│          │             │  Stage 1: Scan + filter               │           │
│          │             │  Stage 2: Group by key + accumulate   │           │
│          │             │  Stage 3: Reshape output              │           │
│          │             │  Stage 4: Sort results                │           │
│          │             └───────────────────────────────────────┘           │
│          │                                                                   │
│          │  Cursor with results                                             │
│          ▼                                                                   │
│  ┌───────────────┐                                                          │
│  │  Cursor       │──► Batched iteration                                     │
│  │  Handler      │                                                          │
│  └───────┬───────┘                                                          │
│          │                                                                   │
│          │  Deserialize each document                                       │
│          ▼                                                                   │
│     Vec<ResultType>                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Change Stream Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CHANGE STREAM FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  collection.watch(pipeline, options)                                        │
│      │                                                                       │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                    ChangeStream<T>                             │          │
│  │                                                                │          │
│  │   resume_token: None                                           │          │
│  │   full_document: UpdateLookup                                 │          │
│  └───────────────────────────────────────────────────────────────┘          │
│      │                                                                       │
│      │  Opens tailable cursor on oplog                                      │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                MongoDB Change Stream                           │          │
│  │                                                                │          │
│  │  Oplog ──► Filter ──► Pipeline ──► Events                     │          │
│  └───────────────────────────────────────────────────────────────┘          │
│      │                                                                       │
│      │  stream.next().await                                                 │
│      ▼                                                                       │
│  ┌─────────────────────────────────────────────┐                            │
│  │              Event Processing               │                            │
│  │                                             │                            │
│  │  1. Receive ChangeStreamEvent               │                            │
│  │  2. Store resume_token                      │                            │
│  │  3. Map to ChangeEvent<T>                   │                            │
│  │  4. Emit to application                     │                            │
│  └─────────────────────────────────────────────┘                            │
│      │                                                                       │
│      │  On network error                                                    │
│      ▼                                                                       │
│  ┌─────────────────────────────────────────────┐                            │
│  │              Resume Handling                │                            │
│  │                                             │                            │
│  │  IF is_resumable(error):                    │                            │
│  │    options.resume_after = stored_token      │                            │
│  │    reconnect and continue                   │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
│  Event Types:                                                               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐       │
│  │ Insert │ │ Update │ │Replace │ │ Delete │ │  Drop  │ │Invalidate│       │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Transaction Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRANSACTION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  client.with_transaction(|session| async { ... })                           │
│      │                                                                       │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                     Session Started                            │          │
│  │  session_id: UUID                                             │          │
│  └───────────────────────────────────────────────────────────────┘          │
│      │                                                                       │
│      │  start_transaction(options)                                          │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                  Transaction Active                            │          │
│  │  read_concern: snapshot                                        │          │
│  │  write_concern: majority                                       │          │
│  └───────────────────────────────────────────────────────────────┘          │
│      │                                                                       │
│      │  Execute operations with session                                     │
│      ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │            Operations (within transaction)                     │          │
│  │                                                                │          │
│  │  session.insert_one(coll, doc)?                               │          │
│  │  session.update_one(coll, filter, update)?                    │          │
│  │  session.find_one(coll, filter)?                              │          │
│  └───────────────────────────────────────────────────────────────┘          │
│      │                                                                       │
│      ├─── Success ──────────────────────────────────────────┐               │
│      │                                                      ▼               │
│      │                                         ┌─────────────────────┐      │
│      │                                         │  commit_transaction │      │
│      │                                         └──────────┬──────────┘      │
│      │                                                    │                 │
│      │                                   ┌────────────────┼────────────┐    │
│      │                                   │                │            │    │
│      │                              Success       TransientError  Other│    │
│      │                                   │                │            │    │
│      │                                   ▼                ▼            ▼    │
│      │                               Return OK       Retry loop    Abort    │
│      │                                                                      │
│      └─── Error ───────────────────────────────────────────┐               │
│                                                            ▼               │
│                                               ┌─────────────────────┐      │
│                                               │  abort_transaction  │      │
│                                               └──────────┬──────────┘      │
│                                                          │                 │
│                                     ┌────────────────────┼────────┐        │
│                                     │                    │        │        │
│                              TransientError         UnknownError  Other    │
│                                     │                    │        │        │
│                                     ▼                    ▼        ▼        │
│                               Retry entire         Return Err   Return Err │
│                               transaction                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Concurrency Model

### 5.1 Connection Pool Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONNECTION POOL ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Connection Pool                               │    │
│  │                                                                      │    │
│  │   Configuration:                                                     │    │
│  │   ├── min_pool_size: 5                                              │    │
│  │   ├── max_pool_size: 100                                            │    │
│  │   ├── max_idle_time: 10min                                          │    │
│  │   └── wait_queue_timeout: 10s                                       │    │
│  │                                                                      │    │
│  │   ┌─────────────────────────────────────────────────────────────┐   │    │
│  │   │                    Per-Server Pools                          │   │    │
│  │   │                                                              │   │    │
│  │   │   Primary Pool          Secondary Pool 1    Secondary Pool 2 │   │    │
│  │   │   ┌───┬───┬───┐        ┌───┬───┬───┐       ┌───┬───┬───┐   │   │    │
│  │   │   │ C │ C │ C │  ...   │ C │ C │ C │       │ C │ C │ C │   │   │    │
│  │   │   └───┴───┴───┘        └───┴───┴───┘       └───┴───┴───┘   │   │    │
│  │   │        ▲                     ▲                   ▲          │   │    │
│  │   │        │                     │                   │          │   │    │
│  │   │        └──────── Writes ─────┴──── Reads ────────┘          │   │    │
│  │   │                                                              │   │    │
│  │   └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   Connection States:                                                 │    │
│  │   ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐             │    │
│  │   │  Idle  │───►│ InUse  │───►│Closing │───►│ Closed │             │    │
│  │   └────────┘    └────────┘    └────────┘    └────────┘             │    │
│  │       ▲              │                                              │    │
│  │       └──────────────┘ (returned to pool)                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Async Operation Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ASYNC OPERATION MODEL                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Tokio Runtime                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   Task Spawning:                                                     │    │
│  │   ┌──────────────────────────────────────────────────────────────┐  │    │
│  │   │  // Concurrent operations                                     │  │    │
│  │   │  let (r1, r2, r3) = tokio::join!(                            │  │    │
│  │   │      collection.find_one(filter1),                           │  │    │
│  │   │      collection.find_one(filter2),                           │  │    │
│  │   │      collection.count_documents(filter3),                    │  │    │
│  │   │  );                                                           │  │    │
│  │   └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │   Stream Processing:                                                 │    │
│  │   ┌──────────────────────────────────────────────────────────────┐  │    │
│  │   │  // Backpressure-aware streaming                             │  │    │
│  │   │  let stream = collection.find_stream(filter, options);       │  │    │
│  │   │                                                               │  │    │
│  │   │  // With bounded concurrency                                  │  │    │
│  │   │  stream.buffer_unordered(10)                                 │  │    │
│  │   │        .for_each_concurrent(5, |doc| async {                 │  │    │
│  │   │            process(doc).await                                 │  │    │
│  │   │        });                                                    │  │    │
│  │   └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │   Change Stream Handling:                                            │    │
│  │   ┌──────────────────────────────────────────────────────────────┐  │    │
│  │   │  // Long-running watch task                                   │  │    │
│  │   │  tokio::spawn(async move {                                   │  │    │
│  │   │      let mut stream = collection.watch(None, None).await?;   │  │    │
│  │   │      while let Some(event) = stream.next().await {           │  │    │
│  │   │          tx.send(event?).await?;  // Channel to handler      │  │    │
│  │   │      }                                                        │  │    │
│  │   │  });                                                          │  │    │
│  │   └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Read Preference Routing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       READ PREFERENCE ROUTING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Read Preferences:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   Primary            ──► All reads to primary                       │    │
│  │   PrimaryPreferred   ──► Primary if available, else secondary       │    │
│  │   Secondary          ──► All reads to secondaries                   │    │
│  │   SecondaryPreferred ──► Secondary if available, else primary       │    │
│  │   Nearest            ──► Lowest latency member                      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Server Selection:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   Operation Request                                                  │    │
│  │         │                                                            │    │
│  │         ▼                                                            │    │
│  │   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │    │
│  │   │  Get Read   │────►│   Filter    │────►│   Select    │          │    │
│  │   │  Preference │     │  by Tags    │     │  by Latency │          │    │
│  │   └─────────────┘     └─────────────┘     └─────────────┘          │    │
│  │                                                  │                   │    │
│  │                                                  ▼                   │    │
│  │                                           Selected Server            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Tag Set Filtering:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │   ReadPreference::Secondary {                                        │    │
│  │       tags: vec![                                                    │    │
│  │           TagSet::from([("region", "us-east"), ("dc", "dc1")]),     │    │
│  │           TagSet::from([("region", "us-east")]),  // fallback        │    │
│  │       ]                                                              │    │
│  │   }                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Error Handling Architecture

### 6.1 Error Classification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ERROR CLASSIFICATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         MongoError                                   │    │
│  │                                                                      │    │
│  │   ┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐  │    │
│  │   │  Connection     │     │    Command      │     │  Transaction │  │    │
│  │   │    Errors       │     │    Errors       │     │    Errors    │  │    │
│  │   │                 │     │                 │     │              │  │    │
│  │   │ - NetworkError  │     │ - WriteError    │     │ - Transient  │  │    │
│  │   │ - AuthError     │     │ - QueryError    │     │ - Unknown    │  │    │
│  │   │ - TlsError      │     │ - Timeout       │     │ - Commit     │  │    │
│  │   │ - PoolExhausted │     │ - Cursor        │     │ - Abort      │  │    │
│  │   │ - ServerSelect  │     │ - BulkWrite     │     │              │  │    │
│  │   └─────────────────┘     └─────────────────┘     └──────────────┘  │    │
│  │                                                                      │    │
│  │   ┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐  │    │
│  │   │   Validation    │     │   Simulation    │     │    BSON      │  │    │
│  │   │    Errors       │     │    Errors       │     │   Errors     │  │    │
│  │   │                 │     │                 │     │              │  │    │
│  │   │ - DocTooLarge   │     │ - NotRecorded   │     │ - Serialize  │  │    │
│  │   │ - InvalidDoc    │     │ - TypeMismatch  │     │ - Deserialize│  │    │
│  │   │ - InvalidOp     │     │ - HashMismatch  │     │ - InvalidType│  │    │
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
│  Retryable Operations:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   Reads (idempotent):                                               │    │
│  │   ├── find, findOne, count, aggregate (read-only)                   │    │
│  │   └── Automatic retry on network errors                             │    │
│  │                                                                      │    │
│  │   Writes (with retryable writes):                                   │    │
│  │   ├── insertOne, updateOne, deleteOne, findOneAndUpdate            │    │
│  │   └── Server-side idempotency via txn number                        │    │
│  │                                                                      │    │
│  │   NOT Retryable:                                                     │    │
│  │   ├── insertMany, updateMany, deleteMany (unordered)                │    │
│  │   └── Aggregations that write ($out, $merge)                        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Retry Logic:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   Operation                                                          │    │
│  │       │                                                              │    │
│  │       ▼                                                              │    │
│  │   ┌─────────┐                                                       │    │
│  │   │ Execute │                                                       │    │
│  │   └────┬────┘                                                       │    │
│  │        │                                                             │    │
│  │   ┌────┴────┐                                                       │    │
│  │   │ Success │ ──► Return result                                     │    │
│  │   └────┬────┘                                                       │    │
│  │        │ Failure                                                     │    │
│  │        ▼                                                             │    │
│  │   ┌──────────────┐                                                  │    │
│  │   │ Is Retryable │                                                  │    │
│  │   │   Error?     │                                                  │    │
│  │   └──────┬───────┘                                                  │    │
│  │          │                                                           │    │
│  │     ┌────┴────┐                                                     │    │
│  │     │   Yes   │                                                     │    │
│  │     └────┬────┘                                                     │    │
│  │          ▼                                                           │    │
│  │   ┌─────────────┐                                                   │    │
│  │   │ Re-select   │──► New server (may be same)                       │    │
│  │   │   Server    │                                                   │    │
│  │   └──────┬──────┘                                                   │    │
│  │          │                                                           │    │
│  │          ▼                                                           │    │
│  │   ┌──────────┐                                                      │    │
│  │   │  Retry   │──► Max 1 retry                                       │    │
│  │   │ (once)   │                                                      │    │
│  │   └──────────┘                                                      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Integration Patterns

### 7.1 Repository Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          REPOSITORY PATTERN                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  trait Repository<T>                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   fn get(&self, id: &ObjectId) -> Result<Option<T>>;                │    │
│  │   fn find(&self, criteria: Criteria) -> Result<Vec<T>>;             │    │
│  │   fn save(&self, entity: &T) -> Result<ObjectId>;                   │    │
│  │   fn update(&self, id: &ObjectId, entity: &T) -> Result<bool>;      │    │
│  │   fn delete(&self, id: &ObjectId) -> Result<bool>;                  │    │
│  │   fn count(&self, criteria: Criteria) -> Result<u64>;               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  MongoRepository<T>                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   struct MongoRepository<T> {                                        │    │
│  │       collection: Collection<T>,                                     │    │
│  │   }                                                                  │    │
│  │                                                                      │    │
│  │   impl<T> Repository<T> for MongoRepository<T> {                    │    │
│  │       fn get(&self, id: &ObjectId) -> Result<Option<T>> {           │    │
│  │           self.collection.find_by_id(id).await                      │    │
│  │       }                                                              │    │
│  │       // ... other implementations                                   │    │
│  │   }                                                                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Event Sourcing Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EVENT SOURCING PATTERN                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Event Store Architecture:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   events collection:                                                 │    │
│  │   {                                                                  │    │
│  │     _id: ObjectId,                                                   │    │
│  │     stream_id: String,      // aggregate identifier                  │    │
│  │     version: i64,           // sequence number                       │    │
│  │     event_type: String,     // e.g., "OrderCreated"                 │    │
│  │     data: Document,         // event payload                         │    │
│  │     metadata: Document,     // correlation, causation IDs           │    │
│  │     timestamp: DateTime     // event time                            │    │
│  │   }                                                                  │    │
│  │                                                                      │    │
│  │   Index: { stream_id: 1, version: 1 } unique                        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Change Stream for Projections:                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   events ──► change_stream ──► projector ──► read_models            │    │
│  │                                                                      │    │
│  │   // Real-time projection updates                                    │    │
│  │   let stream = events_collection.watch(None, None).await?;          │    │
│  │   while let Some(event) = stream.next().await {                     │    │
│  │       match event.operation_type {                                   │    │
│  │           Insert => projector.apply(event.full_document),           │    │
│  │           _ => continue,                                             │    │
│  │       }                                                              │    │
│  │   }                                                                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Workflow Trigger Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WORKFLOW TRIGGER PATTERN                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Document Change ──► Change Stream ──► Workflow Engine                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   // Configure watched collections                                   │    │
│  │   triggers:                                                          │    │
│  │     - collection: "orders"                                           │    │
│  │       operations: [Insert, Update]                                   │    │
│  │       filter: { "status": "pending" }                                │    │
│  │       workflow: "process_order"                                      │    │
│  │                                                                      │    │
│  │     - collection: "inventory"                                        │    │
│  │       operations: [Update]                                           │    │
│  │       filter: { "quantity": { "$lt": 10 } }                         │    │
│  │       workflow: "reorder_alert"                                      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Implementation:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   struct TriggerManager {                                            │    │
│  │       triggers: Vec<Trigger>,                                        │    │
│  │       workflow_client: WorkflowClient,                               │    │
│  │   }                                                                  │    │
│  │                                                                      │    │
│  │   impl TriggerManager {                                              │    │
│  │       async fn start(&self) {                                        │    │
│  │           for trigger in &self.triggers {                            │    │
│  │               let stream = collection.watch(                         │    │
│  │                   Some(vec![doc!{"$match": trigger.filter}]),       │    │
│  │                   None                                               │    │
│  │               ).await?;                                              │    │
│  │                                                                      │    │
│  │               tokio::spawn(process_stream(stream, trigger));        │    │
│  │           }                                                          │    │
│  │       }                                                              │    │
│  │   }                                                                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Architecture

### 8.1 Container Deployment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONTAINER DEPLOYMENT                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Kubernetes Deployment:                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   apiVersion: apps/v1                                               │    │
│  │   kind: Deployment                                                   │    │
│  │   metadata:                                                          │    │
│  │     name: llm-devops-mongodb-integration                            │    │
│  │   spec:                                                              │    │
│  │     replicas: 3                                                      │    │
│  │     template:                                                        │    │
│  │       spec:                                                          │    │
│  │         containers:                                                  │    │
│  │         - name: mongodb-integration                                  │    │
│  │           env:                                                       │    │
│  │           - name: MONGODB_URI                                        │    │
│  │             valueFrom:                                               │    │
│  │               secretKeyRef:                                          │    │
│  │                 name: mongodb-secrets                                │    │
│  │                 key: uri                                             │    │
│  │           - name: MONGODB_MIN_POOL                                   │    │
│  │             value: "5"                                               │    │
│  │           - name: MONGODB_MAX_POOL                                   │    │
│  │             value: "50"                                              │    │
│  │           resources:                                                 │    │
│  │             requests:                                                │    │
│  │               memory: "256Mi"                                        │    │
│  │               cpu: "100m"                                            │    │
│  │             limits:                                                  │    │
│  │               memory: "512Mi"                                        │    │
│  │               cpu: "500m"                                            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
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
│  │   MONGODB_URI=mongodb://localhost:27017/devops_dev                  │    │
│  │   MONGODB_MIN_POOL=2                                                 │    │
│  │   MONGODB_MAX_POOL=10                                               │    │
│  │   MONGODB_TLS_ENABLED=false                                          │    │
│  │   MONGODB_SIMULATION_MODE=record                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Staging:                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │   MONGODB_URI=mongodb+srv://staging.mongodb.net/devops_staging      │    │
│  │   MONGODB_MIN_POOL=5                                                 │    │
│  │   MONGODB_MAX_POOL=25                                               │    │
│  │   MONGODB_TLS_ENABLED=true                                           │    │
│  │   MONGODB_READ_PREFERENCE=secondaryPreferred                         │    │
│  │   MONGODB_WRITE_CONCERN=majority                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Production:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │   MONGODB_URI=mongodb+srv://prod.mongodb.net/devops_prod            │    │
│  │   MONGODB_MIN_POOL=10                                                │    │
│  │   MONGODB_MAX_POOL=100                                              │    │
│  │   MONGODB_TLS_ENABLED=true                                           │    │
│  │   MONGODB_TLS_CA_FILE=/etc/ssl/mongo-ca.pem                         │    │
│  │   MONGODB_READ_PREFERENCE=nearest                                    │    │
│  │   MONGODB_READ_CONCERN=majority                                      │    │
│  │   MONGODB_WRITE_CONCERN=majority                                     │    │
│  │   MONGODB_SERVER_SELECTION_TIMEOUT=5000                              │    │
│  │   MONGODB_SIMULATION_MODE=disabled                                   │    │
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
│  Metrics Export:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   # HELP mongodb_operations_total Total MongoDB operations          │    │
│  │   # TYPE mongodb_operations_total counter                           │    │
│  │   mongodb_operations_total{op="find_one",coll="users"} 1542         │    │
│  │   mongodb_operations_total{op="insert_one",coll="events"} 892       │    │
│  │                                                                      │    │
│  │   # HELP mongodb_operation_duration_seconds Operation latency       │    │
│  │   # TYPE mongodb_operation_duration_seconds histogram               │    │
│  │   mongodb_operation_duration_seconds_bucket{op="find_one",le="0.005"} 1200  │
│  │   mongodb_operation_duration_seconds_bucket{op="find_one",le="0.01"} 1400   │
│  │                                                                      │    │
│  │   # HELP mongodb_pool_connections Connection pool state             │    │
│  │   # TYPE mongodb_pool_connections gauge                             │    │
│  │   mongodb_pool_connections{state="idle"} 8                          │    │
│  │   mongodb_pool_connections{state="in_use"} 12                       │    │
│  │                                                                      │    │
│  │   # HELP mongodb_change_stream_events_total Change stream events    │    │
│  │   # TYPE mongodb_change_stream_events_total counter                 │    │
│  │   mongodb_change_stream_events_total{coll="orders"} 456             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Health Endpoint:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │   GET /health/mongodb                                               │    │
│  │                                                                      │    │
│  │   {                                                                  │    │
│  │     "status": "healthy",                                             │    │
│  │     "latency_ms": 2,                                                 │    │
│  │     "topology": {                                                    │    │
│  │       "type": "ReplicaSet",                                          │    │
│  │       "primary": "mongo-0.mongo:27017",                              │    │
│  │       "secondaries": ["mongo-1.mongo:27017", "mongo-2.mongo:27017"]  │    │
│  │     },                                                               │    │
│  │     "pool": {                                                        │    │
│  │       "idle": 8,                                                     │    │
│  │       "in_use": 12,                                                  │    │
│  │       "max": 100                                                     │    │
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
| Document ID | SPARC-MONGO-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*Proceed to Refinement phase upon approval.*
