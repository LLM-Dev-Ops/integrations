# Google Cloud Logging Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcl`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements for the Google Cloud Logging (GCL) Integration Module. It provides a production-ready, type-safe interface for log ingestion, querying, and cross-service correlation within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The GCL Integration Module provides a **thin adapter layer** that:
- Emits structured logs to Google Cloud Logging
- Queries logs with filtering, time ranges, and pagination
- Correlates logs across services using trace IDs
- Integrates with shared observability and credential infrastructure
- Enables simulation/replay of log streams for testing

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Log Ingestion** | Write structured log entries to Cloud Logging |
| **Log Querying** | Query logs with advanced filtering |
| **Correlation** | Link logs via trace/span IDs |
| **Tailing** | Stream live log entries |
| **Sinks (read)** | Query configured log sinks |
| **Metrics (read)** | Query log-based metrics |
| **Resilience** | Retry, buffering, circuit breaker |
| **Observability** | Tracing, metrics for adapter operations |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Write log entries | Single and batch writes |
| Query logs | Filter expressions, time ranges |
| Tail logs | Streaming live entries |
| List log entries | Pagination support |
| List logs/sinks/metrics | Read-only enumeration |
| Resource descriptors | Project, folder, organization, billing account |
| Severity levels | All GCL severity levels |
| Labels and payloads | Structured JSON payloads |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Sink creation/deletion | Infrastructure provisioning |
| Log-based metric creation | Infrastructure provisioning |
| Exclusion filter management | Infrastructure configuration |
| Bucket configuration | Infrastructure provisioning |
| IAM policy management | Security governance |
| Log Router configuration | Infrastructure configuration |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first | I/O-bound operations |
| Buffered writes | Efficiency, resilience |
| No panics | Reliability |
| Trait-based abstractions | Testability |
| OAuth2/SA authentication | GCP standard |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | GCP credential management |
| `shared/resilience` | Retry, circuit breaker |
| `shared/observability` | Logging abstractions, metrics, tracing |
| `shared/http` | HTTP/gRPC transport |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `tonic` | gRPC client |
| `prost` | Protobuf serialization |
| `serde` / `serde_json` | JSON handling |
| `async-trait` | Async trait support |
| `thiserror` | Error derivation |
| `chrono` | Timestamps |
| `futures` | Stream utilities |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `google-cloud-logging` | This module IS the integration |
| Full GCP SDK crates | Use internal implementations |

---

## 4. API Coverage

### 4.1 Cloud Logging API v2

**Base:** `logging.googleapis.com`

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Write Logs | POST | `/v2/entries:write` |
| List Logs | GET | `/v2/{parent}/logs` |
| List Log Entries | POST | `/v2/entries:list` |
| Tail Log Entries | gRPC | `TailLogEntries` (streaming) |
| List Sinks | GET | `/v2/{parent}/sinks` |
| Get Sink | GET | `/v2/{sinkName}` |
| List Metrics | GET | `/v2/{parent}/metrics` |
| Get Metric | GET | `/v2/{metricName}` |

### 4.2 Log Entry Structure

```json
{
  "logName": "projects/{project}/logs/{log_id}",
  "resource": {
    "type": "global",
    "labels": {}
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "severity": "INFO",
  "insertId": "unique-id",
  "labels": {"key": "value"},
  "jsonPayload": {"structured": "data"},
  "trace": "projects/{project}/traces/{trace_id}",
  "spanId": "span-id",
  "traceSampled": true,
  "sourceLocation": {
    "file": "main.rs",
    "line": 42,
    "function": "process"
  }
}
```

### 4.3 Severity Levels

| Level | Value | Description |
|-------|-------|-------------|
| DEFAULT | 0 | Unspecified |
| DEBUG | 100 | Debug info |
| INFO | 200 | Routine info |
| NOTICE | 300 | Normal but significant |
| WARNING | 400 | Warning conditions |
| ERROR | 500 | Error conditions |
| CRITICAL | 600 | Critical conditions |
| ALERT | 700 | Action required |
| EMERGENCY | 800 | System unusable |

### 4.4 Filter Expression Syntax

```
# Severity filter
severity >= WARNING

# Label filter
labels.environment = "production"

# Resource filter
resource.type = "k8s_container"

# Time filter
timestamp >= "2025-01-01T00:00:00Z"

# Text search
textPayload : "error"

# JSON payload field
jsonPayload.user_id = "12345"

# Trace correlation
trace = "projects/my-project/traces/abc123"

# Combined
severity >= ERROR AND resource.labels.cluster_name = "prod-cluster"
```

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
GclError
├── ConfigurationError
│   ├── InvalidProjectId
│   ├── InvalidLogName
│   └── InvalidFilter
│
├── AuthenticationError
│   ├── TokenExpired
│   ├── PermissionDenied
│   └── QuotaExceeded
│
├── WriteError
│   ├── PayloadTooLarge
│   ├── InvalidEntry
│   ├── PartialFailure
│   └── BufferOverflow
│
├── QueryError
│   ├── InvalidFilter
│   ├── TimeRangeInvalid
│   └── ResultsTruncated
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   └── GrpcError
│
└── ServerError
    ├── InternalError
    ├── ServiceUnavailable
    └── RateLimited
```

### 5.2 HTTP/gRPC Status Mapping

| Status | Error Type | Retryable |
|--------|------------|-----------|
| 400 | `ConfigurationError` | No |
| 401 | `AuthenticationError::TokenExpired` | Yes (refresh) |
| 403 | `AuthenticationError::PermissionDenied` | No |
| 429 | `ServerError::RateLimited` | Yes |
| 500 | `ServerError::InternalError` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |
| UNAVAILABLE | `NetworkError::GrpcError` | Yes |
| DEADLINE_EXCEEDED | `NetworkError::Timeout` | Yes |

---

## 6. Resilience Requirements

### 6.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `RateLimited` | Yes | 5 | Exponential (1s base) |
| `ServiceUnavailable` | Yes | 3 | Exponential (2s base) |
| `InternalError` | Yes | 3 | Exponential (1s base) |
| `Timeout` | Yes | 3 | Fixed (1s) |
| Token expired | Yes | 1 | Immediate (refresh) |

### 6.2 Write Buffering

| Parameter | Default |
|-----------|---------|
| Buffer size | 1000 entries |
| Flush interval | 1 second |
| Flush threshold | 500 entries |
| Max entry size | 256 KB |
| Max batch size | 1000 entries / 10 MB |

### 6.3 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |

---

## 7. Observability Requirements

### 7.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `gcl.write` | `project`, `log_name`, `entry_count` |
| `gcl.query` | `project`, `filter`, `page_size` |
| `gcl.tail` | `project`, `filter`, `duration` |

### 7.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `gcl_entries_written_total` | Counter | `project`, `log_name`, `severity` |
| `gcl_write_latency_seconds` | Histogram | `project` |
| `gcl_query_latency_seconds` | Histogram | `project` |
| `gcl_buffer_size` | Gauge | `project` |
| `gcl_errors_total` | Counter | `operation`, `error_type` |

### 7.3 Logging

| Level | When |
|-------|------|
| ERROR | Write failures, auth errors |
| WARN | Retries, rate limiting, buffer near-full |
| INFO | Flush completions, query results |
| DEBUG | Entry details, filter parsing |
| TRACE | gRPC/HTTP details |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Keys never logged | `SecretString` wrapper |
| Token protection | Auto-refresh, no exposure |
| Workload identity | GKE metadata support |

### 8.2 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ | Enforced |
| Certificate validation | Enabled |
| gRPC TLS | Required |

### 8.3 Data Protection

| Requirement | Implementation |
|-------------|----------------|
| PII awareness | Label-based filtering option |
| Payload redaction | Configurable field redaction |

---

## 9. Performance Requirements

### 9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Single entry write | < 50ms | < 200ms |
| Batch write (100 entries) | < 100ms | < 500ms |
| Query (100 results) | < 200ms | < 1s |
| Tail stream setup | < 500ms | < 2s |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Write rate | 10,000 entries/sec |
| Query concurrency | 50+ simultaneous |
| Tail connections | 100+ simultaneous |

---

## 10. Enterprise Features

### 10.1 Cross-Service Correlation

| Feature | Description |
|---------|-------------|
| Trace ID propagation | W3C trace context, Cloud Trace format |
| Span ID linking | Parent-child relationships |
| Request correlation | HTTP request ID headers |

### 10.2 Retention Awareness

| Feature | Description |
|---------|-------------|
| Query time bounds | Respect retention policies |
| Bucket awareness | Route queries appropriately |

### 10.3 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | Return predefined responses |
| Record mode | Capture write/query pairs |
| Replay mode | Replay recorded streams |

---

## 11. Acceptance Criteria

### 11.1 Functional

- [ ] Single log entry write
- [ ] Batch log entry write
- [ ] Buffered async writes
- [ ] Query with filters
- [ ] Query with pagination
- [ ] Tail streaming
- [ ] Trace correlation
- [ ] Multiple resource types

### 11.2 Non-Functional

- [ ] No panics
- [ ] Credentials protected
- [ ] Memory-bounded buffers
- [ ] Retry works correctly
- [ ] Circuit breaker functions
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Core algorithms for buffered writes, query pagination, tail streaming, and correlation.
