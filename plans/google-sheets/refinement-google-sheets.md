# Google Sheets Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google-sheets`

---

## 1. Edge Cases and Boundary Conditions

### 1.1 Range Validation

| Edge Case | Handling | Test Scenario |
|-----------|----------|---------------|
| Empty range | Return `InvalidRange` error | `""` |
| Invalid A1 notation | Return `InvalidRange` error | `"Sheet1!ZZZ999999"` |
| Missing sheet name | Use first sheet | `"A1:B10"` |
| Sheet name with spaces | Require quotes | `"'My Sheet'!A1:B10"` |
| Sheet name with special chars | URL encode | `"Sheet#1!A1"` |
| Negative indices | Return `InvalidRange` error | `"A-1:B10"` |
| Reversed range | Normalize to valid | `"B10:A1"` → `"A1:B10"` |
| Single cell | Treat as 1x1 range | `"A1"` |
| Full column | Allow | `"A:A"` |
| Full row | Allow | `"1:1"` |

```rust
fn validate_range(range: &str) -> Result<ValidatedRange> {
    if range.is_empty() {
        return Err(GoogleSheetsError::InvalidRange {
            range: range.to_string(),
            reason: "Range cannot be empty".into(),
        });
    }

    let parsed = parse_a1_notation(range)?;

    // Validate column bounds (max: XFD = 16384)
    if parsed.end_col > MAX_COLUMNS {
        return Err(GoogleSheetsError::InvalidRange {
            range: range.to_string(),
            reason: format!("Column exceeds maximum ({})", MAX_COLUMNS),
        });
    }

    // Validate row bounds (max: 10,000,000)
    if parsed.end_row > MAX_ROWS {
        return Err(GoogleSheetsError::InvalidRange {
            range: range.to_string(),
            reason: format!("Row exceeds maximum ({})", MAX_ROWS),
        });
    }

    // Normalize reversed ranges
    let normalized = if parsed.start_col > parsed.end_col || parsed.start_row > parsed.end_row {
        normalize_range(parsed)
    } else {
        parsed
    };

    Ok(ValidatedRange(normalized))
}
```

### 1.2 Cell Value Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Very long string | Truncate to 50,000 chars (API limit) |
| Unicode characters | Preserve as-is |
| Formula starting with `=` | Mark as Formula type |
| Number as string | Respect input option setting |
| Date values | Parse based on render option |
| Empty string vs null | Distinguish in CellValue enum |
| Array formula | Handle `{=FORMULA}` syntax |
| Circular reference | Return API error |

```rust
fn normalize_cell_value(value: CellValue, options: &ValueInputOption) -> CellValue {
    match value {
        CellValue::String(s) if s.len() > MAX_CELL_LENGTH => {
            warn!("Truncating cell value from {} to {} chars", s.len(), MAX_CELL_LENGTH);
            CellValue::String(s[..MAX_CELL_LENGTH].to_string())
        }
        CellValue::String(s) if s.starts_with('=') && *options == ValueInputOption::UserEntered => {
            CellValue::Formula(s)
        }
        other => other,
    }
}
```

### 1.3 Batch Operation Limits

| Limit | Value | Handling |
|-------|-------|----------|
| Max ranges per batch get | 100 | Chunk and merge results |
| Max cells per request | 10,000,000 | Split into smaller batches |
| Max request size | 10 MB | Estimate and split |
| Max values per write | 50,000 cells | Chunk writes |

```rust
async fn batch_get_with_chunking(
    &self,
    spreadsheet_id: &str,
    ranges: Vec<String>,
) -> Result<BatchValueRange> {
    const MAX_RANGES_PER_REQUEST: usize = 100;

    if ranges.len() <= MAX_RANGES_PER_REQUEST {
        return self.batch_get_internal(spreadsheet_id, ranges).await;
    }

    let mut all_results = Vec::new();

    for chunk in ranges.chunks(MAX_RANGES_PER_REQUEST) {
        let result = self.batch_get_internal(spreadsheet_id, chunk.to_vec()).await?;
        all_results.extend(result.value_ranges);
    }

    Ok(BatchValueRange {
        spreadsheet_id: spreadsheet_id.to_string(),
        value_ranges: all_results,
    })
}
```

---

## 2. Error Recovery Procedures

### 2.1 Retry Strategy Matrix

| Error Type | Retry | Strategy | Max Attempts |
|------------|-------|----------|--------------|
| `RateLimitError` (429) | Yes | Exponential + Retry-After | 5 |
| `ServiceUnavailable` (503) | Yes | Exponential (2s base) | 3 |
| `InternalError` (500) | Yes | Exponential (1s base) | 3 |
| `Timeout` | Yes | Fixed (1s delay) | 3 |
| `ConflictDetected` (409) | Yes | Re-read + retry | 3 |
| `TokenExpired` (401) | Yes | Refresh token + retry | 1 |
| `PermissionDenied` (403) | No | Fail fast | - |
| `SpreadsheetNotFound` (404) | No | Fail fast | - |
| `InvalidRange` | No | Fail fast | - |

```rust
impl RetryPolicy for SheetsRetryPolicy {
    fn should_retry(&self, error: &GoogleSheetsError, attempt: u32) -> RetryDecision {
        if attempt >= self.max_attempts {
            return RetryDecision::DoNotRetry;
        }

        match error {
            GoogleSheetsError::RateLimited { retry_after } => {
                let delay = retry_after.unwrap_or_else(|| self.calculate_backoff(attempt));
                RetryDecision::RetryAfter(delay)
            }
            GoogleSheetsError::ServiceUnavailable => {
                RetryDecision::RetryAfter(self.calculate_backoff_with_jitter(attempt, 2000))
            }
            GoogleSheetsError::InternalError { .. } => {
                RetryDecision::RetryAfter(self.calculate_backoff_with_jitter(attempt, 1000))
            }
            GoogleSheetsError::Timeout => {
                RetryDecision::RetryAfter(Duration::from_secs(1))
            }
            GoogleSheetsError::ConflictDetected { .. } => {
                RetryDecision::RefreshAndRetry
            }
            GoogleSheetsError::TokenExpired => {
                RetryDecision::RefreshTokenAndRetry
            }
            _ => RetryDecision::DoNotRetry,
        }
    }
}
```

### 2.2 Token Refresh Recovery

```rust
impl GoogleAuthProvider {
    async fn execute_with_token_refresh<T, F, Fut>(
        &self,
        operation: F,
    ) -> Result<T>
    where
        F: Fn(String) -> Fut,
        Fut: Future<Output = Result<T>>,
    {
        let token = self.get_access_token().await?;

        match operation(token.clone()).await {
            Ok(result) => Ok(result),
            Err(GoogleSheetsError::TokenExpired) => {
                // Invalidate cached token
                self.token_cache.invalidate();

                // Get fresh token
                let new_token = self.get_access_token().await?;

                // Retry operation
                operation(new_token).await
            }
            Err(e) => Err(e),
        }
    }
}
```

### 2.3 Conflict Resolution Strategies

```rust
enum ConflictResolution {
    /// Fail the operation
    Fail,
    /// Overwrite with new values (last write wins)
    Overwrite,
    /// Re-read and reapply changes
    MergeAndRetry,
    /// Custom merge function
    Custom(Box<dyn Fn(Vec<Vec<CellValue>>, Vec<Vec<CellValue>>) -> Vec<Vec<CellValue>>>),
}

impl OptimisticLock {
    async fn execute_with_conflict_resolution<F>(
        &self,
        spreadsheet_id: &str,
        range: &str,
        modify_fn: F,
        resolution: ConflictResolution,
    ) -> Result<UpdateResponse>
    where
        F: Fn(Vec<Vec<CellValue>>) -> Vec<Vec<CellValue>>,
    {
        for attempt in 0..self.max_retries {
            let current = self.client.values().get(spreadsheet_id, range).await?;
            let etag = self.client.etag_cache.get(spreadsheet_id, range);
            let modified = modify_fn(current.values.clone());

            match self.client.values().update(
                spreadsheet_id,
                range,
                modified.clone(),
                UpdateOptions { if_match: etag, ..Default::default() },
            ).await {
                Ok(response) => return Ok(response),
                Err(GoogleSheetsError::ConflictDetected { .. }) => {
                    match resolution {
                        ConflictResolution::Fail => {
                            return Err(GoogleSheetsError::ConflictDetected {
                                attempts: attempt + 1
                            });
                        }
                        ConflictResolution::Overwrite => {
                            return self.client.values().update(
                                spreadsheet_id,
                                range,
                                modified,
                                UpdateOptions::default(),
                            ).await;
                        }
                        ConflictResolution::MergeAndRetry => {
                            sleep(exponential_backoff(attempt)).await;
                            continue;
                        }
                        ConflictResolution::Custom(ref merge_fn) => {
                            let latest = self.client.values().get(spreadsheet_id, range).await?;
                            let merged = merge_fn(current.values, latest.values);
                            // Continue with merged values
                        }
                    }
                }
                Err(e) => return Err(e),
            }
        }

        Err(GoogleSheetsError::MaxRetriesExceeded)
    }
}
```

---

## 3. Performance Optimizations

### 3.1 Connection Pooling

```rust
fn create_http_client(config: &SheetsConfig) -> reqwest::Client {
    reqwest::Client::builder()
        .pool_max_idle_per_host(config.pool_max_idle.unwrap_or(10))
        .pool_idle_timeout(config.pool_idle_timeout.unwrap_or(Duration::from_secs(90)))
        .connect_timeout(config.connect_timeout.unwrap_or(Duration::from_secs(10)))
        .timeout(config.request_timeout.unwrap_or(Duration::from_secs(60)))
        .tcp_keepalive(Duration::from_secs(60))
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .https_only(true)
        .gzip(true)
        .build()
        .expect("Failed to create HTTP client")
}
```

### 3.2 Batch Read Optimization

```rust
impl ValuesService {
    /// Optimized batch read with parallel fetching for large range sets
    async fn batch_get_parallel(
        &self,
        spreadsheet_id: &str,
        ranges: Vec<String>,
        parallelism: usize,
    ) -> Result<BatchValueRange> {
        let semaphore = Arc::new(Semaphore::new(parallelism));

        let futures: Vec<_> = ranges
            .chunks(10)  // Group ranges for batch API
            .map(|chunk| {
                let permit = semaphore.clone().acquire_owned();
                let client = self.client.clone();
                let id = spreadsheet_id.to_string();
                let chunk = chunk.to_vec();

                async move {
                    let _permit = permit.await;
                    client.values().batch_get_internal(&id, chunk).await
                }
            })
            .collect();

        let results = futures::future::try_join_all(futures).await?;

        Ok(BatchValueRange {
            spreadsheet_id: spreadsheet_id.to_string(),
            value_ranges: results.into_iter().flat_map(|r| r.value_ranges).collect(),
        })
    }
}
```

### 3.3 ETag Cache Optimization

```rust
impl ETagCache {
    // Use sharded locks for reduced contention
    fn new(config: ETagCacheConfig) -> Self {
        let shard_count = config.shard_count.unwrap_or(16);
        let shards: Vec<_> = (0..shard_count)
            .map(|_| RwLock::new(HashMap::new()))
            .collect();

        Self {
            shards,
            ttl: config.ttl,
        }
    }

    fn get_shard(&self, key: &str) -> usize {
        let mut hasher = DefaultHasher::new();
        key.hash(&mut hasher);
        (hasher.finish() as usize) % self.shards.len()
    }

    fn get(&self, spreadsheet_id: &str, range: &str) -> Option<String> {
        let key = format!("{}:{}", spreadsheet_id, range);
        let shard_idx = self.get_shard(&key);

        let shard = self.shards[shard_idx].read();
        shard.get(&key).and_then(|entry| {
            if entry.expires_at > Instant::now() {
                Some(entry.etag.clone())
            } else {
                None
            }
        })
    }
}
```

---

## 4. Schema Validation Refinements

### 4.1 Advanced Type Validation

```rust
#[derive(Clone)]
enum DataType {
    String,
    Number { min: Option<f64>, max: Option<f64> },
    Integer { min: Option<i64>, max: Option<i64> },
    Boolean,
    Date { format: Option<String> },
    DateTime { format: Option<String> },
    Enum(Vec<String>),
    Regex(String),
    Custom(Arc<dyn Fn(&CellValue) -> bool + Send + Sync>),
}

fn validate_cell_type(value: &CellValue, data_type: &DataType) -> Result<()> {
    match (value, data_type) {
        (CellValue::Empty, _) => Ok(()), // Empty handled by required check

        (CellValue::Number(n), DataType::Number { min, max }) => {
            if let Some(min_val) = min {
                if n < min_val {
                    return Err(ValidationError::BelowMinimum { value: *n, min: *min_val });
                }
            }
            if let Some(max_val) = max {
                if n > max_val {
                    return Err(ValidationError::AboveMaximum { value: *n, max: *max_val });
                }
            }
            Ok(())
        }

        (CellValue::String(s), DataType::Regex(pattern)) => {
            let re = Regex::new(pattern)?;
            if !re.is_match(s) {
                return Err(ValidationError::PatternMismatch {
                    value: s.clone(),
                    pattern: pattern.clone(),
                });
            }
            Ok(())
        }

        (CellValue::String(s), DataType::Date { format }) => {
            let fmt = format.as_deref().unwrap_or("%Y-%m-%d");
            if NaiveDate::parse_from_str(s, fmt).is_err() {
                return Err(ValidationError::InvalidDateFormat {
                    value: s.clone(),
                    expected: fmt.to_string(),
                });
            }
            Ok(())
        }

        (value, DataType::Custom(validator)) => {
            if !validator(value) {
                return Err(ValidationError::CustomValidationFailed);
            }
            Ok(())
        }

        _ => Err(ValidationError::TypeMismatch { .. }),
    }
}
```

### 4.2 Schema Inference

```rust
impl SchemaValidator {
    /// Infer schema from existing data
    fn infer_schema(values: &[Vec<CellValue>], has_header: bool) -> TableSchema {
        if values.is_empty() {
            return TableSchema::default();
        }

        let header_row = if has_header { Some(&values[0]) } else { None };
        let data_rows = if has_header { &values[1..] } else { values };

        let num_cols = values.iter().map(|r| r.len()).max().unwrap_or(0);

        let columns: Vec<ColumnSchema> = (0..num_cols)
            .map(|col_idx| {
                let name = header_row
                    .and_then(|h| h.get(col_idx))
                    .and_then(|c| c.as_string())
                    .unwrap_or_else(|| format!("column_{}", col_idx));

                let data_type = infer_column_type(data_rows, col_idx);
                let required = !data_rows.iter().any(|r| {
                    r.get(col_idx).map_or(true, |c| c.is_empty())
                });

                ColumnSchema { name, data_type, required, ..Default::default() }
            })
            .collect();

        TableSchema { columns, has_header }
    }
}

fn infer_column_type(rows: &[Vec<CellValue>], col_idx: usize) -> DataType {
    let values: Vec<_> = rows
        .iter()
        .filter_map(|r| r.get(col_idx))
        .filter(|v| !v.is_empty())
        .collect();

    if values.is_empty() {
        return DataType::String;
    }

    // Check if all numbers
    if values.iter().all(|v| matches!(v, CellValue::Number(_))) {
        return DataType::Number { min: None, max: None };
    }

    // Check if all booleans
    if values.iter().all(|v| matches!(v, CellValue::Boolean(_))) {
        return DataType::Boolean;
    }

    // Check for date pattern
    if values.iter().all(|v| {
        v.as_string().map_or(false, |s| looks_like_date(s))
    }) {
        return DataType::Date { format: None };
    }

    DataType::String
}
```

---

## 5. Security Hardening

### 5.1 Input Sanitization

```rust
fn sanitize_range_input(range: &str) -> String {
    range
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '!' || *c == ':' || *c == '\'' || *c == ' ')
        .take(MAX_RANGE_LENGTH)
        .collect()
}

fn sanitize_spreadsheet_id(id: &str) -> Result<String> {
    // Spreadsheet IDs are alphanumeric with underscores and hyphens
    if !id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err(GoogleSheetsError::InvalidSpreadsheetId {
            id: redact_id(id),
            reason: "Invalid characters in spreadsheet ID".into(),
        });
    }

    if id.len() < 20 || id.len() > 100 {
        return Err(GoogleSheetsError::InvalidSpreadsheetId {
            id: redact_id(id),
            reason: "Invalid spreadsheet ID length".into(),
        });
    }

    Ok(id.to_string())
}
```

### 5.2 Service Account Key Validation

```rust
impl ServiceAccountKey {
    fn validate(&self) -> Result<()> {
        // Validate required fields
        if self.client_email.is_empty() {
            return Err(ConfigError::InvalidServiceAccount {
                reason: "Missing client_email".into(),
            });
        }

        if !self.client_email.ends_with(".iam.gserviceaccount.com") {
            return Err(ConfigError::InvalidServiceAccount {
                reason: "Invalid client_email format".into(),
            });
        }

        // Validate private key format
        if !self.private_key.expose().starts_with("-----BEGIN") {
            return Err(ConfigError::InvalidServiceAccount {
                reason: "Invalid private key format".into(),
            });
        }

        // Validate token URI
        if self.token_uri != "https://oauth2.googleapis.com/token" {
            warn!("Non-standard token URI: {}", self.token_uri);
        }

        Ok(())
    }
}
```

### 5.3 Rate Limit Protection

```rust
impl RateLimiter {
    /// Prevent abuse by tracking per-spreadsheet usage
    fn try_acquire_for_spreadsheet(&self, spreadsheet_id: &str) -> bool {
        // Global rate limit
        if !self.global_bucket.try_acquire() {
            return false;
        }

        // Per-spreadsheet rate limit (prevent targeting single sheet)
        let per_sheet_limiter = self.per_sheet_limiters
            .entry(spreadsheet_id.to_string())
            .or_insert_with(|| TokenBucket::new(30, 60));  // 30 req/min per sheet

        per_sheet_limiter.try_acquire()
    }
}
```

---

## 6. Observability Enhancements

### 6.1 Structured Logging

```rust
fn log_operation(operation: &str, spreadsheet_id: &str, range: &str, result: &Result<()>) {
    match result {
        Ok(_) => {
            info!(
                target: "google_sheets",
                operation = operation,
                spreadsheet_id = %redact_id(spreadsheet_id),
                range = range,
                "Operation completed successfully"
            );
        }
        Err(e) => {
            error!(
                target: "google_sheets",
                operation = operation,
                spreadsheet_id = %redact_id(spreadsheet_id),
                range = range,
                error = %e,
                error_type = %error_type_name(e),
                retryable = e.is_retryable(),
                "Operation failed"
            );
        }
    }
}
```

### 6.2 Health Check

```rust
impl GoogleSheetsClient {
    async fn health_check(&self) -> HealthStatus {
        let mut checks = Vec::new();

        // Check auth token
        match self.auth.get_access_token().await {
            Ok(_) => {
                checks.push(HealthCheck {
                    name: "authentication".into(),
                    status: CheckStatus::Healthy,
                    details: None,
                });
            }
            Err(e) => {
                checks.push(HealthCheck {
                    name: "authentication".into(),
                    status: CheckStatus::Unhealthy,
                    details: Some(format!("Token error: {}", e)),
                });
            }
        }

        // Check circuit breaker
        let circuit_state = self.circuit_breaker.state();
        checks.push(HealthCheck {
            name: "circuit_breaker".into(),
            status: match circuit_state {
                State::Closed => CheckStatus::Healthy,
                State::HalfOpen => CheckStatus::Degraded,
                State::Open => CheckStatus::Unhealthy,
            },
            details: Some(format!("state: {:?}", circuit_state)),
        });

        // Check rate limiter
        checks.push(HealthCheck {
            name: "rate_limiter".into(),
            status: if self.rate_limiter.has_capacity() {
                CheckStatus::Healthy
            } else {
                CheckStatus::Degraded
            },
            details: Some(format!(
                "read: {:.0}%, write: {:.0}%",
                self.rate_limiter.read_capacity_percent(),
                self.rate_limiter.write_capacity_percent()
            )),
        });

        HealthStatus::from_checks(checks)
    }
}
```

---

## 7. Testing Refinements

### 7.1 Mock Spreadsheet Operations

```rust
impl MockSpreadsheet {
    fn get_range(&self, range: &str) -> Result<Vec<Vec<CellValue>>> {
        let parsed = parse_a1_notation(range)?;
        let sheet = self.sheets.get(&parsed.sheet_name)
            .ok_or(GoogleSheetsError::SheetNotFound {
                name: parsed.sheet_name.clone()
            })?;

        let mut result = Vec::new();
        for row in parsed.start_row..=parsed.end_row {
            let mut row_data = Vec::new();
            for col in parsed.start_col..=parsed.end_col {
                let value = sheet.data
                    .get(row as usize)
                    .and_then(|r| r.get(col as usize))
                    .cloned()
                    .unwrap_or(CellValue::Empty);
                row_data.push(value);
            }
            result.push(row_data);
        }

        Ok(result)
    }

    fn set_range(&mut self, range: &str, values: Vec<Vec<CellValue>>) -> Result<()> {
        let parsed = parse_a1_notation(range)?;
        let sheet = self.sheets.get_mut(&parsed.sheet_name)
            .ok_or(GoogleSheetsError::SheetNotFound {
                name: parsed.sheet_name.clone()
            })?;

        // Expand grid if needed
        let needed_rows = parsed.start_row as usize + values.len();
        while sheet.data.len() < needed_rows {
            sheet.data.push(Vec::new());
        }

        for (i, row) in values.iter().enumerate() {
            let row_idx = parsed.start_row as usize + i;
            let needed_cols = parsed.start_col as usize + row.len();
            while sheet.data[row_idx].len() < needed_cols {
                sheet.data[row_idx].push(CellValue::Empty);
            }

            for (j, cell) in row.iter().enumerate() {
                let col_idx = parsed.start_col as usize + j;
                sheet.data[row_idx][col_idx] = cell.clone();
            }
        }

        Ok(())
    }
}
```

### 7.2 Property-Based Testing

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn range_normalization_idempotent(range in "[A-Z]{1,3}[0-9]{1,7}:[A-Z]{1,3}[0-9]{1,7}") {
            if let Ok(normalized) = normalize_range(&range) {
                let double_normalized = normalize_range(&normalized).unwrap();
                prop_assert_eq!(normalized, double_normalized);
            }
        }

        #[test]
        fn cell_value_roundtrip(s in ".*") {
            let value = CellValue::String(s.clone());
            let serialized = serialize_cell_value(&value);
            let deserialized = deserialize_cell_value(&serialized);
            prop_assert_eq!(value, deserialized);
        }

        #[test]
        fn batch_chunking_preserves_data(
            ranges in prop::collection::vec("[A-Z][0-9]:[A-Z][0-9]", 1..200)
        ) {
            let chunked = chunk_ranges(&ranges, 10);
            let flattened: Vec<_> = chunked.into_iter().flatten().collect();
            prop_assert_eq!(ranges, flattened);
        }
    }
}
```

---

## 8. Configuration Validation

```rust
impl SheetsConfig {
    fn validate(&self) -> Result<()> {
        // Validate credentials
        match &self.credentials {
            GoogleCredentials::ServiceAccount(key) => key.validate()?,
            GoogleCredentials::OAuth(config) => config.validate()?,
        }

        // Validate timeouts
        if self.timeout < Duration::from_secs(1) {
            return Err(ConfigError::InvalidTimeout {
                reason: "Timeout too short (minimum 1s)".into(),
            });
        }

        if self.timeout > Duration::from_secs(300) {
            return Err(ConfigError::InvalidTimeout {
                reason: "Timeout too long (maximum 300s)".into(),
            });
        }

        // Validate rate limits
        if self.rate_limit.reads_per_minute > 100 {
            warn!("Read rate exceeds recommended limit");
        }

        if self.rate_limit.writes_per_minute > 100 {
            warn!("Write rate exceeds recommended limit");
        }

        Ok(())
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement phase |

---

**Next Phase:** Completion - Test coverage requirements, implementation checklist, security sign-off, and operational readiness criteria.
