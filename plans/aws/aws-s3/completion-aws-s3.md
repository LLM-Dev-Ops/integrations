# AWS S3 Integration Completion

## SPARC Phase 5: Completion

*Implementation roadmap, file structure, and final deliverables*

---

## 1. Implementation File Structure

### 1.1 Rust Implementation

```
integrations/
└── aws-s3/
    ├── Cargo.toml
    ├── README.md
    ├── src/
    │   ├── lib.rs                    # Public API exports
    │   ├── client.rs                 # S3Client implementation
    │   ├── config.rs                 # S3Config and builders
    │   │
    │   ├── auth/
    │   │   ├── mod.rs
    │   │   ├── credentials.rs        # Credentials struct, SecretString
    │   │   ├── provider.rs           # CredentialProvider trait
    │   │   ├── chain.rs              # CredentialChain implementation
    │   │   ├── env.rs                # EnvironmentCredentialProvider
    │   │   ├── profile.rs            # ProfileCredentialProvider
    │   │   ├── imds.rs               # IMDSCredentialProvider (EC2/ECS)
    │   │   └── cache.rs              # CredentialCache with refresh
    │   │
    │   ├── signing/
    │   │   ├── mod.rs
    │   │   ├── v4.rs                 # AWS Signature V4 implementation
    │   │   ├── canonical.rs          # Canonical request builder
    │   │   ├── presign.rs            # Presigned URL signing
    │   │   └── cache.rs              # Signing key cache
    │   │
    │   ├── http/
    │   │   ├── mod.rs
    │   │   ├── transport.rs          # HttpTransport trait
    │   │   ├── client.rs             # HTTP client implementation
    │   │   ├── request.rs            # Request builder
    │   │   ├── response.rs           # Response parser
    │   │   └── pool.rs               # Connection pool management
    │   │
    │   ├── operations/
    │   │   ├── mod.rs
    │   │   ├── objects.rs            # Object operations (put, get, delete, etc.)
    │   │   ├── buckets.rs            # Bucket operations (create, delete, list)
    │   │   ├── multipart.rs          # Multipart upload operations
    │   │   ├── presign.rs            # Presigned URL generation
    │   │   └── tagging.rs            # Object and bucket tagging
    │   │
    │   ├── transfer/
    │   │   ├── mod.rs
    │   │   ├── upload.rs             # High-level upload (auto-multipart)
    │   │   ├── download.rs           # High-level download (streaming)
    │   │   ├── manager.rs            # TransferManager for batch ops
    │   │   └── sync.rs               # Directory sync operations
    │   │
    │   ├── xml/
    │   │   ├── mod.rs
    │   │   ├── parser.rs             # XML response parser
    │   │   ├── builder.rs            # XML request builder
    │   │   └── types.rs              # XML-specific types
    │   │
    │   ├── error.rs                  # S3Error and error types
    │   ├── types.rs                  # Public types (requests, responses)
    │   └── util.rs                   # Utility functions (encoding, etc.)
    │
    └── tests/
        ├── unit/
        │   ├── auth/
        │   │   ├── credentials_test.rs
        │   │   ├── chain_test.rs
        │   │   ├── env_test.rs
        │   │   ├── profile_test.rs
        │   │   └── imds_test.rs
        │   ├── signing/
        │   │   ├── v4_test.rs
        │   │   ├── canonical_test.rs
        │   │   └── presign_test.rs
        │   ├── operations/
        │   │   ├── objects_test.rs
        │   │   ├── buckets_test.rs
        │   │   ├── multipart_test.rs
        │   │   └── tagging_test.rs
        │   ├── xml/
        │   │   └── parser_test.rs
        │   └── error_test.rs
        │
        ├── integration/
        │   ├── common/
        │   │   └── mod.rs            # Test utilities, LocalStack setup
        │   ├── objects_integration_test.rs
        │   ├── buckets_integration_test.rs
        │   ├── multipart_integration_test.rs
        │   ├── presign_integration_test.rs
        │   └── tagging_integration_test.rs
        │
        └── mocks/
            ├── mod.rs
            ├── http_transport.rs     # MockHttpTransport
            ├── credentials.rs        # MockCredentialProvider
            └── responses.rs          # Canned S3 responses
```

### 1.2 TypeScript Implementation

```
integrations/
└── aws-s3/
    ├── package.json
    ├── tsconfig.json
    ├── README.md
    ├── src/
    │   ├── index.ts                  # Public API exports
    │   ├── client.ts                 # S3Client implementation
    │   ├── config.ts                 # S3Config and builders
    │   │
    │   ├── auth/
    │   │   ├── index.ts
    │   │   ├── credentials.ts        # Credentials class, SecretString
    │   │   ├── provider.ts           # CredentialProvider interface
    │   │   ├── chain.ts              # CredentialChain implementation
    │   │   ├── env.ts                # EnvironmentCredentialProvider
    │   │   ├── profile.ts            # ProfileCredentialProvider
    │   │   ├── imds.ts               # IMDSCredentialProvider
    │   │   └── cache.ts              # CredentialCache with refresh
    │   │
    │   ├── signing/
    │   │   ├── index.ts
    │   │   ├── v4.ts                 # AWS Signature V4 implementation
    │   │   ├── canonical.ts          # Canonical request builder
    │   │   ├── presign.ts            # Presigned URL signing
    │   │   └── cache.ts              # Signing key cache
    │   │
    │   ├── http/
    │   │   ├── index.ts
    │   │   ├── transport.ts          # HttpTransport interface
    │   │   ├── client.ts             # HTTP client implementation
    │   │   ├── request.ts            # Request builder
    │   │   └── response.ts           # Response parser
    │   │
    │   ├── operations/
    │   │   ├── index.ts
    │   │   ├── objects.ts            # Object operations
    │   │   ├── buckets.ts            # Bucket operations
    │   │   ├── multipart.ts          # Multipart upload operations
    │   │   ├── presign.ts            # Presigned URL generation
    │   │   └── tagging.ts            # Tagging operations
    │   │
    │   ├── transfer/
    │   │   ├── index.ts
    │   │   ├── upload.ts             # High-level upload
    │   │   ├── download.ts           # High-level download
    │   │   └── manager.ts            # TransferManager
    │   │
    │   ├── xml/
    │   │   ├── index.ts
    │   │   ├── parser.ts             # XML response parser
    │   │   └── builder.ts            # XML request builder
    │   │
    │   ├── error.ts                  # S3Error and error types
    │   ├── types.ts                  # Public types
    │   └── util.ts                   # Utility functions
    │
    └── tests/
        ├── unit/
        │   ├── auth/
        │   │   ├── credentials.test.ts
        │   │   ├── chain.test.ts
        │   │   └── providers.test.ts
        │   ├── signing/
        │   │   ├── v4.test.ts
        │   │   └── presign.test.ts
        │   ├── operations/
        │   │   ├── objects.test.ts
        │   │   ├── buckets.test.ts
        │   │   └── multipart.test.ts
        │   └── xml/
        │       └── parser.test.ts
        │
        ├── integration/
        │   ├── setup.ts              # LocalStack setup
        │   ├── objects.integration.test.ts
        │   ├── buckets.integration.test.ts
        │   └── multipart.integration.test.ts
        │
        └── mocks/
            ├── index.ts
            ├── httpTransport.ts      # MockHttpTransport
            └── credentials.ts        # MockCredentialProvider
```

---

## 2. Implementation Order

### 2.1 Phase 1: Core Infrastructure (Foundation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: CORE INFRASTRUCTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  1.1   │ error.rs/error.ts      │ shared/errors       │ Error mapping      │
│  1.2   │ types.rs/types.ts      │ shared/types        │ Type definitions   │
│  1.3   │ config.rs/config.ts    │ shared/config       │ Config validation  │
│  1.4   │ util.rs/util.ts        │ None                │ Encoding, helpers  │
│                                                                             │
│  Deliverables:                                                              │
│  - S3Error enum with all error variants                                    │
│  - S3Config struct with builder                                            │
│  - All public request/response types                                       │
│  - URL encoding utilities                                                  │
│                                                                             │
│  Tests:                                                                     │
│  - Error conversion from HTTP status codes                                 │
│  - Config validation (invalid values rejected)                             │
│  - Config builder pattern                                                  │
│  - URL encoding edge cases                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 2: Authentication & Signing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: AUTHENTICATION & SIGNING                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  2.1   │ credentials.rs         │ Phase 1             │ SecretString       │
│  2.2   │ provider.rs (trait)    │ 2.1                 │ Interface only     │
│  2.3   │ env.rs                 │ 2.2                 │ Env var parsing    │
│  2.4   │ profile.rs             │ 2.2                 │ INI file parsing   │
│  2.5   │ imds.rs                │ 2.2, http           │ IMDS v2 protocol   │
│  2.6   │ chain.rs               │ 2.3, 2.4, 2.5       │ Chain resolution   │
│  2.7   │ cache.rs               │ 2.6                 │ TTL, refresh       │
│  2.8   │ canonical.rs           │ Phase 1             │ Canonical request  │
│  2.9   │ v4.rs                  │ 2.8, 2.1            │ Full SigV4         │
│  2.10  │ signing/cache.rs       │ 2.9                 │ Key caching        │
│  2.11  │ presign.rs             │ 2.9                 │ Presigned URLs     │
│                                                                             │
│  Deliverables:                                                              │
│  - Complete credential provider chain                                      │
│  - AWS Signature V4 implementation                                         │
│  - Presigned URL generation                                                │
│  - Credential caching with auto-refresh                                    │
│                                                                             │
│  Tests (London-School TDD):                                                 │
│  - Mock environment for env provider                                       │
│  - Mock filesystem for profile provider                                    │
│  - Mock HTTP for IMDS provider                                             │
│  - SigV4 test vectors from AWS documentation                               │
│  - Presigned URL validation                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Phase 3: HTTP Layer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 3: HTTP LAYER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  3.1   │ transport.rs (trait)   │ Phase 1             │ Interface only     │
│  3.2   │ request.rs             │ 3.1, Phase 2        │ Request building   │
│  3.3   │ response.rs            │ Phase 1             │ Response parsing   │
│  3.4   │ client.rs              │ 3.1, 3.2, 3.3       │ HTTP execution     │
│  3.5   │ pool.rs                │ 3.4                 │ Connection mgmt    │
│                                                                             │
│  Deliverables:                                                              │
│  - HttpTransport trait for mockability                                     │
│  - Request builder with signing                                            │
│  - Response parser for S3 responses                                        │
│  - Connection pooling                                                      │
│                                                                             │
│  Tests:                                                                     │
│  - Request headers correctly set                                           │
│  - Response status code handling                                           │
│  - XML error response parsing                                              │
│  - Connection reuse verification                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Phase 4: XML Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 4: XML HANDLING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  4.1   │ xml/types.rs           │ Phase 1             │ Type definitions   │
│  4.2   │ xml/parser.rs          │ 4.1                 │ S3 XML parsing     │
│  4.3   │ xml/builder.rs         │ 4.1                 │ XML request body   │
│                                                                             │
│  Deliverables:                                                              │
│  - ListObjectsV2 response parser                                           │
│  - ListBuckets response parser                                             │
│  - Error response parser                                                   │
│  - DeleteObjects request builder                                           │
│  - CompleteMultipartUpload request builder                                 │
│                                                                             │
│  Tests:                                                                     │
│  - Parse real S3 XML responses                                             │
│  - Handle malformed XML gracefully                                         │
│  - Namespace handling                                                      │
│  - Large response streaming                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Phase 5: Core Operations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 5: CORE OPERATIONS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  5.1   │ operations/objects.rs  │ Phase 3, 4          │ CRUD operations    │
│  5.2   │ operations/buckets.rs  │ Phase 3, 4          │ Bucket ops         │
│  5.3   │ operations/multipart.rs│ Phase 3, 4, 5.1     │ Multipart upload   │
│  5.4   │ operations/presign.rs  │ Phase 2             │ URL generation     │
│  5.5   │ operations/tagging.rs  │ Phase 3, 4          │ Tag operations     │
│                                                                             │
│  Deliverables:                                                              │
│  - PutObject, GetObject, DeleteObject, HeadObject, CopyObject             │
│  - ListObjectsV2 with pagination                                           │
│  - CreateBucket, DeleteBucket, HeadBucket, ListBuckets                    │
│  - CreateMultipartUpload, UploadPart, CompleteMultipartUpload, Abort      │
│  - PresignGetObject, PresignPutObject                                      │
│  - Get/Put/DeleteObjectTagging, Get/Put/DeleteBucketTagging               │
│                                                                             │
│  Tests (London-School TDD):                                                 │
│  - Each operation with MockHttpTransport                                   │
│  - Error handling for each operation                                       │
│  - Pagination behavior                                                     │
│  - Multipart flow with part tracking                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Phase 6: Resilience Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 6: RESILIENCE INTEGRATION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  6.1   │ Retry integration      │ shared/retry        │ Retry behavior     │
│  6.2   │ Circuit breaker        │ shared/circuit-br   │ State transitions  │
│  6.3   │ Rate limiting          │ shared/rate-limits  │ Throttling         │
│  6.4   │ Tracing integration    │ shared/tracing      │ Span creation      │
│  6.5   │ Logging integration    │ shared/logging      │ Log output         │
│                                                                             │
│  Deliverables:                                                              │
│  - Retry wrapper for transient errors                                      │
│  - Circuit breaker per bucket/endpoint                                     │
│  - Rate limiter integration                                                │
│  - Distributed tracing spans                                               │
│  - Structured logging                                                      │
│                                                                             │
│  Tests:                                                                     │
│  - Retry on 500/503 errors                                                 │
│  - No retry on 400/404 errors                                              │
│  - Circuit opens after threshold                                           │
│  - Rate limit respects configured RPS                                      │
│  - Traces contain required attributes                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.7 Phase 7: High-Level API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 7: HIGH-LEVEL API                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  7.1   │ transfer/upload.rs     │ Phase 5             │ Auto-multipart     │
│  7.2   │ transfer/download.rs   │ Phase 5             │ Streaming download │
│  7.3   │ transfer/manager.rs    │ 7.1, 7.2            │ Batch operations   │
│  7.4   │ transfer/sync.rs       │ 7.3                 │ Directory sync     │
│  7.5   │ client.rs              │ All phases          │ Public API         │
│  7.6   │ lib.rs                 │ 7.5                 │ Exports            │
│                                                                             │
│  Deliverables:                                                              │
│  - upload_file() with automatic multipart                                  │
│  - download_file() with streaming                                          │
│  - TransferManager for concurrent operations                               │
│  - SyncManager for directory sync                                          │
│  - Complete S3Client with all methods                                      │
│                                                                             │
│  Tests:                                                                     │
│  - Large file triggers multipart                                           │
│  - Download streams without full buffering                                 │
│  - Batch operations execute concurrently                                   │
│  - Sync correctly identifies changes                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.8 Phase 8: Integration Testing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 8: INTEGRATION TESTING                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  8.1   │ LocalStack setup       │ Docker              │ Test environment   │
│  8.2   │ Object integration     │ 8.1                 │ Full CRUD cycle    │
│  8.3   │ Bucket integration     │ 8.1                 │ Bucket lifecycle   │
│  8.4   │ Multipart integration  │ 8.1                 │ Large uploads      │
│  8.5   │ Presign integration    │ 8.1                 │ URL functionality  │
│  8.6   │ Resilience integration │ 8.1                 │ Error scenarios    │
│                                                                             │
│  Deliverables:                                                              │
│  - docker-compose.yml for LocalStack                                       │
│  - Full integration test suite                                             │
│  - CI/CD pipeline configuration                                            │
│                                                                             │
│  Tests:                                                                     │
│  - End-to-end object lifecycle                                             │
│  - Multipart upload with real parts                                        │
│  - Presigned URL download via HTTP client                                  │
│  - Retry behavior under simulated failures                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Cargo.toml / package.json

### 3.1 Rust Cargo.toml

```toml
[package]
name = "integration-s3"
version = "0.1.0"
edition = "2021"
authors = ["LLM Dev Ops Team"]
description = "AWS S3 integration for LLM Dev Ops"
license = "LLM-Dev-Ops-PSA-1.0"
repository = "https://github.com/org/integrations"

[lib]
name = "integration_s3"
path = "src/lib.rs"

[dependencies]
# Shared primitives (workspace dependencies)
integration-errors = { path = "../shared/errors" }
integration-retry = { path = "../shared/retry" }
integration-circuit-breaker = { path = "../shared/circuit-breaker" }
integration-rate-limits = { path = "../shared/rate-limits" }
integration-tracing = { path = "../shared/tracing" }
integration-logging = { path = "../shared/logging" }
integration-types = { path = "../shared/types" }
integration-config = { path = "../shared/config" }

# Async runtime
tokio = { version = "1.35", features = ["full"] }
futures = "0.3"

# HTTP client
reqwest = { version = "0.11", features = ["rustls-tls", "stream", "gzip"] }

# Cryptography
hmac = "0.12"
sha2 = "0.10"
hex = "0.4"

# XML parsing
quick-xml = { version = "0.31", features = ["serialize"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Time handling
chrono = { version = "0.4", features = ["serde"] }

# URL encoding
percent-encoding = "2.3"

# Secure string handling
zeroize = { version = "1.7", features = ["derive"] }

# Bytes handling
bytes = "1.5"

# Async streams
async-stream = "0.3"
tokio-stream = "0.1"

# Tracing
tracing = "0.1"

[dev-dependencies]
# Testing
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
tempfile = "3.9"
test-case = "3.3"

# Integration testing
testcontainers = "0.15"

# Assertions
pretty_assertions = "1.4"

[features]
default = []
integration-tests = []
```

### 3.2 TypeScript package.json

```json
{
  "name": "@integrations/aws-s3",
  "version": "0.1.0",
  "description": "AWS S3 integration for LLM Dev Ops",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests",
    "format": "prettier --write src tests"
  },
  "dependencies": {
    "@integrations/errors": "workspace:*",
    "@integrations/retry": "workspace:*",
    "@integrations/circuit-breaker": "workspace:*",
    "@integrations/rate-limits": "workspace:*",
    "@integrations/tracing": "workspace:*",
    "@integrations/logging": "workspace:*",
    "@integrations/types": "workspace:*",
    "@integrations/config": "workspace:*"
  },
  "devDependencies": {
    "@types/jest": "^29.5.11",
    "@types/node": "^20.10.6",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "prettier": "^3.1.1",
    "nock": "^13.4.0",
    "testcontainers": "^10.4.0"
  },
  "peerDependencies": {
    "undici": "^6.2.1"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "LLM-Dev-Ops-PSA-1.0"
}
```

---

## 4. Public API Summary

### 4.1 Rust Public API

```rust
// lib.rs - Public exports

// Client
pub use client::S3Client;

// Configuration
pub use config::{S3Config, S3ConfigBuilder};

// Credentials
pub use auth::{
    Credentials,
    CredentialProvider,
    CredentialChain,
    EnvironmentCredentialProvider,
    ProfileCredentialProvider,
    IMDSCredentialProvider,
};

// Operations - Request/Response types
pub use operations::{
    // Objects
    PutObjectRequest, PutObjectResponse,
    GetObjectRequest, GetObjectResponse,
    DeleteObjectRequest, DeleteObjectResponse,
    HeadObjectRequest, HeadObjectResponse,
    CopyObjectRequest, CopyObjectResponse,
    ListObjectsV2Request, ListObjectsV2Response,
    DeleteObjectsRequest, DeleteObjectsResponse,

    // Buckets
    CreateBucketRequest, CreateBucketResponse,
    DeleteBucketRequest, DeleteBucketResponse,
    HeadBucketRequest, HeadBucketResponse,
    ListBucketsRequest, ListBucketsResponse,

    // Multipart
    CreateMultipartUploadRequest, CreateMultipartUploadResponse,
    UploadPartRequest, UploadPartResponse,
    CompleteMultipartUploadRequest, CompleteMultipartUploadResponse,
    AbortMultipartUploadRequest, AbortMultipartUploadResponse,
    ListMultipartUploadsRequest, ListMultipartUploadsResponse,
    ListPartsRequest, ListPartsResponse,

    // Presigned
    PresignedUrlRequest, PresignedUrl,

    // Tagging
    GetObjectTaggingRequest, GetObjectTaggingResponse,
    PutObjectTaggingRequest, PutObjectTaggingResponse,
    DeleteObjectTaggingRequest, DeleteObjectTaggingResponse,
    GetBucketTaggingRequest, GetBucketTaggingResponse,
    PutBucketTaggingRequest, PutBucketTaggingResponse,
    DeleteBucketTaggingRequest, DeleteBucketTaggingResponse,
};

// Types
pub use types::{
    S3Object,
    Bucket,
    Tag,
    ObjectMetadata,
    StorageClass,
    ServerSideEncryption,
    Acl,
    Part,
    MultipartUpload,
};

// Errors
pub use error::{S3Error, S3ErrorKind};

// Transfer utilities
pub use transfer::{TransferManager, TransferConfig};

// Streaming
pub use types::{ByteStream, StreamingBody};
```

### 4.2 S3Client Method Summary

```rust
impl S3Client {
    // Construction
    pub async fn new(config: S3Config) -> Result<Self, S3Error>;
    pub fn builder() -> S3ClientBuilder;

    // Object Operations
    pub async fn put_object(&self, bucket: &str, key: &str, body: impl Into<Body>)
        -> Result<PutObjectResponse, S3Error>;
    pub fn put_object_builder(&self, bucket: &str, key: &str, body: impl Into<Body>)
        -> PutObjectBuilder;

    pub async fn get_object(&self, bucket: &str, key: &str)
        -> Result<GetObjectResponse, S3Error>;
    pub fn get_object_builder(&self, bucket: &str, key: &str)
        -> GetObjectBuilder;

    pub async fn delete_object(&self, bucket: &str, key: &str)
        -> Result<DeleteObjectResponse, S3Error>;

    pub async fn delete_objects(&self, bucket: &str, keys: &[&str])
        -> Result<DeleteObjectsResponse, S3Error>;

    pub async fn head_object(&self, bucket: &str, key: &str)
        -> Result<HeadObjectResponse, S3Error>;

    pub async fn copy_object(&self, source_bucket: &str, source_key: &str,
        dest_bucket: &str, dest_key: &str) -> Result<CopyObjectResponse, S3Error>;

    pub async fn list_objects_v2(&self, bucket: &str)
        -> Result<ListObjectsV2Response, S3Error>;
    pub fn list_objects_v2_builder(&self, bucket: &str)
        -> ListObjectsV2Builder;

    // Bucket Operations
    pub async fn create_bucket(&self, bucket: &str)
        -> Result<CreateBucketResponse, S3Error>;
    pub async fn delete_bucket(&self, bucket: &str)
        -> Result<DeleteBucketResponse, S3Error>;
    pub async fn head_bucket(&self, bucket: &str)
        -> Result<HeadBucketResponse, S3Error>;
    pub async fn list_buckets(&self)
        -> Result<ListBucketsResponse, S3Error>;

    // Multipart Operations
    pub async fn create_multipart_upload(&self, bucket: &str, key: &str)
        -> Result<CreateMultipartUploadResponse, S3Error>;
    pub async fn upload_part(&self, bucket: &str, key: &str,
        upload_id: &str, part_number: u32, body: impl Into<Body>)
        -> Result<UploadPartResponse, S3Error>;
    pub async fn complete_multipart_upload(&self, bucket: &str, key: &str,
        upload_id: &str, parts: &[Part])
        -> Result<CompleteMultipartUploadResponse, S3Error>;
    pub async fn abort_multipart_upload(&self, bucket: &str, key: &str,
        upload_id: &str) -> Result<AbortMultipartUploadResponse, S3Error>;
    pub async fn list_multipart_uploads(&self, bucket: &str)
        -> Result<ListMultipartUploadsResponse, S3Error>;
    pub async fn list_parts(&self, bucket: &str, key: &str, upload_id: &str)
        -> Result<ListPartsResponse, S3Error>;

    // Presigned URLs
    pub fn presign_get_object(&self, bucket: &str, key: &str,
        expires_in: Duration) -> Result<PresignedUrl, S3Error>;
    pub fn presign_put_object(&self, bucket: &str, key: &str,
        expires_in: Duration) -> Result<PresignedUrl, S3Error>;

    // Tagging
    pub async fn get_object_tagging(&self, bucket: &str, key: &str)
        -> Result<GetObjectTaggingResponse, S3Error>;
    pub async fn put_object_tagging(&self, bucket: &str, key: &str, tags: &[Tag])
        -> Result<PutObjectTaggingResponse, S3Error>;
    pub async fn delete_object_tagging(&self, bucket: &str, key: &str)
        -> Result<DeleteObjectTaggingResponse, S3Error>;
    pub async fn get_bucket_tagging(&self, bucket: &str)
        -> Result<GetBucketTaggingResponse, S3Error>;
    pub async fn put_bucket_tagging(&self, bucket: &str, tags: &[Tag])
        -> Result<PutBucketTaggingResponse, S3Error>;
    pub async fn delete_bucket_tagging(&self, bucket: &str)
        -> Result<DeleteBucketTaggingResponse, S3Error>;

    // Convenience Methods
    pub async fn upload_file(&self, bucket: &str, key: &str, path: impl AsRef<Path>)
        -> Result<PutObjectResponse, S3Error>;
    pub async fn download_file(&self, bucket: &str, key: &str, path: impl AsRef<Path>)
        -> Result<(), S3Error>;
    pub async fn object_exists(&self, bucket: &str, key: &str)
        -> Result<bool, S3Error>;
    pub async fn get_object_string(&self, bucket: &str, key: &str)
        -> Result<String, S3Error>;
    pub async fn get_object_json<T: DeserializeOwned>(&self, bucket: &str, key: &str)
        -> Result<T, S3Error>;
    pub async fn put_object_json<T: Serialize>(&self, bucket: &str, key: &str, value: &T)
        -> Result<PutObjectResponse, S3Error>;

    // Streaming helpers
    pub fn list_all_objects(&self, bucket: &str)
        -> impl Stream<Item = Result<S3Object, S3Error>>;
    pub fn list_all_objects_with_prefix(&self, bucket: &str, prefix: &str)
        -> impl Stream<Item = Result<S3Object, S3Error>>;

    // Health check
    pub async fn health_check(&self) -> HealthStatus;
}
```

---

## 5. Test Vectors

### 5.1 AWS Signature V4 Test Vectors

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   AWS SIGNATURE V4 TEST VECTORS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Test Case 1: GET Object                                                    │
│  ──────────────────────────                                                │
│  Request:                                                                   │
│    Method: GET                                                              │
│    URI: /test.txt                                                          │
│    Host: examplebucket.s3.amazonaws.com                                    │
│    Date: Fri, 24 May 2013 00:00:00 GMT                                     │
│    x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934... │
│                                                                             │
│  Credentials:                                                               │
│    Access Key: AKIAIOSFODNN7EXAMPLE                                        │
│    Secret Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY                    │
│    Region: us-east-1                                                       │
│                                                                             │
│  Expected Canonical Request Hash:                                           │
│    7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972       │
│                                                                             │
│  Expected Signature:                                                        │
│    aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404       │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Test Case 2: PUT Object with Content                                       │
│  ─────────────────────────────────────                                     │
│  Request:                                                                   │
│    Method: PUT                                                              │
│    URI: /test$file.text                                                    │
│    Host: examplebucket.s3.amazonaws.com                                    │
│    Date: Fri, 24 May 2013 00:00:00 GMT                                     │
│    Content-Type: text/plain                                                │
│    x-amz-storage-class: REDUCED_REDUNDANCY                                 │
│    Body: "Welcome to Amazon S3."                                           │
│                                                                             │
│  Expected x-amz-content-sha256:                                             │
│    44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072       │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Test Case 3: Presigned URL                                                 │
│  ───────────────────────────                                               │
│  Request:                                                                   │
│    Method: GET                                                              │
│    Bucket: examplebucket                                                   │
│    Key: test.txt                                                           │
│    Expires: 86400 (24 hours)                                               │
│    Date: 2013-05-24T00:00:00Z                                              │
│                                                                             │
│  Expected URL contains:                                                     │
│    X-Amz-Algorithm=AWS4-HMAC-SHA256                                        │
│    X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2F... │
│    X-Amz-Date=20130524T000000Z                                             │
│    X-Amz-Expires=86400                                                     │
│    X-Amz-SignedHeaders=host                                                │
│    X-Amz-Signature=<calculated>                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 XML Response Test Fixtures

```xml
<!-- ListObjectsV2 Response -->
<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>example-bucket</Name>
    <Prefix>photos/</Prefix>
    <KeyCount>2</KeyCount>
    <MaxKeys>1000</MaxKeys>
    <IsTruncated>false</IsTruncated>
    <Contents>
        <Key>photos/2024/photo1.jpg</Key>
        <LastModified>2024-01-15T10:30:00.000Z</LastModified>
        <ETag>"d41d8cd98f00b204e9800998ecf8427e"</ETag>
        <Size>1024</Size>
        <StorageClass>STANDARD</StorageClass>
    </Contents>
    <Contents>
        <Key>photos/2024/photo2.jpg</Key>
        <LastModified>2024-01-16T14:22:00.000Z</LastModified>
        <ETag>"098f6bcd4621d373cade4e832627b4f6"</ETag>
        <Size>2048</Size>
        <StorageClass>STANDARD</StorageClass>
    </Contents>
</ListBucketResult>

<!-- Error Response -->
<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>NoSuchKey</Code>
    <Message>The specified key does not exist.</Message>
    <Key>nonexistent.txt</Key>
    <RequestId>4442587FB7D0A2F9</RequestId>
    <HostId>...</HostId>
</Error>

<!-- CompleteMultipartUpload Response -->
<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Location>https://example-bucket.s3.amazonaws.com/large-file.zip</Location>
    <Bucket>example-bucket</Bucket>
    <Key>large-file.zip</Key>
    <ETag>"17fbc0a106abbb6f381aac6e331f2a19-3"</ETag>
</CompleteMultipartUploadResult>
```

---

## 6. CI/CD Configuration

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/aws-s3-integration.yml
name: AWS S3 Integration

on:
  push:
    paths:
      - 'integrations/aws-s3/**'
  pull_request:
    paths:
      - 'integrations/aws-s3/**'

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  test-rust:
    name: Rust Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Cache cargo
        uses: actions/cache@v3
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

      - name: Check formatting
        run: cargo fmt --check
        working-directory: integrations/aws-s3

      - name: Clippy
        run: cargo clippy -- -D warnings
        working-directory: integrations/aws-s3

      - name: Unit tests
        run: cargo test --lib
        working-directory: integrations/aws-s3

      - name: Doc tests
        run: cargo test --doc
        working-directory: integrations/aws-s3

  test-typescript:
    name: TypeScript Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
        working-directory: integrations/aws-s3

      - name: Lint
        run: npm run lint
        working-directory: integrations/aws-s3

      - name: Type check
        run: npm run build
        working-directory: integrations/aws-s3

      - name: Unit tests
        run: npm run test:unit
        working-directory: integrations/aws-s3

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [test-rust, test-typescript]
    services:
      localstack:
        image: localstack/localstack:3.0
        ports:
          - 4566:4566
        env:
          SERVICES: s3
          DEFAULT_REGION: us-east-1
    steps:
      - uses: actions/checkout@v4

      - name: Wait for LocalStack
        run: |
          timeout 30 bash -c 'until curl -s http://localhost:4566/_localstack/health | grep -q "\"s3\": \"available\""; do sleep 1; done'

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run Rust integration tests
        run: cargo test --features integration-tests
        working-directory: integrations/aws-s3
        env:
          AWS_ACCESS_KEY_ID: test
          AWS_SECRET_ACCESS_KEY: test
          AWS_REGION: us-east-1
          S3_ENDPOINT: http://localhost:4566

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run TypeScript integration tests
        run: npm run test:integration
        working-directory: integrations/aws-s3
        env:
          AWS_ACCESS_KEY_ID: test
          AWS_SECRET_ACCESS_KEY: test
          AWS_REGION: us-east-1
          S3_ENDPOINT: http://localhost:4566

  coverage:
    name: Code Coverage
    runs-on: ubuntu-latest
    needs: [test-rust, test-typescript]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install cargo-tarpaulin
        run: cargo install cargo-tarpaulin

      - name: Generate coverage
        run: cargo tarpaulin --out Xml
        working-directory: integrations/aws-s3

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/aws-s3/cobertura.xml
          flags: rust-s3
```

### 6.2 Docker Compose for Local Testing

```yaml
# integrations/aws-s3/docker-compose.yml
version: '3.8'

services:
  localstack:
    image: localstack/localstack:3.0
    ports:
      - "4566:4566"
    environment:
      - SERVICES=s3
      - DEFAULT_REGION=us-east-1
      - EAGER_SERVICE_LOADING=1
    volumes:
      - "./init-localstack.sh:/etc/localstack/init/ready.d/init.sh"
      - "localstack_data:/var/lib/localstack"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4566/_localstack/health"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  localstack_data:
```

```bash
#!/bin/bash
# integrations/aws-s3/init-localstack.sh

# Create test buckets
awslocal s3 mb s3://test-bucket
awslocal s3 mb s3://integration-tests

echo "LocalStack S3 initialized"
```

---

## 7. Documentation Deliverables

### 7.1 README.md Template

```markdown
# AWS S3 Integration

AWS S3 client for the LLM Dev Ops Integration Repository.

## Features

- Full S3 REST API coverage (26 operations)
- AWS Signature V4 authentication
- Multiple credential providers (environment, profile, IMDS)
- Automatic multipart uploads for large files
- Streaming uploads and downloads
- Presigned URL generation
- Built-in resilience (retry, circuit breaker, rate limiting)
- Comprehensive observability (tracing, metrics, logging)

## Installation

### Rust

```toml
[dependencies]
integration-s3 = { path = "../integrations/aws-s3" }
```

### TypeScript

```bash
npm install @integrations/aws-s3
```

## Quick Start

### Rust

```rust
use integration_s3::{S3Client, S3Config};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create client with default credential chain
    let client = S3Client::new(S3Config::default()).await?;

    // Upload an object
    client.put_object("my-bucket", "hello.txt", b"Hello, S3!").await?;

    // Download an object
    let response = client.get_object("my-bucket", "hello.txt").await?;
    let data = response.body().collect().await?;

    println!("Downloaded: {:?}", data);
    Ok(())
}
```

### TypeScript

```typescript
import { S3Client, S3Config } from '@integrations/aws-s3';

async function main() {
    // Create client with default credential chain
    const client = await S3Client.create(S3Config.default());

    // Upload an object
    await client.putObject('my-bucket', 'hello.txt', Buffer.from('Hello, S3!'));

    // Download an object
    const response = await client.getObject('my-bucket', 'hello.txt');
    const data = await response.body.text();

    console.log('Downloaded:', data);
}

main().catch(console.error);
```

## Configuration

See [Configuration Guide](./docs/configuration.md) for all options.

## API Reference

See [API Documentation](./docs/api.md) for complete method reference.

## Testing

```bash
# Run unit tests
cargo test --lib        # Rust
npm run test:unit       # TypeScript

# Run integration tests (requires LocalStack)
docker-compose up -d
cargo test --features integration-tests
npm run test:integration
```

## License

LLM Dev Ops Permanent Source-Available License 1.0
```

---

## 8. Completion Checklist

### 8.1 Implementation Complete

- [ ] Phase 1: Core Infrastructure
  - [ ] S3Error enum with all variants
  - [ ] S3Config with builder pattern
  - [ ] All public types defined
  - [ ] Utility functions implemented

- [ ] Phase 2: Authentication & Signing
  - [ ] Credentials struct with SecretString
  - [ ] CredentialProvider trait
  - [ ] EnvironmentCredentialProvider
  - [ ] ProfileCredentialProvider
  - [ ] IMDSCredentialProvider
  - [ ] CredentialChain
  - [ ] CredentialCache with refresh
  - [ ] AWS Signature V4 implementation
  - [ ] Signing key cache
  - [ ] Presigned URL generation

- [ ] Phase 3: HTTP Layer
  - [ ] HttpTransport trait
  - [ ] Request builder with signing
  - [ ] Response parser
  - [ ] Connection pooling

- [ ] Phase 4: XML Handling
  - [ ] ListObjectsV2 parser
  - [ ] Error response parser
  - [ ] DeleteObjects request builder
  - [ ] CompleteMultipartUpload builder

- [ ] Phase 5: Core Operations
  - [ ] PutObject, GetObject, DeleteObject, HeadObject
  - [ ] CopyObject, ListObjectsV2, DeleteObjects
  - [ ] CreateBucket, DeleteBucket, HeadBucket, ListBuckets
  - [ ] CreateMultipartUpload, UploadPart, CompleteMultipartUpload
  - [ ] AbortMultipartUpload, ListMultipartUploads, ListParts
  - [ ] PresignGetObject, PresignPutObject
  - [ ] Get/Put/DeleteObjectTagging
  - [ ] Get/Put/DeleteBucketTagging

- [ ] Phase 6: Resilience Integration
  - [ ] Retry wrapper
  - [ ] Circuit breaker integration
  - [ ] Rate limiter integration
  - [ ] Tracing spans
  - [ ] Structured logging

- [ ] Phase 7: High-Level API
  - [ ] upload_file() with auto-multipart
  - [ ] download_file() with streaming
  - [ ] TransferManager
  - [ ] SyncManager
  - [ ] Complete S3Client

- [ ] Phase 8: Integration Testing
  - [ ] LocalStack docker-compose
  - [ ] Object integration tests
  - [ ] Bucket integration tests
  - [ ] Multipart integration tests
  - [ ] Presign integration tests

### 8.2 Documentation Complete

- [ ] README.md
- [ ] API reference (rustdoc/typedoc)
- [ ] Configuration guide
- [ ] Examples directory
- [ ] CHANGELOG.md

### 8.3 Quality Gates

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code coverage > 80%
- [ ] No clippy warnings (Rust)
- [ ] No eslint errors (TypeScript)
- [ ] Documentation complete
- [ ] Security review passed

---

## 9. Summary

This completion document provides the full implementation roadmap for the AWS S3 integration module:

1. **File Structure**: Complete directory layout for Rust and TypeScript implementations
2. **Implementation Order**: 8-phase development plan with dependencies
3. **Package Configuration**: Cargo.toml and package.json with all dependencies
4. **Public API**: Full method signatures for S3Client
5. **Test Vectors**: AWS SigV4 test cases and XML fixtures
6. **CI/CD**: GitHub Actions workflow and docker-compose
7. **Documentation**: README template and deliverables list
8. **Completion Checklist**: All items to verify before release

The implementation follows:
- **SPARC methodology** across all phases
- **London-School TDD** with mock-based testing
- **Hexagonal Architecture** for clean separation
- **Shared primitives only** (no ruvbase, no cross-module deps)

---

**End of SPARC Development Cycle**

*All five phases complete. Ready for implementation.*
```
