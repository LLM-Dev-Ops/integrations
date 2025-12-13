# OpenTelemetry Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/opentelemetry`

---

## 1. Architecture Overview

### 1.1 Design Philosophy

The OpenTelemetry Integration Module follows a **layered architecture** that separates concerns and enables flexibility in telemetry collection, processing, and export:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ LLM Calls   │  │ Agent Steps │  │ Tool Calls  │  │ User Ops    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
└─────────┼────────────────┼────────────────┼────────────────┼────────┘
          │                │                │                │
┌─────────▼────────────────▼────────────────▼────────────────▼────────┐
│                     Instrumentation Layer                            │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    LLM Span Builder / Agent Tracer              ││
│  │              Semantic Conventions / Attribute Redaction         ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                         SDK Layer                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   Tracer    │  │    Meter    │  │   Logger    │                  │
│  │  Provider   │  │  Provider   │  │  Provider   │                  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
│         │                │                │                          │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐                  │
│  │   Sampler   │  │  Aggregator │  │   Bridge    │                  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
└─────────┼────────────────┼────────────────┼─────────────────────────┘
          │                │                │
┌─────────▼────────────────▼────────────────▼─────────────────────────┐
│                      Processing Layer                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              Batch Processor / Span Processor                   ││
│  │             Queue Management / Attribute Sanitization           ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                        Export Layer                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ OTLP gRPC   │  │ OTLP HTTP   │  │   Stdout    │  │   Mock      │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
└─────────┼────────────────┼────────────────┼────────────────┼────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Collector│    │ Collector│    │ Console  │    │  Tests   │
    │ (gRPC)   │    │ (HTTP)   │    │          │    │          │
    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### 1.2 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| SDK-based approach | Full control over telemetry pipeline |
| Batch processing | Efficient resource utilization |
| Async exporters | Non-blocking telemetry emission |
| Provider pattern | Clean separation of concerns |
| Attribute redaction | Security and privacy compliance |
| Context propagation | Distributed trace correlation |

---

## 2. Component Architecture

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TelemetryProvider                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - config: TelemetryConfig                                       ││
│  │ - tracer_provider: TracerProvider                               ││
│  │ - meter_provider: MeterProvider                                 ││
│  │ - logger_provider: LoggerProvider                               ││
│  │ - resource: Resource                                            ││
│  │ - shutdown_handle: ShutdownHandle                               ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Methods:                                                            │
│  ├── new(config) -> Result<Self>                                    │
│  ├── tracer(name) -> Tracer                                         │
│  ├── meter(name) -> Meter                                           │
│  ├── logger(name) -> Logger                                         │
│  ├── propagator() -> ContextPropagator                              │
│  └── shutdown() -> Result<()>                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     TracerProvider                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - sampler: Sampler                                              ││
│  │ - span_processor: BatchSpanProcessor                            ││
│  │ - resource: Resource                                            ││
│  │ - id_generator: IdGenerator                                     ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Pipeline:                                                           │
│  Span Created → Sampler → Processor → Exporter                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      MeterProvider                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - readers: Vec<MetricReader>                                    ││
│  │ - views: Vec<View>                                              ││
│  │ - resource: Resource                                            ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Pipeline:                                                           │
│  Measurement → Aggregation → Reader → Exporter                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Instrumentation Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                      LLMSpanBuilder                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Wraps span creation with LLM-specific attributes                ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Attributes Added:                                                   │
│  ├── gen_ai.system (anthropic, openai, etc.)                        │
│  ├── gen_ai.request.model                                           │
│  ├── gen_ai.request.max_tokens                                      │
│  ├── gen_ai.request.temperature                                     │
│  ├── gen_ai.usage.input_tokens                                      │
│  ├── gen_ai.usage.output_tokens                                     │
│  ├── gen_ai.response.finish_reason                                  │
│  └── gen_ai.prompt (if not redacted)                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       AgentTracer                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Manages hierarchical agent tracing and correlation              ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Trace Structure:                                                    │
│  agent.run (root)                                                    │
│  ├── agent.step[0]                                                  │
│  │   ├── gen_ai.chat (LLM call)                                     │
│  │   └── agent.tool_call (tool invocation)                          │
│  ├── agent.step[1]                                                  │
│  │   └── agent.memory_retrieval (RAG)                               │
│  └── agent.step[2]                                                  │
│      └── gen_ai.chat (final response)                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Context Propagation Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Context Propagation Flow                           │
└─────────────────────────────────────────────────────────────────────┘

   Service A                          Service B
┌─────────────┐                    ┌─────────────┐
│   Span A    │                    │   Span B    │
│             │                    │             │
│ trace_id: X │                    │ trace_id: X │
│ span_id: 1  │                    │ span_id: 2  │
│             │                    │ parent: 1   │
└──────┬──────┘                    └──────▲──────┘
       │                                  │
       │  HTTP Request                    │
       │  ┌────────────────────────────┐  │
       └─▶│ traceparent: 00-X-1-01     │──┘
          │ tracestate: vendor=info    │
          │ baggage: user_id=123       │
          └────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Propagator Components                             │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ W3C TraceContext│  │   W3C Baggage   │  │ Composite       │      │
│  │                 │  │                 │  │ Propagator      │      │
│  │ - traceparent   │  │ - key=value     │  │                 │      │
│  │ - tracestate    │  │ - metadata      │  │ Combines both   │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow Architecture

### 3.1 Trace Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Trace Data Flow                                 │
└─────────────────────────────────────────────────────────────────────┘

  1. Span Creation           2. Sampling              3. Processing
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ SpanBuilder   │──────▶│   Sampler     │──────▶│ SpanProcessor │
│               │       │               │       │               │
│ - name        │       │ - AlwaysOn    │       │ - Validate    │
│ - kind        │       │ - AlwaysOff   │       │ - Enrich      │
│ - parent      │       │ - TraceIdRatio│       │ - Queue       │
│ - attributes  │       │ - ParentBased │       │               │
└───────────────┘       └───────────────┘       └───────┬───────┘
                                                        │
  4. Batching               5. Sanitization            │
┌───────────────┐       ┌───────────────┐             │
│ BatchProcessor│◀──────│ AttributeSan. │◀────────────┘
│               │       │               │
│ - batch_size  │       │ - Redact PII  │
│ - timeout     │       │ - Filter keys │
│ - queue_size  │       │ - Truncate    │
└───────┬───────┘       └───────────────┘
        │
  6. Export                  7. Backend
┌───────▼───────┐       ┌───────────────┐
│ OTLP Exporter │──────▶│   Collector   │
│               │       │               │
│ - gRPC/HTTP   │       │ - Jaeger      │
│ - Compression │       │ - Tempo       │
│ - Retry       │       │ - Zipkin      │
└───────────────┘       └───────────────┘
```

### 3.2 Metrics Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Metrics Data Flow                                │
└─────────────────────────────────────────────────────────────────────┘

  1. Recording              2. Aggregation           3. Reading
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ Instrument    │──────▶│  Aggregator   │──────▶│ MetricReader  │
│               │       │               │       │               │
│ - Counter     │       │ - Sum         │       │ - Periodic    │
│ - Histogram   │       │ - LastValue   │       │ - Manual      │
│ - Gauge       │       │ - Histogram   │       │               │
│ - UpDownCtr   │       │               │       │               │
└───────────────┘       └───────────────┘       └───────┬───────┘
                                                        │
  4. Export                  5. Backend                 │
┌───────────────┐       ┌───────────────┐              │
│ MetricExporter│◀──────┴───────────────┘              │
│               │                                       │
│ - OTLP        │◀──────────────────────────────────────┘
│ - Prometheus  │
│ - Stdout      │
└───────────────┘
```

### 3.3 Log Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Log Data Flow                                  │
└─────────────────────────────────────────────────────────────────────┘

  1. Log Record             2. Bridge                3. Export
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  Application  │──────▶│  LogBridge    │──────▶│  LogExporter  │
│    Logger     │       │               │       │               │
│               │       │ - Correlate   │       │ - OTLP        │
│ - log!()      │       │   trace ctx   │       │ - Stdout      │
│ - tracing     │       │ - Add attrs   │       │               │
└───────────────┘       └───────────────┘       └───────────────┘
                               │
                        Enrichment:
                        ├── trace_id
                        ├── span_id
                        ├── service.name
                        └── timestamp
```

---

## 4. Integration Architecture

### 4.1 Module Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Platform Integration                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     LLM Dev Ops Platform                             │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ Anthropic    │  │   OpenAI     │  │  Cohere      │               │
│  │ Integration  │  │ Integration  │  │ Integration  │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                        │
│         └────────────┬────┴────────────────┘                        │
│                      ▼                                               │
│         ┌────────────────────────┐                                  │
│         │  OpenTelemetry Module  │                                  │
│         │                        │                                  │
│         │  - Trace LLM calls     │                                  │
│         │  - Record token usage  │                                  │
│         │  - Propagate context   │                                  │
│         └───────────┬────────────┘                                  │
│                     │                                                │
│  ┌──────────────────┼──────────────────┐                            │
│  │                  │                  │                            │
│  ▼                  ▼                  ▼                            │
│ ┌────────┐    ┌──────────┐    ┌────────────┐                        │
│ │shared/ │    │ shared/  │    │  shared/   │                        │
│ │logging │    │ metrics  │    │ tracing    │                        │
│ └────────┘    └──────────┘    └────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Shared Module Dependencies

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Dependency Architecture                             │
└─────────────────────────────────────────────────────────────────────┘

                    ┌────────────────────────┐
                    │   opentelemetry/       │
                    │                        │
                    │  - TelemetryProvider   │
                    │  - LLMSpanBuilder      │
                    │  - AgentTracer         │
                    │  - ContextPropagator   │
                    └───────────┬────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │   shared/     │   │   shared/     │   │   shared/     │
   │ credentials   │   │ observability │   │   tracing     │
   │               │   │               │   │               │
   │ - API keys    │   │ - Logger      │   │ - TraceId     │
   │ - Tokens      │   │ - MetricSink  │   │ - SpanId      │
   │ - mTLS certs  │   │               │   │ - Context     │
   └───────────────┘   └───────────────┘   └───────────────┘
```

### 4.3 Cross-Service Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│              Distributed Tracing Architecture                        │
└─────────────────────────────────────────────────────────────────────┘

   User Request                    LLM Service
┌──────────────┐              ┌──────────────────┐
│   Gateway    │──HTTP/gRPC──▶│  Agent Service   │
│              │              │                  │
│ trace_id: A  │              │ trace_id: A      │
│ span_id: 1   │              │ span_id: 2       │
└──────────────┘              └────────┬─────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
            ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
            │  Anthropic  │   │   Qdrant    │   │    Redis    │
            │     API     │   │   Vector    │   │    Cache    │
            │             │   │             │   │             │
            │ trace_id: A │   │ trace_id: A │   │ trace_id: A │
            │ span_id: 3  │   │ span_id: 4  │   │ span_id: 5  │
            └─────────────┘   └─────────────┘   └─────────────┘
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       ▼
                              ┌─────────────────┐
                              │ OTel Collector  │
                              │                 │
                              │ Correlates all  │
                              │ spans by        │
                              │ trace_id: A     │
                              └─────────────────┘
```

---

## 5. Export Architecture

### 5.1 Exporter Types

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Export Architecture                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      OTLP Exporter                                   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Protocol Options                             ││
│  │                                                                 ││
│  │  ┌──────────────┐              ┌──────────────┐                ││
│  │  │  OTLP/gRPC   │              │  OTLP/HTTP   │                ││
│  │  │              │              │              │                ││
│  │  │ - Binary     │              │ - JSON/Proto │                ││
│  │  │ - Streaming  │              │ - REST-like  │                ││
│  │  │ - Efficient  │              │ - Firewall   │                ││
│  │  │              │              │   friendly   │                ││
│  │  └──────────────┘              └──────────────┘                ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Features:                                                           │
│  ├── Automatic retry with exponential backoff                       │
│  ├── gzip compression                                               │
│  ├── TLS/mTLS support                                               │
│  ├── Header-based authentication                                    │
│  └── Batch optimization                                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Stdout Exporter                                   │
│                                                                      │
│  Use Cases:                                                          │
│  ├── Local development                                              │
│  ├── Debugging                                                      │
│  └── Container log aggregation                                      │
│                                                                      │
│  Format Options:                                                     │
│  ├── JSON (structured)                                              │
│  └── Pretty (human-readable)                                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     Mock Exporter                                    │
│                                                                      │
│  Use Cases:                                                          │
│  ├── Unit testing                                                   │
│  ├── Integration testing                                            │
│  └── Simulation/replay                                              │
│                                                                      │
│  Features:                                                           │
│  ├── In-memory span storage                                         │
│  ├── Span assertion helpers                                         │
│  ├── Export verification                                            │
│  └── Trace reconstruction                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Multi-Exporter Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│                Multi-Backend Export                                  │
└─────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │ BatchProcessor  │
                    │                 │
                    │ - Spans queue   │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │ OTLP Exporter │ │ Stdout Export │ │ Custom Export │
    │               │ │               │ │               │
    │ → Collector   │ │ → Console     │ │ → Custom      │
    └───────────────┘ └───────────────┘ └───────────────┘
            │                │                │
            ▼                ▼                ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │    Jaeger     │ │   Container   │ │   Datadog     │
    │    Tempo      │ │     Logs      │ │   NewRelic    │
    └───────────────┘ └───────────────┘ └───────────────┘
```

---

## 6. Security Architecture

### 6.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Authentication Architecture                         │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Credential Resolution                          │
│                                                                   │
│   Priority Order:                                                 │
│   1. Explicit configuration                                       │
│   2. Environment variables                                        │
│   3. Shared credential store                                      │
│   4. Default (no auth)                                            │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────────┐│
│   │ Environment Variables:                                      ││
│   │ ├── OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer xxx"  ││
│   │ ├── OTEL_EXPORTER_OTLP_CERTIFICATE=/path/to/cert.pem       ││
│   │ └── OTEL_EXPORTER_OTLP_CLIENT_KEY=/path/to/key.pem         ││
│   └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    TLS Configuration                              │
│                                                                   │
│   ┌───────────────┐        ┌───────────────┐                     │
│   │    Client     │──TLS──▶│   Collector   │                     │
│   │               │        │               │                     │
│   │ - CA cert     │        │ - Server cert │                     │
│   │ - Client cert │        │ - Client CA   │                     │
│   │ - Client key  │        │               │                     │
│   └───────────────┘        └───────────────┘                     │
│                                                                   │
│   mTLS Mode (mutual TLS):                                         │
│   - Client authenticates server                                   │
│   - Server authenticates client                                   │
│   - Required for production                                       │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Data Protection Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                 Attribute Redaction Pipeline                         │
└─────────────────────────────────────────────────────────────────────┘

  1. Span Created           2. Pre-Processing         3. Export
┌───────────────┐       ┌───────────────────────┐  ┌───────────────┐
│ Raw Attributes│──────▶│  AttributeSanitizer   │─▶│ Safe Payload  │
│               │       │                       │  │               │
│ gen_ai.prompt │       │ Redaction Rules:      │  │ gen_ai.prompt │
│ = "My API key │       │ ├── API key patterns  │  │ = [REDACTED]  │
│   is sk-xxx"  │       │ ├── PII patterns      │  │               │
│               │       │ ├── Custom patterns   │  │               │
│ user.email    │       │ └── Attribute keys    │  │ user.email    │
│ = "a@b.com"   │       │                       │  │ = [REDACTED]  │
└───────────────┘       └───────────────────────┘  └───────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                  Redaction Configuration                             │
│                                                                      │
│  redaction:                                                          │
│    enabled: true                                                     │
│    redact_prompts: true                                             │
│    redact_completions: true                                         │
│    patterns:                                                         │
│      - "sk-[a-zA-Z0-9]+"           # OpenAI API keys                │
│      - "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"    │
│    keys:                                                             │
│      - "user.email"                                                  │
│      - "user.id"                                                     │
│      - "http.request.header.authorization"                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Performance Architecture

### 7.1 Batching Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Batch Processing Flow                             │
└─────────────────────────────────────────────────────────────────────┘

                         Incoming Spans
                              │
                              ▼
              ┌───────────────────────────────┐
              │          Queue                │
              │    ┌───┬───┬───┬───┬───┐     │
              │    │ S │ S │ S │...│ S │     │
              │    └───┴───┴───┴───┴───┘     │
              │    Max Size: 2048 spans      │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │         Batch Trigger         │
              │                               │
              │  Conditions (OR):             │
              │  ├── batch_size >= 512        │
              │  ├── timeout >= 5s            │
              │  └── shutdown signal          │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │        Export Batch           │
              │                               │
              │  ┌─────────────────────────┐  │
              │  │ Spans: [S1, S2, ... Sn] │  │
              │  └─────────────────────────┘  │
              │                               │
              │  - Serialize to OTLP          │
              │  - Compress (gzip)            │
              │  - Send async                 │
              │  - Handle response            │
              └───────────────────────────────┘
```

### 7.2 Memory Management

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Memory Architecture                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Span Memory Layout                                │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Span (~512 bytes typical)                                       ││
│  │                                                                 ││
│  │ ├── trace_id: [u8; 16]      (16 bytes)                         ││
│  │ ├── span_id: [u8; 8]        (8 bytes)                          ││
│  │ ├── parent_id: Option<[u8; 8]> (9 bytes)                       ││
│  │ ├── name: String            (24 + len bytes)                   ││
│  │ ├── kind: SpanKind          (1 byte)                           ││
│  │ ├── start_time: SystemTime  (16 bytes)                         ││
│  │ ├── end_time: SystemTime    (16 bytes)                         ││
│  │ ├── attributes: HashMap     (varies, ~200 bytes typical)       ││
│  │ ├── events: Vec<Event>      (varies)                           ││
│  │ ├── links: Vec<Link>        (varies)                           ││
│  │ └── status: Status          (varies)                           ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Memory Targets:                                                     │
│  ├── Max queue memory: 2048 * 1KB = 2MB                             │
│  ├── Export buffer: 512 * 1KB = 512KB                               │
│  └── Total overhead: < 5MB                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3 Async Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Async Processing Model                             │
└─────────────────────────────────────────────────────────────────────┘

   Application Thread              Background Tasks
┌─────────────────────┐       ┌─────────────────────┐
│                     │       │                     │
│  span.end()         │       │  BatchProcessor     │
│      │              │       │      │              │
│      ▼              │       │      ▼              │
│  Queue::push(span)  │──────▶│  Wait for trigger   │
│      │              │  MPSC │      │              │
│      ▼              │Channel│      ▼              │
│  Return immediately │       │  Collect batch      │
│      │              │       │      │              │
│      ▼              │       │      ▼              │
│  Continue execution │       │  Spawn export task  │
│                     │       │      │              │
└─────────────────────┘       │      ▼              │
                              │  Export::send()     │
                              │      │              │
                              │      ▼              │
                              │  Handle response    │
                              │                     │
                              └─────────────────────┘

  Benefits:
  ├── Non-blocking span creation (<1μs)
  ├── Application not affected by export latency
  ├── Backpressure via queue limits
  └── Graceful degradation under load
```

---

## 8. Deployment Architecture

### 8.1 Deployment Patterns

```
┌─────────────────────────────────────────────────────────────────────┐
│              Pattern 1: Direct to Backend                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────┐              ┌─────────────────┐
│   Application   │──OTLP/gRPC──▶│     Jaeger      │
│                 │              │     Tempo       │
│   OTel SDK      │              │                 │
└─────────────────┘              └─────────────────┘

Use Cases:
├── Simple deployments
├── Development/testing
└── Low volume

┌─────────────────────────────────────────────────────────────────────┐
│           Pattern 2: Via Collector (Recommended)                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────┐         ┌─────────────────┐         ┌──────────────┐
│   Application   │──OTLP──▶│ OTel Collector  │──OTLP──▶│   Backend    │
│                 │         │                 │         │              │
│   OTel SDK      │         │ - Batch         │         │ Jaeger/Tempo │
└─────────────────┘         │ - Transform     │         └──────────────┘
                            │ - Filter        │
                            │ - Sample        │
                            └─────────────────┘

Use Cases:
├── Production deployments
├── Multi-backend export
├── Centralized configuration
└── Data transformation

┌─────────────────────────────────────────────────────────────────────┐
│              Pattern 3: Sidecar Collector                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          Pod                                         │
│  ┌─────────────────┐         ┌─────────────────┐                    │
│  │   Application   │──OTLP──▶│    Collector    │                    │
│  │                 │localhost│    (sidecar)    │                    │
│  │   OTel SDK      │         │                 │                    │
│  └─────────────────┘         └────────┬────────┘                    │
└───────────────────────────────────────┼─────────────────────────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │ Central Backend │
                               └─────────────────┘

Use Cases:
├── Kubernetes deployments
├── Per-pod configuration
└── Network isolation
```

### 8.2 Environment Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│                Environment-Based Configuration                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Development                                     │
│                                                                      │
│  OTEL_SERVICE_NAME=my-service                                       │
│  OTEL_TRACES_SAMPLER=always_on                                      │
│  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317                  │
│  OTEL_LOG_LEVEL=debug                                               │
│                                                                      │
│  Characteristics:                                                    │
│  ├── 100% sampling                                                  │
│  ├── Stdout exporter enabled                                        │
│  ├── Verbose logging                                                │
│  └── Local collector                                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       Staging                                        │
│                                                                      │
│  OTEL_SERVICE_NAME=my-service-staging                               │
│  OTEL_TRACES_SAMPLER=parentbased_traceidratio                       │
│  OTEL_TRACES_SAMPLER_ARG=0.5                                        │
│  OTEL_EXPORTER_OTLP_ENDPOINT=https://staging-collector:4317         │
│  OTEL_LOG_LEVEL=info                                                │
│                                                                      │
│  Characteristics:                                                    │
│  ├── 50% sampling                                                   │
│  ├── TLS enabled                                                    │
│  ├── Standard logging                                               │
│  └── Staging collector                                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Production                                      │
│                                                                      │
│  OTEL_SERVICE_NAME=my-service                                       │
│  OTEL_TRACES_SAMPLER=parentbased_traceidratio                       │
│  OTEL_TRACES_SAMPLER_ARG=0.1                                        │
│  OTEL_EXPORTER_OTLP_ENDPOINT=https://prod-collector:4317            │
│  OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer ${OTEL_TOKEN}      │
│  OTEL_EXPORTER_OTLP_COMPRESSION=gzip                                │
│  OTEL_LOG_LEVEL=warn                                                │
│  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT=1024                             │
│                                                                      │
│  Characteristics:                                                    │
│  ├── 10% sampling (head-based)                                      │
│  ├── mTLS authentication                                            │
│  ├── Compression enabled                                            │
│  ├── Attribute redaction                                            │
│  └── Production collector cluster                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Testing Architecture

### 9.1 Test Infrastructure

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Testing Architecture                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Unit Tests                                      │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ MockExporter                                                    ││
│  │                                                                 ││
│  │ - Captures all exported spans in memory                         ││
│  │ - Provides assertion helpers                                    ││
│  │ - Supports span filtering                                       ││
│  │ - Validates span structure                                      ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Test Pattern:                                                       │
│  1. Create TelemetryProvider with MockExporter                      │
│  2. Execute instrumented code                                        │
│  3. Assert on captured spans                                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                   Integration Tests                                  │
│                                                                      │
│  ┌─────────────────┐         ┌─────────────────┐                    │
│  │   Test Suite    │──OTLP──▶│ OTel Collector  │                    │
│  │                 │         │   (container)   │                    │
│  │ - Real SDK      │         │                 │                    │
│  │ - Real export   │         │ - Validates     │                    │
│  └─────────────────┘         │   protocol      │                    │
│                              └─────────────────┘                    │
│                                                                      │
│  Validates:                                                          │
│  ├── OTLP protocol compliance                                       │
│  ├── Batching behavior                                              │
│  ├── Context propagation                                            │
│  └── Graceful shutdown                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Mock Infrastructure

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Mock Exporter Design                               │
└─────────────────────────────────────────────────────────────────────┘

struct MockSpanExporter {
    spans: Arc<Mutex<Vec<SpanData>>>,
}

impl MockSpanExporter {
    fn new() -> Self { ... }

    fn get_spans(&self) -> Vec<SpanData> { ... }

    fn get_spans_by_name(&self, name: &str) -> Vec<SpanData> { ... }

    fn assert_span_exists(&self, name: &str) { ... }

    fn assert_attribute(&self, span_name: &str, key: &str, value: &str) { ... }

    fn clear(&self) { ... }
}

┌─────────────────────────────────────────────────────────────────────┐
│                  Test Helper Functions                               │
└─────────────────────────────────────────────────────────────────────┘

// Create test provider with mock exporter
fn test_provider() -> (TelemetryProvider, MockSpanExporter) {
    let exporter = MockSpanExporter::new();
    let provider = TelemetryProvider::builder()
        .with_exporter(exporter.clone())
        .build();
    (provider, exporter)
}

// Assert LLM span attributes
fn assert_llm_span(span: &SpanData, model: &str, tokens: i64) {
    assert_eq!(span.attributes.get("gen_ai.request.model"), Some(model));
    assert_eq!(span.attributes.get("gen_ai.usage.total_tokens"), Some(tokens));
}
```

---

## 10. Operational Architecture

### 10.1 Monitoring Self-Telemetry

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Self-Monitoring Architecture                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Internal Metrics                                  │
│                                                                      │
│  otel_spans_created_total                                           │
│  ├── Description: Total spans created                               │
│  └── Labels: service, span_kind                                     │
│                                                                      │
│  otel_spans_exported_total                                          │
│  ├── Description: Total spans successfully exported                 │
│  └── Labels: service, exporter                                      │
│                                                                      │
│  otel_spans_dropped_total                                           │
│  ├── Description: Total spans dropped                               │
│  └── Labels: service, reason (queue_full, export_error)             │
│                                                                      │
│  otel_export_latency_ms                                             │
│  ├── Description: Export batch latency histogram                    │
│  └── Buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]              │
│                                                                      │
│  otel_queue_size                                                    │
│  ├── Description: Current queue depth                               │
│  └── Type: Gauge                                                    │
│                                                                      │
│  otel_export_errors_total                                           │
│  ├── Description: Total export failures                             │
│  └── Labels: service, error_type                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Graceful Shutdown

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Shutdown Sequence                                   │
└─────────────────────────────────────────────────────────────────────┘

    Shutdown Signal
          │
          ▼
┌─────────────────────┐
│ 1. Stop accepting   │
│    new spans        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. Flush queue      │
│    (with timeout)   │
│                     │
│    timeout: 30s     │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐  ┌────────────┐
│Success │  │  Timeout   │
│        │  │            │
│All sent│  │Drop remain │
└───┬────┘  └─────┬──────┘
    │             │
    └──────┬──────┘
           │
           ▼
┌─────────────────────┐
│ 3. Close exporters  │
│    - Close gRPC     │
│    - Close HTTP     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 4. Release resources│
│    - Drop providers │
│    - Clear queues   │
└─────────────────────┘
```

---

## 11. File Structure

```
integrations/opentelemetry/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Module exports
│   ├── provider.rs               # TelemetryProvider
│   ├── config.rs                 # Configuration structs
│   ├── tracer/
│   │   ├── mod.rs
│   │   ├── span_builder.rs       # SpanBuilder
│   │   ├── tracer.rs             # Tracer wrapper
│   │   └── context.rs            # Context management
│   ├── metrics/
│   │   ├── mod.rs
│   │   ├── instruments.rs        # Counter, Histogram, Gauge
│   │   ├── llm_metrics.rs        # LLM-specific metrics
│   │   └── aggregation.rs        # Aggregation views
│   ├── logging/
│   │   ├── mod.rs
│   │   ├── bridge.rs             # LogBridge
│   │   └── correlation.rs        # Trace correlation
│   ├── propagation/
│   │   ├── mod.rs
│   │   ├── w3c.rs                # W3C TraceContext
│   │   ├── baggage.rs            # W3C Baggage
│   │   └── composite.rs          # Composite propagator
│   ├── llm/
│   │   ├── mod.rs
│   │   ├── span_builder.rs       # LLMSpanBuilder
│   │   ├── conventions.rs        # Semantic conventions
│   │   └── agent_tracer.rs       # AgentTracer
│   ├── export/
│   │   ├── mod.rs
│   │   ├── otlp.rs               # OTLP exporter
│   │   ├── stdout.rs             # Stdout exporter
│   │   ├── mock.rs               # Mock exporter
│   │   └── batch.rs              # Batch processor
│   ├── security/
│   │   ├── mod.rs
│   │   ├── redaction.rs          # Attribute redaction
│   │   └── auth.rs               # Authentication
│   └── error.rs                  # Error types
├── tests/
│   ├── unit/
│   │   ├── provider_test.rs
│   │   ├── span_test.rs
│   │   ├── metrics_test.rs
│   │   ├── propagation_test.rs
│   │   └── redaction_test.rs
│   └── integration/
│       ├── otlp_test.rs
│       ├── llm_tracing_test.rs
│       └── agent_tracing_test.rs
├── benches/
│   ├── span_creation.rs
│   └── batch_export.rs
└── examples/
    ├── basic_tracing.rs
    ├── llm_tracing.rs
    ├── agent_tracing.rs
    └── distributed_context.rs

typescript/
├── package.json
├── src/
│   ├── index.ts
│   ├── provider.ts
│   ├── llm-tracing.ts
│   ├── agent-tracing.ts
│   ├── propagation.ts
│   └── types.ts
└── tests/
    ├── provider.test.ts
    └── llm-tracing.test.ts
```

---

## 12. Architecture Decision Records

### ADR-001: SDK vs Auto-Instrumentation

**Decision:** Use SDK-based manual instrumentation

**Context:** Choice between automatic instrumentation libraries vs manual SDK usage

**Rationale:**
- Full control over span boundaries
- Custom LLM semantic conventions
- Precise attribute control
- Consistent cross-language behavior

### ADR-002: Batch Processing Default

**Decision:** Always use batch span processor

**Context:** Simple vs batch processor trade-off

**Rationale:**
- Better throughput
- Reduced network overhead
- Memory-bounded queue
- Standard practice for production

### ADR-003: W3C Propagation Only

**Decision:** Default to W3C TraceContext + Baggage

**Context:** Multiple propagation formats available (B3, Jaeger, etc.)

**Rationale:**
- Industry standard
- Wide tool support
- Simpler configuration
- Avoid format conflicts

### ADR-004: Attribute Redaction at Source

**Decision:** Redact sensitive attributes before export

**Context:** Could redact at collector or source

**Rationale:**
- Sensitive data never leaves application
- Simpler collector configuration
- Defense in depth
- Compliance friendly

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture |

---

**Next Phase:** Refinement - Performance optimizations, edge case handling, and production hardening patterns.
