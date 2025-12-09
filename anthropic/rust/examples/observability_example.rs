//! Example demonstrating the observability features of the Anthropic Rust client.
//!
//! This example shows how to:
//! - Initialize logging with different formats
//! - Use distributed tracing to track request lifecycles
//! - Collect metrics for monitoring API usage
//! - Track errors and performance

use integrations_anthropic::observability::{
    DefaultTracer, InMemoryMetricsCollector, LogFormat, LogLevel, LoggingConfig, MetricsCollector,
    Tracer, metric_names, log_request, log_response, log_error,
};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging with pretty format for development
    LoggingConfig::new()
        .with_level(LogLevel::Debug)
        .with_format(LogFormat::Pretty)
        .with_file_line(true)
        .init()?;

    println!("=== Observability Features Demo ===\n");

    // Example 1: Basic tracing
    basic_tracing_example();

    // Example 2: Hierarchical spans
    hierarchical_spans_example();

    // Example 3: Metrics collection
    metrics_collection_example();

    // Example 4: Full request lifecycle tracking
    full_request_lifecycle_example();

    // Example 5: Error tracking
    error_tracking_example();

    Ok(())
}

fn basic_tracing_example() {
    println!("--- Example 1: Basic Tracing ---");

    let tracer = DefaultTracer::new("anthropic-client");

    // Start a span for an API request
    let span = tracer.start_span("api_request")
        .with_attribute("http.method", "POST")
        .with_attribute("http.path", "/v1/messages")
        .with_attribute("model", "claude-3-opus-20240229");

    // Simulate work
    thread::sleep(Duration::from_millis(50));

    // End the span
    let span = span.finish_with_ok();
    tracer.end_span(span);

    println!("Completed API request span\n");
}

fn hierarchical_spans_example() {
    println!("--- Example 2: Hierarchical Spans ---");

    let tracer = DefaultTracer::new("anthropic-client");

    // Parent span for the entire operation
    let parent_span = tracer.start_span("create_message_with_retry");
    let parent_id = parent_span.span_id.clone();

    // Child span for the first attempt
    let attempt_span = tracer.start_span("attempt_1")
        .with_parent(&parent_id)
        .with_attribute("retry_count", "0");

    thread::sleep(Duration::from_millis(30));
    tracer.end_span(attempt_span.finish_with_ok());

    // Child span for validation
    let validation_span = tracer.start_span("validate_response")
        .with_parent(&parent_id);

    thread::sleep(Duration::from_millis(10));
    tracer.end_span(validation_span.finish_with_ok());

    // End parent span
    tracer.end_span(parent_span.finish_with_ok());

    println!("Completed hierarchical span tracking\n");
}

fn metrics_collection_example() {
    println!("--- Example 3: Metrics Collection ---");

    let metrics = InMemoryMetricsCollector::new();

    // Track request counts
    metrics.increment_counter(
        metric_names::REQUEST_COUNT,
        1,
        &[("method", "POST"), ("endpoint", "/v1/messages")]
    );

    // Track request duration
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
    metrics.increment_counter(
        metric_names::TOKENS_OUTPUT,
        250,
        &[("model", "claude-3-opus")]
    );

    // Display collected metrics
    println!("Request count: {}", metrics.get_counter("anthropic.requests.total:method=POST,endpoint=/v1/messages"));
    println!("Input tokens: {}", metrics.get_counter("anthropic.tokens.input:model=claude-3-opus"));
    println!("Output tokens: {}", metrics.get_counter("anthropic.tokens.output:model=claude-3-opus"));
    println!();
}

fn full_request_lifecycle_example() {
    println!("--- Example 4: Full Request Lifecycle Tracking ---");

    let tracer = DefaultTracer::new("anthropic-client");
    let metrics = Arc::new(InMemoryMetricsCollector::new());

    // Start tracking the request
    let span = tracer.start_span("create_message")
        .with_attribute("model", "claude-3-opus-20240229")
        .with_attribute("max_tokens", "1024");

    // Log the outgoing request
    log_request("POST", "/v1/messages", Some(r#"{"model":"claude-3-opus-20240229","max_tokens":1024}"#));

    // Increment request counter
    metrics.increment_counter(
        metric_names::REQUEST_COUNT,
        1,
        &[("operation", "create_message")]
    );

    // Simulate API call
    thread::sleep(Duration::from_millis(120));

    // Log the response
    log_response(200, 120, Some(r#"{"id":"msg_123","type":"message",...}"#));

    // Record the duration
    let span = span.finish_with_ok();
    if let Some(duration) = span.duration() {
        metrics.record_histogram(
            metric_names::REQUEST_DURATION_MS,
            duration.as_millis() as f64,
            &[("operation", "create_message")]
        );
    }

    // Record token usage from response
    metrics.increment_counter(
        metric_names::TOKENS_INPUT,
        50,
        &[("model", "claude-3-opus")]
    );
    metrics.increment_counter(
        metric_names::TOKENS_OUTPUT,
        200,
        &[("model", "claude-3-opus")]
    );

    tracer.end_span(span);

    println!("Tracked complete request lifecycle");
    println!("Duration: {:?}", metrics.get_histogram("anthropic.requests.duration_ms:operation=create_message"));
    println!();
}

fn error_tracking_example() {
    println!("--- Example 5: Error Tracking ---");

    let tracer = DefaultTracer::new("anthropic-client");
    let metrics = InMemoryMetricsCollector::new();

    // Simulate a failed request
    let span = tracer.start_span("api_request")
        .with_attribute("model", "claude-3-opus-20240229");

    thread::sleep(Duration::from_millis(50));

    // Simulate an error
    let error_msg = "Rate limit exceeded: 429";
    let span = span.finish_with_error(error_msg);

    // Log the error
    let error = std::io::Error::new(std::io::ErrorKind::Other, error_msg);
    log_error(&error, "API request failed");

    // Record error metrics
    metrics.increment_counter(
        metric_names::REQUEST_ERRORS,
        1,
        &[("error_type", "rate_limit")]
    );

    metrics.increment_counter(
        metric_names::RATE_LIMIT_HITS,
        1,
        &[("tier", "tier-1")]
    );

    tracer.end_span(span);

    println!("Tracked error: {}", error_msg);
    println!("Error count: {}", metrics.get_counter("anthropic.requests.errors:error_type=rate_limit"));
    println!("Rate limit hits: {}", metrics.get_counter("anthropic.rate_limit.hits:tier=tier-1"));
    println!();
}
