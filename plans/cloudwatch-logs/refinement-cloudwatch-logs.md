# AWS CloudWatch Logs Integration Refinement

## SPARC Phase 4: Refinement

*Review, optimize, and harden the design before implementation*

---

## 1. Design Review Checklist

### 1.1 Specification Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| PutLogEvents operation | ✅ Covered | Pseudocode Section 4.1 |
| PutLogEvents batch | ✅ Covered | Batch buffer architecture |
| GetLogEvents operation | ✅ Covered | Pseudocode Section 4 |
| FilterLogEvents operation | ✅ Covered | Pseudocode Section 4.3-4.4 |
| Auto-pagination (filter_all) | ✅ Covered | AsyncStream implementation |
| StartQuery (Insights) | ✅ Covered | Pseudocode Section 5.1 |
| GetQueryResults | ✅ Covered | Pseudocode Section 5.2 |
| StopQuery | ✅ Covered | Pseudocode Section 5.3 |
| Query convenience method | ✅ Covered | Start + poll + parse |
| Query by trace_id | ✅ Covered | Correlation engine |
| Query by request_id | ✅ Covered | Correlation engine |
| CreateLogGroup | ✅ Covered | Pseudocode Section 6.1 |
| DeleteLogGroup | ✅ Covered | Pseudocode Section 6 |
| DescribeLogGroups | ✅ Covered | Pseudocode Section 6.2 |
| CreateLogStream | ✅ Covered | Pseudocode Section 7.1 |
| DeleteLogStream | ✅ Covered | Pseudocode Section 7 |
| DescribeLogStreams | ✅ Covered | Pseudocode Section 7.3 |
| EnsureStreamExists | ✅ Covered | Auto-create if missing |
| PutRetentionPolicy | ✅ Covered | Pseudocode Section 8.1 |
| DeleteRetentionPolicy | ✅ Covered | Pseudocode Section 8.2 |
| GetRetentionPolicy | ✅ Covered | Via DescribeLogGroups |
| Structured log format | ✅ Covered | JSON with correlation IDs |
| Correlation ID injection | ✅ Covered | trace_id, request_id, span_id |
| Batch buffer management | ✅ Covered | Architecture Section 7 |
| Background flush task | ✅ Covered | Pseudocode Section 10.5 |
| Log simulation | ✅ Covered | Pseudocode Section 11 |
| Log replay | ✅ Covered | Pseudocode Section 11.2 |
| Mock log stream | ✅ Covered | Pseudocode Section 11.3 |
| AWS Signature V4 | ✅ Covered | Uses shared aws/signing |
| Credential providers | ✅ Covered | Uses shared aws/credentials |
| Retry with backoff | ✅ Covered | Uses shared/resilience |
| Circuit breaker | ✅ Covered | Uses shared/resilience |
| Rate limiting | ✅ Covered | Uses shared/resilience |
| Error taxonomy | ✅ Covered | Pseudocode Section 12 |

### 1.2 Architecture Compliance

| Principle | Status | Evidence |
|-----------|--------|----------|
| Thin Adapter Pattern | ✅ | Only CloudWatch Logs-specific logic in module |
| Dependency Inversion | ✅ | All deps injected via traits |
| Interface Segregation | ✅ | Fine-grained service traits (events, insights, groups, etc.) |
| No aws-sdk dependency | ✅ | Custom signing, credential handling |
| No cross-module deps | ✅ | Self-contained module |
| London-School TDD ready | ✅ | All collaborators mockable |
| Shared infrastructure reuse | ✅ | Credentials, signing, resilience, observability |
| Batch efficiency | ✅ | Configurable buffer with background flush |

### 1.3 Security Compliance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Credentials never logged | ✅ | SecretString wrapper, redacted Debug |
| TLS enforced | ✅ | HTTPS default, TLS 1.2+ required |
| Signature V4 | ✅ | Reuse from aws/signing, service="logs" |
| Session token support | ✅ | Included in credential chain |
| Log content sanitization | ✅ | PII filtering before emission |
| Sensitive fields not logged | ✅ | Only metadata in observability |

---

## 2. Edge Case Analysis

### 2.1 Log Event Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LOG EVENT EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Event Size Limit (256 KB)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  CloudWatch Logs limit: 256 KB per event (262,144 bytes)            │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  fn validate_event_size(message: &str) -> Result<(), Error> {       │   │
│  │      let size = message.len() + 26; // message + overhead           │   │
│  │      if size > MAX_LOG_EVENT_SIZE {                                 │   │
│  │          return Err(CloudWatchLogsError::Request(                   │   │
│  │              RequestError::EntityTooLarge {                          │   │
│  │                  size,                                               │   │
│  │                  max_size: MAX_LOG_EVENT_SIZE,                       │   │
│  │              }                                                       │   │
│  │          ));                                                         │   │
│  │      }                                                               │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Alternative: Truncation with warning                                │   │
│  │  fn truncate_if_needed(message: &str, max_size: usize) -> String {  │   │
│  │      if message.len() > max_size {                                   │   │
│  │          warn!(                                                      │   │
│  │              original_size = message.len(),                          │   │
│  │              max_size = max_size,                                    │   │
│  │              "Log message truncated"                                 │   │
│  │          );                                                          │   │
│  │          // Truncate at char boundary                                │   │
│  │          let truncated = &message[..message.floor_char_boundary(     │   │
│  │              max_size - 20 // Leave room for truncation marker       │   │
│  │          )];                                                         │   │
│  │          format!("{}...[TRUNCATED]", truncated)                      │   │
│  │      } else {                                                        │   │
│  │          message.to_string()                                         │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Batch Size Limits                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  CloudWatch Logs limits:                                             │   │
│  │  - Max 10,000 events per batch                                       │   │
│  │  - Max 1 MB total batch size                                         │   │
│  │                                                                      │   │
│  │  Strategy: Split large batches                                       │   │
│  │  fn split_into_batches(                                              │   │
│  │      events: Vec<LogEvent>,                                          │   │
│  │      max_events: usize,                                              │   │
│  │      max_bytes: usize,                                               │   │
│  │  ) -> Vec<Vec<LogEvent>> {                                          │   │
│  │      let mut batches = Vec::new();                                   │   │
│  │      let mut current_batch = Vec::new();                             │   │
│  │      let mut current_size = 0;                                       │   │
│  │                                                                      │   │
│  │      for event in events {                                           │   │
│  │          let event_size = event.message.len() + 26;                  │   │
│  │                                                                      │   │
│  │          if current_batch.len() >= max_events ||                     │   │
│  │             current_size + event_size > max_bytes {                  │   │
│  │              if !current_batch.is_empty() {                          │   │
│  │                  batches.push(std::mem::take(&mut current_batch));   │   │
│  │                  current_size = 0;                                   │   │
│  │              }                                                       │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          current_size += event_size;                                 │   │
│  │          current_batch.push(event);                                  │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      if !current_batch.is_empty() {                                  │   │
│  │          batches.push(current_batch);                                │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      batches                                                         │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Timestamp Validation                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  CloudWatch Logs timestamp requirements:                             │   │
│  │  - Must be within 14 days in the past                                │   │
│  │  - Must not be more than 2 hours in the future                       │   │
│  │  - Events must be in chronological order                             │   │
│  │                                                                      │   │
│  │  fn validate_timestamp(timestamp: i64) -> Result<(), Error> {       │   │
│  │      let now = current_epoch_millis();                               │   │
│  │      let fourteen_days_ago = now - (14 * 24 * 60 * 60 * 1000);       │   │
│  │      let two_hours_ahead = now + (2 * 60 * 60 * 1000);               │   │
│  │                                                                      │   │
│  │      if timestamp < fourteen_days_ago {                              │   │
│  │          return Err(CloudWatchLogsError::Batch(                      │   │
│  │              BatchError::TooOldLogEvent {                            │   │
│  │                  timestamp,                                          │   │
│  │                  oldest_allowed: fourteen_days_ago,                  │   │
│  │              }                                                       │   │
│  │          ));                                                         │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      if timestamp > two_hours_ahead {                                │   │
│  │          return Err(CloudWatchLogsError::Batch(                      │   │
│  │              BatchError::TooNewLogEvent {                            │   │
│  │                  timestamp,                                          │   │
│  │                  newest_allowed: two_hours_ahead,                    │   │
│  │              }                                                       │   │
│  │          ));                                                         │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn ensure_chronological_order(                                      │   │
│  │      events: &mut [LogEvent]                                         │   │
│  │  ) {                                                                 │   │
│  │      events.sort_by_key(|e| e.timestamp);                            │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Log Group/Stream Name Validation                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Log group name rules:                                               │   │
│  │  - 1-512 characters                                                  │   │
│  │  - Pattern: [.\-_/#A-Za-z0-9]+                                      │   │
│  │                                                                      │   │
│  │  Log stream name rules:                                              │   │
│  │  - 1-512 characters                                                  │   │
│  │  - Cannot contain ':' or '*'                                         │   │
│  │                                                                      │   │
│  │  fn validate_log_group_name(name: &str) -> Result<(), Error> {      │   │
│  │      if name.is_empty() {                                            │   │
│  │          return Err(validation_error("Log group name cannot be empty"));│   │
│  │      }                                                               │   │
│  │      if name.len() > 512 {                                           │   │
│  │          return Err(validation_error("Log group name too long"));    │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      let valid_pattern = Regex::new(r"^[\.\-_/#A-Za-z0-9]+$").unwrap();│   │
│  │      if !valid_pattern.is_match(name) {                              │   │
│  │          return Err(validation_error(                                 │   │
│  │              "Log group name contains invalid characters"            │   │
│  │          ));                                                         │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn validate_log_stream_name(name: &str) -> Result<(), Error> {     │   │
│  │      if name.is_empty() {                                            │   │
│  │          return Err(validation_error("Log stream name cannot be empty"));│   │
│  │      }                                                               │   │
│  │      if name.len() > 512 {                                           │   │
│  │          return Err(validation_error("Log stream name too long"));   │   │
│  │      }                                                               │   │
│  │      if name.contains(':') || name.contains('*') {                   │   │
│  │          return Err(validation_error(                                 │   │
│  │              "Log stream name cannot contain ':' or '*'"             │   │
│  │          ));                                                         │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Insights Query Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INSIGHTS QUERY EDGE CASES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Query Timeout Handling                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  CloudWatch Logs Insights limits:                                    │   │
│  │  - Max query time: 60 minutes                                        │   │
│  │  - Client may want shorter timeout                                   │   │
│  │                                                                      │   │
│  │  async fn query_with_timeout(                                        │   │
│  │      &self,                                                          │   │
│  │      request: StartQueryRequest,                                     │   │
│  │      timeout: Duration,                                              │   │
│  │  ) -> Result<QueryResults, Error> {                                 │   │
│  │      // Start the query                                              │   │
│  │      let start_response = self.start_query(request).await?;         │   │
│  │      let query_id = start_response.query_id;                         │   │
│  │                                                                      │   │
│  │      let start_time = Instant::now();                                │   │
│  │      let mut poll_interval = Duration::from_millis(500);             │   │
│  │      let max_poll_interval = Duration::from_secs(5);                 │   │
│  │                                                                      │   │
│  │      loop {                                                          │   │
│  │          // Check timeout                                            │   │
│  │          if start_time.elapsed() > timeout {                         │   │
│  │              // Cancel the query                                     │   │
│  │              let _ = self.stop_query(&query_id).await;               │   │
│  │              return Err(CloudWatchLogsError::Query(                  │   │
│  │                  QueryError::QueryTimeout { query_id }               │   │
│  │              ));                                                     │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          // Poll for results                                         │   │
│  │          let results = self.get_results(&query_id).await?;          │   │
│  │                                                                      │   │
│  │          match results.status.as_str() {                             │   │
│  │              "Complete" => return Ok(results.into()),                │   │
│  │              "Failed" => return Err(QueryError::QueryFailed {        │   │
│  │                  query_id,                                           │   │
│  │                  message: "Query execution failed".into(),           │   │
│  │              }.into()),                                              │   │
│  │              "Cancelled" => return Err(QueryError::QueryCancelled {  │   │
│  │                  query_id,                                           │   │
│  │              }.into()),                                              │   │
│  │              "Timeout" => return Err(QueryError::QueryTimeout {      │   │
│  │                  query_id,                                           │   │
│  │              }.into()),                                              │   │
│  │              "Scheduled" | "Running" => {                            │   │
│  │                  // Continue polling with exponential backoff        │   │
│  │                  tokio::time::sleep(poll_interval).await;            │   │
│  │                  poll_interval = std::cmp::min(                      │   │
│  │                      poll_interval * 2,                              │   │
│  │                      max_poll_interval                               │   │
│  │                  );                                                  │   │
│  │              }                                                       │   │
│  │              _ => {                                                  │   │
│  │                  // Unknown status, continue polling                 │   │
│  │                  tokio::time::sleep(poll_interval).await;            │   │
│  │              }                                                       │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Invalid Query Syntax                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  CloudWatch Logs Insights has its own query language                 │   │
│  │  Common syntax errors:                                               │   │
│  │  - Missing pipe separator                                            │   │
│  │  - Invalid field names                                               │   │
│  │  - Unmatched quotes                                                  │   │
│  │  - Invalid function names                                            │   │
│  │                                                                      │   │
│  │  fn validate_insights_query(query: &str) -> Result<(), Error> {     │   │
│  │      if query.is_empty() {                                           │   │
│  │          return Err(validation_error("Query cannot be empty"));      │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      if query.len() > 10000 {                                        │   │
│  │          return Err(validation_error("Query too long (max 10000)"));│   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Basic syntax checks (not exhaustive)                         │   │
│  │      let has_command = query.contains("fields") ||                   │   │
│  │                        query.contains("filter") ||                   │   │
│  │                        query.contains("stats") ||                    │   │
│  │                        query.contains("sort") ||                     │   │
│  │                        query.contains("limit") ||                    │   │
│  │                        query.contains("parse") ||                    │   │
│  │                        query.contains("display");                    │   │
│  │                                                                      │   │
│  │      if !has_command {                                               │   │
│  │          warn!("Query may be invalid: no recognized command found");│   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Check for unmatched quotes                                   │   │
│  │      let single_quotes = query.matches('\'').count();                │   │
│  │      let double_quotes = query.matches('"').count();                 │   │
│  │                                                                      │   │
│  │      if single_quotes % 2 != 0 || double_quotes % 2 != 0 {          │   │
│  │          return Err(validation_error("Unmatched quotes in query")); │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Large Result Sets                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  CloudWatch Logs Insights limits:                                    │   │
│  │  - Default limit: 1000 results                                       │   │
│  │  - Max limit: 10000 results                                          │   │
│  │                                                                      │   │
│  │  Strategy: Use limit parameter appropriately                         │   │
│  │                                                                      │   │
│  │  fn build_insights_query(                                            │   │
│  │      query: &str,                                                    │   │
│  │      limit: Option<u32>,                                             │   │
│  │  ) -> String {                                                       │   │
│  │      // If query already has limit, respect it                       │   │
│  │      if query.to_lowercase().contains("| limit") {                   │   │
│  │          return query.to_string();                                   │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Add limit if specified                                       │   │
│  │      match limit {                                                   │   │
│  │          Some(l) => format!("{} | limit {}", query, l.min(10000)),  │   │
│  │          None => query.to_string(),                                  │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Cross-Account Queries                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  CloudWatch Logs supports cross-account queries with log group ARNs │   │
│  │                                                                      │   │
│  │  fn parse_log_group_identifier(                                      │   │
│  │      identifier: &str,                                               │   │
│  │  ) -> LogGroupIdentifier {                                          │   │
│  │      if identifier.starts_with("arn:aws:logs:") {                    │   │
│  │          LogGroupIdentifier::Arn(identifier.to_string())             │   │
│  │      } else {                                                        │   │
│  │          LogGroupIdentifier::Name(identifier.to_string())            │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn build_query_request(                                             │   │
│  │      identifiers: Vec<LogGroupIdentifier>,                          │   │
│  │      query: &str,                                                    │   │
│  │      time_range: TimeRange,                                          │   │
│  │  ) -> StartQueryRequest {                                           │   │
│  │      // Separate names from ARNs                                     │   │
│  │      let (arns, names): (Vec<_>, Vec<_>) = identifiers             │   │
│  │          .into_iter()                                                │   │
│  │          .partition(|id| matches!(id, LogGroupIdentifier::Arn(_))); │   │
│  │                                                                      │   │
│  │      StartQueryRequest {                                             │   │
│  │          log_group_names: if names.is_empty() {                      │   │
│  │              None                                                    │   │
│  │          } else {                                                    │   │
│  │              Some(names.into_iter().map(|n| n.name()).collect())    │   │
│  │          },                                                          │   │
│  │          log_group_identifiers: if arns.is_empty() {                 │   │
│  │              None                                                    │   │
│  │          } else {                                                    │   │
│  │              Some(arns.into_iter().map(|a| a.arn()).collect())      │   │
│  │          },                                                          │   │
│  │          query_string: query.to_string(),                            │   │
│  │          start_time: time_range.start.timestamp(),                   │   │
│  │          end_time: time_range.end.timestamp(),                       │   │
│  │          limit: None,                                                │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Batch Buffer Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BATCH BUFFER EDGE CASES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Concurrent Access                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Multiple tasks adding events simultaneously                         │   │
│  │                                                                      │   │
│  │  Strategy: Use RwLock for buffer access                              │   │
│  │                                                                      │   │
│  │  struct BatchBuffer {                                                │   │
│  │      buffers: RwLock<HashMap<StreamKey, Vec<BatchEvent>>>,          │   │
│  │      sizes: RwLock<HashMap<StreamKey, usize>>,                       │   │
│  │      config: BatchConfig,                                            │   │
│  │      flush_tx: Sender<FlushSignal>,                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl BatchBuffer {                                                  │   │
│  │      async fn add(&self, event: BatchEvent) -> Result<(), Error> {  │   │
│  │          let key = (event.log_group.clone(), event.log_stream.clone());│   │
│  │          let event_size = event.message.len() + 26;                  │   │
│  │                                                                      │   │
│  │          // Quick read to check if we need to flush                  │   │
│  │          let needs_flush = {                                         │   │
│  │              let buffers = self.buffers.read().await;                │   │
│  │              let sizes = self.sizes.read().await;                    │   │
│  │                                                                      │   │
│  │              if let (Some(events), Some(&size)) =                    │   │
│  │                  (buffers.get(&key), sizes.get(&key)) {             │   │
│  │                  events.len() + 1 > self.config.max_events ||       │   │
│  │                  size + event_size > self.config.max_bytes           │   │
│  │              } else {                                                │   │
│  │                  false                                               │   │
│  │              }                                                       │   │
│  │          };                                                          │   │
│  │                                                                      │   │
│  │          // Trigger flush if needed before acquiring write lock      │   │
│  │          if needs_flush {                                            │   │
│  │              let _ = self.flush_tx.send(FlushSignal {                │   │
│  │                  log_group: key.0.clone(),                           │   │
│  │                  log_stream: key.1.clone(),                          │   │
│  │              }).await;                                               │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          // Add event                                                │   │
│  │          {                                                           │   │
│  │              let mut buffers = self.buffers.write().await;           │   │
│  │              let mut sizes = self.sizes.write().await;               │   │
│  │                                                                      │   │
│  │              buffers.entry(key.clone())                              │   │
│  │                  .or_default()                                       │   │
│  │                  .push(event);                                       │   │
│  │              *sizes.entry(key).or_default() += event_size;           │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          Ok(())                                                      │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Graceful Shutdown                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Application shutting down with events in buffer          │   │
│  │                                                                      │   │
│  │  Strategy: Implement flush_all on drop/shutdown                      │   │
│  │                                                                      │   │
│  │  impl BatchBuffer {                                                  │   │
│  │      async fn shutdown(&self) -> Result<usize, Error> {             │   │
│  │          info!("Flushing all buffers on shutdown");                  │   │
│  │                                                                      │   │
│  │          let batches = self.flush_all().await?;                      │   │
│  │          let mut total_events = 0;                                   │   │
│  │                                                                      │   │
│  │          for (log_group, log_stream, events) in batches {           │   │
│  │              if !events.is_empty() {                                 │   │
│  │                  total_events += events.len();                       │   │
│  │                  // Send to CloudWatch Logs synchronously            │   │
│  │                  self.flush_to_cloudwatch(                           │   │
│  │                      &log_group,                                     │   │
│  │                      &log_stream,                                    │   │
│  │                      events                                          │   │
│  │                  ).await?;                                           │   │
│  │              }                                                       │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          info!(events = total_events, "Shutdown flush complete");   │   │
│  │          Ok(total_events)                                            │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Integration with tokio graceful shutdown                         │   │
│  │  async fn graceful_shutdown(                                         │   │
│  │      client: CloudWatchLogsClient,                                   │   │
│  │      shutdown: impl Future<Output = ()>,                            │   │
│  │  ) {                                                                 │   │
│  │      shutdown.await;                                                 │   │
│  │                                                                      │   │
│  │      match client.batch_buffer().shutdown().await {                  │   │
│  │          Ok(count) => info!(events = count, "Flushed on shutdown"), │   │
│  │          Err(e) => error!(error = %e, "Flush failed on shutdown"),  │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Flush Failure Handling                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: PutLogEvents fails during flush                           │   │
│  │                                                                      │   │
│  │  Strategies:                                                         │   │
│  │  1. Retry with exponential backoff (via resilience)                  │   │
│  │  2. Re-buffer events on retryable failure                            │   │
│  │  3. Drop events on non-retryable failure (with logging)              │   │
│  │                                                                      │   │
│  │  async fn flush_with_retry(                                          │   │
│  │      &self,                                                          │   │
│  │      log_group: &str,                                                │   │
│  │      log_stream: &str,                                               │   │
│  │      events: Vec<BatchEvent>,                                        │   │
│  │  ) -> Result<(), Error> {                                           │   │
│  │      let request = PutLogEventsRequest {                             │   │
│  │          log_group_name: log_group.to_string(),                      │   │
│  │          log_stream_name: log_stream.to_string(),                    │   │
│  │          log_events: events.into_iter().map(|e| LogEvent {          │   │
│  │              timestamp: e.timestamp,                                 │   │
│  │              message: e.message,                                     │   │
│  │          }).collect(),                                               │   │
│  │      };                                                              │   │
│  │                                                                      │   │
│  │      match self.events_service.put(request).await {                  │   │
│  │          Ok(response) => {                                           │   │
│  │              // Log rejected events if any                           │   │
│  │              if let Some(rejected) = response.rejected_log_events_info {│   │
│  │                  warn!(                                              │   │
│  │                      too_old = rejected.too_old_log_event_end_index, │   │
│  │                      too_new = rejected.too_new_log_event_start_index,│   │
│  │                      expired = rejected.expired_log_event_end_index, │   │
│  │                      "Some events were rejected"                     │   │
│  │                  );                                                  │   │
│  │              }                                                       │   │
│  │              Ok(())                                                  │   │
│  │          }                                                           │   │
│  │          Err(e) if e.is_retryable() => {                            │   │
│  │              // Re-buffer for retry (handled by resilience)          │   │
│  │              Err(e)                                                  │   │
│  │          }                                                           │   │
│  │          Err(e) => {                                                 │   │
│  │              error!(                                                 │   │
│  │                  error = %e,                                         │   │
│  │                  log_group = log_group,                              │   │
│  │                  log_stream = log_stream,                            │   │
│  │                  events_lost = events.len(),                         │   │
│  │                  "Non-retryable flush failure, events dropped"       │   │
│  │              );                                                      │   │
│  │              // Don't propagate - events are lost but we continue    │   │
│  │              Ok(())                                                  │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Memory Pressure                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Buffer grows too large due to slow/failed flushes         │   │
│  │                                                                      │   │
│  │  Strategy: Global buffer limit with backpressure                     │   │
│  │                                                                      │   │
│  │  struct BatchBuffer {                                                │   │
│  │      // ... other fields ...                                         │   │
│  │      max_total_bytes: usize,  // e.g., 10 MB                         │   │
│  │      current_total_bytes: AtomicUsize,                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl BatchBuffer {                                                  │   │
│  │      async fn add(&self, event: BatchEvent) -> Result<(), Error> {  │   │
│  │          let event_size = event.message.len() + 26;                  │   │
│  │                                                                      │   │
│  │          // Check global limit                                       │   │
│  │          let current = self.current_total_bytes.load(Ordering::Relaxed);│   │
│  │          if current + event_size > self.max_total_bytes {            │   │
│  │              // Force synchronous flush                               │   │
│  │              warn!("Buffer full, forcing synchronous flush");        │   │
│  │              self.flush_all_sync().await?;                           │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          // Add event                                                │   │
│  │          // ... normal add logic ...                                 │   │
│  │                                                                      │   │
│  │          self.current_total_bytes.fetch_add(                         │   │
│  │              event_size,                                             │   │
│  │              Ordering::Relaxed                                       │   │
│  │          );                                                          │   │
│  │                                                                      │   │
│  │          Ok(())                                                      │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Correlation Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CORRELATION EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Missing Correlation IDs                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Event doesn't have trace_id/request_id in context         │   │
│  │                                                                      │   │
│  │  Strategy: Generate if missing, log warning                          │   │
│  │                                                                      │   │
│  │  fn inject_correlation_ids(                                          │   │
│  │      event: &mut StructuredLogEvent,                                 │   │
│  │      config: &CorrelationConfig,                                     │   │
│  │  ) {                                                                 │   │
│  │      // Try to get from context                                      │   │
│  │      if event.trace_id.is_none() {                                   │   │
│  │          event.trace_id = get_current_trace_id();                    │   │
│  │      }                                                               │   │
│  │      if event.request_id.is_none() {                                 │   │
│  │          event.request_id = get_current_request_id();                │   │
│  │      }                                                               │   │
│  │      if event.span_id.is_none() {                                    │   │
│  │          event.span_id = get_current_span_id();                      │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // If still missing and auto-generate is enabled                │   │
│  │      if config.auto_generate_ids {                                   │   │
│  │          if event.trace_id.is_none() {                               │   │
│  │              event.trace_id = Some(generate_trace_id());             │   │
│  │              debug!("Generated trace_id (no context available)");   │   │
│  │          }                                                           │   │
│  │          if event.request_id.is_none() {                             │   │
│  │              event.request_id = Some(generate_request_id());         │   │
│  │              debug!("Generated request_id (no context available)"); │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Non-JSON Log Messages                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Querying logs that aren't structured JSON                 │   │
│  │                                                                      │   │
│  │  Strategy: Fall back to raw message search                           │   │
│  │                                                                      │   │
│  │  fn parse_correlated_log_event(                                      │   │
│  │      row: &QueryResultRow,                                           │   │
│  │  ) -> CorrelatedLogEvent {                                          │   │
│  │      let message = row.get_field("@message").unwrap_or_default();    │   │
│  │                                                                      │   │
│  │      // Try to parse as JSON                                         │   │
│  │      match serde_json::from_str::<Value>(&message) {                 │   │
│  │          Ok(json) => {                                               │   │
│  │              // Extract structured fields                            │   │
│  │              CorrelatedLogEvent {                                    │   │
│  │                  timestamp: parse_timestamp(row),                    │   │
│  │                  message: json.get("message")                        │   │
│  │                      .and_then(|v| v.as_str())                       │   │
│  │                      .unwrap_or(&message)                            │   │
│  │                      .to_string(),                                   │   │
│  │                  trace_id: json.get("trace_id")                      │   │
│  │                      .and_then(|v| v.as_str())                       │   │
│  │                      .map(String::from),                             │   │
│  │                  request_id: json.get("request_id")                  │   │
│  │                      .and_then(|v| v.as_str())                       │   │
│  │                      .map(String::from),                             │   │
│  │                  // ... other fields                                 │   │
│  │              }                                                       │   │
│  │          }                                                           │   │
│  │          Err(_) => {                                                 │   │
│  │              // Raw message - try regex extraction                   │   │
│  │              CorrelatedLogEvent {                                    │   │
│  │                  timestamp: parse_timestamp(row),                    │   │
│  │                  message: message.clone(),                           │   │
│  │                  trace_id: extract_trace_id_regex(&message),         │   │
│  │                  request_id: extract_request_id_regex(&message),     │   │
│  │                  // ... defaults for other fields                    │   │
│  │              }                                                       │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Time Zone Handling                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  CloudWatch Logs uses epoch milliseconds (UTC)                       │   │
│  │  User queries may use local time                                     │   │
│  │                                                                      │   │
│  │  Strategy: Always use UTC internally, convert at boundaries          │   │
│  │                                                                      │   │
│  │  impl TimeRange {                                                    │   │
│  │      /// Create from UTC timestamps                                  │   │
│  │      pub fn from_utc(start: DateTime<Utc>, end: DateTime<Utc>) -> Self {│   │
│  │          Self { start, end }                                         │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      /// Create from local time (converts to UTC)                    │   │
│  │      pub fn from_local<Tz: TimeZone>(                                │   │
│  │          start: DateTime<Tz>,                                        │   │
│  │          end: DateTime<Tz>,                                          │   │
│  │      ) -> Self {                                                     │   │
│  │          Self {                                                      │   │
│  │              start: start.with_timezone(&Utc),                       │   │
│  │              end: end.with_timezone(&Utc),                           │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      /// Convenience: last N hours from now                          │   │
│  │      pub fn last_hours(hours: i64) -> Self {                         │   │
│  │          let end = Utc::now();                                       │   │
│  │          let start = end - chrono::Duration::hours(hours);           │   │
│  │          Self { start, end }                                         │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      /// Convert to epoch seconds for API                            │   │
│  │      pub fn to_epoch_seconds(&self) -> (i64, i64) {                  │   │
│  │          (self.start.timestamp(), self.end.timestamp())              │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Performance Optimization

### 3.1 Batch Buffer Tuning

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BATCH BUFFER OPTIMIZATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Default Configuration (balanced)                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  BatchConfig {                                                       │   │
│  │      max_events: 10_000,     // CloudWatch limit                     │   │
│  │      max_bytes: 1_048_576,   // 1 MB (CloudWatch limit)              │   │
│  │      flush_interval: Duration::from_secs(5),  // 5 second flush      │   │
│  │  }                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  High-Throughput Configuration                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  BatchConfig {                                                       │   │
│  │      max_events: 10_000,                                             │   │
│  │      max_bytes: 1_048_576,                                           │   │
│  │      flush_interval: Duration::from_secs(1),  // More frequent flush │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Benefits:                                                           │   │
│  │  - Lower latency to CloudWatch                                       │   │
│  │  - Smaller batches = faster individual flushes                       │   │
│  │                                                                      │   │
│  │  Trade-offs:                                                         │   │
│  │  - More API calls = higher cost                                      │   │
│  │  - May hit rate limits faster                                        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Low-Latency Configuration                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  BatchConfig {                                                       │   │
│  │      max_events: 100,        // Small batches                        │   │
│  │      max_bytes: 102_400,     // 100 KB                               │   │
│  │      flush_interval: Duration::from_millis(500),                     │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Use case: Real-time log viewing, debugging                          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Cost-Optimized Configuration                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  BatchConfig {                                                       │   │
│  │      max_events: 10_000,                                             │   │
│  │      max_bytes: 1_048_576,                                           │   │
│  │      flush_interval: Duration::from_secs(30),  // Less frequent      │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Benefits:                                                           │   │
│  │  - Fewer API calls = lower cost                                      │   │
│  │  - Maximizes batch efficiency                                        │   │
│  │                                                                      │   │
│  │  Trade-offs:                                                         │   │
│  │  - Up to 30 second latency                                           │   │
│  │  - More events at risk on crash                                      │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Connection Pool Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONNECTION POOL SETTINGS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Recommended Settings                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  HttpTransportConfig {                                               │   │
│  │      // Connection pool                                              │   │
│  │      pool_max_idle_per_host: 10,  // Connections per endpoint        │   │
│  │      pool_idle_timeout: Duration::from_secs(90),                     │   │
│  │                                                                      │   │
│  │      // Timeouts                                                     │   │
│  │      connect_timeout: Duration::from_secs(5),                        │   │
│  │      read_timeout: Duration::from_secs(30),                          │   │
│  │      write_timeout: Duration::from_secs(30),                         │   │
│  │                                                                      │   │
│  │      // Keep-alive                                                   │   │
│  │      tcp_keepalive: Some(Duration::from_secs(60)),                   │   │
│  │                                                                      │   │
│  │      // TLS                                                          │   │
│  │      min_tls_version: TlsVersion::TLS_1_2,                           │   │
│  │  }                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  High-Concurrency Settings                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  HttpTransportConfig {                                               │   │
│  │      pool_max_idle_per_host: 50,  // More connections                │   │
│  │      pool_idle_timeout: Duration::from_secs(120),                    │   │
│  │      // ... same timeouts ...                                        │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Use when:                                                           │   │
│  │  - Multiple streams writing concurrently                             │   │
│  │  - Many concurrent Insights queries                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Query Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INSIGHTS QUERY OPTIMIZATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Correlation Query Patterns                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Optimized trace_id query:                                           │   │
│  │  fields @timestamp, @message, @logStream, @log                       │   │
│  │  | filter @message like /"trace_id":\s*"abc123"/                    │   │
│  │  | sort @timestamp asc                                               │   │
│  │  | limit 10000                                                       │   │
│  │                                                                      │   │
│  │  Why this pattern:                                                   │   │
│  │  1. `fields` limits data returned (faster)                          │   │
│  │  2. `filter` with regex is efficient for JSON                        │   │
│  │  3. `sort` ensures chronological order                               │   │
│  │  4. `limit` prevents massive result sets                             │   │
│  │                                                                      │   │
│  │  Anti-pattern (slow):                                                │   │
│  │  filter @message like /abc123/  // Too broad, matches anywhere       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Time Range Optimization                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Narrow time ranges are faster                                    │   │
│  │  let time_range = TimeRange::last_hours(1);  // Good                 │   │
│  │                                                                      │   │
│  │  // Wide time ranges can be slow                                     │   │
│  │  let time_range = TimeRange::last_days(30);  // Potentially slow     │   │
│  │                                                                      │   │
│  │  Recommendation:                                                     │   │
│  │  - For correlation: Start with narrow window (1h)                    │   │
│  │  - Expand if no results found                                        │   │
│  │  - Cache correlation timestamps if known                             │   │
│  │                                                                      │   │
│  │  async fn find_correlated_events(                                    │   │
│  │      trace_id: &str,                                                 │   │
│  │      initial_time_range: TimeRange,                                  │   │
│  │  ) -> Vec<CorrelatedLogEvent> {                                     │   │
│  │      // Try narrow window first                                      │   │
│  │      let mut range = initial_time_range;                             │   │
│  │      let mut events = query_by_trace_id(trace_id, range).await?;    │   │
│  │                                                                      │   │
│  │      // Expand if empty                                              │   │
│  │      if events.is_empty() {                                          │   │
│  │          range = TimeRange::last_hours(24);                          │   │
│  │          events = query_by_trace_id(trace_id, range).await?;        │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      events                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Error Handling Refinement

### 4.1 Error Recovery Strategies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ERROR RECOVERY STRATEGIES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Retryable Errors                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Error                         │ Strategy                            │   │
│  │  ─────────────────────────────┼────────────────────────────────────  │   │
│  │  ThrottlingException          │ Exponential backoff, respect header │   │
│  │  ServiceUnavailableException  │ Exponential backoff                  │   │
│  │  InternalServerError          │ Retry 3 times                        │   │
│  │  InvalidSequenceTokenException│ Refresh token, retry immediately    │   │
│  │                                                                      │   │
│  │  impl CloudWatchLogsError {                                          │   │
│  │      fn is_retryable(&self) -> bool {                                │   │
│  │          matches!(                                                   │   │
│  │              self,                                                   │   │
│  │              Self::RateLimit(_) |                                    │   │
│  │              Self::Server(ServerError::ServiceUnavailable { .. }) |  │   │
│  │              Self::Server(ServerError::InternalServerError { .. }) | │   │
│  │              Self::Request(RequestError::InvalidSequenceToken { .. })│   │
│  │          )                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      fn retry_after(&self) -> Option<Duration> {                     │   │
│  │          match self {                                                │   │
│  │              Self::RateLimit(RateLimitError::ThrottlingException {   │   │
│  │                  retry_after, ..                                     │   │
│  │              }) => *retry_after,                                     │   │
│  │              _ => None,                                              │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Non-Retryable Errors                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Error                          │ User Action Required               │   │
│  │  ──────────────────────────────┼───────────────────────────────────  │   │
│  │  ResourceNotFoundException     │ Create log group/stream first      │   │
│  │  ResourceAlreadyExistsException│ Resource exists, use existing      │   │
│  │  InvalidParameterException     │ Fix request parameters             │   │
│  │  MalformedQueryException       │ Fix Insights query syntax          │   │
│  │  AccessDeniedException         │ Check IAM permissions              │   │
│  │  LimitExceededException        │ Request quota increase             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Auto-Recovery Patterns                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Auto-create missing log group/stream                             │   │
│  │  async fn put_with_auto_create(                                      │   │
│  │      &self,                                                          │   │
│  │      log_group: &str,                                                │   │
│  │      log_stream: &str,                                               │   │
│  │      event: StructuredLogEvent,                                      │   │
│  │  ) -> Result<(), Error> {                                           │   │
│  │      match self.events().put_structured(                             │   │
│  │          log_group, log_stream, event.clone()                        │   │
│  │      ).await {                                                       │   │
│  │          Ok(()) => Ok(()),                                           │   │
│  │          Err(e) if e.is_resource_not_found() => {                   │   │
│  │              // Auto-create and retry                                │   │
│  │              self.streams().ensure_exists(log_group, log_stream)     │   │
│  │                  .await?;                                            │   │
│  │              self.events().put_structured(                           │   │
│  │                  log_group, log_stream, event                        │   │
│  │              ).await                                                 │   │
│  │          }                                                           │   │
│  │          Err(e) => Err(e),                                          │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Security Hardening

### 5.1 PII Filtering

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PII FILTERING                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Configurable PII Filter                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  struct PiiFilter {                                                  │   │
│  │      patterns: Vec<(Regex, String)>,  // (pattern, replacement)     │   │
│  │      field_redactions: HashSet<String>,  // Fields to fully redact  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl PiiFilter {                                                    │   │
│  │      fn default() -> Self {                                          │   │
│  │          Self {                                                      │   │
│  │              patterns: vec![                                         │   │
│  │                  // Email addresses                                  │   │
│  │                  (                                                   │   │
│  │                      Regex::new(                                     │   │
│  │                          r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"│   │
│  │                      ).unwrap(),                                     │   │
│  │                      "[EMAIL_REDACTED]".to_string()                  │   │
│  │                  ),                                                  │   │
│  │                  // Credit card numbers                              │   │
│  │                  (                                                   │   │
│  │                      Regex::new(r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b")│   │
│  │                          .unwrap(),                                  │   │
│  │                      "[CC_REDACTED]".to_string()                     │   │
│  │                  ),                                                  │   │
│  │                  // SSN                                              │   │
│  │                  (                                                   │   │
│  │                      Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap(), │   │
│  │                      "[SSN_REDACTED]".to_string()                    │   │
│  │                  ),                                                  │   │
│  │                  // Phone numbers                                    │   │
│  │                  (                                                   │   │
│  │                      Regex::new(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b").unwrap(),│   │
│  │                      "[PHONE_REDACTED]".to_string()                  │   │
│  │                  ),                                                  │   │
│  │              ],                                                      │   │
│  │              field_redactions: hashset![                             │   │
│  │                  "password".to_string(),                             │   │
│  │                  "secret".to_string(),                               │   │
│  │                  "token".to_string(),                                │   │
│  │                  "api_key".to_string(),                              │   │
│  │                  "credit_card".to_string(),                          │   │
│  │              ],                                                      │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      fn filter_message(&self, message: &str) -> String {             │   │
│  │          let mut result = message.to_string();                       │   │
│  │          for (pattern, replacement) in &self.patterns {              │   │
│  │              result = pattern.replace_all(&result, replacement.as_str())│   │
│  │                  .to_string();                                       │   │
│  │          }                                                           │   │
│  │          result                                                      │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      fn filter_fields(&self, fields: &mut HashMap<String, Value>) { │   │
│  │          for key in &self.field_redactions {                         │   │
│  │              if fields.contains_key(key) {                           │   │
│  │                  fields.insert(key.clone(), Value::String(           │   │
│  │                      "[REDACTED]".to_string()                        │   │
│  │                  ));                                                 │   │
│  │              }                                                       │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Credential Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CREDENTIAL SECURITY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Implementation (reuses aws/credentials patterns)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Never log credentials                                           │   │
│  │  #[derive(Clone)]                                                    │   │
│  │  pub struct SecretString(String);                                    │   │
│  │                                                                      │   │
│  │  impl Debug for SecretString {                                       │   │
│  │      fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {           │   │
│  │          write!(f, "[REDACTED]")                                     │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Display for SecretString {                                     │   │
│  │      fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {           │   │
│  │          write!(f, "[REDACTED]")                                     │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Drop for SecretString {                                        │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          // Zero out memory on drop                                  │   │
│  │          unsafe {                                                    │   │
│  │              std::ptr::write_volatile(                               │   │
│  │                  self.0.as_mut_ptr(),                                │   │
│  │                  0                                                   │   │
│  │              );                                                      │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Testing Strategy

### 6.1 Unit Test Coverage

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      UNIT TEST COVERAGE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Component                          │ Coverage Target │ Priority            │
│  ───────────────────────────────────┼────────────────┼────────────────────  │
│  Batch buffer management            │ 95%            │ Critical             │
│  Log event validation               │ 90%            │ Critical             │
│  Correlation ID injection           │ 90%            │ High                 │
│  Query building                     │ 90%            │ High                 │
│  Error mapping                      │ 85%            │ High                 │
│  PII filtering                      │ 95%            │ Critical             │
│  Configuration parsing              │ 80%            │ Medium               │
│  Time range handling                │ 85%            │ High                 │
│                                                                             │
│  Total target: > 85% code coverage                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Integration Test Scenarios

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INTEGRATION TEST SCENARIOS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Scenario                           │ Mock Server │ Real AWS                │
│  ───────────────────────────────────┼────────────┼────────────────────────  │
│  PutLogEvents success               │ ✓          │ ✓ (optional)            │
│  PutLogEvents batch splitting       │ ✓          │ ✓                       │
│  FilterLogEvents pagination         │ ✓          │ ✓                       │
│  Insights query lifecycle           │ ✓          │ ✓                       │
│  Query timeout handling             │ ✓          │ N/A                     │
│  Log group create/delete            │ ✓          │ ✓                       │
│  Retention policy management        │ ✓          │ ✓                       │
│  Rate limit handling                │ ✓          │ N/A (hard to trigger)   │
│  Correlation query                  │ ✓          │ ✓                       │
│  Batch buffer flush on shutdown     │ ✓          │ ✓                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Documentation Requirements

### 7.1 API Documentation

| Document | Content | Priority |
|----------|---------|----------|
| README.md | Quick start, installation, basic usage | Critical |
| API Reference | Complete trait/interface docs | Critical |
| Configuration Guide | All config options explained | High |
| Correlation Guide | How to use correlation features | High |
| Performance Tuning | Batch config optimization | Medium |
| Error Handling | Error types and recovery | Medium |
| Testing Guide | How to use simulation | Medium |

### 7.2 Code Documentation

| Requirement | Enforcement |
|-------------|-------------|
| All public types documented | `#![deny(missing_docs)]` |
| All public functions documented | `#![deny(missing_docs)]` |
| Examples in doc comments | Review checklist |
| Error scenarios documented | Review checklist |

---

## 8. Open Items

### 8.1 Decisions Needed

| Item | Options | Recommendation |
|------|---------|----------------|
| Default batch size | 5000 vs 10000 events | 10000 (CloudWatch limit) |
| Default flush interval | 1s vs 5s vs 10s | 5s (balanced) |
| Auto-create log groups | Enabled by default | No (explicit creation) |
| PII filtering | Enabled by default | No (opt-in) |

### 8.2 Future Enhancements

| Enhancement | Priority | Notes |
|-------------|----------|-------|
| Metric filters support | Low | Can add later |
| Subscription filters | Low | Can add later |
| Live tail support | Medium | Real-time log streaming |
| Log class support | Low | STANDARD vs INFREQUENT_ACCESS |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial refinement |

---

**End of Refinement Phase**

*Next: Completion phase will finalize implementation readiness and provide final review.*
