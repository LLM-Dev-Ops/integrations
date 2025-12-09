//! Integration tests for the observability module.
//!
//! These tests verify that tracing, metrics, and logging work together correctly.

use super::*;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[test]
fn test_tracer_and_metrics_integration() {
    let tracer = DefaultTracer::new("test-service");
    let metrics = Arc::new(InMemoryMetricsCollector::new());

    // Start a span and record metrics
    let span = tracer.start_span("api_request");
    metrics.increment_counter(metric_names::REQUEST_COUNT, 1, &[("method", "POST")]);

    thread::sleep(Duration::from_millis(10));

    // End span and record duration
    let span = span.finish_with_ok();
    if let Some(duration) = span.duration() {
        metrics.record_histogram(
            metric_names::REQUEST_DURATION_MS,
            duration.as_millis() as f64,
            &[("method", "POST")],
        );
    }

    tracer.end_span(span);

    // Verify metrics were recorded
    assert_eq!(metrics.get_counter("anthropic.requests.total:method=POST"), 1);
    let durations = metrics.get_histogram("anthropic.requests.duration_ms:method=POST");
    assert_eq!(durations.len(), 1);
    assert!(durations[0] >= 10.0);
}

#[test]
fn test_error_tracking_with_tracing_and_metrics() {
    let tracer = DefaultTracer::new("test-service");
    let metrics = Arc::new(InMemoryMetricsCollector::new());

    // Simulate a failed request
    let span = tracer.start_span("api_request");
    let error_msg = "Rate limit exceeded";
    let span = span.finish_with_error(error_msg);

    // Record error metric
    metrics.increment_counter(
        metric_names::REQUEST_ERRORS,
        1,
        &[("error_type", "rate_limit")],
    );

    tracer.end_span(span);

    // Verify error was tracked
    assert_eq!(metrics.get_counter("anthropic.requests.errors:error_type=rate_limit"), 1);
}

#[test]
fn test_token_usage_tracking() {
    let metrics = InMemoryMetricsCollector::new();

    // Simulate token usage from API response
    let input_tokens = 100u64;
    let output_tokens = 250u64;

    metrics.increment_counter(metric_names::TOKENS_INPUT, input_tokens, &[("model", "claude-3-opus")]);
    metrics.increment_counter(metric_names::TOKENS_OUTPUT, output_tokens, &[("model", "claude-3-opus")]);

    // Verify token tracking
    assert_eq!(metrics.get_counter("anthropic.tokens.input:model=claude-3-opus"), 100);
    assert_eq!(metrics.get_counter("anthropic.tokens.output:model=claude-3-opus"), 250);
}

#[test]
fn test_circuit_breaker_state_tracking() {
    let metrics = InMemoryMetricsCollector::new();

    // Track circuit breaker state changes
    metrics.set_gauge(metric_names::CIRCUIT_BREAKER_STATE, 0.0, &[]); // Closed
    assert_eq!(metrics.get_gauge(metric_names::CIRCUIT_BREAKER_STATE), Some(0.0));

    metrics.set_gauge(metric_names::CIRCUIT_BREAKER_STATE, 1.0, &[]); // Open
    assert_eq!(metrics.get_gauge(metric_names::CIRCUIT_BREAKER_STATE), Some(1.0));

    metrics.set_gauge(metric_names::CIRCUIT_BREAKER_STATE, 2.0, &[]); // Half-open
    assert_eq!(metrics.get_gauge(metric_names::CIRCUIT_BREAKER_STATE), Some(2.0));
}

#[test]
fn test_retry_attempts_tracking() {
    let metrics = InMemoryMetricsCollector::new();

    // Simulate retry attempts
    for _ in 0..3 {
        metrics.increment_counter(metric_names::RETRY_ATTEMPTS, 1, &[("reason", "timeout")]);
    }

    assert_eq!(metrics.get_counter("anthropic.retry.attempts:reason=timeout"), 3);
}

#[test]
fn test_rate_limit_tracking() {
    let metrics = InMemoryMetricsCollector::new();

    // Simulate rate limit hits
    metrics.increment_counter(metric_names::RATE_LIMIT_HITS, 1, &[("tier", "tier-1")]);
    metrics.increment_counter(metric_names::RATE_LIMIT_HITS, 1, &[("tier", "tier-1")]);

    assert_eq!(metrics.get_counter("anthropic.rate_limit.hits:tier=tier-1"), 2);
}

#[test]
fn test_concurrent_metrics_and_tracing() {
    let metrics = Arc::new(InMemoryMetricsCollector::new());
    let tracer = Arc::new(DefaultTracer::new("test-service"));
    let mut handles = vec![];

    for i in 0..5 {
        let metrics_clone = Arc::clone(&metrics);
        let tracer_clone = Arc::clone(&tracer);

        let handle = thread::spawn(move || {
            let span = tracer_clone.start_span(&format!("operation_{}", i));
            thread::sleep(Duration::from_millis(10));
            metrics_clone.increment_counter("operations", 1, &[]);
            tracer_clone.end_span(span.finish_with_ok());
        });

        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    assert_eq!(metrics.get_counter("operations"), 5);
}

#[test]
fn test_hierarchical_spans() {
    let tracer = DefaultTracer::new("test-service");

    // Create parent span
    let parent_span = tracer.start_span("parent_operation");
    let parent_id = parent_span.span_id.clone();

    // Create child span
    let child_span = tracer
        .start_span("child_operation")
        .with_parent(&parent_id);

    assert_eq!(child_span.parent_span_id, Some(parent_id.clone()));

    // Finish child first
    tracer.end_span(child_span.finish_with_ok());

    // Then finish parent
    tracer.end_span(parent_span.finish_with_ok());
}

#[test]
fn test_span_attributes_for_http_requests() {
    let span = RequestSpan::new("http_request")
        .with_attribute("http.method", "POST")
        .with_attribute("http.url", "/v1/messages")
        .with_attribute("http.status_code", "200")
        .with_attribute("http.request_size", "1024")
        .with_attribute("http.response_size", "2048");

    assert_eq!(span.attributes.len(), 5);
    assert!(span.attributes.contains(&("http.method".to_string(), "POST".to_string())));
    assert!(span.attributes.contains(&("http.status_code".to_string(), "200".to_string())));
}

#[test]
fn test_latency_percentiles() {
    let metrics = InMemoryMetricsCollector::new();

    // Record various latencies
    let latencies = vec![10.0, 20.0, 30.0, 40.0, 50.0, 100.0, 200.0, 500.0, 1000.0];
    for latency in &latencies {
        metrics.record_histogram(metric_names::REQUEST_DURATION_MS, *latency, &[]);
    }

    let mut recorded = metrics.get_histogram(metric_names::REQUEST_DURATION_MS);
    recorded.sort_by(|a, b| a.partial_cmp(b).unwrap());

    // Calculate percentiles
    let p50_idx = (recorded.len() as f64 * 0.5) as usize;
    let p95_idx = (recorded.len() as f64 * 0.95) as usize;
    let p99_idx = (recorded.len() as f64 * 0.99) as usize;

    assert_eq!(recorded[p50_idx], 50.0);
    assert!(recorded[p95_idx] >= 500.0);
    assert!(recorded[p99_idx] >= 1000.0);
}

#[test]
fn test_noop_implementations() {
    let tracer = NoopTracer;
    let metrics = NoopMetricsCollector;

    // Should not panic
    let span = tracer.start_span("test");
    tracer.end_span(span);

    metrics.increment_counter("test", 1, &[]);
    metrics.record_histogram("test", 1.0, &[]);
    metrics.set_gauge("test", 1.0, &[]);
}

#[test]
fn test_logging_functions_dont_panic() {
    // These should not panic even without logging initialized
    log_request("POST", "/v1/messages", Some("{}"));
    log_response(200, 1000, Some("{}"));

    let error = std::io::Error::new(std::io::ErrorKind::Other, "test error");
    log_error(&error, "test context");
}

#[test]
fn test_metrics_with_multiple_label_dimensions() {
    let metrics = InMemoryMetricsCollector::new();

    // Track requests by method, status, and model
    metrics.increment_counter(
        "requests",
        1,
        &[("method", "POST"), ("status", "200"), ("model", "claude-3-opus")],
    );
    metrics.increment_counter(
        "requests",
        1,
        &[("method", "POST"), ("status", "429"), ("model", "claude-3-opus")],
    );
    metrics.increment_counter(
        "requests",
        1,
        &[("method", "GET"), ("status", "200"), ("model", "claude-3-sonnet")],
    );

    assert_eq!(
        metrics.get_counter("requests:method=POST,status=200,model=claude-3-opus"),
        1
    );
    assert_eq!(
        metrics.get_counter("requests:method=POST,status=429,model=claude-3-opus"),
        1
    );
    assert_eq!(
        metrics.get_counter("requests:method=GET,status=200,model=claude-3-sonnet"),
        1
    );
}

#[test]
fn test_full_request_lifecycle_observability() {
    let tracer = DefaultTracer::new("anthropic-client");
    let metrics = Arc::new(InMemoryMetricsCollector::new());

    // Start request
    let span = tracer.start_span("create_message")
        .with_attribute("model", "claude-3-opus-20240229")
        .with_attribute("max_tokens", "1024");

    metrics.increment_counter(metric_names::REQUEST_COUNT, 1, &[("operation", "create_message")]);

    // Simulate request
    thread::sleep(Duration::from_millis(100));

    // Record response
    let span = span.finish_with_ok();
    if let Some(duration) = span.duration() {
        metrics.record_histogram(
            metric_names::REQUEST_DURATION_MS,
            duration.as_millis() as f64,
            &[("operation", "create_message")],
        );
    }

    // Record token usage
    metrics.increment_counter(metric_names::TOKENS_INPUT, 50, &[("model", "claude-3-opus")]);
    metrics.increment_counter(metric_names::TOKENS_OUTPUT, 200, &[("model", "claude-3-opus")]);

    tracer.end_span(span);

    // Verify all metrics
    assert_eq!(metrics.get_counter("anthropic.requests.total:operation=create_message"), 1);
    assert_eq!(metrics.get_counter("anthropic.tokens.input:model=claude-3-opus"), 50);
    assert_eq!(metrics.get_counter("anthropic.tokens.output:model=claude-3-opus"), 200);

    let durations = metrics.get_histogram("anthropic.requests.duration_ms:operation=create_message");
    assert_eq!(durations.len(), 1);
    assert!(durations[0] >= 100.0);
}
