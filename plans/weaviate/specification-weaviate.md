# Weaviate Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/vector/weaviate`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to interact with Weaviate as a vector database and semantic graph for embeddings storage, hybrid search, and retrieval-augmented generation (RAG) workflows.

### 1.2 Scope

**In Scope:**
- Object CRUD operations (create, read, update, delete)
- Vector similarity search (nearVector, nearObject)
- Hybrid search (BM25 + vector fusion)
- Semantic search (nearText via configured vectorizer)
- Metadata filtering with operators
- Batch operations (batch import, batch delete)
- Cross-reference management
- Multi-tenancy support
- GraphQL query building
- Aggregation queries
- Class schema introspection
- Simulation and replay

**Out of Scope:**
- Cluster provisioning and scaling
- Schema creation and migration
- Vectorizer module configuration
- Backup and restore operations
- Multi-node cluster management
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| API key management | `shared/auth` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Embedding generation | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 ObjectService

| Operation | Description |
|-----------|-------------|
| `create_object` | Create single object with optional vector |
| `get_object` | Retrieve object by ID |
| `update_object` | Update object properties |
| `delete_object` | Delete object by ID |
| `exists` | Check if object exists |
| `validate` | Validate object against schema |

### 2.2 BatchService

| Operation | Description |
|-----------|-------------|
| `batch_create` | Create multiple objects |
| `batch_delete` | Delete multiple objects by filter |
| `batch_update` | Update multiple objects |
| `get_batch_status` | Check batch operation status |

### 2.3 SearchService

| Operation | Description |
|-----------|-------------|
| `near_vector` | Search by vector similarity |
| `near_object` | Search by object similarity |
| `near_text` | Semantic search via vectorizer |
| `hybrid` | Combined BM25 + vector search |
| `bm25` | Keyword-based BM25 search |
| `ask` | Question-answering search |
| `generate` | Search with generative module |

### 2.4 FilterService

| Operation | Description |
|-----------|-------------|
| `build_filter` | Construct where filter |
| `combine_filters` | AND/OR filter combination |
| `validate_filter` | Validate filter against schema |

### 2.5 AggregateService

| Operation | Description |
|-----------|-------------|
| `aggregate` | Run aggregation query |
| `count` | Count objects matching filter |
| `meta_count` | Get total object count |

### 2.6 ReferenceService

| Operation | Description |
|-----------|-------------|
| `add_reference` | Create cross-reference |
| `delete_reference` | Remove cross-reference |
| `update_references` | Replace all references |

### 2.7 TenantService

| Operation | Description |
|-----------|-------------|
| `list_tenants` | List tenants for class |
| `get_tenant` | Get tenant status |
| `activate_tenant` | Activate tenant |
| `deactivate_tenant` | Deactivate tenant |

### 2.8 SchemaService (Read-Only)

| Operation | Description |
|-----------|-------------|
| `get_schema` | Get full schema |
| `get_class` | Get class definition |
| `list_classes` | List all classes |
| `get_shards` | Get shard information |

---

## 3. Core Types

### 3.1 Object Types

```
WeaviateObject:
  id: UUID
  class_name: String
  properties: Map<String, PropertyValue>
  vector: Option<Vec<f32>>
  tenant: Option<String>
  creation_time: Timestamp
  update_time: Timestamp

PropertyValue:
  | Text(String)
  | TextArray(Vec<String>)
  | Int(i64)
  | IntArray(Vec<i64>)
  | Number(f64)
  | NumberArray(Vec<f64>)
  | Boolean(bool)
  | BooleanArray(Vec<bool>)
  | Date(DateTime)
  | DateArray(Vec<DateTime>)
  | Uuid(UUID)
  | UuidArray(Vec<UUID>)
  | GeoCoordinates { latitude: f64, longitude: f64 }
  | PhoneNumber { input: String, international: String }
  | Blob(Vec<u8>)
  | ObjectReference(Vec<Reference>)

Reference:
  beacon: String           # weaviate://localhost/ClassName/uuid
  class_name: String
  id: UUID
```

### 3.2 Search Types

```
NearVectorQuery:
  vector: Vec<f32>
  certainty: Option<f32>      # 0.0 - 1.0
  distance: Option<f32>       # Lower is more similar
  limit: u32
  offset: Option<u32>
  filter: Option<WhereFilter>
  properties: Vec<String>     # Fields to return
  with_vector: bool

NearObjectQuery:
  id: UUID
  class_name: String
  certainty: Option<f32>
  distance: Option<f32>
  limit: u32
  filter: Option<WhereFilter>
  properties: Vec<String>

NearTextQuery:
  concepts: Vec<String>
  certainty: Option<f32>
  distance: Option<f32>
  move_to: Option<MoveParams>
  move_away: Option<MoveParams>
  limit: u32
  filter: Option<WhereFilter>
  properties: Vec<String>

MoveParams:
  concepts: Vec<String>
  force: f32                  # 0.0 - 1.0

HybridQuery:
  query: String
  vector: Option<Vec<f32>>
  alpha: f32                  # 0.0 = BM25 only, 1.0 = vector only
  fusion_type: FusionType
  limit: u32
  filter: Option<WhereFilter>
  properties: Vec<String>

FusionType:
  | RankedFusion
  | RelativeScoreFusion

BM25Query:
  query: String
  properties: Option<Vec<String>>   # Fields to search
  limit: u32
  filter: Option<WhereFilter>

SearchResult:
  objects: Vec<SearchHit>
  total_count: Option<u64>

SearchHit:
  id: UUID
  class_name: String
  properties: Map<String, PropertyValue>
  vector: Option<Vec<f32>>
  score: Option<f32>          # BM25 or hybrid score
  certainty: Option<f32>      # Vector similarity
  distance: Option<f32>       # Vector distance
  explain_score: Option<String>
```

### 3.3 Filter Types

```
WhereFilter:
  | Operand(FilterOperand)
  | And(Vec<WhereFilter>)
  | Or(Vec<WhereFilter>)

FilterOperand:
  path: Vec<String>           # Property path (supports nesting)
  operator: FilterOperator
  value: FilterValue

FilterOperator:
  | Equal
  | NotEqual
  | GreaterThan
  | GreaterThanEqual
  | LessThan
  | LessThanEqual
  | Like                      # Wildcard text matching
  | WithinGeoRange
  | IsNull
  | ContainsAny              # Array contains any
  | ContainsAll              # Array contains all

FilterValue:
  | Text(String)
  | Int(i64)
  | Number(f64)
  | Boolean(bool)
  | Date(DateTime)
  | TextArray(Vec<String>)
  | IntArray(Vec<i64>)
  | GeoRange { latitude: f64, longitude: f64, distance_km: f64 }
```

### 3.4 Batch Types

```
BatchRequest:
  objects: Vec<BatchObject>
  consistency_level: ConsistencyLevel

BatchObject:
  class_name: String
  id: Option<UUID>            # Auto-generated if not provided
  properties: Map<String, PropertyValue>
  vector: Option<Vec<f32>>
  tenant: Option<String>

ConsistencyLevel:
  | One
  | Quorum
  | All

BatchResponse:
  successful: u32
  failed: u32
  errors: Vec<BatchError>

BatchError:
  index: u32
  object_id: Option<UUID>
  error_message: String

BatchDeleteRequest:
  class_name: String
  filter: WhereFilter
  dry_run: bool
  tenant: Option<String>

BatchDeleteResponse:
  matched: u64
  deleted: u64
  dry_run: bool
```

### 3.5 Aggregation Types

```
AggregateQuery:
  class_name: String
  group_by: Option<Vec<String>>
  filter: Option<WhereFilter>
  tenant: Option<String>
  fields: Vec<AggregateField>

AggregateField:
  property: String
  aggregations: Vec<Aggregation>

Aggregation:
  | Count
  | Sum
  | Mean
  | Median
  | Mode
  | Minimum
  | Maximum
  | TopOccurrences { limit: u32 }
  | PointingTo                # For references

AggregateResult:
  groups: Vec<AggregateGroup>
  meta: AggregateMeta

AggregateGroup:
  grouped_by: Option<Map<String, PropertyValue>>
  aggregations: Map<String, AggregateValue>

AggregateValue:
  | Count(u64)
  | Sum(f64)
  | Mean(f64)
  | Median(f64)
  | Mode(PropertyValue)
  | Minimum(PropertyValue)
  | Maximum(PropertyValue)
  | TopOccurrences(Vec<OccurrenceCount>)

OccurrenceCount:
  value: PropertyValue
  count: u64
```

### 3.6 Tenant Types

```
Tenant:
  name: String
  activity_status: TenantStatus

TenantStatus:
  | Active                    # Fully operational
  | Inactive                  # Data preserved, not queryable
  | Offloaded                # Data offloaded to cold storage
```

### 3.7 Schema Types (Read-Only)

```
Schema:
  classes: Vec<ClassDefinition>

ClassDefinition:
  name: String
  description: Option<String>
  vectorizer: String
  module_config: Map<String, Value>
  properties: Vec<PropertyDefinition>
  vector_index_config: VectorIndexConfig
  inverted_index_config: InvertedIndexConfig
  replication_config: ReplicationConfig
  sharding_config: ShardingConfig
  multi_tenancy_config: Option<MultiTenancyConfig>

PropertyDefinition:
  name: String
  data_type: Vec<String>      # e.g., ["text"], ["int"], ["ClassName"]
  description: Option<String>
  tokenization: Option<Tokenization>
  index_filterable: bool
  index_searchable: bool

Tokenization:
  | Word
  | Lowercase
  | Whitespace
  | Field
  | Trigram
  | Gse                       # For CJK

VectorIndexConfig:
  distance: DistanceMetric
  ef: i32
  ef_construction: i32
  max_connections: i32
  dynamic_ef_min: i32
  dynamic_ef_max: i32
  dynamic_ef_factor: i32
  vector_cache_max_objects: i64
  flat_search_cutoff: i32
  skip: bool
  pq: Option<PQConfig>

DistanceMetric:
  | Cosine
  | DotProduct
  | L2Squared
  | Manhattan
  | Hamming

ShardInfo:
  name: String
  status: ShardStatus
  object_count: u64
  vector_indexing_status: String

ShardStatus:
  | Ready
  | ReadOnly
  | Indexing
```

---

## 4. Configuration

```
WeaviateConfig:
  # Connection settings
  endpoint: String                 # e.g., "http://localhost:8080"
  grpc_endpoint: Option<String>    # e.g., "localhost:50051"
  auth: WeaviateAuth

  # Request settings
  timeout_ms: u64                  # Default: 30000
  batch_size: u32                  # Default: 100
  consistency_level: ConsistencyLevel  # Default: Quorum

  # Retry settings
  max_retries: u32                 # Default: 3
  retry_backoff_ms: u64            # Default: 1000
  circuit_breaker_threshold: u32   # Default: 5

  # Connection pool (for gRPC)
  pool_size: u32                   # Default: 10
  idle_timeout_ms: u64             # Default: 300000

WeaviateAuth:
  | None
  | ApiKey { key: SecretString }
  | Oidc { token: SecretString }
  | ClientCredentials {
      client_id: String,
      client_secret: SecretString,
      scopes: Vec<String>
    }
```

---

## 5. Error Taxonomy

| Error Type | HTTP Code | Retryable | Description |
|------------|-----------|-----------|-------------|
| `ObjectNotFound` | 404 | No | Object does not exist |
| `ClassNotFound` | 404 | No | Class does not exist |
| `TenantNotFound` | 404 | No | Tenant does not exist |
| `InvalidObject` | 422 | No | Object validation failed |
| `InvalidFilter` | 422 | No | Filter syntax/semantics error |
| `InvalidVector` | 422 | No | Vector dimension mismatch |
| `Unauthorized` | 401 | No | Authentication failed |
| `Forbidden` | 403 | No | Insufficient permissions |
| `RateLimited` | 429 | Yes | Too many requests |
| `ServiceUnavailable` | 503 | Yes | Weaviate temporarily down |
| `InternalError` | 500 | Yes | Internal Weaviate error |
| `Timeout` | - | Yes | Request timeout |
| `ConnectionError` | - | Yes | Network connectivity issue |
| `BatchPartialFailure` | 207 | Partial | Some batch items failed |

---

## 6. Rate Limits and Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| Max batch size | 100 objects | Per request (configurable) |
| Max vector dimensions | 65,535 | Per object |
| Max properties per class | 1,000 | Per class |
| Max property name length | 256 chars | Per property |
| Max text property size | 100 KB | Per property |
| Max filter depth | 10 levels | Per query |
| Max concurrent requests | Cluster-dependent | Per node |
| Max tenants per class | 100,000 | Per class |

---

## 7. Security Requirements

### 7.1 Authentication
- API key via header or OIDC tokens
- Support client credentials flow
- Token refresh handling
- No credential logging

### 7.2 Data Validation
- Vector dimension validation
- Property type validation
- Reference beacon validation
- Filter path validation

### 7.3 Multi-Tenancy
- Tenant isolation enforcement
- Tenant-scoped operations
- Tenant name validation

### 7.4 Audit Requirements
- Object operations logged (ID, class, not content)
- Search queries logged (type, not vectors)
- Batch operations logged (count, success/fail)
- Error logging (sanitized)

---

## 8. Performance Considerations

### 8.1 Vector Search Optimization
- Use appropriate distance metric
- Tune HNSW parameters (ef, efConstruction)
- Consider PQ compression for scale
- Filter before vector search when possible

### 8.2 Batch Operations
- Optimal batch size: 100 objects
- Use gRPC for high-throughput batch
- Parallel batch execution
- Handle partial failures

### 8.3 Filtering Efficiency
- Index filterable properties
- Use specific filters over broad
- Combine filters with AND for efficiency
- Avoid deep reference traversal

### 8.4 Connection Management
- Reuse HTTP connections
- gRPC connection pooling
- Appropriate timeouts
- Health check before operations

---

## 9. Hybrid Search Patterns

### 9.1 Alpha Tuning
```
alpha = 0.0  → Pure BM25 (keyword)
alpha = 0.5  → Equal weight (recommended default)
alpha = 0.75 → Vector-heavy
alpha = 1.0  → Pure vector search
```

### 9.2 Fusion Strategies
```
RankedFusion:
  - Combines ranks from BM25 and vector
  - Good for balanced retrieval

RelativeScoreFusion:
  - Normalizes scores before combining
  - Better when score magnitudes vary
```

---

## 10. Simulation Requirements

### 10.1 MockWeaviateClient
- Simulate all object operations
- In-memory object storage
- Vector similarity calculation
- Filter evaluation

### 10.2 Search Simulation
- Configurable similarity responses
- Hybrid search simulation
- Result ordering

### 10.3 Operation Replay
- Record operation sequences
- Replay for testing
- Response comparison

---

## 11. Integration Points

### 11.1 Shared Modules

```
shared/auth:
  - get_api_key() -> ApiKey
  - get_oidc_token() -> Token
  - refresh_token() -> Token

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per endpoint
  - RateLimiter (request rate)

shared/observability:
  - Metrics: weaviate.objects, weaviate.searches, weaviate.latency
  - Traces: span per operation
  - Logs: structured, content-redacted

shared/vector-memory:
  - generate_embedding(text) -> Vec<f32>
  - get_embedding_dimension() -> u32
```

### 11.2 Related Integrations

```
llm/embeddings:
  - Generate vectors for nearVector
  - Batch embedding generation

llm/completions:
  - RAG with search results
  - Generative search module
```

---

## 12. RAG Workflow Patterns

### 12.1 Basic RAG
```
Pattern:
  1. Embed query via llm/embeddings
  2. nearVector search with filter
  3. Retrieve top-k documents
  4. Pass to llm/completions with context
```

### 12.2 Hybrid RAG
```
Pattern:
  1. Hybrid search with query text
  2. Apply metadata filters (date, source, etc.)
  3. Deduplicate and rerank
  4. Generate with context
```

### 12.3 Agentic RAG
```
Pattern:
  1. Initial broad search
  2. Follow cross-references
  3. Iterative refinement queries
  4. Aggregate context
  5. Generate final response
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-weaviate.md | Complete |
| 2. Pseudocode | pseudocode-weaviate.md | Pending |
| 3. Architecture | architecture-weaviate.md | Pending |
| 4. Refinement | refinement-weaviate.md | Pending |
| 5. Completion | completion-weaviate.md | Pending |

---

*Phase 1: Specification - Complete*
