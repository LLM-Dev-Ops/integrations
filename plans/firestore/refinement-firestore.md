# Google Firestore Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google/firestore`

---

## 1. Edge Cases and Boundary Conditions

### 1.1 Transaction Contention and Retry Exhaustion

```
Scenario: High contention on hot document
──────────────────────────────────────────

Context:
- Multiple clients updating same document
- Transactions repeatedly aborted
- Default 5 retry attempts exhausted

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION run_transaction_with_contention_handling<T>(                    │
│     client: FirestoreClient,                                             │
│     operation: Fn(Transaction) -> T,                                     │
│     options: TransactionOptions                                          │
│ ) -> T:                                                                  │
│                                                                          │
│   max_attempts = options.max_attempts ?? 5                               │
│   contention_count = 0                                                   │
│                                                                          │
│   FOR attempt IN 1..=max_attempts:                                       │
│     TRY:                                                                 │
│       RETURN execute_transaction(client, operation)                      │
│                                                                          │
│     CATCH Aborted AS error:                                              │
│       contention_count += 1                                              │
│       emit_metric("firestore.transaction.contention", 1, tags={          │
│         "attempt": attempt                                               │
│       })                                                                 │
│                                                                          │
│       IF attempt == max_attempts:                                        │
│         log.error("Transaction failed after max retries",                │
│           contention_count: contention_count,                            │
│           error: error.message                                           │
│         )                                                                │
│         RAISE TransactionContentionError(                                │
│           attempts: attempt,                                             │
│           hint: "Consider reducing transaction scope or using batch"     │
│         )                                                                │
│                                                                          │
│       // Exponential backoff with jitter                                 │
│       base_delay = min(1000 * (2 ^ attempt), 30000)                      │
│       jitter = random(0, base_delay * 0.2)                               │
│       sleep(base_delay + jitter)                                         │
└─────────────────────────────────────────────────────────────────────────┘

Mitigation Strategies:
- Reduce transaction read/write scope
- Use batch writes for non-transactional updates
- Implement application-level partitioning
- Consider optimistic locking with version fields
```

### 1.2 Document Size Limit Exceeded

```
Scenario: Document exceeds 1 MiB limit
──────────────────────────────────────

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION validate_document_size(data: Map<String, FieldValue>):         │
│                                                                          │
│   // Calculate serialized size                                           │
│   size_bytes = calculate_proto_size(data)                                │
│                                                                          │
│   IF size_bytes > MAX_DOCUMENT_SIZE:                                     │
│     // Find largest fields                                               │
│     field_sizes = data.map(|(k, v)| (k, calculate_field_size(v)))        │
│     largest_fields = field_sizes.sort_by_size().take(5)                  │
│                                                                          │
│     RAISE DocumentTooLargeError(                                         │
│       size: size_bytes,                                                  │
│       limit: MAX_DOCUMENT_SIZE,                                          │
│       largest_fields: largest_fields,                                    │
│       hint: "Consider splitting into subcollection or storing in GCS"    │
│     )                                                                    │
│                                                                          │
│   // Warn if approaching limit                                           │
│   IF size_bytes > MAX_DOCUMENT_SIZE * 0.8:                               │
│     log.warn("Document approaching size limit",                          │
│       size: size_bytes,                                                  │
│       limit: MAX_DOCUMENT_SIZE,                                          │
│       percentage: size_bytes / MAX_DOCUMENT_SIZE * 100                   │
│     )                                                                    │
│                                                                          │
│ FUNCTION calculate_field_size(value: FieldValue) -> usize:               │
│   MATCH value:                                                           │
│     String(s) => s.len() + 1                                             │
│     Bytes(b) => b.len() + 1                                              │
│     Array(items) => items.map(calculate_field_size).sum() + 1            │
│     Map(fields) => fields.map(|(k, v)|                                   │
│       k.len() + calculate_field_size(v)).sum() + 1                       │
│     _ => 8  // Fixed-size types                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Deeply Nested Field Paths

```
Scenario: Field path exceeds 20 levels
──────────────────────────────────────

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION validate_field_path(path: String):                              │
│                                                                          │
│   segments = path.split(".")                                             │
│                                                                          │
│   IF segments.len() > MAX_FIELD_DEPTH:                                   │
│     RAISE FieldPathTooDeepError(                                         │
│       path: path,                                                        │
│       depth: segments.len(),                                             │
│       limit: MAX_FIELD_DEPTH                                             │
│     )                                                                    │
│                                                                          │
│   // Validate each segment                                               │
│   FOR segment IN segments:                                               │
│     IF segment.is_empty():                                               │
│       RAISE InvalidFieldPathError("Empty segment in path")               │
│                                                                          │
│     IF segment.starts_with("__"):                                        │
│       RAISE InvalidFieldPathError("Reserved field prefix: " + segment)   │
│                                                                          │
│ FUNCTION validate_nested_map_depth(value: FieldValue, depth: u32):       │
│   IF depth > MAX_FIELD_DEPTH:                                            │
│     RAISE NestedMapTooDeepError(depth: depth, limit: MAX_FIELD_DEPTH)    │
│                                                                          │
│   MATCH value:                                                           │
│     Map(fields) =>                                                       │
│       FOR (_, v) IN fields:                                              │
│         validate_nested_map_depth(v, depth + 1)                          │
│     Array(items) =>                                                      │
│       FOR item IN items:                                                 │
│         validate_nested_map_depth(item, depth + 1)                       │
│     _ => // OK                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Listener Connection Loss During Update

```
Scenario: Connection lost while changes pending
───────────────────────────────────────────────

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ STRUCT ListenerState:                                                    │
│   resume_token: Option<Bytes>                                            │
│   pending_changes: Vec<DocumentChange>                                   │
│   last_snapshot: Option<QuerySnapshot>                                   │
│   reconnect_attempts: u32                                                │
│                                                                          │
│ FUNCTION handle_listener_disconnect(                                     │
│     listener: ListenerRegistration,                                      │
│     error: Error                                                         │
│ ):                                                                       │
│   // Classify error                                                      │
│   IF is_transient_error(error):                                          │
│     listener.state.reconnect_attempts += 1                               │
│                                                                          │
│     emit_metric("firestore.listener.disconnect", 1, tags={               │
│       "transient": true                                                  │
│     })                                                                   │
│                                                                          │
│     // Calculate backoff                                                 │
│     delay = calculate_reconnect_delay(listener.state.reconnect_attempts) │
│                                                                          │
│     // Schedule reconnection                                             │
│     spawn_delayed(delay, || {                                            │
│       reconnect_listener(listener)                                       │
│     })                                                                   │
│                                                                          │
│   ELSE:                                                                  │
│     // Permanent error - notify callback and stop                        │
│     listener.callback(None, Some(map_firestore_error(error)))            │
│     listener.stop()                                                      │
│                                                                          │
│ FUNCTION reconnect_listener(listener: ListenerRegistration):             │
│   TRY:                                                                   │
│     stream = open_listen_stream(                                         │
│       listener.target,                                                   │
│       resume_token: listener.state.resume_token                          │
│     )                                                                    │
│                                                                          │
│     // Reset reconnect counter on success                                │
│     listener.state.reconnect_attempts = 0                                │
│                                                                          │
│     emit_metric("firestore.listener.reconnected", 1)                     │
│                                                                          │
│     // Resume processing                                                 │
│     process_listener_stream(listener, stream)                            │
│                                                                          │
│   CATCH error:                                                           │
│     handle_listener_disconnect(listener, error)                          │
└─────────────────────────────────────────────────────────────────────────┘

Resume Token Behavior:
- If token valid: Resume from last acknowledged position
- If token expired: Full sync from current state
- Server sends synthetic "current" event after catch-up
```

### 1.5 Batch Size Exceeded

```
Scenario: Attempting to add 501st operation to batch
────────────────────────────────────────────────────

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION batch_operation_safe(batch: WriteBatch, write: Write):          │
│                                                                          │
│   IF batch.writes.len() >= MAX_BATCH_SIZE:                               │
│     RAISE BatchSizeLimitError(                                           │
│       current: batch.writes.len(),                                       │
│       limit: MAX_BATCH_SIZE,                                             │
│       hint: "Commit current batch and create new one"                    │
│     )                                                                    │
│                                                                          │
│   batch.writes.append(write)                                             │
│                                                                          │
│ // Auto-chunking helper                                                  │
│ FUNCTION batch_writes_chunked(                                           │
│     client: FirestoreClient,                                             │
│     writes: Vec<Write>                                                   │
│ ) -> Vec<Vec<WriteResult>>:                                              │
│                                                                          │
│   results = []                                                           │
│                                                                          │
│   FOR chunk IN writes.chunks(MAX_BATCH_SIZE):                            │
│     batch = client.batch()                                               │
│     FOR write IN chunk:                                                  │
│       batch.add(write)                                                   │
│     chunk_results = batch.commit()                                       │
│     results.append(chunk_results)                                        │
│                                                                          │
│   RETURN results                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Note: Chunked batches are NOT atomic across chunks
```

### 1.6 Query Requiring Composite Index

```
Scenario: Query fails due to missing index
──────────────────────────────────────────

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION handle_index_error(error: FirestoreError, query: Query):        │
│                                                                          │
│   IF error.code == FAILED_PRECONDITION AND                               │
│      error.message.contains("index"):                                    │
│                                                                          │
│     // Extract index creation link if present                            │
│     index_link = extract_index_link(error.message)                       │
│                                                                          │
│     log.error("Query requires composite index",                          │
│       collection: query.collection,                                      │
│       filters: query.filters.map(describe_filter),                       │
│       order_by: query.order_by,                                          │
│       index_link: index_link                                             │
│     )                                                                    │
│                                                                          │
│     RAISE IndexRequiredError(                                            │
│       message: "Query requires composite index",                         │
│       index_link: index_link,                                            │
│       query_description: describe_query(query),                          │
│       hint: "Create index via Firebase Console or gcloud"                │
│     )                                                                    │
│                                                                          │
│   // Other precondition errors                                           │
│   RAISE error                                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.7 Collection Group Query Permissions

```
Scenario: Collection group query across security boundaries
───────────────────────────────────────────────────────────

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION execute_collection_group_query(                                 │
│     client: FirestoreClient,                                             │
│     collection_id: String,                                               │
│     query: Query                                                         │
│ ):                                                                       │
│   TRY:                                                                   │
│     RETURN execute_query_internal(client, query)                         │
│                                                                          │
│   CATCH PermissionDenied AS error:                                       │
│     // Collection group queries require explicit security rules          │
│     log.error("Collection group query permission denied",                │
│       collection_id: collection_id,                                      │
│       hint: "Ensure security rules allow collection group access"        │
│     )                                                                    │
│                                                                          │
│     RAISE CollectionGroupPermissionError(                                │
│       collection_id: collection_id,                                      │
│       message: error.message,                                            │
│       hint: "Add 'match /{path=**}/" + collection_id + "/{doc}' rule"    │
│     )                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Security Hardening

### 2.1 Field Path Injection Prevention

```
Field Path Validation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION sanitize_field_path(path: String) -> ValidatedPath:            │
│                                                                          │
│   // Reject reserved prefixes                                            │
│   IF path.starts_with("__"):                                             │
│     RAISE InvalidFieldPathError("Reserved prefix not allowed")           │
│                                                                          │
│   // Reject special characters that could cause issues                   │
│   forbidden_chars = ['/', '\x00', '\n', '\r']                            │
│   FOR char IN forbidden_chars:                                           │
│     IF path.contains(char):                                              │
│       RAISE InvalidFieldPathError("Forbidden character: " + char)        │
│                                                                          │
│   // Validate segment structure                                          │
│   segments = path.split(".")                                             │
│   FOR segment IN segments:                                               │
│     IF segment.is_empty():                                               │
│       RAISE InvalidFieldPathError("Empty segment")                       │
│     IF segment.len() > 1500:                                             │
│       RAISE InvalidFieldPathError("Segment too long")                    │
│                                                                          │
│   RETURN ValidatedPath(path)                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Document ID Validation

```
Document ID Validation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION validate_document_id(id: String):                               │
│                                                                          │
│   // Check length                                                        │
│   IF id.is_empty() OR id.len() > 1500:                                   │
│     RAISE InvalidDocumentIdError("Invalid length: " + id.len())          │
│                                                                          │
│   // Reject reserved IDs                                                 │
│   IF id == "." OR id == "..":                                            │
│     RAISE InvalidDocumentIdError("Reserved ID: " + id)                   │
│                                                                          │
│   // Reject IDs starting with __                                         │
│   IF id.starts_with("__"):                                               │
│     RAISE InvalidDocumentIdError("Reserved prefix")                      │
│                                                                          │
│   // Reject forward slashes (would create subcollection)                 │
│   IF id.contains("/"):                                                   │
│     RAISE InvalidDocumentIdError("Forward slash not allowed")            │
│                                                                          │
│   // Warn about special characters that may cause issues                 │
│   special_chars = ['#', '[', ']', '*', '?']                              │
│   FOR char IN special_chars:                                             │
│     IF id.contains(char):                                                │
│       log.warn("Document ID contains special character",                 │
│         id: id, char: char)                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Credential Security

```
Credential Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Service Account Key Protection                                        │
│    - Load from secure location only                                      │
│    - Never log key contents                                              │
│    - Prefer workload identity over key files                             │
│                                                                          │
│ 2. Token Management                                                      │
│    - Cache tokens securely                                               │
│    - Refresh before expiry (5 min buffer)                                │
│    - Clear on credential rotation                                        │
│                                                                          │
│ 3. Emulator Mode                                                         │
│    - Explicit opt-in required                                            │
│    - Blocked in production environments                                  │
│    - Clear warning in logs                                               │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION validate_auth_config(config: AuthConfig, env: Environment):    │
│                                                                          │
│   IF config == Emulator AND env == Production:                           │
│     RAISE ConfigurationError(                                            │
│       "Emulator auth not allowed in production"                          │
│     )                                                                    │
│                                                                          │
│   IF config.service_account_key IS NOT null:                             │
│     // Validate key file permissions                                     │
│     perms = get_file_permissions(config.service_account_key)             │
│     IF perms.world_readable():                                           │
│       RAISE ConfigurationError(                                          │
│         "Service account key file is world-readable"                     │
│       )                                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Audit Logging

```
Audit Events:
┌─────────────────────────────────────────────────────────────────────────┐
│ Event Type           │ Logged Fields                                    │
│ ─────────────────────┼────────────────────────────────────────────────  │
│ DOCUMENT_READ        │ path, exists, read_time                          │
│ DOCUMENT_WRITE       │ path, operation (set/update), field_count        │
│ DOCUMENT_DELETE      │ path, existed                                    │
│ BATCH_COMMIT         │ operation_count, paths (first 10)                │
│ TRANSACTION_START    │ transaction_id, read_only                        │
│ TRANSACTION_COMMIT   │ transaction_id, duration_ms, write_count         │
│ TRANSACTION_ABORT    │ transaction_id, reason, attempts                 │
│ QUERY_EXECUTE        │ collection, filter_count, limit, result_count    │
│ LISTENER_START       │ listener_id, target_type, target_path            │
│ LISTENER_STOP        │ listener_id, reason, duration_ms                 │
│ LISTENER_ERROR       │ listener_id, error_type                          │
└─────────────────────────────────────────────────────────────────────────┘

Content Redaction:
- Document data: Never logged
- Field values: Never logged
- Field names: Logged (not values)
- Query filters: Field names only, not values
```

---

## 3. Performance Optimizations

### 3.1 Query Optimization

```
Query Best Practices:
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Use Indexes Effectively                                               │
│    - Equality filters before inequality                                  │
│    - Order by indexed fields                                             │
│    - Avoid requiring composite indexes when possible                     │
│                                                                          │
│ 2. Limit Result Sets                                                     │
│    - Always use limit() for unbounded queries                            │
│    - Use pagination for large result sets                                │
│    - Project only needed fields with select()                            │
│                                                                          │
│ 3. Avoid Full Collection Scans                                           │
│    - Add at least one equality filter                                    │
│    - Use collection groups sparingly                                     │
└─────────────────────────────────────────────────────────────────────────┘

Query Analysis:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION analyze_query_performance(query: Query, result: QueryResult):   │
│                                                                          │
│   // Check for potential issues                                          │
│   issues = []                                                            │
│                                                                          │
│   IF query.limit IS None AND result.documents.len() > 100:               │
│     issues.append("Large unbounded query - add limit()")                 │
│                                                                          │
│   IF query.filters.is_empty() AND query.order_by.is_empty():             │
│     issues.append("Full collection scan - add filter or order")          │
│                                                                          │
│   IF query.select IS None AND avg_doc_size(result) > 10000:              │
│     issues.append("Large documents - consider field projection")         │
│                                                                          │
│   IF issues.len() > 0:                                                   │
│     log.warn("Query performance issues detected",                        │
│       collection: query.collection,                                      │
│       issues: issues                                                     │
│     )                                                                    │
│     emit_metric("firestore.query.performance_warning", 1)                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Batch Optimization

```
Batch Strategies:
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Maximize Batch Size                                                   │
│    - Group up to 500 operations                                          │
│    - Reduces round trips                                                 │
│    - Single commit overhead                                              │
│                                                                          │
│ 2. Order Operations                                                      │
│    - Group by collection for cache efficiency                            │
│    - Deletes before creates (if replacing)                               │
│                                                                          │
│ 3. Parallel Batch Commits                                                │
│    - Multiple independent batches in parallel                            │
│    - Respect rate limits                                                 │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION commit_batches_parallel(                                        │
│     client: FirestoreClient,                                             │
│     batches: Vec<WriteBatch>,                                            │
│     max_concurrent: u32                                                  │
│ ) -> Vec<Result<Vec<WriteResult>>>:                                      │
│                                                                          │
│   semaphore = Semaphore::new(max_concurrent)                             │
│   futures = []                                                           │
│                                                                          │
│   FOR batch IN batches:                                                  │
│     permit = semaphore.acquire()                                         │
│     futures.append(spawn(async {                                         │
│       result = commit_batch(client, batch)                               │
│       drop(permit)                                                       │
│       RETURN result                                                      │
│     }))                                                                  │
│                                                                          │
│   RETURN await_all(futures)                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Listener Optimization

```
Listener Best Practices:
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Minimize Listener Scope                                               │
│    - Listen to specific documents when possible                          │
│    - Use query filters to reduce change volume                           │
│    - Avoid listening to entire collections                               │
│                                                                          │
│ 2. Handle Snapshots Efficiently                                          │
│    - Process only docChanges, not full snapshot                          │
│    - Batch UI updates                                                    │
│    - Debounce rapid changes                                              │
│                                                                          │
│ 3. Manage Listener Lifecycle                                             │
│    - Unsubscribe when not needed                                         │
│    - Re-use listeners across component mounts                            │
│    - Track active listener count                                         │
└─────────────────────────────────────────────────────────────────────────┘

Listener Metrics:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION track_listener_performance(                                     │
│     listener: ListenerRegistration,                                      │
│     snapshot: QuerySnapshot                                              │
│ ):                                                                       │
│   emit_metric("firestore.listener.snapshot_size",                        │
│     snapshot.documents.len(),                                            │
│     tags={listener_id: listener.id}                                      │
│   )                                                                      │
│                                                                          │
│   emit_metric("firestore.listener.changes",                              │
│     snapshot.changes.len(),                                              │
│     tags={                                                               │
│       listener_id: listener.id,                                          │
│       added: count_by_type(snapshot.changes, Added),                     │
│       modified: count_by_type(snapshot.changes, Modified),               │
│       removed: count_by_type(snapshot.changes, Removed)                  │
│     }                                                                    │
│   )                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Resilience Patterns

### 4.1 Retry Strategy

```
Retry Configuration by Error:
┌─────────────────────────────────────────────────────────────────────────┐
│ Error Type           │ Retries │ Backoff       │ Notes                  │
│ ─────────────────────┼─────────┼───────────────┼─────────────────────── │
│ ABORTED              │ 5       │ 1-30s exp     │ Transaction contention │
│ UNAVAILABLE          │ 3       │ 100-5000ms    │ Service unavailable    │
│ RESOURCE_EXHAUSTED   │ 3       │ 1-10s exp     │ Quota exceeded         │
│ DEADLINE_EXCEEDED    │ 2       │ 500-2000ms    │ Request timeout        │
│ INTERNAL             │ 2       │ 500-2000ms    │ Internal error         │
│ NOT_FOUND            │ 0       │ -             │ Document missing       │
│ PERMISSION_DENIED    │ 0       │ -             │ Access denied          │
│ INVALID_ARGUMENT     │ 0       │ -             │ Bad request            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Circuit Breaker Configuration

```
Circuit Breaker Settings:
┌─────────────────────────────────────────────────────────────────────────┐
│ Parameter              │ Value   │ Rationale                           │
│ ───────────────────────┼─────────┼──────────────────────────────────── │
│ failure_threshold      │ 5       │ Allow brief issues                  │
│ failure_window         │ 30s     │ Recent failures only                │
│ open_duration          │ 60s     │ Allow service recovery              │
│ half_open_requests     │ 3       │ Gradual recovery                    │
│ success_threshold      │ 2       │ Confirm recovery                    │
└─────────────────────────────────────────────────────────────────────────┘

Failure Classification:
- UNAVAILABLE: Counts as failure
- DEADLINE_EXCEEDED: Counts as failure
- INTERNAL: Counts as failure
- RESOURCE_EXHAUSTED: Counts as failure (may indicate systemic issue)
- ABORTED: Does NOT count (expected in transactions)
- All other errors: Do NOT count
```

### 4.3 Graceful Degradation

```
Degradation Strategies:
┌─────────────────────────────────────────────────────────────────────────┐
│ Scenario                     │ Degradation Strategy                    │
│ ─────────────────────────────┼──────────────────────────────────────── │
│ Listener disconnected        │ Serve cached snapshot, show stale badge │
│ Transaction contention       │ Fall back to batch with manual checks   │
│ Query timeout                │ Return partial results with cursor      │
│ Rate limit exceeded          │ Queue requests, process with delay      │
│ Service unavailable          │ Use local cache, sync when available    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

```
Test Categories:
┌─────────────────────────────────────────────────────────────────────────┐
│ Category               │ Test Cases                                     │
│ ───────────────────────┼─────────────────────────────────────────────── │
│ Document Paths         │ - Valid path parsing                           │
│                        │ - Invalid path rejection                       │
│                        │ - Subcollection paths                          │
│                        │ - Special character handling                   │
│                        │                                                │
│ Field Values           │ - All value type conversions                   │
│                        │ - Nested map handling                          │
│                        │ - Array operations                             │
│                        │ - GeoPoint validation                          │
│                        │                                                │
│ Query Building         │ - Filter combinations                          │
│                        │ - Order by validation                          │
│                        │ - Cursor pagination                            │
│                        │ - Composite filters                            │
│                        │                                                │
│ Error Mapping          │ - All gRPC codes                               │
│                        │ - Retry classification                         │
│                        │ - Error message extraction                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Integration Tests

```
Integration Test Scenarios:
┌─────────────────────────────────────────────────────────────────────────┐
│ Scenario                    │ Setup                                     │
│ ────────────────────────────┼──────────────────────────────────────────│
│ Document CRUD               │ Emulator with test collection             │
│ Batch operations            │ 500 document batch                        │
│ Transaction commit          │ Multi-document transaction                │
│ Transaction contention      │ Concurrent transactions on same doc       │
│ Query with filters          │ Pre-populated collection                  │
│ Collection group query      │ Nested subcollections                     │
│ Real-time listener          │ Document change simulation                │
│ Listener reconnection       │ Emulator restart during listen            │
│ Large document handling     │ Near-limit document sizes                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Simulation Tests

```
Mock-Based Tests:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION test_transaction_retry_on_contention():                         │
│   mock = MockFirestoreClient::new()                                      │
│                                                                          │
│   // Configure contention on first 2 attempts                            │
│   mock.configure_transaction_behavior([                                  │
│     TransactionResult::Abort,                                            │
│     TransactionResult::Abort,                                            │
│     TransactionResult::Commit                                            │
│   ])                                                                     │
│                                                                          │
│   result = run_transaction(mock, |tx| {                                  │
│     doc = tx.get("users/123")                                            │
│     tx.set("users/123", {counter: doc.counter + 1})                      │
│   })                                                                     │
│                                                                          │
│   ASSERT result.is_ok()                                                  │
│   ASSERT mock.transaction_attempts == 3                                  │
│   ASSERT mock.metrics["firestore.transaction.contention"] == 2           │
│                                                                          │
│ FUNCTION test_listener_reconnection():                                   │
│   mock = MockFirestoreClient::new()                                      │
│   events_received = []                                                   │
│                                                                          │
│   // Configure disconnect after 2 events                                 │
│   mock.configure_listener_behavior(                                      │
│     events: [                                                            │
│       DocumentChange { type: Added, doc: doc1 },                         │
│       Disconnect { error: Unavailable },                                 │
│       // After reconnect                                                 │
│       DocumentChange { type: Modified, doc: doc1 }                       │
│     ]                                                                    │
│   )                                                                      │
│                                                                          │
│   listener = listen_document(mock, "users/123", |snapshot, err| {        │
│     events_received.append((snapshot, err))                              │
│   })                                                                     │
│                                                                          │
│   wait_for_events(3)                                                     │
│                                                                          │
│   ASSERT events_received.len() == 2  // Added + Modified                 │
│   ASSERT mock.reconnect_count == 1                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Observability Refinements

### 6.1 Metric Dimensions

```
Metric Tagging:
┌─────────────────────────────────────────────────────────────────────────┐
│ Metric                      │ Tags                                      │
│ ────────────────────────────┼──────────────────────────────────────────│
│ firestore.reads             │ collection, exists                        │
│ firestore.writes            │ collection, operation (set/update/delete) │
│ firestore.queries           │ collection, filter_count                  │
│ firestore.query.documents   │ collection                                │
│ firestore.transactions      │ status (committed/aborted), read_only     │
│ firestore.transaction.dur   │ status                                    │
│ firestore.batch.size        │ -                                         │
│ firestore.listeners.active  │ target_type (document/query/collection)   │
│ firestore.listener.changes  │ listener_id, change_type                  │
│ firestore.errors            │ error_type, operation                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Structured Log Format

```
Log Format:
┌─────────────────────────────────────────────────────────────────────────┐
│ {                                                                        │
│   "timestamp": "2025-12-13T10:30:00.000Z",                              │
│   "level": "info",                                                       │
│   "message": "Document read completed",                                  │
│   "module": "firestore.document_service",                                │
│   "operation": "get",                                                    │
│   "document_path": "users/abc123",                                       │
│   "exists": true,                                                        │
│   "latency_ms": 45,                                                      │
│   "project_id": "my-project",                                            │
│   "trace_id": "abc-123-def",                                             │
│   "span_id": "span-456"                                                  │
│ }                                                                        │
└─────────────────────────────────────────────────────────────────────────┘

Log Levels:
- ERROR: Transaction aborts (after retries), listener failures, auth errors
- WARN: Query performance issues, approaching limits, contention retries
- INFO: Document operations, transaction boundaries, listener lifecycle
- DEBUG: gRPC calls, proto conversions (development only)
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-firestore.md | Complete |
| 2. Pseudocode | pseudocode-firestore.md | Complete |
| 3. Architecture | architecture-firestore.md | Complete |
| 4. Refinement | refinement-firestore.md | Complete |
| 5. Completion | completion-firestore.md | Pending |

---

*Phase 4: Refinement - Complete*
