# SPARC Phase 5: Completion - Milvus Integration

## 1. Implementation Summary

### 1.1 Overview
The Milvus integration provides a thin adapter layer enabling the LLM DevOps platform to interact with Milvus as a high-performance vector database for embeddings storage, similarity search, and large-scale RAG workflows, supporting both self-hosted clusters and Zilliz Cloud managed service.

### 1.2 Key Features
| Feature | Description |
|---------|-------------|
| Vector CRUD | Insert, upsert, delete, get operations |
| Advanced Search | Similarity search, scalar query, hybrid search, range search |
| Index Awareness | IVF, HNSW, DiskANN, AutoIndex parameter optimization |
| Collection Management | Load, release, describe, statistics |
| Partition Routing | Multi-tenant isolation via partitions |
| Consistency Control | Strong, Session, Bounded, Eventually levels |
| Hybrid Search | Multi-vector RRF and weighted fusion reranking |
| Connection Pooling | gRPC channel pool with auth interceptor |
| Simulation Layer | Record/replay for CI/CD testing |
| Observability | Per-index-type metrics, structured logging |

### 1.3 Implementation Metrics
| Metric | Value |
|--------|-------|
| Estimated Files | ~48 |
| Estimated LoC | ~4,500 |
| Public Traits | 7 |
| Error Types | 2 enums, 30+ variants |
| Test Coverage Target | >85% |

---

## 2. File Manifest

```
src/integrations/milvus/
├── mod.rs                          # Module exports and re-exports
├── lib.rs                          # Crate root with feature flags
├── client.rs                       # MilvusClient implementation
├── config.rs                       # Configuration types and builders
├── error.rs                        # Error types and conversions
│
├── types/
│   ├── mod.rs                      # Type module exports
│   ├── entity.rs                   # Entity, FieldValue, FieldData
│   ├── field.rs                    # FieldType, FieldSchema
│   ├── search.rs                   # SearchRequest, SearchResponse, SearchHits
│   ├── query.rs                    # QueryRequest, QueryResponse
│   ├── insert.rs                   # InsertRequest, InsertResponse
│   ├── delete.rs                   # DeleteRequest, DeleteResponse
│   ├── collection.rs               # CollectionInfo, CollectionSchema
│   ├── partition.rs                # PartitionInfo, PartitionStats
│   ├── consistency.rs              # ConsistencyLevel
│   └── metric.rs                   # MetricType, IndexType
│
├── operations/
│   ├── mod.rs                      # Operations module exports
│   ├── insert.rs                   # Insert/Upsert implementation
│   ├── search.rs                   # Search implementation
│   ├── query.rs                    # Query implementation
│   ├── delete.rs                   # Delete implementation
│   ├── get.rs                      # Get by PK implementation
│   └── hybrid.rs                   # Hybrid search with reranking
│
├── collection/
│   ├── mod.rs                      # Collection module exports
│   ├── manager.rs                  # CollectionManager implementation
│   ├── loader.rs                   # Load/release with wait
│   ├── cache.rs                    # Collection info cache
│   └── stats.rs                    # Statistics retrieval
│
├── partition/
│   ├── mod.rs                      # Partition module exports
│   ├── manager.rs                  # PartitionManager implementation
│   └── router.rs                   # Partition routing logic
│
├── transport/
│   ├── mod.rs                      # Transport module exports
│   ├── grpc.rs                     # gRPC client wrapper
│   ├── pool.rs                     # Connection pool
│   ├── interceptor.rs              # Auth interceptor
│   ├── retry.rs                    # Retry with backoff
│   └── tls.rs                      # TLS configuration
│
├── search/
│   ├── mod.rs                      # Search module exports
│   ├── params.rs                   # Index-specific search params
│   ├── expression.rs               # Filter expression builder
│   └── reranker.rs                 # RRF and weighted fusion
│
├── consistency/
│   ├── mod.rs                      # Consistency module exports
│   └── manager.rs                  # Timestamp management
│
├── rag/
│   ├── mod.rs                      # RAG module exports
│   └── retriever.rs                # RAGRetriever implementation
│
├── simulation/
│   ├── mod.rs                      # Simulation module exports
│   ├── layer.rs                    # SimulationLayer
│   ├── recorder.rs                 # Operation recorder
│   └── storage.rs                  # File/memory storage
│
├── validation/
│   ├── mod.rs                      # Validation module exports
│   ├── entity.rs                   # EntityValidator
│   ├── search.rs                   # SearchValidator
│   └── expression.rs               # ExpressionValidator
│
├── metrics/
│   ├── mod.rs                      # Metrics module exports
│   └── collector.rs                # MetricsCollector
│
├── proto/
│   ├── milvus.proto                # Milvus service definitions
│   ├── common.proto                # Common types
│   ├── schema.proto                # Schema definitions
│   └── generated/                  # Generated Rust code
│
└── tests/
    ├── mod.rs                      # Test utilities
    ├── unit/
    │   ├── validation_test.rs
    │   ├── expression_test.rs
    │   ├── reranker_test.rs
    │   └── params_test.rs
    ├── integration/
    │   ├── client_test.rs
    │   ├── search_test.rs
    │   ├── collection_test.rs
    │   └── partition_test.rs
    └── fixtures/
        ├── collections.json
        └── recorded_responses/
```

---

## 3. API Reference

### 3.1 Client Initialization
```rust
use milvus_integration::{MilvusClient, MilvusConfig, AuthConfig, PoolConfig};

// Basic initialization (self-hosted)
let client = MilvusClient::new(MilvusConfig {
    host: "localhost".to_string(),
    port: 19530,
    auth: AuthConfig::None,
    ..Default::default()
})?;

// With token authentication (Zilliz Cloud)
let client = MilvusClient::new(MilvusConfig {
    host: "xxx.api.zillizcloud.com".to_string(),
    port: 443,
    auth: AuthConfig::Token(SecretString::new("your-api-key".to_string())),
    tls: Some(TlsConfig::default()),
    ..Default::default()
})?;

// With user/password and custom pool
let client = MilvusClient::builder()
    .host("milvus.example.com")
    .port(19530)
    .auth_user_pass("admin", "password123")
    .pool_config(PoolConfig {
        max_connections: 20,
        min_connections: 2,
        idle_timeout: Duration::from_secs(600),
        ..Default::default()
    })
    .default_consistency(ConsistencyLevel::Session)
    .auto_load(true)
    .build()?;
```

### 3.2 Vector Operations

#### Insert
```rust
use milvus_integration::{InsertRequest, FieldData};

// Prepare data
let ids: Vec<i64> = (0..1000).collect();
let embeddings: Vec<Vec<f32>> = generate_embeddings(1000, 768);
let contents: Vec<String> = load_documents();

// Insert
let response = client.insert(InsertRequest {
    collection_name: "documents".to_string(),
    partition_name: Some("tenant_acme".to_string()),
    fields: vec![
        FieldData::int64("id", ids),
        FieldData::float_vectors("embedding", 768, embeddings),
        FieldData::strings("content", contents),
    ],
}).await?;

println!("Inserted {} entities", response.insert_count);
```

#### Upsert
```rust
use milvus_integration::UpsertRequest;

let response = client.upsert(UpsertRequest {
    collection_name: "documents".to_string(),
    partition_name: None,
    fields: vec![
        FieldData::int64("id", vec![existing_id]),
        FieldData::float_vectors("embedding", 768, vec![updated_embedding]),
        FieldData::strings("content", vec![updated_content]),
    ],
}).await?;

println!("Upserted {} entities", response.upsert_count);
```

#### Delete
```rust
use milvus_integration::DeleteRequest;

// Delete by IDs
client.delete(DeleteRequest {
    collection_name: "documents".to_string(),
    partition_name: None,
    filter: "id in [1, 2, 3, 4, 5]".to_string(),
}).await?;

// Delete by expression
client.delete(DeleteRequest {
    collection_name: "documents".to_string(),
    partition_name: Some("old_data".to_string()),
    filter: "created_at < 1704067200".to_string(),  // Before 2024
}).await?;
```

### 3.3 Search Operations

#### Basic Search
```rust
use milvus_integration::{SearchRequest, SearchParams, MetricType};

let response = client.search(SearchRequest {
    collection_name: "documents".to_string(),
    partition_names: None,
    vector_field: "embedding".to_string(),
    vectors: vec![query_embedding],
    metric_type: MetricType::Cosine,
    top_k: 10,
    params: SearchParams::for_hnsw(64),  // ef=64 for HNSW
    filter: None,
    output_fields: vec!["id".to_string(), "content".to_string(), "title".to_string()],
    consistency_level: Some(ConsistencyLevel::Session),
}).await?;

for hit in response.results[0].iter() {
    println!("ID: {}, Score: {:.4}", hit.id, hit.score);
    if let Some(fields) = hit.fields {
        println!("  Content: {:?}", fields.get("content"));
    }
}
```

#### Search with Filter
```rust
use milvus_integration::ExpressionBuilder;

// Build safe filter expression
let filter = ExpressionBuilder::new()
    .eq("category", "technology")
    .and()
    .between("score", 0.5, 1.0)
    .and()
    .r#in("status", vec!["active", "pending"])
    .build();

let response = client.search(SearchRequest {
    collection_name: "documents".to_string(),
    vector_field: "embedding".to_string(),
    vectors: vec![query_embedding],
    metric_type: MetricType::Cosine,
    top_k: 20,
    params: SearchParams::for_ivf(32),  // nprobe=32 for IVF
    filter: Some(filter),
    output_fields: vec!["id".to_string(), "title".to_string()],
    ..Default::default()
}).await?;
```

#### Hybrid Search
```rust
use milvus_integration::{HybridSearchRequest, RerankStrategy};

// Search with both dense and sparse vectors
let response = client.hybrid_search(HybridSearchRequest {
    collection_name: "documents".to_string(),
    partition_names: None,
    searches: vec![
        // Dense vector search
        SearchRequest {
            vector_field: "dense_embedding".to_string(),
            vectors: vec![dense_query],
            metric_type: MetricType::Cosine,
            top_k: 50,
            params: SearchParams::for_hnsw(128),
            ..Default::default()
        },
        // Sparse vector search (BM25-style)
        SearchRequest {
            vector_field: "sparse_embedding".to_string(),
            vectors: vec![sparse_query],
            metric_type: MetricType::IP,
            top_k: 50,
            params: SearchParams::for_ivf(16),
            ..Default::default()
        },
    ],
    rerank_strategy: RerankStrategy::RRF { k: 60 },
    final_top_k: 10,
    consistency_level: Some(ConsistencyLevel::Session),
}).await?;
```

#### Query (Scalar Filter)
```rust
use milvus_integration::QueryRequest;

let response = client.query(QueryRequest {
    collection_name: "documents".to_string(),
    partition_names: Some(vec!["tenant_acme".to_string()]),
    filter: "category == 'legal' and status == 'active'".to_string(),
    output_fields: vec!["id".to_string(), "title".to_string(), "created_at".to_string()],
    limit: Some(100),
    offset: Some(0),
    consistency_level: Some(ConsistencyLevel::Strong),
}).await?;

for entity in response.entities {
    println!("Entity: {:?}", entity.fields);
}
```

### 3.4 Collection Management
```rust
// List collections
let collections = client.list_collections().await?;
println!("Collections: {:?}", collections);

// Describe collection
let info = client.describe_collection("documents").await?;
println!("Schema: {:?}", info.schema);
println!("Entities: {}", info.num_entities);
println!("Load state: {:?}", info.load_state);

// Load collection
client.load_collection("documents", Some(2)).await?;  // 2 replicas
println!("Collection loaded");

// Check load state
let state = client.get_load_state("documents").await?;
if state == LoadState::Loaded {
    println!("Ready for queries");
}

// Release collection
client.release_collection("documents").await?;
```

### 3.5 Partition Management
```rust
// List partitions
let partitions = client.list_partitions("documents").await?;
for p in partitions {
    println!("Partition: {}, Entities: {}", p.name, p.num_entities);
}

// Load specific partitions
client.load_partitions(
    "documents",
    vec!["tenant_acme".to_string(), "tenant_beta".to_string()]
).await?;

// Release partitions
client.release_partitions(
    "documents",
    vec!["tenant_old".to_string()]
).await?;
```

### 3.6 RAG Retrieval
```rust
use milvus_integration::rag::{RAGRetriever, RetrievalQuery};

let retriever = RAGRetriever::new(client.clone())
    .with_default_collection("knowledge_base")
    .with_default_top_k(5)
    .with_min_score(0.7);

// Single query retrieval
let results = retriever.retrieve(RetrievalQuery {
    embedding: query_embedding,
    top_k: 10,
    min_score: Some(0.75),
    filter: Some("category == 'documentation'".to_string()),
    output_fields: vec!["content".to_string(), "source".to_string()],
    collection: None,
    partitions: Some(vec!["current".to_string()]),
    consistency: Some(ConsistencyLevel::Session),
}).await?;

// Build context for LLM
let context = results.iter()
    .filter_map(|r| r.content.as_ref())
    .collect::<Vec<_>>()
    .join("\n\n---\n\n");

// Multi-collection retrieval
let results = retriever.multi_retrieve(
    RetrievalQuery {
        embedding: query_embedding,
        top_k: 5,
        ..Default::default()
    },
    vec!["docs".to_string(), "faqs".to_string(), "tutorials".to_string()],
).await?;
```

### 3.7 Consistency Levels
```rust
use milvus_integration::ConsistencyLevel;

// Strong: Wait for all writes to be visible (slowest, freshest)
let response = client.search(SearchRequest {
    consistency_level: Some(ConsistencyLevel::Strong),
    ..request
}).await?;

// Session: See your own writes (recommended for most cases)
let response = client.search(SearchRequest {
    consistency_level: Some(ConsistencyLevel::Session),
    ..request
}).await?;

// Bounded: Data may be up to N seconds stale
let response = client.search(SearchRequest {
    consistency_level: Some(ConsistencyLevel::Bounded),
    ..request
}).await?;

// Eventually: No freshness guarantee (fastest)
let response = client.search(SearchRequest {
    consistency_level: Some(ConsistencyLevel::Eventually),
    ..request
}).await?;
```

### 3.8 Simulation Mode
```rust
use milvus_integration::simulation::{SimulationLayer, SimulationMode, FileStorage};

// Recording mode (capture real responses)
let client = MilvusClient::builder()
    .host("milvus.prod.example.com")
    .simulation_mode(SimulationMode::Record)
    .simulation_storage(FileStorage::new("./test_fixtures/milvus"))
    .build()?;

// Run operations - responses are recorded
client.search(request).await?;

// Replay mode (use recorded responses, no network)
let client = MilvusClient::builder()
    .host("localhost")  // Not used
    .simulation_mode(SimulationMode::Replay)
    .simulation_storage(FileStorage::new("./test_fixtures/milvus"))
    .build()?;

// Operations return recorded responses
let results = client.search(request).await?;
```

---

## 4. Usage Examples

### 4.1 Document Search Application
```rust
use milvus_integration::prelude::*;

pub struct DocumentSearchService {
    client: MilvusClient,
    embedding_model: EmbeddingModel,
    collection: String,
}

impl DocumentSearchService {
    pub async fn search(
        &self,
        query: &str,
        filters: Option<SearchFilters>,
        top_k: u32,
    ) -> Result<Vec<Document>, AppError> {
        // Generate query embedding
        let query_embedding = self.embedding_model.encode(query)?;

        // Build filter expression
        let filter = filters.map(|f| {
            let mut builder = ExpressionBuilder::new();

            if let Some(category) = f.category {
                builder = builder.eq("category", category);
            }
            if let Some(min_date) = f.min_date {
                builder = builder.and().gte("created_at", min_date.timestamp());
            }
            if let Some(authors) = f.authors {
                builder = builder.and().r#in("author_id", authors);
            }

            builder.build()
        });

        // Execute search
        let response = self.client.search(SearchRequest {
            collection_name: self.collection.clone(),
            partition_names: filters.and_then(|f| f.partitions),
            vector_field: "embedding".to_string(),
            vectors: vec![query_embedding],
            metric_type: MetricType::Cosine,
            top_k,
            params: SearchParams::for_hnsw(64),
            filter,
            output_fields: vec![
                "id".to_string(),
                "title".to_string(),
                "content".to_string(),
                "author".to_string(),
                "created_at".to_string(),
            ],
            consistency_level: Some(ConsistencyLevel::Session),
        }).await?;

        // Transform results
        let documents = response.results[0].iter()
            .map(|hit| Document::from_hit(hit))
            .collect();

        Ok(documents)
    }
}
```

### 4.2 RAG Pipeline with Hybrid Search
```rust
use milvus_integration::prelude::*;

pub async fn generate_rag_response(
    milvus: &MilvusClient,
    llm: &LLMClient,
    embedding_model: &EmbeddingModel,
    sparse_encoder: &SparseEncoder,
    user_query: &str,
) -> Result<String, AppError> {
    // 1. Generate embeddings
    let dense_embedding = embedding_model.encode(user_query)?;
    let sparse_embedding = sparse_encoder.encode(user_query)?;

    // 2. Hybrid search with RRF reranking
    let response = milvus.hybrid_search(HybridSearchRequest {
        collection_name: "knowledge_base".to_string(),
        partition_names: None,
        searches: vec![
            SearchRequest {
                vector_field: "dense_vector".to_string(),
                vectors: vec![dense_embedding],
                metric_type: MetricType::Cosine,
                top_k: 30,
                params: SearchParams::for_hnsw(128),
                output_fields: vec!["content".to_string(), "source".to_string()],
                ..Default::default()
            },
            SearchRequest {
                vector_field: "sparse_vector".to_string(),
                vectors: vec![sparse_embedding],
                metric_type: MetricType::IP,
                top_k: 30,
                params: SearchParams::for_ivf(32),
                output_fields: vec!["content".to_string(), "source".to_string()],
                ..Default::default()
            },
        ],
        rerank_strategy: RerankStrategy::RRF { k: 60 },
        final_top_k: 5,
        consistency_level: Some(ConsistencyLevel::Session),
    }).await?;

    // 3. Build context from results
    let context_parts: Vec<String> = response.results[0].iter()
        .filter_map(|hit| {
            hit.fields.and_then(|f| {
                f.get("content").and_then(|v| v.as_string())
            })
        })
        .enumerate()
        .map(|(i, content)| format!("[{}] {}", i + 1, content))
        .collect();

    let context = context_parts.join("\n\n");

    // 4. Generate response with LLM
    let prompt = format!(
        "Based on the following context, answer the question.\n\n\
        Context:\n{}\n\n\
        Question: {}\n\n\
        Answer:",
        context,
        user_query
    );

    let response = llm.generate(&prompt).await?;

    Ok(response)
}
```

### 4.3 Batch Data Ingestion
```rust
use milvus_integration::prelude::*;
use tokio::sync::Semaphore;

pub async fn ingest_documents(
    client: &MilvusClient,
    embedding_model: &EmbeddingModel,
    documents: Vec<Document>,
    batch_size: usize,
    parallelism: usize,
) -> Result<IngestStats, AppError> {
    let semaphore = Arc::new(Semaphore::new(parallelism));
    let mut stats = IngestStats::default();

    // Chunk documents
    let chunks: Vec<Vec<Document>> = documents
        .chunks(batch_size)
        .map(|c| c.to_vec())
        .collect();

    // Process chunks in parallel
    let handles: Vec<_> = chunks.into_iter().enumerate().map(|(i, chunk)| {
        let client = client.clone();
        let model = embedding_model.clone();
        let sem = semaphore.clone();

        tokio::spawn(async move {
            let _permit = sem.acquire().await?;

            // Generate embeddings
            let texts: Vec<&str> = chunk.iter().map(|d| d.content.as_str()).collect();
            let embeddings = model.encode_batch(&texts)?;

            // Prepare fields
            let ids: Vec<i64> = chunk.iter().map(|d| d.id).collect();
            let contents: Vec<String> = chunk.iter().map(|d| d.content.clone()).collect();
            let titles: Vec<String> = chunk.iter().map(|d| d.title.clone()).collect();

            // Insert
            let response = client.insert(InsertRequest {
                collection_name: "documents".to_string(),
                partition_name: None,
                fields: vec![
                    FieldData::int64("id", ids),
                    FieldData::float_vectors("embedding", 768, embeddings),
                    FieldData::strings("content", contents),
                    FieldData::strings("title", titles),
                ],
            }).await?;

            log::info!("Batch {} inserted {} entities", i, response.insert_count);

            Ok::<_, AppError>(response.insert_count)
        })
    }).collect();

    // Collect results
    for handle in handles {
        match handle.await? {
            Ok(count) => stats.inserted += count as u64,
            Err(e) => {
                log::error!("Batch failed: {}", e);
                stats.errors += 1;
            }
        }
    }

    Ok(stats)
}
```

---

## 5. Deployment Guide

### 5.1 Kubernetes Deployment
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: milvus-credentials
  namespace: llm-devops
type: Opaque
stringData:
  token: "your-milvus-token"
  # Or for user/pass:
  # username: "admin"
  # password: "your-password"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: milvus-config
  namespace: llm-devops
data:
  MILVUS_HOST: "milvus.database.svc.cluster.local"
  MILVUS_PORT: "19530"
  MILVUS_POOL_MAX_CONNECTIONS: "20"
  MILVUS_POOL_MIN_CONNECTIONS: "2"
  MILVUS_TIMEOUT_SECONDS: "30"
  MILVUS_DEFAULT_CONSISTENCY: "Session"
  MILVUS_AUTO_LOAD: "true"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: milvus-adapter
  namespace: llm-devops
spec:
  replicas: 2
  selector:
    matchLabels:
      app: milvus-adapter
  template:
    metadata:
      labels:
        app: milvus-adapter
    spec:
      containers:
      - name: adapter
        image: llm-devops/milvus-adapter:latest
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 9090
          name: grpc
        env:
        - name: MILVUS_TOKEN
          valueFrom:
            secretKeyRef:
              name: milvus-credentials
              key: token
        envFrom:
        - configMapRef:
            name: milvus-config
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: milvus-adapter
  namespace: llm-devops
spec:
  selector:
    app: milvus-adapter
  ports:
  - name: http
    port: 8080
    targetPort: 8080
  - name: grpc
    port: 9090
    targetPort: 9090
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: milvus-adapter-hpa
  namespace: llm-devops
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: milvus-adapter
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 5.2 Environment Variables
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MILVUS_HOST` | Yes | - | Milvus host address |
| `MILVUS_PORT` | No | 19530 | Milvus gRPC port |
| `MILVUS_TOKEN` | No* | - | API token (Zilliz Cloud) |
| `MILVUS_USERNAME` | No* | - | Username for auth |
| `MILVUS_PASSWORD` | No* | - | Password for auth |
| `MILVUS_TLS_ENABLED` | No | false | Enable TLS |
| `MILVUS_TLS_CA_CERT` | No | - | CA certificate path |
| `MILVUS_POOL_MAX_CONNECTIONS` | No | 10 | Max pool connections |
| `MILVUS_POOL_MIN_CONNECTIONS` | No | 1 | Min pool connections |
| `MILVUS_TIMEOUT_SECONDS` | No | 30 | Request timeout |
| `MILVUS_DEFAULT_CONSISTENCY` | No | Session | Default consistency level |
| `MILVUS_AUTO_LOAD` | No | true | Auto-load collections |
| `MILVUS_SIMULATION_MODE` | No | disabled | Simulation mode |

*At least one auth method required for secured clusters

---

## 6. Monitoring

### 6.1 Prometheus Metrics
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `milvus_inserts_total` | Counter | collection | Total insert operations |
| `milvus_searches_total` | Counter | collection, index_type | Total search operations |
| `milvus_queries_total` | Counter | collection | Total query operations |
| `milvus_entities_inserted_total` | Counter | collection | Total entities inserted |
| `milvus_errors_total` | Counter | error_type | Total errors by type |
| `milvus_retries_total` | Counter | - | Total retry attempts |
| `milvus_search_latency_seconds` | Histogram | collection, index_type | Search latency |
| `milvus_insert_latency_seconds` | Histogram | collection | Insert latency |
| `milvus_batch_size` | Histogram | operation | Batch operation sizes |
| `milvus_result_count` | Histogram | - | Search result counts |
| `milvus_pool_connections` | Gauge | - | Current pool size |
| `milvus_pool_available` | Gauge | - | Available connections |
| `milvus_collections_loaded` | Gauge | - | Loaded collection count |

### 6.2 Grafana Dashboard
```json
{
  "title": "Milvus Integration",
  "panels": [
    {
      "title": "Search Rate by Index Type",
      "type": "graph",
      "targets": [
        {"expr": "sum(rate(milvus_searches_total[5m])) by (index_type)"}
      ]
    },
    {
      "title": "Search Latency by Index (p99)",
      "type": "graph",
      "targets": [
        {"expr": "histogram_quantile(0.99, sum(rate(milvus_search_latency_seconds_bucket[5m])) by (le, index_type))"}
      ]
    },
    {
      "title": "Insert Throughput",
      "type": "graph",
      "targets": [
        {"expr": "sum(rate(milvus_entities_inserted_total[5m]))"}
      ]
    },
    {
      "title": "Error Rate",
      "type": "graph",
      "targets": [
        {"expr": "sum(rate(milvus_errors_total[5m])) by (error_type)"}
      ]
    },
    {
      "title": "Connection Pool",
      "type": "graph",
      "targets": [
        {"expr": "milvus_pool_connections"},
        {"expr": "milvus_pool_available"}
      ]
    }
  ]
}
```

---

## 7. Verification Checklist

### 7.1 Functional Requirements
| ID | Requirement | Verification |
|----|-------------|--------------|
| FR-CONN-01 | gRPC with TLS | Integration test |
| FR-CONN-02 | Token authentication | Integration test |
| FR-CONN-03 | User/password auth | Integration test |
| FR-CONN-04 | Connection pooling | Unit + Integration test |
| FR-VEC-01 | Insert entities | Integration test |
| FR-VEC-02 | Upsert entities | Integration test |
| FR-VEC-03 | Delete by expression | Integration test |
| FR-VEC-04 | Vector search | Integration test |
| FR-VEC-05 | Scalar query | Integration test |
| FR-COLL-01 | List collections | Integration test |
| FR-COLL-04 | Load collection | Integration test |
| FR-PART-02 | Partition routing | Integration test |
| FR-SEARCH-01 | Multiple metrics | Unit test |
| FR-SEARCH-02 | Boolean filters | Integration test |
| FR-SEARCH-07 | Hybrid search | Integration test |
| FR-CONS-01-04 | Consistency levels | Integration test |
| FR-SIM-01-02 | Record/replay | Unit test |
| FR-RAG-01 | Retrieval interface | Integration test |

### 7.2 Non-Functional Requirements
| Requirement | Target | Verification |
|-------------|--------|--------------|
| Search latency (p99, in-memory) | < 100ms | Performance test |
| Insert throughput | > 5000 vec/s | Performance test |
| Connection pool efficiency | > 90% | Metrics monitoring |
| Token protection | SecretString | Code review |
| TLS enforcement | TLS 1.2+ | Configuration audit |
| Auto-load success | > 99% | Integration test |
| Test coverage | > 85% | Coverage report |

---

## 8. Known Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| No schema creation | Out of scope | Use Milvus SDK or console |
| No index building | Out of scope | Use Milvus SDK or console |
| Max 10K per insert | Requires chunking | BatchChunker handles |
| Max 16K top_k | Query limit | Pagination if needed |
| gRPC only | No REST fallback | Use gRPC transport |
| Sparse vector support | Limited | Use dedicated field type |

---

## 9. Future Roadmap

| Feature | Priority | Status |
|---------|----------|--------|
| REST API fallback | Low | Backlog |
| Async streaming insert | Medium | Planned |
| Iterator-based query | Medium | Planned |
| GPU index support | Low | Backlog |
| Multi-tenancy helpers | Medium | Planned |
| Query result caching | Low | Backlog |

---

## 10. Quick Reference

### Common Operations
```rust
// Initialize
let client = MilvusClient::new(config)?;

// Insert
client.insert(InsertRequest { collection_name, fields, .. }).await?;

// Search
client.search(SearchRequest { collection_name, vectors, top_k, params, .. }).await?;

// Query
client.query(QueryRequest { collection_name, filter, output_fields, .. }).await?;

// Delete
client.delete(DeleteRequest { collection_name, filter }).await?;

// Hybrid Search
client.hybrid_search(HybridSearchRequest { searches, rerank_strategy, .. }).await?;

// Load/Release
client.load_collection(name, replicas).await?;
client.release_collection(name).await?;
```

### Search Params by Index
```rust
// HNSW (fast, high memory)
SearchParams::for_hnsw(ef)  // ef: 1-32768

// IVF (balanced)
SearchParams::for_ivf(nprobe)  // nprobe: 1-65536

// DiskANN (low memory)
SearchParams::for_diskann(search_list)  // search_list: 1-65535

// AutoIndex (auto-tuned)
SearchParams::for_autoindex(level)  // level: 1-5
```

### Expression Builder
```rust
ExpressionBuilder::new()
    .eq("field", value)       // field == value
    .ne("field", value)       // field != value
    .gt("field", num)         // field > num
    .gte("field", num)        // field >= num
    .lt("field", num)         // field < num
    .lte("field", num)        // field <= num
    .between("field", a, b)   // field >= a and field <= b
    .r#in("field", values)    // field in [...]
    .and()                    // AND connector
    .or()                     // OR connector
    .build()                  // Build expression string
```

### Error Handling
```rust
match client.search(request).await {
    Ok(response) => { /* handle success */ },
    Err(MilvusError::CollectionNotLoaded { collection }) => {
        // Auto-load triggered if configured
        log::warn!("Collection {} not loaded", collection);
    },
    Err(e) if e.is_retryable() => {
        // Automatic retry handled internally
    },
    Err(e) => {
        log::error!("Milvus error: {}", e);
    }
}
```
