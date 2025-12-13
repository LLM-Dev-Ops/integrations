# Databricks Delta Lake Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/databricks-delta-lake`

---

## 1. Core Client

### 1.1 DatabricksClient

```pseudocode
CLASS DatabricksClient:
    workspace_url: String
    auth_provider: AuthProvider
    http_client: HttpClient
    circuit_breaker: CircuitBreaker
    rate_limiter: RateLimiter

    FUNCTION new(config: DatabricksConfig) -> Result<Self>:
        auth_provider = AuthProvider::from_config(config.auth)?
        http_client = HttpClient::builder()
            .timeout(config.timeout)
            .build()?

        circuit_breaker = CircuitBreaker::new(
            failure_threshold: 5,
            reset_timeout: Duration::from_secs(60)
        )

        rate_limiter = RateLimiter::new(
            requests_per_second: config.rate_limit
        )

        RETURN Ok(Self { workspace_url, auth_provider, http_client, circuit_breaker, rate_limiter })

    ASYNC FUNCTION request<T>(self, method: Method, path: &str, body: Option<Value>) -> Result<T>:
        // Check circuit breaker
        IF NOT self.circuit_breaker.allow():
            RETURN Err(DatabricksError::ServiceUnavailable("Circuit breaker open"))

        // Apply rate limiting
        self.rate_limiter.acquire().await

        // Get auth token
        token = self.auth_provider.get_token().await?

        // Build request
        url = format!("{}/api/2.1{}", self.workspace_url, path)
        request = self.http_client.request(method, url)
            .bearer_auth(token)
            .header("Content-Type", "application/json")

        IF body IS Some(b):
            request = request.json(b)

        // Execute with retry
        response = retry_with_backoff(|| async {
            self.execute_request(request.clone()).await
        }).await?

        // Update circuit breaker
        self.circuit_breaker.record_success()

        RETURN response.json::<T>().await

    ASYNC FUNCTION execute_request(self, request: Request) -> Result<Response>:
        response = request.send().await?

        MATCH response.status():
            200..299 => Ok(response)
            401 =>
                self.auth_provider.refresh_token().await?
                Err(DatabricksError::Auth(AuthError::TokenExpired))
            429 =>
                retry_after = response.headers().get("Retry-After")
                Err(DatabricksError::RateLimited(retry_after))
            400 => Err(parse_error_response(response).await)
            403 => Err(DatabricksError::PermissionDenied)
            404 => Err(DatabricksError::NotFound)
            500..599 =>
                self.circuit_breaker.record_failure()
                Err(DatabricksError::ServiceError)

    FUNCTION jobs(self) -> JobsClient:
        RETURN JobsClient::new(self.clone())

    FUNCTION sql(self, warehouse_id: &str) -> SqlClient:
        RETURN SqlClient::new(self.clone(), warehouse_id)

    FUNCTION delta(self, catalog: &str, schema: &str) -> DeltaClient:
        RETURN DeltaClient::new(self.clone(), catalog, schema)

    FUNCTION catalog(self) -> CatalogClient:
        RETURN CatalogClient::new(self.clone())
```

### 1.2 Authentication Provider

```pseudocode
ENUM AuthConfig:
    PersonalAccessToken { token: SecretString }
    OAuth { client_id: String, client_secret: SecretString, scopes: Vec<String> }
    ServicePrincipal { tenant_id: String, client_id: String, client_secret: SecretString }
    AzureAD { tenant_id: String, client_id: String }

CLASS AuthProvider:
    config: AuthConfig
    cached_token: RwLock<Option<CachedToken>>

    STRUCT CachedToken:
        token: SecretString
        expires_at: Instant

    ASYNC FUNCTION get_token(self) -> Result<String>:
        // Check cache
        cached = self.cached_token.read().await
        IF cached IS Some(t) AND t.expires_at > Instant::now() + Duration::from_secs(60):
            RETURN Ok(t.token.expose())
        DROP cached

        // Fetch new token
        token = self.fetch_token().await?
        RETURN Ok(token)

    ASYNC FUNCTION fetch_token(self) -> Result<String>:
        MATCH self.config:
            PersonalAccessToken { token } =>
                RETURN Ok(token.expose())

            OAuth { client_id, client_secret, scopes } =>
                response = http_post(
                    url: "{workspace}/oidc/v1/token",
                    body: {
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret.expose(),
                        "scope": scopes.join(" ")
                    }
                ).await?

                token = response.access_token
                expires_in = response.expires_in

                self.cache_token(token.clone(), expires_in).await
                RETURN Ok(token)

            ServicePrincipal { tenant_id, client_id, client_secret } =>
                response = http_post(
                    url: "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
                    body: {
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret.expose(),
                        "scope": "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default"
                    }
                ).await?

                self.cache_token(response.access_token, response.expires_in).await
                RETURN Ok(response.access_token)

    ASYNC FUNCTION refresh_token(self) -> Result<()>:
        self.cached_token.write().await.take()
        self.fetch_token().await?
        RETURN Ok(())
```

---

## 2. Jobs Client

### 2.1 Job Submission and Monitoring

```pseudocode
CLASS JobsClient:
    client: DatabricksClient

    ASYNC FUNCTION submit_run(self, task: JobTask) -> Result<RunId>:
        span = tracing::span!("databricks.job.submit", job_type = task.task_type())

        request = MATCH task:
            NotebookTask { path, parameters } => {
                "run_name": generate_run_name(),
                "tasks": [{
                    "task_key": "main",
                    "notebook_task": {
                        "notebook_path": path,
                        "base_parameters": parameters
                    }
                }],
                "timeout_seconds": 3600
            }

            SparkJarTask { main_class, jar_uri, parameters } => {
                "run_name": generate_run_name(),
                "tasks": [{
                    "task_key": "main",
                    "spark_jar_task": {
                        "main_class_name": main_class,
                        "jar_uri": jar_uri,
                        "parameters": parameters
                    }
                }]
            }

            PythonTask { python_file, parameters } => {
                "run_name": generate_run_name(),
                "tasks": [{
                    "task_key": "main",
                    "spark_python_task": {
                        "python_file": python_file,
                        "parameters": parameters
                    }
                }]
            }

        // Add cluster specification
        request["tasks"][0]["new_cluster"] = task.cluster_spec
            .unwrap_or(default_cluster_spec())

        response = self.client.request(POST, "/jobs/runs/submit", Some(request)).await?

        metrics::counter!("databricks_jobs_submitted_total", "job_type" => task.task_type()).increment(1)

        RETURN Ok(RunId(response.run_id))

    ASYNC FUNCTION get_run(self, run_id: RunId) -> Result<RunStatus>:
        response = self.client.request(GET, format!("/jobs/runs/get?run_id={}", run_id)).await?

        RETURN Ok(RunStatus {
            run_id: response.run_id,
            state: parse_run_state(response.state),
            start_time: response.start_time,
            end_time: response.end_time,
            tasks: response.tasks.map(parse_task_states),
            cluster_instance: response.cluster_instance
        })

    ASYNC FUNCTION wait_for_completion(self, run_id: RunId, poll_interval: Duration) -> Result<RunStatus>:
        LOOP:
            status = self.get_run(run_id).await?

            MATCH status.state:
                RunState::Terminated { result_state } =>
                    MATCH result_state:
                        ResultState::Success => RETURN Ok(status)
                        ResultState::Failed => RETURN Err(DatabricksError::JobFailed(status))
                        ResultState::Canceled => RETURN Err(DatabricksError::JobCanceled)

                RunState::InternalError =>
                    RETURN Err(DatabricksError::JobInternalError(status))

                RunState::Pending | RunState::Running =>
                    tokio::time::sleep(poll_interval).await

    ASYNC FUNCTION cancel_run(self, run_id: RunId) -> Result<()>:
        self.client.request(POST, "/jobs/runs/cancel", Some({"run_id": run_id})).await?
        RETURN Ok(())

    ASYNC FUNCTION get_output(self, run_id: RunId) -> Result<RunOutput>:
        response = self.client.request(GET, format!("/jobs/runs/get-output?run_id={}", run_id)).await?

        RETURN Ok(RunOutput {
            notebook_output: response.notebook_output,
            logs: response.logs,
            error: response.error
        })
```

### 2.2 Cluster Specification

```pseudocode
STRUCT ClusterSpec:
    spark_version: String
    node_type_id: String
    num_workers: u32
    autoscale: Option<AutoscaleConfig>
    spark_conf: HashMap<String, String>

    FUNCTION default() -> Self:
        RETURN Self {
            spark_version: "13.3.x-scala2.12",
            node_type_id: "Standard_DS3_v2",
            num_workers: 2,
            autoscale: None,
            spark_conf: HashMap::new()
        }

    FUNCTION with_autoscale(mut self, min: u32, max: u32) -> Self:
        self.autoscale = Some(AutoscaleConfig { min_workers: min, max_workers: max })
        self.num_workers = 0  // Autoscale overrides fixed workers
        RETURN self

    FUNCTION with_spark_conf(mut self, key: &str, value: &str) -> Self:
        self.spark_conf.insert(key.to_string(), value.to_string())
        RETURN self
```

---

## 3. SQL Client

### 3.1 Statement Execution

```pseudocode
CLASS SqlClient:
    client: DatabricksClient
    warehouse_id: String

    ASYNC FUNCTION execute(self, sql: &str) -> Result<StatementResult>:
        span = tracing::span!("databricks.sql.execute", warehouse_id = self.warehouse_id)
        timer = metrics::histogram!("databricks_sql_query_duration_seconds").start_timer()

        request = {
            "warehouse_id": self.warehouse_id,
            "statement": sql,
            "wait_timeout": "50s",
            "on_wait_timeout": "CONTINUE"
        }

        response = self.client.request(POST, "/sql/statements", Some(request)).await?

        // Handle async execution
        IF response.status.state == "PENDING" OR response.status.state == "RUNNING":
            RETURN self.poll_statement(response.statement_id).await

        timer.stop()

        IF response.status.state == "FAILED":
            RETURN Err(DatabricksError::SqlFailed(response.status.error))

        RETURN self.parse_result(response)

    ASYNC FUNCTION poll_statement(self, statement_id: &str) -> Result<StatementResult>:
        LOOP:
            response = self.client.request(
                GET,
                format!("/sql/statements/{}", statement_id)
            ).await?

            MATCH response.status.state:
                "SUCCEEDED" => RETURN self.parse_result(response)
                "FAILED" => RETURN Err(DatabricksError::SqlFailed(response.status.error))
                "CANCELED" => RETURN Err(DatabricksError::SqlCanceled)
                _ => tokio::time::sleep(Duration::from_millis(500)).await

    FUNCTION parse_result(self, response: Value) -> Result<StatementResult>:
        manifest = response.manifest
        result = response.result

        schema = manifest.schema.columns.map(|c| ColumnInfo {
            name: c.name,
            type_name: c.type_name,
            type_text: c.type_text
        })

        rows = result.data_array.unwrap_or_default()

        metrics::histogram!("databricks_sql_rows_returned").record(rows.len())

        RETURN Ok(StatementResult {
            statement_id: response.statement_id,
            schema,
            rows,
            total_row_count: manifest.total_row_count,
            chunk_count: result.chunk_count,
            next_chunk_index: result.next_chunk_index
        })

    ASYNC FUNCTION fetch_chunk(self, statement_id: &str, chunk_index: u32) -> Result<Vec<Row>>:
        span = tracing::span!("databricks.sql.fetch", statement_id, chunk_index)

        response = self.client.request(
            GET,
            format!("/sql/statements/{}/result/chunks/{}", statement_id, chunk_index)
        ).await?

        RETURN Ok(response.data_array)

    ASYNC FUNCTION execute_streaming(self, sql: &str) -> Result<impl Stream<Item = Row>>:
        result = self.execute(sql).await?

        RETURN stream! {
            // Yield initial rows
            FOR row IN result.rows:
                yield row

            // Fetch remaining chunks
            IF result.chunk_count > 1:
                FOR chunk_idx IN 1..result.chunk_count:
                    chunk = self.fetch_chunk(&result.statement_id, chunk_idx).await?
                    FOR row IN chunk:
                        yield row
        }

    ASYNC FUNCTION cancel(self, statement_id: &str) -> Result<()>:
        self.client.request(
            POST,
            format!("/sql/statements/{}/cancel", statement_id)
        ).await?
        RETURN Ok(())
```

### 3.2 Query Builder

```pseudocode
CLASS QueryBuilder:
    sql: String
    parameters: HashMap<String, Value>

    FUNCTION new() -> Self:
        RETURN Self { sql: String::new(), parameters: HashMap::new() }

    FUNCTION select(mut self, columns: &[&str]) -> Self:
        self.sql = format!("SELECT {}", columns.join(", "))
        RETURN self

    FUNCTION from_table(mut self, table: &str) -> Self:
        self.sql = format!("{} FROM {}", self.sql, table)
        RETURN self

    FUNCTION where_clause(mut self, condition: &str) -> Self:
        self.sql = format!("{} WHERE {}", self.sql, condition)
        RETURN self

    FUNCTION with_parameter(mut self, name: &str, value: impl Into<Value>) -> Self:
        self.parameters.insert(name.to_string(), value.into())
        RETURN self

    FUNCTION version_as_of(mut self, version: u64) -> Self:
        self.sql = format!("{} VERSION AS OF {}", self.sql, version)
        RETURN self

    FUNCTION timestamp_as_of(mut self, timestamp: &str) -> Self:
        self.sql = format!("{} TIMESTAMP AS OF '{}'", self.sql, timestamp)
        RETURN self

    FUNCTION build(self) -> (String, HashMap<String, Value>):
        RETURN (self.sql, self.parameters)
```

---

## 4. Delta Lake Client

### 4.1 Delta Operations

```pseudocode
CLASS DeltaClient:
    client: DatabricksClient
    sql_client: SqlClient
    catalog: String
    schema: String

    FUNCTION table_path(self, table: &str) -> String:
        RETURN format!("{}.{}.{}", self.catalog, self.schema, table)

    ASYNC FUNCTION read_table<T: DeserializeOwned>(self, table: &str, options: ReadOptions) -> Result<Vec<T>>:
        span = tracing::span!("databricks.delta.read", table = self.table_path(table))

        sql = QueryBuilder::new()
            .select(&options.columns.unwrap_or(vec!["*"]))
            .from_table(&self.table_path(table))

        IF options.version IS Some(v):
            sql = sql.version_as_of(v)
        ELSE IF options.timestamp IS Some(ts):
            sql = sql.timestamp_as_of(ts)

        IF options.filter IS Some(f):
            sql = sql.where_clause(f)

        IF options.limit IS Some(l):
            sql.sql = format!("{} LIMIT {}", sql.sql, l)

        result = self.sql_client.execute(&sql.build().0).await?

        rows = result.rows.into_iter()
            .map(|r| deserialize_row::<T>(r, &result.schema))
            .collect::<Result<Vec<T>>>()?

        metrics::counter!("databricks_delta_rows_processed", "table" => table, "operation" => "read")
            .increment(rows.len() as u64)

        RETURN Ok(rows)

    ASYNC FUNCTION write_table<T: Serialize>(self, table: &str, data: &[T], mode: WriteMode) -> Result<WriteResult>:
        span = tracing::span!("databricks.delta.write", table = self.table_path(table), mode = mode.as_str())

        // Convert to temporary view and insert
        temp_view = format!("_temp_{}", uuid::new_v4().simple())

        // Create temp view from data (via VALUES clause for small data, or staging for large)
        IF data.len() <= 1000:
            values = data.iter()
                .map(|row| serialize_to_values(row))
                .collect::<Vec<_>>()
                .join(", ")

            sql = format!(
                "INSERT {} {} SELECT * FROM (VALUES {})",
                mode.sql_keyword(),
                self.table_path(table),
                values
            )
        ELSE:
            // For large data, use staging location
            staging_path = self.upload_to_staging(data).await?
            sql = format!(
                "COPY INTO {} FROM '{}' FILEFORMAT = PARQUET {}",
                self.table_path(table),
                staging_path,
                mode.copy_options()
            )

        self.sql_client.execute(&sql).await?

        metrics::counter!("databricks_delta_rows_processed", "table" => table, "operation" => "write")
            .increment(data.len() as u64)

        RETURN Ok(WriteResult { rows_affected: data.len() })

    ASYNC FUNCTION merge_into<T: Serialize>(
        self,
        table: &str,
        source_data: &[T],
        merge_condition: &str,
        when_matched: Option<MergeAction>,
        when_not_matched: Option<MergeAction>
    ) -> Result<MergeResult>:
        span = tracing::span!("databricks.delta.merge", table = self.table_path(table))

        // Create source temp view
        source_view = self.create_temp_view(source_data).await?

        sql = format!("MERGE INTO {} AS target USING {} AS source ON {}",
            self.table_path(table),
            source_view,
            merge_condition
        )

        IF when_matched IS Some(action):
            sql = format!("{} WHEN MATCHED THEN {}", sql, action.to_sql())

        IF when_not_matched IS Some(action):
            sql = format!("{} WHEN NOT MATCHED THEN {}", sql, action.to_sql())

        result = self.sql_client.execute(&sql).await?

        // Parse merge metrics from result
        RETURN Ok(MergeResult {
            rows_matched: parse_merge_metric(result, "num_target_rows_updated"),
            rows_inserted: parse_merge_metric(result, "num_target_rows_inserted"),
            rows_deleted: parse_merge_metric(result, "num_target_rows_deleted")
        })

    ASYNC FUNCTION delete_from(self, table: &str, condition: &str) -> Result<u64>:
        sql = format!("DELETE FROM {} WHERE {}", self.table_path(table), condition)
        result = self.sql_client.execute(&sql).await?
        RETURN Ok(parse_affected_rows(result))

    ASYNC FUNCTION update_table(self, table: &str, set_clause: &str, condition: &str) -> Result<u64>:
        sql = format!("UPDATE {} SET {} WHERE {}", self.table_path(table), set_clause, condition)
        result = self.sql_client.execute(&sql).await?
        RETURN Ok(parse_affected_rows(result))
```

### 4.2 Table Maintenance

```pseudocode
CLASS DeltaClient (continued):

    ASYNC FUNCTION optimize(self, table: &str, options: OptimizeOptions) -> Result<OptimizeResult>:
        sql = format!("OPTIMIZE {}", self.table_path(table))

        IF options.where_clause IS Some(w):
            sql = format!("{} WHERE {}", sql, w)

        IF options.zorder_columns.len() > 0:
            sql = format!("{} ZORDER BY ({})", sql, options.zorder_columns.join(", "))

        result = self.sql_client.execute(&sql).await?

        RETURN Ok(OptimizeResult {
            files_removed: parse_optimize_metric(result, "numFilesRemoved"),
            files_added: parse_optimize_metric(result, "numFilesAdded"),
            bytes_removed: parse_optimize_metric(result, "numBytesRemoved"),
            bytes_added: parse_optimize_metric(result, "numBytesAdded")
        })

    ASYNC FUNCTION vacuum(self, table: &str, retention_hours: Option<u32>) -> Result<VacuumResult>:
        sql = format!("VACUUM {}", self.table_path(table))

        IF retention_hours IS Some(h):
            sql = format!("{} RETAIN {} HOURS", sql, h)

        result = self.sql_client.execute(&sql).await?

        RETURN Ok(VacuumResult {
            files_deleted: parse_vacuum_metric(result, "numFilesDeleted"),
            bytes_freed: parse_vacuum_metric(result, "numBytesFreed")
        })

    ASYNC FUNCTION describe_history(self, table: &str, limit: Option<u32>) -> Result<Vec<HistoryEntry>>:
        sql = format!("DESCRIBE HISTORY {}", self.table_path(table))

        IF limit IS Some(l):
            sql = format!("{} LIMIT {}", sql, l)

        result = self.sql_client.execute(&sql).await?

        RETURN result.rows.into_iter()
            .map(|r| HistoryEntry {
                version: r["version"].as_u64(),
                timestamp: r["timestamp"].as_str(),
                operation: r["operation"].as_str(),
                user_name: r["userName"].as_str(),
                operation_parameters: r["operationParameters"].clone(),
                operation_metrics: r["operationMetrics"].clone()
            })
            .collect()

    ASYNC FUNCTION restore_version(self, table: &str, version: u64) -> Result<()>:
        sql = format!("RESTORE TABLE {} TO VERSION AS OF {}", self.table_path(table), version)
        self.sql_client.execute(&sql).await?
        RETURN Ok(())

    ASYNC FUNCTION restore_timestamp(self, table: &str, timestamp: &str) -> Result<()>:
        sql = format!("RESTORE TABLE {} TO TIMESTAMP AS OF '{}'", self.table_path(table), timestamp)
        self.sql_client.execute(&sql).await?
        RETURN Ok(())
```

---

## 5. Schema Evolution

### 5.1 Schema Manager

```pseudocode
CLASS SchemaManager:
    client: DeltaClient

    ASYNC FUNCTION get_schema(self, table: &str) -> Result<TableSchema>:
        sql = format!("DESCRIBE {}", self.client.table_path(table))
        result = self.client.sql_client.execute(&sql).await?

        columns = result.rows.into_iter()
            .filter(|r| !r["col_name"].as_str().starts_with("#"))  // Skip metadata rows
            .map(|r| ColumnSchema {
                name: r["col_name"].as_str().to_string(),
                data_type: r["data_type"].as_str().to_string(),
                nullable: r["nullable"].as_str() != "false",
                comment: r["comment"].as_str().map(String::from)
            })
            .collect()

        RETURN Ok(TableSchema { columns })

    FUNCTION check_compatibility(self, source: &TableSchema, target: &TableSchema) -> SchemaCompatibility:
        // Check for breaking changes
        FOR target_col IN target.columns:
            source_col = source.columns.find(|c| c.name == target_col.name)

            IF source_col IS None:
                // New column - compatible with schema evolution
                CONTINUE

            IF NOT is_type_compatible(source_col.data_type, target_col.data_type):
                RETURN SchemaCompatibility::Incompatible {
                    reason: format!("Type mismatch for column {}: {} vs {}",
                        target_col.name, source_col.data_type, target_col.data_type)
                }

        // Check for removed columns
        FOR source_col IN source.columns:
            IF NOT target.columns.any(|c| c.name == source_col.name):
                RETURN SchemaCompatibility::Incompatible {
                    reason: format!("Column {} was removed", source_col.name)
                }

        // Determine evolution type
        new_columns = target.columns
            .filter(|c| !source.columns.any(|s| s.name == c.name))
            .collect()

        IF new_columns.is_empty():
            RETURN SchemaCompatibility::Identical
        ELSE:
            RETURN SchemaCompatibility::Evolution { new_columns }

    FUNCTION is_type_compatible(source: &str, target: &str) -> bool:
        // Same type
        IF source == target:
            RETURN true

        // Allowed type widening
        MATCH (source, target):
            ("INT", "BIGINT") => true
            ("FLOAT", "DOUBLE") => true
            ("DECIMAL(p1, s1)", "DECIMAL(p2, s2)") IF p2 >= p1 AND s2 >= s1 => true
            _ => false

    ASYNC FUNCTION evolve_schema(self, table: &str, new_columns: Vec<ColumnSchema>) -> Result<()>:
        FOR col IN new_columns:
            sql = format!(
                "ALTER TABLE {} ADD COLUMN {} {}{}",
                self.client.table_path(table),
                col.name,
                col.data_type,
                if col.comment.is_some() { format!(" COMMENT '{}'", col.comment.unwrap()) } else { "" }
            )
            self.client.sql_client.execute(&sql).await?

            tracing::info!(table = table, column = col.name, "Added column via schema evolution")

        RETURN Ok(())
```

---

## 6. Unity Catalog Client

### 6.1 Catalog Operations

```pseudocode
CLASS CatalogClient:
    client: DatabricksClient

    ASYNC FUNCTION list_catalogs(self) -> Result<Vec<CatalogInfo>>:
        response = self.client.request(GET, "/unity-catalog/catalogs").await?
        RETURN response.catalogs.map(|c| CatalogInfo {
            name: c.name,
            comment: c.comment,
            owner: c.owner,
            created_at: c.created_at
        })

    ASYNC FUNCTION list_schemas(self, catalog: &str) -> Result<Vec<SchemaInfo>>:
        response = self.client.request(
            GET,
            format!("/unity-catalog/schemas?catalog_name={}", catalog)
        ).await?

        RETURN response.schemas.map(|s| SchemaInfo {
            name: s.name,
            catalog_name: s.catalog_name,
            comment: s.comment,
            owner: s.owner
        })

    ASYNC FUNCTION list_tables(self, catalog: &str, schema: &str) -> Result<Vec<TableInfo>>:
        response = self.client.request(
            GET,
            format!("/unity-catalog/tables?catalog_name={}&schema_name={}", catalog, schema)
        ).await?

        RETURN response.tables.map(|t| TableInfo {
            name: t.name,
            catalog_name: t.catalog_name,
            schema_name: t.schema_name,
            table_type: t.table_type,
            data_source_format: t.data_source_format,
            storage_location: t.storage_location,
            columns: t.columns.map(parse_column_info)
        })

    ASYNC FUNCTION get_table(self, full_name: &str) -> Result<TableInfo>:
        response = self.client.request(
            GET,
            format!("/unity-catalog/tables/{}", url_encode(full_name))
        ).await?

        RETURN parse_table_info(response)
```

---

## 7. Streaming Jobs

### 7.1 Structured Streaming

```pseudocode
CLASS StreamingJobBuilder:
    source: StreamSource
    sink: StreamSink
    transformations: Vec<Transformation>
    trigger: TriggerMode
    checkpoint_location: String

    FUNCTION from_delta(table: &str) -> Self:
        RETURN Self {
            source: StreamSource::Delta { table: table.to_string() },
            ..Default::default()
        }

    FUNCTION from_kafka(bootstrap_servers: &str, topic: &str) -> Self:
        RETURN Self {
            source: StreamSource::Kafka { bootstrap_servers, topic },
            ..Default::default()
        }

    FUNCTION to_delta(mut self, table: &str) -> Self:
        self.sink = StreamSink::Delta { table: table.to_string() }
        RETURN self

    FUNCTION transform(mut self, sql: &str) -> Self:
        self.transformations.push(Transformation::Sql(sql.to_string()))
        RETURN self

    FUNCTION trigger_interval(mut self, interval: Duration) -> Self:
        self.trigger = TriggerMode::ProcessingTime(interval)
        RETURN self

    FUNCTION trigger_once(mut self) -> Self:
        self.trigger = TriggerMode::Once
        RETURN self

    FUNCTION checkpoint(mut self, location: &str) -> Self:
        self.checkpoint_location = location.to_string()
        RETURN self

    FUNCTION build(self) -> StreamingJobSpec:
        RETURN StreamingJobSpec {
            source: self.source,
            sink: self.sink,
            transformations: self.transformations,
            trigger: self.trigger,
            checkpoint_location: self.checkpoint_location
        }

CLASS JobsClient (streaming extension):

    ASYNC FUNCTION submit_streaming_job(self, spec: StreamingJobSpec) -> Result<RunId>:
        notebook_content = generate_streaming_notebook(spec)

        // Upload notebook to workspace
        notebook_path = format!("/Shared/streaming_jobs/{}", uuid::new_v4())
        self.upload_notebook(notebook_path, notebook_content).await?

        // Submit as notebook task
        task = JobTask::NotebookTask {
            path: notebook_path,
            parameters: {}
        }

        RETURN self.submit_run(task).await
```

---

## 8. Error Handling

```pseudocode
FUNCTION parse_error_response(response: Response) -> DatabricksError:
    body = response.json::<Value>().await.ok()

    IF body IS Some(b):
        error_code = b["error_code"].as_str().unwrap_or("UNKNOWN")
        message = b["message"].as_str().unwrap_or("Unknown error")

        MATCH error_code:
            "INVALID_STATE" => DatabricksError::Job(JobError::InvalidState(message))
            "RESOURCE_DOES_NOT_EXIST" => DatabricksError::NotFound(message)
            "PERMISSION_DENIED" => DatabricksError::PermissionDenied(message)
            "INVALID_PARAMETER_VALUE" => DatabricksError::Validation(message)
            "RESOURCE_CONFLICT" => DatabricksError::Delta(DeltaError::ConcurrentModification)
            "TEMPORARILY_UNAVAILABLE" => DatabricksError::ServiceUnavailable(message)
            _ => DatabricksError::Unknown { code: error_code, message }
    ELSE:
        DatabricksError::Unknown { code: "PARSE_ERROR", message: "Failed to parse error response" }

FUNCTION retry_with_backoff<T, F>(operation: F) -> Result<T>:
    max_attempts = 3
    base_delay = Duration::from_millis(500)

    FOR attempt IN 1..=max_attempts:
        MATCH operation().await:
            Ok(result) => RETURN Ok(result)
            Err(e) IF is_retryable(&e) AND attempt < max_attempts =>
                delay = base_delay * 2^(attempt - 1) + random_jitter()

                IF e IS DatabricksError::RateLimited(retry_after):
                    delay = retry_after.unwrap_or(delay)

                tracing::warn!(attempt, max_attempts, error = %e, "Retrying after error")
                tokio::time::sleep(delay).await
            Err(e) => RETURN Err(e)

    UNREACHABLE
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Component diagrams, module structure, data flow, and integration patterns.
