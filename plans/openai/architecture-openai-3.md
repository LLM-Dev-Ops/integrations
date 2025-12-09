# OpenAI Integration Module - Architecture (Part 3)

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-08
**Module:** `integrations/openai`
**File:** 3 of 3 - Integration, Deployment, Observability

---

## Table of Contents (Part 3)

14. [Integration Points](#14-integration-points)
15. [Primitive Integration](#15-primitive-integration)
16. [Deployment Architecture](#16-deployment-architecture)
17. [Observability Architecture](#17-observability-architecture)
18. [Security Architecture](#18-security-architecture)
19. [Testing Architecture](#19-testing-architecture)
20. [Performance Considerations](#20-performance-considerations)

---

## 14. Integration Points

### 14.1 External Integration Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EXTERNAL INTEGRATION MAP                               │
└─────────────────────────────────────────────────────────────────────────────┘

                     ┌─────────────────────────────────┐
                     │      OpenAI Integration         │
                     │           Module                │
                     └───────────────┬─────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   OUTBOUND      │       │    INBOUND      │       │   SIDEBAND      │
│   Integrations  │       │   Integrations  │       │  Integrations   │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         │                         │                         │
    ┌────┴────┐               ┌────┴────┐               ┌────┴────┐
    │         │               │         │               │         │
    ▼         ▼               ▼         ▼               ▼         ▼
┌───────┐ ┌───────┐     ┌───────┐ ┌───────┐     ┌───────┐ ┌───────┐
│OpenAI │ │ DNS   │     │ App   │ │Config │     │Metrics│ │Traces │
│ API   │ │Resolver│    │ Code  │ │Source │     │Export │ │Export │
└───────┘ └───────┘     └───────┘ └───────┘     └───────┘ └───────┘
    │         │               │         │               │         │
    │         │               │         │               │         │
    ▼         ▼               ▼         ▼               ▼         ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  HTTPS/TLS 1.2+   │   │   Rust/TS API     │   │   OTLP/Prom      │
│  api.openai.com   │   │   Function calls  │   │   Push/Pull      │
└───────────────────┘   └───────────────────┘   └───────────────────┘
```

### 14.2 API Contract

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          API CONTRACT                                        │
└─────────────────────────────────────────────────────────────────────────────┘

  OpenAI API v1 Contract:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Base URL: https://api.openai.com/v1                                     │
  │                                                                          │
  │  Authentication:                                                         │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  Header: Authorization: Bearer {api_key}                         │    │
  │  │  Header: OpenAI-Organization: {org_id}  (optional)              │    │
  │  │  Header: OpenAI-Project: {project_id}  (optional)               │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Content Negotiation:                                                    │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  Request:  Content-Type: application/json                        │    │
  │  │  Response: Content-Type: application/json                        │    │
  │  │  Streaming: Content-Type: text/event-stream                      │    │
  │  │  Files:    Content-Type: multipart/form-data                     │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Rate Limit Headers (Response):                                          │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  x-ratelimit-limit-requests: {number}                            │    │
  │  │  x-ratelimit-limit-tokens: {number}                              │    │
  │  │  x-ratelimit-remaining-requests: {number}                        │    │
  │  │  x-ratelimit-remaining-tokens: {number}                          │    │
  │  │  x-ratelimit-reset-requests: {duration}                          │    │
  │  │  x-ratelimit-reset-tokens: {duration}                            │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Request ID (Response):                                                  │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  x-request-id: {uuid}  (for debugging/support)                   │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Error Response Format:                                                  │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  {                                                               │    │
  │  │    "error": {                                                    │    │
  │  │      "message": "string",                                        │    │
  │  │      "type": "string",                                           │    │
  │  │      "param": "string | null",                                   │    │
  │  │      "code": "string | null"                                     │    │
  │  │    }                                                             │    │
  │  │  }                                                               │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Endpoint Catalog

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENDPOINT CATALOG                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┬─────────┬──────────────────────────────────────────────┐
  │ Service          │ Method  │ Endpoint                                      │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Chat             │ POST    │ /chat/completions                            │
  │ Chat (Stream)    │ POST    │ /chat/completions (stream: true)             │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Embeddings       │ POST    │ /embeddings                                  │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Files List       │ GET     │ /files                                       │
  │ Files Upload     │ POST    │ /files                                       │
  │ Files Retrieve   │ GET     │ /files/{file_id}                             │
  │ Files Delete     │ DELETE  │ /files/{file_id}                             │
  │ Files Content    │ GET     │ /files/{file_id}/content                     │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Batches Create   │ POST    │ /batches                                     │
  │ Batches List     │ GET     │ /batches                                     │
  │ Batches Retrieve │ GET     │ /batches/{batch_id}                          │
  │ Batches Cancel   │ POST    │ /batches/{batch_id}/cancel                   │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Models List      │ GET     │ /models                                      │
  │ Models Retrieve  │ GET     │ /models/{model}                              │
  │ Models Delete    │ DELETE  │ /models/{model}                              │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Images Generate  │ POST    │ /images/generations                          │
  │ Images Edit      │ POST    │ /images/edits                                │
  │ Images Variation │ POST    │ /images/variations                           │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Audio Transcribe │ POST    │ /audio/transcriptions                        │
  │ Audio Translate  │ POST    │ /audio/translations                          │
  │ Audio Speech     │ POST    │ /audio/speech                                │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Moderations      │ POST    │ /moderations                                 │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Fine-tune Create │ POST    │ /fine_tuning/jobs                            │
  │ Fine-tune List   │ GET     │ /fine_tuning/jobs                            │
  │ Fine-tune Get    │ GET     │ /fine_tuning/jobs/{id}                       │
  │ Fine-tune Cancel │ POST    │ /fine_tuning/jobs/{id}/cancel                │
  │ Fine-tune Events │ GET     │ /fine_tuning/jobs/{id}/events                │
  │ Fine-tune Checks │ GET     │ /fine_tuning/jobs/{id}/checkpoints           │
  ├──────────────────┼─────────┼──────────────────────────────────────────────┤
  │ Assistants       │ CRUD    │ /assistants, /assistants/{id}                │
  │ Threads          │ CRUD    │ /threads, /threads/{id}                      │
  │ Messages         │ CRUD    │ /threads/{id}/messages                       │
  │ Runs             │ CRUD    │ /threads/{id}/runs                           │
  │ Vector Stores    │ CRUD    │ /vector_stores                               │
  └──────────────────┴─────────┴──────────────────────────────────────────────┘
```

---

## 15. Primitive Integration

### 15.1 Primitive Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PRIMITIVE DEPENDENCY GRAPH                               │
└─────────────────────────────────────────────────────────────────────────────┘

                          ┌─────────────────────┐
                          │   OpenAI Module     │
                          └──────────┬──────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
  │   @errors     │         │    @retry     │         │  @circuit-    │
  │               │         │               │         │   breaker     │
  │ IntegrationErr│         │ RetryPolicy   │         │               │
  │ ErrorCode     │         │ RetryExecutor │         │ CircuitBreaker│
  │ Retryable     │         │ BackoffCalc   │         │ CircuitState  │
  └───────┬───────┘         └───────┬───────┘         └───────┬───────┘
          │                         │                         │
          │ ┌───────────────────────┴─────────────────────────┘
          │ │
          ▼ ▼
  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
  │ @rate-limits  │         │   @tracing    │         │   @logging    │
  │               │         │               │         │               │
  │ RateLimiter   │         │ Tracer        │         │ Logger        │
  │ TokenBucket   │         │ Span          │         │ LogLevel      │
  │ RateLimitConf │         │ SpanContext   │         │ StructuredLog │
  └───────┬───────┘         └───────┬───────┘         └───────┬───────┘
          │                         │                         │
          │ ┌───────────────────────┴─────────────────────────┘
          │ │
          ▼ ▼
  ┌───────────────┐         ┌───────────────┐
  │    @types     │         │   @config     │
  │               │         │               │
  │ CommonTypes   │         │ ConfigProvider│
  │ Duration      │         │ EnvConfig     │
  │ Headers       │         │ Validation    │
  └───────────────┘         └───────────────┘
```

### 15.2 Primitive Interface Contracts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRIMITIVE INTERFACE CONTRACTS                             │
└─────────────────────────────────────────────────────────────────────────────┘

  @integrations/errors:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  trait IntegrationError {                                                │
  │      fn error_code(&self) -> &'static str;                              │
  │      fn is_retryable(&self) -> bool;                                    │
  │      fn retry_after(&self) -> Option<Duration>;                         │
  │      fn http_status(&self) -> Option<u16>;                              │
  │      fn source(&self) -> Option<&dyn Error>;                            │
  │  }                                                                       │
  │                                                                          │
  │  // OpenAI module implements IntegrationError for OpenAIError            │
  └─────────────────────────────────────────────────────────────────────────┘

  @integrations/retry:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  trait RetryPolicy {                                                     │
  │      fn should_retry(&self, attempt: u32, error: &dyn Error) -> bool;   │
  │      fn calculate_delay(&self, attempt: u32) -> Duration;               │
  │  }                                                                       │
  │                                                                          │
  │  trait RetryExecutor {                                                   │
  │      async fn execute<T, F, Fut>(&self, f: F) -> Result<T, Error>       │
  │      where                                                               │
  │          F: Fn() -> Fut,                                                 │
  │          Fut: Future<Output = Result<T, Error>>;                        │
  │  }                                                                       │
  │                                                                          │
  │  // OpenAI module uses provided executor with custom policy              │
  └─────────────────────────────────────────────────────────────────────────┘

  @integrations/circuit-breaker:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  trait CircuitBreaker {                                                  │
  │      fn is_open(&self) -> bool;                                         │
  │      fn record_success(&self);                                          │
  │      fn record_failure(&self);                                          │
  │      fn state(&self) -> CircuitState;                                   │
  │      fn reset(&self);                                                    │
  │  }                                                                       │
  │                                                                          │
  │  enum CircuitState { Closed, Open, HalfOpen }                           │
  │                                                                          │
  │  // OpenAI module wraps provided circuit breaker                         │
  └─────────────────────────────────────────────────────────────────────────┘

  @integrations/rate-limits:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  trait RateLimiter {                                                     │
  │      async fn acquire(&self) -> Result<Permit, RateLimitError>;         │
  │      fn try_acquire(&self) -> Option<Permit>;                           │
  │      fn update_limits(&self, headers: &RateLimitHeaders);               │
  │      fn available(&self) -> u32;                                        │
  │  }                                                                       │
  │                                                                          │
  │  // OpenAI module uses provided rate limiter, updates from headers       │
  └─────────────────────────────────────────────────────────────────────────┘

  @integrations/tracing:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  trait Tracer {                                                          │
  │      fn start_span(&self, name: &str) -> Span;                          │
  │      fn current_span(&self) -> Option<Span>;                            │
  │  }                                                                       │
  │                                                                          │
  │  trait Span {                                                            │
  │      fn set_attribute(&self, key: &str, value: AttributeValue);         │
  │      fn add_event(&self, name: &str, attrs: &[(&str, AttributeValue)]); │
  │      fn record_error(&self, error: &dyn Error);                         │
  │      fn set_status(&self, status: SpanStatus);                          │
  │      fn end(&self);                                                      │
  │  }                                                                       │
  │                                                                          │
  │  // OpenAI module creates spans for each operation                       │
  └─────────────────────────────────────────────────────────────────────────┘

  @integrations/logging:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  trait Logger {                                                          │
  │      fn log(&self, level: LogLevel, message: &str, fields: &Fields);    │
  │      fn error(&self, message: &str, fields: &Fields);                   │
  │      fn warn(&self, message: &str, fields: &Fields);                    │
  │      fn info(&self, message: &str, fields: &Fields);                    │
  │      fn debug(&self, message: &str, fields: &Fields);                   │
  │      fn trace(&self, message: &str, fields: &Fields);                   │
  │  }                                                                       │
  │                                                                          │
  │  // OpenAI module logs at appropriate levels with context                │
  └─────────────────────────────────────────────────────────────────────────┘

  @integrations/config:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  trait ConfigProvider {                                                  │
  │      fn get<T: DeserializeOwned>(&self, key: &str) -> Option<T>;        │
  │      fn get_string(&self, key: &str) -> Option<String>;                 │
  │      fn get_secret(&self, key: &str) -> Option<SecretString>;           │
  │  }                                                                       │
  │                                                                          │
  │  // OpenAI module reads config for API key, base URL, etc.               │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 16. Deployment Architecture

### 16.1 Library Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LIBRARY INTEGRATION                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  The OpenAI module is deployed as a library, not a standalone service.

  Rust Integration:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  # Cargo.toml                                                            │
  │  [dependencies]                                                          │
  │  integrations-openai = { version = "0.1", features = ["full"] }         │
  │                                                                          │
  │  // main.rs                                                              │
  │  use integrations_openai::{create, OpenAIConfig};                       │
  │                                                                          │
  │  #[tokio::main]                                                          │
  │  async fn main() {                                                       │
  │      let client = create(OpenAIConfig {                                 │
  │          api_key: SecretString::new(env!("OPENAI_API_KEY")),            │
  │          ..Default::default()                                            │
  │      }).expect("Failed to create client");                               │
  │                                                                          │
  │      // Use client...                                                    │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘

  TypeScript Integration:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  // package.json                                                         │
  │  {                                                                       │
  │    "dependencies": {                                                     │
  │      "@integrations/openai": "^0.1.0"                                   │
  │    }                                                                     │
  │  }                                                                       │
  │                                                                          │
  │  // app.ts                                                               │
  │  import { createOpenAIClient } from '@integrations/openai';              │
  │                                                                          │
  │  const client = createOpenAIClient({                                     │
  │    apiKey: process.env.OPENAI_API_KEY!,                                 │
  │  });                                                                     │
  │                                                                          │
  │  // Use client...                                                        │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Environment Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ENVIRONMENT CONFIGURATION                                │
└─────────────────────────────────────────────────────────────────────────────┘

  Required Environment Variables:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  OPENAI_API_KEY          # Required: API key for authentication         │
  └─────────────────────────────────────────────────────────────────────────┘

  Optional Environment Variables:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  OPENAI_ORG_ID           # Organization ID                              │
  │  OPENAI_PROJECT_ID       # Project ID                                   │
  │  OPENAI_BASE_URL         # Base URL override (for proxies)              │
  │  OPENAI_TIMEOUT          # Request timeout in seconds (default: 60)     │
  │  OPENAI_MAX_RETRIES      # Max retry attempts (default: 3)              │
  │  OPENAI_RATE_LIMIT_RPM   # Requests per minute limit                    │
  │  OPENAI_RATE_LIMIT_TPM   # Tokens per minute limit                      │
  └─────────────────────────────────────────────────────────────────────────┘

  Feature Flags:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  OPENAI_ENABLE_TRACING   # Enable distributed tracing (default: true)  │
  │  OPENAI_ENABLE_METRICS   # Enable metrics export (default: true)       │
  │  OPENAI_LOG_LEVEL        # Log level: error/warn/info/debug/trace      │
  │  OPENAI_LOG_REQUESTS     # Log request bodies (default: false)         │
  │  OPENAI_LOG_RESPONSES    # Log response bodies (default: false)        │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 16.3 Runtime Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RUNTIME REQUIREMENTS                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  Rust:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Minimum Rust Version: 1.70.0 (for async trait stability)               │
  │  Async Runtime: tokio (multi-threaded recommended)                       │
  │  TLS: rustls (default) or native-tls (feature flag)                     │
  │  Memory: ~5MB base + connection pool + request buffers                  │
  └─────────────────────────────────────────────────────────────────────────┘

  Node.js:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Minimum Node Version: 18.0.0 (for native fetch)                        │
  │  Alternative: Works with node-fetch polyfill for older versions          │
  │  Memory: ~10MB base + connection pool + request buffers                 │
  └─────────────────────────────────────────────────────────────────────────┘

  Network:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Outbound HTTPS: Port 443 to api.openai.com                             │
  │  DNS Resolution: Required for api.openai.com                            │
  │  TLS Version: 1.2 minimum, 1.3 preferred                                │
  │  Connection Pool: Up to 10 idle connections per host                    │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 17. Observability Architecture

### 17.1 Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        METRICS ARCHITECTURE                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Metric Collection Flow:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
  │  │   Service   │───►│  Metrics    │───►│  Primitive  │                 │
  │  │   Layer     │    │  Recorder   │    │  @metrics   │                 │
  │  └─────────────┘    └─────────────┘    └──────┬──────┘                 │
  │                                               │                         │
  │       Recorded Metrics:                       │                         │
  │       • request count                         │                         │
  │       • request duration                      │                         │
  │       • token usage                           ▼                         │
  │       • error count              ┌─────────────────────┐               │
  │       • rate limit hits          │  Metrics Backend    │               │
  │       • circuit state            │  (Prometheus/OTLP)  │               │
  │                                  └─────────────────────┘               │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Metric Definitions:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Counter: openai_requests_total                                         │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  Labels: endpoint, status, model                                 │    │
  │  │  Example: openai_requests_total{endpoint="chat",status="ok"}=42 │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Histogram: openai_request_duration_seconds                             │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  Labels: endpoint, model                                         │    │
  │  │  Buckets: 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60                 │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Counter: openai_tokens_total                                           │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  Labels: model, type (prompt/completion)                         │    │
  │  │  Example: openai_tokens_total{model="gpt-4",type="prompt"}=1000 │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Counter: openai_errors_total                                           │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  Labels: endpoint, error_type                                    │    │
  │  │  Example: openai_errors_total{error_type="rate_limit"}=5        │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Gauge: openai_circuit_breaker_state                                    │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  Labels: endpoint                                                │    │
  │  │  Values: 0=closed, 1=open, 2=half_open                          │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 17.2 Tracing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRACING ARCHITECTURE                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Trace Propagation:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Application           OpenAI Module              OpenAI API            │
  │  ┌─────────┐          ┌─────────────┐           ┌─────────┐            │
  │  │ Span A  │─────────►│   Span B    │──────────►│ (opaque)│            │
  │  │ (root)  │          │ (child of A)│           │         │            │
  │  └─────────┘          └─────────────┘           └─────────┘            │
  │                              │                                          │
  │                              │                                          │
  │                    ┌─────────┴─────────┐                               │
  │                    │                   │                               │
  │                    ▼                   ▼                               │
  │              ┌─────────┐         ┌─────────┐                          │
  │              │ Span C  │         │ Span D  │                          │
  │              │(serialize)        │(http req)│                          │
  │              └─────────┘         └─────────┘                          │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Span Hierarchy:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  openai.chat.create (root for this operation)                           │
  │  │                                                                       │
  │  ├── openai.validate_request                                            │
  │  │   Attributes: model, message_count                                   │
  │  │                                                                       │
  │  ├── openai.resilience.execute                                          │
  │  │   │                                                                   │
  │  │   ├── openai.circuit_breaker.check                                   │
  │  │   │   Attributes: state                                              │
  │  │   │                                                                   │
  │  │   ├── openai.rate_limiter.acquire                                    │
  │  │   │   Attributes: wait_time_ms                                       │
  │  │   │                                                                   │
  │  │   └── openai.http_request                                            │
  │  │       │   Attributes: method, url, status_code                       │
  │  │       │                                                               │
  │  │       ├── openai.serialize_request                                   │
  │  │       │   Attributes: body_size_bytes                                │
  │  │       │                                                               │
  │  │       ├── http.send                                                  │
  │  │       │   Attributes: peer.address, peer.port                        │
  │  │       │                                                               │
  │  │       └── openai.deserialize_response                                │
  │  │           Attributes: body_size_bytes                                │
  │  │                                                                       │
  │  └── openai.record_metrics                                              │
  │      Attributes: tokens.prompt, tokens.completion                       │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 17.3 Logging Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LOGGING ARCHITECTURE                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Log Levels and Use Cases:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  ERROR                                                                   │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  • Authentication failures                                       │    │
  │  │  • Configuration errors                                          │    │
  │  │  • Unrecoverable errors (after retries exhausted)               │    │
  │  │  • Circuit breaker opened due to failures                        │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  WARN                                                                    │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  • Rate limits hit                                               │    │
  │  │  • Retryable errors (before retry)                              │    │
  │  │  • Deprecation warnings                                          │    │
  │  │  • Content moderation flags                                      │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  INFO                                                                    │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  • Client initialized                                            │    │
  │  │  • Request started (without body)                               │    │
  │  │  • Request completed (with latency, tokens)                     │    │
  │  │  • Circuit breaker state changes                                 │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  DEBUG                                                                   │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  • Request details (sanitized)                                   │    │
  │  │  • Response headers                                              │    │
  │  │  • Rate limit remaining                                          │    │
  │  │  • Retry attempts                                                │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  TRACE                                                                   │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  • Full request/response bodies (opt-in only)                   │    │
  │  │  • Connection pool state                                         │    │
  │  │  • SSE chunk details                                             │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Structured Log Format:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  {                                                                       │
  │    "timestamp": "2025-12-08T10:30:00.123Z",                             │
  │    "level": "INFO",                                                      │
  │    "target": "integrations_openai::services::chat",                     │
  │    "message": "Chat completion completed",                               │
  │    "fields": {                                                           │
  │      "correlation_id": "abc-123",                                       │
  │      "endpoint": "/chat/completions",                                   │
  │      "model": "gpt-4",                                                  │
  │      "latency_ms": 1234,                                                │
  │      "tokens_prompt": 150,                                              │
  │      "tokens_completion": 200,                                          │
  │      "request_id": "req_xyz789"                                         │
  │    },                                                                    │
  │    "span": {                                                             │
  │      "trace_id": "trace-456",                                           │
  │      "span_id": "span-789"                                              │
  │    }                                                                     │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 18. Security Architecture

### 18.1 Credential Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CREDENTIAL SECURITY                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  API Key Lifecycle:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  1. Input                     2. Storage                                │
  │  ┌─────────────────────┐     ┌─────────────────────┐                   │
  │  │ Environment var     │────►│ SecretString       │                   │
  │  │ Config file         │     │ (zeroized memory)  │                   │
  │  │ Direct parameter    │     │                     │                   │
  │  └─────────────────────┘     └──────────┬──────────┘                   │
  │                                          │                              │
  │  3. Usage                    4. Cleanup                                 │
  │  ┌─────────────────────┐     ┌─────────────────────┐                   │
  │  │ expose_secret()     │────►│ Drop trait         │                   │
  │  │ (scoped, brief)     │     │ Zeroize memory     │                   │
  │  │ Add to header       │     │ Clear references   │                   │
  │  └─────────────────────┘     └─────────────────────┘                   │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Never Logged:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  • API keys (appear as "[REDACTED]")                                    │
  │  • Authorization headers                                                 │
  │  • Organization IDs                                                      │
  │  • Project IDs                                                           │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 18.2 Transport Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TRANSPORT SECURITY                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  TLS Configuration:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Minimum Version: TLS 1.2                                               │
  │  Preferred Version: TLS 1.3                                             │
  │                                                                          │
  │  Cipher Suites (TLS 1.2):                                               │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  • TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384                        │    │
  │  │  • TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256                        │    │
  │  │  • TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256                  │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Cipher Suites (TLS 1.3):                                               │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  • TLS_AES_256_GCM_SHA384                                       │    │
  │  │  • TLS_AES_128_GCM_SHA256                                       │    │
  │  │  • TLS_CHACHA20_POLY1305_SHA256                                 │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Certificate Validation:                                                 │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  • Full chain validation                                         │    │
  │  │  • Hostname verification                                         │    │
  │  │  • OCSP stapling (when available)                               │    │
  │  │  • No self-signed certificates in production                    │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 19. Testing Architecture

### 19.1 Test Pyramid

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST PYRAMID                                        │
└─────────────────────────────────────────────────────────────────────────────┘

                                  ▲
                                 /│\
                                / │ \
                               /  │  \     E2E Tests (few)
                              /   │   \    • Real OpenAI API
                             /    │    \   • CI only, rate limited
                            /     │     \
                           ───────┼───────
                          /       │       \
                         /        │        \   Integration Tests
                        /         │         \  • Mock HTTP server
                       /          │          \ • Contract verification
                      /           │           \
                     ─────────────┼─────────────
                    /             │             \
                   /              │              \   Unit Tests (many)
                  /               │               \  • Mock all dependencies
                 /                │                \ • Fast, isolated
                /                 │                 \
               ───────────────────┴───────────────────


  Test Distribution:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Unit Tests:        70%  (~500 tests)                                   │
  │  Integration Tests: 25%  (~175 tests)                                   │
  │  E2E Tests:          5%  (~25 tests)                                    │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 19.2 Mock Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MOCK STRATEGY                                       │
└─────────────────────────────────────────────────────────────────────────────┘

  London School TDD - Interface-Based Mocking:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Production:                                                             │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  ChatCompletionService                                           │    │
  │  │         │                                                        │    │
  │  │         ▼                                                        │    │
  │  │  HttpTransport (trait)                                          │    │
  │  │         │                                                        │    │
  │  │         ▼                                                        │    │
  │  │  ReqwestHttpTransport (impl)                                    │    │
  │  │         │                                                        │    │
  │  │         ▼                                                        │    │
  │  │  OpenAI API                                                      │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Testing:                                                                │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  ChatCompletionService                                           │    │
  │  │         │                                                        │    │
  │  │         ▼                                                        │    │
  │  │  HttpTransport (trait)                                          │    │
  │  │         │                                                        │    │
  │  │         ▼                                                        │    │
  │  │  MockHttpTransport (impl)                                       │    │
  │  │         │                                                        │    │
  │  │         ▼                                                        │    │
  │  │  Canned responses                                                │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Mockable Boundaries:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  • HttpTransport           → MockHttpTransport                          │
  │  • RetryExecutor           → MockRetryExecutor (no delay)               │
  │  • RateLimiter             → MockRateLimiter (always permits)           │
  │  • CircuitBreaker          → MockCircuitBreaker (configurable)          │
  │  • Logger                  → TestLogger (captures logs)                 │
  │  • Tracer                  → TestTracer (captures spans)                │
  │  • Clock                   → MockClock (controllable time)              │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 20. Performance Considerations

### 20.1 Latency Budget

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LATENCY BUDGET                                      │
└─────────────────────────────────────────────────────────────────────────────┘

  Typical Request (chat completion, ~100 tokens):

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Component                              Target        Max                │
  │  ─────────────────────────────────────────────────────────────          │
  │  Request validation                     < 1ms         5ms                │
  │  JSON serialization                     < 1ms         5ms                │
  │  Rate limiter check                     < 1ms         5ms                │
  │  Circuit breaker check                  < 1ms         5ms                │
  │  Connection pool acquire                < 5ms         50ms               │
  │  TLS handshake (if new conn)            < 50ms        200ms              │
  │  Network round trip                     < 100ms       500ms              │
  │  ─────────────────────────────────────────────────────────────          │
  │  API processing (OpenAI)                500-5000ms    variable           │
  │  ─────────────────────────────────────────────────────────────          │
  │  JSON deserialization                   < 1ms         10ms               │
  │  Response processing                    < 1ms         5ms                │
  │  ─────────────────────────────────────────────────────────────          │
  │  Module overhead (excluding API)        < 10ms        75ms               │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 20.2 Throughput Targets

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        THROUGHPUT TARGETS                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  Concurrent Requests:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Scenario                           Target                              │
  │  ─────────────────────────────────────────────────────────────          │
  │  Single client, sequential           1 req/sec                          │
  │  Single client, concurrent           100 req/sec (limited by rate)      │
  │  Multiple clients, load balanced     1000 req/sec (per instance)        │
  │                                                                          │
  │  Bottleneck: OpenAI API rate limits (not module)                        │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Memory Efficiency:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Component                           Memory                             │
  │  ─────────────────────────────────────────────────────────────          │
  │  Client instance                     ~5 KB                              │
  │  Per connection (pooled)             ~10 KB                             │
  │  Per request (in-flight)             ~50 KB (depends on payload)        │
  │  SSE stream buffer                   ~64 KB (configurable)              │
  │                                                                          │
  │  Target: < 100 MB for 1000 concurrent requests                          │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 20.3 Optimization Strategies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OPTIMIZATION STRATEGIES                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  Connection Reuse:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  • HTTP/2 multiplexing (when supported by OpenAI)                       │
  │  • Connection pooling with keep-alive                                   │
  │  • Warm connections for latency-sensitive paths                         │
  └─────────────────────────────────────────────────────────────────────────┘

  Serialization:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  • Pre-allocated buffers for common request sizes                       │
  │  • Skip serialization of None/default fields                           │
  │  • Streaming deserialization for large responses                        │
  └─────────────────────────────────────────────────────────────────────────┘

  Memory:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  • Arena allocation for request processing                              │
  │  • Ring buffer for SSE parsing                                          │
  │  • Zero-copy where possible (Bytes type)                               │
  └─────────────────────────────────────────────────────────────────────────┘

  Concurrency:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  • Lock-free counters for metrics                                       │
  │  • Read-write locks for rate limit headers                             │
  │  • Minimal critical sections in hot paths                              │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | SPARC Generator | Initial architecture (Part 3) |

---

**End of Architecture Phase**

*The next phase (Refinement) will detail implementation guidelines, code standards, and review criteria.*
