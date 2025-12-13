# Architecture: Notion Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/notion`

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Container Architecture](#2-container-architecture)
3. [Component Design](#3-component-design)
4. [Data Flow](#4-data-flow)
5. [Module Structure](#5-module-structure)
6. [Concurrency Model](#6-concurrency-model)
7. [Simulation Architecture](#7-simulation-architecture)
8. [Error Handling Strategy](#8-error-handling-strategy)
9. [Integration Patterns](#9-integration-patterns)

---

## 1. System Context

### 1.1 C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SYSTEM CONTEXT                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│    ┌──────────────┐         ┌──────────────────────────┐                │
│    │   LLM Dev    │         │    Notion Workspace      │                │
│    │   Ops Core   │         │    (External Service)    │                │
│    └──────┬───────┘         └────────────▲─────────────┘                │
│           │                              │                               │
│           │ Uses                         │ HTTPS/REST                    │
│           ▼                              │                               │
│    ┌──────────────────────────────────────────────────┐                 │
│    │          Notion Integration Module               │                 │
│    │                                                  │                 │
│    │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │                 │
│    │  │   Client    │  │  Simulation │  │  Shared  │ │                 │
│    │  │   Layer     │  │    Layer    │  │  Auth    │ │                 │
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
| Notion API | Content operations | HTTPS REST |
| Shared Auth | Token management | Internal |
| Logging | Structured logging | Internal |
| Metrics | Observability | Internal |

---

## 2. Container Architecture

### 2.1 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NOTION INTEGRATION                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         PUBLIC API                                  │ │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐  │ │
│  │  │  Pages  │ │Databases │ │ Blocks │ │ Search │ │   Comments   │  │ │
│  │  └────┬────┘ └────┬─────┘ └───┬────┘ └───┬────┘ └──────┬───────┘  │ │
│  └───────┼───────────┼───────────┼──────────┼─────────────┼──────────┘ │
│          │           │           │          │             │            │
│          ▼           ▼           ▼          ▼             ▼            │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      NOTION CLIENT                                  │ │
│  │                                                                     │ │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐        │ │
│  │   │   Request    │───▶│     Rate     │───▶│   HTTP       │        │ │
│  │   │   Builder    │    │   Limiter    │    │   Executor   │        │ │
│  │   └──────────────┘    └──────────────┘    └──────┬───────┘        │ │
│  │                                                   │                │ │
│  │                              ┌────────────────────┤                │ │
│  │                              ▼                    ▼                │ │
│  │                     ┌──────────────┐     ┌──────────────┐         │ │
│  │                     │  Simulation  │     │    Retry     │         │ │
│  │                     │    Layer     │     │    Handler   │         │ │
│  │                     └──────────────┘     └──────────────┘         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         TYPES                                       │ │
│  │  ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐   │ │
│  │  │  Refs  │ │ Blocks │ │Properties│ │Filters │ │    Errors    │   │ │
│  │  └────────┘ └────────┘ └──────────┘ └────────┘ └──────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Design

### 3.1 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| NotionClient | Request orchestration, auth injection |
| RequestBuilder | URL construction, header management |
| RateLimiter | 3 req/sec enforcement |
| HttpExecutor | Request execution, response parsing |
| RetryHandler | Exponential backoff, 429 handling |
| SimulationLayer | Record/replay operations |
| PropertySerializer | Property type conversion |
| BlockSerializer | Block type conversion |
| FilterBuilder | Query filter construction |

### 3.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         COMPONENT DETAIL                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  NotionClient                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │   ┌─────────────────────────────────────────────────────────────┐  │ │
│  │   │                    Operation Layer                           │  │ │
│  │   │  ┌────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌─────────┐  │  │ │
│  │   │  │ Pages  │ │Databases │ │ Blocks │ │ Search │ │Comments │  │  │ │
│  │   │  └───┬────┘ └────┬─────┘ └───┬────┘ └───┬────┘ └────┬────┘  │  │ │
│  │   └──────┼───────────┼───────────┼──────────┼───────────┼───────┘  │ │
│  │          │           │           │          │           │          │ │
│  │          └───────────┴───────────┼──────────┴───────────┘          │ │
│  │                                  ▼                                  │ │
│  │   ┌─────────────────────────────────────────────────────────────┐  │ │
│  │   │                   Request Pipeline                           │  │ │
│  │   │                                                              │  │ │
│  │   │   ┌──────────┐    ┌──────────┐    ┌──────────┐              │  │ │
│  │   │   │ Serialize│───▶│   Auth   │───▶│  Headers │              │  │ │
│  │   │   │   Body   │    │  Inject  │    │  (Ver.)  │              │  │ │
│  │   │   └──────────┘    └──────────┘    └────┬─────┘              │  │ │
│  │   │                                        │                     │  │ │
│  │   │                                        ▼                     │  │ │
│  │   │   ┌──────────┐    ┌──────────┐    ┌──────────┐              │  │ │
│  │   │   │  Parse   │◀───│  Execute │◀───│   Rate   │              │  │ │
│  │   │   │ Response │    │   HTTP   │    │  Limit   │              │  │ │
│  │   │   └──────────┘    └──────────┘    └──────────┘              │  │ │
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
│   ├── PageRef         (Id | Url)
│   ├── DatabaseRef     (Id | Url)
│   ├── BlockRef        (Id)
│   └── ParentRef       (Page | Database | Block | Workspace)
│
├── blocks/
│   ├── Block           (metadata + content)
│   ├── BlockContent    (19 variants)
│   └── RichText        (content + annotations)
│
├── properties/
│   ├── PropertyValue   (18 variants)
│   ├── PropertySchema  (database column definition)
│   └── SelectOption    (select/multi-select options)
│
├── filters/
│   ├── Filter          (Property | And | Or | Timestamp)
│   ├── PropertyCondition
│   └── Sort
│
├── responses/
│   ├── Page
│   ├── Database
│   ├── SearchResult
│   └── PaginatedResults<T>
│
└── errors/
    └── NotionError     (API + Client + Simulation errors)
```

---

## 4. Data Flow

### 4.1 Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          REQUEST FLOW                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Caller                                                                 │
│     │                                                                    │
│     ▼                                                                    │
│   ┌─────────────────┐                                                   │
│   │ Operation Method│  (create_page, query_database, etc.)              │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐     ┌─────────────────┐                           │
│   │ Build Request   │────▶│ Check Simulation│                           │
│   │ (method, path,  │     │ Replay Mode     │                           │
│   │  body)          │     └────────┬────────┘                           │
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
│                           │ Token + Headers │             │            │
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
│                   │              │ Wait         │         │            │
│                   │              │ Retry-After  └─────────┘            │
│                   │              │                                     │
│                   │              └────────────────────────►            │
│                   │                                                    │
│                   ▼                                                    │
│           ┌─────────────────┐                                          │
│           │ Record if       │                                          │
│           │ Recording Mode  │                                          │
│           └────────┬────────┘                                          │
│                    │                                                    │
│                    ▼                                                    │
│           ┌─────────────────┐                                          │
│           │ Parse & Return  │                                          │
│           │ Response        │                                          │
│           └─────────────────┘                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Pagination Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PAGINATION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   query_database_all(db_ref, query)                                      │
│     │                                                                    │
│     ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Pagination Loop                               │   │
│   │                                                                  │   │
│   │   cursor = None                                                  │   │
│   │   results = []                                                   │   │
│   │                                                                  │   │
│   │   LOOP:                                                          │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ query_database(db_ref, query.with_cursor(cursor))     │   │   │
│   │     └───────────────────────────┬───────────────────────────┘   │   │
│   │                                 │                                │   │
│   │                                 ▼                                │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ PaginatedResults {                                    │   │   │
│   │     │   results: [...],                                     │   │   │
│   │     │   next_cursor: Some("...") | None,                    │   │   │
│   │     │   has_more: true | false                              │   │   │
│   │     │ }                                                     │   │   │
│   │     └───────────────────────────┬───────────────────────────┘   │   │
│   │                                 │                                │   │
│   │                                 ▼                                │   │
│   │     ┌───────────────────────────────────────────────────────┐   │   │
│   │     │ results.extend(page.results)                          │   │   │
│   │     │                                                       │   │   │
│   │     │ IF !has_more:                                         │   │   │
│   │     │   BREAK                                               │   │   │
│   │     │ ELSE:                                                 │   │   │
│   │     │   cursor = next_cursor                                │   │   │
│   │     │   CONTINUE                                            │   │   │
│   │     └───────────────────────────────────────────────────────┘   │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│     │                                                                    │
│     ▼                                                                    │
│   Return results                                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Module Structure

### 5.1 File Layout

```
integrations/notion/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Public API exports
│   │
│   ├── client/
│   │   ├── mod.rs             # NotionClient
│   │   ├── config.rs          # NotionConfig, Builder
│   │   └── request.rs         # Request building
│   │
│   ├── operations/
│   │   ├── mod.rs
│   │   ├── pages.rs           # Page CRUD
│   │   ├── databases.rs       # Database query
│   │   ├── blocks.rs          # Block operations
│   │   ├── search.rs          # Search operations
│   │   └── comments.rs        # Comment operations
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── refs.rs            # PageRef, DatabaseRef, etc.
│   │   ├── blocks.rs          # Block, BlockContent
│   │   ├── properties.rs      # PropertyValue, PropertySchema
│   │   ├── rich_text.rs       # RichText, Annotations
│   │   ├── filters.rs         # Filter, Sort
│   │   └── responses.rs       # Page, Database, PaginatedResults
│   │
│   ├── serialization/
│   │   ├── mod.rs
│   │   ├── blocks.rs          # Block serialization
│   │   ├── properties.rs      # Property serialization
│   │   └── filters.rs         # Filter serialization
│   │
│   ├── rate_limit/
│   │   └── mod.rs             # RateLimiter
│   │
│   ├── simulation/
│   │   ├── mod.rs             # SimulationLayer
│   │   ├── recording.rs       # Recording mode
│   │   └── replay.rs          # Replay mode
│   │
│   └── error.rs               # NotionError
│
└── tests/
    ├── integration/
    │   ├── pages_test.rs
    │   ├── databases_test.rs
    │   ├── blocks_test.rs
    │   └── search_test.rs
    │
    └── simulation/
        └── replay_test.rs
```

### 5.2 Public API Surface

```rust
// lib.rs exports
pub use client::{NotionClient, NotionConfig, NotionConfigBuilder};
pub use types::{
    // Refs
    PageRef, DatabaseRef, BlockRef, ParentRef,
    // Content
    Block, BlockContent, RichText, Annotations, Color,
    // Properties
    PropertyValue, PropertySchema, SelectOption,
    // Filters
    Filter, FilterBuilder, Sort, SortDirection,
    // Responses
    Page, Database, SearchResult, PaginatedResults,
};
pub use error::NotionError;
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
│   NotionClient (Clone-safe, Send + Sync)                                │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │   Arc<NotionConfig>         ─── Immutable, shared              │    │
│   │                                                                 │    │
│   │   Arc<dyn TokenProvider>    ─── Thread-safe auth               │    │
│   │                                                                 │    │
│   │   Arc<HttpClient>           ─── Reqwest client (clone-safe)    │    │
│   │                                                                 │    │
│   │   Arc<RateLimiter>                                             │    │
│   │   ┌─────────────────────────────────────────────────────────┐  │    │
│   │   │ Arc<Semaphore>          ─── Tokio async semaphore       │  │    │
│   │   │ Arc<Mutex<Instant>>     ─── Last request time           │  │    │
│   │   │ Arc<AtomicU64>          ─── Retry-after timestamp       │  │    │
│   │   └─────────────────────────────────────────────────────────┘  │    │
│   │                                                                 │    │
│   │   Arc<SimulationLayer>                                         │    │
│   │   ┌─────────────────────────────────────────────────────────┐  │    │
│   │   │ Arc<RwLock<HashMap>>    ─── Recorded responses          │  │    │
│   │   │ Option<PathBuf>         ─── File path (immutable)       │  │    │
│   │   └─────────────────────────────────────────────────────────┘  │    │
│   │                                                                 │    │
│   │   Arc<MetricsCollector>     ─── Thread-safe metrics           │    │
│   │                                                                 │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Parallel Operations

```
// Safe for concurrent use
client1 = client.clone()
client2 = client.clone()

// Parallel queries (rate limiter coordinates)
futures::join!(
    client1.query_database(db1, query1),
    client2.query_database(db2, query2),
)

// Rate limiter ensures 3 req/sec across all clones
```

---

## 7. Simulation Architecture

### 7.1 Simulation Modes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SIMULATION ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   SimulationMode::Disabled                                               │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │ Request ──────────────────────────────────────────▶ Notion API │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   SimulationMode::Recording                                              │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │ Request ─────────────────────────────────────────▶ Notion API  │    │
│   │    │                                                    │       │    │
│   │    │                                                    ▼       │    │
│   │    │ cache_key                                     Response     │    │
│   │    │                                                    │       │    │
│   │    ▼                                                    │       │    │
│   │ ┌────────────────────────────────────────────────────┐  │       │    │
│   │ │              Recording Storage                     │◀─┘       │    │
│   │ │                                                    │          │    │
│   │ │  HashMap<CacheKey, RecordedResponse>              │          │    │
│   │ │                                                    │          │    │
│   │ │  ┌─────────────────────────────────────────────┐  │          │    │
│   │ │  │ RecordedResponse {                          │  │          │    │
│   │ │  │   status: 200,                              │  │          │    │
│   │ │  │   headers: {...},                           │  │          │    │
│   │ │  │   body: {...},                              │  │          │    │
│   │ │  │   content_hash: "sha256:..."                │  │          │    │
│   │ │  │ }                                           │  │          │    │
│   │ │  └─────────────────────────────────────────────┘  │          │    │
│   │ │                                                    │          │    │
│   │ │        │ Persist on flush                         │          │    │
│   │ │        ▼                                          │          │    │
│   │ │  recordings.json                                  │          │    │
│   │ └────────────────────────────────────────────────────┘          │    │
│   │                                                                 │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   SimulationMode::Replay                                                 │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │ Request                                                         │    │
│   │    │                                                            │    │
│   │    │ cache_key                                                  │    │
│   │    ▼                                                            │    │
│   │ ┌────────────────────────────────────────────────────┐          │    │
│   │ │              Replay Storage                        │          │    │
│   │ │                                                    │          │    │
│   │ │  Load from recordings.json                        │          │    │
│   │ │                                                    │          │    │
│   │ │  HashMap<CacheKey, RecordedResponse>              │          │    │
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

### 7.2 Cache Key Generation

```
CacheKey = SHA256(
    Method +      // GET, POST, PATCH, DELETE
    Endpoint +    // /pages/{id}, /databases/{id}/query
    Body          // JSON body (sorted keys for determinism)
)

Example:
  Method: POST
  Endpoint: /databases/abc123/query
  Body: {"filter":{"property":"Status","equals":"Done"}}

  Key: sha256("POST/databases/abc123/query{...}") = "a1b2c3..."
```

---

## 8. Error Handling Strategy

### 8.1 Error Categories

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ERROR HANDLING                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   NotionError                                                            │
│   ├── API Errors (from Notion)                                          │
│   │   ├── InvalidRequest (400)      → Not retryable                    │
│   │   ├── Unauthorized (401)        → Not retryable, check token       │
│   │   ├── Forbidden (403)           → Not retryable, check permissions │
│   │   ├── NotFound (404)            → Not retryable                    │
│   │   ├── Conflict (409)            → Not retryable                    │
│   │   ├── RateLimited (429)         → Retryable, wait Retry-After      │
│   │   ├── InternalError (500)       → Retryable                        │
│   │   └── ServiceUnavailable (503)  → Retryable                        │
│   │                                                                      │
│   ├── Client Errors                                                      │
│   │   ├── InvalidId                 → Validation failure               │
│   │   ├── InvalidUrl                → URL parsing failure              │
│   │   ├── SerializationError        → JSON error                       │
│   │   ├── Network                   → Retryable                        │
│   │   └── Timeout                   → Retryable                        │
│   │                                                                      │
│   └── Simulation Errors                                                  │
│       ├── SimulationMiss            → Cache key not found              │
│       └── SimulationCorrupted       → File parse error                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Retry Decision Tree

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
│After  │ │ (1s, 2s, 4s) │
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

## 9. Integration Patterns

### 9.1 Platform Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PLATFORM INTEGRATION                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   LLM Dev Ops Platform                                                   │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │   ┌─────────────────┐                                          │    │
│   │   │  Knowledge Base │                                          │    │
│   │   └────────┬────────┘                                          │    │
│   │            │                                                    │    │
│   │            │ Index pages for RAG                               │    │
│   │            ▼                                                    │    │
│   │   ┌─────────────────┐     ┌─────────────────┐                  │    │
│   │   │  Vector Memory  │◀────│ Notion Content  │                  │    │
│   │   └─────────────────┘     └────────┬────────┘                  │    │
│   │                                    │                            │    │
│   │                                    │ Extract blocks             │    │
│   │                                    ▼                            │    │
│   │                           ┌─────────────────┐                  │    │
│   │                           │ Notion Client   │                  │    │
│   │                           └────────┬────────┘                  │    │
│   │                                    │                            │    │
│   │   ┌─────────────────┐              │                            │    │
│   │   │ Config Store    │──────────────┤ Read config records       │    │
│   │   └─────────────────┘              │                            │    │
│   │                                    │                            │    │
│   │   ┌─────────────────┐              │                            │    │
│   │   │ Workflow Engine │──────────────┤ Trigger on changes        │    │
│   │   └─────────────────┘              │                            │    │
│   │                                    │                            │    │
│   └────────────────────────────────────┼────────────────────────────┘    │
│                                        │                                 │
│                                        ▼                                 │
│                               ┌─────────────────┐                       │
│                               │   Notion API    │                       │
│                               └─────────────────┘                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Usage Patterns

```rust
// Pattern 1: Knowledge indexing
async fn index_knowledge_base(client: &NotionClient, db_id: &str) {
    let pages = client.query_database_all(
        DatabaseRef::Id(db_id.to_string()),
        DatabaseQuery::default()
    ).await?;

    for page in pages {
        let blocks = client.get_blocks_recursive(
            BlockRef { id: page.id.clone() }
        ).await?;

        let content = extract_text_content(&blocks);
        vector_store.index(page.id, content).await?;
    }
}

// Pattern 2: Config retrieval
async fn get_config(client: &NotionClient, key: &str) -> Config {
    let results = client.query_database(
        config_db_ref,
        DatabaseQuery {
            filter: Some(Filter::text_equals("Key", key)),
            ..Default::default()
        }
    ).await?;

    Config::from_page(&results.results[0])
}

// Pattern 3: Documentation update
async fn update_docs(client: &NotionClient, page_id: &str, content: Vec<BlockContent>) {
    // Clear existing blocks
    let existing = client.get_all_block_children(
        BlockRef { id: page_id.to_string() }
    ).await?;

    for block in existing {
        client.delete_block(BlockRef { id: block.id }).await?;
    }

    // Append new content
    client.append_block_children(
        BlockRef { id: page_id.to_string() },
        content
    ).await?;
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-NOTION-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*Proceed to Refinement phase upon approval.*
