# Google Firestore Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google/firestore`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to interact with Google Cloud Firestore as a managed document-oriented data store for application state, metadata storage, event records, and configuration data, supporting both Native and Datastore modes.

### 1.2 Scope

**In Scope:**
- Document CRUD operations (create, read, update, delete)
- Collection and subcollection traversal
- Query building with filters, ordering, and pagination
- Batch operations (up to 500 documents)
- Transaction support (read-write and read-only)
- Real-time listeners and snapshot streaming
- Field-level operations (increment, array union/remove, server timestamp)
- Document reference handling
- Consistency model awareness (strong vs eventual)
- Collection group queries
- Simulation and replay

**Out of Scope:**
- Project provisioning and configuration
- Index creation and management
- Security rules authoring
- Backup and restore operations
- Firestore emulator management
- Data migration tools
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| GCP credential management | `gcp/auth` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Vector embeddings | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 DocumentService

| Operation | Description |
|-----------|-------------|
| `get_document` | Retrieve single document by path |
| `create_document` | Create new document (fail if exists) |
| `set_document` | Create or overwrite document |
| `update_document` | Update existing document fields |
| `delete_document` | Delete document by path |
| `exists` | Check if document exists |

### 2.2 CollectionService

| Operation | Description |
|-----------|-------------|
| `list_documents` | List documents in collection |
| `list_collections` | List subcollections of document |
| `add_document` | Add document with auto-generated ID |
| `get_collection_ref` | Get collection reference |
| `collection_group` | Query across all collections with same ID |

### 2.3 QueryService

| Operation | Description |
|-----------|-------------|
| `query` | Execute query with filters |
| `query_stream` | Stream query results |
| `aggregate` | Run aggregation (count, sum, avg) |
| `paginate` | Paginated query with cursors |
| `explain` | Get query execution plan |

### 2.4 BatchService

| Operation | Description |
|-----------|-------------|
| `create_batch` | Create batch writer |
| `batch_set` | Add set operation to batch |
| `batch_update` | Add update operation to batch |
| `batch_delete` | Add delete operation to batch |
| `commit_batch` | Commit batch (up to 500 ops) |

### 2.5 TransactionService

| Operation | Description |
|-----------|-------------|
| `run_transaction` | Execute read-write transaction |
| `run_read_only_transaction` | Execute read-only transaction |
| `get_in_transaction` | Read document in transaction |
| `set_in_transaction` | Write document in transaction |
| `update_in_transaction` | Update document in transaction |
| `delete_in_transaction` | Delete document in transaction |

### 2.6 ListenerService

| Operation | Description |
|-----------|-------------|
| `listen_document` | Subscribe to document changes |
| `listen_collection` | Subscribe to collection changes |
| `listen_query` | Subscribe to query results |
| `unsubscribe` | Stop listening |

### 2.7 FieldOperationService

| Operation | Description |
|-----------|-------------|
| `increment` | Atomic increment field |
| `array_union` | Add elements to array |
| `array_remove` | Remove elements from array |
| `server_timestamp` | Set server timestamp |
| `delete_field` | Remove field from document |

---

## 3. Core Types

### 3.1 Document Types

```
DocumentPath:
  project_id: String
  database_id: String       # Default: "(default)"
  collection_path: String   # e.g., "users" or "users/123/orders"
  document_id: String

DocumentRef:
  path: DocumentPath
  parent: CollectionRef

Document:
  reference: DocumentRef
  fields: Map<String, FieldValue>
  create_time: Option<Timestamp>
  update_time: Option<Timestamp>
  read_time: Timestamp

DocumentSnapshot:
  reference: DocumentRef
  exists: bool
  data: Option<Map<String, FieldValue>>
  create_time: Option<Timestamp>
  update_time: Option<Timestamp>
  read_time: Timestamp
```

### 3.2 Collection Types

```
CollectionRef:
  path: String
  parent: Option<DocumentRef>

CollectionPath:
  segments: Vec<String>     # Alternating collection/document IDs

CollectionGroup:
  collection_id: String     # Collection name to query across
  all_descendants: bool
```

### 3.3 Field Value Types

```
FieldValue:
  | Null
  | Boolean(bool)
  | Integer(i64)
  | Double(f64)
  | Timestamp(Timestamp)
  | String(String)
  | Bytes(Vec<u8>)
  | Reference(DocumentRef)
  | GeoPoint { latitude: f64, longitude: f64 }
  | Array(Vec<FieldValue>)
  | Map(Map<String, FieldValue>)

FieldTransform:
  | Increment(NumericValue)
  | Maximum(NumericValue)
  | Minimum(NumericValue)
  | ArrayUnion(Vec<FieldValue>)
  | ArrayRemove(Vec<FieldValue>)
  | ServerTimestamp

Timestamp:
  seconds: i64
  nanos: i32
```

### 3.4 Query Types

```
Query:
  collection: CollectionRef
  filters: Vec<Filter>
  order_by: Vec<OrderBy>
  limit: Option<u32>
  offset: Option<u32>
  start_at: Option<Cursor>
  end_at: Option<Cursor>
  select: Option<Vec<String>>    # Field mask

Filter:
  | FieldFilter { field: String, op: FilterOp, value: FieldValue }
  | CompositeFilter { op: CompositeOp, filters: Vec<Filter> }
  | UnaryFilter { field: String, op: UnaryOp }

FilterOp:
  | Equal
  | NotEqual
  | LessThan
  | LessThanOrEqual
  | GreaterThan
  | GreaterThanOrEqual
  | ArrayContains
  | ArrayContainsAny
  | In
  | NotIn

CompositeOp:
  | And
  | Or

UnaryOp:
  | IsNan
  | IsNull
  | IsNotNan
  | IsNotNull

OrderBy:
  field: String
  direction: Direction

Direction:
  | Ascending
  | Descending

Cursor:
  values: Vec<FieldValue>
  before: bool              # start_before or end_before
```

### 3.5 Aggregation Types

```
Aggregation:
  | Count
  | Sum { field: String }
  | Average { field: String }

AggregationResult:
  aggregations: Map<String, AggregateValue>
  read_time: Timestamp

AggregateValue:
  | IntegerValue(i64)
  | DoubleValue(f64)
  | NullValue
```

### 3.6 Batch and Transaction Types

```
WriteBatch:
  writes: Vec<Write>
  max_operations: u32       # Default: 500

Write:
  | Set { document: DocumentRef, data: Map, merge: bool }
  | Update { document: DocumentRef, fields: Map, precondition: Option<Precondition> }
  | Delete { document: DocumentRef, precondition: Option<Precondition> }
  | Transform { document: DocumentRef, transforms: Vec<FieldTransform> }

Precondition:
  | Exists(bool)
  | UpdateTime(Timestamp)

Transaction:
  id: TransactionId
  read_only: bool
  read_time: Option<Timestamp>  # For read-only transactions
  max_attempts: u32             # Default: 5

TransactionOptions:
  read_only: bool
  max_attempts: Option<u32>
```

### 3.7 Listener Types

```
ListenerRegistration:
  id: ListenerId
  target: ListenTarget
  created_at: Timestamp

ListenTarget:
  | Document(DocumentRef)
  | Collection(CollectionRef)
  | Query(Query)

DocumentChange:
  change_type: ChangeType
  document: DocumentSnapshot
  old_index: Option<u32>
  new_index: Option<u32>

ChangeType:
  | Added
  | Modified
  | Removed

QuerySnapshot:
  documents: Vec<DocumentSnapshot>
  changes: Vec<DocumentChange>
  read_time: Timestamp
  size: usize
```

---

## 4. Configuration

```
FirestoreConfig:
  # Connection settings
  project_id: String
  database_id: String           # Default: "(default)"
  auth: AuthConfig              # GCP auth configuration

  # Endpoint settings
  endpoint: Option<String>      # Override for emulator
  use_emulator: bool            # Default: false

  # Performance settings
  max_concurrent_requests: u32  # Default: 100
  request_timeout_ms: u64       # Default: 60000

  # Resilience settings
  max_retries: u32              # Default: 3
  retry_backoff_ms: u64         # Default: 1000
  circuit_breaker_threshold: u32 # Default: 5

  # Batch settings
  max_batch_size: u32           # Default: 500
  max_transaction_attempts: u32 # Default: 5

  # Listener settings
  listener_reconnect_ms: u64    # Default: 1000
  max_listeners: u32            # Default: 100

AuthConfig:
  | DefaultCredentials
  | ServiceAccount { key_file: String }
  | AccessToken { token: SecretString }
  | Emulator
```

---

## 5. Error Taxonomy

| Error Type | gRPC Code | Retryable | Description |
|------------|-----------|-----------|-------------|
| `NotFound` | NOT_FOUND | No | Document does not exist |
| `AlreadyExists` | ALREADY_EXISTS | No | Document already exists |
| `PermissionDenied` | PERMISSION_DENIED | No | Insufficient permissions |
| `InvalidArgument` | INVALID_ARGUMENT | No | Invalid request data |
| `FailedPrecondition` | FAILED_PRECONDITION | No | Precondition not met |
| `Aborted` | ABORTED | Yes | Transaction aborted (contention) |
| `ResourceExhausted` | RESOURCE_EXHAUSTED | Yes | Quota exceeded |
| `Unavailable` | UNAVAILABLE | Yes | Service temporarily unavailable |
| `DeadlineExceeded` | DEADLINE_EXCEEDED | Yes | Request timeout |
| `Internal` | INTERNAL | Yes | Internal Firestore error |
| `Cancelled` | CANCELLED | No | Request cancelled |
| `Unauthenticated` | UNAUTHENTICATED | No | Invalid credentials |

---

## 6. Rate Limits and Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| Max document size | 1 MiB | Per document |
| Max field depth | 20 levels | Per document |
| Max index entries per document | 40,000 | Per document |
| Max batch operations | 500 | Per batch |
| Max transaction operations | 500 | Per transaction |
| Max transaction duration | 270 seconds | Per transaction |
| Write rate | 10,000 docs/sec | Per database |
| Document creates per collection | 500/sec | Per collection |
| Max concurrent listeners | 1,000 | Per client |
| Max IN clause values | 30 | Per query |
| Max OR clauses | 30 | Per query |

---

## 7. Security Requirements

### 7.1 Credential Protection
- GCP credentials via `gcp/auth` module
- Service account keys encrypted at rest
- No credential logging
- Token refresh handling

### 7.2 Data Validation
- Field path validation
- Document size limits enforced
- Field depth limits enforced
- Collection path validation

### 7.3 Access Patterns
- Read-only transaction mode
- Field-level access (select masks)
- Precondition enforcement

### 7.4 Audit Requirements
- Document operations logged (path, not content)
- Transaction boundaries logged
- Listener lifecycle logged
- Error logging (sanitized)

---

## 8. Consistency Model

### 8.1 Strong Consistency
- Single document reads
- Transactions (read-write)
- Queries with inequality on __name__
- Document snapshots in listeners (eventual delivery)

### 8.2 Eventual Consistency
- Collection group queries
- Queries across multiple documents
- Aggregations

### 8.3 Transaction Semantics
- Serializable isolation
- Optimistic concurrency (retry on contention)
- Maximum 5 retry attempts
- 270 second maximum duration

---

## 9. Simulation Requirements

### 9.1 MockFirestoreClient
- Simulate all document operations
- In-memory document store
- Query evaluation
- Transaction simulation

### 9.2 Listener Simulation
- Emit synthetic change events
- Simulate connection lifecycle
- Error injection

### 9.3 Operation Replay
- Record operation sequences
- Replay for testing
- Snapshot comparison

---

## 10. Integration Points

### 10.1 Shared Modules

```
gcp/auth:
  - get_credentials() -> Credentials
  - get_access_token() -> AccessToken
  - refresh_token() -> AccessToken

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per database
  - RateLimiter (adaptive)

shared/observability:
  - Metrics: firestore.reads, firestore.writes, firestore.latency
  - Traces: span per operation
  - Logs: structured, content-redacted

shared/vector-memory:
  - store_document_embedding(path, metadata)
  - search_similar_documents(query)
```

### 10.2 Related Integrations

```
gcp/pubsub:
  - Firestore triggers via Cloud Functions
  - Event-driven processing

gcp/bigquery:
  - Export to BigQuery
  - Analytics queries
```

---

## 11. Real-Time Considerations

### 11.1 Listener Lifecycle

```
States:
  | Initial        # Connection establishing
  | Listening      # Active subscription
  | Reconnecting   # Temporary disconnect
  | Stopped        # Explicitly stopped
  | Error          # Fatal error

Reconnection:
  - Automatic on transient errors
  - Exponential backoff
  - Resume token for continuation
```

### 11.2 Change Propagation

```
Delivery Guarantees:
  - At-least-once delivery
  - Ordered within document
  - Eventually consistent across documents

Latency Expectations:
  - Typical: < 100ms
  - Worst case: seconds (during splits)
```

---

## 12. Hierarchical Data Patterns

### 12.1 Subcollection Access

```
Pattern:
  /users/{userId}/orders/{orderId}/items/{itemId}

Operations:
  - Navigate via document references
  - Query subcollections directly
  - Collection group for cross-parent queries
```

### 12.2 Document References

```
Reference Fields:
  - Store references to related documents
  - Automatic dereferencing not supported
  - Manual join patterns required
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-firestore.md | Complete |
| 2. Pseudocode | pseudocode-firestore.md | Pending |
| 3. Architecture | architecture-firestore.md | Pending |
| 4. Refinement | refinement-firestore.md | Pending |
| 5. Completion | completion-firestore.md | Pending |

---

*Phase 1: Specification - Complete*
