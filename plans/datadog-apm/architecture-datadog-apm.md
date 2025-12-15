# Datadog APM Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/datadog-apm`

---

## 1. Architecture Overview

### 1.1 Design Philosophy

The Datadog APM Integration Module follows a **thin adapter architecture** that bridges the LLM Dev Ops platform to Datadog's APM infrastructure via the local Datadog Agent:

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
│  │              LLMSpan / AgentSpan / Error Tracking               ││
│  │           Tag Management / Attribute Redaction                  ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                      Adapter Layer                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │  DatadogTracer  │  │  DogStatsDClient│  │  LogCorrelator  │      │
│  │  (dd-trace)     │  │  (hot-shots)    │  │                 │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
└───────────┼────────────────────┼────────────────────┼────────────────┘
            │                    │                    │
┌───────────▼────────────────────▼────────────────────▼────────────────┐
│                      Transport Layer                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │  HTTP :8126     │  │  UDP :8125      │  │  JSON Injection │      │
│  │  (Trace API)    │  │  (DogStatsD)    │  │  (Log Context)  │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
└───────────┼────────────────────┼────────────────────┼────────────────┘
            │                    │                    │
┌───────────▼────────────────────▼────────────────────▼────────────────┐
│                      Datadog Agent                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  APM Agent  │  DogStatsD Server  │  Log Agent                   ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ HTTPS
                                  ▼
                        ┌─────────────────┐
                        │  Datadog Cloud  │
                        │  APM Backend    │
                        └─────────────────┘
```

### 1.2 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Agent-based export | Offload processing, buffering, and retry to Datadog Agent |
| dd-trace library | Official SDK with full APM feature support |
| DogStatsD for metrics | Efficient UDP protocol, aggregation at agent |
| Manual instrumentation | Precise control over LLM/agent spans |
| Dual header propagation | Datadog native + W3C TraceContext interop |
| Log context injection | Native Datadog log correlation |

---

## 2. Component Architecture

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DatadogAPMClient                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - config: DatadogAPMConfig                                      ││
│  │ - tracer: DatadogTracer                                         ││
│  │ - metricsClient: DogStatsDClient                                ││
│  │ - logger: Logger                                                ││
│  │ - isShutdown: boolean                                           ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Methods:                                                            │
│  ├── startSpan(name, options?) -> Span                              │
│  ├── getCurrentSpan() -> Span | null                                │
│  ├── injectContext(carrier) -> void                                 │
│  ├── extractContext(carrier) -> SpanContext | null                  │
│  ├── increment(name, value?, tags?) -> void                         │
│  ├── gauge(name, value, tags?) -> void                              │
│  ├── histogram(name, value, tags?) -> void                          │
│  ├── distribution(name, value, tags?) -> void                       │
│  ├── getLogContext() -> LogContext | null                           │
│  ├── flush() -> Promise<void>                                       │
│  └── shutdown() -> Promise<void>                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         SpanImpl                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - ddSpan: DatadogSpan (native dd-trace span)                    ││
│  │ - client: DatadogAPMClient                                      ││
│  │ - finished: boolean                                             ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Methods:                                                            │
│  ├── setTag(key, value) -> Span                                     │
│  ├── setError(error) -> Span                                        │
│  ├── addEvent(name, attributes?) -> Span                            │
│  ├── finish(endTime?) -> void                                       │
│  └── context() -> SpanContext                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    DogStatsDClient Wrapper                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - client: StatsD (hot-shots)                                    ││
│  │ - prefix: string                                                ││
│  │ - globalTags: string[]                                          ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Metric Types:                                                       │
│  ├── Counter (increment/decrement)                                  │
│  ├── Gauge (set absolute value)                                     │
│  ├── Histogram (distribution with percentiles)                      │
│  ├── Distribution (global percentiles)                              │
│  ├── Timing (histogram in milliseconds)                             │
│  └── Set (unique value count)                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Instrumentation Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LLMSpanImpl                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Extends SpanImpl with LLM-specific attributes                   ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Attributes Added:                                                   │
│  ├── llm.provider (anthropic, openai, cohere)                       │
│  ├── llm.model (claude-3-opus, gpt-4)                               │
│  ├── llm.request_type (chat, completion, embed)                     │
│  ├── llm.input_tokens                                               │
│  ├── llm.output_tokens                                              │
│  ├── llm.total_tokens                                               │
│  ├── llm.finish_reason                                              │
│  ├── llm.streaming                                                  │
│  └── llm.temperature                                                │
│                                                                      │
│  Metrics Emitted:                                                    │
│  ├── llm.tokens.input (histogram)                                   │
│  ├── llm.tokens.output (histogram)                                  │
│  ├── llm.request.latency (histogram)                                │
│  └── llm.requests (counter with status tag)                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       AgentSpanImpl                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Extends SpanImpl with agent execution tracking                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Trace Structure:                                                    │
│  agent.execution (root)                                              │
│  ├── agent.step[0]                                                  │
│  │   ├── llm.chat (LLM call)                                        │
│  │   └── agent.tool_call (tool invocation)                          │
│  ├── agent.step[1]                                                  │
│  │   └── agent.memory_retrieval (RAG lookup)                        │
│  └── agent.step[2]                                                  │
│      └── llm.chat (final response)                                  │
│                                                                      │
│  Metrics Emitted:                                                    │
│  ├── agent.executions (counter)                                     │
│  ├── agent.steps (histogram)                                        │
│  ├── agent.tool_calls (counter)                                     │
│  ├── agent.tool_duration (histogram)                                │
│  ├── agent.execution_time (histogram)                               │
│  └── agent.errors (counter)                                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Context Propagation Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Context Propagation Flow                           │
└─────────────────────────────────────────────────────────────────────┘

   Service A                             Service B
┌─────────────────┐                   ┌─────────────────┐
│   Active Span   │                   │   Child Span    │
│                 │                   │                 │
│ trace_id: X     │                   │ trace_id: X     │
│ span_id: 1      │                   │ span_id: 2      │
│ sampling: 1     │                   │ parent_id: 1    │
└────────┬────────┘                   └────────▲────────┘
         │                                     │
         │  HTTP Request                       │
         │  ┌──────────────────────────────┐   │
         └─▶│ x-datadog-trace-id: X        │───┘
            │ x-datadog-parent-id: 1       │
            │ x-datadog-sampling-priority:1│
            │ x-datadog-origin: rum        │
            │ traceparent: 00-X-1-01       │  (W3C fallback)
            │ tracestate: dd=s:1           │
            └──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Propagator Components                             │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ Datadog Native  │  │ W3C TraceContext│  │   Composite     │      │
│  │                 │  │                 │  │   Propagator    │      │
│  │ x-datadog-*     │  │ traceparent     │  │                 │      │
│  │ (Primary)       │  │ tracestate      │  │ Inject: Both    │      │
│  │                 │  │ (Fallback)      │  │ Extract: DD→W3C │      │
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

  1. Span Creation           2. Tag Assignment         3. Span Finish
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ startSpan()   │──────▶│  setTag()     │──────▶│  finish()     │
│               │       │  setError()   │       │               │
│ - name        │       │               │       │ - Calculate   │
│ - parent ctx  │       │ - llm.*       │       │   duration    │
│ - span type   │       │ - agent.*     │       │ - Send to     │
│               │       │ - error.*     │       │   dd-trace    │
└───────────────┘       └───────────────┘       └───────┬───────┘
                                                        │
  4. dd-trace Buffer         5. Agent Submit           │
┌───────────────┐       ┌───────────────┐              │
│ Trace Buffer  │◀──────│ Serialization │◀─────────────┘
│               │       │               │
│ - Sampling    │       │ - MsgPack     │
│ - Batching    │       │ - Compression │
│ - Priority    │       │               │
└───────┬───────┘       └───────────────┘
        │
  6. HTTP PUT                7. Datadog Backend
┌───────▼───────┐       ┌───────────────┐
│ Agent :8126   │──────▶│ Datadog APM   │
│               │ HTTPS │               │
│ /v0.4/traces  │       │ - Indexing    │
│               │       │ - Service Map │
└───────────────┘       └───────────────┘
```

### 3.2 Metrics Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Metrics Data Flow                                │
└─────────────────────────────────────────────────────────────────────┘

  1. Recording              2. Tag Formatting        3. UDP Send
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ increment()   │──────▶│ formatTags()  │──────▶│ StatsD Client │
│ gauge()       │       │               │       │               │
│ histogram()   │       │ - Sanitize    │       │ - Buffer      │
│ distribution()│       │ - Prefix      │       │ - Batch       │
│ timing()      │       │ - Global tags │       │ - Flush       │
└───────────────┘       └───────────────┘       └───────┬───────┘
                                                        │
                                                    UDP │
                                                        │
  4. DogStatsD Server        5. Aggregation            │
┌───────────────┐       ┌───────────────┐              │
│ Agent :8125   │◀──────┤ Parse Metric  │◀─────────────┘
│               │       │               │
│ - Aggregate   │       │ metric:value  │
│ - Flush 10s   │       │ |type|@rate   │
│               │       │ |#tags        │
└───────┬───────┘       └───────────────┘
        │
  6. Metrics API             7. Datadog Backend
┌───────▼───────┐       ┌───────────────┐
│ Agent Submit  │──────▶│ Datadog       │
│               │ HTTPS │ Metrics       │
│ /api/v1/series│       │               │
└───────────────┘       └───────────────┘

DogStatsD Metric Format:
┌─────────────────────────────────────────────────────────────────┐
│ llmdevops.llm.requests:1|c|#provider:anthropic,model:claude-3  │
│ llmdevops.llm.latency:150.5|h|#provider:anthropic              │
│ llmdevops.agent.steps:5|g|#agent:research-agent                │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Log Correlation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Log Correlation Flow                              │
└─────────────────────────────────────────────────────────────────────┘

  1. Log Event               2. Context Injection      3. Output
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ logger.info() │──────▶│ injectLog     │──────▶│ JSON Log      │
│               │       │ Context()     │       │               │
│ - message     │       │               │       │ { "message":  │
│ - context     │       │ - dd.trace_id │       │   "...",      │
│               │       │ - dd.span_id  │       │   "dd": {     │
│               │       │ - dd.service  │       │     trace_id  │
│               │       │ - dd.env      │       │     span_id } │
│               │       │ - dd.version  │       │ }             │
└───────────────┘       └───────────────┘       └───────┬───────┘
                                                        │
                                                        │ stdout/file
                                                        │
  4. Log Collection          5. Datadog Backend        │
┌───────────────┐       ┌───────────────┐              │
│ Datadog Agent │──────▶│ Datadog Logs  │◀─────────────┘
│ Log Agent     │ HTTPS │               │
│               │       │ - Index       │
│ - Tail files  │       │ - Correlate   │
│ - Parse JSON  │       │   with traces │
└───────────────┘       └───────────────┘

Correlated Log Format:
┌─────────────────────────────────────────────────────────────────┐
│ {                                                               │
│   "timestamp": "2025-12-14T10:30:00.000Z",                     │
│   "level": "info",                                              │
│   "message": "LLM request completed",                          │
│   "dd": {                                                       │
│     "trace_id": "1234567890abcdef",                            │
│     "span_id": "abcdef1234567890",                             │
│     "service": "llm-gateway",                                  │
│     "env": "production",                                        │
│     "version": "1.2.3"                                         │
│   },                                                            │
│   "llm": { "model": "claude-3-opus", "tokens": 1500 }          │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Integration Architecture

### 4.1 Platform Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│                  LLM Dev Ops Platform Integration                    │
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
│         │   Datadog APM Module   │                                  │
│         │                        │                                  │
│         │  - Trace LLM calls     │                                  │
│         │  - Record token usage  │                                  │
│         │  - Track agent steps   │                                  │
│         │  - Propagate context   │                                  │
│         │  - Correlate logs      │                                  │
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
                    │    datadog-apm/        │
                    │                        │
                    │  - DatadogAPMClient    │
                    │  - LLMSpanImpl         │
                    │  - AgentSpanImpl       │
                    │  - ContextPropagator   │
                    │  - MockClient          │
                    └───────────┬────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │   shared/     │   │   shared/     │   │   shared/     │
   │ credentials   │   │ observability │   │   tracing     │
   │               │   │               │   │               │
   │ - DD_API_KEY  │   │ - Logger      │   │ - TraceId     │
   │ - DD_APP_KEY  │   │ - Metrics     │   │ - SpanId      │
   │               │   │   Collector   │   │ - Context     │
   └───────────────┘   └───────────────┘   └───────────────┘

External Dependencies:
┌───────────────┐   ┌───────────────┐
│   dd-trace    │   │   hot-shots   │
│               │   │               │
│ - Tracer      │   │ - StatsD      │
│ - Span        │   │ - UDP Client  │
│ - Scope       │   │ - Buffering   │
└───────────────┘   └───────────────┘
```

### 4.3 Cross-Service Tracing

```
┌─────────────────────────────────────────────────────────────────────┐
│              Distributed Tracing Architecture                        │
└─────────────────────────────────────────────────────────────────────┘

   User Request                      LLM Gateway
┌──────────────┐                 ┌──────────────────┐
│   Browser    │────HTTP────────▶│  API Gateway     │
│              │                 │                  │
│              │                 │ trace_id: A      │
│              │                 │ span_id: 1       │
└──────────────┘                 └────────┬─────────┘
                                          │
                     ┌────────────────────┼────────────────────┐
                     │                    │                    │
                     ▼                    ▼                    ▼
             ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
             │  Anthropic  │     │   Vector    │     │    Cache    │
             │   Service   │     │   Store     │     │   Service   │
             │             │     │             │     │             │
             │ trace_id: A │     │ trace_id: A │     │ trace_id: A │
             │ span_id: 2  │     │ span_id: 3  │     │ span_id: 4  │
             │ parent: 1   │     │ parent: 1   │     │ parent: 1   │
             └──────┬──────┘     └─────────────┘     └─────────────┘
                    │
                    ▼
             ┌─────────────┐
             │  Anthropic  │
             │    API      │
             │             │
             │ trace_id: A │
             │ span_id: 5  │
             │ parent: 2   │
             └─────────────┘
                    │
                    │  All spans correlated
                    ▼
             ┌─────────────────┐
             │ Datadog Agent   │
             │                 │
             │ Collects from   │
             │ all services    │
             └────────┬────────┘
                      │
                      ▼
             ┌─────────────────┐
             │ Datadog APM     │
             │                 │
             │ Service Map     │
             │ Flame Graph     │
             │ Dependencies    │
             └─────────────────┘
```

---

## 5. Service Map Architecture

### 5.1 Service Dependencies

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Service Map Generation                            │
└─────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │   API Gateway   │
                         │   (web)         │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
      ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
      │ LLM Service   │  │ Agent Service │  │ Auth Service  │
      │ (custom)      │  │ (custom)      │  │ (web)         │
      └───────┬───────┘  └───────┬───────┘  └───────────────┘
              │                  │
              │          ┌───────┴───────┐
              │          │               │
              ▼          ▼               ▼
      ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
      │ Anthropic API │ │ Vector Store  │ │ Memory Store  │
      │ (http)        │ │ (db)          │ │ (cache)       │
      └───────────────┘ └───────────────┘ └───────────────┘

Service Tags for Map:
┌─────────────────────────────────────────────────────────────────┐
│ service: llm-gateway                                            │
│ env: production                                                 │
│ version: 1.2.3                                                  │
│ span.type: web | http | db | cache | custom                     │
│ peer.service: anthropic-api (for external calls)               │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Error Tracking Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Error Tracking Flow                               │
└─────────────────────────────────────────────────────────────────────┘

  1. Error Occurs            2. Span Tagging           3. Agent Submit
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ try {         │──────▶│ span.setError │──────▶│ Error sent    │
│   await llm() │       │               │       │ with trace    │
│ } catch (e) { │       │ error: true   │       │               │
│   ...         │       │ error.type    │       │ Linked to:    │
│ }             │       │ error.message │       │ - trace_id    │
│               │       │ error.stack   │       │ - span_id     │
└───────────────┘       └───────────────┘       └───────┬───────┘
                                                        │
                                                        ▼
                                               ┌───────────────┐
                                               │ Datadog Error │
                                               │ Tracking      │
                                               │               │
                                               │ - Grouping    │
                                               │ - Alerting    │
                                               │ - Trace link  │
                                               └───────────────┘

Error Tags:
┌─────────────────────────────────────────────────────────────────┐
│ error: true                                                     │
│ error.type: "RateLimitError"                                   │
│ error.message: "Rate limit exceeded"                           │
│ error.stack: "RateLimitError: Rate limit...\n    at ..."       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Security Architecture

### 6.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Authentication Architecture                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Credential Sources                                │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ Environment     │  │ Config File     │  │ Secrets Manager │      │
│  │                 │  │                 │  │                 │      │
│  │ DD_API_KEY      │  │ apiKey: ***     │  │ AWS/GCP/Vault   │      │
│  │ DD_APP_KEY      │  │ appKey: ***     │  │                 │      │
│  │ DD_AGENT_HOST   │  │                 │  │                 │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
│           │                    │                    │                │
│           └────────────────────┼────────────────────┘                │
│                                ▼                                     │
│                    ┌─────────────────────┐                          │
│                    │ shared/credentials  │                          │
│                    │                     │                          │
│                    │ - Credential loader │                          │
│                    │ - Rotation support  │                          │
│                    └──────────┬──────────┘                          │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent Communication                               │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐                           │
│  │ Trace Agent     │  │ DogStatsD       │                           │
│  │ :8126           │  │ :8125           │                           │
│  │                 │  │                 │                           │
│  │ Local socket    │  │ Local UDP       │                           │
│  │ No auth needed  │  │ No auth needed  │                           │
│  └─────────────────┘  └─────────────────┘                           │
│                                                                      │
│  Agent authenticates to Datadog backend using DD_API_KEY            │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Data Redaction Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Redaction Pipeline                                │
└─────────────────────────────────────────────────────────────────────┘

  1. Raw Data               2. Redaction Rules        3. Safe Output
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ span.setTag() │──────▶│ RedactionRule │──────▶│ Sanitized     │
│               │       │ Engine        │       │ Span          │
│ - user_id     │       │               │       │               │
│ - api_key     │       │ - Pattern     │       │ - user_id:*** │
│ - prompt      │       │   matching    │       │ - api_key:    │
│               │       │ - Replacement │       │   [REDACTED]  │
│               │       │ - Allowlist   │       │ - prompt:     │
│               │       │               │       │   [FILTERED]  │
└───────────────┘       └───────────────┘       └───────────────┘

Default Redaction Rules:
┌─────────────────────────────────────────────────────────────────┐
│ Pattern                  │ Replacement   │ Apply To             │
│ /api[_-]?key/i          │ [REDACTED]    │ tags                 │
│ /password/i             │ [REDACTED]    │ tags, logs           │
│ /secret/i               │ [REDACTED]    │ tags, logs           │
│ /authorization/i        │ [REDACTED]    │ tags                 │
│ /prompt|input/i         │ [FILTERED]    │ tags (optional)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Testing Architecture

### 7.1 Mock Exporter Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Mock Testing Architecture                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                   MockDatadogAPMClient                               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Captures:                                                       ││
│  │ - capturedSpans: CapturedSpan[]                                 ││
│  │ - capturedMetrics: CapturedMetric[]                             ││
│  │ - capturedLogs: CapturedLog[]                                   ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Assertions:                                                         │
│  ├── assertSpanCreated(name, tags?)                                 │
│  ├── assertMetricRecorded(name, type, tags?)                        │
│  ├── assertErrorTracked(errorType)                                  │
│  ├── assertContextPropagated(traceId)                               │
│  └── assertLogCorrelated(traceId, spanId)                           │
│                                                                      │
│  Queries:                                                            │
│  ├── getSpans(filter?)                                              │
│  ├── getMetrics(filter?)                                            │
│  ├── getSpanByName(name)                                            │
│  └── getMetricsByPrefix(prefix)                                     │
└─────────────────────────────────────────────────────────────────────┘

Test Example Flow:
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ Create Mock   │──────▶│ Run Test      │──────▶│ Assert        │
│ Client        │       │ Code          │       │ Captures      │
│               │       │               │       │               │
│ mockClient =  │       │ await traceLLM│       │ assertSpan    │
│  createMock() │       │ (...)         │       │ Created(...)  │
└───────────────┘       └───────────────┘       └───────────────┘
```

### 7.2 Integration Test Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                Integration Test Setup                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Docker Compose Test Env                           │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ Test Runner     │  │ Datadog Agent   │  │ Mock LLM API    │      │
│  │                 │  │ (test mode)     │  │                 │      │
│  │ - vitest        │  │                 │  │ - Deterministic │      │
│  │ - Test code     │  │ - Receives      │  │   responses     │      │
│  │                 │  │   traces        │  │                 │      │
│  │                 │  │ - Validates     │  │                 │      │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘      │
│           │                    │                                     │
│           └─────────┬──────────┘                                     │
│                     ▼                                                │
│           ┌─────────────────┐                                       │
│           │ Trace Validator │                                       │
│           │                 │                                       │
│           │ - Check spans   │                                       │
│           │ - Verify tags   │                                       │
│           │ - Validate ctx  │                                       │
│           └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Architecture

### 8.1 Runtime Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Deployment Topology                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         Kubernetes Pod                               │
│                                                                      │
│  ┌───────────────────────────────┐  ┌───────────────────────────┐   │
│  │      Application Container    │  │    Datadog Agent Sidecar  │   │
│  │                               │  │    (or DaemonSet)         │   │
│  │  ┌─────────────────────────┐  │  │                           │   │
│  │  │  LLM Dev Ops App        │  │  │  ┌─────────────────────┐  │   │
│  │  │                         │  │  │  │ APM Agent :8126     │  │   │
│  │  │  - Datadog APM Module   │──┼──┼─▶│                     │  │   │
│  │  │  - dd-trace initialized │  │  │  └─────────────────────┘  │   │
│  │  │  - DogStatsD client     │──┼──┼─▶┌─────────────────────┐  │   │
│  │  │                         │  │  │  │ DogStatsD :8125     │  │   │
│  │  └─────────────────────────┘  │  │  └─────────────────────┘  │   │
│  │                               │  │                           │   │
│  │  Environment:                 │  │  Environment:             │   │
│  │  DD_SERVICE=my-service        │  │  DD_API_KEY=***           │   │
│  │  DD_ENV=production            │  │  DD_SITE=datadoghq.com    │   │
│  │  DD_VERSION=1.2.3             │  │                           │   │
│  │  DD_AGENT_HOST=localhost      │  │                           │   │
│  └───────────────────────────────┘  └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Environment Variables

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Environment Configuration                           │
└─────────────────────────────────────────────────────────────────────┘

Required (Unified Service Tagging):
┌─────────────────────────────────────────────────────────────────┐
│ DD_SERVICE    │ Service name (required)                         │
│ DD_ENV        │ Environment: production, staging, dev           │
│ DD_VERSION    │ Service version (semver recommended)            │
└─────────────────────────────────────────────────────────────────┘

Agent Connection:
┌─────────────────────────────────────────────────────────────────┐
│ DD_AGENT_HOST        │ Hostname of Datadog agent (localhost)    │
│ DD_TRACE_AGENT_PORT  │ APM agent port (8126)                    │
│ DD_DOGSTATSD_HOST    │ DogStatsD host (DD_AGENT_HOST)           │
│ DD_DOGSTATSD_PORT    │ DogStatsD port (8125)                    │
└─────────────────────────────────────────────────────────────────┘

Sampling & Performance:
┌─────────────────────────────────────────────────────────────────┐
│ DD_TRACE_SAMPLE_RATE │ 0.0-1.0, default 1.0 (100%)             │
│ DD_PRIORITY_SAMPLING │ Enable priority sampling (true)         │
│ DD_TRACE_ENABLED     │ Enable/disable tracing (true)           │
└─────────────────────────────────────────────────────────────────┘

Custom Tags:
┌─────────────────────────────────────────────────────────────────┐
│ DD_TAGS              │ Global tags: key1:value1,key2:value2     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Performance Considerations

### 9.1 Overhead Budget

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Performance Budget                                │
└─────────────────────────────────────────────────────────────────────┘

Operation Latency:
┌─────────────────────────────────────────────────────────────────┐
│ Operation            │ Budget    │ Implementation              │
├──────────────────────┼───────────┼─────────────────────────────┤
│ Span creation        │ < 100 μs  │ dd-trace native             │
│ Tag assignment       │ < 10 μs   │ Map insertion               │
│ Span finish          │ < 100 μs  │ Duration calc + queue       │
│ Metric emit          │ < 50 μs   │ UDP send (non-blocking)     │
│ Context inject       │ < 50 μs   │ Header formatting           │
│ Context extract      │ < 50 μs   │ Header parsing              │
│ Log context inject   │ < 10 μs   │ Object spread               │
└─────────────────────────────────────────────────────────────────┘

Resource Limits:
┌─────────────────────────────────────────────────────────────────┐
│ Resource             │ Limit     │ Notes                       │
├──────────────────────┼───────────┼─────────────────────────────┤
│ Memory overhead      │ < 50 MB   │ Buffers + dd-trace runtime  │
│ CPU overhead         │ < 2%      │ Serialization + network     │
│ Network (idle)       │ < 1 KB/s  │ Keep-alive only             │
│ Network (active)     │ < 100 KB/s│ Trace + metric batches      │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Buffering Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Buffering Architecture                            │
└─────────────────────────────────────────────────────────────────────┘

Trace Buffering (dd-trace managed):
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ Span Created  │──────▶│ Trace Buffer  │──────▶│ Flush to      │
│               │       │               │       │ Agent         │
│               │       │ Max: 1000     │       │               │
│               │       │ Flush: 2s     │       │ Every 2s or   │
│               │       │               │       │ buffer full   │
└───────────────┘       └───────────────┘       └───────────────┘

Metric Buffering (hot-shots managed):
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ Metric Record │──────▶│ UDP Buffer    │──────▶│ Flush to      │
│               │       │               │       │ DogStatsD     │
│               │       │ Max: 8192     │       │               │
│               │       │ Flush: 1s     │       │ Every 1s or   │
│               │       │               │       │ buffer full   │
└───────────────┘       └───────────────┘       └───────────────┘

Backpressure Handling:
┌─────────────────────────────────────────────────────────────────┐
│ Scenario           │ Behavior                                   │
├────────────────────┼────────────────────────────────────────────┤
│ Buffer full        │ Drop oldest spans/metrics                  │
│ Agent unavailable  │ Continue buffering, drop on overflow       │
│ Shutdown           │ Flush with timeout (10s), then drop        │
│ High throughput    │ Sampling kicks in automatically            │
└─────────────────────────────────────────────────────────────────┘
```
