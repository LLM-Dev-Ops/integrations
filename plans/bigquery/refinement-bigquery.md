# Google BigQuery Integration Refinement

## SPARC Phase 4: Refinement

*Review, optimize, and harden the design before implementation*

---

## 1. Design Review Checklist

### 1.1 Specification Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| Sync query execution | ✅ Covered | QueryService.execute() |
| Async query execution | ✅ Covered | QueryService.executeAsync() |
| Query dry-run | ✅ Covered | QueryService.dryRun() |
| Parameterized queries | ✅ Covered | QueryService.executeParameterized() |
| Streaming query results | ✅ Covered | QueryService.executeStream() |
| Job get/list/cancel | ✅ Covered | JobService operations |
| Job wait for completion | ✅ Covered | Polling with backoff |
| Streaming inserts | ✅ Covered | StreamingService.insertAll() |
| Buffered streaming | ✅ Covered | BufferedInserter |
| Batch load from GCS | ✅ Covered | LoadService.loadFromGcs() |
| Batch load from file | ✅ Covered | LoadService.loadFromFile() |
| Batch load from memory | ✅ Covered | LoadService.loadFromMemory() |
| Export to GCS | ✅ Covered | ExportService.exportToGcs() |
| Storage Read API | ✅ Covered | StorageReadService (gRPC) |
| Storage Write API | ✅ Covered | StorageWriteService (gRPC) |
| Cost estimation | ✅ Covered | CostService.estimateQueryCost() |
| Cost limits | ✅ Covered | maximumBytesBilled |
| Job cost retrieval | ✅ Covered | CostService.getJobCost() |
| Dataset CRUD | ✅ Covered | DatasetService |
| Table CRUD | ✅ Covered | TableService |
| GCP credential chain | ✅ Covered | Uses shared gcp/auth |
| Retry with backoff | ✅ Covered | Uses shared/resilience |
| Circuit breaker | ✅ Covered | Uses shared/resilience |
| Error taxonomy | ✅ Covered | Pseudocode Section 13 |
| Mock BigQuery | ✅ Covered | Simulation service |
| Workload replay | ✅ Covered | SimulationService |

### 1.2 Architecture Compliance

| Principle | Status | Evidence |
|-----------|--------|----------|
| Thin Adapter Pattern | ✅ | Only BigQuery-specific logic in module |
| Dependency Inversion | ✅ | All deps injected via traits |
| Interface Segregation | ✅ | Fine-grained service traits |
| Dual transport (REST + gRPC) | ✅ | HTTP for jobs, gRPC for Storage API |
| No google-cloud-sdk dependency | ✅ | Custom transport handling |
| London-School TDD ready | ✅ | All collaborators mockable |
| Shared infrastructure reuse | ✅ | Credentials, resilience, observability |
| Cost awareness | ✅ | Dry-run, limits, metrics |

### 1.3 Security Compliance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Credentials never logged | ✅ | SecretString wrapper, redacted Debug |
| TLS enforced | ✅ | HTTPS/gRPCS required |
| OAuth2 token refresh | ✅ | Via gcp/auth provider |
| Service account support | ✅ | Via credential chain |
| ADC support | ✅ | Application Default Credentials |
| Workload Identity support | ✅ | For GKE environments |
| Query content not logged | ✅ | Only metadata in observability |

---

## 2. Edge Case Analysis

### 2.1 Query Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          QUERY EDGE CASES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Query Size Limit (1 MB)                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  BigQuery limit: 1 MB per query string                              │   │
│  │                                                                      │   │
│  │  Strategy: Validate before sending                                   │   │
│  │  fn validate_query_size(query: &str) -> Result<(), Error> {         │   │
│  │      const MAX_QUERY_SIZE: usize = 1024 * 1024; // 1 MB             │   │
│  │                                                                      │   │
│  │      if query.len() > MAX_QUERY_SIZE {                              │   │
│  │          return Err(BigQueryError::Query(                           │   │
│  │              QueryError::QueryTooLarge {                            │   │
│  │                  size: query.len(),                                 │   │
│  │                  max_size: MAX_QUERY_SIZE,                          │   │
│  │              }                                                       │   │
│  │          ));                                                         │   │
│  │      }                                                               │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 2: Response Too Large                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  BigQuery limit: 10 MB response by default for sync queries         │   │
│  │                                                                      │   │
│  │  Strategies:                                                         │   │
│  │  1. Use executeAsync() + pagination for large results               │   │
│  │  2. Write to destination table, then query in chunks                │   │
│  │  3. Use Storage Read API for large table reads                      │   │
│  │                                                                      │   │
│  │  fn handle_response_too_large(                                       │   │
│  │      error: &BigQueryError,                                          │   │
│  │      request: &QueryRequest,                                         │   │
│  │  ) -> Option<QueryStrategy> {                                        │   │
│  │      if matches!(error, BigQueryError::Query(                        │   │
│  │          QueryError::ResponseTooLarge { .. }                        │   │
│  │      )) {                                                            │   │
│  │          // Suggest alternative strategies                           │   │
│  │          Some(QueryStrategy::UseAsyncWithDestination {               │   │
│  │              destination_table: generate_temp_table_ref(),           │   │
│  │          })                                                          │   │
│  │      } else {                                                        │   │
│  │          None                                                        │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 3: Query Timeout                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Sync query timeout: 10 seconds default, max 600 seconds            │   │
│  │  Job-based queries: No inherent timeout, poll until complete        │   │
│  │                                                                      │   │
│  │  Strategy: Auto-escalate to async on timeout                        │   │
│  │  async fn execute_with_timeout_escalation(                           │   │
│  │      &self,                                                          │   │
│  │      request: QueryRequest,                                          │   │
│  │  ) -> Result<QueryResponse, BigQueryError> {                         │   │
│  │      match self.execute(request.clone()).await {                     │   │
│  │          Ok(response) => Ok(response),                               │   │
│  │          Err(BigQueryError::Query(QueryError::Timeout { .. })) => {  │   │
│  │              // Escalate to async job                                │   │
│  │              let job = self.execute_async(request).await?;          │   │
│  │              let completed = self.job_service                        │   │
│  │                  .wait_for_completion(                               │   │
│  │                      job.job_id,                                     │   │
│  │                      DEFAULT_ASYNC_TIMEOUT,                          │   │
│  │                      DEFAULT_POLL_INTERVAL,                          │   │
│  │                  ).await?;                                           │   │
│  │              self.get_job_results(completed.job_id).await           │   │
│  │          }                                                           │   │
│  │          Err(e) => Err(e),                                          │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 4: Invalid Query Syntax                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  BigQuery returns detailed error messages for invalid queries        │   │
│  │                                                                      │   │
│  │  fn parse_query_error(error_response: &Value) -> BigQueryError {    │   │
│  │      let reason = error_response["error"]["errors"][0]["reason"]     │   │
│  │          .as_str().unwrap_or("unknown");                            │   │
│  │      let message = error_response["error"]["message"]                │   │
│  │          .as_str().unwrap_or("Unknown error");                      │   │
│  │      let location = error_response["error"]["errors"][0]["location"] │   │
│  │          .as_str();                                                 │   │
│  │                                                                      │   │
│  │      if reason == "invalidQuery" {                                   │   │
│  │          BigQueryError::Query(QueryError::InvalidQuery {             │   │
│  │              message: message.to_string(),                          │   │
│  │              location: location.map(String::from),                  │   │
│  │              // Parse line/column if available                       │   │
│  │              line: extract_line_number(message),                     │   │
│  │              column: extract_column_number(message),                 │   │
│  │          })                                                          │   │
│  │      } else {                                                        │   │
│  │          // Handle other error types                                 │   │
│  │          map_bigquery_error(reason, message)                        │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Cost Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COST EDGE CASES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Query Cache Hits                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Cached queries: $0 cost, 0 bytes billed                            │   │
│  │                                                                      │   │
│  │  Strategy: Track cache hits separately                               │   │
│  │  fn calculate_cost(response: &QueryResponse) -> CostInfo {          │   │
│  │      if response.cache_hit == Some(true) {                          │   │
│  │          CostInfo {                                                  │   │
│  │              bytes_processed: 0,                                    │   │
│  │              bytes_billed: 0,                                       │   │
│  │              cost_usd: 0.0,                                         │   │
│  │              cache_hit: true,                                       │   │
│  │          }                                                           │   │
│  │      } else {                                                        │   │
│  │          let bytes_processed = response.total_bytes_processed        │   │
│  │              .unwrap_or(0);                                         │   │
│  │          let bytes_billed = round_up_to_10mb(bytes_processed);      │   │
│  │          CostInfo {                                                  │   │
│  │              bytes_processed,                                        │   │
│  │              bytes_billed,                                          │   │
│  │              cost_usd: (bytes_billed as f64 / TB) * 5.0,           │   │
│  │              cache_hit: false,                                      │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 2: Bytes Billed Limit Exceeded                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  When maximumBytesBilled is set and exceeded:                       │   │
│  │  - Query fails immediately                                           │   │
│  │  - No partial results                                                │   │
│  │  - Error: bytesBilledLimitExceeded                                  │   │
│  │                                                                      │   │
│  │  Strategy: Provide actionable error with dry-run info               │   │
│  │  fn handle_bytes_limit_exceeded(                                     │   │
│  │      error: &BigQueryError,                                          │   │
│  │      query: &str,                                                    │   │
│  │  ) -> BigQueryError {                                                │   │
│  │      if let BigQueryError::Query(QueryError::BytesLimitExceeded {   │   │
│  │          message, ..                                                 │   │
│  │      }) = error {                                                    │   │
│  │          // Perform dry-run to get actual estimate                   │   │
│  │          if let Ok(estimate) = self.dry_run(query).await {          │   │
│  │              BigQueryError::Query(QueryError::BytesLimitExceeded {   │   │
│  │                  message: message.clone(),                           │   │
│  │                  estimated_bytes: estimate.total_bytes_processed,    │   │
│  │                  estimated_cost_usd: estimate.estimated_cost_usd,    │   │
│  │                  limit: self.cost_limit.unwrap_or(0),               │   │
│  │                  suggestion: format!(                                │   │
│  │                      "Query would process {} bytes (~${:.4}). \      │   │
│  │                       Increase limit or optimize query.",            │   │
│  │                      estimate.total_bytes_processed,                 │   │
│  │                      estimate.estimated_cost_usd                     │   │
│  │                  ),                                                  │   │
│  │              })                                                      │   │
│  │          } else {                                                    │   │
│  │              error.clone()                                           │   │
│  │          }                                                           │   │
│  │      } else {                                                        │   │
│  │          error.clone()                                               │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 3: Minimum Billing (10 MB)                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  BigQuery bills minimum 10 MB per query                              │   │
│  │  Even queries on small tables are billed for 10 MB                  │   │
│  │                                                                      │   │
│  │  fn round_up_to_10mb(bytes: i64) -> i64 {                           │   │
│  │      const MIN_BILLING: i64 = 10 * 1024 * 1024; // 10 MB           │   │
│  │      if bytes == 0 {                                                │   │
│  │          return 0; // Cache hit                                     │   │
│  │      }                                                               │   │
│  │      max(MIN_BILLING, ((bytes + MIN_BILLING - 1) / MIN_BILLING)     │   │
│  │          * MIN_BILLING)                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 4: Slot-Based vs On-Demand Pricing                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  On-demand: $5/TB processed                                          │   │
│  │  Flat-rate (slots): Fixed monthly cost, no per-query charges        │   │
│  │                                                                      │   │
│  │  Strategy: Support both pricing models                               │   │
│  │  struct BigQueryPricing {                                            │   │
│  │      pricing_model: PricingModel,                                   │   │
│  │      on_demand_per_tb: f64,      // Default: $5.00                  │   │
│  │      flat_rate_slots: Option<u32>, // Slot count if flat-rate       │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  enum PricingModel {                                                 │   │
│  │      OnDemand,                                                       │   │
│  │      FlatRate { monthly_cost: f64 },                                │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn estimate_cost(                                                   │   │
│  │      bytes: i64,                                                     │   │
│  │      pricing: &BigQueryPricing,                                      │   │
│  │  ) -> CostEstimate {                                                 │   │
│  │      match pricing.pricing_model {                                   │   │
│  │          PricingModel::OnDemand => {                                │   │
│  │              let cost = (bytes as f64 / TB) * pricing.on_demand_per_tb;│  │
│  │              CostEstimate { cost_usd: cost, model: "on-demand" }    │   │
│  │          }                                                           │   │
│  │          PricingModel::FlatRate { monthly_cost } => {               │   │
│  │              CostEstimate {                                          │   │
│  │                  cost_usd: 0.0, // No incremental cost              │   │
│  │                  model: "flat-rate",                                │   │
│  │                  note: format!("Monthly: ${}", monthly_cost),       │   │
│  │              }                                                       │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Streaming Insert Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMING INSERT EDGE CASES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Row Size Limits                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Limits:                                                             │   │
│  │  - Max row size: 10 MB                                               │   │
│  │  - Max rows per request: 10,000                                      │   │
│  │  - Max request size: 10 MB                                           │   │
│  │                                                                      │   │
│  │  fn validate_streaming_batch(                                        │   │
│  │      rows: &[InsertRow],                                             │   │
│  │  ) -> Result<(), BigQueryError> {                                    │   │
│  │      const MAX_ROWS: usize = 10_000;                                │   │
│  │      const MAX_ROW_SIZE: usize = 10 * 1024 * 1024;                  │   │
│  │      const MAX_REQUEST_SIZE: usize = 10 * 1024 * 1024;              │   │
│  │                                                                      │   │
│  │      if rows.len() > MAX_ROWS {                                     │   │
│  │          return Err(BigQueryError::Streaming(                        │   │
│  │              StreamingError::TooManyRows {                          │   │
│  │                  count: rows.len(),                                 │   │
│  │                  max: MAX_ROWS,                                     │   │
│  │              }                                                       │   │
│  │          ));                                                         │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      let mut total_size = 0;                                        │   │
│  │      for (idx, row) in rows.iter().enumerate() {                    │   │
│  │          let row_size = estimate_row_size(&row.json);               │   │
│  │          if row_size > MAX_ROW_SIZE {                               │   │
│  │              return Err(BigQueryError::Streaming(                    │   │
│  │                  StreamingError::RowTooLarge {                      │   │
│  │                      index: idx,                                    │   │
│  │                      size: row_size,                                │   │
│  │                      max: MAX_ROW_SIZE,                             │   │
│  │                  }                                                   │   │
│  │              ));                                                     │   │
│  │          }                                                           │   │
│  │          total_size += row_size;                                    │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      if total_size > MAX_REQUEST_SIZE {                             │   │
│  │          return Err(BigQueryError::Streaming(                        │   │
│  │              StreamingError::RequestTooLarge {                      │   │
│  │                  size: total_size,                                  │   │
│  │                  max: MAX_REQUEST_SIZE,                             │   │
│  │              }                                                       │   │
│  │          ));                                                         │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 2: Partial Insert Failures                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  insertAll can return partial failures (some rows succeed, others fail)│  │
│  │                                                                      │   │
│  │  Strategy: Return detailed error info, allow retry of failed rows   │   │
│  │  struct InsertAllResponse {                                          │   │
│  │      insert_errors: Vec<InsertError>,                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  struct InsertError {                                                │   │
│  │      index: usize,                                                  │   │
│  │      errors: Vec<ErrorDetail>,                                      │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn handle_partial_failure(                                          │   │
│  │      original_rows: &[InsertRow],                                   │   │
│  │      response: InsertAllResponse,                                   │   │
│  │  ) -> PartialInsertResult {                                         │   │
│  │      let failed_indices: HashSet<_> = response.insert_errors        │   │
│  │          .iter()                                                    │   │
│  │          .map(|e| e.index)                                          │   │
│  │          .collect();                                                │   │
│  │                                                                      │   │
│  │      let succeeded = original_rows.iter().enumerate()               │   │
│  │          .filter(|(i, _)| !failed_indices.contains(i))              │   │
│  │          .count();                                                   │   │
│  │                                                                      │   │
│  │      let failed_rows: Vec<_> = original_rows.iter().enumerate()     │   │
│  │          .filter(|(i, _)| failed_indices.contains(i))               │   │
│  │          .map(|(_, row)| row.clone())                               │   │
│  │          .collect();                                                │   │
│  │                                                                      │   │
│  │      PartialInsertResult {                                           │   │
│  │          succeeded_count: succeeded,                                │   │
│  │          failed_count: failed_rows.len(),                           │   │
│  │          failed_rows,                                               │   │
│  │          errors: response.insert_errors,                            │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 3: Deduplication with Insert IDs                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  insert_id provides at-least-once semantics:                        │   │
│  │  - Same insert_id within ~1 minute = deduped                        │   │
│  │  - Best effort, not guaranteed                                       │   │
│  │                                                                      │   │
│  │  Strategy: Auto-generate insert IDs if not provided                 │   │
│  │  fn ensure_insert_ids(rows: &mut [InsertRow]) {                     │   │
│  │      for row in rows.iter_mut() {                                   │   │
│  │          if row.insert_id.is_none() {                               │   │
│  │              row.insert_id = Some(generate_insert_id());            │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn generate_insert_id() -> String {                                │   │
│  │      // Use UUID v4 for uniqueness                                  │   │
│  │      Uuid::new_v4().to_string()                                     │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Or use content-based ID for idempotency                         │   │
│  │  fn generate_content_based_id(row: &Value) -> String {              │   │
│  │      let content = serde_json::to_string(row).unwrap();             │   │
│  │      let hash = sha256(content.as_bytes());                         │   │
│  │      hex_encode(&hash[..16]) // First 16 bytes                      │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Storage API Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STORAGE API EDGE CASES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Session Expiration                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Read sessions expire after 24 hours                                 │   │
│  │  Write streams expire after 24 hours                                │   │
│  │                                                                      │   │
│  │  Strategy: Handle expiration gracefully, recreate if needed         │   │
│  │  async fn read_with_session_refresh(                                 │   │
│  │      &self,                                                          │   │
│  │      table: &TableReference,                                         │   │
│  │      options: ReadSessionOptions,                                    │   │
│  │  ) -> impl Stream<Item = Result<ArrowRecordBatch, BigQueryError>> { │   │
│  │      let mut session = self.create_session(table, options).await?;  │   │
│  │                                                                      │   │
│  │      loop {                                                          │   │
│  │          match self.read_stream(&session.streams[0].name).await {   │   │
│  │              Ok(batch) => yield batch,                              │   │
│  │              Err(BigQueryError::StorageApi(                         │   │
│  │                  StorageApiError::SessionExpired { .. }             │   │
│  │              )) => {                                                 │   │
│  │                  // Recreate session and continue                    │   │
│  │                  session = self.create_session(table, options).await?;│  │
│  │              }                                                       │   │
│  │              Err(e) => return Err(e),                               │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 2: Stream Split for Parallelism                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  BigQuery may return fewer streams than requested                   │   │
│  │  Streams can be split for more parallelism                          │   │
│  │                                                                      │   │
│  │  fn ensure_parallelism(                                              │   │
│  │      session: &ReadSession,                                          │   │
│  │      desired_parallelism: usize,                                    │   │
│  │  ) -> Vec<String> {                                                 │   │
│  │      let mut streams: Vec<_> = session.streams.iter()               │   │
│  │          .map(|s| s.name.clone())                                   │   │
│  │          .collect();                                                │   │
│  │                                                                      │   │
│  │      // If we have fewer streams than desired, try to split         │   │
│  │      while streams.len() < desired_parallelism {                    │   │
│  │          let to_split = streams[0].clone();                         │   │
│  │          match self.split_read_stream(&to_split).await {            │   │
│  │              Ok(split_result) => {                                  │   │
│  │                  streams.remove(0);                                 │   │
│  │                  streams.push(split_result.primary_stream);         │   │
│  │                  if let Some(remainder) = split_result.remainder {  │   │
│  │                      streams.push(remainder);                       │   │
│  │                  }                                                   │   │
│  │              }                                                       │   │
│  │              Err(_) => break, // Can't split further                │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      streams                                                         │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 3: Write Stream Commit Failures                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  PENDING streams must be finalized and committed                    │   │
│  │  BatchCommit can partially fail                                     │   │
│  │                                                                      │   │
│  │  Strategy: Retry failed stream commits                               │   │
│  │  async fn commit_with_retry(                                         │   │
│  │      &self,                                                          │   │
│  │      table: &TableReference,                                         │   │
│  │      stream_names: Vec<String>,                                      │   │
│  │      max_retries: usize,                                            │   │
│  │  ) -> Result<(), BigQueryError> {                                   │   │
│  │      let mut remaining = stream_names;                              │   │
│  │      let mut attempts = 0;                                          │   │
│  │                                                                      │   │
│  │      while !remaining.is_empty() && attempts < max_retries {        │   │
│  │          let result = self.batch_commit(table, remaining.clone())   │   │
│  │              .await?;                                               │   │
│  │                                                                      │   │
│  │          if result.stream_errors.is_empty() {                       │   │
│  │              return Ok(());                                         │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          // Collect failed streams for retry                         │   │
│  │          remaining = result.stream_errors.iter()                    │   │
│  │              .map(|e| e.stream_name.clone())                        │   │
│  │              .collect();                                            │   │
│  │                                                                      │   │
│  │          attempts += 1;                                             │   │
│  │          sleep(exponential_backoff(attempts)).await;                │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      if remaining.is_empty() {                                      │   │
│  │          Ok(())                                                      │   │
│  │      } else {                                                        │   │
│  │          Err(BigQueryError::StorageApi(StorageApiError::CommitFailed {│  │
│  │              failed_streams: remaining,                             │   │
│  │          }))                                                         │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 4: Schema Evolution                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Table schema may change between session creation and reading       │   │
│  │                                                                      │   │
│  │  Strategy: Detect schema changes, handle gracefully                 │   │
│  │  fn validate_schema_compatibility(                                   │   │
│  │      session_schema: &Schema,                                       │   │
│  │      current_schema: &Schema,                                       │   │
│  │  ) -> SchemaCompatibility {                                         │   │
│  │      let session_fields: HashSet<_> = session_schema.fields.iter()  │   │
│  │          .map(|f| &f.name)                                          │   │
│  │          .collect();                                                │   │
│  │      let current_fields: HashSet<_> = current_schema.fields.iter()  │   │
│  │          .map(|f| &f.name)                                          │   │
│  │          .collect();                                                │   │
│  │                                                                      │   │
│  │      let added = current_fields.difference(&session_fields).count();│   │
│  │      let removed = session_fields.difference(&current_fields).count();│  │
│  │                                                                      │   │
│  │      if removed > 0 {                                               │   │
│  │          SchemaCompatibility::Incompatible {                        │   │
│  │              reason: "Fields removed since session creation",       │   │
│  │          }                                                           │   │
│  │      } else if added > 0 {                                          │   │
│  │          SchemaCompatibility::Compatible {                          │   │
│  │              warning: "New fields added, not in session projection",│   │
│  │          }                                                           │   │
│  │      } else {                                                        │   │
│  │          SchemaCompatibility::Identical                             │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Job Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            JOB EDGE CASES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Job Location Mismatch                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Jobs run in the same location as referenced datasets               │   │
│  │  Cross-region queries require explicit location                     │   │
│  │                                                                      │   │
│  │  Strategy: Auto-detect location from first dataset reference        │   │
│  │  async fn determine_job_location(                                    │   │
│  │      &self,                                                          │   │
│  │      request: &QueryRequest,                                         │   │
│  │  ) -> Result<String, BigQueryError> {                               │   │
│  │      if let Some(ref location) = request.location {                 │   │
│  │          return Ok(location.clone());                               │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      if let Some(ref dest) = request.destination_table {            │   │
│  │          let dataset = self.dataset_service.get(                    │   │
│  │              &dest.dataset_id                                       │   │
│  │          ).await?;                                                  │   │
│  │          return Ok(dataset.location);                               │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Default to client-configured location                        │   │
│  │      Ok(self.config.location.clone())                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 2: Concurrent Job Limits                                               │   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  BigQuery limits concurrent interactive queries                      │   │
│  │  Default: 100 concurrent queries                                    │   │
│  │                                                                      │   │
│  │  Strategy: Queue with semaphore, prefer BATCH priority              │   │
│  │  struct QueryThrottler {                                             │   │
│  │      semaphore: Semaphore,                                          │   │
│  │      interactive_limit: usize,                                      │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl QueryThrottler {                                               │   │
│  │      async fn execute_throttled<F, R>(                               │   │
│  │          &self,                                                      │   │
│  │          priority: QueryPriority,                                   │   │
│  │          f: F,                                                       │   │
│  │      ) -> R                                                          │   │
│  │      where                                                           │   │
│  │          F: Future<Output = R>,                                     │   │
│  │      {                                                               │   │
│  │          if priority == QueryPriority::Interactive {                │   │
│  │              let _permit = self.semaphore.acquire().await;          │   │
│  │              f.await                                                │   │
│  │          } else {                                                    │   │
│  │              // BATCH queries don't count against interactive limit  │   │
│  │              f.await                                                │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Case 3: Job Already Exists                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Creating a job with duplicate ID returns error                     │   │
│  │                                                                      │   │
│  │  Strategy: Generate unique job IDs, handle duplicates               │   │
│  │  fn generate_job_id(prefix: &str) -> String {                       │   │
│  │      format!(                                                        │   │
│  │          "{}_{}_{:x}",                                               │   │
│  │          prefix,                                                     │   │
│  │          chrono::Utc::now().format("%Y%m%d_%H%M%S"),                │   │
│  │          rand::random::<u32>(),                                     │   │
│  │      )                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  async fn create_job_with_retry(                                     │   │
│  │      &self,                                                          │   │
│  │      config: JobConfiguration,                                      │   │
│  │  ) -> Result<Job, BigQueryError> {                                  │   │
│  │      for attempt in 0..3 {                                          │   │
│  │          let job_id = generate_job_id("query");                     │   │
│  │          match self.create_job(&job_id, config.clone()).await {     │   │
│  │              Ok(job) => return Ok(job),                             │   │
│  │              Err(BigQueryError::Resource(                           │   │
│  │                  ResourceError::ResourceAlreadyExists { .. }        │   │
│  │              )) => continue, // Retry with new ID                   │   │
│  │              Err(e) => return Err(e),                               │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │      Err(BigQueryError::Resource(ResourceError::ResourceAlreadyExists {│  │
│  │          message: "Failed to create unique job ID after retries",   │   │
│  │      }))                                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Performance Optimization

### 3.1 Query Optimization

| Optimization | Implementation |
|--------------|----------------|
| Use query cache | `useQueryCache: true` (default) |
| Prefer BATCH priority | For non-urgent queries |
| Limit result columns | SELECT only needed columns |
| Use partitioned tables | Filter on partition column |
| Use clustered tables | Filter on cluster columns |
| Parameterized queries | Cache query plan |
| Dry-run before large queries | Avoid surprises |

### 3.2 Streaming Insert Optimization

| Optimization | Implementation |
|--------------|----------------|
| Batch rows | BufferedInserter with configurable batch size |
| Use insert IDs | Enable deduplication |
| Parallel streams | Multiple buffered inserters per table |
| Compress if needed | JSON is verbose, consider schema |
| Template tables | Use templateSuffix for time-partitioned |

### 3.3 Storage API Optimization

| Optimization | Implementation |
|--------------|----------------|
| Column projection | Select only needed columns |
| Row filtering | Use row_restriction |
| Parallel streams | Request multiple streams |
| Arrow format | More efficient than Avro |
| Batch commit | Commit multiple write streams atomically |

### 3.4 Connection Pooling

```rust
struct BigQueryConnectionPool {
    http_pool: HttpConnectionPool,
    grpc_channels: Vec<Channel>,
}

impl BigQueryConnectionPool {
    fn new(config: PoolConfig) -> Self {
        Self {
            http_pool: HttpConnectionPool::new(config.http_pool_size),
            grpc_channels: (0..config.grpc_channel_count)
                .map(|_| create_grpc_channel())
                .collect(),
        }
    }

    fn get_http_client(&self) -> HttpClient {
        self.http_pool.get()
    }

    fn get_grpc_channel(&self) -> &Channel {
        // Round-robin or least-connections
        &self.grpc_channels[self.next_channel.fetch_add(1) % self.grpc_channels.len()]
    }
}
```

---

## 4. Error Recovery Strategies

### 4.1 Retryable Errors

| Error | Retry Strategy |
|-------|----------------|
| `rateLimitExceeded` | Exponential backoff, max 5 retries |
| `backendError` | Exponential backoff, max 3 retries |
| `internalError` | Exponential backoff, max 3 retries |
| `quotaExceeded` | Longer backoff, may need manual intervention |
| gRPC `UNAVAILABLE` | Immediate retry, then backoff |
| gRPC `DEADLINE_EXCEEDED` | Retry with longer timeout |

### 4.2 Non-Retryable Errors

| Error | Handling |
|-------|----------|
| `invalidQuery` | Return immediately, provide syntax help |
| `notFound` | Return immediately, resource doesn't exist |
| `accessDenied` | Return immediately, check permissions |
| `bytesBilledLimitExceeded` | Return with cost info |

### 4.3 Circuit Breaker Configuration

```rust
struct BigQueryCircuitBreakerConfig {
    failure_threshold: u32,      // 5 failures
    success_threshold: u32,      // 2 successes to close
    timeout: Duration,           // 60 seconds in open state
    half_open_max_calls: u32,    // 1 test call in half-open
}
```

---

## 5. Security Hardening

### 5.1 Credential Security

| Requirement | Implementation |
|-------------|----------------|
| Never log credentials | Use SecretString wrapper |
| Short-lived tokens | OAuth2 with automatic refresh |
| Least privilege | Request minimal scopes |
| Secure storage | Use secret manager for service accounts |

### 5.2 Query Security

| Risk | Mitigation |
|------|------------|
| SQL injection | Use parameterized queries |
| Data exfiltration | Cost limits, audit logging |
| Unauthorized access | IAM policies, VPC Service Controls |

### 5.3 Data Security

| Requirement | Implementation |
|-------------|----------------|
| Encryption in transit | TLS 1.2+ required |
| Encryption at rest | BigQuery default (Google-managed keys) |
| Customer-managed keys | Support CMEK via table settings |
| Column-level security | Support column ACLs |

---

## 6. Testing Strategy

### 6.1 Unit Test Coverage Targets

| Component | Target | Critical Paths |
|-----------|--------|----------------|
| Query request building | 95% | Parameter serialization |
| Cost calculation | 100% | Billing accuracy |
| Error mapping | 100% | All error types |
| Row serialization | 90% | All data types |
| Schema parsing | 90% | Complex schemas |

### 6.2 Integration Test Scenarios

| Scenario | Description |
|----------|-------------|
| Query lifecycle | Execute → poll → results |
| Streaming insert | Insert → verify → read |
| Load job | Create → poll → complete |
| Export job | Create → poll → verify GCS |
| Storage Read | Session → parallel read |
| Storage Write | Stream → append → commit |
| Cost tracking | Dry-run → execute → compare |
| Error handling | Inject each error type |

### 6.3 Mock Server Test Fixtures

```json
// Query success response
{
  "jobReference": {
    "projectId": "test-project",
    "jobId": "job_12345",
    "location": "US"
  },
  "schema": {
    "fields": [
      {"name": "id", "type": "INTEGER"},
      {"name": "name", "type": "STRING"}
    ]
  },
  "rows": [
    {"f": [{"v": "1"}, {"v": "Alice"}]},
    {"f": [{"v": "2"}, {"v": "Bob"}]}
  ],
  "totalBytesProcessed": "1048576",
  "cacheHit": false,
  "jobComplete": true
}

// Error response
{
  "error": {
    "code": 400,
    "message": "Syntax error at position 10",
    "errors": [
      {
        "reason": "invalidQuery",
        "message": "Syntax error at position 10",
        "location": "query"
      }
    ]
  }
}
```

---

## 7. Open Items and Future Enhancements

### 7.1 Open Items

| Item | Priority | Notes |
|------|----------|-------|
| Multi-region support | Medium | Cross-region query optimization |
| Materialized views | Low | Read integration |
| BI Engine | Low | Separate integration |
| Reservation management | Low | For flat-rate customers |

### 7.2 Future Enhancements

| Enhancement | Description |
|-------------|-------------|
| Query plan analysis | Parse and expose query plan |
| Cost anomaly detection | Alert on unusual costs |
| Query rewriting | Auto-optimize queries |
| Schema evolution | Track and migrate schemas |
| Data lineage | Track data dependencies |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial refinement |

---

**End of Refinement Phase**

*Next: Completion phase will provide implementation roadmap and final deliverables.*
