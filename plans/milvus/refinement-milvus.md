# SPARC Phase 4: Refinement - Milvus Integration

## 1. Interface Contracts

### 1.1 Core Operations Trait
```rust
#[async_trait]
pub trait MilvusOperations: Send + Sync {
    /// Insert entities into collection
    async fn insert(&self, request: InsertRequest) -> Result<InsertResponse, MilvusError>;

    /// Upsert entities (insert or update)
    async fn upsert(&self, request: UpsertRequest) -> Result<UpsertResponse, MilvusError>;

    /// Delete entities by expression
    async fn delete(&self, request: DeleteRequest) -> Result<DeleteResponse, MilvusError>;

    /// Get entities by primary keys
    async fn get(&self, request: GetRequest) -> Result<GetResponse, MilvusError>;
}
```

### 1.2 Search Engine Trait
```rust
#[async_trait]
pub trait SearchEngine: Send + Sync {
    /// Vector similarity search
    async fn search(&self, request: SearchRequest) -> Result<SearchResponse, MilvusError>;

    /// Scalar query with filter
    async fn query(&self, request: QueryRequest) -> Result<QueryResponse, MilvusError>;

    /// Hybrid search with multiple vectors and reranking
    async fn hybrid_search(&self, request: HybridSearchRequest) -> Result<SearchResponse, MilvusError>;

    /// Range search within distance threshold
    async fn range_search(&self, request: RangeSearchRequest) -> Result<SearchResponse, MilvusError>;
}

pub struct HybridSearchRequest {
    pub collection_name: String,
    pub partition_names: Option<Vec<String>>,
    pub searches: Vec<SearchRequest>,
    pub rerank_strategy: RerankStrategy,
    pub final_top_k: u32,
    pub consistency_level: Option<ConsistencyLevel>,
}

#[derive(Clone)]
pub enum RerankStrategy {
    /// Reciprocal Rank Fusion
    RRF { k: u32 },
    /// Weighted score combination
    WeightedSum { weights: Vec<f32> },
    /// Maximum score across searches
    MaxScore,
}
```

### 1.3 Collection Manager Trait
```rust
#[async_trait]
pub trait CollectionManager: Send + Sync {
    /// List all collections
    async fn list_collections(&self) -> Result<Vec<String>, MilvusError>;

    /// Get collection schema and info
    async fn describe_collection(&self, name: &str) -> Result<CollectionInfo, MilvusError>;

    /// Get collection statistics
    async fn get_collection_stats(&self, name: &str) -> Result<CollectionStats, MilvusError>;

    /// Load collection into memory
    async fn load_collection(&self, name: &str, replica_number: Option<u32>) -> Result<(), MilvusError>;

    /// Release collection from memory
    async fn release_collection(&self, name: &str) -> Result<(), MilvusError>;

    /// Get collection load state
    async fn get_load_state(&self, name: &str) -> Result<LoadState, MilvusError>;

    /// Ensure collection is loaded (auto-load if needed)
    async fn ensure_loaded(&self, name: &str) -> Result<(), MilvusError>;
}
```

### 1.4 Partition Manager Trait
```rust
#[async_trait]
pub trait PartitionManager: Send + Sync {
    /// List partitions in collection
    async fn list_partitions(&self, collection: &str) -> Result<Vec<PartitionInfo>, MilvusError>;

    /// Load specific partitions
    async fn load_partitions(&self, collection: &str, partitions: Vec<String>) -> Result<(), MilvusError>;

    /// Release specific partitions
    async fn release_partitions(&self, collection: &str, partitions: Vec<String>) -> Result<(), MilvusError>;

    /// Get partition statistics
    async fn get_partition_stats(&self, collection: &str, partition: &str) -> Result<PartitionStats, MilvusError>;
}
```

### 1.5 Consistency Manager Trait
```rust
pub trait ConsistencyManager: Send + Sync {
    /// Get guarantee timestamp for consistency level
    fn get_guarantee_timestamp(&self, level: ConsistencyLevel) -> u64;

    /// Update session timestamp after write
    fn update_session_timestamp(&self, timestamp: u64);

    /// Get current session timestamp
    fn get_session_timestamp(&self) -> u64;
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ConsistencyLevel {
    Strong,
    Session,
    Bounded,
    Eventually,
    Customized(u64),
}

impl ConsistencyLevel {
    pub fn to_proto(&self) -> i32 {
        match self {
            Self::Strong => 0,
            Self::Session => 1,
            Self::Bounded => 2,
            Self::Eventually => 3,
            Self::Customized(_) => 4,
        }
    }
}
```

### 1.6 RAG Retriever Trait
```rust
#[async_trait]
pub trait RAGRetriever: Send + Sync {
    /// Retrieve documents for RAG
    async fn retrieve(&self, query: RetrievalQuery) -> Result<Vec<RetrievalResult>, MilvusError>;

    /// Multi-collection retrieval with fusion
    async fn multi_retrieve(
        &self,
        query: RetrievalQuery,
        collections: Vec<String>,
    ) -> Result<Vec<RetrievalResult>, MilvusError>;
}

pub struct RetrievalQuery {
    pub embedding: Vec<f32>,
    pub top_k: u32,
    pub min_score: Option<f32>,
    pub filter: Option<String>,
    pub output_fields: Vec<String>,
    pub collection: Option<String>,
    pub partitions: Option<Vec<String>>,
    pub consistency: Option<ConsistencyLevel>,
}

pub struct RetrievalResult {
    pub id: i64,
    pub score: f32,
    pub content: Option<String>,
    pub metadata: HashMap<String, FieldValue>,
}
```

### 1.7 Simulation Layer Trait
```rust
#[async_trait]
pub trait SimulationLayer: Send + Sync {
    fn is_replay_mode(&self) -> bool;
    fn record<R: Serialize>(&self, operation: &str, request: &impl Serialize, response: &R);
    fn get_recorded<R: DeserializeOwned>(&self, fingerprint: &str) -> Result<R, SimulationError>;
    fn fingerprint(&self, operation: &str, request: &impl Serialize) -> String;
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
pub struct MilvusConfig {
    pub host: String,
    pub port: u16,
    pub auth: AuthConfig,
    pub tls: Option<TlsConfig>,
    pub pool_config: PoolConfig,
    pub timeout: Duration,
    pub retry_config: RetryConfig,
    pub default_consistency: ConsistencyLevel,
    pub auto_load: bool,
}

impl Default for MilvusConfig {
    fn default() -> Self {
        Self {
            host: "localhost".to_string(),
            port: 19530,
            auth: AuthConfig::None,
            tls: None,
            pool_config: PoolConfig::default(),
            timeout: Duration::from_secs(30),
            retry_config: RetryConfig::default(),
            default_consistency: ConsistencyLevel::Session,
            auto_load: true,
        }
    }
}

#[derive(Clone)]
pub enum AuthConfig {
    None,
    Token(SecretString),
    UserPass {
        username: String,
        password: SecretString,
    },
}

#[derive(Clone)]
pub struct TlsConfig {
    pub ca_cert: Option<PathBuf>,
    pub client_cert: Option<PathBuf>,
    pub client_key: Option<PathBuf>,
    pub server_name: Option<String>,
    pub skip_verify: bool,
}

#[derive(Clone)]
pub struct PoolConfig {
    pub max_connections: u32,
    pub min_connections: u32,
    pub idle_timeout: Duration,
    pub max_lifetime: Duration,
    pub connect_timeout: Duration,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_connections: 10,
            min_connections: 1,
            idle_timeout: Duration::from_secs(300),
            max_lifetime: Duration::from_secs(1800),
            connect_timeout: Duration::from_secs(10),
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

### 2.2 Entity Types
```rust
#[derive(Clone, Debug)]
pub struct Entity {
    pub fields: HashMap<String, FieldValue>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FieldValue {
    Bool(bool),
    Int8(i8),
    Int16(i16),
    Int32(i32),
    Int64(i64),
    Float(f32),
    Double(f64),
    String(String),
    VarChar(String),
    Json(serde_json::Value),
    FloatVector(Vec<f32>),
    Float16Vector(Vec<u16>),
    BFloat16Vector(Vec<u16>),
    BinaryVector(Vec<u8>),
    SparseFloatVector(HashMap<u32, f32>),
    Array(Vec<FieldValue>),
}

impl FieldValue {
    pub fn as_float_vector(&self) -> Option<&Vec<f32>> {
        match self {
            FieldValue::FloatVector(v) => Some(v),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            FieldValue::Int64(v) => Some(*v),
            _ => None,
        }
    }

    pub fn dimension(&self) -> Option<usize> {
        match self {
            FieldValue::FloatVector(v) => Some(v.len()),
            FieldValue::BinaryVector(v) => Some(v.len() * 8),
            _ => None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct FieldData {
    pub field_name: String,
    pub field_type: FieldType,
    pub values: FieldValues,
}

#[derive(Clone, Debug)]
pub enum FieldValues {
    Bool(Vec<bool>),
    Int64(Vec<i64>),
    Float(Vec<f32>),
    Double(Vec<f64>),
    String(Vec<String>),
    Json(Vec<serde_json::Value>),
    FloatVector { dim: usize, data: Vec<f32> },
    SparseFloatVector(Vec<HashMap<u32, f32>>),
}
```

### 2.3 Search Types
```rust
#[derive(Clone, Debug)]
pub struct SearchRequest {
    pub collection_name: String,
    pub partition_names: Option<Vec<String>>,
    pub vector_field: String,
    pub vectors: Vec<Vec<f32>>,
    pub metric_type: MetricType,
    pub top_k: u32,
    pub params: SearchParams,
    pub filter: Option<String>,
    pub output_fields: Vec<String>,
    pub consistency_level: Option<ConsistencyLevel>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MetricType {
    L2,
    IP,
    Cosine,
    Jaccard,
    Hamming,
}

impl MetricType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::L2 => "L2",
            Self::IP => "IP",
            Self::Cosine => "COSINE",
            Self::Jaccard => "JACCARD",
            Self::Hamming => "HAMMING",
        }
    }
}

#[derive(Clone, Debug)]
pub struct SearchParams {
    pub index_type: IndexType,
    pub params: HashMap<String, serde_json::Value>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum IndexType {
    Flat,
    IvfFlat,
    IvfSq8,
    IvfPq,
    Hnsw,
    DiskAnn,
    AutoIndex,
}

impl SearchParams {
    pub fn for_ivf(nprobe: u32) -> Self {
        Self {
            index_type: IndexType::IvfFlat,
            params: [("nprobe".to_string(), json!(nprobe))].into(),
        }
    }

    pub fn for_hnsw(ef: u32) -> Self {
        Self {
            index_type: IndexType::Hnsw,
            params: [("ef".to_string(), json!(ef))].into(),
        }
    }

    pub fn for_diskann(search_list: u32) -> Self {
        Self {
            index_type: IndexType::DiskAnn,
            params: [("search_list".to_string(), json!(search_list))].into(),
        }
    }

    pub fn for_autoindex(level: u32) -> Self {
        Self {
            index_type: IndexType::AutoIndex,
            params: [("level".to_string(), json!(level))].into(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct SearchResponse {
    pub results: Vec<SearchHits>,
}

#[derive(Clone, Debug)]
pub struct SearchHits {
    pub ids: Vec<i64>,
    pub scores: Vec<f32>,
    pub fields: Vec<HashMap<String, FieldValue>>,
}

impl SearchHits {
    pub fn iter(&self) -> impl Iterator<Item = SearchHit<'_>> {
        self.ids.iter().enumerate().map(move |(i, id)| SearchHit {
            id: *id,
            score: self.scores.get(i).copied().unwrap_or(0.0),
            fields: self.fields.get(i),
        })
    }
}

pub struct SearchHit<'a> {
    pub id: i64,
    pub score: f32,
    pub fields: Option<&'a HashMap<String, FieldValue>>,
}
```

### 2.4 Query Types
```rust
#[derive(Clone, Debug)]
pub struct QueryRequest {
    pub collection_name: String,
    pub partition_names: Option<Vec<String>>,
    pub filter: String,
    pub output_fields: Vec<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub consistency_level: Option<ConsistencyLevel>,
}

#[derive(Clone, Debug)]
pub struct QueryResponse {
    pub entities: Vec<Entity>,
}
```

### 2.5 Collection Types
```rust
#[derive(Clone, Debug)]
pub struct CollectionInfo {
    pub name: String,
    pub description: String,
    pub schema: CollectionSchema,
    pub num_entities: i64,
    pub load_state: LoadState,
    pub created_timestamp: u64,
}

#[derive(Clone, Debug)]
pub struct CollectionSchema {
    pub fields: Vec<FieldSchema>,
    pub enable_dynamic_field: bool,
}

#[derive(Clone, Debug)]
pub struct FieldSchema {
    pub name: String,
    pub data_type: FieldType,
    pub is_primary: bool,
    pub is_partition_key: bool,
    pub max_length: Option<u32>,
    pub dimension: Option<u32>,
    pub is_auto_id: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FieldType {
    Bool,
    Int8,
    Int16,
    Int32,
    Int64,
    Float,
    Double,
    String,
    VarChar,
    Json,
    Array,
    FloatVector,
    Float16Vector,
    BFloat16Vector,
    BinaryVector,
    SparseFloatVector,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum LoadState {
    NotLoad,
    Loading,
    Loaded,
    LoadFailed,
}

#[derive(Clone, Debug)]
pub struct PartitionInfo {
    pub name: String,
    pub num_entities: i64,
    pub load_state: LoadState,
}
```

---

## 3. Validation Rules

### 3.1 Entity Validation
```rust
pub struct EntityValidator;

impl EntityValidator {
    const MAX_DIMENSIONS: usize = 32_768;
    const MAX_VARCHAR_LENGTH: usize = 65_535;
    const MAX_BATCH_SIZE: usize = 10_000;

    pub fn validate_insert(request: &InsertRequest, schema: &CollectionSchema) -> Result<(), ValidationError> {
        if request.collection_name.is_empty() {
            return Err(ValidationError::EmptyCollectionName);
        }

        if request.fields.is_empty() {
            return Err(ValidationError::NoFields);
        }

        // Validate row count consistency
        let row_counts: HashSet<usize> = request.fields.iter()
            .map(|f| f.row_count())
            .collect();

        if row_counts.len() > 1 {
            return Err(ValidationError::InconsistentRowCount);
        }

        let row_count = row_counts.into_iter().next().unwrap_or(0);
        if row_count > Self::MAX_BATCH_SIZE {
            return Err(ValidationError::BatchTooLarge {
                size: row_count,
                max: Self::MAX_BATCH_SIZE,
            });
        }

        // Validate against schema
        for field_data in &request.fields {
            Self::validate_field(field_data, schema)?;
        }

        Ok(())
    }

    fn validate_field(field: &FieldData, schema: &CollectionSchema) -> Result<(), ValidationError> {
        let field_schema = schema.fields.iter()
            .find(|f| f.name == field.field_name)
            .ok_or_else(|| ValidationError::UnknownField {
                name: field.field_name.clone(),
            })?;

        // Type check
        if field.field_type != field_schema.data_type {
            return Err(ValidationError::TypeMismatch {
                field: field.field_name.clone(),
                expected: field_schema.data_type,
                actual: field.field_type,
            });
        }

        // Dimension check for vectors
        if let (Some(expected_dim), FieldValues::FloatVector { dim, .. }) =
            (field_schema.dimension, &field.values)
        {
            if *dim != expected_dim as usize {
                return Err(ValidationError::DimensionMismatch {
                    field: field.field_name.clone(),
                    expected: expected_dim as usize,
                    actual: *dim,
                });
            }
        }

        // Length check for VarChar
        if let (Some(max_len), FieldValues::String(strings)) =
            (field_schema.max_length, &field.values)
        {
            for (i, s) in strings.iter().enumerate() {
                if s.len() > max_len as usize {
                    return Err(ValidationError::VarCharTooLong {
                        field: field.field_name.clone(),
                        index: i,
                        length: s.len(),
                        max: max_len as usize,
                    });
                }
            }
        }

        Ok(())
    }

    pub fn validate_vectors(vectors: &[Vec<f32>]) -> Result<(), ValidationError> {
        if vectors.is_empty() {
            return Err(ValidationError::NoVectors);
        }

        let dim = vectors[0].len();
        if dim > Self::MAX_DIMENSIONS {
            return Err(ValidationError::DimensionsTooLarge {
                dimensions: dim,
                max: Self::MAX_DIMENSIONS,
            });
        }

        for (i, v) in vectors.iter().enumerate() {
            if v.len() != dim {
                return Err(ValidationError::InconsistentDimensions {
                    index: i,
                    expected: dim,
                    actual: v.len(),
                });
            }

            for (j, &val) in v.iter().enumerate() {
                if !val.is_finite() {
                    return Err(ValidationError::InvalidVectorValue {
                        vector_index: i,
                        element_index: j,
                        value: val,
                    });
                }
            }
        }

        Ok(())
    }
}
```

### 3.2 Search Validation
```rust
pub struct SearchValidator;

impl SearchValidator {
    const MAX_TOP_K: u32 = 16_384;
    const MAX_NQ: usize = 16_384;

    pub fn validate(request: &SearchRequest) -> Result<(), ValidationError> {
        if request.collection_name.is_empty() {
            return Err(ValidationError::EmptyCollectionName);
        }

        if request.vector_field.is_empty() {
            return Err(ValidationError::EmptyVectorField);
        }

        if request.vectors.is_empty() {
            return Err(ValidationError::NoVectors);
        }

        if request.vectors.len() > Self::MAX_NQ {
            return Err(ValidationError::TooManyQueries {
                count: request.vectors.len(),
                max: Self::MAX_NQ,
            });
        }

        if request.top_k == 0 || request.top_k > Self::MAX_TOP_K {
            return Err(ValidationError::InvalidTopK {
                value: request.top_k,
                max: Self::MAX_TOP_K,
            });
        }

        EntityValidator::validate_vectors(&request.vectors)?;

        if let Some(filter) = &request.filter {
            ExpressionValidator::validate(filter)?;
        }

        Self::validate_search_params(&request.params)?;

        Ok(())
    }

    fn validate_search_params(params: &SearchParams) -> Result<(), ValidationError> {
        match params.index_type {
            IndexType::IvfFlat | IndexType::IvfSq8 | IndexType::IvfPq => {
                if let Some(nprobe) = params.params.get("nprobe") {
                    let nprobe = nprobe.as_u64().unwrap_or(0) as u32;
                    if nprobe == 0 || nprobe > 65536 {
                        return Err(ValidationError::InvalidSearchParam {
                            param: "nprobe".to_string(),
                            message: "nprobe must be between 1 and 65536".to_string(),
                        });
                    }
                }
            }
            IndexType::Hnsw => {
                if let Some(ef) = params.params.get("ef") {
                    let ef = ef.as_u64().unwrap_or(0) as u32;
                    if ef == 0 || ef > 32768 {
                        return Err(ValidationError::InvalidSearchParam {
                            param: "ef".to_string(),
                            message: "ef must be between 1 and 32768".to_string(),
                        });
                    }
                }
            }
            _ => {}
        }

        Ok(())
    }
}
```

### 3.3 Expression Validation
```rust
pub struct ExpressionValidator;

impl ExpressionValidator {
    const MAX_LENGTH: usize = 65_536;
    const RESERVED_KEYWORDS: &'static [&'static str] = &[
        "and", "or", "not", "in", "like", "between",
    ];

    pub fn validate(expr: &str) -> Result<(), ValidationError> {
        if expr.is_empty() {
            return Err(ValidationError::EmptyExpression);
        }

        if expr.len() > Self::MAX_LENGTH {
            return Err(ValidationError::ExpressionTooLong {
                length: expr.len(),
                max: Self::MAX_LENGTH,
            });
        }

        // Basic syntax validation (balanced parentheses, quotes)
        Self::validate_balanced(expr)?;

        // Check for SQL injection patterns
        Self::check_injection(expr)?;

        Ok(())
    }

    fn validate_balanced(expr: &str) -> Result<(), ValidationError> {
        let mut paren_count = 0i32;
        let mut in_string = false;
        let mut string_char = ' ';

        for c in expr.chars() {
            if in_string {
                if c == string_char {
                    in_string = false;
                }
            } else {
                match c {
                    '"' | '\'' => {
                        in_string = true;
                        string_char = c;
                    }
                    '(' => paren_count += 1,
                    ')' => {
                        paren_count -= 1;
                        if paren_count < 0 {
                            return Err(ValidationError::UnbalancedParentheses);
                        }
                    }
                    _ => {}
                }
            }
        }

        if in_string {
            return Err(ValidationError::UnterminatedString);
        }

        if paren_count != 0 {
            return Err(ValidationError::UnbalancedParentheses);
        }

        Ok(())
    }

    fn check_injection(expr: &str) -> Result<(), ValidationError> {
        let lower = expr.to_lowercase();

        // Check for dangerous patterns
        let dangerous = ["--", ";", "/*", "*/", "drop ", "delete ", "update ", "insert "];
        for pattern in dangerous {
            if lower.contains(pattern) {
                return Err(ValidationError::PotentialInjection {
                    pattern: pattern.to_string(),
                });
            }
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
pub enum MilvusError {
    #[error("Authentication failed: {message}")]
    Authentication { message: String },

    #[error("Authorization denied: {message}")]
    Authorization { message: String },

    #[error("Collection not found: {collection}")]
    CollectionNotFound { collection: String },

    #[error("Partition not found: {partition} in collection {collection}")]
    PartitionNotFound { collection: String, partition: String },

    #[error("Collection not loaded: {collection}")]
    CollectionNotLoaded { collection: String },

    #[error("Load failed for collection: {collection}")]
    LoadFailed { collection: String },

    #[error("Load timeout for collection: {collection}")]
    LoadTimeout { collection: String },

    #[error("Rate limit exceeded: {message}")]
    RateLimit { message: String },

    #[error("Validation error: {0}")]
    Validation(#[from] ValidationError),

    #[error("Server error (code={code}): {message}")]
    Server { code: i32, message: String },

    #[error("Connection error: {message}")]
    Connection { message: String },

    #[error("Request timeout after {duration:?}")]
    Timeout { duration: Duration },

    #[error("Serialization error: {message}")]
    Serialization { message: String },

    #[error("Pool error: {message}")]
    Pool { message: String },

    #[error("gRPC error: {0}")]
    Grpc(#[from] tonic::Status),

    #[error("Simulation error: {0}")]
    Simulation(#[from] SimulationError),
}

#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("Collection name cannot be empty")]
    EmptyCollectionName,

    #[error("Vector field cannot be empty")]
    EmptyVectorField,

    #[error("No fields provided")]
    NoFields,

    #[error("No vectors provided")]
    NoVectors,

    #[error("Inconsistent row count across fields")]
    InconsistentRowCount,

    #[error("Batch too large: {size} > {max}")]
    BatchTooLarge { size: usize, max: usize },

    #[error("Unknown field: {name}")]
    UnknownField { name: String },

    #[error("Type mismatch for field {field}: expected {expected:?}, got {actual:?}")]
    TypeMismatch { field: String, expected: FieldType, actual: FieldType },

    #[error("Dimension mismatch for field {field}: expected {expected}, got {actual}")]
    DimensionMismatch { field: String, expected: usize, actual: usize },

    #[error("VarChar too long for field {field} at index {index}: {length} > {max}")]
    VarCharTooLong { field: String, index: usize, length: usize, max: usize },

    #[error("Dimensions too large: {dimensions} > {max}")]
    DimensionsTooLarge { dimensions: usize, max: usize },

    #[error("Inconsistent dimensions at index {index}: expected {expected}, got {actual}")]
    InconsistentDimensions { index: usize, expected: usize, actual: usize },

    #[error("Invalid vector value at [{vector_index}][{element_index}]: {value}")]
    InvalidVectorValue { vector_index: usize, element_index: usize, value: f32 },

    #[error("Invalid top_k: {value} (max: {max})")]
    InvalidTopK { value: u32, max: u32 },

    #[error("Too many queries: {count} > {max}")]
    TooManyQueries { count: usize, max: usize },

    #[error("Invalid search parameter {param}: {message}")]
    InvalidSearchParam { param: String, message: String },

    #[error("Empty expression")]
    EmptyExpression,

    #[error("Expression too long: {length} > {max}")]
    ExpressionTooLong { length: usize, max: usize },

    #[error("Unbalanced parentheses in expression")]
    UnbalancedParentheses,

    #[error("Unterminated string in expression")]
    UnterminatedString,

    #[error("Potential injection attack detected: {pattern}")]
    PotentialInjection { pattern: String },
}

impl MilvusError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            MilvusError::RateLimit { .. }
                | MilvusError::Connection { .. }
                | MilvusError::Timeout { .. }
                | MilvusError::Grpc(status) if Self::is_retryable_grpc(status)
        )
    }

    fn is_retryable_grpc(status: &tonic::Status) -> bool {
        matches!(
            status.code(),
            tonic::Code::Unavailable
                | tonic::Code::ResourceExhausted
                | tonic::Code::Internal
                | tonic::Code::DeadlineExceeded
                | tonic::Code::Aborted
        )
    }

    pub fn should_auto_load(&self) -> bool {
        matches!(self, MilvusError::CollectionNotLoaded { .. })
    }
}
```

---

## 5. Security Hardening

### 5.1 Credential Management
```rust
use secrecy::{ExposeSecret, SecretString};
use zeroize::Zeroizing;

pub struct SecureCredentials {
    token: Option<SecretString>,
    username: Option<String>,
    password: Option<SecretString>,
}

impl SecureCredentials {
    pub fn token(token: String) -> Self {
        Self {
            token: Some(SecretString::new(token)),
            username: None,
            password: None,
        }
    }

    pub fn user_pass(username: String, password: String) -> Self {
        Self {
            token: None,
            username: Some(username),
            password: Some(SecretString::new(password)),
        }
    }

    pub fn apply_to_request<T>(&self, request: &mut tonic::Request<T>) {
        let metadata = request.metadata_mut();

        if let Some(token) = &self.token {
            metadata.insert(
                "authorization",
                format!("Bearer {}", token.expose_secret()).parse().unwrap(),
            );
        }

        if let (Some(username), Some(password)) = (&self.username, &self.password) {
            metadata.insert("username", username.parse().unwrap());
            metadata.insert("password", password.expose_secret().parse().unwrap());
        }
    }
}

impl std::fmt::Debug for SecureCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SecureCredentials")
            .field("has_token", &self.token.is_some())
            .field("username", &self.username)
            .field("has_password", &self.password.is_some())
            .finish()
    }
}
```

### 5.2 Auth Interceptor
```rust
pub struct AuthInterceptor {
    credentials: Arc<SecureCredentials>,
}

impl AuthInterceptor {
    pub fn new(credentials: Arc<SecureCredentials>) -> Self {
        Self { credentials }
    }
}

impl tonic::service::Interceptor for AuthInterceptor {
    fn call(&mut self, mut request: tonic::Request<()>) -> Result<tonic::Request<()>, tonic::Status> {
        self.credentials.apply_to_request(&mut request);
        Ok(request)
    }
}
```

### 5.3 Expression Sanitization
```rust
pub struct ExpressionBuilder {
    parts: Vec<String>,
}

impl ExpressionBuilder {
    pub fn new() -> Self {
        Self { parts: Vec::new() }
    }

    /// Safe equality condition with value escaping
    pub fn eq(mut self, field: &str, value: impl Into<ExprValue>) -> Self {
        let escaped = value.into().escape();
        self.parts.push(format!("{} == {}", Self::escape_field(field), escaped));
        self
    }

    /// Safe IN condition
    pub fn r#in(mut self, field: &str, values: Vec<impl Into<ExprValue>>) -> Self {
        let escaped: Vec<String> = values.into_iter().map(|v| v.into().escape()).collect();
        self.parts.push(format!("{} in [{}]", Self::escape_field(field), escaped.join(", ")));
        self
    }

    /// Range condition
    pub fn between(mut self, field: &str, min: f64, max: f64) -> Self {
        self.parts.push(format!(
            "{} >= {} and {} <= {}",
            Self::escape_field(field), min,
            Self::escape_field(field), max
        ));
        self
    }

    pub fn and(mut self) -> Self {
        if !self.parts.is_empty() {
            self.parts.push("and".to_string());
        }
        self
    }

    pub fn or(mut self) -> Self {
        if !self.parts.is_empty() {
            self.parts.push("or".to_string());
        }
        self
    }

    pub fn build(self) -> String {
        self.parts.join(" ")
    }

    fn escape_field(field: &str) -> String {
        // Only allow alphanumeric and underscore
        if field.chars().all(|c| c.is_alphanumeric() || c == '_') {
            field.to_string()
        } else {
            panic!("Invalid field name: {}", field);
        }
    }
}

pub enum ExprValue {
    String(String),
    Int(i64),
    Float(f64),
    Bool(bool),
}

impl ExprValue {
    fn escape(&self) -> String {
        match self {
            Self::String(s) => {
                let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
                format!("\"{}\"", escaped)
            }
            Self::Int(i) => i.to_string(),
            Self::Float(f) => f.to_string(),
            Self::Bool(b) => b.to_string(),
        }
    }
}

impl From<String> for ExprValue {
    fn from(s: String) -> Self { Self::String(s) }
}
impl From<&str> for ExprValue {
    fn from(s: &str) -> Self { Self::String(s.to_string()) }
}
impl From<i64> for ExprValue {
    fn from(i: i64) -> Self { Self::Int(i) }
}
impl From<f64> for ExprValue {
    fn from(f: f64) -> Self { Self::Float(f) }
}
impl From<bool> for ExprValue {
    fn from(b: bool) -> Self { Self::Bool(b) }
}
```

---

## 6. Performance Optimizations

### 6.1 Connection Pool
```rust
pub struct GrpcConnectionPool {
    config: PoolConfig,
    endpoint: String,
    tls_config: Option<TlsConfig>,
    credentials: Arc<SecureCredentials>,
    connections: Arc<Mutex<Vec<PooledChannel>>>,
    semaphore: Arc<Semaphore>,
}

struct PooledChannel {
    channel: Channel,
    created_at: Instant,
    last_used: Instant,
    in_use: bool,
}

impl GrpcConnectionPool {
    pub async fn acquire(&self) -> Result<PoolGuard, MilvusError> {
        let _permit = self.semaphore.acquire().await
            .map_err(|_| MilvusError::Pool { message: "Pool closed".to_string() })?;

        let mut connections = self.connections.lock().await;

        // Find available connection
        for conn in connections.iter_mut() {
            if !conn.in_use && !self.is_expired(conn) {
                conn.in_use = true;
                conn.last_used = Instant::now();
                return Ok(PoolGuard {
                    pool: self.clone(),
                    channel: conn.channel.clone(),
                });
            }
        }

        // Create new connection
        if connections.len() < self.config.max_connections as usize {
            let channel = self.create_channel().await?;
            let conn = PooledChannel {
                channel: channel.clone(),
                created_at: Instant::now(),
                last_used: Instant::now(),
                in_use: true,
            };
            connections.push(conn);
            return Ok(PoolGuard {
                pool: self.clone(),
                channel,
            });
        }

        Err(MilvusError::Pool { message: "No available connections".to_string() })
    }

    async fn create_channel(&self) -> Result<Channel, MilvusError> {
        let mut builder = Channel::from_shared(self.endpoint.clone())
            .map_err(|e| MilvusError::Connection { message: e.to_string() })?
            .timeout(Duration::from_secs(30))
            .connect_timeout(self.config.connect_timeout);

        if let Some(tls) = &self.tls_config {
            let tls_config = Self::build_tls_config(tls)?;
            builder = builder.tls_config(tls_config)
                .map_err(|e| MilvusError::Connection { message: e.to_string() })?;
        }

        builder.connect().await
            .map_err(|e| MilvusError::Connection { message: e.to_string() })
    }

    fn is_expired(&self, conn: &PooledChannel) -> bool {
        let now = Instant::now();
        now.duration_since(conn.created_at) > self.config.max_lifetime
            || (!conn.in_use && now.duration_since(conn.last_used) > self.config.idle_timeout)
    }
}
```

### 6.2 Batch Chunking
```rust
pub struct BatchChunker;

impl BatchChunker {
    const DEFAULT_CHUNK_SIZE: usize = 10_000;

    pub fn chunk_insert(
        request: InsertRequest,
        chunk_size: Option<usize>,
    ) -> Vec<InsertRequest> {
        let chunk_size = chunk_size.unwrap_or(Self::DEFAULT_CHUNK_SIZE);
        let row_count = request.fields.first()
            .map(|f| f.row_count())
            .unwrap_or(0);

        if row_count <= chunk_size {
            return vec![request];
        }

        let num_chunks = (row_count + chunk_size - 1) / chunk_size;
        let mut chunks = Vec::with_capacity(num_chunks);

        for i in 0..num_chunks {
            let start = i * chunk_size;
            let end = ((i + 1) * chunk_size).min(row_count);

            let chunked_fields: Vec<FieldData> = request.fields.iter()
                .map(|f| f.slice(start, end))
                .collect();

            chunks.push(InsertRequest {
                collection_name: request.collection_name.clone(),
                partition_name: request.partition_name.clone(),
                fields: chunked_fields,
            });
        }

        chunks
    }
}
```

### 6.3 Result Reranking
```rust
pub struct ResultReranker;

impl ResultReranker {
    pub fn rrf_fusion(results: Vec<SearchHits>, k: u32) -> SearchHits {
        let mut scores: HashMap<i64, f32> = HashMap::new();
        let mut fields_map: HashMap<i64, HashMap<String, FieldValue>> = HashMap::new();

        for result in &results {
            for (rank, hit) in result.iter().enumerate() {
                let rrf_score = 1.0 / (k as f32 + rank as f32 + 1.0);
                *scores.entry(hit.id).or_insert(0.0) += rrf_score;

                if let Some(f) = hit.fields {
                    fields_map.entry(hit.id).or_insert_with(|| f.clone());
                }
            }
        }

        let mut sorted: Vec<_> = scores.into_iter().collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        SearchHits {
            ids: sorted.iter().map(|(id, _)| *id).collect(),
            scores: sorted.iter().map(|(_, score)| *score).collect(),
            fields: sorted.iter()
                .map(|(id, _)| fields_map.remove(id).unwrap_or_default())
                .collect(),
        }
    }

    pub fn weighted_fusion(results: Vec<SearchHits>, weights: &[f32]) -> SearchHits {
        let mut scores: HashMap<i64, f32> = HashMap::new();
        let mut fields_map: HashMap<i64, HashMap<String, FieldValue>> = HashMap::new();

        for (result, weight) in results.iter().zip(weights.iter()) {
            for hit in result.iter() {
                *scores.entry(hit.id).or_insert(0.0) += hit.score * weight;

                if let Some(f) = hit.fields {
                    fields_map.entry(hit.id).or_insert_with(|| f.clone());
                }
            }
        }

        let mut sorted: Vec<_> = scores.into_iter().collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        SearchHits {
            ids: sorted.iter().map(|(id, _)| *id).collect(),
            scores: sorted.iter().map(|(_, score)| *score).collect(),
            fields: sorted.iter()
                .map(|(id, _)| fields_map.remove(id).unwrap_or_default())
                .collect(),
        }
    }
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;

    mod validation {
        use super::*;

        #[test]
        fn test_valid_search_request() {
            let request = SearchRequest {
                collection_name: "test".to_string(),
                vector_field: "embedding".to_string(),
                vectors: vec![vec![0.1; 128]],
                metric_type: MetricType::Cosine,
                top_k: 10,
                params: SearchParams::for_hnsw(64),
                partition_names: None,
                filter: None,
                output_fields: vec![],
                consistency_level: None,
            };

            assert!(SearchValidator::validate(&request).is_ok());
        }

        #[test]
        fn test_empty_collection_fails() {
            let request = SearchRequest {
                collection_name: "".to_string(),
                // ...
            };

            assert!(matches!(
                SearchValidator::validate(&request),
                Err(ValidationError::EmptyCollectionName)
            ));
        }

        #[test]
        fn test_expression_injection_detection() {
            assert!(ExpressionValidator::validate("id == 1; DROP TABLE users").is_err());
            assert!(ExpressionValidator::validate("id == 1 -- comment").is_err());
            assert!(ExpressionValidator::validate("id == 1").is_ok());
        }
    }

    mod reranking {
        use super::*;

        #[test]
        fn test_rrf_fusion() {
            let results1 = SearchHits {
                ids: vec![1, 2, 3],
                scores: vec![0.9, 0.8, 0.7],
                fields: vec![],
            };
            let results2 = SearchHits {
                ids: vec![2, 1, 4],
                scores: vec![0.95, 0.85, 0.75],
                fields: vec![],
            };

            let fused = ResultReranker::rrf_fusion(vec![results1, results2], 60);

            // ID 2 appears at rank 1 and rank 0, should score highest
            assert_eq!(fused.ids[0], 2);
        }
    }
}
```

### 7.2 Integration Tests
```rust
#[cfg(test)]
mod integration_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn test_insert_and_search() {
        let client = create_test_client().await;

        // Insert
        let vectors: Vec<Vec<f32>> = (0..100)
            .map(|i| vec![i as f32 / 100.0; 128])
            .collect();

        let response = client.insert(InsertRequest {
            collection_name: "test_collection".to_string(),
            partition_name: None,
            fields: vec![
                FieldData::float_vectors("embedding", 128, vectors.clone()),
            ],
        }).await.unwrap();

        assert_eq!(response.insert_count, 100);

        // Wait for indexing
        tokio::time::sleep(Duration::from_secs(2)).await;

        // Search
        let search_response = client.search(SearchRequest {
            collection_name: "test_collection".to_string(),
            vector_field: "embedding".to_string(),
            vectors: vec![vectors[0].clone()],
            metric_type: MetricType::Cosine,
            top_k: 10,
            params: SearchParams::for_hnsw(64),
            ..Default::default()
        }).await.unwrap();

        assert!(!search_response.results[0].ids.is_empty());
    }
}
```

---

## 8. CI/CD Configuration

### 8.1 GitHub Actions
```yaml
name: Milvus Integration CI

on:
  push:
    paths:
      - 'src/integrations/milvus/**'
  pull_request:
    paths:
      - 'src/integrations/milvus/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install protoc
        run: sudo apt-get install -y protobuf-compiler

      - name: Cache dependencies
        uses: Swatinem/rust-cache@v2

      - name: Run unit tests
        run: cargo test --package milvus-integration --lib

      - name: Check formatting
        run: cargo fmt --package milvus-integration -- --check

      - name: Run clippy
        run: cargo clippy --package milvus-integration -- -D warnings

  integration-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: test
    services:
      milvus:
        image: milvusdb/milvus:latest
        ports:
          - 19530:19530
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Wait for Milvus
        run: |
          timeout 60 bash -c 'until nc -z localhost 19530; do sleep 1; done'

      - name: Run integration tests
        env:
          MILVUS_HOST: localhost
          MILVUS_PORT: 19530
        run: cargo test --package milvus-integration --test integration -- --ignored
```

### 8.2 Cargo Configuration
```toml
[package]
name = "milvus-integration"
version = "0.1.0"
edition = "2021"

[dependencies]
async-trait = "0.1"
tonic = { version = "0.11", features = ["tls", "tls-roots"] }
prost = "0.12"
tokio = { version = "1", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
secrecy = { version = "0.8", features = ["serde"] }
zeroize = "1.7"
thiserror = "1.0"
tracing = "0.1"
sha2 = "0.10"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"

[build-dependencies]
tonic-build = "0.11"
```
