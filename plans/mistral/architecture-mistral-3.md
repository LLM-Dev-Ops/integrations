# Architecture: Mistral Integration Module - Part 3

**Primitive Integration, Observability, Security, and Deployment**
**Version:** 1.0.0
**Date:** 2025-12-09
**Status:** COMPLETE

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

### 14.1 Integration Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PRIMITIVE INTEGRATION MAP                              │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                      Mistral Integration Module                          │
  │                                                                          │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │                       Application Layer                            │  │
  │  │  MistralClient, ChatService, FilesService, etc.                    │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                    │                                     │
  │                                    ▼                                     │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │                      Primitive Adapters                            │  │
  │  │                                                                    │  │
  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
  │  │  │   Error     │  │  Resilience │  │Observability│               │  │
  │  │  │  Adapter    │  │   Adapter   │  │   Adapter   │               │  │
  │  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │  │
  │  │         │                │                │                       │  │
  │  └─────────┼────────────────┼────────────────┼───────────────────────┘  │
  │            │                │                │                          │
  └────────────┼────────────────┼────────────────┼──────────────────────────┘
               │                │                │
               ▼                ▼                ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        Integration Primitives                            │
  │                                                                          │
  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
  │  │ errors  │ │  retry  │ │ circuit │ │  rate   │ │ tracing │           │
  │  │         │ │         │ │ breaker │ │  limit  │ │         │           │
  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
  │                                                                          │
  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                                    │
  │  │ logging │ │  types  │ │ config  │                                    │
  │  │         │ │         │ │         │                                    │
  │  └─────────┘ └─────────┘ └─────────┘                                    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Error Primitive Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ERROR PRIMITIVE INTEGRATION                            │
└─────────────────────────────────────────────────────────────────────────────┘

  integrations-errors provides:
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  // Base error trait                                                     │
  │  pub trait IntegrationError: std::error::Error {                         │
  │      fn error_type(&self) -> &str;                                       │
  │      fn is_retryable(&self) -> bool;                                     │
  │      fn status_code(&self) -> Option<u16>;                               │
  │  }                                                                       │
  │                                                                          │
  │  // Error context                                                        │
  │  pub struct ErrorContext {                                               │
  │      pub operation: String,                                              │
  │      pub trace_id: Option<String>,                                       │
  │      pub request_id: Option<String>,                                     │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘

  Mistral module implements:
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  impl IntegrationError for MistralError {                                │
  │      fn error_type(&self) -> &str {                                      │
  │          match self {                                                    │
  │              MistralError::BadRequest { .. } => "bad_request",           │
  │              MistralError::RateLimit { .. } => "rate_limit",             │
  │              MistralError::Authentication { .. } => "authentication",    │
  │              // ...                                                      │
  │          }                                                               │
  │      }                                                                   │
  │                                                                          │
  │      fn is_retryable(&self) -> bool {                                    │
  │          matches!(self,                                                  │
  │              MistralError::RateLimit { .. } |                            │
  │              MistralError::ServiceUnavailable { .. } |                   │
  │              MistralError::GatewayTimeout { .. } |                       │
  │              MistralError::Connection { .. } |                           │
  │              MistralError::Timeout { .. }                                │
  │          )                                                               │
  │      }                                                                   │
  │                                                                          │
  │      fn status_code(&self) -> Option<u16> {                              │
  │          match self {                                                    │
  │              MistralError::BadRequest { .. } => Some(400),               │
  │              MistralError::RateLimit { .. } => Some(429),                │
  │              // ...                                                      │
  │          }                                                               │
  │      }                                                                   │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Resilience Primitive Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     RESILIENCE PRIMITIVE INTEGRATION                         │
└─────────────────────────────────────────────────────────────────────────────┘

  integrations-retry provides:
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  pub trait RetryPolicy {                                                 │
  │      fn should_retry(&self, error: &dyn IntegrationError) -> bool;       │
  │      fn next_delay(&self, attempt: u32) -> Duration;                     │
  │  }                                                                       │
  │                                                                          │
  │  pub struct ExponentialBackoff {                                         │
  │      pub initial_delay: Duration,                                        │
  │      pub max_delay: Duration,                                            │
  │      pub multiplier: f64,                                                │
  │      pub jitter: f64,                                                    │
  │  }                                                                       │
  │                                                                          │
  │  pub struct RetryExecutor<P: RetryPolicy> {                              │
  │      policy: P,                                                          │
  │      max_attempts: u32,                                                  │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘

  integrations-circuit-breaker provides:
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  pub enum CircuitState { Closed, Open, HalfOpen }                        │
  │                                                                          │
  │  pub struct CircuitBreaker {                                             │
  │      failure_threshold: u32,                                             │
  │      success_threshold: u32,                                             │
  │      timeout: Duration,                                                  │
  │  }                                                                       │
  │                                                                          │
  │  impl CircuitBreaker {                                                   │
  │      fn call<F, T, E>(&self, f: F) -> Result<T, CircuitError<E>>        │
  │      fn state(&self) -> CircuitState                                     │
  │      fn record_success(&self)                                            │
  │      fn record_failure(&self)                                            │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘

  integrations-rate-limit provides:
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  pub struct TokenBucket {                                                │
  │      capacity: u32,                                                      │
  │      refill_rate: f64,  // tokens per second                             │
  │  }                                                                       │
  │                                                                          │
  │  pub struct SlidingWindow {                                              │
  │      window_size: Duration,                                              │
  │      max_requests: u32,                                                  │
  │  }                                                                       │
  │                                                                          │
  │  impl RateLimiter for TokenBucket {                                      │
  │      async fn acquire(&self) -> Result<(), RateLimitError>               │
  │      fn try_acquire(&self) -> bool                                       │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘

  ResilienceOrchestrator combines all:
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  pub struct ResilienceOrchestrator {                                     │
  │      retry: RetryExecutor<ExponentialBackoff>,                           │
  │      circuit_breaker: CircuitBreaker,                                    │
  │      rate_limiter: Box<dyn RateLimiter>,                                 │
  │  }                                                                       │
  │                                                                          │
  │  impl ResilienceOrchestrator {                                           │
  │      pub async fn execute<F, T, E>(&self, operation: F) -> Result<T, E>  │
  │      where                                                               │
  │          F: FnMut() -> Future<Output = Result<T, E>>,                    │
  │          E: IntegrationError,                                            │
  │      {                                                                   │
  │          // 1. Check circuit breaker                                     │
  │          self.circuit_breaker.check()?;                                  │
  │                                                                          │
  │          // 2. Acquire rate limit                                        │
  │          self.rate_limiter.acquire().await?;                             │
  │                                                                          │
  │          // 3. Execute with retry                                        │
  │          self.retry.execute(|| async {                                   │
  │              let result = operation().await;                             │
  │              self.circuit_breaker.record(&result);                       │
  │              result                                                      │
  │          }).await                                                        │
  │      }                                                                   │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 14.4 Observability Primitive Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY PRIMITIVE INTEGRATION                       │
└─────────────────────────────────────────────────────────────────────────────┘

  integrations-tracing provides:
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  pub trait TracingProvider: Send + Sync {                                │
  │      fn start_span(&self, name: &str) -> Box<dyn Span>;                  │
  │      fn current_trace_id(&self) -> Option<String>;                       │
  │  }                                                                       │
  │                                                                          │
  │  pub trait Span: Send {                                                  │
  │      fn set_attribute(&mut self, key: &str, value: AttributeValue);      │
  │      fn add_event(&mut self, name: &str, attrs: Vec<(String, String)>);  │
  │      fn record_error(&mut self, error: &dyn std::error::Error);          │
  │      fn end(&mut self);                                                  │
  │  }                                                                       │
  │                                                                          │
  │  // Concrete implementations                                             │
  │  pub struct OpenTelemetryProvider { ... }                                │
  │  pub struct NoopTracingProvider;                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  integrations-logging provides:
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  pub trait LoggingProvider: Send + Sync {                                │
  │      fn log(&self, level: Level, message: &str, fields: Fields);         │
  │  }                                                                       │
  │                                                                          │
  │  pub enum Level { Trace, Debug, Info, Warn, Error }                      │
  │                                                                          │
  │  pub type Fields = HashMap<String, serde_json::Value>;                   │
  │                                                                          │
  │  // Concrete implementations                                             │
  │  pub struct StructuredLogger { ... }                                     │
  │  pub struct NoopLogger;                                                  │
  └─────────────────────────────────────────────────────────────────────────┘

  Mistral module usage:
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  impl ChatServiceImpl {                                                  │
  │      async fn create(&self, req: ChatRequest) -> Result<ChatResponse> {  │
  │          // Start span                                                   │
  │          let mut span = self.tracer.start_span("mistral.chat.create");   │
  │          span.set_attribute("mistral.model", req.model.clone());         │
  │          span.set_attribute("mistral.messages.count", req.messages.len());│
  │                                                                          │
  │          // Log request                                                  │
  │          self.logger.log(Level::Debug, "Chat request", hashmap! {        │
  │              "operation" => "chat.create",                               │
  │              "model" => req.model,                                       │
  │          });                                                             │
  │                                                                          │
  │          let result = self.do_request(req).await;                        │
  │                                                                          │
  │          // Handle result                                                │
  │          match &result {                                                 │
  │              Ok(resp) => {                                               │
  │                  span.set_attribute("mistral.usage.total",               │
  │                      resp.usage.total_tokens);                           │
  │              }                                                           │
  │              Err(e) => {                                                 │
  │                  span.record_error(e);                                   │
  │              }                                                           │
  │          }                                                               │
  │                                                                          │
  │          span.end();                                                     │
  │          result                                                          │
  │      }                                                                   │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Observability Architecture

### 15.1 Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         METRICS ARCHITECTURE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  Metric Categories
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  REQUEST METRICS                                                         │
  │  ─────────────────────────────────────────────────────────────────────  │
  │                                                                          │
  │  mistral_requests_total                                                  │
  │  ├── Type: Counter                                                       │
  │  └── Labels: method, endpoint, status, model                             │
  │                                                                          │
  │  mistral_request_duration_seconds                                        │
  │  ├── Type: Histogram                                                     │
  │  ├── Buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]           │
  │  └── Labels: method, endpoint, model                                     │
  │                                                                          │
  │  mistral_request_size_bytes                                              │
  │  ├── Type: Histogram                                                     │
  │  └── Labels: endpoint                                                    │
  │                                                                          │
  │  mistral_response_size_bytes                                             │
  │  ├── Type: Histogram                                                     │
  │  └── Labels: endpoint                                                    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  TOKEN METRICS                                                           │
  │  ─────────────────────────────────────────────────────────────────────  │
  │                                                                          │
  │  mistral_tokens_total                                                    │
  │  ├── Type: Counter                                                       │
  │  └── Labels: type (prompt|completion), model                             │
  │                                                                          │
  │  mistral_tokens_per_request                                              │
  │  ├── Type: Histogram                                                     │
  │  └── Labels: type, model                                                 │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  STREAMING METRICS                                                       │
  │  ─────────────────────────────────────────────────────────────────────  │
  │                                                                          │
  │  mistral_stream_chunks_total                                             │
  │  ├── Type: Counter                                                       │
  │  └── Labels: model                                                       │
  │                                                                          │
  │  mistral_time_to_first_token_seconds                                     │
  │  ├── Type: Histogram                                                     │
  │  ├── Buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5]                           │
  │  └── Labels: model                                                       │
  │                                                                          │
  │  mistral_stream_duration_seconds                                         │
  │  ├── Type: Histogram                                                     │
  │  └── Labels: model                                                       │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  RESILIENCE METRICS                                                      │
  │  ─────────────────────────────────────────────────────────────────────  │
  │                                                                          │
  │  mistral_retries_total                                                   │
  │  ├── Type: Counter                                                       │
  │  └── Labels: endpoint, reason                                            │
  │                                                                          │
  │  mistral_circuit_breaker_state                                           │
  │  ├── Type: Gauge (0=closed, 1=open, 2=half_open)                        │
  │  └── Labels: none                                                        │
  │                                                                          │
  │  mistral_circuit_breaker_transitions_total                               │
  │  ├── Type: Counter                                                       │
  │  └── Labels: from, to                                                    │
  │                                                                          │
  │  mistral_rate_limit_wait_seconds                                         │
  │  ├── Type: Histogram                                                     │
  │  └── Labels: none                                                        │
  │                                                                          │
  │  mistral_rate_limit_rejections_total                                     │
  │  ├── Type: Counter                                                       │
  │  └── Labels: none                                                        │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  ERROR METRICS                                                           │
  │  ─────────────────────────────────────────────────────────────────────  │
  │                                                                          │
  │  mistral_errors_total                                                    │
  │  ├── Type: Counter                                                       │
  │  └── Labels: type, endpoint, status_code                                 │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 15.2 Tracing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TRACING ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

  Span Hierarchy
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  mistral.chat.create                    (Root span)                      │
  │  ├── Attributes:                                                         │
  │  │   ├── mistral.model                                                   │
  │  │   ├── mistral.messages.count                                          │
  │  │   ├── mistral.temperature                                             │
  │  │   └── mistral.max_tokens                                              │
  │  │                                                                       │
  │  ├── mistral.resilience.execute         (Child span)                     │
  │  │   ├── Attributes:                                                     │
  │  │   │   ├── resilience.attempt                                          │
  │  │   │   └── resilience.circuit_state                                    │
  │  │   │                                                                   │
  │  │   └── mistral.http.request           (Child span)                     │
  │  │       ├── Attributes:                                                 │
  │  │       │   ├── http.method = "POST"                                    │
  │  │       │   ├── http.url (redacted)                                     │
  │  │       │   ├── http.status_code                                        │
  │  │       │   └── http.response_size                                      │
  │  │       │                                                               │
  │  │       └── Events:                                                     │
  │  │           ├── request_sent                                            │
  │  │           └── response_received                                       │
  │  │                                                                       │
  │  └── Result Attributes:                                                  │
  │      ├── mistral.usage.prompt_tokens                                     │
  │      ├── mistral.usage.completion_tokens                                 │
  │      └── mistral.finish_reason                                           │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Streaming Span Structure
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  mistral.chat.create_stream             (Root span)                      │
  │  ├── Attributes:                                                         │
  │  │   ├── mistral.streaming = true                                        │
  │  │   └── mistral.model                                                   │
  │  │                                                                       │
  │  ├── mistral.http.request               (HTTP setup)                     │
  │  │                                                                       │
  │  ├── Events:                                                             │
  │  │   ├── stream_started                                                  │
  │  │   ├── first_chunk_received                                            │
  │  │   │   └── ttft_ms                                                     │
  │  │   └── stream_completed                                                │
  │  │       ├── total_chunks                                                │
  │  │       └── duration_ms                                                 │
  │  │                                                                       │
  │  └── Final Attributes:                                                   │
  │      ├── mistral.stream.chunks_count                                     │
  │      ├── mistral.stream.duration_ms                                      │
  │      └── mistral.usage.total_tokens                                      │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 15.3 Logging Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LOGGING ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

  Log Levels by Operation
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  TRACE:                                                                  │
  │  • Request/response body details (redacted secrets)                      │
  │  • SSE chunk parsing details                                             │
  │  • Rate limiter token state                                              │
  │                                                                          │
  │  DEBUG:                                                                  │
  │  • Request initiated with summary                                        │
  │  • Response received with summary                                        │
  │  • Retry attempt details                                                 │
  │  • Circuit breaker state changes                                         │
  │                                                                          │
  │  INFO:                                                                   │
  │  • Client initialization                                                 │
  │  • Successful operations summary                                         │
  │  • Fine-tuning job state changes                                         │
  │  • Batch job completion                                                  │
  │                                                                          │
  │  WARN:                                                                   │
  │  • Rate limit approaching                                                │
  │  • Retry triggered                                                       │
  │  • Circuit breaker half-open                                             │
  │  • Deprecated API usage                                                  │
  │                                                                          │
  │  ERROR:                                                                  │
  │  • Request failed after retries                                          │
  │  • Circuit breaker open                                                  │
  │  • Authentication failure                                                │
  │  • Parse errors                                                          │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Structured Log Format
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  {                                                                       │
  │    "timestamp": "2025-12-09T10:30:00.123Z",                              │
  │    "level": "info",                                                      │
  │    "target": "integrations_mistral::services::chat",                     │
  │    "message": "Chat completion successful",                              │
  │    "fields": {                                                           │
  │      "operation": "chat.create",                                         │
  │      "model": "mistral-large-latest",                                    │
  │      "duration_ms": 1234,                                                │
  │      "prompt_tokens": 150,                                               │
  │      "completion_tokens": 89,                                            │
  │      "finish_reason": "stop"                                             │
  │    },                                                                    │
  │    "span": {                                                             │
  │      "trace_id": "abc123",                                               │
  │      "span_id": "def456",                                                │
  │      "name": "mistral.chat.create"                                       │
  │    }                                                                     │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 16. Security Architecture

### 16.1 Credential Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CREDENTIAL MANAGEMENT                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  SecretString Usage
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  // API key stored as SecretString                                       │
  │  pub struct ClientConfig {                                               │
  │      api_key: SecretString,  // Never logged, Display shows [REDACTED]  │
  │  }                                                                       │
  │                                                                          │
  │  impl Debug for ClientConfig {                                           │
  │      fn fmt(&self, f: &mut Formatter) -> fmt::Result {                   │
  │          f.debug_struct("ClientConfig")                                  │
  │              .field("api_key", &"[REDACTED]")                            │
  │              .field("base_url", &self.base_url)                          │
  │              .finish()                                                   │
  │      }                                                                   │
  │  }                                                                       │
  │                                                                          │
  │  // Only expose when needed for HTTP header                              │
  │  impl AuthProvider for BearerAuthProvider {                              │
  │      fn get_header(&self) -> (String, String) {                          │
  │          (                                                               │
  │              "Authorization".to_string(),                                │
  │              format!("Bearer {}", self.api_key.expose_secret())          │
  │          )                                                               │
  │      }                                                                   │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘

  Credential Sources
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Priority Order:                                                         │
  │  1. Explicit parameter        client.api_key("sk-...")                   │
  │  2. Environment variable      MISTRAL_API_KEY                            │
  │  3. Configuration file        ~/.config/mistral/credentials              │
  │                                                                          │
  │  pub fn resolve_api_key(config: &BuilderConfig) -> Result<SecretString> {│
  │      // 1. Explicit                                                      │
  │      if let Some(key) = &config.api_key {                                │
  │          return Ok(key.clone());                                         │
  │      }                                                                   │
  │                                                                          │
  │      // 2. Environment                                                   │
  │      if let Ok(key) = std::env::var("MISTRAL_API_KEY") {                 │
  │          return Ok(SecretString::new(key));                              │
  │      }                                                                   │
  │                                                                          │
  │      // 3. Config file (optional)                                        │
  │      if let Some(key) = read_config_file_key()? {                        │
  │          return Ok(key);                                                 │
  │      }                                                                   │
  │                                                                          │
  │      Err(MistralError::configuration("No API key configured"))           │
  │  }                                                                       │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Transport Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TRANSPORT SECURITY                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  TLS Configuration
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  // Minimum TLS 1.2, prefer TLS 1.3                                      │
  │  pub fn create_http_client(config: &ClientConfig) -> reqwest::Client {   │
  │      reqwest::Client::builder()                                          │
  │          .min_tls_version(tls::Version::TLS_1_2)                         │
  │          .use_rustls_tls()           // Pure Rust TLS                    │
  │          .https_only(true)           // Reject http://                   │
  │          .redirect(Policy::limited(5))                                   │
  │          .timeout(config.timeout)                                        │
  │          .connect_timeout(config.connect_timeout)                        │
  │          .build()                                                        │
  │          .expect("Failed to build HTTP client")                          │
  │  }                                                                       │
  │                                                                          │
  │  Security Properties:                                                    │
  │  • TLS 1.2+ required (no SSL, no TLS 1.0/1.1)                           │
  │  • Certificate validation enabled by default                             │
  │  • HTTPS-only enforcement                                                │
  │  • No custom certificate stores (uses system)                            │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Request Security
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Headers Set:                                                            │
  │  • Authorization: Bearer [api_key] (via SecretString)                    │
  │  • Content-Type: application/json                                        │
  │  • User-Agent: integrations-mistral/0.1.0                                │
  │  • X-Request-ID: [uuid] (for tracing)                                    │
  │                                                                          │
  │  Body Security:                                                          │
  │  • JSON serialization with serde (no injection)                          │
  │  • Size limits enforced                                                  │
  │  • No file path traversal (file IDs are opaque)                          │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 16.3 Data Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA PROTECTION                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  Sensitive Data Handling
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Data Category          Protection Measure                               │
  │  ─────────────────────────────────────────────────────────────────────  │
  │  API Key                SecretString, never logged                       │
  │  W&B API Key            SecretString in WandbConfig                      │
  │  Repository Token       SecretString in Repository                       │
  │  Message Content        Not logged at INFO level                         │
  │  File Content           Not logged, streamed directly                    │
  │  Fine-tuning Data       File ID references only                          │
  │                                                                          │
  │  Logging Redaction:                                                      │
  │  ─────────────────────────────────────────────────────────────────────  │
  │  • Authorization header: "[REDACTED]"                                    │
  │  • API key in config: "[REDACTED]"                                       │
  │  • Message content at DEBUG: truncated with "..."                        │
  │  • Full content only at TRACE with opt-in flag                           │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Memory Security
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  // SecretString zeros memory on drop                                    │
  │  impl Drop for SecretString {                                            │
  │      fn drop(&mut self) {                                                │
  │          self.inner.zeroize();  // Secure memory wipe                    │
  │      }                                                                   │
  │  }                                                                       │
  │                                                                          │
  │  // Clone is explicit and auditable                                      │
  │  impl Clone for SecretString {                                           │
  │      fn clone(&self) -> Self {                                           │
  │          // Explicit clone, creates audit trail in code review           │
  │          Self::new(self.expose_secret().to_string())                     │
  │      }                                                                   │
  │  }                                                                       │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 17. Testing Architecture

### 17.1 Test Pyramid

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TEST PYRAMID                                       │
└─────────────────────────────────────────────────────────────────────────────┘

                              ▲
                             ╱ ╲
                            ╱   ╲
                           ╱     ╲
                          ╱  E2E  ╲          Few, slow, high confidence
                         ╱   Tests ╲         Against real Mistral API
                        ╱───────────╲
                       ╱             ╲
                      ╱  Integration  ╲      Moderate count
                     ╱     Tests       ╲     Mock server (WireMock)
                    ╱───────────────────╲
                   ╱                     ╲
                  ╱      Unit Tests       ╲  Many, fast
                 ╱    (Mocked Services)    ╲ All components isolated
                ╱───────────────────────────╲
               ╱                             ╲
              ╱      Contract Tests           ╲  OpenAPI compliance
             ╱─────────────────────────────────╲


  Test Distribution Target
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Layer              Count    Execution Time    Coverage Target           │
  │  ─────────────────────────────────────────────────────────────────────  │
  │  Unit Tests         ~200     < 30 seconds      > 80%                     │
  │  Integration        ~50      < 2 minutes       > 60% (integration paths) │
  │  Contract           ~20      < 30 seconds      All endpoints             │
  │  E2E                ~10      < 5 minutes       Critical paths            │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 17.2 Mock Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOCK ARCHITECTURE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  Layer Mocking Strategy
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │                      Production Code                               │  │
  │  │                                                                    │  │
  │  │  ChatService ──▶ HttpTransport ──▶ reqwest ──▶ Mistral API        │  │
  │  │                                                                    │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                                                          │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │                      Unit Test (Transport Mock)                    │  │
  │  │                                                                    │  │
  │  │  ChatService ──▶ MockHttpTransport ──▶ [Predefined Responses]     │  │
  │  │                                                                    │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                                                          │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │                      Integration Test (Mock Server)                │  │
  │  │                                                                    │  │
  │  │  MistralClient ──▶ reqwest ──▶ WireMock ──▶ [Scripted Responses]  │  │
  │  │                                                                    │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                                                          │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │                      E2E Test (Real API)                           │  │
  │  │                                                                    │  │
  │  │  MistralClient ──▶ reqwest ──▶ Mistral API                        │  │
  │  │  (with test API key, rate limited)                                 │  │
  │  │                                                                    │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Mock Trait Pattern
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  // Generated with mockall                                               │
  │  #[automock]                                                             │
  │  pub trait HttpTransport: Send + Sync {                                  │
  │      async fn send(&self, request: HttpRequest) -> Result<HttpResponse>;│
  │      async fn send_streaming(&self, req: HttpRequest) -> Result<Stream>;│
  │  }                                                                       │
  │                                                                          │
  │  // Test usage                                                           │
  │  #[tokio::test]                                                          │
  │  async fn test_chat_success() {                                          │
  │      let mut mock = MockHttpTransport::new();                            │
  │      mock.expect_send()                                                  │
  │          .times(1)                                                       │
  │          .returning(|_| Ok(HttpResponse {                                │
  │              status: 200,                                                │
  │              body: fixtures::chat_response_json(),                       │
  │              ..Default::default()                                        │
  │          }));                                                            │
  │                                                                          │
  │      let service = ChatServiceImpl::new(Arc::new(mock), ...);            │
  │      let result = service.create(fixtures::chat_request()).await;        │
  │      assert!(result.is_ok());                                            │
  │  }                                                                       │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 18. Deployment Architecture

### 18.1 Package Distribution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PACKAGE DISTRIBUTION                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Rust (crates.io)
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Package: integrations-mistral                                           │
  │  Registry: crates.io                                                     │
  │                                                                          │
  │  Features:                                                               │
  │  ├── default = ["rustls"]                                                │
  │  ├── rustls = ["reqwest/rustls-tls"]                                     │
  │  ├── native-tls = ["reqwest/native-tls"]                                 │
  │  ├── streaming = []  (always included)                                   │
  │  └── tracing = ["integrations-tracing/opentelemetry"]                    │
  │                                                                          │
  │  Installation:                                                           │
  │  cargo add integrations-mistral                                          │
  │                                                                          │
  │  Version Scheme: SemVer                                                  │
  │  MSRV: 1.75.0 (for async traits)                                         │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  TypeScript (npm)
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Package: @integrations/mistral                                          │
  │  Registry: npm                                                           │
  │                                                                          │
  │  Exports:                                                                │
  │  ├── ESM: dist/index.mjs                                                 │
  │  ├── CJS: dist/index.js                                                  │
  │  └── Types: dist/index.d.ts                                              │
  │                                                                          │
  │  Installation:                                                           │
  │  npm install @integrations/mistral                                       │
  │  pnpm add @integrations/mistral                                          │
  │                                                                          │
  │  Node.js: >= 18.0.0                                                      │
  │  TypeScript: >= 5.0.0                                                    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 18.2 Runtime Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RUNTIME REQUIREMENTS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Rust Runtime
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Async Runtime: Tokio                                                    │
  │  ├── Required features: rt-multi-thread, macros, time                    │
  │  └── Can run on single-thread with rt feature only                       │
  │                                                                          │
  │  Memory:                                                                 │
  │  ├── Baseline: ~5MB for client + connection pool                         │
  │  ├── Per concurrent request: ~100KB                                      │
  │  └── Streaming: ~10KB per active stream                                  │
  │                                                                          │
  │  Network:                                                                │
  │  ├── Connection pooling enabled by default                               │
  │  ├── Keep-alive: 90 seconds                                              │
  │  └── Max idle connections per host: 10                                   │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  TypeScript Runtime
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Runtime: Node.js >= 18.0.0                                              │
  │  ├── Uses native fetch API                                               │
  │  ├── ReadableStream for SSE                                              │
  │  └── AbortController for cancellation                                    │
  │                                                                          │
  │  Memory:                                                                 │
  │  ├── Baseline: ~10MB for module + dependencies                           │
  │  └── Per stream: ~50KB buffer                                            │
  │                                                                          │
  │  Browser Support:                                                        │
  │  ├── Modern browsers with fetch API                                      │
  │  ├── TextDecoderStream for SSE parsing                                   │
  │  └── No Node.js-specific APIs in browser build                           │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 18.3 Configuration Deployment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONFIGURATION DEPLOYMENT                                │
└─────────────────────────────────────────────────────────────────────────────┘

  Environment Variables
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Variable                  Description                  Default          │
  │  ─────────────────────────────────────────────────────────────────────  │
  │  MISTRAL_API_KEY           API key (required)           None             │
  │  MISTRAL_BASE_URL          API base URL                 api.mistral.ai   │
  │  MISTRAL_TIMEOUT_SECS      Request timeout              120              │
  │  MISTRAL_MAX_RETRIES       Maximum retry attempts       3                │
  │  MISTRAL_LOG_LEVEL         Logging level                info             │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Configuration File (Optional)
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  # ~/.config/mistral/config.toml                                         │
  │                                                                          │
  │  [client]                                                                │
  │  base_url = "https://api.mistral.ai"                                     │
  │  timeout_secs = 120                                                      │
  │                                                                          │
  │  [retry]                                                                 │
  │  max_attempts = 3                                                        │
  │  initial_delay_ms = 100                                                  │
  │  max_delay_ms = 30000                                                    │
  │  backoff_multiplier = 2.0                                                │
  │                                                                          │
  │  [circuit_breaker]                                                       │
  │  failure_threshold = 5                                                   │
  │  success_threshold = 2                                                   │
  │  timeout_secs = 60                                                       │
  │                                                                          │
  │  [rate_limit]                                                            │
  │  requests_per_minute = 60                                                │
  │  tokens_per_minute = 100000                                              │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 19. API Reference Summary

### 19.1 Client API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT API SUMMARY                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  MistralClient
  ═══════════════════════════════════════════════════════════════════════════

  // Construction
  MistralClient::builder() -> ClientBuilder
  MistralClient::new(config: ClientConfig) -> Result<Self>

  // Service Access
  client.chat() -> &ChatService
  client.fim() -> &FimService
  client.embeddings() -> &EmbeddingsService
  client.models() -> &ModelsService
  client.files() -> &FilesService
  client.fine_tuning() -> &FineTuningService
  client.agents() -> &AgentsService
  client.batch() -> &BatchService
  client.classifiers() -> &ClassifiersService

  ClientBuilder
  ═══════════════════════════════════════════════════════════════════════════

  .api_key(key: impl Into<SecretString>) -> Self
  .base_url(url: impl Into<String>) -> Self
  .timeout(duration: Duration) -> Self
  .retry(config: RetryConfig) -> Self
  .circuit_breaker(config: CircuitBreakerConfig) -> Self
  .rate_limit(config: RateLimitConfig) -> Self
  .tracer(provider: impl TracingProvider) -> Self
  .logger(provider: impl LoggingProvider) -> Self
  .build() -> Result<MistralClient>
```

### 19.2 Service APIs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVICE API SUMMARY                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  ChatService
  ═══════════════════════════════════════════════════════════════════════════
  .create(request) -> Result<ChatCompletionResponse>
  .create_stream(request) -> Result<Stream<StreamEvent>>

  FimService
  ═══════════════════════════════════════════════════════════════════════════
  .create(request) -> Result<FimCompletionResponse>
  .create_stream(request) -> Result<Stream<StreamEvent>>

  EmbeddingsService
  ═══════════════════════════════════════════════════════════════════════════
  .create(request) -> Result<EmbeddingResponse>

  ModelsService
  ═══════════════════════════════════════════════════════════════════════════
  .list() -> Result<ListModelsResponse>
  .get(model_id) -> Result<Model>
  .delete(model_id) -> Result<DeleteModelResponse>
  .update(model_id, request) -> Result<Model>

  FilesService
  ═══════════════════════════════════════════════════════════════════════════
  .upload(request) -> Result<FileObject>
  .list(request) -> Result<ListFilesResponse>
  .retrieve(file_id) -> Result<FileObject>
  .delete(file_id) -> Result<DeleteFileResponse>
  .download(file_id) -> Result<FileContent>

  FineTuningService
  ═══════════════════════════════════════════════════════════════════════════
  .create(request) -> Result<FineTuningJob>
  .list(request) -> Result<ListFineTuningJobsResponse>
  .get(job_id) -> Result<FineTuningJob>
  .cancel(job_id) -> Result<FineTuningJob>
  .start(job_id) -> Result<FineTuningJob>

  AgentsService
  ═══════════════════════════════════════════════════════════════════════════
  .create(request) -> Result<Agent>
  .list(request) -> Result<ListAgentsResponse>
  .get(agent_id) -> Result<Agent>
  .update(agent_id, request) -> Result<Agent>
  .delete(agent_id) -> Result<DeleteAgentResponse>
  .complete(agent_id, request) -> Result<AgentCompletionResponse>
  .complete_stream(agent_id, request) -> Result<Stream<AgentStreamEvent>>

  BatchService
  ═══════════════════════════════════════════════════════════════════════════
  .create(request) -> Result<BatchJob>
  .list(request) -> Result<ListBatchJobsResponse>
  .get(job_id) -> Result<BatchJob>
  .cancel(job_id) -> Result<BatchJob>

  ClassifiersService
  ═══════════════════════════════════════════════════════════════════════════
  .moderate(request) -> Result<ModerationResponse>
  .classify(request) -> Result<ClassificationResponse>
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture part 3 |

---

**Architecture Phase Status: Part 3 COMPLETE**

*Primitive integration, observability, security, and deployment documented.*
