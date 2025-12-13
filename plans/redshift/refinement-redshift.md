# Amazon Redshift Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/redshift`

---

## 1. Edge Cases and Failure Modes

### 1.1 Connection Pool Exhaustion

```
Scenario: All connections in use, new request arrives

Detection:
- Pool acquire timeout reached
- Available queue empty
- In-use count equals max_size

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Implement connection request queuing with priority         │
│  2. Track waiting requests with metrics                        │
│  3. Exponential backoff on retries                             │
│  4. Surface pool pressure via health endpoint                  │
│  5. Auto-scale warning when utilization > 80%                  │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION acquire_with_backoff(pool, timeout_ms) -> Connection:
    attempts = 0
    max_attempts = 3

    WHILE attempts < max_attempts:
        TRY:
            remaining = timeout_ms - elapsed
            RETURN pool.acquire(remaining / max_attempts)
        CATCH PoolExhausted:
            attempts += 1
            IF attempts < max_attempts:
                backoff = min(100 * 2^attempts, remaining / 2)
                SLEEP backoff
                metrics.increment("connection.pool_wait_retry")

    metrics.increment("connection.pool_exhausted")
    RAISE PoolExhausted("Connection pool exhausted after {attempts} attempts")
```

### 1.2 Long-Running Query Timeout

```
Scenario: Query exceeds statement_timeout

Detection:
- PostgreSQL error code 57014 (query_canceled)
- Elapsed time approaches configured timeout

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Set statement_timeout per query based on expected duration │
│  2. Provide progress monitoring for async queries              │
│  3. Implement client-side timeout with query cancellation      │
│  4. Log timeout events with query metadata (not SQL text)      │
│  5. Surface in WLM queue metrics                               │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION execute_with_timeout(conn, query, timeout_ms) -> QueryResult:
    // Set server-side timeout
    execute_raw(conn, "SET statement_timeout TO {timeout_ms}")

    // Start client-side watchdog
    cancel_token = CancellationToken.new()
    watchdog = spawn_watchdog(conn.pid, timeout_ms + 5000, cancel_token)

    TRY:
        result = execute_raw(conn, query.sql)
        cancel_token.cancel()  // Stop watchdog
        RETURN result
    CATCH QueryCancelled:
        LOG warn "Query timed out" duration_ms=timeout_ms
        RAISE QueryTimeout {
            timeout_ms: timeout_ms,
            query_id: get_last_query_id(conn)
        }
    FINALLY:
        watchdog.stop()

FUNCTION spawn_watchdog(pid, timeout_ms, cancel_token):
    SPAWN ASYNC:
        SLEEP timeout_ms
        IF NOT cancel_token.is_cancelled():
            // Force cancel via separate connection
            admin_conn = get_admin_connection()
            execute_raw(admin_conn, "CANCEL {pid}")
            LOG warn "Watchdog cancelled query" pid=pid
```

### 1.3 IAM Token Expiration

```
Scenario: IAM database authentication token expires mid-session

Detection:
- Authentication error on existing connection
- Token age > 15 minutes (IAM token lifetime)

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Track token generation time per connection                 │
│  2. Proactively refresh before expiration (12 min threshold)   │
│  3. Mark connections as stale when token expires               │
│  4. Implement token caching with TTL                           │
│  5. Handle auth errors with connection recreation              │
└─────────────────────────────────────────────────────────────────┘

Implementation:
CLASS IamTokenManager:
    token: Option<Token>
    generated_at: Timestamp
    ttl_seconds: u64 = 900  // 15 minutes
    refresh_threshold: u64 = 720  // 12 minutes

    FUNCTION get_token(cluster, user) -> Token:
        IF token IS NULL OR is_expiring():
            token = aws_auth.get_db_auth_token(cluster, user)
            generated_at = now()
            metrics.increment("iam.token_refresh")
        RETURN token

    FUNCTION is_expiring() -> bool:
        age = now() - generated_at
        RETURN age.as_seconds() > refresh_threshold

    FUNCTION invalidate():
        token = None
```

### 1.4 COPY Data Errors

```
Scenario: COPY encounters malformed data exceeding MAXERROR

Detection:
- COPY command fails with load error
- STL_LOAD_ERRORS contains error details

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Pre-validate sample data before full COPY                  │
│  2. Use MAXERROR with reasonable threshold                     │
│  3. Capture and report first N errors for debugging            │
│  4. Support partial load reporting                             │
│  5. Provide error file location for analysis                   │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION copy_with_error_handling(client, cmd) -> CopyResult:
    start_time = now()

    TRY:
        execute_copy(client, cmd)

        // Check for errors even on success (when MAXERROR > 0)
        errors = get_load_errors(client, cmd.table, start_time)

        IF errors.len() > 0:
            LOG warn "COPY completed with errors"
                error_count=errors.len()
                sample=errors.take(5)

        RETURN CopyResult {
            success: true,
            rows_loaded: get_rows_loaded(client, cmd.table, start_time),
            errors: errors.len(),
            error_details: errors.take(100)
        }
    CATCH CopyError as e:
        errors = get_load_errors(client, cmd.table, start_time)

        LOG error "COPY failed"
            error_count=errors.len()
            first_error=errors.first()

        RETURN CopyResult {
            success: false,
            rows_loaded: 0,
            errors: errors.len(),
            error_details: errors,
            failure_reason: e.message
        }
```

### 1.5 Serialization Failures

```
Scenario: Concurrent transaction conflict in serializable isolation

Detection:
- SQL state 40001 (serialization_failure)
- Transaction aborted due to concurrent modification

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Implement automatic retry with exponential backoff         │
│  2. Add jitter to prevent thundering herd                      │
│  3. Limit retry attempts (default: 3)                          │
│  4. Track serialization failures in metrics                    │
│  5. Consider read-only transactions where applicable           │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION execute_in_transaction_with_retry<T>(
    client: RedshiftClient,
    operation: Fn(Transaction) -> T,
    max_attempts: u32 = 3
) -> T:
    FOR attempt IN 1..=max_attempts:
        TRY:
            tx = begin_transaction(client)
            result = operation(tx)
            commit(client, tx)

            IF attempt > 1:
                metrics.increment("transaction.retry_success")

            RETURN result
        CATCH SerializationFailure:
            rollback(client, tx)
            metrics.increment("transaction.serialization_failure")

            IF attempt < max_attempts:
                // Exponential backoff with jitter
                base_delay = 50 * 2^attempt
                jitter = random(0, base_delay / 2)
                SLEEP base_delay + jitter

                LOG warn "Serialization failure, retrying"
                    attempt=attempt
                    delay_ms=base_delay + jitter
            ELSE:
                LOG error "Serialization failure, max retries exceeded"
                RAISE
```

### 1.6 Spectrum Partition Overload

```
Scenario: Query scans too many S3 partitions

Detection:
- Query performance degradation
- Spectrum bytes scanned exceeds threshold
- Query hits 1M file/partition limit

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Validate partition filters before execution                │
│  2. Warn when partition count exceeds threshold                │
│  3. Implement query cost estimation                            │
│  4. Support partition limit configuration                      │
│  5. Provide partition pruning hints in explain                 │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION validate_spectrum_query(client, query) -> ValidationResult:
    // Get explain output
    plan = explain_query(client, query)

    // Check for Spectrum scan
    spectrum_scan = find_spectrum_scan(plan)
    IF spectrum_scan IS NULL:
        RETURN ValidationResult.ok()

    // Estimate partitions
    partition_count = estimate_partitions(spectrum_scan)

    IF partition_count > 100000:
        RETURN ValidationResult.warn(
            "Query may scan {partition_count} partitions. " +
            "Consider adding partition filters."
        )

    IF partition_count > 1000000:
        RETURN ValidationResult.error(
            "Query exceeds Spectrum partition limit"
        )

    RETURN ValidationResult.ok()
```

---

## 2. Security Hardening

### 2.1 SQL Injection Prevention

```
Requirement: All queries must use parameterized statements

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. NEVER interpolate user input into SQL strings              │
│  2. Use prepared statements for all queries                    │
│  3. Validate identifiers against allowlist                     │
│  4. Escape special characters in COPY/UNLOAD paths             │
│  5. Audit all SQL construction paths                           │
└─────────────────────────────────────────────────────────────────┘

FUNCTION validate_identifier(name: String) -> Result<String>:
    // Only allow alphanumeric, underscore, and reasonable length
    IF NOT name.matches(r"^[a-zA-Z_][a-zA-Z0-9_]{0,126}$"):
        RAISE InvalidIdentifier("Invalid identifier: {name}")

    // Check against reserved words
    IF RESERVED_WORDS.contains(name.to_uppercase()):
        RAISE InvalidIdentifier("Reserved word cannot be used: {name}")

    RETURN name

FUNCTION escape_s3_path(path: String) -> String:
    // Validate S3 path format
    IF NOT path.starts_with("s3://"):
        RAISE InvalidPath("S3 path must start with s3://")

    // Check for path traversal
    IF path.contains(".."):
        RAISE InvalidPath("Path traversal not allowed")

    // Escape single quotes for SQL
    RETURN path.replace("'", "''")
```

### 2.2 Credential Protection

```
Requirement: Credentials never exposed in logs or errors

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Use SecretString type for all credentials                  │
│  2. Implement Debug trait without exposing values              │
│  3. Sanitize error messages before logging                     │
│  4. Clear credentials from memory when not needed              │
│  5. Audit credential access patterns                           │
└─────────────────────────────────────────────────────────────────┘

CLASS SecretString:
    inner: String

    FUNCTION debug_format() -> String:
        RETURN "[REDACTED]"

    FUNCTION expose() -> &String:
        // Only callable in specific contexts
        RETURN &inner

    FUNCTION drop():
        // Zero memory before deallocation
        inner.bytes().fill(0)

FUNCTION sanitize_error(error: PostgresError) -> SanitizedError:
    message = error.message

    // Remove potential credential leaks
    message = message.replace_regex(r"password=\S+", "password=[REDACTED]")
    message = message.replace_regex(r"aws_access_key_id=\S+", "aws_access_key_id=[REDACTED]")

    // Remove query text (may contain sensitive data)
    message = message.replace_regex(r"DETAIL:.*$", "DETAIL: [REDACTED]")

    RETURN SanitizedError { message }
```

### 2.3 Network Security

```
Requirement: Enforce TLS for all connections

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Default to SslMode::VerifyFull in production               │
│  2. Validate CA certificates                                   │
│  3. Support certificate rotation                               │
│  4. Log TLS version and cipher negotiated                      │
│  5. Reject connections if TLS handshake fails                  │
└─────────────────────────────────────────────────────────────────┘

FUNCTION create_tls_config(ssl_mode: SslMode) -> TlsConfig:
    MATCH ssl_mode:
        Disable =>
            IF is_production():
                LOG warn "TLS disabled in production environment"
            RETURN TlsConfig.disabled()

        Require =>
            RETURN TlsConfig.require()

        VerifyCa { ca_cert } =>
            cert = load_certificate(ca_cert)
            RETURN TlsConfig.verify_ca(cert)

        VerifyFull { ca_cert } =>
            cert = load_certificate(ca_cert)
            RETURN TlsConfig.verify_full(cert)

FUNCTION validate_tls_connection(conn: Connection):
    tls_info = conn.get_tls_info()

    IF tls_info.version < TLS_1_2:
        LOG warn "Legacy TLS version" version=tls_info.version

    IF tls_info.cipher IN WEAK_CIPHERS:
        LOG warn "Weak cipher negotiated" cipher=tls_info.cipher

    metrics.set_gauge("connection.tls_version", tls_info.version)
```

### 2.4 Query Audit Logging

```
Requirement: Log query execution without exposing data

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Log query_id, duration, user, database                     │
│  2. NEVER log SQL text or parameter values                     │
│  3. Log row counts and byte metrics                            │
│  4. Include trace context for correlation                      │
│  5. Structured logging for analysis                            │
└─────────────────────────────────────────────────────────────────┘

FUNCTION log_query_execution(query_id, result, context):
    LOG info "Query executed"
        query_id = query_id
        duration_ms = result.execution_time_ms
        rows_returned = result.rows.len()
        user = context.user
        database = context.database
        query_group = context.query_group
        trace_id = context.trace_id
        // SQL text is intentionally omitted
```

---

## 3. Performance Optimization

### 3.1 Connection Pool Tuning

```
Optimization: Right-size pool based on workload

Recommendations:
┌─────────────────────────────────────────────────────────────────┐
│  Pool Size = (Core Count * 2) + Effective Spindle Count        │
│  For Redshift: Pool Size = WLM Slots * 2 (headroom)            │
│                                                                 │
│  min_connections: 2-5 (keep warm connections ready)            │
│  idle_timeout: 5-10 minutes (balance reuse vs resources)       │
│  max_lifetime: 30 minutes (handle credential rotation)         │
└─────────────────────────────────────────────────────────────────┘

FUNCTION calculate_optimal_pool_size(config) -> u32:
    // Get WLM configuration
    wlm_slots = get_total_wlm_slots(config)

    // Base pool size on WLM capacity
    base_size = wlm_slots * 2

    // Cap at Redshift connection limit
    max_size = min(base_size, 500)

    // Ensure minimum for responsiveness
    RETURN max(max_size, 5)
```

### 3.2 Query Batching

```
Optimization: Batch multiple small queries

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Collect queries within time window (10-50ms)               │
│  2. Execute as prepared statement batch                        │
│  3. Return results to original callers                         │
│  4. Fall back to individual execution on batch failure         │
└─────────────────────────────────────────────────────────────────┘

CLASS QueryBatcher:
    pending: Vec<PendingQuery>
    window_ms: u64 = 20
    max_batch_size: u32 = 100

    FUNCTION submit(query: Query) -> Future<QueryResult>:
        promise = Promise.new()
        pending.push(PendingQuery { query, promise })

        IF pending.len() >= max_batch_size:
            flush()
        ELSE:
            schedule_flush(window_ms)

        RETURN promise.future()

    FUNCTION flush():
        batch = pending.drain()

        IF batch.is_empty():
            RETURN

        TRY:
            // Group by SQL template
            groups = group_by_template(batch)

            FOR (template, queries) IN groups:
                results = batch_execute(template, queries)
                FOR (query, result) IN zip(queries, results):
                    query.promise.resolve(result)
        CATCH error:
            // Fall back to individual execution
            FOR query IN batch:
                TRY:
                    result = execute_single(query.query)
                    query.promise.resolve(result)
                CATCH e:
                    query.promise.reject(e)
```

### 3.3 Result Set Streaming

```
Optimization: Stream large results instead of buffering

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Use cursor-based fetching for results > 10,000 rows        │
│  2. Configure fetch_size based on row size estimate            │
│  3. Allow early termination without reading all data           │
│  4. Bound memory usage regardless of result size               │
└─────────────────────────────────────────────────────────────────┘

FUNCTION smart_execute(client, query) -> QueryResult | ResultStream:
    // First, get result metadata
    plan = explain_query(client, query)
    estimated_rows = plan.estimated_rows

    IF estimated_rows < 10000:
        // Small result: buffer entirely
        RETURN execute_query(client, query)
    ELSE:
        // Large result: stream
        LOG info "Streaming large result" estimated_rows=estimated_rows
        RETURN stream_results(client, query)

FUNCTION calculate_fetch_size(estimated_row_size_bytes) -> u32:
    // Target 1MB per fetch
    target_bytes = 1 * 1024 * 1024

    fetch_size = target_bytes / estimated_row_size_bytes

    // Clamp to reasonable range
    RETURN clamp(fetch_size, 100, 50000)
```

### 3.4 COPY Optimization

```
Optimization: Maximize COPY throughput

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Split large files into 1GB chunks for parallelism          │
│  2. Use manifest for explicit file control                     │
│  3. Match slice count to file count when possible              │
│  4. Pre-sort data by distribution/sort key                     │
│  5. Use columnar formats (Parquet) for compression             │
└─────────────────────────────────────────────────────────────────┘

FUNCTION optimize_copy_command(cmd: CopyCommand, cluster_info) -> CopyCommand:
    optimized = cmd.clone()

    // Recommend file count based on slices
    slice_count = cluster_info.slice_count

    IF cmd.source IS S3 { prefix, .. }:
        file_count = count_s3_files(cmd.source)

        IF file_count < slice_count:
            LOG warn "COPY parallelism limited"
                file_count=file_count
                slice_count=slice_count
                recommendation="Split files to match slice count"

    // Recommend format based on data
    IF cmd.format IS Csv AND cmd.estimated_size_gb > 10:
        LOG info "Consider Parquet format for large loads"

    // Recommend compression
    IF cmd.options.compression IS None AND cmd.estimated_size_gb > 1:
        optimized.options.compression = Some(Gzip)
        LOG info "Enabled GZIP compression for network efficiency"

    RETURN optimized
```

---

## 4. Resilience Patterns

### 4.1 Circuit Breaker Configuration

```
Configuration: Per-cluster circuit breaker

┌─────────────────────────────────────────────────────────────────┐
│  failure_threshold: 5       # Failures before opening          │
│  success_threshold: 3       # Successes to close               │
│  half_open_requests: 1      # Test requests when half-open     │
│  reset_timeout_ms: 30000    # Time before half-open            │
│  failure_rate_threshold: 50 # Percentage to trigger            │
│  slow_call_threshold_ms: 5000                                   │
│  slow_call_rate: 80         # Percentage of slow calls         │
└─────────────────────────────────────────────────────────────────┘

FUNCTION create_redshift_circuit_breaker(cluster_id) -> CircuitBreaker:
    RETURN CircuitBreaker.new(
        name: "redshift-{cluster_id}",
        config: CircuitBreakerConfig {
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration.seconds(30),
            failure_rate_threshold: 0.5,
            slow_call_threshold: Duration.seconds(5),
            slow_call_rate_threshold: 0.8,
            // Only count these as failures
            record_exceptions: [
                ConnectionFailed,
                Unavailable,
                InternalError
            ],
            // Don't count as failures
            ignore_exceptions: [
                InvalidSql,
                PermissionDenied,
                QueryCancelled
            ]
        }
    )
```

### 4.2 Retry Policy Configuration

```
Configuration: Error-specific retry behavior

┌─────────────────────────────────────────────────────────────────┐
│  Error Type          │ Retry │ Backoff    │ Max Attempts       │
│─────────────────────────────────────────────────────────────────│
│  ConnectionFailed    │ Yes   │ Exp + Jit  │ 3                  │
│  QueryTimeout        │ Yes   │ Linear     │ 2                  │
│  SerializationFailure│ Yes   │ Exp + Jit  │ 3                  │
│  OutOfMemory         │ Yes   │ Exp        │ 2 (reduce query)   │
│  ResourceBusy        │ Yes   │ Exp + Jit  │ 5                  │
│  SpectrumError       │ Yes   │ Exp        │ 2                  │
│  InvalidSql          │ No    │ -          │ -                  │
│  PermissionDenied    │ No    │ -          │ -                  │
└─────────────────────────────────────────────────────────────────┘

FUNCTION create_retry_policy() -> RetryPolicy:
    RETURN RetryPolicy.builder()
        .with_error_handler(ConnectionFailed, RetryConfig {
            max_attempts: 3,
            backoff: ExponentialBackoff {
                initial_ms: 100,
                max_ms: 5000,
                multiplier: 2.0,
                jitter: 0.2
            }
        })
        .with_error_handler(ResourceBusy, RetryConfig {
            max_attempts: 5,
            backoff: ExponentialBackoff {
                initial_ms: 500,
                max_ms: 30000,
                multiplier: 2.0,
                jitter: 0.3
            }
        })
        .with_default_non_retryable([
            InvalidSql,
            PermissionDenied,
            AuthenticationFailed,
            TableNotFound,
            ColumnNotFound
        ])
        .build()
```

### 4.3 Graceful Degradation

```
Strategy: Degrade gracefully under pressure

┌─────────────────────────────────────────────────────────────────┐
│  1. Shed load when pool exhausted (reject new requests)        │
│  2. Switch to read-only mode on leader failures                │
│  3. Fall back to cached results when available                 │
│  4. Queue requests when approaching WLM limits                 │
│  5. Reduce fetch size under memory pressure                    │
└─────────────────────────────────────────────────────────────────┘

CLASS DegradationManager:
    mode: DegradationMode = Normal

    FUNCTION check_and_adjust(metrics):
        pool_utilization = metrics.pool_in_use / metrics.pool_size
        wlm_utilization = metrics.wlm_running / metrics.wlm_slots
        error_rate = metrics.errors / metrics.total_requests

        IF pool_utilization > 0.95 OR wlm_utilization > 0.95:
            mode = LoadShedding
            LOG warn "Entering load shedding mode"
        ELSE IF error_rate > 0.5:
            mode = CircuitOpen
            LOG warn "High error rate, circuit open"
        ELSE IF pool_utilization > 0.8:
            mode = Throttling
            LOG info "Entering throttling mode"
        ELSE:
            mode = Normal

    FUNCTION should_accept_request(priority) -> bool:
        MATCH mode:
            Normal => true
            Throttling => priority >= Medium
            LoadShedding => priority == Critical
            CircuitOpen => false
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

```
Coverage Requirements:
┌─────────────────────────────────────────────────────────────────┐
│  Component                    │ Min Coverage │ Focus Areas     │
│─────────────────────────────────────────────────────────────────│
│  Query Builder                │ 95%          │ SQL generation  │
│  Type Conversions             │ 95%          │ Edge cases      │
│  Error Mapper                 │ 100%         │ All SQL states  │
│  Connection Pool              │ 90%          │ State machine   │
│  COPY/UNLOAD Builder          │ 95%          │ Option combos   │
│  Parameter Binding            │ 100%         │ Injection prev  │
└─────────────────────────────────────────────────────────────────┘

TEST "query builder escapes identifiers":
    builder = QueryBuilder.new()
    builder.select(["id", "name; DROP TABLE users"])

    ASSERT_RAISES InvalidIdentifier

TEST "connection pool handles timeout":
    pool = create_pool(max_size: 1)
    conn1 = pool.acquire(1000)  // Takes the only connection

    ASSERT_RAISES PoolExhausted:
        pool.acquire(100)  // Should timeout

TEST "copy builder validates s3 path":
    cmd = CopyCommand {
        source: S3 { bucket: "../etc/passwd", prefix: "" }
    }

    ASSERT_RAISES InvalidPath:
        build_copy_sql(cmd)
```

### 5.2 Integration Tests

```
Test Scenarios:
┌─────────────────────────────────────────────────────────────────┐
│  1. Full query lifecycle (prepare → execute → stream → close)  │
│  2. Transaction commit and rollback                            │
│  3. COPY from S3 with various formats                          │
│  4. UNLOAD to S3 with partitioning                             │
│  5. Connection pool under concurrent load                      │
│  6. WLM queue routing verification                             │
│  7. Spectrum query with Glue catalog                           │
│  8. Error handling for each error type                         │
└─────────────────────────────────────────────────────────────────┘

TEST "full query lifecycle with real cluster":
    client = create_test_client()

    // Create test table
    execute(client, "CREATE TEMP TABLE test_lifecycle (id INT, name VARCHAR)")

    // Insert data
    stmt = prepare(client, "ins", "INSERT INTO test_lifecycle VALUES ($1, $2)")
    execute_prepared(client, stmt, [1, "Alice"])
    execute_prepared(client, stmt, [2, "Bob"])

    // Query and stream
    stream = stream_results(client, Query {
        sql: "SELECT * FROM test_lifecycle ORDER BY id"
    })

    rows = collect_all(stream)
    ASSERT_EQ rows.len(), 2
    ASSERT_EQ rows[0].id, 1
    ASSERT_EQ rows[1].name, "Bob"
```

### 5.3 Simulation Tests

```
Mock Scenarios:
┌─────────────────────────────────────────────────────────────────┐
│  1. Simulate connection failures and recovery                  │
│  2. Inject serialization failures for transaction testing      │
│  3. Simulate WLM queue pressure                                │
│  4. Mock COPY errors with specific error codes                 │
│  5. Replay recorded production query sequences                 │
└─────────────────────────────────────────────────────────────────┘

TEST "handles connection failure with retry":
    mock = create_mock_client()
    mock.inject_error_sequence([
        ConnectionFailed,
        ConnectionFailed,
        Success(result)
    ])

    result = execute_query(mock, query)

    ASSERT result.is_ok()
    ASSERT_EQ mock.connection_attempts(), 3

TEST "transaction retries on serialization failure":
    mock = create_mock_client()
    attempt_count = 0

    mock.on_commit(() => {
        attempt_count += 1
        IF attempt_count < 3:
            RAISE SerializationFailure
    })

    execute_in_transaction(mock, (tx) => {
        query_in_transaction(tx, "UPDATE ...")
    })

    ASSERT_EQ attempt_count, 3
```

### 5.4 Performance Tests

```
Benchmarks:
┌─────────────────────────────────────────────────────────────────┐
│  Test                         │ Target         │ Threshold     │
│─────────────────────────────────────────────────────────────────│
│  Connection acquire (pooled)  │ < 1ms          │ P99 < 5ms     │
│  Simple query execution       │ < 50ms         │ P99 < 200ms   │
│  Prepared statement execute   │ < 30ms         │ P99 < 100ms   │
│  1GB COPY (Parquet, parallel) │ < 60s          │ < 120s        │
│  10M row UNLOAD               │ < 120s         │ < 240s        │
│  Connection pool (100 conc)   │ No exhaustion  │ < 5% waits    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Observability Enhancements

### 6.1 Health Check Endpoint

```
FUNCTION health_check(client) -> HealthStatus:
    checks = []

    // Connection pool health
    pool_stats = client.pool.stats()
    checks.push(HealthCheck {
        name: "connection_pool",
        status: IF pool_stats.available > 0 THEN Healthy ELSE Degraded,
        details: {
            available: pool_stats.available,
            in_use: pool_stats.in_use,
            max: pool_stats.max
        }
    })

    // Cluster connectivity
    TRY:
        execute_raw(client, "SELECT 1", timeout: 5000)
        checks.push(HealthCheck {
            name: "cluster_connectivity",
            status: Healthy
        })
    CATCH error:
        checks.push(HealthCheck {
            name: "cluster_connectivity",
            status: Unhealthy,
            error: error.message
        })

    // Circuit breaker state
    cb_state = client.circuit_breaker.state()
    checks.push(HealthCheck {
        name: "circuit_breaker",
        status: IF cb_state == Closed THEN Healthy
                ELSE IF cb_state == HalfOpen THEN Degraded
                ELSE Unhealthy
    })

    overall = IF checks.all(c => c.status == Healthy) THEN Healthy
              ELSE IF checks.any(c => c.status == Unhealthy) THEN Unhealthy
              ELSE Degraded

    RETURN HealthStatus { overall, checks }
```

### 6.2 Diagnostic Queries

```
FUNCTION get_diagnostics(client) -> Diagnostics:
    conn = client.pool.acquire(5000)

    TRY:
        // Running queries
        running = execute_raw(conn, """
            SELECT query, pid, elapsed_time, state
            FROM STV_RECENTS
            WHERE status = 'Running'
        """)

        // WLM state
        wlm = execute_raw(conn, """
            SELECT service_class, num_executing_queries, num_queued_queries
            FROM STV_WLM_SERVICE_CLASS_STATE
        """)

        // Recent errors
        errors = execute_raw(conn, """
            SELECT query, error, starttime
            FROM STL_ERROR
            WHERE starttime > DATEADD(hour, -1, GETDATE())
            ORDER BY starttime DESC
            LIMIT 10
        """)

        // Disk usage
        disk = execute_raw(conn, """
            SELECT SUM(used) as used_mb, SUM(capacity) as capacity_mb
            FROM STV_PARTITIONS
        """)

        RETURN Diagnostics { running, wlm, errors, disk }
    FINALLY:
        client.pool.release(conn)
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-redshift.md | Complete |
| 2. Pseudocode | pseudocode-redshift.md | Complete |
| 3. Architecture | architecture-redshift.md | Complete |
| 4. Refinement | refinement-redshift.md | Complete |
| 5. Completion | completion-redshift.md | Pending |

---

*Phase 4: Refinement - Complete*
