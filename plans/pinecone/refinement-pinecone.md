# SPARC Phase 4: Refinement - Pinecone Integration

## 1. Interface Contracts

### 1.1 Core Operations Trait
```rust
#[async_trait]
pub trait PineconeOperations: Send + Sync {
    /// Upsert vectors into the index
    async fn upsert(&self, request: UpsertRequest) -> Result<UpsertResponse, PineconeError>;

    /// Query for similar vectors
    async fn query(&self, request: QueryRequest) -> Result<QueryResponse, PineconeError>;

    /// Fetch vectors by ID
    async fn fetch(&self, request: FetchRequest) -> Result<FetchResponse, PineconeError>;

    /// Update vector metadata or values
    async fn update(&self, request: UpdateRequest) -> Result<(), PineconeError>;

    /// Delete vectors
    async fn delete(&self, request: DeleteRequest) -> Result<(), PineconeError>;

    /// Get index statistics
    async fn describe_index_stats(&self, filter: Option<MetadataFilter>) -> Result<IndexStats, PineconeError>;
}
```

### 1.2 Batch Operations Trait
```rust
#[async_trait]
pub trait BatchOperations: Send + Sync {
    /// Batch upsert with automatic chunking
    async fn batch_upsert(&self, request: BatchUpsertRequest) -> Result<BatchUpsertResponse, PineconeError>;

    /// Batch fetch vectors
    async fn batch_fetch(&self, request: BatchFetchRequest) -> Result<BatchFetchResponse, PineconeError>;

    /// Batch delete vectors
    async fn batch_delete(&self, request: BatchDeleteRequest) -> Result<BatchDeleteResponse, PineconeError>;
}

pub struct BatchUpsertRequest {
    pub namespace: Option<String>,
    pub vectors: Vec<Vector>,
    pub options: BatchOptions,
}

pub struct BatchOptions {
    pub chunk_size: usize,           // default: 100
    pub max_parallelism: usize,      // default: 4
    pub continue_on_error: bool,     // default: false
    pub progress_callback: Option<Box<dyn Fn(BatchProgress) + Send + Sync>>,
}
```

### 1.3 Query Engine Trait
```rust
#[async_trait]
pub trait QueryEngine: Send + Sync {
    /// Query by vector
    async fn query_by_vector(&self, request: VectorQueryRequest) -> Result<QueryResponse, PineconeError>;

    /// Query by existing vector ID
    async fn query_by_id(&self, request: IdQueryRequest) -> Result<QueryResponse, PineconeError>;

    /// Hybrid query (dense + sparse)
    async fn hybrid_query(&self, request: HybridQueryRequest) -> Result<QueryResponse, PineconeError>;

    /// Multi-query with result merging
    async fn multi_query(&self, requests: Vec<QueryRequest>) -> Result<MergedQueryResponse, PineconeError>;
}

pub struct HybridQueryRequest {
    pub namespace: Option<String>,
    pub dense_vector: Vec<f32>,
    pub sparse_vector: SparseValues,
    pub alpha: f32,                  // Weight: 0.0 = sparse only, 1.0 = dense only
    pub top_k: u32,
    pub filter: Option<MetadataFilter>,
    pub include_metadata: bool,
}
```

### 1.4 Namespace Router Trait
```rust
#[async_trait]
pub trait NamespaceRouter: Send + Sync {
    /// Resolve namespace from context
    fn resolve_namespace(&self, context: &OperationContext) -> Result<String, PineconeError>;

    /// List all namespaces
    async fn list_namespaces(&self) -> Result<Vec<NamespaceInfo>, PineconeError>;

    /// Check namespace access
    fn check_access(&self, namespace: &str, operation: Operation) -> Result<(), PineconeError>;

    /// Delete all vectors in namespace
    async fn clear_namespace(&self, namespace: &str) -> Result<(), PineconeError>;
}

pub struct OperationContext {
    pub tenant_id: Option<String>,
    pub environment: Option<String>,
    pub workload: Option<String>,
    pub explicit_namespace: Option<String>,
}
```

### 1.5 RAG Retriever Trait
```rust
#[async_trait]
pub trait RAGRetriever: Send + Sync {
    /// Retrieve documents for RAG
    async fn retrieve(&self, query: RetrievalQuery) -> Result<Vec<RetrievalResult>, PineconeError>;

    /// Multi-query retrieval with deduplication
    async fn multi_retrieve(&self, queries: Vec<RetrievalQuery>) -> Result<Vec<RetrievalResult>, PineconeError>;
}

pub struct RetrievalQuery {
    pub embedding: Vec<f32>,
    pub top_k: u32,
    pub min_score: Option<f32>,
    pub filter: Option<MetadataFilter>,
    pub namespace: Option<String>,
}

pub struct RetrievalResult {
    pub id: String,
    pub score: f32,
    pub content: Option<String>,
    pub metadata: HashMap<String, MetadataValue>,
}
```

### 1.6 Simulation Layer Trait
```rust
#[async_trait]
pub trait SimulationLayer: Send + Sync {
    /// Check if in replay mode
    fn is_replay_mode(&self) -> bool;

    /// Record operation if enabled
    fn record<R: Serialize>(&self, operation: &str, request: &impl Serialize, response: &R);

    /// Get recorded response
    fn get_recorded<R: DeserializeOwned>(&self, fingerprint: &str) -> Result<R, SimulationError>;

    /// Generate operation fingerprint
    fn fingerprint(&self, operation: &str, request: &impl Serialize) -> String;

    /// Set simulation mode
    fn set_mode(&self, mode: SimulationMode);
}

#[derive(Clone, Copy, PartialEq)]
pub enum SimulationMode {
    Disabled,
    Record,
    Replay,
    PassThrough,
}
```

---

## 2. Type Definitions

### 2.1 Configuration Types
```rust
#[derive(Clone)]
pub struct PineconeConfig {
    pub api_key: SecretString,
    pub environment: String,
    pub index_name: String,
    pub project_id: Option<String>,
    pub protocol: Protocol,
    pub pool_config: PoolConfig,
    pub timeout: Duration,
    pub retry_config: RetryConfig,
    pub base_url: Option<String>,
}

#[derive(Clone)]
pub struct PoolConfig {
    pub max_connections: u32,
    pub min_connections: u32,
    pub idle_timeout: Duration,
    pub max_lifetime: Duration,
    pub acquire_timeout: Duration,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_connections: 10,
            min_connections: 1,
            idle_timeout: Duration::from_secs(300),
            max_lifetime: Duration::from_secs(1800),
            acquire_timeout: Duration::from_secs(30),
        }
    }
}

#[derive(Clone)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub initial_backoff: Duration,
    pub max_backoff: Duration,
    pub backoff_multiplier: f32,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(10),
            backoff_multiplier: 2.0,
        }
    }
}
```

### 2.2 Vector Types
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Vector {
    pub id: String,
    pub values: Vec<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sparse_values: Option<SparseValues>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SparseValues {
    pub indices: Vec<u32>,
    pub values: Vec<f32>,
}

pub type Metadata = HashMap<String, MetadataValue>;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MetadataValue {
    String(String),
    Number(f64),
    Boolean(bool),
    List(Vec<String>),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScoredVector {
    pub id: String,
    pub score: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<f32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sparse_values: Option<SparseValues>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
}
```

### 2.3 Request/Response Types
```rust
#[derive(Clone, Debug, Serialize)]
pub struct UpsertRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
    pub vectors: Vec<Vector>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpsertResponse {
    #[serde(rename = "upsertedCount")]
    pub upserted_count: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct QueryRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vector: Option<Vec<f32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "topK")]
    pub top_k: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<MetadataFilter>,
    #[serde(rename = "includeValues")]
    pub include_values: bool,
    #[serde(rename = "includeMetadata")]
    pub include_metadata: bool,
    #[serde(rename = "sparseVector", skip_serializing_if = "Option::is_none")]
    pub sparse_vector: Option<SparseValues>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct QueryResponse {
    pub matches: Vec<ScoredVector>,
    pub namespace: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Usage {
    #[serde(rename = "readUnits")]
    pub read_units: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct FetchRequest {
    pub ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct FetchResponse {
    pub vectors: HashMap<String, Vector>,
    pub namespace: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct UpdateRequest {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<f32>>,
    #[serde(rename = "sparseValues", skip_serializing_if = "Option::is_none")]
    pub sparse_values: Option<SparseValues>,
    #[serde(rename = "setMetadata", skip_serializing_if = "Option::is_none")]
    pub set_metadata: Option<Metadata>,
}

#[derive(Clone, Debug, Serialize)]
pub struct DeleteRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<MetadataFilter>,
    #[serde(rename = "deleteAll", skip_serializing_if = "std::ops::Not::not")]
    pub delete_all: bool,
}
```

### 2.4 Filter Types
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MetadataFilter {
    #[serde(flatten)]
    pub condition: FilterCondition,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FilterCondition {
    And {
        #[serde(rename = "$and")]
        conditions: Vec<FilterCondition>,
    },
    Or {
        #[serde(rename = "$or")]
        conditions: Vec<FilterCondition>,
    },
    Field(HashMap<String, FieldCondition>),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FieldCondition {
    #[serde(rename = "$eq", skip_serializing_if = "Option::is_none")]
    pub eq: Option<MetadataValue>,
    #[serde(rename = "$ne", skip_serializing_if = "Option::is_none")]
    pub ne: Option<MetadataValue>,
    #[serde(rename = "$gt", skip_serializing_if = "Option::is_none")]
    pub gt: Option<f64>,
    #[serde(rename = "$gte", skip_serializing_if = "Option::is_none")]
    pub gte: Option<f64>,
    #[serde(rename = "$lt", skip_serializing_if = "Option::is_none")]
    pub lt: Option<f64>,
    #[serde(rename = "$lte", skip_serializing_if = "Option::is_none")]
    pub lte: Option<f64>,
    #[serde(rename = "$in", skip_serializing_if = "Option::is_none")]
    pub r#in: Option<Vec<MetadataValue>>,
    #[serde(rename = "$nin", skip_serializing_if = "Option::is_none")]
    pub nin: Option<Vec<MetadataValue>>,
}

/// Fluent filter builder
pub struct FilterBuilder {
    conditions: Vec<FilterCondition>,
    operator: LogicalOperator,
}

impl FilterBuilder {
    pub fn new() -> Self {
        Self {
            conditions: Vec::new(),
            operator: LogicalOperator::And,
        }
    }

    pub fn eq(mut self, field: &str, value: impl Into<MetadataValue>) -> Self {
        self.conditions.push(FilterCondition::Field(
            [(field.to_string(), FieldCondition { eq: Some(value.into()), ..Default::default() })]
                .into_iter()
                .collect()
        ));
        self
    }

    pub fn gt(mut self, field: &str, value: f64) -> Self {
        self.conditions.push(FilterCondition::Field(
            [(field.to_string(), FieldCondition { gt: Some(value), ..Default::default() })]
                .into_iter()
                .collect()
        ));
        self
    }

    pub fn r#in(mut self, field: &str, values: Vec<MetadataValue>) -> Self {
        self.conditions.push(FilterCondition::Field(
            [(field.to_string(), FieldCondition { r#in: Some(values), ..Default::default() })]
                .into_iter()
                .collect()
        ));
        self
    }

    pub fn and(mut self) -> Self {
        self.operator = LogicalOperator::And;
        self
    }

    pub fn or(mut self) -> Self {
        self.operator = LogicalOperator::Or;
        self
    }

    pub fn build(self) -> MetadataFilter {
        let condition = match self.operator {
            LogicalOperator::And => FilterCondition::And { conditions: self.conditions },
            LogicalOperator::Or => FilterCondition::Or { conditions: self.conditions },
        };
        MetadataFilter { condition }
    }
}
```

### 2.5 Index Types
```rust
#[derive(Clone, Debug, Deserialize)]
pub struct IndexStats {
    pub namespaces: HashMap<String, NamespaceStats>,
    pub dimension: u32,
    #[serde(rename = "indexFullness")]
    pub index_fullness: f32,
    #[serde(rename = "totalVectorCount")]
    pub total_vector_count: u64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct NamespaceStats {
    #[serde(rename = "vectorCount")]
    pub vector_count: u64,
}

#[derive(Clone, Debug)]
pub struct NamespaceInfo {
    pub name: String,
    pub vector_count: u64,
}
```

---

## 3. Validation Rules

### 3.1 Vector Validation
```rust
pub struct VectorValidator;

impl VectorValidator {
    const MAX_ID_LENGTH: usize = 512;
    const MAX_DIMENSIONS: usize = 20_000;
    const MAX_METADATA_SIZE: usize = 40_960; // 40KB

    pub fn validate(vector: &Vector) -> Result<(), ValidationError> {
        Self::validate_id(&vector.id)?;
        Self::validate_values(&vector.values)?;

        if let Some(sparse) = &vector.sparse_values {
            Self::validate_sparse(sparse)?;
        }

        if let Some(metadata) = &vector.metadata {
            Self::validate_metadata(metadata)?;
        }

        Ok(())
    }

    fn validate_id(id: &str) -> Result<(), ValidationError> {
        if id.is_empty() {
            return Err(ValidationError::EmptyVectorId);
        }
        if id.len() > Self::MAX_ID_LENGTH {
            return Err(ValidationError::VectorIdTooLong {
                length: id.len(),
                max: Self::MAX_ID_LENGTH
            });
        }
        // Must be ASCII printable
        if !id.chars().all(|c| c.is_ascii() && !c.is_ascii_control()) {
            return Err(ValidationError::InvalidVectorIdCharacters);
        }
        Ok(())
    }

    fn validate_values(values: &[f32]) -> Result<(), ValidationError> {
        if values.is_empty() {
            return Err(ValidationError::EmptyVectorValues);
        }
        if values.len() > Self::MAX_DIMENSIONS {
            return Err(ValidationError::DimensionsTooLarge {
                dimensions: values.len(),
                max: Self::MAX_DIMENSIONS,
            });
        }
        // Check for NaN or Infinity
        for (i, &v) in values.iter().enumerate() {
            if !v.is_finite() {
                return Err(ValidationError::InvalidVectorValue { index: i, value: v });
            }
        }
        Ok(())
    }

    fn validate_sparse(sparse: &SparseValues) -> Result<(), ValidationError> {
        if sparse.indices.len() != sparse.values.len() {
            return Err(ValidationError::SparseValuesMismatch {
                indices: sparse.indices.len(),
                values: sparse.values.len(),
            });
        }
        // Indices must be sorted and unique
        for window in sparse.indices.windows(2) {
            if window[0] >= window[1] {
                return Err(ValidationError::SparseIndicesNotSorted);
            }
        }
        Ok(())
    }

    fn validate_metadata(metadata: &Metadata) -> Result<(), ValidationError> {
        let size = serde_json::to_vec(metadata)
            .map(|v| v.len())
            .unwrap_or(0);

        if size > Self::MAX_METADATA_SIZE {
            return Err(ValidationError::MetadataTooLarge {
                size,
                max: Self::MAX_METADATA_SIZE,
            });
        }
        Ok(())
    }
}
```

### 3.2 Query Validation
```rust
pub struct QueryValidator;

impl QueryValidator {
    const MAX_TOP_K: u32 = 10_000;
    const MAX_FILTER_DEPTH: usize = 10;

    pub fn validate(request: &QueryRequest) -> Result<(), ValidationError> {
        // Must have vector or id
        if request.vector.is_none() && request.id.is_none() {
            return Err(ValidationError::NoQueryVector);
        }

        // Validate top_k
        if request.top_k == 0 || request.top_k > Self::MAX_TOP_K {
            return Err(ValidationError::InvalidTopK {
                value: request.top_k,
                max: Self::MAX_TOP_K,
            });
        }

        // Validate vector dimensions
        if let Some(vector) = &request.vector {
            VectorValidator::validate_values(vector)?;
        }

        // Validate filter
        if let Some(filter) = &request.filter {
            Self::validate_filter(&filter.condition, 0)?;
        }

        Ok(())
    }

    fn validate_filter(condition: &FilterCondition, depth: usize) -> Result<(), ValidationError> {
        if depth > Self::MAX_FILTER_DEPTH {
            return Err(ValidationError::FilterTooDeep { max: Self::MAX_FILTER_DEPTH });
        }

        match condition {
            FilterCondition::And { conditions } | FilterCondition::Or { conditions } => {
                if conditions.is_empty() {
                    return Err(ValidationError::EmptyFilterCondition);
                }
                for c in conditions {
                    Self::validate_filter(c, depth + 1)?;
                }
            }
            FilterCondition::Field(fields) => {
                for (name, _) in fields {
                    if name.starts_with('$') {
                        return Err(ValidationError::ReservedFieldName { name: name.clone() });
                    }
                }
            }
        }
        Ok(())
    }
}
```

### 3.3 Namespace Validation
```rust
pub struct NamespaceValidator;

impl NamespaceValidator {
    const MAX_LENGTH: usize = 64;
    const PATTERN: &'static str = r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$";

    pub fn validate(namespace: &str) -> Result<(), ValidationError> {
        if namespace.is_empty() {
            return Ok(()); // Empty namespace is default
        }

        if namespace.len() > Self::MAX_LENGTH {
            return Err(ValidationError::NamespaceTooLong {
                length: namespace.len(),
                max: Self::MAX_LENGTH,
            });
        }

        let re = regex::Regex::new(Self::PATTERN).unwrap();
        if !re.is_match(namespace) {
            return Err(ValidationError::InvalidNamespaceFormat {
                namespace: namespace.to_string(),
            });
        }

        Ok(())
    }
}
```

---

## 4. Error Handling

### 4.1 Error Types
```rust
#[derive(Debug, thiserror::Error)]
pub enum PineconeError {
    #[error("Authentication failed: {message}")]
    Authentication { message: String },

    #[error("Authorization denied: {message}")]
    Authorization { message: String },

    #[error("Resource not found: {resource}")]
    NotFound { resource: String },

    #[error("Rate limit exceeded: {message}")]
    RateLimit {
        message: String,
        retry_after: Option<Duration>,
    },

    #[error("Validation error: {0}")]
    Validation(#[from] ValidationError),

    #[error("Server error ({status}): {message}")]
    Server { status: u16, message: String },

    #[error("Connection error: {message}")]
    Connection { message: String },

    #[error("Request timeout after {duration:?}")]
    Timeout { duration: Duration },

    #[error("Serialization error: {message}")]
    Serialization { message: String },

    #[error("Pool error: {message}")]
    Pool { message: String },

    #[error("Simulation error: {0}")]
    Simulation(#[from] SimulationError),
}

#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("Vector ID cannot be empty")]
    EmptyVectorId,

    #[error("Vector ID too long: {length} > {max}")]
    VectorIdTooLong { length: usize, max: usize },

    #[error("Vector ID contains invalid characters")]
    InvalidVectorIdCharacters,

    #[error("Vector values cannot be empty")]
    EmptyVectorValues,

    #[error("Vector dimensions too large: {dimensions} > {max}")]
    DimensionsTooLarge { dimensions: usize, max: usize },

    #[error("Invalid vector value at index {index}: {value}")]
    InvalidVectorValue { index: usize, value: f32 },

    #[error("Sparse indices and values length mismatch: {indices} != {values}")]
    SparseValuesMismatch { indices: usize, values: usize },

    #[error("Sparse indices must be sorted in ascending order")]
    SparseIndicesNotSorted,

    #[error("Metadata too large: {size} > {max} bytes")]
    MetadataTooLarge { size: usize, max: usize },

    #[error("Query must include vector or id")]
    NoQueryVector,

    #[error("Invalid top_k value: {value} (max: {max})")]
    InvalidTopK { value: u32, max: u32 },

    #[error("Filter nesting too deep: max {max} levels")]
    FilterTooDeep { max: usize },

    #[error("Empty filter condition")]
    EmptyFilterCondition,

    #[error("Reserved field name: {name}")]
    ReservedFieldName { name: String },

    #[error("Namespace too long: {length} > {max}")]
    NamespaceTooLong { length: usize, max: usize },

    #[error("Invalid namespace format: {namespace}")]
    InvalidNamespaceFormat { namespace: String },

    #[error("No delete criteria provided")]
    NoDeleteCriteria,

    #[error("Too many IDs: {count} > {max}")]
    TooManyIds { count: usize, max: usize },
}

#[derive(Debug, thiserror::Error)]
pub enum SimulationError {
    #[error("Not in replay mode")]
    NotInReplayMode,

    #[error("No recorded response for fingerprint: {fingerprint}")]
    NoRecordFound { fingerprint: String },

    #[error("Deserialization failed: {message}")]
    Deserialization { message: String },

    #[error("Storage error: {message}")]
    Storage { message: String },
}
```

### 4.2 Error Classification
```rust
impl PineconeError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            PineconeError::RateLimit { .. }
                | PineconeError::Server { status, .. } if *status >= 500
                | PineconeError::Timeout { .. }
                | PineconeError::Connection { .. }
        )
    }

    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            PineconeError::RateLimit { retry_after, .. } => *retry_after,
            _ => None,
        }
    }

    pub fn error_code(&self) -> &'static str {
        match self {
            PineconeError::Authentication { .. } => "AUTHENTICATION_ERROR",
            PineconeError::Authorization { .. } => "AUTHORIZATION_ERROR",
            PineconeError::NotFound { .. } => "NOT_FOUND",
            PineconeError::RateLimit { .. } => "RATE_LIMIT_EXCEEDED",
            PineconeError::Validation(_) => "VALIDATION_ERROR",
            PineconeError::Server { .. } => "SERVER_ERROR",
            PineconeError::Connection { .. } => "CONNECTION_ERROR",
            PineconeError::Timeout { .. } => "TIMEOUT",
            PineconeError::Serialization { .. } => "SERIALIZATION_ERROR",
            PineconeError::Pool { .. } => "POOL_ERROR",
            PineconeError::Simulation(_) => "SIMULATION_ERROR",
        }
    }
}
```

---

## 5. Security Hardening

### 5.1 Secure Credential Handling
```rust
use secrecy::{ExposeSecret, SecretString};
use zeroize::Zeroizing;

pub struct SecureApiKey {
    inner: SecretString,
}

impl SecureApiKey {
    pub fn new(key: String) -> Self {
        Self {
            inner: SecretString::new(key),
        }
    }

    pub fn expose(&self) -> &str {
        self.inner.expose_secret()
    }
}

impl Drop for SecureApiKey {
    fn drop(&mut self) {
        // SecretString handles zeroization
    }
}

impl std::fmt::Debug for SecureApiKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}

// Prevent accidental logging
impl std::fmt::Display for SecureApiKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}
```

### 5.2 Request Sanitization
```rust
pub struct RequestSanitizer;

impl RequestSanitizer {
    /// Remove sensitive fields from request for logging
    pub fn sanitize_for_logging<T: Serialize>(request: &T) -> serde_json::Value {
        let mut value = serde_json::to_value(request).unwrap_or(serde_json::Value::Null);
        Self::redact_sensitive(&mut value);
        value
    }

    fn redact_sensitive(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                for (key, val) in map.iter_mut() {
                    if Self::is_sensitive_key(key) {
                        *val = serde_json::Value::String("[REDACTED]".to_string());
                    } else {
                        Self::redact_sensitive(val);
                    }
                }
            }
            serde_json::Value::Array(arr) => {
                for item in arr {
                    Self::redact_sensitive(item);
                }
            }
            _ => {}
        }
    }

    fn is_sensitive_key(key: &str) -> bool {
        let lower = key.to_lowercase();
        lower.contains("key")
            || lower.contains("secret")
            || lower.contains("password")
            || lower.contains("token")
            || lower.contains("credential")
    }
}
```

### 5.3 Namespace Access Control
```rust
pub struct NamespaceAccessControl {
    allowed_patterns: Vec<regex::Regex>,
    denied_patterns: Vec<regex::Regex>,
}

impl NamespaceAccessControl {
    pub fn new(config: AccessControlConfig) -> Result<Self, regex::Error> {
        let allowed = config
            .allowed_patterns
            .iter()
            .map(|p| regex::Regex::new(p))
            .collect::<Result<Vec<_>, _>>()?;

        let denied = config
            .denied_patterns
            .iter()
            .map(|p| regex::Regex::new(p))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self {
            allowed_patterns: allowed,
            denied_patterns: denied,
        })
    }

    pub fn check(&self, namespace: &str, operation: Operation) -> Result<(), PineconeError> {
        // Check denied first
        for pattern in &self.denied_patterns {
            if pattern.is_match(namespace) {
                return Err(PineconeError::Authorization {
                    message: format!("Access denied to namespace: {}", namespace),
                });
            }
        }

        // Check allowed
        if !self.allowed_patterns.is_empty() {
            let allowed = self.allowed_patterns.iter().any(|p| p.is_match(namespace));
            if !allowed {
                return Err(PineconeError::Authorization {
                    message: format!("Namespace not in allowed list: {}", namespace),
                });
            }
        }

        Ok(())
    }
}

#[derive(Clone, Copy)]
pub enum Operation {
    Read,
    Write,
    Delete,
}
```

---

## 6. Performance Optimizations

### 6.1 Vector Serialization
```rust
pub struct OptimizedSerializer;

impl OptimizedSerializer {
    /// Serialize vectors with minimal allocations
    pub fn serialize_vectors(vectors: &[Vector]) -> Result<Vec<u8>, PineconeError> {
        // Pre-calculate capacity
        let estimated_size = vectors.len() * 1024; // ~1KB per vector estimate
        let mut buffer = Vec::with_capacity(estimated_size);

        serde_json::to_writer(&mut buffer, vectors)
            .map_err(|e| PineconeError::Serialization { message: e.to_string() })?;

        Ok(buffer)
    }

    /// Serialize float values efficiently
    pub fn serialize_f32_vec(values: &[f32]) -> String {
        // Use ryu for fast float formatting
        let mut result = String::with_capacity(values.len() * 10);
        result.push('[');
        for (i, v) in values.iter().enumerate() {
            if i > 0 {
                result.push(',');
            }
            let mut buffer = ryu::Buffer::new();
            result.push_str(buffer.format(*v));
        }
        result.push(']');
        result
    }
}
```

### 6.2 Connection Pooling Optimization
```rust
pub struct AdaptivePoolConfig {
    base_config: PoolConfig,
    scaling_factor: f32,
    cooldown: Duration,
    last_adjustment: std::sync::atomic::AtomicU64,
}

impl AdaptivePoolConfig {
    pub fn adjust_based_on_load(&self, metrics: &PoolMetrics) -> Option<u32> {
        let utilization = metrics.in_use as f32 / metrics.total as f32;

        if utilization > 0.8 && metrics.total < self.base_config.max_connections {
            // Scale up
            let new_size = (metrics.total as f32 * self.scaling_factor).ceil() as u32;
            return Some(new_size.min(self.base_config.max_connections));
        }

        if utilization < 0.3 && metrics.total > self.base_config.min_connections {
            // Scale down
            let new_size = (metrics.total as f32 / self.scaling_factor).floor() as u32;
            return Some(new_size.max(self.base_config.min_connections));
        }

        None
    }
}
```

### 6.3 Request Coalescing
```rust
pub struct RequestCoalescer {
    pending: Arc<Mutex<HashMap<String, Vec<oneshot::Sender<QueryResponse>>>>>,
    dedup_window: Duration,
}

impl RequestCoalescer {
    pub async fn query_with_coalescing(
        &self,
        client: &PineconeClient,
        request: QueryRequest,
    ) -> Result<QueryResponse, PineconeError> {
        let key = self.request_key(&request);

        // Check for pending identical request
        let (tx, rx) = oneshot::channel();

        {
            let mut pending = self.pending.lock().await;
            if let Some(waiters) = pending.get_mut(&key) {
                // Coalesce with existing request
                waiters.push(tx);
                drop(pending);
                return rx.await.map_err(|_| PineconeError::Connection {
                    message: "Coalesced request cancelled".to_string(),
                })?;
            }
            pending.insert(key.clone(), vec![tx]);
        }

        // Execute request
        let result = client.query(request).await;

        // Notify all waiters
        let waiters = {
            let mut pending = self.pending.lock().await;
            pending.remove(&key).unwrap_or_default()
        };

        for waiter in waiters {
            let _ = waiter.send(result.clone()?);
        }

        result
    }

    fn request_key(&self, request: &QueryRequest) -> String {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();

        request.namespace.hash(&mut hasher);
        request.top_k.hash(&mut hasher);
        // Hash vector with reduced precision
        if let Some(v) = &request.vector {
            for f in v {
                ((f * 1000.0) as i64).hash(&mut hasher);
            }
        }

        format!("{:x}", hasher.finish())
    }
}
```

---

## 7. Testing Strategy

### 7.1 Unit Test Structure
```rust
#[cfg(test)]
mod tests {
    use super::*;

    mod vector_validation {
        use super::*;

        #[test]
        fn test_valid_vector() {
            let vector = Vector {
                id: "test-123".to_string(),
                values: vec![0.1, 0.2, 0.3],
                sparse_values: None,
                metadata: None,
            };
            assert!(VectorValidator::validate(&vector).is_ok());
        }

        #[test]
        fn test_empty_id_fails() {
            let vector = Vector {
                id: "".to_string(),
                values: vec![0.1],
                sparse_values: None,
                metadata: None,
            };
            assert!(matches!(
                VectorValidator::validate(&vector),
                Err(ValidationError::EmptyVectorId)
            ));
        }

        #[test]
        fn test_nan_value_fails() {
            let vector = Vector {
                id: "test".to_string(),
                values: vec![0.1, f32::NAN, 0.3],
                sparse_values: None,
                metadata: None,
            };
            assert!(matches!(
                VectorValidator::validate(&vector),
                Err(ValidationError::InvalidVectorValue { .. })
            ));
        }
    }

    mod filter_builder {
        use super::*;

        #[test]
        fn test_simple_eq_filter() {
            let filter = FilterBuilder::new()
                .eq("category", MetadataValue::String("tech".into()))
                .build();

            let json = serde_json::to_string(&filter).unwrap();
            assert!(json.contains("$eq"));
            assert!(json.contains("tech"));
        }

        #[test]
        fn test_compound_filter() {
            let filter = FilterBuilder::new()
                .eq("status", MetadataValue::String("active".into()))
                .gt("score", 0.8)
                .build();

            let json = serde_json::to_string(&filter).unwrap();
            assert!(json.contains("$and"));
        }
    }
}
```

### 7.2 Integration Test Structure
```rust
#[cfg(test)]
mod integration_tests {
    use super::*;
    use testcontainers::*;

    #[tokio::test]
    #[ignore] // Requires Pinecone credentials
    async fn test_upsert_and_query() {
        let client = create_test_client().await;

        // Upsert
        let vectors = vec![
            Vector {
                id: "test-1".to_string(),
                values: vec![0.1; 128],
                sparse_values: None,
                metadata: Some([("category".to_string(), MetadataValue::String("test".into()))].into()),
            },
        ];

        let result = client.upsert(UpsertRequest {
            namespace: Some("test".to_string()),
            vectors,
        }).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().upserted_count, 1);

        // Query
        let query_result = client.query(QueryRequest {
            namespace: Some("test".to_string()),
            vector: Some(vec![0.1; 128]),
            id: None,
            top_k: 10,
            filter: None,
            include_values: false,
            include_metadata: true,
            sparse_vector: None,
        }).await;

        assert!(query_result.is_ok());
        assert!(!query_result.unwrap().matches.is_empty());
    }
}
```

### 7.3 Simulation Tests
```rust
#[cfg(test)]
mod simulation_tests {
    use super::*;

    #[tokio::test]
    async fn test_replay_mode() {
        let storage = InMemorySimulationStorage::new();

        // Record
        storage.store(SimulationRecord {
            fingerprint: "abc123".to_string(),
            operation: "query".to_string(),
            response: serde_json::json!({
                "matches": [],
                "namespace": "test"
            }),
            timestamp: std::time::Instant::now(),
        });

        // Replay
        let sim = SimulationLayer::new(SimulationMode::Replay, storage);
        let result: QueryResponse = sim.get_recorded("abc123").unwrap();

        assert_eq!(result.namespace, "test");
    }
}
```

---

## 8. CI/CD Configuration

### 8.1 GitHub Actions Workflow
```yaml
name: Pinecone Integration CI

on:
  push:
    paths:
      - 'src/integrations/pinecone/**'
  pull_request:
    paths:
      - 'src/integrations/pinecone/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Cache dependencies
        uses: Swatinem/rust-cache@v2

      - name: Run unit tests
        run: cargo test --package pinecone-integration --lib

      - name: Run doc tests
        run: cargo test --package pinecone-integration --doc

      - name: Check formatting
        run: cargo fmt --package pinecone-integration -- --check

      - name: Run clippy
        run: cargo clippy --package pinecone-integration -- -D warnings

  integration-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: test
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Run integration tests
        env:
          PINECONE_API_KEY: ${{ secrets.PINECONE_API_KEY }}
          PINECONE_ENVIRONMENT: ${{ secrets.PINECONE_ENVIRONMENT }}
          PINECONE_INDEX: ${{ secrets.PINECONE_INDEX }}
        run: cargo test --package pinecone-integration --test integration -- --ignored

  benchmark:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: test
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Run benchmarks
        run: cargo bench --package pinecone-integration

      - name: Upload benchmark results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: target/criterion
```

### 8.2 Cargo Configuration
```toml
[package]
name = "pinecone-integration"
version = "0.1.0"
edition = "2021"

[dependencies]
async-trait = "0.1"
deadpool = "0.10"
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
secrecy = { version = "0.8", features = ["serde"] }
zeroize = "1.7"
thiserror = "1.0"
tracing = "0.1"
tokio = { version = "1", features = ["full"] }
regex = "1"
sha2 = "0.10"
ryu = "1.0"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
criterion = "0.5"
testcontainers = "0.15"

[[bench]]
name = "pinecone_bench"
harness = false
```
