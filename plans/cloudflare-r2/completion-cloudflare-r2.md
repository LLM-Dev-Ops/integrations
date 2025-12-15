# Cloudflare R2 Storage Integration - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/cloudflare_r2`

---

## 1. Overview

This completion document provides the implementation roadmap, file manifests, test coverage requirements, CI/CD configuration, and operational runbooks for the Cloudflare R2 Storage Integration.

---

## 2. Implementation Checklist

### 2.1 Core Infrastructure

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 1 | Error types | `src/error.rs` | P0 | ⬜ |
| 2 | Configuration | `src/config.rs` | P0 | ⬜ |
| 3 | R2 Client | `src/client/client.rs` | P0 | ⬜ |
| 4 | Client Builder | `src/client/builder.rs` | P0 | ⬜ |
| 5 | Credentials | `src/client/credentials.rs` | P0 | ⬜ |

### 2.2 S3 Signing

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 6 | R2 Signer | `src/signing/signer.rs` | P0 | ⬜ |
| 7 | Canonical Request | `src/signing/canonical.rs` | P0 | ⬜ |
| 8 | Key Derivation | `src/signing/key_derivation.rs` | P0 | ⬜ |
| 9 | Presigned URLs | `src/signing/presign.rs` | P0 | ⬜ |

### 2.3 Object Operations

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 10 | Objects Service | `src/objects/service.rs` | P0 | ⬜ |
| 11 | Put Object | `src/objects/put.rs` | P0 | ⬜ |
| 12 | Get Object | `src/objects/get.rs` | P0 | ⬜ |
| 13 | Delete Object | `src/objects/delete.rs` | P0 | ⬜ |
| 14 | Head Object | `src/objects/head.rs` | P0 | ⬜ |
| 15 | Copy Object | `src/objects/copy.rs` | P0 | ⬜ |
| 16 | List Objects | `src/objects/list.rs` | P0 | ⬜ |

### 2.4 Multipart Upload

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 17 | Multipart Service | `src/multipart/service.rs` | P0 | ⬜ |
| 18 | Create Upload | `src/multipart/create.rs` | P0 | ⬜ |
| 19 | Upload Part | `src/multipart/upload_part.rs` | P0 | ⬜ |
| 20 | Complete Upload | `src/multipart/complete.rs` | P0 | ⬜ |
| 21 | Abort Upload | `src/multipart/abort.rs` | P0 | ⬜ |
| 22 | Orchestrator | `src/multipart/orchestrator.rs` | P0 | ⬜ |

### 2.5 Transport & Resilience

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 23 | HTTP Transport trait | `src/transport/http.rs` | P0 | ⬜ |
| 24 | Reqwest Transport | `src/transport/reqwest_transport.rs` | P0 | ⬜ |
| 25 | Streaming | `src/transport/streaming.rs` | P0 | ⬜ |
| 26 | Resilience Executor | `src/resilience/executor.rs` | P0 | ⬜ |

### 2.6 XML Parsing

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 27 | XML Parser | `src/xml/parser.rs` | P0 | ⬜ |
| 28 | List Objects XML | `src/xml/list_objects.rs` | P0 | ⬜ |
| 29 | Error XML | `src/xml/error.rs` | P0 | ⬜ |
| 30 | Multipart XML | `src/xml/multipart.rs` | P0 | ⬜ |
| 31 | XML Builder | `src/xml/builder.rs` | P0 | ⬜ |

### 2.7 Simulation Support

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 32 | Recorder | `src/simulation/recorder.rs` | P1 | ⬜ |
| 33 | Replayer | `src/simulation/replayer.rs` | P1 | ⬜ |
| 34 | Replay Transport | `src/simulation/replay_transport.rs` | P1 | ⬜ |

### 2.8 Testing Support

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 35 | Mock Client | `src/testing/mock_client.rs` | P0 | ⬜ |
| 36 | Mock Services | `src/testing/mock_services.rs` | P0 | ⬜ |
| 37 | Test Fixtures | `src/testing/fixtures.rs` | P0 | ⬜ |

### 2.9 TypeScript Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 38 | R2 Client | `typescript/src/client/client.ts` | P0 | ⬜ |
| 39 | Client Builder | `typescript/src/client/builder.ts` | P0 | ⬜ |
| 40 | Objects Service | `typescript/src/objects/service.ts` | P0 | ⬜ |
| 41 | Multipart Service | `typescript/src/multipart/service.ts` | P0 | ⬜ |
| 42 | Presign Service | `typescript/src/presign/service.ts` | P0 | ⬜ |
| 43 | S3 Signer | `typescript/src/signing/signer.ts` | P0 | ⬜ |
| 44 | XML Parser | `typescript/src/xml/parser.ts` | P0 | ⬜ |
| 45 | Error Types | `typescript/src/errors/r2-error.ts` | P0 | ⬜ |
| 46 | Type Definitions | `typescript/src/types/index.ts` | P0 | ⬜ |

---

## 3. File Manifest

### 3.1 Rust Crate Structure

```
integrations/cloudflare_r2/
├── Cargo.toml
├── README.md
├── src/
│   ├── lib.rs                          # Public API exports
│   ├── error.rs                        # R2Error enum
│   ├── config.rs                       # R2Config
│   │
│   ├── client/
│   │   ├── mod.rs                      # Client module exports
│   │   ├── client.rs                   # R2ClientImpl
│   │   ├── builder.rs                  # R2ClientBuilder
│   │   └── credentials.rs              # R2Credentials
│   │
│   ├── objects/
│   │   ├── mod.rs                      # Objects module exports
│   │   ├── service.rs                  # R2ObjectsServiceImpl
│   │   ├── put.rs                      # PutObject, PutObjectStream
│   │   ├── get.rs                      # GetObject, GetObjectStream
│   │   ├── delete.rs                   # DeleteObject, DeleteObjects
│   │   ├── head.rs                     # HeadObject
│   │   ├── copy.rs                     # CopyObject
│   │   └── list.rs                     # ListObjectsV2, pagination
│   │
│   ├── multipart/
│   │   ├── mod.rs                      # Multipart module exports
│   │   ├── service.rs                  # R2MultipartServiceImpl
│   │   ├── create.rs                   # CreateMultipartUpload
│   │   ├── upload_part.rs              # UploadPart
│   │   ├── complete.rs                 # CompleteMultipartUpload
│   │   ├── abort.rs                    # AbortMultipartUpload
│   │   ├── list_parts.rs               # ListParts
│   │   └── orchestrator.rs             # High-level upload with auto-multipart
│   │
│   ├── presign/
│   │   ├── mod.rs                      # Presign module exports
│   │   └── service.rs                  # R2PresignServiceImpl
│   │
│   ├── signing/
│   │   ├── mod.rs                      # Signing module exports
│   │   ├── signer.rs                   # R2Signer (S3 Sig V4)
│   │   ├── canonical.rs                # Canonical request builder
│   │   ├── key_derivation.rs           # Signing key derivation
│   │   └── presign.rs                  # Presigned URL generation
│   │
│   ├── transport/
│   │   ├── mod.rs                      # Transport module exports
│   │   ├── http.rs                     # HttpTransport trait
│   │   ├── reqwest_transport.rs        # Reqwest-based implementation
│   │   └── streaming.rs                # Streaming request/response
│   │
│   ├── resilience/
│   │   ├── mod.rs                      # Resilience module exports
│   │   └── executor.rs                 # Retry + circuit breaker integration
│   │
│   ├── xml/
│   │   ├── mod.rs                      # XML module exports
│   │   ├── parser.rs                   # XML response parsing utilities
│   │   ├── list_objects.rs             # ListBucketResult parser
│   │   ├── error.rs                    # Error response parser
│   │   ├── multipart.rs                # Multipart XML responses
│   │   └── builder.rs                  # XML request body building
│   │
│   ├── simulation/
│   │   ├── mod.rs                      # Simulation module exports
│   │   ├── recorder.rs                 # SimulationRecorder
│   │   ├── replayer.rs                 # SimulationReplayer
│   │   └── replay_transport.rs         # ReplayTransport
│   │
│   ├── types/
│   │   ├── mod.rs                      # Types module exports
│   │   ├── requests.rs                 # Request structs
│   │   ├── responses.rs                # Response structs
│   │   └── common.rs                   # Shared types (Object, etc.)
│   │
│   └── testing/
│       ├── mod.rs                      # Testing module exports
│       ├── mock_client.rs              # MockR2Client
│       ├── mock_services.rs            # Mock service implementations
│       └── fixtures.rs                 # Test data fixtures
│
├── tests/
│   ├── unit/
│   │   ├── signing_test.rs
│   │   ├── canonical_request_test.rs
│   │   ├── presign_test.rs
│   │   ├── put_object_test.rs
│   │   ├── get_object_test.rs
│   │   ├── delete_object_test.rs
│   │   ├── list_objects_test.rs
│   │   ├── multipart_test.rs
│   │   ├── xml_parsing_test.rs
│   │   ├── error_mapping_test.rs
│   │   ├── url_encoding_test.rs
│   │   └── config_validation_test.rs
│   │
│   └── integration/
│       ├── full_lifecycle_test.rs
│       ├── multipart_upload_test.rs
│       ├── streaming_test.rs
│       ├── presigned_url_test.rs
│       ├── resilience_test.rs
│       ├── simulation_test.rs
│       └── concurrent_access_test.rs
│
├── benches/
│   ├── signing.rs
│   ├── xml_parsing.rs
│   ├── streaming.rs
│   └── multipart.rs
│
└── examples/
    ├── basic_operations.rs
    ├── streaming_upload.rs
    ├── multipart_upload.rs
    ├── presigned_urls.rs
    └── simulation_replay.rs
```

### 3.2 TypeScript Package Structure

```
typescript/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                        # Public exports
│   │
│   ├── client/
│   │   ├── index.ts
│   │   ├── client.ts                   # R2Client class
│   │   ├── builder.ts                  # R2ClientBuilder
│   │   └── config.ts                   # R2Config interface
│   │
│   ├── objects/
│   │   ├── index.ts
│   │   ├── service.ts                  # R2ObjectsService
│   │   ├── put.ts                      # putObject, putStream
│   │   ├── get.ts                      # getObject, getStream
│   │   ├── delete.ts                   # deleteObject, deleteObjects
│   │   ├── head.ts                     # headObject
│   │   ├── copy.ts                     # copyObject
│   │   └── list.ts                     # listObjects, listAll
│   │
│   ├── multipart/
│   │   ├── index.ts
│   │   ├── service.ts                  # R2MultipartService
│   │   ├── operations.ts               # Create, upload, complete, abort
│   │   └── orchestrator.ts             # High-level upload
│   │
│   ├── presign/
│   │   ├── index.ts
│   │   └── service.ts                  # Presigned URL generation
│   │
│   ├── signing/
│   │   ├── index.ts
│   │   ├── signer.ts                   # S3 Signature V4
│   │   ├── canonical.ts                # Canonical request
│   │   └── crypto.ts                   # HMAC-SHA256 utilities
│   │
│   ├── transport/
│   │   ├── index.ts
│   │   ├── http-transport.ts           # Transport interface
│   │   ├── fetch-transport.ts          # Fetch-based transport
│   │   └── streaming.ts                # Stream utilities
│   │
│   ├── resilience/
│   │   ├── index.ts
│   │   └── executor.ts                 # Shared resilience integration
│   │
│   ├── xml/
│   │   ├── index.ts
│   │   ├── parser.ts                   # XML parsing utilities
│   │   ├── responses.ts                # Response type parsers
│   │   └── builders.ts                 # Request body builders
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   ├── r2-error.ts                 # R2Error class hierarchy
│   │   └── mapping.ts                  # Error code mapping
│   │
│   ├── simulation/
│   │   ├── index.ts
│   │   ├── recorder.ts                 # Recording implementation
│   │   ├── replayer.ts                 # Replay implementation
│   │   └── replay-transport.ts         # Transport wrapper
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── requests.ts                 # Request interfaces
│   │   ├── responses.ts                # Response interfaces
│   │   └── common.ts                   # Shared types
│   │
│   └── testing/
│       ├── index.ts
│       ├── mock-client.ts              # Mock implementation
│       └── fixtures.ts                 # Test fixtures
│
├── tests/
│   ├── signing.test.ts
│   ├── canonical.test.ts
│   ├── presign.test.ts
│   ├── objects.test.ts
│   ├── multipart.test.ts
│   ├── xml-parser.test.ts
│   ├── error-mapping.test.ts
│   ├── streaming.test.ts
│   └── simulation.test.ts
│
└── examples/
    ├── basic-usage.ts
    ├── streaming-upload.ts
    ├── presigned-url.ts
    └── simulation-replay.ts
```

### 3.3 File Count Summary

| Category | Files | Lines (Est.) |
|----------|-------|--------------|
| Rust Source | 42 | ~6,500 |
| Rust Tests | 19 | ~3,500 |
| Rust Benches | 4 | ~400 |
| Rust Examples | 5 | ~600 |
| TypeScript Source | 32 | ~3,500 |
| TypeScript Tests | 9 | ~1,500 |
| Config/Docs | 4 | ~300 |
| **Total** | **115** | **~16,300** |

---

## 4. Dependency Specification

### 4.1 Cargo.toml

```toml
[package]
name = "cloudflare-r2"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"
description = "Cloudflare R2 storage integration for LLM Dev Ops platform"
license = "MIT"

[features]
default = ["reqwest-transport"]
reqwest-transport = ["reqwest"]
simulation = []
full = ["reqwest-transport", "simulation"]

[dependencies]
# Async runtime
tokio = { version = "1.35", features = ["sync", "time", "io-util", "fs"] }
futures = "0.3"
async-trait = "0.1"
pin-project = "1.1"

# HTTP client (optional, behind feature)
reqwest = { version = "0.11", features = ["stream", "rustls-tls"], optional = true }

# Cryptography
ring = "0.17"
sha2 = "0.10"
hmac = "0.12"
hex = "0.4"
base64 = "0.21"

# XML parsing
quick-xml = "0.31"

# URL handling
url = "2.5"
urlencoding = "2.1"

# Time
chrono = { version = "0.4", features = ["serde"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Bytes handling
bytes = "1.5"

# Concurrency
parking_lot = "0.12"

# Security
secrecy = { version = "0.8", features = ["serde"] }
zeroize = "1.7"

# Utilities
thiserror = "1.0"
tracing = "0.1"

# Shared modules
shared-auth = { path = "../../shared/auth" }
shared-config = { path = "../../shared/config" }
shared-tracing = { path = "../../shared/tracing" }
shared-metrics = { path = "../../shared/metrics" }
shared-retry = { path = "../../shared/retry" }
shared-circuit-breaker = { path = "../../shared/circuit-breaker" }

[dev-dependencies]
tokio = { version = "1.35", features = ["full", "test-util"] }
tokio-test = "0.4"
criterion = { version = "0.5", features = ["async_tokio"] }
proptest = "1.4"
insta = "1.34"
mockall = "0.12"
tempfile = "3.9"
wiremock = "0.5"
test-case = "3.3"
rand = "0.8"

[[bench]]
name = "signing"
harness = false

[[bench]]
name = "xml_parsing"
harness = false

[[bench]]
name = "streaming"
harness = false

[[example]]
name = "basic_operations"

[[example]]
name = "multipart_upload"

[[example]]
name = "presigned_urls"
```

### 4.2 TypeScript package.json

```json
{
  "name": "@llm-devops/cloudflare-r2",
  "version": "0.1.0",
  "description": "Cloudflare R2 storage integration for LLM Dev Ops platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testPathPattern=integration",
    "lint": "eslint src tests",
    "format": "prettier --write src tests"
  },
  "dependencies": {
    "@noble/hashes": "^1.3.3",
    "fast-xml-parser": "^4.3.2"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "prettier": "^3.2.0",
    "nock": "^13.5.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "keywords": [
    "cloudflare",
    "r2",
    "s3",
    "object-storage",
    "llm-devops"
  ]
}
```

---

## 5. Test Coverage Requirements

### 5.1 Unit Test Coverage

| Component | Min Coverage | Critical Paths |
|-----------|--------------|----------------|
| `signer.rs` | 95% | Sign request, presign URL |
| `canonical.rs` | 95% | Canonical request, query string |
| `key_derivation.rs` | 90% | Key derivation |
| `put.rs` | 90% | Put object, streaming |
| `get.rs` | 90% | Get object, streaming, range |
| `delete.rs` | 90% | Single, batch delete |
| `list.rs` | 90% | Pagination, filtering |
| `multipart/*.rs` | 90% | Full lifecycle |
| `orchestrator.rs` | 85% | Auto-multipart decision |
| `xml/*.rs` | 95% | All response types |
| `error.rs` | 90% | Error mapping |
| **Overall** | **85%** | |

### 5.2 Test Case Matrix

#### Signing Tests
```
signing_test.rs:
├── test_sign_request_basic
├── test_sign_request_with_query_params
├── test_sign_request_with_headers
├── test_sign_request_empty_body
├── test_sign_request_streaming_body
├── test_canonical_request_construction
├── test_string_to_sign_format
├── test_signature_calculation
├── test_authorization_header_format
├── test_signing_key_derivation
├── test_signing_key_caching
├── test_timestamp_format
└── test_region_always_auto
```

#### Presigned URL Tests
```
presign_test.rs:
├── test_presign_get_url
├── test_presign_put_url
├── test_presign_expiration_7_days
├── test_presign_expiration_too_long_error
├── test_presign_query_params_sorted
├── test_presign_signature_included
├── test_presign_unicode_key
├── test_presign_special_characters
└── test_presign_deterministic
```

#### Object Operations Tests
```
put_object_test.rs:
├── test_put_object_basic
├── test_put_object_with_content_type
├── test_put_object_with_metadata
├── test_put_object_with_cache_control
├── test_put_object_empty_body
├── test_put_object_large_body
├── test_put_stream_basic
├── test_put_stream_with_size
└── test_put_stream_unknown_size

get_object_test.rs:
├── test_get_object_basic
├── test_get_object_not_found
├── test_get_object_with_range
├── test_get_object_if_match
├── test_get_object_if_none_match
├── test_get_object_not_modified
├── test_get_stream_basic
├── test_get_stream_large_object
└── test_get_stream_interrupted

delete_object_test.rs:
├── test_delete_object_basic
├── test_delete_object_not_found
├── test_delete_objects_batch
├── test_delete_objects_partial_failure
├── test_delete_objects_max_1000
└── test_delete_objects_quiet_mode

list_objects_test.rs:
├── test_list_objects_basic
├── test_list_objects_with_prefix
├── test_list_objects_with_delimiter
├── test_list_objects_pagination
├── test_list_objects_continuation_token
├── test_list_objects_max_keys
├── test_list_all_iterator
└── test_list_objects_empty_bucket
```

#### Multipart Tests
```
multipart_test.rs:
├── test_create_multipart_upload
├── test_upload_part_basic
├── test_upload_part_number_validation
├── test_complete_multipart_upload
├── test_complete_multipart_parts_order
├── test_abort_multipart_upload
├── test_list_parts
├── test_orchestrator_small_object
├── test_orchestrator_large_object
├── test_orchestrator_concurrent_parts
├── test_orchestrator_failure_cleanup
└── test_orchestrator_resume_after_failure
```

#### XML Parsing Tests
```
xml_parsing_test.rs:
├── test_parse_list_objects_response
├── test_parse_list_objects_truncated
├── test_parse_list_objects_common_prefixes
├── test_parse_error_response
├── test_parse_error_no_such_key
├── test_parse_error_access_denied
├── test_parse_initiate_multipart_response
├── test_parse_complete_multipart_response
├── test_parse_list_parts_response
├── test_build_delete_objects_xml
└── test_build_complete_multipart_xml
```

#### Error Mapping Tests
```
error_mapping_test.rs:
├── test_map_403_access_denied
├── test_map_404_no_such_key
├── test_map_404_no_such_bucket
├── test_map_412_precondition_failed
├── test_map_500_internal_error
├── test_map_503_service_unavailable
├── test_map_503_slow_down
├── test_is_retryable_server_error
├── test_is_retryable_network_error
└── test_not_retryable_client_error
```

#### Resilience Tests
```
resilience_test.rs:
├── test_retry_on_server_error
├── test_retry_on_timeout
├── test_retry_respects_max_attempts
├── test_retry_exponential_backoff
├── test_retry_with_jitter
├── test_circuit_breaker_opens
├── test_circuit_breaker_half_open
├── test_circuit_breaker_closes
└── test_rate_limiter_throttles
```

#### Simulation Tests
```
simulation_test.rs:
├── test_record_put_object
├── test_record_get_object
├── test_record_multipart_upload
├── test_replay_put_object
├── test_replay_get_object
├── test_replay_multipart_upload
├── test_replay_not_found_error
├── test_replay_with_latency
└── test_export_import_recordings
```

### 5.3 Integration Test Scenarios

```
integration/
├── full_lifecycle_test.rs
│   ├── test_put_get_delete_cycle
│   ├── test_put_head_get_cycle
│   ├── test_copy_then_delete_cycle
│   └── test_list_after_put_cycle
│
├── multipart_upload_test.rs
│   ├── test_100mb_multipart_upload
│   ├── test_concurrent_part_uploads
│   ├── test_abort_incomplete_upload
│   └── test_resume_multipart_upload
│
├── streaming_test.rs
│   ├── test_stream_1gb_upload
│   ├── test_stream_1gb_download
│   ├── test_stream_with_backpressure
│   └── test_stream_network_interruption
│
├── presigned_url_test.rs
│   ├── test_presigned_get_works
│   ├── test_presigned_put_works
│   ├── test_presigned_expired_fails
│   └── test_presigned_wrong_key_fails
│
├── concurrent_access_test.rs
│   ├── test_concurrent_puts
│   ├── test_concurrent_gets
│   ├── test_concurrent_deletes
│   └── test_concurrent_multipart_uploads
│
└── simulation_test.rs
    ├── test_full_cycle_with_recording
    ├── test_replay_matches_original
    └── test_ci_without_r2_access
```

### 5.4 Performance Benchmarks

```rust
// benches/signing.rs
#[bench]
fn bench_sign_request_cached_key(b: &mut Bencher) {
    // Target: < 10μs
}

#[bench]
fn bench_sign_request_new_key(b: &mut Bencher) {
    // Target: < 100μs
}

#[bench]
fn bench_presign_url(b: &mut Bencher) {
    // Target: < 20μs
}

// benches/xml_parsing.rs
#[bench]
fn bench_parse_list_100_objects(b: &mut Bencher) {
    // Target: < 1ms
}

#[bench]
fn bench_parse_list_1000_objects(b: &mut Bencher) {
    // Target: < 5ms
}

#[bench]
fn bench_parse_error_response(b: &mut Bencher) {
    // Target: < 50μs
}

// benches/streaming.rs
#[bench]
fn bench_stream_throughput_10mb(b: &mut Bencher) {
    // Target: > 100 MB/s
}

// benches/multipart.rs
#[bench]
fn bench_multipart_orchestrator_decision(b: &mut Bencher) {
    // Target: < 1μs
}
```

---

## 6. CI/CD Pipeline

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/cloudflare-r2.yml
name: Cloudflare R2 Integration CI

on:
  push:
    branches: [main]
    paths:
      - 'integrations/cloudflare_r2/**'
      - '.github/workflows/cloudflare-r2.yml'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/cloudflare_r2/**'

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/cloudflare_r2

      - name: Check formatting
        run: cargo fmt --check
        working-directory: integrations/cloudflare_r2

      - name: Clippy
        run: cargo clippy --all-features -- -D warnings
        working-directory: integrations/cloudflare_r2

  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/cloudflare_r2

      - name: Run unit tests
        run: cargo test --lib --all-features
        working-directory: integrations/cloudflare_r2

      - name: Run doc tests
        run: cargo test --doc --all-features
        working-directory: integrations/cloudflare_r2

  test-integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/cloudflare_r2

      - name: Run integration tests (simulation mode)
        run: cargo test --test '*' --features simulation
        working-directory: integrations/cloudflare_r2

  test-integration-live:
    name: Integration Tests (Live R2)
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/cloudflare_r2

      - name: Run live integration tests
        run: cargo test --test '*' --all-features
        working-directory: integrations/cloudflare_r2
        env:
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_TEST_BUCKET: ${{ secrets.R2_TEST_BUCKET }}

  test-coverage:
    name: Code Coverage
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install cargo-tarpaulin
        run: cargo install cargo-tarpaulin

      - name: Run coverage
        run: |
          cargo tarpaulin --all-features --workspace \
            --out xml --output-dir coverage \
            --ignore-tests --skip-clean
        working-directory: integrations/cloudflare_r2

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/cloudflare_r2/coverage/cobertura.xml
          flags: cloudflare-r2
          fail_ci_if_error: true

  benchmark:
    name: Benchmarks
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run benchmarks
        run: cargo bench --all-features -- --output-format bencher | tee bench-results.txt
        working-directory: integrations/cloudflare_r2

      - name: Compare benchmarks
        uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: 'cargo'
          output-file-path: integrations/cloudflare_r2/bench-results.txt
          alert-threshold: '150%'
          fail-on-alert: true

  test-typescript:
    name: TypeScript Tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: integrations/cloudflare_r2/typescript
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/cloudflare_r2/typescript/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Test
        run: npm run test:coverage

  build:
    name: Build Release
    needs: [lint, test-unit, test-integration, test-typescript]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Build release
        run: cargo build --release --all-features
        working-directory: integrations/cloudflare_r2

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: cloudflare-r2
          path: integrations/cloudflare_r2/target/release/libcloudflare_r2.*
```

### 6.2 Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: cargo-fmt-r2
        name: cargo fmt (cloudflare-r2)
        entry: cargo fmt --manifest-path integrations/cloudflare_r2/Cargo.toml --
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-clippy-r2
        name: cargo clippy (cloudflare-r2)
        entry: cargo clippy --manifest-path integrations/cloudflare_r2/Cargo.toml --all-features -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-test-r2
        name: cargo test (cloudflare-r2)
        entry: cargo test --manifest-path integrations/cloudflare_r2/Cargo.toml --lib
        language: system
        types: [rust]
        pass_filenames: false
```

---

## 7. Deployment Guide

### 7.1 Environment Configuration

```bash
# Required: R2 credentials
export R2_ACCOUNT_ID="your-cloudflare-account-id"
export R2_ACCESS_KEY_ID="your-r2-access-key-id"
export R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"

# Optional: Custom endpoint (for testing)
export R2_ENDPOINT=""

# Timeout configuration
export R2_TIMEOUT_SECONDS="300"

# Multipart configuration
export R2_MULTIPART_THRESHOLD_BYTES="104857600"   # 100MB
export R2_MULTIPART_PART_SIZE_BYTES="10485760"    # 10MB
export R2_MULTIPART_CONCURRENCY="4"

# Connection pool
export R2_POOL_MAX_IDLE="20"
export R2_POOL_IDLE_TIMEOUT_SECONDS="90"

# Resilience configuration
export R2_RETRY_MAX_ATTEMPTS="3"
export R2_RETRY_BASE_DELAY_MS="100"
export R2_RETRY_MAX_DELAY_MS="30000"
export R2_CIRCUIT_BREAKER_FAILURE_THRESHOLD="5"
export R2_CIRCUIT_BREAKER_RESET_TIMEOUT_SECONDS="30"

# Simulation (development only)
export R2_SIMULATION_ENABLED="false"
export R2_SIMULATION_RECORDING_PATH="./recordings/r2"
```

### 7.2 Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: R2_ACCOUNT_ID
              valueFrom:
                secretKeyRef:
                  name: r2-credentials
                  key: account-id
            - name: R2_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: r2-credentials
                  key: access-key-id
            - name: R2_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: r2-credentials
                  key: secret-access-key
            - name: R2_TIMEOUT_SECONDS
              value: "300"
            - name: R2_MULTIPART_THRESHOLD_BYTES
              value: "104857600"
            - name: R2_MULTIPART_CONCURRENCY
              value: "4"
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Secret
metadata:
  name: r2-credentials
type: Opaque
stringData:
  account-id: "your-account-id"
  access-key-id: "your-access-key-id"
  secret-access-key: "your-secret-access-key"
```

### 7.3 Vault Integration

```hcl
# vault/r2-policy.hcl
path "secret/data/cloudflare/r2" {
  capabilities = ["read"]
}

# Store secrets
vault kv put secret/cloudflare/r2 \
  account_id="your-account-id" \
  access_key_id="your-access-key-id" \
  secret_access_key="your-secret-access-key"
```

```rust
// Integration with Vault
impl R2ClientBuilder {
    pub async fn with_vault_credentials(
        mut self,
        vault_client: &VaultClient,
        path: &str,
    ) -> Result<Self, R2Error> {
        let secret = vault_client.read_secret(path).await?;

        self.account_id = Some(secret.get("account_id")?.clone());
        self.access_key_id = Some(secret.get("access_key_id")?.clone());
        self.secret_access_key = Some(SecretString::new(
            secret.get("secret_access_key")?.clone()
        ));

        Ok(self)
    }
}
```

---

## 8. Operational Runbooks

### 8.1 Runbook: Upload Failures

**Symptoms:**
- `r2_errors_total{operation="PutObject"}` increasing
- 5xx errors from R2
- Timeouts during upload

**Diagnosis:**
```bash
# Check error metrics
curl -s localhost:9090/metrics | grep r2_errors_total

# Check retry metrics
curl -s localhost:9090/metrics | grep r2_retries_total

# Check circuit breaker state
curl -s localhost:9090/metrics | grep r2_circuit_breaker_state

# Check application logs
kubectl logs my-service-xxx | grep -i "r2.*error"
```

**Resolution:**
1. **Check R2 status page**: https://www.cloudflarestatus.com/

2. **Check for rate limiting**:
   ```bash
   kubectl logs my-service-xxx | grep -i "SlowDown"
   ```

3. **Reduce upload concurrency**:
   ```bash
   export R2_MULTIPART_CONCURRENCY=2
   ```

4. **Increase timeouts**:
   ```bash
   export R2_TIMEOUT_SECONDS=600
   ```

5. **Check circuit breaker**:
   - If open, wait for reset timeout
   - Consider increasing failure threshold

### 8.2 Runbook: Download Failures

**Symptoms:**
- `r2_errors_total{operation="GetObject"}` increasing
- Objects not found errors
- Stream interruption errors

**Diagnosis:**
```bash
# Check error distribution
curl -s localhost:9090/metrics | grep 'r2_errors_total{operation="GetObject"'

# Check specific error types
kubectl logs my-service-xxx | grep "GetObject" | grep -i error

# Verify object exists
aws s3api head-object \
  --endpoint-url https://<account>.r2.cloudflarestorage.com \
  --bucket my-bucket \
  --key my-key
```

**Resolution:**
1. **For ObjectNotFound errors**:
   - Verify object key is correct
   - Check bucket permissions

2. **For stream interruption**:
   - Enable stream resume logic
   - Increase timeout for large objects

3. **For signature errors**:
   - Verify credentials are valid
   - Check system clock synchronization

### 8.3 Runbook: Multipart Upload Stuck

**Symptoms:**
- Incomplete multipart uploads accumulating
- Storage usage higher than expected
- `r2_multipart_parts_total{status="aborted"}` not increasing on failures

**Diagnosis:**
```bash
# Check multipart metrics
curl -s localhost:9090/metrics | grep r2_multipart

# List incomplete uploads (using S3 API)
aws s3api list-multipart-uploads \
  --endpoint-url https://<account>.r2.cloudflarestorage.com \
  --bucket my-bucket

# Check for orphaned uploads in logs
kubectl logs my-service-xxx | grep "multipart" | grep -v "completed"
```

**Resolution:**
1. **Abort stale uploads**:
   ```bash
   aws s3api abort-multipart-upload \
     --endpoint-url https://<account>.r2.cloudflarestorage.com \
     --bucket my-bucket \
     --key my-key \
     --upload-id <upload-id>
   ```

2. **Configure lifecycle policy** (via Cloudflare dashboard):
   - Automatically abort incomplete uploads after N days

3. **Fix application cleanup**:
   - Ensure MultipartCleanupGuard is used
   - Add abort on failure handling

### 8.4 Runbook: Credential Issues

**Symptoms:**
- `r2_errors_total{error_type="auth"}` increasing
- SignatureDoesNotMatch errors
- InvalidAccessKeyId errors

**Diagnosis:**
```bash
# Check auth errors
kubectl logs my-service-xxx | grep -i "signature\|access.*key\|auth"

# Verify credentials are set
kubectl exec my-service-xxx -- printenv | grep R2_

# Test credentials directly
curl -v "https://<account>.r2.cloudflarestorage.com/<bucket>/" \
  -H "Host: <account>.r2.cloudflarestorage.com"
```

**Resolution:**
1. **Verify credentials in Cloudflare dashboard**:
   - Check API token is active
   - Verify permissions include R2 read/write

2. **Check for clock skew**:
   ```bash
   kubectl exec my-service-xxx -- date
   ```
   - S3 Sig V4 requires timestamp within 15 minutes

3. **Rotate credentials**:
   - Generate new API token in Cloudflare
   - Update Kubernetes secret
   - Restart pods

4. **Check signing implementation**:
   - Verify region is "auto"
   - Verify service is "s3"

### 8.5 Runbook: Performance Degradation

**Symptoms:**
- `r2_request_duration_seconds` increasing
- Slow uploads/downloads
- High p99 latency

**Diagnosis:**
```bash
# Check latency distribution
curl -s localhost:9090/metrics | grep r2_request_duration

# Check bytes transferred rate
curl -s localhost:9090/metrics | grep r2_bytes_transferred

# Check connection pool
curl -s localhost:9090/metrics | grep r2_connection_pool
```

**Resolution:**
1. **Increase connection pool**:
   ```bash
   export R2_POOL_MAX_IDLE=50
   ```

2. **Enable HTTP/2**:
   - Check transport configuration

3. **Optimize multipart settings**:
   ```bash
   export R2_MULTIPART_PART_SIZE_BYTES=20971520  # 20MB
   export R2_MULTIPART_CONCURRENCY=8
   ```

4. **Check network path**:
   - Verify no proxy interference
   - Check for bandwidth throttling

---

## 9. Acceptance Criteria Verification

### 9.1 Functional Requirements

| # | Requirement | Test | Status |
|---|-------------|------|--------|
| 1 | PutObject works | `test_put_object_basic` | ⬜ |
| 2 | PutObject with streaming | `test_put_stream_basic` | ⬜ |
| 3 | GetObject works | `test_get_object_basic` | ⬜ |
| 4 | GetObject with range | `test_get_object_with_range` | ⬜ |
| 5 | GetObject streaming | `test_get_stream_basic` | ⬜ |
| 6 | DeleteObject works | `test_delete_object_basic` | ⬜ |
| 7 | DeleteObjects batch | `test_delete_objects_batch` | ⬜ |
| 8 | HeadObject works | `test_head_object_basic` | ⬜ |
| 9 | CopyObject works | `test_copy_object_basic` | ⬜ |
| 10 | ListObjectsV2 works | `test_list_objects_basic` | ⬜ |
| 11 | ListObjectsV2 pagination | `test_list_objects_pagination` | ⬜ |
| 12 | Multipart create | `test_create_multipart_upload` | ⬜ |
| 13 | Multipart upload part | `test_upload_part_basic` | ⬜ |
| 14 | Multipart complete | `test_complete_multipart_upload` | ⬜ |
| 15 | Multipart abort | `test_abort_multipart_upload` | ⬜ |
| 16 | Auto-multipart > 100MB | `test_orchestrator_large_object` | ⬜ |
| 17 | Presigned GET URL | `test_presign_get_url` | ⬜ |
| 18 | Presigned PUT URL | `test_presign_put_url` | ⬜ |
| 19 | S3 Sig V4 signing | `test_sign_request_basic` | ⬜ |
| 20 | Error mapping | `test_map_403_access_denied` | ⬜ |
| 21 | Retry on 5xx | `test_retry_on_server_error` | ⬜ |
| 22 | Circuit breaker | `test_circuit_breaker_opens` | ⬜ |
| 23 | Simulation record | `test_record_put_object` | ⬜ |
| 24 | Simulation replay | `test_replay_put_object` | ⬜ |

### 9.2 Non-Functional Requirements

| # | Requirement | Benchmark | Target | Status |
|---|-------------|-----------|--------|--------|
| 1 | Signing latency (cached) | `bench_sign_request_cached_key` | < 10μs | ⬜ |
| 2 | Signing latency (new key) | `bench_sign_request_new_key` | < 100μs | ⬜ |
| 3 | Presign URL generation | `bench_presign_url` | < 20μs | ⬜ |
| 4 | XML parsing (100 obj) | `bench_parse_list_100_objects` | < 1ms | ⬜ |
| 5 | XML parsing (1000 obj) | `bench_parse_list_1000_objects` | < 5ms | ⬜ |
| 6 | Stream throughput | `bench_stream_throughput_10mb` | > 100 MB/s | ⬜ |
| 7 | Memory bounded streaming | `test_stream_1gb_download` | < 64KB buffer | ⬜ |
| 8 | Credentials never logged | Manual review | Pass | ⬜ |
| 9 | Concurrent safety | `test_concurrent_puts` | No race | ⬜ |
| 10 | Test coverage | `cargo tarpaulin` | > 85% | ⬜ |

---

## 10. Sign-Off Checklist

### 10.1 Development Sign-Off

| Item | Owner | Date | Signature |
|------|-------|------|-----------|
| Code complete | | | |
| Unit tests passing | | | |
| Integration tests passing | | | |
| Benchmarks meet targets | | | |
| Documentation complete | | | |
| Code review approved | | | |

### 10.2 Security Sign-Off

| Item | Owner | Date | Signature |
|------|-------|------|-----------|
| Credential handling reviewed | | | |
| No secrets in logs verified | | | |
| Input validation complete | | | |
| Presigned URL limits verified | | | |
| TLS configuration reviewed | | | |

### 10.3 QA Sign-Off

| Item | Owner | Date | Signature |
|------|-------|------|-----------|
| Functional testing complete | | | |
| Performance testing complete | | | |
| Large file testing complete | | | |
| Simulation mode verified | | | |
| Error handling verified | | | |

### 10.4 Operations Sign-Off

| Item | Owner | Date | Signature |
|------|-------|------|-----------|
| Runbooks validated | | | |
| Monitoring configured | | | |
| Alerting configured | | | |
| Deployment tested in staging | | | |
| Credential rotation tested | | | |

---

## 11. Grafana Dashboard Template

```json
{
  "title": "Cloudflare R2 Storage",
  "panels": [
    {
      "title": "R2 Requests per Second",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(r2_requests_total[5m])",
          "legendFormat": "{{operation}} - {{status}}"
        }
      ]
    },
    {
      "title": "R2 Request Latency",
      "type": "heatmap",
      "targets": [
        {
          "expr": "rate(r2_request_duration_seconds_bucket[5m])",
          "legendFormat": "{{le}}"
        }
      ]
    },
    {
      "title": "Bytes Transferred",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(r2_bytes_transferred_total[5m])",
          "legendFormat": "{{operation}} - {{direction}}"
        }
      ]
    },
    {
      "title": "Error Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(r2_errors_total[5m])",
          "legendFormat": "{{operation}} - {{error_type}}"
        }
      ]
    },
    {
      "title": "Retry Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(r2_retries_total[5m])",
          "legendFormat": "{{operation}} - attempt {{attempt}}"
        }
      ]
    },
    {
      "title": "Circuit Breaker State",
      "type": "stat",
      "targets": [
        {
          "expr": "r2_circuit_breaker_state",
          "legendFormat": "State"
        }
      ],
      "mappings": [
        { "value": 0, "text": "CLOSED" },
        { "value": 1, "text": "OPEN" },
        { "value": 2, "text": "HALF-OPEN" }
      ]
    },
    {
      "title": "Multipart Uploads",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(r2_multipart_parts_total[5m])",
          "legendFormat": "{{status}}"
        }
      ]
    },
    {
      "title": "Connection Pool",
      "type": "gauge",
      "targets": [
        {
          "expr": "r2_connection_pool_size"
        }
      ]
    }
  ]
}
```

---

## 12. Alert Rules

```yaml
# prometheus/r2-alerts.yml
groups:
  - name: cloudflare-r2
    rules:
      - alert: R2HighErrorRate
        expr: |
          sum(rate(r2_errors_total[5m])) / sum(rate(r2_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High R2 error rate"
          description: "R2 error rate is above 5% for 5 minutes"

      - alert: R2CircuitBreakerOpen
        expr: r2_circuit_breaker_state == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "R2 circuit breaker is open"
          description: "R2 circuit breaker has tripped, requests are being rejected"

      - alert: R2HighLatency
        expr: |
          histogram_quantile(0.99, rate(r2_request_duration_seconds_bucket[5m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High R2 latency"
          description: "R2 p99 latency is above 10 seconds"

      - alert: R2AuthErrors
        expr: |
          sum(rate(r2_errors_total{error_type="auth"}[5m])) > 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "R2 authentication errors"
          description: "R2 is returning authentication errors"

      - alert: R2MultipartStuck
        expr: |
          increase(r2_multipart_parts_total{status="completed"}[1h]) == 0
          and
          increase(r2_multipart_parts_total{status="started"}[1h]) > 0
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Multipart uploads not completing"
          description: "Multipart uploads are being started but not completed"
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-14 | SPARC Generator | Initial Completion |

---

**SPARC Cycle Complete** - The Cloudflare R2 Storage Integration specification is ready for implementation.
