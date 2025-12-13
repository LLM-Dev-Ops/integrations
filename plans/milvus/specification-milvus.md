# SPARC Phase 1: Specification - Milvus Integration

## 1. Overview

### 1.1 Purpose
Provide a thin adapter layer enabling the LLM DevOps platform to interact with Milvus as a high-performance vector database for embeddings storage, similarity search, and large-scale retrieval-augmented generation (RAG) workflows, supporting both self-hosted and managed (Zilliz Cloud) deployments.

### 1.2 Integration Type
- **Category**: Vector Database
- **Protocol**: gRPC (primary), REST API (optional)
- **Default Ports**: 19530 (gRPC), 9091 (REST)
- **Authentication**: Token-based, Username/Password, TLS

### 1.3 Scope

#### In Scope
- Vector insert, search, query, upsert, delete operations
- Collection and partition-aware operations
- Multiple index type support (IVF, HNSW, DISKANN, etc.)
- Scalar filtering with boolean expressions
- Batch operations with chunking
- Hybrid search (dense + sparse)
- Connection pooling and session management
- Simulation layer for testing/replay
- Performance and consistency tuning

#### Out of Scope
- Cluster provisioning and scaling
- Collection/index creation and schema management
- Compaction and segment management
- Resource group management
- Backup and restore operations
- Core orchestration logic (handled by platform)

---

## 2. Functional Requirements

### 2.1 Connection Management (FR-CONN)
| ID | Requirement |
|----|-------------|
| FR-CONN-01 | Support gRPC connection with TLS |
| FR-CONN-02 | Support token-based authentication |
| FR-CONN-03 | Support username/password authentication |
| FR-CONN-04 | Implement connection pooling with configurable limits |
| FR-CONN-05 | Support automatic reconnection on failure |
| FR-CONN-06 | Support both self-hosted and Zilliz Cloud endpoints |
| FR-CONN-07 | Handle load balancing across multiple proxy nodes |

### 2.2 Vector Operations (FR-VEC)
| ID | Requirement |
|----|-------------|
| FR-VEC-01 | Insert vectors with primary keys and fields |
| FR-VEC-02 | Upsert vectors (insert or update) |
| FR-VEC-03 | Delete vectors by primary key or expression |
| FR-VEC-04 | Search by vector with top-k |
| FR-VEC-05 | Query by scalar expression |
| FR-VEC-06 | Support batch insert with configurable chunk size |
| FR-VEC-07 | Support multiple vector fields per entity |
| FR-VEC-08 | Support sparse vector operations |

### 2.3 Collection Operations (FR-COLL)
| ID | Requirement |
|----|-------------|
| FR-COLL-01 | List collections |
| FR-COLL-02 | Describe collection schema |
| FR-COLL-03 | Get collection statistics |
| FR-COLL-04 | Load collection into memory |
| FR-COLL-05 | Release collection from memory |
| FR-COLL-06 | Check collection load state |

### 2.4 Partition Operations (FR-PART)
| ID | Requirement |
|----|-------------|
| FR-PART-01 | List partitions in collection |
| FR-PART-02 | Route operations to specific partition |
| FR-PART-03 | Load/release specific partitions |
| FR-PART-04 | Get partition statistics |

### 2.5 Search Features (FR-SEARCH)
| ID | Requirement |
|----|-------------|
| FR-SEARCH-01 | Support multiple distance metrics (L2, IP, COSINE) |
| FR-SEARCH-02 | Support boolean filter expressions |
| FR-SEARCH-03 | Support search parameters per index type |
| FR-SEARCH-04 | Return distance/similarity scores |
| FR-SEARCH-05 | Support output field selection |
| FR-SEARCH-06 | Support range search |
| FR-SEARCH-07 | Support hybrid search (reranking) |
| FR-SEARCH-08 | Support search with grouping |

### 2.6 Consistency Control (FR-CONS)
| ID | Requirement |
|----|-------------|
| FR-CONS-01 | Support Strong consistency level |
| FR-CONS-02 | Support Bounded consistency level |
| FR-CONS-03 | Support Session consistency level |
| FR-CONS-04 | Support Eventually consistency level |
| FR-CONS-05 | Allow per-operation consistency override |

### 2.7 Observability (FR-OBS)
| ID | Requirement |
|----|-------------|
| FR-OBS-01 | Emit metrics for all operations |
| FR-OBS-02 | Track search latency by index type |
| FR-OBS-03 | Monitor batch operation throughput |
| FR-OBS-04 | Log operations with correlation IDs |
| FR-OBS-05 | Track collection/partition access patterns |

### 2.8 Simulation Layer (FR-SIM)
| ID | Requirement |
|----|-------------|
| FR-SIM-01 | Record vector operations for replay |
| FR-SIM-02 | Replay recorded operations in test mode |
| FR-SIM-03 | Generate operation fingerprints |
| FR-SIM-04 | Support deterministic test responses |

### 2.9 RAG Integration (FR-RAG)
| ID | Requirement |
|----|-------------|
| FR-RAG-01 | Provide retrieval interface for RAG workflows |
| FR-RAG-02 | Support multi-collection retrieval |
| FR-RAG-03 | Enable re-ranking integration points |
| FR-RAG-04 | Support iterative retrieval patterns |

---

## 3. Non-Functional Requirements

### 3.1 Performance
| Metric | Target |
|--------|--------|
| Search latency (p50) | < 20ms (in-memory) |
| Search latency (p99) | < 100ms (in-memory) |
| Insert throughput | > 5000 vectors/sec |
| Connection pool efficiency | > 90% utilization |

### 3.2 Reliability
| Metric | Target |
|--------|--------|
| Availability | 99.9% (follows cluster SLA) |
| Reconnection success | > 99% within 30s |
| Graceful degradation | Required |

### 3.3 Security
| Requirement | Description |
|-------------|-------------|
| Token protection | SecretString with memory zeroing |
| TLS enforcement | TLS 1.2+ for gRPC |
| Audit logging | All operations logged |
| Partition isolation | Enforce access boundaries |

### 3.4 Scalability
| Metric | Target |
|--------|--------|
| Concurrent connections | Up to 100 per client |
| Batch size | Up to 10,000 vectors per insert |
| Vector dimensions | Up to 32,768 |
| Collections supported | Unlimited |

---

## 4. Data Models

### 4.1 Configuration
```
MilvusConfig {
    host: String
    port: u16                     // default: 19530
    auth: AuthConfig
    tls: Option<TlsConfig>
    pool_config: PoolConfig
    timeout: Duration
    retry_config: RetryConfig
    default_consistency: ConsistencyLevel
}

AuthConfig = Token(SecretString) | UserPass { username: String, password: SecretString } | None

TlsConfig {
    ca_cert: Option<PathBuf>
    client_cert: Option<PathBuf>
    client_key: Option<PathBuf>
    server_name: Option<String>
}

PoolConfig {
    max_connections: u32          // default: 10
    min_connections: u32          // default: 1
    idle_timeout: Duration        // default: 5 min
    max_lifetime: Duration        // default: 30 min
}
```

### 4.2 Entity Types
```
Entity {
    fields: Map<String, FieldValue>
}

FieldValue =
    | Int64(i64)
    | Float(f32)
    | Double(f64)
    | Bool(bool)
    | String(String)
    | VarChar(String)
    | JSON(JsonValue)
    | FloatVector(Vec<f32>)
    | BinaryVector(Vec<u8>)
    | SparseFloatVector(Map<u32, f32>)
    | Array(Vec<FieldValue>)

InsertRequest {
    collection_name: String
    partition_name: Option<String>
    fields: Vec<FieldData>
}

FieldData {
    field_name: String
    values: Vec<FieldValue>
}
```

### 4.3 Search Types
```
SearchRequest {
    collection_name: String
    partition_names: Option<Vec<String>>
    vector_field: String
    vectors: Vec<Vec<f32>>
    metric_type: MetricType
    top_k: u32
    params: SearchParams
    filter: Option<String>         // Boolean expression
    output_fields: Vec<String>
    consistency_level: Option<ConsistencyLevel>
}

MetricType = L2 | IP | COSINE | JACCARD | HAMMING

SearchParams {
    index_type: IndexType
    params: Map<String, Value>     // Index-specific params
}

IndexType = FLAT | IVF_FLAT | IVF_SQ8 | IVF_PQ | HNSW | DISKANN | AUTOINDEX

SearchResult {
    results: Vec<SearchHits>
}

SearchHits {
    ids: Vec<i64>
    distances: Vec<f32>
    fields: Vec<Map<String, FieldValue>>
}
```

### 4.4 Query Types
```
QueryRequest {
    collection_name: String
    partition_names: Option<Vec<String>>
    filter: String                 // Boolean expression
    output_fields: Vec<String>
    limit: Option<u32>
    offset: Option<u32>
    consistency_level: Option<ConsistencyLevel>
}

QueryResult {
    entities: Vec<Entity>
}
```

### 4.5 Delete Types
```
DeleteRequest {
    collection_name: String
    partition_name: Option<String>
    filter: String                 // pk in [1,2,3] or expression
}

DeleteResult {
    delete_count: i64
}
```

### 4.6 Collection Types
```
CollectionInfo {
    name: String
    description: String
    num_entities: i64
    schema: CollectionSchema
    load_state: LoadState
    created_timestamp: u64
}

CollectionSchema {
    fields: Vec<FieldSchema>
    enable_dynamic_field: bool
}

FieldSchema {
    name: String
    data_type: DataType
    is_primary: bool
    is_partition_key: bool
    max_length: Option<u32>        // for VARCHAR
    dimension: Option<u32>         // for vectors
}

LoadState = NotLoad | Loading | Loaded | LoadFailed

PartitionInfo {
    name: String
    num_entities: i64
    load_state: LoadState
}
```

### 4.7 Consistency Levels
```
ConsistencyLevel = Strong | Session | Bounded | Eventually | Customized(u64)
```

---

## 5. Index Type Parameters

### 5.1 Search Parameters by Index
| Index Type | Build Params | Search Params |
|------------|--------------|---------------|
| FLAT | - | - |
| IVF_FLAT | nlist (1-65536) | nprobe (1-nlist) |
| IVF_SQ8 | nlist | nprobe |
| IVF_PQ | nlist, m, nbits | nprobe |
| HNSW | M (4-64), efConstruction | ef (top_k-32768) |
| DISKANN | - | search_list |
| AUTOINDEX | - | level (1-5) |

### 5.2 Performance Characteristics
| Index Type | Memory | Build Speed | Search Speed | Accuracy |
|------------|--------|-------------|--------------|----------|
| FLAT | High | Fast | Slow | 100% |
| IVF_FLAT | Medium | Medium | Medium | High |
| HNSW | High | Slow | Fast | High |
| DISKANN | Low | Slow | Medium | High |
| AUTOINDEX | Auto | Auto | Auto | Auto |

---

## 6. API Operations

### 6.1 Data Operations
| Operation | gRPC Method | Description |
|-----------|-------------|-------------|
| Insert | Insert | Insert entities |
| Upsert | Upsert | Insert or update entities |
| Delete | Delete | Delete by expression |
| Search | Search | Vector similarity search |
| Query | Query | Scalar query |
| Get | Query (by PK) | Get by primary keys |

### 6.2 Collection Operations
| Operation | gRPC Method | Description |
|-----------|-------------|-------------|
| ListCollections | ShowCollections | List all collections |
| DescribeCollection | DescribeCollection | Get collection schema |
| GetStatistics | GetCollectionStatistics | Get entity count |
| LoadCollection | LoadCollection | Load to memory |
| ReleaseCollection | ReleaseCollection | Release from memory |
| GetLoadState | GetLoadState | Check load status |

### 6.3 Partition Operations
| Operation | gRPC Method | Description |
|-----------|-------------|-------------|
| ListPartitions | ShowPartitions | List partitions |
| LoadPartitions | LoadPartitions | Load specific partitions |
| ReleasePartitions | ReleasePartitions | Release partitions |
| GetPartitionStats | GetPartitionStatistics | Get partition stats |

---

## 7. Error Handling

### 7.1 Error Categories
| Category | Retry | Description |
|----------|-------|-------------|
| AuthenticationError | No | Invalid credentials |
| CollectionNotFound | No | Collection doesn't exist |
| PartitionNotFound | No | Partition doesn't exist |
| CollectionNotLoaded | Yes* | Collection not in memory |
| RateLimitError | Yes | Rate limit exceeded |
| ServerError | Yes | Internal server error |
| TimeoutError | Yes | Request timeout |
| ConnectionError | Yes | Network connectivity issues |

*Auto-load if configured

### 7.2 Retry Strategy
```
RetryConfig {
    max_retries: u32              // default: 3
    initial_backoff: Duration     // default: 100ms
    max_backoff: Duration         // default: 10s
    backoff_multiplier: f32       // default: 2.0
    retryable_codes: [Unavailable, ResourceExhausted, Internal]
}
```

---

## 8. Security Considerations

### 8.1 Authentication
- Token stored as SecretString
- Password stored as SecretString
- Credential rotation support via provider
- No credentials in logs or errors

### 8.2 Transport Security
- TLS 1.2+ for all gRPC connections
- Certificate validation (configurable)
- mTLS support for self-hosted

### 8.3 Data Access
- Collection-level access awareness
- Partition isolation for multi-tenancy
- Audit logging for all operations

---

## 9. Integration Points

### 9.1 Platform Services
| Service | Integration |
|---------|-------------|
| Authentication | Credential provider for tokens |
| Logging | Structured logs with correlation |
| Metrics | Prometheus-compatible metrics |
| Vector Memory | Abstraction layer compatibility |

### 9.2 RAG Pipeline
```
EmbeddingService -> MilvusAdapter -> SearchResult -> Reranker -> Context
```

### 9.3 Deployment Modes
| Mode | Endpoint Format | Notes |
|------|-----------------|-------|
| Self-hosted | host:19530 | Direct gRPC |
| Zilliz Cloud | https://xxx.zillizcloud.com | Managed service |
| Milvus Lite | localhost:19530 | Local development |

---

## 10. Acceptance Criteria

### 10.1 Functional
- [ ] All CRUD operations work correctly
- [ ] Multiple index types supported
- [ ] Boolean filtering returns accurate results
- [ ] Batch operations handle chunking properly
- [ ] Partition routing works correctly
- [ ] Consistency levels respected
- [ ] Simulation mode records and replays

### 10.2 Non-Functional
- [ ] Search latency meets p99 target
- [ ] Retry logic handles transient failures
- [ ] Connection pool scales appropriately
- [ ] Memory usage bounded for large batches

---

## 11. Dependencies

### 11.1 External
- Milvus SDK (gRPC proto definitions)
- tonic (gRPC client)
- tokio (async runtime)

### 11.2 Internal
- `llm-devops-core`: Shared primitives
- `llm-devops-auth`: Credential management
- `llm-devops-metrics`: Observability
- `llm-devops-vector`: Vector memory abstraction

---

## 12. Glossary

| Term | Definition |
|------|------------|
| Collection | Logical grouping of entities (like a table) |
| Partition | Subdivision of collection for data isolation |
| Entity | Single record with fields and vectors |
| Segment | Physical storage unit within partition |
| Index | Data structure for efficient vector search |
| nprobe | Number of clusters to search in IVF indexes |
| ef | Search expansion factor for HNSW |
| Consistency Level | Trade-off between freshness and performance |
