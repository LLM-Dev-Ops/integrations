# Cloudflare R2 Storage Integration - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/cloudflare_r2`

---

## 1. Overview

### 1.1 Purpose

This specification defines the Cloudflare R2 Storage Integration Module—a thin adapter layer enabling the LLM Dev Ops platform to interact with R2 as an S3-compatible object storage service for artifacts, datasets, logs, and simulation inputs/outputs.

### 1.2 Key R2 Characteristics

| Feature | R2 Behavior |
|---------|-------------|
| **Regionless** | Automatic global distribution, no region selection |
| **Zero Egress** | No data transfer fees for reads |
| **S3 Compatible** | S3 API with subset of features |
| **Authentication** | Cloudflare API tokens or S3-style credentials |
| **Endpoint** | `https://<account_id>.r2.cloudflarestorage.com` |

### 1.3 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first design with mock-based testing
- **Thin Adapter**: Delegate to shared primitives, no orchestration duplication

---

## 2. Module Scope

### 2.1 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Object Operations** | Put, get, delete, head, copy, list via S3 API |
| **Multipart Uploads** | Large object uploads with resumable transfers |
| **Presigned URLs** | Time-limited direct access URLs |
| **Streaming** | Memory-efficient large object transfers |
| **R2 Authentication** | S3-style HMAC signing with R2 credentials |
| **Simulation Support** | Record/replay storage interactions for testing |
| **Lifecycle Awareness** | Expose lifecycle rules (read-only, no provisioning) |

### 2.2 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Object CRUD | PutObject, GetObject, DeleteObject, DeleteObjects, HeadObject, CopyObject |
| Listing | ListObjectsV2 with pagination |
| Multipart | Create, UploadPart, Complete, Abort, ListParts |
| Presigned URLs | GET/PUT with configurable expiration |
| Metadata | User-defined metadata, content-type, cache-control |
| Checksums | MD5, SHA256 for integrity verification |
| Streaming | Upload/download streams for large objects |
| Dual Language | Rust and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Bucket provisioning | Account-level config, not this module's concern |
| R2 Workers bindings | Separate Workers integration |
| Lifecycle rule creation | Admin concern, not runtime storage |
| CORS configuration | Admin concern |
| Public bucket access | Security policy, external config |
| Event notifications | R2 feature via Workers |
| Object Lock | Not supported by R2 |
| Versioning | R2 has limited versioning support |
| Storage classes | R2 uses single storage tier |
| Server-side encryption config | R2 encrypts by default |

### 2.3 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| S3-compatible API only | R2's primary interface |
| Async-first | I/O-bound operations |
| No region parameter | R2 is regionless (use `auto`) |
| Path-style URLs | R2 requires path-style by default |
| Shared auth module | Credential management via shared infra |
| No direct HTTP exposure | Encapsulation, testability |

---

## 3. Dependency Policy

### 3.1 Internal Dependencies

| Primitive | Purpose |
|-----------|---------|
| `shared-auth` | R2 credential management |
| `shared-logging` | Structured logging |
| `shared-metrics` | Prometheus metrics |
| `shared-tracing` | Distributed tracing |
| `shared-retry` | Retry with backoff |
| `shared-circuit-breaker` | Fault isolation |
| `shared-config` | Configuration management |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `reqwest` | HTTP client (behind trait) |
| `quick-xml` | S3 XML response parsing |
| `ring` / `sha2` | HMAC-SHA256 signing |
| `bytes` | Byte buffer handling |
| `futures` | Stream utilities |

### 3.3 External Dependencies (TypeScript)

| Package | Purpose |
|---------|---------|
| `@noble/hashes` | SHA256, HMAC signing |
| `fast-xml-parser` | XML parsing |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `@cloudflare/r2` | This module IS the R2 integration |
| `aws-sdk` | Not needed, direct S3 API |
| Other integration modules | Isolated design |

---

## 4. API Coverage

### 4.1 Object Operations

#### PutObject
| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /{Bucket}/{Key}` |
| Max Size | 5 GB (single PUT), 5 TB (multipart) |
| Supported Headers | Content-Type, Content-MD5, Cache-Control, x-amz-meta-* |

**Request Parameters:**

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key (1-1024 bytes) |
| `body` | bytes/stream | Yes | Object content |
| `content_type` | string | No | MIME type |
| `content_md5` | string | No | Base64 MD5 |
| `cache_control` | string | No | Cache directives |
| `content_disposition` | string | No | Download filename |
| `metadata` | map | No | x-amz-meta-* headers |

**Response:**
- `e_tag`: Object ETag
- `version_id`: Version (if enabled)

#### GetObject
| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /{Bucket}/{Key}` |
| Range Support | Yes (bytes=start-end) |
| Streaming | Chunked transfer |

**Request Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `bucket` | string | Yes |
| `key` | string | Yes |
| `range` | string | No |
| `if_match` | string | No |
| `if_none_match` | string | No |
| `if_modified_since` | datetime | No |

**Response:**
- `body`: Content stream
- `content_length`, `content_type`, `e_tag`, `last_modified`, `metadata`

#### DeleteObject / DeleteObjects
- Single delete: `DELETE /{Bucket}/{Key}`
- Batch delete: `POST /{Bucket}?delete` (up to 1000 objects)

#### HeadObject
- `HEAD /{Bucket}/{Key}` - metadata without body

#### CopyObject
- `PUT /{Bucket}/{Key}` with `x-amz-copy-source` header
- Max 5 GB (use multipart copy for larger)

#### ListObjectsV2
| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /{Bucket}?list-type=2` |
| Max Keys | 1000 per request |
| Pagination | Continuation token |

**Parameters:** `prefix`, `delimiter`, `max_keys`, `continuation_token`, `start_after`

### 4.2 Multipart Upload

| Operation | Endpoint |
|-----------|----------|
| Create | `POST /{Bucket}/{Key}?uploads` |
| UploadPart | `PUT /{Bucket}/{Key}?partNumber=N&uploadId=ID` |
| Complete | `POST /{Bucket}/{Key}?uploadId=ID` |
| Abort | `DELETE /{Bucket}/{Key}?uploadId=ID` |
| ListParts | `GET /{Bucket}/{Key}?uploadId=ID` |

**Constraints:**
- Part size: 5 MB minimum (except last), 5 GB maximum
- Max parts: 10,000
- Max object: 5 TB

### 4.3 Presigned URLs

| Operation | Max Expiration |
|-----------|----------------|
| GET | 7 days |
| PUT | 7 days |

Generated client-side using S3 Signature V4 query string auth.

### 4.4 R2-Specific Limitations

| S3 Feature | R2 Support |
|------------|------------|
| Object Lock | Not supported |
| Glacier/Deep Archive | Not applicable |
| Replication | Not supported |
| Bucket policies | Limited |
| ACLs | Not supported (use Workers) |
| Object versioning | Limited support |
| Lifecycle rules | Supported (read-only in this module) |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

```rust
/// Main R2 client interface
#[async_trait]
pub trait R2Client: Send + Sync {
    fn objects(&self) -> &dyn R2ObjectsService;
    fn multipart(&self) -> &dyn R2MultipartService;
    fn presign(&self) -> &dyn R2PresignService;
}

/// Object operations
#[async_trait]
pub trait R2ObjectsService: Send + Sync {
    async fn put(&self, req: PutObjectRequest) -> Result<PutObjectOutput, R2Error>;
    async fn put_stream(&self, req: PutObjectRequest, body: ByteStream) -> Result<PutObjectOutput, R2Error>;
    async fn get(&self, req: GetObjectRequest) -> Result<GetObjectOutput, R2Error>;
    async fn get_stream(&self, req: GetObjectRequest) -> Result<GetObjectStreamOutput, R2Error>;
    async fn delete(&self, req: DeleteObjectRequest) -> Result<(), R2Error>;
    async fn delete_objects(&self, req: DeleteObjectsRequest) -> Result<DeleteObjectsOutput, R2Error>;
    async fn head(&self, req: HeadObjectRequest) -> Result<HeadObjectOutput, R2Error>;
    async fn copy(&self, req: CopyObjectRequest) -> Result<CopyObjectOutput, R2Error>;
    async fn list(&self, req: ListObjectsRequest) -> Result<ListObjectsOutput, R2Error>;
    fn list_all(&self, req: ListObjectsRequest) -> impl Stream<Item = Result<Object, R2Error>>;
}

/// Multipart upload operations
#[async_trait]
pub trait R2MultipartService: Send + Sync {
    async fn create(&self, req: CreateMultipartRequest) -> Result<CreateMultipartOutput, R2Error>;
    async fn upload_part(&self, req: UploadPartRequest) -> Result<UploadPartOutput, R2Error>;
    async fn complete(&self, req: CompleteMultipartRequest) -> Result<CompleteMultipartOutput, R2Error>;
    async fn abort(&self, req: AbortMultipartRequest) -> Result<(), R2Error>;
    async fn list_parts(&self, req: ListPartsRequest) -> Result<ListPartsOutput, R2Error>;
}

/// Presigned URL generation
pub trait R2PresignService: Send + Sync {
    fn presign_get(&self, req: PresignGetRequest) -> Result<PresignedUrl, R2Error>;
    fn presign_put(&self, req: PresignPutRequest) -> Result<PresignedUrl, R2Error>;
}
```

### 5.2 Configuration

```rust
pub struct R2Config {
    /// Cloudflare Account ID
    pub account_id: String,
    /// R2 Access Key ID
    pub access_key_id: String,
    /// R2 Secret Access Key (via shared-auth)
    pub secret_access_key: SecretString,
    /// Custom endpoint (optional, for testing)
    pub endpoint: Option<Url>,
    /// Request timeout
    pub timeout: Duration,
    /// Multipart threshold (default: 100MB)
    pub multipart_threshold: u64,
    /// Multipart part size (default: 10MB)
    pub multipart_part_size: u64,
    /// Concurrent part uploads (default: 4)
    pub multipart_concurrency: usize,
}

impl R2Config {
    pub fn endpoint_url(&self) -> Url {
        self.endpoint.clone().unwrap_or_else(|| {
            format!("https://{}.r2.cloudflarestorage.com", self.account_id)
                .parse()
                .unwrap()
        })
    }
}
```

### 5.3 TypeScript Interfaces

```typescript
interface R2Client {
  readonly objects: R2ObjectsService;
  readonly multipart: R2MultipartService;
  readonly presign: R2PresignService;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  timeout?: number;
  multipartThreshold?: number;
  multipartPartSize?: number;
  multipartConcurrency?: number;
}

interface R2ObjectsService {
  put(req: PutObjectRequest): Promise<PutObjectOutput>;
  putStream(req: PutObjectRequest, body: ReadableStream): Promise<PutObjectOutput>;
  get(req: GetObjectRequest): Promise<GetObjectOutput>;
  getStream(req: GetObjectRequest): Promise<GetObjectStreamOutput>;
  delete(req: DeleteObjectRequest): Promise<void>;
  deleteObjects(req: DeleteObjectsRequest): Promise<DeleteObjectsOutput>;
  head(req: HeadObjectRequest): Promise<HeadObjectOutput>;
  copy(req: CopyObjectRequest): Promise<CopyObjectOutput>;
  list(req: ListObjectsRequest): Promise<ListObjectsOutput>;
  listAll(req: ListObjectsRequest): AsyncIterable<R2Object>;
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
R2Error
├── ConfigError
│   ├── MissingAccountId
│   ├── MissingCredentials
│   └── InvalidEndpoint
├── AuthError
│   ├── InvalidAccessKey
│   ├── SignatureDoesNotMatch
│   └── ExpiredCredentials
├── BucketError
│   ├── BucketNotFound
│   └── BucketAccessDenied
├── ObjectError
│   ├── ObjectNotFound
│   ├── PreconditionFailed
│   ├── NotModified
│   └── EntityTooLarge
├── MultipartError
│   ├── UploadNotFound
│   ├── InvalidPart
│   ├── InvalidPartOrder
│   └── EntityTooSmall
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   └── TlsError
├── ServerError
│   ├── InternalError
│   ├── ServiceUnavailable
│   └── SlowDown
└── TransferError
    ├── StreamInterrupted
    ├── ChecksumMismatch
    └── IncompleteBody
```

### 6.2 Error Mapping

| HTTP | R2/S3 Code | Error Type | Retryable |
|------|------------|------------|-----------|
| 400 | InvalidRequest | `ConfigError` | No |
| 403 | AccessDenied | `AuthError::BucketAccessDenied` | No |
| 403 | SignatureDoesNotMatch | `AuthError::SignatureDoesNotMatch` | No |
| 404 | NoSuchBucket | `BucketError::BucketNotFound` | No |
| 404 | NoSuchKey | `ObjectError::ObjectNotFound` | No |
| 404 | NoSuchUpload | `MultipartError::UploadNotFound` | No |
| 412 | PreconditionFailed | `ObjectError::PreconditionFailed` | No |
| 500 | InternalError | `ServerError::InternalError` | Yes |
| 503 | ServiceUnavailable | `ServerError::ServiceUnavailable` | Yes |
| 503 | SlowDown | `ServerError::SlowDown` | Yes |

### 6.3 Retryability

```rust
impl R2Error {
    pub fn is_retryable(&self) -> bool {
        matches!(self,
            R2Error::Network(NetworkError::Timeout)
            | R2Error::Network(NetworkError::ConnectionFailed)
            | R2Error::Server(ServerError::InternalError)
            | R2Error::Server(ServerError::ServiceUnavailable)
            | R2Error::Server(ServerError::SlowDown)
            | R2Error::Transfer(TransferError::StreamInterrupted)
        )
    }

    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            R2Error::Server(ServerError::SlowDown { retry_after }) => *retry_after,
            _ => None,
        }
    }
}
```

---

## 7. Resilience Hooks

### 7.1 Retry Configuration

| Error | Max Attempts | Base Delay | Strategy |
|-------|--------------|------------|----------|
| SlowDown | 5 | `retry_after` or 1s | Exponential |
| InternalError | 3 | 1s | Exponential |
| ServiceUnavailable | 3 | 1s | Exponential |
| Timeout | 3 | 500ms | Exponential |
| ConnectionFailed | 3 | 500ms | Exponential |
| StreamInterrupted | 2 | 1s | Fixed |

### 7.2 Circuit Breaker

```rust
pub struct R2CircuitBreakerConfig {
    pub failure_threshold: u32,     // Default: 5
    pub success_threshold: u32,     // Default: 3
    pub reset_timeout: Duration,    // Default: 30s
}
```

### 7.3 Rate Limiting

- **Client-side**: Configurable requests/second
- **Adaptive**: Back off on SlowDown responses
- **Per-bucket**: Optional bucket-level isolation

---

## 8. Observability

### 8.1 Tracing Attributes

| Attribute | Description |
|-----------|-------------|
| `r2.account_id` | Cloudflare Account ID |
| `r2.bucket` | Bucket name |
| `r2.key` | Object key |
| `r2.operation` | Operation name |
| `r2.request_id` | R2 request ID |
| `r2.content_length` | Body size |
| `error.type` | Error category |
| `error.code` | R2/S3 error code |

### 8.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `r2_requests_total` | Counter | `operation`, `bucket`, `status` |
| `r2_request_duration_seconds` | Histogram | `operation`, `bucket` |
| `r2_bytes_transferred_total` | Counter | `operation`, `bucket`, `direction` |
| `r2_errors_total` | Counter | `operation`, `error_type` |
| `r2_retries_total` | Counter | `operation`, `attempt` |
| `r2_multipart_parts_total` | Counter | `bucket`, `status` |

### 8.3 Logging Levels

| Level | Events |
|-------|--------|
| ERROR | Non-retryable failures |
| WARN | Retries, rate limits, circuit breaker |
| INFO | Request completion, multipart lifecycle |
| DEBUG | Request/response details (sanitized) |
| TRACE | Signing details, internal state |

---

## 9. Simulation Support

### 9.1 Recording Mode

```rust
pub trait R2Recorder: Send + Sync {
    fn record_request(&self, op: &str, bucket: &str, key: &str, req: &[u8]);
    fn record_response(&self, op: &str, bucket: &str, key: &str, resp: &[u8], duration: Duration);
    fn record_error(&self, op: &str, bucket: &str, key: &str, error: &R2Error);
}
```

### 9.2 Replay Mode

```rust
pub trait R2Replayer: Send + Sync {
    fn replay_response(&self, op: &str, bucket: &str, key: &str) -> Option<ReplayedResponse>;
}

pub struct ReplayedResponse {
    pub body: Bytes,
    pub headers: HashMap<String, String>,
    pub status: u16,
    pub delay: Duration,
}
```

### 9.3 Use Cases

- **Testing**: Deterministic tests without R2 access
- **CI/CD**: Fast pipelines without network
- **Load Testing**: Baseline comparison
- **Debugging**: Reproduce production issues

---

## 10. Security Requirements

### 10.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Keys never logged | `SecretString` with redaction |
| Zero on drop | Zeroize trait |
| Shared auth integration | Delegate to `shared-auth` |

### 10.2 Signing

| Requirement | Implementation |
|-------------|----------------|
| S3 Signature V4 | HMAC-SHA256 |
| Timestamp validation | Within 15 minutes |
| Payload hashing | SHA256 |

### 10.3 Transport

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | HTTP client config |
| HTTPS enforced | Reject HTTP endpoints |
| Certificate validation | Enabled |

---

## 11. Performance Requirements

### 11.1 Latency Targets

| Operation | p50 | p99 |
|-----------|-----|-----|
| Signing | < 1ms | < 5ms |
| XML parsing | < 5ms | < 20ms |
| Presign generation | < 1ms | < 5ms |
| Small object (< 1MB) | < 100ms + RTT | < 500ms + RTT |

### 11.2 Throughput

| Metric | Target |
|--------|--------|
| Concurrent requests | 100+ |
| Streaming | Line-rate |
| Multipart concurrency | 4-16 parts |

### 11.3 Memory

| Resource | Limit |
|----------|-------|
| Per request overhead | < 1MB |
| Stream buffer | Configurable |
| Connection pool | Default 20 |

---

## 12. Acceptance Criteria

### 12.1 Functional

| ID | Criterion |
|----|-----------|
| F1 | PutObject works (bytes and stream) |
| F2 | GetObject works (full and range) |
| F3 | GetObject streaming works |
| F4 | DeleteObject and DeleteObjects work |
| F5 | HeadObject returns metadata |
| F6 | CopyObject works (same bucket) |
| F7 | ListObjectsV2 with pagination works |
| F8 | Multipart upload lifecycle works |
| F9 | Presigned GET/PUT URLs work |
| F10 | All error types mapped correctly |
| F11 | S3 Signature V4 signing correct |
| F12 | Simulation record/replay works |

### 12.2 Non-Functional

| ID | Criterion |
|----|-----------|
| NF1 | No panics in production paths |
| NF2 | Memory bounded during streaming |
| NF3 | Credentials never logged |
| NF4 | Retry respects backoff |
| NF5 | Circuit breaker trips correctly |
| NF6 | All requests traced |
| NF7 | Metrics emitted correctly |
| NF8 | Large uploads (> 100MB) work |
| NF9 | Test coverage > 80% |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-14 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Algorithmic descriptions for S3 signing, XML parsing, multipart orchestration, and streaming operations adapted for R2.
