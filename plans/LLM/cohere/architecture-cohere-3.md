# Architecture: Cohere Integration Module - Part 3

**Integration, Observability, Security, Deployment**

**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/cohere`
**SPARC Phase:** Architecture (3 of 3)

---

## Table of Contents

14. [Primitive Integration](#14-primitive-integration)
15. [Observability Architecture](#15-observability-architecture)
16. [Security Architecture](#16-security-architecture)
17. [Testing Architecture](#17-testing-architecture)
18. [Deployment Architecture](#18-deployment-architecture)
19. [API Reference Summary](#19-api-reference-summary)

---

## 14. Primitive Integration

### 14.1 Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PRIMITIVE DEPENDENCY GRAPH                          │
│                                                                          │
│                      ┌─────────────────────┐                             │
│                      │ integrations-cohere │                             │
│                      └──────────┬──────────┘                             │
│                                 │                                        │
│         ┌───────────────────────┼───────────────────────┐               │
│         │           │           │           │           │               │
│         ▼           ▼           ▼           ▼           ▼               │
│  ┌───────────┐┌───────────┐┌───────────┐┌───────────┐┌───────────┐      │
│  │  errors   ││  retry    ││ circuit-  ││ rate-     ││  tracing  │      │
│  │           ││           ││ breaker   ││ limit     ││           │      │
│  └───────────┘└───────────┘└───────────┘└───────────┘└───────────┘      │
│         │           │           │           │           │               │
│         └───────────┴───────────┼───────────┴───────────┘               │
│                                 │                                        │
│                                 ▼                                        │
│                          ┌───────────┐                                   │
│                          │  logging  │                                   │
│                          └───────────┘                                   │
│                                 │                                        │
│                                 ▼                                        │
│         ┌───────────────────────┼───────────────────────┐               │
│         │                       │                       │               │
│         ▼                       ▼                       ▼               │
│  ┌───────────┐           ┌───────────┐           ┌───────────┐          │
│  │   types   │           │  config   │           │ (external) │          │
│  │           │           │           │           │   crates   │          │
│  └───────────┘           └───────────┘           └───────────┘          │
│                                                                          │
│  Legend:                                                                 │
│  ─────────────────────────────────────────────────────────────          │
│  integrations-* : Internal workspace primitives                          │
│  (external)     : External crates (tokio, serde, etc.)                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Primitive Usage Patterns

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PRIMITIVE USAGE PATTERNS                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    integrations-errors                           │    │
│  │                                                                  │    │
│  │  // Base error trait                                             │    │
│  │  use integrations_errors::{IntegrationError, ErrorKind};         │    │
│  │                                                                  │    │
│  │  // CohereError implements Into<IntegrationError>                │    │
│  │  impl From<CohereError> for IntegrationError {                   │    │
│  │    fn from(err: CohereError) -> Self {                           │    │
│  │      IntegrationError::new(                                      │    │
│  │        err.error_kind(),                                         │    │
│  │        err.message(),                                            │    │
│  │      ).with_source(err)                                          │    │
│  │       .with_retryable(err.is_retryable())                        │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    integrations-retry                            │    │
│  │                                                                  │    │
│  │  // Retry executor with backoff                                  │    │
│  │  use integrations_retry::{RetryExecutor, RetryPolicy, Backoff};  │    │
│  │                                                                  │    │
│  │  let retry = RetryExecutor::new(RetryPolicy {                    │    │
│  │    max_attempts: config.max_retries,                             │    │
│  │    backoff: Backoff::Exponential {                               │    │
│  │      initial: Duration::from_millis(1000),                       │    │
│  │      max: Duration::from_secs(30),                               │    │
│  │      multiplier: 2.0,                                            │    │
│  │      jitter: 0.1,                                                │    │
│  │    },                                                            │    │
│  │  });                                                             │    │
│  │                                                                  │    │
│  │  retry.execute(                                                  │    │
│  │    || transport.send(request),                                   │    │
│  │    |err| err.is_retryable(),                                     │    │
│  │  ).await                                                         │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 integrations-circuit-breaker                     │    │
│  │                                                                  │    │
│  │  // Circuit breaker state machine                                │    │
│  │  use integrations_circuit_breaker::{CircuitBreaker, State};      │    │
│  │                                                                  │    │
│  │  let cb = CircuitBreaker::new(CircuitBreakerConfig {             │    │
│  │    failure_threshold: 5,                                         │    │
│  │    success_threshold: 2,                                         │    │
│  │    open_duration: Duration::from_secs(30),                       │    │
│  │  });                                                             │    │
│  │                                                                  │    │
│  │  // Check before request                                         │    │
│  │  if !cb.is_call_permitted() {                                    │    │
│  │    return Err(CohereError::ServiceUnavailable { ... });          │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Record result                                                │    │
│  │  match result {                                                  │    │
│  │    Ok(_) => cb.record_success(),                                 │    │
│  │    Err(e) if e.is_retryable() => cb.record_failure(),            │    │
│  │    Err(_) => {} // Don't count client errors                     │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  integrations-rate-limit                         │    │
│  │                                                                  │    │
│  │  // Token bucket rate limiter                                    │    │
│  │  use integrations_rate_limit::{RateLimiter, TokenBucket};        │    │
│  │                                                                  │    │
│  │  let limiter = TokenBucket::new(                                 │    │
│  │    config.requests_per_minute,  // capacity                      │    │
│  │    config.requests_per_minute / 60,  // refill rate              │    │
│  │  );                                                              │    │
│  │                                                                  │    │
│  │  // Acquire before request                                       │    │
│  │  match limiter.acquire().await {                                 │    │
│  │    Ok(permit) => { /* proceed */ },                              │    │
│  │    Err(wait_time) => {                                           │    │
│  │      return Err(CohereError::RateLimited {                       │    │
│  │        retry_after: Some(wait_time),                             │    │
│  │        ..                                                        │    │
│  │      });                                                         │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   integrations-tracing                           │    │
│  │                                                                  │    │
│  │  // Distributed tracing                                          │    │
│  │  use integrations_tracing::{Tracer, Span, SpanContext};          │    │
│  │                                                                  │    │
│  │  let tracer = Tracer::new("cohere");                             │    │
│  │  let span = tracer.span("chat")                                  │    │
│  │    .with_attribute("model", model)                               │    │
│  │    .start();                                                     │    │
│  │                                                                  │    │
│  │  // Propagate context in headers                                 │    │
│  │  span.inject_context(&mut headers);                              │    │
│  │                                                                  │    │
│  │  // Record events                                                │    │
│  │  span.add_event("request_sent");                                 │    │
│  │  span.set_attribute("response.tokens", token_count);             │    │
│  │  span.end();                                                     │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   integrations-logging                           │    │
│  │                                                                  │    │
│  │  // Structured logging                                           │    │
│  │  use integrations_logging::{Logger, Level};                      │    │
│  │                                                                  │    │
│  │  let logger = Logger::new("cohere");                             │    │
│  │                                                                  │    │
│  │  logger.info("Request completed", fields! {                      │    │
│  │    "operation" => "chat",                                        │    │
│  │    "duration_ms" => duration.as_millis(),                        │    │
│  │    "tokens" => token_count,                                      │    │
│  │  });                                                             │    │
│  │                                                                  │    │
│  │  logger.error("Request failed", fields! {                        │    │
│  │    "operation" => "chat",                                        │    │
│  │    "error_type" => error.error_type(),                           │    │
│  │    "retryable" => error.is_retryable(),                          │    │
│  │  });                                                             │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Integration Points

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       INTEGRATION POINTS                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    ResilienceOrchestrator                        │    │
│  │                                                                  │    │
│  │  Integrates: retry + circuit-breaker + rate-limit                │    │
│  │                                                                  │    │
│  │  pub struct ResilienceOrchestrator {                             │    │
│  │    retry: RetryExecutor,                                         │    │
│  │    circuit_breaker: CircuitBreaker,                              │    │
│  │    rate_limiter: Box<dyn RateLimiter>,                           │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  impl ResilienceOrchestrator {                                   │    │
│  │    pub async fn execute<T, F>(&self, op: F) -> Result<T>         │    │
│  │    where F: Fn() -> Future<Output = Result<T>>                   │    │
│  │    {                                                             │    │
│  │      // 1. Check circuit breaker                                 │    │
│  │      self.circuit_breaker.check()?;                              │    │
│  │                                                                  │    │
│  │      // 2. Acquire rate limit                                    │    │
│  │      self.rate_limiter.acquire().await?;                         │    │
│  │                                                                  │    │
│  │      // 3. Execute with retry                                    │    │
│  │      self.retry.execute(|| {                                     │    │
│  │        self.circuit_breaker.call(op)                             │    │
│  │      }).await                                                    │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    ServiceContext                                │    │
│  │                                                                  │    │
│  │  Integrates: config + transport + auth + resilience + obs       │    │
│  │                                                                  │    │
│  │  pub struct ServiceContext {                                     │    │
│  │    pub config: Arc<CohereConfig>,                                │    │
│  │    pub transport: Arc<dyn HttpTransport>,                        │    │
│  │    pub auth: Arc<dyn AuthProvider>,                              │    │
│  │    pub resilience: Arc<ResilienceOrchestrator>,                  │    │
│  │    pub tracer: Tracer,                                           │    │
│  │    pub metrics: MetricsRecorder,                                 │    │
│  │    pub logger: Logger,                                           │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Shared by all services                                       │    │
│  │  impl ServiceContext {                                           │    │
│  │    pub fn base_url(&self) -> &str { ... }                        │    │
│  │    pub fn create_span(&self, name: &str) -> Span { ... }         │    │
│  │    pub fn record_metric(&self, ...) { ... }                      │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Observability Architecture

### 15.1 Tracing Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       TRACING ARCHITECTURE                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     Span Hierarchy                               │    │
│  │                                                                  │    │
│  │  cohere.chat                              (root span)            │    │
│  │  ├── cohere.validate                      (child span)           │    │
│  │  ├── cohere.resilience                    (child span)           │    │
│  │  │   ├── rate_limit.acquire               (child span)           │    │
│  │  │   └── circuit_breaker.check            (child span)           │    │
│  │  ├── http.send                            (child span)           │    │
│  │  │   └── tls.handshake                    (child span)           │    │
│  │  └── cohere.parse_response                (child span)           │    │
│  │                                                                  │    │
│  │  Span Attributes:                                                │    │
│  │  ├── service.name: "cohere"                                      │    │
│  │  ├── service.version: "0.1.0"                                    │    │
│  │  ├── cohere.model: "command-r-plus"                              │    │
│  │  ├── cohere.operation: "chat"                                    │    │
│  │  ├── http.method: "POST"                                         │    │
│  │  ├── http.url: "https://api.cohere.ai/v1/chat"                   │    │
│  │  ├── http.status_code: 200                                       │    │
│  │  ├── cohere.tokens.input: 150                                    │    │
│  │  ├── cohere.tokens.output: 200                                   │    │
│  │  └── cohere.generation_id: "abc123"                              │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Context Propagation                             │    │
│  │                                                                  │    │
│  │  Incoming Request                                                │    │
│  │       │                                                          │    │
│  │       │ traceparent: 00-{trace_id}-{parent_span}-01              │    │
│  │       ▼                                                          │    │
│  │  ┌───────────────┐                                               │    │
│  │  │ Extract from  │                                               │    │
│  │  │   headers     │                                               │    │
│  │  └───────┬───────┘                                               │    │
│  │          │                                                       │    │
│  │          ▼                                                       │    │
│  │  ┌───────────────┐                                               │    │
│  │  │ Create child  │                                               │    │
│  │  │    span       │                                               │    │
│  │  └───────┬───────┘                                               │    │
│  │          │                                                       │    │
│  │          ▼                                                       │    │
│  │  ┌───────────────┐                                               │    │
│  │  │ Inject into   │──▶ Cohere API Request                         │    │
│  │  │   headers     │    (if supported)                             │    │
│  │  └───────────────┘                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   Export Configuration                           │    │
│  │                                                                  │    │
│  │  // OTLP exporter (default)                                      │    │
│  │  TracingConfig {                                                 │    │
│  │    exporter: "otlp",                                             │    │
│  │    endpoint: "http://localhost:4317",                            │    │
│  │    service_name: "my-app",                                       │    │
│  │    sample_rate: 1.0,                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Jaeger exporter                                              │    │
│  │  TracingConfig {                                                 │    │
│  │    exporter: "jaeger",                                           │    │
│  │    endpoint: "http://localhost:14268/api/traces",                │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 15.2 Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       METRICS ARCHITECTURE                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Metric Types                                  │    │
│  │                                                                  │    │
│  │  Counters (monotonically increasing):                            │    │
│  │  ├── cohere_requests_total{operation, status}                    │    │
│  │  ├── cohere_tokens_input_total{operation}                        │    │
│  │  ├── cohere_tokens_output_total{operation}                       │    │
│  │  ├── cohere_errors_total{operation, error_type}                  │    │
│  │  └── cohere_retries_total{operation, outcome}                    │    │
│  │                                                                  │    │
│  │  Histograms (distribution):                                      │    │
│  │  ├── cohere_request_duration_seconds{operation}                  │    │
│  │  │   Buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]                │    │
│  │  ├── cohere_tokens_per_request{operation}                        │    │
│  │  └── cohere_stream_events_count{operation}                       │    │
│  │                                                                  │    │
│  │  Gauges (current value):                                         │    │
│  │  ├── cohere_circuit_breaker_state{} (0=closed, 1=open, 2=half)   │    │
│  │  ├── cohere_rate_limit_remaining{}                               │    │
│  │  └── cohere_connection_pool_size{}                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   Metric Labels                                  │    │
│  │                                                                  │    │
│  │  Common labels applied to all metrics:                           │    │
│  │  ├── service: "cohere"                                           │    │
│  │  ├── version: "0.1.0"                                            │    │
│  │  └── environment: "production"                                   │    │
│  │                                                                  │    │
│  │  Operation-specific labels:                                      │    │
│  │  ├── operation: "chat" | "embed" | "rerank" | ...                │    │
│  │  ├── model: "command-r-plus" | "embed-v3" | ...                  │    │
│  │  ├── status: "success" | "error"                                 │    │
│  │  ├── error_type: "rate_limited" | "server_error" | ...           │    │
│  │  └── streaming: "true" | "false"                                 │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Prometheus Scrape Endpoint                      │    │
│  │                                                                  │    │
│  │  GET /metrics                                                    │    │
│  │                                                                  │    │
│  │  # HELP cohere_requests_total Total Cohere API requests          │    │
│  │  # TYPE cohere_requests_total counter                            │    │
│  │  cohere_requests_total{operation="chat",status="success"} 1542   │    │
│  │  cohere_requests_total{operation="chat",status="error"} 23       │    │
│  │  cohere_requests_total{operation="embed",status="success"} 892   │    │
│  │                                                                  │    │
│  │  # HELP cohere_request_duration_seconds Request latency          │    │
│  │  # TYPE cohere_request_duration_seconds histogram                │    │
│  │  cohere_request_duration_seconds_bucket{le="0.5"} 1234           │    │
│  │  cohere_request_duration_seconds_bucket{le="1"} 1456             │    │
│  │  cohere_request_duration_seconds_sum 789.5                       │    │
│  │  cohere_request_duration_seconds_count 1542                      │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 15.3 Logging Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       LOGGING ARCHITECTURE                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Log Levels                                    │    │
│  │                                                                  │    │
│  │  TRACE: Detailed debugging (request/response bodies redacted)    │    │
│  │  DEBUG: Component-level debugging                                │    │
│  │  INFO:  Normal operations (request completed, etc.)              │    │
│  │  WARN:  Recoverable issues (retry, rate limit backoff)           │    │
│  │  ERROR: Failed operations                                        │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Structured Log Format                           │    │
│  │                                                                  │    │
│  │  {                                                               │    │
│  │    "timestamp": "2025-12-09T10:30:45.123Z",                      │    │
│  │    "level": "info",                                              │    │
│  │    "target": "integrations_cohere::services::chat",              │    │
│  │    "message": "Chat request completed",                          │    │
│  │    "fields": {                                                   │    │
│  │      "operation": "chat",                                        │    │
│  │      "model": "command-r-plus",                                  │    │
│  │      "duration_ms": 1234,                                        │    │
│  │      "input_tokens": 150,                                        │    │
│  │      "output_tokens": 200,                                       │    │
│  │      "generation_id": "abc123"                                   │    │
│  │    },                                                            │    │
│  │    "span": {                                                     │    │
│  │      "trace_id": "0123456789abcdef",                             │    │
│  │      "span_id": "fedcba9876543210"                               │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 Sensitive Data Handling                          │    │
│  │                                                                  │    │
│  │  NEVER logged:                                                   │    │
│  │  ├── API keys (Authorization header)                             │    │
│  │  ├── OAuth tokens                                                │    │
│  │  └── User content (messages, documents)                          │    │
│  │                                                                  │    │
│  │  Redacted in logs:                                               │    │
│  │  ├── Authorization: "Bearer [REDACTED]"                          │    │
│  │  └── message: "[REDACTED - 150 chars]"                           │    │
│  │                                                                  │    │
│  │  Implementation:                                                 │    │
│  │  impl Debug for ChatRequest {                                    │    │
│  │    fn fmt(&self, f: &mut Formatter) -> fmt::Result {             │    │
│  │      f.debug_struct("ChatRequest")                               │    │
│  │        .field("message", &format!("[{} chars]", self.msg.len())) │    │
│  │        .field("model", &self.model)                              │    │
│  │        .finish()                                                 │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 16. Security Architecture

### 16.1 Credential Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CREDENTIAL MANAGEMENT                                │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    SecretString Usage                            │    │
│  │                                                                  │    │
│  │  // API key stored as SecretString                               │    │
│  │  use secrecy::{SecretString, ExposeSecret};                      │    │
│  │                                                                  │    │
│  │  struct CohereConfig {                                           │    │
│  │    api_key: SecretString,  // Never accidentally logged          │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Explicit exposure required                                   │    │
│  │  fn authenticate(&self, req: &mut Request) {                     │    │
│  │    req.header("Authorization",                                   │    │
│  │      format!("Bearer {}", self.api_key.expose_secret()));        │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Debug implementation hides secret                            │    │
│  │  impl Debug for CohereConfig {                                   │    │
│  │    fn fmt(&self, f: &mut Formatter) -> fmt::Result {             │    │
│  │      f.debug_struct("CohereConfig")                              │    │
│  │        .field("api_key", &"[REDACTED]")                          │    │
│  │        .finish()                                                 │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   Credential Sources                             │    │
│  │                                                                  │    │
│  │  Priority order:                                                 │    │
│  │  1. Explicit configuration (CohereConfig.api_key)                │    │
│  │  2. Environment variable (COHERE_API_KEY)                        │    │
│  │  3. Config file (~/.cohere/config)                               │    │
│  │                                                                  │    │
│  │  // From environment                                             │    │
│  │  let config = CohereConfigBuilder::new()                         │    │
│  │    .from_env()  // Reads COHERE_API_KEY                          │    │
│  │    .build()?;                                                    │    │
│  │                                                                  │    │
│  │  // Explicit                                                     │    │
│  │  let config = CohereConfigBuilder::new()                         │    │
│  │    .api_key(SecretString::new(key.to_string()))                  │    │
│  │    .build()?;                                                    │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Credential Rotation                             │    │
│  │                                                                  │    │
│  │  // Credentials can be updated at runtime                        │    │
│  │  // (requires new client instance)                               │    │
│  │                                                                  │    │
│  │  // NOT supported: in-place credential update                    │    │
│  │  // Rationale: Simpler, safer, consistent state                  │    │
│  │                                                                  │    │
│  │  // Recommended pattern:                                         │    │
│  │  let new_config = old_config.with_api_key(new_key);              │    │
│  │  let new_client = CohereClient::new(new_config)?;                │    │
│  │  // Gracefully switch over                                       │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Transport Security

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      TRANSPORT SECURITY                                  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    TLS Configuration                             │    │
│  │                                                                  │    │
│  │  Minimum: TLS 1.2                                                │    │
│  │  Recommended: TLS 1.3                                            │    │
│  │                                                                  │    │
│  │  // Rust (rustls)                                                │    │
│  │  let tls_config = rustls::ClientConfig::builder()                │    │
│  │    .with_safe_defaults()  // TLS 1.2+, secure ciphers            │    │
│  │    .with_native_roots()   // System CA certificates              │    │
│  │    .build();                                                     │    │
│  │                                                                  │    │
│  │  Cipher suites (in preference order):                            │    │
│  │  ├── TLS_AES_256_GCM_SHA384 (TLS 1.3)                            │    │
│  │  ├── TLS_AES_128_GCM_SHA256 (TLS 1.3)                            │    │
│  │  ├── TLS_CHACHA20_POLY1305_SHA256 (TLS 1.3)                      │    │
│  │  ├── TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (TLS 1.2)             │    │
│  │  └── TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (TLS 1.2)             │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 Certificate Validation                           │    │
│  │                                                                  │    │
│  │  Default behavior:                                               │    │
│  │  ├── Verify server certificate chain                             │    │
│  │  ├── Check certificate expiration                                │    │
│  │  ├── Validate hostname matches certificate                       │    │
│  │  └── Use system root CA store                                    │    │
│  │                                                                  │    │
│  │  // Custom CA (for enterprise proxies)                           │    │
│  │  let config = CohereConfigBuilder::new()                         │    │
│  │    .tls_ca_cert(Path::new("/path/to/ca.pem"))                    │    │
│  │    .build()?;                                                    │    │
│  │                                                                  │    │
│  │  // DANGEROUS: Disable verification (testing only)               │    │
│  │  #[cfg(test)]                                                    │    │
│  │  let config = CohereConfigBuilder::new()                         │    │
│  │    .dangerous_disable_tls_verification()                         │    │
│  │    .build()?;                                                    │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   HTTPS Enforcement                              │    │
│  │                                                                  │    │
│  │  // URL validation enforces HTTPS                                │    │
│  │  fn validate_base_url(url: &str) -> Result<(), ConfigError> {    │    │
│  │    let parsed = Url::parse(url)?;                                │    │
│  │                                                                  │    │
│  │    if parsed.scheme() != "https" {                               │    │
│  │      return Err(ConfigError::InsecureUrl(                        │    │
│  │        "HTTPS required for API communication"                    │    │
│  │      ));                                                         │    │
│  │    }                                                             │    │
│  │                                                                  │    │
│  │    Ok(())                                                        │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Exception: localhost for testing                             │    │
│  │  #[cfg(test)]                                                    │    │
│  │  fn validate_base_url(url: &str) -> Result<(), ConfigError> {    │    │
│  │    // Allow http://localhost for mock servers                    │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 16.3 Input Validation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       INPUT VALIDATION                                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Validation Layers                               │    │
│  │                                                                  │    │
│  │  Layer 1: Type System                                            │    │
│  │  ├── Compile-time type checking                                  │    │
│  │  ├── Enums for constrained values                                │    │
│  │  └── NewType patterns for validated types                        │    │
│  │                                                                  │    │
│  │  Layer 2: Builder Validation                                     │    │
│  │  ├── Required field checks                                       │    │
│  │  ├── Range validation (temperature: 0.0-1.0)                     │    │
│  │  └── Consistency checks (max_tokens > 0)                         │    │
│  │                                                                  │    │
│  │  Layer 3: Runtime Validation                                     │    │
│  │  ├── Pre-request validation in services                          │    │
│  │  ├── Cross-field validation                                      │    │
│  │  └── Context-dependent validation                                │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Validation Examples                             │    │
│  │                                                                  │    │
│  │  // Type-safe temperature                                        │    │
│  │  pub struct Temperature(f64);                                    │    │
│  │                                                                  │    │
│  │  impl Temperature {                                              │    │
│  │    pub fn new(value: f64) -> Result<Self, ValidationError> {     │    │
│  │      if value < 0.0 || value > 1.0 {                             │    │
│  │        return Err(ValidationError::OutOfRange {                  │    │
│  │          field: "temperature",                                   │    │
│  │          min: 0.0,                                               │    │
│  │          max: 1.0,                                               │    │
│  │          actual: value,                                          │    │
│  │        });                                                       │    │
│  │      }                                                           │    │
│  │      Ok(Temperature(value))                                      │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Tool validation                                              │    │
│  │  fn validate_tools(tools: &[Tool]) -> Result<(), ValidationError>│    │
│  │  {                                                               │    │
│  │    for tool in tools {                                           │    │
│  │      if tool.name.is_empty() {                                   │    │
│  │        return Err(ValidationError::EmptyField("tool.name"));     │    │
│  │      }                                                           │    │
│  │      if tool.name.len() > 64 {                                   │    │
│  │        return Err(ValidationError::TooLong {                     │    │
│  │          field: "tool.name",                                     │    │
│  │          max: 64,                                                │    │
│  │        });                                                       │    │
│  │      }                                                           │    │
│  │      // Validate JSON schema for parameters                      │    │
│  │      validate_json_schema(&tool.parameters)?;                    │    │
│  │    }                                                             │    │
│  │    Ok(())                                                        │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 17. Testing Architecture

### 17.1 Test Pyramid

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TEST PYRAMID                                     │
│                                                                          │
│                            /\                                            │
│                           /  \                                           │
│                          /    \                                          │
│                         /      \                                         │
│                        / E2E/   \      (Few)                             │
│                       / Contract \     ~10 tests                         │
│                      /────────────\                                      │
│                     /              \                                     │
│                    /  Integration   \   (Some)                           │
│                   /    Tests         \  ~50 tests                        │
│                  /────────────────────\                                  │
│                 /                      \                                 │
│                /      Unit Tests        \  (Many)                        │
│               /         ~200 tests       \ ~500 tests                    │
│              /────────────────────────────\                              │
│                                                                          │
│  Coverage Targets:                                                       │
│  ├── Line coverage: ≥ 80%                                               │
│  ├── Branch coverage: ≥ 70%                                             │
│  └── Critical path coverage: 100%                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 17.2 Test Organization

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      TEST ORGANIZATION                                   │
│                                                                          │
│  tests/                                                                  │
│  ├── unit/                                                               │
│  │   ├── client_test.rs                                                  │
│  │   │   ├── test_client_creation_with_valid_config                      │
│  │   │   ├── test_client_creation_fails_without_api_key                  │
│  │   │   └── test_services_are_lazily_initialized                        │
│  │   │                                                                   │
│  │   ├── config_test.rs                                                  │
│  │   │   ├── test_config_from_env                                        │
│  │   │   ├── test_config_validation                                      │
│  │   │   └── test_config_builder_defaults                                │
│  │   │                                                                   │
│  │   ├── chat_test.rs                                                    │
│  │   │   ├── test_chat_request_serialization                             │
│  │   │   ├── test_chat_response_deserialization                          │
│  │   │   ├── test_chat_validation_rejects_empty_message                  │
│  │   │   └── test_chat_with_tools                                        │
│  │   │                                                                   │
│  │   ├── embed_test.rs                                                   │
│  │   ├── rerank_test.rs                                                  │
│  │   ├── streaming_test.rs                                               │
│  │   │   ├── test_sse_parsing                                            │
│  │   │   ├── test_stream_event_types                                     │
│  │   │   └── test_stream_collection                                      │
│  │   │                                                                   │
│  │   └── resilience_test.rs                                              │
│  │       ├── test_retry_on_server_error                                  │
│  │       ├── test_circuit_breaker_opens_on_failures                      │
│  │       └── test_rate_limiter_enforces_limits                           │
│  │                                                                        │
│  ├── integration/                                                        │
│  │   ├── pipeline_test.rs                                                │
│  │   │   ├── test_full_request_pipeline                                  │
│  │   │   ├── test_error_propagation_through_pipeline                     │
│  │   │   └── test_resilience_integration                                 │
│  │   │                                                                   │
│  │   └── streaming_test.rs                                               │
│  │       ├── test_streaming_with_mock_server                             │
│  │       └── test_stream_error_handling                                  │
│  │                                                                        │
│  └── contract/                                                           │
│      └── api_contract_test.rs                                            │
│          ├── test_chat_endpoint_contract                                 │
│          ├── test_embed_endpoint_contract                                │
│          └── test_error_response_format                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 17.3 Mock Patterns

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MOCK PATTERNS                                     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   MockHttpTransport                              │    │
│  │                                                                  │    │
│  │  #[derive(Default)]                                              │    │
│  │  pub struct MockHttpTransport {                                  │    │
│  │    responses: Mutex<VecDeque<MockResponse>>,                     │    │
│  │    requests: Mutex<Vec<HttpRequest>>,                            │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  impl MockHttpTransport {                                        │    │
│  │    pub fn queue_response(&self, response: MockResponse) {        │    │
│  │      self.responses.lock().push_back(response);                  │    │
│  │    }                                                             │    │
│  │                                                                  │    │
│  │    pub fn captured_requests(&self) -> Vec<HttpRequest> {         │    │
│  │      self.requests.lock().clone()                                │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  #[async_trait]                                                  │    │
│  │  impl HttpTransport for MockHttpTransport {                      │    │
│  │    async fn send(&self, req: HttpRequest)                        │    │
│  │      -> Result<HttpResponse, TransportError>                     │    │
│  │    {                                                             │    │
│  │      self.requests.lock().push(req);                             │    │
│  │      let mock = self.responses.lock().pop_front()                │    │
│  │        .ok_or(TransportError::Unknown("No mock queued"))?;       │    │
│  │                                                                  │    │
│  │      if let Some(delay) = mock.delay {                           │    │
│  │        tokio::time::sleep(delay).await;                          │    │
│  │      }                                                           │    │
│  │                                                                  │    │
│  │      mock.result                                                 │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Test Fixtures                                 │    │
│  │                                                                  │    │
│  │  pub mod fixtures {                                              │    │
│  │    pub fn chat_response(text: &str) -> HttpResponse {            │    │
│  │      HttpResponse {                                              │    │
│  │        status: 200,                                              │    │
│  │        body: json!({                                             │    │
│  │          "text": text,                                           │    │
│  │          "generation_id": "test-gen-id",                         │    │
│  │          "finish_reason": "COMPLETE",                            │    │
│  │          "meta": { ... }                                         │    │
│  │        }).to_string().into(),                                    │    │
│  │        ..Default::default()                                      │    │
│  │      }                                                           │    │
│  │    }                                                             │    │
│  │                                                                  │    │
│  │    pub fn rate_limit_response() -> HttpResponse {                │    │
│  │      HttpResponse {                                              │    │
│  │        status: 429,                                              │    │
│  │        headers: [("Retry-After", "30")].into(),                  │    │
│  │        body: json!({"message": "Rate limited"}).to_string().into()│   │
│  │      }                                                           │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   Example Unit Test                              │    │
│  │                                                                  │    │
│  │  #[tokio::test]                                                  │    │
│  │  async fn test_chat_service_sends_correct_request() {            │    │
│  │    // Arrange                                                    │    │
│  │    let mock = Arc::new(MockHttpTransport::default());            │    │
│  │    mock.queue_response(MockResponse::ok(                         │    │
│  │      fixtures::chat_response("Hello!")                           │    │
│  │    ));                                                           │    │
│  │                                                                  │    │
│  │    let client = test_client_with_transport(mock.clone());        │    │
│  │                                                                  │    │
│  │    // Act                                                        │    │
│  │    let response = client.chat().chat(ChatRequest {               │    │
│  │      message: "Hi".into(),                                       │    │
│  │      model: Some("command-r-plus".into()),                       │    │
│  │      ..Default::default()                                        │    │
│  │    }).await.unwrap();                                            │    │
│  │                                                                  │    │
│  │    // Assert                                                     │    │
│  │    assert_eq!(response.text, "Hello!");                          │    │
│  │                                                                  │    │
│  │    let requests = mock.captured_requests();                      │    │
│  │    assert_eq!(requests.len(), 1);                                │    │
│  │    assert_eq!(requests[0].method, Method::POST);                 │    │
│  │    assert!(requests[0].url.ends_with("/v1/chat"));               │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 18. Deployment Architecture

### 18.1 Package Distribution

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PACKAGE DISTRIBUTION                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Rust (crates.io)                              │    │
│  │                                                                  │    │
│  │  Package: integrations-cohere                                    │    │
│  │  Version: 0.1.0                                                  │    │
│  │                                                                  │    │
│  │  Features:                                                       │    │
│  │  ├── default = ["rustls-tls"]                                    │    │
│  │  ├── rustls-tls: Use rustls for TLS                              │    │
│  │  ├── native-tls: Use native TLS                                  │    │
│  │  └── full: All features enabled                                  │    │
│  │                                                                  │    │
│  │  Installation:                                                   │    │
│  │  [dependencies]                                                  │    │
│  │  integrations-cohere = "0.1"                                     │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  TypeScript (npm)                                │    │
│  │                                                                  │    │
│  │  Package: @integrations/cohere                                   │    │
│  │  Version: 0.1.0                                                  │    │
│  │                                                                  │    │
│  │  Installation:                                                   │    │
│  │  npm install @integrations/cohere                                │    │
│  │                                                                  │    │
│  │  // or                                                           │    │
│  │  yarn add @integrations/cohere                                   │    │
│  │                                                                  │    │
│  │  // or                                                           │    │
│  │  pnpm add @integrations/cohere                                   │    │
│  │                                                                  │    │
│  │  Supported runtimes:                                             │    │
│  │  ├── Node.js 18+                                                 │    │
│  │  ├── Deno                                                        │    │
│  │  └── Bun                                                         │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 18.2 CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CI/CD PIPELINE                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    GitHub Actions                                │    │
│  │                                                                  │    │
│  │  on:                                                             │    │
│  │    push:                                                         │    │
│  │      branches: [main]                                            │    │
│  │    pull_request:                                                 │    │
│  │      branches: [main]                                            │    │
│  │                                                                  │    │
│  │  jobs:                                                           │    │
│  │    lint:                                                         │    │
│  │      - cargo fmt --check                                         │    │
│  │      - cargo clippy -- -D warnings                               │    │
│  │      - eslint src/                                               │    │
│  │                                                                  │    │
│  │    test:                                                         │    │
│  │      matrix:                                                     │    │
│  │        os: [ubuntu-latest, macos-latest, windows-latest]         │    │
│  │        rust: [stable, beta]                                      │    │
│  │      steps:                                                      │    │
│  │        - cargo test --all-features                               │    │
│  │        - npm test                                                │    │
│  │                                                                  │    │
│  │    coverage:                                                     │    │
│  │      - cargo tarpaulin --out Xml                                 │    │
│  │      - upload to codecov                                         │    │
│  │                                                                  │    │
│  │    contract-tests:                                               │    │
│  │      if: github.event_name == 'push'                             │    │
│  │      env:                                                        │    │
│  │        COHERE_API_KEY: ${{ secrets.COHERE_TEST_KEY }}            │    │
│  │      steps:                                                      │    │
│  │        - cargo test --features contract-tests                    │    │
│  │                                                                  │    │
│  │    publish:                                                      │    │
│  │      if: startsWith(github.ref, 'refs/tags/v')                   │    │
│  │      needs: [lint, test, coverage]                               │    │
│  │      steps:                                                      │    │
│  │        - cargo publish                                           │    │
│  │        - npm publish                                             │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 18.3 Version Compatibility

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    VERSION COMPATIBILITY                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   Rust MSRV                                      │    │
│  │                                                                  │    │
│  │  Minimum Supported Rust Version: 1.75                            │    │
│  │                                                                  │    │
│  │  Tested on:                                                      │    │
│  │  ├── Rust 1.75 (MSRV)                                            │    │
│  │  ├── Rust 1.76                                                   │    │
│  │  ├── Rust 1.77                                                   │    │
│  │  └── Rust stable (latest)                                        │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Node.js Compatibility                           │    │
│  │                                                                  │    │
│  │  Minimum Node.js Version: 18.0.0                                 │    │
│  │                                                                  │    │
│  │  Tested on:                                                      │    │
│  │  ├── Node.js 18 LTS                                              │    │
│  │  ├── Node.js 20 LTS                                              │    │
│  │  └── Node.js 22 (current)                                        │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Cohere API Versions                             │    │
│  │                                                                  │    │
│  │  Supported: v1, v2 (configurable)                                │    │
│  │  Default: v1                                                     │    │
│  │                                                                  │    │
│  │  // Use v2 API                                                   │    │
│  │  let config = CohereConfigBuilder::new()                         │    │
│  │    .api_version("v2")                                            │    │
│  │    .build()?;                                                    │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 19. API Reference Summary

### 19.1 Quick Reference

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      API QUICK REFERENCE                                 │
│                                                                          │
│  Client Creation:                                                        │
│  ─────────────────────────────────────────────────────────────────────  │
│  let client = CohereClient::from_env()?;                                 │
│  let client = CohereClient::new(config)?;                                │
│  let client = CohereClient::builder().api_key(key).build()?;             │
│                                                                          │
│  Chat:                                                                   │
│  ─────────────────────────────────────────────────────────────────────  │
│  let response = client.chat().chat(request).await?;                      │
│  let stream = client.chat().chat_stream(request).await?;                 │
│  let response = client.chat().message("Hello", None).await?;             │
│                                                                          │
│  Generate:                                                               │
│  ─────────────────────────────────────────────────────────────────────  │
│  let response = client.generate().generate(request).await?;              │
│  let text = client.generate().complete("prompt", None).await?;           │
│                                                                          │
│  Embed:                                                                  │
│  ─────────────────────────────────────────────────────────────────────  │
│  let response = client.embed().embed(request).await?;                    │
│  let embedding = client.embed().embed_text("text", None).await?;         │
│  let embeddings = client.embed().embed_texts(texts, None).await?;        │
│                                                                          │
│  Rerank:                                                                 │
│  ─────────────────────────────────────────────────────────────────────  │
│  let response = client.rerank().rerank(request).await?;                  │
│  let results = client.rerank().rerank_texts(query, docs, n, None).await?;│
│                                                                          │
│  Classify:                                                               │
│  ─────────────────────────────────────────────────────────────────────  │
│  let response = client.classify().classify(request).await?;              │
│  let results = client.classify().classify_with_examples(...).await?;     │
│                                                                          │
│  Summarize:                                                              │
│  ─────────────────────────────────────────────────────────────────────  │
│  let response = client.summarize().summarize(request).await?;            │
│  let summary = client.summarize().summarize_text(text, ...).await?;      │
│                                                                          │
│  Tokenize:                                                               │
│  ─────────────────────────────────────────────────────────────────────  │
│  let tokens = client.tokenize().tokenize_text(text, model).await?;       │
│  let count = client.tokenize().count_tokens(text, model).await?;         │
│  let text = client.tokenize().detokenize(tokens, model).await?;          │
│                                                                          │
│  Models:                                                                 │
│  ─────────────────────────────────────────────────────────────────────  │
│  let models = client.models().list_all().await?;                         │
│  let model = client.models().get("model-id").await?;                     │
│                                                                          │
│  Datasets:                                                               │
│  ─────────────────────────────────────────────────────────────────────  │
│  let dataset = client.datasets().create(request).await?;                 │
│  let datasets = client.datasets().list(request).await?;                  │
│  client.datasets().delete("dataset-id").await?;                          │
│                                                                          │
│  Connectors:                                                             │
│  ─────────────────────────────────────────────────────────────────────  │
│  let connector = client.connectors().create(request).await?;             │
│  let connectors = client.connectors().list(request).await?;              │
│  let auth = client.connectors().authorize("id", url).await?;             │
│                                                                          │
│  Fine-tuning:                                                            │
│  ─────────────────────────────────────────────────────────────────────  │
│  let model = client.finetune().create(request).await?;                   │
│  let models = client.finetune().list(request).await?;                    │
│  let events = client.finetune().get_events("id", request).await?;        │
│  let metrics = client.finetune().get_metrics("id", request).await?;      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

This document completes the architecture phase for the Cohere integration module:

1. **Primitive Integration**: How shared primitives are used and composed
2. **Observability**: Tracing, metrics, and logging architecture
3. **Security**: Credential management, transport security, input validation
4. **Testing**: Test pyramid, organization, and mock patterns
5. **Deployment**: Package distribution, CI/CD, version compatibility
6. **API Reference**: Quick reference for all service operations

---

**Architecture Phase Status: COMPLETE ✅**

Awaiting "Next phase." to begin Refinement phase.

---

*Architecture Phase: Part 3 of 3 Complete*
