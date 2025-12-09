//! Distributed tracing support for request lifecycle tracking.
//!
//! This module provides tracing capabilities to track the lifecycle of API requests
//! through the system, including timing, attributes, and hierarchical span relationships.

use std::time::{Duration, Instant};

/// Span for tracing request lifecycle.
///
/// A span represents a unit of work in a distributed system. It tracks the start time,
/// end time, status, and associated metadata for an operation.
#[derive(Debug, Clone)]
pub struct RequestSpan {
    /// Unique identifier for the entire trace
    pub trace_id: String,
    /// Unique identifier for this span
    pub span_id: String,
    /// Optional identifier for the parent span
    pub parent_span_id: Option<String>,
    /// Name of the operation being traced
    pub operation: String,
    /// When the span started
    pub start_time: Instant,
    /// When the span ended (None if still active)
    pub end_time: Option<Instant>,
    /// Key-value attributes associated with this span
    pub attributes: Vec<(String, String)>,
    /// Status of the span (Ok, Error, or Unset)
    pub status: SpanStatus,
}

/// Status of a span.
#[derive(Debug, Clone, PartialEq)]
pub enum SpanStatus {
    /// Span completed successfully
    Ok,
    /// Span completed with an error
    Error(String),
    /// Status not yet determined
    Unset,
}

impl RequestSpan {
    /// Creates a new span for the given operation.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::RequestSpan;
    ///
    /// let span = RequestSpan::new("api_request");
    /// assert_eq!(span.operation, "api_request");
    /// ```
    pub fn new(operation: impl Into<String>) -> Self {
        Self {
            trace_id: generate_trace_id(),
            span_id: generate_span_id(),
            parent_span_id: None,
            operation: operation.into(),
            start_time: Instant::now(),
            end_time: None,
            attributes: Vec::new(),
            status: SpanStatus::Unset,
        }
    }

    /// Sets the parent span ID for this span.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::RequestSpan;
    ///
    /// let parent = RequestSpan::new("parent");
    /// let child = RequestSpan::new("child")
    ///     .with_parent(parent.span_id.clone());
    /// assert_eq!(child.parent_span_id, Some(parent.span_id));
    /// ```
    pub fn with_parent(mut self, parent_span_id: impl Into<String>) -> Self {
        self.parent_span_id = Some(parent_span_id.into());
        self
    }

    /// Adds a key-value attribute to this span.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::RequestSpan;
    ///
    /// let span = RequestSpan::new("api_request")
    ///     .with_attribute("http.method", "POST")
    ///     .with_attribute("http.path", "/v1/messages");
    /// assert_eq!(span.attributes.len(), 2);
    /// ```
    pub fn with_attribute(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.attributes.push((key.into(), value.into()));
        self
    }

    /// Marks the span as finished with a successful status.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{RequestSpan, SpanStatus};
    ///
    /// let span = RequestSpan::new("api_request").finish();
    /// assert!(span.end_time.is_some());
    /// assert_eq!(span.status, SpanStatus::Unset);
    /// ```
    pub fn finish(mut self) -> Self {
        self.end_time = Some(Instant::now());
        self
    }

    /// Marks the span as finished with an error status.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{RequestSpan, SpanStatus};
    ///
    /// let span = RequestSpan::new("api_request")
    ///     .finish_with_error("Connection timeout");
    /// assert!(span.end_time.is_some());
    /// assert!(matches!(span.status, SpanStatus::Error(_)));
    /// ```
    pub fn finish_with_error(mut self, error: impl Into<String>) -> Self {
        self.end_time = Some(Instant::now());
        self.status = SpanStatus::Error(error.into());
        self
    }

    /// Marks the span as finished with a successful status.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{RequestSpan, SpanStatus};
    ///
    /// let span = RequestSpan::new("api_request").finish_with_ok();
    /// assert!(span.end_time.is_some());
    /// assert_eq!(span.status, SpanStatus::Ok);
    /// ```
    pub fn finish_with_ok(mut self) -> Self {
        self.end_time = Some(Instant::now());
        self.status = SpanStatus::Ok;
        self
    }

    /// Returns the duration of this span, if it has finished.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::RequestSpan;
    /// use std::thread;
    /// use std::time::Duration;
    ///
    /// let span = RequestSpan::new("api_request");
    /// thread::sleep(Duration::from_millis(10));
    /// let span = span.finish();
    ///
    /// let duration = span.duration().unwrap();
    /// assert!(duration >= Duration::from_millis(10));
    /// ```
    pub fn duration(&self) -> Option<Duration> {
        self.end_time.map(|end| end.duration_since(self.start_time))
    }
}

/// Tracer for creating and managing spans.
///
/// Implementations of this trait are responsible for creating spans and
/// recording them when they complete.
pub trait Tracer: Send + Sync {
    /// Starts a new span for the given operation.
    fn start_span(&self, operation: &str) -> RequestSpan;

    /// Records a completed span.
    fn end_span(&self, span: RequestSpan);
}

/// Default tracer that logs spans using the `tracing` crate.
///
/// This tracer creates spans and logs their start and completion using structured
/// logging at the DEBUG level.
pub struct DefaultTracer {
    service_name: String,
}

impl DefaultTracer {
    /// Creates a new default tracer with the given service name.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::DefaultTracer;
    ///
    /// let tracer = DefaultTracer::new("anthropic-client");
    /// ```
    pub fn new(service_name: impl Into<String>) -> Self {
        Self {
            service_name: service_name.into(),
        }
    }
}

impl Tracer for DefaultTracer {
    fn start_span(&self, operation: &str) -> RequestSpan {
        let span = RequestSpan::new(operation)
            .with_attribute("service.name", &self.service_name);
        tracing::debug!(
            trace_id = %span.trace_id,
            span_id = %span.span_id,
            operation = %operation,
            "Span started"
        );
        span
    }

    fn end_span(&self, span: RequestSpan) {
        let span = span.finish();
        let duration_ms = span.duration().map(|d| d.as_millis()).unwrap_or(0);
        tracing::debug!(
            trace_id = %span.trace_id,
            span_id = %span.span_id,
            operation = %span.operation,
            duration_ms = duration_ms,
            status = ?span.status,
            "Span ended"
        );
    }
}

/// No-op tracer for when tracing is disabled.
///
/// This tracer creates spans but does not record them. Useful for testing
/// or when observability is not needed.
pub struct NoopTracer;

impl Tracer for NoopTracer {
    fn start_span(&self, operation: &str) -> RequestSpan {
        RequestSpan::new(operation)
    }

    fn end_span(&self, _span: RequestSpan) {}
}

/// Generates a unique trace ID.
///
/// The trace ID is a 32-character hexadecimal string based on the current timestamp.
fn generate_trace_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:032x}", timestamp)
}

/// Generates a unique span ID.
///
/// The span ID is a 16-character hexadecimal string based on the current timestamp.
fn generate_span_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:016x}", timestamp & 0xFFFFFFFFFFFFFFFF)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_span_creation() {
        let span = RequestSpan::new("test_operation");
        assert_eq!(span.operation, "test_operation");
        assert_eq!(span.status, SpanStatus::Unset);
        assert!(span.end_time.is_none());
        assert!(span.parent_span_id.is_none());
        assert!(!span.trace_id.is_empty());
        assert!(!span.span_id.is_empty());
    }

    #[test]
    fn test_span_with_parent() {
        let parent = RequestSpan::new("parent");
        let child = RequestSpan::new("child").with_parent(parent.span_id.clone());
        assert_eq!(child.parent_span_id, Some(parent.span_id));
    }

    #[test]
    fn test_span_with_attributes() {
        let span = RequestSpan::new("test")
            .with_attribute("key1", "value1")
            .with_attribute("key2", "value2");
        assert_eq!(span.attributes.len(), 2);
        assert_eq!(span.attributes[0], ("key1".to_string(), "value1".to_string()));
        assert_eq!(span.attributes[1], ("key2".to_string(), "value2".to_string()));
    }

    #[test]
    fn test_span_finish() {
        let span = RequestSpan::new("test");
        assert!(span.end_time.is_none());
        let span = span.finish();
        assert!(span.end_time.is_some());
        assert_eq!(span.status, SpanStatus::Unset);
    }

    #[test]
    fn test_span_finish_with_ok() {
        let span = RequestSpan::new("test").finish_with_ok();
        assert!(span.end_time.is_some());
        assert_eq!(span.status, SpanStatus::Ok);
    }

    #[test]
    fn test_span_finish_with_error() {
        let span = RequestSpan::new("test").finish_with_error("test error");
        assert!(span.end_time.is_some());
        assert_eq!(span.status, SpanStatus::Error("test error".to_string()));
    }

    #[test]
    fn test_span_duration() {
        let span = RequestSpan::new("test");
        assert!(span.duration().is_none());

        thread::sleep(Duration::from_millis(10));
        let span = span.finish();

        let duration = span.duration().unwrap();
        assert!(duration >= Duration::from_millis(10));
        assert!(duration < Duration::from_millis(100));
    }

    #[test]
    fn test_generate_trace_id() {
        let id1 = generate_trace_id();
        let id2 = generate_trace_id();
        assert_eq!(id1.len(), 32);
        assert_eq!(id2.len(), 32);
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_generate_span_id() {
        let id1 = generate_span_id();
        let id2 = generate_span_id();
        assert_eq!(id1.len(), 16);
        assert_eq!(id2.len(), 16);
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_default_tracer_start_span() {
        let tracer = DefaultTracer::new("test-service");
        let span = tracer.start_span("test_operation");
        assert_eq!(span.operation, "test_operation");
        assert!(span.attributes.iter().any(|(k, v)| k == "service.name" && v == "test-service"));
    }

    #[test]
    fn test_default_tracer_end_span() {
        let tracer = DefaultTracer::new("test-service");
        let span = tracer.start_span("test_operation");
        thread::sleep(Duration::from_millis(10));
        tracer.end_span(span);
    }

    #[test]
    fn test_noop_tracer() {
        let tracer = NoopTracer;
        let span = tracer.start_span("test_operation");
        assert_eq!(span.operation, "test_operation");
        tracer.end_span(span);
    }

    #[test]
    fn test_span_status_equality() {
        assert_eq!(SpanStatus::Ok, SpanStatus::Ok);
        assert_eq!(SpanStatus::Unset, SpanStatus::Unset);
        assert_eq!(
            SpanStatus::Error("test".to_string()),
            SpanStatus::Error("test".to_string())
        );
        assert_ne!(
            SpanStatus::Error("test1".to_string()),
            SpanStatus::Error("test2".to_string())
        );
        assert_ne!(SpanStatus::Ok, SpanStatus::Unset);
    }
}
