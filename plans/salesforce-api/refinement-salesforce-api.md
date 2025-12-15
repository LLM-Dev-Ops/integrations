# Salesforce API Integration - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/salesforce_api`

---

## 1. Overview

This refinement document details production hardening patterns, performance optimizations, edge case handling, and advanced implementation strategies for the Salesforce API Integration.

---

## 2. Performance Optimizations

### 2.1 Token Caching with Proactive Refresh

```rust
// OPTIMIZATION: Avoid token refresh during critical paths
use std::sync::RwLock;
use tokio::time::{interval, Duration};

pub struct ProactiveTokenManager {
    current_token: RwLock<Option<AccessToken>>,
    auth_provider: Arc<dyn AuthProvider>,
    refresh_threshold: Duration,  // Refresh when this close to expiry
    refresh_handle: Option<JoinHandle<()>>,
}

impl ProactiveTokenManager {
    pub fn new(auth_provider: Arc<dyn AuthProvider>, refresh_threshold: Duration) -> Self {
        Self {
            current_token: RwLock::new(None),
            auth_provider,
            refresh_threshold,
            refresh_handle: None,
        }
    }

    /// Start background refresh task
    pub fn start_background_refresh(&mut self) {
        let auth_provider = Arc::clone(&self.auth_provider);
        let token_holder = Arc::new(self.current_token.clone());
        let threshold = self.refresh_threshold;

        let handle = tokio::spawn(async move {
            let mut check_interval = interval(Duration::from_secs(60));

            loop {
                check_interval.tick().await;

                let needs_refresh = {
                    let token = token_holder.read().unwrap();
                    token.as_ref()
                        .map(|t| Utc::now() + threshold > t.expires_at)
                        .unwrap_or(true)
                };

                if needs_refresh {
                    match auth_provider.authenticate().await {
                        Ok(new_token) => {
                            let mut token = token_holder.write().unwrap();
                            *token = Some(new_token);
                            tracing::debug!("Background token refresh successful");
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, "Background token refresh failed");
                        }
                    }
                }
            }
        });

        self.refresh_handle = Some(handle);
    }

    /// Get token, blocking refresh only if absolutely necessary
    pub async fn get_valid_token(&self) -> Result<AccessToken, AuthError> {
        // Fast path: valid cached token
        {
            let token = self.current_token.read().unwrap();
            if let Some(ref t) = *token {
                if Utc::now() < t.expires_at {
                    return Ok(t.clone());
                }
            }
        }

        // Slow path: need refresh
        let mut token = self.current_token.write().unwrap();

        // Double-check after acquiring write lock
        if let Some(ref t) = *token {
            if Utc::now() < t.expires_at {
                return Ok(t.clone());
            }
        }

        let new_token = self.auth_provider.authenticate().await?;
        *token = Some(new_token.clone());

        Ok(new_token)
    }
}
```

### 2.2 SOQL Query Optimization

```rust
// OPTIMIZATION: Batch queries using query_all with controlled pagination
use futures::Stream;

pub struct OptimizedQueryService {
    client: Arc<SalesforceClient>,
    default_batch_size: u32,
    max_concurrent_fetches: usize,
}

impl OptimizedQueryService {
    /// Execute query with optimized pagination
    pub fn query_all_optimized(
        &self,
        soql: &str,
    ) -> impl Stream<Item = Result<JsonValue, SfError>> {
        let client = Arc::clone(&self.client);
        let batch_size = self.default_batch_size;

        async_stream::stream! {
            // Add LIMIT hint if not present for better planning
            let optimized_soql = if !soql.to_uppercase().contains("LIMIT") {
                format!("{} LIMIT {}", soql.trim_end_matches(';'), batch_size)
            } else {
                soql.to_string()
            };

            let mut result = client.query().query(&optimized_soql).await?;

            // Yield initial batch
            for record in result.records.drain(..) {
                yield Ok(record);
            }

            // Follow pagination with prefetching
            while let Some(next_url) = result.next_records_url.take() {
                result = client.query().query_more(&next_url).await?;

                for record in result.records.drain(..) {
                    yield Ok(record);
                }
            }
        }
    }

    /// Execute relationship query with subquery optimization
    pub async fn query_with_related(
        &self,
        parent_soql: &str,
        child_relationship: &str,
        child_fields: &[&str],
    ) -> Result<Vec<JsonValue>, SfError> {
        // Build nested SOQL to reduce API calls
        let nested_soql = format!(
            "{}, (SELECT {} FROM {}) FROM ...",
            parent_soql.trim_end_matches("FROM"),
            child_fields.join(", "),
            child_relationship
        );

        // Single query fetches both parent and children
        self.client.query().query(&nested_soql).await.map(|r| r.records)
    }
}

// BENCHMARK TARGET: < 50ms per 2000 record batch
```

### 2.3 Bulk API Streaming

```rust
// OPTIMIZATION: Stream CSV without buffering entire file
use csv_async::{AsyncWriter, AsyncReader};
use tokio::io::{AsyncRead, AsyncWrite};

pub struct StreamingBulkUploader {
    client: Arc<SalesforceClient>,
    chunk_size: usize,
}

impl StreamingBulkUploader {
    /// Upload large dataset as streaming CSV
    pub async fn upload_stream<R: AsyncRead + Unpin + Send>(
        &self,
        job_id: &str,
        reader: R,
    ) -> Result<(), SfError> {
        let url = format!(
            "{}/services/data/v{}/jobs/ingest/{}/batches",
            self.client.config().instance_url,
            self.client.config().api_version,
            job_id
        );

        // Create streaming body with chunked transfer encoding
        let stream = ReaderStream::new(reader);
        let body = Body::wrap_stream(stream);

        let request = self.client.http_client()
            .put(&url)
            .header("Content-Type", "text/csv")
            .header("Transfer-Encoding", "chunked")
            .body(body);

        let response = request.send().await?;

        if !response.status().is_success() {
            let error_body = response.text().await?;
            return Err(parse_sf_error(&error_body)?);
        }

        Ok(())
    }

    /// Stream results without loading into memory
    pub fn get_results_stream(
        &self,
        job_id: &str,
        result_type: ResultType,
    ) -> impl Stream<Item = Result<csv::StringRecord, SfError>> {
        let url = format!(
            "{}/services/data/v{}/jobs/ingest/{}/{}",
            self.client.config().instance_url,
            self.client.config().api_version,
            job_id,
            match result_type {
                ResultType::Successful => "successfulResults",
                ResultType::Failed => "failedResults",
                ResultType::Unprocessed => "unprocessedRecords",
            }
        );

        async_stream::stream! {
            let response = self.client.get(&url).send().await?;
            let byte_stream = response.bytes_stream();
            let reader = StreamReader::new(byte_stream.map_err(std::io::Error::from));
            let mut csv_reader = AsyncReaderBuilder::new()
                .has_headers(true)
                .create_reader(reader);

            let mut record = csv::StringRecord::new();
            while csv_reader.read_record(&mut record).await? {
                yield Ok(record.clone());
            }
        }
    }
}
```

### 2.4 Connection Pool Tuning

```rust
// OPTIMIZATION: Tuned connection pool for Salesforce API patterns
pub fn create_optimized_http_client(config: &SalesforceConfig) -> reqwest::Client {
    ClientBuilder::new()
        // Salesforce uses per-org endpoints, optimize for single host
        .pool_max_idle_per_host(20)
        .pool_idle_timeout(Duration::from_secs(90))

        // Enable HTTP/2 for multiplexing
        .http2_prior_knowledge()

        // TCP optimizations
        .tcp_nodelay(true)
        .tcp_keepalive(Duration::from_secs(60))

        // TLS configuration
        .min_tls_version(tls::Version::TLS_1_2)
        .https_only(true)

        // Timeouts
        .connect_timeout(Duration::from_secs(30))
        .timeout(config.timeout)

        // Compression for JSON responses
        .gzip(true)
        .brotli(true)

        .build()
        .expect("Failed to create HTTP client")
}
```

### 2.5 Composite Request Batching

```rust
// OPTIMIZATION: Batch multiple operations into single API call
pub struct CompositeRequestBatcher {
    client: Arc<SalesforceClient>,
    max_batch_size: usize,  // Salesforce limit: 25
}

impl CompositeRequestBatcher {
    /// Batch create operations for efficiency
    pub async fn batch_create(
        &self,
        sobject: &str,
        records: Vec<JsonValue>,
    ) -> Result<Vec<CreateResult>, SfError> {
        let mut all_results = Vec::with_capacity(records.len());

        // Process in batches of 25 (Salesforce composite limit)
        for chunk in records.chunks(self.max_batch_size) {
            let subrequests: Vec<CompositeRequest> = chunk
                .iter()
                .enumerate()
                .map(|(i, record)| CompositeRequest {
                    method: HttpMethod::POST,
                    url: format!("sobjects/{}/", sobject),
                    reference_id: format!("create_{}", i),
                    body: Some(record.clone()),
                })
                .collect();

            let response = self.client.sobjects().composite(subrequests).await?;

            for result in response.results {
                if result.http_status_code >= 200 && result.http_status_code < 300 {
                    let create_resp: CreateResponse = serde_json::from_value(result.body)?;
                    all_results.push(CreateResult {
                        id: create_resp.id,
                        success: create_resp.success,
                    });
                } else {
                    let errors: Vec<SalesforceError> = serde_json::from_value(result.body)?;
                    all_results.push(CreateResult {
                        id: String::new(),
                        success: false,
                    });
                }
            }
        }

        Ok(all_results)
    }
}

// BENCHMARK TARGET: < 1s for 25 record composite
```

---

## 3. Error Handling Refinements

### 3.1 Intelligent Retry with Token Refresh

```rust
// REFINEMENT: Context-aware retry with token refresh integration
pub struct SalesforceRetryPolicy {
    max_attempts: u32,
    base_delay: Duration,
    max_delay: Duration,
    token_manager: Arc<TokenManager>,
}

impl SalesforceRetryPolicy {
    pub async fn execute_with_retry<F, Fut, T>(
        &self,
        operation: F,
    ) -> Result<T, SfError>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, SfError>>,
    {
        let mut attempt = 0;

        loop {
            attempt += 1;

            match operation().await {
                Ok(result) => return Ok(result),

                Err(ref e) if attempt >= self.max_attempts => {
                    return Err(e.clone());
                }

                // Token expired - refresh and retry immediately
                Err(SfError::Auth(AuthError::TokenExpired)) => {
                    tracing::info!(attempt, "Token expired, refreshing");
                    self.token_manager.invalidate().await;
                    self.token_manager.get_valid_token().await?;
                    // No delay for token refresh
                    continue;
                }

                // Rate limit - respect Retry-After
                Err(SfError::Limit(LimitError::DailyLimitExceeded)) => {
                    tracing::warn!(attempt, "Rate limit hit");
                    // Back off significantly for rate limits
                    let delay = Duration::from_secs(60);
                    tokio::time::sleep(delay).await;
                }

                // Concurrent limit - shorter backoff
                Err(SfError::Limit(LimitError::ConcurrentLimitExceeded)) => {
                    let delay = self.calculate_delay(attempt);
                    tracing::debug!(attempt, delay_ms = delay.as_millis(), "Concurrent limit");
                    tokio::time::sleep(delay).await;
                }

                // Server errors - exponential backoff
                Err(SfError::Api(ApiError::ServerError { .. })) |
                Err(SfError::Network(NetworkError::Timeout)) |
                Err(SfError::Network(NetworkError::ConnectionFailed)) => {
                    let delay = self.calculate_delay(attempt);
                    tracing::debug!(attempt, delay_ms = delay.as_millis(), "Retryable error");
                    tokio::time::sleep(delay).await;
                }

                // Non-retryable errors
                Err(e) => return Err(e),
            }
        }
    }

    fn calculate_delay(&self, attempt: u32) -> Duration {
        let exponential = self.base_delay.as_millis() as u64 * (1 << attempt.min(10));
        let capped = exponential.min(self.max_delay.as_millis() as u64);
        let jitter = rand::thread_rng().gen_range(0.0..0.1);
        Duration::from_millis((capped as f64 * (1.0 + jitter)) as u64)
    }
}
```

### 3.2 Graceful Bulk Job Cleanup

```rust
// REFINEMENT: Ensure orphaned bulk jobs are cleaned up
pub struct BulkJobCleanupGuard {
    client: Arc<SalesforceClient>,
    job_id: String,
    completed: bool,
}

impl BulkJobCleanupGuard {
    pub fn new(client: Arc<SalesforceClient>, job_id: String) -> Self {
        Self {
            client,
            job_id,
            completed: false,
        }
    }

    pub fn mark_completed(&mut self) {
        self.completed = true;
    }
}

impl Drop for BulkJobCleanupGuard {
    fn drop(&mut self) {
        if !self.completed {
            let client = Arc::clone(&self.client);
            let job_id = self.job_id.clone();

            tokio::spawn(async move {
                tracing::warn!(job_id = %job_id, "Aborting incomplete bulk job");

                if let Err(e) = client.bulk().abort_job(&job_id).await {
                    tracing::error!(
                        job_id = %job_id,
                        error = %e,
                        "Failed to abort bulk job"
                    );
                }
            });
        }
    }
}
```

### 3.3 Partial Failure Recovery for Bulk Operations

```rust
// REFINEMENT: Handle partial failures in bulk operations
pub struct BulkOperationResult {
    pub successful_count: u64,
    pub failed_count: u64,
    pub successful_ids: Vec<String>,
    pub failed_records: Vec<FailedRecord>,
}

pub struct FailedRecord {
    pub row_number: u64,
    pub id: Option<String>,
    pub error_code: String,
    pub error_message: String,
    pub fields: Vec<String>,
}

impl BulkService {
    pub async fn execute_with_partial_recovery(
        &self,
        job_id: &str,
        retry_failed: bool,
    ) -> Result<BulkOperationResult, SfError> {
        // Wait for job completion
        let final_job = self.poll_job_completion(job_id).await?;

        // Collect successful results
        let successful_stream = self.get_successful_results(job_id).await?;
        let successful_ids = collect_ids_from_csv(successful_stream).await?;

        // Collect failed results
        let failed_stream = self.get_failed_results(job_id).await?;
        let failed_records = collect_failed_records(failed_stream).await?;

        // Optionally retry failed records
        if retry_failed && !failed_records.is_empty() {
            let retryable: Vec<_> = failed_records
                .iter()
                .filter(|r| is_retryable_bulk_error(&r.error_code))
                .collect();

            if !retryable.is_empty() {
                tracing::info!(
                    count = retryable.len(),
                    "Retrying failed records"
                );
                // Implementation: create new job with failed records
            }
        }

        Ok(BulkOperationResult {
            successful_count: final_job.number_records_processed - final_job.number_records_failed,
            failed_count: final_job.number_records_failed,
            successful_ids,
            failed_records,
        })
    }
}

fn is_retryable_bulk_error(code: &str) -> bool {
    matches!(code,
        "UNABLE_TO_LOCK_ROW" |
        "REQUEST_RUNNING_TOO_LONG" |
        "SERVER_UNAVAILABLE"
    )
}
```

### 3.4 Event Subscription Recovery

```rust
// REFINEMENT: Recover from event subscription failures
pub struct ResilientEventSubscriber {
    client: Arc<PubSubClient>,
    topic: String,
    last_replay_id: Arc<RwLock<Option<Vec<u8>>>>,
    max_reconnects: u32,
}

impl ResilientEventSubscriber {
    pub fn subscribe_with_recovery(
        &self,
    ) -> impl Stream<Item = Result<EventMessage, SfError>> {
        let client = Arc::clone(&self.client);
        let topic = self.topic.clone();
        let last_replay_id = Arc::clone(&self.last_replay_id);
        let max_reconnects = self.max_reconnects;

        async_stream::stream! {
            let mut reconnect_count = 0;

            loop {
                // Get replay preset based on last known position
                let replay_preset = {
                    let replay_id = last_replay_id.read().unwrap();
                    if let Some(ref id) = *replay_id {
                        ReplayPreset::Custom(id.clone())
                    } else {
                        ReplayPreset::Latest
                    }
                };

                // Create subscription
                let subscription = client.subscribe(&topic, replay_preset, 100);

                tokio::pin!(subscription);

                loop {
                    match subscription.next().await {
                        Some(Ok(event)) => {
                            // Update last known position
                            {
                                let mut replay_id = last_replay_id.write().unwrap();
                                *replay_id = Some(event.replay_id.clone());
                            }

                            reconnect_count = 0;  // Reset on success
                            yield Ok(event);
                        }

                        Some(Err(SfError::Event(EventError::SubscriptionFailed { .. }))) => {
                            if reconnect_count >= max_reconnects {
                                yield Err(SfError::Event(EventError::MaxReconnectsExceeded));
                                return;
                            }

                            reconnect_count += 1;
                            let delay = Duration::from_secs(1 << reconnect_count.min(5));

                            tracing::warn!(
                                reconnect = reconnect_count,
                                delay_secs = delay.as_secs(),
                                "Subscription failed, reconnecting"
                            );

                            tokio::time::sleep(delay).await;
                            break;  // Break inner loop to reconnect
                        }

                        Some(Err(e)) => {
                            yield Err(e);
                        }

                        None => {
                            // Stream ended unexpectedly
                            tracing::warn!("Event stream ended, reconnecting");
                            tokio::time::sleep(Duration::from_secs(1)).await;
                            break;
                        }
                    }
                }
            }
        }
    }
}
```

---

## 4. Security Refinements

### 4.1 Credential Protection

```rust
// REFINEMENT: Secure credential handling
use secrecy::{ExposeSecret, SecretString, Zeroize};

pub struct SalesforceCredentials {
    client_id: String,
    credentials: CredentialType,
}

pub enum CredentialType {
    JwtBearer {
        username: String,
        private_key: SecretString,
    },
    RefreshToken {
        refresh_token: SecretString,
    },
    AccessToken {
        token: SecretString,
    },
}

impl SalesforceCredentials {
    /// Safely use credentials without exposing them
    pub fn with_private_key<F, R>(&self, f: F) -> Option<R>
    where
        F: FnOnce(&str) -> R,
    {
        match &self.credentials {
            CredentialType::JwtBearer { private_key, .. } => {
                Some(f(private_key.expose_secret()))
            }
            _ => None,
        }
    }
}

impl std::fmt::Debug for SalesforceCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SalesforceCredentials")
            .field("client_id", &self.client_id)
            .field("credentials", &"[REDACTED]")
            .finish()
    }
}

impl Drop for SalesforceCredentials {
    fn drop(&mut self) {
        self.client_id.zeroize();
    }
}
```

### 4.2 SOQL Injection Prevention

```rust
// REFINEMENT: Prevent SOQL injection attacks
pub struct SafeSoqlBuilder {
    base_query: String,
    conditions: Vec<String>,
    parameters: Vec<(String, SafeValue)>,
}

pub enum SafeValue {
    String(String),
    Number(f64),
    Boolean(bool),
    Date(NaiveDate),
    DateTime(DateTime<Utc>),
    Null,
}

impl SafeValue {
    fn to_soql(&self) -> String {
        match self {
            SafeValue::String(s) => format!("'{}'", escape_soql_string(s)),
            SafeValue::Number(n) => n.to_string(),
            SafeValue::Boolean(b) => b.to_string(),
            SafeValue::Date(d) => d.format("%Y-%m-%d").to_string(),
            SafeValue::DateTime(dt) => dt.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            SafeValue::Null => "null".to_string(),
        }
    }
}

fn escape_soql_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

impl SafeSoqlBuilder {
    pub fn new(base_query: &str) -> Self {
        Self {
            base_query: base_query.to_string(),
            conditions: Vec::new(),
            parameters: Vec::new(),
        }
    }

    pub fn where_eq(mut self, field: &str, value: SafeValue) -> Self {
        // Validate field name (alphanumeric and underscore only)
        if !is_valid_field_name(field) {
            panic!("Invalid field name: {}", field);
        }

        self.conditions.push(format!("{} = {}", field, value.to_soql()));
        self
    }

    pub fn where_in(mut self, field: &str, values: Vec<SafeValue>) -> Self {
        if !is_valid_field_name(field) {
            panic!("Invalid field name: {}", field);
        }

        let value_list: Vec<String> = values.iter().map(|v| v.to_soql()).collect();
        self.conditions.push(format!("{} IN ({})", field, value_list.join(", ")));
        self
    }

    pub fn build(self) -> String {
        if self.conditions.is_empty() {
            self.base_query
        } else {
            format!("{} WHERE {}", self.base_query, self.conditions.join(" AND "))
        }
    }
}

fn is_valid_field_name(name: &str) -> bool {
    !name.is_empty() &&
    name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.') &&
    name.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false)
}

// Usage
let query = SafeSoqlBuilder::new("SELECT Id, Name FROM Account")
    .where_eq("Industry", SafeValue::String("Technology".to_string()))
    .where_eq("AnnualRevenue", SafeValue::Number(1000000.0))
    .build();
// Result: SELECT Id, Name FROM Account WHERE Industry = 'Technology' AND AnnualRevenue = 1000000
```

### 4.3 Request Sanitization for Logging

```rust
// REFINEMENT: Safe logging without exposing sensitive data
pub struct SafeRequestLog {
    method: String,
    sobject: Option<String>,
    operation: String,
    record_id: Option<String>,
    field_count: Option<usize>,
}

impl SafeRequestLog {
    pub fn from_create(sobject: &str, record: &JsonValue) -> Self {
        let field_count = record.as_object().map(|o| o.len());

        Self {
            method: "POST".to_string(),
            sobject: Some(sobject.to_string()),
            operation: "create".to_string(),
            record_id: None,
            field_count,
        }
    }

    pub fn from_query(soql: &str) -> Self {
        // Sanitize SOQL - remove string literals
        let sanitized = sanitize_soql_for_logging(soql);

        Self {
            method: "GET".to_string(),
            sobject: extract_sobject_from_soql(soql),
            operation: format!("query: {}", sanitized),
            record_id: None,
            field_count: None,
        }
    }
}

fn sanitize_soql_for_logging(soql: &str) -> String {
    // Replace string literals with placeholders
    let re = regex::Regex::new(r"'[^']*'").unwrap();
    re.replace_all(soql, "'<VALUE>'").to_string()
}

fn extract_sobject_from_soql(soql: &str) -> Option<String> {
    let upper = soql.to_uppercase();
    let from_idx = upper.find("FROM")?;
    let after_from = &soql[from_idx + 4..].trim_start();
    let end_idx = after_from.find(|c: char| c.is_whitespace()).unwrap_or(after_from.len());
    Some(after_from[..end_idx].to_string())
}
```

### 4.4 OAuth Token Security

```rust
// REFINEMENT: Secure token handling for OAuth flows
pub struct SecureTokenStorage {
    tokens: RwLock<HashMap<String, EncryptedToken>>,
    encryption_key: [u8; 32],
}

struct EncryptedToken {
    ciphertext: Vec<u8>,
    nonce: [u8; 12],
    expires_at: DateTime<Utc>,
}

impl SecureTokenStorage {
    pub fn new() -> Self {
        // Generate encryption key from secure random source
        let mut key = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut key);

        Self {
            tokens: RwLock::new(HashMap::new()),
            encryption_key: key,
        }
    }

    pub fn store(&self, org_id: &str, token: &AccessToken) -> Result<(), SecurityError> {
        let plaintext = serde_json::to_vec(token)?;

        // Generate random nonce
        let mut nonce = [0u8; 12];
        rand::rngs::OsRng.fill_bytes(&mut nonce);

        // Encrypt using AES-256-GCM
        let cipher = Aes256Gcm::new(GenericArray::from_slice(&self.encryption_key));
        let ciphertext = cipher.encrypt(GenericArray::from_slice(&nonce), plaintext.as_ref())
            .map_err(|_| SecurityError::EncryptionFailed)?;

        let encrypted = EncryptedToken {
            ciphertext,
            nonce,
            expires_at: token.expires_at,
        };

        self.tokens.write().unwrap().insert(org_id.to_string(), encrypted);
        Ok(())
    }

    pub fn retrieve(&self, org_id: &str) -> Result<Option<AccessToken>, SecurityError> {
        let tokens = self.tokens.read().unwrap();

        let encrypted = match tokens.get(org_id) {
            Some(t) => t,
            None => return Ok(None),
        };

        // Check expiration
        if Utc::now() >= encrypted.expires_at {
            return Ok(None);
        }

        // Decrypt
        let cipher = Aes256Gcm::new(GenericArray::from_slice(&self.encryption_key));
        let plaintext = cipher.decrypt(
            GenericArray::from_slice(&encrypted.nonce),
            encrypted.ciphertext.as_ref(),
        ).map_err(|_| SecurityError::DecryptionFailed)?;

        let token: AccessToken = serde_json::from_slice(&plaintext)?;
        Ok(Some(token))
    }
}

impl Drop for SecureTokenStorage {
    fn drop(&mut self) {
        self.encryption_key.zeroize();
    }
}
```

---

## 5. Edge Case Handling

### 5.1 Large Query Result Sets

```rust
// EDGE CASE: Handle query results exceeding memory limits
pub struct BoundedQueryExecutor {
    client: Arc<SalesforceClient>,
    max_records: u64,
    max_memory_bytes: usize,
}

impl BoundedQueryExecutor {
    pub async fn query_bounded(
        &self,
        soql: &str,
    ) -> Result<BoundedQueryResult, SfError> {
        let mut records = Vec::new();
        let mut total_size = 0usize;
        let mut truncated = false;

        let stream = self.client.query().query_all(soql);
        tokio::pin!(stream);

        while let Some(result) = stream.next().await {
            let record = result?;

            // Estimate record size
            let record_size = estimate_json_size(&record);

            if records.len() as u64 >= self.max_records {
                truncated = true;
                break;
            }

            if total_size + record_size > self.max_memory_bytes {
                truncated = true;
                break;
            }

            total_size += record_size;
            records.push(record);
        }

        Ok(BoundedQueryResult {
            records,
            truncated,
            total_size_bytes: total_size,
        })
    }
}

fn estimate_json_size(value: &JsonValue) -> usize {
    // Rough estimate based on serialization
    serde_json::to_vec(value).map(|v| v.len()).unwrap_or(1024)
}
```

### 5.2 Concurrent SObject Updates

```rust
// EDGE CASE: Handle optimistic locking for concurrent updates
impl SObjectService {
    pub async fn update_with_version_check(
        &self,
        sobject: &str,
        id: &str,
        record: JsonValue,
        expected_last_modified: DateTime<Utc>,
    ) -> Result<(), SfError> {
        // First, get current record to check version
        let current = self.get(sobject, id, Some(&["SystemModstamp"])).await?;

        let current_modified: DateTime<Utc> = current
            .get("SystemModstamp")
            .and_then(|v| v.as_str())
            .map(|s| DateTime::parse_from_rfc3339(s).ok())
            .flatten()
            .map(|dt| dt.with_timezone(&Utc))
            .ok_or(SfError::Api(ApiError::MissingField("SystemModstamp".to_string())))?;

        // Check if record was modified since we read it
        if current_modified != expected_last_modified {
            return Err(SfError::Conflict(ConflictError::ConcurrentModification {
                sobject: sobject.to_string(),
                id: id.to_string(),
                expected: expected_last_modified,
                actual: current_modified,
            }));
        }

        // Proceed with update
        self.update(sobject, id, record).await
    }

    /// Retry update with conflict resolution
    pub async fn update_with_retry<F>(
        &self,
        sobject: &str,
        id: &str,
        update_fn: F,
        max_retries: u32,
    ) -> Result<(), SfError>
    where
        F: Fn(&JsonValue) -> JsonValue,
    {
        for attempt in 0..max_retries {
            let current = self.get(sobject, id, None).await?;
            let updated = update_fn(&current);

            let last_modified = current
                .get("SystemModstamp")
                .and_then(|v| v.as_str())
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&Utc));

            match self.update_with_version_check(
                sobject,
                id,
                updated,
                last_modified.unwrap_or_else(Utc::now),
            ).await {
                Ok(()) => return Ok(()),
                Err(SfError::Conflict(_)) if attempt < max_retries - 1 => {
                    tracing::debug!(attempt, "Concurrent modification, retrying");
                    tokio::time::sleep(Duration::from_millis(50 * (attempt as u64 + 1))).await;
                }
                Err(e) => return Err(e),
            }
        }

        Err(SfError::Conflict(ConflictError::MaxRetriesExceeded {
            sobject: sobject.to_string(),
            id: id.to_string(),
            attempts: max_retries,
        }))
    }
}
```

### 5.3 Bulk API Size Limits

```rust
// EDGE CASE: Handle Bulk API size constraints
pub struct BulkSizeValidator {
    max_records_per_job: u64,      // 150 million
    max_file_size_bytes: u64,     // 150 MB
    max_field_size_bytes: usize,  // 131,072 bytes per field
}

impl BulkSizeValidator {
    pub fn validate_job(
        &self,
        estimated_records: u64,
        estimated_size: u64,
    ) -> Result<JobSplitStrategy, ValidationError> {
        if estimated_records > self.max_records_per_job {
            let num_jobs = (estimated_records / self.max_records_per_job) + 1;
            return Ok(JobSplitStrategy::SplitByRecords {
                records_per_job: self.max_records_per_job,
                total_jobs: num_jobs,
            });
        }

        if estimated_size > self.max_file_size_bytes {
            let num_files = (estimated_size / self.max_file_size_bytes) + 1;
            return Ok(JobSplitStrategy::SplitBySize {
                max_bytes: self.max_file_size_bytes,
                total_files: num_files,
            });
        }

        Ok(JobSplitStrategy::SingleJob)
    }

    pub fn validate_record(&self, record: &csv::StringRecord) -> Result<(), ValidationError> {
        for (i, field) in record.iter().enumerate() {
            if field.len() > self.max_field_size_bytes {
                return Err(ValidationError::FieldTooLarge {
                    field_index: i,
                    size: field.len(),
                    max: self.max_field_size_bytes,
                });
            }
        }
        Ok(())
    }
}

pub enum JobSplitStrategy {
    SingleJob,
    SplitByRecords { records_per_job: u64, total_jobs: u64 },
    SplitBySize { max_bytes: u64, total_files: u64 },
}
```

### 5.4 Event Replay ID Handling

```rust
// EDGE CASE: Handle replay ID expiration and invalid replay IDs
pub struct ReplayIdManager {
    client: Arc<PubSubClient>,
    storage: Box<dyn ReplayIdStorage>,
    retention_days: u32,
}

impl ReplayIdManager {
    pub async fn get_safe_replay_preset(
        &self,
        topic: &str,
    ) -> ReplayPreset {
        // Try to get stored replay ID
        let stored = self.storage.get(topic).await;

        match stored {
            Some(replay_id) if self.is_likely_valid(&replay_id) => {
                ReplayPreset::Custom(replay_id)
            }
            _ => {
                // Fall back to earliest available or latest
                tracing::info!(
                    topic,
                    "No valid replay ID, using LATEST"
                );
                ReplayPreset::Latest
            }
        }
    }

    fn is_likely_valid(&self, replay_id: &[u8]) -> bool {
        // Decode replay ID to check timestamp component
        // Salesforce replay IDs contain timestamp information
        if replay_id.len() < 8 {
            return false;
        }

        // Extract timestamp (implementation depends on replay ID format)
        let stored_time = extract_timestamp_from_replay_id(replay_id);

        if let Some(time) = stored_time {
            let age = Utc::now().signed_duration_since(time);
            // Events are retained for limited time (typically 72 hours)
            age.num_days() < self.retention_days as i64
        } else {
            false
        }
    }

    pub async fn handle_replay_failure(
        &self,
        topic: &str,
        error: &SfError,
    ) -> ReplayPreset {
        if matches!(error, SfError::Event(EventError::ReplayIdInvalid)) {
            // Clear stored replay ID and start fresh
            self.storage.delete(topic).await;
            tracing::warn!(topic, "Invalid replay ID, resetting to LATEST");
        }

        ReplayPreset::Latest
    }
}
```

---

## 6. Production Checklist

### 6.1 Pre-Production Validation

| Category | Check | Status |
|----------|-------|--------|
| **Performance** | Token refresh < 1s | |
| **Performance** | SOQL query < 2s for 2000 records | |
| **Performance** | Bulk job creation < 500ms | |
| **Performance** | Connection pool sized correctly | |
| **Security** | Credentials never logged | |
| **Security** | TLS 1.2+ enforced | |
| **Security** | SOQL injection prevention | |
| **Security** | Token encryption at rest | |
| **Reliability** | Retry policy configured | |
| **Reliability** | Circuit breaker thresholds set | |
| **Reliability** | Bulk job cleanup on failure | |
| **Reliability** | Event subscription recovery | |
| **Observability** | All operations traced | |
| **Observability** | Metrics emitted correctly | |
| **Observability** | Rate limit tracking | |
| **Testing** | Unit test coverage > 80% | |
| **Testing** | Integration tests pass | |
| **Testing** | Simulation tests pass | |

### 6.2 Configuration Template

```yaml
# production-config.yaml
salesforce:
  instance_url: "${SF_INSTANCE_URL}"
  api_version: "59.0"

  credentials:
    source: "shared-auth"
    type: "jwt_bearer"

  timeouts:
    connect_seconds: 30
    request_seconds: 30
    bulk_poll_seconds: 5
    event_keepalive_seconds: 60

  resilience:
    retry:
      max_attempts: 3
      base_delay_ms: 500
      max_delay_ms: 60000
    circuit_breaker:
      failure_threshold: 5
      success_threshold: 3
      reset_timeout_seconds: 60

  rate_limits:
    track_limits: true
    warn_threshold_percent: 80
    poll_interval_seconds: 300

  bulk:
    max_records_per_job: 10000000
    poll_interval_seconds: 5
    timeout_seconds: 3600

  events:
    pubsub_endpoint: "api.pubsub.salesforce.com:7443"
    replay_preset: "LATEST"
    max_reconnects: 10

  simulation:
    enabled: false
    recording_path: "./recordings/salesforce"
```

### 6.3 Monitoring Metrics

```rust
impl SalesforceClient {
    fn register_metrics(&self) {
        // Request metrics
        self.metrics.register_counter(
            "sf_requests_total",
            "Total Salesforce API requests",
            &["operation", "sobject", "status"],
        );

        self.metrics.register_histogram(
            "sf_request_duration_seconds",
            "Salesforce request latency",
            &["operation", "sobject"],
            vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0],
        );

        // Rate limit metrics
        self.metrics.register_gauge(
            "sf_rate_limit_remaining",
            "Remaining API calls",
            &["limit_type"],
        );

        self.metrics.register_gauge(
            "sf_rate_limit_percent_used",
            "Percentage of API limit used",
            &["limit_type"],
        );

        // Bulk metrics
        self.metrics.register_counter(
            "sf_bulk_records_total",
            "Bulk API records processed",
            &["operation", "status"],
        );

        self.metrics.register_histogram(
            "sf_bulk_job_duration_seconds",
            "Bulk job completion time",
            &["operation"],
            vec![1.0, 5.0, 30.0, 60.0, 300.0, 600.0, 1800.0],
        );

        // Event metrics
        self.metrics.register_counter(
            "sf_events_received_total",
            "Events received via Pub/Sub",
            &["topic"],
        );

        self.metrics.register_counter(
            "sf_events_published_total",
            "Platform Events published",
            &["event_type"],
        );

        // Error metrics
        self.metrics.register_counter(
            "sf_errors_total",
            "Salesforce errors by type",
            &["operation", "error_code", "retryable"],
        );

        // Auth metrics
        self.metrics.register_counter(
            "sf_token_refreshes_total",
            "Token refresh operations",
            &["result"],
        );
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-15 | SPARC Generator | Initial Refinement |

---

**Next Phase:** Completion - Implementation tasks, file manifests, test coverage requirements, and deployment procedures.
