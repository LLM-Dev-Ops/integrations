//! Distributed tracing support for the Mistral client.

use std::collections::HashMap;
use std::time::Instant;

/// Tracing configuration.
#[derive(Debug, Clone)]
pub struct TracingConfig {
    /// Whether tracing is enabled.
    pub enabled: bool,
    /// Service name for traces.
    pub service_name: String,
    /// Whether to include request bodies in traces.
    pub include_request_body: bool,
    /// Whether to include response bodies in traces.
    pub include_response_body: bool,
    /// Maximum body size to include (bytes).
    pub max_body_size: usize,
    /// Custom attributes to add to all spans.
    pub custom_attributes: HashMap<String, String>,
}

impl Default for TracingConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            service_name: "mistral-client".to_string(),
            include_request_body: false,
            include_response_body: false,
            max_body_size: 1024,
            custom_attributes: HashMap::new(),
        }
    }
}

impl TracingConfig {
    /// Creates a new tracing configuration.
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates a builder for tracing configuration.
    pub fn builder() -> TracingConfigBuilder {
        TracingConfigBuilder::default()
    }

    /// Disables tracing.
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            ..Default::default()
        }
    }
}

/// Builder for tracing configuration.
#[derive(Default)]
pub struct TracingConfigBuilder {
    config: TracingConfig,
}

impl TracingConfigBuilder {
    /// Sets the service name.
    pub fn service_name(mut self, name: impl Into<String>) -> Self {
        self.config.service_name = name.into();
        self
    }

    /// Enables including request bodies.
    pub fn include_request_body(mut self, include: bool) -> Self {
        self.config.include_request_body = include;
        self
    }

    /// Enables including response bodies.
    pub fn include_response_body(mut self, include: bool) -> Self {
        self.config.include_response_body = include;
        self
    }

    /// Sets the maximum body size to include.
    pub fn max_body_size(mut self, size: usize) -> Self {
        self.config.max_body_size = size;
        self
    }

    /// Adds a custom attribute.
    pub fn attribute(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.config.custom_attributes.insert(key.into(), value.into());
        self
    }

    /// Builds the configuration.
    pub fn build(self) -> TracingConfig {
        self.config
    }
}

/// A request span for tracing.
#[derive(Debug)]
pub struct RequestSpan {
    /// Span ID.
    pub span_id: String,
    /// Trace ID (for distributed tracing).
    pub trace_id: String,
    /// Parent span ID.
    pub parent_span_id: Option<String>,
    /// Operation name.
    pub operation: String,
    /// Start time.
    pub started_at: Instant,
    /// End time.
    pub ended_at: Option<Instant>,
    /// Span attributes.
    pub attributes: HashMap<String, String>,
    /// Child spans.
    pub children: Vec<RequestSpan>,
    /// Span status.
    pub status: SpanStatus,
}

/// Status of a span.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpanStatus {
    /// Span is unset.
    Unset,
    /// Span completed successfully.
    Ok,
    /// Span had an error.
    Error,
}

impl Default for SpanStatus {
    fn default() -> Self {
        Self::Unset
    }
}

impl RequestSpan {
    /// Creates a new request span.
    pub fn new(operation: impl Into<String>) -> Self {
        Self {
            span_id: generate_span_id(),
            trace_id: generate_trace_id(),
            parent_span_id: None,
            operation: operation.into(),
            started_at: Instant::now(),
            ended_at: None,
            attributes: HashMap::new(),
            children: Vec::new(),
            status: SpanStatus::Unset,
        }
    }

    /// Creates a child span.
    pub fn child(&self, operation: impl Into<String>) -> Self {
        Self {
            span_id: generate_span_id(),
            trace_id: self.trace_id.clone(),
            parent_span_id: Some(self.span_id.clone()),
            operation: operation.into(),
            started_at: Instant::now(),
            ended_at: None,
            attributes: HashMap::new(),
            children: Vec::new(),
            status: SpanStatus::Unset,
        }
    }

    /// Adds an attribute to the span.
    pub fn set_attribute(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.attributes.insert(key.into(), value.into());
    }

    /// Sets the span status to OK.
    pub fn set_ok(&mut self) {
        self.status = SpanStatus::Ok;
        self.ended_at = Some(Instant::now());
    }

    /// Sets the span status to Error.
    pub fn set_error(&mut self, message: impl Into<String>) {
        self.status = SpanStatus::Error;
        self.attributes.insert("error.message".to_string(), message.into());
        self.ended_at = Some(Instant::now());
    }

    /// Gets the duration of the span.
    pub fn duration(&self) -> Option<std::time::Duration> {
        self.ended_at.map(|end| end.duration_since(self.started_at))
    }

    /// Ends the span.
    pub fn end(&mut self) {
        if self.ended_at.is_none() {
            self.ended_at = Some(Instant::now());
        }
        if self.status == SpanStatus::Unset {
            self.status = SpanStatus::Ok;
        }
    }
}

/// Generates a random span ID.
fn generate_span_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:016x}", nanos & 0xFFFFFFFFFFFFFFFF)
}

/// Generates a random trace ID.
fn generate_trace_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:032x}", nanos)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracing_config_builder() {
        let config = TracingConfig::builder()
            .service_name("my-service")
            .include_request_body(true)
            .max_body_size(2048)
            .attribute("env", "production")
            .build();

        assert_eq!(config.service_name, "my-service");
        assert!(config.include_request_body);
        assert_eq!(config.max_body_size, 2048);
        assert_eq!(
            config.custom_attributes.get("env"),
            Some(&"production".to_string())
        );
    }

    #[test]
    fn test_request_span_creation() {
        let span = RequestSpan::new("chat.completion");
        assert_eq!(span.operation, "chat.completion");
        assert!(span.parent_span_id.is_none());
        assert_eq!(span.status, SpanStatus::Unset);
    }

    #[test]
    fn test_child_span() {
        let parent = RequestSpan::new("chat.completion");
        let child = parent.child("http.request");

        assert_eq!(child.trace_id, parent.trace_id);
        assert_eq!(child.parent_span_id, Some(parent.span_id.clone()));
    }

    #[test]
    fn test_span_status() {
        let mut span = RequestSpan::new("test");

        span.set_ok();
        assert_eq!(span.status, SpanStatus::Ok);
        assert!(span.ended_at.is_some());

        let mut error_span = RequestSpan::new("error_test");
        error_span.set_error("Something went wrong");
        assert_eq!(error_span.status, SpanStatus::Error);
        assert_eq!(
            error_span.attributes.get("error.message"),
            Some(&"Something went wrong".to_string())
        );
    }

    #[test]
    fn test_span_duration() {
        let mut span = RequestSpan::new("test");
        std::thread::sleep(std::time::Duration::from_millis(10));
        span.end();

        let duration = span.duration().unwrap();
        assert!(duration >= std::time::Duration::from_millis(10));
    }
}
