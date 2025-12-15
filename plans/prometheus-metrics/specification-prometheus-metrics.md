# Prometheus Metrics Endpoint Integration - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/prometheus-metrics`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements for the Prometheus Metrics Endpoint Integration Module, providing a production-ready interface for exposing application metrics via a Prometheus-compatible HTTP endpoint within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

### 1.3 Audience

- Implementation developers (Rust and TypeScript)
- DevOps engineers configuring Prometheus scrapers
- SRE teams designing monitoring infrastructure
- Architects reviewing observability patterns

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Prometheus Metrics Endpoint Integration Module provides a **thin adapter layer** that:
- Exposes application metrics via HTTP endpoint in Prometheus text format
- Delegates metric collection to existing shared observability primitives
- Follows Prometheus metric naming conventions and best practices
- Supports enterprise-scale monitoring with label cardinality awareness
- Enables simulation and replay of metrics exposure for testing

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Endpoint Exposure** | HTTP `/metrics` endpoint serving Prometheus text format |
| **Format Serialization** | Convert internal metrics to Prometheus exposition format |
| **Metric Registry** | Centralized registry for metric collectors |
| **Label Management** | Attach labels with cardinality awareness |
| **Default Metrics** | Process, runtime, and application default metrics |
| **Custom Collectors** | Support for custom metric collectors |
| **Scrape Performance** | Optimized for high-frequency scraping |
| **Health Probes** | Optional `/health` and `/ready` endpoints |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| HTTP metrics endpoint | GET `/metrics` returning Prometheus text format |
| Metric types | Counter, Gauge, Histogram, Summary |
| Label support | Static and dynamic labels |
| Default collectors | Process, runtime, GC metrics |
| LLM-specific metrics | Token usage, latency, model invocations |
| Agent metrics | Agent execution, step timing, tool calls |
| Scrape optimization | Caching, gzip compression |
| Metric simulation | Mock collectors for testing |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Prometheus server | Infrastructure deployment scope |
| Scrape configuration | Prometheus server configuration |
| Alerting rules | AlertManager scope |
| Grafana dashboards | Visualization scope |
| Time series storage | TSDB scope |
| Push gateway | Separate integration if needed |
| Remote write | Use OpenTelemetry integration |
| Service discovery | Infrastructure scope |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Thin adapter only | No duplicate metric collection logic |
| Prometheus exposition format | Standard compatibility |
| Label cardinality limits | Prevent metric explosion |
| Async-safe | Non-blocking metric collection |
| No panics | Reliability under load |
| Graceful degradation | Endpoint always responds |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/observability` | Metric collection abstractions |
| `shared/tracing` | Trace context for exemplars |
| `shared/http` | HTTP server primitives |
| `shared/authentication` | Optional endpoint auth |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `prometheus` | Prometheus client library |
| `prometheus-static-metric` | Compile-time metric definitions |
| `tokio` | Async runtime |
| `hyper` or `axum` | HTTP server (via shared) |
| `flate2` | Gzip compression |

### 3.3 External Dependencies (TypeScript)

| Package | Purpose |
|---------|---------|
| `prom-client` | Prometheus client library |
| `express` or shared HTTP | HTTP server |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| Vendor-specific SDKs | Use Prometheus standard |
| Full monitoring platforms | Scope creep |
| Time series databases | Out of scope |

---

## 4. Metric Naming Conventions

### 4.1 Naming Rules

All metrics MUST follow Prometheus naming best practices:

| Rule | Example |
|------|---------|
| Snake_case format | `llm_request_duration_seconds` |
| Unit suffix | `_seconds`, `_bytes`, `_total` |
| `_total` for counters | `llm_requests_total` |
| `_info` for metadata | `llm_model_info` |
| Namespace prefix | `llmdevops_*` |

### 4.2 Standard Metric Prefixes

```
llmdevops_
├── llm_           # LLM-specific metrics
├── agent_         # Agent execution metrics
├── api_           # API endpoint metrics
├── process_       # Process metrics (standard)
├── go_/nodejs_    # Runtime metrics
└── http_          # HTTP server metrics
```

### 4.3 LLM Metric Naming

| Metric Name | Type | Description |
|-------------|------|-------------|
| `llmdevops_llm_requests_total` | Counter | Total LLM API requests |
| `llmdevops_llm_request_duration_seconds` | Histogram | Request latency distribution |
| `llmdevops_llm_tokens_total` | Counter | Total tokens processed |
| `llmdevops_llm_input_tokens_total` | Counter | Input tokens |
| `llmdevops_llm_output_tokens_total` | Counter | Output tokens |
| `llmdevops_llm_streaming_chunks_total` | Counter | Streaming response chunks |
| `llmdevops_llm_errors_total` | Counter | LLM request errors |
| `llmdevops_llm_model_info` | Gauge | Model metadata (info metric) |

### 4.4 Agent Metric Naming

| Metric Name | Type | Description |
|-------------|------|-------------|
| `llmdevops_agent_executions_total` | Counter | Agent executions |
| `llmdevops_agent_steps_total` | Counter | Agent steps completed |
| `llmdevops_agent_step_duration_seconds` | Histogram | Step duration |
| `llmdevops_agent_tool_calls_total` | Counter | Tool invocations |
| `llmdevops_agent_memory_operations_total` | Counter | Memory read/write ops |
| `llmdevops_agent_active` | Gauge | Currently active agents |

### 4.5 API/HTTP Metric Naming

| Metric Name | Type | Description |
|-------------|------|-------------|
| `llmdevops_http_requests_total` | Counter | HTTP requests received |
| `llmdevops_http_request_duration_seconds` | Histogram | Request duration |
| `llmdevops_http_request_size_bytes` | Histogram | Request body size |
| `llmdevops_http_response_size_bytes` | Histogram | Response body size |
| `llmdevops_http_active_requests` | Gauge | In-flight requests |

---

## 5. Label Cardinality Management

### 5.1 Cardinality Limits

| Label Type | Max Cardinality | Enforcement |
|------------|-----------------|-------------|
| Static labels | Unlimited | Compile-time |
| Model names | ~50 | Allowlist |
| Agent names | ~100 | Allowlist |
| Error types | ~20 | Enum mapping |
| HTTP methods | 9 | Fixed set |
| HTTP status codes | 5 buckets | Grouping (2xx, 3xx, etc.) |
| User IDs | **Forbidden** | Never use as label |
| Request IDs | **Forbidden** | Use exemplars instead |

### 5.2 Label Best Practices

| Practice | Description |
|----------|-------------|
| Bounded sets | Only labels with known finite values |
| No high-cardinality | Avoid UUIDs, timestamps, user data |
| Consistent naming | Same label names across metrics |
| Empty vs missing | Use empty string, not omit label |

### 5.3 Standard Label Schema

```
Common Labels:
├── service      # Service name
├── version      # Service version
├── environment  # prod, staging, dev
├── region       # Deployment region
└── instance     # Instance identifier

LLM Labels:
├── model        # Model identifier (e.g., "claude-3-opus")
├── provider     # Provider name (e.g., "anthropic")
├── operation    # Operation type (e.g., "chat", "embed")
└── status       # Success/failure status

Agent Labels:
├── agent_type   # Agent category
├── step_type    # Step category
└── tool_name    # Tool identifier
```

---

## 6. API Coverage

### 6.1 Endpoint Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/metrics` | GET | Prometheus metrics exposition |
| `/health` | GET | Health check (optional) |
| `/ready` | GET | Readiness probe (optional) |

### 6.2 Metrics Endpoint Response

**Request:**
```
GET /metrics HTTP/1.1
Accept: text/plain; version=0.0.4
Accept-Encoding: gzip
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: text/plain; version=0.0.4; charset=utf-8
Content-Encoding: gzip

# HELP llmdevops_llm_requests_total Total LLM API requests
# TYPE llmdevops_llm_requests_total counter
llmdevops_llm_requests_total{model="claude-3-opus",provider="anthropic",status="success"} 1234

# HELP llmdevops_llm_request_duration_seconds LLM request latency
# TYPE llmdevops_llm_request_duration_seconds histogram
llmdevops_llm_request_duration_seconds_bucket{model="claude-3-opus",le="0.1"} 10
llmdevops_llm_request_duration_seconds_bucket{model="claude-3-opus",le="0.5"} 50
llmdevops_llm_request_duration_seconds_bucket{model="claude-3-opus",le="1.0"} 100
llmdevops_llm_request_duration_seconds_bucket{model="claude-3-opus",le="+Inf"} 150
llmdevops_llm_request_duration_seconds_sum{model="claude-3-opus"} 75.5
llmdevops_llm_request_duration_seconds_count{model="claude-3-opus"} 150
```

### 6.3 Content Negotiation

| Accept Header | Response Format |
|---------------|-----------------|
| `text/plain` | Prometheus text format (0.0.4) |
| `application/openmetrics-text` | OpenMetrics format |
| `*/*` | Default to text format |

### 6.4 Compression

| Accept-Encoding | Response |
|-----------------|----------|
| `gzip` | Gzip compressed |
| `identity` | Uncompressed |
| None | Uncompressed |

---

## 7. Interface Definitions

### 7.1 Rust Interfaces

#### 7.1.1 Metrics Registry

```rust
/// Central registry for Prometheus metrics.
pub trait MetricsRegistry: Send + Sync {
    /// Register a new collector.
    fn register(&self, collector: Box<dyn Collector>) -> Result<(), MetricsError>;

    /// Unregister a collector.
    fn unregister(&self, collector: &dyn Collector) -> Result<(), MetricsError>;

    /// Gather all metrics for exposition.
    fn gather(&self) -> Vec<MetricFamily>;

    /// Get registry for specific subsystem.
    fn subsystem(&self, name: &str) -> SubsystemRegistry;
}
```

#### 7.1.2 Metric Types

```rust
/// Counter metric (monotonically increasing).
pub trait Counter: Send + Sync {
    /// Increment by 1.
    fn inc(&self);

    /// Increment by value.
    fn inc_by(&self, v: f64);

    /// Get current value.
    fn get(&self) -> f64;
}

/// Counter with labels.
pub trait CounterVec: Send + Sync {
    /// Get counter with specific labels.
    fn with_label_values(&self, labels: &[&str]) -> Box<dyn Counter>;

    /// Remove metric with labels.
    fn remove_label_values(&self, labels: &[&str]) -> Result<(), MetricsError>;
}

/// Gauge metric (can go up and down).
pub trait Gauge: Send + Sync {
    fn set(&self, v: f64);
    fn inc(&self);
    fn dec(&self);
    fn add(&self, v: f64);
    fn sub(&self, v: f64);
    fn get(&self) -> f64;
}

/// Histogram for latency distributions.
pub trait Histogram: Send + Sync {
    /// Observe a value.
    fn observe(&self, v: f64);

    /// Start a timer, returns guard that observes on drop.
    fn start_timer(&self) -> HistogramTimer;
}
```

#### 7.1.3 LLM Metrics Collector

```rust
/// Collector for LLM-specific metrics.
pub trait LlmMetricsCollector: Send + Sync {
    /// Record LLM request.
    fn record_request(
        &self,
        model: &str,
        provider: &str,
        duration: Duration,
        input_tokens: u64,
        output_tokens: u64,
        status: RequestStatus,
    );

    /// Record streaming chunk.
    fn record_streaming_chunk(&self, model: &str, provider: &str);

    /// Record error.
    fn record_error(&self, model: &str, provider: &str, error_type: &str);
}
```

#### 7.1.4 Agent Metrics Collector

```rust
/// Collector for agent execution metrics.
pub trait AgentMetricsCollector: Send + Sync {
    /// Record agent execution start.
    fn record_execution_start(&self, agent_type: &str);

    /// Record agent execution end.
    fn record_execution_end(&self, agent_type: &str, duration: Duration, status: ExecutionStatus);

    /// Record agent step.
    fn record_step(&self, agent_type: &str, step_type: &str, duration: Duration);

    /// Record tool call.
    fn record_tool_call(&self, agent_type: &str, tool_name: &str, duration: Duration, success: bool);

    /// Update active agent count.
    fn set_active_agents(&self, agent_type: &str, count: i64);
}
```

#### 7.1.5 Metrics Endpoint Handler

```rust
/// HTTP handler for metrics endpoint.
pub trait MetricsHandler: Send + Sync {
    /// Handle metrics request.
    async fn handle(&self, request: MetricsRequest) -> MetricsResponse;

    /// Get endpoint configuration.
    fn config(&self) -> &EndpointConfig;
}

/// Metrics request parameters.
pub struct MetricsRequest {
    pub accept: Option<String>,
    pub accept_encoding: Option<String>,
    pub timeout: Option<Duration>,
}

/// Metrics response.
pub struct MetricsResponse {
    pub content_type: String,
    pub content_encoding: Option<String>,
    pub body: Vec<u8>,
    pub status: u16,
}
```

#### 7.1.6 Configuration

```rust
/// Configuration for metrics endpoint.
#[derive(Clone)]
pub struct MetricsEndpointConfig {
    /// Listen address (e.g., "0.0.0.0:9090").
    pub listen_addr: SocketAddr,

    /// Metrics path (default: "/metrics").
    pub metrics_path: String,

    /// Enable health endpoint.
    pub enable_health: bool,

    /// Enable gzip compression.
    pub enable_compression: bool,

    /// Compression threshold (bytes).
    pub compression_threshold: usize,

    /// Scrape timeout.
    pub scrape_timeout: Duration,

    /// Default labels applied to all metrics.
    pub default_labels: HashMap<String, String>,

    /// Cardinality limits per metric.
    pub cardinality_limits: HashMap<String, usize>,

    /// Enable process metrics.
    pub enable_process_metrics: bool,

    /// Enable runtime metrics.
    pub enable_runtime_metrics: bool,

    /// Authentication configuration.
    pub auth: Option<AuthConfig>,
}

impl Default for MetricsEndpointConfig {
    fn default() -> Self {
        Self {
            listen_addr: "0.0.0.0:9090".parse().unwrap(),
            metrics_path: "/metrics".to_string(),
            enable_health: true,
            enable_compression: true,
            compression_threshold: 1024,
            scrape_timeout: Duration::from_secs(10),
            default_labels: HashMap::new(),
            cardinality_limits: HashMap::new(),
            enable_process_metrics: true,
            enable_runtime_metrics: true,
            auth: None,
        }
    }
}
```

### 7.2 TypeScript Interfaces

#### 7.2.1 Registry Interface

```typescript
/**
 * Central registry for Prometheus metrics.
 */
interface MetricsRegistry {
  /** Register a metric. */
  register<T extends Metric>(metric: T): T;

  /** Get or create a counter. */
  counter(config: CounterConfig): Counter;

  /** Get or create a gauge. */
  gauge(config: GaugeConfig): Gauge;

  /** Get or create a histogram. */
  histogram(config: HistogramConfig): Histogram;

  /** Get all metrics as Prometheus text. */
  metrics(): Promise<string>;

  /** Reset all metrics. */
  clear(): void;
}
```

#### 7.2.2 Metric Interfaces

```typescript
interface Counter {
  inc(value?: number): void;
  inc(labels: Labels, value?: number): void;
  get(): number;
  labels(labels: Labels): Counter;
}

interface Gauge {
  set(value: number): void;
  set(labels: Labels, value: number): void;
  inc(value?: number): void;
  dec(value?: number): void;
  get(): number;
  labels(labels: Labels): Gauge;
}

interface Histogram {
  observe(value: number): void;
  observe(labels: Labels, value: number): void;
  startTimer(labels?: Labels): () => void;
  labels(labels: Labels): Histogram;
}

type Labels = Record<string, string>;
```

#### 7.2.3 Collector Interfaces

```typescript
interface LlmMetricsCollector {
  recordRequest(params: LlmRequestParams): void;
  recordStreamingChunk(model: string, provider: string): void;
  recordError(model: string, provider: string, errorType: string): void;
}

interface LlmRequestParams {
  model: string;
  provider: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  status: 'success' | 'error';
}

interface AgentMetricsCollector {
  recordExecutionStart(agentType: string): void;
  recordExecutionEnd(agentType: string, durationMs: number, status: string): void;
  recordStep(agentType: string, stepType: string, durationMs: number): void;
  recordToolCall(agentType: string, toolName: string, durationMs: number, success: boolean): void;
  setActiveAgents(agentType: string, count: number): void;
}
```

---

## 8. Error Taxonomy

### 8.1 Error Hierarchy

```
MetricsError
├── RegistrationError
│   ├── DuplicateMetric
│   ├── InvalidMetricName
│   ├── InvalidLabelName
│   └── CardinalityExceeded
│
├── CollectionError
│   ├── CollectorFailed
│   ├── TimeoutExceeded
│   └── ResourceExhausted
│
├── SerializationError
│   ├── InvalidValue
│   ├── EncodingFailed
│   └── CompressionFailed
│
├── EndpointError
│   ├── BindFailed
│   ├── AuthenticationFailed
│   └── RequestTimeout
│
└── ConfigurationError
    ├── InvalidAddress
    ├── InvalidPath
    └── InvalidLabel
```

### 8.2 Error Handling Strategy

| Error Type | Handling | Impact |
|------------|----------|--------|
| `DuplicateMetric` | Log warning, skip | Metric not registered |
| `CardinalityExceeded` | Drop new labels | Limited visibility |
| `CollectorFailed` | Log error, exclude | Partial metrics |
| `TimeoutExceeded` | Return partial | Incomplete scrape |
| `CompressionFailed` | Return uncompressed | Higher bandwidth |

---

## 9. Scrape Performance

### 9.1 Performance Targets

| Metric | Target |
|--------|--------|
| Scrape latency (p50) | < 50ms |
| Scrape latency (p99) | < 200ms |
| Memory per scrape | < 10MB |
| Concurrent scrapes | 10+ |
| Metrics count | 10,000+ |

### 9.2 Optimization Strategies

| Strategy | Description |
|----------|-------------|
| Lazy collection | Collect metrics on-demand |
| Caching | Cache serialized output (short TTL) |
| Incremental updates | Track changes since last scrape |
| Parallel collection | Collect from multiple sources concurrently |
| Pre-serialization | Serialize stable metrics ahead of time |
| Gzip compression | Reduce response size |

### 9.3 Scrape Configuration Recommendations

| Parameter | Recommended Value |
|-----------|-------------------|
| `scrape_interval` | 15s - 60s |
| `scrape_timeout` | 10s |
| `honor_labels` | false |
| `honor_timestamps` | true |

---

## 10. Simulation and Replay

### 10.1 Mock Metrics Support

| Feature | Description |
|---------|-------------|
| Mock registry | In-memory metric storage |
| Synthetic data | Generate test metrics |
| Replay recorded | Load metrics from file |
| Snapshot comparison | Diff metric snapshots |

### 10.2 Testing Interfaces

```rust
/// Mock metrics registry for testing.
pub trait MockRegistry: MetricsRegistry {
    /// Get all recorded metrics.
    fn get_all_metrics(&self) -> HashMap<String, MetricValue>;

    /// Get specific metric value.
    fn get_metric(&self, name: &str, labels: &[(&str, &str)]) -> Option<MetricValue>;

    /// Assert metric exists with value.
    fn assert_counter(&self, name: &str, labels: &[(&str, &str)], expected: f64);

    /// Reset all recorded metrics.
    fn reset(&self);
}
```

---

## 11. Security Requirements

### 11.1 Endpoint Security

| Requirement | Implementation |
|-------------|----------------|
| Optional authentication | Bearer token, basic auth |
| TLS support | Via shared HTTP server |
| Rate limiting | Prevent scrape abuse |
| IP allowlist | Optional source filtering |

### 11.2 Metric Security

| Requirement | Implementation |
|-------------|----------------|
| No sensitive data in labels | Validation, blocklist |
| No PII exposure | Label sanitization |
| Cardinality limits | Prevent DoS via labels |

---

## 12. Enterprise Features

### 12.1 Multi-tenancy Support

| Feature | Description |
|---------|-------------|
| Tenant labels | Optional tenant dimension |
| Per-tenant limits | Cardinality per tenant |
| Tenant isolation | Separate registries |

### 12.2 High Availability

| Feature | Description |
|---------|-------------|
| Stateless design | No cross-instance state |
| Instance labels | Unique instance identification |
| Federation support | Standard Prometheus federation |

### 12.3 Exemplar Support

| Feature | Description |
|---------|-------------|
| Trace ID exemplars | Link metrics to traces |
| OpenMetrics format | Exemplar exposition |
| Sampling | Exemplar rate limiting |

---

## 13. Acceptance Criteria

### 13.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | `/metrics` endpoint returns 200 | Integration test |
| FC-2 | Prometheus text format valid | Format validation |
| FC-3 | Counter metrics increment | Unit test |
| FC-4 | Gauge metrics update | Unit test |
| FC-5 | Histogram buckets correct | Unit test |
| FC-6 | Labels applied correctly | Unit test |
| FC-7 | Gzip compression works | Integration test |
| FC-8 | LLM metrics recorded | Integration test |
| FC-9 | Agent metrics recorded | Integration test |
| FC-10 | Process metrics exposed | Integration test |
| FC-11 | Health endpoint works | Integration test |
| FC-12 | Cardinality limits enforced | Unit test |

### 13.2 Non-Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| NFC-1 | Scrape latency < 200ms (p99) | Load test |
| NFC-2 | No memory leaks | Profiling |
| NFC-3 | Concurrent scrapes supported | Load test |
| NFC-4 | Uses shared observability | Code review |
| NFC-5 | No panics under load | Stress test |
| NFC-6 | Test coverage > 80% | Coverage report |

### 13.3 Compatibility Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| CC-1 | Prometheus 2.x compatible | Integration test |
| CC-2 | OpenMetrics compatible | Format test |
| CC-3 | Grafana visualization | Manual test |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-14 | SPARC Generator | Initial Specification |

---

**End of Specification Phase**

*Next Phase: Pseudocode - Core algorithms for metric registration, collection, serialization, and endpoint handling.*
