# Refinement: Airtable API Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-14
**Status:** Draft
**Module:** `integrations/airtable-api`

---

## Table of Contents

1. [Interface Contracts](#1-interface-contracts)
2. [Type Definitions](#2-type-definitions)
3. [Validation Rules](#3-validation-rules)
4. [Security Hardening](#4-security-hardening)
5. [Performance Optimization](#5-performance-optimization)
6. [Testing Strategy](#6-testing-strategy)
7. [CI/CD Configuration](#7-cicd-configuration)

---

## 1. Interface Contracts

### 1.1 Core Client Trait

```rust
/// Primary interface for Airtable operations
#[async_trait]
pub trait AirtableOperations: Send + Sync {
    /// Get a base handle for operations
    fn base(&self, base_id: impl Into<String>) -> BaseHandle;

    /// List all accessible bases
    async fn list_bases(&self) -> Result<Vec<Base>, AirtableError>;

    /// Check API connectivity
    async fn health_check(&self) -> Result<HealthStatus, AirtableError>;

    /// Get current rate limit status for a base
    fn rate_limit_status(&self, base_id: &str) -> RateLimitStatus;
}
```

### 1.2 Record Operations Trait

```rust
/// CRUD operations for table records
#[async_trait]
pub trait RecordOperations: Send + Sync {
    /// Create a single record
    async fn create_record(
        &self,
        fields: HashMap<String, FieldValue>,
    ) -> Result<Record, AirtableError>;

    /// Retrieve a record by ID
    async fn get_record(&self, record_id: &str) -> Result<Record, AirtableError>;

    /// Update a record (partial update)
    async fn update_record(
        &self,
        record_id: &str,
        fields: HashMap<String, FieldValue>,
    ) -> Result<Record, AirtableError>;

    /// Replace a record (full replacement)
    async fn replace_record(
        &self,
        record_id: &str,
        fields: HashMap<String, FieldValue>,
    ) -> Result<Record, AirtableError>;

    /// Delete a record
    async fn delete_record(&self, record_id: &str) -> Result<DeletedRecord, AirtableError>;
}
```

### 1.3 Batch Operations Trait

```rust
/// Batch operations for multiple records (max 10 per request)
#[async_trait]
pub trait BatchOperations: Send + Sync {
    /// Create multiple records (max 10)
    async fn create_records(
        &self,
        records: Vec<HashMap<String, FieldValue>>,
    ) -> Result<Vec<Record>, AirtableError>;

    /// Create records with automatic chunking
    async fn create_records_chunked(
        &self,
        records: Vec<HashMap<String, FieldValue>>,
    ) -> Result<Vec<Record>, AirtableError>;

    /// Update multiple records (max 10)
    async fn update_records(
        &self,
        updates: Vec<RecordUpdate>,
    ) -> Result<Vec<Record>, AirtableError>;

    /// Delete multiple records (max 10)
    async fn delete_records(
        &self,
        record_ids: Vec<String>,
    ) -> Result<Vec<DeletedRecord>, AirtableError>;

    /// Upsert records based on merge fields
    async fn upsert_records(
        &self,
        request: UpsertRequest,
    ) -> Result<UpsertResult, AirtableError>;
}
```

### 1.4 List Operations Trait

```rust
/// Query and pagination operations
#[async_trait]
pub trait ListOperations: Send + Sync {
    /// Get a list builder for fluent query construction
    fn list(&self) -> ListRecordsBuilder;

    /// Fetch a single page of records
    async fn list_page(
        &self,
        request: ListRecordsRequest,
    ) -> Result<ListRecordsResponse, AirtableError>;

    /// Fetch all records with automatic pagination
    async fn list_all(
        &self,
        request: ListRecordsRequest,
    ) -> Result<Vec<Record>, AirtableError>;

    /// Stream records as async iterator
    fn list_stream(
        &self,
        request: ListRecordsRequest,
    ) -> BoxStream<'_, Result<Record, AirtableError>>;
}
```

### 1.5 Metadata Operations Trait

```rust
/// Schema and metadata operations
#[async_trait]
pub trait MetadataOperations: Send + Sync {
    /// Get base schema including all tables
    async fn get_schema(&self) -> Result<BaseSchema, AirtableError>;

    /// Get schema for a specific table
    async fn get_table_schema(&self, table_id: &str) -> Result<TableSchema, AirtableError>;

    /// List available views for a table
    async fn list_views(&self, table_id: &str) -> Result<Vec<ViewSchema>, AirtableError>;
}
```

### 1.6 Webhook Operations Trait

```rust
/// Webhook lifecycle management
#[async_trait]
pub trait WebhookOperations: Send + Sync {
    /// Create a new webhook
    async fn create_webhook(
        &self,
        request: CreateWebhookRequest,
    ) -> Result<Webhook, AirtableError>;

    /// List all webhooks for the base
    async fn list_webhooks(&self) -> Result<Vec<Webhook>, AirtableError>;

    /// Refresh webhook to extend expiration
    async fn refresh_webhook(&self, webhook_id: &str) -> Result<Webhook, AirtableError>;

    /// Delete a webhook
    async fn delete_webhook(&self, webhook_id: &str) -> Result<(), AirtableError>;

    /// Fetch changes since cursor
    async fn fetch_webhook_changes(
        &self,
        webhook_id: &str,
        cursor: u64,
    ) -> Result<WebhookChanges, AirtableError>;
}

/// Webhook payload processing
pub trait WebhookProcessor: Send + Sync {
    /// Register a webhook secret for verification
    fn register_secret(&mut self, webhook_id: &str, secret_base64: &str) -> Result<(), AirtableError>;

    /// Verify signature and parse webhook payload
    fn verify_and_parse(
        &self,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<WebhookPayload, AirtableError>;
}
```

### 1.7 Simulation Trait

```rust
/// Simulation layer for testing
pub trait SimulationOperations: Send + Sync {
    /// Start recording interactions
    fn start_recording(&self);

    /// Stop recording and return interactions
    fn stop_recording(&self) -> Vec<RecordedInteraction>;

    /// Load interactions for replay
    fn load_replay(&self, interactions: Vec<RecordedInteraction>);

    /// Save recordings to file
    fn save_to_file(&self, path: &Path) -> Result<(), AirtableError>;

    /// Load recordings from file
    fn load_from_file(&self, path: &Path) -> Result<(), AirtableError>;

    /// Reset replay index
    fn reset_replay(&self);
}
```

---

## 2. Type Definitions

### 2.1 Configuration Types

```rust
/// Client configuration
#[derive(Debug, Clone)]
pub struct AirtableConfig {
    pub base_url: Url,
    pub timeout: Duration,
    pub max_retries: u32,
    pub rate_limit_strategy: RateLimitStrategy,
    pub simulation_mode: SimulationMode,
}

impl Default for AirtableConfig {
    fn default() -> Self {
        Self {
            base_url: Url::parse("https://api.airtable.com/v0").unwrap(),
            timeout: Duration::from_secs(30),
            max_retries: 3,
            rate_limit_strategy: RateLimitStrategy::Blocking,
            simulation_mode: SimulationMode::Disabled,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RateLimitStrategy {
    /// Wait for rate limit slot
    Blocking,
    /// Queue requests for background processing
    Queued,
    /// Return error immediately
    FailFast,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimulationMode {
    Disabled,
    Record,
    Replay,
}
```

### 2.2 Record Types

```rust
/// Airtable record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Record {
    pub id: String,
    #[serde(rename = "createdTime")]
    pub created_time: DateTime<Utc>,
    pub fields: HashMap<String, FieldValue>,
}

/// Deleted record response
#[derive(Debug, Clone)]
pub struct DeletedRecord {
    pub id: String,
    pub deleted: bool,
}

/// Update request for batch operations
#[derive(Debug, Clone)]
pub struct RecordUpdate {
    pub id: String,
    pub fields: HashMap<String, FieldValue>,
}

/// Upsert request
#[derive(Debug, Clone)]
pub struct UpsertRequest {
    pub records: Vec<HashMap<String, FieldValue>>,
    pub merge_on_fields: Vec<String>,
}

/// Upsert result
#[derive(Debug, Clone)]
pub struct UpsertResult {
    pub records: Vec<Record>,
    pub created_records: Vec<String>,
    pub updated_records: Vec<String>,
}
```

### 2.3 Field Value Types

```rust
/// All supported Airtable field types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FieldValue {
    Null,
    Text(String),
    Number(f64),
    Checkbox(bool),
    Date(NaiveDate),
    DateTime(DateTime<Utc>),
    SingleSelect(String),
    MultiSelect(Vec<String>),
    User(UserRef),
    Attachments(Vec<Attachment>),
    LinkedRecords(Vec<String>),
    Lookup(Vec<Box<FieldValue>>),
    Formula(FormulaResult),
    Rollup(RollupResult),
    Currency(CurrencyValue),
    Percent(f64),
    Duration(i64),
    Rating(u8),
    Url(String),
    Email(String),
    Phone(String),
    Barcode(BarcodeValue),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRef {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub size: u64,
    #[serde(rename = "type")]
    pub mime_type: String,
    pub thumbnails: Option<Thumbnails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thumbnails {
    pub small: Option<ThumbnailInfo>,
    pub large: Option<ThumbnailInfo>,
    pub full: Option<ThumbnailInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailInfo {
    pub url: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrencyValue {
    pub value: f64,
    pub symbol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BarcodeValue {
    pub text: String,
    #[serde(rename = "type")]
    pub barcode_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FormulaResult {
    Text(String),
    Number(f64),
    Bool(bool),
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RollupResult {
    Number(f64),
    Array(Vec<FieldValue>),
}
```

### 2.4 Query Types

```rust
/// List records request
#[derive(Debug, Clone, Default)]
pub struct ListRecordsRequest {
    pub filter_by_formula: Option<String>,
    pub sort: Vec<SortField>,
    pub fields: Option<Vec<String>>,
    pub view: Option<String>,
    pub page_size: Option<u32>,
    pub offset: Option<String>,
    pub cell_format: CellFormat,
    pub time_zone: Option<String>,
    pub user_locale: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SortField {
    pub field: String,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum SortDirection {
    #[default]
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum CellFormat {
    #[default]
    Json,
    String,
}

/// List records response
#[derive(Debug, Clone)]
pub struct ListRecordsResponse {
    pub records: Vec<Record>,
    pub offset: Option<String>,
}
```

### 2.5 Webhook Types

```rust
/// Webhook definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Webhook {
    pub id: String,
    #[serde(rename = "macSecretBase64")]
    pub mac_secret_base64: String,
    #[serde(rename = "notificationUrl")]
    pub notification_url: Option<String>,
    #[serde(rename = "cursorForNextPayload")]
    pub cursor_for_next_payload: u64,
    #[serde(rename = "areNotificationsEnabled")]
    pub are_notifications_enabled: bool,
    #[serde(rename = "expirationTime")]
    pub expiration_time: DateTime<Utc>,
}

/// Create webhook request
#[derive(Debug, Clone)]
pub struct CreateWebhookRequest {
    pub notification_url: Option<String>,
    pub data_types: Vec<WebhookDataType>,
    pub record_change_scope: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WebhookDataType {
    TableData,
    TableFields,
    TableMetadata,
}

/// Webhook payload from Airtable
#[derive(Debug, Clone, Deserialize)]
pub struct WebhookPayload {
    pub base: WebhookBase,
    pub webhook: WebhookMeta,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WebhookBase {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WebhookMeta {
    pub id: String,
}

/// Fetched webhook changes
#[derive(Debug, Clone)]
pub struct WebhookChanges {
    pub payloads: Vec<ChangePayload>,
    pub cursor: u64,
    pub might_have_more: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChangePayload {
    pub table_id: String,
    pub changed_records: Vec<ChangedRecord>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChangedRecord {
    pub id: String,
    pub change_type: ChangeType,
    pub changed_fields: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeType {
    Created,
    Changed,
    Destroyed,
}
```

### 2.6 Error Types

```rust
/// Comprehensive error type
#[derive(Debug, thiserror::Error)]
pub enum AirtableError {
    // Configuration errors
    #[error("Missing credentials")]
    MissingCredentials,

    #[error("Invalid base URL: {0}")]
    InvalidBaseUrl(String),

    // Authentication errors
    #[error("Unauthorized: invalid or expired token")]
    Unauthorized,

    #[error("Insufficient permissions for scope: {scope}")]
    InsufficientScope { scope: String },

    // Rate limiting errors
    #[error("Rate limit exceeded, retry after {retry_after:?}")]
    RateLimitExceeded { retry_after: Duration },

    #[error("Rate limit exhausted after {attempts} attempts")]
    RateLimitExhausted { attempts: u32 },

    // Request errors
    #[error("Request timeout after {0:?}")]
    Timeout(Duration),

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    // Response errors
    #[error("Resource not found: {resource}")]
    NotFound { resource: String },

    #[error("Validation error: {message}")]
    ValidationError { message: String, field: Option<String> },

    #[error("Server error: HTTP {status}")]
    ServerError { status: u16 },

    // Batch errors
    #[error("Batch size exceeded: max {max}, got {actual}")]
    BatchSizeExceeded { max: usize, actual: usize },

    // Webhook errors
    #[error("Missing webhook signature header")]
    MissingSignature,

    #[error("Invalid webhook signature")]
    InvalidSignature,

    #[error("Unknown webhook ID: {0}")]
    UnknownWebhook(String),

    // Simulation errors
    #[error("Not in replay mode")]
    NotInReplayMode,

    #[error("Replay exhausted: no more recorded interactions")]
    ReplayExhausted,

    #[error("Replay mismatch: expected {expected:?}, got {actual:?}")]
    ReplayMismatch { expected: String, actual: String },

    // Generic errors
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}
```

---

## 3. Validation Rules

### 3.1 Input Validation

```rust
/// Validation functions for Airtable inputs
pub mod validation {
    use super::*;

    /// Validate base ID format (app followed by 14+ alphanumeric chars)
    pub fn validate_base_id(id: &str) -> Result<(), AirtableError> {
        if !id.starts_with("app") || id.len() < 17 {
            return Err(AirtableError::ValidationError {
                message: "Invalid base ID format".into(),
                field: Some("base_id".into()),
            });
        }
        Ok(())
    }

    /// Validate table ID format (tbl followed by 14+ alphanumeric chars)
    pub fn validate_table_id(id: &str) -> Result<(), AirtableError> {
        if !id.starts_with("tbl") || id.len() < 17 {
            return Err(AirtableError::ValidationError {
                message: "Invalid table ID format".into(),
                field: Some("table_id".into()),
            });
        }
        Ok(())
    }

    /// Validate record ID format (rec followed by 14+ alphanumeric chars)
    pub fn validate_record_id(id: &str) -> Result<(), AirtableError> {
        if !id.starts_with("rec") || id.len() < 17 {
            return Err(AirtableError::ValidationError {
                message: "Invalid record ID format".into(),
                field: Some("record_id".into()),
            });
        }
        Ok(())
    }

    /// Validate batch size (max 10 records)
    pub fn validate_batch_size(count: usize) -> Result<(), AirtableError> {
        const MAX_BATCH_SIZE: usize = 10;
        if count > MAX_BATCH_SIZE {
            return Err(AirtableError::BatchSizeExceeded {
                max: MAX_BATCH_SIZE,
                actual: count,
            });
        }
        Ok(())
    }

    /// Validate page size (1-100)
    pub fn validate_page_size(size: u32) -> u32 {
        size.clamp(1, 100)
    }

    /// Validate formula syntax (basic check)
    pub fn validate_formula(formula: &str) -> Result<(), AirtableError> {
        // Check for balanced parentheses and quotes
        let mut paren_count = 0i32;
        let mut in_string = false;
        let mut escape_next = false;

        for c in formula.chars() {
            if escape_next {
                escape_next = false;
                continue;
            }
            match c {
                '\\' => escape_next = true,
                '"' => in_string = !in_string,
                '(' if !in_string => paren_count += 1,
                ')' if !in_string => paren_count -= 1,
                _ => {}
            }
            if paren_count < 0 {
                return Err(AirtableError::ValidationError {
                    message: "Unbalanced parentheses in formula".into(),
                    field: Some("filterByFormula".into()),
                });
            }
        }

        if paren_count != 0 || in_string {
            return Err(AirtableError::ValidationError {
                message: "Malformed formula".into(),
                field: Some("filterByFormula".into()),
            });
        }

        Ok(())
    }

    /// Validate field name (not empty, reasonable length)
    pub fn validate_field_name(name: &str) -> Result<(), AirtableError> {
        if name.is_empty() || name.len() > 255 {
            return Err(AirtableError::ValidationError {
                message: "Field name must be 1-255 characters".into(),
                field: Some("field_name".into()),
            });
        }
        Ok(())
    }
}
```

### 3.2 Request Payload Validation

```rust
/// Request builder with validation
impl ListRecordsBuilder {
    pub fn build(&self) -> Result<ListRecordsRequest, AirtableError> {
        // Validate formula if present
        if let Some(formula) = &self.filter_by_formula {
            validation::validate_formula(formula)?;
        }

        // Validate and clamp page size
        let page_size = validation::validate_page_size(self.page_size);

        // Validate sort fields
        for sort in &self.sort {
            validation::validate_field_name(&sort.field)?;
        }

        // Validate selected fields
        if let Some(fields) = &self.fields {
            for field in fields {
                validation::validate_field_name(field)?;
            }
        }

        Ok(ListRecordsRequest {
            filter_by_formula: self.filter_by_formula.clone(),
            sort: self.sort.clone(),
            fields: self.fields.clone(),
            view: self.view.clone(),
            page_size: Some(page_size),
            offset: self.offset.clone(),
            cell_format: self.cell_format,
            time_zone: self.time_zone.clone(),
            user_locale: self.user_locale.clone(),
        })
    }
}
```

---

## 4. Security Hardening

### 4.1 Credential Management

```rust
/// Secure token provider trait
pub trait TokenProvider: Send + Sync {
    /// Get the current token (may refresh if needed)
    fn get_token(&self) -> impl Future<Output = Result<SecretString, AirtableError>> + Send;

    /// Check if token needs refresh
    fn needs_refresh(&self) -> bool;
}

/// Static token provider (for PAT)
pub struct StaticTokenProvider {
    token: SecretString,
}

impl StaticTokenProvider {
    pub fn new(token: SecretString) -> Self {
        Self { token }
    }
}

impl TokenProvider for StaticTokenProvider {
    async fn get_token(&self) -> Result<SecretString, AirtableError> {
        Ok(self.token.clone())
    }

    fn needs_refresh(&self) -> bool {
        false
    }
}

/// OAuth token provider with refresh
pub struct OAuthTokenProvider {
    access_token: RwLock<SecretString>,
    refresh_token: SecretString,
    expires_at: RwLock<DateTime<Utc>>,
    client_id: String,
    client_secret: SecretString,
}

impl TokenProvider for OAuthTokenProvider {
    async fn get_token(&self) -> Result<SecretString, AirtableError> {
        if self.needs_refresh() {
            self.refresh().await?;
        }
        Ok(self.access_token.read().await.clone())
    }

    fn needs_refresh(&self) -> bool {
        // Refresh 5 minutes before expiry
        *self.expires_at.blocking_read() < Utc::now() + Duration::from_secs(300)
    }
}
```

### 4.2 Webhook Signature Verification

```rust
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

impl WebhookProcessor {
    /// Verify webhook signature using constant-time comparison
    pub fn verify_signature(
        &self,
        webhook_id: &str,
        body: &[u8],
        signature_header: &str,
    ) -> Result<(), AirtableError> {
        // Parse header: "hmac-sha256=<base64>"
        let parts: Vec<&str> = signature_header.splitn(2, '=').collect();
        if parts.len() != 2 || parts[0] != "hmac-sha256" {
            return Err(AirtableError::InvalidSignature);
        }

        let provided_sig = base64::decode(parts[1])
            .map_err(|_| AirtableError::InvalidSignature)?;

        let secret = self.secrets.get(webhook_id)
            .ok_or_else(|| AirtableError::UnknownWebhook(webhook_id.to_string()))?;

        let mut mac = HmacSha256::new_from_slice(secret.as_ref())
            .map_err(|_| AirtableError::InvalidSignature)?;
        mac.update(body);
        let expected_sig = mac.finalize().into_bytes();

        // Constant-time comparison to prevent timing attacks
        if expected_sig.ct_eq(&provided_sig).into() {
            Ok(())
        } else {
            Err(AirtableError::InvalidSignature)
        }
    }
}
```

### 4.3 Log Sanitization

```rust
/// Sanitize sensitive data from logs
pub mod sanitize {
    use std::collections::HashMap;

    /// Fields that should be redacted in logs
    const SENSITIVE_FIELDS: &[&str] = &[
        "password", "secret", "token", "api_key", "apiKey",
        "ssn", "social_security", "credit_card", "card_number",
    ];

    /// Redact sensitive field values
    pub fn redact_fields(fields: &HashMap<String, serde_json::Value>) -> HashMap<String, serde_json::Value> {
        fields.iter().map(|(k, v)| {
            let key_lower = k.to_lowercase();
            if SENSITIVE_FIELDS.iter().any(|s| key_lower.contains(s)) {
                (k.clone(), serde_json::Value::String("[REDACTED]".into()))
            } else {
                (k.clone(), v.clone())
            }
        }).collect()
    }

    /// Redact record for logging
    pub fn redact_record(record: &Record) -> serde_json::Value {
        serde_json::json!({
            "id": record.id,
            "created_time": record.created_time,
            "fields": redact_fields(&record.fields.iter().map(|(k, v)| {
                (k.clone(), serde_json::to_value(v).unwrap_or_default())
            }).collect())
        })
    }
}
```

### 4.4 TLS Configuration

```rust
/// Build HTTP client with secure TLS settings
pub fn build_secure_client(config: &AirtableConfig) -> Result<reqwest::Client, AirtableError> {
    reqwest::Client::builder()
        .timeout(config.timeout)
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .https_only(true)
        .use_rustls_tls()
        .build()
        .map_err(|e| AirtableError::ConnectionFailed(e.to_string()))
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling

```rust
/// HTTP client with connection pooling
impl AirtableClient {
    pub fn builder() -> AirtableClientBuilder {
        AirtableClientBuilder::default()
    }
}

impl AirtableClientBuilder {
    /// Configure connection pool size
    pub fn pool_max_idle_per_host(mut self, max: usize) -> Self {
        self.pool_max_idle = max;
        self
    }

    /// Configure idle timeout
    pub fn pool_idle_timeout(mut self, timeout: Duration) -> Self {
        self.pool_idle_timeout = timeout;
        self
    }

    pub fn build(self) -> Result<AirtableClient, AirtableError> {
        let http = reqwest::Client::builder()
            .timeout(self.config.timeout)
            .pool_max_idle_per_host(self.pool_max_idle.unwrap_or(10))
            .pool_idle_timeout(self.pool_idle_timeout.unwrap_or(Duration::from_secs(90)))
            .min_tls_version(reqwest::tls::Version::TLS_1_2)
            .https_only(true)
            .build()?;

        Ok(AirtableClient {
            http: Arc::new(http),
            config: Arc::new(self.config),
            credentials: self.token_provider.ok_or(AirtableError::MissingCredentials)?,
            rate_limiter: Arc::new(RateLimiter::new()),
            simulation: Arc::new(SimulationLayer::new(self.config.simulation_mode)),
            metrics: Arc::new(MetricsCollector::new()),
        })
    }
}
```

### 5.2 Efficient Pagination

```rust
/// Memory-efficient record stream
impl RecordStream {
    /// Process records in batches without loading all into memory
    pub async fn for_each_batch<F, Fut>(
        mut self,
        batch_size: usize,
        mut f: F,
    ) -> Result<(), AirtableError>
    where
        F: FnMut(Vec<Record>) -> Fut,
        Fut: Future<Output = Result<(), AirtableError>>,
    {
        let mut batch = Vec::with_capacity(batch_size);

        while let Some(result) = self.next().await {
            batch.push(result?);

            if batch.len() >= batch_size {
                f(std::mem::take(&mut batch)).await?;
                batch = Vec::with_capacity(batch_size);
            }
        }

        if !batch.is_empty() {
            f(batch).await?;
        }

        Ok(())
    }
}
```

### 5.3 Request Coalescing

```rust
/// Coalesce multiple single requests into batches
pub struct RequestCoalescer {
    pending: Mutex<Vec<PendingRequest>>,
    flush_interval: Duration,
    max_batch_size: usize,
}

impl RequestCoalescer {
    pub fn new(flush_interval: Duration) -> Self {
        Self {
            pending: Mutex::new(Vec::new()),
            flush_interval,
            max_batch_size: 10,
        }
    }

    /// Queue a create request for batching
    pub async fn queue_create(
        &self,
        fields: HashMap<String, FieldValue>,
    ) -> oneshot::Receiver<Result<Record, AirtableError>> {
        let (tx, rx) = oneshot::channel();

        let mut pending = self.pending.lock().await;
        pending.push(PendingRequest::Create { fields, response: tx });

        if pending.len() >= self.max_batch_size {
            self.flush_creates().await;
        }

        rx
    }

    /// Flush pending creates as batch
    async fn flush_creates(&self) {
        let mut pending = self.pending.lock().await;
        let requests: Vec<_> = pending.drain(..).collect();
        drop(pending);

        // Execute batch and distribute responses
        // ...
    }
}
```

### 5.4 Caching Strategy

```rust
/// Schema cache with TTL
pub struct SchemaCache {
    cache: DashMap<String, CachedSchema>,
    ttl: Duration,
}

struct CachedSchema {
    schema: BaseSchema,
    cached_at: Instant,
}

impl SchemaCache {
    pub fn new(ttl: Duration) -> Self {
        Self {
            cache: DashMap::new(),
            ttl,
        }
    }

    pub fn get(&self, base_id: &str) -> Option<BaseSchema> {
        self.cache.get(base_id).and_then(|entry| {
            if entry.cached_at.elapsed() < self.ttl {
                Some(entry.schema.clone())
            } else {
                None
            }
        })
    }

    pub fn set(&self, base_id: String, schema: BaseSchema) {
        self.cache.insert(base_id, CachedSchema {
            schema,
            cached_at: Instant::now(),
        });
    }

    pub fn invalidate(&self, base_id: &str) {
        self.cache.remove(base_id);
    }
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    mod validation {
        use super::*;

        #[test]
        fn test_valid_base_id() {
            assert!(validation::validate_base_id("appABCDEFGHIJKLMNO").is_ok());
        }

        #[test]
        fn test_invalid_base_id() {
            assert!(validation::validate_base_id("invalid").is_err());
            assert!(validation::validate_base_id("tblABCDEFGHIJKLMNO").is_err());
        }

        #[test]
        fn test_batch_size_validation() {
            assert!(validation::validate_batch_size(10).is_ok());
            assert!(validation::validate_batch_size(11).is_err());
        }

        #[test]
        fn test_formula_validation() {
            assert!(validation::validate_formula("{Status} = 'Active'").is_ok());
            assert!(validation::validate_formula("AND({A}, {B})").is_ok());
            assert!(validation::validate_formula("((unclosed").is_err());
        }
    }

    mod field_serialization {
        use super::*;

        #[test]
        fn test_text_field() {
            let value = FieldValue::Text("hello".into());
            let json = serde_json::to_value(&value).unwrap();
            assert_eq!(json, serde_json::json!("hello"));
        }

        #[test]
        fn test_multi_select() {
            let value = FieldValue::MultiSelect(vec!["A".into(), "B".into()]);
            let json = serde_json::to_value(&value).unwrap();
            assert_eq!(json, serde_json::json!(["A", "B"]));
        }
    }

    mod webhook_verification {
        use super::*;

        #[test]
        fn test_valid_signature() {
            let mut processor = WebhookProcessorImpl::new();
            let secret = base64::encode("test_secret");
            processor.register_secret("webhook_1", &secret).unwrap();

            let body = br#"{"test": "data"}"#;
            let mut mac = HmacSha256::new_from_slice(b"test_secret").unwrap();
            mac.update(body);
            let sig = base64::encode(mac.finalize().into_bytes());

            let header = format!("hmac-sha256={}", sig);
            assert!(processor.verify_signature("webhook_1", body, &header).is_ok());
        }

        #[test]
        fn test_invalid_signature() {
            let mut processor = WebhookProcessorImpl::new();
            processor.register_secret("webhook_1", &base64::encode("secret")).unwrap();

            let result = processor.verify_signature(
                "webhook_1",
                b"body",
                "hmac-sha256=invalid",
            );
            assert!(matches!(result, Err(AirtableError::InvalidSignature)));
        }
    }
}
```

### 6.2 Integration Tests

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;

    async fn create_test_client() -> AirtableClient {
        AirtableClient::builder()
            .with_token(SecretString::new(
                std::env::var("AIRTABLE_TEST_TOKEN").unwrap()
            ))
            .with_simulation_mode(SimulationMode::Record)
            .build()
            .unwrap()
    }

    #[tokio::test]
    #[ignore] // Run with: cargo test --ignored
    async fn test_create_and_retrieve_record() {
        let client = create_test_client().await;
        let table = client.base("appTestBase").table("tblTestTable");

        // Create
        let fields = HashMap::from([
            ("Name".into(), FieldValue::Text("Test Record".into())),
            ("Status".into(), FieldValue::SingleSelect("Active".into())),
        ]);
        let created = table.create_record(fields).await.unwrap();
        assert!(created.id.starts_with("rec"));

        // Retrieve
        let retrieved = table.get_record(&created.id).await.unwrap();
        assert_eq!(retrieved.id, created.id);

        // Cleanup
        table.delete_record(&created.id).await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn test_pagination() {
        let client = create_test_client().await;
        let table = client.base("appTestBase").table("tblTestTable");

        let records: Vec<_> = table
            .list()
            .page_size(10)
            .stream()
            .take(25)
            .collect()
            .await;

        assert!(records.len() <= 25);
    }
}
```

### 6.3 Simulation Tests

```rust
#[cfg(test)]
mod simulation_tests {
    use super::*;

    #[tokio::test]
    async fn test_record_replay() {
        // Load recorded interactions
        let client = AirtableClient::builder()
            .with_token(SecretString::new("fake_token".into()))
            .with_simulation_mode(SimulationMode::Replay)
            .build()
            .unwrap();

        client.simulation().load_from_file(
            Path::new("tests/fixtures/create_record.json")
        ).unwrap();

        let table = client.base("appTest").table("tblTest");

        let fields = HashMap::from([
            ("Name".into(), FieldValue::Text("Test".into())),
        ]);

        let result = table.create_record(fields).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_webhook_simulation() {
        let simulator = WebhookSimulator::new();

        simulator.simulate_record_created(
            "appTest",
            "tblTest",
            &Record {
                id: "recTest123456789".into(),
                created_time: Utc::now(),
                fields: HashMap::new(),
            },
        ).await;

        let events = simulator.drain_events().await;
        assert_eq!(events.len(), 1);
    }
}
```

### 6.4 Property-Based Tests

```rust
#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn test_field_roundtrip(s in "\\PC*") {
            let value = FieldValue::Text(s.clone());
            let json = serde_json::to_value(&value).unwrap();
            let back: FieldValue = serde_json::from_value(json).unwrap();
            if let FieldValue::Text(t) = back {
                prop_assert_eq!(t, s);
            } else {
                prop_assert!(false, "Expected Text variant");
            }
        }

        #[test]
        fn test_page_size_clamping(size in 0u32..1000) {
            let clamped = validation::validate_page_size(size);
            prop_assert!(clamped >= 1 && clamped <= 100);
        }
    }
}
```

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions Workflow

```yaml
name: Airtable Integration CI

on:
  push:
    branches: [main]
    paths:
      - 'integrations/airtable-api/**'
  pull_request:
    paths:
      - 'integrations/airtable-api/**'

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: -Dwarnings

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable
        with:
          components: clippy, rustfmt

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/airtable-api

      - name: Format check
        run: cargo fmt --check
        working-directory: integrations/airtable-api

      - name: Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings
        working-directory: integrations/airtable-api

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2

      - name: Unit tests
        run: cargo test --lib
        working-directory: integrations/airtable-api

      - name: Doc tests
        run: cargo test --doc
        working-directory: integrations/airtable-api

  integration-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Integration tests (simulation)
        run: cargo test --test integration -- --ignored
        working-directory: integrations/airtable-api
        env:
          AIRTABLE_SIMULATION_MODE: replay

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Security audit
        uses: rustsec/audit-check@v1
        with:
          working-directory: integrations/airtable-api

  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable
        with:
          components: llvm-tools-preview

      - name: Install cargo-llvm-cov
        uses: taiki-e/install-action@cargo-llvm-cov

      - name: Generate coverage
        run: cargo llvm-cov --lcov --output-path lcov.info
        working-directory: integrations/airtable-api

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/airtable-api/lcov.info
          fail_ci_if_error: true
```

### 7.2 Cargo Configuration

```toml
# integrations/airtable-api/Cargo.toml
[package]
name = "airtable-integration"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"

[features]
default = []
simulation = []
full = ["simulation"]

[dependencies]
async-trait = "0.1"
base64 = "0.21"
chrono = { version = "0.4", features = ["serde"] }
dashmap = "5.5"
futures = "0.3"
hmac = "0.12"
reqwest = { version = "0.11", features = ["json", "rustls-tls"], default-features = false }
secrecy = "0.8"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
sha2 = "0.10"
subtle = "2.5"
thiserror = "1.0"
tokio = { version = "1.35", features = ["rt-multi-thread", "macros", "sync", "time"] }
tracing = "0.1"
url = "2.5"

[dev-dependencies]
proptest = "1.4"
tokio-test = "0.4"
wiremock = "0.5"

[lints.rust]
unsafe_code = "forbid"

[lints.clippy]
all = "warn"
pedantic = "warn"
nursery = "warn"
```

### 7.3 Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: cargo-fmt
        name: cargo fmt
        entry: cargo fmt --manifest-path integrations/airtable-api/Cargo.toml --
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-clippy
        name: cargo clippy
        entry: cargo clippy --manifest-path integrations/airtable-api/Cargo.toml -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-test
        name: cargo test
        entry: cargo test --manifest-path integrations/airtable-api/Cargo.toml --lib
        language: system
        types: [rust]
        pass_filenames: false
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AIRTABLE-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-14 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*Proceed to Completion phase upon approval.*
