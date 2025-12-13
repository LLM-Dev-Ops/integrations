# Google Firestore Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google/firestore`

---

## 1. Client Initialization

```
FUNCTION create_firestore_client(config: FirestoreConfig) -> FirestoreClient:
    // Validate configuration
    validate_config(config)

    // Initialize GCP authentication
    credentials = MATCH config.auth:
        DefaultCredentials => gcp/auth.get_default_credentials()
        ServiceAccount { key_file } => gcp/auth.load_service_account(key_file)
        AccessToken { token } => gcp/auth.from_token(token)
        Emulator => null  // No auth for emulator

    // Determine endpoint
    endpoint = IF config.use_emulator:
        config.endpoint ?? "localhost:8080"
    ELSE:
        config.endpoint ?? "firestore.googleapis.com:443"

    // Create gRPC channel
    channel = create_grpc_channel(
        endpoint: endpoint,
        credentials: credentials,
        use_tls: NOT config.use_emulator
    )

    // Initialize circuit breaker
    circuit_breaker = shared/resilience.circuit_breaker(
        name: "firestore_" + config.project_id,
        threshold: config.circuit_breaker_threshold,
        timeout_ms: 60000
    )

    // Initialize listener manager
    listener_manager = ListenerManager::new(
        max_listeners: config.max_listeners,
        reconnect_ms: config.listener_reconnect_ms
    )

    RETURN FirestoreClient {
        config: config,
        channel: channel,
        credentials: credentials,
        circuit_breaker: circuit_breaker,
        listener_manager: listener_manager,
        database_path: build_database_path(config.project_id, config.database_id)
    }

FUNCTION build_database_path(project_id: String, database_id: String) -> String:
    RETURN "projects/" + project_id + "/databases/" + database_id
```

---

## 2. Document Operations

### 2.1 Get Document

```
FUNCTION get_document(
    client: FirestoreClient,
    path: DocumentPath
) -> DocumentSnapshot:
    span = shared/observability.start_span("firestore.get_document")
    span.set_attribute("document.path", path.to_string())

    DEFER:
        span.end()

    // Build document name
    document_name = build_document_name(client.database_path, path)

    // Execute with retry
    TRY:
        response = shared/resilience.with_retry(
            policy: get_retry_policy(client.config),
            operation: || {
                client.circuit_breaker.call(|| {
                    grpc_get_document(client.channel, document_name)
                })
            }
        )

        shared/observability.emit_metric("firestore.reads", 1, tags={
            "collection": path.collection_path,
            "status": "success"
        })

        RETURN parse_document_snapshot(response)

    CATCH NotFound:
        RETURN DocumentSnapshot {
            reference: DocumentRef::from_path(path),
            exists: false,
            data: None,
            create_time: None,
            update_time: None,
            read_time: now()
        }

    CATCH error:
        span.set_status(Error, error.message)
        shared/observability.emit_metric("firestore.errors", 1, tags={
            "operation": "get",
            "error_type": error.type
        })
        RAISE map_firestore_error(error)
```

### 2.2 Set Document

```
FUNCTION set_document(
    client: FirestoreClient,
    path: DocumentPath,
    data: Map<String, FieldValue>,
    options: SetOptions
) -> WriteResult:
    span = shared/observability.start_span("firestore.set_document")

    DEFER:
        span.end()

    // Validate document data
    validate_document_data(data)

    document_name = build_document_name(client.database_path, path)

    // Build write request
    write = Write::Set {
        document: Document {
            name: document_name,
            fields: convert_to_proto_fields(data)
        },
        update_mask: IF options.merge:
            Some(build_field_mask(options.merge_fields ?? data.keys()))
        ELSE:
            None
    }

    TRY:
        response = shared/resilience.with_retry(
            policy: get_retry_policy(client.config),
            operation: || {
                client.circuit_breaker.call(|| {
                    grpc_commit(client.channel, [write])
                })
            }
        )

        shared/observability.emit_metric("firestore.writes", 1, tags={
            "collection": path.collection_path,
            "operation": "set"
        })

        RETURN WriteResult {
            update_time: response.commit_time
        }

    CATCH error:
        RAISE map_firestore_error(error)
```

### 2.3 Update Document

```
FUNCTION update_document(
    client: FirestoreClient,
    path: DocumentPath,
    updates: Map<String, FieldValue>,
    precondition: Option<Precondition>
) -> WriteResult:
    span = shared/observability.start_span("firestore.update_document")

    DEFER:
        span.end()

    document_name = build_document_name(client.database_path, path)

    // Build update mask from field paths
    update_mask = FieldMask {
        field_paths: updates.keys().map(expand_field_path)
    }

    write = Write::Update {
        document: Document {
            name: document_name,
            fields: convert_to_proto_fields(updates)
        },
        update_mask: update_mask,
        current_document: precondition.map(to_proto_precondition)
    }

    TRY:
        response = shared/resilience.with_retry(
            policy: get_retry_policy(client.config),
            operation: || grpc_commit(client.channel, [write])
        )

        RETURN WriteResult { update_time: response.commit_time }

    CATCH NotFound:
        RAISE DocumentNotFoundError(path)

    CATCH FailedPrecondition:
        RAISE PreconditionFailedError(path, precondition)
```

### 2.4 Delete Document

```
FUNCTION delete_document(
    client: FirestoreClient,
    path: DocumentPath,
    precondition: Option<Precondition>
) -> WriteResult:
    span = shared/observability.start_span("firestore.delete_document")

    DEFER:
        span.end()

    document_name = build_document_name(client.database_path, path)

    write = Write::Delete {
        document: document_name,
        current_document: precondition.map(to_proto_precondition)
    }

    response = shared/resilience.with_retry(
        policy: get_retry_policy(client.config),
        operation: || grpc_commit(client.channel, [write])
    )

    shared/observability.emit_metric("firestore.writes", 1, tags={
        "operation": "delete"
    })

    RETURN WriteResult { update_time: response.commit_time }
```

---

## 3. Collection Operations

### 3.1 List Documents

```
FUNCTION list_documents(
    client: FirestoreClient,
    collection: CollectionRef,
    options: ListOptions
) -> DocumentIterator:
    span = shared/observability.start_span("firestore.list_documents")

    parent = build_parent_path(client.database_path, collection)

    RETURN DocumentIterator {
        client: client,
        parent: parent,
        collection_id: collection.id,
        page_size: options.page_size ?? 100,
        page_token: None,
        exhausted: false,

        next_page: FUNCTION() -> Option<Vec<DocumentSnapshot>>:
            IF self.exhausted:
                RETURN None

            response = grpc_list_documents(
                self.client.channel,
                parent: self.parent,
                collection_id: self.collection_id,
                page_size: self.page_size,
                page_token: self.page_token
            )

            self.page_token = response.next_page_token
            IF self.page_token.is_empty():
                self.exhausted = true

            RETURN Some(response.documents.map(parse_document_snapshot))
    }
```

### 3.2 Add Document (Auto-ID)

```
FUNCTION add_document(
    client: FirestoreClient,
    collection: CollectionRef,
    data: Map<String, FieldValue>
) -> DocumentRef:
    // Generate unique document ID
    document_id = generate_document_id()

    path = DocumentPath {
        project_id: client.config.project_id,
        database_id: client.config.database_id,
        collection_path: collection.path,
        document_id: document_id
    }

    // Use create to ensure uniqueness
    create_document(client, path, data)

    RETURN DocumentRef::from_path(path)

FUNCTION generate_document_id() -> String:
    // 20 character alphanumeric ID (matching Firestore format)
    RETURN random_alphanumeric(20)
```

### 3.3 Collection Group Query

```
FUNCTION collection_group(
    client: FirestoreClient,
    collection_id: String
) -> QueryBuilder:
    RETURN QueryBuilder {
        client: client,
        parent: client.database_path + "/documents",
        collection_id: collection_id,
        all_descendants: true,
        filters: [],
        order_by: [],
        limit: None,
        start_at: None,
        end_at: None
    }
```

---

## 4. Query Execution

### 4.1 Query Builder

```
STRUCT QueryBuilder:
    client: FirestoreClient
    parent: String
    collection_id: String
    all_descendants: bool
    filters: Vec<Filter>
    order_by: Vec<OrderBy>
    limit: Option<u32>
    offset: Option<u32>
    start_at: Option<Cursor>
    end_at: Option<Cursor>
    select: Option<Vec<String>>

FUNCTION where_(self, field: String, op: FilterOp, value: FieldValue) -> QueryBuilder:
    self.filters.append(Filter::Field {
        field: field,
        op: op,
        value: value
    })
    RETURN self

FUNCTION where_composite(self, op: CompositeOp, filters: Vec<Filter>) -> QueryBuilder:
    self.filters.append(Filter::Composite {
        op: op,
        filters: filters
    })
    RETURN self

FUNCTION order_by(self, field: String, direction: Direction) -> QueryBuilder:
    self.order_by.append(OrderBy { field, direction })
    RETURN self

FUNCTION limit(self, count: u32) -> QueryBuilder:
    self.limit = Some(count)
    RETURN self

FUNCTION start_at(self, values: Vec<FieldValue>) -> QueryBuilder:
    self.start_at = Some(Cursor { values, before: false })
    RETURN self

FUNCTION start_after(self, values: Vec<FieldValue>) -> QueryBuilder:
    self.start_at = Some(Cursor { values, before: true })
    RETURN self

FUNCTION select(self, fields: Vec<String>) -> QueryBuilder:
    self.select = Some(fields)
    RETURN self
```

### 4.2 Execute Query

```
FUNCTION execute_query(builder: QueryBuilder) -> QueryResult:
    span = shared/observability.start_span("firestore.query")
    span.set_attribute("collection", builder.collection_id)

    DEFER:
        span.end()

    // Build structured query
    query = build_structured_query(builder)

    TRY:
        response = shared/resilience.with_retry(
            policy: get_retry_policy(builder.client.config),
            operation: || {
                grpc_run_query(
                    builder.client.channel,
                    parent: builder.parent,
                    query: query
                )
            }
        )

        documents = []
        FOR doc_result IN response:
            IF doc_result.document IS NOT null:
                documents.append(parse_document_snapshot(doc_result.document))

        shared/observability.emit_metric("firestore.queries", 1)
        shared/observability.emit_metric("firestore.query.documents", documents.len())

        RETURN QueryResult {
            documents: documents,
            read_time: response.read_time
        }

    CATCH error:
        RAISE map_firestore_error(error)
```

### 4.3 Streaming Query

```
FUNCTION query_stream(builder: QueryBuilder) -> DocumentStream:
    query = build_structured_query(builder)

    stream = grpc_run_query_stream(
        builder.client.channel,
        parent: builder.parent,
        query: query
    )

    RETURN DocumentStream {
        inner: stream,

        next: FUNCTION() -> Option<DocumentSnapshot>:
            LOOP:
                result = self.inner.next()
                IF result IS None:
                    RETURN None
                IF result.document IS NOT null:
                    RETURN Some(parse_document_snapshot(result.document))
                // Skip non-document results (e.g., partial progress)
    }
```

### 4.4 Aggregation

```
FUNCTION aggregate(
    builder: QueryBuilder,
    aggregations: Vec<Aggregation>
) -> AggregationResult:
    span = shared/observability.start_span("firestore.aggregate")

    query = build_structured_query(builder)

    agg_query = AggregationQuery {
        structured_query: query,
        aggregations: aggregations.map(to_proto_aggregation)
    }

    response = grpc_run_aggregation_query(
        builder.client.channel,
        parent: builder.parent,
        query: agg_query
    )

    RETURN AggregationResult {
        aggregations: parse_aggregation_results(response),
        read_time: response.read_time
    }
```

---

## 5. Batch Operations

```
FUNCTION create_batch(client: FirestoreClient) -> WriteBatch:
    RETURN WriteBatch {
        client: client,
        writes: [],
        max_operations: client.config.max_batch_size
    }

FUNCTION batch_set(
    batch: WriteBatch,
    path: DocumentPath,
    data: Map<String, FieldValue>,
    options: SetOptions
) -> WriteBatch:
    IF batch.writes.len() >= batch.max_operations:
        RAISE BatchSizeLimitExceeded(batch.max_operations)

    document_name = build_document_name(batch.client.database_path, path)

    batch.writes.append(Write::Set {
        document: Document {
            name: document_name,
            fields: convert_to_proto_fields(data)
        },
        update_mask: IF options.merge:
            Some(build_field_mask(options.merge_fields))
        ELSE:
            None
    })

    RETURN batch

FUNCTION batch_update(
    batch: WriteBatch,
    path: DocumentPath,
    updates: Map<String, FieldValue>
) -> WriteBatch:
    IF batch.writes.len() >= batch.max_operations:
        RAISE BatchSizeLimitExceeded(batch.max_operations)

    document_name = build_document_name(batch.client.database_path, path)

    batch.writes.append(Write::Update {
        document: Document {
            name: document_name,
            fields: convert_to_proto_fields(updates)
        },
        update_mask: FieldMask { field_paths: updates.keys() },
        current_document: Precondition::Exists(true)
    })

    RETURN batch

FUNCTION batch_delete(batch: WriteBatch, path: DocumentPath) -> WriteBatch:
    IF batch.writes.len() >= batch.max_operations:
        RAISE BatchSizeLimitExceeded(batch.max_operations)

    document_name = build_document_name(batch.client.database_path, path)

    batch.writes.append(Write::Delete { document: document_name })

    RETURN batch

FUNCTION commit_batch(batch: WriteBatch) -> Vec<WriteResult>:
    span = shared/observability.start_span("firestore.batch_commit")
    span.set_attribute("batch.size", batch.writes.len())

    DEFER:
        span.end()

    IF batch.writes.is_empty():
        RETURN []

    response = shared/resilience.with_retry(
        policy: get_retry_policy(batch.client.config),
        operation: || {
            grpc_commit(batch.client.channel, batch.writes)
        }
    )

    shared/observability.emit_metric("firestore.writes", batch.writes.len(), tags={
        "operation": "batch"
    })

    RETURN response.write_results.map(|r| WriteResult {
        update_time: r.update_time
    })
```

---

## 6. Transaction Operations

### 6.1 Run Transaction

```
FUNCTION run_transaction<T>(
    client: FirestoreClient,
    operation: Fn(Transaction) -> T,
    options: TransactionOptions
) -> T:
    span = shared/observability.start_span("firestore.transaction")
    max_attempts = options.max_attempts ?? client.config.max_transaction_attempts

    DEFER:
        span.end()

    FOR attempt IN 1..=max_attempts:
        TRY:
            // Begin transaction
            tx_response = grpc_begin_transaction(
                client.channel,
                database: client.database_path,
                options: TransactionOptions {
                    read_only: options.read_only
                }
            )

            tx = Transaction {
                id: tx_response.transaction,
                client: client,
                read_only: options.read_only,
                writes: [],
                read_time: tx_response.read_time
            }

            // Execute user operation
            result = operation(tx)

            // Commit if not read-only
            IF NOT options.read_only:
                grpc_commit(
                    client.channel,
                    database: client.database_path,
                    writes: tx.writes,
                    transaction: tx.id
                )

            shared/observability.emit_metric("firestore.transactions", 1, tags={
                "status": "committed",
                "attempts": attempt
            })

            RETURN result

        CATCH Aborted:
            // Transaction contention, retry
            IF attempt == max_attempts:
                shared/observability.emit_metric("firestore.transactions", 1, tags={
                    "status": "aborted"
                })
                RAISE TransactionAbortedError(attempts=attempt)

            // Exponential backoff
            backoff_ms = min(1000 * (2 ^ attempt), 30000)
            sleep(backoff_ms + random(0, 1000))

        CATCH error:
            // Rollback on other errors
            TRY:
                grpc_rollback(client.channel, tx.id)
            CATCH:
                // Ignore rollback errors

            RAISE map_firestore_error(error)
```

### 6.2 Transaction Read/Write

```
FUNCTION get_in_transaction(tx: Transaction, path: DocumentPath) -> DocumentSnapshot:
    document_name = build_document_name(tx.client.database_path, path)

    response = grpc_get_document(
        tx.client.channel,
        document_name,
        transaction: tx.id
    )

    RETURN parse_document_snapshot(response)

FUNCTION set_in_transaction(
    tx: Transaction,
    path: DocumentPath,
    data: Map<String, FieldValue>
):
    IF tx.read_only:
        RAISE ReadOnlyTransactionError()

    IF tx.writes.len() >= 500:
        RAISE TransactionWriteLimitExceeded()

    document_name = build_document_name(tx.client.database_path, path)

    tx.writes.append(Write::Set {
        document: Document {
            name: document_name,
            fields: convert_to_proto_fields(data)
        }
    })

FUNCTION update_in_transaction(
    tx: Transaction,
    path: DocumentPath,
    updates: Map<String, FieldValue>
):
    IF tx.read_only:
        RAISE ReadOnlyTransactionError()

    document_name = build_document_name(tx.client.database_path, path)

    tx.writes.append(Write::Update {
        document: Document {
            name: document_name,
            fields: convert_to_proto_fields(updates)
        },
        update_mask: FieldMask { field_paths: updates.keys() }
    })

FUNCTION delete_in_transaction(tx: Transaction, path: DocumentPath):
    IF tx.read_only:
        RAISE ReadOnlyTransactionError()

    document_name = build_document_name(tx.client.database_path, path)
    tx.writes.append(Write::Delete { document: document_name })
```

---

## 7. Real-Time Listeners

### 7.1 Listen to Document

```
FUNCTION listen_document(
    client: FirestoreClient,
    path: DocumentPath,
    callback: Fn(DocumentSnapshot, Option<Error>)
) -> ListenerRegistration:
    document_name = build_document_name(client.database_path, path)

    listener_id = generate_listener_id()

    target = ListenTarget::Document {
        documents: Documents { documents: [document_name] },
        target_id: listener_id
    }

    registration = client.listener_manager.register(
        id: listener_id,
        target: target,
        callback: |event| {
            MATCH event:
                DocumentChange { document } =>
                    callback(parse_document_snapshot(document), None)
                Error { error } =>
                    callback(None, Some(map_firestore_error(error)))
        }
    )

    // Start listening in background
    spawn_listener(client, registration)

    RETURN registration

FUNCTION spawn_listener(client: FirestoreClient, registration: ListenerRegistration):
    spawn(async {
        LOOP:
            TRY:
                stream = grpc_listen(client.channel, registration.target)

                FOR event IN stream:
                    MATCH event:
                        TargetChange { change_type: Current } =>
                            // Initial state loaded
                            CONTINUE
                        DocumentChange { document } =>
                            registration.emit(DocumentChange { document })
                        DocumentRemove { document } =>
                            registration.emit(DocumentRemove { document })

            CATCH Unavailable, DeadlineExceeded:
                // Reconnect with backoff
                IF registration.is_stopped():
                    BREAK
                sleep(client.config.listener_reconnect_ms)

            CATCH error:
                registration.emit(Error { error })
                BREAK
    })
```

### 7.2 Listen to Query

```
FUNCTION listen_query(
    client: FirestoreClient,
    query: QueryBuilder,
    callback: Fn(QuerySnapshot, Option<Error>)
) -> ListenerRegistration:
    listener_id = generate_listener_id()

    structured_query = build_structured_query(query)

    target = ListenTarget::Query {
        parent: query.parent,
        query: structured_query,
        target_id: listener_id
    }

    registration = client.listener_manager.register(
        id: listener_id,
        target: target,
        callback: |event| {
            // Accumulate changes and emit snapshots
            process_query_event(event, callback)
        }
    )

    spawn_listener(client, registration)

    RETURN registration

FUNCTION unsubscribe(registration: ListenerRegistration):
    registration.stop()
    registration.client.listener_manager.remove(registration.id)
```

---

## 8. Field Transform Operations

```
FUNCTION apply_field_transforms(
    client: FirestoreClient,
    path: DocumentPath,
    transforms: Vec<(String, FieldTransform)>
) -> WriteResult:
    document_name = build_document_name(client.database_path, path)

    proto_transforms = transforms.map(|(field, transform)| {
        FieldTransform {
            field_path: field,
            transform: MATCH transform:
                Increment(value) => SetToServerValue::Increment(value)
                ArrayUnion(elements) => AppendMissingElements(elements)
                ArrayRemove(elements) => RemoveAllFromArray(elements)
                ServerTimestamp => SetToServerValue::RequestTime
                Maximum(value) => SetToServerValue::Maximum(value)
                Minimum(value) => SetToServerValue::Minimum(value)
        }
    })

    write = Write::Transform {
        document: document_name,
        field_transforms: proto_transforms
    }

    response = grpc_commit(client.channel, [write])

    RETURN WriteResult { update_time: response.commit_time }

// Convenience functions
FUNCTION increment_field(client, path, field, value) -> WriteResult:
    RETURN apply_field_transforms(client, path, [(field, Increment(value))])

FUNCTION array_union(client, path, field, elements) -> WriteResult:
    RETURN apply_field_transforms(client, path, [(field, ArrayUnion(elements))])

FUNCTION server_timestamp(client, path, field) -> WriteResult:
    RETURN apply_field_transforms(client, path, [(field, ServerTimestamp)])
```

---

## 9. Error Handling

```
FUNCTION map_firestore_error(grpc_error: GrpcError) -> FirestoreError:
    MATCH grpc_error.code:
        NOT_FOUND => NotFoundError(grpc_error.message)
        ALREADY_EXISTS => AlreadyExistsError(grpc_error.message)
        PERMISSION_DENIED => PermissionDeniedError(grpc_error.message)
        INVALID_ARGUMENT => InvalidArgumentError(grpc_error.message)
        FAILED_PRECONDITION => FailedPreconditionError(grpc_error.message)
        ABORTED => AbortedError(grpc_error.message)
        RESOURCE_EXHAUSTED => ResourceExhaustedError(grpc_error.message)
        UNAVAILABLE => UnavailableError(grpc_error.message)
        DEADLINE_EXCEEDED => DeadlineExceededError(grpc_error.message)
        INTERNAL => InternalError(grpc_error.message)
        UNAUTHENTICATED => UnauthenticatedError(grpc_error.message)
        _ => UnknownError(grpc_error.code, grpc_error.message)

FUNCTION is_retryable(error: FirestoreError) -> bool:
    MATCH error:
        AbortedError, ResourceExhaustedError, UnavailableError,
        DeadlineExceededError, InternalError => true
        _ => false

FUNCTION get_retry_policy(config: FirestoreConfig) -> RetryPolicy:
    RETURN RetryPolicy {
        max_attempts: config.max_retries,
        initial_backoff_ms: config.retry_backoff_ms,
        max_backoff_ms: 30000,
        backoff_multiplier: 2.0,
        retryable_errors: [Aborted, ResourceExhausted, Unavailable, DeadlineExceeded, Internal]
    }
```

---

## 10. Simulation Support

```
STRUCT MockFirestoreClient:
    documents: HashMap<String, Document>
    listeners: HashMap<ListenerId, MockListener>
    operation_log: Vec<RecordedOperation>
    error_injections: HashMap<String, FirestoreError>

FUNCTION create_mock_client() -> MockFirestoreClient:
    RETURN MockFirestoreClient {
        documents: HashMap::new(),
        listeners: HashMap::new(),
        operation_log: Vec::new(),
        error_injections: HashMap::new()
    }

FUNCTION mock_get_document(mock: MockFirestoreClient, path: DocumentPath) -> DocumentSnapshot:
    mock.operation_log.push(RecordedOperation {
        type: "get",
        path: path.to_string(),
        timestamp: now()
    })

    IF let Some(error) = mock.error_injections.get(path.to_string()):
        RAISE error

    IF let Some(doc) = mock.documents.get(path.to_string()):
        RETURN DocumentSnapshot {
            reference: DocumentRef::from_path(path),
            exists: true,
            data: Some(doc.fields.clone()),
            create_time: doc.create_time,
            update_time: doc.update_time,
            read_time: now()
        }
    ELSE:
        RETURN DocumentSnapshot {
            reference: DocumentRef::from_path(path),
            exists: false,
            data: None,
            create_time: None,
            update_time: None,
            read_time: now()
        }

FUNCTION mock_set_document(mock: MockFirestoreClient, path: DocumentPath, data: Map):
    mock.operation_log.push(RecordedOperation {
        type: "set",
        path: path.to_string(),
        timestamp: now()
    })

    mock.documents.insert(path.to_string(), Document {
        fields: data,
        create_time: Some(now()),
        update_time: Some(now())
    })

    // Notify listeners
    FOR listener IN mock.listeners.values():
        IF listener.matches_path(path):
            listener.emit_change(ChangeType::Modified, path, data)
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-firestore.md | Complete |
| 2. Pseudocode | pseudocode-firestore.md | Complete |
| 3. Architecture | architecture-firestore.md | Pending |
| 4. Refinement | refinement-firestore.md | Pending |
| 5. Completion | completion-firestore.md | Pending |

---

*Phase 2: Pseudocode - Complete*
