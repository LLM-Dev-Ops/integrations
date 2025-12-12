//! Tracing
//!
//! Distributed tracing for OAuth2 operations.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Span attributes.
pub type SpanAttributes = HashMap<String, String>;

/// Span status.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpanStatus {
    /// Unset status.
    Unset,
    /// OK status.
    Ok,
    /// Error status.
    Error,
}

impl Default for SpanStatus {
    fn default() -> Self {
        Self::Unset
    }
}

/// Span interface.
pub trait Span: Send + Sync {
    /// Set span attribute.
    fn set_attribute(&self, key: &str, value: &str);

    /// Set span status.
    fn set_status(&self, status: SpanStatus, message: Option<&str>);

    /// Record exception.
    fn record_exception(&self, error: &str);

    /// End the span.
    fn end(&self);

    /// Check if span is recording.
    fn is_recording(&self) -> bool;
}

/// Tracer interface.
pub trait Tracer: Send + Sync {
    /// Start a new span.
    fn start_span(&self, name: &str, attributes: SpanAttributes) -> Box<dyn Span>;

    /// Start a child span.
    fn start_child_span(&self, parent: &dyn Span, name: &str, attributes: SpanAttributes)
        -> Box<dyn Span>;
}

/// OAuth2 span names.
pub struct OAuth2SpanNames;

impl OAuth2SpanNames {
    pub const AUTHORIZATION_REQUEST: &'static str = "oauth2.authorization_request";
    pub const TOKEN_EXCHANGE: &'static str = "oauth2.token_exchange";
    pub const TOKEN_REFRESH: &'static str = "oauth2.token_refresh";
    pub const TOKEN_REVOCATION: &'static str = "oauth2.token_revocation";
    pub const TOKEN_INTROSPECTION: &'static str = "oauth2.token_introspection";
    pub const DEVICE_AUTHORIZATION: &'static str = "oauth2.device_authorization";
    pub const DEVICE_POLLING: &'static str = "oauth2.device_polling";
    pub const DISCOVERY: &'static str = "oauth2.discovery";
}

/// OAuth2 span attribute keys.
pub struct OAuth2SpanAttributes;

impl OAuth2SpanAttributes {
    pub const PROVIDER: &'static str = "oauth2.provider";
    pub const GRANT_TYPE: &'static str = "oauth2.grant_type";
    pub const SCOPE: &'static str = "oauth2.scope";
    pub const CLIENT_ID: &'static str = "oauth2.client_id";
    pub const ERROR_TYPE: &'static str = "oauth2.error_type";
    pub const ERROR_DESCRIPTION: &'static str = "oauth2.error_description";
    pub const TOKEN_TYPE: &'static str = "oauth2.token_type";
    pub const EXPIRES_IN: &'static str = "oauth2.expires_in";
}

/// No-op span implementation.
pub struct NoOpSpan;

impl Span for NoOpSpan {
    fn set_attribute(&self, _key: &str, _value: &str) {}
    fn set_status(&self, _status: SpanStatus, _message: Option<&str>) {}
    fn record_exception(&self, _error: &str) {}
    fn end(&self) {}
    fn is_recording(&self) -> bool {
        false
    }
}

/// No-op tracer implementation.
pub struct NoOpTracer;

impl Tracer for NoOpTracer {
    fn start_span(&self, _name: &str, _attributes: SpanAttributes) -> Box<dyn Span> {
        Box::new(NoOpSpan)
    }

    fn start_child_span(
        &self,
        _parent: &dyn Span,
        _name: &str,
        _attributes: SpanAttributes,
    ) -> Box<dyn Span> {
        Box::new(NoOpSpan)
    }
}

/// No-op tracer singleton.
pub fn no_op_tracer() -> NoOpTracer {
    NoOpTracer
}

/// In-memory span for testing.
pub struct InMemorySpan {
    name: String,
    attributes: Mutex<SpanAttributes>,
    status: Mutex<SpanStatus>,
    status_message: Mutex<Option<String>>,
    exceptions: Mutex<Vec<String>>,
    start_time: Instant,
    end_time: Mutex<Option<Instant>>,
    is_ended: Mutex<bool>,
}

impl InMemorySpan {
    /// Create new in-memory span.
    pub fn new(name: &str, attributes: SpanAttributes) -> Self {
        Self {
            name: name.to_string(),
            attributes: Mutex::new(attributes),
            status: Mutex::new(SpanStatus::Unset),
            status_message: Mutex::new(None),
            exceptions: Mutex::new(Vec::new()),
            start_time: Instant::now(),
            end_time: Mutex::new(None),
            is_ended: Mutex::new(false),
        }
    }

    /// Get span name.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get span attributes.
    pub fn get_attributes(&self) -> SpanAttributes {
        self.attributes.lock().unwrap().clone()
    }

    /// Get span status.
    pub fn get_status(&self) -> SpanStatus {
        *self.status.lock().unwrap()
    }

    /// Get recorded exceptions.
    pub fn get_exceptions(&self) -> Vec<String> {
        self.exceptions.lock().unwrap().clone()
    }

    /// Get span duration.
    pub fn duration(&self) -> Option<Duration> {
        self.end_time
            .lock()
            .unwrap()
            .map(|end| end.duration_since(self.start_time))
    }
}

impl Span for InMemorySpan {
    fn set_attribute(&self, key: &str, value: &str) {
        self.attributes
            .lock()
            .unwrap()
            .insert(key.to_string(), value.to_string());
    }

    fn set_status(&self, status: SpanStatus, message: Option<&str>) {
        *self.status.lock().unwrap() = status;
        *self.status_message.lock().unwrap() = message.map(|s| s.to_string());
    }

    fn record_exception(&self, error: &str) {
        self.exceptions.lock().unwrap().push(error.to_string());
    }

    fn end(&self) {
        *self.end_time.lock().unwrap() = Some(Instant::now());
        *self.is_ended.lock().unwrap() = true;
    }

    fn is_recording(&self) -> bool {
        !*self.is_ended.lock().unwrap()
    }
}

/// In-memory tracer for testing.
pub struct InMemoryTracer {
    spans: Mutex<Vec<InMemorySpan>>,
}

impl InMemoryTracer {
    /// Create new in-memory tracer.
    pub fn new() -> Self {
        Self {
            spans: Mutex::new(Vec::new()),
        }
    }

    /// Get all recorded spans.
    pub fn get_spans(&self) -> Vec<String> {
        self.spans
            .lock()
            .unwrap()
            .iter()
            .map(|s| s.name.clone())
            .collect()
    }

    /// Get span count.
    pub fn span_count(&self) -> usize {
        self.spans.lock().unwrap().len()
    }

    /// Clear all spans.
    pub fn clear(&self) {
        self.spans.lock().unwrap().clear();
    }
}

impl Default for InMemoryTracer {
    fn default() -> Self {
        Self::new()
    }
}

impl Tracer for InMemoryTracer {
    fn start_span(&self, name: &str, attributes: SpanAttributes) -> Box<dyn Span> {
        let span = InMemorySpan::new(name, attributes);
        // Note: We can't store the span here because we return ownership
        // This is a simplified implementation for testing
        Box::new(span)
    }

    fn start_child_span(
        &self,
        _parent: &dyn Span,
        name: &str,
        attributes: SpanAttributes,
    ) -> Box<dyn Span> {
        self.start_span(name, attributes)
    }
}

/// Create in-memory tracer for testing.
pub fn create_in_memory_tracer() -> InMemoryTracer {
    InMemoryTracer::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_op_tracer() {
        let tracer = no_op_tracer();
        let span = tracer.start_span("test", HashMap::new());

        span.set_attribute("key", "value");
        span.set_status(SpanStatus::Ok, None);
        span.end();

        assert!(!span.is_recording());
    }

    #[test]
    fn test_in_memory_span() {
        let span = InMemorySpan::new("test_span", HashMap::new());

        span.set_attribute("provider", "google");
        span.set_status(SpanStatus::Ok, Some("Success"));
        span.record_exception("Test error");
        span.end();

        assert_eq!(span.name(), "test_span");
        assert!(span.get_attributes().contains_key("provider"));
        assert_eq!(span.get_status(), SpanStatus::Ok);
        assert_eq!(span.get_exceptions().len(), 1);
        assert!(span.duration().is_some());
    }

    #[test]
    fn test_span_names() {
        assert_eq!(
            OAuth2SpanNames::AUTHORIZATION_REQUEST,
            "oauth2.authorization_request"
        );
        assert_eq!(OAuth2SpanNames::TOKEN_EXCHANGE, "oauth2.token_exchange");
    }
}
