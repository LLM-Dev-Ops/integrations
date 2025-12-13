# Refinement: MongoDB Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/mongodb`

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
/// Primary interface for MongoDB operations
#[async_trait]
pub trait MongoOperations: Send + Sync {
    /// Get a database handle
    fn database(&self, name: &str) -> Database;

    /// Get the default database
    fn default_database(&self) -> Database;

    /// Get a typed collection handle
    fn collection<T>(&self, database: &str, collection: &str) -> Collection<T>
    where
        T: Serialize + DeserializeOwned + Send + Sync + Unpin;

    /// Start a new session for transactions
    async fn start_session(&self) -> Result<Session, MongoError>;

    /// Execute a callback within a transaction with automatic retry
    async fn with_transaction<F, T, Fut>(&self, f: F) -> Result<T, MongoError>
    where
        F: Fn(Session) -> Fut + Send + Sync,
        Fut: Future<Output = Result<T, MongoError>> + Send,
        T: Send;

    /// Check cluster health
    async fn health_check(&self) -> Result<HealthStatus, MongoError>;
}
```

### 1.2 Collection Operations Trait

```rust
/// CRUD operations for typed collections
#[async_trait]
pub trait CollectionOperations<T>: Send + Sync
where
    T: Serialize + DeserializeOwned + Send + Sync + Unpin,
{
    // Insert operations
    async fn insert_one(&self, doc: &T) -> Result<InsertOneResult, MongoError>;
    async fn insert_many(&self, docs: &[T]) -> Result<InsertManyResult, MongoError>;

    // Find operations
    async fn find_one(&self, filter: Document) -> Result<Option<T>, MongoError>;
    async fn find(&self, filter: Document, options: FindOptions) -> Result<Vec<T>, MongoError>;
    async fn find_by_id(&self, id: &ObjectId) -> Result<Option<T>, MongoError>;
    fn find_stream(&self, filter: Document, options: FindOptions) -> BoxStream<'_, Result<T, MongoError>>;

    // Update operations
    async fn update_one(&self, filter: Document, update: Document) -> Result<UpdateResult, MongoError>;
    async fn update_many(&self, filter: Document, update: Document) -> Result<UpdateResult, MongoError>;
    async fn find_one_and_update(
        &self,
        filter: Document,
        update: Document,
        options: FindOneAndUpdateOptions,
    ) -> Result<Option<T>, MongoError>;
    async fn upsert(&self, filter: Document, doc: &T) -> Result<UpdateResult, MongoError>;

    // Delete operations
    async fn delete_one(&self, filter: Document) -> Result<DeleteResult, MongoError>;
    async fn delete_many(&self, filter: Document) -> Result<DeleteResult, MongoError>;
    async fn delete_by_id(&self, id: &ObjectId) -> Result<bool, MongoError>;

    // Utility operations
    async fn count_documents(&self, filter: Document) -> Result<u64, MongoError>;
    async fn distinct<V: DeserializeOwned>(&self, field: &str, filter: Document) -> Result<Vec<V>, MongoError>;
}
```

### 1.3 Aggregation Trait

```rust
/// Aggregation pipeline operations
#[async_trait]
pub trait AggregationOperations<T>: Send + Sync
where
    T: Serialize + DeserializeOwned + Send + Sync + Unpin,
{
    /// Execute aggregation pipeline returning typed results
    async fn aggregate<R>(&self, pipeline: Vec<Document>, options: Option<AggregateOptions>) -> Result<Vec<R>, MongoError>
    where
        R: DeserializeOwned + Send + Sync + Unpin;

    /// Stream aggregation results
    fn aggregate_stream<R>(&self, pipeline: Vec<Document>, options: Option<AggregateOptions>) -> BoxStream<'_, Result<R, MongoError>>
    where
        R: DeserializeOwned + Send + Sync + Unpin + 'static;
}
```

### 1.4 Change Stream Trait

```rust
/// Change stream operations for real-time updates
#[async_trait]
pub trait ChangeStreamOperations<T>: Send + Sync
where
    T: DeserializeOwned + Send + Sync + Unpin,
{
    /// Watch collection for changes
    async fn watch(
        &self,
        pipeline: Option<Vec<Document>>,
        options: Option<ChangeStreamOptions>,
    ) -> Result<ChangeStream<T>, MongoError>;
}

/// Change stream handle with resume capability
#[async_trait]
pub trait ChangeStreamHandle<T>: Send + Sync
where
    T: DeserializeOwned + Send + Sync + Unpin,
{
    /// Get next change event
    async fn next(&mut self) -> Result<Option<ChangeEvent<T>>, MongoError>;

    /// Resume from stored token
    async fn resume(&mut self) -> Result<(), MongoError>;

    /// Get current resume token
    fn resume_token(&self) -> Option<&ResumeToken>;

    /// Convert to async stream
    fn into_stream(self) -> BoxStream<'static, Result<ChangeEvent<T>, MongoError>>;
}
```

### 1.5 Transaction Trait

```rust
/// Session-based transaction operations
#[async_trait]
pub trait TransactionOperations: Send + Sync {
    /// Start a transaction
    async fn start_transaction(&mut self, options: Option<TransactionOptions>) -> Result<(), MongoError>;

    /// Commit the current transaction
    async fn commit(&mut self) -> Result<(), MongoError>;

    /// Abort the current transaction
    async fn abort(&mut self) -> Result<(), MongoError>;

    /// Execute operation within session context
    async fn insert_one<T: Serialize + Send + Sync>(
        &mut self,
        collection: &Collection<T>,
        doc: &T,
    ) -> Result<InsertOneResult, MongoError>;

    async fn find_one<T: DeserializeOwned + Send + Sync + Unpin>(
        &mut self,
        collection: &Collection<T>,
        filter: Document,
    ) -> Result<Option<T>, MongoError>;

    async fn update_one<T>(
        &mut self,
        collection: &Collection<T>,
        filter: Document,
        update: Document,
    ) -> Result<UpdateResult, MongoError>;

    async fn delete_one<T>(
        &mut self,
        collection: &Collection<T>,
        filter: Document,
    ) -> Result<DeleteResult, MongoError>;
}
```

### 1.6 Bulk Operations Trait

```rust
/// Bulk write operations
#[async_trait]
pub trait BulkOperations<T>: Send + Sync
where
    T: Serialize + Send + Sync,
{
    /// Create a bulk write builder
    fn bulk_write(&self) -> BulkWriteBuilder<T>;
}

/// Builder for bulk operations
pub trait BulkWriteOps<T>: Send + Sync
where
    T: Serialize + Send + Sync,
{
    /// Add insert operation
    fn insert(self, doc: T) -> Self;

    /// Add update one operation
    fn update_one(self, filter: Document, update: Document, upsert: bool) -> Self;

    /// Add update many operation
    fn update_many(self, filter: Document, update: Document) -> Self;

    /// Add replace one operation
    fn replace_one(self, filter: Document, replacement: T, upsert: bool) -> Self;

    /// Add delete one operation
    fn delete_one(self, filter: Document) -> Self;

    /// Add delete many operation
    fn delete_many(self, filter: Document) -> Self;

    /// Set ordered execution (default: true)
    fn ordered(self, ordered: bool) -> Self;

    /// Execute bulk operations
    async fn execute(self) -> Result<BulkWriteResult, MongoError>;
}
```

---

## 2. Type Definitions

### 2.1 Configuration Types

```rust
/// MongoDB client configuration
#[derive(Debug, Clone, Deserialize)]
pub struct MongoConfig {
    /// Connection URI (mongodb:// or mongodb+srv://)
    pub uri: String,

    /// Default database name
    pub default_database: String,

    /// Minimum connections in pool
    #[serde(default = "default_min_pool")]
    pub min_pool_size: u32,

    /// Maximum connections in pool
    #[serde(default = "default_max_pool")]
    pub max_pool_size: u32,

    /// Connection timeout
    #[serde(default = "default_connect_timeout")]
    #[serde(with = "humantime_serde")]
    pub connect_timeout: Duration,

    /// Server selection timeout
    #[serde(default = "default_server_selection_timeout")]
    #[serde(with = "humantime_serde")]
    pub server_selection_timeout: Duration,

    /// Read preference setting
    #[serde(default)]
    pub read_preference: ReadPreferenceConfig,

    /// Read concern level
    #[serde(default)]
    pub read_concern: ReadConcernConfig,

    /// Write concern settings
    #[serde(default)]
    pub write_concern: WriteConcernConfig,

    /// TLS configuration
    #[serde(default)]
    pub tls: TlsConfig,

    /// Simulation mode
    #[serde(default)]
    pub simulation_mode: SimulationMode,

    /// Application name for server logs
    pub app_name: Option<String>,
}

fn default_min_pool() -> u32 { 5 }
fn default_max_pool() -> u32 { 100 }
fn default_connect_timeout() -> Duration { Duration::from_secs(10) }
fn default_server_selection_timeout() -> Duration { Duration::from_secs(30) }

/// TLS configuration
#[derive(Debug, Clone, Default, Deserialize)]
pub struct TlsConfig {
    /// Enable TLS
    #[serde(default)]
    pub enabled: bool,

    /// CA certificate file path
    pub ca_file: Option<PathBuf>,

    /// Client certificate file path
    pub cert_file: Option<PathBuf>,

    /// Client key file path
    pub key_file: Option<PathBuf>,

    /// Allow invalid certificates (dev only)
    #[serde(default)]
    pub allow_invalid_certificates: bool,
}

/// Read preference configuration
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum ReadPreferenceConfig {
    Primary,
    PrimaryPreferred,
    Secondary,
    SecondaryPreferred,
    Nearest,
    #[serde(rename_all = "camelCase")]
    Tagged { tag_sets: Vec<HashMap<String, String>> },
}

impl Default for ReadPreferenceConfig {
    fn default() -> Self { Self::Primary }
}

/// Read concern configuration
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReadConcernConfig {
    Local,
    Available,
    Majority,
    Linearizable,
    Snapshot,
}

impl Default for ReadConcernConfig {
    fn default() -> Self { Self::Local }
}

/// Write concern configuration
#[derive(Debug, Clone, Default, Deserialize)]
pub struct WriteConcernConfig {
    /// Write acknowledgment level
    #[serde(default)]
    pub w: WriteAcknowledgment,

    /// Journal acknowledgment
    #[serde(default)]
    pub journal: bool,

    /// Write timeout
    #[serde(with = "humantime_serde")]
    pub timeout: Option<Duration>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum WriteAcknowledgment {
    Nodes(u32),
    Majority,
}

impl Default for WriteAcknowledgment {
    fn default() -> Self { Self::Nodes(1) }
}

/// Simulation mode
#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SimulationMode {
    #[default]
    Disabled,
    Record,
    Replay,
}
```

### 2.2 Result Types

```rust
/// Insert one result
#[derive(Debug, Clone)]
pub struct InsertOneResult {
    /// Inserted document ID
    pub inserted_id: Bson,
}

/// Insert many result
#[derive(Debug, Clone)]
pub struct InsertManyResult {
    /// Map of index to inserted ID
    pub inserted_ids: HashMap<usize, Bson>,
}

impl InsertManyResult {
    pub fn empty() -> Self {
        Self { inserted_ids: HashMap::new() }
    }

    pub fn count(&self) -> usize {
        self.inserted_ids.len()
    }
}

/// Update result
#[derive(Debug, Clone)]
pub struct UpdateResult {
    /// Number of documents matched
    pub matched_count: u64,

    /// Number of documents modified
    pub modified_count: u64,

    /// ID of upserted document (if upsert occurred)
    pub upserted_id: Option<Bson>,
}

/// Delete result
#[derive(Debug, Clone)]
pub struct DeleteResult {
    /// Number of documents deleted
    pub deleted_count: u64,
}

/// Bulk write result
#[derive(Debug, Clone)]
pub struct BulkWriteResult {
    /// Number of documents inserted
    pub inserted_count: u64,

    /// Number of documents modified
    pub modified_count: u64,

    /// Number of documents deleted
    pub deleted_count: u64,

    /// Number of documents upserted
    pub upserted_count: u64,

    /// Map of operation index to upserted ID
    pub upserted_ids: HashMap<usize, Bson>,
}

impl BulkWriteResult {
    pub fn empty() -> Self {
        Self {
            inserted_count: 0,
            modified_count: 0,
            deleted_count: 0,
            upserted_count: 0,
            upserted_ids: HashMap::new(),
        }
    }

    pub fn total_affected(&self) -> u64 {
        self.inserted_count + self.modified_count + self.deleted_count + self.upserted_count
    }
}

/// Paginated result
#[derive(Debug, Clone)]
pub struct PaginatedResult<T> {
    /// Page items
    pub items: Vec<T>,

    /// Total document count
    pub total: u64,

    /// Current page (0-indexed)
    pub page: u64,

    /// Items per page
    pub page_size: u64,

    /// Has next page
    pub has_next: bool,
}

impl<T> PaginatedResult<T> {
    pub fn total_pages(&self) -> u64 {
        (self.total + self.page_size - 1) / self.page_size
    }

    pub fn has_prev(&self) -> bool {
        self.page > 0
    }
}
```

### 2.3 Change Stream Types

```rust
/// Change event from watch stream
#[derive(Debug, Clone)]
pub struct ChangeEvent<T> {
    /// Resume token for this event
    pub id: ResumeToken,

    /// Type of operation
    pub operation: OperationType,

    /// Document key (_id)
    pub document_key: Document,

    /// Full document (for insert/replace/update with lookup)
    pub full_document: Option<T>,

    /// Update description (for update operations)
    pub update_description: Option<UpdateDescription>,

    /// Cluster time of operation
    pub cluster_time: Option<Timestamp>,

    /// Namespace (database.collection)
    pub namespace: Namespace,
}

/// Operation type for change events
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationType {
    Insert,
    Update,
    Replace,
    Delete,
    Drop,
    Rename,
    DropDatabase,
    Invalidate,
}

/// Update description for change events
#[derive(Debug, Clone)]
pub struct UpdateDescription {
    /// Fields that were updated
    pub updated_fields: Document,

    /// Fields that were removed
    pub removed_fields: Vec<String>,

    /// Truncated arrays (MongoDB 6.0+)
    pub truncated_arrays: Option<Vec<TruncatedArray>>,
}

/// Truncated array info
#[derive(Debug, Clone)]
pub struct TruncatedArray {
    pub field: String,
    pub new_size: u32,
}

/// Namespace (database.collection)
#[derive(Debug, Clone)]
pub struct Namespace {
    pub database: String,
    pub collection: String,
}

/// Resume token (opaque)
#[derive(Debug, Clone)]
pub struct ResumeToken(Document);

impl ResumeToken {
    pub fn as_document(&self) -> &Document {
        &self.0
    }
}
```

### 2.4 Error Types

```rust
/// MongoDB integration errors
#[derive(Debug, thiserror::Error)]
pub enum MongoError {
    // Connection errors
    #[error("Connection failed: {message}")]
    Connection { message: String, source: Option<Box<dyn std::error::Error + Send + Sync>> },

    #[error("Authentication failed: {message}")]
    Authentication { message: String },

    #[error("TLS error: {message}")]
    Tls { message: String },

    #[error("Server selection timeout after {timeout:?}")]
    ServerSelection { timeout: Duration },

    #[error("Connection pool exhausted")]
    PoolExhausted,

    // Operation errors
    #[error("Write error: {message} (code: {code})")]
    Write { code: i32, message: String },

    #[error("Query error: {message}")]
    Query { message: String },

    #[error("Operation timeout after {timeout:?}")]
    Timeout { timeout: Duration },

    #[error("Cursor error: {message}")]
    Cursor { message: String },

    // Transaction errors
    #[error("Transaction error: {message}")]
    Transaction { message: String, is_transient: bool },

    #[error("Commit error: {message}")]
    Commit { message: String, is_retryable: bool },

    // Validation errors
    #[error("Document too large: {size} bytes (max: 16MB)")]
    DocumentTooLarge { size: usize },

    #[error("Invalid document: {message}")]
    InvalidDocument { message: String },

    #[error("Invalid ObjectId: {value}")]
    InvalidObjectId { value: String },

    // Serialization errors
    #[error("BSON serialization error: {message}")]
    Serialization { message: String },

    #[error("BSON deserialization error: {message}")]
    Deserialization { message: String },

    // Simulation errors
    #[error("Simulation mismatch: operation not recorded")]
    SimulationMismatch,

    #[error("Simulation type mismatch: expected {expected}, got {actual}")]
    SimulationTypeMismatch { expected: String, actual: String },

    // Other
    #[error("Unknown error: {message}")]
    Unknown { message: String },
}

impl MongoError {
    /// Check if error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            MongoError::Connection { .. }
            | MongoError::ServerSelection { .. }
            | MongoError::Timeout { .. }
            | MongoError::Transaction { is_transient: true, .. }
            | MongoError::Commit { is_retryable: true, .. }
        )
    }

    /// Check if error is transient (transaction should be retried)
    pub fn is_transient(&self) -> bool {
        matches!(self, MongoError::Transaction { is_transient: true, .. })
    }
}
```

---

## 3. Validation Rules

### 3.1 Configuration Validation

```rust
impl MongoConfig {
    /// Validate configuration
    pub fn validate(&self) -> Result<(), ValidationError> {
        // URI validation
        if self.uri.is_empty() {
            return Err(ValidationError::new("uri", "URI cannot be empty"));
        }

        if !self.uri.starts_with("mongodb://") && !self.uri.starts_with("mongodb+srv://") {
            return Err(ValidationError::new("uri", "URI must start with mongodb:// or mongodb+srv://"));
        }

        // Database name validation
        if self.default_database.is_empty() {
            return Err(ValidationError::new("default_database", "Default database cannot be empty"));
        }

        if self.default_database.len() > 64 {
            return Err(ValidationError::new("default_database", "Database name cannot exceed 64 characters"));
        }

        // Pool size validation
        if self.min_pool_size > self.max_pool_size {
            return Err(ValidationError::new("pool_size", "min_pool_size cannot exceed max_pool_size"));
        }

        if self.max_pool_size == 0 {
            return Err(ValidationError::new("max_pool_size", "max_pool_size must be at least 1"));
        }

        // Timeout validation
        if self.connect_timeout.is_zero() {
            return Err(ValidationError::new("connect_timeout", "connect_timeout must be positive"));
        }

        if self.server_selection_timeout.is_zero() {
            return Err(ValidationError::new("server_selection_timeout", "server_selection_timeout must be positive"));
        }

        // TLS validation
        self.tls.validate()?;

        Ok(())
    }
}

impl TlsConfig {
    pub fn validate(&self) -> Result<(), ValidationError> {
        if !self.enabled {
            return Ok(());
        }

        // Validate file paths exist if specified
        if let Some(ca) = &self.ca_file {
            if !ca.exists() {
                return Err(ValidationError::new("tls.ca_file", format!("CA file not found: {:?}", ca)));
            }
        }

        if let Some(cert) = &self.cert_file {
            if !cert.exists() {
                return Err(ValidationError::new("tls.cert_file", format!("Certificate file not found: {:?}", cert)));
            }
        }

        if let Some(key) = &self.key_file {
            if !key.exists() {
                return Err(ValidationError::new("tls.key_file", format!("Key file not found: {:?}", key)));
            }
        }

        // Warn about allow_invalid_certificates in production
        if self.allow_invalid_certificates {
            tracing::warn!("TLS configured to allow invalid certificates - not recommended for production");
        }

        Ok(())
    }
}
```

### 3.2 Document Validation

```rust
/// Document size limits
const MAX_DOCUMENT_SIZE: usize = 16 * 1024 * 1024; // 16MB
const MAX_BSON_DEPTH: usize = 100;
const MAX_NAMESPACE_LENGTH: usize = 120;

/// Validate document before insert
pub fn validate_document(doc: &Document) -> Result<(), MongoError> {
    // Check serialized size
    let size = bson::to_vec(doc)
        .map_err(|e| MongoError::Serialization { message: e.to_string() })?
        .len();

    if size > MAX_DOCUMENT_SIZE {
        return Err(MongoError::DocumentTooLarge { size });
    }

    // Check nesting depth
    if document_depth(doc) > MAX_BSON_DEPTH {
        return Err(MongoError::InvalidDocument {
            message: format!("Document nesting exceeds {} levels", MAX_BSON_DEPTH),
        });
    }

    // Validate field names
    validate_field_names(doc)?;

    Ok(())
}

fn document_depth(doc: &Document) -> usize {
    let mut max_depth = 1;

    for value in doc.values() {
        let child_depth = match value {
            Bson::Document(d) => 1 + document_depth(d),
            Bson::Array(arr) => 1 + arr.iter()
                .filter_map(|v| match v {
                    Bson::Document(d) => Some(document_depth(d)),
                    _ => None,
                })
                .max()
                .unwrap_or(0),
            _ => 1,
        };
        max_depth = max_depth.max(child_depth);
    }

    max_depth
}

fn validate_field_names(doc: &Document) -> Result<(), MongoError> {
    for (key, value) in doc {
        // Field names cannot be empty
        if key.is_empty() {
            return Err(MongoError::InvalidDocument {
                message: "Field name cannot be empty".to_string(),
            });
        }

        // Field names cannot contain null bytes
        if key.contains('\0') {
            return Err(MongoError::InvalidDocument {
                message: format!("Field name '{}' contains null byte", key),
            });
        }

        // Top-level field names cannot start with $ (except operators)
        if key.starts_with('$') && !is_valid_operator(key) {
            return Err(MongoError::InvalidDocument {
                message: format!("Field name '{}' cannot start with $", key),
            });
        }

        // Recursively validate nested documents
        if let Bson::Document(nested) = value {
            validate_field_names(nested)?;
        }
    }

    Ok(())
}

fn is_valid_operator(key: &str) -> bool {
    matches!(key,
        "$set" | "$unset" | "$inc" | "$push" | "$pull" | "$addToSet" |
        "$pop" | "$rename" | "$min" | "$max" | "$mul" | "$currentDate" |
        "$setOnInsert" | "$bit" | "$each" | "$position" | "$slice" | "$sort"
    )
}

/// Validate collection/database namespace
pub fn validate_namespace(database: &str, collection: &str) -> Result<(), MongoError> {
    let namespace = format!("{}.{}", database, collection);

    if namespace.len() > MAX_NAMESPACE_LENGTH {
        return Err(MongoError::InvalidDocument {
            message: format!("Namespace '{}' exceeds {} bytes", namespace, MAX_NAMESPACE_LENGTH),
        });
    }

    // Collection name validation
    if collection.is_empty() {
        return Err(MongoError::InvalidDocument {
            message: "Collection name cannot be empty".to_string(),
        });
    }

    if collection.contains('\0') {
        return Err(MongoError::InvalidDocument {
            message: "Collection name cannot contain null bytes".to_string(),
        });
    }

    if collection.starts_with("system.") {
        return Err(MongoError::InvalidDocument {
            message: "Collection name cannot start with 'system.'".to_string(),
        });
    }

    Ok(())
}
```

### 3.3 Query Validation

```rust
/// Validate filter document
pub fn validate_filter(filter: &Document) -> Result<(), MongoError> {
    for (key, value) in filter {
        // Validate operators
        if key.starts_with('$') {
            validate_query_operator(key, value)?;
        }

        // Recursively validate nested conditions
        if let Bson::Document(nested) = value {
            // Check if it's an operator document
            if nested.keys().any(|k| k.starts_with('$')) {
                for (op, op_value) in nested {
                    if op.starts_with('$') {
                        validate_query_operator(op, op_value)?;
                    }
                }
            }
        }
    }

    Ok(())
}

fn validate_query_operator(op: &str, value: &Bson) -> Result<(), MongoError> {
    match op {
        "$eq" | "$ne" | "$gt" | "$gte" | "$lt" | "$lte" => Ok(()),
        "$in" | "$nin" => {
            if !matches!(value, Bson::Array(_)) {
                return Err(MongoError::InvalidDocument {
                    message: format!("{} requires an array value", op),
                });
            }
            Ok(())
        }
        "$and" | "$or" | "$nor" => {
            if !matches!(value, Bson::Array(_)) {
                return Err(MongoError::InvalidDocument {
                    message: format!("{} requires an array of conditions", op),
                });
            }
            Ok(())
        }
        "$not" => {
            if !matches!(value, Bson::Document(_)) {
                return Err(MongoError::InvalidDocument {
                    message: "$not requires a document value".to_string(),
                });
            }
            Ok(())
        }
        "$exists" => {
            if !matches!(value, Bson::Boolean(_)) {
                return Err(MongoError::InvalidDocument {
                    message: "$exists requires a boolean value".to_string(),
                });
            }
            Ok(())
        }
        "$regex" => {
            if !matches!(value, Bson::String(_) | Bson::RegularExpression(_)) {
                return Err(MongoError::InvalidDocument {
                    message: "$regex requires a string or regex value".to_string(),
                });
            }
            Ok(())
        }
        _ => Ok(()), // Allow unknown operators (driver will validate)
    }
}

/// Validate aggregation pipeline
pub fn validate_pipeline(pipeline: &[Document]) -> Result<(), MongoError> {
    if pipeline.is_empty() {
        return Ok(());
    }

    for (idx, stage) in pipeline.iter().enumerate() {
        if stage.len() != 1 {
            return Err(MongoError::InvalidDocument {
                message: format!("Pipeline stage {} must have exactly one operator", idx),
            });
        }

        let (operator, _) = stage.iter().next().unwrap();

        if !operator.starts_with('$') {
            return Err(MongoError::InvalidDocument {
                message: format!("Pipeline stage {} operator must start with $", idx),
            });
        }

        // Validate specific stages
        match operator.as_str() {
            "$out" | "$merge" if idx != pipeline.len() - 1 => {
                return Err(MongoError::InvalidDocument {
                    message: format!("{} must be the last pipeline stage", operator),
                });
            }
            _ => {}
        }
    }

    Ok(())
}
```

---

## 4. Security Hardening

### 4.1 Credential Management

```rust
/// Secure credential provider
#[async_trait]
pub trait CredentialProvider: Send + Sync {
    /// Get current credentials
    async fn get_credentials(&self) -> Result<Option<MongoCredentials>, MongoError>;

    /// Refresh credentials (for rotation)
    async fn refresh(&self) -> Result<(), MongoError>;
}

/// MongoDB credentials
pub struct MongoCredentials {
    pub username: String,
    pub password: SecretString,
    pub auth_source: String,
    pub mechanism: AuthMechanism,
}

/// Secret string wrapper that prevents accidental logging
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

impl std::fmt::Display for SecretString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl Drop for SecretString {
    fn drop(&mut self) {
        // Zero out memory
        unsafe {
            std::ptr::write_volatile(self.0.as_mut_ptr(), 0);
        }
    }
}

/// Authentication mechanism
#[derive(Debug, Clone, Copy)]
pub enum AuthMechanism {
    ScramSha256,
    ScramSha1,
    MongoDbX509,
    Plain,
    GssApi,
    MongoDbAws,
}
```

### 4.2 Connection Security

```rust
/// Build secure TLS configuration
pub fn build_tls_options(config: &TlsConfig) -> Result<TlsOptions, MongoError> {
    if !config.enabled {
        return Err(MongoError::Tls {
            message: "TLS is not enabled".to_string(),
        });
    }

    let mut builder = TlsOptions::builder();

    // Load CA certificate
    if let Some(ca_path) = &config.ca_file {
        let ca_cert = std::fs::read(ca_path)
            .map_err(|e| MongoError::Tls {
                message: format!("Failed to read CA file: {}", e),
            })?;
        builder = builder.ca_file_path(ca_path.clone());
    }

    // Load client certificate
    if let Some(cert_path) = &config.cert_file {
        builder = builder.cert_key_file_path(cert_path.clone());
    }

    // Certificate validation
    builder = builder.allow_invalid_certificates(config.allow_invalid_certificates);

    Ok(builder.build())
}

/// Validate URI doesn't expose credentials in logs
pub fn sanitize_uri_for_logging(uri: &str) -> String {
    // Pattern: mongodb://user:password@host
    let re = regex::Regex::new(r"mongodb(\+srv)?://([^:]+):([^@]+)@").unwrap();
    re.replace(uri, "mongodb$1://$2:[REDACTED]@").to_string()
}
```

### 4.3 Query Security

```rust
/// Prevent query injection by using typed builders
impl FilterBuilder {
    /// Safe equality check (prevents operator injection)
    pub fn eq_safe<V: Into<Bson>>(mut self, field: &str, value: V) -> Self {
        let bson_value = value.into();

        // Prevent document values that could contain operators
        if let Bson::Document(doc) = &bson_value {
            if doc.keys().any(|k| k.starts_with('$')) {
                // Wrap in $eq to prevent operator injection
                self.conditions.push(doc! { field: { "$eq": bson_value } });
                return self;
            }
        }

        self.conditions.push(doc! { field: bson_value });
        self
    }

    /// Safe regex (validates pattern)
    pub fn regex_safe(mut self, field: &str, pattern: &str, options: Option<&str>) -> Result<Self, MongoError> {
        // Validate regex pattern
        regex::Regex::new(pattern)
            .map_err(|e| MongoError::InvalidDocument {
                message: format!("Invalid regex pattern: {}", e),
            })?;

        let regex_doc = match options {
            Some(opts) => doc! { "$regex": pattern, "$options": opts },
            None => doc! { "$regex": pattern },
        };

        self.conditions.push(doc! { field: regex_doc });
        Ok(self)
    }
}

/// Redact sensitive fields from documents before logging
pub fn redact_document(doc: &Document, sensitive_fields: &[&str]) -> Document {
    let mut redacted = doc.clone();

    for field in sensitive_fields {
        if redacted.contains_key(*field) {
            redacted.insert(*field, "[REDACTED]");
        }
    }

    redacted
}

/// Default sensitive fields to redact
pub const DEFAULT_SENSITIVE_FIELDS: &[&str] = &[
    "password",
    "secret",
    "token",
    "api_key",
    "apiKey",
    "credentials",
    "ssn",
    "credit_card",
    "creditCard",
];
```

### 4.4 Audit Logging

```rust
/// Operation audit record
#[derive(Debug, Serialize)]
pub struct AuditRecord {
    pub timestamp: DateTime<Utc>,
    pub operation: String,
    pub database: String,
    pub collection: String,
    pub user: Option<String>,
    pub source_ip: Option<String>,
    pub duration_ms: u64,
    pub result: AuditResult,
    pub filter_hash: Option<String>,
}

#[derive(Debug, Serialize)]
pub enum AuditResult {
    Success { affected: u64 },
    Error { code: String, message: String },
}

/// Audit logger
pub struct AuditLogger {
    enabled: bool,
    sensitive_fields: Vec<String>,
}

impl AuditLogger {
    pub fn log_operation(&self, record: AuditRecord) {
        if !self.enabled {
            return;
        }

        tracing::info!(
            target: "mongodb_audit",
            operation = %record.operation,
            database = %record.database,
            collection = %record.collection,
            user = ?record.user,
            duration_ms = record.duration_ms,
            result = ?record.result,
            "MongoDB operation"
        );
    }
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pool Tuning

```rust
/// Connection pool recommendations based on workload
pub struct PoolSizeRecommendation {
    pub min_size: u32,
    pub max_size: u32,
    pub rationale: String,
}

pub fn recommend_pool_size(
    expected_concurrency: u32,
    avg_operation_ms: u32,
    peak_ops_per_second: u32,
) -> PoolSizeRecommendation {
    // Little's Law: L = λ * W
    // Connections needed = requests/sec * avg_response_time_sec
    let base_connections = (peak_ops_per_second as f64 * avg_operation_ms as f64 / 1000.0).ceil() as u32;

    // Add headroom for bursts (20%)
    let with_headroom = (base_connections as f64 * 1.2).ceil() as u32;

    // Clamp to reasonable limits
    let max_size = with_headroom.clamp(10, 500);
    let min_size = (max_size / 4).max(2);

    PoolSizeRecommendation {
        min_size,
        max_size,
        rationale: format!(
            "Based on {} ops/sec with {}ms avg latency. Min {} keeps connections warm, max {} handles peak + 20% burst.",
            peak_ops_per_second, avg_operation_ms, min_size, max_size
        ),
    }
}
```

### 5.2 Query Optimization

```rust
/// Query analysis result
#[derive(Debug)]
pub struct QueryAnalysis {
    pub uses_index: bool,
    pub index_name: Option<String>,
    pub documents_examined: u64,
    pub documents_returned: u64,
    pub execution_time_ms: u64,
    pub recommendations: Vec<String>,
}

impl<T> Collection<T> {
    /// Analyze query execution plan
    pub async fn explain(&self, filter: Document, options: FindOptions) -> Result<QueryAnalysis, MongoError> {
        let explain_doc = doc! {
            "explain": {
                "find": &self.name,
                "filter": filter,
            },
            "verbosity": "executionStats"
        };

        let result = self.client.client
            .database(&self.database)
            .run_command(explain_doc, None)
            .await?;

        // Parse execution stats
        let stats = result.get_document("executionStats")?;

        let mut recommendations = Vec::new();

        let examined = stats.get_i64("totalDocsExamined").unwrap_or(0) as u64;
        let returned = stats.get_i64("nReturned").unwrap_or(0) as u64;

        // Check for collection scan
        if examined > 0 && examined > returned * 10 {
            recommendations.push(format!(
                "Collection scan detected: examined {} documents for {} results. Consider adding an index.",
                examined, returned
            ));
        }

        Ok(QueryAnalysis {
            uses_index: stats.get_str("stage").ok() != Some("COLLSCAN"),
            index_name: stats.get_str("indexName").ok().map(|s| s.to_string()),
            documents_examined: examined,
            documents_returned: returned,
            execution_time_ms: stats.get_i64("executionTimeMillis").unwrap_or(0) as u64,
            recommendations,
        })
    }
}

/// Projection optimization
pub fn optimize_projection(fields: &[&str]) -> Document {
    let mut projection = Document::new();

    // Only include requested fields (reduces network transfer)
    for field in fields {
        projection.insert(*field, 1);
    }

    // Always exclude _id unless explicitly requested
    if !fields.contains(&"_id") {
        projection.insert("_id", 0);
    }

    projection
}
```

### 5.3 Batch Operation Optimization

```rust
/// Optimal batch size calculator
pub fn optimal_batch_size(avg_doc_size_bytes: usize, network_bandwidth_mbps: u32) -> usize {
    // Target ~1MB per batch for good throughput without excessive memory
    const TARGET_BATCH_BYTES: usize = 1024 * 1024;

    // Calculate based on document size
    let size_based = TARGET_BATCH_BYTES / avg_doc_size_bytes.max(1);

    // MongoDB limit is 100,000 documents per batch
    const MAX_BATCH_SIZE: usize = 100_000;

    // Minimum batch size for efficiency
    const MIN_BATCH_SIZE: usize = 100;

    size_based.clamp(MIN_BATCH_SIZE, MAX_BATCH_SIZE)
}

/// Chunked insert for large datasets
pub async fn chunked_insert<T: Serialize + Send + Sync>(
    collection: &Collection<T>,
    documents: Vec<T>,
    chunk_size: usize,
) -> Result<InsertManyResult, MongoError> {
    let mut total_result = InsertManyResult::empty();
    let mut offset = 0;

    for chunk in documents.chunks(chunk_size) {
        let result = collection.insert_many(chunk).await?;

        // Merge results with offset
        for (idx, id) in result.inserted_ids {
            total_result.inserted_ids.insert(offset + idx, id);
        }
        offset += chunk.len();
    }

    Ok(total_result)
}
```

### 5.4 Change Stream Optimization

```rust
/// Change stream configuration for performance
pub struct ChangeStreamConfig {
    /// Pipeline to filter events server-side
    pub pipeline: Vec<Document>,

    /// Batch size for cursor
    pub batch_size: u32,

    /// Full document option
    pub full_document: FullDocumentType,

    /// Maximum await time
    pub max_await_time: Duration,
}

impl Default for ChangeStreamConfig {
    fn default() -> Self {
        Self {
            pipeline: Vec::new(),
            batch_size: 100,
            full_document: FullDocumentType::UpdateLookup,
            max_await_time: Duration::from_secs(1),
        }
    }
}

impl ChangeStreamConfig {
    /// Filter for specific operation types
    pub fn filter_operations(mut self, ops: &[OperationType]) -> Self {
        let op_strings: Vec<&str> = ops.iter().map(|op| match op {
            OperationType::Insert => "insert",
            OperationType::Update => "update",
            OperationType::Replace => "replace",
            OperationType::Delete => "delete",
            _ => "other",
        }).collect();

        self.pipeline.push(doc! {
            "$match": {
                "operationType": { "$in": op_strings }
            }
        });
        self
    }

    /// Filter by field values
    pub fn filter_field(mut self, field: &str, value: impl Into<Bson>) -> Self {
        let full_path = format!("fullDocument.{}", field);
        self.pipeline.push(doc! {
            "$match": {
                full_path: value.into()
            }
        });
        self
    }

    /// Project specific fields only
    pub fn project_fields(mut self, fields: &[&str]) -> Self {
        let mut projection = doc! {
            "operationType": 1,
            "documentKey": 1,
            "clusterTime": 1,
        };

        for field in fields {
            projection.insert(format!("fullDocument.{}", field), 1);
        }

        self.pipeline.push(doc! { "$project": projection });
        self
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

    mod filter_builder {
        use super::*;

        #[test]
        fn test_eq_filter() {
            let filter = FilterBuilder::new()
                .eq("name", "test")
                .build();

            assert_eq!(filter, doc! { "name": "test" });
        }

        #[test]
        fn test_combined_filters() {
            let filter = FilterBuilder::new()
                .eq("status", "active")
                .gt("age", 18)
                .in_array("role", vec!["admin", "user"])
                .build();

            assert_eq!(filter, doc! {
                "$and": [
                    { "status": "active" },
                    { "age": { "$gt": 18 } },
                    { "role": { "$in": ["admin", "user"] } }
                ]
            });
        }

        #[test]
        fn test_regex_filter() {
            let filter = FilterBuilder::new()
                .regex("email", ".*@example\\.com")
                .build();

            assert!(filter.get_document("email").unwrap().contains_key("$regex"));
        }
    }

    mod pipeline_builder {
        use super::*;

        #[test]
        fn test_aggregation_pipeline() {
            let pipeline = PipelineBuilder::new()
                .match_stage(doc! { "status": "active" })
                .group(bson!("$region"), doc! { "count": { "$sum": 1 } })
                .sort(doc! { "count": -1 })
                .limit(10)
                .build();

            assert_eq!(pipeline.len(), 4);
            assert!(pipeline[0].contains_key("$match"));
            assert!(pipeline[1].contains_key("$group"));
            assert!(pipeline[2].contains_key("$sort"));
            assert!(pipeline[3].contains_key("$limit"));
        }
    }

    mod validation {
        use super::*;

        #[test]
        fn test_document_size_validation() {
            let small_doc = doc! { "name": "test" };
            assert!(validate_document(&small_doc).is_ok());

            // Create oversized document (>16MB)
            let large_value = "x".repeat(17 * 1024 * 1024);
            let large_doc = doc! { "data": large_value };
            assert!(matches!(
                validate_document(&large_doc),
                Err(MongoError::DocumentTooLarge { .. })
            ));
        }

        #[test]
        fn test_field_name_validation() {
            let valid = doc! { "normal_field": 1 };
            assert!(validate_document(&valid).is_ok());

            let invalid_operator = doc! { "$invalid": 1 };
            assert!(validate_document(&invalid_operator).is_err());
        }

        #[test]
        fn test_namespace_validation() {
            assert!(validate_namespace("mydb", "users").is_ok());
            assert!(validate_namespace("mydb", "system.users").is_err());
            assert!(validate_namespace("mydb", "").is_err());
        }
    }

    mod config {
        use super::*;

        #[test]
        fn test_config_validation() {
            let valid_config = MongoConfig {
                uri: "mongodb://localhost:27017".to_string(),
                default_database: "test".to_string(),
                min_pool_size: 5,
                max_pool_size: 100,
                ..Default::default()
            };
            assert!(valid_config.validate().is_ok());

            let invalid_pool = MongoConfig {
                min_pool_size: 100,
                max_pool_size: 10, // min > max
                ..valid_config.clone()
            };
            assert!(invalid_pool.validate().is_err());
        }
    }
}
```

### 6.2 Integration Tests

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;
    use testcontainers::{clients::Cli, images::mongo::Mongo};

    async fn setup_test_client() -> (MongoClient, Container<Mongo>) {
        let docker = Cli::default();
        let container = docker.run(Mongo::default());

        let uri = format!("mongodb://localhost:{}", container.get_host_port(27017));
        let config = MongoConfig {
            uri,
            default_database: "test".to_string(),
            ..Default::default()
        };

        let client = MongoClient::new(config, Arc::new(NoopCredentialProvider))
            .await
            .expect("Failed to create client");

        (client, container)
    }

    #[tokio::test]
    async fn test_crud_operations() {
        let (client, _container) = setup_test_client().await;
        let collection = client.collection::<Document>("test", "crud_test");

        // Insert
        let doc = doc! { "name": "test", "value": 42 };
        let insert_result = collection.insert_one(&doc).await.unwrap();
        assert!(insert_result.inserted_id.as_object_id().is_some());

        // Find
        let found = collection.find_one(doc! { "name": "test" }).await.unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().get_i32("value").unwrap(), 42);

        // Update
        let update_result = collection
            .update_one(doc! { "name": "test" }, doc! { "$set": { "value": 100 } })
            .await
            .unwrap();
        assert_eq!(update_result.modified_count, 1);

        // Delete
        let delete_result = collection.delete_one(doc! { "name": "test" }).await.unwrap();
        assert_eq!(delete_result.deleted_count, 1);
    }

    #[tokio::test]
    async fn test_transaction() {
        let (client, _container) = setup_test_client().await;
        let collection = client.collection::<Document>("test", "txn_test");

        let result = client.with_transaction(|mut session| async move {
            session.insert_one(&collection, &doc! { "id": 1 }).await?;
            session.insert_one(&collection, &doc! { "id": 2 }).await?;
            Ok(())
        }).await;

        assert!(result.is_ok());

        let count = collection.count_documents(doc! {}).await.unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn test_aggregation() {
        let (client, _container) = setup_test_client().await;
        let collection = client.collection::<Document>("test", "agg_test");

        // Insert test data
        collection.insert_many(&[
            doc! { "region": "us", "sales": 100 },
            doc! { "region": "us", "sales": 200 },
            doc! { "region": "eu", "sales": 150 },
        ]).await.unwrap();

        // Run aggregation
        let pipeline = PipelineBuilder::new()
            .group(bson!("$region"), doc! { "total": { "$sum": "$sales" } })
            .sort(doc! { "total": -1 })
            .build();

        let results: Vec<Document> = collection.aggregate(pipeline, None).await.unwrap();

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].get_str("_id").unwrap(), "us");
        assert_eq!(results[0].get_i32("total").unwrap(), 300);
    }

    #[tokio::test]
    async fn test_bulk_operations() {
        let (client, _container) = setup_test_client().await;
        let collection = client.collection::<Document>("test", "bulk_test");

        let result = collection.bulk_write()
            .insert(doc! { "id": 1 })
            .insert(doc! { "id": 2 })
            .update_one(doc! { "id": 1 }, doc! { "$set": { "updated": true } }, false)
            .delete_one(doc! { "id": 2 })
            .execute()
            .await
            .unwrap();

        assert_eq!(result.inserted_count, 2);
        assert_eq!(result.modified_count, 1);
        assert_eq!(result.deleted_count, 1);
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
        // Phase 1: Record
        let record_config = MongoConfig {
            simulation_mode: SimulationMode::Record,
            ..test_config()
        };

        let client = MongoClient::new(record_config, test_credentials()).await.unwrap();
        let collection = client.collection::<Document>("test", "sim_test");

        // Perform operations
        collection.insert_one(&doc! { "key": "value" }).await.unwrap();
        let found = collection.find_one(doc! { "key": "value" }).await.unwrap();
        assert!(found.is_some());

        // Save recordings
        client.simulation.save("recordings.json").await.unwrap();

        // Phase 2: Replay
        let replay_config = MongoConfig {
            simulation_mode: SimulationMode::Replay,
            ..test_config()
        };

        let replay_client = MongoClient::with_simulation(
            replay_config,
            SimulationReplayer::load("recordings.json").unwrap()
        );

        let replay_collection = replay_client.collection::<Document>("test", "sim_test");

        // Same operations should return recorded results
        let replayed = replay_collection.find_one(doc! { "key": "value" }).await.unwrap();
        assert!(replayed.is_some());
        assert_eq!(replayed.unwrap().get_str("key").unwrap(), "value");
    }
}
```

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions

```yaml
name: MongoDB Integration CI

on:
  push:
    branches: [main]
    paths:
      - 'integrations/mongodb/**'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/mongodb/**'

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
        working-directory: integrations/mongodb

      - name: Run Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings
        working-directory: integrations/mongodb

  test:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:6.0
        ports:
          - 27017:27017
        options: >-
          --health-cmd "mongosh --eval 'db.runCommand({ ping: 1 })'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

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
        working-directory: integrations/mongodb
        env:
          MONGODB_URI: mongodb://localhost:27017

      - name: Run integration tests
        run: cargo test --test '*' -- --test-threads=1
        working-directory: integrations/mongodb
        env:
          MONGODB_URI: mongodb://localhost:27017
          MONGODB_TEST_DATABASE: integration_test

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
        working-directory: integrations/mongodb

  coverage:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:6.0
        ports:
          - 27017:27017

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
        working-directory: integrations/mongodb
        env:
          MONGODB_URI: mongodb://localhost:27017

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: integrations/mongodb/lcov.info
          flags: mongodb

  replica-set-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start MongoDB Replica Set
        run: |
          docker-compose -f integrations/mongodb/docker/docker-compose.rs.yml up -d
          sleep 30  # Wait for replica set initialization

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable

      - name: Run replica set tests
        run: cargo test --features replica-set-tests
        working-directory: integrations/mongodb
        env:
          MONGODB_URI: mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0
```

### 7.2 Docker Compose for Testing

```yaml
# docker/docker-compose.rs.yml
version: '3.8'

services:
  mongo1:
    image: mongo:6.0
    container_name: mongo1
    command: mongod --replSet rs0 --bind_ip_all
    ports:
      - "27017:27017"
    volumes:
      - mongo1_data:/data/db
    networks:
      - mongo-cluster

  mongo2:
    image: mongo:6.0
    container_name: mongo2
    command: mongod --replSet rs0 --bind_ip_all
    ports:
      - "27018:27017"
    volumes:
      - mongo2_data:/data/db
    networks:
      - mongo-cluster

  mongo3:
    image: mongo:6.0
    container_name: mongo3
    command: mongod --replSet rs0 --bind_ip_all
    ports:
      - "27019:27017"
    volumes:
      - mongo3_data:/data/db
    networks:
      - mongo-cluster

  mongo-init:
    image: mongo:6.0
    depends_on:
      - mongo1
      - mongo2
      - mongo3
    command: >
      mongosh --host mongo1:27017 --eval '
        rs.initiate({
          _id: "rs0",
          members: [
            { _id: 0, host: "mongo1:27017", priority: 2 },
            { _id: 1, host: "mongo2:27017", priority: 1 },
            { _id: 2, host: "mongo3:27017", priority: 1 }
          ]
        })
      '
    networks:
      - mongo-cluster

networks:
  mongo-cluster:
    driver: bridge

volumes:
  mongo1_data:
  mongo2_data:
  mongo3_data:
```

### 7.3 Cargo Configuration

```toml
# Cargo.toml
[package]
name = "llm-devops-mongodb"
version = "0.1.0"
edition = "2021"
authors = ["LLM DevOps Team"]
description = "MongoDB integration for LLM DevOps platform"
license = "MIT"

[dependencies]
# MongoDB driver
mongodb = { version = "2.8", features = ["tokio-runtime"] }
bson = { version = "2.9", features = ["chrono-0_4", "serde_with"] }

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

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Logging and metrics
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Security
secrecy = "0.8"
regex = "1.10"

# Utilities
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.6", features = ["v4"] }
sha2 = "0.10"

[dev-dependencies]
tokio-test = "0.4"
testcontainers = "0.15"
pretty_assertions = "1.4"
criterion = "0.5"

[features]
default = []
replica-set-tests = []
simulation = []

[[bench]]
name = "benchmarks"
harness = false
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-MONGO-REF-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*Proceed to Completion phase upon approval.*
