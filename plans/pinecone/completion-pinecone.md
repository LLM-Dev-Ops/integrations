# SPARC Phase 5: Completion - Pinecone Integration

## 1. Implementation Summary

### 1.1 Overview
The Pinecone integration provides a thin adapter layer enabling the LLM DevOps platform to interact with Pinecone as a managed vector database for embeddings storage, similarity search, and RAG workflows.

### 1.2 Key Features
| Feature | Description |
|---------|-------------|
| Vector CRUD | Upsert, query, fetch, update, delete operations |
| Batch Processing | Parallel chunked operations with progress tracking |
| Metadata Filtering | Fluent filter builder with all comparison operators |
| Hybrid Search | Combined dense and sparse vector search |
| Namespace Isolation | Multi-tenant routing with access control |
| RAG Integration | Retrieval interface with multi-query support |
| Connection Pooling | Adaptive pool with lifecycle management |
| Simulation Layer | Record/replay for CI/CD testing |
| Observability | Metrics, structured logging, tracing |

### 1.3 Implementation Metrics
| Metric | Value |
|--------|-------|
| Estimated Files | ~42 |
| Estimated LoC | ~3,800 |
| Public Traits | 6 |
| Error Types | 3 enums, 25+ variants |
| Test Coverage Target | >85% |

---

## 2. File Manifest

```
src/integrations/pinecone/
├── mod.rs                          # Module exports and re-exports
├── lib.rs                          # Crate root with feature flags
├── client.rs                       # PineconeClient implementation
├── config.rs                       # Configuration types and builders
├── error.rs                        # Error types and conversions
│
├── types/
│   ├── mod.rs                      # Type module exports
│   ├── vector.rs                   # Vector, SparseValues, ScoredVector
│   ├── query.rs                    # QueryRequest, QueryResponse
│   ├── upsert.rs                   # UpsertRequest, UpsertResponse
│   ├── fetch.rs                    # FetchRequest, FetchResponse
│   ├── update.rs                   # UpdateRequest
│   ├── delete.rs                   # DeleteRequest
│   ├── filter.rs                   # MetadataFilter, FilterBuilder
│   ├── metadata.rs                 # MetadataValue, Metadata type alias
│   └── index.rs                    # IndexStats, NamespaceStats
│
├── operations/
│   ├── mod.rs                      # Operations module exports
│   ├── upsert.rs                   # Upsert operation implementation
│   ├── query.rs                    # Query operation implementation
│   ├── fetch.rs                    # Fetch operation implementation
│   ├── update.rs                   # Update operation implementation
│   ├── delete.rs                   # Delete operation implementation
│   └── stats.rs                    # Index stats operation
│
├── batch/
│   ├── mod.rs                      # Batch module exports
│   ├── chunker.rs                  # Vector chunking logic
│   ├── executor.rs                 # Parallel batch executor
│   └── progress.rs                 # Progress tracking
│
├── query/
│   ├── mod.rs                      # Query engine exports
│   ├── engine.rs                   # QueryEngine implementation
│   ├── hybrid.rs                   # Hybrid search implementation
│   └── merger.rs                   # Multi-query result merger
│
├── namespace/
│   ├── mod.rs                      # Namespace module exports
│   ├── router.rs                   # Namespace routing logic
│   └── access.rs                   # Access control implementation
│
├── transport/
│   ├── mod.rs                      # Transport module exports
│   ├── http.rs                     # HTTP client wrapper
│   ├── pool.rs                     # Connection pool implementation
│   ├── retry.rs                    # Retry logic with backoff
│   └── request.rs                  # Request builder
│
├── rag/
│   ├── mod.rs                      # RAG module exports
│   └── retriever.rs                # RAGRetriever implementation
│
├── simulation/
│   ├── mod.rs                      # Simulation module exports
│   ├── layer.rs                    # SimulationLayer implementation
│   ├── recorder.rs                 # Operation recorder
│   ├── replayer.rs                 # Operation replayer
│   ├── fingerprint.rs              # Fingerprint generation
│   └── storage.rs                  # Simulation storage backends
│
├── metrics/
│   ├── mod.rs                      # Metrics module exports
│   └── collector.rs                # MetricsCollector implementation
│
├── validation/
│   ├── mod.rs                      # Validation module exports
│   ├── vector.rs                   # VectorValidator
│   ├── query.rs                    # QueryValidator
│   └── namespace.rs                # NamespaceValidator
│
├── security/
│   ├── mod.rs                      # Security module exports
│   ├── credentials.rs              # SecureApiKey, CredentialProvider
│   └── sanitizer.rs                # RequestSanitizer
│
└── tests/
    ├── mod.rs                      # Test utilities
    ├── unit/
    │   ├── vector_test.rs
    │   ├── filter_test.rs
    │   ├── validation_test.rs
    │   └── serialization_test.rs
    ├── integration/
    │   ├── client_test.rs
    │   ├── batch_test.rs
    │   └── rag_test.rs
    └── fixtures/
        ├── vectors.json
        └── recorded_responses/
```

---

## 3. API Reference

### 3.1 Client Initialization
```rust
use pinecone_integration::{PineconeClient, PineconeConfig, PoolConfig};

// Basic initialization
let client = PineconeClient::new(PineconeConfig {
    api_key: SecretString::new("pk-...".to_string()),
    environment: "us-east-1-aws".to_string(),
    index_name: "my-index".to_string(),
    project_id: Some("abc123".to_string()),
    ..Default::default()
})?;

// With custom pool configuration
let client = PineconeClient::builder()
    .api_key("pk-...")
    .environment("us-east-1-aws")
    .index_name("my-index")
    .pool_config(PoolConfig {
        max_connections: 20,
        min_connections: 2,
        idle_timeout: Duration::from_secs(600),
        ..Default::default()
    })
    .timeout(Duration::from_secs(30))
    .build()?;
```

### 3.2 Vector Operations

#### Upsert
```rust
use pinecone_integration::{Vector, UpsertRequest, Metadata};

let vectors = vec![
    Vector {
        id: "doc-001".to_string(),
        values: embedding_model.encode("Hello world")?,
        sparse_values: None,
        metadata: Some(Metadata::from([
            ("category".to_string(), MetadataValue::String("greeting".into())),
            ("priority".to_string(), MetadataValue::Number(1.0)),
        ])),
    },
];

let response = client.upsert(UpsertRequest {
    namespace: Some("production".to_string()),
    vectors,
}).await?;

println!("Upserted {} vectors", response.upserted_count);
```

#### Query
```rust
use pinecone_integration::{QueryRequest, FilterBuilder, MetadataValue};

// Simple query
let results = client.query(QueryRequest {
    namespace: Some("production".to_string()),
    vector: Some(query_embedding),
    id: None,
    top_k: 10,
    filter: None,
    include_values: false,
    include_metadata: true,
    sparse_vector: None,
}).await?;

// Query with filter
let filter = FilterBuilder::new()
    .eq("category", MetadataValue::String("greeting".into()))
    .gt("priority", 0.5)
    .build();

let results = client.query(QueryRequest {
    namespace: Some("production".to_string()),
    vector: Some(query_embedding),
    id: None,
    top_k: 10,
    filter: Some(filter),
    include_values: false,
    include_metadata: true,
    sparse_vector: None,
}).await?;

for match_ in results.matches {
    println!("ID: {}, Score: {:.4}", match_.id, match_.score);
}
```

#### Fetch
```rust
use pinecone_integration::FetchRequest;

let response = client.fetch(FetchRequest {
    ids: vec!["doc-001".to_string(), "doc-002".to_string()],
    namespace: Some("production".to_string()),
}).await?;

for (id, vector) in response.vectors {
    println!("Vector {}: {} dimensions", id, vector.values.len());
}
```

#### Update
```rust
use pinecone_integration::UpdateRequest;

client.update(UpdateRequest {
    id: "doc-001".to_string(),
    namespace: Some("production".to_string()),
    values: None,  // Keep existing values
    sparse_values: None,
    set_metadata: Some(Metadata::from([
        ("updated_at".to_string(), MetadataValue::String("2024-01-15".into())),
    ])),
}).await?;
```

#### Delete
```rust
use pinecone_integration::DeleteRequest;

// Delete by IDs
client.delete(DeleteRequest {
    namespace: Some("production".to_string()),
    ids: Some(vec!["doc-001".to_string()]),
    filter: None,
    delete_all: false,
}).await?;

// Delete by filter
let filter = FilterBuilder::new()
    .eq("status", MetadataValue::String("archived".into()))
    .build();

client.delete(DeleteRequest {
    namespace: Some("production".to_string()),
    ids: None,
    filter: Some(filter),
    delete_all: false,
}).await?;

// Delete all in namespace
client.delete(DeleteRequest {
    namespace: Some("test".to_string()),
    ids: None,
    filter: None,
    delete_all: true,
}).await?;
```

### 3.3 Batch Operations
```rust
use pinecone_integration::{BatchUpsertRequest, BatchOptions};

let vectors: Vec<Vector> = load_vectors_from_file("embeddings.json")?;

let result = client.batch_upsert(BatchUpsertRequest {
    namespace: Some("production".to_string()),
    vectors,
    options: BatchOptions {
        chunk_size: 100,
        max_parallelism: 4,
        continue_on_error: true,
        progress_callback: Some(Box::new(|progress| {
            println!(
                "Progress: {}/{} chunks ({:.1}%)",
                progress.completed,
                progress.total,
                progress.percentage()
            );
        })),
    },
}).await?;

println!("Upserted {} vectors in {} chunks", result.total_upserted, result.chunk_count);
if !result.errors.is_empty() {
    eprintln!("Errors: {:?}", result.errors);
}
```

### 3.4 Hybrid Search
```rust
use pinecone_integration::{HybridQueryRequest, SparseValues};

let response = client.hybrid_query(HybridQueryRequest {
    namespace: Some("production".to_string()),
    dense_vector: dense_embedding,
    sparse_vector: SparseValues {
        indices: vec![102, 512, 1024],
        values: vec![0.8, 0.5, 0.3],
    },
    alpha: 0.7,  // 70% dense, 30% sparse
    top_k: 10,
    filter: None,
    include_metadata: true,
}).await?;
```

### 3.5 RAG Retrieval
```rust
use pinecone_integration::rag::{RAGRetriever, RetrievalQuery};

let retriever = RAGRetriever::new(client.clone())
    .with_default_namespace("production")
    .with_default_top_k(5)
    .with_min_score(0.7);

// Single query retrieval
let results = retriever.retrieve(RetrievalQuery {
    embedding: query_embedding,
    top_k: 10,
    min_score: Some(0.75),
    filter: None,
    namespace: None,
}).await?;

// Multi-query retrieval (for query expansion)
let expanded_queries = vec![
    embedding_model.encode("original query")?,
    embedding_model.encode("rephrased query")?,
    embedding_model.encode("related concept")?,
];

let results = retriever.multi_retrieve(
    expanded_queries.into_iter().map(|e| RetrievalQuery {
        embedding: e,
        top_k: 5,
        min_score: Some(0.7),
        filter: None,
        namespace: None,
    }).collect()
).await?;

// Build context for LLM
let context = results.iter()
    .filter_map(|r| r.content.as_ref())
    .collect::<Vec<_>>()
    .join("\n\n");
```

### 3.6 Namespace Management
```rust
use pinecone_integration::namespace::NamespaceRouter;

// List namespaces
let namespaces = client.list_namespaces().await?;
for ns in namespaces {
    println!("{}: {} vectors", ns.name, ns.vector_count);
}

// Clear namespace
client.clear_namespace("test").await?;

// Custom namespace routing
let router = NamespaceRouter::new()
    .with_tenant_prefix("acme-corp")
    .with_environment("prod");

let namespace = router.resolve_namespace(&OperationContext {
    tenant_id: Some("acme-corp".to_string()),
    environment: Some("prod".to_string()),
    workload: Some("rag".to_string()),
    explicit_namespace: None,
})?;
// Result: "acme-corp-prod-rag"
```

### 3.7 Index Statistics
```rust
let stats = client.describe_index_stats(None).await?;

println!("Total vectors: {}", stats.total_vector_count);
println!("Dimensions: {}", stats.dimension);
println!("Index fullness: {:.1}%", stats.index_fullness * 100.0);

for (ns_name, ns_stats) in &stats.namespaces {
    println!("  {}: {} vectors", ns_name, ns_stats.vector_count);
}
```

### 3.8 Simulation Mode
```rust
use pinecone_integration::simulation::{SimulationLayer, SimulationMode};

// Recording mode (during development)
let client = PineconeClient::builder()
    .api_key("pk-...")
    .environment("us-east-1-aws")
    .index_name("my-index")
    .simulation_mode(SimulationMode::Record)
    .simulation_storage(FileStorage::new("./test_fixtures"))
    .build()?;

// Run operations - they will be recorded
client.query(...).await?;

// Replay mode (during CI/CD)
let client = PineconeClient::builder()
    .api_key("pk-dummy")  // Not used in replay mode
    .environment("us-east-1-aws")
    .index_name("my-index")
    .simulation_mode(SimulationMode::Replay)
    .simulation_storage(FileStorage::new("./test_fixtures"))
    .build()?;

// Operations return recorded responses without network calls
let results = client.query(...).await?;
```

---

## 4. Usage Examples

### 4.1 Document Search Application
```rust
use pinecone_integration::prelude::*;

async fn search_documents(
    client: &PineconeClient,
    embedding_model: &EmbeddingModel,
    query: &str,
    filters: Option<DocumentFilters>,
) -> Result<Vec<SearchResult>, AppError> {
    // Generate query embedding
    let query_embedding = embedding_model.encode(query)?;

    // Build filter if provided
    let filter = filters.map(|f| {
        let mut builder = FilterBuilder::new();

        if let Some(category) = f.category {
            builder = builder.eq("category", MetadataValue::String(category));
        }
        if let Some(min_date) = f.min_date {
            builder = builder.gte("created_at", min_date.timestamp() as f64);
        }
        if let Some(tags) = f.tags {
            builder = builder.r#in("tags", tags.into_iter().map(MetadataValue::String).collect());
        }

        builder.build()
    });

    // Execute query
    let response = client.query(QueryRequest {
        namespace: Some("documents".to_string()),
        vector: Some(query_embedding),
        id: None,
        top_k: 20,
        filter,
        include_values: false,
        include_metadata: true,
        sparse_vector: None,
    }).await?;

    // Transform results
    let results = response.matches
        .into_iter()
        .map(|m| SearchResult {
            id: m.id,
            score: m.score,
            title: m.metadata.and_then(|m| m.get("title").cloned()),
            snippet: m.metadata.and_then(|m| m.get("snippet").cloned()),
        })
        .collect();

    Ok(results)
}
```

### 4.2 RAG Pipeline
```rust
use pinecone_integration::prelude::*;

async fn generate_rag_response(
    pinecone: &PineconeClient,
    llm: &LLMClient,
    embedding_model: &EmbeddingModel,
    user_query: &str,
) -> Result<String, AppError> {
    // 1. Generate query embedding
    let query_embedding = embedding_model.encode(user_query)?;

    // 2. Retrieve relevant context
    let retriever = RAGRetriever::new(pinecone.clone())
        .with_default_namespace("knowledge-base")
        .with_default_top_k(5)
        .with_min_score(0.7);

    let retrieved = retriever.retrieve(RetrievalQuery {
        embedding: query_embedding,
        top_k: 5,
        min_score: Some(0.7),
        filter: None,
        namespace: None,
    }).await?;

    // 3. Build context
    let context = retrieved.iter()
        .filter_map(|r| r.content.as_ref())
        .enumerate()
        .map(|(i, c)| format!("[{}] {}", i + 1, c))
        .collect::<Vec<_>>()
        .join("\n\n");

    // 4. Generate response
    let prompt = format!(
        "Context:\n{}\n\nQuestion: {}\n\nAnswer based on the context above:",
        context,
        user_query
    );

    let response = llm.generate(&prompt).await?;

    Ok(response)
}
```

### 4.3 Bulk Data Ingestion
```rust
use pinecone_integration::prelude::*;
use tokio::sync::mpsc;

async fn ingest_documents(
    client: &PineconeClient,
    embedding_model: &EmbeddingModel,
    documents: Vec<Document>,
) -> Result<IngestResult, AppError> {
    let (progress_tx, mut progress_rx) = mpsc::channel(100);

    // Spawn progress reporter
    let reporter = tokio::spawn(async move {
        while let Some(progress) = progress_rx.recv().await {
            log::info!(
                "Ingestion progress: {}/{} ({:.1}%)",
                progress.completed,
                progress.total,
                progress.percentage()
            );
        }
    });

    // Generate embeddings and build vectors
    let vectors: Vec<Vector> = documents
        .into_iter()
        .map(|doc| {
            let embedding = embedding_model.encode(&doc.content)?;
            Ok(Vector {
                id: doc.id,
                values: embedding,
                sparse_values: None,
                metadata: Some(Metadata::from([
                    ("title".to_string(), MetadataValue::String(doc.title)),
                    ("source".to_string(), MetadataValue::String(doc.source)),
                    ("created_at".to_string(), MetadataValue::Number(doc.created_at.timestamp() as f64)),
                ])),
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;

    // Batch upsert
    let result = client.batch_upsert(BatchUpsertRequest {
        namespace: Some("documents".to_string()),
        vectors,
        options: BatchOptions {
            chunk_size: 100,
            max_parallelism: 4,
            continue_on_error: true,
            progress_callback: Some(Box::new(move |p| {
                let _ = progress_tx.try_send(p);
            })),
        },
    }).await?;

    reporter.await?;

    Ok(IngestResult {
        total_upserted: result.total_upserted,
        errors: result.errors,
    })
}
```

---

## 5. Deployment Guide

### 5.1 Kubernetes Deployment
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: pinecone-credentials
  namespace: llm-devops
type: Opaque
stringData:
  api-key: "pk-your-api-key-here"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: pinecone-config
  namespace: llm-devops
data:
  PINECONE_ENVIRONMENT: "us-east-1-aws"
  PINECONE_INDEX: "llm-devops-vectors"
  PINECONE_POOL_MAX_CONNECTIONS: "20"
  PINECONE_POOL_MIN_CONNECTIONS: "2"
  PINECONE_TIMEOUT_SECONDS: "30"
  PINECONE_RETRY_MAX_ATTEMPTS: "3"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pinecone-adapter
  namespace: llm-devops
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pinecone-adapter
  template:
    metadata:
      labels:
        app: pinecone-adapter
    spec:
      containers:
      - name: adapter
        image: llm-devops/pinecone-adapter:latest
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 9090
          name: grpc
        env:
        - name: PINECONE_API_KEY
          valueFrom:
            secretKeyRef:
              name: pinecone-credentials
              key: api-key
        envFrom:
        - configMapRef:
            name: pinecone-config
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
  name: pinecone-adapter
  namespace: llm-devops
spec:
  selector:
    app: pinecone-adapter
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
  name: pinecone-adapter-hpa
  namespace: llm-devops
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: pinecone-adapter
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 5.2 Environment Variables
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PINECONE_API_KEY` | Yes | - | Pinecone API key |
| `PINECONE_ENVIRONMENT` | Yes | - | Pinecone environment |
| `PINECONE_INDEX` | Yes | - | Index name |
| `PINECONE_PROJECT_ID` | No | - | Project ID (if applicable) |
| `PINECONE_POOL_MAX_CONNECTIONS` | No | 10 | Max pool connections |
| `PINECONE_POOL_MIN_CONNECTIONS` | No | 1 | Min pool connections |
| `PINECONE_TIMEOUT_SECONDS` | No | 30 | Request timeout |
| `PINECONE_RETRY_MAX_ATTEMPTS` | No | 3 | Max retry attempts |
| `PINECONE_SIMULATION_MODE` | No | disabled | Simulation mode |

---

## 6. Monitoring

### 6.1 Prometheus Metrics
```yaml
# Prometheus scrape config
- job_name: 'pinecone-adapter'
  static_configs:
  - targets: ['pinecone-adapter:8080']
  metrics_path: /metrics
```

### 6.2 Key Metrics
| Metric | Type | Description |
|--------|------|-------------|
| `pinecone_queries_total` | Counter | Total queries executed |
| `pinecone_upserts_total` | Counter | Total upsert operations |
| `pinecone_vectors_upserted_total` | Counter | Total vectors upserted |
| `pinecone_errors_total` | Counter | Total errors by type |
| `pinecone_retries_total` | Counter | Total retry attempts |
| `pinecone_query_latency_seconds` | Histogram | Query latency distribution |
| `pinecone_upsert_latency_seconds` | Histogram | Upsert latency distribution |
| `pinecone_batch_size` | Histogram | Batch operation sizes |
| `pinecone_result_count` | Histogram | Query result counts |
| `pinecone_pool_connections` | Gauge | Current pool size |
| `pinecone_pool_available` | Gauge | Available connections |

### 6.3 Grafana Dashboard
```json
{
  "title": "Pinecone Integration",
  "panels": [
    {
      "title": "Query Rate",
      "type": "graph",
      "targets": [
        {"expr": "rate(pinecone_queries_total[5m])"}
      ]
    },
    {
      "title": "Query Latency (p99)",
      "type": "graph",
      "targets": [
        {"expr": "histogram_quantile(0.99, rate(pinecone_query_latency_seconds_bucket[5m]))"}
      ]
    },
    {
      "title": "Error Rate",
      "type": "graph",
      "targets": [
        {"expr": "rate(pinecone_errors_total[5m])"}
      ]
    },
    {
      "title": "Connection Pool",
      "type": "graph",
      "targets": [
        {"expr": "pinecone_pool_connections"},
        {"expr": "pinecone_pool_available"}
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
| FR-CONN-01 | API key authentication | Unit + Integration test |
| FR-CONN-02 | Environment endpoint resolution | Unit test |
| FR-CONN-03 | Connection pooling | Integration test |
| FR-CONN-05 | Retry with backoff | Unit test |
| FR-VEC-01 | Upsert vectors | Integration test |
| FR-VEC-02 | Query by vector | Integration test |
| FR-VEC-03 | Fetch by ID | Integration test |
| FR-VEC-04 | Update metadata | Integration test |
| FR-VEC-05 | Delete vectors | Integration test |
| FR-VEC-06 | Batch upsert | Integration test |
| FR-VEC-07 | Sparse-dense hybrid | Integration test |
| FR-NS-01 | List namespaces | Integration test |
| FR-NS-02 | Namespace routing | Unit test |
| FR-NS-04 | Namespace isolation | Integration test |
| FR-QUERY-01 | Metadata filtering | Integration test |
| FR-QUERY-05 | Similarity scores | Integration test |
| FR-SIM-01 | Record operations | Unit test |
| FR-SIM-02 | Replay operations | Unit test |
| FR-RAG-01 | Retrieval interface | Integration test |
| FR-RAG-04 | Multi-query retrieval | Integration test |

### 7.2 Non-Functional Requirements
| Requirement | Target | Verification |
|-------------|--------|--------------|
| Query latency (p99) | < 200ms | Performance test |
| Batch throughput | > 1000 vec/s | Performance test |
| Connection pool efficiency | > 90% | Metrics monitoring |
| API key protection | SecretString | Code review |
| TLS enforcement | TLS 1.2+ | Configuration audit |
| Retry success rate | > 95% | Integration test |
| Test coverage | > 85% | Coverage report |

---

## 8. Known Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| No gRPC support (v1) | REST only | Use REST API |
| Max 100 vectors per upsert | Requires chunking | Batch manager handles |
| Max 10,000 top_k | Query limit | Pagination if needed |
| No index creation | Out of scope | Use Pinecone console/API |
| 40KB metadata limit | Per-vector limit | Split large metadata |

---

## 9. Future Roadmap

| Feature | Priority | Status |
|---------|----------|--------|
| gRPC protocol support | Medium | Planned |
| Async batch streaming | Medium | Planned |
| Query result caching | Low | Backlog |
| Automatic dimension detection | Low | Backlog |
| Multi-index routing | Low | Backlog |

---

## 10. Quick Reference

### Common Operations
```rust
// Initialize
let client = PineconeClient::new(config)?;

// Upsert
client.upsert(UpsertRequest { namespace, vectors }).await?;

// Query
client.query(QueryRequest { namespace, vector, top_k, filter, .. }).await?;

// Fetch
client.fetch(FetchRequest { namespace, ids }).await?;

// Update
client.update(UpdateRequest { id, namespace, set_metadata, .. }).await?;

// Delete
client.delete(DeleteRequest { namespace, ids, filter, delete_all }).await?;

// Stats
client.describe_index_stats(filter).await?;
```

### Filter Builder
```rust
FilterBuilder::new()
    .eq("field", value)      // Equal
    .ne("field", value)      // Not equal
    .gt("field", num)        // Greater than
    .gte("field", num)       // Greater or equal
    .lt("field", num)        // Less than
    .lte("field", num)       // Less or equal
    .r#in("field", values)   // In list
    .nin("field", values)    // Not in list
    .and()                   // Combine with AND (default)
    .or()                    // Combine with OR
    .build()                 // Build filter
```

### Error Handling
```rust
match client.query(request).await {
    Ok(response) => { /* handle success */ },
    Err(PineconeError::RateLimit { retry_after, .. }) => {
        tokio::time::sleep(retry_after.unwrap_or(Duration::from_secs(1))).await;
        // retry
    },
    Err(PineconeError::Validation(e)) => {
        log::error!("Invalid request: {}", e);
    },
    Err(e) if e.is_retryable() => {
        // automatic retry handled internally
    },
    Err(e) => {
        log::error!("Pinecone error: {}", e);
    }
}
```
