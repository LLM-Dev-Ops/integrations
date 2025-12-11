//! Observability layer for the Gemini API client.
//!
//! Provides comprehensive observability through logging, tracing, and metrics.
//!
//! # Overview
//!
//! This module provides trait-based abstractions for:
//! - **Logging**: Structured logging with sensitive data redaction
//! - **Tracing**: Distributed tracing with spans and attributes
//! - **Metrics**: Metrics recording (counters, histograms, gauges)
//!
//! # Examples
//!
//! ## Using the Structured Logger
//!
//! ```rust
//! use integrations_gemini::observability::{Logger, StructuredLogger};
//! use integrations_gemini::config::LogLevel;
//! use serde_json::json;
//!
//! let logger = StructuredLogger::new("gemini.content")
//!     .with_level(LogLevel::Debug);
//!
//! logger.info("Starting content generation", json!({
//!     "model": "gemini-pro",
//!     "temperature": 0.7
//! }));
//! ```
//!
//! ## Using the Tracer
//!
//! ```rust
//! use integrations_gemini::observability::{Tracer, TracingTracer, SpanStatus};
//!
//! let tracer = TracingTracer::new("gemini");
//! let mut span = tracer.start_span("content.generate");
//!
//! span.set_attribute("model", "gemini-pro");
//! span.set_status(SpanStatus::Ok);
//! span.end();
//! ```
//!
//! ## Using Metrics
//!
//! ```rust
//! use integrations_gemini::observability::{GeminiMetrics, TracingMetricsRecorder};
//!
//! let recorder = Box::new(TracingMetricsRecorder::new());
//! let metrics = GeminiMetrics::new("gemini", recorder);
//!
//! metrics.record_request("content", "generate", 200, 1234);
//! metrics.record_tokens("content", 100, 50);
//! ```

pub mod logging;
pub mod metrics;
pub mod tracing;

// Re-export main types for convenience
pub use logging::{DefaultLogger, Logger, StructuredLogger};
pub use metrics::{
    DefaultMetricsRecorder, GeminiMetrics, MetricsRecorder, TracingMetricsRecorder,
};
pub use tracing::{DefaultTracer, Span, SpanStatus, Tracer, TracingSpan, TracingTracer};

/// Create a default observability stack.
///
/// Returns a tuple of (logger, tracer, metrics) with default implementations.
///
/// # Arguments
/// * `service_name` - The service name to use for all observability components
///
/// # Example
/// ```rust
/// use integrations_gemini::observability::create_default_stack;
///
/// let (logger, tracer, metrics) = create_default_stack("gemini");
/// ```
pub fn create_default_stack(
    service_name: &str,
) -> (
    Box<dyn Logger>,
    Box<dyn Tracer>,
    GeminiMetrics,
) {
    let logger = Box::new(StructuredLogger::new(service_name));
    let tracer = Box::new(TracingTracer::new(service_name));
    let metrics_recorder = Box::new(TracingMetricsRecorder::new());
    let metrics = GeminiMetrics::new(service_name, metrics_recorder);

    (logger, tracer, metrics)
}

/// Create a no-op observability stack.
///
/// Returns a tuple of (logger, tracer, metrics) with no-op implementations
/// suitable for testing or when observability is disabled.
///
/// # Arguments
/// * `service_name` - The service name (used for naming only)
///
/// # Example
/// ```rust
/// use integrations_gemini::observability::create_noop_stack;
///
/// let (logger, tracer, metrics) = create_noop_stack("gemini");
/// ```
pub fn create_noop_stack(
    service_name: &str,
) -> (
    Box<dyn Logger>,
    Box<dyn Tracer>,
    GeminiMetrics,
) {
    let logger = Box::new(DefaultLogger::new(service_name));
    let tracer = Box::new(DefaultTracer::new(service_name));
    let metrics_recorder = Box::new(DefaultMetricsRecorder::new(service_name));
    let metrics = GeminiMetrics::new(service_name, metrics_recorder);

    (logger, tracer, metrics)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_default_stack() {
        let (logger, tracer, _metrics) = create_default_stack("test");

        // Verify we got valid implementations
        // The actual logging/tracing won't happen in tests without a subscriber
        use serde_json::json;
        logger.info("test", json!({}));

        let span = tracer.start_span("test");
        span.end();
    }

    #[test]
    fn test_create_noop_stack() {
        let (logger, tracer, _metrics) = create_noop_stack("test");

        // Verify no-op implementations work without panicking
        use serde_json::json;
        logger.info("test", json!({}));

        let span = tracer.start_span("test");
        span.end();
    }
}
