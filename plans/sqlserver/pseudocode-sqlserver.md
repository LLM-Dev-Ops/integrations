# SQL Server Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/sqlserver`

---

## 1. Core Client

### 1.1 SqlServerClient

```pseudocode
CLASS SqlServerClient:
    config: SqlServerConfig
    write_pool: ConnectionPool
    read_pool: Option<ConnectionPool>
    circuit_breaker: CircuitBreaker
    metrics: MetricsCollector

    CONSTRUCTOR(config: SqlServerConfig):
        self.config = config
        self.write_pool = ConnectionPool::new(config.write_config)
        self.read_pool = config.read_config.map(|c| ConnectionPool::new(c))
        self.circuit_breaker = CircuitBreaker::new(config.circuit_breaker)
        self.metrics = MetricsCollector::new("sql")

    ASYNC FUNCTION query<T>(&self, sql: &str, params: &[SqlParam]) -> Result<Vec<T>>:
        pool = self.select_pool(QueryIntent::Read)
        connection = pool.acquire().await?
        RETURN self.execute_query(connection, sql, params).await

    ASYNC FUNCTION execute(&self, sql: &str, params: &[SqlParam]) -> Result<u64>:
        connection = self.write_pool.acquire().await?
        RETURN self.execute_command(connection, sql, params).await

    ASYNC FUNCTION begin_transaction(&self, isolation: IsolationLevel) -> Result<Transaction>:
        connection = self.write_pool.acquire_owned().await?
        RETURN Transaction::begin(connection, isolation).await

    FUNCTION select_pool(&self, intent: QueryIntent) -> &ConnectionPool:
        MATCH intent:
            QueryIntent::Read =>
                self.read_pool.as_ref().unwrap_or(&self.write_pool)
            QueryIntent::Write =>
                &self.write_pool
```

### 1.2 Configuration

```pseudocode
STRUCT SqlServerConfig:
    write_config: ConnectionConfig
    read_config: Option<ConnectionConfig>
    circuit_breaker: CircuitBreakerConfig
    retry_config: RetryConfig
    query_timeout: Duration
    enable_read_replica: bool

STRUCT ConnectionConfig:
    host: String
    port: u16                          // Default: 1433
    database: String
    auth: AuthConfig
    pool_min: u32                      // Default: 1
    pool_max: u32                      // Default: 10
    pool_idle_timeout: Duration        // Default: 300s
    connect_timeout: Duration          // Default: 30s
    encrypt: bool                      // Default: true
    trust_server_cert: bool            // Default: false
    application_name: Option<String>
    application_intent: ApplicationIntent

ENUM AuthConfig:
    SqlAuth { username: String, password: SecretString }
    WindowsAuth
    AzureAdPassword { username: String, password: SecretString }
    AzureAdIntegrated
    AzureAdServicePrincipal { client_id: String, client_secret: SecretString, tenant_id: String }

ENUM ApplicationIntent:
    ReadWrite
    ReadOnly
```

---

## 2. Connection Pool

### 2.1 Pool Manager

```pseudocode
CLASS ConnectionPool:
    config: ConnectionConfig
    connections: Vec<PooledConnection>
    available: Semaphore
    waiters: AtomicU32
    mutex: Mutex
    health_checker: HealthChecker

    CONSTRUCTOR(config: ConnectionConfig):
        self.config = config
        self.connections = Vec::with_capacity(config.pool_max)
        self.available = Semaphore::new(config.pool_max)
        self.waiters = AtomicU32::new(0)
        self.health_checker = HealthChecker::new(config.health_check_interval)

        // Pre-create minimum connections
        FOR _ IN 0..config.pool_min:
            conn = self.create_connection().await?
            self.connections.push(PooledConnection::new(conn))

    ASYNC FUNCTION acquire(&self) -> Result<PoolGuard>:
        start = Instant::now()
        self.waiters.fetch_add(1)

        // Try to acquire permit with timeout
        permit = self.available.acquire_timeout(self.config.connect_timeout).await
            .map_err(|_| SqlServerError::PoolExhausted)?

        self.waiters.fetch_sub(1)

        // Find available connection or create new
        connection = self.get_or_create_connection().await?

        // Validate connection health
        IF !self.validate_connection(&connection).await:
            self.remove_connection(&connection)
            connection = self.create_connection().await?

        self.metrics.record_acquire_time(start.elapsed())

        RETURN PoolGuard::new(connection, permit, self)

    ASYNC FUNCTION get_or_create_connection(&self) -> Result<Connection>:
        lock = self.mutex.lock().await

        // Try to get idle connection
        FOR conn IN self.connections.iter_mut():
            IF conn.is_idle():
                conn.mark_in_use()
                RETURN Ok(conn.connection.clone())

        // Create new if under max
        IF self.connections.len() < self.config.pool_max:
            new_conn = self.create_connection().await?
            self.connections.push(PooledConnection::new(new_conn.clone()))
            RETURN Ok(new_conn)

        // Should not reach here due to semaphore
        RETURN Err(SqlServerError::PoolExhausted)

    ASYNC FUNCTION create_connection(&self) -> Result<Connection>:
        builder = ConnectionBuilder::new()
            .host(&self.config.host)
            .port(self.config.port)
            .database(&self.config.database)
            .encrypt(self.config.encrypt)
            .trust_cert(self.config.trust_server_cert)
            .application_name(self.config.application_name.as_deref())
            .connect_timeout(self.config.connect_timeout)

        builder = MATCH &self.config.auth:
            AuthConfig::SqlAuth { username, password } =>
                builder.sql_auth(username, password.expose())
            AuthConfig::WindowsAuth =>
                builder.windows_auth()
            AuthConfig::AzureAdPassword { username, password } =>
                builder.azure_ad_password(username, password.expose())
            AuthConfig::AzureAdServicePrincipal { client_id, client_secret, tenant_id } =>
                builder.azure_ad_sp(client_id, client_secret.expose(), tenant_id)

        RETURN builder.connect().await

    ASYNC FUNCTION validate_connection(&self, conn: &Connection) -> bool:
        TRY:
            result = conn.query_scalar::<i32>("SELECT 1").await?
            RETURN result == 1
        CATCH:
            RETURN false

    FUNCTION release(&self, conn: Connection):
        lock = self.mutex.lock()
        FOR pooled IN self.connections.iter_mut():
            IF pooled.connection.id() == conn.id():
                pooled.mark_idle()
                pooled.last_used = Instant::now()
                BREAK
```

### 2.2 Health Checker

```pseudocode
CLASS HealthChecker:
    interval: Duration
    running: AtomicBool

    ASYNC FUNCTION start(&self, pool: &ConnectionPool):
        self.running.store(true)

        WHILE self.running.load():
            tokio::time::sleep(self.interval).await

            FOR conn IN pool.connections.iter_mut():
                IF conn.is_idle():
                    // Check idle timeout
                    IF conn.last_used.elapsed() > pool.config.pool_idle_timeout:
                        conn.close().await
                        pool.remove_connection(conn)
                        CONTINUE

                    // Validate connection
                    IF !pool.validate_connection(&conn.connection).await:
                        conn.close().await
                        pool.remove_connection(conn)

            // Ensure minimum connections
            WHILE pool.connections.len() < pool.config.pool_min:
                TRY:
                    new_conn = pool.create_connection().await?
                    pool.connections.push(PooledConnection::new(new_conn))
                CATCH e:
                    log::warn!("Failed to maintain min pool size: {}", e)
                    BREAK
```

---

## 3. Query Execution

### 3.1 Query Service

```pseudocode
CLASS QueryService:
    client: &SqlServerClient

    ASYNC FUNCTION query<T: FromRow>(&self, sql: &str, params: &[SqlParam]) -> Result<Vec<T>>:
        span = tracing::span!("sql.query", db.statement = sql)

        RETURN self.client.circuit_breaker.call(|| async {
            self.execute_with_retry(sql, params, |conn, sql, params| async {
                stream = conn.query(sql, params).await?

                results = Vec::new()
                WHILE let Some(row) = stream.next().await:
                    row = row?
                    results.push(T::from_row(&row)?)

                RETURN Ok(results)
            }).await
        }).await

    ASYNC FUNCTION query_one<T: FromRow>(&self, sql: &str, params: &[SqlParam]) -> Result<T>:
        results = self.query::<T>(sql, params).await?

        MATCH results.len():
            0 => Err(SqlServerError::NoRows)
            1 => Ok(results.into_iter().next().unwrap())
            _ => Err(SqlServerError::TooManyRows(results.len()))

    ASYNC FUNCTION query_optional<T: FromRow>(&self, sql: &str, params: &[SqlParam]) -> Result<Option<T>>:
        results = self.query::<T>(sql, params).await?

        MATCH results.len():
            0 => Ok(None)
            1 => Ok(Some(results.into_iter().next().unwrap()))
            _ => Err(SqlServerError::TooManyRows(results.len()))

    ASYNC FUNCTION execute(&self, sql: &str, params: &[SqlParam]) -> Result<u64>:
        span = tracing::span!("sql.execute", db.statement = sql)

        RETURN self.client.circuit_breaker.call(|| async {
            self.execute_with_retry(sql, params, |conn, sql, params| async {
                result = conn.execute(sql, params).await?
                RETURN Ok(result.rows_affected())
            }).await
        }).await

    ASYNC FUNCTION execute_scalar<T: FromSql>(&self, sql: &str, params: &[SqlParam]) -> Result<T>:
        conn = self.client.select_pool(QueryIntent::Read).acquire().await?
        stream = conn.query(sql, params).await?

        row = stream.next().await
            .ok_or(SqlServerError::NoRows)??

        RETURN row.get::<T, _>(0)
            .ok_or(SqlServerError::NullValue)

    ASYNC FUNCTION execute_with_retry<F, Fut, T>(&self, sql: &str, params: &[SqlParam], f: F) -> Result<T>
    WHERE F: Fn(&Connection, &str, &[SqlParam]) -> Fut,
          Fut: Future<Output = Result<T>>:

        retry_count = 0
        last_error = None

        WHILE retry_count <= self.client.config.retry_config.max_attempts:
            conn = self.client.select_pool(QueryIntent::Read).acquire().await?

            MATCH f(&conn, sql, params).await:
                Ok(result) => RETURN Ok(result)
                Err(e) IF e.is_retryable() =>
                    last_error = Some(e)
                    retry_count += 1
                    delay = self.calculate_backoff(retry_count, &e)
                    tokio::time::sleep(delay).await
                Err(e) => RETURN Err(e)

        RETURN Err(last_error.unwrap())

    FUNCTION calculate_backoff(&self, attempt: u32, error: &SqlServerError) -> Duration:
        base = MATCH error:
            SqlServerError::DeadlockVictim => Duration::from_millis(100)
            SqlServerError::LockTimeout => Duration::from_millis(200)
            SqlServerError::QueryTimeout => Duration::from_secs(1)
            SqlServerError::ServerUnavailable => Duration::from_secs(5)
            _ => Duration::from_millis(500)

        // Exponential backoff with jitter
        multiplier = 2_u32.pow(attempt - 1)
        jitter = rand::random::<f64>() * 0.3 + 0.85  // 0.85-1.15
        RETURN base * multiplier * jitter
```

### 3.2 Parameter Binding

```pseudocode
ENUM SqlParam:
    Null
    Bool(bool)
    I32(i32)
    I64(i64)
    F64(f64)
    String(String)
    Bytes(Vec<u8>)
    Uuid(Uuid)
    DateTime(DateTime<Utc>)
    Decimal(Decimal)

TRAIT ToSqlParam:
    FUNCTION to_sql_param(&self) -> SqlParam

IMPL ToSqlParam FOR Option<T> WHERE T: ToSqlParam:
    FUNCTION to_sql_param(&self) -> SqlParam:
        MATCH self:
            Some(v) => v.to_sql_param()
            None => SqlParam::Null

FUNCTION bind_params(query: &mut Query, params: &[SqlParam]):
    FOR (idx, param) IN params.iter().enumerate():
        MATCH param:
            SqlParam::Null => query.bind_null(idx)
            SqlParam::Bool(v) => query.bind(idx, v)
            SqlParam::I32(v) => query.bind(idx, v)
            SqlParam::I64(v) => query.bind(idx, v)
            SqlParam::F64(v) => query.bind(idx, v)
            SqlParam::String(v) => query.bind(idx, v.as_str())
            SqlParam::Bytes(v) => query.bind(idx, v.as_slice())
            SqlParam::Uuid(v) => query.bind(idx, v)
            SqlParam::DateTime(v) => query.bind(idx, v)
            SqlParam::Decimal(v) => query.bind(idx, v)
```

---

## 4. Transaction Management

### 4.1 Transaction

```pseudocode
CLASS Transaction:
    connection: OwnedConnection
    isolation: IsolationLevel
    state: TransactionState
    savepoints: Vec<String>
    id: Uuid

    ASYNC FUNCTION begin(conn: OwnedConnection, isolation: IsolationLevel) -> Result<Self>:
        isolation_sql = MATCH isolation:
            IsolationLevel::ReadUncommitted => "READ UNCOMMITTED"
            IsolationLevel::ReadCommitted => "READ COMMITTED"
            IsolationLevel::RepeatableRead => "REPEATABLE READ"
            IsolationLevel::Serializable => "SERIALIZABLE"
            IsolationLevel::Snapshot => "SNAPSHOT"

        conn.execute(&format!("SET TRANSACTION ISOLATION LEVEL {}", isolation_sql), &[]).await?
        conn.execute("BEGIN TRANSACTION", &[]).await?

        RETURN Ok(Transaction {
            connection: conn,
            isolation,
            state: TransactionState::Active,
            savepoints: Vec::new(),
            id: Uuid::new_v4(),
        })

    ASYNC FUNCTION query<T: FromRow>(&mut self, sql: &str, params: &[SqlParam]) -> Result<Vec<T>>:
        self.ensure_active()?
        stream = self.connection.query(sql, params).await?

        results = Vec::new()
        WHILE let Some(row) = stream.next().await:
            results.push(T::from_row(&row?)?)

        RETURN Ok(results)

    ASYNC FUNCTION execute(&mut self, sql: &str, params: &[SqlParam]) -> Result<u64>:
        self.ensure_active()?
        result = self.connection.execute(sql, params).await?
        RETURN Ok(result.rows_affected())

    ASYNC FUNCTION savepoint(&mut self, name: &str) -> Result<()>:
        self.ensure_active()?
        self.connection.execute(&format!("SAVE TRANSACTION {}", name), &[]).await?
        self.savepoints.push(name.to_string())
        RETURN Ok(())

    ASYNC FUNCTION rollback_to_savepoint(&mut self, name: &str) -> Result<()>:
        self.ensure_active()?

        IF !self.savepoints.contains(&name.to_string()):
            RETURN Err(SqlServerError::SavepointNotFound(name.to_string()))

        self.connection.execute(&format!("ROLLBACK TRANSACTION {}", name), &[]).await?

        // Remove savepoints created after this one
        WHILE let Some(sp) = self.savepoints.pop():
            IF sp == name:
                BREAK

        RETURN Ok(())

    ASYNC FUNCTION commit(mut self) -> Result<()>:
        self.ensure_active()?
        self.connection.execute("COMMIT TRANSACTION", &[]).await?
        self.state = TransactionState::Committed
        RETURN Ok(())

    ASYNC FUNCTION rollback(mut self) -> Result<()>:
        IF self.state != TransactionState::Active:
            RETURN Ok(())  // Already finished

        self.connection.execute("ROLLBACK TRANSACTION", &[]).await?
        self.state = TransactionState::RolledBack
        RETURN Ok(())

    FUNCTION ensure_active(&self) -> Result<()>:
        MATCH self.state:
            TransactionState::Active => Ok(())
            TransactionState::Committed => Err(SqlServerError::TransactionAlreadyCommitted)
            TransactionState::RolledBack => Err(SqlServerError::TransactionAlreadyRolledBack)

IMPL Drop FOR Transaction:
    FUNCTION drop(&mut self):
        IF self.state == TransactionState::Active:
            // Spawn rollback task to avoid blocking
            tokio::spawn(async move {
                let _ = self.connection.execute("ROLLBACK TRANSACTION", &[]).await;
            })
```

### 4.2 Transaction Builder

```pseudocode
CLASS TransactionBuilder:
    client: &SqlServerClient
    isolation: IsolationLevel
    timeout: Option<Duration>

    FUNCTION new(client: &SqlServerClient) -> Self:
        RETURN Self {
            client,
            isolation: IsolationLevel::ReadCommitted,
            timeout: None,
        }

    FUNCTION isolation(mut self, level: IsolationLevel) -> Self:
        self.isolation = level
        RETURN self

    FUNCTION timeout(mut self, timeout: Duration) -> Self:
        self.timeout = Some(timeout)
        RETURN self

    ASYNC FUNCTION begin(self) -> Result<Transaction>:
        conn = self.client.write_pool.acquire_owned().await?

        IF let Some(timeout) = self.timeout:
            conn.execute(&format!("SET LOCK_TIMEOUT {}", timeout.as_millis()), &[]).await?

        RETURN Transaction::begin(conn, self.isolation).await

    ASYNC FUNCTION run<F, Fut, T>(self, f: F) -> Result<T>
    WHERE F: FnOnce(&mut Transaction) -> Fut,
          Fut: Future<Output = Result<T>>:

        tx = self.begin().await?

        MATCH f(&mut tx).await:
            Ok(result) =>
                tx.commit().await?
                RETURN Ok(result)
            Err(e) =>
                tx.rollback().await?
                RETURN Err(e)
```

---

## 5. Bulk Operations

### 5.1 Bulk Insert

```pseudocode
CLASS BulkInsertBuilder:
    client: &SqlServerClient
    table: String
    columns: Vec<String>
    batch_size: usize
    options: BulkInsertOptions

    FUNCTION new(client: &SqlServerClient, table: &str) -> Self:
        RETURN Self {
            client,
            table: table.to_string(),
            columns: Vec::new(),
            batch_size: 1000,
            options: BulkInsertOptions::default(),
        }

    FUNCTION columns(mut self, cols: &[&str]) -> Self:
        self.columns = cols.iter().map(|s| s.to_string()).collect()
        RETURN self

    FUNCTION batch_size(mut self, size: usize) -> Self:
        self.batch_size = size
        RETURN self

    FUNCTION tablock(mut self) -> Self:
        self.options.tablock = true
        RETURN self

    ASYNC FUNCTION execute<I, R>(&self, rows: I) -> Result<u64>
    WHERE I: IntoIterator<Item = R>,
          R: ToRow:

        conn = self.client.write_pool.acquire().await?
        total_inserted = 0u64

        // Create bulk copy instance
        bulk = conn.bulk_insert(&self.table)

        FOR col IN &self.columns:
            bulk.add_column(col)

        IF self.options.tablock:
            bulk.with_tablock()

        // Process in batches
        batch = Vec::with_capacity(self.batch_size)

        FOR row IN rows:
            batch.push(row.to_row())

            IF batch.len() >= self.batch_size:
                inserted = self.flush_batch(&mut bulk, &batch).await?
                total_inserted += inserted
                batch.clear()

        // Flush remaining
        IF !batch.is_empty():
            inserted = self.flush_batch(&mut bulk, &batch).await?
            total_inserted += inserted

        bulk.finish().await?
        RETURN Ok(total_inserted)

    ASYNC FUNCTION flush_batch(&self, bulk: &mut BulkCopy, rows: &[Row]) -> Result<u64>:
        FOR row IN rows:
            bulk.send_row(row).await?

        RETURN Ok(rows.len() as u64)
```

### 5.2 Table-Valued Parameters

```pseudocode
CLASS TvpBuilder:
    type_name: String
    columns: Vec<TvpColumn>
    rows: Vec<Vec<SqlParam>>

    FUNCTION new(type_name: &str) -> Self:
        RETURN Self {
            type_name: type_name.to_string(),
            columns: Vec::new(),
            rows: Vec::new(),
        }

    FUNCTION add_column(mut self, name: &str, sql_type: SqlType) -> Self:
        self.columns.push(TvpColumn { name: name.to_string(), sql_type })
        RETURN self

    FUNCTION add_row(mut self, values: Vec<SqlParam>) -> Self:
        assert!(values.len() == self.columns.len())
        self.rows.push(values)
        RETURN self

    FUNCTION build(self) -> TableValuedParameter:
        RETURN TableValuedParameter {
            type_name: self.type_name,
            columns: self.columns,
            rows: self.rows,
        }

IMPL SqlServerClient:
    ASYNC FUNCTION execute_with_tvp(
        &self,
        sql: &str,
        params: &[SqlParam],
        tvp: TableValuedParameter,
    ) -> Result<u64>:
        conn = self.write_pool.acquire().await?

        // Build TVP declaration
        tvp_param = conn.create_tvp(&tvp.type_name)?

        FOR row IN tvp.rows:
            tvp_param.add_row(&row)?

        // Execute with TVP
        result = conn.execute(sql, &[params, &[SqlParam::Tvp(tvp_param)]].concat()).await?

        RETURN Ok(result.rows_affected())
```

---

## 6. Stored Procedures

### 6.1 Procedure Executor

```pseudocode
CLASS ProcedureCall:
    name: String
    params: Vec<ProcedureParam>

    FUNCTION new(name: &str) -> Self:
        RETURN Self { name: name.to_string(), params: Vec::new() }

    FUNCTION param(mut self, name: &str, value: impl ToSqlParam) -> Self:
        self.params.push(ProcedureParam::Input {
            name: name.to_string(),
            value: value.to_sql_param(),
        })
        RETURN self

    FUNCTION output_param(mut self, name: &str, sql_type: SqlType) -> Self:
        self.params.push(ProcedureParam::Output {
            name: name.to_string(),
            sql_type,
        })
        RETURN self

IMPL SqlServerClient:
    ASYNC FUNCTION call_procedure<T: FromRow>(&self, call: ProcedureCall) -> Result<ProcedureResult<T>>:
        conn = self.write_pool.acquire().await?

        // Build EXEC statement
        param_list = call.params.iter()
            .map(|p| match p {
                ProcedureParam::Input { name, .. } => format!("{} = @{}", name, name)
                ProcedureParam::Output { name, .. } => format!("{} = @{} OUTPUT", name, name)
            })
            .collect::<Vec<_>>()
            .join(", ")

        sql = format!("EXEC {} {}", call.name, param_list)

        // Bind parameters
        bound_params: Vec<SqlParam> = call.params.iter()
            .filter_map(|p| match p {
                ProcedureParam::Input { value, .. } => Some(value.clone())
                ProcedureParam::Output { .. } => None
            })
            .collect()

        // Execute
        stream = conn.query(&sql, &bound_params).await?

        // Collect results
        rows = Vec::new()
        WHILE let Some(row) = stream.next().await:
            rows.push(T::from_row(&row?)?)

        // Get output parameters
        output_values = self.extract_output_params(&conn, &call.params).await?

        RETURN Ok(ProcedureResult { rows, output_values })

    ASYNC FUNCTION extract_output_params(
        &self,
        conn: &Connection,
        params: &[ProcedureParam],
    ) -> Result<HashMap<String, SqlParam>>:

        output_names: Vec<_> = params.iter()
            .filter_map(|p| match p {
                ProcedureParam::Output { name, .. } => Some(name.clone())
                _ => None
            })
            .collect()

        IF output_names.is_empty():
            RETURN Ok(HashMap::new())

        // Query output parameter values
        select_sql = output_names.iter()
            .map(|n| format!("@{} AS {}", n, n))
            .collect::<Vec<_>>()
            .join(", ")

        row = conn.query_one(&format!("SELECT {}", select_sql), &[]).await?

        result = HashMap::new()
        FOR name IN output_names:
            value = row.get_by_name(&name)?
            result.insert(name, value)

        RETURN Ok(result)
```

---

## 7. Read/Write Separation

### 7.1 Query Router

```pseudocode
CLASS QueryRouter:
    write_pool: &ConnectionPool
    read_pools: Vec<ReadReplica>
    strategy: LoadBalanceStrategy

    FUNCTION select_pool(&self, intent: QueryIntent, in_transaction: bool) -> &ConnectionPool:
        // Always use write pool for transactions
        IF in_transaction:
            RETURN self.write_pool

        MATCH intent:
            QueryIntent::Write => RETURN self.write_pool
            QueryIntent::Read =>
                IF self.read_pools.is_empty():
                    RETURN self.write_pool

                replica = self.select_replica()
                RETURN &replica.pool

    FUNCTION select_replica(&self) -> &ReadReplica:
        MATCH self.strategy:
            LoadBalanceStrategy::RoundRobin =>
                idx = self.counter.fetch_add(1) % self.read_pools.len()
                RETURN &self.read_pools[idx]

            LoadBalanceStrategy::LeastConnections =>
                RETURN self.read_pools.iter()
                    .min_by_key(|r| r.pool.active_connections())
                    .unwrap()

            LoadBalanceStrategy::Random =>
                idx = rand::random::<usize>() % self.read_pools.len()
                RETURN &self.read_pools[idx]

STRUCT ReadReplica:
    pool: ConnectionPool
    lag_threshold: Duration
    last_lag_check: AtomicInstant
    is_healthy: AtomicBool

    ASYNC FUNCTION check_lag(&self) -> Result<Duration>:
        // Query replica lag
        result = self.pool.acquire().await?
            .query_one::<(i64,)>("SELECT DATEDIFF(SECOND, last_commit_time, GETUTCDATE()) FROM sys.dm_hadr_database_replica_states WHERE is_local = 1", &[])
            .await?

        lag = Duration::from_secs(result.0 as u64)

        self.is_healthy.store(lag <= self.lag_threshold)
        self.last_lag_check.store(Instant::now())

        RETURN Ok(lag)
```

---

## 8. Error Handling

### 8.1 Error Classification

```pseudocode
IMPL SqlServerError:
    FUNCTION from_tds_error(error: TdsError) -> Self:
        MATCH error.code():
            18456 => SqlServerError::Authentication(AuthError::LoginFailed(error.message()))
            1205 => SqlServerError::Transaction(TransactionError::DeadlockVictim)
            1222 => SqlServerError::Transaction(TransactionError::LockTimeout)
            2627 | 2601 => SqlServerError::Data(DataError::UniqueViolation(error.message()))
            547 => SqlServerError::Data(DataError::ForeignKeyViolation(error.message()))
            515 => SqlServerError::Data(DataError::NullConstraint(error.message()))
            8152 => SqlServerError::Data(DataError::TruncationError(error.message()))
            -2 => SqlServerError::Execution(ExecutionError::QueryTimeout)
            40613 => SqlServerError::Server(ServerError::DatabaseOffline)
            40197 | 40501 => SqlServerError::Server(ServerError::FailoverInProgress)
            10928 | 10929 => SqlServerError::Execution(ExecutionError::ResourceLimit)
            _ => SqlServerError::Unknown(error.code(), error.message())

    FUNCTION is_retryable(&self) -> bool:
        MATCH self:
            SqlServerError::Transaction(TransactionError::DeadlockVictim) => true
            SqlServerError::Transaction(TransactionError::LockTimeout) => true
            SqlServerError::Execution(ExecutionError::QueryTimeout) => true
            SqlServerError::Server(ServerError::FailoverInProgress) => true
            SqlServerError::Server(ServerError::ServerUnavailable) => true
            SqlServerError::Connection(ConnectionError::ConnectionDropped) => true
            SqlServerError::Execution(ExecutionError::ResourceLimit) => true
            _ => false

    FUNCTION retry_delay(&self) -> Option<Duration>:
        MATCH self:
            SqlServerError::Transaction(TransactionError::DeadlockVictim) =>
                Some(Duration::from_millis(100))
            SqlServerError::Transaction(TransactionError::LockTimeout) =>
                Some(Duration::from_millis(200))
            SqlServerError::Server(ServerError::FailoverInProgress) =>
                Some(Duration::from_secs(2))
            _ => None
```

---

## 9. Simulation Layer

### 9.1 Mock Database

```pseudocode
CLASS MockSqlServer:
    tables: HashMap<String, MockTable>
    procedures: HashMap<String, MockProcedure>
    query_log: Vec<RecordedQuery>
    mode: SimulationMode
    latency: Option<Duration>

    FUNCTION new(mode: SimulationMode) -> Self:
        RETURN Self {
            tables: HashMap::new(),
            procedures: HashMap::new(),
            query_log: Vec::new(),
            mode,
            latency: None,
        }

    ASYNC FUNCTION execute_query(&mut self, sql: &str, params: &[SqlParam]) -> Result<MockResultSet>:
        self.query_log.push(RecordedQuery { sql: sql.to_string(), params: params.to_vec() })

        IF let Some(latency) = self.latency:
            tokio::time::sleep(latency).await

        MATCH self.mode:
            SimulationMode::Mock => self.generate_mock_response(sql, params)
            SimulationMode::Record => self.record_and_forward(sql, params).await
            SimulationMode::Replay => self.replay_response(sql, params)

    FUNCTION seed_table(&mut self, name: &str, columns: &[&str], rows: Vec<Vec<SqlParam>>):
        self.tables.insert(name.to_string(), MockTable { columns: columns.to_vec(), rows })

    FUNCTION seed_procedure(&mut self, name: &str, handler: impl Fn(&[SqlParam]) -> MockResultSet):
        self.procedures.insert(name.to_string(), MockProcedure { handler: Box::new(handler) })

    FUNCTION verify_query(&self, pattern: &str) -> Vec<&RecordedQuery>:
        self.query_log.iter()
            .filter(|q| q.sql.contains(pattern))
            .collect()

    FUNCTION verify_query_count(&self, pattern: &str) -> usize:
        self.verify_query(pattern).len()
```

---

## 10. Constants

```pseudocode
CONST DEFAULT_PORT: u16 = 1433
CONST DEFAULT_POOL_MIN: u32 = 1
CONST DEFAULT_POOL_MAX: u32 = 10
CONST DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(30)
CONST DEFAULT_QUERY_TIMEOUT: Duration = Duration::from_secs(30)
CONST DEFAULT_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(300)
CONST DEFAULT_HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(30)

CONST DEADLOCK_MAX_RETRIES: u32 = 3
CONST TRANSIENT_MAX_RETRIES: u32 = 5

CONST BULK_INSERT_BATCH_SIZE: usize = 1000
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Component diagrams, connection flow, transaction lifecycle, and read/write separation topology.
