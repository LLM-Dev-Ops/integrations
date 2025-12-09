# SPARC Architecture: Anthropic Integration Module

**Part 3 of 3: Integration, Observability, and Deployment**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/anthropic`

---

## Table of Contents

14. [Integration with Repo Primitives](#14-integration-with-repo-primitives)
15. [Observability Architecture](#15-observability-architecture)
16. [Security Architecture](#16-security-architecture)
17. [Testing Architecture](#17-testing-architecture)
18. [Deployment Considerations](#18-deployment-considerations)
19. [API Reference Summary](#19-api-reference-summary)

---

## 14. Integration with Repo Primitives

### 14.1 Dependency Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTEGRATION REPO DEPENDENCY MAP                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     integrations-anthropic                           │    │
│  │                                                                      │    │
│  │   Uses primitives only - NO cross-module dependencies                │    │
│  │                                                                      │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    INTEGRATION REPO PRIMITIVES                       │    │
│  │                                                                      │    │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │    │
│  │   │integrations-    │  │integrations-    │  │integrations-    │     │    │
│  │   │   errors        │  │   retry         │  │circuit-breaker  │     │    │
│  │   │                 │  │                 │  │                 │     │    │
│  │   │ • Error traits  │  │ • RetryExecutor │  │ • CircuitBreaker│     │    │
│  │   │ • ErrorContext  │  │ • Backoff       │  │ • State Machine │     │    │
│  │   │ • ErrorChain    │  │ • RetryPolicy   │  │ • Thresholds    │     │    │
│  │   └─────────────────┘  └─────────────────┘  └─────────────────┘     │    │
│  │                                                                      │    │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │    │
│  │   │integrations-    │  │integrations-    │  │integrations-    │     │    │
│  │   │   rate-limit    │  │   tracing       │  │   logging       │     │    │
│  │   │                 │  │                 │  │                 │     │    │
│  │   │ • TokenBucket   │  │ • Span          │  │ • Logger trait  │     │    │
│  │   │ • SlidingWindow │  │ • TraceContext  │  │ • Structured    │     │    │
│  │   │ • RateLimitMgr  │  │ • SpanBuilder   │  │ • Redaction     │     │    │
│  │   └─────────────────┘  └─────────────────┘  └─────────────────┘     │    │
│  │                                                                      │    │
│  │   ┌─────────────────┐  ┌─────────────────┐                          │    │
│  │   │integrations-    │  │integrations-    │                          │    │
│  │   │   types         │  │   config        │                          │    │
│  │   │                 │  │                 │                          │    │
│  │   │ • SecretString  │  │ • ConfigLoader  │                          │    │
│  │   │ • Url           │  │ • EnvProvider   │                          │    │
│  │   │ • Duration      │  │ • Validation    │                          │    │
│  │   └─────────────────┘  └─────────────────┘                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        NOT DEPENDENCIES                              │    │
│  │                                                                      │    │
│  │   ╳ ruvbase (Layer 0)                                                │    │
│  │   ╳ integrations-openai (sibling module)                             │    │
│  │   ╳ integrations-google (sibling module)                             │    │
│  │   ╳ integrations-* (any other provider)                              │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Error Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR INTEGRATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Using integrations-errors primitives:                                      │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rust Implementation                                                    │ │
│  │                                                                         │ │
│  │   use integrations_errors::{Error, ErrorContext, ErrorKind, Retryable};│ │
│  │                                                                         │ │
│  │   #[derive(Debug, Error)]                                              │ │
│  │   pub enum AnthropicError {                                            │ │
│  │       #[error("Rate limit exceeded: {message}")]                       │ │
│  │       RateLimitError {                                                 │ │
│  │           message: String,                                             │ │
│  │           retry_after: Option<Duration>,                               │ │
│  │           #[source]                                                    │ │
│  │           source: Option<Box<dyn Error>>,                              │ │
│  │       },                                                               │ │
│  │       // ... other variants                                            │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl ErrorContext for AnthropicError {                               │ │
│  │       fn error_kind(&self) -> ErrorKind {                              │ │
│  │           match self {                                                 │ │
│  │               Self::RateLimitError { .. } => ErrorKind::RateLimit,     │ │
│  │               Self::AuthenticationError { .. } => ErrorKind::Auth,     │ │
│  │               Self::ConnectionError { .. } => ErrorKind::Network,      │ │
│  │               // ...                                                   │ │
│  │           }                                                            │ │
│  │       }                                                                │ │
│  │                                                                         │ │
│  │       fn request_id(&self) -> Option<&str> {                           │ │
│  │           self.context.request_id.as_deref()                           │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl Retryable for AnthropicError {                                  │ │
│  │       fn is_retryable(&self) -> bool {                                 │ │
│  │           matches!(self, Self::RateLimitError { .. } |                 │ │
│  │                          Self::OverloadedError { .. } |                │ │
│  │                          Self::ConnectionError { .. })                 │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Retry Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RETRY INTEGRATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Using integrations-retry primitives:                                       │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Configuration                                                          │ │
│  │                                                                         │ │
│  │   use integrations_retry::{RetryPolicy, ExponentialBackoff};           │ │
│  │                                                                         │ │
│  │   let retry_policy = RetryPolicy::builder()                            │ │
│  │       .max_attempts(3)                                                 │ │
│  │       .backoff(ExponentialBackoff {                                    │ │
│  │           initial: Duration::from_millis(1000),                        │ │
│  │           max: Duration::from_secs(60),                                │ │
│  │           multiplier: 2.0,                                             │ │
│  │           jitter: 0.25,                                                │ │
│  │       })                                                               │ │
│  │       .retry_on(|err: &AnthropicError| err.is_retryable())             │ │
│  │       .build();                                                        │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Execution                                                              │ │
│  │                                                                         │ │
│  │   use integrations_retry::RetryExecutor;                               │ │
│  │                                                                         │ │
│  │   let executor = RetryExecutor::new(retry_policy);                     │ │
│  │                                                                         │ │
│  │   let result = executor                                                │ │
│  │       .execute(|| async {                                              │ │
│  │           transport.send(request).await                                │ │
│  │       })                                                               │ │
│  │       .await;                                                          │ │
│  │                                                                         │ │
│  │   // Executor handles:                                                 │ │
│  │   // • Retry decision based on error type                              │ │
│  │   // • Backoff calculation with jitter                                 │ │
│  │   // • Retry-After header respect                                      │ │
│  │   // • Attempt counting and metrics                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.4 Circuit Breaker Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CIRCUIT BREAKER INTEGRATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Using integrations-circuit-breaker primitives:                             │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Configuration                                                          │ │
│  │                                                                         │ │
│  │   use integrations_circuit_breaker::{CircuitBreaker, CircuitConfig};   │ │
│  │                                                                         │ │
│  │   let circuit = CircuitBreaker::new(CircuitConfig {                    │ │
│  │       failure_threshold: 5,          // Open after 5 failures          │ │
│  │       success_threshold: 3,          // Close after 3 successes        │ │
│  │       open_duration: Duration::from_secs(30),                          │ │
│  │       half_open_max_requests: 1,     // Probe requests in half-open    │ │
│  │   });                                                                  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ State Machine                                                          │ │
│  │                                                                         │ │
│  │                    ┌──────────┐                                         │ │
│  │         success    │  CLOSED  │    failure_count++                      │ │
│  │        ┌──────────►│          │◄──────────┐                             │ │
│  │        │           └────┬─────┘           │                             │ │
│  │        │                │                 │                             │ │
│  │        │    failure_threshold reached     │                             │ │
│  │        │                │                 │                             │ │
│  │        │                ▼                 │                             │ │
│  │        │           ┌──────────┐           │                             │ │
│  │        │           │   OPEN   │───────────┘                             │ │
│  │        │           │          │  (fail fast)                            │ │
│  │        │           └────┬─────┘                                         │ │
│  │        │                │                                               │ │
│  │        │      open_duration elapsed                                     │ │
│  │        │                │                                               │ │
│  │        │                ▼                                               │ │
│  │        │           ┌──────────┐                                         │ │
│  │        └───────────│HALF-OPEN │                                         │ │
│  │          success   │          │                                         │ │
│  │                    └────┬─────┘                                         │ │
│  │                         │ failure                                       │ │
│  │                         ▼                                               │ │
│  │                    back to OPEN                                         │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Usage in Anthropic Module                                              │ │
│  │                                                                         │ │
│  │   impl ResilienceOrchestrator {                                        │ │
│  │       async fn execute<F, T>(&self, f: F) -> Result<T>                 │ │
│  │       where F: Future<Output = Result<T>>                              │ │
│  │       {                                                                │ │
│  │           // Check circuit state                                       │ │
│  │           self.circuit.check_state()?;                                 │ │
│  │                                                                         │ │
│  │           // Execute with retry                                        │ │
│  │           let result = self.retry_executor.execute(f).await;           │ │
│  │                                                                         │ │
│  │           // Record result in circuit                                  │ │
│  │           match &result {                                              │ │
│  │               Ok(_) => self.circuit.record_success(),                  │ │
│  │               Err(e) if e.is_retryable() => {                          │ │
│  │                   self.circuit.record_failure()                        │ │
│  │               }                                                        │ │
│  │               Err(_) => {} // Non-retryable don't affect circuit       │ │
│  │           }                                                            │ │
│  │                                                                         │ │
│  │           result                                                       │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.5 Rate Limiter Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RATE LIMITER INTEGRATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Using integrations-rate-limit primitives:                                  │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Token Bucket (for requests/minute)                                     │ │
│  │                                                                         │ │
│  │   use integrations_rate_limit::{TokenBucket, RateLimiter};             │ │
│  │                                                                         │ │
│  │   let request_limiter = TokenBucket::new(                              │ │
│  │       capacity: 60,                    // Max requests                 │ │
│  │       refill_rate: 1.0,                // Tokens per second            │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  │   // Check and acquire                                                 │ │
│  │   match request_limiter.try_acquire(1) {                               │ │
│  │       Ok(permit) => {                                                  │ │
│  │           // Proceed with request                                      │ │
│  │           // Permit automatically released                             │ │
│  │       }                                                                │ │
│  │       Err(RateLimitExceeded { retry_after }) => {                      │ │
│  │           // Wait or reject                                            │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Sliding Window (for tokens/minute)                                     │ │
│  │                                                                         │ │
│  │   use integrations_rate_limit::SlidingWindowLog;                       │ │
│  │                                                                         │ │
│  │   let token_limiter = SlidingWindowLog::new(                           │ │
│  │       window: Duration::from_secs(60),                                 │ │
│  │       max_tokens: 100_000,             // Tokens per minute            │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  │   // Check estimated token usage before request                        │ │
│  │   let estimated_tokens = estimate_tokens(&request);                    │ │
│  │   token_limiter.check(estimated_tokens)?;                              │ │
│  │                                                                         │ │
│  │   // Record actual usage after response                                │ │
│  │   let actual_tokens = response.usage.total_tokens;                     │ │
│  │   token_limiter.record(actual_tokens);                                 │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Server-Side Rate Limit Sync                                            │ │
│  │                                                                         │ │
│  │   // Update local limits from response headers                         │ │
│  │   fn update_from_headers(&mut self, headers: &Headers) {               │ │
│  │       if let Some(remaining) = headers.get("x-ratelimit-remaining") {  │ │
│  │           self.request_limiter.set_available(remaining.parse()?);      │ │
│  │       }                                                                │ │
│  │       if let Some(reset) = headers.get("x-ratelimit-reset") {          │ │
│  │           self.request_limiter.set_reset_time(parse_timestamp(reset)); │ │
│  │       }                                                                │ │
│  │       if let Some(tokens) = headers.get("x-ratelimit-tokens-remaining")│ │
│  │       {                                                                │ │
│  │           self.token_limiter.set_available(tokens.parse()?);           │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Observability Architecture

### 15.1 Tracing Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TRACING ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Using integrations-tracing primitives:                                     │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Span Hierarchy                                                         │ │
│  │                                                                         │ │
│  │   [anthropic.client.create_message] ─────────────────────────────────┐ │ │
│  │   │                                                                   │ │ │
│  │   │ attributes:                                                       │ │ │
│  │   │   anthropic.model = "claude-sonnet-4-20250514"                    │ │ │
│  │   │   anthropic.max_tokens = 1024                                     │ │ │
│  │   │   request_id = "req_abc123"                                       │ │ │
│  │   │                                                                   │ │ │
│  │   ├──[anthropic.resilience.execute] ──────────────────────────────┐  │ │ │
│  │   │  │                                                            │  │ │ │
│  │   │  │ attributes:                                                │  │ │ │
│  │   │  │   retry.attempt = 1                                        │  │ │ │
│  │   │  │   circuit_breaker.state = "closed"                         │  │ │ │
│  │   │  │                                                            │  │ │ │
│  │   │  ├──[anthropic.transport.send] ────────────────────────────┐ │  │ │ │
│  │   │  │  │                                                      │ │  │ │ │
│  │   │  │  │ attributes:                                          │ │  │ │ │
│  │   │  │  │   http.method = "POST"                               │ │  │ │ │
│  │   │  │  │   http.url = "https://api.anthropic.com/v1/messages" │ │  │ │ │
│  │   │  │  │   http.status_code = 200                             │ │  │ │ │
│  │   │  │  │   http.request_content_length = 1234                 │ │  │ │ │
│  │   │  │  │   http.response_content_length = 5678                │ │  │ │ │
│  │   │  │  │                                                      │ │  │ │ │
│  │   │  │  └──────────────────────────────────────────────────────┘ │  │ │ │
│  │   │  │                                                            │  │ │ │
│  │   │  └────────────────────────────────────────────────────────────┘  │ │ │
│  │   │                                                                   │ │ │
│  │   │ final attributes:                                                 │ │ │
│  │   │   anthropic.input_tokens = 50                                     │ │ │
│  │   │   anthropic.output_tokens = 150                                   │ │ │
│  │   │   anthropic.stop_reason = "end_turn"                              │ │ │
│  │   │                                                                   │ │ │
│  │   └───────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 15.2 Metrics Collection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         METRICS ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Metric Types                                                           │ │
│  │                                                                         │ │
│  │   COUNTERS (monotonic)                                                 │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ anthropic_requests_total                                        │  │ │
│  │   │   labels: { service, method, status, model }                    │  │ │
│  │   │                                                                 │  │ │
│  │   │ anthropic_tokens_total                                          │  │ │
│  │   │   labels: { service, direction (input/output), model }          │  │ │
│  │   │                                                                 │  │ │
│  │   │ anthropic_errors_total                                          │  │ │
│  │   │   labels: { service, error_type, retryable }                    │  │ │
│  │   │                                                                 │  │ │
│  │   │ anthropic_retries_total                                         │  │ │
│  │   │   labels: { service, attempt_number }                           │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   HISTOGRAMS (distribution)                                            │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ anthropic_request_duration_seconds                              │  │ │
│  │   │   labels: { service, method, status }                           │  │ │
│  │   │   buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120]         │  │ │
│  │   │                                                                 │  │ │
│  │   │ anthropic_time_to_first_token_seconds                           │  │ │
│  │   │   labels: { model }                                             │  │ │
│  │   │   buckets: [0.1, 0.25, 0.5, 1, 2, 5]                            │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   GAUGES (point-in-time)                                               │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ anthropic_rate_limit_remaining                                  │  │ │
│  │   │   labels: { limit_type (requests/tokens) }                      │  │ │
│  │   │                                                                 │  │ │
│  │   │ anthropic_circuit_breaker_state                                 │  │ │
│  │   │   labels: { service }                                           │  │ │
│  │   │   values: 0=closed, 1=half-open, 2=open                         │  │ │
│  │   │                                                                 │  │ │
│  │   │ anthropic_active_streams                                        │  │ │
│  │   │   labels: { }                                                   │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 15.3 Structured Logging

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STRUCTURED LOGGING                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Using integrations-logging primitives:                                     │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Log Levels and Events                                                  │ │
│  │                                                                         │ │
│  │   DEBUG:                                                               │ │
│  │   • Request/response details (with redaction)                          │ │
│  │   • Retry attempt information                                          │ │
│  │   • Rate limiter state changes                                         │ │
│  │                                                                         │ │
│  │   INFO:                                                                │ │
│  │   • Request start/completion                                           │ │
│  │   • Stream start/completion                                            │ │
│  │   • Configuration loaded                                               │ │
│  │                                                                         │ │
│  │   WARN:                                                                │ │
│  │   • Rate limit approaching                                             │ │
│  │   • Retry triggered                                                    │ │
│  │   • Circuit breaker state change                                       │ │
│  │                                                                         │ │
│  │   ERROR:                                                               │ │
│  │   • Request failed (all retries exhausted)                             │ │
│  │   • Circuit breaker opened                                             │ │
│  │   • Authentication failure                                             │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Log Format (JSON)                                                      │ │
│  │                                                                         │ │
│  │   {                                                                    │ │
│  │       "timestamp": "2025-12-09T10:30:00.000Z",                         │ │
│  │       "level": "INFO",                                                 │ │
│  │       "target": "integrations_anthropic::messages",                    │ │
│  │       "message": "Request completed",                                  │ │
│  │       "fields": {                                                      │ │
│  │           "request_id": "req_abc123",                                  │ │
│  │           "model": "claude-sonnet-4-20250514",                         │ │
│  │           "duration_ms": 1234,                                         │ │
│  │           "input_tokens": 50,                                          │ │
│  │           "output_tokens": 150,                                        │ │
│  │           "status": "success"                                          │ │
│  │       },                                                               │ │
│  │       "span": {                                                        │ │
│  │           "trace_id": "abc123def456",                                  │ │
│  │           "span_id": "span789"                                         │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Credential Redaction                                                   │ │
│  │                                                                         │ │
│  │   // API keys are NEVER logged                                         │ │
│  │   log::debug!(                                                         │ │
│  │       request_id = %req.id,                                            │ │
│  │       api_key = %"[REDACTED]",  // SecretString auto-redacts           │ │
│  │       "Sending request"                                                │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  │   // Request bodies may contain sensitive data                         │ │
│  │   log::debug!(                                                         │ │
│  │       body = %redact_sensitive(&body),                                 │ │
│  │       "Request body"                                                   │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 16. Security Architecture

### 16.1 Credential Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CREDENTIAL MANAGEMENT                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ SecretString Type                                                      │ │
│  │                                                                         │ │
│  │   use integrations_types::SecretString;                                │ │
│  │                                                                         │ │
│  │   pub struct SecretString {                                            │ │
│  │       inner: String,                                                   │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl SecretString {                                                  │ │
│  │       /// Create from string (takes ownership)                         │ │
│  │       pub fn new(s: String) -> Self;                                   │ │
│  │                                                                         │ │
│  │       /// Access the secret (explicit exposure)                        │ │
│  │       pub fn expose_secret(&self) -> &str;                             │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl Debug for SecretString {                                        │ │
│  │       fn fmt(&self, f: &mut Formatter) -> fmt::Result {                │ │
│  │           write!(f, "[REDACTED]")  // Never expose in debug            │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl Display for SecretString {                                      │ │
│  │       fn fmt(&self, f: &mut Formatter) -> fmt::Result {                │ │
│  │           write!(f, "[REDACTED]")  // Never expose in display          │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // Zeroize on drop (security best practice)                          │ │
│  │   impl Drop for SecretString {                                         │ │
│  │       fn drop(&mut self) {                                             │ │
│  │           self.inner.zeroize();                                        │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Credential Loading Priority                                            │ │
│  │                                                                         │ │
│  │   1. Explicit parameter (SecretString)                                 │ │
│  │      AnthropicClient::new(ClientConfig {                               │ │
│  │          api_key: SecretString::new(key),                              │ │
│  │          ..                                                            │ │
│  │      })                                                                │ │
│  │                                                                         │ │
│  │   2. Environment variable                                              │ │
│  │      ANTHROPIC_API_KEY=sk-ant-...                                      │ │
│  │                                                                         │ │
│  │   3. Config file (NOT RECOMMENDED for production)                      │ │
│  │      ~/.anthropic/config.json                                          │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 TLS Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TLS CONFIGURATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TLS Requirements                                                       │ │
│  │                                                                         │ │
│  │   Minimum: TLS 1.2                                                     │ │
│  │   Preferred: TLS 1.3                                                   │ │
│  │                                                                         │ │
│  │   // Rust (reqwest with rustls)                                        │ │
│  │   let client = reqwest::Client::builder()                              │ │
│  │       .min_tls_version(reqwest::tls::Version::TLS_1_2)                 │ │
│  │       .use_rustls_tls()                                                │ │
│  │       .build()?;                                                       │ │
│  │                                                                         │ │
│  │   // TypeScript (Node.js)                                              │ │
│  │   // TLS 1.2+ is default in modern Node.js                             │ │
│  │   // Explicitly configure if needed:                                   │ │
│  │   import { Agent } from 'https';                                       │ │
│  │   const agent = new Agent({                                            │ │
│  │       minVersion: 'TLSv1.2',                                           │ │
│  │   });                                                                  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Certificate Verification                                               │ │
│  │                                                                         │ │
│  │   • Always verify server certificates (default)                        │ │
│  │   • Use system CA bundle or webpki-roots                               │ │
│  │   • NO option to disable certificate verification                      │ │
│  │                                                                         │ │
│  │   // This is explicitly NOT provided:                                  │ │
│  │   // .danger_accept_invalid_certs(true)  // NEVER                      │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.3 Input Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INPUT VALIDATION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Validation Points                                                      │ │
│  │                                                                         │ │
│  │   Request Validation (before sending):                                 │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ • model: Non-empty, valid format                                │  │ │
│  │   │ • max_tokens: > 0, within model limits                          │  │ │
│  │   │ • messages: Non-empty array                                     │  │ │
│  │   │ • messages[].role: Valid role enum                              │  │ │
│  │   │ • messages[].content: Non-empty                                 │  │ │
│  │   │ • system: Optional, string or content blocks                    │  │ │
│  │   │ • temperature: 0.0 <= t <= 1.0 (if provided)                    │  │ │
│  │   │ • top_p: 0.0 < p <= 1.0 (if provided)                           │  │ │
│  │   │ • stop_sequences: Valid strings (if provided)                   │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   Response Validation (after receiving):                               │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ • id: Present, valid format                                     │  │ │
│  │   │ • type: Expected value ("message")                              │  │ │
│  │   │ • content: Valid content block array                            │  │ │
│  │   │ • usage: Valid token counts                                     │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   // Example validation                                                │ │
│  │   impl CreateMessageRequest {                                          │ │
│  │       pub fn validate(&self) -> Result<(), ValidationError> {          │ │
│  │           if self.messages.is_empty() {                                │ │
│  │               return Err(ValidationError::field(                       │ │
│  │                   "messages",                                          │ │
│  │                   "must not be empty"                                  │ │
│  │               ));                                                      │ │
│  │           }                                                            │ │
│  │           if self.max_tokens == 0 {                                    │ │
│  │               return Err(ValidationError::field(                       │ │
│  │                   "max_tokens",                                        │ │
│  │                   "must be greater than 0"                             │ │
│  │               ));                                                      │ │
│  │           }                                                            │ │
│  │           // ... more validations                                      │ │
│  │           Ok(())                                                       │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 17. Testing Architecture

### 17.1 London-School TDD Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LONDON-SCHOOL TDD STRUCTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Test Organization                                                      │ │
│  │                                                                         │ │
│  │   tests/                                                               │ │
│  │   ├── unit/                                                            │ │
│  │   │   ├── client_test.rs          # Client unit tests                  │ │
│  │   │   ├── messages_test.rs        # Messages service tests             │ │
│  │   │   ├── streaming_test.rs       # Streaming handler tests            │ │
│  │   │   ├── models_test.rs          # Models service tests               │ │
│  │   │   ├── batches_test.rs         # Batches service tests              │ │
│  │   │   ├── admin_test.rs           # Admin service tests                │ │
│  │   │   ├── resilience_test.rs      # Resilience orchestrator tests      │ │
│  │   │   ├── transport_test.rs       # HTTP transport tests               │ │
│  │   │   └── error_test.rs           # Error handling tests               │ │
│  │   │                                                                    │ │
│  │   ├── integration/                                                     │ │
│  │   │   ├── mock_server_test.rs     # Tests with mock HTTP server        │ │
│  │   │   ├── streaming_e2e_test.rs   # End-to-end streaming tests         │ │
│  │   │   └── resilience_e2e_test.rs  # Resilience pattern E2E tests       │ │
│  │   │                                                                    │ │
│  │   └── contract/                                                        │ │
│  │       └── api_contract_test.rs    # API contract verification          │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Mock Interfaces (London-School)                                        │ │
│  │                                                                         │ │
│  │   // All external dependencies have mock implementations               │ │
│  │                                                                         │ │
│  │   #[cfg(test)]                                                         │ │
│  │   pub mod mocks {                                                      │ │
│  │       pub struct MockHttpTransport { ... }                             │ │
│  │       pub struct MockAuthProvider { ... }                              │ │
│  │       pub struct MockCircuitBreaker { ... }                            │ │
│  │       pub struct MockRateLimiter { ... }                               │ │
│  │       pub struct MockRetryExecutor { ... }                             │ │
│  │       pub struct MockLogger { ... }                                    │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // Mocks implement the same traits as production code                │ │
│  │   impl HttpTransport for MockHttpTransport {                           │ │
│  │       async fn send(&self, req: Request) -> Result<Response> {         │ │
│  │           // Return pre-configured responses                           │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 17.2 Test Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST PATTERNS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Unit Test Pattern (with mocks)                                         │ │
│  │                                                                         │ │
│  │   #[tokio::test]                                                       │ │
│  │   async fn test_messages_create_success() {                            │ │
│  │       // Arrange                                                       │ │
│  │       let mock_transport = MockHttpTransport::new()                    │ │
│  │           .expect_request()                                            │ │
│  │           .with_method("POST")                                         │ │
│  │           .with_path("/v1/messages")                                   │ │
│  │           .returning(Ok(mock_message_response()));                     │ │
│  │                                                                         │ │
│  │       let mock_resilience = MockResilienceOrchestrator::passthrough(); │ │
│  │                                                                         │ │
│  │       let service = MessagesService::new(                              │ │
│  │           Arc::new(mock_transport),                                    │ │
│  │           Arc::new(mock_resilience),                                   │ │
│  │       );                                                               │ │
│  │                                                                         │ │
│  │       // Act                                                           │ │
│  │       let request = CreateMessageRequest::builder()                    │ │
│  │           .model("claude-sonnet-4-20250514")                           │ │
│  │           .max_tokens(1024)                                            │ │
│  │           .messages(vec![message("user", "Hello")])                    │ │
│  │           .build();                                                    │ │
│  │                                                                         │ │
│  │       let result = service.create(request).await;                      │ │
│  │                                                                         │ │
│  │       // Assert                                                        │ │
│  │       assert!(result.is_ok());                                         │ │
│  │       let response = result.unwrap();                                  │ │
│  │       assert_eq!(response.model, "claude-sonnet-4-20250514");          │ │
│  │       mock_transport.verify();                                         │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Integration Test Pattern (with mock server)                            │ │
│  │                                                                         │ │
│  │   #[tokio::test]                                                       │ │
│  │   async fn test_full_request_flow() {                                  │ │
│  │       // Start mock HTTP server                                        │ │
│  │       let server = MockServer::start().await;                          │ │
│  │                                                                         │ │
│  │       // Configure mock endpoint                                       │ │
│  │       Mock::given(method("POST"))                                      │ │
│  │           .and(path("/v1/messages"))                                   │ │
│  │           .and(header("x-api-key", "test-key"))                        │ │
│  │           .respond_with(ResponseTemplate::new(200)                     │ │
│  │               .set_body_json(mock_message_response()))                 │ │
│  │           .mount(&server)                                              │ │
│  │           .await;                                                      │ │
│  │                                                                         │ │
│  │       // Create real client pointing to mock server                    │ │
│  │       let client = AnthropicClient::new(ClientConfig {                 │ │
│  │           base_url: server.uri().parse().unwrap(),                     │ │
│  │           api_key: SecretString::new("test-key".into()),               │ │
│  │           ..Default::default()                                         │ │
│  │       });                                                              │ │
│  │                                                                         │ │
│  │       // Execute real request flow                                     │ │
│  │       let result = client.messages().create(request).await;            │ │
│  │                                                                         │ │
│  │       assert!(result.is_ok());                                         │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Streaming Test Pattern                                                 │ │
│  │                                                                         │ │
│  │   #[tokio::test]                                                       │ │
│  │   async fn test_streaming_events() {                                   │ │
│  │       // Mock SSE stream                                               │ │
│  │       let sse_events = vec![                                           │ │
│  │           "event: message_start\ndata: {...}\n\n",                     │ │
│  │           "event: content_block_start\ndata: {...}\n\n",               │ │
│  │           "event: content_block_delta\ndata: {...}\n\n",               │ │
│  │           "event: content_block_stop\ndata: {}\n\n",                   │ │
│  │           "event: message_delta\ndata: {...}\n\n",                     │ │
│  │           "event: message_stop\ndata: {}\n\n",                         │ │
│  │       ];                                                               │ │
│  │                                                                         │ │
│  │       let mock_transport = MockHttpTransport::new()                    │ │
│  │           .returning_stream(sse_events);                               │ │
│  │                                                                         │ │
│  │       let handler = StreamingHandler::new(Arc::new(mock_transport));   │ │
│  │       let mut stream = handler.create_stream(request).await?;          │ │
│  │                                                                         │ │
│  │       // Collect all events                                            │ │
│  │       let events: Vec<_> = stream.collect().await;                     │ │
│  │                                                                         │ │
│  │       assert_eq!(events.len(), 6);                                     │ │
│  │       assert!(matches!(events[0], StreamEvent::MessageStart(_)));      │ │
│  │       assert!(matches!(events[5], StreamEvent::MessageStop));          │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 17.3 Test Fixtures

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST FIXTURES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Fixture Builders                                                       │ │
│  │                                                                         │ │
│  │   // Request fixtures                                                  │ │
│  │   pub fn create_message_request() -> CreateMessageRequest {            │ │
│  │       CreateMessageRequest::builder()                                  │ │
│  │           .model("claude-sonnet-4-20250514")                           │ │
│  │           .max_tokens(1024)                                            │ │
│  │           .messages(vec![message("user", "Hello")])                    │ │
│  │           .build()                                                     │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // Response fixtures                                                 │ │
│  │   pub fn message_response() -> MessageResponse {                       │ │
│  │       MessageResponse {                                                │ │
│  │           id: "msg_test123".into(),                                    │ │
│  │           type_: "message".into(),                                     │ │
│  │           role: Role::Assistant,                                       │ │
│  │           content: vec![ContentBlock::Text(TextBlock {                 │ │
│  │               text: "Hello!".into(),                                   │ │
│  │           })],                                                         │ │
│  │           model: "claude-sonnet-4-20250514".into(),                    │ │
│  │           stop_reason: Some(StopReason::EndTurn),                      │ │
│  │           usage: Usage {                                               │ │
│  │               input_tokens: 10,                                        │ │
│  │               output_tokens: 20,                                       │ │
│  │           },                                                           │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // Error fixtures                                                    │ │
│  │   pub fn rate_limit_error() -> AnthropicError {                        │ │
│  │       AnthropicError::RateLimitError {                                 │ │
│  │           message: "Rate limit exceeded".into(),                       │ │
│  │           retry_after: Some(Duration::from_secs(30)),                  │ │
│  │           source: None,                                                │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ JSON Fixtures (for API responses)                                      │ │
│  │                                                                         │ │
│  │   fixtures/                                                            │ │
│  │   ├── messages/                                                        │ │
│  │   │   ├── success_response.json                                        │ │
│  │   │   ├── streaming_events.json                                        │ │
│  │   │   └── error_responses/                                             │ │
│  │   │       ├── rate_limit.json                                          │ │
│  │   │       ├── invalid_request.json                                     │ │
│  │   │       └── overloaded.json                                          │ │
│  │   ├── models/                                                          │ │
│  │   │   ├── list_response.json                                           │ │
│  │   │   └── get_response.json                                            │ │
│  │   └── batches/                                                         │ │
│  │       ├── create_response.json                                         │ │
│  │       └── results_response.jsonl                                       │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 18. Deployment Considerations

### 18.1 Build Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BUILD CONFIGURATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rust Cargo Features                                                    │ │
│  │                                                                         │ │
│  │   [features]                                                           │ │
│  │   default = ["rustls-tls"]                                             │ │
│  │                                                                         │ │
│  │   # TLS backends (choose one)                                          │ │
│  │   rustls-tls = ["reqwest/rustls-tls"]                                  │ │
│  │   native-tls = ["reqwest/native-tls"]                                  │ │
│  │                                                                         │ │
│  │   # Optional features                                                  │ │
│  │   tracing = ["dep:tracing", "integrations-tracing"]                    │ │
│  │   metrics = ["dep:metrics", "integrations-metrics"]                    │ │
│  │                                                                         │ │
│  │   # Beta API features                                                  │ │
│  │   beta-extended-thinking = []                                          │ │
│  │   beta-pdfs = []                                                       │ │
│  │   beta-prompt-caching = []                                             │ │
│  │   beta-computer-use = []                                               │ │
│  │                                                                         │ │
│  │   # All beta features                                                  │ │
│  │   beta = ["beta-extended-thinking", "beta-pdfs",                       │ │
│  │           "beta-prompt-caching", "beta-computer-use"]                  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TypeScript Build                                                       │ │
│  │                                                                         │ │
│  │   // tsconfig.json                                                     │ │
│  │   {                                                                    │ │
│  │       "compilerOptions": {                                             │ │
│  │           "target": "ES2022",                                          │ │
│  │           "module": "NodeNext",                                        │ │
│  │           "moduleResolution": "NodeNext",                              │ │
│  │           "strict": true,                                              │ │
│  │           "declaration": true,                                         │ │
│  │           "declarationMap": true,                                      │ │
│  │           "sourceMap": true,                                           │ │
│  │           "outDir": "./dist"                                           │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // Build outputs                                                     │ │
│  │   dist/                                                                │ │
│  │   ├── cjs/           # CommonJS build                                  │ │
│  │   ├── esm/           # ES Modules build                                │ │
│  │   └── types/         # TypeScript declarations                         │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 18.2 Environment Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ENVIRONMENT CONFIGURATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Environment Variables                                                  │ │
│  │                                                                         │ │
│  │   Required:                                                            │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ ANTHROPIC_API_KEY        API key for authentication             │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   Optional (with defaults):                                            │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ ANTHROPIC_BASE_URL       Default: https://api.anthropic.com     │  │ │
│  │   │ ANTHROPIC_API_VERSION    Default: 2023-06-01                    │  │ │
│  │   │ ANTHROPIC_TIMEOUT_SECS   Default: 300                           │  │ │
│  │   │ ANTHROPIC_MAX_RETRIES    Default: 3                             │  │ │
│  │   │ ANTHROPIC_LOG_LEVEL      Default: INFO                          │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   Beta features (comma-separated list):                                │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ ANTHROPIC_BETA_FEATURES  e.g., "extended-thinking,pdfs"         │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Configuration Hierarchy                                                │ │
│  │                                                                         │ │
│  │   Priority (highest to lowest):                                        │ │
│  │                                                                         │ │
│  │   1. Explicit ClientConfig values                                      │ │
│  │   2. Environment variables                                             │ │
│  │   3. Config file (~/.anthropic/config.json)                            │ │
│  │   4. Built-in defaults                                                 │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 18.3 Resource Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RESOURCE REQUIREMENTS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Memory Considerations                                                  │ │
│  │                                                                         │ │
│  │   Base client:              ~5 MB                                      │ │
│  │   Per concurrent request:   ~100 KB - 10 MB (depends on response)      │ │
│  │   Streaming buffer:         ~64 KB per stream                          │ │
│  │   Connection pool:          ~1 MB per 10 connections                   │ │
│  │                                                                         │ │
│  │   Recommendation:                                                      │ │
│  │   • Minimum: 50 MB available memory                                    │ │
│  │   • For high concurrency (100+ requests): 500 MB+                      │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Network Considerations                                                 │ │
│  │                                                                         │ │
│  │   Outbound:                                                            │ │
│  │   • HTTPS/443 to api.anthropic.com                                     │ │
│  │   • HTTP/2 preferred, HTTP/1.1 fallback                                │ │
│  │                                                                         │ │
│  │   Timeouts:                                                            │ │
│  │   • Connect: 30s                                                       │ │
│  │   • Request: 300s (5 minutes for long generations)                     │ │
│  │   • Streaming: No timeout (keep-alive with pings)                      │ │
│  │                                                                         │ │
│  │   Connection pool:                                                     │ │
│  │   • Max idle connections per host: 10                                  │ │
│  │   • Idle timeout: 90s                                                  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 19. API Reference Summary

### 19.1 Public API Surface

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PUBLIC API SURFACE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Main Entry Points                                                      │ │
│  │                                                                         │ │
│  │   AnthropicClient                                                      │ │
│  │   ├── new(config: ClientConfig) -> Result<Self>                        │ │
│  │   ├── messages() -> &MessagesService                                   │ │
│  │   ├── models() -> &ModelsService                                       │ │
│  │   ├── batches() -> &BatchesService                                     │ │
│  │   └── admin() -> &AdminService                                         │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Messages Service                                                       │ │
│  │                                                                         │ │
│  │   MessagesService                                                      │ │
│  │   ├── create(req: CreateMessageRequest)                                │ │
│  │   │       -> Result<MessageResponse>                                   │ │
│  │   ├── create_stream(req: CreateMessageRequest)                         │ │
│  │   │       -> Result<impl Stream<Item = StreamEvent>>                   │ │
│  │   └── count_tokens(req: CountTokensRequest)                            │ │
│  │           -> Result<CountTokensResponse>                               │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Models Service                                                         │ │
│  │                                                                         │ │
│  │   ModelsService                                                        │ │
│  │   ├── list() -> Result<ListModelsResponse>                             │ │
│  │   └── get(model_id: &str) -> Result<Model>                             │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Batches Service                                                        │ │
│  │                                                                         │ │
│  │   BatchesService                                                       │ │
│  │   ├── create(req: CreateBatchRequest) -> Result<Batch>                 │ │
│  │   ├── list(params: ListBatchParams) -> Result<ListBatchResponse>       │ │
│  │   ├── get(batch_id: &str) -> Result<Batch>                             │ │
│  │   ├── results(batch_id: &str)                                          │ │
│  │   │       -> Result<impl Stream<Item = BatchResult>>                   │ │
│  │   └── cancel(batch_id: &str) -> Result<Batch>                          │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Admin Service (nested)                                                 │ │
│  │                                                                         │ │
│  │   AdminService                                                         │ │
│  │   ├── organizations() -> &OrganizationsService                         │ │
│  │   ├── workspaces() -> &WorkspacesService                               │ │
│  │   ├── api_keys() -> &ApiKeysService                                    │ │
│  │   └── invites() -> &InvitesService                                     │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 19.2 Error Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR TYPES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  pub enum AnthropicError {                                                  │
│      // Client-side errors                                                  │
│      ConfigurationError { message: String, field: Option<String> },         │
│      ValidationError { message: String, field: String, value: String },     │
│      SerializationError { message: String, source: serde_json::Error },     │
│                                                                             │
│      // Network errors                                                      │
│      ConnectionError { message: String, source: Option<Box<dyn Error>> },   │
│      TimeoutError { message: String, duration: Duration },                  │
│      TlsError { message: String, source: Option<Box<dyn Error>> },          │
│                                                                             │
│      // API errors                                                          │
│      InvalidRequestError { message: String, param: Option<String> },        │
│      AuthenticationError { message: String },                               │
│      PermissionError { message: String },                                   │
│      NotFoundError { message: String, resource: Option<String> },           │
│      RateLimitError { message: String, retry_after: Option<Duration> },     │
│      ApiError { message: String, code: u16 },                               │
│      OverloadedError { message: String, retry_after: Option<Duration> },    │
│                                                                             │
│      // Resilience errors                                                   │
│      CircuitBreakerOpen { message: String, open_until: Option<Instant> },   │
│      RetryExhausted { message: String, attempts: u32, last_error: Box<Self>}│
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Part 2: Data Flow & Concurrency](./architecture-anthropic-2.md) | Part 3: Integration & Observability | [Refinement Phase](./refinement-anthropic.md) |

---

## Architecture Phase Summary

This architecture documentation (Parts 1-3) covers:

1. **Part 1: System Overview & Module Structure**
   - Design principles (SOLID, Hexagonal Architecture)
   - C4 model diagrams (Context, Container, Component)
   - Module structure for Rust and TypeScript

2. **Part 2: Data Flow & Concurrency**
   - Request/response pipelines
   - Streaming architecture (SSE)
   - State management patterns
   - Concurrency and synchronization

3. **Part 3: Integration & Observability**
   - Integration with repo primitives
   - Observability (tracing, metrics, logging)
   - Security architecture
   - Testing patterns (London-School TDD)
   - Deployment considerations

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial integration and observability architecture |

---

**SPARC Architecture Phase: COMPLETE**

*Awaiting "Next phase." to begin Refinement phase.*
