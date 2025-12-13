# Pseudocode: PostgreSQL Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/postgresql`

---

## Table of Contents

1. [Core Structures](#1-core-structures)
2. [Connection Pool Management](#2-connection-pool-management)
3. [Query Execution](#3-query-execution)
4. [Transaction Management](#4-transaction-management)
5. [Read/Write Separation](#5-readwrite-separation)
6. [Streaming Results](#6-streaming-results)
7. [Bulk Operations](#7-bulk-operations)
8. [Notifications](#8-notifications)
9. [Simulation Layer](#9-simulation-layer)

---

## 1. Core Structures

### 1.1 Client Structure

```
STRUCT PgClient {
    config: Arc<PgConfig>,
    primary_pool: Arc<Pool>,
    replica_pools: Arc<Vec<Pool>>,
    router: Arc<ConnectionRouter>,
    credentials: Arc<dyn CredentialProvider>,
    simulation: Arc<SimulationLayer>,
    metrics: Arc<MetricsCollector>
}

STRUCT PgConfig {
    primary: ConnectionConfig,
    replicas: Vec<ConnectionConfig>,
    pool: PoolConfig,
    query_timeout: Duration,
    statement_cache_size: usize,
    simulation_mode: SimulationMode
}

STRUCT ConnectionConfig {
    host: String,
    port: u16,
    database: String,
    username: String,
    ssl_mode: SslMode,
    connect_timeout: Duration,
    application_name: String
}

STRUCT PoolConfig {
    min_connections: u32,
    max_connections: u32,
    acquire_timeout: Duration,
    idle_timeout: Duration,
    max_lifetime: Duration,
    health_check_interval: Duration
}
```

### 1.2 Value Types

```
ENUM Value {
    Null,
    Bool(bool),
    Int16(i16),
    Int32(i32),
    Int64(i64),
    Float32(f32),
    Float64(f64),
    Text(String),
    Bytea(Vec<u8>),
    Timestamp(DateTime<Utc>),
    TimestampTz(DateTime<Utc>),
    Date(NaiveDate),
    Time(NaiveTime),
    Uuid(Uuid),
    Json(serde_json::Value),
    Jsonb(serde_json::Value),
    Array(Vec<Value>),
    Numeric(Decimal),
    Interval(Duration)
}

IMPL Value {
    FUNCTION from_sql(type_oid: u32, bytes: &[u8]) -> Result<Value>:
        MATCH type_oid:
            BOOL_OID => Value::Bool(bytes[0] != 0),
            INT2_OID => Value::Int16(i16::from_be_bytes(bytes)),
            INT4_OID => Value::Int32(i32::from_be_bytes(bytes)),
            INT8_OID => Value::Int64(i64::from_be_bytes(bytes)),
            TEXT_OID | VARCHAR_OID => Value::Text(String::from_utf8(bytes)?),
            BYTEA_OID => Value::Bytea(bytes.to_vec()),
            TIMESTAMP_OID => Value::Timestamp(decode_timestamp(bytes)?),
            UUID_OID => Value::Uuid(Uuid::from_slice(bytes)?),
            JSONB_OID => Value::Jsonb(serde_json::from_slice(&bytes[1..])?),
            _ => Err(PgError::UnsupportedType { oid: type_oid })

    FUNCTION to_sql(&self) -> Result<(u32, Vec<u8>)>:
        MATCH self:
            Value::Null => (0, vec![]),
            Value::Bool(b) => (BOOL_OID, vec![*b as u8]),
            Value::Int32(i) => (INT4_OID, i.to_be_bytes().to_vec()),
            Value::Text(s) => (TEXT_OID, s.as_bytes().to_vec()),
            Value::Uuid(u) => (UUID_OID, u.as_bytes().to_vec()),
            // ... other types
}
```

---

## 2. Connection Pool Management

### 2.1 Pool Creation

```
IMPL PgClient {
    ASYNC FUNCTION new(config: PgConfig, credentials: Arc<dyn CredentialProvider>) -> Result<Self>:
        // Build primary pool
        primary_pool = create_pool(
            &config.primary,
            &config.pool,
            credentials.clone()
        ).await?

        // Build replica pools
        replica_pools = Vec::new()
        FOR replica_config IN &config.replicas:
            pool = create_pool(replica_config, &config.pool, credentials.clone()).await?
            replica_pools.push(pool)

        // Initialize router
        router = ConnectionRouter::new(
            primary_pool.clone(),
            replica_pools.clone()
        )

        RETURN Ok(Self {
            config: Arc::new(config),
            primary_pool,
            replica_pools: Arc::new(replica_pools),
            router: Arc::new(router),
            credentials,
            simulation: Arc::new(SimulationLayer::new()),
            metrics: Arc::new(MetricsCollector::new())
        })
}

ASYNC FUNCTION create_pool(
    config: &ConnectionConfig,
    pool_config: &PoolConfig,
    credentials: Arc<dyn CredentialProvider>
) -> Result<Pool>:
    // Get password from credential provider
    creds = credentials.get_credentials().await?

    // Build TLS config
    tls = build_tls_config(&config.ssl_mode)?

    // Create pool manager
    manager = Manager::new(
        format!("host={} port={} dbname={} user={}",
            config.host, config.port, config.database, config.username),
        tls
    )
    manager.set_password(creds.password.expose_secret())

    // Build pool
    pool = Pool::builder(manager)
        .min_size(pool_config.min_connections)
        .max_size(pool_config.max_connections)
        .wait_timeout(pool_config.acquire_timeout)
        .create_timeout(config.connect_timeout)
        .recycle_timeout(pool_config.max_lifetime)
        .build()?

    // Verify connectivity
    conn = pool.get().await?
    conn.execute("SELECT 1", &[]).await?

    RETURN Ok(pool)
```

### 2.2 Connection Acquisition

```
IMPL PgClient {
    ASYNC FUNCTION acquire(&self, intent: QueryIntent) -> Result<PooledConnection>:
        start = Instant::now()

        conn = MATCH intent:
            QueryIntent::Write => self.acquire_primary().await?,
            QueryIntent::Read => self.acquire_replica_or_primary().await?,
            QueryIntent::Transaction => self.acquire_primary().await?

        self.metrics.connection_acquire_time.observe(start.elapsed())
        RETURN Ok(conn)

    ASYNC FUNCTION acquire_primary(&self) -> Result<PooledConnection>:
        TRY:
            conn = timeout(
                self.config.pool.acquire_timeout,
                self.primary_pool.get()
            ).await??

            self.metrics.connections_acquired.inc_primary()
            RETURN Ok(conn)
        CATCH TimeoutError:
            self.metrics.connection_timeouts.inc()
            RETURN Err(PgError::AcquireTimeout)

    ASYNC FUNCTION acquire_replica_or_primary(&self) -> Result<PooledConnection>:
        IF self.replica_pools.is_empty():
            RETURN self.acquire_primary().await

        // Try replica first
        replica = self.router.select_replica().await
        TRY:
            conn = timeout(
                self.config.pool.acquire_timeout / 2,
                replica.get()
            ).await??

            self.metrics.connections_acquired.inc_replica()
            RETURN Ok(conn)
        CATCH _:
            // Fallback to primary
            RETURN self.acquire_primary().await
}
```

### 2.3 Health Checks

```
IMPL PgClient {
    ASYNC FUNCTION health_check(&self) -> Result<HealthStatus>:
        primary_healthy = self.check_pool_health(&self.primary_pool).await

        replica_status = Vec::new()
        FOR (i, pool) IN self.replica_pools.iter().enumerate():
            healthy = self.check_pool_health(pool).await
            lag = self.check_replica_lag(pool).await.ok()
            replica_status.push(ReplicaHealth {
                index: i,
                healthy,
                lag_bytes: lag
            })

        RETURN Ok(HealthStatus {
            primary: primary_healthy,
            replicas: replica_status,
            pool_stats: self.get_pool_stats()
        })

    ASYNC FUNCTION check_pool_health(&self, pool: &Pool) -> bool:
        TRY:
            conn = timeout(Duration::from_secs(5), pool.get()).await??
            result = conn.execute("SELECT 1", &[]).await?
            RETURN true
        CATCH _:
            RETURN false

    ASYNC FUNCTION check_replica_lag(&self, pool: &Pool) -> Result<u64>:
        conn = pool.get().await?
        row = conn.query_one(
            "SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)
             FROM pg_stat_replication LIMIT 1",
            &[]
        ).await?
        RETURN Ok(row.get::<_, i64>(0) as u64)
}
```

---

## 3. Query Execution

### 3.1 Simple Query

```
IMPL PgClient {
    ASYNC FUNCTION execute(&self, sql: &str, params: &[Value]) -> Result<u64>:
        // Simulation check
        IF self.simulation.is_replay_mode():
            RETURN self.simulation.replay_execute(sql, params).await

        conn = self.acquire(QueryIntent::Write).await?
        start = Instant::now()

        TRY:
            pg_params = convert_params(params)?
            result = timeout(
                self.config.query_timeout,
                conn.execute(sql, &pg_params)
            ).await??

            self.metrics.query_duration.observe("execute", start.elapsed())
            self.metrics.queries_total.inc("execute")

            // Record if in record mode
            IF self.simulation.is_record_mode():
                self.simulation.record_execute(sql, params, result).await

            RETURN Ok(result)
        CATCH e:
            self.metrics.query_errors.inc("execute")
            RETURN Err(map_pg_error(e))

    ASYNC FUNCTION query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>>:
        IF self.simulation.is_replay_mode():
            RETURN self.simulation.replay_query(sql, params).await

        conn = self.acquire(QueryIntent::Read).await?
        start = Instant::now()

        TRY:
            pg_params = convert_params(params)?
            rows = timeout(
                self.config.query_timeout,
                conn.query(sql, &pg_params)
            ).await??

            result = rows.iter()
                .map(|r| convert_row(r))
                .collect::<Result<Vec<_>>>()?

            self.metrics.query_duration.observe("query", start.elapsed())
            self.metrics.rows_returned.add(result.len() as u64)

            IF self.simulation.is_record_mode():
                self.simulation.record_query(sql, params, &result).await

            RETURN Ok(result)
        CATCH e:
            self.metrics.query_errors.inc("query")
            RETURN Err(map_pg_error(e))
}
```

### 3.2 Query Variants

```
IMPL PgClient {
    ASYNC FUNCTION query_one(&self, sql: &str, params: &[Value]) -> Result<Row>:
        rows = self.query(sql, params).await?

        IF rows.is_empty():
            RETURN Err(PgError::NoRows)
        IF rows.len() > 1:
            RETURN Err(PgError::TooManyRows { count: rows.len() })

        RETURN Ok(rows.into_iter().next().unwrap())

    ASYNC FUNCTION query_opt(&self, sql: &str, params: &[Value]) -> Result<Option<Row>>:
        rows = self.query(sql, params).await?

        IF rows.len() > 1:
            RETURN Err(PgError::TooManyRows { count: rows.len() })

        RETURN Ok(rows.into_iter().next())

    ASYNC FUNCTION query_scalar<T>(&self, sql: &str, params: &[Value]) -> Result<T>:
        row = self.query_one(sql, params).await?
        value = row.get(0)?
        RETURN T::try_from(value)

    ASYNC FUNCTION exists(&self, sql: &str, params: &[Value]) -> Result<bool>:
        wrapped = format!("SELECT EXISTS({})", sql)
        RETURN self.query_scalar::<bool>(&wrapped, params).await
}
```

### 3.3 Prepared Statements

```
IMPL PgClient {
    ASYNC FUNCTION prepare(&self, sql: &str) -> Result<PreparedStatement>:
        conn = self.acquire(QueryIntent::Read).await?

        stmt = conn.prepare_cached(sql).await?

        RETURN Ok(PreparedStatement {
            sql: sql.to_string(),
            param_types: stmt.params().to_vec(),
            column_types: stmt.columns().to_vec()
        })

    ASYNC FUNCTION execute_prepared(
        &self,
        stmt: &PreparedStatement,
        params: &[Value]
    ) -> Result<u64>:
        // Validate param count
        IF params.len() != stmt.param_types.len():
            RETURN Err(PgError::ParamCountMismatch {
                expected: stmt.param_types.len(),
                got: params.len()
            })

        RETURN self.execute(&stmt.sql, params).await

    ASYNC FUNCTION query_prepared(
        &self,
        stmt: &PreparedStatement,
        params: &[Value]
    ) -> Result<Vec<Row>>:
        IF params.len() != stmt.param_types.len():
            RETURN Err(PgError::ParamCountMismatch {
                expected: stmt.param_types.len(),
                got: params.len()
            })

        RETURN self.query(&stmt.sql, params).await
}
```

---

## 4. Transaction Management

### 4.1 Transaction Lifecycle

```
IMPL PgClient {
    ASYNC FUNCTION begin(&self) -> Result<Transaction>:
        RETURN self.begin_with_options(TransactionOptions::default()).await

    ASYNC FUNCTION begin_with_options(&self, options: TransactionOptions) -> Result<Transaction>:
        conn = self.acquire(QueryIntent::Transaction).await?

        // Build BEGIN statement
        begin_sql = build_begin_statement(&options)
        conn.execute(&begin_sql, &[]).await?

        txn_id = TransactionId::new()
        self.metrics.transactions_started.inc()

        RETURN Ok(Transaction {
            id: txn_id,
            conn,
            options,
            started_at: Instant::now(),
            savepoints: Vec::new(),
            committed: false,
            client: self.clone()
        })
}

FUNCTION build_begin_statement(options: &TransactionOptions) -> String:
    parts = vec!["BEGIN"]

    MATCH options.isolation:
        IsolationLevel::ReadCommitted => {},  // Default
        IsolationLevel::RepeatableRead => parts.push("ISOLATION LEVEL REPEATABLE READ"),
        IsolationLevel::Serializable => parts.push("ISOLATION LEVEL SERIALIZABLE"),
        IsolationLevel::ReadUncommitted => parts.push("ISOLATION LEVEL READ UNCOMMITTED")

    IF options.read_only:
        parts.push("READ ONLY")

    IF options.deferrable:
        parts.push("DEFERRABLE")

    RETURN parts.join(" ")
```

### 4.2 Transaction Operations

```
IMPL Transaction {
    ASYNC FUNCTION execute(&mut self, sql: &str, params: &[Value]) -> Result<u64>:
        pg_params = convert_params(params)?
        result = self.conn.execute(sql, &pg_params).await?
        RETURN Ok(result)

    ASYNC FUNCTION query(&mut self, sql: &str, params: &[Value]) -> Result<Vec<Row>>:
        pg_params = convert_params(params)?
        rows = self.conn.query(sql, &pg_params).await?
        RETURN rows.iter().map(convert_row).collect()

    ASYNC FUNCTION savepoint(&mut self, name: &str) -> Result<Savepoint>:
        validate_identifier(name)?
        self.conn.execute(&format!("SAVEPOINT {}", name), &[]).await?

        sp = Savepoint {
            name: name.to_string(),
            created_at: Instant::now()
        }
        self.savepoints.push(sp.clone())

        RETURN Ok(sp)

    ASYNC FUNCTION rollback_to(&mut self, savepoint: &Savepoint) -> Result<()>:
        self.conn.execute(
            &format!("ROLLBACK TO SAVEPOINT {}", savepoint.name),
            &[]
        ).await?

        // Remove savepoints created after this one
        pos = self.savepoints.iter().position(|s| s.name == savepoint.name)
        IF let Some(i) = pos:
            self.savepoints.truncate(i + 1)

        RETURN Ok(())

    ASYNC FUNCTION commit(mut self) -> Result<()>:
        self.conn.execute("COMMIT", &[]).await?
        self.committed = true
        self.client.metrics.transactions_committed.inc()
        self.client.metrics.transaction_duration.observe(self.started_at.elapsed())
        RETURN Ok(())

    ASYNC FUNCTION rollback(mut self) -> Result<()>:
        self.conn.execute("ROLLBACK", &[]).await?
        self.client.metrics.transactions_rolled_back.inc()
        RETURN Ok(())
}

// Auto-rollback on drop if not committed
IMPL Drop FOR Transaction {
    FUNCTION drop(&mut self):
        IF !self.committed:
            // Spawn rollback task
            spawn(async move {
                let _ = self.conn.execute("ROLLBACK", &[]).await;
            })
}
```

### 4.3 Transaction Helper

```
IMPL PgClient {
    ASYNC FUNCTION transaction<F, T>(&self, f: F) -> Result<T>
    WHERE F: AsyncFn(&mut Transaction) -> Result<T>:
        txn = self.begin().await?

        TRY:
            result = f(&mut txn).await?
            txn.commit().await?
            RETURN Ok(result)
        CATCH e:
            txn.rollback().await?
            RETURN Err(e)

    ASYNC FUNCTION transaction_with_retry<F, T>(
        &self,
        f: F,
        max_retries: u32
    ) -> Result<T>
    WHERE F: AsyncFn(&mut Transaction) -> Result<T>:
        retries = 0

        LOOP:
            TRY:
                RETURN self.transaction(f).await
            CATCH PgError::SerializationFailure:
                retries += 1
                IF retries >= max_retries:
                    RETURN Err(PgError::MaxRetriesExceeded)

                backoff = Duration::from_millis(10 * 2.pow(retries))
                sleep(backoff).await
            CATCH e:
                RETURN Err(e)
}
```

---

## 5. Read/Write Separation

### 5.1 Connection Router

```
STRUCT ConnectionRouter {
    primary: Arc<Pool>,
    replicas: Arc<Vec<Pool>>,
    replica_states: RwLock<Vec<ReplicaState>>,
    policy: RoutingPolicy,
    next_replica: AtomicUsize
}

STRUCT ReplicaState {
    healthy: bool,
    lag_bytes: u64,
    last_check: Instant,
    consecutive_failures: u32
}

IMPL ConnectionRouter {
    ASYNC FUNCTION select_replica(&self) -> &Pool:
        states = self.replica_states.read().await
        healthy_replicas: Vec<(usize, &ReplicaState)> = states.iter()
            .enumerate()
            .filter(|(_, s)| s.healthy && s.lag_bytes < MAX_ACCEPTABLE_LAG)
            .collect()

        IF healthy_replicas.is_empty():
            // All replicas unhealthy, return primary
            RETURN &self.primary

        MATCH self.policy:
            RoutingPolicy::RoundRobin =>
                idx = self.next_replica.fetch_add(1, Ordering::Relaxed)
                replica_idx = healthy_replicas[idx % healthy_replicas.len()].0
                RETURN &self.replicas[replica_idx]

            RoutingPolicy::LeastConnections =>
                // Find replica with fewest active connections
                min_idx = healthy_replicas.iter()
                    .min_by_key(|(i, _)| self.replicas[*i].status().available)
                    .map(|(i, _)| *i)
                    .unwrap_or(0)
                RETURN &self.replicas[min_idx]

            RoutingPolicy::Random =>
                idx = rand::random::<usize>() % healthy_replicas.len()
                RETURN &self.replicas[healthy_replicas[idx].0]

    ASYNC FUNCTION update_replica_state(&self, index: usize, healthy: bool, lag: Option<u64>):
        states = self.replica_states.write().await
        state = &mut states[index]

        state.healthy = healthy
        state.last_check = Instant::now()

        IF healthy:
            state.consecutive_failures = 0
            IF let Some(l) = lag:
                state.lag_bytes = l
        ELSE:
            state.consecutive_failures += 1
}
```

### 5.2 Lag-Aware Routing

```
IMPL PgClient {
    ASYNC FUNCTION query_with_max_lag(
        &self,
        sql: &str,
        params: &[Value],
        max_lag: Duration
    ) -> Result<Vec<Row>>:
        // Convert duration to approximate bytes (assuming 16MB/s WAL)
        max_lag_bytes = (max_lag.as_secs_f64() * 16_000_000.0) as u64

        // Find replica within lag tolerance
        states = self.router.replica_states.read().await
        suitable_replica = states.iter()
            .enumerate()
            .find(|(_, s)| s.healthy && s.lag_bytes <= max_lag_bytes)
            .map(|(i, _)| i)

        IF let Some(idx) = suitable_replica:
            conn = self.replica_pools[idx].get().await?
            pg_params = convert_params(params)?
            rows = conn.query(sql, &pg_params).await?
            RETURN rows.iter().map(convert_row).collect()
        ELSE:
            // Fallback to primary for consistent reads
            RETURN self.query_on_primary(sql, params).await

    ASYNC FUNCTION query_on_primary(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>>:
        conn = self.acquire_primary().await?
        pg_params = convert_params(params)?
        rows = conn.query(sql, &pg_params).await?
        RETURN rows.iter().map(convert_row).collect()
}
```

---

## 6. Streaming Results

### 6.1 Row Stream

```
IMPL PgClient {
    FUNCTION query_stream(
        &self,
        sql: &str,
        params: &[Value]
    ) -> impl Stream<Item = Result<Row>>:
        async_stream::try_stream! {
            conn = self.acquire(QueryIntent::Read).await?
            pg_params = convert_params(params)?

            row_stream = conn.query_raw(sql, &pg_params).await?
            pin_mut!(row_stream)

            WHILE let Some(pg_row) = row_stream.next().await:
                row = convert_row(&pg_row?)?
                self.metrics.rows_streamed.inc()
                yield row
        }

    ASYNC FUNCTION query_with_cursor(
        &self,
        sql: &str,
        params: &[Value],
        fetch_size: u32
    ) -> Result<Cursor>:
        conn = self.acquire(QueryIntent::Read).await?

        // Generate unique cursor name
        cursor_name = format!("cursor_{}", Uuid::new_v4().simple())

        // Declare cursor
        pg_params = convert_params(params)?
        conn.execute(
            &format!("DECLARE {} CURSOR FOR {}", cursor_name, sql),
            &pg_params
        ).await?

        RETURN Ok(Cursor {
            name: cursor_name,
            conn,
            fetch_size,
            exhausted: false
        })
}

IMPL Cursor {
    ASYNC FUNCTION fetch_next(&mut self) -> Result<Vec<Row>>:
        IF self.exhausted:
            RETURN Ok(vec![])

        rows = self.conn.query(
            &format!("FETCH {} FROM {}", self.fetch_size, self.name),
            &[]
        ).await?

        IF rows.is_empty():
            self.exhausted = true
            self.close().await?

        RETURN rows.iter().map(convert_row).collect()

    ASYNC FUNCTION close(&mut self) -> Result<()>:
        IF !self.exhausted:
            self.conn.execute(&format!("CLOSE {}", self.name), &[]).await?
            self.exhausted = true
        RETURN Ok(())
}

IMPL Drop FOR Cursor {
    FUNCTION drop(&mut self):
        IF !self.exhausted:
            spawn(async move {
                let _ = self.close().await;
            })
}
```

---

## 7. Bulk Operations

### 7.1 Batch Insert

```
IMPL PgClient {
    ASYNC FUNCTION batch_insert<T: ToRow>(
        &self,
        table: &str,
        columns: &[&str],
        rows: &[T]
    ) -> Result<u64>:
        IF rows.is_empty():
            RETURN Ok(0)

        validate_identifier(table)?
        FOR col IN columns:
            validate_identifier(col)?

        // Build INSERT statement with multiple value sets
        col_list = columns.join(", ")
        placeholders = build_batch_placeholders(columns.len(), rows.len())
        sql = format!(
            "INSERT INTO {} ({}) VALUES {}",
            table, col_list, placeholders
        )

        // Flatten all row values
        all_params: Vec<Value> = rows.iter()
            .flat_map(|r| r.to_values())
            .collect()

        RETURN self.execute(&sql, &all_params).await

    ASYNC FUNCTION batch_insert_chunked<T: ToRow>(
        &self,
        table: &str,
        columns: &[&str],
        rows: &[T],
        chunk_size: usize
    ) -> Result<u64>:
        total = 0u64

        FOR chunk IN rows.chunks(chunk_size):
            count = self.batch_insert(table, columns, chunk).await?
            total += count

        RETURN Ok(total)
}

FUNCTION build_batch_placeholders(col_count: usize, row_count: usize) -> String:
    row_placeholder = (1..=col_count)
        .map(|i| format!("${}", i))
        .collect::<Vec<_>>()
        .join(", ")

    (0..row_count)
        .map(|r| {
            let offset = r * col_count
            let adjusted = (1..=col_count)
                .map(|i| format!("${}", offset + i))
                .collect::<Vec<_>>()
                .join(", ")
            format!("({})", adjusted)
        })
        .collect::<Vec<_>>()
        .join(", ")
```

### 7.2 COPY Protocol

```
IMPL PgClient {
    ASYNC FUNCTION copy_in<R: AsyncRead>(
        &self,
        table: &str,
        columns: &[&str],
        reader: R,
        format: CopyFormat
    ) -> Result<u64>:
        validate_identifier(table)?

        conn = self.acquire(QueryIntent::Write).await?

        col_list = IF columns.is_empty() {
            "*".to_string()
        } ELSE {
            columns.join(", ")
        }

        format_clause = MATCH format:
            CopyFormat::Text => "FORMAT text",
            CopyFormat::Csv => "FORMAT csv, HEADER true",
            CopyFormat::Binary => "FORMAT binary"

        sink = conn.copy_in(
            &format!("COPY {} ({}) FROM STDIN WITH ({})", table, col_list, format_clause)
        ).await?

        pin_mut!(reader)
        copied = 0u64

        WHILE let Some(chunk) = reader.next().await:
            sink.send(chunk?).await?
            copied += chunk.len() as u64

        count = sink.finish().await?
        self.metrics.rows_copied_in.add(count)

        RETURN Ok(count)

    ASYNC FUNCTION copy_out<W: AsyncWrite>(
        &self,
        query: &str,
        writer: W,
        format: CopyFormat
    ) -> Result<u64>:
        conn = self.acquire(QueryIntent::Read).await?

        format_clause = MATCH format:
            CopyFormat::Text => "FORMAT text",
            CopyFormat::Csv => "FORMAT csv, HEADER true",
            CopyFormat::Binary => "FORMAT binary"

        stream = conn.copy_out(
            &format!("COPY ({}) TO STDOUT WITH ({})", query, format_clause)
        ).await?

        pin_mut!(writer)
        copied = 0u64

        WHILE let Some(chunk) = stream.next().await:
            writer.write_all(&chunk?).await?
            copied += chunk.len() as u64

        self.metrics.bytes_copied_out.add(copied)
        RETURN Ok(copied)
}
```

---

## 8. Notifications

### 8.1 LISTEN/NOTIFY

```
IMPL PgClient {
    ASYNC FUNCTION listen(&self, channel: &str) -> Result<NotificationStream>:
        validate_identifier(channel)?

        // Use dedicated connection for notifications
        conn = self.create_dedicated_connection().await?
        conn.execute(&format!("LISTEN {}", channel), &[]).await?

        stream = NotificationStream {
            conn,
            channels: vec![channel.to_string()],
            client: self.clone()
        }

        RETURN Ok(stream)

    ASYNC FUNCTION notify(&self, channel: &str, payload: &str) -> Result<()>:
        validate_identifier(channel)?

        conn = self.acquire(QueryIntent::Write).await?
        conn.execute(
            "SELECT pg_notify($1, $2)",
            &[&channel, &payload]
        ).await?

        self.metrics.notifications_sent.inc()
        RETURN Ok(())
}

IMPL NotificationStream {
    ASYNC FUNCTION add_channel(&mut self, channel: &str) -> Result<()>:
        validate_identifier(channel)?
        self.conn.execute(&format!("LISTEN {}", channel), &[]).await?
        self.channels.push(channel.to_string())
        RETURN Ok(())

    ASYNC FUNCTION remove_channel(&mut self, channel: &str) -> Result<()>:
        self.conn.execute(&format!("UNLISTEN {}", channel), &[]).await?
        self.channels.retain(|c| c != channel)
        RETURN Ok(())

    FUNCTION stream(&mut self) -> impl Stream<Item = Result<Notification>>:
        async_stream::try_stream! {
            LOOP:
                TRY:
                    notification = self.conn.notifications().next().await?
                    self.client.metrics.notifications_received.inc()
                    yield Notification {
                        channel: notification.channel().to_string(),
                        payload: notification.payload().to_string(),
                        pid: notification.process_id()
                    }
                CATCH e IF is_connection_error(&e):
                    // Reconnect and re-subscribe
                    self.reconnect().await?
        }

    ASYNC FUNCTION reconnect(&mut self) -> Result<()>:
        self.conn = self.client.create_dedicated_connection().await?
        FOR channel IN &self.channels:
            self.conn.execute(&format!("LISTEN {}", channel), &[]).await?
        RETURN Ok(())
}
```

---

## 9. Simulation Layer

### 9.1 Recording

```
STRUCT SimulationRecorder {
    recordings: RwLock<Vec<Recording>>,
    output_path: PathBuf
}

STRUCT Recording {
    query_fingerprint: String,
    params_hash: String,
    result: RecordedResult,
    timestamp: DateTime<Utc>
}

ENUM RecordedResult {
    Rows(Vec<Row>),
    RowCount(u64),
    Error(String)
}

IMPL SimulationRecorder {
    FUNCTION fingerprint_query(sql: &str) -> String:
        // Normalize query for matching
        normalized = sql
            .replace(char::is_whitespace, " ")
            .trim()
            .to_lowercase()

        // Hash for compact storage
        RETURN format!("{:x}", Sha256::digest(normalized.as_bytes()))

    FUNCTION hash_params(params: &[Value]) -> String:
        json = serde_json::to_string(params).unwrap_or_default()
        RETURN format!("{:x}", Sha256::digest(json.as_bytes()))

    ASYNC FUNCTION record_query(&self, sql: &str, params: &[Value], rows: &[Row]):
        recording = Recording {
            query_fingerprint: Self::fingerprint_query(sql),
            params_hash: Self::hash_params(params),
            result: RecordedResult::Rows(rows.clone()),
            timestamp: Utc::now()
        }

        recordings = self.recordings.write().await
        recordings.push(recording)

    ASYNC FUNCTION record_execute(&self, sql: &str, params: &[Value], count: u64):
        recording = Recording {
            query_fingerprint: Self::fingerprint_query(sql),
            params_hash: Self::hash_params(params),
            result: RecordedResult::RowCount(count),
            timestamp: Utc::now()
        }

        recordings = self.recordings.write().await
        recordings.push(recording)

    ASYNC FUNCTION save(&self) -> Result<()>:
        recordings = self.recordings.read().await
        json = serde_json::to_string_pretty(&*recordings)?
        fs::write(&self.output_path, json).await?
        RETURN Ok(())
}
```

### 9.2 Replay

```
STRUCT SimulationReplayer {
    recordings: HashMap<(String, String), Recording>
}

IMPL SimulationReplayer {
    FUNCTION load(path: &Path) -> Result<Self>:
        content = fs::read_to_string(path)?
        recordings_vec: Vec<Recording> = serde_json::from_str(&content)?

        recordings = HashMap::new()
        FOR rec IN recordings_vec:
            key = (rec.query_fingerprint.clone(), rec.params_hash.clone())
            recordings.insert(key, rec)

        RETURN Ok(Self { recordings })

    ASYNC FUNCTION replay_query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>>:
        fingerprint = SimulationRecorder::fingerprint_query(sql)
        params_hash = SimulationRecorder::hash_params(params)

        recording = self.recordings.get(&(fingerprint, params_hash))
            .ok_or(PgError::SimulationMismatch { sql: sql.to_string() })?

        MATCH &recording.result:
            RecordedResult::Rows(rows) => Ok(rows.clone()),
            RecordedResult::Error(e) => Err(PgError::SimulatedError { message: e.clone() }),
            _ => Err(PgError::SimulationTypeMismatch)

    ASYNC FUNCTION replay_execute(&self, sql: &str, params: &[Value]) -> Result<u64>:
        fingerprint = SimulationRecorder::fingerprint_query(sql)
        params_hash = SimulationRecorder::hash_params(params)

        recording = self.recordings.get(&(fingerprint, params_hash))
            .ok_or(PgError::SimulationMismatch { sql: sql.to_string() })?

        MATCH &recording.result:
            RecordedResult::RowCount(count) => Ok(*count),
            RecordedResult::Error(e) => Err(PgError::SimulatedError { message: e.clone() }),
            _ => Err(PgError::SimulationTypeMismatch)
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-PG-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*Proceed to Architecture phase upon approval.*
