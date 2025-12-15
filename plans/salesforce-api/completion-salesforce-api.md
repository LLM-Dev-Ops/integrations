# Salesforce API Integration - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/salesforce_api`

---

## 1. Overview

This completion document provides the implementation roadmap, file manifests, test coverage requirements, CI/CD configuration, and operational runbooks for the Salesforce API Integration.

---

## 2. Implementation Checklist

### 2.1 Core Infrastructure

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 1 | Error types | `src/error.rs` | P0 | |
| 2 | Configuration | `src/config.rs` | P0 | |
| 3 | Salesforce Client | `src/client/client.rs` | P0 | |
| 4 | Client Builder | `src/client/builder.rs` | P0 | |

### 2.2 Authentication

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 5 | Auth Provider trait | `src/auth/provider.rs` | P0 | |
| 6 | JWT Bearer flow | `src/auth/jwt_bearer.rs` | P0 | |
| 7 | Refresh Token flow | `src/auth/refresh_token.rs` | P0 | |
| 8 | Token Manager | `src/auth/token_manager.rs` | P0 | |

### 2.3 SObject Operations

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 9 | SObject Service | `src/sobjects/service.rs` | P0 | |
| 10 | Create Record | `src/sobjects/create.rs` | P0 | |
| 11 | Get Record | `src/sobjects/read.rs` | P0 | |
| 12 | Update Record | `src/sobjects/update.rs` | P0 | |
| 13 | Upsert Record | `src/sobjects/upsert.rs` | P0 | |
| 14 | Delete Record | `src/sobjects/delete.rs` | P0 | |
| 15 | Describe SObject | `src/sobjects/describe.rs` | P1 | |
| 16 | Composite Requests | `src/sobjects/composite.rs` | P0 | |

### 2.4 Query Operations

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 17 | Query Service | `src/query/service.rs` | P0 | |
| 18 | Execute Query | `src/query/execute.rs` | P0 | |
| 19 | Query Streaming | `src/query/stream.rs` | P0 | |
| 20 | Explain Query | `src/query/explain.rs` | P1 | |

### 2.5 Bulk API 2.0

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 21 | Bulk Service | `src/bulk/service.rs` | P0 | |
| 22 | Create Job | `src/bulk/job.rs` | P0 | |
| 23 | Upload Data | `src/bulk/upload.rs` | P0 | |
| 24 | Poll Status | `src/bulk/poll.rs` | P0 | |
| 25 | Get Results | `src/bulk/results.rs` | P0 | |
| 26 | Orchestrator | `src/bulk/orchestrator.rs` | P0 | |

### 2.6 Event Handling

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 27 | Event Service | `src/events/service.rs` | P0 | |
| 28 | Publish Events | `src/events/publish.rs` | P0 | |
| 29 | Pub/Sub Client | `src/events/pubsub/client.rs` | P0 | |
| 30 | Subscribe | `src/events/pubsub/subscribe.rs` | P0 | |
| 31 | Avro Decoder | `src/events/pubsub/avro.rs` | P0 | |
| 32 | CDC Subscription | `src/events/cdc.rs` | P1 | |

### 2.7 Limits & Rate Tracking

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 33 | Limits Service | `src/limits/service.rs` | P0 | |
| 34 | Rate Tracker | `src/limits/tracker.rs` | P0 | |

### 2.8 Transport & Resilience

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 35 | HTTP Client trait | `src/transport/http.rs` | P0 | |
| 36 | Reqwest Client | `src/transport/reqwest_client.rs` | P0 | |
| 37 | gRPC Client | `src/transport/grpc.rs` | P0 | |
| 38 | Resilience Executor | `src/resilience/executor.rs` | P0 | |

### 2.9 Simulation Support

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 39 | Recorder | `src/simulation/recorder.rs` | P1 | |
| 40 | Replayer | `src/simulation/replayer.rs` | P1 | |
| 41 | Replay Client | `src/simulation/replay_client.rs` | P1 | |

### 2.10 Testing Support

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 42 | Mock Client | `src/testing/mock_client.rs` | P0 | |
| 43 | Mock Services | `src/testing/mock_services.rs` | P0 | |
| 44 | Test Fixtures | `src/testing/fixtures.rs` | P0 | |

### 2.11 TypeScript Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 45 | SF Client | `typescript/src/client/client.ts` | P0 | |
| 46 | Client Builder | `typescript/src/client/builder.ts` | P0 | |
| 47 | SObject Service | `typescript/src/sobjects/service.ts` | P0 | |
| 48 | Query Service | `typescript/src/query/service.ts` | P0 | |
| 49 | Bulk Service | `typescript/src/bulk/service.ts` | P0 | |
| 50 | Event Service | `typescript/src/events/service.ts` | P0 | |
| 51 | Auth Provider | `typescript/src/auth/provider.ts` | P0 | |
| 52 | Error Types | `typescript/src/errors/sf-error.ts` | P0 | |
| 53 | Type Definitions | `typescript/src/types/index.ts` | P0 | |

---

## 3. File Manifest

### 3.1 Rust Crate Structure

```
integrations/salesforce_api/
├── Cargo.toml
├── README.md
├── src/
│   ├── lib.rs                          # Public API exports
│   ├── error.rs                        # SfError enum
│   ├── config.rs                       # SalesforceConfig
│   │
│   ├── client/
│   │   ├── mod.rs                      # Client module exports
│   │   ├── client.rs                   # SalesforceClientImpl
│   │   └── builder.rs                  # SalesforceClientBuilder
│   │
│   ├── auth/
│   │   ├── mod.rs                      # Auth module exports
│   │   ├── provider.rs                 # AuthProvider trait
│   │   ├── jwt_bearer.rs               # JWT Bearer flow
│   │   ├── refresh_token.rs            # Refresh token flow
│   │   └── token_manager.rs            # Token caching/refresh
│   │
│   ├── sobjects/
│   │   ├── mod.rs                      # SObjects module exports
│   │   ├── service.rs                  # SObjectServiceImpl
│   │   ├── create.rs                   # Create record
│   │   ├── read.rs                     # Get record(s)
│   │   ├── update.rs                   # Update record
│   │   ├── upsert.rs                   # Upsert by external ID
│   │   ├── delete.rs                   # Delete record
│   │   ├── describe.rs                 # Describe SObject
│   │   └── composite.rs                # Composite requests
│   │
│   ├── query/
│   │   ├── mod.rs                      # Query module exports
│   │   ├── service.rs                  # QueryServiceImpl
│   │   ├── execute.rs                  # query(), query_more()
│   │   ├── stream.rs                   # query_all() streaming
│   │   └── explain.rs                  # Query explain plans
│   │
│   ├── bulk/
│   │   ├── mod.rs                      # Bulk module exports
│   │   ├── service.rs                  # BulkServiceImpl
│   │   ├── job.rs                      # Job lifecycle
│   │   ├── upload.rs                   # CSV upload
│   │   ├── poll.rs                     # Status polling
│   │   ├── results.rs                  # Results retrieval
│   │   └── orchestrator.rs             # High-level bulk operations
│   │
│   ├── events/
│   │   ├── mod.rs                      # Events module exports
│   │   ├── service.rs                  # EventServiceImpl
│   │   ├── publish.rs                  # Platform Event publishing
│   │   ├── pubsub/
│   │   │   ├── mod.rs
│   │   │   ├── client.rs               # gRPC client wrapper
│   │   │   ├── subscribe.rs            # Subscription handling
│   │   │   └── avro.rs                 # Avro decoding
│   │   └── cdc.rs                      # Change Data Capture
│   │
│   ├── limits/
│   │   ├── mod.rs                      # Limits module exports
│   │   ├── service.rs                  # LimitsServiceImpl
│   │   └── tracker.rs                  # Rate limit tracking
│   │
│   ├── transport/
│   │   ├── mod.rs                      # Transport module exports
│   │   ├── http.rs                     # HttpClient trait
│   │   ├── reqwest_client.rs           # Reqwest implementation
│   │   └── grpc.rs                     # gRPC client setup
│   │
│   ├── resilience/
│   │   ├── mod.rs                      # Resilience module exports
│   │   └── executor.rs                 # Retry + circuit breaker
│   │
│   ├── error/
│   │   ├── mod.rs                      # Error module exports
│   │   ├── error.rs                    # SfError enum
│   │   └── mapping.rs                  # Salesforce code -> error
│   │
│   ├── simulation/
│   │   ├── mod.rs                      # Simulation module exports
│   │   ├── recorder.rs                 # SimulationRecorder
│   │   ├── replayer.rs                 # SimulationReplayer
│   │   └── replay_client.rs            # ReplayHttpClient
│   │
│   ├── types/
│   │   ├── mod.rs                      # Types module exports
│   │   ├── requests.rs                 # Request structs
│   │   ├── responses.rs                # Response structs
│   │   └── common.rs                   # Shared types
│   │
│   └── testing/
│       ├── mod.rs                      # Testing module exports
│       ├── mock_client.rs              # MockSalesforceClient
│       ├── mock_services.rs            # Mock service impls
│       └── fixtures.rs                 # Test data fixtures
│
├── tests/
│   ├── unit/
│   │   ├── jwt_bearer_test.rs
│   │   ├── token_manager_test.rs
│   │   ├── sobject_crud_test.rs
│   │   ├── query_test.rs
│   │   ├── query_pagination_test.rs
│   │   ├── bulk_job_test.rs
│   │   ├── event_publish_test.rs
│   │   ├── error_mapping_test.rs
│   │   ├── rate_limit_test.rs
│   │   └── config_validation_test.rs
│   │
│   └── integration/
│       ├── auth_flow_test.rs
│       ├── sobject_lifecycle_test.rs
│       ├── bulk_operation_test.rs
│       ├── event_subscription_test.rs
│       ├── resilience_test.rs
│       └── simulation_test.rs
│
├── benches/
│   ├── query_execution.rs
│   ├── bulk_upload.rs
│   └── token_refresh.rs
│
└── examples/
    ├── basic_crud.rs
    ├── bulk_import.rs
    ├── query_records.rs
    ├── event_subscription.rs
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
│   │   ├── client.ts                   # SalesforceClient class
│   │   ├── builder.ts                  # SalesforceClientBuilder
│   │   └── config.ts                   # SalesforceConfig interface
│   │
│   ├── auth/
│   │   ├── index.ts
│   │   ├── provider.ts                 # AuthProvider interface
│   │   ├── jwt-bearer.ts               # JWT Bearer flow
│   │   ├── refresh-token.ts            # Refresh token flow
│   │   └── token-manager.ts            # Token caching
│   │
│   ├── sobjects/
│   │   ├── index.ts
│   │   ├── service.ts                  # SObjectService
│   │   ├── crud.ts                     # CRUD operations
│   │   ├── describe.ts                 # Describe API
│   │   └── composite.ts                # Composite requests
│   │
│   ├── query/
│   │   ├── index.ts
│   │   ├── service.ts                  # QueryService
│   │   ├── execute.ts                  # Query execution
│   │   └── stream.ts                   # Async iteration
│   │
│   ├── bulk/
│   │   ├── index.ts
│   │   ├── service.ts                  # BulkService
│   │   ├── job.ts                      # Job operations
│   │   └── orchestrator.ts             # High-level API
│   │
│   ├── events/
│   │   ├── index.ts
│   │   ├── service.ts                  # EventService
│   │   ├── publish.ts                  # Event publishing
│   │   ├── pubsub/
│   │   │   ├── index.ts
│   │   │   ├── client.ts               # gRPC client
│   │   │   └── subscribe.ts            # Subscription
│   │   └── cdc.ts                      # CDC subscription
│   │
│   ├── limits/
│   │   ├── index.ts
│   │   ├── service.ts                  # LimitsService
│   │   └── tracker.ts                  # Rate tracking
│   │
│   ├── transport/
│   │   ├── index.ts
│   │   ├── http-client.ts              # HTTP client interface
│   │   ├── fetch-client.ts             # Fetch implementation
│   │   └── grpc-client.ts              # gRPC client
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   ├── sf-error.ts                 # Error class hierarchy
│   │   └── mapping.ts                  # Error code mapping
│   │
│   ├── simulation/
│   │   ├── index.ts
│   │   ├── recorder.ts                 # Recording
│   │   ├── replayer.ts                 # Replay
│   │   └── replay-client.ts            # Replay HTTP client
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
│   ├── auth.test.ts
│   ├── sobjects.test.ts
│   ├── query.test.ts
│   ├── bulk.test.ts
│   ├── events.test.ts
│   ├── error-mapping.test.ts
│   └── simulation.test.ts
│
└── examples/
    ├── basic-crud.ts
    ├── bulk-import.ts
    ├── query-records.ts
    └── event-subscription.ts
```

### 3.3 File Count Summary

| Category | Files | Lines (Est.) |
|----------|-------|--------------|
| Rust Source | 48 | ~7,500 |
| Rust Tests | 16 | ~3,000 |
| Rust Benches | 3 | ~300 |
| Rust Examples | 5 | ~500 |
| TypeScript Source | 38 | ~4,500 |
| TypeScript Tests | 7 | ~1,200 |
| Config/Docs | 4 | ~300 |
| **Total** | **121** | **~17,300** |

---

## 4. Dependency Specification

### 4.1 Cargo.toml

```toml
[package]
name = "salesforce-api"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"
description = "Salesforce API integration for LLM Dev Ops platform"
license = "MIT"

[features]
default = ["reqwest-transport"]
reqwest-transport = ["reqwest"]
grpc-transport = ["tonic"]
simulation = []
full = ["reqwest-transport", "grpc-transport", "simulation"]

[dependencies]
# Async runtime
tokio = { version = "1.35", features = ["sync", "time", "io-util"] }
futures = "0.3"
async-trait = "0.1"
async-stream = "0.3"
pin-project = "1.1"

# HTTP client
reqwest = { version = "0.11", features = ["json", "stream", "rustls-tls"], optional = true }

# gRPC client
tonic = { version = "0.11", optional = true }
prost = "0.12"

# JWT
jsonwebtoken = "9.2"

# Avro decoding
apache-avro = "0.16"

# Cryptography
ring = "0.17"
sha2 = "0.10"

# URL handling
url = "2.5"
urlencoding = "2.1"

# Time
chrono = { version = "0.4", features = ["serde"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# CSV for Bulk API
csv = "1.3"
csv-async = "1.2"

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
regex = "1.10"
rand = "0.8"

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
wiremock = "0.5"
test-case = "3.3"

[[bench]]
name = "query_execution"
harness = false

[[bench]]
name = "bulk_upload"
harness = false

[[example]]
name = "basic_crud"

[[example]]
name = "bulk_import"
```

### 4.2 TypeScript package.json

```json
{
  "name": "@llm-devops/salesforce-api",
  "version": "0.1.0",
  "description": "Salesforce API integration for LLM Dev Ops platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testPathPattern=integration",
    "lint": "eslint src tests",
    "format": "prettier --write src tests",
    "proto:generate": "grpc_tools_node_protoc --plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts --ts_out=src/events/pubsub/proto pubsub.proto"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.9.14",
    "@grpc/proto-loader": "^0.7.10",
    "jsonwebtoken": "^9.0.2",
    "avro-js": "^1.11.3"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/jsonwebtoken": "^9.0.5",
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
    "salesforce",
    "crm",
    "soql",
    "bulk-api",
    "platform-events",
    "llm-devops"
  ]
}
```

---

## 5. Test Coverage Requirements

### 5.1 Unit Test Coverage

| Module | Target | Critical Paths |
|--------|--------|----------------|
| `auth/` | 95% | JWT signing, token refresh, expiry handling |
| `sobjects/` | 90% | CRUD operations, error mapping |
| `query/` | 90% | SOQL execution, pagination, streaming |
| `bulk/` | 85% | Job lifecycle, CSV handling, polling |
| `events/` | 85% | Pub/Sub subscription, Avro decoding |
| `limits/` | 90% | Rate tracking, threshold warnings |
| `error/` | 100% | All error code mappings |
| `simulation/` | 80% | Record/replay roundtrip |

### 5.2 Integration Test Scenarios

```rust
// Integration test: Full authentication flow
#[tokio::test]
async fn test_jwt_bearer_authentication() {
    let client = SalesforceClientBuilder::from_env()
        .build()
        .unwrap();

    // Should successfully authenticate and cache token
    let token = client.auth_provider().get_valid_token().await;
    assert!(token.is_ok());

    // Subsequent calls should use cached token
    let token2 = client.auth_provider().get_valid_token().await;
    assert!(token2.is_ok());
}

// Integration test: SObject CRUD lifecycle
#[tokio::test]
async fn test_sobject_crud_lifecycle() {
    let client = create_test_client().await;

    // Create
    let account = json!({
        "Name": "Test Account",
        "Industry": "Technology"
    });
    let create_result = client.sobjects().create("Account", account).await;
    assert!(create_result.is_ok());
    let id = create_result.unwrap().id;

    // Read
    let get_result = client.sobjects().get("Account", &id, None).await;
    assert!(get_result.is_ok());

    // Update
    let update = json!({ "Industry": "Healthcare" });
    let update_result = client.sobjects().update("Account", &id, update).await;
    assert!(update_result.is_ok());

    // Delete
    let delete_result = client.sobjects().delete("Account", &id).await;
    assert!(delete_result.is_ok());
}

// Integration test: Bulk operation with CSV
#[tokio::test]
async fn test_bulk_insert_operation() {
    let client = create_test_client().await;

    let csv_data = "Name,Industry\nBulk Account 1,Technology\nBulk Account 2,Healthcare";

    let result = client.bulk().execute(
        "Account",
        BulkOperation::Insert,
        csv_data.as_bytes(),
        BulkOptions::default(),
    ).await;

    assert!(result.is_ok());
    let bulk_result = result.unwrap();
    assert!(bulk_result.records_failed == 0);
}

// Integration test: Event subscription with replay
#[tokio::test]
async fn test_event_subscription() {
    let client = create_test_client().await;

    // Publish event
    let event = json!({ "Message__c": "Test message" });
    let publish_result = client.events().publish("TestEvent__e", event).await;
    assert!(publish_result.is_ok());

    // Subscribe and receive
    let mut subscription = client.events()
        .subscribe("TestEvent__e", ReplayPreset::Earliest, 1);

    let received = tokio::time::timeout(
        Duration::from_secs(30),
        subscription.next()
    ).await;

    assert!(received.is_ok());
}
```

### 5.3 Simulation Test Coverage

```rust
// Simulation roundtrip test
#[tokio::test]
async fn test_simulation_record_replay() {
    // Phase 1: Record interactions
    let recorder = Arc::new(SimulationRecorder::new());
    let client = SalesforceClientBuilder::from_env()
        .with_recorder(Arc::clone(&recorder))
        .build()
        .unwrap();

    // Perform operations
    client.query().query("SELECT Id FROM Account LIMIT 5").await.unwrap();

    // Save recordings
    let recordings = recorder.export();
    assert!(!recordings.is_empty());

    // Phase 2: Replay
    let replayer = SimulationReplayer::from_recordings(recordings);
    let replay_client = SalesforceClientBuilder::new()
        .instance_url("https://test.salesforce.com")
        .with_replayer(replayer)
        .build()
        .unwrap();

    // Same query should return recorded response
    let result = replay_client.query().query("SELECT Id FROM Account LIMIT 5").await;
    assert!(result.is_ok());
}
```

---

## 6. CI/CD Configuration

### 6.1 GitHub Actions Workflow

```yaml
name: Salesforce API Integration CI

on:
  push:
    branches: [main]
    paths:
      - 'integrations/salesforce_api/**'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/salesforce_api/**'

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - name: Rust fmt
        run: cargo fmt --all -- --check
        working-directory: integrations/salesforce_api
      - name: Clippy
        run: cargo clippy --all-features -- -D warnings
        working-directory: integrations/salesforce_api

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - name: Run tests
        run: cargo test --all-features
        working-directory: integrations/salesforce_api
      - name: Generate coverage
        run: |
          cargo install cargo-tarpaulin
          cargo tarpaulin --out Xml --all-features
        working-directory: integrations/salesforce_api
      - uses: codecov/codecov-action@v3
        with:
          files: integrations/salesforce_api/cobertura.xml

  integration-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - name: Run integration tests
        env:
          SF_INSTANCE_URL: ${{ secrets.SF_SANDBOX_URL }}
          SF_CLIENT_ID: ${{ secrets.SF_CLIENT_ID }}
          SF_PRIVATE_KEY: ${{ secrets.SF_PRIVATE_KEY }}
          SF_USERNAME: ${{ secrets.SF_USERNAME }}
        run: cargo test --features integration -- --test-threads=1
        working-directory: integrations/salesforce_api

  benchmark:
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    needs: [test]
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - name: Run benchmarks
        run: cargo bench --all-features
        working-directory: integrations/salesforce_api
      - uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: integrations/salesforce_api/target/criterion

  typescript-ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
        working-directory: integrations/salesforce_api/typescript
      - name: Lint
        run: npm run lint
        working-directory: integrations/salesforce_api/typescript
      - name: Build
        run: npm run build
        working-directory: integrations/salesforce_api/typescript
      - name: Test
        run: npm test -- --coverage
        working-directory: integrations/salesforce_api/typescript
```

---

## 7. Deployment Guide

### 7.1 Configuration Requirements

```yaml
# Required environment variables
SF_INSTANCE_URL: "https://your-org.my.salesforce.com"
SF_CLIENT_ID: "your-connected-app-client-id"

# For JWT Bearer flow
SF_USERNAME: "integration@your-org.com"
SF_PRIVATE_KEY: |
  -----BEGIN RSA PRIVATE KEY-----
  ...
  -----END RSA PRIVATE KEY-----

# OR for Refresh Token flow
SF_REFRESH_TOKEN: "your-refresh-token"

# Optional
SF_API_VERSION: "59.0"
SF_TIMEOUT_SECONDS: "30"
SF_TRACK_LIMITS: "true"
```

### 7.2 Salesforce Connected App Setup

1. **Create Connected App**:
   - Setup -> App Manager -> New Connected App
   - Enable OAuth Settings
   - Callback URL: `https://login.salesforce.com/services/oauth2/callback`
   - Selected OAuth Scopes:
     - `api` (Access and manage your data)
     - `refresh_token, offline_access`
     - `cdp_query_api` (if using CDC)

2. **Configure JWT Bearer**:
   - Upload X.509 certificate to Connected App
   - Pre-authorize users via Permission Set

3. **API User Setup**:
   - Create integration user
   - Assign minimum required permissions
   - Pre-authorize in Connected App policies

### 7.3 Health Check Endpoint

```rust
pub async fn health_check(client: &SalesforceClient) -> HealthStatus {
    let mut status = HealthStatus::healthy();

    // Check authentication
    match client.auth_provider().get_valid_token().await {
        Ok(_) => status.add_check("auth", true, None),
        Err(e) => status.add_check("auth", false, Some(e.to_string())),
    }

    // Check API connectivity
    match client.limits().get_limits().await {
        Ok(limits) => {
            status.add_check("api", true, None);

            // Check rate limits
            if let Some(daily) = limits.get("DailyApiRequests") {
                let pct_used = (daily.max - daily.remaining) as f64 / daily.max as f64;
                if pct_used > 0.9 {
                    status.add_warning(format!("API limit {}% used", pct_used * 100.0));
                }
            }
        }
        Err(e) => status.add_check("api", false, Some(e.to_string())),
    }

    status
}
```

---

## 8. Operational Runbooks

### 8.1 Token Refresh Failure

**Symptoms**: `AuthError::RefreshFailed` or `AuthError::TokenExpired` errors

**Investigation**:
```bash
# Check token manager status
curl -s $METRICS_ENDPOINT/metrics | grep sf_token

# Verify Connected App
# In Salesforce: Setup -> Connected Apps -> Your App -> Check status
```

**Resolution**:
1. Verify credentials in configuration
2. Check Connected App is not revoked
3. Ensure user has permission to use Connected App
4. For JWT: verify certificate hasn't expired

### 8.2 Rate Limit Exhaustion

**Symptoms**: `LimitError::DailyLimitExceeded` errors, metrics showing high `sf_rate_limit_percent_used`

**Investigation**:
```bash
# Check current limits
curl -s $METRICS_ENDPOINT/metrics | grep sf_rate_limit

# Check request patterns
curl -s $METRICS_ENDPOINT/metrics | grep sf_requests_total
```

**Resolution**:
1. Enable request throttling in configuration
2. Review and optimize SOQL queries (use Bulk API for large operations)
3. Consider upgrading Salesforce edition for higher limits
4. Implement caching for frequently accessed data

### 8.3 Bulk Job Failures

**Symptoms**: Bulk jobs failing or timing out

**Investigation**:
```bash
# Check bulk job metrics
curl -s $METRICS_ENDPOINT/metrics | grep sf_bulk

# Get failed records
sf bulk job results --job-id <job_id> --type failed
```

**Resolution**:
1. Check failed records for validation errors
2. Verify data format matches SObject field types
3. Check for duplicate external IDs
4. Split large jobs into smaller batches

### 8.4 Event Subscription Disconnection

**Symptoms**: Event subscription stream stops receiving events

**Investigation**:
```bash
# Check subscription metrics
curl -s $METRICS_ENDPOINT/metrics | grep sf_events

# Check for reconnection attempts
grep "reconnect" /var/log/salesforce-api.log
```

**Resolution**:
1. Verify Pub/Sub API endpoint is reachable
2. Check for network/firewall issues on gRPC port 7443
3. Verify replay ID is still valid (events expire after 72 hours)
4. Check user has permission to subscribe to topic

---

## 9. Metrics Dashboard

### 9.1 Grafana Dashboard Template

```json
{
  "title": "Salesforce API Integration",
  "panels": [
    {
      "title": "API Requests Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(sf_requests_total[5m])",
          "legendFormat": "{{operation}} - {{status}}"
        }
      ]
    },
    {
      "title": "Request Latency (p99)",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.99, rate(sf_request_duration_seconds_bucket[5m]))",
          "legendFormat": "{{operation}}"
        }
      ]
    },
    {
      "title": "Rate Limit Usage",
      "type": "gauge",
      "targets": [
        {
          "expr": "sf_rate_limit_percent_used{limit_type='DailyApiRequests'}"
        }
      ],
      "thresholds": "70,90"
    },
    {
      "title": "Error Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(sf_errors_total[5m])",
          "legendFormat": "{{error_code}}"
        }
      ]
    },
    {
      "title": "Bulk API Records",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(sf_bulk_records_total[5m])",
          "legendFormat": "{{operation}} - {{status}}"
        }
      ]
    },
    {
      "title": "Events Received",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(sf_events_received_total[5m])",
          "legendFormat": "{{topic}}"
        }
      ]
    }
  ]
}
```

### 9.2 Prometheus Alerts

```yaml
groups:
  - name: salesforce-api
    rules:
      - alert: SalesforceHighErrorRate
        expr: |
          sum(rate(sf_errors_total[5m])) /
          sum(rate(sf_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High Salesforce API error rate"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: SalesforceRateLimitWarning
        expr: sf_rate_limit_percent_used{limit_type="DailyApiRequests"} > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Salesforce API rate limit approaching"
          description: "Daily API limit is {{ $value }}% used"

      - alert: SalesforceRateLimitCritical
        expr: sf_rate_limit_percent_used{limit_type="DailyApiRequests"} > 95
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Salesforce API rate limit critical"
          description: "Daily API limit is {{ $value }}% used"

      - alert: SalesforceAuthFailure
        expr: increase(sf_errors_total{error_code=~"TokenExpired|RefreshFailed"}[5m]) > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Salesforce authentication failures"
          description: "{{ $value }} auth failures in last 5 minutes"

      - alert: SalesforceHighLatency
        expr: |
          histogram_quantile(0.99, rate(sf_request_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High Salesforce API latency"
          description: "p99 latency is {{ $value | humanizeDuration }}"

      - alert: SalesforceEventSubscriptionDown
        expr: |
          changes(sf_events_received_total[15m]) == 0
          and sf_event_subscription_active == 1
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "No events received from Salesforce"
          description: "Event subscription may be disconnected"
```

---

## 10. Acceptance Criteria

### 10.1 Functional Requirements

| Requirement | Test | Status |
|-------------|------|--------|
| OAuth JWT Bearer authentication | `test_jwt_bearer_authentication` | |
| OAuth Refresh Token flow | `test_refresh_token_flow` | |
| SObject CRUD operations | `test_sobject_crud_lifecycle` | |
| SOQL query execution | `test_query_execution` | |
| Query pagination | `test_query_pagination` | |
| Bulk API 2.0 insert | `test_bulk_insert` | |
| Bulk API 2.0 update | `test_bulk_update` | |
| Platform Event publishing | `test_event_publish` | |
| Pub/Sub API subscription | `test_event_subscription` | |
| CDC subscription | `test_cdc_subscription` | |
| Rate limit tracking | `test_rate_limit_tracking` | |
| Simulation record/replay | `test_simulation_roundtrip` | |

### 10.2 Non-Functional Requirements

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Single record operation latency | p99 < 1s | `sf_request_duration_seconds` |
| Query (2000 records) latency | p99 < 3s | `sf_request_duration_seconds` |
| Bulk job creation | p99 < 2s | `sf_request_duration_seconds` |
| Token refresh | p99 < 2s | `sf_token_refresh_duration_seconds` |
| Event delivery latency | p99 < 500ms | `sf_event_latency_seconds` |
| Error rate | < 0.1% | `sf_errors_total / sf_requests_total` |
| Test coverage | > 85% | Tarpaulin coverage report |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-15 | SPARC Generator | Initial Completion |

---

**SPARC Documentation Complete**

The Salesforce API Integration is now fully documented across all five SPARC phases:
1. **Specification** - Interfaces, contracts, error taxonomy
2. **Pseudocode** - Algorithmic descriptions
3. **Architecture** - System design, data flows, component structure
4. **Refinement** - Production hardening, security, edge cases
5. **Completion** - Implementation roadmap, CI/CD, operational procedures
