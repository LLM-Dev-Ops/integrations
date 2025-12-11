//! Example demonstrating observability features in the Gemini Rust client.
//!
//! This example shows how to:
//! - Configure structured logging
//! - Use distributed tracing
//! - Record metrics
//! - Integrate observability into API calls

use integrations_gemini::{
    GeminiConfig,
    observability::{
        Logger, StructuredLogger, TracingTracer, GeminiMetrics,
        TracingMetricsRecorder, SpanStatus, create_default_stack,
    },
    types::{Content, Part, GenerateContentRequest},
};
use secrecy::SecretString;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing subscriber for demonstration
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_target(false)
        .with_thread_ids(false)
        .init();

    println!("=== Gemini Observability Example ===\n");

    // Example 1: Basic logging
    println!("1. Basic Structured Logging:");
    demonstrate_logging();

    // Example 2: Distributed tracing
    println!("\n2. Distributed Tracing:");
    demonstrate_tracing();

    // Example 3: Metrics recording
    println!("\n3. Metrics Recording:");
    demonstrate_metrics();

    // Example 4: Full observability stack
    println!("\n4. Full Observability Stack:");
    demonstrate_full_stack();

    Ok(())
}

/// Demonstrate structured logging with sensitive data redaction.
fn demonstrate_logging() {
    let logger = StructuredLogger::new("gemini.example");

    // Log various levels with structured context
    logger.info("Starting Gemini API request", json!({
        "model": "gemini-1.5-pro",
        "temperature": 0.7,
        "user": "demo-user"
    }));

    logger.debug("Request details", json!({
        "prompt_tokens": 150,
        "max_output_tokens": 1024,
    }));

    // Demonstrate sensitive data redaction
    logger.info("API call with credentials", json!({
        "api_key": "sk-1234567890abcdef",  // This will be redacted
        "model": "gemini-pro",
        "user": "demo-user"
    }));

    logger.warn("Rate limit approaching", json!({
        "requests_remaining": 10,
        "reset_time": "2024-01-01T00:00:00Z"
    }));

    logger.error("API error occurred", json!({
        "error": "Rate limit exceeded",
        "status_code": 429,
        "retry_after": 60
    }));
}

/// Demonstrate distributed tracing with spans.
fn demonstrate_tracing() {
    let tracer = TracingTracer::new("gemini");

    // Create a span for the main operation
    let mut main_span = tracer.start_span("gemini.content.generate");
    main_span.set_attribute("model", "gemini-1.5-pro");
    main_span.set_attribute("user", "demo-user");

    // Simulate sub-operations
    {
        let mut validation_span = tracer.start_span("gemini.validation");
        validation_span.set_attribute("stage", "request_validation");
        validation_span.set_status(SpanStatus::Ok);
        validation_span.end();
    }

    {
        let mut network_span = tracer.start_span("gemini.http.request");
        network_span.set_attribute("method", "POST");
        network_span.set_attribute("endpoint", "/v1beta/models/gemini-1.5-pro:generateContent");

        // Add an event to the span
        let mut attrs = std::collections::HashMap::new();
        attrs.insert("status_code".to_string(), "200".to_string());
        attrs.insert("content_length".to_string(), "1024".to_string());
        network_span.add_event("response_received", Some(attrs));

        network_span.set_status(SpanStatus::Ok);
        network_span.end();
    }

    // Complete the main span
    main_span.set_status(SpanStatus::Ok);
    main_span.end();

    println!("  ✓ Tracing spans recorded successfully");
}

/// Demonstrate metrics recording.
fn demonstrate_metrics() {
    let recorder = Box::new(TracingMetricsRecorder::new());
    let metrics = GeminiMetrics::new("gemini", recorder);

    // Record a successful API request
    metrics.record_request("content", "generate", 200, 1234);
    println!("  ✓ Request metric recorded: status=200, duration=1234ms");

    // Record token usage
    metrics.record_tokens("content", 150, 75);
    println!("  ✓ Token metrics recorded: prompt=150, completion=75");

    // Record cached token usage
    metrics.record_cached_tokens("content", 100);
    println!("  ✓ Cached token metric recorded: cached=100");

    // Record streaming metrics
    metrics.record_stream_chunk("content", 512);
    println!("  ✓ Stream chunk metric recorded: size=512 bytes");

    // Record safety block
    metrics.record_safety_block("content", "HARM_CATEGORY_HATE_SPEECH");
    println!("  ✓ Safety block metric recorded");

    // Record rate limit
    metrics.record_rate_limit("content");
    println!("  ✓ Rate limit metric recorded");

    // Record retry
    metrics.record_retry("content", 1);
    println!("  ✓ Retry metric recorded: attempt=1");

    // Record circuit breaker state change
    metrics.record_circuit_breaker_state("content", "open");
    println!("  ✓ Circuit breaker state metric recorded: state=open");

    // Record file upload
    metrics.record_file_upload(1024 * 1024, "image/png");
    println!("  ✓ File upload metric recorded: size=1MB, type=image/png");

    // Record embedding
    metrics.record_embedding("RETRIEVAL_DOCUMENT", 768);
    println!("  ✓ Embedding metric recorded: dimension=768");
}

/// Demonstrate using the full observability stack.
fn demonstrate_full_stack() {
    // Create the full observability stack
    let (logger, tracer, metrics) = create_default_stack("gemini");

    // Simulate a complete API operation with full observability
    logger.info("Starting API operation", json!({
        "operation": "generate_content",
        "model": "gemini-1.5-pro"
    }));

    let mut span = tracer.start_span("gemini.operation.complete");
    span.set_attribute("operation", "demo");

    // Simulate metrics recording
    metrics.record_request("content", "generate", 200, 567);
    metrics.record_tokens("content", 100, 50);

    logger.info("API operation completed successfully", json!({
        "duration_ms": 567,
        "tokens": 150
    }));

    span.set_status(SpanStatus::Ok);
    span.end();

    println!("  ✓ Full observability stack demonstrated successfully");
}

/// Example of integrating observability with actual API usage.
/// This would be used in real code to wrap API calls.
#[allow(dead_code)]
async fn example_with_api_call() -> Result<(), Box<dyn std::error::Error>> {
    // This is pseudo-code showing how observability would be integrated
    // In real usage, the ContentService would have these components injected

    let (logger, tracer, metrics) = create_default_stack("gemini");

    logger.info("Initializing Gemini client", json!({
        "version": env!("CARGO_PKG_VERSION"),
    }));

    let mut span = tracer.start_span("gemini.client.initialize");

    // Create config (in real code)
    // let config = GeminiConfig::builder()
    //     .api_key(SecretString::new("your-key".into()))
    //     .build()?;

    span.set_status(SpanStatus::Ok);
    span.end();

    logger.info("Client initialized successfully", json!({}));

    Ok(())
}
