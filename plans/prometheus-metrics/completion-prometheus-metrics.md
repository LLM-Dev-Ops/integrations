# Prometheus Metrics Endpoint Integration - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/prometheus_metrics`

---

## 1. Overview

This completion document provides the implementation roadmap, file manifests, test coverage requirements, CI/CD configuration, and operational runbooks for the Prometheus Metrics Endpoint Integration.

---

## 2. Implementation Checklist

### 2.1 Core Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 1 | Error types | `src/error.rs` | P0 | ⬜ |
| 2 | Configuration | `src/config.rs` | P0 | ⬜ |
| 3 | Metrics registry | `src/registry/registry.rs` | P0 | ⬜ |
| 4 | Metric family | `src/registry/family.rs` | P0 | ⬜ |
| 5 | Cardinality tracking | `src/registry/cardinality.rs` | P0 | ⬜ |
| 6 | Counter metric | `src/metrics/counter.rs` | P0 | ⬜ |
| 7 | Gauge metric | `src/metrics/gauge.rs` | P0 | ⬜ |
| 8 | Histogram metric | `src/metrics/histogram.rs` | P0 | ⬜ |
| 9 | Metric traits | `src/metrics/traits.rs` | P0 | ⬜ |

### 2.2 Label Management

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 10 | Label set | `src/labels/label_set.rs` | P0 | ⬜ |
| 11 | Label validation | `src/labels/validation.rs` | P0 | ⬜ |
| 12 | Label sanitization | `src/labels/sanitization.rs` | P0 | ⬜ |

### 2.3 Serialization

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 13 | Prometheus text format | `src/serialization/prometheus_text.rs` | P0 | ⬜ |
| 14 | OpenMetrics format | `src/serialization/openmetrics.rs` | P1 | ⬜ |
| 15 | Streaming serializer | `src/serialization/streaming.rs` | P1 | ⬜ |

### 2.4 HTTP Endpoint

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 16 | Metrics handler | `src/http/handler.rs` | P0 | ⬜ |
| 17 | Health endpoint | `src/http/health.rs` | P0 | ⬜ |
| 18 | Compression | `src/http/compression.rs` | P0 | ⬜ |
| 19 | Response caching | `src/http/cache.rs` | P1 | ⬜ |

### 2.5 Collectors

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 20 | LLM metrics collector | `src/collectors/llm.rs` | P0 | ⬜ |
| 21 | Agent metrics collector | `src/collectors/agent.rs` | P0 | ⬜ |
| 22 | Process collector | `src/collectors/process.rs` | P1 | ⬜ |
| 23 | Runtime collector | `src/collectors/runtime.rs` | P1 | ⬜ |

### 2.6 Testing Support

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 24 | Mock registry | `src/testing/mock_registry.rs` | P0 | ⬜ |
| 25 | Test assertions | `src/testing/assertions.rs` | P0 | ⬜ |
| 26 | Mock clock | `src/testing/mock_clock.rs` | P1 | ⬜ |

### 2.7 TypeScript Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 27 | Registry | `typescript/src/registry/registry.ts` | P0 | ⬜ |
| 28 | Counter | `typescript/src/metrics/counter.ts` | P0 | ⬜ |
| 29 | Gauge | `typescript/src/metrics/gauge.ts` | P0 | ⬜ |
| 30 | Histogram | `typescript/src/metrics/histogram.ts` | P0 | ⬜ |
| 31 | Serializer | `typescript/src/serialization/prometheus-text.ts` | P0 | ⬜ |
| 32 | HTTP handler | `typescript/src/http/handler.ts` | P0 | ⬜ |
| 33 | LLM collector | `typescript/src/collectors/llm-collector.ts` | P0 | ⬜ |
| 34 | Agent collector | `typescript/src/collectors/agent-collector.ts` | P0 | ⬜ |
| 35 | Type definitions | `typescript/src/types.ts` | P0 | ⬜ |

---

## 3. File Manifest

### 3.1 Rust Crate Structure

```
integrations/prometheus_metrics/
├── Cargo.toml
├── README.md
├── src/
│   ├── lib.rs                          # Public API exports
│   ├── error.rs                        # MetricsError enum
│   ├── config.rs                       # MetricsConfig
│   │
│   ├── registry/
│   │   ├── mod.rs                      # Registry module exports
│   │   ├── registry.rs                 # MetricsRegistry implementation
│   │   ├── family.rs                   # MetricFamily container
│   │   └── cardinality.rs              # CardinalityGuard
│   │
│   ├── metrics/
│   │   ├── mod.rs                      # Metrics module exports
│   │   ├── traits.rs                   # Metric, Collector traits
│   │   ├── counter.rs                  # Counter, CounterVec
│   │   ├── gauge.rs                    # Gauge, GaugeVec
│   │   └── histogram.rs                # Histogram, HistogramVec
│   │
│   ├── labels/
│   │   ├── mod.rs                      # Labels module exports
│   │   ├── label_set.rs                # LabelSet storage
│   │   ├── validation.rs               # Name/value validation
│   │   └── sanitization.rs             # Label sanitization
│   │
│   ├── serialization/
│   │   ├── mod.rs                      # Serialization exports
│   │   ├── prometheus_text.rs          # Text format v0.0.4
│   │   ├── openmetrics.rs              # OpenMetrics format
│   │   └── streaming.rs                # Streaming serializer
│   │
│   ├── http/
│   │   ├── mod.rs                      # HTTP module exports
│   │   ├── handler.rs                  # /metrics endpoint handler
│   │   ├── health.rs                   # /health, /ready handlers
│   │   ├── compression.rs              # Gzip compression
│   │   └── cache.rs                    # Response caching
│   │
│   ├── collectors/
│   │   ├── mod.rs                      # Collectors module exports
│   │   ├── llm.rs                      # LLM metrics collector
│   │   ├── agent.rs                    # Agent metrics collector
│   │   ├── process.rs                  # Process metrics (RSS, FDs)
│   │   └── runtime.rs                  # Runtime metrics
│   │
│   └── testing/
│       ├── mod.rs                      # Testing module exports
│       ├── mock_registry.rs            # MockRegistry for tests
│       ├── assertions.rs               # Test helper functions
│       └── mock_clock.rs               # MockClock for time tests
│
├── tests/
│   ├── unit/
│   │   ├── registry_test.rs
│   │   ├── counter_test.rs
│   │   ├── gauge_test.rs
│   │   ├── histogram_test.rs
│   │   ├── label_validation_test.rs
│   │   ├── label_sanitization_test.rs
│   │   ├── serialization_test.rs
│   │   ├── cardinality_test.rs
│   │   ├── cache_test.rs
│   │   └── compression_test.rs
│   │
│   └── integration/
│       ├── http_endpoint_test.rs
│       ├── scrape_simulation_test.rs
│       ├── llm_collector_test.rs
│       ├── agent_collector_test.rs
│       ├── concurrent_access_test.rs
│       └── format_compatibility_test.rs
│
├── benches/
│   ├── counter_increment.rs
│   ├── histogram_observe.rs
│   ├── serialization.rs
│   ├── label_hashing.rs
│   └── compression.rs
│
└── examples/
    ├── basic_metrics.rs
    ├── llm_monitoring.rs
    ├── agent_monitoring.rs
    ├── custom_collector.rs
    └── http_server.rs
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
│   ├── registry/
│   │   ├── index.ts
│   │   ├── registry.ts                 # MetricsRegistry class
│   │   ├── family.ts                   # MetricFamily class
│   │   └── cardinality.ts              # Cardinality tracking
│   │
│   ├── metrics/
│   │   ├── index.ts
│   │   ├── counter.ts                  # Counter, CounterVec
│   │   ├── gauge.ts                    # Gauge, GaugeVec
│   │   ├── histogram.ts                # Histogram, HistogramVec
│   │   └── types.ts                    # Metric interfaces
│   │
│   ├── labels/
│   │   ├── index.ts
│   │   ├── label-set.ts                # Label storage
│   │   ├── validation.ts               # Validation functions
│   │   └── sanitization.ts             # Sanitization functions
│   │
│   ├── serialization/
│   │   ├── index.ts
│   │   ├── prometheus-text.ts          # Text format serializer
│   │   └── openmetrics.ts              # OpenMetrics serializer
│   │
│   ├── http/
│   │   ├── index.ts
│   │   ├── handler.ts                  # Express/Fastify handler
│   │   └── middleware.ts               # Middleware factory
│   │
│   ├── collectors/
│   │   ├── index.ts
│   │   ├── llm-collector.ts            # LLM metrics
│   │   ├── agent-collector.ts          # Agent metrics
│   │   └── default-collectors.ts       # Process/runtime
│   │
│   ├── testing/
│   │   ├── index.ts
│   │   ├── mock-registry.ts            # Mock for testing
│   │   └── matchers.ts                 # Jest custom matchers
│   │
│   └── types.ts                        # Type definitions
│
├── tests/
│   ├── registry.test.ts
│   ├── counter.test.ts
│   ├── gauge.test.ts
│   ├── histogram.test.ts
│   ├── labels.test.ts
│   ├── serialization.test.ts
│   ├── handler.test.ts
│   ├── llm-collector.test.ts
│   └── agent-collector.test.ts
│
└── examples/
    ├── basic-usage.ts
    ├── express-integration.ts
    └── fastify-integration.ts
```

### 3.3 File Count Summary

| Category | Files | Lines (Est.) |
|----------|-------|--------------|
| Rust Source | 28 | ~4,500 |
| Rust Tests | 16 | ~2,500 |
| Rust Benches | 5 | ~400 |
| Rust Examples | 5 | ~500 |
| TypeScript Source | 20 | ~2,000 |
| TypeScript Tests | 9 | ~1,200 |
| Config/Docs | 4 | ~200 |
| **Total** | **87** | **~11,300** |

---

## 4. Dependency Specification

### 4.1 Cargo.toml

```toml
[package]
name = "prometheus-metrics"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"
description = "Prometheus metrics endpoint integration for LLM Dev Ops platform"
license = "MIT"

[features]
default = ["http", "gzip"]
http = ["axum", "hyper", "tower"]
gzip = ["flate2"]
openmetrics = []
full = ["http", "gzip", "openmetrics"]

[dependencies]
# HTTP server
axum = { version = "0.7", optional = true }
hyper = { version = "1.1", optional = true }
tower = { version = "0.4", optional = true }

# Compression
flate2 = { version = "1.0", optional = true }

# Async runtime
tokio = { version = "1.35", features = ["sync", "time"] }

# Concurrency
parking_lot = "0.12"
dashmap = "5.5"
crossbeam-utils = "0.8"
smallvec = "1.13"

# Hashing
fxhash = "0.2"

# Utilities
thiserror = "1.0"
tracing = "0.1"
once_cell = "1.19"

# Shared modules
shared-auth = { path = "../../shared/auth" }
shared-config = { path = "../../shared/config" }
shared-tracing = { path = "../../shared/tracing" }

[dev-dependencies]
tokio = { version = "1.35", features = ["full", "test-util"] }
criterion = { version = "0.5", features = ["async_tokio"] }
proptest = "1.4"
insta = "1.34"
reqwest = { version = "0.11", features = ["json"] }
test-case = "3.3"
mockall = "0.12"
tempfile = "3.9"

[[bench]]
name = "counter_increment"
harness = false

[[bench]]
name = "serialization"
harness = false

[[bench]]
name = "compression"
harness = false
```

### 4.2 TypeScript package.json

```json
{
  "name": "@llm-devops/prometheus-metrics",
  "version": "0.1.0",
  "description": "Prometheus metrics endpoint integration for LLM Dev Ops platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests",
    "format": "prettier --write src tests"
  },
  "dependencies": {
    "prom-client": "^15.1.0"
  },
  "peerDependencies": {
    "express": "^4.18.0",
    "fastify": "^4.25.0"
  },
  "peerDependenciesMeta": {
    "express": { "optional": true },
    "fastify": { "optional": true }
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "express": "^4.18.2",
    "fastify": "^4.25.2",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "prettier": "^3.2.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## 5. Test Coverage Requirements

### 5.1 Unit Test Coverage

| Component | Min Coverage | Critical Paths |
|-----------|--------------|----------------|
| `registry.rs` | 90% | Registration, collection |
| `counter.rs` | 95% | Increment, add, labels |
| `gauge.rs` | 95% | Set, inc, dec, labels |
| `histogram.rs` | 90% | Observe, buckets, sum/count |
| `label_set.rs` | 90% | Creation, hashing, equality |
| `validation.rs` | 95% | Name/value validation |
| `sanitization.rs` | 95% | Name/value sanitization |
| `prometheus_text.rs` | 95% | All metric types, escaping |
| `cardinality.rs` | 90% | Limit enforcement, overflow |
| `handler.rs` | 85% | Content negotiation, errors |
| `cache.rs` | 85% | TTL, invalidation |
| **Overall** | **85%** | |

### 5.2 Test Case Matrix

#### Registry Tests
```
registry_test.rs:
├── test_registry_creation_default
├── test_registry_creation_with_config
├── test_counter_registration
├── test_gauge_registration
├── test_histogram_registration
├── test_duplicate_registration_same_type
├── test_duplicate_registration_different_type_error
├── test_metric_collection
├── test_metric_unregistration
├── test_registry_reset
└── test_concurrent_registration
```

#### Counter Tests
```
counter_test.rs:
├── test_counter_increment
├── test_counter_increment_by
├── test_counter_get_value
├── test_counter_negative_increment_error
├── test_counter_vec_with_labels
├── test_counter_vec_different_labels
├── test_counter_vec_cardinality
├── test_counter_serialization
└── test_counter_concurrent_increment
```

#### Gauge Tests
```
gauge_test.rs:
├── test_gauge_set
├── test_gauge_inc
├── test_gauge_dec
├── test_gauge_add
├── test_gauge_sub
├── test_gauge_set_to_current_time
├── test_gauge_vec_with_labels
├── test_gauge_negative_values
├── test_gauge_serialization
└── test_gauge_concurrent_updates
```

#### Histogram Tests
```
histogram_test.rs:
├── test_histogram_observe
├── test_histogram_observe_multiple
├── test_histogram_custom_buckets
├── test_histogram_default_buckets
├── test_histogram_sum_count
├── test_histogram_vec_with_labels
├── test_histogram_bucket_boundaries
├── test_histogram_inf_bucket
├── test_histogram_serialization
└── test_histogram_concurrent_observe
```

#### Label Tests
```
label_validation_test.rs:
├── test_valid_label_name
├── test_invalid_label_name_starts_with_digit
├── test_invalid_label_name_reserved_prefix
├── test_invalid_label_name_special_chars
├── test_label_value_escaping_quotes
├── test_label_value_escaping_backslash
├── test_label_value_escaping_newline
├── test_label_value_unicode
├── test_label_value_empty
└── test_label_value_max_length
```

#### Serialization Tests
```
serialization_test.rs:
├── test_counter_format
├── test_gauge_format
├── test_histogram_format
├── test_help_line
├── test_type_line
├── test_labels_format
├── test_special_values_nan
├── test_special_values_inf
├── test_scientific_notation
├── test_empty_registry
├── test_multiple_families
└── test_openmetrics_format
```

#### Cardinality Tests
```
cardinality_test.rs:
├── test_cardinality_tracking
├── test_cardinality_limit_enforcement
├── test_cardinality_overflow_logging
├── test_cardinality_per_metric_limit
├── test_cardinality_total_limit
└── test_cardinality_overflow_metric
```

#### HTTP Handler Tests
```
http_endpoint_test.rs:
├── test_metrics_endpoint_success
├── test_metrics_endpoint_content_type
├── test_metrics_endpoint_gzip_compression
├── test_metrics_endpoint_no_compression
├── test_metrics_endpoint_cache_hit
├── test_metrics_endpoint_cache_miss
├── test_health_endpoint_healthy
├── test_health_endpoint_unhealthy
├── test_ready_endpoint_ready
├── test_ready_endpoint_not_ready
├── test_rate_limiting
└── test_authentication_required
```

### 5.3 Integration Test Scenarios

```
integration/
├── scrape_simulation_test.rs
│   ├── test_prometheus_scrape_format_valid
│   ├── test_prometheus_scrape_with_labels
│   ├── test_prometheus_scrape_large_registry
│   ├── test_prometheus_scrape_under_load
│   └── test_prometheus_scrape_timeout_handling
│
├── llm_collector_test.rs
│   ├── test_llm_request_metrics
│   ├── test_llm_token_metrics
│   ├── test_llm_latency_histogram
│   ├── test_llm_error_metrics
│   └── test_llm_streaming_metrics
│
├── agent_collector_test.rs
│   ├── test_agent_execution_metrics
│   ├── test_agent_step_metrics
│   ├── test_agent_tool_call_metrics
│   └── test_agent_error_metrics
│
├── concurrent_access_test.rs
│   ├── test_concurrent_increment
│   ├── test_concurrent_registration
│   ├── test_concurrent_scrape
│   └── test_concurrent_collect_and_update
│
└── format_compatibility_test.rs
    ├── test_prometheus_server_parse
    ├── test_grafana_agent_parse
    └── test_victoria_metrics_parse
```

### 5.4 Performance Benchmarks

```rust
// benches/counter_increment.rs
#[bench]
fn bench_counter_inc(b: &mut Bencher) {
    // Target: < 10ns
}

#[bench]
fn bench_counter_inc_with_labels(b: &mut Bencher) {
    // Target: < 50ns
}

// benches/histogram_observe.rs
#[bench]
fn bench_histogram_observe(b: &mut Bencher) {
    // Target: < 30ns
}

#[bench]
fn bench_histogram_observe_with_labels(b: &mut Bencher) {
    // Target: < 100ns
}

// benches/serialization.rs
#[bench]
fn bench_serialize_100_metrics(b: &mut Bencher) {
    // Target: < 1ms
}

#[bench]
fn bench_serialize_10000_metrics(b: &mut Bencher) {
    // Target: < 50ms
}

// benches/compression.rs
#[bench]
fn bench_gzip_compress_1kb(b: &mut Bencher) {
    // Target: < 100μs
}

#[bench]
fn bench_gzip_compress_100kb(b: &mut Bencher) {
    // Target: < 5ms
}
```

---

## 6. CI/CD Pipeline

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/prometheus-metrics.yml
name: Prometheus Metrics Integration CI

on:
  push:
    branches: [main]
    paths:
      - 'integrations/prometheus_metrics/**'
      - '.github/workflows/prometheus-metrics.yml'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/prometheus_metrics/**'

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
          workspaces: integrations/prometheus_metrics

      - name: Check formatting
        run: cargo fmt --check
        working-directory: integrations/prometheus_metrics

      - name: Clippy
        run: cargo clippy --all-features -- -D warnings
        working-directory: integrations/prometheus_metrics

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
          workspaces: integrations/prometheus_metrics

      - name: Run unit tests
        run: cargo test --lib --all-features
        working-directory: integrations/prometheus_metrics

      - name: Run doc tests
        run: cargo test --doc --all-features
        working-directory: integrations/prometheus_metrics

  test-integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      prometheus:
        image: prom/prometheus:v2.48.0
        ports:
          - 9090:9090
        options: >-
          --health-cmd="wget -q -O- http://localhost:9090/-/healthy"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/prometheus_metrics

      - name: Run integration tests
        run: cargo test --test '*' --all-features
        working-directory: integrations/prometheus_metrics

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
        working-directory: integrations/prometheus_metrics

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/prometheus_metrics/coverage/cobertura.xml
          flags: prometheus-metrics
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
        working-directory: integrations/prometheus_metrics

      - name: Compare benchmarks
        uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: 'cargo'
          output-file-path: integrations/prometheus_metrics/bench-results.txt
          alert-threshold: '150%'
          fail-on-alert: true

  test-typescript:
    name: TypeScript Tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: integrations/prometheus_metrics/typescript
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/prometheus_metrics/typescript/package-lock.json

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
        working-directory: integrations/prometheus_metrics

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: prometheus-metrics
          path: integrations/prometheus_metrics/target/release/libprometheus_metrics.*
```

### 6.2 Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: cargo-fmt
        name: cargo fmt
        entry: cargo fmt --manifest-path integrations/prometheus_metrics/Cargo.toml --
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-clippy
        name: cargo clippy
        entry: cargo clippy --manifest-path integrations/prometheus_metrics/Cargo.toml --all-features -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-test
        name: cargo test
        entry: cargo test --manifest-path integrations/prometheus_metrics/Cargo.toml --lib
        language: system
        types: [rust]
        pass_filenames: false
```

---

## 7. Deployment Guide

### 7.1 Environment Configuration

```bash
# Metrics endpoint configuration
export METRICS_ENDPOINT_PATH="/metrics"
export METRICS_ENDPOINT_PORT="9090"

# Cache configuration
export METRICS_CACHE_ENABLED="true"
export METRICS_CACHE_TTL_MS="1000"

# Compression configuration
export METRICS_COMPRESSION_ENABLED="true"
export METRICS_COMPRESSION_MIN_SIZE="1024"

# Cardinality limits
export METRICS_CARDINALITY_MAX_PER_METRIC="1000"
export METRICS_CARDINALITY_MAX_TOTAL="10000"

# Rate limiting
export METRICS_RATE_LIMIT_RPS="10"
export METRICS_RATE_LIMIT_BURST="20"

# Collectors
export METRICS_COLLECTORS_LLM="true"
export METRICS_COLLECTORS_AGENT="true"
export METRICS_COLLECTORS_PROCESS="true"
export METRICS_COLLECTORS_RUNTIME="true"
```

### 7.2 Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"
    prometheus.io/path: "/metrics"
spec:
  template:
    spec:
      containers:
        - name: app
          ports:
            - name: metrics
              containerPort: 9090
              protocol: TCP
          env:
            - name: METRICS_ENDPOINT_PORT
              value: "9090"
            - name: METRICS_CACHE_TTL_MS
              value: "1000"
            - name: METRICS_CARDINALITY_MAX_TOTAL
              value: "10000"
          livenessProbe:
            httpGet:
              path: /health
              port: metrics
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: metrics
            initialDelaySeconds: 5
            periodSeconds: 10
```

### 7.3 ServiceMonitor (Prometheus Operator)

```yaml
# k8s/service-monitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-service-metrics
  labels:
    app: my-service
spec:
  selector:
    matchLabels:
      app: my-service
  endpoints:
    - port: metrics
      path: /metrics
      interval: 15s
      scrapeTimeout: 10s
      scheme: http
  namespaceSelector:
    matchNames:
      - default
```

### 7.4 Prometheus Scrape Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'llm-devops'
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: /metrics
    scheme: http
    static_configs:
      - targets:
          - 'my-service:9090'
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
```

---

## 8. Operational Runbooks

### 8.1 Runbook: High Scrape Latency

**Symptoms:**
- Prometheus scrape duration increasing
- `prometheus_target_scrape_pool_exceeded_target_limit` alerts
- Timeouts in Prometheus logs

**Diagnosis:**
```bash
# Check scrape duration
curl -s localhost:9090/metrics | grep llmdevops_metrics_scrape_duration

# Check metric count
curl -s localhost:9090/metrics | wc -l

# Check cardinality
curl -s localhost:9090/metrics | grep llmdevops_metrics_series_count
```

**Resolution:**
1. **Enable caching** (if not already):
   ```bash
   export METRICS_CACHE_ENABLED=true
   export METRICS_CACHE_TTL_MS=1000
   ```

2. **Enable compression**:
   ```bash
   export METRICS_COMPRESSION_ENABLED=true
   ```

3. **Reduce cardinality**:
   ```bash
   export METRICS_CARDINALITY_MAX_TOTAL=5000
   ```

4. **Increase scrape interval** in Prometheus:
   ```yaml
   scrape_interval: 30s
   ```

### 8.2 Runbook: Cardinality Explosion

**Symptoms:**
- `llmdevops_metrics_cardinality_overflow_total` increasing
- Memory usage growing
- "cardinality limit reached" warnings

**Diagnosis:**
```bash
# Check overflow count
curl -s localhost:9090/metrics | grep cardinality_overflow

# Identify high-cardinality metrics
curl -s localhost:9090/metrics | sort | uniq -c | sort -rn | head -20

# Check label cardinality
curl -s localhost:9090/metrics | grep -o '{[^}]*}' | sort | uniq -c | sort -rn | head -20
```

**Resolution:**
1. **Identify problematic labels**:
   - Look for user IDs, request IDs, or timestamps in labels
   - Remove or aggregate high-cardinality labels

2. **Reduce limits**:
   ```bash
   export METRICS_CARDINALITY_MAX_PER_METRIC=500
   ```

3. **Use recording rules** in Prometheus to pre-aggregate

4. **Review label design** in collectors

### 8.3 Runbook: Metrics Endpoint Down

**Symptoms:**
- Prometheus `up` metric is 0
- `/health` or `/ready` returning errors
- Connection refused errors

**Diagnosis:**
```bash
# Check if port is listening
ss -tlnp | grep 9090

# Test endpoint directly
curl -v http://localhost:9090/metrics

# Check application logs
kubectl logs my-service-xxx | grep -i metrics

# Check health endpoint
curl -v http://localhost:9090/health
```

**Resolution:**
1. **Check service is running**:
   ```bash
   kubectl get pods -l app=my-service
   ```

2. **Check configuration**:
   ```bash
   kubectl describe configmap my-service-config
   ```

3. **Restart service** if necessary:
   ```bash
   kubectl rollout restart deployment/my-service
   ```

4. **Check network policies**:
   ```bash
   kubectl get networkpolicy
   ```

### 8.4 Runbook: Incorrect Metric Values

**Symptoms:**
- Counters showing unexpected values
- Gauges not updating
- Histogram buckets incorrect

**Diagnosis:**
```bash
# Check metric value
curl -s localhost:9090/metrics | grep specific_metric_name

# Compare with application logs
kubectl logs my-service-xxx | grep "metric_name"

# Check for duplicate registrations
curl -s localhost:9090/metrics | grep "# TYPE" | sort | uniq -c | grep -v "^      1"
```

**Resolution:**
1. **Check for duplicate metric registrations**

2. **Verify metric type** (counter vs gauge)

3. **Check label consistency**

4. **Review collector implementation**

### 8.5 Runbook: Memory Growth

**Symptoms:**
- Container memory increasing over time
- OOM kills
- Slow scrape responses

**Diagnosis:**
```bash
# Check memory usage
kubectl top pod my-service-xxx

# Check metric count trend
watch -n 5 'curl -s localhost:9090/metrics | wc -l'

# Check cache size
curl -s localhost:9090/metrics | grep cache
```

**Resolution:**
1. **Reduce cardinality limits**:
   ```bash
   export METRICS_CARDINALITY_MAX_TOTAL=5000
   ```

2. **Reduce cache TTL**:
   ```bash
   export METRICS_CACHE_TTL_MS=500
   ```

3. **Disable unused collectors**:
   ```bash
   export METRICS_COLLECTORS_PROCESS=false
   ```

4. **Increase container memory limits** (if justified)

---

## 9. Acceptance Criteria Verification

### 9.1 Functional Requirements

| # | Requirement | Test | Status |
|---|-------------|------|--------|
| 1 | Create counter metric | `test_counter_registration` | ⬜ |
| 2 | Create gauge metric | `test_gauge_registration` | ⬜ |
| 3 | Create histogram metric | `test_histogram_registration` | ⬜ |
| 4 | Counter increment | `test_counter_increment` | ⬜ |
| 5 | Counter with labels | `test_counter_vec_with_labels` | ⬜ |
| 6 | Gauge set/inc/dec | `test_gauge_set` | ⬜ |
| 7 | Histogram observe | `test_histogram_observe` | ⬜ |
| 8 | Custom histogram buckets | `test_histogram_custom_buckets` | ⬜ |
| 9 | Label validation | `test_valid_label_name` | ⬜ |
| 10 | Label sanitization | `test_invalid_label_name_special_chars` | ⬜ |
| 11 | Prometheus text format | `test_prometheus_scrape_format_valid` | ⬜ |
| 12 | OpenMetrics format | `test_openmetrics_format` | ⬜ |
| 13 | Gzip compression | `test_metrics_endpoint_gzip_compression` | ⬜ |
| 14 | Response caching | `test_metrics_endpoint_cache_hit` | ⬜ |
| 15 | Cardinality limits | `test_cardinality_limit_enforcement` | ⬜ |
| 16 | /health endpoint | `test_health_endpoint_healthy` | ⬜ |
| 17 | /ready endpoint | `test_ready_endpoint_ready` | ⬜ |
| 18 | LLM metrics collection | `test_llm_request_metrics` | ⬜ |
| 19 | Agent metrics collection | `test_agent_execution_metrics` | ⬜ |
| 20 | Concurrent access | `test_concurrent_increment` | ⬜ |

### 9.2 Non-Functional Requirements

| # | Requirement | Benchmark | Target | Status |
|---|-------------|-----------|--------|--------|
| 1 | Counter increment latency | `bench_counter_inc` | < 10ns | ⬜ |
| 2 | Histogram observe latency | `bench_histogram_observe` | < 30ns | ⬜ |
| 3 | Serialization (100 metrics) | `bench_serialize_100_metrics` | < 1ms | ⬜ |
| 4 | Serialization (10k metrics) | `bench_serialize_10000_metrics` | < 50ms | ⬜ |
| 5 | Gzip compression | `bench_gzip_compress_100kb` | < 5ms | ⬜ |
| 6 | No memory leaks | `integration/memory_test` | Stable | ⬜ |
| 7 | Concurrent safety | `test_concurrent_access` | No race | ⬜ |
| 8 | Test coverage | `cargo tarpaulin` | > 85% | ⬜ |

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

### 10.2 QA Sign-Off

| Item | Owner | Date | Signature |
|------|-------|------|-----------|
| Functional testing complete | | | |
| Performance testing complete | | | |
| Prometheus compatibility verified | | | |
| Load testing complete | | | |

### 10.3 Operations Sign-Off

| Item | Owner | Date | Signature |
|------|-------|------|-----------|
| Runbooks validated | | | |
| Monitoring configured | | | |
| Alerting configured | | | |
| Deployment tested in staging | | | |
| Grafana dashboards created | | | |

---

## 11. Grafana Dashboard Template

```json
{
  "title": "LLM DevOps Metrics",
  "panels": [
    {
      "title": "LLM Requests per Second",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(llmdevops_llm_requests_total[5m])",
          "legendFormat": "{{model}} - {{status}}"
        }
      ]
    },
    {
      "title": "LLM Request Latency",
      "type": "heatmap",
      "targets": [
        {
          "expr": "rate(llmdevops_llm_request_duration_seconds_bucket[5m])",
          "legendFormat": "{{le}}"
        }
      ]
    },
    {
      "title": "Token Usage",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(llmdevops_llm_tokens_total[5m])",
          "legendFormat": "{{model}} - {{type}}"
        }
      ]
    },
    {
      "title": "Agent Executions",
      "type": "stat",
      "targets": [
        {
          "expr": "sum(rate(llmdevops_agent_executions_total[5m]))"
        }
      ]
    },
    {
      "title": "Cardinality",
      "type": "gauge",
      "targets": [
        {
          "expr": "llmdevops_metrics_series_count"
        }
      ]
    }
  ]
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-14 | SPARC Generator | Initial Completion |

---

**SPARC Cycle Complete** - The Prometheus Metrics Endpoint Integration specification is ready for implementation.
