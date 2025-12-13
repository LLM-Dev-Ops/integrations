# AWS CloudWatch Logs Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/cloudwatch-logs`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design Principles](#2-design-principles)
3. [C4 Model Diagrams](#3-c4-model-diagrams)
4. [Component Architecture](#4-component-architecture)
5. [Service Architecture](#5-service-architecture)
6. [Data Flow Architecture](#6-data-flow-architecture)
7. [Batch Buffer Architecture](#7-batch-buffer-architecture)
8. [Correlation Engine Architecture](#8-correlation-engine-architecture)
9. [Module Structure](#9-module-structure)
10. [Rust Crate Organization](#10-rust-crate-organization)
11. [TypeScript Package Organization](#11-typescript-package-organization)
12. [Testing Architecture](#12-testing-architecture)

---

## 1. Architecture Overview

### 1.1 Executive Summary

The AWS CloudWatch Logs Integration Module implements a **thin adapter layer** architecture that:

1. **Emits structured logs** to CloudWatch Logs with correlation ID injection
2. **Queries logs** using CloudWatch Logs Insights for cross-service correlation
3. **Manages log infrastructure** (groups, streams, retention policies)
4. **Reuses shared infrastructure** from existing AWS integrations (`aws/credentials`, `aws/signing`)
5. **Delegates resilience** to shared primitives (`shared/resilience`)
6. **Supports testing** via log stream simulation and replay

### 1.2 Key Architectural Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Thin adapter layer** | Minimize code duplication, leverage existing infra | Limited customization |
| **Batch buffering** | Efficient log emission, rate limit compliance | Slight latency for logs |
| **Structured JSON logs** | CloudWatch Logs Insights query support | Larger message size |
| **Correlation ID injection** | Cross-service traceability | Extra fields in logs |
| **Shared credential chain** | Reuse from aws/ses, aws/s3 | Coupled to AWS patterns |
| **Async-first design** | I/O-bound operations | Requires async runtime |

### 1.3 Architecture Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| Thin adapter only | Design principle | No duplicate logic from shared modules |
| Shared AWS credentials | Reuse from aws/ses | Must use same credential chain pattern |
| Shared signing | aws/signing module | SigV4 for `logs` service |
| Batch limits | AWS CloudWatch Logs | Max 10K events, 1MB per batch |
| No AWS SDK dependency | Forbidden dep policy | Custom signing, credential handling |
| Rust + TypeScript | Multi-language support | Maintain API parity |

### 1.4 CloudWatch Logs-Specific Considerations

| Consideration | Description |
|---------------|-------------|
| **Single endpoint** | `logs.{region}.amazonaws.com` for all operations |
| **JSON-RPC style** | POST with `X-Amz-Target` header for operation |
| **Batch constraints** | Max 10K events, 1MB, events must be chronological |
| **Retention values** | Fixed set of valid retention days |
| **Insights polling** | Async query with status polling |
| **Event timestamp** | Must be within 14 days past to 2 hours future |

---

## 2. Design Principles

### 2.1 Thin Adapter Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THIN ADAPTER PRINCIPLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CloudWatch Logs Module            Shared Modules                            │
│  ┌──────────────────────┐         ┌──────────────────────┐                  │
│  │ CloudWatchLogsClient │         │ aws/credentials      │                  │
│  │                      │────────►│ (reuse)              │                  │
│  │ • LogEventsService   │         └──────────────────────┘                  │
│  │ • InsightsService    │         ┌──────────────────────┐                  │
│  │ • LogGroupsService   │────────►│ aws/signing          │                  │
│  │ • LogStreamsService  │         │ (reuse)              │                  │
│  │ • RetentionService   │         └──────────────────────┘                  │
│  └──────────────────────┘         ┌──────────────────────┐                  │
│           │                       │ shared/resilience    │                  │
│           │                       │ (reuse)              │                  │
│           └──────────────────────►└──────────────────────┘                  │
│                                   ┌──────────────────────┐                  │
│                                   │ shared/observability │                  │
│                                   │ (reuse)              │                  │
│                                   └──────────────────────┘                  │
│                                                                              │
│  CLOUDWATCH LOGS MODULE OWNS:     SHARED MODULES OWN:                       │
│  • Log event formatting           • AWS credential chain                    │
│  • Batch buffer management        • SigV4 signing                          │
│  • Insights query execution       • Retry logic                            │
│  • Correlation ID injection       • Circuit breaker                        │
│  • Retention management           • Rate limiting                          │
│  • Log group/stream mgmt          • Logging/metrics/tracing                │
│  • Simulation/replay              │                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Structured Logging Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STRUCTURED LOGGING PATTERN                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Application Code                                                            │
│       │                                                                      │
│       │ put_structured(event)                                               │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    StructuredLogEvent                                │    │
│  │  {                                                                   │    │
│  │    level: LogLevel,                                                  │    │
│  │    message: String,                                                  │    │
│  │    timestamp: Option<i64>,                                           │    │
│  │    trace_id: Option<String>,      ◄── Injected from context         │    │
│  │    request_id: Option<String>,    ◄── Injected from context         │    │
│  │    span_id: Option<String>,       ◄── Injected from context         │    │
│  │    service: Option<String>,                                          │    │
│  │    fields: HashMap<String, Value>                                    │    │
│  │  }                                                                   │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       │ serialize to JSON                                                    │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    CloudWatch Log Message                            │    │
│  │  {                                                                   │    │
│  │    "level": "INFO",                                                  │    │
│  │    "message": "User logged in",                                      │    │
│  │    "timestamp": "2025-12-13T10:30:00Z",                              │    │
│  │    "trace_id": "abc123",                                             │    │
│  │    "request_id": "req-456",                                          │    │
│  │    "span_id": "span-789",                                            │    │
│  │    "service": "auth-service",                                        │    │
│  │    "user_id": "user-123",                                            │    │
│  │    "ip_address": "192.168.1.1"                                       │    │
│  │  }                                                                   │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       │ add to batch buffer                                                  │
│       ▼                                                                      │
│  ┌────────────────────────────┐                                              │
│  │      Batch Buffer          │                                              │
│  │  (flush on threshold)      │───────► CloudWatch Logs                     │
│  └────────────────────────────┘                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Dependency Inversion (Shared Infrastructure)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPENDENCY INVERSION PRINCIPLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  High-level: CloudWatchLogsServiceImpl                                       │
│       ↓ depends on abstraction                                               │
│  Interface: HttpTransport trait (from shared)                                │
│       ↑ implements                                                           │
│  Low-level: ReqwestHttpTransport                                             │
│                                                                              │
│  High-level: CloudWatchLogsServiceImpl                                       │
│       ↓ depends on abstraction                                               │
│  Interface: AwsSigner trait (from aws/signing)                               │
│       ↑ implements                                                           │
│  Low-level: AwsSignerV4Impl (service: "logs")                                │
│                                                                              │
│  High-level: CloudWatchLogsServiceImpl                                       │
│       ↓ depends on abstraction                                               │
│  Interface: CredentialsProvider trait (from aws/credentials)                 │
│       ↑ implements                                                           │
│  Low-level: ChainCredentialsProvider (Env → Profile → IMDS)                  │
│                                                                              │
│  High-level: CloudWatchLogsServiceImpl                                       │
│       ↓ depends on abstraction                                               │
│  Interface: ResilienceOrchestrator (from shared/resilience)                  │
│       ↑ implements                                                           │
│  Low-level: RetryExecutor + CircuitBreaker + RateLimiter                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. C4 Model Diagrams

### 3.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌───────────────────────────┐
                        │      Application          │
                        │      Developer            │
                        │                           │
                        │  Uses CloudWatch Logs     │
                        │  module to:               │
                        │  • Emit structured logs   │
                        │  • Query with Insights    │
                        │  • Correlate across svcs  │
                        └─────────────┬─────────────┘
                                      │
                                      │ Uses
                                      ▼
┌───────────────────┐    ┌───────────────────────────┐    ┌───────────────────┐
│                   │    │                           │    │                   │
│  Shared AWS       │◄───│   CloudWatch Logs         │───►│  AWS CloudWatch   │
│  Modules          │    │   Integration Module      │    │  Logs Service     │
│                   │    │                           │    │                   │
│  • aws/credentials│    │  Thin adapter providing:  │    │ • PutLogEvents    │
│  • aws/signing    │    │  • Structured logging     │    │ • GetLogEvents    │
│                   │    │  • Insights queries       │    │ • FilterLogEvents │
│                   │    │  • Cross-svc correlation  │    │ • StartQuery      │
│                   │    │  • Retention mgmt         │    │ • GetQueryResults │
│                   │    │  • Simulation/replay      │    │ • CreateLogGroup  │
│                   │    │                           │    │ • PutRetention    │
│                   │    │  Rust + TypeScript        │    │                   │
└───────────────────┘    └───────────────────────────┘    └───────────────────┘
         │                            │
         │                            │ Uses
         │                            ▼
         │               ┌───────────────────────────┐
         │               │   Shared Infrastructure   │
         │               │                           │
         └──────────────►│  • shared/resilience     │
                         │  • shared/observability   │
                         │  • integrations-logging   │
                         │  • integrations-tracing   │
                         └───────────────────────────┘
```

### 3.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTAINER DIAGRAM                               │
│                    CloudWatch Logs Integration Module                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      CloudWatch Logs Integration Module                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          Public API Container                        │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ CloudWatch   │  │ Service      │  │ Configuration│             │    │
│  │   │ Logs Client  │  │ Accessors    │  │ Builder      │             │    │
│  │   │ Factory      │  │              │  │              │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Services Container                            │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ LogEvents    │  │ Insights     │  │ LogGroups    │             │    │
│  │   │ Service      │  │ Service      │  │ Service      │             │    │
│  │   │              │  │              │  │              │             │    │
│  │   │ • put        │  │ • startQuery │  │ • create     │             │    │
│  │   │ • putStruct  │  │ • getResults │  │ • delete     │             │    │
│  │   │ • filter     │  │ • query      │  │ • describe   │             │    │
│  │   │ • filterAll  │  │ • byTraceId  │  │ • listAll    │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ LogStreams   │  │ Retention    │  │ Subscription │             │    │
│  │   │ Service      │  │ Service      │  │ Service      │             │    │
│  │   │              │  │              │  │              │             │    │
│  │   │ • create     │  │ • set        │  │ • put        │             │    │
│  │   │ • delete     │  │ • remove     │  │ • describe   │             │    │
│  │   │ • describe   │  │ • get        │  │ • delete     │             │    │
│  │   │ • ensure     │  │              │  │              │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Infrastructure Container                         │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Batch        │  │ Correlation  │  │ Simulation   │             │    │
│  │   │ Buffer       │  │ Engine       │  │ Service      │             │    │
│  │   │              │  │              │  │              │             │    │
│  │   │ • add        │  │ • parse      │  │ • generate   │             │    │
│  │   │ • flush      │  │ • correlate  │  │ • replay     │             │    │
│  │   │ • flushAll   │  │ • group      │  │ • mockStream │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│   aws/credentials    │  │   aws/signing        │  │  shared/resilience   │
│   (reuse)            │  │   (reuse)            │  │  (reuse)             │
│                      │  │                      │  │                      │
│ • ChainProvider      │  │ • SigV4 Signer       │  │ • RetryExecutor      │
│ • EnvProvider        │  │ • service: "logs"    │  │ • CircuitBreaker     │
│ • ProfileProvider    │  │ • Request signing    │  │ • RateLimiter        │
│ • IMDSProvider       │  │                      │  │                      │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### 3.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPONENT ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         CloudWatchLogsClientImpl                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Service Registry                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │  LogEvents  │ │  Insights   │ │  LogGroups  │ │  LogStreams │     │  │
│  │  │   Service   │ │   Service   │ │   Service   │ │   Service   │     │  │
│  │  │             │ │             │ │             │ │             │     │  │
│  │  │ • put       │ │ • start     │ │ • create    │ │ • create    │     │  │
│  │  │ • putStruct │ │ • getRes    │ │ • delete    │ │ • delete    │     │  │
│  │  │ • filter    │ │ • query     │ │ • describe  │ │ • ensure    │     │  │
│  │  │ • filterAll │ │ • byTrace   │ │ • listAll   │ │ • describe  │     │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘     │  │
│  │         │               │               │               │             │  │
│  │  ┌──────┴──────┐ ┌──────┴──────┐                                     │  │
│  │  │  Retention  │ │ Subscription│                                     │  │
│  │  │   Service   │ │   Service   │                                     │  │
│  │  │             │ │             │                                     │  │
│  │  │ • set       │ │ • put       │                                     │  │
│  │  │ • remove    │ │ • describe  │                                     │  │
│  │  │ • get       │ │ • delete    │                                     │  │
│  │  └──────┬──────┘ └──────┬──────┘                                     │  │
│  │         │               │                                             │  │
│  └─────────┼───────────────┼─────────────────────────────────────────────┘  │
│            │               │                                                 │
│            └───────────────┴───────────────┬─────────────────────────────┘   │
│                                            │                                 │
│                                            ▼                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Shared Infrastructure                             │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │  │
│  │  │   Resilience    │  │   HTTP          │  │   AWS           │        │  │
│  │  │   Orchestrator  │  │   Transport     │  │   Signer        │        │  │
│  │  │   (shared)      │  │   (shared)      │  │   (shared)      │        │  │
│  │  │                 │  │                 │  │                 │        │  │
│  │  │ • Retry         │  │ • Connection    │  │ • SigV4         │        │  │
│  │  │ • Rate Limit    │  │ • TLS 1.2+      │  │ • service: logs │        │  │
│  │  │ • Circuit Break │  │ • JSON-RPC      │  │                 │        │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │  │
│  │           │                    │                    │                  │  │
│  │  ┌────────┴────────┐  ┌────────┴────────┐                             │  │
│  │  │   Batch         │  │  Correlation    │                             │  │
│  │  │   Buffer        │  │  Engine         │                             │  │
│  │  │                 │  │                 │                             │  │
│  │  │ • add event     │  │ • parse event   │                             │  │
│  │  │ • flush         │  │ • extract IDs   │                             │  │
│  │  │ • background    │  │ • group         │                             │  │
│  │  └─────────────────┘  └─────────────────┘                             │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Component Architecture

### 4.1 Client Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CloudWatchLogsClient Component                           │
└─────────────────────────────────────────────────────────────────────────────┘

                           <<interface>>
                    ┌──────────────────────┐
                    │ CloudWatchLogsClient │
                    ├──────────────────────┤
                    │ + events()           │───► LogEventsService
                    │ + insights()         │───► InsightsService
                    │ + groups()           │───► LogGroupsService
                    │ + streams()          │───► LogStreamsService
                    │ + retention()        │───► RetentionService
                    │ + subscriptions()    │───► SubscriptionService
                    │ + metrics()          │───► MetricFilterService
                    │ + config()           │───► CloudWatchLogsConfig
                    └──────────┬───────────┘
                               △
                               │ implements
                               │
                    ┌──────────┴───────────┐
                    │CloudWatchLogsClientImpl│
                    ├──────────────────────┤
                    │ - config             │
                    │ - transport          │◇───► Arc<dyn HttpTransport>
                    │ - signer             │◇───► Arc<dyn AwsSigner>
                    │ - credentials        │◇───► Arc<dyn CredentialsProvider>
                    │ - resilience         │◇───► Arc<ResilienceOrchestrator>
                    │ - observability      │◇───► ObservabilityContext
                    │ - endpoint           │
                    │ - batch_buffer       │◇───► Arc<BatchBuffer>
                    │ - events_service     │◇───┐
                    │ - insights_service   │◇───┤  lazy init
                    │ - groups_service     │◇───┤  (OnceCell)
                    │ - streams_service    │◇───┤
                    │ - retention_service  │◇───┘
                    └──────────────────────┘

Builder Pattern:
┌─────────────────────────────────────────────────────────────────────────────┐
│  CloudWatchLogsClient::builder()                                             │
│    .region("us-east-1")                                                      │
│    .credentials_provider(ChainCredentialsProvider::default())                │
│    .timeout(Duration::from_secs(30))                                         │
│    .batch_config(BatchConfig { max_events: 5000, ... })                      │
│    .with_resilience(ResilienceConfig { ... })                                │
│    .default_log_group("my-app-logs")                                         │
│    .default_retention(RetentionDays::Days30)                                 │
│    .build()?                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Service Pattern Template

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Service Implementation Pattern                         │
└─────────────────────────────────────────────────────────────────────────────┘

All services follow the same structural pattern:

┌─────────────────────────────────────────────────────────────────────────────┐
│                       ServiceImpl Template                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  struct ServiceImpl {                                                        │
│      transport: Arc<dyn HttpTransport>,    // Shared HTTP client             │
│      signer: Arc<dyn AwsSigner>,           // Shared request signing         │
│      resilience: Arc<ResilienceOrchestrator>, // Shared resilience          │
│      observability: ObservabilityContext,  // Shared logging/metrics         │
│      endpoint: String,                     // CloudWatch Logs endpoint       │
│  }                                                                           │
│                                                                              │
│  impl Service for ServiceImpl {                                              │
│      async fn operation(&self, request: Request) -> Result<Response> {       │
│          // 1. Create tracing span (shared observability)                    │
│          let span = self.observability.tracer.start_span("cloudwatch.op");   │
│                                                                              │
│          // 2. Validate input                                                │
│          validate_request(&request)?;                                        │
│                                                                              │
│          // 3. Build request body (JSON)                                     │
│          let body = serde_json::to_vec(&request)?;                          │
│                                                                              │
│          // 4. Build HTTP request with X-Amz-Target                          │
│          let http_request = build_cloudwatch_logs_request(                   │
│              action: "Logs_20140328.OperationName",                          │
│              endpoint: &self.endpoint,                                       │
│              body: body,                                                     │
│              signer: &self.signer                                            │
│          )?;                                                                 │
│                                                                              │
│          // 5. Execute with resilience (shared)                              │
│          let response = self.resilience.execute(|| async {                   │
│              self.transport.send(http_request).await                         │
│          }).await?;                                                          │
│                                                                              │
│          // 6. Parse response                                                │
│          let result = parse_response(response)?;                             │
│                                                                              │
│          // 7. Record metrics (shared observability)                         │
│          self.observability.metrics.record(...);                             │
│          span.end();                                                         │
│                                                                              │
│          Ok(result)                                                          │
│      }                                                                       │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Service Architecture

### 5.1 LogEventsService Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LogEventsService Architecture                           │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LogEventsService                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ + put(request: PutLogEventsRequest) -> Result<PutLogEventsResponse>         │
│ + put_structured(group, stream, event) -> Result<()>                        │
│ + get(request: GetLogEventsRequest) -> Result<GetLogEventsResponse>         │
│ + filter(request: FilterLogEventsRequest) -> Result<FilterLogEventsResponse>│
│ + filter_all(request) -> AsyncStream<FilteredLogEvent>                      │
└─────────────────────────────────────────────────────────────────────────────┘

Request Flow (put_structured):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  StructuredLogEvent                                                          │
│       │                                                                      │
│       │ 1. Inject correlation IDs from context                              │
│       ▼                                                                      │
│  ┌─────────────────┐                                                         │
│  │ Add trace_id    │◄── get_current_trace_id()                              │
│  │ Add request_id  │◄── get_current_request_id()                            │
│  │ Add span_id     │◄── get_current_span_id()                               │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           │ 2. Serialize to JSON                                             │
│           ▼                                                                  │
│  ┌─────────────────┐                                                         │
│  │ Validate size   │                                                         │
│  │ < 256KB         │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           │ 3. Add to batch buffer                                           │
│           ▼                                                                  │
│  ┌─────────────────┐                                                         │
│  │  Batch Buffer   │──── Background flush ────► CloudWatch Logs             │
│  │                 │                                                         │
│  │ (log_group,     │                                                         │
│  │  log_stream) -> │                                                         │
│  │  events[]       │                                                         │
│  └─────────────────┘                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 InsightsService Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       InsightsService Architecture                           │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                            InsightsService                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ + start_query(request) -> Result<StartQueryResponse>                        │
│ + get_results(query_id) -> Result<GetQueryResultsResponse>                  │
│ + stop_query(query_id) -> Result<()>                                        │
│ + query(request, timeout) -> Result<QueryResults>  [convenience]            │
│ + query_by_trace_id(groups, trace_id, range) -> Result<Vec<CorrelatedEvent>>│
│ + query_by_request_id(groups, request_id, range) -> Result<Vec<Correlated>>│
└─────────────────────────────────────────────────────────────────────────────┘

Query Execution Flow:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  query(request, timeout)                                                     │
│       │                                                                      │
│       │ 1. Start query                                                       │
│       ▼                                                                      │
│  ┌─────────────────┐                                                         │
│  │   StartQuery    │───► CloudWatch Logs                                    │
│  │                 │◄─── query_id                                           │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           │ 2. Poll for results                                              │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────┐                                │
│  │           Poll Loop                      │                                │
│  │                                          │                                │
│  │  WHILE elapsed < timeout DO              │                                │
│  │    response <- GetQueryResults(id)       │                                │
│  │                                          │                                │
│  │    MATCH status:                         │                                │
│  │      "Complete" -> return results        │                                │
│  │      "Failed"   -> return error          │                                │
│  │      "Running"  -> sleep(poll_interval)  │                                │
│  │                    poll_interval *= 2    │                                │
│  │  END WHILE                               │                                │
│  │                                          │                                │
│  │  timeout -> StopQuery(id), return error  │                                │
│  └─────────────────────────────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Correlation Query Flow:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  query_by_trace_id(log_groups, trace_id, time_range)                        │
│       │                                                                      │
│       │ 1. Build Insights query                                              │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  fields @timestamp, @message, @logStream, @log                       │    │
│  │  | filter @message like /"trace_id":\s*"{trace_id}"/                 │    │
│  │  | sort @timestamp asc                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       │ 2. Execute query                                                     │
│       ▼                                                                      │
│  ┌─────────────────┐                                                         │
│  │    query()      │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           │ 3. Parse results                                                 │
│           ▼                                                                  │
│  ┌─────────────────┐                                                         │
│  │  Parse JSON     │                                                         │
│  │  Extract fields │                                                         │
│  │  Build events   │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  Vec<CorrelatedLogEvent>                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 LogGroupsService Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LogGroupsService Architecture                           │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LogGroupsService                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ + create(request: CreateLogGroupRequest) -> Result<()>                      │
│ + delete(log_group_name: String) -> Result<()>                              │
│ + describe(request: DescribeLogGroupsRequest) -> Result<DescribeResponse>   │
│ + list_all(prefix: Option<String>) -> AsyncStream<LogGroup>                 │
│ + exists(log_group_name: String) -> Result<bool>                            │
└─────────────────────────────────────────────────────────────────────────────┘

API Endpoints:
┌─────────────────────────────────────────────────────────────────────────────┐
│  POST https://logs.{region}.amazonaws.com/                                   │
│  Content-Type: application/x-amz-json-1.1                                    │
│  X-Amz-Target: Logs_20140328.CreateLogGroup                                  │
│                                                                              │
│  Request:                           Response:                                │
│  {                                  (empty on success)                       │
│    "logGroupName": "my-app-logs",                                            │
│    "kmsKeyId": "arn:aws:kms:...",   (optional)                              │
│    "tags": { "env": "prod" },       (optional)                              │
│    "logGroupClass": "STANDARD"      (optional)                              │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 RetentionService Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RetentionService Architecture                          │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RetentionService                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ + set(log_group_name: String, retention_days: RetentionDays) -> Result<()>  │
│ + remove(log_group_name: String) -> Result<()>                              │
│ + get(log_group_name: String) -> Result<Option<RetentionDays>>              │
└─────────────────────────────────────────────────────────────────────────────┘

Valid Retention Days (Enum):
┌─────────────────────────────────────────────────────────────────────────────┐
│  RetentionDays:                                                              │
│  ├── Days1, Days3, Days5, Days7, Days14, Days30                             │
│  ├── Days60, Days90, Days120, Days150, Days180                              │
│  ├── Days365, Days400, Days545, Days731                                     │
│  └── Days1096, Days1827, Days2192, Days2557, Days2922, Days3288, Days3653   │
│                                                                              │
│  Note: Using an enum ensures only valid values can be passed.                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow Architecture

### 6.1 Log Emission Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LOG EMISSION DATA FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

Application                       CloudWatch Logs Module               AWS
    │                                     │                            │
    │ put_structured(event)               │                            │
    ├────────────────────────────────────►│                            │
    │                                     │                            │
    │                      ┌──────────────┴──────────────┐             │
    │                      │                             │             │
    │                      │  1. Inject correlation IDs  │             │
    │                      │  2. Serialize to JSON       │             │
    │                      │  3. Validate size < 256KB   │             │
    │                      │  4. Add to batch buffer     │             │
    │                      │                             │             │
    │                      └──────────────┬──────────────┘             │
    │                                     │                            │
    │ Ok(())                              │                            │
    │◄────────────────────────────────────┤                            │
    │                                     │                            │
    │                           (async)   │                            │
    │                      ┌──────────────┴──────────────┐             │
    │                      │                             │             │
    │                      │  Batch Buffer Flush:        │             │
    │                      │  - on max_events reached    │             │
    │                      │  - on max_bytes reached     │             │
    │                      │  - on flush_interval        │             │
    │                      │                             │             │
    │                      └──────────────┬──────────────┘             │
    │                                     │                            │
    │                                     │ PutLogEvents               │
    │                                     ├───────────────────────────►│
    │                                     │                            │
    │                                     │         200 OK             │
    │                                     │◄───────────────────────────┤
    │                                     │                            │
```

### 6.2 Insights Query Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INSIGHTS QUERY DATA FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

Application                       CloudWatch Logs Module               AWS
    │                                     │                            │
    │ query_by_trace_id(trace_id)         │                            │
    ├────────────────────────────────────►│                            │
    │                                     │                            │
    │                      ┌──────────────┴──────────────┐             │
    │                      │                             │             │
    │                      │  Build Insights Query:      │             │
    │                      │  fields @timestamp, ...     │             │
    │                      │  | filter @message like ... │             │
    │                      │                             │             │
    │                      └──────────────┬──────────────┘             │
    │                                     │                            │
    │                                     │ StartQuery                 │
    │                                     ├───────────────────────────►│
    │                                     │                            │
    │                                     │     { queryId: "abc" }     │
    │                                     │◄───────────────────────────┤
    │                                     │                            │
    │                      ┌──────────────┴──────────────┐             │
    │                      │                             │             │
    │                      │  Poll Loop:                 │             │
    │                      │                             │             │
    │                      └──────────────┬──────────────┘             │
    │                                     │                            │
    │                                     │ GetQueryResults            │
    │                                     ├───────────────────────────►│
    │                                     │     { status: "Running" }  │
    │                                     │◄───────────────────────────┤
    │                                     │                            │
    │                         sleep(500ms)│                            │
    │                                     │                            │
    │                                     │ GetQueryResults            │
    │                                     ├───────────────────────────►│
    │                                     │   { status: "Complete",    │
    │                                     │     results: [...] }       │
    │                                     │◄───────────────────────────┤
    │                                     │                            │
    │                      ┌──────────────┴──────────────┐             │
    │                      │                             │             │
    │                      │  Parse & correlate results  │             │
    │                      │                             │             │
    │                      └──────────────┬──────────────┘             │
    │                                     │                            │
    │ Vec<CorrelatedLogEvent>             │                            │
    │◄────────────────────────────────────┤                            │
    │                                     │                            │
```

---

## 7. Batch Buffer Architecture

### 7.1 Batch Buffer Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BATCH BUFFER ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              BatchBuffer                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           Config                                     │    │
│  │  max_events: 10,000                                                  │    │
│  │  max_bytes: 1,048,576 (1MB)                                          │    │
│  │  flush_interval: 5s                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Buffer Map (per stream)                          │    │
│  │                                                                      │    │
│  │  HashMap<(log_group, log_stream), Vec<BatchEvent>>                   │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────┐                       │    │
│  │  │ ("app-logs", "web-server-1")             │                       │    │
│  │  │   events: [event1, event2, event3, ...]  │                       │    │
│  │  │   size: 45,230 bytes                     │                       │    │
│  │  └──────────────────────────────────────────┘                       │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────┐                       │    │
│  │  │ ("app-logs", "api-server-1")             │                       │    │
│  │  │   events: [event1, event2, ...]          │                       │    │
│  │  │   size: 12,450 bytes                     │                       │    │
│  │  └──────────────────────────────────────────┘                       │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Background Flush Task                             │    │
│  │                                                                      │    │
│  │  LOOP:                                                               │    │
│  │    SELECT:                                                           │    │
│  │      - interval.tick() => flush_all()                                │    │
│  │      - flush_signal.recv() => flush(log_group, log_stream)           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Flush Triggers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUSH TRIGGER CONDITIONS                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  add(event) ─────────────────────────────────────────────────────────────┐  │
│       │                                                                  │  │
│       ▼                                                                  │  │
│  ┌─────────────────────────────────────────────────────────────────┐    │  │
│  │                    Threshold Check                               │    │  │
│  │                                                                  │    │  │
│  │  IF buffer.events.len() + 1 > max_events                        │    │  │
│  │     OR buffer.size + event_size > max_bytes                     │    │  │
│  │  THEN                                                            │    │  │
│  │     send(FlushSignal)  ───────────────────────────────►  FLUSH  │    │  │
│  │  END IF                                                          │    │  │
│  │                                                                  │    │  │
│  │  buffer.add(event)                                               │    │  │
│  │                                                                  │    │  │
│  └─────────────────────────────────────────────────────────────────┘    │  │
│                                                                          │  │
│                                                                          │  │
│  Background Timer ───────────────────────────────────────────────────────┘  │
│       │                                                                      │
│       │ every flush_interval (default 5s)                                    │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    Periodic Flush                                │        │
│  │                                                                  │        │
│  │  FOR EACH (stream_key, events) IN buffers DO                     │        │
│  │     IF events.len() > 0 THEN                                     │        │
│  │        PutLogEvents(events)  ─────────────────────────►  FLUSH  │        │
│  │     END IF                                                       │        │
│  │  END FOR                                                         │        │
│  │                                                                  │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Correlation Engine Architecture

### 8.1 Correlation ID Injection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CORRELATION ID INJECTION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Request Context (Thread-Local / Async Context)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  trace_id: "abc-123-def-456"                                         │    │
│  │  request_id: "req-789-xyz"                                           │    │
│  │  span_id: "span-001"                                                 │    │
│  │  service: "auth-service"                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       │ get_current_*()                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    StructuredLogEvent                                │    │
│  │                                                                      │    │
│  │  Application provides:                                               │    │
│  │    level: LogLevel::Info                                             │    │
│  │    message: "User authenticated"                                     │    │
│  │    fields: { "user_id": "user-123" }                                 │    │
│  │                                                                      │    │
│  │  Module injects (if not provided):                                   │    │
│  │    trace_id: "abc-123-def-456"      ◄── from context                 │    │
│  │    request_id: "req-789-xyz"        ◄── from context                 │    │
│  │    span_id: "span-001"              ◄── from context                 │    │
│  │    timestamp: 1702456200000         ◄── generated                    │    │
│  │    service: "auth-service"          ◄── from context/config          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       │ serialize                                                            │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  {                                                                   │    │
│  │    "level": "INFO",                                                  │    │
│  │    "message": "User authenticated",                                  │    │
│  │    "timestamp": "2025-12-13T10:30:00Z",                              │    │
│  │    "trace_id": "abc-123-def-456",                                    │    │
│  │    "request_id": "req-789-xyz",                                      │    │
│  │    "span_id": "span-001",                                            │    │
│  │    "service": "auth-service",                                        │    │
│  │    "user_id": "user-123"                                             │    │
│  │  }                                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Cross-Service Correlation Query

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CROSS-SERVICE CORRELATION QUERY                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  query_by_trace_id(                                                          │
│    log_groups: ["auth-logs", "api-logs", "db-logs"],                        │
│    trace_id: "abc-123",                                                      │
│    time_range: { start: T-1h, end: T }                                       │
│  )                                                                           │
│       │                                                                      │
│       │ 1. Build Insights Query                                              │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  fields @timestamp, @message, @logStream, @log                       │    │
│  │  | filter @message like /"trace_id":\s*"abc-123"/                    │    │
│  │  | sort @timestamp asc                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       │ 2. Execute across all log groups                                     │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    CloudWatch Logs Insights                          │    │
│  │                                                                      │    │
│  │  Searches: auth-logs, api-logs, db-logs                              │    │
│  │  Time range: T-1h to T                                               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       │ 3. Parse and correlate results                                       │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Vec<CorrelatedLogEvent>                                             │    │
│  │                                                                      │    │
│  │  [                                                                   │    │
│  │    { timestamp: T-55m, service: "api", message: "Request received" },│    │
│  │    { timestamp: T-54m, service: "auth", message: "Auth check" },     │    │
│  │    { timestamp: T-53m, service: "db", message: "Query executed" },   │    │
│  │    { timestamp: T-52m, service: "api", message: "Response sent" }    │    │
│  │  ]                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Module Structure

### 9.1 High-Level Module Organization

```
integrations/
├── aws/
│   ├── cloudwatch-logs/              # CloudWatch Logs Integration Module
│   │   ├── rust/                     # Rust implementation
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │
│   │   ├── typescript/               # TypeScript implementation
│   │   │   ├── package.json
│   │   │   └── src/
│   │   │
│   │   └── tests/                    # Shared test fixtures
│   │       └── fixtures/
│   │
│   ├── ses/                          # Existing (reuse patterns)
│   ├── s3/                           # Existing (reuse patterns)
│   ├── bedrock/                      # Existing (reuse patterns)
│   ├── credentials/                  # SHARED - credential chain
│   └── signing/                      # SHARED - SigV4 signing
│
├── shared/
│   ├── resilience/                   # SHARED - retry, CB, rate limit
│   ├── observability/                # SHARED - logging, metrics, tracing
│   └── database/                     # SHARED - RuvVector connectivity
│
└── plans/
    └── cloudwatch-logs/              # SPARC documentation
        ├── specification-cloudwatch-logs.md
        ├── pseudocode-cloudwatch-logs.md
        ├── architecture-cloudwatch-logs.md
        └── ...
```

---

## 10. Rust Crate Organization

### 10.1 Crate Structure

```
aws/cloudwatch-logs/rust/
├── Cargo.toml
├── src/
│   ├── lib.rs                       # Crate root, re-exports
│   │
│   ├── client/                      # Client module
│   │   ├── mod.rs
│   │   ├── config.rs                # CloudWatchLogsConfig
│   │   ├── factory.rs               # Client factory functions
│   │   └── client_impl.rs           # CloudWatchLogsClientImpl
│   │
│   ├── services/                    # Service implementations
│   │   ├── mod.rs
│   │   ├── events/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # LogEventsServiceImpl
│   │   │   ├── types.rs             # Request/Response types
│   │   │   └── structured.rs        # Structured log handling
│   │   │
│   │   ├── insights/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # InsightsServiceImpl
│   │   │   ├── types.rs             # Query types
│   │   │   └── polling.rs           # Query polling logic
│   │   │
│   │   ├── groups/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # LogGroupsServiceImpl
│   │   │   └── types.rs
│   │   │
│   │   ├── streams/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # LogStreamsServiceImpl
│   │   │   └── types.rs
│   │   │
│   │   ├── retention/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # RetentionServiceImpl
│   │   │   └── types.rs             # RetentionDays enum
│   │   │
│   │   └── subscriptions/
│   │       ├── mod.rs
│   │       ├── service.rs           # SubscriptionServiceImpl
│   │       └── types.rs
│   │
│   ├── buffer/                      # Batch buffer
│   │   ├── mod.rs
│   │   ├── buffer.rs                # BatchBuffer implementation
│   │   ├── flush.rs                 # Flush task
│   │   └── types.rs                 # BatchEvent, BatchConfig
│   │
│   ├── correlation/                 # Correlation engine
│   │   ├── mod.rs
│   │   ├── engine.rs                # CorrelationEngine
│   │   ├── parser.rs                # Parse correlated events
│   │   └── types.rs                 # CorrelatedLogEvent
│   │
│   ├── simulation/                  # Testing support
│   │   ├── mod.rs
│   │   ├── service.rs               # SimulationServiceImpl
│   │   ├── generator.rs             # Mock event generation
│   │   ├── replay.rs                # Log replay
│   │   └── mock_stream.rs           # MockLogStream
│   │
│   ├── errors/                      # Error types
│   │   ├── mod.rs
│   │   ├── error.rs                 # CloudWatchLogsError enum
│   │   └── mapping.rs               # AWS error code mapping
│   │
│   ├── validation/                  # Input validation
│   │   ├── mod.rs
│   │   ├── log_group.rs             # Log group name validation
│   │   ├── log_stream.rs            # Log stream name validation
│   │   └── events.rs                # Event validation
│   │
│   └── types/                       # Shared types
│       ├── mod.rs
│       ├── common.rs                # LogLevel, TimeRange, etc.
│       └── retention.rs             # RetentionDays
│
├── tests/                           # Integration tests
│   ├── common/
│   │   └── mod.rs                   # Test utilities
│   │
│   ├── events_tests.rs
│   ├── insights_tests.rs
│   ├── groups_tests.rs
│   ├── retention_tests.rs
│   └── correlation_tests.rs
│
└── examples/                        # Usage examples
    ├── put_structured_logs.rs
    ├── query_by_trace_id.rs
    ├── manage_retention.rs
    ├── filter_logs.rs
    └── simulation.rs
```

### 10.2 Cargo.toml

```toml
[package]
name = "integrations-aws-cloudwatch-logs"
version = "0.1.0"
edition = "2021"
description = "AWS CloudWatch Logs Integration Module"
license = "LLMDevOps-PSACL-1.0"

[dependencies]
# Shared AWS modules (REUSE)
integrations-aws-credentials = { path = "../../credentials" }
integrations-aws-signing = { path = "../../signing" }

# Shared infrastructure (REUSE)
integrations-resilience = { path = "../../../shared/resilience" }
integrations-observability = { path = "../../../shared/observability" }
integrations-logging = { path = "../../../shared/logging" }
integrations-tracing = { path = "../../../shared/tracing" }

# Approved third-party dependencies
tokio = { version = "1.0", features = ["rt-multi-thread", "macros", "time", "sync"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
bytes = "1.0"
futures = "0.3"
async-trait = "0.1"
thiserror = "1.0"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.0", features = ["v4"] }

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.6"

[features]
default = []
full = ["simulation"]
simulation = []

[[example]]
name = "put_structured_logs"
path = "examples/put_structured_logs.rs"

[[example]]
name = "query_by_trace_id"
path = "examples/query_by_trace_id.rs"
```

### 10.3 Module Visibility and Re-exports

```rust
// src/lib.rs

//! AWS CloudWatch Logs Integration Module
//!
//! Provides structured logging, querying, and cross-service correlation
//! for AWS CloudWatch Logs.
//!
//! # Example
//!
//! ```rust
//! use integrations_aws_cloudwatch_logs::{
//!     CloudWatchLogsClient, StructuredLogEvent, LogLevel
//! };
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = integrations_aws_cloudwatch_logs::from_env()?;
//!
//!     // Put structured log
//!     client.events().put_structured(
//!         "my-app-logs",
//!         "web-server-1",
//!         StructuredLogEvent {
//!             level: LogLevel::Info,
//!             message: "Request processed".to_string(),
//!             ..Default::default()
//!         }
//!     ).await?;
//!
//!     // Query by trace ID
//!     let events = client.insights().query_by_trace_id(
//!         vec!["my-app-logs".to_string()],
//!         "trace-123",
//!         TimeRange::last_hour(),
//!     ).await?;
//!
//!     Ok(())
//! }
//! ```

// Re-export public API
pub use client::{CloudWatchLogsClient, CloudWatchLogsConfig};
pub use errors::CloudWatchLogsError;

// Service interfaces
pub use services::events::{LogEventsService, PutLogEventsRequest, FilterLogEventsRequest};
pub use services::insights::{InsightsService, StartQueryRequest, QueryResults};
pub use services::groups::{LogGroupsService, CreateLogGroupRequest};
pub use services::streams::{LogStreamsService, CreateLogStreamRequest};
pub use services::retention::{RetentionService, RetentionDays};

// Correlation types
pub use correlation::{CorrelatedLogEvent, CorrelationEngine};

// Common types
pub use types::{LogLevel, StructuredLogEvent, TimeRange};

// Buffer types (for advanced usage)
pub use buffer::{BatchBuffer, BatchConfig};

// Simulation (feature-gated)
#[cfg(feature = "simulation")]
pub use simulation::{SimulationService, MockLogStream, ReplaySource, ReplayTarget};

// Factory functions
pub fn create(config: CloudWatchLogsConfig) -> Result<impl CloudWatchLogsClient, CloudWatchLogsError> {
    client::factory::create_cloudwatch_logs_client(config)
}

pub fn from_env() -> Result<impl CloudWatchLogsClient, CloudWatchLogsError> {
    client::factory::create_cloudwatch_logs_client_from_env()
}

// Internal modules
mod client;
mod services;
mod buffer;
mod correlation;
mod errors;
mod validation;
mod types;

#[cfg(feature = "simulation")]
mod simulation;
```

---

## 11. TypeScript Package Organization

### 11.1 Package Structure

```
aws/cloudwatch-logs/typescript/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
│
├── src/
│   ├── index.ts                     # Package entry, re-exports
│   │
│   ├── client/
│   │   ├── index.ts
│   │   ├── config.ts                # CloudWatchLogsConfig interface
│   │   ├── factory.ts               # createCloudWatchLogsClient()
│   │   └── client-impl.ts           # CloudWatchLogsClientImpl
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── events/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # LogEventsServiceImpl
│   │   │   ├── types.ts
│   │   │   └── structured.ts
│   │   │
│   │   ├── insights/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # InsightsServiceImpl
│   │   │   ├── types.ts
│   │   │   └── polling.ts
│   │   │
│   │   ├── groups/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── streams/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   │
│   │   └── retention/
│   │       ├── index.ts
│   │       ├── service.ts
│   │       └── types.ts
│   │
│   ├── buffer/
│   │   ├── index.ts
│   │   ├── buffer.ts                # BatchBuffer
│   │   ├── flush.ts
│   │   └── types.ts
│   │
│   ├── correlation/
│   │   ├── index.ts
│   │   ├── engine.ts
│   │   ├── parser.ts
│   │   └── types.ts
│   │
│   ├── simulation/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   ├── generator.ts
│   │   ├── replay.ts
│   │   └── mock-stream.ts
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   ├── error.ts
│   │   └── mapping.ts
│   │
│   ├── validation/
│   │   ├── index.ts
│   │   └── validators.ts
│   │
│   └── types/
│       ├── index.ts
│       └── common.ts
│
├── tests/
│   ├── unit/
│   │   ├── events.test.ts
│   │   ├── insights.test.ts
│   │   ├── buffer.test.ts
│   │   └── correlation.test.ts
│   │
│   └── integration/
│       └── mock-server.test.ts
│
└── examples/
    ├── put-structured-logs.ts
    ├── query-by-trace-id.ts
    ├── manage-retention.ts
    └── simulation.ts
```

### 11.2 package.json

```json
{
  "name": "@integrations/aws-cloudwatch-logs",
  "version": "0.1.0",
  "description": "AWS CloudWatch Logs Integration Module",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./simulation": {
      "import": "./dist/simulation/index.mjs",
      "require": "./dist/simulation/index.js",
      "types": "./dist/simulation/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@integrations/aws-credentials": "workspace:*",
    "@integrations/aws-signing": "workspace:*",
    "@integrations/resilience": "workspace:*",
    "@integrations/observability": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "msw": "^2.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 11.3 Module Exports (index.ts)

```typescript
// src/index.ts

/**
 * AWS CloudWatch Logs Integration Module
 *
 * Provides structured logging, querying, and cross-service correlation
 * for AWS CloudWatch Logs.
 *
 * @example
 * ```typescript
 * import { createCloudWatchLogsClient, LogLevel } from '@integrations/aws-cloudwatch-logs';
 *
 * const client = createCloudWatchLogsClient({ region: 'us-east-1' });
 *
 * // Put structured log
 * await client.events.putStructured('my-app-logs', 'web-server-1', {
 *   level: LogLevel.Info,
 *   message: 'Request processed',
 * });
 *
 * // Query by trace ID
 * const events = await client.insights.queryByTraceId(
 *   ['my-app-logs'],
 *   'trace-123',
 *   { start: new Date(Date.now() - 3600000), end: new Date() }
 * );
 * ```
 *
 * @packageDocumentation
 */

// Client exports
export { CloudWatchLogsClient, CloudWatchLogsConfig } from './client';
export { createCloudWatchLogsClient, createCloudWatchLogsClientFromEnv } from './client/factory';

// Error exports
export { CloudWatchLogsError } from './errors';
export type {
  ConfigurationError,
  AuthenticationError,
  ResourceError,
  RequestError,
  QueryError,
  RateLimitError,
  ServerError,
} from './errors';

// Service interfaces
export type {
  LogEventsService,
  InsightsService,
  LogGroupsService,
  LogStreamsService,
  RetentionService,
} from './services';

// Request/Response types
export type {
  PutLogEventsRequest,
  PutLogEventsResponse,
  FilterLogEventsRequest,
  FilterLogEventsResponse,
  GetLogEventsRequest,
  GetLogEventsResponse,
  StartQueryRequest,
  StartQueryResponse,
  QueryResults,
  CreateLogGroupRequest,
  DescribeLogGroupsRequest,
  DescribeLogGroupsResponse,
  CreateLogStreamRequest,
  DescribeLogStreamsRequest,
  DescribeLogStreamsResponse,
} from './services';

// Correlation types
export type { CorrelatedLogEvent, CorrelationGroup } from './correlation';

// Common types
export { LogLevel, RetentionDays } from './types';
export type { StructuredLogEvent, TimeRange, LogGroup, LogStream } from './types';

// Buffer types (for advanced usage)
export type { BatchBuffer, BatchConfig, BatchEvent } from './buffer';
```

---

## 12. Testing Architecture

### 12.1 Test Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TESTING ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Unit Tests                                                                  │
│  ├── Buffer management                                                       │
│  │   ├── add events to buffer                                               │
│  │   ├── flush on threshold                                                 │
│  │   └── concurrent access                                                  │
│  │                                                                          │
│  ├── Correlation engine                                                      │
│  │   ├── parse structured events                                            │
│  │   ├── extract correlation IDs                                            │
│  │   └── group by correlation                                               │
│  │                                                                          │
│  ├── Validation                                                              │
│  │   ├── log group name validation                                          │
│  │   ├── log stream name validation                                         │
│  │   ├── event size validation                                              │
│  │   └── retention days validation                                          │
│  │                                                                          │
│  └── Request/Response serialization                                         │
│      ├── JSON serialization                                                 │
│      └── Error mapping                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Integration Tests (Mock Server)                                             │
│  ├── Log events operations                                                   │
│  │   ├── put_log_events success                                             │
│  │   ├── put_log_events with batch limits                                   │
│  │   └── filter_log_events with pagination                                  │
│  │                                                                          │
│  ├── Insights queries                                                        │
│  │   ├── start_query -> poll -> complete                                    │
│  │   ├── query timeout handling                                             │
│  │   └── query_by_trace_id correlation                                      │
│  │                                                                          │
│  ├── Log group management                                                    │
│  │   ├── create/delete log groups                                           │
│  │   └── describe with pagination                                           │
│  │                                                                          │
│  └── Retention management                                                    │
│      ├── set retention policy                                               │
│      └── remove retention policy                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Simulation Tests                                                            │
│  ├── Mock log stream                                                         │
│  │   ├── put and get events                                                 │
│  │   ├── subscribe to events                                                │
│  │   └── filter events                                                      │
│  │                                                                          │
│  ├── Event generation                                                        │
│  │   ├── generate events with templates                                     │
│  │   └── error injection                                                    │
│  │                                                                          │
│  └── Replay                                                                  │
│      ├── replay from memory                                                 │
│      └── time scaling                                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Mock Server Setup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MOCK SERVER ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Mock CloudWatch Logs Server                                                 │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                    Request Router                                  │      │
│  │                                                                    │      │
│  │  POST / with X-Amz-Target header                                   │      │
│  │                                                                    │      │
│  │  Route by X-Amz-Target:                                           │      │
│  │  ├── Logs_20140328.PutLogEvents     -> handle_put_log_events()   │      │
│  │  ├── Logs_20140328.GetLogEvents     -> handle_get_log_events()   │      │
│  │  ├── Logs_20140328.FilterLogEvents  -> handle_filter_events()    │      │
│  │  ├── Logs_20140328.StartQuery       -> handle_start_query()      │      │
│  │  ├── Logs_20140328.GetQueryResults  -> handle_get_results()      │      │
│  │  ├── Logs_20140328.CreateLogGroup   -> handle_create_group()     │      │
│  │  ├── Logs_20140328.DeleteLogGroup   -> handle_delete_group()     │      │
│  │  ├── Logs_20140328.DescribeLogGroups-> handle_describe_groups()  │      │
│  │  ├── Logs_20140328.CreateLogStream  -> handle_create_stream()    │      │
│  │  ├── Logs_20140328.PutRetentionPolicy-> handle_put_retention()   │      │
│  │  └── ...                                                         │      │
│  │                                                                    │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                    In-Memory State                                 │      │
│  │                                                                    │      │
│  │  log_groups: HashMap<String, LogGroup>                            │      │
│  │  log_streams: HashMap<(String, String), LogStream>                │      │
│  │  log_events: HashMap<(String, String), Vec<LogEvent>>             │      │
│  │  queries: HashMap<String, QueryState>                              │      │
│  │                                                                    │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial architecture |

---

**End of Architecture Phase**

*Next: Refinement phase will provide implementation details and code examples.*
