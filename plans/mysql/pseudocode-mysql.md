# MySQL Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/database/mysql`

---

## 1. Client Initialization

```
FUNCTION create_mysql_client(config: MysqlConfig) -> MysqlClient:
    // Validate configuration
    validate_config(config)

    // Resolve credentials from secrets manager
    credentials = shared/secrets.get_credential(config.connection.credential_key)
    connection_config = config.connection.with_password(credentials)

    // Initialize primary connection pool
    primary_pool = create_connection_pool(
        config: connection_config,
        pool_config: config.pool
    )

    // Initialize replica pools if configured
    replica_pools = []
    IF config.replica IS NOT null:
        FOR replica_endpoint IN config.replica.replicas:
            replica_creds = shared/secrets.get_credential(replica_endpoint.credential_key)
            pool = create_connection_pool(
                config: replica_endpoint.config.with_password(replica_creds),
                pool_config: config.pool
            )
            replica_pools.append(ReplicaPool {
                pool: pool,
                weight: replica_endpoint.weight,
                priority: replica_endpoint.priority,
                healthy: true
            })

    // Initialize circuit breakers
    primary_breaker = shared/resilience.circuit_breaker("mysql_primary")
    replica_breakers = replica_pools.map(r => shared/resilience.circuit_breaker(r.endpoint))

    // Initialize load balancer
    load_balancer = create_load_balancer(
        strategy: config.replica?.load_balance_strategy ?? RoundRobin,
        replicas: replica_pools
    )

    RETURN MysqlClient {
        config: config,
        primary_pool: primary_pool,
        replica_pools: replica_pools,
        primary_breaker: primary_breaker,
        replica_breakers: replica_breakers,
        load_balancer: load_balancer,
        prepared_cache: LruCache::new(256)
    }
```

---

## 2. Connection Pool Management

### 2.1 Pool Creation

```
FUNCTION create_connection_pool(config: ConnectionConfig, pool_config: PoolConfig) -> ConnectionPool:
    pool = ConnectionPool {
        config: config,
        pool_config: pool_config,
        connections: ConcurrentQueue::new(),
        active_count: AtomicU32::new(0),
        total_count: AtomicU32::new(0),
        waiting_count: AtomicU32::new(0),
        stats: PoolStats::default()
    }

    // Pre-warm with minimum connections
    FOR i IN 0..pool_config.min_connections:
        TRY:
            conn = create_physical_connection(config)
            pool.connections.push(conn)
            pool.total_count.increment()
        CATCH error:
            log.warn("Failed to pre-warm connection", error=error)

    // Start background health checker
    spawn_health_checker(pool, pool_config.validation_interval_ms)

    RETURN pool
```

### 2.2 Connection Acquisition

```
FUNCTION acquire_connection(pool: ConnectionPool, timeout_ms: u64) -> Connection:
    start_time = now()
    pool.waiting_count.increment()

    DEFER:
        pool.waiting_count.decrement()

    LOOP:
        // Try to get idle connection
        IF let Some(conn) = pool.connections.try_pop():
            IF validate_connection(conn):
                conn.state = InUse
                conn.last_used_at = now()
                pool.active_count.increment()
                pool.stats.acquire_count.increment()
                RETURN conn
            ELSE:
                // Connection invalid, close and try again
                close_connection(conn)
                pool.total_count.decrement()
                CONTINUE

        // No idle connection, try to create new one
        IF pool.total_count.load() < pool.pool_config.max_connections:
            TRY:
                conn = create_physical_connection(pool.config)
                conn.state = InUse
                pool.total_count.increment()
                pool.active_count.increment()
                pool.stats.connections_created.increment()
                RETURN conn
            CATCH error:
                // Fall through to wait
                log.debug("Failed to create connection", error=error)

        // Wait for connection to become available
        elapsed = now() - start_time
        IF elapsed >= timeout_ms:
            pool.stats.acquire_timeout_count.increment()
            RAISE ConnectionAcquireTimeout(timeout_ms)

        remaining = timeout_ms - elapsed
        wait_result = pool.connections.wait_for_item(remaining)

        IF wait_result.is_timeout():
            pool.stats.acquire_timeout_count.increment()
            RAISE ConnectionAcquireTimeout(timeout_ms)
```

### 2.3 Connection Release

```
FUNCTION release_connection(pool: ConnectionPool, conn: Connection):
    pool.active_count.decrement()

    // Check if connection should be closed
    IF conn.state == Closed:
        pool.total_count.decrement()
        pool.stats.connections_closed.increment()
        RETURN

    // Check max lifetime
    IF now() - conn.created_at > pool.pool_config.max_lifetime_ms:
        close_connection(conn)
        pool.total_count.decrement()
        pool.stats.connections_closed.increment()
        RETURN

    // Check if in transaction (should not happen)
    IF conn.transaction_depth > 0:
        log.error("Connection released with open transaction, rolling back")
        TRY:
            execute_raw(conn, "ROLLBACK")
        CATCH:
            close_connection(conn)
            pool.total_count.decrement()
            RETURN

    // Reset connection state
    conn.state = Idle
    conn.last_used_at = now()

    // Return to pool
    pool.connections.push(conn)
```

### 2.4 Health Check

```
FUNCTION health_check_loop(pool: ConnectionPool, interval_ms: u64):
    LOOP:
        sleep(interval_ms)

        // Check idle connections
        idle_connections = pool.connections.drain_all()

        FOR conn IN idle_connections:
            // Check idle timeout
            IF now() - conn.last_used_at > pool.pool_config.idle_timeout_ms:
                IF pool.total_count.load() > pool.pool_config.min_connections:
                    close_connection(conn)
                    pool.total_count.decrement()
                    CONTINUE

            // Validate connection
            IF validate_connection(conn):
                pool.connections.push(conn)
            ELSE:
                close_connection(conn)
                pool.total_count.decrement()

        // Ensure minimum connections
        WHILE pool.total_count.load() < pool.pool_config.min_connections:
            TRY:
                conn = create_physical_connection(pool.config)
                pool.connections.push(conn)
                pool.total_count.increment()
            CATCH error:
                log.warn("Failed to maintain min connections", error=error)
                BREAK
```

---

## 3. Query Execution

### 3.1 Execute (Write Operations)

```
FUNCTION execute(
    client: MysqlClient,
    sql: String,
    params: Vec<Value>
) -> ExecuteResult:
    // Start trace span
    span = shared/observability.start_span("mysql.execute")
    span.set_attribute("db.statement", redact_query(sql))

    DEFER:
        span.end()

    // Route to primary for writes
    conn = acquire_primary_connection(client)

    DEFER:
        release_connection(client.primary_pool, conn)

    TRY:
        // Execute with retry for transient errors
        result = shared/resilience.with_retry(
            policy: client.config.retry_policy,
            operation: || execute_query_internal(conn, sql, params)
        )

        // Emit metrics
        shared/observability.emit_metric("mysql.execute.count", 1, tags={
            "operation": "execute",
            "status": "success"
        })

        RETURN result

    CATCH error:
        client.primary_breaker.record_failure()
        span.set_status(Error, error.message)
        shared/observability.emit_metric("mysql.execute.errors", 1, tags={
            "error_type": error.type
        })
        RAISE map_mysql_error(error)
```

### 3.2 Query (Read Operations)

```
FUNCTION query(
    client: MysqlClient,
    sql: String,
    params: Vec<Value>
) -> ResultSet:
    span = shared/observability.start_span("mysql.query")
    span.set_attribute("db.statement", redact_query(sql))

    DEFER:
        span.end()

    // Determine routing
    conn = IF should_route_to_replica(client, sql):
        acquire_replica_connection(client)
    ELSE:
        acquire_primary_connection(client)

    pool = get_pool_for_connection(client, conn)

    DEFER:
        release_connection(pool, conn)

    start_time = now()

    TRY:
        result = execute_query_internal(conn, sql, params)

        duration_ms = now() - start_time

        // Log slow queries
        IF duration_ms > client.config.slow_query_threshold_ms:
            log.warn("Slow query detected",
                duration_ms=duration_ms,
                query=redact_query(sql)
            )

        shared/observability.emit_metric("mysql.query.latency_ms", duration_ms)

        RETURN result

    CATCH error:
        RAISE map_mysql_error(error)
```

### 3.3 Query Streaming

```
FUNCTION query_stream(
    client: MysqlClient,
    sql: String,
    params: Vec<Value>,
    batch_size: u32
) -> RowStream:
    conn = acquire_replica_connection(client)

    // Set streaming mode
    execute_raw(conn, "SET SESSION net_write_timeout = 300")

    // Execute query with streaming result
    stream_result = execute_streaming(conn, sql, params)

    RETURN RowStream {
        connection: conn,
        result: stream_result,
        batch_size: batch_size,
        pool: get_pool_for_connection(client, conn),
        exhausted: false,

        // Iterator implementation
        next: FUNCTION() -> Option<Row>:
            IF self.exhausted:
                RETURN None

            row = self.result.fetch_row()
            IF row IS None:
                self.exhausted = true
                release_connection(self.pool, self.connection)
                RETURN None

            RETURN Some(row)
    }
```

### 3.4 Batch Execution

```
FUNCTION execute_batch(
    client: MysqlClient,
    statements: Vec<Query>
) -> Vec<ExecuteResult>:
    IF statements.len() > client.config.max_batch_size:
        RAISE BatchSizeLimitExceeded(statements.len(), client.config.max_batch_size)

    conn = acquire_primary_connection(client)

    DEFER:
        release_connection(client.primary_pool, conn)

    results = []

    // Execute each statement
    FOR stmt IN statements:
        TRY:
            result = execute_query_internal(conn, stmt.sql, stmt.params)
            results.append(result)
        CATCH error:
            // Include partial results in error
            RAISE BatchExecutionError(
                error: error,
                completed: results.len(),
                total: statements.len()
            )

    RETURN results
```

---

## 4. Prepared Statements

```
FUNCTION prepare(client: MysqlClient, sql: String) -> PreparedStatement:
    // Check cache first
    cache_key = hash(sql)
    IF let Some(stmt) = client.prepared_cache.get(cache_key):
        RETURN stmt

    conn = acquire_primary_connection(client)

    DEFER:
        release_connection(client.primary_pool, conn)

    // Prepare statement on server
    stmt_id = mysql_prepare(conn, sql)
    columns = mysql_get_statement_columns(conn, stmt_id)
    param_count = mysql_get_param_count(conn, stmt_id)

    stmt = PreparedStatement {
        id: stmt_id,
        sql: sql,
        param_count: param_count,
        columns: columns
    }

    // Cache for reuse
    client.prepared_cache.insert(cache_key, stmt)

    RETURN stmt

FUNCTION execute_prepared(
    client: MysqlClient,
    stmt: PreparedStatement,
    params: Vec<Value>
) -> ResultSet:
    IF params.len() != stmt.param_count:
        RAISE ParameterCountMismatch(expected=stmt.param_count, got=params.len())

    conn = acquire_primary_connection(client)

    DEFER:
        release_connection(client.primary_pool, conn)

    RETURN mysql_execute_prepared(conn, stmt.id, params)
```

---

## 5. Transaction Management

### 5.1 Begin Transaction

```
FUNCTION begin_transaction(
    client: MysqlClient,
    options: TransactionOptions
) -> Transaction:
    // Transactions always go to primary
    conn = acquire_primary_connection(client)

    // Set isolation level if specified
    IF options.isolation_level IS NOT null:
        level_sql = MATCH options.isolation_level:
            ReadUncommitted => "READ UNCOMMITTED"
            ReadCommitted => "READ COMMITTED"
            RepeatableRead => "REPEATABLE READ"
            Serializable => "SERIALIZABLE"

        execute_raw(conn, "SET TRANSACTION ISOLATION LEVEL " + level_sql)

    // Set read-only if specified
    IF options.read_only:
        execute_raw(conn, "SET TRANSACTION READ ONLY")

    // Begin transaction
    execute_raw(conn, "BEGIN")

    conn.state = InTransaction
    conn.transaction_depth = 1

    RETURN Transaction {
        id: generate_transaction_id(),
        connection: conn,
        isolation_level: options.isolation_level ?? RepeatableRead,
        started_at: now(),
        savepoints: [],
        client: client
    }
```

### 5.2 Commit and Rollback

```
FUNCTION commit(tx: Transaction):
    IF tx.connection.state != InTransaction:
        RAISE TransactionNotActive

    TRY:
        execute_raw(tx.connection, "COMMIT")
        tx.connection.state = Idle
        tx.connection.transaction_depth = 0

        shared/observability.emit_metric("mysql.transactions.committed", 1)

    FINALLY:
        release_connection(tx.client.primary_pool, tx.connection)

FUNCTION rollback(tx: Transaction):
    IF tx.connection.state != InTransaction:
        RAISE TransactionNotActive

    TRY:
        execute_raw(tx.connection, "ROLLBACK")
        tx.connection.state = Idle
        tx.connection.transaction_depth = 0

        shared/observability.emit_metric("mysql.transactions.rolled_back", 1)

    FINALLY:
        release_connection(tx.client.primary_pool, tx.connection)
```

### 5.3 Savepoints

```
FUNCTION savepoint(tx: Transaction, name: String) -> Savepoint:
    validate_savepoint_name(name)

    execute_raw(tx.connection, "SAVEPOINT " + escape_identifier(name))

    sp = Savepoint {
        name: name,
        created_at: now()
    }

    tx.savepoints.append(sp)
    tx.connection.transaction_depth += 1

    RETURN sp

FUNCTION rollback_to_savepoint(tx: Transaction, savepoint: Savepoint):
    // Verify savepoint exists
    IF NOT tx.savepoints.contains(savepoint):
        RAISE SavepointNotFound(savepoint.name)

    execute_raw(tx.connection, "ROLLBACK TO SAVEPOINT " + escape_identifier(savepoint.name))

    // Remove savepoints created after this one
    idx = tx.savepoints.index_of(savepoint)
    tx.savepoints.truncate(idx + 1)
    tx.connection.transaction_depth = idx + 1
```

### 5.4 Transaction Wrapper

```
FUNCTION with_transaction<T>(
    client: MysqlClient,
    options: TransactionOptions,
    operation: Fn(Transaction) -> T
) -> T:
    tx = begin_transaction(client, options)

    TRY:
        result = operation(tx)
        commit(tx)
        RETURN result

    CATCH error:
        TRY:
            rollback(tx)
        CATCH rollback_error:
            log.error("Rollback failed", error=rollback_error)

        RAISE error
```

---

## 6. Read/Write Routing

### 6.1 Route Decision

```
FUNCTION should_route_to_replica(client: MysqlClient, sql: String) -> bool:
    // Check if auto-routing is enabled
    IF NOT client.config.auto_route_reads:
        RETURN false

    // Check if replicas are configured
    IF client.replica_pools.is_empty():
        RETURN false

    // Parse statement type
    stmt_type = parse_statement_type(sql)

    // Write operations go to primary
    IF stmt_type IN [INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, LOCK, TRUNCATE]:
        RETURN false

    // Check for write hints
    IF sql.contains("/*+ PRIMARY */"):
        RETURN false

    // SELECT FOR UPDATE goes to primary
    IF stmt_type == SELECT AND sql.upper().contains("FOR UPDATE"):
        RETURN false

    RETURN true
```

### 6.2 Replica Selection

```
FUNCTION acquire_replica_connection(client: MysqlClient) -> Connection:
    // Get healthy replicas
    healthy_replicas = client.replica_pools.filter(r =>
        r.healthy AND
        NOT client.replica_breakers[r.endpoint].is_open()
    )

    IF healthy_replicas.is_empty():
        // Fall back to primary
        log.warn("No healthy replicas, falling back to primary")
        RETURN acquire_primary_connection(client)

    // Select replica using load balancer
    selected = client.load_balancer.select(healthy_replicas)

    TRY:
        conn = acquire_connection(selected.pool, client.config.pool.acquire_timeout_ms)

        // Check replica lag
        lag = check_replica_lag(conn)
        IF lag > client.config.replica.max_replica_lag_ms:
            release_connection(selected.pool, conn)
            selected.healthy = false
            // Try next replica
            RETURN acquire_replica_connection(client)

        RETURN conn

    CATCH error:
        selected.healthy = false
        client.replica_breakers[selected.endpoint].record_failure()
        // Try next replica or fall back
        RETURN acquire_replica_connection(client)

FUNCTION check_replica_lag(conn: Connection) -> u64:
    result = execute_raw(conn, "SHOW SLAVE STATUS")

    IF result.rows.is_empty():
        // Not a replica or replication not configured
        RETURN 0

    seconds_behind = result.rows[0].get("Seconds_Behind_Master")

    IF seconds_behind IS null:
        // Replication not running
        RETURN u64::MAX

    RETURN seconds_behind * 1000  // Convert to milliseconds
```

---

## 7. Metadata Operations

```
FUNCTION list_tables(client: MysqlClient, database: String) -> Vec<TableInfo>:
    sql = "
        SELECT
            TABLE_NAME, TABLE_TYPE, ENGINE, ROW_FORMAT,
            TABLE_ROWS, AVG_ROW_LENGTH, DATA_LENGTH, INDEX_LENGTH,
            AUTO_INCREMENT, CREATE_TIME, UPDATE_TIME,
            TABLE_COLLATION, TABLE_COMMENT
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
    "

    result = query(client, sql, [database])

    RETURN result.rows.map(row => TableInfo {
        name: row.get("TABLE_NAME"),
        database: database,
        engine: row.get("ENGINE"),
        row_format: row.get("ROW_FORMAT"),
        rows: row.get("TABLE_ROWS"),
        avg_row_length: row.get("AVG_ROW_LENGTH"),
        data_length: row.get("DATA_LENGTH"),
        index_length: row.get("INDEX_LENGTH"),
        auto_increment: row.get("AUTO_INCREMENT"),
        create_time: row.get("CREATE_TIME"),
        update_time: row.get("UPDATE_TIME"),
        collation: row.get("TABLE_COLLATION"),
        comment: row.get("TABLE_COMMENT")
    })

FUNCTION describe_table(client: MysqlClient, database: String, table: String) -> Vec<ColumnInfo>:
    sql = "
        SELECT
            COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT,
            IS_NULLABLE, DATA_TYPE, COLUMN_TYPE,
            CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
            CHARACTER_SET_NAME, COLLATION_NAME,
            COLUMN_KEY, EXTRA, COLUMN_COMMENT
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
    "

    result = query(client, sql, [database, table])

    RETURN result.rows.map(row => ColumnInfo {
        name: row.get("COLUMN_NAME"),
        ordinal_position: row.get("ORDINAL_POSITION"),
        default: row.get("COLUMN_DEFAULT"),
        is_nullable: row.get("IS_NULLABLE") == "YES",
        data_type: row.get("DATA_TYPE"),
        column_type: row.get("COLUMN_TYPE"),
        max_length: row.get("CHARACTER_MAXIMUM_LENGTH"),
        numeric_precision: row.get("NUMERIC_PRECISION"),
        numeric_scale: row.get("NUMERIC_SCALE"),
        character_set: row.get("CHARACTER_SET_NAME"),
        collation: row.get("COLLATION_NAME"),
        column_key: parse_column_key(row.get("COLUMN_KEY")),
        extra: row.get("EXTRA"),
        comment: row.get("COLUMN_COMMENT")
    })

FUNCTION explain_query(client: MysqlClient, sql: String) -> Vec<ExplainResult>:
    explain_sql = "EXPLAIN " + sql

    result = query(client, explain_sql, [])

    RETURN result.rows.map(row => ExplainResult {
        id: row.get("id"),
        select_type: row.get("select_type"),
        table: row.get("table"),
        partitions: row.get("partitions"),
        access_type: parse_access_type(row.get("type")),
        possible_keys: row.get("possible_keys"),
        key: row.get("key"),
        key_len: row.get("key_len"),
        ref_: row.get("ref"),
        rows: row.get("rows"),
        filtered: row.get("filtered"),
        extra: row.get("Extra")
    })
```

---

## 8. Error Handling

```
FUNCTION map_mysql_error(error: MysqlDriverError) -> MysqlError:
    code = error.code

    MATCH code:
        2003 => ConnectionRefused(error.message)
        1045 => AuthenticationFailed(error.message)
        1049 => DatabaseNotFound(error.message)
        1146 => TableNotFound(error.message)
        1062 => DuplicateKey(error.message)
        1451, 1452 => ForeignKeyViolation(error.message)
        1406 => DataTooLong(error.message)
        1213 => DeadlockDetected(error.message)
        1205 => LockWaitTimeout(error.message)
        2006, 2013 => ConnectionLost(error.message)
        1040 => TooManyConnections(error.message)
        1064 => SyntaxError(error.message)
        1142 => AccessDenied(error.message)
        1792 => ReadOnlyTransaction(error.message)
        _ => UnknownError(code, error.message)

FUNCTION is_retryable(error: MysqlError) -> bool:
    MATCH error:
        ConnectionRefused, DeadlockDetected, LockWaitTimeout,
        ConnectionLost, TooManyConnections, ServerGone => true
        _ => false
```

---

## 9. Simulation Support

```
STRUCT MockMysqlClient:
    query_responses: HashMap<String, ResultSet>
    execute_responses: HashMap<String, ExecuteResult>
    error_injections: HashMap<String, MysqlError>
    operation_log: Vec<RecordedOperation>
    transaction_state: TransactionState

FUNCTION create_mock_client() -> MockMysqlClient:
    RETURN MockMysqlClient {
        query_responses: HashMap::new(),
        execute_responses: HashMap::new(),
        error_injections: HashMap::new(),
        operation_log: Vec::new(),
        transaction_state: None
    }

FUNCTION mock_query(mock: MockMysqlClient, sql: String, params: Vec<Value>) -> ResultSet:
    // Log operation
    mock.operation_log.push(RecordedOperation {
        type: "query",
        sql: sql,
        params: params,
        timestamp: now()
    })

    // Check for error injection
    IF let Some(error) = mock.error_injections.get(sql):
        RAISE error

    // Return configured response
    key = normalize_query(sql)
    IF let Some(response) = mock.query_responses.get(key):
        RETURN response.clone()

    // Default empty result
    RETURN ResultSet::empty()

FUNCTION record_and_replay(client: MysqlClient, recording_file: String) -> RecordingClient:
    RETURN RecordingClient {
        inner: client,
        recording: Vec::new(),
        file: recording_file,

        query: FUNCTION(sql, params) -> ResultSet:
            result = self.inner.query(sql, params)
            self.recording.push(RecordedQuery {
                sql: sql,
                params: params,
                result: result.clone()
            })
            RETURN result
    }
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-mysql.md | Complete |
| 2. Pseudocode | pseudocode-mysql.md | Complete |
| 3. Architecture | architecture-mysql.md | Pending |
| 4. Refinement | refinement-mysql.md | Pending |
| 5. Completion | completion-mysql.md | Pending |

---

*Phase 2: Pseudocode - Complete*
