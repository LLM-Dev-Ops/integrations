# Datadog APM Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/datadog-apm`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements for the Datadog APM Integration Module, providing a production-ready interface for emitting and correlating application performance traces, metrics, and service dependencies to Datadog APM within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification -> Pseudocode -> Architecture -> Refinement -> Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

### 1.3 Audience

- Implementation developers (TypeScript primary)
- DevOps engineers configuring Datadog agents
- SRE teams designing observability infrastructure
- Architects reviewing APM integration patterns

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Datadog APM Integration Module provides a **thin adapter layer** that:
- Emits distributed traces to Datadog APM
- Correlates LLM operations with service dependencies
- Records custom metrics via DogStatsD protocol
- Forwards correlated logs with trace context
- Enables simulation/replay of APM telemetry for testing

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Trace Emission** | Spans, events, resource attributes to Datadog |
| **Metric Recording** | Counters, gauges, histograms, distributions |
| **Log Correlation** | Inject trace IDs into logs |
| **Context Propagation** | Datadog + W3C TraceContext headers |
| **Service Map** | Emit service dependency metadata |
| **Error Tracking** | Capture exceptions with stack traces |
| **LLM Instrumentation** | Model, tokens, latency attributes |
| **Agent Tracing** | Multi-step agent execution correlation |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Trace client | Span creation, context management |
| Metric client | DogStatsD protocol emission |
| Log injection | Trace context correlation |
| Context propagation | HTTP headers (Datadog + W3C) |
| Error tracking | Exception capture and reporting |
| LLM-specific spans | Model, tokens, latency attributes |
| Agent correlation | Multi-agent trace linking |
| Service catalog | Service metadata emission |
| Mock exporter | Testing without Datadog Agent |
| TypeScript implementation | Primary language |

#### Out of Scope

| Item | Reason |
|------|--------|
| Datadog Agent deployment | Infrastructure scope |
| APM backend configuration | Datadog console scope |
| Dashboard creation | Datadog UI scope |
| Alert/monitor rules | Datadog monitor scope |
| RUM integration | Frontend scope |
| Profiling | Separate integration |
| CI Visibility | Separate integration |
| Security signals | ASM scope |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Thin adapter only | No duplicate trace/metric logic |
| Datadog conventions | Standard tag/attribute naming |
| Unified service tagging | `env`, `service`, `version` |
| Async-safe | Non-blocking telemetry emission |
| No panics | Reliability under load |
| Graceful degradation | Missing agent shouldn't break app |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/observability` | Metric/logging abstractions |
| `shared/tracing` | Trace context abstractions |
| `shared/credentials` | API key management |
| `shared/authentication` | Auth patterns |

### 3.2 External Dependencies (TypeScript)

| Package | Purpose |
|---------|---------|
| `dd-trace` | Datadog APM tracer |
| `hot-shots` | DogStatsD client |
| Native HTTP | Trace context injection |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| Full dd-trace auto-instrumentation | Use manual spans only |
| Direct APM API calls | Use agent protocol |
| Vendor lock-in patterns | Maintain portability |

---

## 4. API Coverage

### 4.1 Tracing Operations

| Operation | Description |
|-----------|-------------|
| `startSpan` | Create new span with parent context |
| `finishSpan` | Complete span with duration |
| `setTag` | Set span tag/attribute |
| `setError` | Mark span as error with details |
| `addEvent` | Add span event/annotation |
| `injectContext` | Inject trace context into carrier |
| `extractContext` | Extract trace context from carrier |
| `getCurrentSpan` | Get active span from context |

### 4.2 Metric Operations

| Operation | Description |
|-----------|-------------|
| `increment` | Increment counter |
| `decrement` | Decrement counter |
| `gauge` | Set gauge value |
| `histogram` | Record histogram value |
| `distribution` | Record distribution value |
| `timing` | Record timing value |
| `set` | Record set cardinality |

### 4.3 Log Correlation

| Operation | Description |
|-----------|-------------|
| `injectTraceContext` | Add trace IDs to log context |
| `getCorrelationIds` | Get dd.trace_id, dd.span_id |

### 4.4 LLM-Specific Operations

| Operation | Description |
|-----------|-------------|
| `startLLMSpan` | LLM call span with model attributes |
| `recordTokenUsage` | Token count metrics |
| `recordLatency` | Model response latency |
| `traceAgentStep` | Agent execution step |
| `linkAgentSpans` | Correlate multi-agent traces |

---

## 5. Tag Conventions

### 5.1 Unified Service Tagging

Required on all telemetry:

```
env         # Environment (prod, staging, dev)
service     # Service name
version     # Service version
```

### 5.2 Datadog Reserved Tags

| Tag | Description |
|-----|-------------|
| `dd.trace_id` | Datadog trace identifier |
| `dd.span_id` | Datadog span identifier |
| `dd.service` | Service name |
| `dd.env` | Environment |
| `dd.version` | Service version |

### 5.3 LLM Semantic Tags

| Tag | Description |
|-----|-------------|
| `llm.provider` | Provider name (anthropic, openai) |
| `llm.model` | Model identifier |
| `llm.request_type` | chat, completion, embed |
| `llm.input_tokens` | Input token count |
| `llm.output_tokens` | Output token count |
| `llm.total_tokens` | Total token count |
| `llm.finish_reason` | Completion reason |
| `llm.streaming` | Streaming enabled |

### 5.4 Agent Semantic Tags

| Tag | Description |
|-----|-------------|
| `agent.name` | Agent identifier |
| `agent.type` | Agent category |
| `agent.step` | Current step number |
| `agent.tool` | Tool being invoked |
| `agent.parent` | Parent agent ID |

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
DatadogAPMError
+-- ConfigurationError
|   +-- MissingServiceName
|   +-- InvalidAgentHost
|   +-- InvalidSampleRate
|
+-- ConnectionError
|   +-- AgentUnreachable
|   +-- AgentTimeout
|   +-- SocketError
|
+-- TracingError
|   +-- SpanNotFound
|   +-- InvalidTraceContext
|   +-- PropagationFailed
|
+-- MetricError
|   +-- InvalidMetricName
|   +-- TagLimitExceeded
|   +-- BufferOverflow
|
+-- ExportError
    +-- FlushTimeout
    +-- SerializationFailed
```

### 6.2 Error Handling Strategy

| Error Type | Handling | Retry |
|------------|----------|-------|
| `AgentUnreachable` | Log, continue | Yes |
| `AgentTimeout` | Log, drop | No |
| `InvalidTraceContext` | Generate new | No |
| `BufferOverflow` | Drop oldest | No |
| `FlushTimeout` | Force continue | No |

---

## 7. Resilience Requirements

### 7.1 Connection Handling

| Scenario | Behavior |
|----------|----------|
| Agent unavailable | Buffer locally, retry |
| Agent slow | Timeout, drop telemetry |
| Network partition | Graceful degradation |
| Shutdown signal | Flush with timeout |

### 7.2 Buffer Configuration

| Parameter | Default |
|-----------|---------|
| Max trace buffer | 1000 spans |
| Max metric buffer | 8192 metrics |
| Flush interval | 2 seconds |
| Connection timeout | 5 seconds |
| Flush timeout | 10 seconds |

### 7.3 Sampling Configuration

| Mode | Default |
|------|---------|
| Trace sample rate | 100% (dev) / 10% (prod) |
| Priority sampling | Enabled |
| Error sampling | Always keep |
| LLM span sampling | Always keep |

---

## 8. Observability Requirements

### 8.1 Self-Telemetry

| Metric | Type | Description |
|--------|------|-------------|
| `datadog.spans_created` | Counter | Spans created |
| `datadog.spans_exported` | Counter | Spans sent to agent |
| `datadog.spans_dropped` | Counter | Spans dropped |
| `datadog.metrics_sent` | Counter | Metrics emitted |
| `datadog.export_latency` | Histogram | Export duration |
| `datadog.buffer_size` | Gauge | Current buffer depth |
| `datadog.agent_errors` | Counter | Agent comm failures |

### 8.2 Debug Logging

| Level | When |
|-------|------|
| ERROR | Agent connection failures |
| WARN | Dropped spans, buffer overflow |
| INFO | Init, shutdown, flush |
| DEBUG | Span creation, metric emit |
| TRACE | Full payload details |

---

## 9. Security Requirements

### 9.1 Authentication

| Method | Use Case |
|--------|----------|
| API Key | Datadog API authentication |
| Agent socket | Local agent communication |
| Environment vars | Standard DD_* configuration |

### 9.2 Data Security

| Requirement | Implementation |
|-------------|----------------|
| PII filtering | Tag redaction rules |
| Sensitive data | Exclude prompt content by default |
| API keys | Never in span attributes |
| Request bodies | Optional, off by default |

### 9.3 Compliance

| Standard | Support |
|----------|---------|
| GDPR | PII redaction support |
| SOC2 | Audit logging |
| HIPAA | Data filtering |

---

## 10. Performance Requirements

### 10.1 Latency Budgets

| Operation | Max Latency |
|-----------|-------------|
| Span creation | < 100 us |
| Span finish | < 100 us |
| Metric emit | < 50 us |
| Context inject | < 50 us |
| Context extract | < 50 us |
| Flush batch | < 100 ms |

### 10.2 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory overhead | < 50 MB |
| CPU overhead | < 2% |
| Network (idle) | < 1 KB/s |
| Network (active) | < 100 KB/s |

### 10.3 Throughput

| Metric | Capacity |
|--------|----------|
| Spans/second | 10,000+ |
| Metrics/second | 50,000+ |
| Concurrent traces | 1,000+ |

---

## 11. Context Propagation

### 11.1 Header Formats

Datadog headers (primary):
```
x-datadog-trace-id
x-datadog-parent-id
x-datadog-sampling-priority
x-datadog-origin
x-datadog-tags
```

W3C TraceContext (fallback):
```
traceparent
tracestate
```

### 11.2 Propagation Rules

| Scenario | Behavior |
|----------|----------|
| Inbound Datadog | Use Datadog context |
| Inbound W3C only | Convert to Datadog |
| Outbound | Emit both formats |
| No context | Generate new trace |

---

## 12. Enterprise Features

### 12.1 Service Catalog

| Capability | Support |
|------------|---------|
| Service metadata | Name, team, tier |
| Dependencies | Upstream/downstream |
| Documentation links | Runbook URLs |
| Contacts | Team ownership |

### 12.2 Deployment Tracking

| Capability | Support |
|------------|---------|
| Version tracking | Automatic from tags |
| Deployment events | Manual emission |
| Rollback correlation | Trace linking |

---

## 13. Testing Requirements

### 13.1 Mock Exporter

Provide `MockDatadogExporter` for testing:
- Captures all spans and metrics
- Validates tag correctness
- Supports assertion helpers
- No network dependency

### 13.2 Simulation Mode

| Feature | Support |
|---------|---------|
| Replay traces | Load from fixtures |
| Generate load | Synthetic telemetry |
| Error injection | Simulate failures |

---

## 14. Acceptance Criteria

### 14.1 Functional

- [ ] Traces appear in Datadog APM
- [ ] Metrics visible in Datadog Metrics Explorer
- [ ] Logs correlated with traces
- [ ] Service map shows dependencies
- [ ] LLM spans have correct attributes
- [ ] Agent steps are correlated
- [ ] Errors tracked with stack traces

### 14.2 Non-Functional

- [ ] No app degradation if agent unavailable
- [ ] Latency within budgets
- [ ] Memory within limits
- [ ] Mock exporter enables testing
- [ ] All shared abstractions used

### 14.3 Documentation

- [ ] API reference complete
- [ ] Configuration guide
- [ ] Troubleshooting guide
- [ ] Example code provided
