# Google BigQuery Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcp/bigquery`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Query Service](#3-query-service)
4. [Job Service](#4-job-service)
5. [Streaming Service](#5-streaming-service)
6. [Load Service](#6-load-service)
7. [Export Service](#7-export-service)
8. [Storage Read API](#8-storage-read-api)
9. [Storage Write API](#9-storage-write-api)
10. [Cost Service](#10-cost-service)
11. [Dataset and Table Management](#11-dataset-and-table-management)
12. [Simulation and Replay](#12-simulation-and-replay)
13. [Error Handling](#13-error-handling)

---

## 1. Overview

### 1.1 Document Purpose

This document provides pseudocode algorithms for the Google BigQuery Integration Module. The module is designed as a **thin adapter layer** that:
- Executes SQL queries with cost awareness
- Ingests data via batch and streaming modes
- Exports query results to GCS
- Tracks query costs and resource consumption
- Supports query simulation and replay for testing

### 1.2 Pseudocode Conventions

```
FUNCTION name(param: Type) -> ReturnType
  // Comments explain intent
  VARIABLE <- expression
  IF condition THEN
    action
  END IF
  FOR EACH item IN collection DO
    process(item)
  END FOR
  TRY
    risky_operation()
  CATCH ErrorType AS e
    handle(e)
  END TRY
  RETURN value
END FUNCTION
```

### 1.3 Constants

```
CONST BIGQUERY_API_BASE <- "https://bigquery.googleapis.com/bigquery/v2"
CONST STORAGE_API_ENDPOINT <- "bigquerystorage.googleapis.com"
CONST DEFAULT_TIMEOUT <- 60s
CONST DEFAULT_QUERY_TIMEOUT <- 600s
CONST DEFAULT_JOB_POLL_INTERVAL <- 1s
CONST MAX_JOB_POLL_INTERVAL <- 30s
CONST JOB_POLL_BACKOFF_FACTOR <- 1.5
CONST DEFAULT_MAX_BYTES_BILLED <- None  // No limit by default
CONST STREAMING_INSERT_MAX_ROWS <- 10000
CONST STREAMING_INSERT_MAX_BYTES <- 10485760  // 10 MB
CONST STORAGE_READ_MAX_STREAMS <- 10
CONST ON_DEMAND_PRICE_PER_TB <- 5.00  // USD
```

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_bigquery_client(config: BigQueryConfig) -> Result<BigQueryClient, BigQueryError>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::InvalidConfiguration(validation_result.message))
  END IF

  // Step 2: Initialize shared GCP credentials (from gcp/auth module)
  credentials_provider <- config.credentials OR create_gcp_credentials_chain()

  // Step 3: Initialize shared resilience (from shared/resilience)
  resilience_orchestrator <- create_resilience_orchestrator(
    retry_config: config.resilience.retry OR DEFAULT_RETRY_CONFIG,
    circuit_breaker_config: config.resilience.circuit_breaker OR DEFAULT_CB_CONFIG,
    rate_limiter_config: config.resilience.rate_limiter
  )

  // Step 4: Initialize shared observability (from shared/observability)
  observability <- create_observability_context(
    service_name: "bigquery",
    logger: get_logger("bigquery"),
    tracer: get_tracer("bigquery"),
    metrics: get_metrics_collector("bigquery")
  )

  // Step 5: Initialize HTTP transport for REST API
  http_transport <- create_http_transport(HttpTransportConfig {
    timeout: config.timeout OR DEFAULT_TIMEOUT,
    tls_config: TlsConfig { min_version: TLS_1_2 },
    connection_pool_size: 20
  })

  // Step 6: Initialize gRPC transport for Storage API
  grpc_transport <- create_grpc_transport(GrpcTransportConfig {
    endpoint: STORAGE_API_ENDPOINT,
    tls: true,
    credentials: credentials_provider.clone()
  })

  // Step 7: Build client with lazy service initialization
  client <- BigQueryClientImpl {
    config: config,
    http_transport: http_transport,
    grpc_transport: grpc_transport,
    credentials_provider: credentials_provider,
    resilience: resilience_orchestrator,
    observability: observability,
    cost_limit: config.maximum_bytes_billed,

    // Lazy-initialized services
    query_service: None,
    job_service: None,
    streaming_service: None,
    load_service: None,
    export_service: None,
    storage_read_service: None,
    storage_write_service: None,
    cost_service: None,
    dataset_service: None,
    table_service: None,
    simulation_service: None
  }

  observability.logger.info("BigQuery client initialized", {
    project_id: config.project_id,
    location: config.location
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client from Environment

```
FUNCTION create_bigquery_client_from_env() -> Result<BigQueryClient, BigQueryError>
  // Step 1: Reuse shared GCP credentials chain
  credentials_provider <- create_gcp_credentials_chain()

  // Step 2: Read project ID (required)
  project_id <- read_env("GOOGLE_CLOUD_PROJECT") OR read_env("GCP_PROJECT_ID")
  IF project_id IS None THEN
    RETURN Error(ConfigurationError::MissingProjectId)
  END IF

  // Step 3: Read optional configuration
  location <- read_env("BIGQUERY_LOCATION") OR "US"
  timeout_str <- read_env("BIGQUERY_TIMEOUT")
  max_bytes_billed_str <- read_env("BIGQUERY_MAX_BYTES_BILLED")
  default_dataset <- read_env("BIGQUERY_DEFAULT_DATASET")

  // Step 4: Build config
  config <- BigQueryConfig {
    project_id: project_id,
    location: location,
    credentials: credentials_provider,
    timeout: parse_duration(timeout_str) OR DEFAULT_TIMEOUT,
    default_dataset: parse_dataset_reference(default_dataset),
    maximum_bytes_billed: parse_i64(max_bytes_billed_str),
    resilience: ResilienceConfig::default(),
    observability: ObservabilityConfig::default()
  }

  RETURN create_bigquery_client(config)
END FUNCTION
```

### 2.3 Service Accessor Pattern

```
FUNCTION client.queries() -> &QueryService
  IF self.query_service IS None THEN
    LOCK self.service_mutex
      IF self.query_service IS None THEN
        self.query_service <- Some(QueryServiceImpl::new(
          project_id: self.config.project_id,
          location: self.config.location,
          http_transport: self.http_transport.clone(),
          credentials: self.credentials_provider.clone(),
          resilience: self.resilience.clone(),
          observability: self.observability.clone(),
          default_dataset: self.config.default_dataset.clone(),
          cost_limit: self.cost_limit
        ))
      END IF
    END LOCK
  END IF
  RETURN self.query_service.as_ref().unwrap()
END FUNCTION

FUNCTION client.jobs() -> &JobService
  IF self.job_service IS None THEN
    LOCK self.service_mutex
      IF self.job_service IS None THEN
        self.job_service <- Some(JobServiceImpl::new(
          project_id: self.config.project_id,
          location: self.config.location,
          http_transport: self.http_transport.clone(),
          credentials: self.credentials_provider.clone(),
          resilience: self.resilience.clone(),
          observability: self.observability.clone()
        ))
      END IF
    END LOCK
  END IF
  RETURN self.job_service.as_ref().unwrap()
END FUNCTION

FUNCTION client.storage_read() -> &StorageReadService
  IF self.storage_read_service IS None THEN
    LOCK self.service_mutex
      IF self.storage_read_service IS None THEN
        self.storage_read_service <- Some(StorageReadServiceImpl::new(
          project_id: self.config.project_id,
          grpc_transport: self.grpc_transport.clone(),
          credentials: self.credentials_provider.clone(),
          resilience: self.resilience.clone(),
          observability: self.observability.clone()
        ))
      END IF
    END LOCK
  END IF
  RETURN self.storage_read_service.as_ref().unwrap()
END FUNCTION
```

---

## 3. Query Service

### 3.1 Execute Query (Synchronous)

```
FUNCTION query_service.execute(request: QueryRequest) -> Result<QueryResponse, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.query")
  span.set_attribute("bigquery.project_id", self.project_id)
  span.set_attribute("bigquery.query_length", request.query.len())

  TRY
    // Apply cost limit if configured
    effective_max_bytes <- request.maximum_bytes_billed OR self.cost_limit

    // Build request body
    body <- {
      "query": request.query,
      "useLegacySql": request.use_legacy_sql,
      "useQueryCache": request.use_query_cache,
      "timeoutMs": request.timeout.map(|t| t.as_millis())
    }

    IF request.default_dataset IS Some THEN
      body["defaultDataset"] <- {
        "projectId": request.default_dataset.project_id OR self.project_id,
        "datasetId": request.default_dataset.dataset_id
      }
    ELSE IF self.default_dataset IS Some THEN
      body["defaultDataset"] <- {
        "projectId": self.default_dataset.project_id OR self.project_id,
        "datasetId": self.default_dataset.dataset_id
      }
    END IF

    IF effective_max_bytes IS Some THEN
      body["maximumBytesBilled"] <- effective_max_bytes.to_string()
    END IF

    IF request.parameters IS Some THEN
      body["parameterMode"] <- request.parameters.mode
      body["queryParameters"] <- serialize_query_parameters(request.parameters)
    END IF

    IF NOT request.labels.is_empty() THEN
      body["labels"] <- request.labels
    END IF

    // Build HTTP request
    url <- format("{}/projects/{}/queries", BIGQUERY_API_BASE, self.project_id)
    http_request <- build_authenticated_request(POST, url, body, self.credentials)?

    // Execute with resilience
    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    // Parse response
    result <- parse_query_response(response)?

    // Record metrics
    self.observability.metrics.record_counter("bigquery_queries_total", 1, {
      "project": self.project_id,
      "status": "success",
      "cache_hit": result.cache_hit.to_string()
    })

    IF result.total_bytes_processed IS Some THEN
      span.set_attribute("bigquery.bytes_processed", result.total_bytes_processed)
      self.observability.metrics.record_counter(
        "bigquery_bytes_processed_total",
        result.total_bytes_processed,
        { "project": self.project_id, "operation": "query" }
      )
    END IF

    span.end()
    RETURN Ok(result)

  CATCH error
    span.record_error(error)
    self.observability.metrics.record_counter("bigquery_errors_total", 1, {
      "error_type": error.type_name(),
      "operation": "query"
    })
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 3.2 Execute Async Query

```
FUNCTION query_service.execute_async(request: QueryRequest) -> Result<QueryJob, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.query_async")

  TRY
    // Build job configuration
    job_config <- {
      "query": {
        "query": request.query,
        "useLegacySql": request.use_legacy_sql,
        "useQueryCache": request.use_query_cache,
        "priority": request.priority.to_string()
      }
    }

    IF request.destination_table IS Some THEN
      job_config["query"]["destinationTable"] <- serialize_table_reference(request.destination_table)
      job_config["query"]["writeDisposition"] <- request.write_disposition.to_string()
      job_config["query"]["createDisposition"] <- "CREATE_IF_NEEDED"
    END IF

    IF request.maximum_bytes_billed IS Some OR self.cost_limit IS Some THEN
      max_bytes <- request.maximum_bytes_billed OR self.cost_limit
      job_config["query"]["maximumBytesBilled"] <- max_bytes.to_string()
    END IF

    // Build job request
    body <- {
      "configuration": job_config
    }

    IF NOT request.labels.is_empty() THEN
      body["labels"] <- request.labels
    END IF

    // Build HTTP request
    url <- format("{}/projects/{}/jobs", BIGQUERY_API_BASE, self.project_id)
    http_request <- build_authenticated_request(POST, url, body, self.credentials)?

    // Execute
    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    // Parse job response
    job <- parse_job_response(response)?

    span.set_attribute("bigquery.job_id", job.job_id)
    span.end()

    RETURN Ok(QueryJob {
      job_id: job.job_id,
      project_id: self.project_id,
      location: job.location OR self.location,
      status: JobStatus::Pending
    })

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 3.3 Dry Run Query

```
FUNCTION query_service.dry_run(query: String) -> Result<QueryDryRunResult, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.dry_run")

  TRY
    // Build dry-run request
    body <- {
      "query": query,
      "useLegacySql": false,
      "dryRun": true
    }

    IF self.default_dataset IS Some THEN
      body["defaultDataset"] <- {
        "projectId": self.default_dataset.project_id OR self.project_id,
        "datasetId": self.default_dataset.dataset_id
      }
    END IF

    // Build HTTP request
    url <- format("{}/projects/{}/queries", BIGQUERY_API_BASE, self.project_id)
    http_request <- build_authenticated_request(POST, url, body, self.credentials)?

    // Execute
    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    // Parse response
    result <- parse_dry_run_response(response)?

    // Calculate estimated cost
    estimated_cost <- calculate_query_cost(result.total_bytes_processed, self.pricing)

    span.set_attribute("bigquery.bytes_processed", result.total_bytes_processed)
    span.set_attribute("bigquery.estimated_cost_usd", estimated_cost)
    span.end()

    RETURN Ok(QueryDryRunResult {
      total_bytes_processed: result.total_bytes_processed,
      estimated_cost_usd: estimated_cost,
      cache_hit: result.cache_hit,
      schema: result.schema,
      referenced_tables: result.referenced_tables,
      query_plan: result.query_plan
    })

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 3.4 Execute Stream (Paginated Results)

```
FUNCTION query_service.execute_stream(request: QueryRequest) -> AsyncStream<Row>
  RETURN AsyncStream::new(async move |yield_| {
    // Execute initial query
    mut response <- self.execute(request).await?
    mut page_token <- response.page_token

    // Yield rows from first page
    FOR EACH row IN response.rows DO
      yield_(Ok(row)).await
    END FOR

    // Fetch additional pages
    WHILE page_token IS Some DO
      next_response <- self.get_query_results(
        response.job_reference.job_id,
        page_token
      ).await?

      FOR EACH row IN next_response.rows DO
        yield_(Ok(row)).await
      END FOR

      page_token <- next_response.page_token
    END WHILE
  })
END FUNCTION
```

### 3.5 Execute Parameterized Query

```
FUNCTION query_service.execute_parameterized(
  query: String,
  parameters: QueryParameters
) -> Result<QueryResponse, BigQueryError>
  request <- QueryRequest {
    query: query,
    parameters: Some(parameters),
    use_legacy_sql: false,
    use_query_cache: true,
    ..Default::default()
  }

  RETURN self.execute(request).await
END FUNCTION

FUNCTION serialize_query_parameters(params: QueryParameters) -> Vec<JsonValue>
  result <- []

  MATCH params
    CASE QueryParameters::Positional(values):
      FOR EACH value IN values DO
        result.push({
          "parameterType": get_parameter_type(value),
          "parameterValue": serialize_parameter_value(value)
        })
      END FOR

    CASE QueryParameters::Named(map):
      FOR EACH (name, value) IN map DO
        result.push({
          "name": name,
          "parameterType": get_parameter_type(value),
          "parameterValue": serialize_parameter_value(value)
        })
      END FOR
  END MATCH

  RETURN result
END FUNCTION
```

---

## 4. Job Service

### 4.1 Get Job

```
FUNCTION job_service.get(job_id: String, location: Option<String>) -> Result<Job, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.get_job")
  span.set_attribute("bigquery.job_id", job_id)

  TRY
    // Build URL with optional location
    url <- format("{}/projects/{}/jobs/{}", BIGQUERY_API_BASE, self.project_id, job_id)
    IF location IS Some THEN
      url <- format("{}?location={}", url, location)
    END IF

    http_request <- build_authenticated_request(GET, url, None, self.credentials)?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    job <- parse_job_response(response)?

    span.set_attribute("bigquery.job_status", job.status.state)
    span.end()

    RETURN Ok(job)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 4.2 Wait for Job Completion

```
FUNCTION job_service.wait_for_completion(
  job_id: String,
  timeout: Duration,
  poll_interval: Duration
) -> Result<Job, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.wait_for_job")
  span.set_attribute("bigquery.job_id", job_id)

  TRY
    start_time <- Instant::now()
    mut current_poll_interval <- poll_interval
    mut last_status <- JobStatus::Pending

    WHILE Instant::now() - start_time < timeout DO
      job <- self.get(job_id, None).await?

      last_status <- job.status.state

      MATCH job.status.state
        CASE "DONE":
          // Check for errors
          IF job.status.error_result IS Some THEN
            span.end()
            RETURN Error(BigQueryError::Job(JobError::JobFailed {
              job_id: job_id,
              error: job.status.error_result
            }))
          END IF

          span.set_attribute("bigquery.job_duration_ms", (Instant::now() - start_time).as_millis())
          span.end()
          RETURN Ok(job)

        CASE "RUNNING" | "PENDING":
          // Wait and poll again with exponential backoff
          sleep(current_poll_interval).await
          current_poll_interval <- min(
            current_poll_interval * JOB_POLL_BACKOFF_FACTOR,
            MAX_JOB_POLL_INTERVAL
          )

        CASE _:
          // Unknown state, continue polling
          sleep(current_poll_interval).await
      END MATCH
    END WHILE

    // Timeout reached
    span.end()
    RETURN Error(BigQueryError::Job(JobError::JobTimeout {
      job_id: job_id,
      timeout: timeout
    }))

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 4.3 Cancel Job

```
FUNCTION job_service.cancel(job_id: String, location: Option<String>) -> Result<(), BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.cancel_job")
  span.set_attribute("bigquery.job_id", job_id)

  TRY
    url <- format("{}/projects/{}/jobs/{}/cancel", BIGQUERY_API_BASE, self.project_id, job_id)
    IF location IS Some THEN
      url <- format("{}?location={}", url, location)
    END IF

    http_request <- build_authenticated_request(POST, url, None, self.credentials)?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    IF response.status != 200 THEN
      error <- parse_error_response(response)?
      RETURN Error(error)
    END IF

    self.observability.logger.info("Job cancelled", { job_id: job_id })
    span.end()
    RETURN Ok(())

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 4.4 List Jobs

```
FUNCTION job_service.list(request: ListJobsRequest) -> Result<ListJobsResponse, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.list_jobs")

  TRY
    // Build query parameters
    query_params <- []

    IF request.all_users IS Some AND request.all_users THEN
      query_params.push(("allUsers", "true"))
    END IF
    IF request.state_filter IS Some THEN
      query_params.push(("stateFilter", request.state_filter))
    END IF
    IF request.max_results IS Some THEN
      query_params.push(("maxResults", request.max_results.to_string()))
    END IF
    IF request.page_token IS Some THEN
      query_params.push(("pageToken", request.page_token))
    END IF
    IF request.projection IS Some THEN
      query_params.push(("projection", request.projection))
    END IF

    url <- format("{}/projects/{}/jobs?{}",
      BIGQUERY_API_BASE,
      self.project_id,
      encode_query_params(query_params)
    )

    http_request <- build_authenticated_request(GET, url, None, self.credentials)?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    result <- parse_list_jobs_response(response)?

    span.set_attribute("bigquery.jobs_count", result.jobs.len())
    span.end()

    RETURN Ok(result)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 5. Streaming Service

### 5.1 Insert All (Streaming Inserts)

```
FUNCTION streaming_service.insert_all(
  table: TableReference,
  rows: Vec<InsertRow>,
  options: InsertOptions
) -> Result<InsertAllResponse, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.streaming_insert")
  span.set_attribute("bigquery.table", format_table_reference(table))
  span.set_attribute("bigquery.rows_count", rows.len())

  TRY
    // Validate batch size
    IF rows.len() > STREAMING_INSERT_MAX_ROWS THEN
      RETURN Error(BigQueryError::Streaming(StreamingError::RowCountExceeded {
        count: rows.len(),
        max: STREAMING_INSERT_MAX_ROWS
      }))
    END IF

    // Build request body
    body <- {
      "rows": rows.iter().map(|row| {
        mut row_obj <- { "json": row.json }
        IF row.insert_id IS Some THEN
          row_obj["insertId"] <- row.insert_id
        END IF
        row_obj
      }).collect(),
      "skipInvalidRows": options.skip_invalid_rows,
      "ignoreUnknownValues": options.ignore_unknown_values
    }

    IF options.template_suffix IS Some THEN
      body["templateSuffix"] <- options.template_suffix
    END IF

    // Build URL
    url <- format(
      "{}/projects/{}/datasets/{}/tables/{}/insertAll",
      BIGQUERY_API_BASE,
      table.project_id OR self.project_id,
      table.dataset_id,
      table.table_id
    )

    http_request <- build_authenticated_request(POST, url, body, self.credentials)?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    result <- parse_insert_all_response(response)?

    // Record metrics
    self.observability.metrics.record_counter(
      "bigquery_streaming_rows_total",
      rows.len(),
      {
        "project": self.project_id,
        "dataset": table.dataset_id,
        "table": table.table_id
      }
    )

    IF result.insert_errors.len() > 0 THEN
      self.observability.logger.warn("Some rows failed to insert", {
        table: format_table_reference(table),
        error_count: result.insert_errors.len()
      })
    END IF

    span.end()
    RETURN Ok(result)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 5.2 Buffered Inserter

```
STRUCT BufferedInserter {
  table: TableReference,
  options: BufferedInsertOptions,
  buffer: Arc<RwLock<Vec<InsertRow>>>,
  buffer_size: Arc<AtomicUsize>,
  streaming_service: Arc<StreamingService>,
  flush_sender: Sender<FlushSignal>
}

FUNCTION streaming_service.buffered_insert(
  table: TableReference,
  options: BufferedInsertOptions
) -> BufferedInserter
  (flush_sender, flush_receiver) <- channel(10)

  inserter <- BufferedInserter {
    table: table.clone(),
    options: options.clone(),
    buffer: Arc::new(RwLock::new(Vec::new())),
    buffer_size: Arc::new(AtomicUsize::new(0)),
    streaming_service: Arc::new(self.clone()),
    flush_sender: flush_sender
  }

  // Spawn background flush task
  spawn_buffered_insert_flush_task(
    inserter.buffer.clone(),
    inserter.buffer_size.clone(),
    inserter.streaming_service.clone(),
    table,
    options,
    flush_receiver
  )

  RETURN inserter
END FUNCTION

FUNCTION buffered_inserter.add(row: InsertRow) -> Result<(), BigQueryError>
  row_size <- estimate_row_size(row)

  // Check if adding would exceed limits
  current_size <- self.buffer_size.load()
  current_count <- self.buffer.read().await.len()

  should_flush <- (current_size + row_size > self.options.max_bytes) OR
                  (current_count + 1 > self.options.max_rows)

  IF should_flush THEN
    self.flush_sender.send(FlushSignal::Flush).await
  END IF

  // Add to buffer
  mut buffer <- self.buffer.write().await
  buffer.push(row)
  self.buffer_size.fetch_add(row_size, Ordering::SeqCst)

  RETURN Ok(())
END FUNCTION

FUNCTION buffered_inserter.flush() -> Result<InsertAllResponse, BigQueryError>
  mut buffer <- self.buffer.write().await
  rows <- buffer.drain(..).collect()
  self.buffer_size.store(0, Ordering::SeqCst)

  IF rows.is_empty() THEN
    RETURN Ok(InsertAllResponse { insert_errors: vec![] })
  END IF

  RETURN self.streaming_service.insert_all(
    self.table.clone(),
    rows,
    self.options.insert_options.clone()
  ).await
END FUNCTION

FUNCTION buffered_inserter.close() -> Result<InsertAllResponse, BigQueryError>
  self.flush_sender.send(FlushSignal::Close).await
  RETURN self.flush().await
END FUNCTION
```

---

## 6. Load Service

### 6.1 Load from GCS

```
FUNCTION load_service.load_from_gcs(config: LoadJobConfig) -> Result<Job, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.load_from_gcs")
  span.set_attribute("bigquery.destination_table", format_table_reference(config.destination_table))
  span.set_attribute("bigquery.source_format", config.source_format.to_string())

  TRY
    // Build load configuration
    load_config <- {
      "sourceUris": config.source_uris,
      "sourceFormat": config.source_format.to_string(),
      "destinationTable": serialize_table_reference(config.destination_table),
      "writeDisposition": config.write_disposition.to_string(),
      "autodetect": config.autodetect
    }

    IF config.schema IS Some THEN
      load_config["schema"] <- serialize_schema(config.schema)
    END IF

    IF config.max_bad_records > 0 THEN
      load_config["maxBadRecords"] <- config.max_bad_records
    END IF

    IF config.ignore_unknown_values THEN
      load_config["ignoreUnknownValues"] <- true
    END IF

    // Add format-specific options
    MATCH config.source_format
      CASE SourceFormat::Csv { options }:
        load_config["csvOptions"] <- serialize_csv_options(options)
      CASE SourceFormat::Json { options }:
        load_config["jsonOptions"] <- serialize_json_options(options)
      CASE _:
        // No additional options needed
    END MATCH

    // Build job request
    body <- {
      "configuration": {
        "load": load_config
      }
    }

    IF NOT config.labels.is_empty() THEN
      body["labels"] <- config.labels
    END IF

    // Create job
    url <- format("{}/projects/{}/jobs", BIGQUERY_API_BASE, self.project_id)
    http_request <- build_authenticated_request(POST, url, body, self.credentials)?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    job <- parse_job_response(response)?

    self.observability.metrics.record_counter("bigquery_jobs_total", 1, {
      "project": self.project_id,
      "type": "load",
      "status": "created"
    })

    span.set_attribute("bigquery.job_id", job.job_id)
    span.end()

    RETURN Ok(job)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 6.2 Load from Memory

```
FUNCTION load_service.load_from_memory(
  data: Vec<u8>,
  format: SourceFormat,
  config: LoadJobConfig
) -> Result<Job, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.load_from_memory")

  TRY
    // Build multipart request
    load_config <- {
      "sourceFormat": format.to_string(),
      "destinationTable": serialize_table_reference(config.destination_table),
      "writeDisposition": config.write_disposition.to_string(),
      "autodetect": config.autodetect
    }

    IF config.schema IS Some THEN
      load_config["schema"] <- serialize_schema(config.schema)
    END IF

    metadata <- {
      "configuration": {
        "load": load_config
      }
    }

    // Build multipart upload
    url <- format(
      "https://bigquery.googleapis.com/upload/bigquery/v2/projects/{}/jobs?uploadType=multipart",
      self.project_id
    )

    multipart_body <- build_multipart_body(
      metadata: serialize_json(metadata),
      data: data,
      content_type: get_content_type_for_format(format)
    )

    http_request <- build_authenticated_multipart_request(
      POST, url, multipart_body, self.credentials
    )?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    job <- parse_job_response(response)?

    span.set_attribute("bigquery.job_id", job.job_id)
    span.set_attribute("bigquery.data_size_bytes", data.len())
    span.end()

    RETURN Ok(job)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 7. Export Service

### 7.1 Export to GCS

```
FUNCTION export_service.export_to_gcs(config: ExportJobConfig) -> Result<Job, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.export_to_gcs")
  span.set_attribute("bigquery.source_table", format_table_reference(config.source_table))
  span.set_attribute("bigquery.destination_format", config.destination_format.to_string())

  TRY
    // Build extract configuration
    extract_config <- {
      "sourceTable": serialize_table_reference(config.source_table),
      "destinationUris": config.destination_uris,
      "destinationFormat": config.destination_format.to_string()
    }

    IF config.compression IS Some THEN
      extract_config["compression"] <- config.compression.to_string()
    END IF

    IF config.field_delimiter IS Some THEN
      extract_config["fieldDelimiter"] <- config.field_delimiter
    END IF

    IF config.print_header IS Some THEN
      extract_config["printHeader"] <- config.print_header
    END IF

    // Build job request
    body <- {
      "configuration": {
        "extract": extract_config
      }
    }

    IF NOT config.labels.is_empty() THEN
      body["labels"] <- config.labels
    END IF

    // Create job
    url <- format("{}/projects/{}/jobs", BIGQUERY_API_BASE, self.project_id)
    http_request <- build_authenticated_request(POST, url, body, self.credentials)?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    job <- parse_job_response(response)?

    self.observability.metrics.record_counter("bigquery_jobs_total", 1, {
      "project": self.project_id,
      "type": "extract",
      "status": "created"
    })

    span.set_attribute("bigquery.job_id", job.job_id)
    span.end()

    RETURN Ok(job)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 8. Storage Read API

### 8.1 Create Read Session

```
FUNCTION storage_read_service.create_session(
  table: TableReference,
  options: ReadSessionOptions
) -> Result<ReadSession, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.storage.create_read_session")
  span.set_attribute("bigquery.table", format_table_reference(table))

  TRY
    // Build gRPC request
    request <- CreateReadSessionRequest {
      parent: format("projects/{}", self.project_id),
      read_session: ReadSession {
        table: format(
          "projects/{}/datasets/{}/tables/{}",
          table.project_id OR self.project_id,
          table.dataset_id,
          table.table_id
        ),
        data_format: options.data_format OR DataFormat::Arrow,
        read_options: ReadOptions {
          selected_fields: options.selected_fields,
          row_restriction: options.row_filter
        }
      },
      max_stream_count: options.max_streams OR STORAGE_READ_MAX_STREAMS
    }

    // Execute gRPC call
    response <- self.grpc_transport.create_read_session(request).await?

    span.set_attribute("bigquery.stream_count", response.streams.len())
    span.end()

    RETURN Ok(response)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 8.2 Read Stream

```
FUNCTION storage_read_service.read_stream(stream_name: String) -> AsyncStream<ArrowRecordBatch>
  RETURN AsyncStream::new(async move |yield_| {
    span <- self.observability.tracer.start_span("bigquery.storage.read_stream")
    span.set_attribute("bigquery.stream_name", stream_name)

    TRY
      // Build gRPC request
      request <- ReadRowsRequest {
        read_stream: stream_name
      }

      // Execute streaming gRPC call
      mut response_stream <- self.grpc_transport.read_rows(request).await?

      mut total_rows <- 0

      WHILE let Some(response) = response_stream.next().await DO
        MATCH response
          CASE Ok(read_rows_response):
            // Parse Arrow data
            batch <- parse_arrow_batch(read_rows_response.arrow_record_batch)?
            total_rows <- total_rows + batch.num_rows()
            yield_(Ok(batch)).await

          CASE Err(error):
            span.record_error(error)
            yield_(Err(BigQueryError::from(error))).await
            BREAK
        END MATCH
      END WHILE

      span.set_attribute("bigquery.total_rows", total_rows)
      span.end()

    CATCH error
      span.record_error(error)
      span.end()
    END TRY
  })
END FUNCTION
```

### 8.3 Read All (Parallel Streams)

```
FUNCTION storage_read_service.read_all(
  session: ReadSession,
  parallelism: usize
) -> AsyncStream<ArrowRecordBatch>
  RETURN AsyncStream::new(async move |yield_| {
    // Create stream readers for each stream (up to parallelism limit)
    streams_to_read <- session.streams.iter()
      .take(parallelism)
      .map(|s| s.name.clone())
      .collect()

    // Create futures for parallel reading
    mut futures <- FuturesUnordered::new()

    FOR EACH stream_name IN streams_to_read DO
      futures.push(self.read_stream(stream_name))
    END FOR

    // Process results as they arrive
    WHILE let Some(result) = futures.next().await DO
      pin_mut!(result)
      WHILE let Some(batch_result) = result.next().await DO
        yield_(batch_result).await
      END WHILE
    END WHILE
  })
END FUNCTION
```

---

## 9. Storage Write API

### 9.1 Create Write Stream

```
FUNCTION storage_write_service.create_stream(
  table: TableReference,
  mode: WriteStreamMode
) -> Result<WriteStream, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.storage.create_write_stream")
  span.set_attribute("bigquery.table", format_table_reference(table))
  span.set_attribute("bigquery.write_mode", mode.to_string())

  TRY
    // Build gRPC request
    request <- CreateWriteStreamRequest {
      parent: format(
        "projects/{}/datasets/{}/tables/{}",
        table.project_id OR self.project_id,
        table.dataset_id,
        table.table_id
      ),
      write_stream: WriteStream {
        type: MATCH mode
          CASE WriteStreamMode::Committed: WriteStreamType::Committed
          CASE WriteStreamMode::Pending: WriteStreamType::Pending
          CASE WriteStreamMode::Buffered: WriteStreamType::Buffered
        END MATCH
      }
    }

    // Execute gRPC call
    response <- self.grpc_transport.create_write_stream(request).await?

    span.set_attribute("bigquery.stream_name", response.name)
    span.end()

    RETURN Ok(response)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 9.2 Append Rows

```
FUNCTION storage_write_service.append_rows(
  stream: WriteStream,
  rows: ArrowRecordBatch
) -> Result<AppendRowsResponse, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.storage.append_rows")
  span.set_attribute("bigquery.stream_name", stream.name)
  span.set_attribute("bigquery.row_count", rows.num_rows())

  TRY
    // Serialize rows to proto format
    serialized_rows <- serialize_arrow_to_proto(rows)?

    // Build gRPC request
    request <- AppendRowsRequest {
      write_stream: stream.name,
      proto_rows: ProtoData {
        writer_schema: get_proto_schema(rows.schema()),
        rows: ProtoRows {
          serialized_rows: serialized_rows
        }
      }
    }

    // Execute gRPC call
    response <- self.grpc_transport.append_rows(request).await?

    span.set_attribute("bigquery.offset", response.append_result.offset)
    span.end()

    RETURN Ok(response)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 9.3 Finalize and Commit

```
FUNCTION storage_write_service.finalize_stream(stream: WriteStream) -> Result<i64, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.storage.finalize_stream")
  span.set_attribute("bigquery.stream_name", stream.name)

  TRY
    request <- FinalizeWriteStreamRequest {
      name: stream.name
    }

    response <- self.grpc_transport.finalize_write_stream(request).await?

    span.set_attribute("bigquery.row_count", response.row_count)
    span.end()

    RETURN Ok(response.row_count)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION

FUNCTION storage_write_service.batch_commit(
  table: TableReference,
  stream_names: Vec<String>
) -> Result<BatchCommitResponse, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.storage.batch_commit")
  span.set_attribute("bigquery.stream_count", stream_names.len())

  TRY
    request <- BatchCommitWriteStreamsRequest {
      parent: format(
        "projects/{}/datasets/{}/tables/{}",
        table.project_id OR self.project_id,
        table.dataset_id,
        table.table_id
      ),
      write_streams: stream_names
    }

    response <- self.grpc_transport.batch_commit_write_streams(request).await?

    IF response.stream_errors.len() > 0 THEN
      span.end()
      RETURN Error(BigQueryError::StorageApi(StorageApiError::CommitFailed {
        errors: response.stream_errors
      }))
    END IF

    span.set_attribute("bigquery.commit_time", response.commit_time.to_string())
    span.end()

    RETURN Ok(response)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 10. Cost Service

### 10.1 Estimate Query Cost

```
FUNCTION cost_service.estimate_query_cost(query: String) -> Result<CostEstimate, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.estimate_cost")

  TRY
    // Perform dry-run
    dry_run_result <- self.query_service.dry_run(query).await?

    // Calculate cost
    bytes_billed <- calculate_bytes_billed(dry_run_result.total_bytes_processed)
    estimated_cost <- calculate_query_cost(bytes_billed, self.pricing)

    self.observability.metrics.record_gauge(
      "bigquery_estimated_cost_usd",
      estimated_cost,
      { "project": self.project_id }
    )

    span.set_attribute("bigquery.bytes_processed", dry_run_result.total_bytes_processed)
    span.set_attribute("bigquery.estimated_cost_usd", estimated_cost)
    span.end()

    RETURN Ok(CostEstimate {
      bytes_processed: dry_run_result.total_bytes_processed,
      bytes_billed: bytes_billed,
      estimated_cost_usd: estimated_cost,
      slot_ms: dry_run_result.slot_ms,
      cache_hit: dry_run_result.cache_hit
    })

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION

FUNCTION calculate_query_cost(bytes_billed: i64, pricing: BigQueryPricing) -> f64
  // BigQuery bills in TB increments
  // Minimum billing is 10 MB per query
  effective_bytes <- max(bytes_billed, 10 * 1024 * 1024)
  tb_processed <- effective_bytes as f64 / (1024.0 * 1024.0 * 1024.0 * 1024.0)
  RETURN tb_processed * pricing.on_demand_per_tb
END FUNCTION

FUNCTION calculate_bytes_billed(bytes_processed: i64) -> i64
  // BigQuery rounds up to nearest 10 MB
  mb_10 <- 10 * 1024 * 1024
  RETURN ((bytes_processed + mb_10 - 1) / mb_10) * mb_10
END FUNCTION
```

### 10.2 Get Job Cost

```
FUNCTION cost_service.get_job_cost(job_id: String) -> Result<JobCost, BigQueryError>
  TRY
    // Get job details
    job <- self.job_service.get(job_id, None).await?

    IF job.status.state != "DONE" THEN
      RETURN Error(BigQueryError::Job(JobError::JobNotComplete {
        job_id: job_id
      }))
    END IF

    // Extract statistics
    stats <- job.statistics

    bytes_processed <- stats.total_bytes_processed OR 0
    bytes_billed <- stats.total_bytes_billed OR calculate_bytes_billed(bytes_processed)
    actual_cost <- calculate_query_cost(bytes_billed, self.pricing)

    RETURN Ok(JobCost {
      job_id: job_id,
      bytes_processed: bytes_processed,
      bytes_billed: bytes_billed,
      actual_cost_usd: actual_cost,
      slot_ms: stats.total_slot_ms OR 0,
      total_bytes_processed: stats.query.total_bytes_processed OR bytes_processed
    })

  CATCH error
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 10.3 Cost Limit Management

```
FUNCTION cost_service.set_cost_limit(max_bytes: i64)
  self.cost_limit.store(Some(max_bytes))
  self.observability.logger.info("Cost limit set", {
    max_bytes: max_bytes,
    estimated_max_cost_usd: calculate_query_cost(max_bytes, self.pricing)
  })
END FUNCTION

FUNCTION cost_service.get_cost_limit() -> Option<i64>
  RETURN self.cost_limit.load()
END FUNCTION

FUNCTION cost_service.check_cost_limit(estimated_bytes: i64) -> Result<(), BigQueryError>
  IF self.cost_limit IS Some THEN
    limit <- self.cost_limit.unwrap()
    IF estimated_bytes > limit THEN
      RETURN Error(BigQueryError::Query(QueryError::BytesLimitExceeded {
        estimated: estimated_bytes,
        limit: limit,
        estimated_cost_usd: calculate_query_cost(estimated_bytes, self.pricing),
        limit_cost_usd: calculate_query_cost(limit, self.pricing)
      }))
    END IF
  END IF
  RETURN Ok(())
END FUNCTION
```

---

## 11. Dataset and Table Management

### 11.1 Create Dataset

```
FUNCTION dataset_service.create(request: CreateDatasetRequest) -> Result<Dataset, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.create_dataset")
  span.set_attribute("bigquery.dataset_id", request.dataset_id)

  TRY
    body <- {
      "datasetReference": {
        "projectId": self.project_id,
        "datasetId": request.dataset_id
      }
    }

    IF request.location IS Some THEN
      body["location"] <- request.location
    END IF

    IF request.description IS Some THEN
      body["description"] <- request.description
    END IF

    IF request.default_table_expiration_ms IS Some THEN
      body["defaultTableExpirationMs"] <- request.default_table_expiration_ms.to_string()
    END IF

    IF NOT request.labels.is_empty() THEN
      body["labels"] <- request.labels
    END IF

    url <- format("{}/projects/{}/datasets", BIGQUERY_API_BASE, self.project_id)
    http_request <- build_authenticated_request(POST, url, body, self.credentials)?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    dataset <- parse_dataset_response(response)?

    span.end()
    RETURN Ok(dataset)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 11.2 Create Table

```
FUNCTION table_service.create(request: CreateTableRequest) -> Result<Table, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.create_table")
  span.set_attribute("bigquery.table", format("{}.{}", request.dataset_id, request.table_id))

  TRY
    body <- {
      "tableReference": {
        "projectId": self.project_id,
        "datasetId": request.dataset_id,
        "tableId": request.table_id
      },
      "schema": serialize_schema(request.schema)
    }

    IF request.description IS Some THEN
      body["description"] <- request.description
    END IF

    IF request.expiration_time IS Some THEN
      body["expirationTime"] <- request.expiration_time.to_string()
    END IF

    IF request.partitioning IS Some THEN
      body["timePartitioning"] <- serialize_partitioning(request.partitioning)
    END IF

    IF request.clustering IS Some THEN
      body["clustering"] <- { "fields": request.clustering.fields }
    END IF

    IF NOT request.labels.is_empty() THEN
      body["labels"] <- request.labels
    END IF

    url <- format(
      "{}/projects/{}/datasets/{}/tables",
      BIGQUERY_API_BASE,
      self.project_id,
      request.dataset_id
    )
    http_request <- build_authenticated_request(POST, url, body, self.credentials)?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    table <- parse_table_response(response)?

    span.end()
    RETURN Ok(table)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 11.3 Get Table

```
FUNCTION table_service.get(table: TableReference) -> Result<Table, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.get_table")
  span.set_attribute("bigquery.table", format_table_reference(table))

  TRY
    url <- format(
      "{}/projects/{}/datasets/{}/tables/{}",
      BIGQUERY_API_BASE,
      table.project_id OR self.project_id,
      table.dataset_id,
      table.table_id
    )
    http_request <- build_authenticated_request(GET, url, None, self.credentials)?

    response <- self.resilience.execute(|| {
      self.http_transport.send(http_request)
    }).await?

    result <- parse_table_response(response)?

    span.end()
    RETURN Ok(result)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 12. Simulation and Replay

### 12.1 Mock Query Response

```
FUNCTION simulation_service.mock_query_response(
  schema: TableSchema,
  rows: Vec<Row>
) -> MockQueryResponse
  RETURN MockQueryResponse {
    schema: schema,
    rows: rows,
    total_bytes_processed: estimate_bytes_for_rows(rows),
    cache_hit: false,
    job_complete: true
  }
END FUNCTION
```

### 12.2 Replay Workload

```
FUNCTION simulation_service.replay_workload(
  workload: RecordedWorkload,
  options: ReplayOptions
) -> Result<ReplayResult, BigQueryError>
  span <- self.observability.tracer.start_span("bigquery.replay_workload")
  span.set_attribute("bigquery.query_count", workload.queries.len())

  TRY
    results <- []
    total_bytes <- 0
    total_cost <- 0.0

    FOR EACH recorded_query IN workload.queries DO
      // Apply time scaling delay
      IF options.time_scale > 0.0 THEN
        delay <- recorded_query.relative_time / options.time_scale
        sleep(delay).await
      END IF

      IF options.dry_run_only THEN
        // Only estimate cost, don't execute
        estimate <- self.cost_service.estimate_query_cost(recorded_query.query).await?
        total_bytes <- total_bytes + estimate.bytes_processed
        total_cost <- total_cost + estimate.estimated_cost_usd

        results.push(ReplayQueryResult {
          query: recorded_query.query,
          dry_run: true,
          bytes_processed: estimate.bytes_processed,
          cost_usd: estimate.estimated_cost_usd,
          duration: Duration::ZERO,
          error: None
        })
      ELSE
        // Execute query
        start <- Instant::now()
        TRY
          response <- self.query_service.execute(QueryRequest {
            query: recorded_query.query,
            ..Default::default()
          }).await?

          duration <- Instant::now() - start
          bytes <- response.total_bytes_processed OR 0
          cost <- calculate_query_cost(bytes, self.pricing)

          total_bytes <- total_bytes + bytes
          total_cost <- total_cost + cost

          results.push(ReplayQueryResult {
            query: recorded_query.query,
            dry_run: false,
            bytes_processed: bytes,
            cost_usd: cost,
            duration: duration,
            error: None
          })

        CATCH error
          results.push(ReplayQueryResult {
            query: recorded_query.query,
            dry_run: false,
            bytes_processed: 0,
            cost_usd: 0.0,
            duration: Instant::now() - start,
            error: Some(error.to_string())
          })
        END TRY
      END IF
    END FOR

    span.set_attribute("bigquery.total_bytes", total_bytes)
    span.set_attribute("bigquery.total_cost_usd", total_cost)
    span.end()

    RETURN Ok(ReplayResult {
      queries_executed: results.len(),
      total_bytes_processed: total_bytes,
      total_cost_usd: total_cost,
      results: results
    })

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 12.3 Generate Synthetic Data

```
FUNCTION simulation_service.generate_data(
  schema: TableSchema,
  count: usize,
  options: DataGenOptions
) -> Vec<Row>
  rng <- create_rng_with_seed(options.seed)
  rows <- []

  FOR i IN 0..count DO
    row <- generate_row_from_schema(schema, rng, options)
    rows.push(row)
  END FOR

  RETURN rows
END FUNCTION

FUNCTION generate_row_from_schema(
  schema: TableSchema,
  rng: Rng,
  options: DataGenOptions
) -> Row
  fields <- HashMap::new()

  FOR EACH field IN schema.fields DO
    value <- MATCH field.type
      CASE "STRING":
        generate_string(field.name, options.string_length, rng)
      CASE "INTEGER" | "INT64":
        generate_integer(options.int_range, rng)
      CASE "FLOAT" | "FLOAT64":
        generate_float(options.float_range, rng)
      CASE "BOOLEAN" | "BOOL":
        rng.gen_bool(0.5)
      CASE "TIMESTAMP":
        generate_timestamp(options.time_range, rng)
      CASE "DATE":
        generate_date(options.time_range, rng)
      CASE "BYTES":
        generate_bytes(options.bytes_length, rng)
      CASE "RECORD" | "STRUCT":
        generate_row_from_schema(field.fields, rng, options)
      CASE _:
        Null
    END MATCH

    // Apply null rate
    IF rng.gen_float() < options.null_rate AND field.mode != "REQUIRED" THEN
      value <- Null
    END IF

    fields.insert(field.name, value)
  END FOR

  RETURN Row { fields: fields }
END FUNCTION
```

### 12.4 Mock BigQuery Client

```
STRUCT MockBigQuery {
  datasets: HashMap<String, MockDataset>,
  tables: HashMap<(String, String), MockTable>,
  jobs: HashMap<String, MockJob>,
  query_responses: HashMap<String, MockQueryResponse>,
  errors: HashMap<String, BigQueryError>
}

FUNCTION MockBigQuery::new() -> MockBigQuery
  RETURN MockBigQuery {
    datasets: HashMap::new(),
    tables: HashMap::new(),
    jobs: HashMap::new(),
    query_responses: HashMap::new(),
    errors: HashMap::new()
  }
END FUNCTION

FUNCTION mock_bigquery.add_query_response(query_pattern: String, response: MockQueryResponse)
  self.query_responses.insert(query_pattern, response)
END FUNCTION

FUNCTION mock_bigquery.execute_query(query: String) -> Result<QueryResponse, BigQueryError>
  // Check for configured error
  IF self.errors.contains_key("query") THEN
    RETURN Error(self.errors.get("query").clone())
  END IF

  // Find matching response
  FOR EACH (pattern, response) IN self.query_responses DO
    IF query.contains(pattern) OR regex_match(pattern, query) THEN
      RETURN Ok(QueryResponse {
        schema: response.schema.clone(),
        rows: response.rows.clone(),
        total_bytes_processed: Some(response.total_bytes_processed),
        cache_hit: response.cache_hit,
        job_complete: response.job_complete,
        page_token: None,
        job_reference: JobReference {
          project_id: "mock-project",
          job_id: generate_mock_job_id(),
          location: "US"
        }
      })
    END IF
  END FOR

  // No matching response, return empty
  RETURN Ok(QueryResponse {
    schema: TableSchema { fields: vec![] },
    rows: vec![],
    total_bytes_processed: Some(0),
    cache_hit: false,
    job_complete: true,
    page_token: None,
    job_reference: JobReference {
      project_id: "mock-project",
      job_id: generate_mock_job_id(),
      location: "US"
    }
  })
END FUNCTION
```

---

## 13. Error Handling

### 13.1 Error Mapping

```
FUNCTION map_bigquery_error(status_code: u16, error_body: JsonValue) -> BigQueryError
  error_reason <- error_body["error"]["errors"][0]["reason"].as_str()
  error_message <- error_body["error"]["message"].as_str()

  MATCH error_reason
    // Resource errors
    CASE "notFound":
      IF error_message.contains("dataset") THEN
        RETURN BigQueryError::Resource(ResourceError::DatasetNotFound {
          message: error_message
        })
      ELSE IF error_message.contains("table") THEN
        RETURN BigQueryError::Resource(ResourceError::TableNotFound {
          message: error_message
        })
      ELSE IF error_message.contains("job") THEN
        RETURN BigQueryError::Resource(ResourceError::JobNotFound {
          message: error_message
        })
      ELSE
        RETURN BigQueryError::Resource(ResourceError::NotFound {
          message: error_message
        })
      END IF

    CASE "duplicate":
      RETURN BigQueryError::Resource(ResourceError::ResourceAlreadyExists {
        message: error_message
      })

    CASE "quotaExceeded":
      RETURN BigQueryError::Resource(ResourceError::QuotaExceeded {
        message: error_message
      })

    // Query errors
    CASE "invalidQuery":
      RETURN BigQueryError::Query(QueryError::InvalidQuery {
        message: error_message
      })

    CASE "responseTooLarge":
      RETURN BigQueryError::Query(QueryError::ResponseTooLarge {
        message: error_message
      })

    CASE "bytesBilledLimitExceeded":
      RETURN BigQueryError::Query(QueryError::BytesLimitExceeded {
        message: error_message
      })

    // Rate limit errors
    CASE "rateLimitExceeded":
      RETURN BigQueryError::RateLimit(RateLimitError::TooManyRequests {
        message: error_message
      })

    // Auth errors
    CASE "accessDenied":
      RETURN BigQueryError::Authentication(AuthenticationError::AccessDenied {
        message: error_message
      })

    // Server errors
    CASE "backendError":
      RETURN BigQueryError::Server(ServerError::BackendError {
        message: error_message
      })

    CASE "internalError":
      RETURN BigQueryError::Server(ServerError::InternalError {
        message: error_message
      })

    // Default
    CASE _:
      RETURN BigQueryError::Unknown {
        reason: error_reason,
        message: error_message,
        status_code: status_code
      }
  END MATCH
END FUNCTION
```

### 13.2 Input Validation

```
FUNCTION validate_config(config: BigQueryConfig) -> Result<(), ValidationError>
  errors <- []

  IF config.project_id.is_empty() THEN
    errors.push("Project ID is required")
  END IF

  IF config.location.is_empty() THEN
    errors.push("Location is required")
  END IF

  // Validate credentials
  TRY
    test_token <- config.credentials.get_access_token().await
    IF test_token.is_empty() THEN
      errors.push("Failed to obtain access token")
    END IF
  CATCH CredentialsError AS e
    errors.push(format("Credentials error: {}", e))
  END TRY

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(ValidationError { messages: errors })
  END IF
END FUNCTION

FUNCTION validate_query(query: String) -> Result<(), ValidationError>
  IF query.is_empty() THEN
    RETURN Error(ValidationError { message: "Query cannot be empty" })
  END IF

  IF query.len() > 1024 * 1024 THEN  // 1 MB limit
    RETURN Error(ValidationError { message: "Query exceeds maximum length of 1 MB" })
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION validate_table_reference(table: TableReference) -> Result<(), ValidationError>
  IF table.dataset_id.is_empty() THEN
    RETURN Error(ValidationError { message: "Dataset ID is required" })
  END IF

  IF table.table_id.is_empty() THEN
    RETURN Error(ValidationError { message: "Table ID is required" })
  END IF

  // Validate naming conventions
  dataset_pattern <- regex("^[a-zA-Z0-9_]+$")
  IF NOT dataset_pattern.is_match(table.dataset_id) THEN
    RETURN Error(ValidationError {
      message: "Dataset ID contains invalid characters"
    })
  END IF

  table_pattern <- regex("^[a-zA-Z0-9_]+$")
  IF NOT table_pattern.is_match(table.table_id) THEN
    RETURN Error(ValidationError {
      message: "Table ID contains invalid characters"
    })
  END IF

  RETURN Ok(())
END FUNCTION
```

### 13.3 Request Building

```
FUNCTION build_authenticated_request(
  method: HttpMethod,
  url: String,
  body: Option<JsonValue>,
  credentials: CredentialProvider
) -> Result<HttpRequest, BigQueryError>
  // Get access token
  token <- credentials.get_access_token().await?

  // Build request
  mut request <- HttpRequest {
    method: method,
    url: parse_url(url)?,
    headers: HeaderMap::new(),
    body: body.map(|b| serialize_json(b))
  }

  // Add headers
  request.headers.insert("Authorization", format("Bearer {}", token))
  request.headers.insert("Content-Type", "application/json")
  request.headers.insert("Accept", "application/json")

  RETURN Ok(request)
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial pseudocode |

---

**End of Pseudocode Phase**

*Next: Architecture phase will define component structure, data flow, and integration patterns.*
