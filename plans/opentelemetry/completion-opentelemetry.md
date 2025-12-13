# OpenTelemetry Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/opentelemetry`

---

## 1. Overview

This completion document provides the implementation roadmap, file manifests, test coverage requirements, CI/CD configuration, and operational runbooks for the OpenTelemetry Integration Module.

---

## 2. Implementation Checklist

### 2.1 Core Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 1 | Error types | `src/error.rs` | P0 | ⬜ |
| 2 | Configuration | `src/config.rs` | P0 | ⬜ |
| 3 | Resource builder | `src/resource.rs` | P0 | ⬜ |
| 4 | Telemetry provider | `src/provider.rs` | P0 | ⬜ |
| 5 | Tracer wrapper | `src/tracer/tracer.rs` | P0 | ⬜ |
| 6 | Span builder | `src/tracer/span_builder.rs` | P0 | ⬜ |
| 7 | Context management | `src/tracer/context.rs` | P0 | ⬜ |
| 8 | Meter wrapper | `src/metrics/mod.rs` | P0 | ⬜ |
| 9 | Metric instruments | `src/metrics/instruments.rs` | P0 | ⬜ |
| 10 | Logger bridge | `src/logging/bridge.rs` | P1 | ⬜ |

### 2.2 Context Propagation

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 11 | W3C TraceContext | `src/propagation/w3c.rs` | P0 | ⬜ |
| 12 | W3C Baggage | `src/propagation/baggage.rs` | P0 | ⬜ |
| 13 | Composite propagator | `src/propagation/composite.rs` | P0 | ⬜ |
| 14 | HTTP injector | `src/propagation/http.rs` | P0 | ⬜ |
| 15 | gRPC metadata | `src/propagation/grpc.rs` | P1 | ⬜ |

### 2.3 Export Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 16 | OTLP gRPC exporter | `src/export/otlp_grpc.rs` | P0 | ⬜ |
| 17 | OTLP HTTP exporter | `src/export/otlp_http.rs` | P0 | ⬜ |
| 18 | Stdout exporter | `src/export/stdout.rs` | P1 | ⬜ |
| 19 | Mock exporter | `src/export/mock.rs` | P0 | ⬜ |
| 20 | Batch processor | `src/export/batch.rs` | P0 | ⬜ |
| 21 | Metric exporter | `src/export/metric_exporter.rs` | P0 | ⬜ |

### 2.4 LLM-Specific Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 22 | LLM span builder | `src/llm/span_builder.rs` | P0 | ⬜ |
| 23 | LLM semantic conventions | `src/llm/conventions.rs` | P0 | ⬜ |
| 24 | LLM metrics | `src/llm/metrics.rs` | P0 | ⬜ |
| 25 | Streaming span | `src/llm/streaming.rs` | P1 | ⬜ |
| 26 | Token cost calculator | `src/llm/cost.rs` | P2 | ⬜ |

### 2.5 Agent Tracing Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 27 | Agent tracer | `src/llm/agent_tracer.rs` | P0 | ⬜ |
| 28 | Step tracing | `src/llm/agent_step.rs` | P0 | ⬜ |
| 29 | Tool call tracing | `src/llm/tool_trace.rs` | P1 | ⬜ |
| 30 | Memory retrieval tracing | `src/llm/memory_trace.rs` | P1 | ⬜ |
| 31 | Decision tracing | `src/llm/decision_trace.rs` | P2 | ⬜ |

### 2.6 Security Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 32 | Attribute redactor | `src/security/redaction.rs` | P0 | ⬜ |
| 33 | Pattern matcher | `src/security/patterns.rs` | P0 | ⬜ |
| 34 | Auth configuration | `src/security/auth.rs` | P0 | ⬜ |
| 35 | TLS configuration | `src/security/tls.rs` | P1 | ⬜ |

### 2.7 Sampling Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 36 | Sampler interface | `src/sampling/mod.rs` | P0 | ⬜ |
| 37 | Ratio sampler | `src/sampling/ratio.rs` | P0 | ⬜ |
| 38 | Parent-based sampler | `src/sampling/parent_based.rs` | P0 | ⬜ |
| 39 | Priority sampler | `src/sampling/priority.rs` | P1 | ⬜ |
| 40 | Tail sampling buffer | `src/sampling/tail_buffer.rs` | P2 | ⬜ |

### 2.8 TypeScript Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 41 | Provider | `typescript/src/provider.ts` | P0 | ⬜ |
| 42 | LLM tracing | `typescript/src/llm-tracing.ts` | P0 | ⬜ |
| 43 | Agent tracing | `typescript/src/agent-tracing.ts` | P0 | ⬜ |
| 44 | Propagation | `typescript/src/propagation.ts` | P0 | ⬜ |
| 45 | Types | `typescript/src/types.ts` | P0 | ⬜ |
| 46 | Attribute builder | `typescript/src/attributes.ts` | P1 | ⬜ |

---

## 3. File Manifest

### 3.1 Rust Crate Structure

```
integrations/opentelemetry/
├── Cargo.toml
├── README.md
├── src/
│   ├── lib.rs                          # Public API exports
│   ├── error.rs                        # OtelError enum
│   ├── config.rs                       # TelemetryConfig, ExporterConfig
│   ├── resource.rs                     # Resource builder
│   ├── provider.rs                     # TelemetryProvider
│   │
│   ├── tracer/
│   │   ├── mod.rs                      # Tracer module exports
│   │   ├── tracer.rs                   # Tracer wrapper
│   │   ├── span_builder.rs             # SpanBuilder
│   │   ├── span.rs                     # Span implementation
│   │   └── context.rs                  # Context management
│   │
│   ├── metrics/
│   │   ├── mod.rs                      # Metrics module exports
│   │   ├── instruments.rs              # Counter, Histogram, Gauge
│   │   ├── aggregation.rs              # Aggregation views
│   │   └── reader.rs                   # MetricReader
│   │
│   ├── logging/
│   │   ├── mod.rs                      # Logging module exports
│   │   ├── bridge.rs                   # LogBridge
│   │   └── correlation.rs              # Trace-log correlation
│   │
│   ├── propagation/
│   │   ├── mod.rs                      # Propagation exports
│   │   ├── w3c.rs                      # W3C TraceContext
│   │   ├── baggage.rs                  # W3C Baggage
│   │   ├── composite.rs                # Composite propagator
│   │   ├── http.rs                     # HTTP header injection/extraction
│   │   └── grpc.rs                     # gRPC metadata propagation
│   │
│   ├── export/
│   │   ├── mod.rs                      # Export module exports
│   │   ├── otlp_grpc.rs                # OTLP gRPC exporter
│   │   ├── otlp_http.rs                # OTLP HTTP exporter
│   │   ├── stdout.rs                   # Stdout exporter
│   │   ├── mock.rs                     # Mock exporter for testing
│   │   ├── batch.rs                    # Batch span processor
│   │   ├── metric_exporter.rs          # Metric exporter
│   │   └── resilient.rs                # Resilient exporter wrapper
│   │
│   ├── llm/
│   │   ├── mod.rs                      # LLM module exports
│   │   ├── span_builder.rs             # LLMSpanBuilder
│   │   ├── conventions.rs              # Semantic conventions
│   │   ├── metrics.rs                  # LLM-specific metrics
│   │   ├── streaming.rs                # Streaming response tracing
│   │   ├── cost.rs                     # Token cost calculator
│   │   ├── agent_tracer.rs             # AgentTracer
│   │   ├── agent_step.rs               # Agent step tracing
│   │   ├── tool_trace.rs               # Tool call tracing
│   │   ├── memory_trace.rs             # Memory retrieval tracing
│   │   └── decision_trace.rs           # Decision point tracing
│   │
│   ├── security/
│   │   ├── mod.rs                      # Security module exports
│   │   ├── redaction.rs                # AttributeRedactor
│   │   ├── patterns.rs                 # Redaction patterns
│   │   ├── auth.rs                     # Authentication config
│   │   └── tls.rs                      # TLS configuration
│   │
│   └── sampling/
│       ├── mod.rs                      # Sampling module exports
│       ├── ratio.rs                    # TraceIdRatio sampler
│       ├── parent_based.rs             # Parent-based sampler
│       ├── priority.rs                 # Priority sampler
│       └── tail_buffer.rs              # Tail sampling buffer
│
├── tests/
│   ├── unit/
│   │   ├── config_test.rs
│   │   ├── provider_test.rs
│   │   ├── span_test.rs
│   │   ├── metrics_test.rs
│   │   ├── propagation_test.rs
│   │   ├── baggage_test.rs
│   │   ├── llm_span_test.rs
│   │   ├── agent_tracer_test.rs
│   │   ├── redaction_test.rs
│   │   ├── batch_test.rs
│   │   └── sampler_test.rs
│   │
│   └── integration/
│       ├── otlp_grpc_test.rs
│       ├── otlp_http_test.rs
│       ├── full_trace_test.rs
│       ├── llm_tracing_test.rs
│       ├── agent_tracing_test.rs
│       ├── context_propagation_test.rs
│       └── shutdown_test.rs
│
├── benches/
│   ├── span_creation.rs
│   ├── attribute_set.rs
│   ├── batch_export.rs
│   ├── context_propagation.rs
│   └── redaction.rs
│
└── examples/
    ├── basic_tracing.rs
    ├── llm_tracing.rs
    ├── agent_tracing.rs
    ├── distributed_context.rs
    ├── custom_sampler.rs
    └── multi_backend.rs
```

### 3.2 TypeScript Package Structure

```
typescript/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                        # Public exports
│   ├── provider.ts                     # TelemetryProvider
│   ├── config.ts                       # Configuration types
│   ├── llm-tracing.ts                  # LLM span helpers
│   ├── agent-tracing.ts                # Agent tracing helpers
│   ├── propagation.ts                  # Context propagation
│   ├── attributes.ts                   # Type-safe attribute builder
│   ├── metrics.ts                      # Metric helpers
│   ├── redaction.ts                    # Attribute redaction
│   └── types.ts                        # Type definitions
│
├── tests/
│   ├── provider.test.ts
│   ├── llm-tracing.test.ts
│   ├── agent-tracing.test.ts
│   ├── propagation.test.ts
│   ├── attributes.test.ts
│   └── redaction.test.ts
│
└── examples/
    ├── basic-usage.ts
    ├── llm-tracing.ts
    └── express-integration.ts
```

### 3.3 File Count Summary

| Category | Files | Lines (Est.) |
|----------|-------|--------------|
| Rust Source | 45 | ~8,000 |
| Rust Tests | 18 | ~3,500 |
| Rust Benches | 5 | ~500 |
| Rust Examples | 6 | ~600 |
| TypeScript Source | 10 | ~1,500 |
| TypeScript Tests | 6 | ~800 |
| Config/Docs | 5 | ~300 |
| **Total** | **95** | **~15,200** |

---

## 4. Dependency Specification

### 4.1 Cargo.toml

```toml
[package]
name = "otel-integration"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"
description = "OpenTelemetry integration for LLM Dev Ops platform"
license = "MIT"

[features]
default = ["otlp-grpc", "otlp-http"]
otlp-grpc = ["opentelemetry-otlp/grpc-tonic"]
otlp-http = ["opentelemetry-otlp/http-proto"]
full = ["otlp-grpc", "otlp-http", "jaeger", "prometheus"]
jaeger = ["opentelemetry-jaeger"]
prometheus = ["opentelemetry-prometheus"]

[dependencies]
# OpenTelemetry core
opentelemetry = { version = "0.24", features = ["trace", "metrics", "logs"] }
opentelemetry_sdk = { version = "0.24", features = ["trace", "metrics", "logs", "rt-tokio"] }
opentelemetry-otlp = { version = "0.17", optional = true }
opentelemetry-semantic-conventions = "0.16"
opentelemetry-jaeger = { version = "0.22", optional = true }
opentelemetry-prometheus = { version = "0.17", optional = true }

# Tracing integration
tracing = "0.1"
tracing-opentelemetry = "0.25"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }

# Async runtime
tokio = { version = "1.35", features = ["full"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
prost = "0.12"

# HTTP/gRPC
tonic = { version = "0.11", features = ["tls"] }
reqwest = { version = "0.11", features = ["json", "rustls-tls"], default-features = false }
http = "1.0"

# Compression
flate2 = "1.0"

# Concurrency
crossbeam-queue = "0.3"
dashmap = "5.5"
parking_lot = "0.12"

# Utilities
thiserror = "1.0"
anyhow = "1.0"
regex = "1.10"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.6", features = ["v4"] }
rand = "0.8"
once_cell = "1.19"

# Shared modules
shared-credentials = { path = "../../shared/credentials" }
shared-observability = { path = "../../shared/observability" }
shared-tracing = { path = "../../shared/tracing" }

[dev-dependencies]
tokio-test = "0.4"
criterion = { version = "0.5", features = ["async_tokio"] }
mockall = "0.12"
test-case = "3.3"
wiremock = "0.6"
testcontainers = "0.15"
assert_matches = "1.5"
tempfile = "3.9"

[[bench]]
name = "span_creation"
harness = false

[[bench]]
name = "batch_export"
harness = false
```

### 4.2 TypeScript package.json

```json
{
  "name": "@llm-devops/otel-integration",
  "version": "0.1.0",
  "description": "OpenTelemetry integration for LLM Dev Ops platform",
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
    "@opentelemetry/api": "^1.8.0",
    "@opentelemetry/sdk-node": "^0.50.0",
    "@opentelemetry/sdk-trace-node": "^1.23.0",
    "@opentelemetry/sdk-metrics": "^1.23.0",
    "@opentelemetry/exporter-trace-otlp-grpc": "^0.50.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.50.0",
    "@opentelemetry/exporter-metrics-otlp-grpc": "^0.50.0",
    "@opentelemetry/resources": "^1.23.0",
    "@opentelemetry/semantic-conventions": "^1.23.0",
    "@opentelemetry/context-async-hooks": "^1.23.0",
    "@opentelemetry/propagator-w3c-trace-context": "^1.23.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
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
| `provider.rs` | 90% | SDK initialization, shutdown |
| `span_builder.rs` | 95% | Span creation, attributes |
| `config.rs` | 90% | Env var parsing, defaults |
| `w3c.rs` | 95% | Header parsing, injection |
| `baggage.rs` | 90% | Encoding, decoding, limits |
| `batch.rs` | 90% | Batching, queue management |
| `redaction.rs` | 95% | Pattern matching, sanitization |
| `llm/span_builder.rs` | 90% | LLM attributes, events |
| `agent_tracer.rs` | 90% | Step correlation, links |
| `sampler/*.rs` | 85% | Sampling decisions |
| **Overall** | **85%** | |

### 5.2 Test Case Matrix

#### Provider Tests
```
provider_test.rs:
├── test_provider_creation_with_defaults
├── test_provider_creation_with_custom_config
├── test_provider_from_env_vars
├── test_tracer_acquisition
├── test_meter_acquisition
├── test_logger_acquisition
├── test_provider_shutdown_flushes_spans
├── test_provider_shutdown_timeout
├── test_provider_double_shutdown_safe
└── test_resource_attributes_set
```

#### Span Tests
```
span_test.rs:
├── test_span_creation_basic
├── test_span_with_attributes
├── test_span_with_events
├── test_span_with_links
├── test_span_set_status_ok
├── test_span_set_status_error
├── test_span_record_exception
├── test_span_parent_child_relationship
├── test_span_context_propagation
├── test_span_kind_variants
├── test_span_timing_recorded
└── test_span_attribute_limits
```

#### Propagation Tests
```
propagation_test.rs:
├── test_traceparent_parsing_valid
├── test_traceparent_parsing_invalid_version
├── test_traceparent_parsing_invalid_length
├── test_traceparent_parsing_invalid_chars
├── test_traceparent_injection
├── test_tracestate_parsing
├── test_tracestate_injection
├── test_baggage_parsing_single
├── test_baggage_parsing_multiple
├── test_baggage_encoding_special_chars
├── test_baggage_size_limits
├── test_composite_propagator_inject
├── test_composite_propagator_extract
└── test_context_round_trip
```

#### LLM Tracing Tests
```
llm_span_test.rs:
├── test_llm_span_basic
├── test_llm_span_with_model
├── test_llm_span_with_tokens
├── test_llm_span_with_cost
├── test_llm_span_streaming
├── test_llm_span_ttft_recorded
├── test_llm_span_error_handling
├── test_llm_span_rate_limit_error
├── test_llm_span_prompt_redaction_enabled
├── test_llm_span_prompt_redaction_disabled
├── test_llm_semantic_conventions
└── test_llm_metrics_recorded
```

#### Agent Tracing Tests
```
agent_tracer_test.rs:
├── test_agent_run_span
├── test_agent_step_spans
├── test_agent_step_ordering
├── test_agent_tool_call_span
├── test_agent_memory_retrieval_span
├── test_agent_decision_span
├── test_agent_parent_child_links
├── test_agent_multi_agent_correlation
├── test_agent_error_propagation
└── test_agent_metrics
```

#### Redaction Tests
```
redaction_test.rs:
├── test_redact_openai_api_key
├── test_redact_anthropic_api_key
├── test_redact_aws_access_key
├── test_redact_email_address
├── test_redact_credit_card
├── test_redact_jwt_token
├── test_redact_by_key_blocklist
├── test_redact_multiple_patterns
├── test_redact_preserves_safe_values
├── test_redact_truncates_long_values
├── test_custom_pattern_addition
└── test_redaction_disabled
```

### 5.3 Integration Test Scenarios

```
integration/
├── otlp_grpc_test.rs
│   ├── test_export_single_span
│   ├── test_export_batch_spans
│   ├── test_export_with_auth_header
│   ├── test_export_connection_failure_handling
│   └── test_export_retry_on_transient_error
│
├── full_trace_test.rs
│   ├── test_distributed_trace_correlation
│   ├── test_trace_across_http_boundary
│   ├── test_trace_across_grpc_boundary
│   ├── test_baggage_propagation_e2e
│   └── test_complete_llm_agent_trace
│
├── llm_tracing_test.rs
│   ├── test_llm_call_with_real_sdk
│   ├── test_streaming_response_tracing
│   ├── test_token_metrics_export
│   └── test_cost_calculation_accuracy
│
└── shutdown_test.rs
    ├── test_graceful_shutdown_flushes_all
    ├── test_shutdown_timeout_drops_remaining
    └── test_sigterm_handling
```

### 5.4 Performance Benchmarks

```rust
// benches/span_creation.rs
#[bench]
fn bench_span_creation_no_attrs(b: &mut Bencher) {
    // Target: < 500ns
}

#[bench]
fn bench_span_creation_with_4_attrs(b: &mut Bencher) {
    // Target: < 1μs
}

#[bench]
fn bench_span_creation_with_16_attrs(b: &mut Bencher) {
    // Target: < 2μs
}

// benches/context_propagation.rs
#[bench]
fn bench_traceparent_parse(b: &mut Bencher) {
    // Target: < 100ns
}

#[bench]
fn bench_traceparent_inject(b: &mut Bencher) {
    // Target: < 50ns
}

// benches/redaction.rs
#[bench]
fn bench_redact_no_match(b: &mut Bencher) {
    // Target: < 500ns
}

#[bench]
fn bench_redact_with_match(b: &mut Bencher) {
    // Target: < 2μs
}
```

---

## 6. CI/CD Pipeline

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/otel-integration.yml
name: OpenTelemetry Integration CI

on:
  push:
    branches: [main]
    paths:
      - 'integrations/opentelemetry/**'
      - '.github/workflows/otel-integration.yml'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/opentelemetry/**'

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
          workspaces: integrations/opentelemetry

      - name: Check formatting
        run: cargo fmt --check
        working-directory: integrations/opentelemetry

      - name: Clippy
        run: cargo clippy --all-features -- -D warnings
        working-directory: integrations/opentelemetry

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
          workspaces: integrations/opentelemetry

      - name: Run unit tests
        run: cargo test --lib --all-features
        working-directory: integrations/opentelemetry

      - name: Run doc tests
        run: cargo test --doc --all-features
        working-directory: integrations/opentelemetry

  test-integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      otel-collector:
        image: otel/opentelemetry-collector:0.92.0
        ports:
          - 4317:4317
          - 4318:4318
        options: >-
          --health-cmd="wget -q -O- http://localhost:13133/health"
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
          workspaces: integrations/opentelemetry

      - name: Run integration tests
        run: cargo test --test '*' --all-features
        working-directory: integrations/opentelemetry
        env:
          OTEL_EXPORTER_OTLP_ENDPOINT: http://localhost:4317

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
        working-directory: integrations/opentelemetry

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/opentelemetry/coverage/cobertura.xml
          flags: otel-integration
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
        working-directory: integrations/opentelemetry

      - name: Compare benchmarks
        uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: 'cargo'
          output-file-path: integrations/opentelemetry/bench-results.txt
          alert-threshold: '150%'
          fail-on-alert: true

  test-typescript:
    name: TypeScript Tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: integrations/opentelemetry/typescript
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/opentelemetry/typescript/package-lock.json

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
        working-directory: integrations/opentelemetry

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: otel-integration
          path: integrations/opentelemetry/target/release/libotel_integration.*
```

### 6.2 Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: cargo-fmt
        name: cargo fmt
        entry: cargo fmt --manifest-path integrations/opentelemetry/Cargo.toml --
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-clippy
        name: cargo clippy
        entry: cargo clippy --manifest-path integrations/opentelemetry/Cargo.toml --all-features -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-test
        name: cargo test
        entry: cargo test --manifest-path integrations/opentelemetry/Cargo.toml --lib
        language: system
        types: [rust]
        pass_filenames: false
```

---

## 7. Deployment Guide

### 7.1 Environment Configuration

```bash
# Required environment variables
export OTEL_SERVICE_NAME="my-service"
export OTEL_SERVICE_VERSION="1.0.0"

# Exporter configuration
export OTEL_EXPORTER_OTLP_ENDPOINT="https://collector.example.com:4317"
export OTEL_EXPORTER_OTLP_PROTOCOL="grpc"  # or "http/protobuf"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${OTEL_TOKEN}"
export OTEL_EXPORTER_OTLP_COMPRESSION="gzip"

# Sampling configuration
export OTEL_TRACES_SAMPLER="parentbased_traceidratio"
export OTEL_TRACES_SAMPLER_ARG="0.1"

# Batch processor configuration
export OTEL_BSP_MAX_QUEUE_SIZE="4096"
export OTEL_BSP_MAX_EXPORT_BATCH_SIZE="512"
export OTEL_BSP_SCHEDULE_DELAY="5000"
export OTEL_BSP_EXPORT_TIMEOUT="30000"

# Security configuration
export OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT="1024"
export OTEL_REDACTION_ENABLED="true"
export OTEL_REDACT_PROMPTS="true"
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
            - name: OTEL_SERVICE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.labels['app.kubernetes.io/name']
            - name: OTEL_SERVICE_VERSION
              value: "1.0.0"
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: "http://otel-collector.observability:4317"
            - name: OTEL_TRACES_SAMPLER
              value: "parentbased_traceidratio"
            - name: OTEL_TRACES_SAMPLER_ARG
              value: "0.1"
            - name: OTEL_RESOURCE_ATTRIBUTES
              value: "k8s.namespace.name=$(POD_NAMESPACE),k8s.pod.name=$(POD_NAME)"
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
```

### 7.3 Collector Configuration

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024
    send_batch_max_size: 2048

  memory_limiter:
    check_interval: 1s
    limit_mib: 1000
    spike_limit_mib: 200

  attributes:
    actions:
      - key: environment
        value: production
        action: upsert

  filter/llm:
    traces:
      span:
        - 'attributes["gen_ai.system"] != nil'

exporters:
  otlp/jaeger:
    endpoint: jaeger-collector:4317
    tls:
      insecure: true

  prometheus:
    endpoint: 0.0.0.0:8889

  logging:
    verbosity: detailed

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, attributes]
      exporters: [otlp/jaeger, logging]

    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

---

## 8. Operational Runbooks

### 8.1 Runbook: High Span Drop Rate

**Symptoms:**
- `otel_spans_dropped_total` metric increasing
- Incomplete traces in backend
- Queue full warnings in logs

**Diagnosis:**
```bash
# Check drop rate
curl -s localhost:9090/metrics | grep otel_spans_dropped

# Check queue size
curl -s localhost:9090/metrics | grep otel_queue_size

# Check export latency
curl -s localhost:9090/metrics | grep otel_export_latency
```

**Resolution:**
1. **Increase queue size** (if memory allows):
   ```bash
   export OTEL_BSP_MAX_QUEUE_SIZE=8192
   ```

2. **Reduce batch timeout** (export more frequently):
   ```bash
   export OTEL_BSP_SCHEDULE_DELAY=2000
   ```

3. **Increase sampling rate** (sample fewer spans):
   ```bash
   export OTEL_TRACES_SAMPLER_ARG=0.05
   ```

4. **Scale collectors** if export is the bottleneck

### 8.2 Runbook: Export Connection Failures

**Symptoms:**
- `otel_export_errors_total` metric increasing
- "connection refused" errors in logs
- Circuit breaker opening

**Diagnosis:**
```bash
# Check collector connectivity
curl -v http://collector:4318/v1/traces

# Check TLS certificates
openssl s_client -connect collector:4317

# Check network policies
kubectl get networkpolicy -n observability
```

**Resolution:**
1. **Verify collector is running:**
   ```bash
   kubectl get pods -n observability -l app=otel-collector
   ```

2. **Check endpoint configuration:**
   ```bash
   echo $OTEL_EXPORTER_OTLP_ENDPOINT
   ```

3. **Enable fallback exporter:**
   ```bash
   export OTEL_FALLBACK_EXPORTER=stdout
   ```

4. **Increase circuit breaker timeout:**
   ```bash
   export OTEL_CIRCUIT_BREAKER_RESET_TIMEOUT=120
   ```

### 8.3 Runbook: Memory Growth

**Symptoms:**
- Container memory increasing over time
- OOM kills
- Slow span creation

**Diagnosis:**
```bash
# Check memory usage
kubectl top pod my-service-xxx

# Check queue metrics
curl -s localhost:9090/metrics | grep otel_queue

# Profile memory (if enabled)
curl localhost:6060/debug/pprof/heap > heap.prof
```

**Resolution:**
1. **Reduce queue size:**
   ```bash
   export OTEL_BSP_MAX_QUEUE_SIZE=2048
   ```

2. **Reduce attribute value limits:**
   ```bash
   export OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT=512
   ```

3. **Enable attribute count limits:**
   ```bash
   export OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT=64
   export OTEL_SPAN_EVENT_COUNT_LIMIT=64
   ```

4. **Reduce span link count:**
   ```bash
   export OTEL_SPAN_LINK_COUNT_LIMIT=32
   ```

### 8.4 Runbook: Sensitive Data in Traces

**Symptoms:**
- PII visible in trace backends
- API keys in span attributes
- Compliance alerts

**Immediate Actions:**
1. **Enable redaction immediately:**
   ```bash
   export OTEL_REDACTION_ENABLED=true
   export OTEL_REDACT_PROMPTS=true
   export OTEL_REDACT_COMPLETIONS=true
   ```

2. **Restart all affected services**

3. **Contact security team**

4. **Purge affected data from backends** (if possible)

**Prevention:**
- Add custom redaction patterns for business-specific PII
- Enable key blocklist for sensitive attribute names
- Review span attributes in staging before production

### 8.5 Runbook: Graceful Shutdown Issues

**Symptoms:**
- Spans lost during deployments
- Incomplete traces after restarts
- Flush timeout warnings

**Resolution:**
1. **Increase shutdown timeout:**
   ```bash
   export OTEL_BSP_EXPORT_TIMEOUT=60000
   ```

2. **Configure preStop hook in Kubernetes:**
   ```yaml
   lifecycle:
     preStop:
       exec:
         command: ["/bin/sh", "-c", "sleep 30"]
   ```

3. **Ensure SIGTERM handling is implemented**

4. **Reduce batch size for faster final flush:**
   ```bash
   export OTEL_BSP_MAX_EXPORT_BATCH_SIZE=256
   ```

---

## 9. Acceptance Criteria Verification

### 9.1 Functional Requirements

| # | Requirement | Test | Status |
|---|-------------|------|--------|
| 1 | SDK: Initialize TracerProvider | `test_provider_creation_with_defaults` | ⬜ |
| 2 | SDK: Initialize MeterProvider | `test_meter_acquisition` | ⬜ |
| 3 | SDK: Initialize LoggerProvider | `test_logger_acquisition` | ⬜ |
| 4 | SDK: Configure OTLP exporter | `test_export_single_span` | ⬜ |
| 5 | SDK: Configure sampling | `test_ratio_sampler` | ⬜ |
| 6 | SDK: Set resource attributes | `test_resource_attributes_set` | ⬜ |
| 7 | Trace: Create span | `test_span_creation_basic` | ⬜ |
| 8 | Trace: Add attributes | `test_span_with_attributes` | ⬜ |
| 9 | Trace: Add events | `test_span_with_events` | ⬜ |
| 10 | Trace: Set status | `test_span_set_status_ok` | ⬜ |
| 11 | Trace: Record exception | `test_span_record_exception` | ⬜ |
| 12 | Trace: Link spans | `test_span_with_links` | ⬜ |
| 13 | Propagation: Inject HTTP | `test_traceparent_injection` | ⬜ |
| 14 | Propagation: Extract HTTP | `test_traceparent_parsing_valid` | ⬜ |
| 15 | Propagation: gRPC metadata | `test_grpc_metadata_propagation` | ⬜ |
| 16 | Metric: Create counter | `test_counter_creation` | ⬜ |
| 17 | Metric: Create histogram | `test_histogram_creation` | ⬜ |
| 18 | Metric: Record values | `test_metric_recording` | ⬜ |
| 19 | Log: Emit with trace context | `test_log_trace_correlation` | ⬜ |
| 20 | LLM: Model call span | `test_llm_span_basic` | ⬜ |
| 21 | LLM: Token metrics | `test_llm_span_with_tokens` | ⬜ |
| 22 | Agent: Step tracing | `test_agent_step_spans` | ⬜ |
| 23 | Agent: Multi-agent correlation | `test_agent_multi_agent_correlation` | ⬜ |
| 24 | Export: OTLP gRPC | `test_export_grpc` | ⬜ |
| 25 | Export: OTLP HTTP | `test_export_http` | ⬜ |
| 26 | Export: Batch processing | `test_batch_export` | ⬜ |
| 27 | Shutdown: Graceful flush | `test_graceful_shutdown_flushes_all` | ⬜ |
| 28 | Security: Attribute redaction | `test_redact_openai_api_key` | ⬜ |

### 9.2 Non-Functional Requirements

| # | Requirement | Benchmark | Target | Status |
|---|-------------|-----------|--------|--------|
| 1 | Span creation latency | `bench_span_creation_no_attrs` | < 500ns | ⬜ |
| 2 | Span with attrs latency | `bench_span_creation_with_4_attrs` | < 1μs | ⬜ |
| 3 | Context propagation | `bench_traceparent_parse` | < 100ns | ⬜ |
| 4 | No memory leaks | `integration/memory_test` | Stable | ⬜ |
| 5 | Graceful degradation | `test_export_connection_failure` | No panic | ⬜ |
| 6 | Test coverage | `cargo tarpaulin` | > 85% | ⬜ |

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
| Security review complete | | | |
| Chaos testing complete | | | |

### 10.3 Operations Sign-Off

| Item | Owner | Date | Signature |
|------|-------|------|-----------|
| Runbooks validated | | | |
| Monitoring configured | | | |
| Alerting configured | | | |
| Deployment tested in staging | | | |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Completion |

---

**SPARC Cycle Complete** - The OpenTelemetry Integration Module specification is ready for implementation.
