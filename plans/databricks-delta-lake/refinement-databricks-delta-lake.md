# Databricks Delta Lake Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/databricks-delta-lake`

---

## 1. Rate Limiting Refinements

### 1.1 Adaptive Rate Limiter

```rust
struct AdaptiveRateLimiter {
    base_rate: f64,
    current_rate: AtomicF64,
    window: Duration,
    backoff_factor: f64,
    recovery_factor: f64,
    min_rate: f64,
    tokens: AtomicF64,
    last_update: AtomicInstant,
}

impl AdaptiveRateLimiter {
    fn new(requests_per_second: f64) -> Self {
        Self {
            base_rate: requests_per_second,
            current_rate: AtomicF64::new(requests_per_second),
            window: Duration::from_secs(1),
            backoff_factor: 0.5,
            recovery_factor: 1.1,
            min_rate: 1.0,
            tokens: AtomicF64::new(requests_per_second),
            last_update: AtomicInstant::new(Instant::now()),
        }
    }

    async fn acquire(&self) {
        loop {
            self.refill_tokens();

            let current = self.tokens.load(Ordering::Relaxed);
            if current >= 1.0 {
                if self.tokens.compare_exchange(
                    current, current - 1.0, Ordering::AcqRel, Ordering::Relaxed
                ).is_ok() {
                    return;
                }
            }

            // Wait for token refill
            let wait_time = Duration::from_secs_f64(1.0 / self.current_rate.load(Ordering::Relaxed));
            tokio::time::sleep(wait_time).await;
        }
    }

    fn on_rate_limit(&self, retry_after: Option<Duration>) {
        // Reduce rate on 429
        let current = self.current_rate.load(Ordering::Relaxed);
        let new_rate = (current * self.backoff_factor).max(self.min_rate);
        self.current_rate.store(new_rate, Ordering::Relaxed);

        tracing::warn!(
            current_rate = current,
            new_rate = new_rate,
            retry_after = ?retry_after,
            "Rate limited, reducing request rate"
        );
    }

    fn on_success(&self) {
        // Gradually recover rate
        let current = self.current_rate.load(Ordering::Relaxed);
        let new_rate = (current * self.recovery_factor).min(self.base_rate);
        self.current_rate.store(new_rate, Ordering::Relaxed);
    }
}
```

### 1.2 Per-Endpoint Rate Limits

```rust
struct EndpointRateLimits {
    limits: HashMap<&'static str, RateLimiter>,
}

impl EndpointRateLimits {
    fn new() -> Self {
        let mut limits = HashMap::new();

        // Databricks API rate limits (requests per minute)
        limits.insert("/jobs/runs/submit", RateLimiter::new(100.0 / 60.0));
        limits.insert("/jobs/runs/get", RateLimiter::new(1000.0 / 60.0));
        limits.insert("/sql/statements", RateLimiter::new(200.0 / 60.0));
        limits.insert("/unity-catalog", RateLimiter::new(500.0 / 60.0));

        Self { limits }
    }

    fn get_limiter(&self, path: &str) -> &RateLimiter {
        // Match endpoint prefix
        for (prefix, limiter) in &self.limits {
            if path.starts_with(prefix) {
                return limiter;
            }
        }
        // Default limiter
        &self.limits["/jobs/runs/get"]
    }
}
```

---

## 2. Job Execution Refinements

### 2.1 Job Polling with Exponential Backoff

```rust
impl JobsClient {
    async fn wait_for_completion_adaptive(
        &self,
        run_id: RunId,
        config: WaitConfig,
    ) -> Result<RunStatus> {
        let mut interval = config.initial_interval;
        let mut elapsed = Duration::ZERO;
        let start = Instant::now();

        loop {
            let status = self.get_run(run_id).await?;

            match &status.state {
                RunState::Terminated { result_state } => {
                    let duration = start.elapsed();
                    metrics::histogram!("databricks_job_duration_seconds",
                        "job_type" => status.job_type()
                    ).record(duration.as_secs_f64());

                    return match result_state {
                        ResultState::Success => Ok(status),
                        ResultState::Failed => Err(DatabricksError::JobFailed(status)),
                        ResultState::Canceled => Err(DatabricksError::JobCanceled),
                        ResultState::TimedOut => Err(DatabricksError::JobTimedOut),
                    };
                }
                RunState::InternalError { message } => {
                    return Err(DatabricksError::JobInternalError(message.clone()));
                }
                RunState::Pending | RunState::Running | RunState::Queued => {
                    // Check timeout
                    elapsed = start.elapsed();
                    if elapsed > config.timeout {
                        return Err(DatabricksError::WaitTimeout {
                            run_id,
                            elapsed,
                            last_state: status.state.clone(),
                        });
                    }

                    // Adaptive backoff
                    tokio::time::sleep(interval).await;
                    interval = (interval * 2).min(config.max_interval);
                }
            }
        }
    }
}

struct WaitConfig {
    initial_interval: Duration,  // 1s
    max_interval: Duration,      // 30s
    timeout: Duration,           // 1h
}

impl Default for WaitConfig {
    fn default() -> Self {
        Self {
            initial_interval: Duration::from_secs(1),
            max_interval: Duration::from_secs(30),
            timeout: Duration::from_secs(3600),
        }
    }
}
```

### 2.2 Cluster Specification Presets

```rust
impl ClusterSpec {
    /// Small cluster for light workloads
    fn small() -> Self {
        Self {
            spark_version: "14.3.x-scala2.12".to_string(),
            node_type_id: "Standard_DS3_v2".to_string(),
            num_workers: 2,
            autoscale: None,
            spark_conf: HashMap::new(),
            driver_node_type_id: None,
        }
    }

    /// Medium cluster with autoscale
    fn medium_autoscale() -> Self {
        Self {
            spark_version: "14.3.x-scala2.12".to_string(),
            node_type_id: "Standard_DS4_v2".to_string(),
            num_workers: 0,
            autoscale: Some(AutoscaleConfig { min_workers: 2, max_workers: 8 }),
            spark_conf: default_spark_conf(),
            driver_node_type_id: None,
        }
    }

    /// Large cluster for heavy ETL
    fn large_etl() -> Self {
        Self {
            spark_version: "14.3.x-scala2.12".to_string(),
            node_type_id: "Standard_E8s_v3".to_string(),
            num_workers: 0,
            autoscale: Some(AutoscaleConfig { min_workers: 4, max_workers: 32 }),
            spark_conf: etl_optimized_conf(),
            driver_node_type_id: Some("Standard_E16s_v3".to_string()),
        }
    }

    /// GPU cluster for ML workloads
    fn gpu_ml() -> Self {
        Self {
            spark_version: "14.3.x-gpu-ml-scala2.12".to_string(),
            node_type_id: "Standard_NC6s_v3".to_string(),
            num_workers: 2,
            autoscale: None,
            spark_conf: ml_optimized_conf(),
            driver_node_type_id: None,
        }
    }
}

fn etl_optimized_conf() -> HashMap<String, String> {
    [
        ("spark.sql.shuffle.partitions", "auto"),
        ("spark.sql.adaptive.enabled", "true"),
        ("spark.sql.adaptive.coalescePartitions.enabled", "true"),
        ("spark.databricks.delta.optimizeWrite.enabled", "true"),
        ("spark.databricks.delta.autoCompact.enabled", "true"),
    ].into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}
```

---

## 3. SQL Execution Refinements

### 3.1 Result Streaming with Backpressure

```rust
impl SqlClient {
    fn execute_stream<T: DeserializeOwned>(
        &self,
        sql: &str,
    ) -> impl Stream<Item = Result<T>> + '_ {
        async_stream::try_stream! {
            let result = self.execute(sql).await?;
            let schema = result.schema.clone();

            // Yield initial rows
            for row in result.rows {
                yield deserialize_row::<T>(&row, &schema)?;
            }

            // Fetch remaining chunks with backpressure
            if result.chunk_count > 1 {
                let semaphore = Arc::new(Semaphore::new(3)); // Max 3 concurrent fetches

                for chunk_idx in 1..result.chunk_count {
                    let _permit = semaphore.acquire().await?;

                    let chunk = self.fetch_chunk(&result.statement_id, chunk_idx).await?;

                    for row in chunk {
                        yield deserialize_row::<T>(&row, &schema)?;
                    }
                }
            }
        }
    }
}
```

### 3.2 Statement Timeout Handling

```rust
impl SqlClient {
    async fn execute_with_timeout(
        &self,
        sql: &str,
        timeout: Duration,
    ) -> Result<StatementResult> {
        let statement_id = self.submit_statement(sql).await?;

        let result = tokio::time::timeout(timeout, async {
            self.poll_until_complete(&statement_id).await
        }).await;

        match result {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(e)) => Err(e),
            Err(_) => {
                // Timeout - cancel the statement
                tracing::warn!(statement_id, ?timeout, "Statement timed out, canceling");
                self.cancel(&statement_id).await.ok(); // Best effort cancel
                Err(DatabricksError::StatementTimeout {
                    statement_id: statement_id.clone(),
                    timeout,
                })
            }
        }
    }

    async fn submit_statement(&self, sql: &str) -> Result<String> {
        let request = json!({
            "warehouse_id": self.warehouse_id,
            "statement": sql,
            "wait_timeout": "0s",  // Return immediately
            "on_wait_timeout": "CONTINUE"
        });

        let response: Value = self.client.request(
            Method::POST, "/sql/statements", Some(request)
        ).await?;

        Ok(response["statement_id"].as_str().unwrap().to_string())
    }
}
```

---

## 4. Delta Lake Refinements

### 4.1 Optimized Batch Writes

```rust
impl DeltaClient {
    async fn write_batch<T: Serialize + Send + Sync>(
        &self,
        table: &str,
        data: &[T],
        options: WriteOptions,
    ) -> Result<WriteResult> {
        let batch_size = options.batch_size.unwrap_or(10_000);
        let concurrency = options.concurrency.unwrap_or(4);

        if data.len() <= batch_size {
            // Single batch write
            return self.write_table(table, data, options.mode).await;
        }

        // Chunked parallel writes
        let chunks: Vec<_> = data.chunks(batch_size).collect();
        let semaphore = Arc::new(Semaphore::new(concurrency));

        let futures = chunks.iter().enumerate().map(|(idx, chunk)| {
            let sem = semaphore.clone();
            let table = table.to_string();
            let mode = if idx == 0 { options.mode } else { WriteMode::Append };

            async move {
                let _permit = sem.acquire().await?;
                self.write_chunk(&table, chunk, mode).await
            }
        });

        let results = futures::future::try_join_all(futures).await?;

        Ok(WriteResult {
            rows_affected: results.iter().map(|r| r.rows_affected).sum(),
            partitions_written: results.iter().map(|r| r.partitions_written).sum(),
        })
    }

    async fn write_chunk<T: Serialize>(
        &self,
        table: &str,
        chunk: &[T],
        mode: WriteMode,
    ) -> Result<WriteResult> {
        // Stage to cloud storage, then COPY INTO
        let staging_path = self.stage_data(chunk).await?;

        let sql = format!(
            "COPY INTO {} FROM '{}' FILEFORMAT = PARQUET {}",
            self.table_path(table),
            staging_path,
            mode.copy_options()
        );

        self.sql_client.execute(&sql).await?;

        // Cleanup staging
        self.cleanup_staging(&staging_path).await.ok();

        Ok(WriteResult {
            rows_affected: chunk.len(),
            partitions_written: 1,
        })
    }
}
```

### 4.2 Merge Operation Builder

```rust
struct MergeBuilder<'a> {
    client: &'a DeltaClient,
    target_table: String,
    source: MergeSource,
    merge_condition: String,
    when_matched: Vec<MatchedAction>,
    when_not_matched: Vec<NotMatchedAction>,
    when_not_matched_by_source: Vec<NotMatchedBySourceAction>,
}

impl<'a> MergeBuilder<'a> {
    fn new(client: &'a DeltaClient, target: &str) -> Self {
        Self {
            client,
            target_table: client.table_path(target),
            source: MergeSource::Empty,
            merge_condition: String::new(),
            when_matched: Vec::new(),
            when_not_matched: Vec::new(),
            when_not_matched_by_source: Vec::new(),
        }
    }

    fn using_source(mut self, source_table: &str) -> Self {
        self.source = MergeSource::Table(self.client.table_path(source_table));
        self
    }

    fn using_values<T: Serialize>(mut self, data: &[T]) -> Self {
        self.source = MergeSource::Values(serialize_to_values(data));
        self
    }

    fn on(mut self, condition: &str) -> Self {
        self.merge_condition = condition.to_string();
        self
    }

    fn when_matched_update(mut self, set_clause: &str) -> Self {
        self.when_matched.push(MatchedAction::Update {
            condition: None,
            set_clause: set_clause.to_string(),
        });
        self
    }

    fn when_matched_update_if(mut self, condition: &str, set_clause: &str) -> Self {
        self.when_matched.push(MatchedAction::Update {
            condition: Some(condition.to_string()),
            set_clause: set_clause.to_string(),
        });
        self
    }

    fn when_matched_delete(mut self) -> Self {
        self.when_matched.push(MatchedAction::Delete { condition: None });
        self
    }

    fn when_not_matched_insert(mut self, columns: &str, values: &str) -> Self {
        self.when_not_matched.push(NotMatchedAction::Insert {
            condition: None,
            columns: columns.to_string(),
            values: values.to_string(),
        });
        self
    }

    fn when_not_matched_insert_all(mut self) -> Self {
        self.when_not_matched.push(NotMatchedAction::InsertAll { condition: None });
        self
    }

    async fn execute(self) -> Result<MergeResult> {
        let sql = self.build_sql();

        tracing::debug!(sql = %sql, "Executing MERGE");

        let result = self.client.sql_client.execute(&sql).await?;

        Ok(MergeResult::from_sql_result(result))
    }

    fn build_sql(&self) -> String {
        let mut sql = format!(
            "MERGE INTO {} AS target USING {} AS source ON {}",
            self.target_table,
            self.source.to_sql(),
            self.merge_condition
        );

        for action in &self.when_matched {
            sql.push_str(&format!(" {}", action.to_sql()));
        }

        for action in &self.when_not_matched {
            sql.push_str(&format!(" {}", action.to_sql()));
        }

        for action in &self.when_not_matched_by_source {
            sql.push_str(&format!(" {}", action.to_sql()));
        }

        sql
    }
}

// Usage
let result = delta.merge("target_table")
    .using_values(&source_data)
    .on("target.id = source.id")
    .when_matched_update("target.value = source.value, target.updated_at = current_timestamp()")
    .when_matched_delete_if("source.deleted = true")
    .when_not_matched_insert_all()
    .execute()
    .await?;
```

### 4.3 Table Maintenance Scheduler

```rust
struct MaintenanceScheduler {
    client: DeltaClient,
    tables: Vec<TableMaintenanceConfig>,
}

struct TableMaintenanceConfig {
    table: String,
    optimize_interval: Duration,
    vacuum_retention_hours: u32,
    zorder_columns: Vec<String>,
    last_optimize: Option<Instant>,
    last_vacuum: Option<Instant>,
}

impl MaintenanceScheduler {
    async fn run_maintenance(&mut self) -> Result<MaintenanceReport> {
        let mut report = MaintenanceReport::default();

        for config in &mut self.tables {
            // Check if optimize is due
            if config.should_optimize() {
                match self.client.optimize(&config.table, OptimizeOptions {
                    zorder_columns: config.zorder_columns.clone(),
                    where_clause: None,
                }).await {
                    Ok(result) => {
                        report.optimized.push((config.table.clone(), result));
                        config.last_optimize = Some(Instant::now());
                    }
                    Err(e) => {
                        report.errors.push((config.table.clone(), e));
                    }
                }
            }

            // Check if vacuum is due
            if config.should_vacuum() {
                match self.client.vacuum(&config.table, Some(config.vacuum_retention_hours)).await {
                    Ok(result) => {
                        report.vacuumed.push((config.table.clone(), result));
                        config.last_vacuum = Some(Instant::now());
                    }
                    Err(e) => {
                        report.errors.push((config.table.clone(), e));
                    }
                }
            }
        }

        Ok(report)
    }

    async fn analyze_table(&self, table: &str) -> Result<TableHealth> {
        let history = self.client.describe_history(table, Some(100)).await?;

        // Calculate metrics
        let total_operations = history.len();
        let writes_since_optimize = history.iter()
            .take_while(|h| h.operation != "OPTIMIZE")
            .filter(|h| matches!(h.operation.as_str(), "WRITE" | "MERGE" | "UPDATE" | "DELETE"))
            .count();

        let latest_version = history.first().map(|h| h.version).unwrap_or(0);

        // Get table size
        let detail = self.client.sql_client.execute(&format!(
            "DESCRIBE DETAIL {}", self.client.table_path(table)
        )).await?;

        let size_bytes = detail.rows.first()
            .and_then(|r| r.get("sizeInBytes"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        let num_files = detail.rows.first()
            .and_then(|r| r.get("numFiles"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        Ok(TableHealth {
            table: table.to_string(),
            version: latest_version,
            size_bytes,
            num_files,
            writes_since_optimize,
            needs_optimize: writes_since_optimize > 10 || num_files > 100,
            needs_vacuum: history.iter().any(|h| h.operation == "DELETE"),
        })
    }
}
```

---

## 5. Schema Evolution Refinements

### 5.1 Safe Schema Evolution

```rust
impl SchemaManager {
    async fn evolve_safely(
        &self,
        table: &str,
        new_schema: &TableSchema,
    ) -> Result<SchemaEvolutionResult> {
        let current = self.get_schema(table).await?;
        let compatibility = self.check_compatibility(&current, new_schema);

        match compatibility {
            SchemaCompatibility::Identical => {
                Ok(SchemaEvolutionResult::NoChange)
            }
            SchemaCompatibility::Evolution { new_columns } => {
                // Validate new columns
                for col in &new_columns {
                    self.validate_column_definition(col)?;
                }

                // Apply evolution in transaction
                for col in &new_columns {
                    let sql = format!(
                        "ALTER TABLE {} ADD COLUMN {} {} {}",
                        self.client.table_path(table),
                        quote_identifier(&col.name),
                        col.data_type,
                        if col.nullable { "" } else { "NOT NULL" }
                    );

                    self.client.sql_client.execute(&sql).await?;
                }

                Ok(SchemaEvolutionResult::Evolved {
                    added_columns: new_columns,
                })
            }
            SchemaCompatibility::TypeWidening { columns } => {
                // Type widening requires careful handling
                for (col_name, from_type, to_type) in &columns {
                    if !self.is_safe_widening(from_type, to_type) {
                        return Err(DatabricksError::Schema(SchemaError::UnsafeTypeChange {
                            column: col_name.clone(),
                            from: from_type.clone(),
                            to: to_type.clone(),
                        }));
                    }

                    let sql = format!(
                        "ALTER TABLE {} ALTER COLUMN {} TYPE {}",
                        self.client.table_path(table),
                        quote_identifier(col_name),
                        to_type
                    );

                    self.client.sql_client.execute(&sql).await?;
                }

                Ok(SchemaEvolutionResult::TypesWidened { columns })
            }
            SchemaCompatibility::Incompatible { reason } => {
                Err(DatabricksError::Schema(SchemaError::IncompatibleEvolution(reason)))
            }
        }
    }

    fn is_safe_widening(&self, from: &str, to: &str) -> bool {
        matches!((from, to),
            ("TINYINT", "SMALLINT" | "INT" | "BIGINT") |
            ("SMALLINT", "INT" | "BIGINT") |
            ("INT", "BIGINT") |
            ("FLOAT", "DOUBLE") |
            ("DECIMAL", "DECIMAL") // Would need precision check
        )
    }

    fn validate_column_definition(&self, col: &ColumnSchema) -> Result<()> {
        // Check reserved words
        if is_reserved_word(&col.name) {
            return Err(DatabricksError::Schema(SchemaError::ReservedColumnName(col.name.clone())));
        }

        // Check valid data type
        if !is_valid_delta_type(&col.data_type) {
            return Err(DatabricksError::Schema(SchemaError::InvalidDataType(col.data_type.clone())));
        }

        Ok(())
    }
}
```

---

## 6. Simulation and Replay

### 6.1 Mock Client for Testing

```rust
struct MockDatabricksClient {
    recorded_requests: Arc<RwLock<Vec<RecordedRequest>>>,
    mock_responses: Arc<RwLock<VecDeque<MockResponse>>>,
    mode: MockMode,
}

enum MockMode {
    Record { target: DatabricksClient },
    Replay,
    Simulate,
}

impl MockDatabricksClient {
    fn recording(client: DatabricksClient) -> Self {
        Self {
            recorded_requests: Arc::new(RwLock::new(Vec::new())),
            mock_responses: Arc::new(RwLock::new(VecDeque::new())),
            mode: MockMode::Record { target: client },
        }
    }

    fn replaying(recorded: Vec<RecordedInteraction>) -> Self {
        let responses: VecDeque<_> = recorded.into_iter()
            .map(|r| r.response)
            .collect();

        Self {
            recorded_requests: Arc::new(RwLock::new(Vec::new())),
            mock_responses: Arc::new(RwLock::new(responses)),
            mode: MockMode::Replay,
        }
    }

    fn simulating() -> Self {
        Self {
            recorded_requests: Arc::new(RwLock::new(Vec::new())),
            mock_responses: Arc::new(RwLock::new(VecDeque::new())),
            mode: MockMode::Simulate,
        }
    }

    async fn request<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<T> {
        self.recorded_requests.write().await.push(RecordedRequest {
            timestamp: Instant::now(),
            method: method.clone(),
            path: path.to_string(),
            body: body.clone(),
        });

        match &self.mode {
            MockMode::Record { target } => {
                let response = target.request::<T>(method, path, body).await;
                // Store response for later replay
                response
            }
            MockMode::Replay => {
                let response = self.mock_responses.write().await.pop_front()
                    .ok_or(DatabricksError::Mock("No more recorded responses"))?;
                serde_json::from_value(response.body)
                    .map_err(|e| DatabricksError::Mock(e.to_string()))
            }
            MockMode::Simulate => {
                self.simulate_response(method, path, body).await
            }
        }
    }

    async fn simulate_response<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<T> {
        // Generate realistic mock responses based on endpoint
        let response = match (method, path) {
            (Method::POST, p) if p.contains("/jobs/runs/submit") => {
                json!({ "run_id": rand::random::<u64>() })
            }
            (Method::GET, p) if p.contains("/jobs/runs/get") => {
                json!({
                    "run_id": 12345,
                    "state": { "life_cycle_state": "TERMINATED", "result_state": "SUCCESS" },
                    "start_time": 1700000000000_i64,
                    "end_time": 1700000060000_i64
                })
            }
            (Method::POST, p) if p.contains("/sql/statements") => {
                json!({
                    "statement_id": format!("stmt_{}", uuid::Uuid::new_v4()),
                    "status": { "state": "SUCCEEDED" },
                    "manifest": { "schema": { "columns": [] } },
                    "result": { "data_array": [] }
                })
            }
            _ => json!({})
        };

        serde_json::from_value(response).map_err(|e| DatabricksError::Serialization(e))
    }

    fn get_recorded_requests(&self) -> Vec<RecordedRequest> {
        self.recorded_requests.blocking_read().clone()
    }
}
```

### 6.2 Dry Run Mode

```rust
impl DeltaClient {
    async fn write_dry_run<T: Serialize>(
        &self,
        table: &str,
        data: &[T],
        mode: WriteMode,
    ) -> Result<DryRunResult> {
        // Validate schema compatibility
        let inferred_schema = infer_schema(data)?;
        let current_schema = self.schema_manager.get_schema(table).await?;
        let compatibility = self.schema_manager.check_compatibility(&current_schema, &inferred_schema);

        // Estimate write size
        let estimated_size = estimate_parquet_size(data);

        // Check partition strategy
        let partitions = self.analyze_partitions(table, data).await?;

        Ok(DryRunResult {
            would_write: true,
            schema_compatibility: compatibility,
            estimated_size_bytes: estimated_size,
            estimated_partitions: partitions.len(),
            partition_values: partitions,
            mode,
            warnings: self.generate_warnings(data, &partitions),
        })
    }

    fn generate_warnings<T>(&self, data: &[T], partitions: &[String]) -> Vec<String> {
        let mut warnings = Vec::new();

        if data.len() > 1_000_000 {
            warnings.push("Large write detected. Consider batching.".to_string());
        }

        if partitions.len() > 100 {
            warnings.push("High partition count may impact performance.".to_string());
        }

        warnings
    }
}
```

---

## 7. Testing Refinements

### 7.1 Property-Based Tests

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn schema_evolution_idempotent(
            initial_cols in prop::collection::vec(valid_column(), 1..10),
            new_cols in prop::collection::vec(valid_column(), 0..5),
        ) {
            let initial = TableSchema { columns: initial_cols.clone() };
            let evolved = TableSchema {
                columns: initial_cols.into_iter().chain(new_cols).collect()
            };

            let manager = SchemaManager::mock();
            let compat1 = manager.check_compatibility(&initial, &evolved);
            let compat2 = manager.check_compatibility(&evolved, &evolved);

            // Evolution should be detected once
            prop_assert!(matches!(compat1, SchemaCompatibility::Evolution { .. } | SchemaCompatibility::Identical));
            // Same schema should be identical
            prop_assert!(matches!(compat2, SchemaCompatibility::Identical));
        }

        #[test]
        fn merge_builder_valid_sql(
            target in "[a-z_]+",
            source in "[a-z_]+",
            condition in "[a-z_]+ = [a-z_]+",
        ) {
            let client = DeltaClient::mock();
            let sql = client.merge(&target)
                .using_source(&source)
                .on(&condition)
                .when_matched_update("col = source.col")
                .when_not_matched_insert_all()
                .build_sql();

            // SQL should be valid structure
            prop_assert!(sql.contains("MERGE INTO"));
            prop_assert!(sql.contains("USING"));
            prop_assert!(sql.contains("ON"));
            prop_assert!(sql.contains("WHEN MATCHED"));
            prop_assert!(sql.contains("WHEN NOT MATCHED"));
        }
    }
}
```

### 7.2 Integration Test Fixtures

```rust
#[cfg(test)]
mod integration_tests {
    use testcontainers::*;

    struct DatabricksTestFixture {
        client: DatabricksClient,
        test_catalog: String,
        test_schema: String,
        cleanup_tables: Vec<String>,
    }

    impl DatabricksTestFixture {
        async fn new() -> Result<Self> {
            let client = DatabricksClient::from_env().await?;
            let test_id = uuid::Uuid::new_v4().simple().to_string()[..8].to_string();
            let test_schema = format!("test_{}", test_id);

            // Create test schema
            client.sql(&warehouse_id()).execute(&format!(
                "CREATE SCHEMA IF NOT EXISTS main.{}", test_schema
            )).await?;

            Ok(Self {
                client,
                test_catalog: "main".to_string(),
                test_schema,
                cleanup_tables: Vec::new(),
            })
        }

        fn delta(&self) -> DeltaClient {
            self.client.delta(&self.test_catalog, &self.test_schema)
        }

        async fn create_test_table(&mut self, name: &str, schema: &str) -> Result<String> {
            let full_name = format!("{}.{}.{}", self.test_catalog, self.test_schema, name);

            self.client.sql(&warehouse_id()).execute(&format!(
                "CREATE TABLE {} ({})", full_name, schema
            )).await?;

            self.cleanup_tables.push(full_name.clone());
            Ok(full_name)
        }
    }

    impl Drop for DatabricksTestFixture {
        fn drop(&mut self) {
            // Cleanup in background
            let tables = std::mem::take(&mut self.cleanup_tables);
            let client = self.client.clone();
            let schema = self.test_schema.clone();

            tokio::spawn(async move {
                for table in tables {
                    client.sql(&warehouse_id())
                        .execute(&format!("DROP TABLE IF EXISTS {}", table))
                        .await
                        .ok();
                }
                client.sql(&warehouse_id())
                    .execute(&format!("DROP SCHEMA IF EXISTS main.{}", schema))
                    .await
                    .ok();
            });
        }
    }
}
```

---

## 8. Configuration Refinements

### 8.1 Environment-Based Configuration

```rust
impl DatabricksConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            workspace_url: env::var("DATABRICKS_HOST")
                .map_err(|_| DatabricksError::Config("DATABRICKS_HOST not set"))?,

            auth: Self::auth_from_env()?,

            timeout: Duration::from_secs(
                env::var("DATABRICKS_TIMEOUT_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(30)
            ),

            rate_limit: env::var("DATABRICKS_RATE_LIMIT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(100.0),

            retry_config: RetryConfig {
                max_attempts: env::var("DATABRICKS_MAX_RETRIES")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(3),
                base_delay: Duration::from_millis(500),
                max_delay: Duration::from_secs(30),
            },

            default_warehouse_id: env::var("DATABRICKS_WAREHOUSE_ID").ok(),
            default_catalog: env::var("DATABRICKS_CATALOG").ok(),
            default_schema: env::var("DATABRICKS_SCHEMA").ok(),
        })
    }

    fn auth_from_env() -> Result<AuthConfig> {
        // Check PAT first
        if let Ok(token) = env::var("DATABRICKS_TOKEN") {
            return Ok(AuthConfig::PersonalAccessToken {
                token: SecretString::new(token),
            });
        }

        // Check OAuth
        if let (Ok(client_id), Ok(client_secret)) = (
            env::var("DATABRICKS_CLIENT_ID"),
            env::var("DATABRICKS_CLIENT_SECRET"),
        ) {
            return Ok(AuthConfig::OAuth {
                client_id,
                client_secret: SecretString::new(client_secret),
                scopes: vec!["all-apis".to_string()],
            });
        }

        // Check Azure Service Principal
        if let (Ok(tenant_id), Ok(client_id), Ok(client_secret)) = (
            env::var("AZURE_TENANT_ID"),
            env::var("AZURE_CLIENT_ID"),
            env::var("AZURE_CLIENT_SECRET"),
        ) {
            return Ok(AuthConfig::ServicePrincipal {
                tenant_id,
                client_id,
                client_secret: SecretString::new(client_secret),
            });
        }

        Err(DatabricksError::Config("No valid authentication configuration found"))
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement |

---

**Next Phase:** Completion - Implementation tasks, test coverage, deployment checklist, and operational runbooks.
