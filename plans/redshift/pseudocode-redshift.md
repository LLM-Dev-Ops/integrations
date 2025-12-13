# Amazon Redshift Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/redshift`

---

## 1. Client Initialization

```
FUNCTION create_redshift_client(config: RedshiftConfig) -> RedshiftClient:
    // Validate configuration
    VALIDATE config.endpoint IS NOT empty
    VALIDATE config.pool_size > 0

    // Initialize credential provider via aws/auth
    credentials = aws_auth.create_credential_provider(config.credentials)

    // Create connection pool
    pool = ConnectionPool.new(
        endpoint: config.endpoint,
        credentials: credentials,
        min_size: config.min_connections,
        max_size: config.pool_size,
        connection_timeout: config.connection_timeout_ms,
        idle_timeout: config.idle_timeout_ms,
        max_lifetime: config.max_lifetime_ms
    )

    // Initialize resilience components
    circuit_breaker = resilience.create_circuit_breaker(
        name: "redshift-{config.endpoint.host}",
        failure_threshold: config.circuit_breaker_threshold,
        reset_timeout_ms: 30000
    )

    retry_policy = resilience.create_retry_policy(
        max_attempts: config.max_retries,
        base_delay_ms: config.retry_backoff_ms,
        retryable_errors: [ConnectionFailed, QueryTimeout, SerializationFailure,
                          OutOfMemory, ResourceBusy, SpectrumError]
    )

    // Warm up connection pool
    pool.warm_up(config.min_connections)

    RETURN RedshiftClient {
        config: config,
        pool: pool,
        credentials: credentials,
        circuit_breaker: circuit_breaker,
        retry_policy: retry_policy,
        metrics: observability.get_metrics_client("redshift")
    }

FUNCTION close_client(client: RedshiftClient):
    // Drain active connections gracefully
    client.pool.drain(timeout_ms: 30000)
    client.pool.close()
    LOG info "Redshift client closed"
```

---

## 2. Connection Pool Management

```
CLASS ConnectionPool:
    connections: Vec<PooledConnection>
    available: Queue<ConnectionId>
    in_use: Set<ConnectionId>
    config: PoolConfig
    mutex: Mutex

    FUNCTION acquire(timeout_ms: u64) -> Connection:
        deadline = now() + timeout_ms

        WHILE now() < deadline:
            WITH mutex.lock():
                // Try to get available connection
                IF available.not_empty():
                    conn_id = available.pop()
                    conn = connections.get(conn_id)

                    // Validate connection health
                    IF is_connection_valid(conn):
                        in_use.add(conn_id)
                        conn.last_used = now()
                        RETURN conn
                    ELSE:
                        // Connection stale, remove and try again
                        remove_connection(conn_id)
                        CONTINUE

                // Create new connection if pool not full
                IF connections.len() < config.max_size:
                    conn = create_new_connection()
                    in_use.add(conn.id)
                    RETURN conn

            // Wait for connection to become available
            SLEEP min(100, deadline - now())

        RAISE ConnectionTimeout("Pool exhausted")

    FUNCTION release(conn: Connection):
        WITH mutex.lock():
            in_use.remove(conn.id)

            IF is_connection_valid(conn) AND connections.len() <= config.max_size:
                // Reset session state before returning to pool
                reset_session(conn)
                available.push(conn.id)
            ELSE:
                remove_connection(conn.id)

    FUNCTION is_connection_valid(conn: Connection) -> bool:
        // Check lifetime
        IF now() - conn.created_at > config.max_lifetime:
            RETURN false

        // Check idle time
        IF now() - conn.last_used > config.idle_timeout:
            RETURN false

        // Check connection state
        RETURN conn.state == Available OR conn.state == InUse

    FUNCTION create_new_connection() -> Connection:
        // Build connection string
        conn_str = build_connection_string(config.endpoint)

        // Get credentials (may involve IAM token generation)
        creds = credentials.get_current()

        // Establish connection with SSL
        raw_conn = pg_connect(conn_str, creds, ssl: config.endpoint.ssl_mode)

        conn = Connection {
            id: generate_connection_id(),
            raw: raw_conn,
            state: Available,
            created_at: now(),
            last_used: now(),
            session_params: {}
        }

        connections.add(conn)
        RETURN conn

    FUNCTION reset_session(conn: Connection):
        // Reset any session-specific settings
        execute_raw(conn, "RESET ALL")
        execute_raw(conn, "ABORT")  // Ensure no open transaction
        conn.session_params.clear()
```

---

## 3. Query Execution

```
FUNCTION execute_query(client: RedshiftClient, query: Query) -> QueryResult:
    span = observability.start_span("redshift.execute_query")
    start_time = now()

    TRY:
        // Check circuit breaker
        IF NOT client.circuit_breaker.allow_request():
            RAISE CircuitBreakerOpen("Redshift circuit breaker open")

        result = client.retry_policy.execute(() => {
            conn = client.pool.acquire(client.config.connection_timeout_ms)

            TRY:
                // Set query group if specified
                IF query.query_group IS NOT NULL:
                    execute_raw(conn, "SET query_group TO '{query.query_group}'")

                // Set statement timeout
                timeout = query.timeout_ms OR client.config.default_timeout_ms
                execute_raw(conn, "SET statement_timeout TO {timeout}")

                // Set label for identification
                IF query.label IS NOT NULL:
                    execute_raw(conn, "SET query_label TO '{query.label}'")

                // Execute parameterized query
                stmt = prepare_statement(conn, query.sql, query.parameters)
                raw_result = execute_prepared(conn, stmt, query.parameters)

                // Parse result
                result = parse_query_result(raw_result)
                result.execution_time_ms = now() - start_time

                client.circuit_breaker.record_success()
                RETURN result
            FINALLY:
                client.pool.release(conn)
        })

        // Record metrics
        client.metrics.record_histogram("query.duration_ms", result.execution_time_ms)
        client.metrics.increment("query.success")

        RETURN result
    CATCH error:
        client.circuit_breaker.record_failure()
        client.metrics.increment("query.error", tags: {error_type: error.type})
        span.record_error(error)
        RAISE
    FINALLY:
        span.end()

FUNCTION execute_query_async(client: RedshiftClient, query: Query) -> AsyncQueryHandle:
    span = observability.start_span("redshift.execute_query_async")

    TRY:
        conn = client.pool.acquire(client.config.connection_timeout_ms)

        TRY:
            // Use Redshift Data API style async execution
            // Submit query without waiting for results
            query_id = submit_async_query(conn, query)

            RETURN AsyncQueryHandle {
                query_id: query_id,
                status: Submitted,
                submitted_at: now()
            }
        FINALLY:
            client.pool.release(conn)
    FINALLY:
        span.end()

FUNCTION get_query_status(client: RedshiftClient, handle: AsyncQueryHandle) -> QueryStatus:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        // Query SVL_QLOG or STV_RECENTS for status
        result = execute_raw(conn, """
            SELECT status, elapsed_time, rows
            FROM STV_RECENTS
            WHERE query = {handle.query_id}
        """)

        IF result.is_empty():
            RETURN Submitted

        row = result.first()
        MATCH row.status:
            "Running" => RETURN Running { progress_pct: calculate_progress(row) }
            "Completed" => RETURN Completed { rows: row.rows }
            "Failed" => RETURN Failed { error: get_query_error(handle.query_id) }
            "Cancelled" => RETURN Cancelled
            _ => RETURN Queued
    FINALLY:
        client.pool.release(conn)

FUNCTION stream_results(client: RedshiftClient, query: Query) -> ResultStream:
    span = observability.start_span("redshift.stream_results")
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    // Create cursor-based streaming
    cursor_name = "cursor_{generate_id()}"

    TRY:
        // Begin transaction for cursor
        execute_raw(conn, "BEGIN")

        // Declare cursor
        execute_raw(conn, "DECLARE {cursor_name} CURSOR FOR {query.sql}")

        RETURN ResultStream {
            conn: conn,
            cursor: cursor_name,
            fetch_size: client.config.fetch_size,
            exhausted: false,

            FUNCTION next_batch() -> Option<Vec<Row>>:
                IF exhausted:
                    RETURN None

                result = execute_raw(conn, "FETCH {fetch_size} FROM {cursor_name}")

                IF result.rows.is_empty():
                    exhausted = true
                    execute_raw(conn, "CLOSE {cursor_name}")
                    execute_raw(conn, "COMMIT")
                    client.pool.release(conn)
                    RETURN None

                RETURN Some(result.rows)

            FUNCTION close():
                IF NOT exhausted:
                    execute_raw(conn, "CLOSE {cursor_name}")
                    execute_raw(conn, "ROLLBACK")
                    client.pool.release(conn)
        }
    CATCH error:
        execute_raw(conn, "ROLLBACK")
        client.pool.release(conn)
        RAISE
```

---

## 4. Prepared Statements

```
FUNCTION prepare(client: RedshiftClient, name: String, sql: String) -> PreparedStatement:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        // Parse SQL to extract parameter types
        param_types = infer_parameter_types(sql)

        // Prepare on server
        execute_raw(conn, "PREPARE {name} AS {sql}")

        RETURN PreparedStatement {
            name: name,
            sql: sql,
            param_types: param_types,
            connection_id: conn.id
        }
    FINALLY:
        client.pool.release(conn)

FUNCTION execute_prepared(client: RedshiftClient, stmt: PreparedStatement,
                          params: Vec<QueryParam>) -> QueryResult:
    span = observability.start_span("redshift.execute_prepared")

    TRY:
        // Validate parameter count and types
        VALIDATE params.len() == stmt.param_types.len()

        conn = client.pool.acquire(client.config.connection_timeout_ms)

        TRY:
            // Build EXECUTE command with parameters
            param_str = params.map(p => format_param(p)).join(", ")
            result = execute_raw(conn, "EXECUTE {stmt.name}({param_str})")

            RETURN parse_query_result(result)
        FINALLY:
            client.pool.release(conn)
    FINALLY:
        span.end()

FUNCTION batch_execute(client: RedshiftClient, stmt: PreparedStatement,
                       param_sets: Vec<Vec<QueryParam>>) -> Vec<QueryResult>:
    span = observability.start_span("redshift.batch_execute")
    results = []

    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        // Execute in transaction for atomicity
        execute_raw(conn, "BEGIN")

        FOR params IN param_sets:
            param_str = params.map(p => format_param(p)).join(", ")
            result = execute_raw(conn, "EXECUTE {stmt.name}({param_str})")
            results.push(parse_query_result(result))

        execute_raw(conn, "COMMIT")
        RETURN results
    CATCH error:
        execute_raw(conn, "ROLLBACK")
        RAISE
    FINALLY:
        client.pool.release(conn)
        span.end()

FUNCTION deallocate(client: RedshiftClient, stmt: PreparedStatement):
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        execute_raw(conn, "DEALLOCATE {stmt.name}")
    FINALLY:
        client.pool.release(conn)
```

---

## 5. Data Loading (COPY)

```
FUNCTION copy_from_s3(client: RedshiftClient, cmd: CopyCommand) -> CopyResult:
    span = observability.start_span("redshift.copy_from_s3")
    start_time = now()

    TRY:
        // Validate COPY command
        validate_copy_command(cmd)

        // Build COPY SQL
        copy_sql = build_copy_sql(cmd)

        LOG info "Starting COPY" table=cmd.table source=cmd.source

        conn = client.pool.acquire(client.config.connection_timeout_ms)

        TRY:
            // Execute COPY (can be long-running)
            execute_raw(conn, copy_sql, timeout: client.config.max_query_timeout_ms)

            // Get load statistics
            stats = get_copy_stats(conn, cmd.table)

            result = CopyResult {
                rows_loaded: stats.rows,
                errors: stats.errors,
                duration_ms: now() - start_time,
                bytes_scanned: stats.bytes
            }

            client.metrics.record_histogram("copy.duration_ms", result.duration_ms)
            client.metrics.record_counter("copy.rows_loaded", result.rows_loaded)

            LOG info "COPY completed" rows=result.rows_loaded duration_ms=result.duration_ms

            RETURN result
        FINALLY:
            client.pool.release(conn)
    FINALLY:
        span.end()

FUNCTION build_copy_sql(cmd: CopyCommand) -> String:
    sql = StringBuilder.new()

    sql.append("COPY {cmd.table.schema}.{cmd.table.name}")

    // Source
    MATCH cmd.source:
        S3 { bucket, prefix, manifest } =>
            path = "s3://{bucket}/{prefix}"
            IF manifest:
                sql.append(" FROM '{path}' MANIFEST")
            ELSE:
                sql.append(" FROM '{path}'")

        DynamoDB { table_name, read_ratio } =>
            sql.append(" FROM 'dynamodb://{table_name}'")
            sql.append(" READRATIO {read_ratio}")

    // IAM role
    sql.append(" IAM_ROLE '{cmd.options.iam_role}'")

    // Format
    MATCH cmd.format:
        Csv { delimiter, quote, header, .. } =>
            sql.append(" FORMAT CSV")
            sql.append(" DELIMITER '{delimiter}'")
            IF header: sql.append(" IGNOREHEADER 1")

        Json { json_paths, auto } =>
            IF auto:
                sql.append(" FORMAT JSON 'auto'")
            ELSE IF json_paths IS NOT NULL:
                sql.append(" FORMAT JSON '{json_paths}'")
            ELSE:
                sql.append(" FORMAT JSON 'auto ignorecase'")

        Parquet => sql.append(" FORMAT PARQUET")
        Orc => sql.append(" FORMAT ORC")
        Avro => sql.append(" FORMAT AVRO 'auto'")

    // Compression
    IF cmd.options.compression IS NOT NULL:
        MATCH cmd.options.compression:
            Gzip => sql.append(" GZIP")
            Lzop => sql.append(" LZOP")
            Bzip2 => sql.append(" BZIP2")
            Zstd => sql.append(" ZSTD")

    // Region
    IF cmd.options.region IS NOT NULL:
        sql.append(" REGION '{cmd.options.region}'")

    // Error handling
    IF cmd.options.max_errors > 0:
        sql.append(" MAXERROR {cmd.options.max_errors}")

    // Data handling options
    IF cmd.options.truncate_columns: sql.append(" TRUNCATECOLUMNS")
    IF cmd.options.blank_as_null: sql.append(" BLANKSASNULL")
    IF cmd.options.empty_as_null: sql.append(" EMPTYASNULL")

    RETURN sql.to_string()

FUNCTION get_load_errors(client: RedshiftClient, table: TableRef,
                         since: Timestamp) -> Vec<LoadError>:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        result = execute_raw(conn, """
            SELECT line_number, colname, err_code, err_reason, raw_field_value
            FROM STL_LOAD_ERRORS
            WHERE tbl = (SELECT id FROM stv_tbl_perm WHERE name = '{table.name}')
              AND starttime >= '{since}'
            ORDER BY starttime DESC
            LIMIT 100
        """)

        RETURN result.rows.map(row => LoadError {
            line_number: row.line_number,
            column_name: row.colname,
            error_code: row.err_code,
            error_message: row.err_reason,
            raw_value: row.raw_field_value
        })
    FINALLY:
        client.pool.release(conn)
```

---

## 6. Data Unloading (UNLOAD)

```
FUNCTION unload_to_s3(client: RedshiftClient, cmd: UnloadCommand) -> UnloadResult:
    span = observability.start_span("redshift.unload_to_s3")
    start_time = now()

    TRY:
        // Validate UNLOAD command
        validate_unload_command(cmd)

        // Build UNLOAD SQL
        unload_sql = build_unload_sql(cmd)

        LOG info "Starting UNLOAD" destination=cmd.destination.bucket

        conn = client.pool.acquire(client.config.connection_timeout_ms)

        TRY:
            // Execute UNLOAD
            execute_raw(conn, unload_sql, timeout: client.config.max_query_timeout_ms)

            // Get unload statistics
            stats = get_unload_stats(conn)

            result = UnloadResult {
                files_created: stats.files,
                rows_unloaded: stats.rows,
                bytes_written: stats.bytes,
                duration_ms: now() - start_time,
                manifest_path: IF cmd.options.manifest
                    THEN Some("{cmd.destination.bucket}/{cmd.destination.prefix}manifest")
                    ELSE None
            }

            LOG info "UNLOAD completed" files=result.files_created rows=result.rows_unloaded

            RETURN result
        FINALLY:
            client.pool.release(conn)
    FINALLY:
        span.end()

FUNCTION build_unload_sql(cmd: UnloadCommand) -> String:
    sql = StringBuilder.new()

    sql.append("UNLOAD ('{escape_sql(cmd.query)}')")
    sql.append(" TO 's3://{cmd.destination.bucket}/{cmd.destination.prefix}'")
    sql.append(" IAM_ROLE '{cmd.options.iam_role}'")

    // Format
    MATCH cmd.format:
        Csv { delimiter, header } =>
            sql.append(" FORMAT CSV")
            sql.append(" DELIMITER '{delimiter}'")
            IF header: sql.append(" HEADER")

        Parquet { compression } =>
            sql.append(" FORMAT PARQUET")
            MATCH compression:
                Snappy => sql.append(" COMPRESSION SNAPPY")
                Gzip => sql.append(" COMPRESSION GZIP")
                Zstd => sql.append(" COMPRESSION ZSTD")

        Json => sql.append(" FORMAT JSON")

    // Options
    IF cmd.options.parallel: sql.append(" PARALLEL ON")
    ELSE: sql.append(" PARALLEL OFF")

    IF cmd.options.max_file_size_mb != 6200:
        sql.append(" MAXFILESIZE {cmd.options.max_file_size_mb} MB")

    IF cmd.options.manifest: sql.append(" MANIFEST VERBOSE")
    IF cmd.options.allow_overwrite: sql.append(" ALLOWOVERWRITE")

    // Partitioning
    IF cmd.options.partition_by.not_empty():
        partition_cols = cmd.options.partition_by.join(", ")
        sql.append(" PARTITION BY ({partition_cols})")

    // Encryption
    IF cmd.options.encrypted:
        sql.append(" ENCRYPTED")
        IF cmd.options.kms_key_id IS NOT NULL:
            sql.append(" KMS_KEY_ID '{cmd.options.kms_key_id}'")

    RETURN sql.to_string()
```

---

## 7. Transaction Management

```
FUNCTION begin_transaction(client: RedshiftClient) -> Transaction:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        execute_raw(conn, "BEGIN TRANSACTION")

        RETURN Transaction {
            id: generate_transaction_id(),
            connection: conn,
            isolation: Serializable,
            state: Active,
            started_at: now()
        }
    CATCH error:
        client.pool.release(conn)
        RAISE

FUNCTION commit(client: RedshiftClient, tx: Transaction):
    VALIDATE tx.state == Active

    TRY:
        execute_raw(tx.connection, "COMMIT")
        tx.state = Committed

        LOG info "Transaction committed" tx_id=tx.id
    FINALLY:
        client.pool.release(tx.connection)

FUNCTION rollback(client: RedshiftClient, tx: Transaction):
    IF tx.state != Active:
        RETURN  // Already finished

    TRY:
        execute_raw(tx.connection, "ROLLBACK")
        tx.state = RolledBack

        LOG info "Transaction rolled back" tx_id=tx.id
    FINALLY:
        client.pool.release(tx.connection)

FUNCTION execute_in_transaction<T>(client: RedshiftClient,
                                   operation: Fn(Transaction) -> T) -> T:
    tx = begin_transaction(client)

    TRY:
        result = operation(tx)
        commit(client, tx)
        RETURN result
    CATCH error:
        rollback(client, tx)

        // Retry on serialization failure
        IF error IS SerializationFailure:
            LOG warn "Serialization failure, retrying" tx_id=tx.id
            RETURN execute_in_transaction(client, operation)

        RAISE

FUNCTION query_in_transaction(tx: Transaction, query: Query) -> QueryResult:
    VALIDATE tx.state == Active

    // Set query group if specified
    IF query.query_group IS NOT NULL:
        execute_raw(tx.connection, "SET query_group TO '{query.query_group}'")

    // Execute query
    stmt = prepare_statement(tx.connection, query.sql, query.parameters)
    raw_result = execute_prepared(tx.connection, stmt, query.parameters)

    RETURN parse_query_result(raw_result)
```

---

## 8. Workload Management

```
FUNCTION get_queue_state(client: RedshiftClient) -> Vec<QueueState>:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        result = execute_raw(conn, """
            SELECT
                service_class,
                name,
                num_query_tasks,
                query_working_mem,
                max_execution_time,
                user_group_wild_card,
                query_group_wild_card
            FROM STV_WLM_SERVICE_CLASS_CONFIG
            WHERE service_class > 5
            ORDER BY service_class
        """)

        queues = result.rows.map(row => WlmQueue {
            name: row.name,
            slots: row.num_query_tasks,
            memory_pct: calculate_memory_pct(row.query_working_mem),
            timeout_ms: row.max_execution_time * 1000,
            query_group: row.query_group_wild_card,
            user_group: parse_user_groups(row.user_group_wild_card)
        })

        // Get current queue state
        state_result = execute_raw(conn, """
            SELECT
                service_class,
                num_executing_queries,
                num_queued_queries,
                num_slots - num_executing_queries as available_slots
            FROM STV_WLM_SERVICE_CLASS_STATE
            WHERE service_class > 5
        """)

        RETURN queues.zip(state_result.rows).map((queue, state) => QueueState {
            queue: queue,
            running_queries: state.num_executing_queries,
            queued_queries: state.num_queued_queries,
            available_slots: state.available_slots
        })
    FINALLY:
        client.pool.release(conn)

FUNCTION set_query_group(client: RedshiftClient, conn: Connection, group: String):
    execute_raw(conn, "SET query_group TO '{group}'")
    conn.session_params.set("query_group", group)

FUNCTION get_running_queries(client: RedshiftClient) -> Vec<RunningQuery>:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        result = execute_raw(conn, """
            SELECT
                query,
                pid,
                usename,
                db_name,
                starttime,
                DATEDIFF(ms, starttime, GETDATE()) as elapsed_ms,
                state,
                SUBSTRING(text, 1, 500) as query_text,
                service_class
            FROM STV_RECENTS r
            JOIN PG_USER u ON r.user_id = u.usesysid
            WHERE status = 'Running'
            ORDER BY starttime DESC
        """)

        RETURN result.rows.map(row => RunningQuery {
            query_id: row.query,
            pid: row.pid,
            user: row.usename,
            database: row.db_name,
            start_time: row.starttime,
            elapsed_ms: row.elapsed_ms,
            state: row.state,
            query_text: row.query_text,
            queue: get_queue_name(row.service_class)
        })
    FINALLY:
        client.pool.release(conn)

FUNCTION cancel_query(client: RedshiftClient, query_id: QueryId):
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        // Get PID for query
        pid_result = execute_raw(conn, """
            SELECT pid FROM STV_RECENTS WHERE query = {query_id}
        """)

        IF pid_result.is_empty():
            LOG warn "Query not found for cancellation" query_id=query_id
            RETURN

        pid = pid_result.first().pid

        // Cancel the query
        execute_raw(conn, "CANCEL {pid}")

        LOG info "Query cancelled" query_id=query_id pid=pid
    FINALLY:
        client.pool.release(conn)
```

---

## 9. Spectrum (Federated Queries)

```
FUNCTION query_external(client: RedshiftClient,
                        schema: String,
                        query: Query) -> QueryResult:
    span = observability.start_span("redshift.spectrum_query")

    TRY:
        // Validate external schema exists
        validate_external_schema(client, schema)

        // Execute query (same as regular query)
        result = execute_query(client, query)

        // Record Spectrum-specific metrics
        client.metrics.increment("spectrum.queries")
        client.metrics.record_histogram("spectrum.bytes_scanned",
            get_spectrum_bytes_scanned(result.query_id))

        RETURN result
    FINALLY:
        span.end()

FUNCTION list_external_schemas(client: RedshiftClient) -> Vec<ExternalSchema>:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        result = execute_raw(conn, """
            SELECT
                schemaname,
                databasename,
                esoptions
            FROM SVV_EXTERNAL_SCHEMAS
        """)

        RETURN result.rows.map(row => ExternalSchema {
            name: row.schemaname,
            database: row.databasename,
            catalog: parse_catalog_options(row.esoptions)
        })
    FINALLY:
        client.pool.release(conn)

FUNCTION list_external_tables(client: RedshiftClient,
                              schema: String) -> Vec<ExternalTable>:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        result = execute_raw(conn, """
            SELECT
                schemaname,
                tablename,
                location,
                input_format,
                output_format,
                serialization_lib
            FROM SVV_EXTERNAL_TABLES
            WHERE schemaname = '{schema}'
        """)

        tables = []
        FOR row IN result.rows:
            // Get columns
            cols = get_external_table_columns(conn, schema, row.tablename)

            // Get partitions
            partitions = get_external_table_partitions(conn, schema, row.tablename)

            tables.push(ExternalTable {
                schema: row.schemaname,
                name: row.tablename,
                location: row.location,
                format: parse_format(row.input_format, row.serialization_lib),
                columns: cols,
                partitions: partitions
            })

        RETURN tables
    FINALLY:
        client.pool.release(conn)
```

---

## 10. Query Explain and Metrics

```
FUNCTION explain_query(client: RedshiftClient, query: Query) -> QueryPlan:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        result = execute_raw(conn, "EXPLAIN {query.sql}")

        RETURN QueryPlan {
            steps: parse_explain_output(result),
            estimated_cost: extract_cost(result),
            warnings: extract_warnings(result)
        }
    FINALLY:
        client.pool.release(conn)

FUNCTION get_query_metrics(client: RedshiftClient, query_id: QueryId) -> QueryMetrics:
    conn = client.pool.acquire(client.config.connection_timeout_ms)

    TRY:
        result = execute_raw(conn, """
            SELECT
                query,
                compile_time,
                queue_time,
                execution_time,
                rows,
                bytes,
                disk_spill,
                cpu_time,
                segments,
                step_count
            FROM SVL_QUERY_METRICS_SUMMARY
            WHERE query = {query_id}
        """)

        IF result.is_empty():
            RAISE QueryNotFound("Metrics not found for query {query_id}")

        row = result.first()
        RETURN QueryMetrics {
            query_id: query_id,
            compile_time_ms: row.compile_time / 1000,
            queue_time_ms: row.queue_time / 1000,
            execution_time_ms: row.execution_time / 1000,
            rows_returned: row.rows,
            bytes_scanned: row.bytes,
            disk_spill_mb: row.disk_spill / (1024 * 1024),
            cpu_time_ms: row.cpu_time / 1000,
            segments_scanned: row.segments,
            steps: row.step_count
        }
    FINALLY:
        client.pool.release(conn)
```

---

## 11. Error Handling

```
FUNCTION map_redshift_error(pg_error: PostgresError) -> RedshiftError:
    sql_state = pg_error.sql_state

    MATCH sql_state:
        // Connection errors
        starts_with "08" => ConnectionFailed {
            message: pg_error.message,
            retryable: true
        }

        // Authentication errors
        starts_with "28" => AuthenticationFailed {
            message: pg_error.message
        }

        // Query cancelled
        "57014" => QueryCancelled {
            query_id: extract_query_id(pg_error)
        }

        // Serialization failure
        "40001" => SerializationFailure {
            message: pg_error.message,
            retryable: true
        }

        // Resource errors
        "53100" => DiskFull { message: pg_error.message }
        "53200" => OutOfMemory {
            message: pg_error.message,
            retryable: true
        }
        "53300" => ResourceBusy {
            message: pg_error.message,
            retryable: true
        }

        // SQL errors
        starts_with "42" => MATCH sql_state:
            "42P01" => TableNotFound { table: extract_table(pg_error) }
            "42703" => ColumnNotFound { column: extract_column(pg_error) }
            "42501" => PermissionDenied { message: pg_error.message }
            _ => InvalidSql { message: pg_error.message, position: pg_error.position }

        // Data errors
        starts_with "22" => DataError {
            message: pg_error.message,
            detail: pg_error.detail
        }

        // Default
        _ => InternalError {
            sql_state: sql_state,
            message: pg_error.message
        }

FUNCTION handle_copy_error(error: PostgresError, cmd: CopyCommand) -> CopyError:
    // Check STL_LOAD_ERRORS for details
    errors = get_load_errors_recent(cmd.table)

    RETURN CopyError {
        source_error: map_redshift_error(error),
        load_errors: errors,
        partial_load: errors.len() < cmd.options.max_errors
    }
```

---

## 12. Simulation Layer

```
CLASS MockRedshiftClient:
    tables: Map<TableRef, MockTable>
    queries_executed: Vec<ExecutedQuery>
    config: MockConfig

    FUNCTION execute_query(query: Query) -> QueryResult:
        // Record query
        queries_executed.push(ExecutedQuery {
            sql: query.sql,
            params: query.parameters,
            timestamp: now()
        })

        // Check for configured response
        IF config.responses.contains(query.sql):
            RETURN config.responses.get(query.sql)

        // Parse and execute against in-memory tables
        parsed = parse_sql(query.sql)
        result = execute_in_memory(parsed, tables)

        // Simulate latency
        SLEEP config.simulated_latency_ms

        RETURN result

    FUNCTION copy_from_s3(cmd: CopyCommand) -> CopyResult:
        // Simulate COPY
        queries_executed.push(ExecutedQuery {
            sql: build_copy_sql(cmd),
            timestamp: now()
        })

        IF config.copy_results.contains(cmd.table):
            RETURN config.copy_results.get(cmd.table)

        // Default success
        RETURN CopyResult {
            rows_loaded: config.default_copy_rows,
            errors: 0,
            duration_ms: config.simulated_latency_ms,
            bytes_scanned: config.default_copy_rows * 100
        }

    FUNCTION inject_error(pattern: String, error: RedshiftError):
        config.error_injections.set(pattern, error)

    FUNCTION get_executed_queries() -> Vec<ExecutedQuery>:
        RETURN queries_executed.clone()

    FUNCTION reset():
        queries_executed.clear()
        tables.clear()

FUNCTION create_mock_client(config: MockConfig) -> MockRedshiftClient:
    RETURN MockRedshiftClient {
        tables: {},
        queries_executed: [],
        config: config
    }
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-redshift.md | Complete |
| 2. Pseudocode | pseudocode-redshift.md | Complete |
| 3. Architecture | architecture-redshift.md | Pending |
| 4. Refinement | refinement-redshift.md | Pending |
| 5. Completion | completion-redshift.md | Pending |

---

*Phase 2: Pseudocode - Complete*
