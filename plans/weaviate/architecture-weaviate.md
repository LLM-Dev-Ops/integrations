# Weaviate Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/vector/weaviate`

---

## 1. C4 Model Diagrams

### 1.1 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LLM Dev Ops Platform                              │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │     RAG      │  │   Semantic   │  │   Document   │                  │
│  │  Workflows   │  │    Search    │  │   Indexing   │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                 │                           │
│         └─────────────────┼─────────────────┘                           │
│                           ▼                                              │
│              ┌────────────────────────┐                                 │
│              │  Weaviate Integration  │                                 │
│              │        Module          │                                 │
│              └───────────┬────────────┘                                 │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │  Weaviate  │  │  Weaviate  │  │    LLM     │
    │  REST API  │  │  gRPC API  │  │  Provider  │
    │  (:8080)   │  │  (:50051)  │  │(Embeddings)│
    └────────────┘  └────────────┘  └────────────┘
```

### 1.2 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Weaviate Integration Module                         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         Public API Layer                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │  Object  │ │  Search  │ │  Batch   │ │ Aggregate│           │   │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │           │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │   │
│  └───────┼────────────┼────────────┼────────────┼──────────────────┘   │
│          │            │            │            │                       │
│  ┌───────┴────────────┴────────────┴────────────┴──────────────────┐   │
│  │                       Core Services Layer                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
│  │  │   GraphQL    │  │    Filter    │  │   Schema     │           │   │
│  │  │   Builder    │  │   Builder    │  │    Cache     │           │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Transport Layer                              │   │
│  │  ┌────────────────────────┐  ┌────────────────────────┐         │   │
│  │  │      HTTP Client       │  │      gRPC Client       │         │   │
│  │  │   (REST + GraphQL)     │  │   (Batch Operations)   │         │   │
│  │  └────────────────────────┘  └────────────────────────┘         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                       Shared Dependencies                         │   │
│  │    shared/auth     shared/resilience     shared/observability    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            Search Service                                   │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ NearVector  │  │  NearText   │  │   Hybrid    │  │    BM25     │       │
│  │  Executor   │  │  Executor   │  │  Executor   │  │  Executor   │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                │                │               │
│         └────────────────┴────────────────┴────────────────┘               │
│                                    │                                        │
│                          ┌─────────▼─────────┐                             │
│                          │  GraphQL Builder  │                             │
│                          └─────────┬─────────┘                             │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
┌────────────────────────────────────┼────────────────────────────────────────┐
│                           Filter Builder                                    │
│                                    │                                        │
│  ┌────────────┐  ┌────────────────▼───────────────┐  ┌────────────┐       │
│  │  Operand   │  │                                 │  │ Validator  │       │
│  │  Builder   │──│       Filter Composer           │──│  (Schema)  │       │
│  └────────────┘  │                                 │  └────────────┘       │
│                  │  ┌───────┐ ┌───────┐ ┌───────┐ │                        │
│                  │  │  AND  │ │  OR   │ │ Value │ │                        │
│                  │  └───────┘ └───────┘ └───────┘ │                        │
│                  └─────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Structure

```
integrations/vector/weaviate/
├── mod.rs                      # Public exports
├── client.rs                   # WeaviateClient implementation
├── config.rs                   # Configuration types
├── error.rs                    # Error types and mapping
│
├── auth/
│   ├── mod.rs                  # Auth exports
│   ├── api_key.rs              # API key authentication
│   ├── oidc.rs                 # OIDC token authentication
│   └── client_credentials.rs  # OAuth client credentials
│
├── transport/
│   ├── mod.rs                  # Transport exports
│   ├── http.rs                 # HTTP client wrapper
│   ├── grpc.rs                 # gRPC client wrapper
│   └── graphql.rs              # GraphQL execution
│
├── object/
│   ├── mod.rs                  # Object exports
│   ├── service.rs              # Object CRUD operations
│   ├── validation.rs           # Object validation
│   └── serialization.rs        # Object (de)serialization
│
├── batch/
│   ├── mod.rs                  # Batch exports
│   ├── service.rs              # Batch operations
│   ├── chunker.rs              # Batch chunking logic
│   └── grpc_batch.rs           # gRPC batch implementation
│
├── search/
│   ├── mod.rs                  # Search exports
│   ├── near_vector.rs          # Vector similarity search
│   ├── near_text.rs            # Semantic text search
│   ├── near_object.rs          # Object similarity search
│   ├── hybrid.rs               # Hybrid BM25+vector search
│   ├── bm25.rs                 # BM25 keyword search
│   └── result.rs               # Search result types
│
├── filter/
│   ├── mod.rs                  # Filter exports
│   ├── builder.rs              # Filter builder API
│   ├── operators.rs            # Filter operators
│   ├── serialization.rs        # Filter to GraphQL
│   └── validation.rs           # Filter validation
│
├── aggregate/
│   ├── mod.rs                  # Aggregate exports
│   ├── service.rs              # Aggregation operations
│   ├── builder.rs              # Aggregation query builder
│   └── result.rs               # Aggregation result types
│
├── reference/
│   ├── mod.rs                  # Reference exports
│   ├── service.rs              # Cross-reference operations
│   └── beacon.rs               # Beacon URL handling
│
├── tenant/
│   ├── mod.rs                  # Tenant exports
│   └── service.rs              # Multi-tenancy operations
│
├── schema/
│   ├── mod.rs                  # Schema exports
│   ├── service.rs              # Schema introspection
│   ├── cache.rs                # Schema caching
│   └── types.rs                # Schema type definitions
│
├── types/
│   ├── mod.rs                  # Type exports
│   ├── object.rs               # WeaviateObject types
│   ├── property.rs             # PropertyValue types
│   ├── vector.rs               # Vector handling
│   └── convert.rs              # Type conversions
│
├── graphql/
│   ├── mod.rs                  # GraphQL exports
│   ├── builder.rs              # GraphQL query builder
│   ├── parser.rs               # Response parser
│   └── error.rs                # GraphQL error handling
│
└── simulation/
    ├── mod.rs                  # Simulation exports
    ├── mock_client.rs          # Mock client implementation
    ├── memory_store.rs         # In-memory object storage
    ├── vector_ops.rs           # Vector similarity computation
    └── recorder.rs             # Operation recording
```

---

## 3. Data Flow Diagrams

### 3.1 Vector Search Flow

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  Caller  │────▶│ SearchService│────▶│   Schema    │────▶│  Vector  │
└──────────┘     └──────────────┘     │   Cache     │     │  Validate│
                                      └─────────────┘     └────┬─────┘
                                                               │
     ┌─────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Filter    │────▶│   GraphQL   │────▶│    HTTP     │
│  Serialize  │     │   Builder   │     │   Client    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                      ┌─────────────┐
                                      │  Weaviate   │
                                      │   GraphQL   │
                                      └──────┬──────┘
                                             │
     ┌───────────────────────────────────────┘
     │
     ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Response   │────▶│   Result    │────▶│   Return    │
│   Parser    │     │   Builder   │     │  SearchHits │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 3.2 Batch Import Flow

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  Caller  │────▶│ BatchService │────▶│   Chunker   │
└──────────┘     └──────────────┘     │  (100 objs) │
                                      └──────┬──────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
       ┌────────────┐                 ┌────────────┐                 ┌────────────┐
       │  Chunk 1   │                 │  Chunk 2   │                 │  Chunk N   │
       └─────┬──────┘                 └─────┬──────┘                 └─────┬──────┘
             │                              │                              │
             ▼                              ▼                              ▼
       ┌────────────┐                 ┌────────────┐                 ┌────────────┐
       │gRPC/REST   │                 │gRPC/REST   │                 │gRPC/REST   │
       │  Import    │                 │  Import    │                 │  Import    │
       └─────┬──────┘                 └─────┬──────┘                 └─────┬──────┘
             │                              │                              │
             └──────────────────────────────┼──────────────────────────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │ Aggregate       │
                                   │ BatchResponse   │
                                   └─────────────────┘
```

### 3.3 Hybrid Search Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Hybrid Search                                   │
│                                                                          │
│  Input: query="machine learning", alpha=0.75, filter={year > 2020}       │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Parallel Execution                               │ │
│  │                                                                     │ │
│  │   ┌─────────────────────┐     ┌─────────────────────┐             │ │
│  │   │     BM25 Search     │     │   Vector Search     │             │ │
│  │   │   (1 - alpha=0.25)  │     │    (alpha=0.75)     │             │ │
│  │   └──────────┬──────────┘     └──────────┬──────────┘             │ │
│  │              │                           │                         │ │
│  │              ▼                           ▼                         │ │
│  │   ┌─────────────────────┐     ┌─────────────────────┐             │ │
│  │   │   BM25 Scores       │     │  Similarity Scores  │             │ │
│  │   │   [0.8, 0.6, 0.4]   │     │  [0.95, 0.85, 0.7]  │             │ │
│  │   └──────────┬──────────┘     └──────────┬──────────┘             │ │
│  │              │                           │                         │ │
│  └──────────────┴───────────────────────────┴─────────────────────────┘ │
│                                     │                                    │
│                                     ▼                                    │
│                         ┌─────────────────────┐                         │
│                         │    Score Fusion     │                         │
│                         │                     │                         │
│                         │  RankedFusion or    │                         │
│                         │  RelativeScoreFusion│                         │
│                         └──────────┬──────────┘                         │
│                                    │                                     │
│                                    ▼                                     │
│                         ┌─────────────────────┐                         │
│                         │   Ranked Results    │                         │
│                         │   with fused scores │                         │
│                         └─────────────────────┘                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Transport Architecture

### 4.1 HTTP/REST Transport

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HTTP Transport Layer                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Request Pipeline                            │   │
│  │                                                                  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │   │
│  │  │   Auth   │─▶│  Retry   │─▶│ Circuit  │─▶│  Timeout │        │   │
│  │  │ Injector │  │  Layer   │  │ Breaker  │  │  Handler │        │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                     │                                    │
│                                     ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      HTTP Client Pool                            │   │
│  │                                                                  │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                   │   │
│  │  │  Conn 1   │  │  Conn 2   │  │  Conn N   │                   │   │
│  │  └───────────┘  └───────────┘  └───────────┘                   │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Endpoints:                                                              │
│  ├── /v1/objects      → CRUD operations                                │
│  ├── /v1/batch        → Batch operations                               │
│  ├── /v1/graphql      → Search & aggregation                           │
│  └── /v1/schema       → Schema introspection                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 gRPC Transport

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         gRPC Transport Layer                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Connection Pool                               │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  Channel Manager                                         │    │   │
│  │  │                                                          │    │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │    │   │
│  │  │  │Channel 1│  │Channel 2│  │Channel 3│  │Channel N│    │    │   │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │    │   │
│  │  │                                                          │    │   │
│  │  └──────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Services:                                                               │
│  ├── Weaviate.Search    → Vector search operations                     │
│  ├── Weaviate.Batch     → Batch import (high throughput)               │
│  └── Weaviate.Tenants   → Tenant management                            │
│                                                                          │
│  Benefits:                                                               │
│  ├── 2-3x faster batch imports                                         │
│  ├── Streaming support                                                  │
│  └── Binary protocol efficiency                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. GraphQL Architecture

### 5.1 Query Builder

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      GraphQL Query Builder                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Query Components                            │   │
│  │                                                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │   Get/       │  │   Search     │  │   Filter     │          │   │
│  │  │   Aggregate  │  │   Clause     │  │   Clause     │          │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │   │
│  │                                                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │  Properties  │  │  Additional  │  │   Limit/     │          │   │
│  │  │  Selection   │  │   Fields     │  │   Offset     │          │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                     │                                    │
│                                     ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Query Composer                               │   │
│  │                                                                  │   │
│  │  {                                                               │   │
│  │    Get {                                                         │   │
│  │      Article(                                                    │   │
│  │        nearVector: { vector: [...], certainty: 0.8 }            │   │
│  │        where: { path: ["year"], operator: GreaterThan, ... }    │   │
│  │        limit: 10                                                 │   │
│  │      ) {                                                         │   │
│  │        title content                                             │   │
│  │        _additional { id distance certainty }                     │   │
│  │      }                                                           │   │
│  │    }                                                             │   │
│  │  }                                                               │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Response Parser

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Response Parser                                     │
│                                                                          │
│  GraphQL Response                                                        │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │   Parse     │────▶│   Extract   │────▶│   Convert   │               │
│  │   JSON      │     │   Data/Errs │     │   Types     │               │
│  └─────────────┘     └─────────────┘     └─────────────┘               │
│                                                 │                        │
│                                                 ▼                        │
│                      ┌─────────────────────────────────────────┐        │
│                      │             Type Mapping                 │        │
│                      │                                          │        │
│                      │  GraphQL        →    Rust                │        │
│                      │  ────────────────────────────            │        │
│                      │  string         →    String              │        │
│                      │  number         →    f64                 │        │
│                      │  int            →    i64                 │        │
│                      │  boolean        →    bool                │        │
│                      │  date           →    DateTime            │        │
│                      │  geoCoordinates →    GeoCoordinates      │        │
│                      │  phoneNumber    →    PhoneNumber         │        │
│                      │  [references]   →    Vec<Reference>      │        │
│                      │                                          │        │
│                      └─────────────────────────────────────────┘        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Filter Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Filter Builder                                   │
│                                                                          │
│  Fluent API:                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Filter::property("year").greater_than(2020)                     │   │
│  │      .and(Filter::property("category").equal("science"))         │   │
│  │      .and(Filter::property("tags").contains_any(["ai", "ml"]))   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                     │                                    │
│                                     ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Filter AST                                  │   │
│  │                                                                  │   │
│  │                         AND                                      │   │
│  │                    ┌────┴────┐                                   │   │
│  │                    │         │                                   │   │
│  │                   AND      Operand                               │   │
│  │               ┌───┴───┐   (tags contains)                        │   │
│  │               │       │                                          │   │
│  │            Operand  Operand                                      │   │
│  │           (year>)  (category=)                                   │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                     │                                    │
│                                     ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    GraphQL Output                                │   │
│  │                                                                  │   │
│  │  {                                                               │   │
│  │    operator: And                                                 │   │
│  │    operands: [                                                   │   │
│  │      { operator: And, operands: [                                │   │
│  │        { path: ["year"], operator: GreaterThan, valueInt: 2020 },│   │
│  │        { path: ["category"], operator: Equal, valueText: "..." } │   │
│  │      ]},                                                         │   │
│  │      { path: ["tags"], operator: ContainsAny, valueText: [...] } │   │
│  │    ]                                                             │   │
│  │  }                                                               │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Schema Cache Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Schema Cache                                     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Cache Structure                             │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  Class Name        │  ClassDefinition  │  Expires At    │    │   │
│  │  ├────────────────────┼───────────────────┼────────────────┤    │   │
│  │  │  Article           │  { properties: [  │  T + 5min      │    │   │
│  │  │                    │    title, content │                │    │   │
│  │  │                    │    year, tags }   │                │    │   │
│  │  ├────────────────────┼───────────────────┼────────────────┤    │   │
│  │  │  Document          │  { properties: [  │  T + 5min      │    │   │
│  │  │                    │    text, vector } │                │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Operations:                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  get_class(name) ───┬──▶ Cache Hit  ──▶ Return cached           │   │
│  │                     │                                            │   │
│  │                     └──▶ Cache Miss ──▶ Fetch from API          │   │
│  │                                          │                       │   │
│  │                                          ▼                       │   │
│  │                                     Store in cache               │   │
│  │                                          │                       │   │
│  │                                          ▼                       │   │
│  │                                     Return to caller             │   │
│  │                                                                  │   │
│  │  invalidate(name) ──▶ Remove from cache                         │   │
│  │                                                                  │   │
│  │  invalidate_all() ──▶ Clear entire cache                        │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Multi-Tenancy Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Multi-Tenancy Model                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Class: Article                              │   │
│  │                      (Multi-tenant enabled)                      │   │
│  │                                                                  │   │
│  │  ┌───────────────────────────────────────────────────────────┐  │   │
│  │  │                      Tenants                               │  │   │
│  │  │                                                            │  │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │   │
│  │  │  │  tenant_a   │  │  tenant_b   │  │  tenant_c   │       │  │   │
│  │  │  │  (Active)   │  │  (Active)   │  │ (Inactive)  │       │  │   │
│  │  │  │             │  │             │  │             │       │  │   │
│  │  │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │       │  │   │
│  │  │  │ │ Shard 1 │ │  │ │ Shard 1 │ │  │ │ Shard 1 │ │       │  │   │
│  │  │  │ │(objects)│ │  │ │(objects)│ │  │ │(cold)   │ │       │  │   │
│  │  │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │       │  │   │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │   │
│  │  │                                                            │  │   │
│  │  └────────────────────────────────────────────────────────────┘  │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Request Routing:                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  Request ──▶ Extract tenant from params                         │   │
│  │                    │                                             │   │
│  │                    ▼                                             │   │
│  │             Validate tenant exists & active                      │   │
│  │                    │                                             │   │
│  │                    ▼                                             │   │
│  │             Route to tenant shard                                │   │
│  │                    │                                             │   │
│  │                    ▼                                             │   │
│  │             Execute operation                                    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Error Handling Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Error Handling Pipeline                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   HTTP/gRPC Response                             │   │
│  └───────────────────────────┬─────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Error Mapper                                │   │
│  │                                                                  │   │
│  │  HTTP Status    │    GraphQL Error    │   WeaviateError         │   │
│  │  ──────────────────────────────────────────────────             │   │
│  │  401            │    -                 │   Unauthorized          │   │
│  │  403            │    -                 │   Forbidden             │   │
│  │  404            │    "not found"       │   ObjectNotFound        │   │
│  │  404            │    "class not found" │   ClassNotFound         │   │
│  │  404            │    "tenant not..."   │   TenantNotFound        │   │
│  │  422            │    "invalid..."      │   InvalidObject/Filter  │   │
│  │  429            │    -                 │   RateLimited           │   │
│  │  500            │    -                 │   InternalError         │   │
│  │  503            │    -                 │   ServiceUnavailable    │   │
│  │                                                                  │   │
│  └───────────────────────────┬─────────────────────────────────────┘   │
│                              │                                          │
│              ┌───────────────┼───────────────┐                         │
│              │               │               │                         │
│              ▼               ▼               ▼                         │
│       ┌───────────┐   ┌───────────┐   ┌───────────┐                   │
│       │ Retryable │   │   Fatal   │   │   Log &   │                   │
│       │  → Retry  │   │  → Raise  │   │   Metric  │                   │
│       └───────────┘   └───────────┘   └───────────┘                   │
│                                                                          │
│  Retryable: RateLimited, ServiceUnavailable, InternalError, Timeout    │
│  Fatal: Unauthorized, Forbidden, InvalidObject, ClassNotFound          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Observability Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Observability Integration                           │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         Metrics                                  │   │
│  │                                                                  │   │
│  │  weaviate.object.create           (counter)                     │   │
│  │  weaviate.object.get              (counter)                     │   │
│  │  weaviate.object.delete           (counter)                     │   │
│  │  weaviate.batch.objects           (counter)                     │   │
│  │  weaviate.batch.errors            (counter)                     │   │
│  │  weaviate.search.near_vector      (counter)                     │   │
│  │  weaviate.search.hybrid           (counter)                     │   │
│  │  weaviate.search.latency_ms       (histogram)                   │   │
│  │  weaviate.graphql.latency_ms      (histogram)                   │   │
│  │  weaviate.grpc.latency_ms         (histogram)                   │   │
│  │  weaviate.error                   (counter, by type)            │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                          Traces                                  │   │
│  │                                                                  │   │
│  │  weaviate.near_vector                                           │   │
│  │    ├── validate_vector                                          │   │
│  │    ├── build_graphql                                            │   │
│  │    ├── execute_graphql                                          │   │
│  │    └── parse_results                                            │   │
│  │                                                                  │   │
│  │  weaviate.batch_create                                          │   │
│  │    ├── chunk_objects                                            │   │
│  │    ├── grpc_import (per chunk)                                  │   │
│  │    └── aggregate_results                                        │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                           Logs                                   │   │
│  │                                                                  │   │
│  │  {                                                               │   │
│  │    "level": "info",                                              │   │
│  │    "component": "weaviate",                                      │   │
│  │    "operation": "near_vector",                                   │   │
│  │    "class": "Article",                                           │   │
│  │    "results": 10,                                                │   │
│  │    "duration_ms": 45,                                            │   │
│  │    "tenant": "tenant_a"                                          │   │
│  │    // Vector values are NOT logged                               │   │
│  │  }                                                               │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Simulation Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Simulation Layer                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MockWeaviateClient                            │   │
│  │                                                                  │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │   │
│  │  │  In-Memory    │  │   Vector      │  │   Operation   │       │   │
│  │  │  Object Store │  │   Similarity  │  │   Recorder    │       │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘       │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                 Vector Similarity Engine                         │   │
│  │                                                                  │   │
│  │  Distance Metrics:                                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │   Cosine    │  │ Dot Product │  │  L2 Squared │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  │                                                                  │   │
│  │  FUNCTION compute_similarity(v1, v2, metric):                   │   │
│  │    MATCH metric:                                                 │   │
│  │      Cosine => dot(v1, v2) / (norm(v1) * norm(v2))             │   │
│  │      DotProduct => dot(v1, v2)                                  │   │
│  │      L2Squared => sum((v1[i] - v2[i])^2)                        │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   Filter Evaluator                               │   │
│  │                                                                  │   │
│  │  FUNCTION matches_filter(object, filter) -> bool:               │   │
│  │    MATCH filter:                                                 │   │
│  │      Operand(op) => evaluate_operand(object, op)                │   │
│  │      And(filters) => filters.all(f => matches_filter(obj, f))   │   │
│  │      Or(filters) => filters.any(f => matches_filter(obj, f))    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Integration Dependencies

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      External Dependencies                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Shared Modules                              │   │
│  │                                                                  │   │
│  │  shared/auth                                                     │   │
│  │  ├── get_api_key() → ApiKey                                     │   │
│  │  ├── get_oidc_token() → Token                                   │   │
│  │  └── refresh_token() → Token                                    │   │
│  │                                                                  │   │
│  │  shared/resilience                                               │   │
│  │  ├── RetryPolicy (configurable)                                 │   │
│  │  ├── CircuitBreaker (per endpoint)                              │   │
│  │  └── RateLimiter (request rate)                                 │   │
│  │                                                                  │   │
│  │  shared/observability                                            │   │
│  │  ├── MetricsClient                                              │   │
│  │  ├── TracingContext                                             │   │
│  │  └── StructuredLogger                                           │   │
│  │                                                                  │   │
│  │  shared/vector-memory                                            │   │
│  │  ├── generate_embedding(text) → Vec<f32>                        │   │
│  │  └── get_embedding_dimension() → u32                            │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   LLM Integrations                               │   │
│  │                                                                  │   │
│  │  llm/embeddings                                                  │   │
│  │  ├── Generate vectors for nearVector queries                    │   │
│  │  └── Batch embedding generation                                 │   │
│  │                                                                  │   │
│  │  llm/completions                                                 │   │
│  │  └── RAG context injection                                      │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-weaviate.md | Complete |
| 2. Pseudocode | pseudocode-weaviate.md | Complete |
| 3. Architecture | architecture-weaviate.md | Complete |
| 4. Refinement | refinement-weaviate.md | Pending |
| 5. Completion | completion-weaviate.md | Pending |

---

*Phase 3: Architecture - Complete*
