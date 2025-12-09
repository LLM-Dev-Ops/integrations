# SPARC Architecture: GitHub Integration Module

**Part 3 of 3: Integration, Observability, and Deployment**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/github`

---

## Table of Contents

15. [Integration with Repo Primitives](#15-integration-with-repo-primitives)
16. [Observability Architecture](#16-observability-architecture)
17. [Security Architecture](#17-security-architecture)
18. [Testing Architecture](#18-testing-architecture)
19. [Deployment Considerations](#19-deployment-considerations)
20. [API Reference Summary](#20-api-reference-summary)

---

## 15. Integration with Repo Primitives

### 15.1 Dependency Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTEGRATION REPO DEPENDENCY MAP                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       integrations-github                            │    │
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
│  │   ╳ integrations-anthropic (sibling module)                          │    │
│  │   ╳ integrations-openai (sibling module)                             │    │
│  │   ╳ integrations-* (any other provider)                              │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 15.2 Error Integration

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
│  │   pub enum GitHubError {                                               │ │
│  │       #[error("Rate limit exceeded: {message}")]                       │ │
│  │       RateLimitError {                                                 │ │
│  │           message: String,                                             │ │
│  │           reset_at: Option<Instant>,                                   │ │
│  │           category: RateLimitCategory,                                 │ │
│  │           #[source]                                                    │ │
│  │           source: Option<Box<dyn Error>>,                              │ │
│  │       },                                                               │ │
│  │                                                                         │ │
│  │       #[error("Authentication failed: {message}")]                     │ │
│  │       AuthenticationError {                                            │ │
│  │           message: String,                                             │ │
│  │           auth_type: AuthType,                                         │ │
│  │       },                                                               │ │
│  │                                                                         │ │
│  │       #[error("Resource not found: {resource}")]                       │ │
│  │       NotFoundError {                                                  │ │
│  │           message: String,                                             │ │
│  │           resource: String,                                            │ │
│  │       },                                                               │ │
│  │       // ... other variants                                            │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl ErrorContext for GitHubError {                                  │ │
│  │       fn error_kind(&self) -> ErrorKind {                              │ │
│  │           match self {                                                 │ │
│  │               Self::RateLimitError { .. } => ErrorKind::RateLimit,     │ │
│  │               Self::AuthenticationError { .. } => ErrorKind::Auth,     │ │
│  │               Self::ConnectionError { .. } => ErrorKind::Network,      │ │
│  │               Self::NotFoundError { .. } => ErrorKind::NotFound,       │ │
│  │               // ...                                                   │ │
│  │           }                                                            │ │
│  │       }                                                                │ │
│  │                                                                         │ │
│  │       fn request_id(&self) -> Option<&str> {                           │ │
│  │           self.context.github_request_id.as_deref()                    │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl Retryable for GitHubError {                                     │ │
│  │       fn is_retryable(&self) -> bool {                                 │ │
│  │           matches!(                                                    │ │
│  │               self,                                                    │ │
│  │               Self::RateLimitError { .. }                              │ │
│  │               | Self::AbuseDetectedError { .. }                        │ │
│  │               | Self::ConnectionError { .. }                           │ │
│  │               | Self::ServerError { status, .. } if *status >= 500     │ │
│  │           )                                                            │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 15.3 Retry Integration

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
│  │           max: Duration::from_secs(30),                                │ │
│  │           multiplier: 2.0,                                             │ │
│  │           jitter: 0.25,                                                │ │
│  │       })                                                               │ │
│  │       .retry_on(|err: &GitHubError| err.is_retryable())                │ │
│  │       .respect_retry_after(|err: &GitHubError| {                       │ │
│  │           match err {                                                  │ │
│  │               GitHubError::RateLimitError { reset_at, .. } => *reset_at,│ │
│  │               GitHubError::AbuseDetectedError { retry_after, .. } => {  │ │
│  │                   *retry_after                                         │ │
│  │               }                                                        │ │
│  │               _ => None,                                               │ │
│  │           }                                                            │ │
│  │       })                                                               │ │
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
│  │   // • Retry-After / X-RateLimit-Reset header respect                  │ │
│  │   // • Attempt counting and metrics                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 15.4 Circuit Breaker Integration

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
│  │        │           │          │  (fail fast with CircuitBreakerOpen)    │ │
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
│  │ Usage in GitHub Module                                                 │ │
│  │                                                                         │ │
│  │   impl ResilienceOrchestrator {                                        │ │
│  │       async fn execute<F, T>(&self, f: F) -> Result<T, GitHubError>    │ │
│  │       where F: Future<Output = Result<T, GitHubError>>                 │ │
│  │       {                                                                │ │
│  │           // Check circuit state                                       │ │
│  │           self.circuit.check_state().map_err(|_| {                     │ │
│  │               GitHubError::CircuitBreakerOpen {                        │ │
│  │                   message: "Circuit breaker is open".to_string(),      │ │
│  │                   open_until: self.circuit.open_until(),               │ │
│  │               }                                                        │ │
│  │           })?;                                                         │ │
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

### 15.5 Rate Limiter Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RATE LIMITER INTEGRATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Using integrations-rate-limit primitives:                                  │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Per-Category Rate Limiters                                             │ │
│  │                                                                         │ │
│  │   use integrations_rate_limit::{TokenBucket, SlidingWindowLog};        │ │
│  │                                                                         │ │
│  │   // Primary (Core) rate limiter                                       │ │
│  │   let core_limiter = TokenBucket::new(                                 │ │
│  │       capacity: 5000,                    // Max requests per hour      │ │
│  │       refill_rate: 5000.0 / 3600.0,      // ~1.39 tokens per second    │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  │   // Secondary (Search) rate limiter                                   │ │
│  │   let search_limiter = SlidingWindowLog::new(                          │ │
│  │       window: Duration::from_secs(60),                                 │ │
│  │       max_requests: 30,                  // 30 requests per minute     │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  │   // GraphQL rate limiter (point-based)                                │ │
│  │   let graphql_limiter = TokenBucket::new(                              │ │
│  │       capacity: 5000,                    // 5000 points per hour       │ │
│  │       refill_rate: 5000.0 / 3600.0,                                    │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Server-Side Rate Limit Sync                                            │ │
│  │                                                                         │ │
│  │   // Update local limits from response headers                         │ │
│  │   fn update_from_headers(&mut self, headers: &Headers) {               │ │
│  │       let category = headers.get("X-RateLimit-Resource")               │ │
│  │           .and_then(|v| RateLimitCategory::from_str(v).ok())            │ │
│  │           .unwrap_or(RateLimitCategory::Core);                         │ │
│  │                                                                         │ │
│  │       let limiter = self.get_limiter_mut(category);                    │ │
│  │                                                                         │ │
│  │       if let Some(remaining) = headers.get("X-RateLimit-Remaining") {  │ │
│  │           limiter.set_available(remaining.parse().unwrap_or(0));       │ │
│  │       }                                                                │ │
│  │                                                                         │ │
│  │       if let Some(reset) = headers.get("X-RateLimit-Reset") {          │ │
│  │           let reset_time = parse_unix_timestamp(reset);                │ │
│  │           limiter.set_reset_time(reset_time);                          │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 16. Observability Architecture

### 16.1 Tracing Integration

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
│  │   [github.client.repositories.get] ───────────────────────────────────┐│ │
│  │   │                                                                   ││ │
│  │   │ attributes:                                                       ││ │
│  │   │   github.owner = "octocat"                                        ││ │
│  │   │   github.repo = "hello-world"                                     ││ │
│  │   │   github.request_id = "ABCD:1234:5678:90AB"                        ││ │
│  │   │                                                                   ││ │
│  │   ├──[github.resilience.execute] ────────────────────────────────────┐││ │
│  │   │  │                                                               │││ │
│  │   │  │ attributes:                                                   │││ │
│  │   │  │   retry.attempt = 1                                           │││ │
│  │   │  │   circuit_breaker.state = "closed"                            │││ │
│  │   │  │   rate_limit.category = "core"                                │││ │
│  │   │  │   rate_limit.remaining = 4500                                 │││ │
│  │   │  │                                                               │││ │
│  │   │  ├──[github.transport.send] ─────────────────────────────────┐   │││ │
│  │   │  │  │                                                        │   │││ │
│  │   │  │  │ attributes:                                            │   │││ │
│  │   │  │  │   http.method = "GET"                                  │   │││ │
│  │   │  │  │   http.url = "https://api.github.com/repos/..."        │   │││ │
│  │   │  │  │   http.status_code = 200                               │   │││ │
│  │   │  │  │   http.request_content_length = 0                      │   │││ │
│  │   │  │  │   http.response_content_length = 2048                  │   │││ │
│  │   │  │  │                                                        │   │││ │
│  │   │  │  └────────────────────────────────────────────────────────┘   │││ │
│  │   │  │                                                               │││ │
│  │   │  └───────────────────────────────────────────────────────────────┘││ │
│  │   │                                                                   ││ │
│  │   │ final attributes:                                                 ││ │
│  │   │   github.response.full_name = "octocat/hello-world"               ││ │
│  │   │   github.response.id = 12345                                      ││ │
│  │   │                                                                   ││ │
│  │   └───────────────────────────────────────────────────────────────────┘│ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Span Naming Convention                                                 │ │
│  │                                                                         │ │
│  │   github.client.{service}.{method}                                     │ │
│  │     e.g., github.client.repositories.get                               │ │
│  │     e.g., github.client.issues.create                                  │ │
│  │     e.g., github.client.pull_requests.merge                            │ │
│  │     e.g., github.client.graphql.execute                                │ │
│  │                                                                         │ │
│  │   github.resilience.{operation}                                        │ │
│  │     e.g., github.resilience.execute                                    │ │
│  │     e.g., github.resilience.retry                                      │ │
│  │                                                                         │ │
│  │   github.transport.{operation}                                         │ │
│  │     e.g., github.transport.send                                        │ │
│  │     e.g., github.transport.parse_response                              │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Metrics Collection

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
│  │   │ github_requests_total                                          │  │ │
│  │   │   labels: { service, method, status, owner, repo }             │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_errors_total                                            │  │ │
│  │   │   labels: { service, error_type, retryable }                   │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_retries_total                                           │  │ │
│  │   │   labels: { service, attempt_number }                          │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_rate_limit_hits_total                                   │  │ │
│  │   │   labels: { category }                                         │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_circuit_breaker_trips_total                             │  │ │
│  │   │   labels: { }                                                  │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_webhook_events_total                                    │  │ │
│  │   │   labels: { event_type, action }                               │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   HISTOGRAMS (distribution)                                            │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ github_request_duration_seconds                                │  │ │
│  │   │   labels: { service, method, status }                          │  │ │
│  │   │   buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]           │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_response_size_bytes                                     │  │ │
│  │   │   labels: { service, method }                                  │  │ │
│  │   │   buckets: [100, 1000, 10000, 100000, 1000000]                 │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_pagination_pages_fetched                                │  │ │
│  │   │   labels: { service, method }                                  │  │ │
│  │   │   buckets: [1, 2, 5, 10, 20, 50, 100]                         │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   GAUGES (point-in-time)                                               │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ github_rate_limit_remaining                                    │  │ │
│  │   │   labels: { category }                                         │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_rate_limit_reset_seconds                                │  │ │
│  │   │   labels: { category }                                         │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_circuit_breaker_state                                   │  │ │
│  │   │   labels: { }                                                  │  │ │
│  │   │   values: 0=closed, 1=half-open, 2=open                        │  │ │
│  │   │                                                                 │  │ │
│  │   │ github_active_requests                                         │  │ │
│  │   │   labels: { service }                                          │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.3 Structured Logging

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
│  │   • Pagination progress                                                │ │
│  │                                                                         │ │
│  │   INFO:                                                                │ │
│  │   • Request start/completion                                           │ │
│  │   • Configuration loaded                                               │ │
│  │   • Webhook event received                                             │ │
│  │                                                                         │ │
│  │   WARN:                                                                │ │
│  │   • Rate limit approaching (< 10% remaining)                           │ │
│  │   • Retry triggered                                                    │ │
│  │   • Circuit breaker state change                                       │ │
│  │   • JWT token refresh                                                  │ │
│  │                                                                         │ │
│  │   ERROR:                                                               │ │
│  │   • Request failed (all retries exhausted)                             │ │
│  │   • Circuit breaker opened                                             │ │
│  │   • Authentication failure                                             │ │
│  │   • Webhook signature verification failed                              │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Log Format (JSON)                                                      │ │
│  │                                                                         │ │
│  │   {                                                                    │ │
│  │       "timestamp": "2025-12-09T10:30:00.000Z",                         │ │
│  │       "level": "INFO",                                                 │ │
│  │       "target": "integrations_github::repositories",                   │ │
│  │       "message": "Request completed",                                  │ │
│  │       "fields": {                                                      │ │
│  │           "github_request_id": "ABCD:1234:5678:90AB",                  │ │
│  │           "service": "repositories",                                   │ │
│  │           "method": "get",                                             │ │
│  │           "owner": "octocat",                                          │ │
│  │           "repo": "hello-world",                                       │ │
│  │           "duration_ms": 234,                                          │ │
│  │           "status": 200,                                               │ │
│  │           "rate_limit_remaining": 4500,                                │ │
│  │           "rate_limit_category": "core"                                │ │
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
│  │   // Tokens and keys are NEVER logged                                  │ │
│  │   log::debug!(                                                         │ │
│  │       github_request_id = %req.id,                                     │ │
│  │       token = %"[REDACTED]",  // SecretString auto-redacts             │ │
│  │       "Sending request"                                                │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  │   // Request bodies may contain sensitive data                         │ │
│  │   log::debug!(                                                         │ │
│  │       body = %redact_secrets(&body),  // Redact secret values          │ │
│  │       "Request body"                                                   │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 17. Security Architecture

### 17.1 Credential Management

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
│  │      GitHubClient::new(GitHubConfig {                                  │ │
│  │          auth: AuthConfig::Pat {                                       │ │
│  │              token: SecretString::new(token),                          │ │
│  │          },                                                            │ │
│  │          ..                                                            │ │
│  │      })                                                                │ │
│  │                                                                         │ │
│  │   2. Environment variable                                              │ │
│  │      GITHUB_TOKEN=ghp_...                                              │ │
│  │      GITHUB_APP_ID=12345                                               │ │
│  │      GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...         │ │
│  │                                                                         │ │
│  │   3. Config file (NOT RECOMMENDED for production)                      │ │
│  │      ~/.config/github/config.json                                      │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 17.2 GitHub App JWT Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       GITHUB APP JWT GENERATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ JWT Structure for GitHub Apps                                          │ │
│  │                                                                         │ │
│  │   Header:                                                              │ │
│  │   {                                                                    │ │
│  │       "alg": "RS256",                                                  │ │
│  │       "typ": "JWT"                                                     │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   Payload:                                                             │ │
│  │   {                                                                    │ │
│  │       "iat": 1702123456,         // Issued at (UTC timestamp)          │ │
│  │       "exp": 1702124056,         // Expires (iat + 10 minutes max)     │ │
│  │       "iss": "12345"             // GitHub App ID                      │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   Signature:                                                           │ │
│  │   RS256 signed with App's private key                                  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ JWT Generation Implementation                                          │ │
│  │                                                                         │ │
│  │   use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};          │ │
│  │                                                                         │ │
│  │   fn generate_jwt(app_id: u64, private_key: &str) -> Result<String> {  │ │
│  │       let now = chrono::Utc::now();                                    │ │
│  │       let iat = now - chrono::Duration::seconds(60); // Clock drift    │ │
│  │       let exp = now + chrono::Duration::minutes(9);  // < 10 min       │ │
│  │                                                                         │ │
│  │       let claims = JwtClaims {                                         │ │
│  │           iat: iat.timestamp(),                                        │ │
│  │           exp: exp.timestamp(),                                        │ │
│  │           iss: app_id.to_string(),                                     │ │
│  │       };                                                               │ │
│  │                                                                         │ │
│  │       let key = EncodingKey::from_rsa_pem(private_key.as_bytes())?;    │ │
│  │       let header = Header::new(Algorithm::RS256);                      │ │
│  │                                                                         │ │
│  │       encode(&header, &claims, &key)                                   │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Installation Token Flow                                                │ │
│  │                                                                         │ │
│  │   1. Generate JWT (as App)                                             │ │
│  │   2. POST /app/installations/{installation_id}/access_tokens           │ │
│  │      Authorization: Bearer <jwt>                                       │ │
│  │   3. Receive installation token (expires in 1 hour)                    │ │
│  │   4. Use installation token for API calls                              │ │
│  │      Authorization: token <installation_token>                         │ │
│  │                                                                         │ │
│  │   Token caching:                                                       │ │
│  │   - Cache JWT for ~9 minutes (regenerate before expiry)                │ │
│  │   - Cache installation token for ~55 minutes                           │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 17.3 Webhook Signature Verification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEBHOOK SIGNATURE VERIFICATION                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Signature Format                                                       │ │
│  │                                                                         │ │
│  │   Header: X-Hub-Signature-256                                          │ │
│  │   Value:  sha256=<hex-encoded-hmac>                                    │ │
│  │                                                                         │ │
│  │   Example:                                                             │ │
│  │   X-Hub-Signature-256: sha256=abc123def456...                          │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Verification Implementation                                            │ │
│  │                                                                         │ │
│  │   use hmac::{Hmac, Mac};                                               │ │
│  │   use sha2::Sha256;                                                    │ │
│  │   use subtle::ConstantTimeEq;                                          │ │
│  │                                                                         │ │
│  │   type HmacSha256 = Hmac<Sha256>;                                      │ │
│  │                                                                         │ │
│  │   pub fn verify_webhook_signature(                                     │ │
│  │       secret: &SecretString,                                           │ │
│  │       payload: &[u8],                                                  │ │
│  │       signature_header: &str,                                          │ │
│  │   ) -> Result<(), WebhookVerificationError> {                          │ │
│  │       // Parse signature header                                        │ │
│  │       let expected = signature_header                                  │ │
│  │           .strip_prefix("sha256=")                                     │ │
│  │           .ok_or(WebhookVerificationError::InvalidFormat)?;            │ │
│  │       let expected_bytes = hex::decode(expected)                       │ │
│  │           .map_err(|_| WebhookVerificationError::InvalidHex)?;         │ │
│  │                                                                         │ │
│  │       // Compute HMAC                                                  │ │
│  │       let mut mac = HmacSha256::new_from_slice(                        │ │
│  │           secret.expose_secret().as_bytes()                            │ │
│  │       )?;                                                              │ │
│  │       mac.update(payload);                                             │ │
│  │       let computed = mac.finalize().into_bytes();                      │ │
│  │                                                                         │ │
│  │       // Constant-time comparison (prevents timing attacks)            │ │
│  │       if computed.as_slice().ct_eq(&expected_bytes).into() {           │ │
│  │           Ok(())                                                       │ │
│  │       } else {                                                         │ │
│  │           Err(WebhookVerificationError::SignatureMismatch)             │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Webhook Handler Example                                                │ │
│  │                                                                         │ │
│  │   pub async fn handle_webhook(                                         │ │
│  │       headers: HeaderMap,                                              │ │
│  │       body: Bytes,                                                     │ │
│  │       secret: &SecretString,                                           │ │
│  │   ) -> Result<WebhookEvent, WebhookError> {                            │ │
│  │       // 1. Verify signature                                           │ │
│  │       let signature = headers                                          │ │
│  │           .get("X-Hub-Signature-256")                                  │ │
│  │           .ok_or(WebhookError::MissingSignature)?                      │ │
│  │           .to_str()?;                                                  │ │
│  │                                                                         │ │
│  │       verify_webhook_signature(secret, &body, signature)?;             │ │
│  │                                                                         │ │
│  │       // 2. Parse event type                                           │ │
│  │       let event_type = headers                                         │ │
│  │           .get("X-GitHub-Event")                                       │ │
│  │           .ok_or(WebhookError::MissingEventType)?                      │ │
│  │           .to_str()?;                                                  │ │
│  │                                                                         │ │
│  │       // 3. Parse payload                                              │ │
│  │       let event = parse_webhook_event(event_type, &body)?;             │ │
│  │                                                                         │ │
│  │       Ok(event)                                                        │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 17.4 TLS Configuration

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

---

## 18. Testing Architecture

### 18.1 London-School TDD Structure

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
│  │   │   ├── client_test.rs            # Client unit tests                │ │
│  │   │   ├── repositories_test.rs      # Repositories service tests       │ │
│  │   │   ├── issues_test.rs            # Issues service tests             │ │
│  │   │   ├── pull_requests_test.rs     # Pull requests service tests      │ │
│  │   │   ├── actions_test.rs           # Actions service tests            │ │
│  │   │   ├── users_test.rs             # Users service tests              │ │
│  │   │   ├── organizations_test.rs     # Organizations service tests      │ │
│  │   │   ├── gists_test.rs             # Gists service tests              │ │
│  │   │   ├── webhooks_test.rs          # Webhooks service tests           │ │
│  │   │   ├── git_data_test.rs          # Git data service tests           │ │
│  │   │   ├── search_test.rs            # Search service tests             │ │
│  │   │   ├── graphql_test.rs           # GraphQL client tests             │ │
│  │   │   ├── auth_test.rs              # Authentication tests             │ │
│  │   │   ├── pagination_test.rs        # Pagination handler tests         │ │
│  │   │   ├── resilience_test.rs        # Resilience orchestrator tests    │ │
│  │   │   ├── transport_test.rs         # HTTP transport tests             │ │
│  │   │   └── error_test.rs             # Error handling tests             │ │
│  │   │                                                                    │ │
│  │   ├── integration/                                                     │ │
│  │   │   ├── mock_server_test.rs       # Tests with mock HTTP server      │ │
│  │   │   ├── rate_limit_e2e_test.rs    # Rate limit E2E tests             │ │
│  │   │   └── resilience_e2e_test.rs    # Resilience pattern E2E tests     │ │
│  │   │                                                                    │ │
│  │   └── contract/                                                        │ │
│  │       └── api_contract_test.rs      # API contract verification        │ │
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
│  │       pub struct MockPaginationHandler { ... }                         │ │
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

### 18.2 Test Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST PATTERNS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Unit Test Pattern (with mocks)                                         │ │
│  │                                                                         │ │
│  │   #[tokio::test]                                                       │ │
│  │   async fn test_repositories_get_success() {                           │ │
│  │       // Arrange                                                       │ │
│  │       let mock_transport = MockHttpTransport::new()                    │ │
│  │           .expect_request()                                            │ │
│  │           .with_method("GET")                                          │ │
│  │           .with_path("/repos/octocat/hello-world")                     │ │
│  │           .returning(Ok(mock_repository_response()));                  │ │
│  │                                                                         │ │
│  │       let mock_resilience = MockResilienceOrchestrator::passthrough(); │ │
│  │                                                                         │ │
│  │       let service = RepositoriesServiceImpl::new(                      │ │
│  │           Arc::new(mock_transport),                                    │ │
│  │           Arc::new(mock_resilience),                                   │ │
│  │       );                                                               │ │
│  │                                                                         │ │
│  │       // Act                                                           │ │
│  │       let result = service.get("octocat", "hello-world").await;        │ │
│  │                                                                         │ │
│  │       // Assert                                                        │ │
│  │       assert!(result.is_ok());                                         │ │
│  │       let repo = result.unwrap();                                      │ │
│  │       assert_eq!(repo.full_name, "octocat/hello-world");               │ │
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
│  │       Mock::given(method("GET"))                                       │ │
│  │           .and(path("/repos/octocat/hello-world"))                     │ │
│  │           .and(header("Authorization", "Bearer test-token"))           │ │
│  │           .and(header("X-GitHub-Api-Version", "2022-11-28"))           │ │
│  │           .respond_with(ResponseTemplate::new(200)                     │ │
│  │               .insert_header("X-RateLimit-Remaining", "4999")          │ │
│  │               .insert_header("X-RateLimit-Limit", "5000")              │ │
│  │               .set_body_json(mock_repository_response()))              │ │
│  │           .mount(&server)                                              │ │
│  │           .await;                                                      │ │
│  │                                                                         │ │
│  │       // Create real client pointing to mock server                    │ │
│  │       let client = GitHubClient::new(GitHubConfig {                    │ │
│  │           base_url: server.uri().parse().unwrap(),                     │ │
│  │           auth: AuthConfig::Pat {                                      │ │
│  │               token: SecretString::new("test-token".into()),           │ │
│  │           },                                                           │ │
│  │           ..Default::default()                                         │ │
│  │       })?;                                                             │ │
│  │                                                                         │ │
│  │       // Execute real request flow                                     │ │
│  │       let result = client.repositories()                               │ │
│  │           .get("octocat", "hello-world")                               │ │
│  │           .await;                                                      │ │
│  │                                                                         │ │
│  │       assert!(result.is_ok());                                         │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Pagination Test Pattern                                                │ │
│  │                                                                         │ │
│  │   #[tokio::test]                                                       │ │
│  │   async fn test_pagination_iteration() {                               │ │
│  │       // Setup mock responses for 3 pages                              │ │
│  │       let mut mock_transport = MockHttpTransport::new();               │ │
│  │       mock_transport                                                   │ │
│  │           .expect_request()                                            │ │
│  │           .returning(page_1_response()) // has next link               │ │
│  │           .expect_request()                                            │ │
│  │           .returning(page_2_response()) // has next link               │ │
│  │           .expect_request()                                            │ │
│  │           .returning(page_3_response()); // no next link               │ │
│  │                                                                         │ │
│  │       let service = RepositoriesServiceImpl::new(Arc::new(mock_transport));│ │
│  │       let mut iterator = service.list_for_user("octocat", Default::default());│
│  │                                                                         │ │
│  │       // Collect all pages                                             │ │
│  │       let mut all_repos = Vec::new();                                  │ │
│  │       while let Some(result) = iterator.next_page().await {            │ │
│  │           let page = result.unwrap();                                  │ │
│  │           all_repos.extend(page.items);                                │ │
│  │       }                                                                │ │
│  │                                                                         │ │
│  │       assert_eq!(all_repos.len(), 90); // 30 per page * 3 pages        │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Webhook Signature Test Pattern                                         │ │
│  │                                                                         │ │
│  │   #[test]                                                              │ │
│  │   fn test_webhook_signature_verification() {                           │ │
│  │       let secret = SecretString::new("webhook-secret".to_string());    │ │
│  │       let payload = b"{\"action\":\"opened\",\"issue\":{...}}";         │ │
│  │                                                                         │ │
│  │       // Compute expected signature                                    │ │
│  │       let expected_sig = compute_hmac_sha256(&secret, payload);        │ │
│  │       let header = format!("sha256={}", hex::encode(&expected_sig));   │ │
│  │                                                                         │ │
│  │       // Verify should succeed                                         │ │
│  │       let result = verify_webhook_signature(&secret, payload, &header);│ │
│  │       assert!(result.is_ok());                                         │ │
│  │                                                                         │ │
│  │       // Tampered payload should fail                                  │ │
│  │       let tampered = b"{\"action\":\"closed\",\"issue\":{...}}";        │ │
│  │       let result = verify_webhook_signature(&secret, tampered, &header);│ │
│  │       assert!(matches!(result, Err(WebhookVerificationError::SignatureMismatch)));│
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 18.3 Test Fixtures

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST FIXTURES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Fixture Builders                                                       │ │
│  │                                                                         │ │
│  │   // Repository fixtures                                               │ │
│  │   pub fn repository_fixture() -> Repository {                          │ │
│  │       Repository {                                                     │ │
│  │           id: 12345,                                                   │ │
│  │           name: "hello-world".into(),                                  │ │
│  │           full_name: "octocat/hello-world".into(),                     │ │
│  │           owner: user_fixture(),                                       │ │
│  │           private: false,                                              │ │
│  │           default_branch: "main".into(),                               │ │
│  │           ..Default::default()                                         │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // Issue fixtures                                                    │ │
│  │   pub fn issue_fixture() -> Issue {                                    │ │
│  │       Issue {                                                          │ │
│  │           id: 1,                                                       │ │
│  │           number: 1347,                                                │ │
│  │           title: "Found a bug".into(),                                 │ │
│  │           state: IssueState::Open,                                     │ │
│  │           user: user_fixture(),                                        │ │
│  │           labels: vec![label_fixture()],                               │ │
│  │           ..Default::default()                                         │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // User fixtures                                                     │ │
│  │   pub fn user_fixture() -> User {                                      │ │
│  │       User {                                                           │ │
│  │           id: 1,                                                       │ │
│  │           login: "octocat".into(),                                     │ │
│  │           avatar_url: "https://github.com/images/...".into(),          │ │
│  │           ..Default::default()                                         │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // Error fixtures                                                    │ │
│  │   pub fn rate_limit_error_fixture() -> GitHubError {                   │ │
│  │       GitHubError::RateLimitError {                                    │ │
│  │           message: "API rate limit exceeded".into(),                   │ │
│  │           reset_at: Some(Instant::now() + Duration::from_secs(300)),   │ │
│  │           category: RateLimitCategory::Core,                           │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ JSON Fixtures (for API responses)                                      │ │
│  │                                                                         │ │
│  │   fixtures/                                                            │ │
│  │   ├── repositories/                                                    │ │
│  │   │   ├── get_response.json                                            │ │
│  │   │   ├── list_response.json                                           │ │
│  │   │   └── error_responses/                                             │ │
│  │   │       ├── not_found.json                                           │ │
│  │   │       └── rate_limit.json                                          │ │
│  │   ├── issues/                                                          │ │
│  │   │   ├── create_response.json                                         │ │
│  │   │   └── list_response.json                                           │ │
│  │   ├── pull_requests/                                                   │ │
│  │   │   ├── create_response.json                                         │ │
│  │   │   └── merge_response.json                                          │ │
│  │   ├── actions/                                                         │ │
│  │   │   ├── workflows_list.json                                          │ │
│  │   │   └── runs_list.json                                               │ │
│  │   ├── webhooks/                                                        │ │
│  │   │   ├── push_event.json                                              │ │
│  │   │   ├── pull_request_event.json                                      │ │
│  │   │   └── issues_event.json                                            │ │
│  │   └── graphql/                                                         │ │
│  │       ├── repository_query_response.json                               │ │
│  │       └── error_response.json                                          │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 19. Deployment Considerations

### 19.1 Build Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BUILD CONFIGURATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rust Cargo Features                                                    │ │
│  │                                                                         │ │
│  │   [features]                                                           │ │
│  │   default = ["rustls"]                                                 │ │
│  │                                                                         │ │
│  │   # TLS backends (choose one)                                          │ │
│  │   rustls = ["reqwest/rustls-tls"]                                      │ │
│  │   native-tls = ["reqwest/native-tls"]                                  │ │
│  │                                                                         │ │
│  │   # Optional features                                                  │ │
│  │   tracing = ["dep:tracing", "integrations-tracing"]                    │ │
│  │   metrics = ["dep:metrics", "integrations-metrics"]                    │ │
│  │                                                                         │ │
│  │   # Service features (opt-in for reduced binary size)                  │ │
│  │   actions = []                                                         │ │
│  │   webhooks = []                                                        │ │
│  │   graphql = []                                                         │ │
│  │   git-data = []                                                        │ │
│  │                                                                         │ │
│  │   # All optional services                                              │ │
│  │   full = ["actions", "webhooks", "graphql", "git-data"]                │ │
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

### 19.2 Environment Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ENVIRONMENT CONFIGURATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Environment Variables                                                  │ │
│  │                                                                         │ │
│  │   Required (choose one auth method):                                   │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ GITHUB_TOKEN              Personal access token                  │  │ │
│  │   │   OR                                                            │  │ │
│  │   │ GITHUB_APP_ID             GitHub App ID                         │  │ │
│  │   │ GITHUB_APP_PRIVATE_KEY    GitHub App private key (PEM)          │  │ │
│  │   │ GITHUB_APP_INSTALLATION_ID (optional, for specific installation)│  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   Optional (with defaults):                                            │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ GITHUB_BASE_URL           Default: https://api.github.com       │  │ │
│  │   │ GITHUB_API_VERSION        Default: 2022-11-28                   │  │ │
│  │   │ GITHUB_TIMEOUT_SECS       Default: 30                           │  │ │
│  │   │ GITHUB_MAX_RETRIES        Default: 3                            │  │ │
│  │   │ GITHUB_LOG_LEVEL          Default: INFO                         │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  │   For webhooks:                                                        │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ GITHUB_WEBHOOK_SECRET     Webhook secret for signature verify   │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Configuration Hierarchy                                                │ │
│  │                                                                         │ │
│  │   Priority (highest to lowest):                                        │ │
│  │                                                                         │ │
│  │   1. Explicit GitHubConfig values                                      │ │
│  │   2. Environment variables                                             │ │
│  │   3. Config file (~/.config/github/config.json)                        │ │
│  │   4. Built-in defaults                                                 │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 19.3 Resource Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RESOURCE REQUIREMENTS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Memory Considerations                                                  │ │
│  │                                                                         │ │
│  │   Base client:              ~5 MB                                      │ │
│  │   Per concurrent request:   ~50 KB - 5 MB (depends on response)        │ │
│  │   JWT cache:                ~2 KB per app                              │ │
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
│  │   • HTTPS/443 to api.github.com                                        │ │
│  │   • HTTPS/443 to uploads.github.com (for release assets)               │ │
│  │   • HTTP/2 preferred, HTTP/1.1 fallback                                │ │
│  │                                                                         │ │
│  │   Timeouts:                                                            │ │
│  │   • Connect: 10s                                                       │ │
│  │   • Request: 30s default (configurable)                                │ │
│  │   • Upload: 300s for large files                                       │ │
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

## 20. API Reference Summary

### 20.1 Public API Surface

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PUBLIC API SURFACE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Main Entry Points                                                      │ │
│  │                                                                         │ │
│  │   GitHubClient                                                         │ │
│  │   ├── new(config: GitHubConfig) -> Result<Self>                        │ │
│  │   ├── repositories() -> &RepositoriesService                           │ │
│  │   ├── issues() -> &IssuesService                                       │ │
│  │   ├── pull_requests() -> &PullRequestsService                          │ │
│  │   ├── actions() -> &ActionsService        (feature: actions)           │ │
│  │   ├── users() -> &UsersService                                         │ │
│  │   ├── organizations() -> &OrganizationsService                         │ │
│  │   ├── gists() -> &GistsService                                         │ │
│  │   ├── webhooks() -> &WebhooksService      (feature: webhooks)          │ │
│  │   ├── git_data() -> &GitDataService       (feature: git-data)          │ │
│  │   ├── search() -> &SearchService                                       │ │
│  │   └── graphql() -> &GraphQLClient         (feature: graphql)           │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Repositories Service                                                   │ │
│  │                                                                         │ │
│  │   RepositoriesService                                                  │ │
│  │   ├── get(owner, repo) -> Result<Repository>                           │ │
│  │   ├── create(req) -> Result<Repository>                                │ │
│  │   ├── update(owner, repo, req) -> Result<Repository>                   │ │
│  │   ├── delete(owner, repo) -> Result<()>                                │ │
│  │   ├── list_for_user(username, params) -> Result<Page<Repository>>      │ │
│  │   ├── list_for_org(org, params) -> Result<Page<Repository>>            │ │
│  │   ├── list_branches(owner, repo, params) -> Result<Page<Branch>>       │ │
│  │   ├── get_branch(owner, repo, branch) -> Result<Branch>                │ │
│  │   ├── list_tags(owner, repo, params) -> Result<Page<Tag>>              │ │
│  │   ├── list_contributors(owner, repo) -> Result<Page<Contributor>>      │ │
│  │   └── list_languages(owner, repo) -> Result<HashMap<String, u64>>      │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Issues Service                                                         │ │
│  │                                                                         │ │
│  │   IssuesService                                                        │ │
│  │   ├── get(owner, repo, number) -> Result<Issue>                        │ │
│  │   ├── create(owner, repo, req) -> Result<Issue>                        │ │
│  │   ├── update(owner, repo, number, req) -> Result<Issue>                │ │
│  │   ├── list(owner, repo, params) -> Result<Page<Issue>>                 │ │
│  │   ├── list_comments(owner, repo, number) -> Result<Page<IssueComment>> │ │
│  │   ├── create_comment(owner, repo, number, body) -> Result<IssueComment>│ │
│  │   ├── add_labels(owner, repo, number, labels) -> Result<Vec<Label>>    │ │
│  │   └── remove_label(owner, repo, number, label) -> Result<()>           │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Pull Requests Service                                                  │ │
│  │                                                                         │ │
│  │   PullRequestsService                                                  │ │
│  │   ├── get(owner, repo, number) -> Result<PullRequest>                  │ │
│  │   ├── create(owner, repo, req) -> Result<PullRequest>                  │ │
│  │   ├── update(owner, repo, number, req) -> Result<PullRequest>          │ │
│  │   ├── list(owner, repo, params) -> Result<Page<PullRequest>>           │ │
│  │   ├── merge(owner, repo, number, req) -> Result<MergeResult>           │ │
│  │   ├── list_reviews(owner, repo, number) -> Result<Page<Review>>        │ │
│  │   ├── create_review(owner, repo, number, req) -> Result<Review>        │ │
│  │   ├── list_files(owner, repo, number) -> Result<Page<PullRequestFile>> │ │
│  │   └── list_commits(owner, repo, number) -> Result<Page<Commit>>        │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Actions Service (feature: actions)                                     │ │
│  │                                                                         │ │
│  │   ActionsService                                                       │ │
│  │   ├── list_workflows(owner, repo) -> Result<Page<Workflow>>            │ │
│  │   ├── get_workflow(owner, repo, id) -> Result<Workflow>                │ │
│  │   ├── list_runs(owner, repo, params) -> Result<Page<WorkflowRun>>      │ │
│  │   ├── get_run(owner, repo, id) -> Result<WorkflowRun>                  │ │
│  │   ├── cancel_run(owner, repo, id) -> Result<()>                        │ │
│  │   ├── rerun(owner, repo, id) -> Result<()>                             │ │
│  │   ├── list_jobs(owner, repo, run_id) -> Result<Page<Job>>              │ │
│  │   ├── download_artifact(owner, repo, id) -> Result<Bytes>              │ │
│  │   ├── list_secrets(owner, repo) -> Result<Page<Secret>>                │ │
│  │   └── create_or_update_secret(owner, repo, name, value) -> Result<()>  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ GraphQL Client (feature: graphql)                                      │ │
│  │                                                                         │ │
│  │   GraphQLClient                                                        │ │
│  │   ├── execute<T>(query, variables) -> Result<T>                        │ │
│  │   ├── query(query) -> QueryBuilder                                     │ │
│  │   └── mutation(mutation) -> MutationBuilder                            │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 20.2 Error Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR TYPES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  pub enum GitHubError {                                                     │
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
│      BadRequestError { message: String, errors: Vec<FieldError> },          │
│      AuthenticationError { message: String, auth_type: AuthType },          │
│      ForbiddenError { message: String },                                    │
│      NotFoundError { message: String, resource: Option<String> },           │
│      ValidationFailedError { message: String, errors: Vec<FieldError> },    │
│      RateLimitError { message: String, reset_at: Option<Instant>, category: RateLimitCategory },│
│      AbuseDetectedError { message: String, retry_after: Option<Duration> }, │
│      ServerError { message: String, status: u16 },                          │
│                                                                             │
│      // Resilience errors                                                   │
│      CircuitBreakerOpen { message: String, open_until: Option<Instant> },   │
│      RetryExhausted { message: String, attempts: u32, last_error: Box<Self>}│
│                                                                             │
│      // Webhook errors                                                      │
│      WebhookVerificationError { message: String, reason: VerificationFailure },│
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Part 2: Data Flow & Concurrency](./architecture-github-2.md) | Part 3: Integration & Observability | [Refinement Phase](./refinement-github.md) |

---

## Architecture Phase Summary

This architecture documentation (Parts 1-3) covers:

1. **Part 1: System Overview & Module Structure**
   - Design principles (SOLID, Hexagonal Architecture)
   - C4 model diagrams (Context, Container, Component)
   - Module structure for Rust and TypeScript
   - Crate and package organization

2. **Part 2: Data Flow & Concurrency**
   - Request/response pipelines
   - Pagination architecture (Link header parsing)
   - State management patterns
   - Concurrency and synchronization
   - Error propagation
   - Rate limit management (multi-category)

3. **Part 3: Integration & Observability**
   - Integration with repo primitives (8 dependencies)
   - Observability (tracing, metrics, logging)
   - Security architecture (multi-auth, JWT, webhook signatures)
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
