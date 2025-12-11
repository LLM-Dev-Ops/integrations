//! Tracing implementation for request/response tracking.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tracing::{debug, info, span, Level};

/// Status of a span
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpanStatus {
    /// Operation is in progress
    InProgress,
    /// Operation completed successfully
    Success,
    /// Operation failed with an error
    Error,
    /// Operation was cancelled
    Cancelled,
}

/// A span representing a request
#[derive(Debug)]
pub struct RequestSpan {
    /// Unique span ID
    pub span_id: String,
    /// Parent span ID (if any)
    pub parent_id: Option<String>,
    /// Operation name
    pub operation: String,
    /// Service name
    pub service: String,
    /// Start time
    pub start_time: Instant,
    /// End time (if completed)
    pub end_time: Option<Instant>,
    /// Status
    pub status: SpanStatus,
    /// Attributes
    pub attributes: HashMap<String, String>,
}

impl RequestSpan {
    /// Create a new request span
    pub fn new(operation: impl Into<String>, service: impl Into<String>) -> Self {
        Self {
            span_id: uuid::Uuid::new_v4().to_string(),
            parent_id: None,
            operation: operation.into(),
            service: service.into(),
            start_time: Instant::now(),
            end_time: None,
            status: SpanStatus::InProgress,
            attributes: HashMap::new(),
        }
    }

    /// Set the parent span ID
    pub fn with_parent(mut self, parent_id: impl Into<String>) -> Self {
        self.parent_id = Some(parent_id.into());
        self
    }

    /// Add an attribute
    pub fn with_attribute(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.attributes.insert(key.into(), value.into());
        self
    }

    /// Mark the span as successful
    pub fn success(mut self) -> Self {
        self.status = SpanStatus::Success;
        self.end_time = Some(Instant::now());
        self
    }

    /// Mark the span as failed
    pub fn error(mut self, error: impl Into<String>) -> Self {
        self.status = SpanStatus::Error;
        self.end_time = Some(Instant::now());
        self.attributes.insert("error".to_string(), error.into());
        self
    }

    /// Get the duration of the span
    pub fn duration(&self) -> Duration {
        self.end_time
            .unwrap_or_else(Instant::now)
            .duration_since(self.start_time)
    }
}

/// Trait for tracing operations
pub trait Tracer: Send + Sync {
    /// Start a new span for a request
    fn start_span(&self, operation: &str, service: &str) -> RequestSpan;

    /// End a span
    fn end_span(&self, span: RequestSpan);

    /// Record an event within a span
    fn record_event(&self, span_id: &str, event: &str);
}

/// Default tracer implementation using tracing crate
pub struct DefaultTracer {
    service_name: String,
    span_counter: AtomicU64,
}

impl DefaultTracer {
    /// Create a new default tracer
    pub fn new(service_name: impl Into<String>) -> Self {
        Self {
            service_name: service_name.into(),
            span_counter: AtomicU64::new(0),
        }
    }
}

impl Tracer for DefaultTracer {
    fn start_span(&self, operation: &str, service: &str) -> RequestSpan {
        let span_num = self.span_counter.fetch_add(1, Ordering::Relaxed);

        let _span = span!(
            Level::INFO,
            "cohere_request",
            operation = operation,
            service = service,
            span_id = span_num
        );

        debug!(
            operation = operation,
            service = service,
            "Starting request span"
        );

        RequestSpan::new(operation, service)
    }

    fn end_span(&self, span: RequestSpan) {
        let duration_ms = span.duration().as_millis();

        match span.status {
            SpanStatus::Success => {
                info!(
                    operation = span.operation,
                    service = span.service,
                    duration_ms = duration_ms,
                    "Request completed successfully"
                );
            }
            SpanStatus::Error => {
                let error = span.attributes.get("error").map(|s| s.as_str()).unwrap_or("unknown");
                tracing::error!(
                    operation = span.operation,
                    service = span.service,
                    duration_ms = duration_ms,
                    error = error,
                    "Request failed"
                );
            }
            SpanStatus::Cancelled => {
                tracing::warn!(
                    operation = span.operation,
                    service = span.service,
                    duration_ms = duration_ms,
                    "Request cancelled"
                );
            }
            SpanStatus::InProgress => {
                tracing::warn!(
                    operation = span.operation,
                    service = span.service,
                    duration_ms = duration_ms,
                    "Span ended while still in progress"
                );
            }
        }
    }

    fn record_event(&self, span_id: &str, event: &str) {
        debug!(span_id = span_id, event = event, "Span event");
    }
}

impl Default for DefaultTracer {
    fn default() -> Self {
        Self::new("cohere")
    }
}

/// No-op tracer for testing or when tracing is disabled
#[derive(Debug, Default)]
pub struct NoopTracer;

impl Tracer for NoopTracer {
    fn start_span(&self, operation: &str, service: &str) -> RequestSpan {
        RequestSpan::new(operation, service)
    }

    fn end_span(&self, _span: RequestSpan) {}

    fn record_event(&self, _span_id: &str, _event: &str) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_span() {
        let span = RequestSpan::new("chat", "cohere")
            .with_attribute("model", "command")
            .with_parent("parent-123");

        assert_eq!(span.operation, "chat");
        assert_eq!(span.service, "cohere");
        assert_eq!(span.parent_id, Some("parent-123".to_string()));
        assert_eq!(span.attributes.get("model"), Some(&"command".to_string()));
        assert_eq!(span.status, SpanStatus::InProgress);
    }

    #[test]
    fn test_request_span_success() {
        let span = RequestSpan::new("embed", "cohere").success();

        assert_eq!(span.status, SpanStatus::Success);
        assert!(span.end_time.is_some());
    }

    #[test]
    fn test_request_span_error() {
        let span = RequestSpan::new("rerank", "cohere").error("Connection failed");

        assert_eq!(span.status, SpanStatus::Error);
        assert_eq!(span.attributes.get("error"), Some(&"Connection failed".to_string()));
    }

    #[test]
    fn test_default_tracer() {
        let tracer = DefaultTracer::new("test-service");
        let span = tracer.start_span("test-operation", "test-service");

        assert_eq!(span.operation, "test-operation");
        assert_eq!(span.service, "test-service");
    }

    #[test]
    fn test_noop_tracer() {
        let tracer = NoopTracer;
        let span = tracer.start_span("test", "test");
        tracer.end_span(span.success());
        tracer.record_event("123", "test event");
        // Should not panic or do anything
    }
}
