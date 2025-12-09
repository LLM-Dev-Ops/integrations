# Observability Module

Comprehensive observability features for monitoring and debugging the Anthropic API client.

## Overview

The observability module provides three key capabilities:

1. **Tracing**: Distributed tracing for tracking request lifecycles
2. **Metrics**: Performance and usage metrics collection
3. **Logging**: Structured logging with multiple output formats

## Features

### Tracing

- Distributed tracing with trace IDs and span IDs
- Hierarchical span relationships (parent/child)
- Span attributes for contextual information
- Duration tracking for performance analysis
- Status tracking (Ok, Error, Unset)

### Metrics

- **Counters**: Track totals (requests, errors, tokens)
- **Histograms**: Record distributions (latencies, sizes)
- **Gauges**: Current values (queue sizes, circuit breaker state)
- Label support for multi-dimensional metrics
- Thread-safe in-memory collection

### Logging

- Multiple output formats: Pretty, JSON, Compact
- Configurable log levels: Trace, Debug, Info, Warn, Error
- Structured logging with the `tracing` crate
- Request/response logging helpers
- Error logging with context

## Usage

### Basic Logging Setup

```rust
use integrations_anthropic::observability::{LoggingConfig, LogLevel, LogFormat};

// Initialize logging at application startup
LoggingConfig::new()
    .with_level(LogLevel::Info)
    .with_format(LogFormat::Pretty)
    .init()?;
```

### Distributed Tracing

```rust
use integrations_anthropic::observability::{DefaultTracer, Tracer};

let tracer = DefaultTracer::new("my-service");

// Start a span
let span = tracer.start_span("api_request")
    .with_attribute("model", "claude-3-opus")
    .with_attribute("max_tokens", "1024");

// Do work...

// End the span
tracer.end_span(span.finish_with_ok());
```

### Hierarchical Spans

```rust
let parent = tracer.start_span("parent_operation");
let parent_id = parent.span_id.clone();

let child = tracer.start_span("child_operation")
    .with_parent(&parent_id);

// Finish child first
tracer.end_span(child.finish_with_ok());

// Then parent
tracer.end_span(parent.finish_with_ok());
```

### Metrics Collection

```rust
use integrations_anthropic::observability::{
    InMemoryMetricsCollector, MetricsCollector, metric_names
};

let metrics = InMemoryMetricsCollector::new();

// Track request count
metrics.increment_counter(
    metric_names::REQUEST_COUNT,
    1,
    &[("method", "POST")]
);

// Track latency
metrics.record_histogram(
    metric_names::REQUEST_DURATION_MS,
    156.7,
    &[("endpoint", "/v1/messages")]
);

// Track token usage
metrics.increment_counter(
    metric_names::TOKENS_INPUT,
    100,
    &[("model", "claude-3-opus")]
);
```

### Error Tracking

```rust
use integrations_anthropic::observability::{log_error, metric_names};

// Track error in span
let span = tracer.start_span("api_request");
// ... error occurs ...
let span = span.finish_with_error("Rate limit exceeded");

// Log the error
log_error(&error, "API request failed");

// Record error metric
metrics.increment_counter(
    metric_names::REQUEST_ERRORS,
    1,
    &[("error_type", "rate_limit")]
);
```

## Pre-defined Metrics

The module provides standardized metric names:

| Metric Name | Type | Description |
|-------------|------|-------------|
| `anthropic.requests.total` | Counter | Total API requests |
| `anthropic.requests.duration_ms` | Histogram | Request duration in milliseconds |
| `anthropic.requests.errors` | Counter | Total request errors |
| `anthropic.tokens.input` | Counter | Input tokens used |
| `anthropic.tokens.output` | Counter | Output tokens generated |
| `anthropic.rate_limit.hits` | Counter | Rate limit hits |
| `anthropic.circuit_breaker.state` | Gauge | Circuit breaker state (0=closed, 1=open, 2=half-open) |
| `anthropic.retry.attempts` | Counter | Retry attempts |

## Production Usage

### JSON Logging for Production

```rust
LoggingConfig::new()
    .with_level(LogLevel::Info)
    .with_format(LogFormat::Json)
    .with_timestamps(true)
    .init()?;
```

### Exporting Metrics

The `InMemoryMetricsCollector` is suitable for testing and simple use cases. For production, implement the `MetricsCollector` trait to export to your monitoring system:

```rust
use integrations_anthropic::observability::MetricsCollector;

struct PrometheusCollector {
    // Prometheus client...
}

impl MetricsCollector for PrometheusCollector {
    fn increment_counter(&self, name: &str, value: u64, labels: &[(&str, &str)]) {
        // Export to Prometheus...
    }

    fn record_histogram(&self, name: &str, value: f64, labels: &[(&str, &str)]) {
        // Export to Prometheus...
    }

    fn set_gauge(&self, name: &str, value: f64, labels: &[(&str, &str)]) {
        // Export to Prometheus...
    }
}
```

### Custom Tracing Backend

Similarly, implement the `Tracer` trait for custom tracing backends:

```rust
use integrations_anthropic::observability::{Tracer, RequestSpan};

struct OpenTelemetryTracer {
    // OpenTelemetry tracer...
}

impl Tracer for OpenTelemetryTracer {
    fn start_span(&self, operation: &str) -> RequestSpan {
        // Create span with OpenTelemetry...
    }

    fn end_span(&self, span: RequestSpan) {
        // Record span to OpenTelemetry...
    }
}
```

## Testing

### No-op Implementations

For tests where observability is not needed:

```rust
use integrations_anthropic::observability::{NoopTracer, NoopMetricsCollector};

let tracer = NoopTracer;
let metrics = NoopMetricsCollector;

// These do nothing, perfect for tests
tracer.end_span(tracer.start_span("test"));
metrics.increment_counter("test", 1, &[]);
```

### In-Memory Collection for Tests

```rust
let metrics = InMemoryMetricsCollector::new();

// Use in tests...

// Assert on collected metrics
assert_eq!(metrics.get_counter("requests"), 5);
let latencies = metrics.get_histogram("latency");
assert_eq!(latencies.len(), 5);

// Reset for next test
metrics.reset();
```

## Best Practices

1. **Initialize logging once** at application startup
2. **Use structured logging** with key-value pairs instead of string interpolation
3. **Add context to spans** using attributes
4. **Track errors separately** from successful requests in metrics
5. **Use labels wisely** to avoid metric cardinality explosion
6. **Finish spans** even when errors occur
7. **Log request/response bodies** only at DEBUG level
8. **Sanitize sensitive data** before logging

## Examples

See `/examples/observability_example.rs` for comprehensive usage examples.

## Architecture

```
observability/
├── mod.rs              # Module exports
├── tracing.rs          # Distributed tracing
├── metrics.rs          # Metrics collection
├── logging.rs          # Structured logging
├── tests.rs            # Integration tests
└── README.md           # This file
```

## Dependencies

- `tracing`: Core tracing infrastructure
- `tracing-subscriber`: Logging and tracing subscriber implementations
- `parking_lot`: High-performance synchronization primitives

## Thread Safety

All observability components are thread-safe and can be safely shared across threads using `Arc`.

```rust
use std::sync::Arc;

let metrics = Arc::new(InMemoryMetricsCollector::new());
let tracer = Arc::new(DefaultTracer::new("service"));

// Safe to clone and use in multiple threads
let metrics_clone = Arc::clone(&metrics);
let tracer_clone = Arc::clone(&tracer);
```
