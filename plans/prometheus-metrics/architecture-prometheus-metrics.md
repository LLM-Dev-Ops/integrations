# Architecture: Prometheus Metrics Endpoint Integration

## Overview

This document defines the architectural design for the Prometheus metrics endpoint integration, a thin adapter layer that exposes LLM and agent operational metrics via a Prometheus-compatible HTTP endpoint.

### Design Philosophy

1. **Thin Adapter Pattern**: Minimal translation layer between internal metrics and Prometheus format
2. **Zero-Copy Where Possible**: Avoid unnecessary allocations during scrape requests
3. **Cardinality-Aware**: Built-in safeguards against label explosion
4. **Pull-Based Model**: Metrics are computed/cached until scraped, not pushed

---

## C4 Model Diagrams

### Level 1: System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                        External Systems                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    scrape     ┌─────────────────────────────────┐ │
│  │  Prometheus  │──────────────▶│                                 │ │
│  │    Server    │◀──────────────│   LLM DevOps Platform           │ │
│  └──────────────┘   /metrics    │                                 │ │
│         │                       │  ┌───────────────────────────┐  │ │
│         ▼                       │  │  Prometheus Metrics       │  │ │
│  ┌──────────────┐               │  │  Endpoint Integration     │  │ │
│  │   Grafana    │               │  └───────────────────────────┘  │ │
│  │  Dashboards  │               │                                 │ │
│  └──────────────┘               └─────────────────────────────────┘ │
│                                                                      │
│  ┌──────────────┐                                                   │
│  │  AlertManager│                                                   │
│  └──────────────┘                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Level 2: Container Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     LLM DevOps Platform                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐      ┌─────────────────┐                       │
│  │   LLM Engine    │      │  Agent Runtime  │                       │
│  │                 │      │                 │                       │
│  │  - Requests     │      │  - Executions   │                       │
│  │  - Tokens       │      │  - Tool Calls   │                       │
│  │  - Latencies    │      │  - Steps        │                       │
│  └────────┬────────┘      └────────┬────────┘                       │
│           │                        │                                 │
│           │    emit metrics        │                                 │
│           ▼                        ▼                                 │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              Prometheus Metrics Integration                      ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  ││
│  │  │  Metrics    │  │  Collector  │  │     HTTP Endpoint       │  ││
│  │  │  Registry   │  │  Adapters   │  │     Handler             │  ││
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────┘│
│           │                                                          │
│           │ uses                                                     │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Shared Infrastructure                         ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ ││
│  │  │   Auth   │  │  Logging │  │  Tracing │  │  Config Manager  │ ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Level 3: Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                Prometheus Metrics Integration                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      HTTP Layer                                  ││
│  │  ┌─────────────────┐  ┌─────────────┐  ┌─────────────────────┐  ││
│  │  │ /metrics Handler│  │ /health     │  │ /ready              │  ││
│  │  │                 │  │ Handler     │  │ Handler             │  ││
│  │  │ - Content-Type  │  └─────────────┘  └─────────────────────┘  ││
│  │  │ - Compression   │                                            ││
│  │  │ - Caching       │                                            ││
│  │  └────────┬────────┘                                            ││
│  └───────────┼─────────────────────────────────────────────────────┘│
│              │                                                       │
│              ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Serialization Layer                           ││
│  │  ┌─────────────────────────┐  ┌───────────────────────────────┐ ││
│  │  │ Prometheus Text Format  │  │ OpenMetrics Format            │ ││
│  │  │ Serializer (v0.0.4)     │  │ Serializer                    │ ││
│  │  └─────────────────────────┘  └───────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────┘│
│              │                                                       │
│              ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Metrics Core                                  ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  ││
│  │  │  Registry   │  │  Collector  │  │  Label Manager          │  ││
│  │  │             │◀─┤  Manager    │  │                         │  ││
│  │  │ - Metrics   │  │             │  │  - Validation           │  ││
│  │  │ - Families  │  │ - LLM       │  │  - Sanitization         │  ││
│  │  │ - Cardinality│  │ - Agent    │  │  - Cardinality Limits   │  ││
│  │  └─────────────┘  │ - Process   │  └─────────────────────────┘  ││
│  │                   │ - Runtime   │                               ││
│  │                   └─────────────┘                               ││
│  └─────────────────────────────────────────────────────────────────┘│
│              │                                                       │
│              ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Metric Types                                  ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐   ││
│  │  │ Counter  │  │  Gauge   │  │Histogram │  │   Summary      │   ││
│  │  │ CounterVec│  │ GaugeVec │  │HistogramVec │  (future)     │   ││
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Metric Collection Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  LLM Request │     │ Agent Step   │     │ Tool Call    │
│  Completed   │     │ Executed     │     │ Finished     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                    Collector Adapters                     │
│  ┌────────────────┐  ┌────────────────┐                  │
│  │  LLM Collector │  │ Agent Collector│                  │
│  │                │  │                │                  │
│  │ inc(counter)   │  │ inc(counter)   │                  │
│  │ observe(hist)  │  │ set(gauge)     │                  │
│  └───────┬────────┘  └───────┬────────┘                  │
└──────────┼───────────────────┼───────────────────────────┘
           │                   │
           ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│                     Metrics Registry                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ llmdevops_llm_requests_total{model,status}          │ │
│  │ llmdevops_llm_tokens_total{model,type}              │ │
│  │ llmdevops_llm_request_duration_seconds{model}       │ │
│  │ llmdevops_agent_executions_total{agent,status}      │ │
│  │ llmdevops_agent_steps_total{agent,step_type}        │ │
│  │ llmdevops_agent_tool_calls_total{agent,tool}        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Scrape Request Flow

```
┌──────────────┐
│  Prometheus  │
│   Server     │
└──────┬───────┘
       │ GET /metrics
       │ Accept: text/plain
       ▼
┌──────────────────────────────────────────────────────────┐
│                   HTTP Endpoint Handler                   │
│                                                           │
│  1. Check cache validity (TTL-based)                     │
│  2. If stale: collect & serialize metrics                │
│  3. Apply gzip compression if accepted                   │
│  4. Return response with Content-Type header             │
│                                                           │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│                    Serialization                          │
│                                                           │
│  For each metric family:                                 │
│    # HELP metric_name Description                        │
│    # TYPE metric_name counter|gauge|histogram            │
│    metric_name{label="value"} 123.45                     │
│                                                           │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│                    Response                               │
│                                                           │
│  HTTP/1.1 200 OK                                         │
│  Content-Type: text/plain; version=0.0.4; charset=utf-8  │
│  Content-Encoding: gzip                                  │
│                                                           │
│  [compressed prometheus text format body]                │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Module Structure

### Rust Implementation

```
src/integrations/prometheus_metrics/
├── mod.rs                    # Module exports
├── lib.rs                    # Public API surface
│
├── registry/
│   ├── mod.rs
│   ├── registry.rs           # MetricsRegistry implementation
│   ├── family.rs             # MetricFamily container
│   └── cardinality.rs        # Cardinality tracking & limits
│
├── metrics/
│   ├── mod.rs
│   ├── counter.rs            # Counter, CounterVec
│   ├── gauge.rs              # Gauge, GaugeVec
│   ├── histogram.rs          # Histogram, HistogramVec
│   └── traits.rs             # Metric trait definitions
│
├── labels/
│   ├── mod.rs
│   ├── label_set.rs          # Label storage
│   ├── validation.rs         # Name/value validation
│   └── sanitization.rs       # Label name sanitization
│
├── serialization/
│   ├── mod.rs
│   ├── prometheus_text.rs    # v0.0.4 text format
│   └── openmetrics.rs        # OpenMetrics format
│
├── collectors/
│   ├── mod.rs
│   ├── llm.rs                # LLM metrics collector
│   ├── agent.rs              # Agent metrics collector
│   ├── process.rs            # Process metrics (RSS, FDs)
│   └── runtime.rs            # Runtime metrics (GC, threads)
│
├── http/
│   ├── mod.rs
│   ├── handler.rs            # /metrics endpoint handler
│   ├── health.rs             # /health, /ready handlers
│   └── compression.rs        # Gzip compression
│
└── testing/
    ├── mod.rs
    ├── mock_registry.rs      # Mock registry for tests
    └── assertions.rs         # Test helper functions
```

### TypeScript Implementation

```
src/integrations/prometheus-metrics/
├── index.ts                  # Public exports
│
├── registry/
│   ├── index.ts
│   ├── registry.ts           # MetricsRegistry class
│   ├── family.ts             # MetricFamily class
│   └── cardinality.ts        # Cardinality tracking
│
├── metrics/
│   ├── index.ts
│   ├── counter.ts            # Counter, CounterVec
│   ├── gauge.ts              # Gauge, GaugeVec
│   ├── histogram.ts          # Histogram, HistogramVec
│   └── types.ts              # Metric interfaces
│
├── labels/
│   ├── index.ts
│   ├── label-set.ts          # Label storage
│   ├── validation.ts         # Validation functions
│   └── sanitization.ts       # Sanitization functions
│
├── serialization/
│   ├── index.ts
│   ├── prometheus-text.ts    # Text format serializer
│   └── openmetrics.ts        # OpenMetrics serializer
│
├── collectors/
│   ├── index.ts
│   ├── llm-collector.ts      # LLM metrics
│   ├── agent-collector.ts    # Agent metrics
│   └── default-collectors.ts # Process/runtime
│
├── http/
│   ├── index.ts
│   ├── handler.ts            # Express/Fastify handler
│   └── middleware.ts         # Middleware factory
│
└── testing/
    ├── index.ts
    ├── mock-registry.ts      # Mock for testing
    └── matchers.ts           # Jest custom matchers
```

---

## Integration Patterns

### With Shared Authentication

```
┌────────────────────┐     ┌────────────────────┐
│  Prometheus Scrape │     │  Shared Auth       │
│  Request           │────▶│  Module            │
│                    │     │                    │
│  Authorization:    │     │  - Validate token  │
│  Bearer <token>    │     │  - Check scope     │
└────────────────────┘     │  - Rate limit      │
                           └─────────┬──────────┘
                                     │ authorized
                                     ▼
                           ┌────────────────────┐
                           │  /metrics Handler  │
                           └────────────────────┘
```

### With Shared Tracing

```rust
// Tracing integration for scrape requests
impl MetricsHandler {
    async fn handle(&self, req: Request) -> Response {
        let span = shared_tracing::span!("prometheus_scrape");
        let _guard = span.enter();

        span.set_attribute("scrape.format", self.detect_format(&req));

        let metrics = self.registry.collect();
        let body = self.serializer.serialize(metrics);

        span.set_attribute("scrape.metrics_count", metrics.len());
        span.set_attribute("scrape.body_bytes", body.len());

        Response::new(body)
    }
}
```

### With Configuration Manager

```yaml
# Configuration schema integration
prometheus_metrics:
  enabled: true
  endpoint:
    path: "/metrics"
    port: 9090
  cache:
    enabled: true
    ttl_ms: 1000
  cardinality:
    max_per_metric: 1000
    total_limit: 10000
  compression:
    enabled: true
    min_size_bytes: 1024
  collectors:
    llm: true
    agent: true
    process: true
    runtime: true
```

---

## Deployment Patterns

### Sidecar Pattern

```
┌─────────────────────────────────────────────────────────┐
│                         Pod                              │
│  ┌─────────────────────┐  ┌─────────────────────────┐   │
│  │  Main Application   │  │  Metrics Sidecar        │   │
│  │                     │  │                         │   │
│  │  - LLM Engine       │  │  - /metrics :9090       │   │
│  │  - Agent Runtime    │──│  - Collects via IPC     │   │
│  │                     │  │                         │   │
│  └─────────────────────┘  └─────────────────────────┘   │
│                                     │                    │
└─────────────────────────────────────┼────────────────────┘
                                      │ :9090
                                      ▼
                           ┌────────────────────┐
                           │     Prometheus     │
                           └────────────────────┘
```

### Embedded Pattern

```
┌─────────────────────────────────────────────────────────┐
│                    Application                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │                Main Process                      │    │
│  │                                                  │    │
│  │  ┌───────────────┐  ┌───────────────────────┐   │    │
│  │  │ LLM Engine    │  │ Prometheus Integration │   │    │
│  │  │               │──│                        │   │    │
│  │  │ Agent Runtime │  │ Embedded /metrics      │   │    │
│  │  └───────────────┘  └───────────────────────┘   │    │
│  │                              │ :9090            │    │
│  └──────────────────────────────┼──────────────────┘    │
│                                 │                        │
└─────────────────────────────────┼────────────────────────┘
                                  ▼
                       ┌────────────────────┐
                       │     Prometheus     │
                       └────────────────────┘
```

---

## Testing Architecture

### Test Pyramid

```
                    ┌─────────────────┐
                    │   E2E Tests     │  Prometheus scrape simulation
                    │   (few)         │  Full format validation
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Integration     │  Registry + Serialization
                    │ Tests           │  Collector + Registry
                    │ (moderate)      │  HTTP Handler + Auth
                    └────────┬────────┘
                             │
         ┌───────────────────▼───────────────────┐
         │           Unit Tests (many)           │
         │                                       │
         │  - Counter increment/add              │
         │  - Gauge set/inc/dec                  │
         │  - Histogram observe/buckets          │
         │  - Label validation                   │
         │  - Label sanitization                 │
         │  - Serialization format               │
         │  - Cardinality limits                 │
         └───────────────────────────────────────┘
```

### Mock Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    Test Scope                            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Component Under Test                 │   │
│  │                                                   │   │
│  │  Real: MetricsRegistry, Collectors, Serializer   │   │
│  │                                                   │   │
│  └───────────────────────┬──────────────────────────┘   │
│                          │                               │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│         Mock Boundary    │                               │
│  ┌───────────────────────▼──────────────────────────┐   │
│  │                   Mocked                          │   │
│  │                                                   │   │
│  │  - Clock (for timestamp tests)                   │   │
│  │  - Config (for limit tests)                      │   │
│  │  - HTTP transport (for handler tests)            │   │
│  │                                                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Architecture Decision Records

### ADR-001: Cardinality Limits as First-Class Feature

**Context**: Prometheus cardinality explosion is a common production issue.

**Decision**: Implement cardinality tracking and configurable limits at the registry level. Reject new label combinations when limits are exceeded, logging warnings.

**Consequences**:
- Prevents OOM in Prometheus server
- May silently drop metrics if limits too low
- Requires tuning per deployment

### ADR-002: Cache Metrics Output

**Context**: Serialization can be expensive with many metrics.

**Decision**: Cache serialized output with configurable TTL (default 1s). Invalidate on explicit flush.

**Consequences**:
- Reduces CPU usage under high scrape frequency
- Metrics may be slightly stale (acceptable for monitoring)
- Memory overhead for cache storage

### ADR-003: Support Both Prometheus and OpenMetrics Formats

**Context**: OpenMetrics is the CNCF standard, but Prometheus text format has wider compatibility.

**Decision**: Support both formats, selected via Accept header content negotiation.

**Consequences**:
- Maximum compatibility
- Slightly more complex serialization code
- Future-proof for OpenMetrics adoption

### ADR-004: Thin Adapter, No Time Series Storage

**Context**: The integration could store historical metrics internally.

**Decision**: Act purely as an exposition endpoint. All storage/querying is Prometheus's responsibility.

**Consequences**:
- Simpler implementation
- Clear separation of concerns
- Requires external Prometheus for any historical queries

---

## Performance Considerations

| Aspect | Target | Implementation |
|--------|--------|----------------|
| Scrape latency | < 100ms p99 | Cache serialized output |
| Memory per metric | < 200 bytes | Compact label storage |
| Cardinality check | O(1) | Hash-based tracking |
| Serialization | O(n) metrics | Streaming serializer |
| Compression ratio | 5-10x | Gzip level 6 |

---

## Security Considerations

1. **Authentication**: Delegate to shared auth module; support bearer tokens
2. **Authorization**: Require `metrics:read` scope for /metrics access
3. **Rate Limiting**: Apply shared rate limiter to scrape endpoint
4. **Label Sanitization**: Prevent injection via label values
5. **No Sensitive Data**: Metrics should never contain PII or secrets in labels
