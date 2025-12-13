# OpenTelemetry Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/opentelemetry`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements for the OpenTelemetry Integration Module, providing a production-ready interface for emitting, propagating, collecting, and correlating traces, metrics, and logs using OpenTelemetry standards within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The OpenTelemetry Integration Module provides a **thin adapter layer** that:
- Configures and initializes OpenTelemetry SDK components
- Emits traces, metrics, and logs in OTel format
- Propagates context across service boundaries
- Correlates LLM operations with distributed traces
- Exports telemetry to configurable backends
- Enables simulation/replay of telemetry data

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **SDK Setup** | TracerProvider, MeterProvider, LoggerProvider |
| **Trace Emission** | Spans, events, attributes, links |
| **Metric Recording** | Counters, gauges, histograms |
| **Log Correlation** | Trace context in logs |
| **Context Propagation** | W3C TraceContext, Baggage |
| **Export** | OTLP, Jaeger, Prometheus, stdout |
| **Sampling** | Head-based, tail-based awareness |
| **Resource Detection** | Service, host, container metadata |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| SDK initialization | Provider setup, configuration |
| Trace instrumentation | Manual spans, context injection |
| Metric instruments | Counter, gauge, histogram |
| Log bridging | Structured log emission |
| Context propagation | HTTP headers, gRPC metadata |
| OTLP export | gRPC and HTTP protocols |
| Batch processing | Span/metric batching |
| Resource attributes | Service, version, environment |
| LLM-specific spans | Model, tokens, latency |
| Agent correlation | Multi-agent trace linking |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Collector deployment | Infrastructure scope |
| Backend storage | Jaeger/Tempo/etc. scope |
| Dashboard creation | Grafana/UI scope |
| Alerting rules | Monitoring platform scope |
| Auto-instrumentation | Library-specific scope |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| OTel spec compliant | Interoperability |
| Zero-copy where possible | Performance |
| Async-first | Non-blocking |
| No panics | Reliability |
| Graceful degradation | Observability shouldn't break app |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | API key/token management |
| `shared/observability` | Logging, metrics abstractions |
| `shared/tracing` | Trace context abstractions |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `opentelemetry` | Core OTel API |
| `opentelemetry-otlp` | OTLP exporter |
| `opentelemetry-sdk` | SDK implementation |
| `opentelemetry-semantic-conventions` | Standard attributes |
| `tracing-opentelemetry` | tracing integration |
| `tokio` | Async runtime |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| Vendor-specific SDKs | Use OTel abstraction |
| Blocking exporters | Performance impact |

---

## 4. API Coverage

### 4.1 Tracing Operations

| Operation | OTel Concept | Description |
|-----------|--------------|-------------|
| `start_span` | Span | Create new span |
| `end_span` | Span | Complete span |
| `add_event` | Event | Record span event |
| `set_attribute` | Attribute | Set span attribute |
| `set_status` | Status | Set span status |
| `record_exception` | Exception | Record error |
| `add_link` | Link | Link to other spans |
| `inject_context` | Propagation | Inject into carrier |
| `extract_context` | Propagation | Extract from carrier |

### 4.2 Metric Operations

| Operation | Instrument | Description |
|-----------|------------|-------------|
| `create_counter` | Counter | Monotonic sum |
| `create_up_down_counter` | UpDownCounter | Non-monotonic sum |
| `create_histogram` | Histogram | Distribution |
| `create_gauge` | Gauge | Point-in-time value |
| `record` | All | Record measurement |
| `add` | Counter | Increment counter |

### 4.3 Log Operations

| Operation | Description |
|-----------|-------------|
| `emit_log` | Emit structured log |
| `with_trace_context` | Attach trace context |
| `set_severity` | Set log level |
| `add_attributes` | Add log attributes |

### 4.4 LLM-Specific Operations

| Operation | Description |
|-----------|-------------|
| `start_llm_span` | LLM call span with model attributes |
| `record_tokens` | Token usage metrics |
| `record_latency` | Model latency histogram |
| `trace_agent_step` | Agent execution step |
| `link_agent_spans` | Correlate multi-agent traces |

### 4.5 Semantic Conventions

```
LLM Semantic Conventions (emerging):
├── gen_ai.system           # e.g., "openai", "anthropic"
├── gen_ai.request.model    # Model identifier
├── gen_ai.request.max_tokens
├── gen_ai.response.model
├── gen_ai.usage.input_tokens
├── gen_ai.usage.output_tokens
├── gen_ai.response.finish_reason
└── gen_ai.prompt           # Optional, may be sensitive

Agent Conventions:
├── agent.name
├── agent.step
├── agent.tool_call
└── agent.parent_agent
```

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
OtelError
├── ConfigurationError
│   ├── InvalidEndpoint
│   ├── InvalidProtocol
│   ├── MissingProvider
│   └── InvalidSamplerConfig
│
├── ExportError
│   ├── ConnectionFailed
│   ├── ExportTimeout
│   ├── BatchDropped
│   ├── QueueFull
│   └── SerializationFailed
│
├── PropagationError
│   ├── InvalidTraceContext
│   ├── InvalidBaggage
│   └── HeaderParseError
│
├── InstrumentationError
│   ├── SpanNotFound
│   ├── InvalidAttribute
│   └── MeterNotInitialized
│
└── ShutdownError
    ├── FlushTimeout
    └── ProviderShutdownFailed
```

### 5.2 Error Handling Strategy

| Error Type | Handling | Retry |
|------------|----------|-------|
| `ConnectionFailed` | Log, continue | Yes |
| `ExportTimeout` | Log, drop batch | No |
| `QueueFull` | Drop oldest | No |
| `InvalidTraceContext` | Generate new | No |
| `FlushTimeout` | Force shutdown | No |

---

## 6. Resilience Requirements

### 6.1 Export Reliability

| Scenario | Behavior |
|----------|----------|
| Collector unavailable | Buffer locally, retry |
| Export timeout | Drop batch, continue |
| Queue overflow | Drop oldest spans |
| Shutdown signal | Flush with timeout |

### 6.2 Batch Configuration

| Parameter | Default |
|-----------|---------|
| Max batch size | 512 spans |
| Batch timeout | 5 seconds |
| Max queue size | 2048 spans |
| Export timeout | 30 seconds |

### 6.3 Sampling Defaults

| Sampler | Default Rate |
|---------|--------------|
| AlwaysOn | 100% (dev) |
| TraceIdRatio | 10% (prod) |
| ParentBased | Inherit decision |

---

## 7. Observability Requirements

### 7.1 Self-Telemetry

| Metric | Type | Description |
|--------|------|-------------|
| `otel_spans_created_total` | Counter | Spans created |
| `otel_spans_exported_total` | Counter | Spans exported |
| `otel_spans_dropped_total` | Counter | Spans dropped |
| `otel_export_latency_ms` | Histogram | Export duration |
| `otel_queue_size` | Gauge | Current queue depth |
| `otel_export_errors_total` | Counter | Export failures |

### 7.2 Debug Logging

| Level | When |
|-------|------|
| ERROR | Export failures, shutdown errors |
| WARN | Dropped spans, queue overflow |
| INFO | Provider init, shutdown |
| DEBUG | Span creation, export batches |
| TRACE | Individual attributes, full payloads |

---

## 8. Security Requirements

### 8.1 Authentication

| Method | Use Case |
|--------|----------|
| API Key header | OTLP endpoints |
| mTLS | Secure collectors |
| Bearer token | Cloud backends |

### 8.2 Data Security

| Requirement | Implementation |
|-------------|----------------|
| Sensitive attribute filtering | Configurable redaction |
| PII protection | Attribute sanitization |
| Prompt filtering | Optional prompt exclusion |
| Secure transport | TLS required for prod |

### 8.3 Attribute Redaction

```
Redactable Attributes:
├── gen_ai.prompt         # Full prompt text
├── gen_ai.completion     # Full response text
├── user.id               # User identifiers
├── http.request.header.* # Sensitive headers
└── db.statement          # SQL queries
```

---

## 9. Performance Requirements

### 9.1 Overhead Targets

| Metric | Target |
|--------|--------|
| Span creation | < 1μs |
| Attribute set | < 100ns |
| Context propagation | < 500ns |
| Memory per span | < 1KB |
| CPU overhead | < 1% |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Spans per second | 10,000+ |
| Metrics per second | 100,000+ |
| Export batch rate | 100 batches/sec |

---

## 10. Enterprise Features

### 10.1 Context Propagation

| Feature | Description |
|---------|-------------|
| W3C TraceContext | Standard trace headers |
| W3C Baggage | Cross-service context |
| Custom propagators | Vendor compatibility |
| Multi-protocol | HTTP, gRPC, messaging |

### 10.2 LLM Tracing

| Feature | Description |
|---------|-------------|
| Model spans | Per-model call traces |
| Token tracking | Input/output tokens |
| Latency breakdown | TTFB, streaming, total |
| Cost correlation | Token-based cost tracking |
| Chain tracing | Multi-step LLM chains |

### 10.3 Agent Observability

| Feature | Description |
|---------|-------------|
| Agent hierarchy | Parent-child agent links |
| Step tracing | Individual agent steps |
| Tool call spans | External tool invocations |
| Memory operations | RAG retrieval traces |
| Decision points | Agent reasoning traces |

### 10.4 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock exporter | In-memory span capture |
| Trace replay | Load recorded traces |
| Synthetic spans | Test data generation |
| Export verification | Validate span structure |

---

## 11. Acceptance Criteria

### 11.1 Functional

- [ ] SDK: Initialize TracerProvider
- [ ] SDK: Initialize MeterProvider
- [ ] SDK: Initialize LoggerProvider
- [ ] SDK: Configure OTLP exporter
- [ ] SDK: Configure sampling
- [ ] SDK: Set resource attributes
- [ ] Trace: Create span
- [ ] Trace: Add attributes
- [ ] Trace: Add events
- [ ] Trace: Set status
- [ ] Trace: Record exception
- [ ] Trace: Link spans
- [ ] Propagation: Inject HTTP headers
- [ ] Propagation: Extract HTTP headers
- [ ] Propagation: gRPC metadata
- [ ] Metric: Create counter
- [ ] Metric: Create histogram
- [ ] Metric: Record values
- [ ] Log: Emit with trace context
- [ ] LLM: Model call span
- [ ] LLM: Token metrics
- [ ] Agent: Step tracing
- [ ] Agent: Multi-agent correlation
- [ ] Export: OTLP gRPC
- [ ] Export: OTLP HTTP
- [ ] Export: Batch processing
- [ ] Shutdown: Graceful flush

### 11.2 Non-Functional

- [ ] Span creation < 1μs
- [ ] No memory leaks
- [ ] Graceful degradation
- [ ] No panics
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Core algorithms for SDK initialization, span management, context propagation, and export handling.
