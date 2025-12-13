# SQL Server Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/sqlserver`

---

## 1. Connection Edge Cases

### 1.1 Connection Recovery

| Scenario | Handling |
|----------|----------|
| Connection dropped mid-query | Detect via TDS error, remove from pool, retry on new connection |
| Network timeout during execute | Close connection, mark unhealthy, acquire new |
| Pool exhaustion under load | Queue with timeout, emit warning metrics |
| All connections unhealthy | Circuit breaker opens, fast-fail requests |
| Server restart during operation | Detect via error 40197, wait and retry |

```rust
impl Connection {
    async fn execute_with_recovery<T, F>(&self, f: F) -> Result<T>
    where F: Fn(&Connection) -> Future<Output = Result<T>>
    {
        match f(self).await {
            Ok(result) => Ok(result),
            Err(e) if e.is_connection_error() => {
                // Mark connection as broken
                self.mark_broken();

                // Acquire new connection and retry
                let new_conn = self.pool.acquire().await?;
                f(&new_conn).await
            }
            Err(e) => Err(e),
        }
    }

    fn is_broken(&self) -> bool {
        self.broken.load(Ordering::SeqCst) || !self.inner.is_connected()
    }

    fn mark_broken(&self) {
        self.broken.store(true, Ordering::SeqCst);
        self.pool.remove_connection(self.id);
    }
}
```

### 1.2 Connection String Edge Cases

```rust
impl ConnectionConfig {
    fn validate(&self) -> Result<()> {
        // Host validation
        if self.host.is_empty() {
            return Err(ConfigError::InvalidHost("Host cannot be empty"));
        }

        // Port validation
        if self.port == 0 {
            return Err(ConfigError::InvalidPort("Port cannot be zero"));
        }

        // Named instance handling
        if self.host.contains('\\') {
            // Named instance: disable port, use browser service
            if self.port != 1433 {
                warn!("Port ignored for named instance, using SQL Browser");
            }
        }

        // Azure SQL detection
        if self.host.ends_with(".database.windows.net") {
            if !self.encrypt {
                return Err(ConfigError::AzureRequiresEncryption);
            }
            if matches!(self.auth, AuthConfig::WindowsAuth) {
                return Err(ConfigError::AzureNoWindowsAuth);
            }
        }

        Ok(())
    }

    fn parse_connection_string(conn_str: &str) -> Result<Self> {
        let mut config = ConnectionConfig::default();

        for part in conn_str.split(';') {
            let kv: Vec<&str> = part.splitn(2, '=').collect();
            if kv.len() != 2 { continue; }

            match kv[0].to_lowercase().as_str() {
                "server" | "data source" => {
                    config.host = Self::parse_server(kv[1])?;
                }
                "database" | "initial catalog" => {
                    config.database = kv[1].to_string();
                }
                "user id" | "uid" => {
                    config.username = Some(kv[1].to_string());
                }
                "password" | "pwd" => {
                    config.password = Some(SecretString::new(kv[1]));
                }
                "encrypt" => {
                    config.encrypt = kv[1].to_lowercase() == "true";
                }
                "trustservercertificate" => {
                    config.trust_server_cert = kv[1].to_lowercase() == "true";
                }
                "applicationintent" => {
                    config.application_intent = match kv[1].to_lowercase().as_str() {
                        "readonly" => ApplicationIntent::ReadOnly,
                        _ => ApplicationIntent::ReadWrite,
                    };
                }
                "connect timeout" | "connection timeout" => {
                    config.connect_timeout = Duration::from_secs(kv[1].parse()?);
                }
                _ => {} // Ignore unknown parameters
            }
        }

        config.validate()?;
        Ok(config)
    }
}
```

### 1.3 Azure SQL Specific Handling

```rust
impl AzureAdAuth {
    async fn acquire_token(&self) -> Result<String> {
        match &self.method {
            AzureAuthMethod::ServicePrincipal { client_id, client_secret, tenant_id } => {
                self.acquire_sp_token(client_id, client_secret, tenant_id).await
            }
            AzureAuthMethod::ManagedIdentity { client_id } => {
                self.acquire_msi_token(client_id.as_deref()).await
            }
            AzureAuthMethod::Password { username, password } => {
                self.acquire_password_token(username, password).await
            }
        }
    }

    async fn acquire_msi_token(&self, client_id: Option<&str>) -> Result<String> {
        let mut url = "http://169.254.169.254/metadata/identity/oauth2/token\
            ?api-version=2019-08-01\
            &resource=https://database.windows.net/".to_string();

        if let Some(id) = client_id {
            url.push_str(&format!("&client_id={}", id));
        }

        let response = self.http_client
            .get(&url)
            .header("Metadata", "true")
            .timeout(Duration::from_secs(5))
            .send()
            .await?;

        let token_response: TokenResponse = response.json().await?;
        Ok(token_response.access_token)
    }

    // Token refresh with buffer time
    fn should_refresh(&self, token: &CachedToken) -> bool {
        let buffer = Duration::from_secs(300); // 5 minute buffer
        token.expires_at.saturating_sub(buffer) < Instant::now()
    }
}
```

---

## 2. Deadlock Handling

### 2.1 Deadlock Detection and Retry

```rust
struct DeadlockRetryPolicy {
    max_attempts: u32,
    base_delay: Duration,
    max_delay: Duration,
    jitter_factor: f64,
}

impl DeadlockRetryPolicy {
    async fn execute<T, F, Fut>(&self, mut f: F) -> Result<T>
    where
        F: FnMut() -> Fut,
        Fut: Future<Output = Result<T>>,
    {
        let mut attempt = 0;

        loop {
            attempt += 1;

            match f().await {
                Ok(result) => return Ok(result),
                Err(e) if e.is_deadlock() && attempt < self.max_attempts => {
                    let delay = self.calculate_delay(attempt);

                    tracing::warn!(
                        attempt = attempt,
                        delay_ms = delay.as_millis(),
                        "Deadlock detected, retrying"
                    );

                    metrics::counter!("sql_deadlocks_total").increment(1);

                    tokio::time::sleep(delay).await;
                }
                Err(e) => return Err(e),
            }
        }
    }

    fn calculate_delay(&self, attempt: u32) -> Duration {
        let base = self.base_delay.as_millis() as f64;
        let exp_delay = base * 2_f64.powi(attempt as i32 - 1);
        let capped = exp_delay.min(self.max_delay.as_millis() as f64);

        // Add jitter: 0.5 to 1.5 of calculated delay
        let jitter = 0.5 + rand::random::<f64>() * self.jitter_factor;

        Duration::from_millis((capped * jitter) as u64)
    }
}

impl SqlServerError {
    fn is_deadlock(&self) -> bool {
        matches!(self, SqlServerError::Transaction(TransactionError::DeadlockVictim))
    }

    fn is_lock_timeout(&self) -> bool {
        matches!(self, SqlServerError::Transaction(TransactionError::LockTimeout))
    }
}
```

### 2.2 Deadlock-Resistant Transactions

```rust
impl SqlServerClient {
    /// Execute a transaction with automatic deadlock retry
    async fn transaction_with_retry<T, F, Fut>(
        &self,
        isolation: IsolationLevel,
        f: F,
    ) -> Result<T>
    where
        F: Fn(Transaction) -> Fut + Clone,
        Fut: Future<Output = Result<T>>,
    {
        let policy = DeadlockRetryPolicy {
            max_attempts: 3,
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(2),
            jitter_factor: 1.0,
        };

        policy.execute(|| {
            let f = f.clone();
            async move {
                let tx = self.begin_transaction(isolation).await?;
                match f(tx).await {
                    Ok(result) => {
                        // Transaction committed inside f
                        Ok(result)
                    }
                    Err(e) => Err(e),
                }
            }
        }).await
    }
}
```

---

## 3. Query Optimization

### 3.1 Query Hints Support

```rust
struct QueryBuilder {
    sql: String,
    params: Vec<SqlParam>,
    hints: QueryHints,
    timeout: Option<Duration>,
}

struct QueryHints {
    table_hints: HashMap<String, Vec<TableHint>>,
    query_hints: Vec<QueryHint>,
}

enum TableHint {
    NoLock,
    ReadPast,
    RowLock,
    PageLock,
    TabLock,
    HoldLock,
    UpdLock,
    XLock,
    Index(String),
}

enum QueryHint {
    Recompile,
    OptimizeForUnknown,
    MaxDop(u8),
    ForceOrder,
    HashJoin,
    LoopJoin,
    MergeJoin,
    UsePlan(String),
    QueryTraceOn(u32),
}

impl QueryBuilder {
    fn with_table_hint(mut self, table: &str, hint: TableHint) -> Self {
        self.hints.table_hints
            .entry(table.to_string())
            .or_default()
            .push(hint);
        self
    }

    fn with_query_hint(mut self, hint: QueryHint) -> Self {
        self.hints.query_hints.push(hint);
        self
    }

    fn build(self) -> (String, Vec<SqlParam>) {
        let mut sql = self.sql;

        // Apply table hints
        for (table, hints) in &self.hints.table_hints {
            let hint_str = hints.iter()
                .map(|h| h.to_sql())
                .collect::<Vec<_>>()
                .join(", ");

            // Simple replacement - production would use proper SQL parsing
            sql = sql.replace(
                &format!("FROM {}", table),
                &format!("FROM {} WITH ({})", table, hint_str)
            );
        }

        // Apply query hints
        if !self.hints.query_hints.is_empty() {
            let hints_str = self.hints.query_hints.iter()
                .map(|h| h.to_sql())
                .collect::<Vec<_>>()
                .join(", ");
            sql = format!("{} OPTION ({})", sql, hints_str);
        }

        (sql, self.params)
    }
}

impl TableHint {
    fn to_sql(&self) -> &'static str {
        match self {
            TableHint::NoLock => "NOLOCK",
            TableHint::ReadPast => "READPAST",
            TableHint::RowLock => "ROWLOCK",
            TableHint::PageLock => "PAGELOCK",
            TableHint::TabLock => "TABLOCK",
            TableHint::HoldLock => "HOLDLOCK",
            TableHint::UpdLock => "UPDLOCK",
            TableHint::XLock => "XLOCK",
            TableHint::Index(name) => return Box::leak(format!("INDEX({})", name).into_boxed_str()),
        }
    }
}
```

### 3.2 Query Timeout Handling

```rust
impl QueryExecutor {
    async fn execute_with_timeout<T>(
        &self,
        conn: &Connection,
        sql: &str,
        params: &[SqlParam],
        timeout: Duration,
    ) -> Result<T>
    where
        T: FromResultSet,
    {
        // Set command timeout at connection level
        conn.execute(
            &format!("SET LOCK_TIMEOUT {}", timeout.as_millis()),
            &[]
        ).await?;

        // Execute with tokio timeout as backup
        let query_future = conn.query(sql, params);

        match tokio::time::timeout(timeout + Duration::from_secs(5), query_future).await {
            Ok(Ok(result)) => T::from_result_set(result),
            Ok(Err(e)) => Err(e),
            Err(_) => {
                // Query didn't respect timeout, cancel it
                conn.cancel().await?;
                Err(SqlServerError::Execution(ExecutionError::QueryTimeout))
            }
        }
    }
}
```

---

## 4. Transaction Edge Cases

### 4.1 Nested Transaction Simulation

```rust
/// SQL Server doesn't support true nested transactions.
/// We simulate them using savepoints.
impl Transaction {
    async fn nest(&mut self) -> Result<NestedTransaction<'_>> {
        let savepoint_name = format!("sp_{}", self.savepoints.len());
        self.savepoint(&savepoint_name).await?;

        Ok(NestedTransaction {
            parent: self,
            savepoint: savepoint_name,
            committed: false,
        })
    }
}

struct NestedTransaction<'a> {
    parent: &'a mut Transaction,
    savepoint: String,
    committed: bool,
}

impl<'a> NestedTransaction<'a> {
    async fn commit(mut self) -> Result<()> {
        // "Commit" nested transaction = just mark as committed
        // The savepoint remains but won't be rolled back
        self.committed = true;
        Ok(())
    }

    async fn rollback(self) -> Result<()> {
        self.parent.rollback_to_savepoint(&self.savepoint).await
    }
}

impl<'a> Drop for NestedTransaction<'a> {
    fn drop(&mut self) {
        if !self.committed {
            // Spawn rollback on drop
            let savepoint = self.savepoint.clone();
            let conn = self.parent.connection.clone();
            tokio::spawn(async move {
                let _ = conn.execute(
                    &format!("ROLLBACK TRANSACTION {}", savepoint),
                    &[]
                ).await;
            });
        }
    }
}
```

### 4.2 Transaction Timeout

```rust
impl TransactionBuilder {
    fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    async fn begin(self) -> Result<Transaction> {
        let conn = self.client.write_pool.acquire_owned().await?;

        // Set lock timeout
        if let Some(timeout) = self.timeout {
            conn.execute(
                &format!("SET LOCK_TIMEOUT {}", timeout.as_millis()),
                &[]
            ).await?;
        }

        // Set isolation level
        let isolation_sql = self.isolation.to_sql();
        conn.execute(
            &format!("SET TRANSACTION ISOLATION LEVEL {}", isolation_sql),
            &[]
        ).await?;

        // Begin transaction
        conn.execute("BEGIN TRANSACTION", &[]).await?;

        Ok(Transaction {
            connection: conn,
            isolation: self.isolation,
            state: TransactionState::Active,
            savepoints: Vec::new(),
            started_at: Instant::now(),
            timeout: self.timeout,
        })
    }
}
```

### 4.3 Distributed Transaction Awareness

```rust
impl Transaction {
    /// Check if we're in a distributed transaction context
    fn is_distributed(&self) -> bool {
        // MSDTC integration would set this
        self.dtc_context.is_some()
    }

    /// Prepare for two-phase commit
    async fn prepare(&mut self) -> Result<()> {
        if !self.is_distributed() {
            return Err(SqlServerError::NotDistributed);
        }

        self.state = TransactionState::Prepared;
        // In real implementation, would coordinate with MSDTC
        Ok(())
    }
}
```

---

## 5. Bulk Operation Refinements

### 5.1 Streaming Bulk Insert

```rust
impl BulkInsertBuilder {
    /// Stream rows from an async iterator
    async fn execute_stream<S, R>(&self, rows: S) -> Result<BulkInsertResult>
    where
        S: Stream<Item = R> + Unpin,
        R: ToRow,
    {
        let conn = self.client.write_pool.acquire().await?;
        let mut bulk = conn.bulk_insert(&self.table);

        for col in &self.columns {
            bulk.add_column(col);
        }

        if self.options.tablock {
            bulk.with_tablock();
        }

        let mut total_rows = 0u64;
        let mut batch = Vec::with_capacity(self.batch_size);

        tokio::pin!(rows);

        while let Some(row) = rows.next().await {
            batch.push(row.to_row());

            if batch.len() >= self.batch_size {
                self.flush_batch(&mut bulk, &batch).await?;
                total_rows += batch.len() as u64;
                batch.clear();

                // Yield to allow cancellation
                tokio::task::yield_now().await;
            }
        }

        // Flush remaining
        if !batch.is_empty() {
            self.flush_batch(&mut bulk, &batch).await?;
            total_rows += batch.len() as u64;
        }

        bulk.finish().await?;

        Ok(BulkInsertResult {
            rows_inserted: total_rows,
            duration: start.elapsed(),
        })
    }
}
```

### 5.2 Bulk Insert Error Recovery

```rust
impl BulkInsertBuilder {
    async fn execute_with_error_handling<I, R>(
        &self,
        rows: I,
    ) -> Result<BulkInsertReport>
    where
        I: IntoIterator<Item = R>,
        R: ToRow + Clone,
    {
        let mut report = BulkInsertReport::default();
        let mut failed_rows = Vec::new();

        for batch in rows.into_iter().chunks(self.batch_size) {
            let batch: Vec<R> = batch.collect();

            match self.insert_batch(&batch).await {
                Ok(count) => {
                    report.successful_rows += count;
                }
                Err(e) if self.options.continue_on_error => {
                    // Try row-by-row for this batch
                    for row in batch {
                        match self.insert_single(&row).await {
                            Ok(_) => report.successful_rows += 1,
                            Err(row_err) => {
                                report.failed_rows += 1;
                                failed_rows.push(FailedRow {
                                    row: row.clone(),
                                    error: row_err.to_string(),
                                });
                            }
                        }
                    }
                }
                Err(e) => {
                    report.error = Some(e);
                    break;
                }
            }
        }

        report.failed_row_details = failed_rows;
        Ok(report)
    }
}

struct BulkInsertReport {
    successful_rows: u64,
    failed_rows: u64,
    failed_row_details: Vec<FailedRow>,
    error: Option<SqlServerError>,
}
```

---

## 6. Read Replica Refinements

### 6.1 Lag-Aware Routing

```rust
impl QueryRouter {
    async fn select_healthy_replica(&self) -> Option<&ReadReplica> {
        let mut candidates: Vec<_> = self.read_pools.iter()
            .filter(|r| r.is_healthy.load(Ordering::Relaxed))
            .collect();

        if candidates.is_empty() {
            return None;
        }

        // Sort by lag (lowest first)
        candidates.sort_by_key(|r| r.last_known_lag.load(Ordering::Relaxed));

        match self.strategy {
            LoadBalanceStrategy::LeastLag => {
                Some(candidates[0])
            }
            LoadBalanceStrategy::RoundRobin => {
                let idx = self.counter.fetch_add(1, Ordering::Relaxed) % candidates.len();
                Some(candidates[idx])
            }
            LoadBalanceStrategy::Random => {
                let idx = rand::random::<usize>() % candidates.len();
                Some(candidates[idx])
            }
        }
    }

    /// Route based on query characteristics
    fn determine_intent(&self, sql: &str, in_transaction: bool) -> QueryIntent {
        if in_transaction {
            return QueryIntent::Write;
        }

        let sql_upper = sql.trim().to_uppercase();

        // Write operations
        if sql_upper.starts_with("INSERT") ||
           sql_upper.starts_with("UPDATE") ||
           sql_upper.starts_with("DELETE") ||
           sql_upper.starts_with("MERGE") ||
           sql_upper.starts_with("TRUNCATE") ||
           sql_upper.starts_with("CREATE") ||
           sql_upper.starts_with("ALTER") ||
           sql_upper.starts_with("DROP") ||
           sql_upper.starts_with("EXEC") {
            return QueryIntent::Write;
        }

        // Check for write hints in SELECT
        if sql_upper.contains("FOR UPDATE") ||
           sql_upper.contains("UPDLOCK") ||
           sql_upper.contains("XLOCK") {
            return QueryIntent::Write;
        }

        QueryIntent::Read
    }
}
```

### 6.2 Replica Lag Monitoring

```rust
impl ReadReplica {
    async fn check_lag(&self) -> Result<Duration> {
        let conn = self.pool.acquire().await?;

        // For Always On AG
        let lag_query = r#"
            SELECT DATEDIFF(SECOND,
                last_commit_time,
                GETUTCDATE()
            ) as lag_seconds
            FROM sys.dm_hadr_database_replica_states
            WHERE is_local = 1 AND is_primary_replica = 0
        "#;

        match conn.query_optional::<(i32,)>(lag_query, &[]).await {
            Ok(Some((lag_seconds,))) => {
                let lag = Duration::from_secs(lag_seconds.max(0) as u64);
                self.last_known_lag.store(lag.as_secs(), Ordering::Relaxed);
                self.update_health_status(lag);
                Ok(lag)
            }
            Ok(None) => {
                // Not an AG replica, assume zero lag
                Ok(Duration::ZERO)
            }
            Err(e) => {
                self.is_healthy.store(false, Ordering::Relaxed);
                Err(e)
            }
        }
    }

    fn update_health_status(&self, lag: Duration) {
        let healthy = lag <= self.lag_threshold;
        self.is_healthy.store(healthy, Ordering::Relaxed);

        if !healthy {
            tracing::warn!(
                replica = %self.host,
                lag_seconds = lag.as_secs(),
                threshold_seconds = self.lag_threshold.as_secs(),
                "Replica lag exceeds threshold"
            );
        }
    }
}
```

---

## 7. Result Mapping Refinements

### 7.1 Flexible Row Mapping

```rust
trait FromRow: Sized {
    fn from_row(row: &Row) -> Result<Self>;
}

// Derive macro implementation
#[derive(FromRow)]
struct User {
    #[column("user_id")]
    id: i32,
    #[column("user_name")]
    name: String,
    #[column("email_address")]
    email: Option<String>,
    #[column("created_at")]
    created: DateTime<Utc>,
}

// Manual implementation for complex types
impl FromRow for User {
    fn from_row(row: &Row) -> Result<Self> {
        Ok(User {
            id: row.get("user_id")?,
            name: row.get("user_name")?,
            email: row.try_get("email_address").ok(),
            created: row.get::<_, NaiveDateTime>("created_at")?
                .and_utc(),
        })
    }
}

// Handle nullable columns gracefully
impl Row {
    fn try_get<T: FromSql>(&self, column: &str) -> Result<T> {
        self.get(column)
            .ok_or_else(|| SqlServerError::ColumnNotFound(column.to_string()))
    }

    fn get_optional<T: FromSql>(&self, column: &str) -> Option<T> {
        self.try_get(column).ok()
    }
}
```

### 7.2 Large Result Streaming

```rust
impl QueryExecutor {
    fn query_stream<T: FromRow>(
        &self,
        sql: &str,
        params: &[SqlParam],
    ) -> impl Stream<Item = Result<T>> {
        let client = self.client.clone();
        let sql = sql.to_string();
        let params = params.to_vec();

        async_stream::try_stream! {
            let conn = client.select_pool(QueryIntent::Read).acquire().await?;
            let mut stream = conn.query_streaming(&sql, &params).await?;

            while let Some(row_result) = stream.next().await {
                let row = row_result?;
                let item = T::from_row(&row)?;
                yield item;
            }
        }
    }
}

// Usage with backpressure
async fn process_large_result(client: &SqlServerClient) -> Result<()> {
    let stream = client.query_stream::<Record>(
        "SELECT * FROM large_table",
        &[]
    );

    tokio::pin!(stream);

    while let Some(record) = stream.next().await {
        let record = record?;
        process_record(record).await?;

        // Backpressure: process at controlled rate
        tokio::time::sleep(Duration::from_micros(100)).await;
    }

    Ok(())
}
```

---

## 8. Testing Refinements

### 8.1 Mock Scenarios

```rust
#[cfg(test)]
mod tests {
    struct MockScenario {
        name: &'static str,
        queries: Vec<MockQuery>,
        expected_behavior: ExpectedBehavior,
    }

    fn deadlock_scenarios() -> Vec<MockScenario> {
        vec![
            MockScenario {
                name: "deadlock_retry_succeeds",
                queries: vec![
                    MockQuery::fail_with(SqlServerError::deadlock()),
                    MockQuery::fail_with(SqlServerError::deadlock()),
                    MockQuery::succeed_with(vec![row!(1, "test")]),
                ],
                expected_behavior: ExpectedBehavior::SuccessAfterRetries(2),
            },
            MockScenario {
                name: "deadlock_max_retries_exceeded",
                queries: vec![
                    MockQuery::fail_with(SqlServerError::deadlock()),
                    MockQuery::fail_with(SqlServerError::deadlock()),
                    MockQuery::fail_with(SqlServerError::deadlock()),
                    MockQuery::fail_with(SqlServerError::deadlock()),
                ],
                expected_behavior: ExpectedBehavior::FailWith(SqlServerError::deadlock()),
            },
        ]
    }

    fn connection_scenarios() -> Vec<MockScenario> {
        vec![
            MockScenario {
                name: "connection_recovery",
                queries: vec![
                    MockQuery::fail_with(SqlServerError::connection_dropped()),
                    MockQuery::succeed_with(vec![row!(1)]),
                ],
                expected_behavior: ExpectedBehavior::SuccessAfterReconnect,
            },
            MockScenario {
                name: "pool_exhaustion_timeout",
                queries: vec![],
                expected_behavior: ExpectedBehavior::FailWith(SqlServerError::pool_exhausted()),
            },
        ]
    }

    #[tokio::test]
    async fn test_deadlock_scenarios() {
        for scenario in deadlock_scenarios() {
            let mock = MockSqlServer::new()
                .with_queries(scenario.queries);

            let client = SqlServerClient::with_mock(mock);
            let result = client.query::<i32>("SELECT 1", &[]).await;

            scenario.expected_behavior.verify(result);
        }
    }
}
```

### 8.2 Property-Based Tests

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn connection_string_roundtrip(
            host in "[a-z][a-z0-9]{2,20}",
            port in 1024u16..65535,
            database in "[a-z][a-z0-9_]{2,20}",
            user in "[a-z][a-z0-9]{2,20}",
        ) {
            let config = ConnectionConfig {
                host: host.clone(),
                port,
                database: database.clone(),
                auth: AuthConfig::SqlAuth {
                    username: user.clone(),
                    password: SecretString::new("password"),
                },
                ..Default::default()
            };

            let conn_str = config.to_connection_string();
            let parsed = ConnectionConfig::parse_connection_string(&conn_str)?;

            prop_assert_eq!(parsed.host, host);
            prop_assert_eq!(parsed.port, port);
            prop_assert_eq!(parsed.database, database);
        }

        #[test]
        fn parameter_binding_type_safety(
            int_val in any::<i32>(),
            str_val in ".{0,100}",
            opt_val in proptest::option::of(any::<i64>()),
        ) {
            let params = vec![
                int_val.to_sql_param(),
                str_val.to_sql_param(),
                opt_val.to_sql_param(),
            ];

            // Verify all params serialize without panic
            for param in &params {
                let _ = param.to_tds_value();
            }
        }
    }
}
```

---

## 9. Configuration Refinements

### 9.1 Environment Variable Mapping

```rust
impl SqlServerConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            write_config: ConnectionConfig {
                host: env::var("SQLSERVER_HOST")
                    .or_else(|_| env::var("DB_HOST"))?,
                port: env::var("SQLSERVER_PORT")
                    .unwrap_or_else(|_| "1433".to_string())
                    .parse()?,
                database: env::var("SQLSERVER_DATABASE")
                    .or_else(|_| env::var("DB_NAME"))?,
                auth: Self::auth_from_env()?,
                pool_min: env::var("SQLSERVER_POOL_MIN")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(1),
                pool_max: env::var("SQLSERVER_POOL_MAX")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10),
                encrypt: env::var("SQLSERVER_ENCRYPT")
                    .map(|s| s.to_lowercase() == "true")
                    .unwrap_or(true),
                ..Default::default()
            },
            read_config: Self::read_config_from_env()?,
            ..Default::default()
        })
    }

    fn auth_from_env() -> Result<AuthConfig> {
        if let Ok(conn_str) = env::var("SQLSERVER_CONNECTION_STRING") {
            return Self::auth_from_connection_string(&conn_str);
        }

        if let Ok(_) = env::var("SQLSERVER_USE_MSI") {
            return Ok(AuthConfig::AzureAdIntegrated);
        }

        let username = env::var("SQLSERVER_USER")
            .or_else(|_| env::var("DB_USER"))?;
        let password = env::var("SQLSERVER_PASSWORD")
            .or_else(|_| env::var("DB_PASSWORD"))?;

        Ok(AuthConfig::SqlAuth {
            username,
            password: SecretString::new(password),
        })
    }
}
```

---

## 10. Logging Refinements

### 10.1 Query Logging with Sanitization

```rust
impl QueryLogger {
    fn log_query(&self, sql: &str, params: &[SqlParam], duration: Duration) {
        let sanitized_sql = self.sanitize_sql(sql);
        let param_summary = self.summarize_params(params);

        if duration > self.slow_query_threshold {
            tracing::warn!(
                sql = %sanitized_sql,
                params = %param_summary,
                duration_ms = duration.as_millis(),
                "Slow query detected"
            );
        } else {
            tracing::debug!(
                sql = %sanitized_sql,
                params = %param_summary,
                duration_ms = duration.as_millis(),
                "Query executed"
            );
        }
    }

    fn sanitize_sql(&self, sql: &str) -> String {
        // Truncate long queries
        if sql.len() > 1000 {
            format!("{}... [truncated]", &sql[..1000])
        } else {
            sql.to_string()
        }
    }

    fn summarize_params(&self, params: &[SqlParam]) -> String {
        params.iter()
            .enumerate()
            .map(|(i, p)| format!("@p{}={}", i, p.type_name()))
            .collect::<Vec<_>>()
            .join(", ")
    }
}

impl SqlParam {
    fn type_name(&self) -> &'static str {
        match self {
            SqlParam::Null => "NULL",
            SqlParam::Bool(_) => "BIT",
            SqlParam::I32(_) => "INT",
            SqlParam::I64(_) => "BIGINT",
            SqlParam::F64(_) => "FLOAT",
            SqlParam::String(_) => "NVARCHAR",
            SqlParam::Bytes(_) => "VARBINARY",
            SqlParam::Uuid(_) => "UNIQUEIDENTIFIER",
            SqlParam::DateTime(_) => "DATETIME2",
            SqlParam::Decimal(_) => "DECIMAL",
        }
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement |

---

**Next Phase:** Completion - Implementation tasks, test coverage requirements, deployment checklist, and operational runbooks.
