# Google Cloud Storage Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcs`

---

## 1. Detailed Interface Specifications

### 1.1 Core Client Interface (Rust)

```rust
/// Main GCS client - entry point for all operations
pub struct GcsClient {
    config: GcsConfig,
    auth: Arc<dyn GcpAuthProvider>,
    transport: Arc<dyn HttpTransport>,
    circuit_breaker: CircuitBreaker,
    metrics: MetricsCollector,
}

impl GcsClient {
    /// Create a new client with configuration
    pub fn new(config: GcsConfig) -> Result<Self, GcsError>;

    /// Create using builder pattern
    pub fn builder() -> GcsClientBuilder;

    /// Access objects operations
    pub fn objects(&self) -> &ObjectsService;

    /// Access bucket operations
    pub fn buckets(&self) -> &BucketsService;

    /// Access streaming operations
    pub fn streaming(&self) -> &StreamingService;

    /// Access URL signing
    pub fn signing(&self) -> &SigningService;

    /// Create a simulation/mock client
    pub fn mock() -> MockGcsClient;
}

/// Builder for GcsClient
pub struct GcsClientBuilder {
    project_id: Option<String>,
    credentials: Option<GcpCredentials>,
    timeout: Duration,
    retry_config: RetryConfig,
    circuit_breaker_config: CircuitBreakerConfig,
    upload_chunk_size: usize,
    download_buffer_size: usize,
}

impl GcsClientBuilder {
    pub fn new() -> Self;
    pub fn project_id(self, id: impl Into<String>) -> Self;
    pub fn credentials(self, creds: GcpCredentials) -> Self;
    pub fn timeout(self, timeout: Duration) -> Self;
    pub fn retry_config(self, config: RetryConfig) -> Self;
    pub fn circuit_breaker_config(self, config: CircuitBreakerConfig) -> Self;
    pub fn upload_chunk_size(self, size: usize) -> Self;
    pub fn download_buffer_size(self, size: usize) -> Self;
    pub fn build(self) -> Result<GcsClient, GcsError>;
}
```

### 1.2 Objects Service Interface

```rust
#[async_trait]
pub trait ObjectsServiceTrait: Send + Sync {
    /// Upload an object (auto-selects simple vs resumable)
    async fn insert(&self, request: InsertObjectRequest) -> Result<ObjectMetadata, GcsError>;

    /// Get object data and metadata
    async fn get(&self, request: GetObjectRequest) -> Result<Object, GcsError>;

    /// Get object metadata only (HEAD)
    async fn get_metadata(&self, request: GetMetadataRequest) -> Result<ObjectMetadata, GcsError>;

    /// Delete an object
    async fn delete(&self, request: DeleteObjectRequest) -> Result<(), GcsError>;

    /// Copy an object
    async fn copy(&self, request: CopyObjectRequest) -> Result<ObjectMetadata, GcsError>;

    /// Compose multiple objects into one
    async fn compose(&self, request: ComposeObjectsRequest) -> Result<ObjectMetadata, GcsError>;

    /// List objects in a bucket
    async fn list(&self, request: ListObjectsRequest) -> Result<ListObjectsResponse, GcsError>;

    /// List all objects (auto-pagination)
    fn list_all(&self, request: ListObjectsRequest) -> impl Stream<Item = Result<ObjectMetadata, GcsError>>;

    /// Update object metadata
    async fn patch(&self, request: PatchObjectRequest) -> Result<ObjectMetadata, GcsError>;
}
```

### 1.3 Streaming Service Interface

```rust
#[async_trait]
pub trait StreamingServiceTrait: Send + Sync {
    /// Upload from an async stream
    async fn upload_stream<S>(
        &self,
        request: UploadStreamRequest,
        stream: S,
    ) -> Result<ObjectMetadata, GcsError>
    where
        S: Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static;

    /// Download as an async stream
    async fn download_stream(
        &self,
        request: DownloadStreamRequest,
    ) -> Result<BoxStream<'static, Result<Bytes, GcsError>>, GcsError>;

    /// Download a byte range
    async fn download_range(
        &self,
        request: DownloadRangeRequest,
    ) -> Result<Bytes, GcsError>;

    /// Create a resumable upload session
    async fn create_resumable_upload(
        &self,
        request: CreateResumableUploadRequest,
    ) -> Result<ResumableUploadSession, GcsError>;
}

/// Resumable upload session handle
pub struct ResumableUploadSession {
    uri: String,
    bucket: String,
    object_name: String,
    total_size: u64,
    bytes_uploaded: u64,
}

impl ResumableUploadSession {
    /// Upload a chunk
    pub async fn upload_chunk(&mut self, data: Bytes) -> Result<ChunkResult, GcsError>;

    /// Query current upload status
    pub async fn query_status(&self) -> Result<UploadStatus, GcsError>;

    /// Abort the upload
    pub async fn abort(self) -> Result<(), GcsError>;

    /// Get bytes uploaded so far
    pub fn bytes_uploaded(&self) -> u64;

    /// Check if upload is complete
    pub fn is_complete(&self) -> bool;
}
```

### 1.4 Signing Service Interface

```rust
pub trait SigningServiceTrait: Send + Sync {
    /// Generate a signed URL for download
    fn sign_download_url(&self, request: SignDownloadUrlRequest) -> Result<SignedUrl, GcsError>;

    /// Generate a signed URL for upload
    fn sign_upload_url(&self, request: SignUploadUrlRequest) -> Result<SignedUrl, GcsError>;

    /// Generate a signed URL for any method
    fn sign_url(&self, request: SignUrlRequest) -> Result<SignedUrl, GcsError>;
}

/// Signed URL with metadata
pub struct SignedUrl {
    /// The signed URL
    pub url: String,

    /// Expiration time
    pub expires_at: DateTime<Utc>,

    /// HTTP method this URL is valid for
    pub method: HttpMethod,

    /// Required headers (for upload URLs)
    pub required_headers: HashMap<String, String>,
}
```

---

## 2. Request/Response Types

### 2.1 Object Operations

```rust
/// Request to insert (upload) an object
#[derive(Clone, Debug)]
pub struct InsertObjectRequest {
    /// Target bucket
    pub bucket: String,

    /// Object name (path)
    pub name: String,

    /// Object data
    pub data: Bytes,

    /// Content type (MIME)
    pub content_type: Option<String>,

    /// Content encoding (e.g., gzip)
    pub content_encoding: Option<String>,

    /// Content disposition
    pub content_disposition: Option<String>,

    /// Cache control header
    pub cache_control: Option<String>,

    /// Custom metadata (x-goog-meta-*)
    pub metadata: HashMap<String, String>,

    /// Predefined ACL
    pub predefined_acl: Option<PredefinedAcl>,

    /// Conditional: only if generation matches
    pub if_generation_match: Option<i64>,

    /// Conditional: only if generation doesn't match
    pub if_generation_not_match: Option<i64>,

    /// Conditional: only if metageneration matches
    pub if_metageneration_match: Option<i64>,
}

impl InsertObjectRequest {
    pub fn new(bucket: impl Into<String>, name: impl Into<String>, data: Bytes) -> Self;
    pub fn content_type(self, ct: impl Into<String>) -> Self;
    pub fn metadata(self, key: impl Into<String>, value: impl Into<String>) -> Self;
    pub fn if_generation_match(self, gen: i64) -> Self;
}

/// Request to get an object
#[derive(Clone, Debug)]
pub struct GetObjectRequest {
    pub bucket: String,
    pub object: String,
    pub generation: Option<i64>,
    pub if_generation_match: Option<i64>,
    pub if_generation_not_match: Option<i64>,
    pub if_metageneration_match: Option<i64>,
}

/// Request to delete an object
#[derive(Clone, Debug)]
pub struct DeleteObjectRequest {
    pub bucket: String,
    pub object: String,
    pub generation: Option<i64>,
    pub if_generation_match: Option<i64>,
    pub if_metageneration_match: Option<i64>,
}

/// Request to copy an object
#[derive(Clone, Debug)]
pub struct CopyObjectRequest {
    pub source_bucket: String,
    pub source_object: String,
    pub source_generation: Option<i64>,
    pub destination_bucket: String,
    pub destination_object: String,
    pub metadata: Option<HashMap<String, String>>,
    pub content_type: Option<String>,
    pub if_generation_match: Option<i64>,
    pub if_source_generation_match: Option<i64>,
}

/// Request to compose objects
#[derive(Clone, Debug)]
pub struct ComposeObjectsRequest {
    pub bucket: String,
    pub destination_object: String,
    pub source_objects: Vec<SourceObject>,
    pub content_type: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub if_generation_match: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct SourceObject {
    pub name: String,
    pub generation: Option<i64>,
}

/// Request to list objects
#[derive(Clone, Debug, Default)]
pub struct ListObjectsRequest {
    pub bucket: String,
    pub prefix: Option<String>,
    pub delimiter: Option<String>,
    pub max_results: Option<u32>,
    pub page_token: Option<String>,
    pub versions: bool,
    pub start_offset: Option<String>,
    pub end_offset: Option<String>,
    pub include_trailing_delimiter: bool,
}

/// Response from list objects
#[derive(Clone, Debug)]
pub struct ListObjectsResponse {
    pub items: Vec<ObjectMetadata>,
    pub prefixes: Vec<String>,
    pub next_page_token: Option<String>,
}
```

### 2.2 Object Metadata

```rust
/// Full object with data
#[derive(Clone)]
pub struct Object {
    pub metadata: ObjectMetadata,
    pub data: Bytes,
}

/// Object metadata (without data)
#[derive(Clone, Debug)]
pub struct ObjectMetadata {
    /// Object name
    pub name: String,

    /// Bucket name
    pub bucket: String,

    /// Generation (version)
    pub generation: i64,

    /// Metageneration (metadata version)
    pub metageneration: i64,

    /// Content type
    pub content_type: String,

    /// Size in bytes
    pub size: u64,

    /// MD5 hash (base64)
    pub md5_hash: Option<String>,

    /// CRC32c checksum (base64)
    pub crc32c: Option<String>,

    /// ETag
    pub etag: String,

    /// Creation time
    pub time_created: DateTime<Utc>,

    /// Last update time
    pub updated: DateTime<Utc>,

    /// Storage class
    pub storage_class: StorageClass,

    /// Content encoding
    pub content_encoding: Option<String>,

    /// Content disposition
    pub content_disposition: Option<String>,

    /// Content language
    pub content_language: Option<String>,

    /// Cache control
    pub cache_control: Option<String>,

    /// Custom metadata
    pub metadata: HashMap<String, String>,

    /// Self link
    pub self_link: String,

    /// Media link (download URL)
    pub media_link: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StorageClass {
    Standard,
    NearlineStorage,
    ColdlineStorage,
    ArchiveStorage,
    MultiRegional,
    Regional,
    DurableReducedAvailability,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PredefinedAcl {
    AuthenticatedRead,
    BucketOwnerFullControl,
    BucketOwnerRead,
    Private,
    ProjectPrivate,
    PublicRead,
}
```

### 2.3 Streaming Types

```rust
/// Request for streaming upload
#[derive(Clone, Debug)]
pub struct UploadStreamRequest {
    pub bucket: String,
    pub name: String,
    pub content_type: Option<String>,
    pub total_size: Option<u64>,  // Required for resumable
    pub metadata: HashMap<String, String>,
    pub chunk_size: Option<usize>,
}

/// Request for streaming download
#[derive(Clone, Debug)]
pub struct DownloadStreamRequest {
    pub bucket: String,
    pub object: String,
    pub generation: Option<i64>,
    pub buffer_size: Option<usize>,
}

/// Request for range download
#[derive(Clone, Debug)]
pub struct DownloadRangeRequest {
    pub bucket: String,
    pub object: String,
    pub generation: Option<i64>,
    pub start: u64,
    pub end: u64,  // Inclusive
}

/// Result of uploading a chunk
#[derive(Clone, Debug)]
pub enum ChunkResult {
    /// More chunks needed
    Incomplete { bytes_uploaded: u64 },
    /// Upload complete
    Complete(ObjectMetadata),
}

/// Status of a resumable upload
#[derive(Clone, Debug)]
pub enum UploadStatus {
    /// Upload in progress
    InProgress { bytes_uploaded: u64 },
    /// Upload complete
    Complete,
    /// Upload not found (expired or invalid)
    NotFound,
}
```

### 2.4 Signed URL Types

```rust
/// Request to sign a URL
#[derive(Clone, Debug)]
pub struct SignUrlRequest {
    pub bucket: String,
    pub object: String,
    pub method: HttpMethod,
    pub expires_in: Duration,
    pub content_type: Option<String>,
    pub headers: HashMap<String, String>,
    pub query_params: HashMap<String, String>,
}

/// Convenience request for download URL
#[derive(Clone, Debug)]
pub struct SignDownloadUrlRequest {
    pub bucket: String,
    pub object: String,
    pub expires_in: Duration,
    pub response_content_type: Option<String>,
    pub response_content_disposition: Option<String>,
}

/// Convenience request for upload URL
#[derive(Clone, Debug)]
pub struct SignUploadUrlRequest {
    pub bucket: String,
    pub object: String,
    pub expires_in: Duration,
    pub content_type: Option<String>,
    pub content_length: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Put,
    Post,
    Delete,
    Head,
}
```

---

## 3. TypeScript Interface Specifications

```typescript
// Main client interface
interface GcsClient {
  readonly objects: ObjectsService;
  readonly buckets: BucketsService;
  readonly streaming: StreamingService;
  readonly signing: SigningService;
}

// Objects service
interface ObjectsService {
  insert(request: InsertObjectRequest): Promise<ObjectMetadata>;
  get(request: GetObjectRequest): Promise<GcsObject>;
  getMetadata(request: GetMetadataRequest): Promise<ObjectMetadata>;
  delete(request: DeleteObjectRequest): Promise<void>;
  copy(request: CopyObjectRequest): Promise<ObjectMetadata>;
  compose(request: ComposeObjectsRequest): Promise<ObjectMetadata>;
  list(request: ListObjectsRequest): Promise<ListObjectsResponse>;
  listAll(request: ListObjectsRequest): AsyncIterable<ObjectMetadata>;
  patch(request: PatchObjectRequest): Promise<ObjectMetadata>;
}

// Streaming service
interface StreamingService {
  uploadStream(
    request: UploadStreamRequest,
    stream: ReadableStream<Uint8Array>
  ): Promise<ObjectMetadata>;

  downloadStream(request: DownloadStreamRequest): Promise<ReadableStream<Uint8Array>>;

  downloadRange(request: DownloadRangeRequest): Promise<Uint8Array>;

  createResumableUpload(
    request: CreateResumableUploadRequest
  ): Promise<ResumableUploadSession>;
}

// Signing service
interface SigningService {
  signDownloadUrl(request: SignDownloadUrlRequest): SignedUrl;
  signUploadUrl(request: SignUploadUrlRequest): SignedUrl;
  signUrl(request: SignUrlRequest): SignedUrl;
}

// Request types
interface InsertObjectRequest {
  bucket: string;
  name: string;
  data: Uint8Array | Buffer;
  contentType?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  predefinedAcl?: PredefinedAcl;
  ifGenerationMatch?: number;
  ifGenerationNotMatch?: number;
}

interface GetObjectRequest {
  bucket: string;
  object: string;
  generation?: number;
  ifGenerationMatch?: number;
}

interface ListObjectsRequest {
  bucket: string;
  prefix?: string;
  delimiter?: string;
  maxResults?: number;
  pageToken?: string;
  versions?: boolean;
  startOffset?: string;
  endOffset?: string;
}

interface ListObjectsResponse {
  items: ObjectMetadata[];
  prefixes: string[];
  nextPageToken?: string;
}

// Response types
interface ObjectMetadata {
  name: string;
  bucket: string;
  generation: number;
  metageneration: number;
  contentType: string;
  size: number;
  md5Hash?: string;
  crc32c?: string;
  etag: string;
  timeCreated: Date;
  updated: Date;
  storageClass: StorageClass;
  contentEncoding?: string;
  contentDisposition?: string;
  cacheControl?: string;
  metadata: Record<string, string>;
  selfLink: string;
  mediaLink: string;
}

interface SignedUrl {
  url: string;
  expiresAt: Date;
  method: HttpMethod;
  requiredHeaders: Record<string, string>;
}

// Configuration
interface GcsConfig {
  projectId: string;
  credentials: GcpCredentials;
  timeout?: number;
  retryConfig?: RetryConfig;
  circuitBreakerConfig?: CircuitBreakerConfig;
  uploadChunkSize?: number;
  downloadBufferSize?: number;
}

type GcpCredentials =
  | { type: 'service_account'; key: ServiceAccountKey }
  | { type: 'workload_identity' }
  | { type: 'application_default' }
  | { type: 'access_token'; token: string };

type StorageClass =
  | 'STANDARD'
  | 'NEARLINE'
  | 'COLDLINE'
  | 'ARCHIVE'
  | 'MULTI_REGIONAL'
  | 'REGIONAL';

type PredefinedAcl =
  | 'authenticatedRead'
  | 'bucketOwnerFullControl'
  | 'bucketOwnerRead'
  | 'private'
  | 'projectPrivate'
  | 'publicRead';

type HttpMethod = 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD';
```

---

## 4. Error Type Refinements

```rust
/// Top-level error type
#[derive(Debug, thiserror::Error)]
pub enum GcsError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Object error: {0}")]
    Object(#[from] ObjectError),

    #[error("Bucket error: {0}")]
    Bucket(#[from] BucketError),

    #[error("Upload error: {0}")]
    Upload(#[from] UploadError),

    #[error("Download error: {0}")]
    Download(#[from] DownloadError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),
}

impl GcsError {
    /// Whether this error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GcsError::Server(ServerError::RateLimited { .. })
                | GcsError::Server(ServerError::ServiceUnavailable { .. })
                | GcsError::Server(ServerError::InternalError { .. })
                | GcsError::Network(NetworkError::Timeout { .. })
                | GcsError::Network(NetworkError::ConnectionFailed { .. })
                | GcsError::Upload(UploadError::ChunkFailed { .. })
        )
    }

    /// Get retry-after hint if available
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GcsError::Server(ServerError::RateLimited { retry_after, .. }) => *retry_after,
            GcsError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }

    /// HTTP status code if applicable
    pub fn status_code(&self) -> Option<u16> {
        match self {
            GcsError::Object(ObjectError::NotFound { .. }) => Some(404),
            GcsError::Object(ObjectError::PreconditionFailed { .. }) => Some(412),
            GcsError::Authentication(AuthenticationError::PermissionDenied { .. }) => Some(403),
            GcsError::Authentication(AuthenticationError::TokenExpired { .. }) => Some(401),
            GcsError::Server(ServerError::RateLimited { .. }) => Some(429),
            GcsError::Server(ServerError::InternalError { .. }) => Some(500),
            GcsError::Server(ServerError::ServiceUnavailable { .. }) => Some(503),
            _ => None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ObjectError {
    #[error("Object not found: {bucket}/{object}")]
    NotFound { bucket: String, object: String },

    #[error("Precondition failed for {bucket}/{object}: {reason}")]
    PreconditionFailed { bucket: String, object: String, reason: String },

    #[error("Generation mismatch: expected {expected}, got {actual}")]
    GenerationMismatch { expected: i64, actual: i64 },

    #[error("Object too large: {size} bytes exceeds limit")]
    TooLarge { size: u64 },
}

#[derive(Debug, thiserror::Error)]
pub enum UploadError {
    #[error("Resumable upload initiation failed: {reason}")]
    InitiationFailed { reason: String },

    #[error("Chunk upload failed at byte {offset}: {reason}")]
    ChunkFailed { offset: u64, reason: String },

    #[error("Upload session expired or not found")]
    SessionExpired,

    #[error("Checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },

    #[error("Upload aborted")]
    Aborted,
}

#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    #[error("Rate limited")]
    RateLimited { retry_after: Option<Duration> },

    #[error("Service unavailable")]
    ServiceUnavailable { retry_after: Option<Duration> },

    #[error("Internal server error: {message}")]
    InternalError { message: String },

    #[error("Quota exceeded: {resource}")]
    QuotaExceeded { resource: String },
}
```

---

## 5. Integration Patterns

### 5.1 With Shared Credentials

```rust
// Using shared credential manager
use shared::credentials::GcpCredentialProvider;

let creds = GcpCredentialProvider::from_env()?;
let client = GcsClient::builder()
    .project_id("my-project")
    .credentials(GcpCredentials::from_provider(creds))
    .build()?;
```

### 5.2 With Shared Observability

```rust
// Metrics are automatically emitted via shared observability
use shared::observability::{MetricsCollector, TracingProvider};

// Client automatically uses shared metrics/tracing
let client = GcsClient::builder()
    .project_id("my-project")
    .credentials(creds)
    .build()?;

// Operations emit traces and metrics automatically
let obj = client.objects().get(GetObjectRequest {
    bucket: "my-bucket".into(),
    object: "my-object".into(),
    ..Default::default()
}).await?;
```

### 5.3 With Shared Resilience

```rust
// Custom retry and circuit breaker config
use shared::resilience::{RetryConfig, CircuitBreakerConfig};

let client = GcsClient::builder()
    .project_id("my-project")
    .credentials(creds)
    .retry_config(RetryConfig {
        max_attempts: 5,
        base_delay: Duration::from_millis(500),
        max_delay: Duration::from_secs(30),
        ..Default::default()
    })
    .circuit_breaker_config(CircuitBreakerConfig {
        failure_threshold: 10,
        success_threshold: 3,
        reset_timeout: Duration::from_secs(60),
    })
    .build()?;
```

### 5.4 Streaming Large Files

```rust
// Upload from file stream
use tokio::fs::File;
use tokio_util::io::ReaderStream;

let file = File::open("large-file.bin").await?;
let file_size = file.metadata().await?.len();
let stream = ReaderStream::new(file);

let metadata = client.streaming().upload_stream(
    UploadStreamRequest {
        bucket: "my-bucket".into(),
        name: "large-file.bin".into(),
        total_size: Some(file_size),
        content_type: Some("application/octet-stream".into()),
        ..Default::default()
    },
    stream.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
).await?;

// Download as stream
let stream = client.streaming().download_stream(
    DownloadStreamRequest {
        bucket: "my-bucket".into(),
        object: "large-file.bin".into(),
        ..Default::default()
    },
).await?;

// Process chunks as they arrive
pin_mut!(stream);
while let Some(chunk) = stream.next().await {
    let bytes = chunk?;
    process_chunk(bytes).await;
}
```

### 5.5 Simulation for Testing

```rust
#[tokio::test]
async fn test_upload_download() {
    let mock = GcsClient::mock()
        .with_object("test-bucket", "test-object", b"test data".to_vec())
        .expect_upload("test-bucket", "new-object");

    // Use mock client in tests
    let metadata = mock.objects().insert(InsertObjectRequest {
        bucket: "test-bucket".into(),
        name: "new-object".into(),
        data: Bytes::from("new data"),
        ..Default::default()
    }).await.unwrap();

    assert_eq!(metadata.name, "new-object");

    // Verify expectations
    mock.verify().unwrap();
}
```

---

## 6. Performance Tuning Guidelines

### 6.1 Chunk Size Selection

| Object Size | Recommended Chunk | Rationale |
|-------------|-------------------|-----------|
| < 5 MB | Simple upload | Single request, minimal overhead |
| 5 MB - 100 MB | 8 MB chunks | Balance between parallelism and overhead |
| 100 MB - 1 GB | 16 MB chunks | Reduce request count |
| > 1 GB | 32 MB chunks | Maximize throughput |

### 6.2 Connection Pooling

```rust
// Configure connection pool for high throughput
let client = GcsClient::builder()
    .connection_pool_config(ConnectionPoolConfig {
        max_connections_per_host: 50,
        idle_timeout: Duration::from_secs(90),
        max_idle_connections: 20,
    })
    .build()?;
```

### 6.3 Parallel Operations

```rust
// Upload multiple objects in parallel
use futures::stream::{self, StreamExt};

let uploads: Vec<InsertObjectRequest> = /* ... */;

let results: Vec<Result<ObjectMetadata, GcsError>> = stream::iter(uploads)
    .map(|req| client.objects().insert(req))
    .buffer_unordered(10)  // 10 concurrent uploads
    .collect()
    .await;
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement phase |

---

**Next Phase:** Completion - Will define acceptance criteria verification, test coverage requirements, and final documentation.
