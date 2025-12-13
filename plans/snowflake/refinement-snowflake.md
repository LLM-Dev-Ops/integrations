# Refinement: Snowflake Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/snowflake`

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
/// Primary interface for Snowflake operations
#[async_trait]
pub trait SnowflakeOperations: Send + Sync {
    /// Execute a synchronous query
    async fn execute(&self, query: QueryRequest) -> Result<QueryResult, SnowflakeError>;

    /// Execute an asynchronous query, returning a handle for polling
    async fn execute_async(&self, query: QueryRequest) -> Result<AsyncQueryHandle, SnowflakeError>;

    /// Execute query and return streaming results
    async fn execute_stream(&self, query: QueryRequest) -> Result<ResultStream, SnowflakeError>;

    /// Execute multiple statements in a single request
    async fn execute_multi(&self, statements: Vec<&str>) -> Result<Vec<QueryResult>, SnowflakeError>;

    /// Cancel a running query
    async fn cancel_query(&self, query_id: &str) -> Result<(), SnowflakeError>;

    /// Get status of a query
    async fn get_query_status(&self, query_id: &str) -> Result<QueryStatus, SnowflakeError>;

    /// Health check
    async fn health_check(&self) -> Result<HealthStatus, SnowflakeError>;
}
```

### 1.2 Data Ingestion Trait

```rust
/// Interface for data ingestion operations
#[async_trait]
pub trait DataIngestion: Send + Sync {
    /// Upload a file to a stage
    async fn put_file(
        &self,
        local_path: &Path,
        stage: &str,
        options: PutOptions,
    ) -> Result<PutResult, SnowflakeError>;

    /// List files in a stage
    async fn list_stage(
        &self,
        stage: &str,
        pattern: Option<&str>,
    ) -> Result<Vec<StageFile>, SnowflakeError>;

    /// Remove a file from a stage
    async fn remove_stage_file(
        &self,
        stage: &str,
        file_path: &str,
    ) -> Result<(), SnowflakeError>;

    /// Execute COPY INTO operation
    async fn copy_into(&self, request: CopyIntoRequest) -> Result<CopyResult, SnowflakeError>;

    /// Bulk insert records via staging
    async fn bulk_insert<T: Serialize + Send + Sync>(
        &self,
        table: &str,
        records: &[T],
        options: BulkInsertOptions,
    ) -> Result<u64, SnowflakeError>;
}
```

### 1.3 Warehouse Management Trait

```rust
/// Interface for warehouse operations
#[async_trait]
pub trait WarehouseManagement: Send + Sync {
    /// Get warehouse status
    async fn get_warehouse_status(&self, warehouse: &str) -> Result<WarehouseInfo, SnowflakeError>;

    /// List all accessible warehouses
    async fn list_warehouses(&self) -> Result<Vec<WarehouseInfo>, SnowflakeError>;

    /// Get current active warehouse
    async fn get_current_warehouse(&self) -> Result<Option<String>, SnowflakeError>;

    /// Switch to a different warehouse
    async fn use_warehouse(&self, warehouse: &str) -> Result<(), SnowflakeError>;
}

/// Interface for warehouse routing
#[async_trait]
pub trait WarehouseRouting: Send + Sync {
    /// Select optimal warehouse for workload
    async fn select_warehouse(
        &self,
        workload: WorkloadType,
        size_hint: Option<WarehouseSize>,
    ) -> Result<String, SnowflakeError>;

    /// Get current warehouse statuses
    async fn get_warehouse_statuses(&self) -> Result<HashMap<String, WarehouseInfo>, SnowflakeError>;

    /// Refresh status cache
    async fn refresh_status_cache(&self) -> Result<(), SnowflakeError>;
}
```

### 1.4 Cost Monitoring Trait

```rust
/// Interface for cost monitoring operations
#[async_trait]
pub trait CostMonitoring: Send + Sync {
    /// Get credit usage for a time period
    async fn get_credit_usage(
        &self,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        warehouse: Option<&str>,
    ) -> Result<Vec<CreditUsage>, SnowflakeError>;

    /// Get cost details for a specific query
    async fn get_query_cost(&self, query_id: &str) -> Result<QueryCost, SnowflakeError>;

    /// Estimate cost before running a query
    async fn estimate_query_cost(
        &self,
        sql: &str,
        warehouse: &str,
    ) -> Result<CostEstimate, SnowflakeError>;
}
```

### 1.5 Metadata Trait

```rust
/// Interface for metadata operations
#[async_trait]
pub trait MetadataOperations: Send + Sync {
    /// List databases
    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, SnowflakeError>;

    /// List schemas in a database
    async fn list_schemas(&self, database: &str) -> Result<Vec<SchemaInfo>, SnowflakeError>;

    /// List tables in a schema
    async fn list_tables(
        &self,
        database: &str,
        schema: &str,
    ) -> Result<Vec<TableInfo>, SnowflakeError>;

    /// Describe table columns
    async fn describe_table(&self, table: &str) -> Result<Vec<ColumnMetadata>, SnowflakeError>;

    /// Get table statistics
    async fn get_table_stats(&self, table: &str) -> Result<TableStats, SnowflakeError>;

    /// Get query history
    async fn get_query_history(
        &self,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        options: QueryHistoryOptions,
    ) -> Result<Vec<QueryHistoryEntry>, SnowflakeError>;
}
```

### 1.6 Async Query Handle

```rust
/// Handle for managing asynchronous queries
#[async_trait]
pub trait AsyncQueryOps: Send + Sync {
    /// Poll for current status
    async fn poll(&self) -> Result<QueryStatus, SnowflakeError>;

    /// Wait for query completion
    async fn wait(&self) -> Result<QueryResult, SnowflakeError>;

    /// Wait with timeout
    async fn wait_with_timeout(&self, timeout: Duration) -> Result<QueryResult, SnowflakeError>;

    /// Cancel the query
    async fn cancel(&self) -> Result<(), SnowflakeError>;

    /// Get query ID
    fn query_id(&self) -> &str;
}
```

---

## 2. Type Definitions

### 2.1 Configuration Types

```rust
/// Snowflake client configuration
#[derive(Debug, Clone, Deserialize)]
pub struct SnowflakeConfig {
    /// Account identifier (org-account format)
    pub account: String,

    /// Username
    pub user: String,

    /// Authentication configuration
    pub auth: AuthConfig,

    /// Default database
    pub database: Option<String>,

    /// Default schema
    pub schema: Option<String>,

    /// Default warehouse
    pub warehouse: Option<String>,

    /// Default role
    pub role: Option<String>,

    /// Session parameters
    #[serde(default)]
    pub session_params: HashMap<String, String>,

    /// Connection timeout
    #[serde(default = "default_connect_timeout")]
    #[serde(with = "humantime_serde")]
    pub connect_timeout: Duration,

    /// Query timeout
    #[serde(default = "default_query_timeout")]
    #[serde(with = "humantime_serde")]
    pub query_timeout: Duration,

    /// Connection pool settings
    #[serde(default)]
    pub pool: PoolConfig,

    /// Simulation mode
    #[serde(default)]
    pub simulation_mode: SimulationMode,

    /// HTTP proxy
    pub proxy: Option<String>,
}

fn default_connect_timeout() -> Duration { Duration::from_secs(30) }
fn default_query_timeout() -> Duration { Duration::from_secs(300) }

/// Authentication configuration
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthConfig {
    Password {
        password: SecretString,
    },
    KeyPair {
        private_key_path: PathBuf,
        #[serde(default)]
        passphrase: Option<SecretString>,
    },
    KeyPairPem {
        private_key_pem: SecretString,
        #[serde(default)]
        passphrase: Option<SecretString>,
    },
    OAuth {
        token: SecretString,
        refresh_token: Option<SecretString>,
        token_endpoint: Option<String>,
    },
    ExternalBrowser,
    Okta {
        okta_url: String,
    },
}

/// Connection pool configuration
#[derive(Debug, Clone, Deserialize)]
pub struct PoolConfig {
    #[serde(default = "default_min_connections")]
    pub min_connections: u32,

    #[serde(default = "default_max_connections")]
    pub max_connections: u32,

    #[serde(default = "default_idle_timeout")]
    #[serde(with = "humantime_serde")]
    pub idle_timeout: Duration,

    #[serde(default = "default_max_lifetime")]
    #[serde(with = "humantime_serde")]
    pub max_lifetime: Duration,

    #[serde(default = "default_acquire_timeout")]
    #[serde(with = "humantime_serde")]
    pub acquire_timeout: Duration,
}

fn default_min_connections() -> u32 { 2 }
fn default_max_connections() -> u32 { 10 }
fn default_idle_timeout() -> Duration { Duration::from_secs(1800) }
fn default_max_lifetime() -> Duration { Duration::from_secs(14400) }
fn default_acquire_timeout() -> Duration { Duration::from_secs(30) }

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            min_connections: default_min_connections(),
            max_connections: default_max_connections(),
            idle_timeout: default_idle_timeout(),
            max_lifetime: default_max_lifetime(),
            acquire_timeout: default_acquire_timeout(),
        }
    }
}
```

### 2.2 Query Types

```rust
/// Query request
#[derive(Debug, Clone)]
pub struct QueryRequest {
    pub sql: String,
    pub params: Vec<QueryParam>,
    pub warehouse: Option<String>,
    pub timeout: Option<Duration>,
    pub tag: Option<String>,
    pub async_exec: bool,
    pub context: Option<QueryContext>,
}

impl QueryRequest {
    pub fn new(sql: impl Into<String>) -> Self {
        Self {
            sql: sql.into(),
            params: Vec::new(),
            warehouse: None,
            timeout: None,
            tag: None,
            async_exec: false,
            context: None,
        }
    }
}

/// Query context override
#[derive(Debug, Clone)]
pub struct QueryContext {
    pub database: Option<String>,
    pub schema: Option<String>,
    pub role: Option<String>,
}

/// Query parameter types
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum QueryParam {
    Null,
    Boolean(bool),
    Integer(i64),
    Float(f64),
    String(String),
    Binary(Vec<u8>),
    Date(NaiveDate),
    Time(NaiveTime),
    Timestamp(DateTime<Utc>),
    Array(Vec<QueryParam>),
    Object(HashMap<String, QueryParam>),
    Named { name: String, value: Box<QueryParam> },
}

/// Query result
#[derive(Debug, Clone)]
pub struct QueryResult {
    pub query_id: String,
    pub status: QueryStatus,
    pub columns: Vec<ColumnMetadata>,
    pub rows: Vec<Row>,
    pub stats: QueryStats,
    pub warehouse: String,
    pub next_result_id: Option<String>,
}

/// Query execution status
#[derive(Debug, Clone, PartialEq)]
pub enum QueryStatus {
    Queued,
    Running,
    Success,
    Failed { error: String, code: Option<String> },
    Cancelled,
}

/// Query statistics
#[derive(Debug, Clone, Default)]
pub struct QueryStats {
    pub rows_produced: u64,
    pub bytes_scanned: u64,
    pub execution_time_ms: u64,
    pub compilation_time_ms: u64,
    pub queued_time_ms: u64,
    pub partitions_scanned: u64,
    pub partitions_total: u64,
}
```

### 2.3 Ingestion Types

```rust
/// PUT file options
#[derive(Debug, Clone, Default)]
pub struct PutOptions {
    pub auto_compress: bool,
    pub overwrite: bool,
    pub parallel: u8,
}

/// PUT result
#[derive(Debug, Clone)]
pub struct PutResult {
    pub source: String,
    pub target: String,
    pub size: u64,
    pub status: PutStatus,
}

#[derive(Debug, Clone)]
pub enum PutStatus {
    Uploaded,
    Skipped,
    Failed { error: String },
}

/// COPY INTO request
#[derive(Debug, Clone)]
pub struct CopyIntoRequest {
    pub target_table: String,
    pub stage: String,
    pub file_pattern: Option<String>,
    pub file_format: FileFormat,
    pub copy_options: CopyOptions,
    pub transform: Option<String>,
}

/// File format specification
#[derive(Debug, Clone)]
pub struct FileFormat {
    pub format_type: FormatType,
    pub compression: Option<Compression>,
    pub field_delimiter: Option<char>,
    pub record_delimiter: Option<String>,
    pub skip_header: u32,
    pub null_if: Vec<String>,
    pub date_format: Option<String>,
    pub timestamp_format: Option<String>,
    pub trim_space: bool,
    pub error_on_column_count_mismatch: bool,
}

#[derive(Debug, Clone, Copy)]
pub enum FormatType {
    Csv,
    Json,
    Parquet,
    Avro,
    Orc,
    Xml,
}

#[derive(Debug, Clone, Copy)]
pub enum Compression {
    Auto,
    Gzip,
    Bz2,
    Brotli,
    Zstd,
    Deflate,
    RawDeflate,
    Lzo,
    Snappy,
    None,
}

/// COPY options
#[derive(Debug, Clone, Default)]
pub struct CopyOptions {
    pub on_error: OnError,
    pub size_limit: Option<u64>,
    pub purge: bool,
    pub force: bool,
    pub match_by_column_name: MatchMode,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum OnError {
    #[default]
    AbortStatement,
    Continue,
    SkipFile,
    SkipFilePercent(u8),
}

#[derive(Debug, Clone, Copy, Default)]
pub enum MatchMode {
    #[default]
    None,
    CaseSensitive,
    CaseInsensitive,
}

/// COPY result
#[derive(Debug, Clone)]
pub struct CopyResult {
    pub files_processed: usize,
    pub rows_loaded: u64,
    pub results: Vec<LoadResult>,
}

#[derive(Debug, Clone)]
pub struct LoadResult {
    pub file: String,
    pub status: LoadStatus,
    pub rows_parsed: u64,
    pub rows_loaded: u64,
    pub errors_seen: u64,
    pub first_error: Option<String>,
    pub first_error_line: Option<u64>,
}

#[derive(Debug, Clone)]
pub enum LoadStatus {
    Loaded,
    LoadedWithErrors,
    PartiallyLoaded,
    LoadFailed,
}
```

### 2.4 Error Types

```rust
/// Snowflake integration errors
#[derive(Debug, thiserror::Error)]
pub enum SnowflakeError {
    // Authentication errors
    #[error("Authentication failed: {message}")]
    Authentication { message: String },

    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("Session expired")]
    SessionExpired,

    #[error("Key pair error: {message}")]
    KeyPair { message: String },

    // Connection errors
    #[error("Connection failed: {message}")]
    Connection { message: String },

    #[error("Connection timeout after {timeout:?}")]
    ConnectionTimeout { timeout: Duration },

    #[error("Connection pool exhausted")]
    PoolExhausted,

    #[error("Network error: {message}")]
    Network { message: String },

    // Query errors
    #[error("Query failed: {message} (code: {code:?}, query_id: {query_id})")]
    Query {
        message: String,
        code: Option<String>,
        query_id: String,
    },

    #[error("Query cancelled: {query_id}")]
    Cancelled { query_id: String },

    #[error("Query timeout after {timeout:?}")]
    QueryTimeout { timeout: Duration },

    #[error("SQL syntax error: {message}")]
    Syntax { message: String },

    // Warehouse errors
    #[error("Warehouse not found: {warehouse}")]
    WarehouseNotFound { warehouse: String },

    #[error("Warehouse suspended: {warehouse}")]
    WarehouseSuspended { warehouse: String },

    #[error("Warehouse queue full: {warehouse}")]
    WarehouseQueueFull { warehouse: String },

    // Ingestion errors
    #[error("Stage upload failed: {message}")]
    StageUpload { message: String },

    #[error("COPY failed: {message}")]
    CopyFailed { message: String },

    #[error("File format error: {message}")]
    FileFormat { message: String },

    // Resource errors
    #[error("Resource not found: {resource}")]
    NotFound { resource: String },

    #[error("Permission denied: {message}")]
    PermissionDenied { message: String },

    // Simulation errors
    #[error("Simulation mismatch: query not recorded")]
    SimulationMismatch { query: String },

    #[error("Simulation not configured")]
    SimulationNotConfigured,

    // Other
    #[error("Configuration error: {message}")]
    Configuration { message: String },

    #[error("Serialization error: {message}")]
    Serialization { message: String },

    #[error("Unknown error: {message}")]
    Unknown { message: String },
}

impl SnowflakeError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            SnowflakeError::Connection { .. }
            | SnowflakeError::ConnectionTimeout { .. }
            | SnowflakeError::Network { .. }
            | SnowflakeError::SessionExpired
            | SnowflakeError::WarehouseSuspended { .. }
        )
    }

    pub fn is_transient(&self) -> bool {
        matches!(
            self,
            SnowflakeError::WarehouseSuspended { .. }
            | SnowflakeError::WarehouseQueueFull { .. }
        )
    }
}
```

---

## 3. Validation Rules

### 3.1 Configuration Validation

```rust
impl SnowflakeConfig {
    pub fn validate(&self) -> Result<(), ValidationError> {
        // Account validation
        if self.account.is_empty() {
            return Err(ValidationError::new("account", "Account cannot be empty"));
        }

        // Account format: org-account or account.region.cloud
        if !self.account.contains('-') && !self.account.contains('.') {
            return Err(ValidationError::new(
                "account",
                "Account must be in org-account or account.region format"
            ));
        }

        // User validation
        if self.user.is_empty() {
            return Err(ValidationError::new("user", "User cannot be empty"));
        }

        // Auth validation
        self.auth.validate()?;

        // Pool validation
        if self.pool.min_connections > self.pool.max_connections {
            return Err(ValidationError::new(
                "pool",
                "min_connections cannot exceed max_connections"
            ));
        }

        if self.pool.max_connections == 0 {
            return Err(ValidationError::new(
                "pool.max_connections",
                "max_connections must be at least 1"
            ));
        }

        // Timeout validation
        if self.connect_timeout.is_zero() {
            return Err(ValidationError::new(
                "connect_timeout",
                "connect_timeout must be positive"
            ));
        }

        Ok(())
    }
}

impl AuthConfig {
    pub fn validate(&self) -> Result<(), ValidationError> {
        match self {
            AuthConfig::Password { password } => {
                if password.expose_secret().is_empty() {
                    return Err(ValidationError::new("auth.password", "Password cannot be empty"));
                }
            }
            AuthConfig::KeyPair { private_key_path, .. } => {
                if !private_key_path.exists() {
                    return Err(ValidationError::new(
                        "auth.private_key_path",
                        format!("Private key file not found: {:?}", private_key_path)
                    ));
                }
            }
            AuthConfig::KeyPairPem { private_key_pem, .. } => {
                let pem = private_key_pem.expose_secret();
                if !pem.contains("BEGIN") || !pem.contains("PRIVATE KEY") {
                    return Err(ValidationError::new(
                        "auth.private_key_pem",
                        "Invalid PEM format for private key"
                    ));
                }
            }
            AuthConfig::OAuth { token, .. } => {
                if token.expose_secret().is_empty() {
                    return Err(ValidationError::new("auth.token", "OAuth token cannot be empty"));
                }
            }
            AuthConfig::Okta { okta_url } => {
                if !okta_url.starts_with("https://") {
                    return Err(ValidationError::new(
                        "auth.okta_url",
                        "Okta URL must use HTTPS"
                    ));
                }
            }
            AuthConfig::ExternalBrowser => {}
        }
        Ok(())
    }
}
```

### 3.2 Query Validation

```rust
/// SQL statement validation
pub fn validate_sql(sql: &str) -> Result<(), SnowflakeError> {
    // Check for empty SQL
    if sql.trim().is_empty() {
        return Err(SnowflakeError::Syntax {
            message: "SQL statement cannot be empty".to_string()
        });
    }

    // Check statement size (1MB limit)
    const MAX_STATEMENT_SIZE: usize = 1024 * 1024;
    if sql.len() > MAX_STATEMENT_SIZE {
        return Err(SnowflakeError::Syntax {
            message: format!(
                "SQL statement exceeds maximum size: {} bytes (max: {})",
                sql.len(), MAX_STATEMENT_SIZE
            )
        });
    }

    // Basic injection prevention - warn on suspicious patterns
    let suspicious_patterns = [
        "--",           // SQL comments that might hide injection
        "/*",           // Block comments
        ";--",          // Statement termination with comment
        "'; --",        // Common injection pattern
    ];

    for pattern in suspicious_patterns {
        if sql.contains(pattern) {
            tracing::warn!(
                "Suspicious pattern detected in SQL: {}. Ensure parameterized queries are used.",
                pattern
            );
        }
    }

    Ok(())
}

/// Identifier validation
pub fn validate_identifier(name: &str, identifier_type: &str) -> Result<(), SnowflakeError> {
    if name.is_empty() {
        return Err(SnowflakeError::Configuration {
            message: format!("{} cannot be empty", identifier_type)
        });
    }

    // Check for valid characters
    let valid = name.chars().all(|c| {
        c.is_alphanumeric() || c == '_' || c == '$'
    });

    if !valid && !name.starts_with('"') {
        return Err(SnowflakeError::Configuration {
            message: format!(
                "{} '{}' contains invalid characters. Use quoted identifier.",
                identifier_type, name
            )
        });
    }

    // Length check (max 255)
    if name.len() > 255 {
        return Err(SnowflakeError::Configuration {
            message: format!("{} exceeds maximum length of 255 characters", identifier_type)
        });
    }

    Ok(())
}

/// Stage name validation
pub fn validate_stage(stage: &str) -> Result<(), SnowflakeError> {
    if stage.is_empty() {
        return Err(SnowflakeError::Configuration {
            message: "Stage name cannot be empty".to_string()
        });
    }

    // Must start with @
    if !stage.starts_with('@') {
        return Err(SnowflakeError::Configuration {
            message: "Stage name must start with @".to_string()
        });
    }

    // Valid stage prefixes: @~ (user), @% (table), @name (named)
    let valid_prefixes = ["@~", "@%", "@"];
    if !valid_prefixes.iter().any(|p| stage.starts_with(p)) {
        return Err(SnowflakeError::Configuration {
            message: "Invalid stage prefix".to_string()
        });
    }

    Ok(())
}
```

### 3.3 File Format Validation

```rust
impl FileFormat {
    pub fn validate(&self) -> Result<(), SnowflakeError> {
        // Validate delimiter for CSV
        if matches!(self.format_type, FormatType::Csv) {
            if let Some(delim) = self.field_delimiter {
                if delim == '\n' || delim == '\r' {
                    return Err(SnowflakeError::FileFormat {
                        message: "Field delimiter cannot be newline character".to_string()
                    });
                }
            }
        }

        // Validate skip_header
        if self.skip_header > 10000 {
            return Err(SnowflakeError::FileFormat {
                message: "skip_header cannot exceed 10000".to_string()
            });
        }

        // Validate date/timestamp formats
        if let Some(ref fmt) = self.date_format {
            validate_date_format(fmt)?;
        }

        if let Some(ref fmt) = self.timestamp_format {
            validate_timestamp_format(fmt)?;
        }

        Ok(())
    }
}

fn validate_date_format(fmt: &str) -> Result<(), SnowflakeError> {
    // Snowflake date format tokens
    let valid_tokens = ["YYYY", "YY", "MM", "MON", "DD", "DY"];
    // Basic validation - actual parsing done by Snowflake
    if fmt.len() > 100 {
        return Err(SnowflakeError::FileFormat {
            message: "Date format too long".to_string()
        });
    }
    Ok(())
}

fn validate_timestamp_format(fmt: &str) -> Result<(), SnowflakeError> {
    if fmt.len() > 100 {
        return Err(SnowflakeError::FileFormat {
            message: "Timestamp format too long".to_string()
        });
    }
    Ok(())
}
```

---

## 4. Security Hardening

### 4.1 Credential Management

```rust
/// Secret string wrapper
#[derive(Clone)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn expose_secret(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for SecretString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl Drop for SecretString {
    fn drop(&mut self) {
        // Zero out memory
        unsafe {
            let bytes = self.0.as_bytes_mut();
            std::ptr::write_volatile(bytes.as_mut_ptr(), 0);
            for byte in bytes.iter_mut() {
                std::ptr::write_volatile(byte, 0);
            }
        }
    }
}

impl<'de> Deserialize<'de> for SecretString {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(SecretString::new(s))
    }
}

/// Key pair authentication
pub struct KeyPairAuth {
    private_key: RsaPrivateKey,
    account: String,
    user: String,
}

impl KeyPairAuth {
    pub fn from_pem(
        pem: &str,
        passphrase: Option<&str>,
        account: &str,
        user: &str,
    ) -> Result<Self, SnowflakeError> {
        let private_key = if let Some(pass) = passphrase {
            RsaPrivateKey::from_pkcs8_encrypted_pem(pem, pass)
                .map_err(|e| SnowflakeError::KeyPair {
                    message: format!("Failed to decrypt private key: {}", e)
                })?
        } else {
            RsaPrivateKey::from_pkcs8_pem(pem)
                .map_err(|e| SnowflakeError::KeyPair {
                    message: format!("Failed to parse private key: {}", e)
                })?
        };

        Ok(Self {
            private_key,
            account: account.to_uppercase(),
            user: user.to_uppercase(),
        })
    }

    pub fn generate_jwt(&self) -> Result<String, SnowflakeError> {
        // Calculate public key fingerprint
        let public_key = RsaPublicKey::from(&self.private_key);
        let public_key_der = public_key.to_public_key_der()
            .map_err(|e| SnowflakeError::KeyPair {
                message: format!("Failed to encode public key: {}", e)
            })?;

        let fingerprint = {
            let mut hasher = Sha256::new();
            hasher.update(public_key_der.as_bytes());
            base64::encode(hasher.finalize())
        };

        // Build claims
        let now = Utc::now();
        let claims = serde_json::json!({
            "iss": format!("{}.{}.SHA256:{}", self.account, self.user, fingerprint),
            "sub": format!("{}.{}", self.account, self.user),
            "iat": now.timestamp(),
            "exp": (now + chrono::Duration::seconds(60)).timestamp(),
        });

        // Sign JWT
        let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
        let encoding_key = jsonwebtoken::EncodingKey::from_rsa_pem(
            self.private_key.to_pkcs8_pem()?.as_bytes()
        )?;

        jsonwebtoken::encode(&header, &claims, &encoding_key)
            .map_err(|e| SnowflakeError::KeyPair {
                message: format!("Failed to sign JWT: {}", e)
            })
    }
}
```

### 4.2 SQL Sanitization

```rust
/// Quote and escape identifier
pub fn quote_identifier(name: &str) -> String {
    format!("\"{}\"", name.replace("\"", "\"\""))
}

/// Escape string literal
pub fn escape_string_literal(value: &str) -> String {
    value.replace("'", "''")
}

/// Parameterized query builder (prevents SQL injection)
pub struct SafeQueryBuilder {
    sql_parts: Vec<String>,
    params: Vec<QueryParam>,
}

impl SafeQueryBuilder {
    pub fn new() -> Self {
        Self {
            sql_parts: Vec::new(),
            params: Vec::new(),
        }
    }

    pub fn sql(mut self, fragment: &str) -> Self {
        self.sql_parts.push(fragment.to_string());
        self
    }

    pub fn param<T: Into<QueryParam>>(mut self, value: T) -> Self {
        self.sql_parts.push(format!("?"));
        self.params.push(value.into());
        self
    }

    pub fn identifier(mut self, name: &str) -> Self {
        self.sql_parts.push(quote_identifier(name));
        self
    }

    pub fn build(self) -> QueryRequest {
        QueryRequest {
            sql: self.sql_parts.join(""),
            params: self.params,
            ..Default::default()
        }
    }
}

// Usage example:
// let query = SafeQueryBuilder::new()
//     .sql("SELECT * FROM ")
//     .identifier(table_name)
//     .sql(" WHERE id = ")
//     .param(user_id)
//     .build();
```

### 4.3 Audit Logging

```rust
/// Query audit record
#[derive(Debug, Serialize)]
pub struct AuditRecord {
    pub timestamp: DateTime<Utc>,
    pub query_id: String,
    pub user: String,
    pub warehouse: String,
    pub database: Option<String>,
    pub schema: Option<String>,
    pub query_text_hash: String,  // Hash, not full query
    pub query_tag: Option<String>,
    pub duration_ms: u64,
    pub rows_produced: u64,
    pub bytes_scanned: u64,
    pub credits_used: f64,
    pub status: String,
    pub error: Option<String>,
}

impl AuditRecord {
    pub fn from_result(query: &QueryRequest, result: &QueryResult) -> Self {
        Self {
            timestamp: Utc::now(),
            query_id: result.query_id.clone(),
            user: String::new(), // Filled from session
            warehouse: result.warehouse.clone(),
            database: query.context.as_ref().and_then(|c| c.database.clone()),
            schema: query.context.as_ref().and_then(|c| c.schema.clone()),
            query_text_hash: hash_query(&query.sql),
            query_tag: query.tag.clone(),
            duration_ms: result.stats.execution_time_ms,
            rows_produced: result.stats.rows_produced,
            bytes_scanned: result.stats.bytes_scanned,
            credits_used: 0.0, // Calculate separately
            status: format!("{:?}", result.status),
            error: match &result.status {
                QueryStatus::Failed { error, .. } => Some(error.clone()),
                _ => None,
            },
        }
    }
}

fn hash_query(sql: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(sql.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Redact sensitive values from SQL for logging
pub fn redact_sql_for_logging(sql: &str) -> String {
    // Redact string literals
    let re_strings = regex::Regex::new(r"'[^']*'").unwrap();
    let redacted = re_strings.replace_all(sql, "'[REDACTED]'");

    // Redact numbers that might be sensitive (e.g., IDs)
    // Only redact if they appear after common patterns
    let re_ids = regex::Regex::new(r"(?i)(id\s*=\s*)(\d+)").unwrap();
    let redacted = re_ids.replace_all(&redacted, "$1[REDACTED]");

    redacted.to_string()
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pool Tuning

```rust
/// Pool size recommendations
pub fn recommend_pool_size(
    expected_concurrent_queries: u32,
    avg_query_duration_ms: u64,
    peak_qps: u32,
) -> PoolConfig {
    // Calculate connections needed based on Little's Law
    let connections_needed = (peak_qps as f64 * avg_query_duration_ms as f64 / 1000.0).ceil() as u32;

    // Add headroom for bursts
    let max_connections = (connections_needed as f64 * 1.3).ceil() as u32;
    let max_connections = max_connections.clamp(5, 50);

    // Min connections = 20% of max, at least 2
    let min_connections = (max_connections / 5).max(2);

    PoolConfig {
        min_connections,
        max_connections,
        idle_timeout: Duration::from_secs(1800),
        max_lifetime: Duration::from_secs(14400),
        acquire_timeout: Duration::from_secs(30),
    }
}
```

### 5.2 Query Optimization Hints

```rust
/// Query hints for optimization
pub struct QueryHints {
    /// Prefer result cache if available
    pub use_cached_result: bool,

    /// Warehouse size hint for routing
    pub warehouse_size: Option<WarehouseSize>,

    /// Maximum bytes to scan (cost control)
    pub max_bytes_scanned: Option<u64>,

    /// Statement-level timeout override
    pub statement_timeout: Option<Duration>,
}

impl QueryBuilder {
    pub fn with_hints(mut self, hints: QueryHints) -> Self {
        if let Some(timeout) = hints.statement_timeout {
            self.timeout = Some(timeout);
        }

        // Add session parameters for hints
        if !hints.use_cached_result {
            self.session_params.insert(
                "USE_CACHED_RESULT".to_string(),
                "FALSE".to_string()
            );
        }

        if let Some(max_bytes) = hints.max_bytes_scanned {
            self.session_params.insert(
                "STATEMENT_QUEUED_TIMEOUT_IN_SECONDS".to_string(),
                max_bytes.to_string()
            );
        }

        self
    }
}

/// Result cache awareness
pub fn should_use_cache(sql: &str) -> bool {
    let sql_upper = sql.to_uppercase();

    // Deterministic queries can use cache
    let non_deterministic = [
        "CURRENT_TIMESTAMP",
        "CURRENT_DATE",
        "CURRENT_TIME",
        "RANDOM(",
        "UUID_STRING(",
        "SEQ",
    ];

    !non_deterministic.iter().any(|pat| sql_upper.contains(pat))
}
```

### 5.3 Batch Processing

```rust
/// Optimal batch size for COPY operations
pub fn optimal_batch_size(avg_record_size_bytes: usize) -> usize {
    // Target ~100MB per file for optimal COPY performance
    const TARGET_FILE_SIZE: usize = 100 * 1024 * 1024;

    let records_per_file = TARGET_FILE_SIZE / avg_record_size_bytes.max(1);

    // Clamp to reasonable range
    records_per_file.clamp(1000, 10_000_000)
}

/// Chunk large uploads
pub async fn chunked_upload<T: Serialize + Send + Sync>(
    client: &SnowflakeClient,
    table: &str,
    records: Vec<T>,
    chunk_size: usize,
) -> Result<u64, SnowflakeError> {
    let mut total_loaded = 0u64;

    for chunk in records.chunks(chunk_size) {
        let loaded = client.bulk_insert(
            table,
            chunk,
            BulkInsertOptions::default()
        ).await?;

        total_loaded += loaded;
    }

    Ok(total_loaded)
}
```

### 5.4 Streaming Optimization

```rust
/// Streaming configuration
pub struct StreamConfig {
    /// Buffer size for chunks
    pub buffer_size: usize,

    /// Concurrent chunk downloads
    pub concurrent_chunks: usize,

    /// Prefetch next chunk
    pub prefetch: bool,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            buffer_size: 10000,
            concurrent_chunks: 2,
            prefetch: true,
        }
    }
}

/// Optimized result streaming with prefetch
pub struct OptimizedResultStream {
    inner: ResultStream,
    prefetch_handle: Option<JoinHandle<Result<Vec<Row>, SnowflakeError>>>,
    config: StreamConfig,
}

impl OptimizedResultStream {
    pub async fn next(&mut self) -> Option<Result<Row, SnowflakeError>> {
        // Start prefetch of next chunk if enabled
        if self.config.prefetch && self.prefetch_handle.is_none() {
            let inner_clone = self.inner.clone();
            self.prefetch_handle = Some(tokio::spawn(async move {
                inner_clone.fetch_next_chunk().await
            }));
        }

        self.inner.next().await
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

    mod query_builder {
        use super::*;

        #[test]
        fn test_basic_query() {
            let query = QueryBuilder::new("SELECT 1")
                .build();

            assert_eq!(query.sql, "SELECT 1");
            assert!(query.params.is_empty());
        }

        #[test]
        fn test_parameterized_query() {
            let query = QueryBuilder::new("SELECT * FROM users WHERE id = ?")
                .bind(42i64)
                .bind("active")
                .build();

            assert_eq!(query.params.len(), 2);
        }

        #[test]
        fn test_warehouse_override() {
            let query = QueryBuilder::new("SELECT 1")
                .warehouse("LARGE_WH")
                .build();

            assert_eq!(query.warehouse, Some("LARGE_WH".to_string()));
        }
    }

    mod validation {
        use super::*;

        #[test]
        fn test_account_validation() {
            // Valid formats
            assert!(validate_identifier("myorg-myaccount", "account").is_ok());
            assert!(validate_identifier("account.region", "account").is_ok());

            // Invalid
            assert!(validate_identifier("", "account").is_err());
        }

        #[test]
        fn test_stage_validation() {
            assert!(validate_stage("@mystage").is_ok());
            assert!(validate_stage("@~").is_ok());
            assert!(validate_stage("@%mytable").is_ok());

            assert!(validate_stage("mystage").is_err()); // Missing @
            assert!(validate_stage("").is_err());
        }

        #[test]
        fn test_sql_validation() {
            assert!(validate_sql("SELECT 1").is_ok());
            assert!(validate_sql("").is_err());
            assert!(validate_sql("   ").is_err());
        }
    }

    mod security {
        use super::*;

        #[test]
        fn test_identifier_quoting() {
            assert_eq!(quote_identifier("table"), "\"table\"");
            assert_eq!(quote_identifier("my\"table"), "\"my\"\"table\"");
        }

        #[test]
        fn test_secret_string_redaction() {
            let secret = SecretString::new("password123");
            assert_eq!(format!("{:?}", secret), "[REDACTED]");
        }

        #[test]
        fn test_sql_redaction() {
            let sql = "SELECT * FROM users WHERE name = 'John' AND id = 123";
            let redacted = redact_sql_for_logging(sql);

            assert!(!redacted.contains("John"));
            assert!(redacted.contains("[REDACTED]"));
        }
    }

    mod file_format {
        use super::*;

        #[test]
        fn test_csv_format_validation() {
            let format = FileFormat {
                format_type: FormatType::Csv,
                field_delimiter: Some(','),
                skip_header: 1,
                ..Default::default()
            };

            assert!(format.validate().is_ok());
        }

        #[test]
        fn test_invalid_delimiter() {
            let format = FileFormat {
                format_type: FormatType::Csv,
                field_delimiter: Some('\n'), // Invalid
                ..Default::default()
            };

            assert!(format.validate().is_err());
        }
    }
}
```

### 6.2 Integration Tests

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;

    async fn create_test_client() -> SnowflakeClient {
        let config = SnowflakeConfig {
            account: std::env::var("SNOWFLAKE_ACCOUNT").unwrap(),
            user: std::env::var("SNOWFLAKE_USER").unwrap(),
            auth: AuthConfig::Password {
                password: SecretString::new(
                    std::env::var("SNOWFLAKE_PASSWORD").unwrap()
                ),
            },
            warehouse: Some("TEST_WH".to_string()),
            database: Some("TEST_DB".to_string()),
            ..Default::default()
        };

        SnowflakeClient::new(config).await.unwrap()
    }

    #[tokio::test]
    #[ignore] // Run with --ignored for integration tests
    async fn test_simple_query() {
        let client = create_test_client().await;

        let result = client.execute(
            QueryBuilder::new("SELECT 1 AS num").build()
        ).await.unwrap();

        assert_eq!(result.rows.len(), 1);
        assert_eq!(result.rows[0].get_i64("num"), Some(1));
    }

    #[tokio::test]
    #[ignore]
    async fn test_parameterized_query() {
        let client = create_test_client().await;

        let result = client.execute(
            QueryBuilder::new("SELECT ? AS val")
                .bind("hello")
                .build()
        ).await.unwrap();

        assert_eq!(result.rows[0].get_string("val"), Some("hello".to_string()));
    }

    #[tokio::test]
    #[ignore]
    async fn test_async_query() {
        let client = create_test_client().await;

        let handle = client.execute_async(
            QueryBuilder::new("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES")
                .build()
        ).await.unwrap();

        let result = handle.wait_with_timeout(Duration::from_secs(60)).await.unwrap();

        assert!(matches!(result.status, QueryStatus::Success));
    }

    #[tokio::test]
    #[ignore]
    async fn test_warehouse_status() {
        let client = create_test_client().await;

        let status = client.get_warehouse_status("TEST_WH").await.unwrap();

        assert_eq!(status.name, "TEST_WH");
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
        // Record phase
        let record_config = SnowflakeConfig {
            simulation_mode: SimulationMode::Record,
            ..test_config()
        };

        let client = SnowflakeClient::new(record_config).await.unwrap();

        client.execute(
            QueryBuilder::new("SELECT 42 AS answer").build()
        ).await.unwrap();

        client.simulation().save("test_recordings.json").await.unwrap();

        // Replay phase
        let replay_config = SnowflakeConfig {
            simulation_mode: SimulationMode::Replay,
            ..test_config()
        };

        let replay_client = SnowflakeClient::with_simulation(
            replay_config,
            SimulationReplayer::load("test_recordings.json").unwrap()
        );

        let result = replay_client.execute(
            QueryBuilder::new("SELECT 42 AS answer").build()
        ).await.unwrap();

        assert_eq!(result.rows[0].get_i64("answer"), Some(42));

        // Cleanup
        std::fs::remove_file("test_recordings.json").ok();
    }
}
```

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions

```yaml
name: Snowflake Integration CI

on:
  push:
    branches: [main]
    paths:
      - 'integrations/snowflake/**'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/snowflake/**'

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable
        with:
          components: clippy, rustfmt

      - name: Check formatting
        run: cargo fmt --all -- --check
        working-directory: integrations/snowflake

      - name: Run Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings
        working-directory: integrations/snowflake

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable

      - name: Cache cargo
        uses: actions/cache@v3
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

      - name: Run unit tests
        run: cargo test --lib
        working-directory: integrations/snowflake

  integration-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment: snowflake-test
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable

      - name: Run integration tests
        run: cargo test --test '*' -- --ignored
        working-directory: integrations/snowflake
        env:
          SNOWFLAKE_ACCOUNT: ${{ secrets.SNOWFLAKE_ACCOUNT }}
          SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
          SNOWFLAKE_PASSWORD: ${{ secrets.SNOWFLAKE_PASSWORD }}
          SNOWFLAKE_WAREHOUSE: ${{ secrets.SNOWFLAKE_WAREHOUSE }}
          SNOWFLAKE_DATABASE: ${{ secrets.SNOWFLAKE_DATABASE }}

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable

      - name: Install cargo-audit
        run: cargo install cargo-audit

      - name: Run security audit
        run: cargo audit
        working-directory: integrations/snowflake

  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable
        with:
          components: llvm-tools-preview

      - name: Install cargo-llvm-cov
        run: cargo install cargo-llvm-cov

      - name: Generate coverage report
        run: cargo llvm-cov --all-features --lcov --output-path lcov.info
        working-directory: integrations/snowflake

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: integrations/snowflake/lcov.info
          flags: snowflake
```

### 7.2 Cargo Configuration

```toml
# Cargo.toml
[package]
name = "llm-devops-snowflake"
version = "0.1.0"
edition = "2021"
authors = ["LLM DevOps Team"]
description = "Snowflake integration for LLM DevOps platform"
license = "MIT"

[dependencies]
# HTTP client
reqwest = { version = "0.11", features = ["json", "rustls-tls", "stream"] }

# Async runtime
tokio = { version = "1.35", features = ["full"] }
async-trait = "0.1"
futures = "0.3"
async-stream = "0.3"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Configuration
config = "0.14"
humantime-serde = "1.1"

# Cryptography
rsa = { version = "0.9", features = ["pkcs8", "pem"] }
sha2 = "0.10"
jsonwebtoken = "9.2"
base64 = "0.21"

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Logging and metrics
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Utilities
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.6", features = ["v4"] }
regex = "1.10"
tempfile = "3.9"

# Compression
flate2 = "1.0"

# Arrow/Parquet for data export
arrow = { version = "50", optional = true }
parquet = { version = "50", optional = true }

[dev-dependencies]
tokio-test = "0.4"
pretty_assertions = "1.4"
criterion = "0.5"
wiremock = "0.5"

[features]
default = []
parquet = ["dep:arrow", "dep:parquet"]
simulation = []

[[bench]]
name = "benchmarks"
harness = false
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-SNOW-REF-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*Proceed to Completion phase upon approval.*
