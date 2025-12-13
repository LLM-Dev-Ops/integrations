# Azure Cognitive Search Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/azure-cognitive-search`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements for the Azure Cognitive Search Integration Module. It provides a production-ready interface for hybrid search (keyword + vector) and vector indexing, serving as an alternative or complement to dedicated vector databases within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Azure Cognitive Search Integration Module provides a **thin adapter layer** that:
- Implements shared vector memory abstractions for Azure Cognitive Search
- Supports hybrid search combining keyword and vector retrieval
- Enables document indexing with vector embeddings
- Provides relevance tuning through scoring profiles
- Integrates with shared auth, logging, and observability
- Enables simulation/replay of search operations

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Vector Search** | K-NN and approximate nearest neighbor queries |
| **Keyword Search** | Full-text search with Lucene/simple syntax |
| **Hybrid Search** | Combined vector + keyword with RRF fusion |
| **Document Indexing** | Add, update, delete documents with embeddings |
| **Batch Operations** | Bulk document upload/delete |
| **Index Operations** | Get index stats, refresh, query index schema |
| **Scoring Profiles** | Apply relevance tuning configurations |
| **Semantic Ranking** | Optional semantic reranking |
| **Resilience** | Retry, circuit breaker, rate limiting |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Search queries | Vector, keyword, hybrid, semantic |
| Document operations | Index, merge, delete, batch |
| Index metadata | Get schema, stats, field info |
| Scoring profiles | Apply at query time |
| Filters | OData filter expressions |
| Facets | Faceted navigation support |
| Suggestions | Autocomplete and suggestions |
| Vector fields | Multiple vector fields per doc |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Index creation/deletion | Infrastructure provisioning |
| Skillset management | Infrastructure configuration |
| Indexer management | Infrastructure orchestration |
| Data source connections | Infrastructure provisioning |
| Synonym maps (write) | Infrastructure configuration |
| Custom analyzers (create) | Infrastructure configuration |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first | I/O-bound operations |
| Batch-optimized | Throughput efficiency |
| No panics | Reliability |
| Trait-based | Testability, vector memory abstraction |
| API key / Entra ID auth | Azure standard |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | Azure credential management |
| `shared/resilience` | Retry, circuit breaker |
| `shared/observability` | Logging, metrics, tracing |
| `shared/vector-memory` | Vector store abstraction trait |
| `shared/http` | HTTP transport |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `reqwest` | HTTP client |
| `serde` / `serde_json` | Serialization |
| `async-trait` | Async trait support |
| `thiserror` | Error derivation |
| `chrono` | Timestamps |
| `futures` | Stream utilities |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `azure-sdk-for-rust` (search) | This module IS the integration |
| Full Azure SDK | Use internal implementations |

---

## 4. API Coverage

### 4.1 Azure Cognitive Search REST API

**Base URL:** `https://{service}.search.windows.net`

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Search | POST | `/indexes/{index}/docs/search?api-version=2024-07-01` |
| Lookup | GET | `/indexes/{index}/docs/{key}?api-version=2024-07-01` |
| Suggest | POST | `/indexes/{index}/docs/suggest?api-version=2024-07-01` |
| Autocomplete | POST | `/indexes/{index}/docs/autocomplete?api-version=2024-07-01` |
| Index Documents | POST | `/indexes/{index}/docs/index?api-version=2024-07-01` |
| Count | GET | `/indexes/{index}/docs/$count?api-version=2024-07-01` |
| Get Index | GET | `/indexes/{index}?api-version=2024-07-01` |
| Get Index Stats | GET | `/indexes/{index}/stats?api-version=2024-07-01` |

### 4.2 Search Request Structure

```json
{
  "search": "keyword query",
  "searchFields": "title,content",
  "filter": "category eq 'tech'",
  "orderby": "timestamp desc",
  "select": "id,title,content,vector",
  "top": 10,
  "skip": 0,
  "count": true,
  "facets": ["category,count:10"],
  "highlight": "content",
  "scoringProfile": "boost-recent",
  "vectorQueries": [
    {
      "kind": "vector",
      "vector": [0.1, 0.2, ...],
      "fields": "contentVector",
      "k": 10,
      "exhaustive": false
    }
  ],
  "semanticConfiguration": "my-semantic-config",
  "queryType": "semantic"
}
```

### 4.3 Index Document Actions

| Action | Description |
|--------|-------------|
| `upload` | Insert or replace document |
| `merge` | Update existing fields only |
| `mergeOrUpload` | Update if exists, insert otherwise |
| `delete` | Remove document by key |

```json
{
  "value": [
    { "@search.action": "upload", "id": "1", "title": "...", "vector": [...] },
    { "@search.action": "delete", "id": "2" }
  ]
}
```

### 4.4 Vector Search Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `vector` | Pure vector similarity | Semantic retrieval |
| `hybrid` | Vector + keyword | Best of both |
| `semantic` | + Semantic reranking | Highest relevance |

### 4.5 Authentication

**API Key:**
```
api-key: {admin-key or query-key}
```

**Entra ID (OAuth2):**
```
Authorization: Bearer {token}
```

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
AcsError
├── ConfigurationError
│   ├── InvalidEndpoint
│   ├── InvalidIndexName
│   └── MissingCredentials
│
├── AuthenticationError
│   ├── InvalidApiKey
│   ├── TokenExpired
│   └── PermissionDenied
│
├── IndexError
│   ├── IndexNotFound
│   ├── FieldNotFound
│   └── InvalidSchema
│
├── DocumentError
│   ├── DocumentNotFound
│   ├── KeyFieldMissing
│   ├── ValidationFailed
│   └── PartialFailure
│
├── QueryError
│   ├── InvalidFilter
│   ├── InvalidOrderBy
│   ├── VectorDimensionMismatch
│   └── SyntaxError
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   └── DnsResolutionFailed
│
└── ServerError
    ├── InternalError
    ├── ServiceUnavailable
    ├── ServiceBusy
    └── QuotaExceeded
```

### 5.2 HTTP Status Mapping

| Status | Error Type | Retryable |
|--------|------------|-----------|
| 400 | `QueryError` / `DocumentError` | No |
| 401 | `AuthenticationError` | No |
| 403 | `AuthenticationError::PermissionDenied` | No |
| 404 | `IndexError::IndexNotFound` | No |
| 409 | `DocumentError::VersionConflict` | No |
| 429 | `ServerError::ServiceBusy` | Yes |
| 500 | `ServerError::InternalError` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |
| 207 | `DocumentError::PartialFailure` | Partial |

---

## 6. Resilience Requirements

### 6.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `ServiceBusy` (429) | Yes | 5 | Exponential (1s base) |
| `ServiceUnavailable` | Yes | 3 | Exponential (2s base) |
| `InternalError` | Yes | 3 | Exponential (1s base) |
| `Timeout` | Yes | 3 | Fixed (1s) |
| `ConnectionFailed` | Yes | 3 | Exponential (500ms) |

### 6.2 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |

### 6.3 Batch Failure Handling

| Scenario | Strategy |
|----------|----------|
| Partial failure (207) | Return individual statuses |
| Full failure (5xx) | Retry entire batch |
| Quota exceeded | Backoff and retry |

---

## 7. Observability Requirements

### 7.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `acs.search` | `index`, `query_type`, `top`, `result_count` |
| `acs.vector_search` | `index`, `vector_field`, `k`, `result_count` |
| `acs.hybrid_search` | `index`, `vector_field`, `keyword`, `result_count` |
| `acs.index_documents` | `index`, `action`, `doc_count`, `success_count` |
| `acs.lookup` | `index`, `key` |

### 7.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `acs_search_total` | Counter | `index`, `query_type`, `status` |
| `acs_search_latency_seconds` | Histogram | `index`, `query_type` |
| `acs_documents_indexed_total` | Counter | `index`, `action`, `status` |
| `acs_index_latency_seconds` | Histogram | `index` |
| `acs_errors_total` | Counter | `operation`, `error_type` |

### 7.3 Logging

| Level | When |
|-------|------|
| ERROR | Auth failures, server errors |
| WARN | Partial failures, retries, rate limiting |
| INFO | Query completions, batch results |
| DEBUG | Query details, filter expressions |
| TRACE | Vector payloads, full responses |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| API keys never logged | `SecretString` wrapper |
| Token protection | Secure refresh |
| Query vs Admin key | Enforce least privilege |

### 8.2 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Enforced |
| HTTPS only | No HTTP fallback |
| Certificate validation | Enabled |

---

## 9. Performance Requirements

### 9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Vector search (k=10) | < 50ms | < 200ms |
| Hybrid search (k=10) | < 100ms | < 300ms |
| Semantic search | < 200ms | < 500ms |
| Document lookup | < 20ms | < 100ms |
| Batch index (100 docs) | < 500ms | < 2s |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Search QPS | 100+ concurrent |
| Index throughput | 1000 docs/sec |
| Batch size | Up to 1000 docs |

---

## 10. Vector Memory Integration

### 10.1 VectorStore Trait Implementation

```rust
// Implements shared::vector_memory::VectorStore
impl VectorStore for AcsVectorStore {
    async fn upsert(&self, docs: Vec<Document>) -> Result<()>;
    async fn search(&self, query: VectorQuery) -> Result<Vec<SearchResult>>;
    async fn delete(&self, ids: Vec<String>) -> Result<()>;
    async fn get(&self, id: &str) -> Result<Option<Document>>;
}
```

### 10.2 Vector Field Configuration

| Parameter | Description |
|-----------|-------------|
| `dimensions` | Vector size (e.g., 1536 for OpenAI) |
| `vectorSearchProfile` | Algorithm config name |
| `algorithm` | `hnsw` or `exhaustiveKnn` |

---

## 11. Enterprise Features

### 11.1 Hybrid Search Fusion

| Feature | Description |
|---------|-------------|
| RRF (Reciprocal Rank Fusion) | Default fusion method |
| Weighted fusion | Configurable vector/keyword weights |
| Re-ranking | Semantic re-ranking layer |

### 11.2 Relevance Tuning

| Feature | Description |
|---------|-------------|
| Scoring profiles | Field boosting, functions |
| Freshness boost | Recency-based scoring |
| Distance boost | Geo-proximity scoring |
| Tag boost | Matching value boosting |

### 11.3 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | Predefined search results |
| Record mode | Capture query/response pairs |
| Replay mode | Deterministic retrieval |

---

## 12. Acceptance Criteria

### 12.1 Functional

- [ ] Vector search (pure k-NN)
- [ ] Keyword search (Lucene syntax)
- [ ] Hybrid search (vector + keyword)
- [ ] Semantic search with reranking
- [ ] Document upload/merge/delete
- [ ] Batch document operations
- [ ] Document lookup by key
- [ ] Filter expressions
- [ ] Faceted search
- [ ] Scoring profile application
- [ ] VectorStore trait implementation

### 12.2 Non-Functional

- [ ] No panics
- [ ] Credentials protected
- [ ] Retry works correctly
- [ ] Circuit breaker functions
- [ ] Partial failure handling
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Core algorithms for hybrid search, batch indexing, scoring, and vector memory integration.
