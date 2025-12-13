# Google Cloud Storage Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcs`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements, interfaces, and constraints for the Google Cloud Storage (GCS) Integration Module within the LLM Dev Ops Integration Repository. It provides a production-ready, type-safe interface for object storage operations including artifacts, datasets, logs, and simulation I/O.

### 1.2 Methodology

- **SPARC Methodology**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The GCS Integration Module provides a production-ready, type-safe interface for interacting with Google Cloud Storage. It is a **thin adapter layer** that:
- Abstracts the GCS JSON API behind type-safe interfaces
- Handles OAuth2/service account authentication
- Supports streaming uploads/downloads for large objects
- Integrates with shared resilience, observability, and credential infrastructure
- Enables simulation and replay of storage interactions for testing

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Object Operations** | Upload, download, delete, copy, compose objects |
| **Bucket Operations** | List buckets, get bucket metadata |
| **Streaming** | Resumable uploads, chunked downloads |
| **Signed URLs** | Generate time-limited signed URLs |
| **Versioning** | Access object generations/versions |
| **Metadata** | Custom metadata, content-type, cache-control |
| **Authentication** | OAuth2, service account, workload identity |
| **Resilience** | Retry, circuit breaker, rate limiting hooks |
| **Observability** | Tracing, metrics, structured logging |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Objects | insert, get, delete, copy, compose, patch, list |
| Resumable Uploads | Chunked upload for large files |
| Streaming Downloads | Range requests, chunked transfer |
| Signed URLs | V4 signed URLs for GET/PUT |
| Object Metadata | Custom metadata, content-type, cache-control |
| Object ACLs | Read ACLs (not write - infrastructure concern) |
| Generations | Object versioning access |
| Bucket List | List accessible buckets |
| Dual Language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Bucket creation/deletion | Infrastructure provisioning |
| IAM policy management | Security governance |
| Lifecycle policies (write) | Infrastructure configuration |
| CORS configuration | Infrastructure configuration |
| Storage class changes | Infrastructure configuration |
| Pub/Sub notifications | Separate integration |
| BigQuery integration | Separate integration |
| Transfer Service | Separate service |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first design | I/O-bound operations |
| No panics in production | Reliability |
| Streaming for large objects | Memory efficiency |
| Trait-based abstractions | Testability, mockability |
| OAuth2/SA authentication | GCP standard |

---

## 3. Dependency Policy

### 3.1 Allowed Dependencies (Shared Modules)

| Module | Purpose |
|--------|---------|
| `shared/credentials` | GCP credential management |
| `shared/resilience` | Retry, circuit breaker, rate limiting |
| `shared/observability` | Logging, metrics, tracing |
| `shared/http` | HTTP transport abstraction |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.12+ | HTTP client |
| `serde` / `serde_json` | 1.x | JSON serialization |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `secrecy` | 0.8+ | Secret handling |
| `url` | 2.x | URL parsing |
| `bytes` | 1.x | Byte buffers |
| `futures` | 0.3+ | Stream utilities |
| `base64` | 0.21+ | Encoding |
| `chrono` | 0.4+ | Timestamps |
| `sha2` | 0.10+ | Checksums |
| `ring` | 0.17+ | RSA signing for signed URLs |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `google-cloud-storage` | This module IS the GCS integration |
| `cloud-storage` | This module IS the GCS integration |
| Other GCP SDK crates | Use internal implementations |

---

## 4. API Coverage

### 4.1 GCS JSON API Endpoints

**Base URL:** `https://storage.googleapis.com`

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Insert Object | POST | `/upload/storage/v1/b/{bucket}/o` |
| Get Object | GET | `/storage/v1/b/{bucket}/o/{object}` |
| Download Object | GET | `/storage/v1/b/{bucket}/o/{object}?alt=media` |
| Delete Object | DELETE | `/storage/v1/b/{bucket}/o/{object}` |
| Copy Object | POST | `/storage/v1/b/{srcBucket}/o/{srcObject}/copyTo/b/{dstBucket}/o/{dstObject}` |
| Compose Objects | POST | `/storage/v1/b/{bucket}/o/{destObject}/compose` |
| List Objects | GET | `/storage/v1/b/{bucket}/o` |
| Patch Object | PATCH | `/storage/v1/b/{bucket}/o/{object}` |
| List Buckets | GET | `/storage/v1/b?project={project}` |
| Get Bucket | GET | `/storage/v1/b/{bucket}` |

### 4.2 Object Insert (Upload)

**Simple Upload:** `POST /upload/storage/v1/b/{bucket}/o?uploadType=media&name={name}`

**Resumable Upload:**
1. Initiate: `POST /upload/storage/v1/b/{bucket}/o?uploadType=resumable`
2. Upload chunks: `PUT {resumableUri}` with `Content-Range` header
3. Complete: Final chunk with complete range

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `name` | string | Yes | Object name |
| `uploadType` | string | Yes | `media`, `multipart`, `resumable` |
| `contentType` | string | No | MIME type |
| `predefinedAcl` | string | No | Canned ACL |
| `ifGenerationMatch` | long | No | Conditional write |

**Response:**
```json
{
  "kind": "storage#object",
  "id": "bucket/object/generation",
  "name": "object-name",
  "bucket": "bucket-name",
  "generation": "1234567890",
  "metageneration": "1",
  "contentType": "application/octet-stream",
  "size": "12345",
  "md5Hash": "base64==",
  "crc32c": "base64==",
  "etag": "etag",
  "timeCreated": "2025-01-01T00:00:00.000Z",
  "updated": "2025-01-01T00:00:00.000Z",
  "storageClass": "STANDARD",
  "metadata": {"key": "value"}
}
```

### 4.3 Object Get (Download)

**Endpoint:** `GET /storage/v1/b/{bucket}/o/{object}?alt=media`

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `object` | string | Yes | Object name (URL-encoded) |
| `generation` | long | No | Specific generation |
| `ifGenerationMatch` | long | No | Conditional read |
| `Range` | header | No | Byte range (e.g., `bytes=0-1023`) |

### 4.4 List Objects

**Endpoint:** `GET /storage/v1/b/{bucket}/o`

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prefix` | string | No | Filter by prefix |
| `delimiter` | string | No | Hierarchy delimiter |
| `maxResults` | int | No | Max results (default 1000) |
| `pageToken` | string | No | Pagination token |
| `versions` | boolean | No | Include all generations |
| `startOffset` | string | No | Start after this object |
| `endOffset` | string | No | End before this object |

**Response:**
```json
{
  "kind": "storage#objects",
  "items": [...],
  "prefixes": ["dir1/", "dir2/"],
  "nextPageToken": "token"
}
```

### 4.5 Signed URLs (V4)

**Signature Components:**
1. HTTP method
2. Resource path
3. Query parameters
4. Headers (host, date, x-goog-* headers)
5. Signed headers list
6. Payload hash (UNSIGNED-PAYLOAD for most cases)

**URL Format:**
```
https://storage.googleapis.com/{bucket}/{object}
  ?X-Goog-Algorithm=GOOG4-RSA-SHA256
  &X-Goog-Credential={email}/{date}/auto/storage/goog4_request
  &X-Goog-Date={timestamp}
  &X-Goog-Expires={seconds}
  &X-Goog-SignedHeaders=host
  &X-Goog-Signature={signature}
```

### 4.6 Resumable Upload Protocol

**Phase 1 - Initiate:**
```http
POST /upload/storage/v1/b/{bucket}/o?uploadType=resumable HTTP/1.1
Host: storage.googleapis.com
Authorization: Bearer {token}
Content-Type: application/json
X-Upload-Content-Type: {mime-type}
X-Upload-Content-Length: {total-size}

{"name": "object-name", "metadata": {...}}
```
Response: `Location: {resumable-upload-uri}`

**Phase 2 - Upload Chunks:**
```http
PUT {resumable-upload-uri} HTTP/1.1
Content-Length: {chunk-size}
Content-Range: bytes {start}-{end}/{total}

{chunk-data}
```

**Phase 3 - Query Status:**
```http
PUT {resumable-upload-uri} HTTP/1.1
Content-Length: 0
Content-Range: bytes */{total}
```

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
GcsError
├── ConfigurationError
│   ├── InvalidBucketName
│   ├── InvalidObjectName
│   ├── InvalidCredentials
│   └── MissingProject
│
├── AuthenticationError
│   ├── TokenExpired
│   ├── TokenRefreshFailed
│   ├── InvalidServiceAccount
│   └── PermissionDenied
│
├── ObjectError
│   ├── ObjectNotFound
│   ├── PreconditionFailed
│   ├── GenerationMismatch
│   └── ObjectTooLarge
│
├── BucketError
│   ├── BucketNotFound
│   ├── BucketAccessDenied
│   └── InvalidBucketState
│
├── UploadError
│   ├── ResumableUploadFailed
│   ├── ChunkUploadFailed
│   ├── UploadAborted
│   └── ChecksumMismatch
│
├── DownloadError
│   ├── RangeNotSatisfiable
│   ├── StreamInterrupted
│   └── DecompressionFailed
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── TlsError
│
└── ServerError
    ├── InternalError
    ├── ServiceUnavailable
    ├── RateLimited
    └── QuotaExceeded
```

### 5.2 HTTP Status Mapping

| HTTP Status | Error Type | Retryable |
|-------------|------------|-----------|
| 400 | `ConfigurationError` | No |
| 401 | `AuthenticationError::TokenExpired` | Yes (refresh) |
| 403 | `AuthenticationError::PermissionDenied` | No |
| 404 | `ObjectError::ObjectNotFound` | No |
| 408 | `NetworkError::Timeout` | Yes |
| 412 | `ObjectError::PreconditionFailed` | No |
| 429 | `ServerError::RateLimited` | Yes |
| 500 | `ServerError::InternalError` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |

---

## 6. Resilience Requirements

### 6.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `ServerError::RateLimited` | Yes | 5 | Exponential (1s base) |
| `ServerError::ServiceUnavailable` | Yes | 3 | Exponential (2s base) |
| `ServerError::InternalError` | Yes | 3 | Exponential (1s base) |
| `NetworkError::Timeout` | Yes | 3 | Fixed (1s) |
| `NetworkError::ConnectionFailed` | Yes | 3 | Exponential (500ms) |
| `UploadError::ChunkUploadFailed` | Yes | 5 | Exponential (1s) |
| Auth errors (token expired) | Yes | 1 | Immediate (refresh) |

### 6.2 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |

### 6.3 Resumable Upload Recovery

| Scenario | Recovery |
|----------|----------|
| Chunk fails | Retry chunk (up to 5x) |
| Connection lost | Query status, resume from last byte |
| Token expires | Refresh token, continue |
| Upload stale (>7 days) | Restart upload |

---

## 7. Observability Requirements

### 7.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `gcs.upload` | `bucket`, `object`, `size`, `upload_type`, `resumable` |
| `gcs.download` | `bucket`, `object`, `size`, `range`, `streaming` |
| `gcs.delete` | `bucket`, `object`, `generation` |
| `gcs.list` | `bucket`, `prefix`, `count` |
| `gcs.copy` | `src_bucket`, `src_object`, `dst_bucket`, `dst_object` |
| `gcs.sign_url` | `bucket`, `object`, `method`, `expires` |

### 7.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `gcs_requests_total` | Counter | `bucket`, `operation`, `status` |
| `gcs_request_duration_seconds` | Histogram | `bucket`, `operation` |
| `gcs_bytes_transferred_total` | Counter | `bucket`, `direction` |
| `gcs_upload_chunks_total` | Counter | `bucket`, `status` |
| `gcs_errors_total` | Counter | `operation`, `error_type` |

### 7.3 Logging

| Level | When |
|-------|------|
| ERROR | Auth failures, server errors |
| WARN | Retries, rate limiting |
| INFO | Request completion |
| DEBUG | Request/response details |
| TRACE | Chunk transfers, signing details |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Service account keys never logged | Use `SecretString` |
| OAuth tokens protected | Automatic refresh, no exposure |
| Workload identity support | GKE metadata server |
| Application default credentials | Environment detection |

### 8.2 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Enforce in HTTP client |
| Certificate validation | Enable by default |
| No HTTP fallback | HTTPS only |

### 8.3 Signed URL Security

| Requirement | Implementation |
|-------------|----------------|
| Max expiration | 7 days (GCS limit) |
| Minimum recommended | 15 minutes |
| Scope limitation | Single object, single method |

---

## 9. Performance Requirements

### 9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Small object upload (<1MB) | < 200ms | < 1s |
| Small object download (<1MB) | < 100ms | < 500ms |
| List objects (100 items) | < 200ms | < 1s |
| Signed URL generation | < 10ms | < 50ms |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent uploads | 50+ |
| Concurrent downloads | 100+ |
| Streaming throughput | Line-rate with network |

### 9.3 Chunk Sizes

| Upload Size | Recommended Chunk |
|-------------|-------------------|
| < 5MB | Simple upload |
| 5MB - 5GB | 8MB chunks |
| > 5GB | 32MB chunks |

---

## 10. Enterprise Features

### 10.1 Versioned Artifacts

| Feature | Description |
|---------|-------------|
| Generation access | Read specific generations |
| Generation listing | List all versions |
| Conditional writes | `ifGenerationMatch` for CAS |
| Latest version | Default behavior |

### 10.2 Large Object Streaming

| Feature | Description |
|---------|-------------|
| Resumable upload | Chunked, recoverable |
| Range downloads | Byte-range requests |
| Streaming response | Chunked transfer |
| Memory bounded | Configurable buffer sizes |

### 10.3 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | Return predefined responses |
| Record mode | Capture request/response pairs |
| Replay mode | Replay recorded interactions |
| Local emulator | GCS emulator support |

---

## 11. Acceptance Criteria

### 11.1 Functional Criteria

- [ ] Simple upload works
- [ ] Resumable upload works
- [ ] Download works (full and range)
- [ ] Streaming download works
- [ ] Delete works
- [ ] Copy works
- [ ] Compose works
- [ ] List objects works (with pagination)
- [ ] Signed URL generation works
- [ ] Object metadata operations work
- [ ] Generation/version access works

### 11.2 Non-Functional Criteria

- [ ] No panics in production paths
- [ ] Credentials never logged
- [ ] Memory bounded during streaming
- [ ] Retry respects backoff
- [ ] Circuit breaker works
- [ ] Metrics emitted correctly
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification phase |

---

**Next Phase:** Pseudocode - Will define algorithmic implementations for core operations including resumable uploads, streaming, and signed URL generation.
