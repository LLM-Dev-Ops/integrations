# Google Firestore Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google/firestore`

---

## 1. Final Implementation Structure

```
integrations/google/firestore/
├── mod.rs                          # Public API exports
├── client.rs                       # FirestoreClient implementation
├── config.rs                       # Configuration types
├── error.rs                        # Error types and mapping
│
├── types/
│   ├── mod.rs                      # Type exports
│   ├── document.rs                 # Document, DocumentRef, DocumentSnapshot
│   ├── collection.rs               # CollectionRef, CollectionPath, CollectionGroup
│   ├── field_value.rs              # FieldValue (17 variants), FieldTransform
│   ├── query.rs                    # Query, Filter, FilterOp, OrderBy, Cursor
│   ├── aggregation.rs              # Aggregation, AggregationResult
│   ├── batch.rs                    # WriteBatch, Write, Precondition
│   ├── transaction.rs              # Transaction, TransactionOptions
│   └── listener.rs                 # ListenerRegistration, ChangeType, QuerySnapshot
│
├── services/
│   ├── mod.rs                      # Service exports
│   ├── document.rs                 # DocumentService (6 operations)
│   ├── collection.rs               # CollectionService (4 operations)
│   ├── query.rs                    # QueryService (5 operations)
│   ├── batch.rs                    # BatchService (5 operations)
│   ├── transaction.rs              # TransactionService (6 operations)
│   ├── listener.rs                 # ListenerService (4 operations)
│   └── field_transform.rs          # FieldTransformService (5 operations)
│
├── transport/
│   ├── mod.rs                      # Transport exports
│   ├── channel.rs                  # gRPC channel management
│   ├── proto_convert.rs            # Protobuf conversions
│   └── error_mapper.rs             # gRPC to domain error mapping
│
├── query/
│   ├── mod.rs                      # Query exports
│   ├── builder.rs                  # QueryBuilder fluent API
│   ├── filter.rs                   # Filter construction
│   ├── cursor.rs                   # Pagination cursors
│   └── aggregation.rs              # Aggregation query building
│
├── listener/
│   ├── mod.rs                      # Listener exports
│   ├── manager.rs                  # ListenerManager
│   ├── stream.rs                   # Listener stream handling
│   ├── reconnect.rs                # Reconnection logic
│   └── snapshot.rs                 # Snapshot accumulation
│
├── validation/
│   ├── mod.rs                      # Validation exports
│   ├── document_path.rs            # Document path validation
│   ├── field_path.rs               # Field path validation
│   ├── document_id.rs              # Document ID validation
│   └── size_limits.rs              # Size limit enforcement
│
├── simulation/
│   ├── mod.rs                      # Simulation exports
│   ├── mock_client.rs              # MockFirestoreClient
│   ├── mock_store.rs               # In-memory document store
│   ├── mock_query.rs               # Query evaluation engine
│   ├── mock_listener.rs            # Listener simulation
│   ├── recorder.rs                 # Operation recording
│   └── replay.rs                   # Replay engine
│
└── tests/
    ├── unit/
    │   ├── document_test.rs        # Document operation tests
    │   ├── query_test.rs           # Query building tests
    │   ├── filter_test.rs          # Filter construction tests
    │   ├── transaction_test.rs     # Transaction tests
    │   ├── validation_test.rs      # Validation tests
    │   └── listener_test.rs        # Listener tests
    ├── integration/
    │   ├── crud_test.rs            # CRUD operations
    │   ├── batch_test.rs           # Batch operations
    │   ├── transaction_test.rs     # Transaction workflows
    │   ├── query_test.rs           # Query execution
    │   └── realtime_test.rs        # Real-time listener tests
    └── fixtures/
        ├── documents/              # Test documents
        ├── queries/                # Test queries
        └── recordings/             # Replay recordings
```

---

## 2. Implementation Components

### 2.1 Core Components (10)

| Component | File | Description |
|-----------|------|-------------|
| `FirestoreClient` | `client.rs` | Main client with gRPC channel |
| `FirestoreConfig` | `config.rs` | Project/database configuration |
| `AuthConfig` | `config.rs` | Authentication options |
| `FirestoreError` | `error.rs` | Domain error types |
| `ErrorMapper` | `transport/error_mapper.rs` | gRPC to domain mapping |
| `GrpcChannel` | `transport/channel.rs` | gRPC connection management |
| `ProtoConverter` | `transport/proto_convert.rs` | Type conversions |
| `ListenerManager` | `listener/manager.rs` | Listener lifecycle |
| `QueryBuilder` | `query/builder.rs` | Fluent query API |
| `DocumentValidator` | `validation/document_path.rs` | Path validation |

### 2.2 Type Components (20)

| Component | File | Description |
|-----------|------|-------------|
| `DocumentPath` | `types/document.rs` | Document path representation |
| `DocumentRef` | `types/document.rs` | Document reference |
| `Document` | `types/document.rs` | Document with fields |
| `DocumentSnapshot` | `types/document.rs` | Document read result |
| `CollectionRef` | `types/collection.rs` | Collection reference |
| `CollectionGroup` | `types/collection.rs` | Collection group query |
| `FieldValue` | `types/field_value.rs` | 17 value type variants |
| `FieldTransform` | `types/field_value.rs` | Transform operations |
| `Query` | `types/query.rs` | Query definition |
| `Filter` | `types/query.rs` | Query filter |
| `FilterOp` | `types/query.rs` | Filter operators |
| `CompositeFilter` | `types/query.rs` | AND/OR filters |
| `OrderBy` | `types/query.rs` | Sort specification |
| `Cursor` | `types/query.rs` | Pagination cursor |
| `Aggregation` | `types/aggregation.rs` | Count/Sum/Avg |
| `WriteBatch` | `types/batch.rs` | Batch write container |
| `Write` | `types/batch.rs` | Individual write operation |
| `Transaction` | `types/transaction.rs` | Transaction context |
| `ListenerRegistration` | `types/listener.rs` | Listener handle |
| `QuerySnapshot` | `types/listener.rs` | Query result snapshot |

### 2.3 Service Components (7)

| Component | File | Operations |
|-----------|------|------------|
| `DocumentService` | `services/document.rs` | get, create, set, update, delete, exists |
| `CollectionService` | `services/collection.rs` | list_documents, list_collections, add, collection_group |
| `QueryService` | `services/query.rs` | execute, stream, aggregate, paginate, explain |
| `BatchService` | `services/batch.rs` | create, set, update, delete, commit |
| `TransactionService` | `services/transaction.rs` | run, run_readonly, get_in_tx, set_in_tx, update_in_tx, delete_in_tx |
| `ListenerService` | `services/listener.rs` | listen_document, listen_collection, listen_query, unsubscribe |
| `FieldTransformService` | `services/field_transform.rs` | increment, array_union, array_remove, server_timestamp, delete_field |

### 2.4 Validation Components (4)

| Component | File | Description |
|-----------|------|-------------|
| `DocumentPathValidator` | `validation/document_path.rs` | Path format validation |
| `FieldPathValidator` | `validation/field_path.rs` | Field path validation |
| `DocumentIdValidator` | `validation/document_id.rs` | ID format validation |
| `SizeLimitValidator` | `validation/size_limits.rs` | Size limit checks |

### 2.5 Simulation Components (6)

| Component | File | Description |
|-----------|------|-------------|
| `MockFirestoreClient` | `simulation/mock_client.rs` | Mock client |
| `MockDocumentStore` | `simulation/mock_store.rs` | In-memory store |
| `MockQueryEngine` | `simulation/mock_query.rs` | Query evaluation |
| `MockListenerManager` | `simulation/mock_listener.rs` | Listener simulation |
| `OperationRecorder` | `simulation/recorder.rs` | Operation recording |
| `ReplayEngine` | `simulation/replay.rs` | Replay playback |

---

## 3. Public API

### 3.1 Client Interface

```rust
// Client creation
pub fn create_firestore_client(config: FirestoreConfig) -> Result<FirestoreClient, FirestoreError>;

// Document operations
pub async fn get_document(
    client: &FirestoreClient,
    path: &str,
) -> Result<DocumentSnapshot, FirestoreError>;

pub async fn create_document(
    client: &FirestoreClient,
    path: &str,
    data: HashMap<String, FieldValue>,
) -> Result<WriteResult, FirestoreError>;

pub async fn set_document(
    client: &FirestoreClient,
    path: &str,
    data: HashMap<String, FieldValue>,
    options: SetOptions,
) -> Result<WriteResult, FirestoreError>;

pub async fn update_document(
    client: &FirestoreClient,
    path: &str,
    updates: HashMap<String, FieldValue>,
) -> Result<WriteResult, FirestoreError>;

pub async fn delete_document(
    client: &FirestoreClient,
    path: &str,
) -> Result<WriteResult, FirestoreError>;

// Collection operations
pub async fn add_document(
    client: &FirestoreClient,
    collection: &str,
    data: HashMap<String, FieldValue>,
) -> Result<DocumentRef, FirestoreError>;

pub fn list_documents(
    client: &FirestoreClient,
    collection: &str,
    options: ListOptions,
) -> DocumentIterator;

pub fn collection_group(
    client: &FirestoreClient,
    collection_id: &str,
) -> QueryBuilder;

// Query operations
pub fn collection(client: &FirestoreClient, path: &str) -> QueryBuilder;

impl QueryBuilder {
    pub fn where_(self, field: &str, op: FilterOp, value: FieldValue) -> Self;
    pub fn where_in(self, field: &str, values: Vec<FieldValue>) -> Self;
    pub fn where_array_contains(self, field: &str, value: FieldValue) -> Self;
    pub fn order_by(self, field: &str, direction: Direction) -> Self;
    pub fn limit(self, count: u32) -> Self;
    pub fn offset(self, count: u32) -> Self;
    pub fn start_at(self, values: Vec<FieldValue>) -> Self;
    pub fn start_after(self, values: Vec<FieldValue>) -> Self;
    pub fn end_at(self, values: Vec<FieldValue>) -> Self;
    pub fn end_before(self, values: Vec<FieldValue>) -> Self;
    pub fn select(self, fields: Vec<&str>) -> Self;
    pub async fn get(self) -> Result<QueryResult, FirestoreError>;
    pub fn stream(self) -> DocumentStream;
    pub async fn count(self) -> Result<i64, FirestoreError>;
    pub async fn aggregate(self, aggregations: Vec<Aggregation>) -> Result<AggregationResult, FirestoreError>;
}

// Batch operations
pub fn batch(client: &FirestoreClient) -> WriteBatch;

impl WriteBatch {
    pub fn set(self, path: &str, data: HashMap<String, FieldValue>) -> Self;
    pub fn update(self, path: &str, updates: HashMap<String, FieldValue>) -> Self;
    pub fn delete(self, path: &str) -> Self;
    pub async fn commit(self) -> Result<Vec<WriteResult>, FirestoreError>;
}

// Transaction operations
pub async fn run_transaction<T, F>(
    client: &FirestoreClient,
    f: F,
    options: TransactionOptions,
) -> Result<T, FirestoreError>
where
    F: FnOnce(&Transaction) -> Future<Output = Result<T, FirestoreError>>;

impl Transaction {
    pub async fn get(&self, path: &str) -> Result<DocumentSnapshot, FirestoreError>;
    pub fn set(&self, path: &str, data: HashMap<String, FieldValue>);
    pub fn update(&self, path: &str, updates: HashMap<String, FieldValue>);
    pub fn delete(&self, path: &str);
}

// Listener operations
pub fn listen_document<F>(
    client: &FirestoreClient,
    path: &str,
    callback: F,
) -> ListenerRegistration
where
    F: Fn(DocumentSnapshot, Option<FirestoreError>) + Send + 'static;

pub fn listen_query<F>(
    client: &FirestoreClient,
    query: QueryBuilder,
    callback: F,
) -> ListenerRegistration
where
    F: Fn(QuerySnapshot, Option<FirestoreError>) + Send + 'static;

impl ListenerRegistration {
    pub fn unsubscribe(self);
}

// Field transforms
pub async fn increment_field(
    client: &FirestoreClient,
    path: &str,
    field: &str,
    value: i64,
) -> Result<WriteResult, FirestoreError>;

pub async fn array_union(
    client: &FirestoreClient,
    path: &str,
    field: &str,
    elements: Vec<FieldValue>,
) -> Result<WriteResult, FirestoreError>;

pub async fn server_timestamp(
    client: &FirestoreClient,
    path: &str,
    field: &str,
) -> Result<WriteResult, FirestoreError>;
```

### 3.2 Configuration API

```rust
pub fn config_builder() -> FirestoreConfigBuilder;

impl FirestoreConfigBuilder {
    // Required
    pub fn project_id(self, project_id: &str) -> Self;

    // Optional
    pub fn database_id(self, database_id: &str) -> Self; // Default: "(default)"
    pub fn auth_default(self) -> Self;
    pub fn auth_service_account(self, key_file: &str) -> Self;
    pub fn auth_emulator(self) -> Self;
    pub fn endpoint(self, endpoint: &str) -> Self;
    pub fn max_retries(self, retries: u32) -> Self;
    pub fn request_timeout_ms(self, timeout: u64) -> Self;
    pub fn max_batch_size(self, size: u32) -> Self;
    pub fn max_transaction_attempts(self, attempts: u32) -> Self;
    pub fn max_listeners(self, count: u32) -> Self;
    pub fn build(self) -> Result<FirestoreConfig, ConfigError>;
}
```

### 3.3 Simulation API

```rust
pub fn create_mock_client() -> MockFirestoreClient;

impl MockFirestoreClient {
    // Document setup
    pub fn with_document(self, path: &str, data: HashMap<String, FieldValue>) -> Self;
    pub fn with_collection(self, path: &str, docs: Vec<MockDocument>) -> Self;

    // Behavior configuration
    pub fn with_error(self, path_pattern: &str, error: FirestoreError) -> Self;
    pub fn with_latency(self, min_ms: u64, max_ms: u64) -> Self;
    pub fn with_transaction_behavior(self, behaviors: Vec<TransactionBehavior>) -> Self;

    // Listener simulation
    pub fn emit_document_change(self, path: &str, change: DocumentChange);
    pub fn emit_listener_error(self, listener_id: &str, error: FirestoreError);

    // Inspection
    pub fn get_document(&self, path: &str) -> Option<Document>;
    pub fn get_operation_history(&self) -> Vec<RecordedOperation>;
    pub fn get_metrics(&self) -> MockMetrics;
    pub fn reset(&mut self);
}

// Recording and replay
pub fn create_recorder(output_file: &str) -> OperationRecorder;
pub fn wrap_for_recording(
    client: FirestoreClient,
    recorder: &OperationRecorder,
) -> RecordingClient;

pub fn create_replay_client(recording_file: &str) -> Result<ReplayClient, ReplayError>;
```

---

## 4. Integration Points

### 4.1 Shared Module Dependencies

```rust
// gcp/auth integration
use gcp_auth::{get_credentials, get_access_token, Credentials, AuthConfig};

// shared/resilience integration
use shared_resilience::{
    RetryPolicy, CircuitBreaker,
    with_retry, with_circuit_breaker
};

// shared/observability integration
use shared_observability::{
    emit_metric, start_span, log_structured,
    Metric, Span, LogLevel
};

// shared/vector-memory integration
use shared_vector_memory::{
    store_embedding, search_similar,
    EmbeddingStore, SearchQuery
};
```

### 4.2 Platform Integration

```rust
// State management pattern
impl FirestoreClient {
    pub fn state_store(&self, collection: &str) -> StateStore {
        StateStore::new(self.clone(), collection)
    }
}

impl StateStore {
    pub async fn get<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, FirestoreError>;
    pub async fn set<T: Serialize>(&self, key: &str, value: &T) -> Result<(), FirestoreError>;
    pub async fn delete(&self, key: &str) -> Result<(), FirestoreError>;
    pub fn watch<T: DeserializeOwned>(&self, key: &str) -> StateWatcher<T>;
}

// Event recording pattern
impl FirestoreClient {
    pub fn event_log(&self, collection: &str) -> EventLog {
        EventLog::new(self.clone(), collection)
    }
}

impl EventLog {
    pub async fn append(&self, event: Event) -> Result<DocumentRef, FirestoreError>;
    pub fn query_events(&self) -> QueryBuilder;
    pub fn subscribe(&self) -> EventStream;
}
```

---

## 5. Usage Examples

### 5.1 Basic Document Operations

```rust
use integrations::google::firestore::{
    create_firestore_client, config_builder,
    get_document, set_document, update_document,
    FieldValue, SetOptions,
};

async fn basic_operations() -> Result<(), FirestoreError> {
    // Create client
    let config = config_builder()
        .project_id("my-project")
        .auth_default()
        .build()?;

    let client = create_firestore_client(config)?;

    // Create a document
    let user_data = hashmap! {
        "name" => FieldValue::String("Alice".into()),
        "email" => FieldValue::String("alice@example.com".into()),
        "age" => FieldValue::Integer(30),
        "created_at" => FieldValue::ServerTimestamp,
    };

    set_document(&client, "users/alice", user_data, SetOptions::default()).await?;

    // Read a document
    let snapshot = get_document(&client, "users/alice").await?;

    if snapshot.exists {
        let name: String = snapshot.get("name")?;
        println!("User name: {}", name);
    }

    // Update specific fields
    let updates = hashmap! {
        "last_login" => FieldValue::ServerTimestamp,
        "login_count" => FieldValue::Increment(1),
    };

    update_document(&client, "users/alice", updates).await?;

    Ok(())
}
```

### 5.2 Query Operations

```rust
use integrations::google::firestore::{
    create_firestore_client, collection,
    FilterOp, Direction, Aggregation,
};

async fn query_examples(client: &FirestoreClient) -> Result<(), FirestoreError> {
    // Simple query with filter
    let active_users = collection(client, "users")
        .where_("status", FilterOp::Equal, FieldValue::String("active".into()))
        .order_by("created_at", Direction::Descending)
        .limit(10)
        .get()
        .await?;

    for doc in active_users.documents {
        println!("User: {}", doc.id);
    }

    // Complex query with multiple filters
    let query = collection(client, "orders")
        .where_("status", FilterOp::Equal, FieldValue::String("pending".into()))
        .where_("total", FilterOp::GreaterThan, FieldValue::Double(100.0))
        .where_in("region", vec![
            FieldValue::String("US".into()),
            FieldValue::String("EU".into()),
        ])
        .order_by("created_at", Direction::Descending)
        .limit(50)
        .get()
        .await?;

    // Aggregation query
    let stats = collection(client, "orders")
        .where_("status", FilterOp::Equal, FieldValue::String("completed".into()))
        .aggregate(vec![
            Aggregation::Count,
            Aggregation::Sum { field: "total".into() },
            Aggregation::Average { field: "total".into() },
        ])
        .await?;

    println!("Order count: {:?}", stats.get("count"));
    println!("Total revenue: {:?}", stats.get("sum_total"));

    // Collection group query
    let all_comments = collection_group(client, "comments")
        .where_("author", FilterOp::Equal, FieldValue::String("alice".into()))
        .order_by("created_at", Direction::Descending)
        .limit(100)
        .get()
        .await?;

    Ok(())
}
```

### 5.3 Transaction Operations

```rust
use integrations::google::firestore::{
    run_transaction, TransactionOptions, FieldValue,
};

async fn transfer_credits(
    client: &FirestoreClient,
    from_user: &str,
    to_user: &str,
    amount: i64,
) -> Result<(), FirestoreError> {
    let options = TransactionOptions {
        max_attempts: Some(5),
        read_only: false,
    };

    run_transaction(client, |tx| async move {
        // Read both documents
        let from_doc = tx.get(&format!("users/{}", from_user)).await?;
        let to_doc = tx.get(&format!("users/{}", to_user)).await?;

        if !from_doc.exists || !to_doc.exists {
            return Err(FirestoreError::NotFound("User not found".into()));
        }

        let from_credits: i64 = from_doc.get("credits")?;

        if from_credits < amount {
            return Err(FirestoreError::FailedPrecondition(
                "Insufficient credits".into()
            ));
        }

        // Update both documents
        tx.update(&format!("users/{}", from_user), hashmap! {
            "credits" => FieldValue::Increment(-amount),
        });

        tx.update(&format!("users/{}", to_user), hashmap! {
            "credits" => FieldValue::Increment(amount),
        });

        Ok(())
    }, options).await
}
```

### 5.4 Batch Operations

```rust
use integrations::google::firestore::{batch, FieldValue};

async fn batch_import(
    client: &FirestoreClient,
    products: Vec<Product>,
) -> Result<(), FirestoreError> {
    // Process in chunks of 500
    for chunk in products.chunks(500) {
        let mut batch = batch(client);

        for product in chunk {
            let data = hashmap! {
                "name" => FieldValue::String(product.name.clone()),
                "price" => FieldValue::Double(product.price),
                "category" => FieldValue::String(product.category.clone()),
                "updated_at" => FieldValue::ServerTimestamp,
            };

            batch = batch.set(&format!("products/{}", product.id), data);
        }

        batch.commit().await?;
    }

    Ok(())
}
```

### 5.5 Real-Time Listeners

```rust
use integrations::google::firestore::{
    listen_document, listen_query, collection, FilterOp,
};

fn setup_listeners(client: &FirestoreClient) {
    // Listen to a single document
    let user_listener = listen_document(client, "users/alice", |snapshot, error| {
        if let Some(err) = error {
            eprintln!("Listener error: {:?}", err);
            return;
        }

        if snapshot.exists {
            println!("User updated: {:?}", snapshot.data);
        } else {
            println!("User deleted");
        }
    });

    // Listen to a query
    let query = collection(client, "messages")
        .where_("room_id", FilterOp::Equal, FieldValue::String("room1".into()))
        .order_by("timestamp", Direction::Ascending)
        .limit(100);

    let message_listener = listen_query(client, query, |snapshot, error| {
        if let Some(err) = error {
            eprintln!("Query listener error: {:?}", err);
            return;
        }

        for change in snapshot.changes {
            match change.change_type {
                ChangeType::Added => println!("New message: {:?}", change.document.id),
                ChangeType::Modified => println!("Message updated: {:?}", change.document.id),
                ChangeType::Removed => println!("Message removed: {:?}", change.document.id),
            }
        }
    });

    // Later: unsubscribe
    // user_listener.unsubscribe();
    // message_listener.unsubscribe();
}
```

### 5.6 Testing with Mock Client

```rust
use integrations::google::firestore::simulation::{
    create_mock_client, MockDocument, TransactionBehavior,
};

#[tokio::test]
async fn test_user_service() {
    let mock = create_mock_client()
        .with_document("users/alice", hashmap! {
            "name" => FieldValue::String("Alice".into()),
            "credits" => FieldValue::Integer(100),
        })
        .with_document("users/bob", hashmap! {
            "name" => FieldValue::String("Bob".into()),
            "credits" => FieldValue::Integer(50),
        });

    // Test get document
    let snapshot = get_document(&mock, "users/alice").await.unwrap();
    assert!(snapshot.exists);
    assert_eq!(snapshot.get::<String>("name").unwrap(), "Alice");

    // Verify operations
    let history = mock.get_operation_history();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].operation, "get");
}

#[tokio::test]
async fn test_transaction_with_contention() {
    let mock = create_mock_client()
        .with_document("users/alice", hashmap! {
            "credits" => FieldValue::Integer(100),
        })
        .with_transaction_behavior(vec![
            TransactionBehavior::Abort,
            TransactionBehavior::Abort,
            TransactionBehavior::Commit,
        ]);

    let result = run_transaction(&mock, |tx| async move {
        let doc = tx.get("users/alice").await?;
        tx.update("users/alice", hashmap! {
            "credits" => FieldValue::Increment(10),
        });
        Ok(())
    }, TransactionOptions::default()).await;

    assert!(result.is_ok());
    assert_eq!(mock.get_metrics().transaction_attempts, 3);
}
```

---

## 6. Deployment Checklist

### 6.1 Configuration Requirements

| Requirement | Description | Default |
|-------------|-------------|---------|
| Project ID | GCP project identifier | Required |
| Database ID | Firestore database | "(default)" |
| Credentials | GCP authentication | Default credentials |
| Request Timeout | API request timeout | 60s |
| Max Retries | Retry attempts | 3 |
| Max Batch Size | Operations per batch | 500 |
| Max Transaction Attempts | Contention retries | 5 |
| Max Listeners | Concurrent listeners | 100 |

### 6.2 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | Yes* |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account key path | No |
| `FIRESTORE_EMULATOR_HOST` | Emulator endpoint | No |
| `FIRESTORE_DATABASE_ID` | Database ID override | No |

*Required if not specified in config

### 6.3 IAM Permissions

```
Required Roles:
- roles/datastore.user (basic read/write)
- roles/datastore.viewer (read-only access)

Or Custom Role with Permissions:
- datastore.entities.create
- datastore.entities.delete
- datastore.entities.get
- datastore.entities.list
- datastore.entities.update
- datastore.indexes.list (for query explain)
```

### 6.4 Observability Setup

```yaml
# Metrics to monitor
metrics:
  - firestore.reads
  - firestore.writes
  - firestore.queries
  - firestore.query.documents
  - firestore.transactions
  - firestore.transaction.duration_ms
  - firestore.batch.size
  - firestore.listeners.active
  - firestore.errors
  - firestore.circuit_breaker.state

# Alerts to configure
alerts:
  - name: Firestore High Error Rate
    condition: rate(firestore.errors[5m]) > 10
    duration: 5m

  - name: Firestore Transaction Contention
    condition: rate(firestore.transaction.contention[5m]) > 5
    duration: 5m

  - name: Firestore Circuit Breaker Open
    condition: firestore.circuit_breaker.state == 1
    duration: 0m

  - name: Firestore Listener Disconnects
    condition: rate(firestore.listener.disconnect[5m]) > 10
    duration: 5m

# Log queries
logs:
  - name: Firestore Errors
    query: module="firestore" level="error"

  - name: Transaction Aborts
    query: module="firestore" event_type="TRANSACTION_ABORT"

  - name: Query Performance Warnings
    query: module="firestore" message=~"performance"
```

---

## 7. Validation Criteria

### 7.1 Functional Requirements

| Requirement | Validation Method |
|-------------|-------------------|
| Document CRUD | Integration tests with emulator |
| Query filters | Unit + integration tests |
| Composite queries | Integration tests |
| Batch operations | 500 operation batch test |
| Transactions | Contention simulation tests |
| Real-time listeners | Event simulation tests |
| Field transforms | Unit tests |
| Collection groups | Integration tests |

### 7.2 Non-Functional Requirements

| Requirement | Target | Validation |
|-------------|--------|------------|
| Read latency P99 | < 100ms | Load test |
| Write latency P99 | < 200ms | Load test |
| Query latency P99 | < 500ms | Load test |
| Transaction success | > 95% | Contention test |
| Listener reconnect | < 5s | Fault injection |
| Memory per listener | < 1MB | Profiling |

### 7.3 Security Requirements

| Requirement | Validation |
|-------------|------------|
| Credential protection | Code review |
| Path validation | Unit + fuzz tests |
| No data logging | Log audit |
| Emulator blocked in prod | Config validation |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-firestore.md | Complete |
| 2. Pseudocode | pseudocode-firestore.md | Complete |
| 3. Architecture | architecture-firestore.md | Complete |
| 4. Refinement | refinement-firestore.md | Complete |
| 5. Completion | completion-firestore.md | Complete |

---

## Implementation Summary

The Google Firestore integration module provides a thin adapter layer with:

- **7 service components** covering 35 operations
- **20 type definitions** for Firestore domain objects
- **10 core components** for client and transport
- **6 simulation components** for testing
- **Real-time listener support** with automatic reconnection
- **Transaction support** with contention handling
- **Batch operations** up to 500 per commit
- **Query builder** with fluent API
- **Field transforms** for atomic updates
- **Comprehensive validation** for paths and limits

The module delegates to shared platform components for authentication, resilience, observability, and vector memory, maintaining the thin adapter principle throughout.

---

*Phase 5: Completion - Complete*
*SPARC Documentation Complete*
