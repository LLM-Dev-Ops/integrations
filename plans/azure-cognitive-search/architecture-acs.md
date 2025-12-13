# Azure Cognitive Search Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/azure-cognitive-search`

---

## 1. Module Structure

### 1.1 Directory Layout

```
integrations/azure-cognitive-search/
├── Cargo.toml
├── src/
│   ├── lib.rs                  # Public API exports
│   ├── client.rs               # AcsClient, builder
│   ├── config.rs               # Configuration types
│   ├── services/
│   │   ├── mod.rs
│   │   ├── search.rs           # SearchService
│   │   ├── documents.rs        # DocumentService
│   │   └── indexes.rs          # IndexService
│   ├── vector_store/
│   │   ├── mod.rs
│   │   ├── store.rs            # AcsVectorStore
│   │   └── filter.rs           # Metadata filter builder
│   ├── query/
│   │   ├── mod.rs
│   │   ├── builder.rs          # Query builders
│   │   └── parser.rs           # Result parsing
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── api_key.rs          # API key auth
│   │   └── entra.rs            # Entra ID auth
│   ├── transport/
│   │   ├── mod.rs
│   │   └── http.rs             # HTTP client
│   ├── types/
│   │   ├── mod.rs
│   │   ├── requests.rs         # Request types
│   │   ├── responses.rs        # Response types
│   │   └── documents.rs        # Document types
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── mock.rs             # Mock client
│   │   ├── recorder.rs         # Recording client
│   │   └── replayer.rs         # Replay client
│   └── errors.rs               # Error types
└── tests/
    ├── unit/
    ├── integration/
    └── simulation/
```

### 1.2 Module Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                         lib.rs                               │
│                     (Public Exports)                         │
└─────────────────────────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
 ┌──────────┐          ┌──────────┐          ┌──────────────┐
 │  client  │          │ services │          │ vector_store │
 └──────────┘          └──────────┘          └──────────────┘
       │                    │                       │
       │         ┌──────────┼──────────┐            │
       │         ▼          ▼          ▼            │
       │    ┌────────┐ ┌────────┐ ┌────────┐        │
       │    │ search │ │  docs  │ │indexes │        │
       │    └────────┘ └────────┘ └────────┘        │
       │         │          │          │            │
       │         └──────────┼──────────┘            │
       │                    ▼                       │
       │              ┌──────────┐                  │
       │              │  query   │◀─────────────────┘
       │              └──────────┘
       │                    │
       ▼                    ▼
 ┌──────────┐          ┌──────────┐          ┌──────────┐
 │   auth   │          │transport │          │  types   │
 └──────────┘          └──────────┘          └──────────┘
       │                    │                      │
       └────────────────────┼──────────────────────┘
                            ▼
                     ┌──────────┐
                     │  errors  │
                     └──────────┘
```

---

## 2. Component Architecture

### 2.1 Client Layer

```
┌─────────────────────────────────────────────────────────────┐
│                        AcsClient                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │SearchService│  │DocumentServ │  │ IndexService│         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│  ┌──────┴────────────────┴────────────────┴──────┐         │
│  │               AcsVectorStore                   │         │
│  │        (VectorStore trait impl)                │         │
│  └────────────────────────────────────────────────┘         │
│         │                │                │                 │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐         │
│  │    Auth     │  │  Transport  │  │CircuitBreaker│        │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  Azure Cognitive Search API   │
              └───────────────────────────────┘
```

### 2.2 Service Interfaces

```
┌─────────────────────────────────────────────────────────────┐
│                 «trait» SearchServiceTrait                   │
├─────────────────────────────────────────────────────────────┤
│ + vector_search(req) -> Result<SearchResults>               │
│ + keyword_search(req) -> Result<SearchResults>              │
│ + hybrid_search(req) -> Result<SearchResults>               │
│ + semantic_search(req) -> Result<SearchResults>             │
│ + suggest(req) -> Result<SuggestResults>                    │
│ + autocomplete(req) -> Result<AutocompleteResults>          │
└─────────────────────────────────────────────────────────────┘
                              △
              ┌───────────────┴───────────────┐
              │                               │
    ┌─────────┴─────────┐          ┌─────────┴─────────┐
    │  SearchService    │          │ MockSearchService │
    │   (Production)    │          │    (Testing)      │
    └───────────────────┘          └───────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                «trait» DocumentServiceTrait                  │
├─────────────────────────────────────────────────────────────┤
│ + upload(req) -> Result<IndexResult>                        │
│ + merge(req) -> Result<IndexResult>                         │
│ + delete(req) -> Result<IndexResult>                        │
│ + lookup(req) -> Result<Option<Document>>                   │
│ + index_batch(req) -> Result<BatchIndexResult>              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│          «trait» VectorStore (from shared)                   │
├─────────────────────────────────────────────────────────────┤
│ + upsert(docs: Vec<VectorDocument>) -> Result<()>           │
│ + search(query: VectorQuery) -> Result<Vec<SearchResult>>   │
│ + delete(ids: Vec<String>) -> Result<()>                    │
│ + get(id: &str) -> Result<Option<VectorDocument>>           │
└─────────────────────────────────────────────────────────────┘
                              △
                              │
                    ┌─────────┴─────────┐
                    │  AcsVectorStore   │
                    │  (Implementation) │
                    └───────────────────┘
```

---

## 3. Data Flow Diagrams

### 3.1 Hybrid Search Flow

```
┌──────────┐     ┌───────────────┐     ┌───────────────┐
│  Caller  │────▶│ SearchService │────▶│ Query Builder │
└──────────┘     └───────────────┘     └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │ Build Request │
                                       │  - keyword    │
                                       │  - vector     │
                                       │  - filter     │
                                       └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │  Auth Layer   │
                                       └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │Circuit Breaker│
                                       └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │  HTTP POST    │
                                       │ /docs/search  │
                                       └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │ Azure Search  │
                                       │  RRF Fusion   │
                                       └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │Result Parser  │
                                       └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │ SearchResults │
                                       └───────────────┘
```

### 3.2 Batch Index Flow

```
┌──────────┐     ┌───────────────┐
│  Caller  │────▶│DocumentService│
└──────────┘     └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │  Chunk into   │
                 │ batches ≤1000 │
                 └───────┬───────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  ┌───────────┐    ┌───────────┐    ┌───────────┐
  │ Batch 1   │    │ Batch 2   │    │ Batch N   │
  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
                 ┌───────────────┐
                 │  POST /index  │
                 └───────┬───────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
     ┌─────────────┐          ┌─────────────┐
     │   200 OK    │          │  207 Multi  │
     │ All Success │          │   Status    │
     └──────┬──────┘          └──────┬──────┘
            │                        │
            └────────────┬───────────┘
                         ▼
                 ┌───────────────┐
                 │  Aggregate    │
                 │   Results     │
                 └───────────────┘
```

### 3.3 VectorStore Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   LLM Dev Ops Platform                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              shared::vector_memory                   │    │
│  │                                                      │    │
│  │   ┌─────────────┐    ┌─────────────┐                │    │
│  │   │VectorStore  │    │VectorStore  │                │    │
│  │   │   Trait     │    │  Manager    │                │    │
│  │   └──────┬──────┘    └──────┬──────┘                │    │
│  │          │                  │                        │    │
│  └──────────┼──────────────────┼────────────────────────┘    │
│             │                  │                             │
│             ▼                  ▼                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Concrete Implementations                │    │
│  │                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │AcsVector    │  │ Pinecone    │  │  Qdrant     │  │    │
│  │  │   Store     │  │   Store     │  │   Store     │  │    │
│  │  └──────┬──────┘  └─────────────┘  └─────────────┘  │    │
│  │         │                                            │    │
│  └─────────┼────────────────────────────────────────────┘    │
└────────────┼─────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                  Azure Cognitive Search                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Index 1   │  │   Index 2   │  │   Index N   │          │
│  │ vectorField │  │ vectorField │  │ vectorField │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. State Machines

### 4.1 Search Query State Machine

```
             ┌─────────────┐
    ────────▶│   Created   │
             └──────┬──────┘
                    │ validate()
                    ▼
             ┌─────────────┐
             │  Validated  │
             └──────┬──────┘
                    │ build()
                    ▼
             ┌─────────────┐
             │   Built     │
             └──────┬──────┘
                    │ execute()
                    ▼
             ┌─────────────┐
             │  Executing  │
             └──────┬──────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
 ┌─────────────┐         ┌─────────────┐
 │  Success    │         │   Failed    │
 └─────────────┘         └──────┬──────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
             ┌─────────────┐         ┌─────────────┐
             │   Retry     │         │  Terminal   │
             │  (if 5xx)   │         │   Error     │
             └──────┬──────┘         └─────────────┘
                    │
                    └──────▶ (back to Executing)
```

### 4.2 Batch Index State Machine

```
             ┌─────────────┐
    ────────▶│   Pending   │
             └──────┬──────┘
                    │ start()
                    ▼
             ┌─────────────┐◀──────┐
             │  Indexing   │       │
             └──────┬──────┘       │
                    │              │
        ┌───────────┴───────────┐  │
        ▼                       ▼  │
 ┌─────────────┐         ┌─────────────┐
 │   200 OK    │         │  207 Multi  │
 │ All Success │         │   Status    │
 └──────┬──────┘         └──────┬──────┘
        │                       │
        │                ┌──────┴──────┐
        │                ▼             ▼
        │         ┌───────────┐ ┌───────────┐
        │         │  Partial  │ │   Retry   │
        │         │  Failure  │ │  Failed   │
        │         └─────┬─────┘ └─────┬─────┘
        │               │             │
        │               │             └──────┘
        │               │
        └───────────────┼───────────────┐
                        ▼               ▼
                 ┌─────────────┐ ┌─────────────┐
                 │  Complete   │ │   Failed    │
                 └─────────────┘ └─────────────┘
```

### 4.3 Circuit Breaker State Machine

```
             ┌─────────────┐
    ────────▶│   Closed    │◀─────────────────────┐
             └──────┬──────┘                      │
                    │ failures >= threshold       │
                    ▼                             │
             ┌─────────────┐                      │
             │    Open     │                      │
             └──────┬──────┘                      │
                    │ timeout elapsed             │
                    ▼                             │
             ┌─────────────┐                      │
             │  Half-Open  │                      │
             └──────┬──────┘                      │
                    │                             │
        ┌───────────┴───────────┐                 │
        ▼                       ▼                 │
 ┌─────────────┐         ┌─────────────┐          │
 │  Success    │         │   Failure   │          │
 │  (count++)  │         │             │          │
 └──────┬──────┘         └──────┬──────┘          │
        │                       │                 │
        │ successes >=          ▼                 │
        │ threshold      ┌─────────────┐          │
        │                │    Open     │          │
        │                └─────────────┘          │
        └─────────────────────────────────────────┘
```

---

## 5. Integration Points

### 5.1 Shared Module Integration

```
┌─────────────────────────────────────────────────────────────┐
│               Azure Cognitive Search Integration             │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   shared/   │ │   shared/   │ │   shared/   │ │   shared/   │
│ credentials │ │ resilience  │ │observability│ │vector_memory│
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       │               │               │               │
       ▼               ▼               ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│AzureCredProv│ │   Retry     │ │  Tracing    │ │ VectorStore │
│ API Key     │ │CircuitBreak │ │  Metrics    │ │   Trait     │
│ Entra ID    │ │             │ │             │ │             │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### 5.2 Observability Integration

```
┌─────────────────────────────────────────────────────────────┐
│                   ACS Operation                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   Tracing   │ │   Metrics   │ │   Logging   │
    │    Span     │ │  Emission   │ │   Output    │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ acs.search  │ │search_total │ │ Structured  │
    │ acs.index   │ │latency_secs │ │   JSON      │
    │ acs.hybrid  │ │docs_indexed │ │   Logs      │
    └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 6. Query Type Selection

```
┌───────────────────────────────────────────────────────────────┐
│                      Query Selection                           │
└───────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       ┌─────────────┐                 ┌─────────────┐
       │ Has Vector? │                 │Has Keyword? │
       └──────┬──────┘                 └──────┬──────┘
              │                               │
    ┌─────────┴─────────┐           ┌─────────┴─────────┐
    ▼                   ▼           ▼                   ▼
┌───────┐           ┌───────┐   ┌───────┐           ┌───────┐
│  Yes  │           │  No   │   │  Yes  │           │  No   │
└───┬───┘           └───┬───┘   └───┬───┘           └───┬───┘
    │                   │           │                   │
    └─────────┬─────────┘           └─────────┬─────────┘
              │                               │
              ▼                               ▼
       ┌─────────────────────────────────────────────┐
       │           Query Type Matrix                  │
       ├─────────────────────────────────────────────┤
       │  Vector + Keyword  →  Hybrid Search         │
       │  Vector Only       →  Vector Search         │
       │  Keyword Only      →  Keyword Search        │
       │  + Semantic Config →  Semantic Search       │
       └─────────────────────────────────────────────┘
```

---

## 7. Concurrency Model

```
┌─────────────────────────────────────────────────────────────┐
│                     Tokio Runtime                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            User Operations (Concurrent)              │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │   │
│  │  │ search  │ │ search  │ │ index   │ │ lookup  │    │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Shared State (Thread-Safe)              │   │
│  │  ┌───────────────┐  ┌───────────────┐               │   │
│  │  │Arc<Breaker>   │  │Arc<Transport> │               │   │
│  │  └───────────────┘  └───────────────┘               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture phase |

---

**Next Phase:** Refinement - Detailed Rust/TypeScript interface specifications, request/response types, and integration patterns.
