# Google Cloud Storage Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcs`

---

## 1. Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      LLM Dev Ops Platform                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Application │  │   ML Jobs    │  │  Artifact    │              │
│  │    Layer     │  │  (Training)  │  │   Storage    │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
│         └────────────┬────┴────────┬────────┘                       │
│                      │             │                                │
│                      ▼             ▼                                │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │                 GCS Integration Module                     │     │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │     │
│  │  │  GcsClient  │ │  Resumable  │ │  SignedUrl  │          │     │
│  │  │   (Core)    │ │  Uploader   │ │  Generator  │          │     │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘          │     │
│  │         │               │               │                  │     │
│  │         ▼               ▼               ▼                  │     │
│  │  ┌─────────────────────────────────────────────────┐      │     │
│  │  │              Service Layer                       │      │     │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐            │      │     │
│  │  │  │ Objects │ │ Buckets │ │Streaming│            │      │     │
│  │  │  │ Service │ │ Service │ │ Service │            │      │     │
│  │  │  └────┬────┘ └────┬────┘ └────┬────┘            │      │     │
│  │  └───────┼───────────┼───────────┼─────────────────┘      │     │
│  │          │           │           │                         │     │
│  │          ▼           ▼           ▼                         │     │
│  │  ┌─────────────────────────────────────────────────┐      │     │
│  │  │           Infrastructure Layer                   │      │     │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐            │      │     │
│  │  │  │  Auth   │ │  HTTP   │ │Resiltic │            │      │     │
│  │  │  │Provider │ │Transport│ │ Layer   │            │      │     │
│  │  │  └────┬────┘ └────┬────┘ └────┬────┘            │      │     │
│  │  └───────┼───────────┼───────────┼─────────────────┘      │     │
│  └──────────┼───────────┼───────────┼─────────────────────────┘     │
│             │           │           │                               │
└─────────────┼───────────┼───────────┼───────────────────────────────┘
              │           │           │
              ▼           ▼           ▼
      ┌───────────────────────────────────────────┐
      │         Shared Platform Services           │
      │  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
      │  │  Creds  │ │Observ-  │ │Resiltic │      │
      │  │ Manager │ │ ability │ │Primitiv │      │
      │  └─────────┘ └─────────┘ └─────────┘      │
      └───────────────────────────────────────────┘
              │
              ▼
      ┌───────────────────────────────────────────┐
      │         Google Cloud Storage API           │
      │    storage.googleapis.com (JSON API)       │
      └───────────────────────────────────────────┘
```

---

## 2. Module Structure

```
integrations/gcs/
├── Cargo.toml
├── src/
│   ├── lib.rs                     # Public API exports
│   │
│   ├── client/
│   │   ├── mod.rs                 # GcsClient implementation
│   │   ├── config.rs              # GcsConfig, credentials config
│   │   └── builder.rs             # GcsClientBuilder pattern
│   │
│   ├── services/
│   │   ├── mod.rs                 # Service exports
│   │   ├── objects.rs             # ObjectsService trait + impl
│   │   ├── buckets.rs             # BucketsService trait + impl
│   │   └── streaming.rs           # StreamingService for large objects
│   │
│   ├── upload/
│   │   ├── mod.rs                 # Upload exports
│   │   ├── simple.rs              # Simple (single-request) upload
│   │   ├── resumable.rs           # ResumableUpload state machine
│   │   └── multipart.rs           # Multipart upload (metadata + data)
│   │
│   ├── download/
│   │   ├── mod.rs                 # Download exports
│   │   ├── full.rs                # Full object download
│   │   ├── range.rs               # Range/partial download
│   │   └── streaming.rs           # Async streaming download
│   │
│   ├── signing/
│   │   ├── mod.rs                 # Signing exports
│   │   ├── v4.rs                  # V4 signature algorithm
│   │   └── url.rs                 # SignedUrlGenerator
│   │
│   ├── auth/
│   │   ├── mod.rs                 # Auth exports
│   │   ├── provider.rs            # GcpAuthProvider trait
│   │   ├── service_account.rs     # Service account JWT auth
│   │   ├── workload_identity.rs   # GKE workload identity
│   │   └── application_default.rs # ADC detection
│   │
│   ├── types/
│   │   ├── mod.rs                 # Type exports
│   │   ├── object.rs              # ObjectMetadata, Object
│   │   ├── bucket.rs              # BucketMetadata
│   │   ├── request.rs             # Request types
│   │   ├── response.rs            # Response types
│   │   └── error.rs               # GcsError hierarchy
│   │
│   ├── transport/
│   │   ├── mod.rs                 # Transport exports
│   │   ├── http.rs                # HttpTransport trait + impl
│   │   └── pool.rs                # Connection pooling
│   │
│   ├── simulation/
│   │   ├── mod.rs                 # Simulation exports
│   │   ├── mock.rs                # MockGcsClient
│   │   ├── recorder.rs            # Operation recorder
│   │   └── replayer.rs            # Replay from recordings
│   │
│   └── util/
│       ├── mod.rs                 # Utility exports
│       ├── encoding.rs            # URL encoding, base64
│       └── checksum.rs            # CRC32c, MD5 utilities
│
├── tests/
│   ├── integration/
│   │   ├── upload_test.rs
│   │   ├── download_test.rs
│   │   ├── list_test.rs
│   │   └── signed_url_test.rs
│   └── unit/
│       ├── signing_test.rs
│       ├── auth_test.rs
│       └── resumable_test.rs
│
└── benches/
    ├── upload_bench.rs
    └── download_bench.rs
```

---

## 3. Layer Architecture

### 3.1 Layer Responsibilities

| Layer | Components | Responsibility |
|-------|------------|----------------|
| **Client** | `GcsClient`, `GcsClientBuilder` | Public API, orchestration |
| **Service** | `ObjectsService`, `BucketsService`, `StreamingService` | Domain operations |
| **Upload** | `SimpleUpload`, `ResumableUpload` | Upload strategies |
| **Download** | `FullDownload`, `RangeDownload`, `StreamingDownload` | Download strategies |
| **Signing** | `SignedUrlGenerator`, `V4Signer` | URL signing |
| **Auth** | `GcpAuthProvider`, `ServiceAccountAuth` | Authentication |
| **Transport** | `HttpTransport`, `ConnectionPool` | HTTP communication |
| **Simulation** | `MockClient`, `Recorder`, `Replayer` | Testing support |

### 3.2 Dependency Flow

```
┌─────────────────────────────────────────────────────────┐
│                     Client Layer                         │
│  GcsClient depends on:                                  │
│    - ObjectsService, BucketsService, StreamingService   │
│    - GcpAuthProvider                                    │
│    - HttpTransport                                      │
│    - CircuitBreaker, Metrics (shared)                   │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Service Layer                         │
│  Services depend on:                                    │
│    - Upload/Download strategies                         │
│    - SignedUrlGenerator                                 │
│    - Types (Object, Bucket, Request, Response)          │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 Infrastructure Layer                     │
│  Infrastructure depends on:                             │
│    - Shared credentials (shared/credentials)            │
│    - Shared resilience (shared/resilience)              │
│    - Shared observability (shared/observability)        │
│    - External crates (reqwest, serde, etc.)             │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Upload Flow (Resumable)

```
Application
    │
    │ upload_object(bucket, name, data, size=500MB)
    ▼
┌─────────────────┐
│   GcsClient     │ ── size > 5MB? → Resumable
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ResumableUpload  │
│   .initiate()   │ ────────────────────────────────────┐
└────────┬────────┘                                     │
         │                                              │
         ▼                                              ▼
┌─────────────────┐                          ┌─────────────────┐
│  AuthProvider   │                          │  HttpTransport  │
│ get_token()     │                          │     POST        │
└────────┬────────┘                          │ ?uploadType=    │
         │                                   │  resumable      │
         │ Bearer token                      └────────┬────────┘
         │                                            │
         └──────────────────┬─────────────────────────┘
                            │
                            ▼
                  ┌─────────────────┐
                  │   GCS API       │
                  │ Returns:        │
                  │ Location: {uri} │
                  └────────┬────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Chunk Upload Loop                     │
│  ┌─────────────────┐                                    │
│  │ For each 8MB    │                                    │
│  │ chunk:          │                                    │
│  │  PUT {uri}      │ ──► GCS API ──► 308 Resume        │
│  │  Content-Range  │         │                          │
│  │  bytes X-Y/500MB│         ▼                          │
│  └─────────────────┘    200 OK (final chunk)            │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ ObjectMetadata  │ ← Returned to Application
└─────────────────┘
```

### 4.2 Download Flow (Streaming)

```
Application
    │
    │ download_stream(bucket, object)
    ▼
┌─────────────────┐
│   GcsClient     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│StreamingService │
│  download()     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│  AuthProvider   │      │  HttpTransport  │
│  get_token()    │─────▶│  GET ?alt=media │
└─────────────────┘      │  (streaming)    │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │    GCS API      │
                         │ Chunked Response│
                         └────────┬────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────┐
│                  Async Stream                            │
│  ┌─────────────────┐                                    │
│  │ While data:     │                                    │
│  │  read chunk     │ ──► Buffer(64KB) ──► yield Bytes  │
│  │  from response  │                                    │
│  └─────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
    AsyncStream<Bytes> → Application processes incrementally
```

### 4.3 Signed URL Flow

```
Application
    │
    │ generate_signed_url(bucket, object, method=GET, expires=1h)
    ▼
┌─────────────────┐
│SignedUrlGenerat │
│      or         │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│               Canonical Request Construction             │
│  1. HTTP Method: GET                                    │
│  2. Resource: /{bucket}/{object}                        │
│  3. Query params: X-Goog-Algorithm, Credential, Date... │
│  4. Headers: host:storage.googleapis.com                │
│  5. Payload: UNSIGNED-PAYLOAD                           │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ String to Sign  │
│  GOOG4-RSA-SHA256
│  {timestamp}    │
│  {scope}        │
│  SHA256(canon)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  RSA-SHA256     │
│  Sign with SA   │
│  private key    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    Signed URL                            │
│  https://storage.googleapis.com/{bucket}/{object}       │
│    ?X-Goog-Algorithm=GOOG4-RSA-SHA256                   │
│    &X-Goog-Credential={email}/{date}/auto/storage/...   │
│    &X-Goog-Date={timestamp}                             │
│    &X-Goog-Expires=3600                                 │
│    &X-Goog-SignedHeaders=host                           │
│    &X-Goog-Signature={hex_signature}                    │
└─────────────────────────────────────────────────────────┘
```

---

## 5. State Machines

### 5.1 Resumable Upload States

```
┌─────────────┐
│   Created   │ ── Initial state
└──────┬──────┘
       │ initiate()
       ▼
┌─────────────┐     initiate failed
│  Initiating │ ────────────────────► [Error]
└──────┬──────┘
       │ Location header received
       ▼
┌─────────────┐
│   Active    │ ◄─────────────────┐
└──────┬──────┘                   │
       │ upload_chunk()           │
       ▼                          │
┌─────────────┐                   │
│  Uploading  │                   │
└──────┬──────┘                   │
       │                          │
       ├── 308 Resume Incomplete ─┘
       │
       ├── 200/201 Complete ──────► [Complete]
       │
       ├── 4xx Client Error ──────► [Failed]
       │
       └── 5xx/Network Error ─────► [Recoverable]
                                          │
                                          │ query_status()
                                          ▼
                                   ┌─────────────┐
                                   │  Resuming   │
                                   └──────┬──────┘
                                          │
                                          └──► [Active] (continue from last byte)

┌─────────────┐
│   Aborted   │ ◄── abort() from any state
└─────────────┘
```

### 5.2 Auth Token States

```
┌─────────────┐
│   Initial   │
└──────┬──────┘
       │ get_token()
       ▼
┌─────────────┐
│  Fetching   │
└──────┬──────┘
       │
       ├── Success ───────────────► [Cached]
       │                               │
       └── Failure ───────────────► [Error]
                                       │
                                       │ retry (with backoff)
                                       ▼
                                   [Fetching]

┌─────────────┐
│   Cached    │
└──────┬──────┘
       │ get_token()
       │
       ├── Not expired ───────────► Return cached
       │
       └── Expired ───────────────► [Refreshing]
                                          │
                                          ├── Success ──► [Cached]
                                          │
                                          └── Failure ──► [Error]
```

---

## 6. Interface Contracts

### 6.1 Core Traits

```rust
// Main client interface
#[async_trait]
pub trait GcsClient: Send + Sync {
    fn objects(&self) -> &dyn ObjectsService;
    fn buckets(&self) -> &dyn BucketsService;
    fn streaming(&self) -> &dyn StreamingService;
    fn signing(&self) -> &dyn SigningService;
}

// Objects operations
#[async_trait]
pub trait ObjectsService: Send + Sync {
    async fn insert(&self, req: InsertObjectRequest) -> Result<ObjectMetadata, GcsError>;
    async fn get(&self, req: GetObjectRequest) -> Result<Object, GcsError>;
    async fn delete(&self, req: DeleteObjectRequest) -> Result<(), GcsError>;
    async fn copy(&self, req: CopyObjectRequest) -> Result<ObjectMetadata, GcsError>;
    async fn compose(&self, req: ComposeObjectsRequest) -> Result<ObjectMetadata, GcsError>;
    async fn list(&self, req: ListObjectsRequest) -> Result<ListObjectsResponse, GcsError>;
    async fn patch(&self, req: PatchObjectRequest) -> Result<ObjectMetadata, GcsError>;
}

// Streaming operations
#[async_trait]
pub trait StreamingService: Send + Sync {
    async fn upload_stream(
        &self,
        req: UploadStreamRequest,
        stream: impl Stream<Item = Result<Bytes, GcsError>> + Send + 'static,
    ) -> Result<ObjectMetadata, GcsError>;

    async fn download_stream(
        &self,
        req: DownloadStreamRequest,
    ) -> Result<impl Stream<Item = Result<Bytes, GcsError>>, GcsError>;
}

// URL signing
pub trait SigningService: Send + Sync {
    fn generate_signed_url(&self, req: SignedUrlRequest) -> Result<String, GcsError>;
}
```

### 6.2 Configuration

```rust
pub struct GcsConfig {
    pub project_id: String,
    pub credentials: GcpCredentials,
    pub timeout: Duration,
    pub retry_config: RetryConfig,
    pub circuit_breaker_config: CircuitBreakerConfig,
    pub upload_chunk_size: usize,      // Default: 8MB
    pub download_buffer_size: usize,   // Default: 64KB
    pub simple_upload_threshold: u64,  // Default: 5MB
}

pub enum GcpCredentials {
    ServiceAccount(ServiceAccountKey),
    WorkloadIdentity,
    ApplicationDefault,
    AccessToken(SecretString),  // For testing
}
```

---

## 7. Error Handling Strategy

### 7.1 Error Propagation

```
┌─────────────────────────────────────────────────────────┐
│                    Application                           │
│  Receives: GcsError (typed, actionable)                 │
└─────────────────────────┬───────────────────────────────┘
                          ▲
                          │ map_error()
┌─────────────────────────┴───────────────────────────────┐
│                    Client Layer                          │
│  Catches: ServiceError, TransportError                  │
│  Maps to: GcsError with context                         │
│  Adds: bucket, object, operation context                │
└─────────────────────────┬───────────────────────────────┘
                          ▲
                          │
┌─────────────────────────┴───────────────────────────────┐
│                   Service Layer                          │
│  Catches: HTTP errors, Parse errors                     │
│  Maps to: ServiceError                                  │
│  Handles: Retry decisions                               │
└─────────────────────────┬───────────────────────────────┘
                          ▲
                          │
┌─────────────────────────┴───────────────────────────────┐
│                  Transport Layer                         │
│  Catches: Network errors, TLS errors                    │
│  Returns: TransportError                                │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Retry Decision Tree

```
Error received
    │
    ├── Is AuthenticationError?
    │       │
    │       ├── TokenExpired → Refresh token, retry once
    │       │
    │       └── Other auth → Don't retry, propagate
    │
    ├── Is ServerError?
    │       │
    │       ├── 429 RateLimited → Retry with exponential backoff
    │       │
    │       ├── 500 Internal → Retry up to 3x
    │       │
    │       ├── 503 Unavailable → Retry up to 3x
    │       │
    │       └── Other 5xx → Retry up to 2x
    │
    ├── Is NetworkError?
    │       │
    │       ├── Timeout → Retry up to 3x
    │       │
    │       ├── ConnectionFailed → Retry up to 3x
    │       │
    │       └── TLS Error → Don't retry
    │
    ├── Is UploadError?
    │       │
    │       ├── ChunkFailed → Retry chunk up to 5x
    │       │
    │       └── Other → Query status, resume if possible
    │
    └── Is ClientError (4xx)?
            │
            └── Don't retry, propagate immediately
```

---

## 8. Testing Architecture

### 8.1 Test Layers

```
┌─────────────────────────────────────────────────────────┐
│                 Integration Tests                        │
│  - Real GCS (with test bucket)                          │
│  - GCS Emulator (fake-gcs-server)                       │
│  - Full upload/download cycles                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Service Tests                          │
│  - Mock HttpTransport                                   │
│  - Mock AuthProvider                                    │
│  - Test error handling, retries                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Unit Tests                            │
│  - V4 signing algorithm                                 │
│  - URL encoding                                         │
│  - Checksum calculation                                 │
│  - State machine transitions                            │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Mock Infrastructure

```rust
// MockGcsClient for application testing
pub struct MockGcsClient {
    objects: HashMap<String, MockObject>,
    operations: Vec<RecordedOperation>,
}

impl MockGcsClient {
    pub fn new() -> Self;
    pub fn with_object(self, bucket: &str, name: &str, data: Bytes) -> Self;
    pub fn expect_upload(self, bucket: &str, name: &str) -> Self;
    pub fn expect_download(self, bucket: &str, name: &str) -> Self;
    pub fn verify_operations(&self) -> Result<(), MockError>;
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture phase |

---

**Next Phase:** Refinement - Will define detailed interface specifications, request/response types, and integration patterns.
