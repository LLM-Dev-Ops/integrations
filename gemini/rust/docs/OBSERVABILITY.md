# Observability Integration - Gemini Rust Client

This document describes the comprehensive observability implementation for the Gemini Rust client.

## Overview

The Gemini Rust client includes production-ready observability through three pillars:

1. **Structured Logging** - Contextual logging with automatic sensitive data redaction
2. **Distributed Tracing** - Request/response tracking with spans and attributes
3. **Metrics Recording** - Performance and usage metrics (counters, histograms, gauges)

## Architecture

### Trait-Based Design

All observability components are defined as traits, allowing for:
- Easy testing with mock implementations
- Flexible backend integration (tracing, log, custom solutions)
- No-op implementations when observability is disabled

### Components

```
observability/
├── logging.rs      - Logger trait and implementations
├── tracing.rs      - Tracer and Span traits with implementations
├── metrics.rs      - MetricsRecorder trait and Gemini-specific metrics
└── mod.rs          - Module exports and convenience functions
```

## Logging

### Logger Trait

```rust
pub trait Logger: Send + Sync {
    fn debug(&self, message: &str, fields: Value);
    fn info(&self, message: &str, fields: Value);
    fn warn(&self, message: &str, fields: Value);
    fn error(&self, message: &str, fields: Value);
}
```

### Implementations

#### StructuredLogger

Production logger using the `tracing` crate:

```rust
use integrations_gemini::observability::{Logger, StructuredLogger};
use serde_json::json;

let logger = StructuredLogger::new("gemini.content")
    .with_level(LogLevel::Debug);

logger.info("Content generation started", json!({
    "model": "gemini-1.5-pro",
    "temperature": 0.7
}));
```

**Features:**
- Structured JSON fields
- Automatic sensitive data redaction (API keys, tokens, passwords)
- Log level filtering
- Integration with tracing ecosystem

#### DefaultLogger

Simple stderr logger for development:

```rust
let logger = DefaultLogger::new("gemini")
    .with_level(LogLevel::Info);
```

### Sensitive Data Redaction

The logger automatically redacts sensitive fields:

```rust
logger.info("API request", json!({
    "api_key": "sk-1234567890",  // Redacted to "***REDACTED***"
    "model": "gemini-pro",        // Not redacted
    "authorization": "Bearer xyz" // Redacted to "***REDACTED***"
}));
```

Redacted field names:
- `api_key`, `apiKey`, `key`
- `token`, `access_token`, `accessToken`
- `secret`, `password`, `credential`
- `authorization`, `auth`

## Tracing

### Tracer and Span Traits

```rust
pub trait Tracer: Send + Sync {
    fn start_span(&self, name: &str) -> Box<dyn Span>;
}

pub trait Span: Send {
    fn set_attribute(&mut self, key: &str, value: &str);
    fn set_status(&mut self, status: SpanStatus);
    fn add_event(&mut self, name: &str, attributes: Option<HashMap<String, String>>);
    fn end(self: Box<Self>);
}
```

### Usage Example

```rust
use integrations_gemini::observability::{TracingTracer, SpanStatus};

let tracer = TracingTracer::new("gemini");
let mut span = tracer.start_span("gemini.content.generate");

span.set_attribute("model", "gemini-1.5-pro");
span.set_attribute("temperature", "0.7");

// Do work...

span.set_status(SpanStatus::Ok);
span.end();
```

### Span Hierarchy

The implementation supports nested spans for request decomposition:

```rust
let mut main_span = tracer.start_span("gemini.api.call");

{
    let mut validation_span = tracer.start_span("gemini.validation");
    // Validation work...
    validation_span.set_status(SpanStatus::Ok);
    validation_span.end();
}

{
    let mut http_span = tracer.start_span("gemini.http.request");
    http_span.set_attribute("method", "POST");
    // HTTP work...
    http_span.set_status(SpanStatus::Ok);
    http_span.end();
}

main_span.set_status(SpanStatus::Ok);
main_span.end();
```

### Span Events

Add events within a span to mark significant points:

```rust
let mut span = tracer.start_span("gemini.content.generate");

let mut event_attrs = HashMap::new();
event_attrs.insert("chunk_number".to_string(), "1".to_string());
span.add_event("chunk_received", Some(event_attrs));
```

## Metrics

### MetricsRecorder Trait

```rust
pub trait MetricsRecorder: Send + Sync {
    fn increment_counter(&self, name: &str, labels: &[(&str, &str)]);
    fn record_histogram(&self, name: &str, value: f64, labels: &[(&str, &str)]);
    fn record_gauge(&self, name: &str, value: f64, labels: &[(&str, &str)]);
}
```

### GeminiMetrics

High-level convenience wrapper for Gemini-specific metrics:

```rust
use integrations_gemini::observability::{GeminiMetrics, TracingMetricsRecorder};

let recorder = Box::new(TracingMetricsRecorder::new());
let metrics = GeminiMetrics::new("gemini", recorder);

// Record a request
metrics.record_request("content", "generate", 200, 1234);

// Record token usage
metrics.record_tokens("content", 150, 75);
```

### Available Metrics

#### Request Metrics

```rust
metrics.record_request(service: &str, method: &str, status: u16, duration_ms: u64)
```

Records:
- `{prefix}_requests_total` (counter) - Total requests
- `{prefix}_errors_total` (counter) - Failed requests (status >= 400)
- `{prefix}_request_duration_ms` (histogram) - Request duration

#### Token Metrics

```rust
metrics.record_tokens(service: &str, prompt_tokens: i32, completion_tokens: i32)
```

Records:
- `{prefix}_prompt_tokens` (histogram)
- `{prefix}_completion_tokens` (histogram)
- `{prefix}_total_tokens` (histogram)

#### Cached Token Metrics

```rust
metrics.record_cached_tokens(service: &str, cached_tokens: i32)
```

Records:
- `{prefix}_cached_tokens` (histogram)

#### Streaming Metrics

```rust
metrics.record_stream_chunk(service: &str, chunk_size: usize)
```

Records:
- `{prefix}_stream_chunks_total` (counter)
- `{prefix}_stream_chunk_size_bytes` (histogram)

#### Safety Metrics

```rust
metrics.record_safety_block(service: &str, category: &str)
```

Records:
- `{prefix}_safety_blocks_total` (counter)

#### Resilience Metrics

```rust
metrics.record_rate_limit(service: &str)
metrics.record_retry(service: &str, attempt: u32)
metrics.record_circuit_breaker_state(service: &str, state: &str)
```

#### File Metrics

```rust
metrics.record_file_upload(file_size: u64, mime_type: &str)
```

Records:
- `{prefix}_file_uploads_total` (counter)
- `{prefix}_file_size_bytes` (histogram)

#### Embedding Metrics

```rust
metrics.record_embedding(task_type: &str, dimension: usize)
```

Records:
- `{prefix}_embeddings_total` (counter)
- `{prefix}_embedding_dimension` (histogram)

## Integration with Services

### ContentService Example

The ContentService has been enhanced with full observability:

```rust
impl ContentServiceImpl {
    pub fn new(
        config: Arc<GeminiConfig>,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        logger: Box<dyn Logger>,
        tracer: Box<dyn Tracer>,
        metrics: GeminiMetrics,
    ) -> Self {
        // ...
    }
}
```

### Request Flow with Observability

1. **Start Span** - Create span for the operation
2. **Log Start** - Log request initiation with context
3. **Execute** - Perform the API call
4. **Record Metrics** - Record timing and usage metrics
5. **Log Result** - Log success/failure with details
6. **End Span** - Mark span completion with status

Example from `generate()`:

```rust
async fn generate(&self, model: &str, request: GenerateContentRequest)
    -> Result<GenerateContentResponse, GeminiError> {

    // 1. Start span
    let mut span = self.tracer.start_span("gemini.content.generate");
    span.set_attribute("model", model);

    let start = Instant::now();

    // 2. Log start
    self.logger.debug("Starting content generation", json!({
        "model": model,
        "contents_count": request.contents.len(),
    }));

    // 3. Execute API call
    let response = self.do_generate(request).await?;

    let duration = start.elapsed();

    // 4. Record metrics
    self.metrics.record_request("content", "generate", 200, duration.as_millis() as u64);

    if let Some(usage) = &response.usage_metadata {
        self.metrics.record_tokens("content", usage.prompt_token_count,
                                   usage.candidates_token_count.unwrap_or(0));
    }

    // 5. Log result
    self.logger.info("Content generation completed", json!({
        "duration_ms": duration.as_millis(),
        "tokens": response.usage_metadata.as_ref().map(|u| u.total_token_count),
    }));

    // 6. End span
    span.set_status(SpanStatus::Ok);
    span.end();

    Ok(response)
}
```

## Factory Functions

### create_default_stack

Creates a production observability stack using tracing-based implementations:

```rust
use integrations_gemini::observability::create_default_stack;

let (logger, tracer, metrics) = create_default_stack("gemini");
```

### create_noop_stack

Creates a no-op observability stack for testing or when observability is disabled:

```rust
use integrations_gemini::observability::create_noop_stack;

let (logger, tracer, metrics) = create_noop_stack("gemini");
```

## Configuration

Observability is controlled through `GeminiConfig`:

```rust
let config = GeminiConfig::builder()
    .api_key(SecretString::new("your-key".into()))
    .enable_tracing(true)   // Enable/disable tracing
    .enable_metrics(true)   // Enable/disable metrics
    .log_level(LogLevel::Info)  // Set log level
    .build()?;
```

## Best Practices

### 1. Use Structured Context

Always provide structured context in logs:

```rust
// Good
logger.info("Request completed", json!({
    "duration_ms": 123,
    "status": 200,
    "model": "gemini-pro"
}));

// Avoid
logger.info("Request completed in 123ms with status 200", json!({}));
```

### 2. Set Meaningful Span Attributes

```rust
span.set_attribute("model", "gemini-1.5-pro");
span.set_attribute("temperature", "0.7");
span.set_attribute("user_id", "user-123");
```

### 3. Always Set Span Status

```rust
match result {
    Ok(_) => span.set_status(SpanStatus::Ok),
    Err(e) => span.set_status(SpanStatus::Error(e.to_string())),
}
span.end();
```

### 4. Record All Relevant Metrics

Track both success and failure cases:

```rust
metrics.record_request("content", "generate", status_code, duration);

if let Err(GeminiError::Content(ContentError::SafetyBlocked { category, .. })) = &result {
    metrics.record_safety_block("content", category);
}
```

### 5. Use Labels for Dimensionality

Add labels to metrics for filtering and aggregation:

```rust
metrics.increment_counter("requests_total", &[
    ("service", "content"),
    ("method", "generate"),
    ("status", "200")
]);
```

## Testing

### Mock Implementations

For testing, use the provided no-op implementations:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use integrations_gemini::observability::create_noop_stack;

    #[tokio::test]
    async fn test_content_generation() {
        let (logger, tracer, metrics) = create_noop_stack("test");

        let service = ContentServiceImpl::new(
            config,
            transport,
            auth_manager,
            logger,
            tracer,
            metrics,
        );

        // Test without any observability overhead
    }
}
```

### Custom Test Recorders

Create custom recorders to verify observability in tests:

```rust
struct TestMetricsRecorder {
    counters: Arc<Mutex<Vec<String>>>,
}

impl MetricsRecorder for TestMetricsRecorder {
    fn increment_counter(&self, name: &str, labels: &[(&str, &str)]) {
        self.counters.lock().unwrap().push(name.to_string());
    }
    // ...
}
```

## Performance Considerations

1. **No-op Implementations** - Use `create_noop_stack()` when observability is not needed
2. **Lazy Evaluation** - Log fields use `serde_json::Value` which is only serialized if logged
3. **Async-Safe** - All traits are `Send + Sync` for use in async contexts
4. **Zero-Cost Abstractions** - Trait implementations are optimized by the compiler

## Integration with External Systems

### OpenTelemetry

The tracing implementation can be integrated with OpenTelemetry:

```rust
use tracing_subscriber::prelude::*;
use opentelemetry::global;

let tracer = global::tracer("gemini");
tracing_subscriber::registry()
    .with(tracing_opentelemetry::layer().with_tracer(tracer))
    .init();

// Now StructuredLogger and TracingTracer will emit to OpenTelemetry
```

### Prometheus

Metrics can be exported to Prometheus using a custom `MetricsRecorder`:

```rust
use prometheus::{Counter, Histogram, Registry};

struct PrometheusMetricsRecorder {
    registry: Registry,
    counters: HashMap<String, Counter>,
    histograms: HashMap<String, Histogram>,
}

impl MetricsRecorder for PrometheusMetricsRecorder {
    fn increment_counter(&self, name: &str, labels: &[(&str, &str)]) {
        // Implement Prometheus counter increment
    }
    // ...
}
```

## Example Usage

See `/examples/observability.rs` for a complete demonstration of all observability features.

Run the example:

```bash
cargo run --example observability
```

## Summary

The Gemini Rust client provides production-ready observability through:

- **Structured Logging** with automatic sensitive data redaction
- **Distributed Tracing** with spans and attributes
- **Comprehensive Metrics** for all operations
- **Flexible Architecture** supporting multiple backends
- **Full Integration** across all services
- **Testing Support** with no-op implementations

All observability is opt-in through configuration and can be completely disabled for zero overhead in production if not needed.
