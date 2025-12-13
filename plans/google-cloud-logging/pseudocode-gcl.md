# Google Cloud Logging Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcl`

---

## 1. Core Client

### 1.1 GclClient Initialization

```pseudocode
CLASS GclClient:
    config: GclConfig
    auth: GcpAuthProvider
    transport: GrpcTransport
    buffer: LogBuffer
    circuit_breaker: CircuitBreaker
    flush_task: BackgroundTask

    FUNCTION new(config: GclConfig) -> Result<GclClient>:
        auth = resolve_auth_provider(config.credentials)
        transport = GrpcTransport::new(
            endpoint = "logging.googleapis.com:443",
            tls = TlsConfig::default()
        )
        buffer = LogBuffer::new(config.buffer_config)
        circuit_breaker = CircuitBreaker::new(config.circuit_breaker_config)

        client = GclClient { config, auth, transport, buffer, circuit_breaker }
        client.start_flush_task()
        RETURN Ok(client)

    FUNCTION start_flush_task():
        flush_task = spawn_background(async {
            LOOP:
                wait(config.flush_interval)
                IF buffer.should_flush():
                    self.flush_buffer().await
        })

    FUNCTION writer() -> LogWriter:
        RETURN LogWriter::new(self)

    FUNCTION querier() -> LogQuerier:
        RETURN LogQuerier::new(self)

    FUNCTION tailer() -> LogTailer:
        RETURN LogTailer::new(self)
```

### 1.2 Authentication Flow

```pseudocode
CLASS GcpAuthProvider:
    credentials: GcpCredentials
    token_cache: TokenCache

    FUNCTION get_token() -> Result<AccessToken>:
        // Check cache first
        IF token_cache.has_valid_token():
            RETURN Ok(token_cache.get())

        // Refresh or obtain new token
        token = MATCH credentials:
            ServiceAccountKey(key) => obtain_sa_token(key)
            WorkloadIdentity => fetch_metadata_token()
            ApplicationDefault => resolve_adc_token()

        token_cache.set(token, expiry = token.expires_at - 60s)
        RETURN Ok(token)

    FUNCTION obtain_sa_token(key: ServiceAccountKey) -> Result<AccessToken>:
        jwt = create_jwt(
            iss = key.client_email,
            scope = "https://www.googleapis.com/auth/logging.write",
            aud = "https://oauth2.googleapis.com/token",
            iat = now(),
            exp = now() + 3600s
        )
        signed_jwt = sign_rs256(jwt, key.private_key)

        response = http_post(
            url = "https://oauth2.googleapis.com/token",
            body = { grant_type: "jwt-bearer", assertion: signed_jwt }
        )
        RETURN parse_token_response(response)
```

---

## 2. Log Writer Service

### 2.1 Buffered Write Algorithm

```pseudocode
CLASS LogWriter:
    client: GclClient

    FUNCTION write(entry: LogEntry) -> Result<()>:
        // Validate entry
        validate_entry(entry)?

        // Add correlation context
        enriched = enrich_with_context(entry)

        // Add to buffer (non-blocking)
        IF NOT client.buffer.try_add(enriched):
            // Buffer full - force flush
            client.flush_buffer().await?
            client.buffer.add(enriched)

        // Check if immediate flush needed
        IF client.buffer.should_flush():
            spawn(client.flush_buffer())

        RETURN Ok(())

    FUNCTION write_batch(entries: Vec<LogEntry>) -> Result<BatchWriteResult>:
        validated = []
        errors = []

        FOR entry IN entries:
            TRY:
                validate_entry(entry)?
                validated.push(enrich_with_context(entry))
            CATCH e:
                errors.push((entry.insert_id, e))

        IF validated.is_empty():
            RETURN Err(WriteError::AllEntriesInvalid)

        // Write directly (bypass buffer for explicit batches)
        result = client.write_entries_direct(validated).await?

        RETURN Ok(BatchWriteResult {
            success_count: validated.len(),
            failures: errors
        })

    FUNCTION flush() -> Result<()>:
        RETURN client.flush_buffer().await
```

### 2.2 Buffer Management

```pseudocode
CLASS LogBuffer:
    entries: BoundedQueue<LogEntry>
    config: BufferConfig
    last_flush: Instant
    byte_size: AtomicUsize

    FUNCTION try_add(entry: LogEntry) -> bool:
        entry_size = estimate_size(entry)

        // Check byte limit
        IF byte_size.load() + entry_size > config.max_bytes:
            RETURN false

        // Check entry count
        IF entries.len() >= config.max_entries:
            RETURN false

        entries.push(entry)
        byte_size.fetch_add(entry_size)
        RETURN true

    FUNCTION should_flush() -> bool:
        RETURN entries.len() >= config.flush_threshold
            OR elapsed(last_flush) >= config.flush_interval
            OR byte_size.load() >= config.flush_byte_threshold

    FUNCTION drain() -> Vec<LogEntry>:
        drained = entries.drain_all()
        byte_size.store(0)
        last_flush = now()
        RETURN drained

    FUNCTION estimate_size(entry: LogEntry) -> usize:
        // Approximate JSON size
        base = 200  // Fixed overhead
        payload = entry.json_payload.map(|p| p.to_string().len()).unwrap_or(0)
        labels = entry.labels.iter().map(|(k,v)| k.len() + v.len() + 10).sum()
        RETURN base + payload + labels
```

### 2.3 Flush with Retry

```pseudocode
FUNCTION flush_buffer() -> Result<()>:
    entries = buffer.drain()
    IF entries.is_empty():
        RETURN Ok(())

    // Check circuit breaker
    IF circuit_breaker.is_open():
        // Re-queue entries and fail
        FOR entry IN entries:
            buffer.try_add(entry)
        RETURN Err(WriteError::CircuitOpen)

    // Batch into chunks respecting limits
    batches = chunk_entries(entries, max_batch_size = 1000, max_bytes = 10MB)

    FOR batch IN batches:
        result = retry_with_backoff(
            operation = || write_entries_rpc(batch),
            config = retry_config,
            is_retryable = |e| e.is_retryable()
        ).await

        MATCH result:
            Ok(_) => circuit_breaker.record_success()
            Err(e) IF e.is_retryable() =>
                circuit_breaker.record_failure()
                // Re-queue failed batch
                FOR entry IN batch:
                    buffer.try_add(entry)
            Err(e) =>
                circuit_breaker.record_failure()
                log_error("Permanent write failure", e)

    RETURN Ok(())

FUNCTION write_entries_rpc(entries: Vec<LogEntry>) -> Result<()>:
    token = auth.get_token().await?

    request = WriteLogEntriesRequest {
        log_name: format_log_name(config.project_id, config.log_id),
        resource: config.monitored_resource,
        labels: config.default_labels,
        entries: entries,
        partial_success: true
    }

    response = transport.call(
        method = "google.logging.v2.LoggingServiceV2/WriteLogEntries",
        request = request,
        metadata = { "authorization": "Bearer " + token }
    ).await?

    IF response.has_partial_errors():
        log_warn("Partial write failure", response.errors)

    RETURN Ok(())
```

---

## 3. Log Querier Service

### 3.1 Query with Pagination

```pseudocode
CLASS LogQuerier:
    client: GclClient

    FUNCTION query(request: QueryRequest) -> Result<QueryResponse>:
        validate_filter(request.filter)?
        validate_time_range(request.start_time, request.end_time)?

        token = client.auth.get_token().await?

        rpc_request = ListLogEntriesRequest {
            resource_names: [format_resource(request.resource)],
            filter: build_filter_string(request),
            order_by: request.order_by.unwrap_or("timestamp desc"),
            page_size: min(request.page_size, 1000),
            page_token: request.page_token
        }

        response = retry_with_backoff(
            operation = || client.transport.call(
                method = "google.logging.v2.LoggingServiceV2/ListLogEntries",
                request = rpc_request,
                metadata = { "authorization": "Bearer " + token }
            ),
            config = retry_config
        ).await?

        RETURN Ok(QueryResponse {
            entries: response.entries.map(parse_log_entry),
            next_page_token: response.next_page_token
        })

    FUNCTION query_all(request: QueryRequest) -> Stream<Result<LogEntry>>:
        // Auto-pagination stream
        RETURN async_stream! {
            page_token = None

            LOOP:
                response = self.query(QueryRequest {
                    ...request,
                    page_token: page_token
                }).await?

                FOR entry IN response.entries:
                    yield Ok(entry)

                IF response.next_page_token.is_none():
                    BREAK

                page_token = response.next_page_token
        }

    FUNCTION build_filter_string(request: QueryRequest) -> String:
        parts = []

        IF request.filter.is_some():
            parts.push(request.filter)

        IF request.start_time.is_some():
            parts.push(format!("timestamp >= \"{}\"", request.start_time.to_rfc3339()))

        IF request.end_time.is_some():
            parts.push(format!("timestamp <= \"{}\"", request.end_time.to_rfc3339()))

        IF request.severity_min.is_some():
            parts.push(format!("severity >= {}", request.severity_min))

        IF request.trace_id.is_some():
            parts.push(format!("trace = \"projects/{}/traces/{}\"",
                project_id, request.trace_id))

        RETURN parts.join(" AND ")
```

### 3.2 Correlation Query

```pseudocode
FUNCTION query_by_trace(trace_id: String, options: CorrelationOptions) -> Result<CorrelatedLogs>:
    // Query across multiple resources if specified
    resources = options.resources.unwrap_or([config.default_resource])

    // Build trace filter
    filter = format!("trace = \"projects/{}/traces/{}\"", project_id, trace_id)

    IF options.include_children:
        // Also query by span parent references
        filter = format!("({}) OR labels.parent_trace = \"{}\"", filter, trace_id)

    // Query with time bounds for efficiency
    request = QueryRequest {
        resource: resources,
        filter: filter,
        start_time: options.start_time.or(now() - 1h),
        end_time: options.end_time.or(now()),
        order_by: "timestamp asc"
    }

    entries = query_all(request).collect().await?

    // Group by span ID
    grouped = group_by(entries, |e| e.span_id)

    // Build correlation tree
    tree = build_span_tree(grouped)

    RETURN Ok(CorrelatedLogs {
        trace_id: trace_id,
        entries: entries,
        span_tree: tree,
        services: extract_unique_services(entries)
    })

FUNCTION build_span_tree(grouped: Map<SpanId, Vec<LogEntry>>) -> SpanNode:
    root = SpanNode { id: "root", children: [], entries: [] }
    nodes = Map::new()

    // First pass: create nodes
    FOR (span_id, entries) IN grouped:
        nodes.insert(span_id, SpanNode {
            id: span_id,
            children: [],
            entries: entries
        })

    // Second pass: link parent-child
    FOR (span_id, node) IN nodes:
        parent_id = node.entries[0].parent_span_id
        IF parent_id.is_some() AND nodes.contains(parent_id):
            nodes[parent_id].children.push(node)
        ELSE:
            root.children.push(node)

    RETURN root
```

---

## 4. Log Tailer Service

### 4.1 Streaming Tail

```pseudocode
CLASS LogTailer:
    client: GclClient

    FUNCTION tail(request: TailRequest) -> Result<TailStream>:
        validate_filter(request.filter)?

        token = client.auth.get_token().await?

        // Open bidirectional gRPC stream
        stream = client.transport.streaming_call(
            method = "google.logging.v2.LoggingServiceV2/TailLogEntries",
            metadata = { "authorization": "Bearer " + token }
        ).await?

        // Send initial request
        stream.send(TailLogEntriesRequest {
            resource_names: [format_resource(request.resource)],
            filter: request.filter,
            buffer_window: request.buffer_window.unwrap_or(10s)
        }).await?

        // Return wrapped stream with reconnection logic
        RETURN TailStream::new(stream, request, self.client)

CLASS TailStream:
    inner: GrpcStream
    request: TailRequest
    client: GclClient
    reconnect_attempts: u32

    FUNCTION next() -> Option<Result<LogEntry>>:
        LOOP:
            MATCH inner.next().await:
                Some(Ok(response)) =>
                    reconnect_attempts = 0
                    FOR entry IN response.entries:
                        RETURN Some(Ok(parse_log_entry(entry)))
                    // Handle suppression info
                    IF response.suppression_info.is_some():
                        log_warn("Entries suppressed", response.suppression_info)

                Some(Err(e)) IF is_retryable(e) =>
                    IF reconnect_attempts < MAX_RECONNECTS:
                        reconnect_attempts += 1
                        wait(backoff(reconnect_attempts))
                        inner = reconnect().await?
                        CONTINUE
                    ELSE:
                        RETURN Some(Err(e))

                Some(Err(e)) =>
                    RETURN Some(Err(e))

                None =>
                    // Stream ended, attempt reconnect
                    IF reconnect_attempts < MAX_RECONNECTS:
                        reconnect_attempts += 1
                        inner = reconnect().await?
                        CONTINUE
                    ELSE:
                        RETURN None

    FUNCTION reconnect() -> Result<GrpcStream>:
        token = client.auth.get_token().await?
        stream = client.transport.streaming_call(...).await?
        stream.send(request.clone()).await?
        RETURN stream
```

---

## 5. Entry Enrichment

### 5.1 Context Enrichment

```pseudocode
FUNCTION enrich_with_context(entry: LogEntry) -> LogEntry:
    enriched = entry.clone()

    // Add trace context from current span
    IF current_trace_context().is_some():
        ctx = current_trace_context()
        enriched.trace = format!("projects/{}/traces/{}", project_id, ctx.trace_id)
        enriched.span_id = ctx.span_id
        enriched.trace_sampled = ctx.sampled

    // Add default labels
    FOR (key, value) IN config.default_labels:
        IF NOT enriched.labels.contains_key(key):
            enriched.labels.insert(key, value)

    // Add source location if available
    IF entry.source_location.is_none() AND config.capture_source_location:
        enriched.source_location = capture_caller_location()

    // Add insert ID if missing
    IF entry.insert_id.is_none():
        enriched.insert_id = generate_insert_id()

    // Add timestamp if missing
    IF entry.timestamp.is_none():
        enriched.timestamp = now()

    RETURN enriched

FUNCTION generate_insert_id() -> String:
    // Unique ID for deduplication
    timestamp_part = now().timestamp_nanos().to_base36()
    random_part = random_bytes(8).to_base36()
    RETURN format!("{}-{}", timestamp_part, random_part)
```

---

## 6. Simulation Layer

### 6.1 Mock Client

```pseudocode
CLASS MockGclClient:
    recorded_writes: Vec<LogEntry>
    mock_responses: Map<String, QueryResponse>
    tail_entries: Vec<LogEntry>

    FUNCTION expect_write(matcher: EntryMatcher) -> Self:
        expected_writes.push(matcher)
        RETURN self

    FUNCTION with_query_response(filter: String, response: QueryResponse) -> Self:
        mock_responses.insert(filter, response)
        RETURN self

    FUNCTION with_tail_entries(entries: Vec<LogEntry>) -> Self:
        tail_entries = entries
        RETURN self

    FUNCTION verify() -> Result<()>:
        FOR matcher IN expected_writes:
            IF NOT recorded_writes.any(|e| matcher.matches(e)):
                RETURN Err(VerificationError::ExpectedWriteNotFound(matcher))
        RETURN Ok(())

CLASS MockLogWriter:
    mock: MockGclClient

    FUNCTION write(entry: LogEntry) -> Result<()>:
        mock.recorded_writes.push(entry.clone())
        RETURN Ok(())

CLASS MockLogQuerier:
    mock: MockGclClient

    FUNCTION query(request: QueryRequest) -> Result<QueryResponse>:
        IF mock.mock_responses.contains(request.filter):
            RETURN Ok(mock.mock_responses[request.filter].clone())
        RETURN Ok(QueryResponse::empty())
```

### 6.2 Record/Replay

```pseudocode
CLASS RecordingGclClient:
    inner: GclClient
    recording: Recording

    FUNCTION write(entry: LogEntry) -> Result<()>:
        result = inner.write(entry.clone()).await
        recording.record_write(entry, result.clone())
        RETURN result

    FUNCTION query(request: QueryRequest) -> Result<QueryResponse>:
        result = inner.query(request.clone()).await
        recording.record_query(request, result.clone())
        RETURN result

    FUNCTION save_recording(path: Path) -> Result<()>:
        json = serde_json::to_string_pretty(recording)?
        write_file(path, json)

CLASS ReplayGclClient:
    recording: Recording
    replay_index: AtomicUsize

    FUNCTION load(path: Path) -> Result<Self>:
        json = read_file(path)?
        recording = serde_json::from_str(json)?
        RETURN Ok(ReplayGclClient { recording, replay_index: 0 })

    FUNCTION query(request: QueryRequest) -> Result<QueryResponse>:
        idx = replay_index.fetch_add(1)
        recorded = recording.queries[idx]

        IF recorded.request != request:
            log_warn("Query mismatch", { expected: recorded.request, actual: request })

        RETURN recorded.response.clone()
```

---

## 7. Filter Parser

### 7.1 Filter Validation

```pseudocode
FUNCTION validate_filter(filter: String) -> Result<()>:
    tokens = tokenize(filter)
    ast = parse_filter_ast(tokens)?
    validate_ast(ast)?
    RETURN Ok(())

FUNCTION parse_filter_ast(tokens: Vec<Token>) -> Result<FilterAst>:
    // Recursive descent parser for filter expressions
    RETURN parse_or_expression(tokens)

FUNCTION parse_or_expression(tokens) -> Result<FilterAst>:
    left = parse_and_expression(tokens)?

    WHILE peek() == Token::Or:
        consume(Token::Or)
        right = parse_and_expression(tokens)?
        left = FilterAst::Or(left, right)

    RETURN left

FUNCTION parse_and_expression(tokens) -> Result<FilterAst>:
    left = parse_comparison(tokens)?

    WHILE peek() == Token::And:
        consume(Token::And)
        right = parse_comparison(tokens)?
        left = FilterAst::And(left, right)

    RETURN left

FUNCTION parse_comparison(tokens) -> Result<FilterAst>:
    field = parse_field_path(tokens)?
    op = parse_operator(tokens)?  // =, !=, >, >=, <, <=, :, =~
    value = parse_value(tokens)?

    RETURN FilterAst::Comparison(field, op, value)
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode phase |

---

**Next Phase:** Architecture - Module structure, data flow diagrams, state machines for buffer and tail stream management.
