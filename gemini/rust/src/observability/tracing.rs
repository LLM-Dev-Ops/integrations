//! Distributed tracing implementation for the Gemini API client.
//!
//! Provides trait-based tracing with span management and attribute tracking.

use std::collections::HashMap;
use std::time::Instant;

/// Tracer trait for creating and managing spans.
///
/// This trait provides methods for creating spans to track operations
/// throughout the request lifecycle.
pub trait Tracer: Send + Sync {
    /// Start a new span with the given name.
    ///
    /// # Arguments
    /// * `name` - The span name (e.g., "gemini.content.generate")
    ///
    /// # Returns
    /// A boxed Span trait object that can be used to add attributes and mark completion.
    fn start_span(&self, name: &str) -> Box<dyn Span>;
}

/// Span trait representing a traced operation.
///
/// Spans track the duration and context of operations. They can have
/// attributes attached and are marked with a status on completion.
pub trait Span: Send {
    /// Set an attribute on the span.
    ///
    /// # Arguments
    /// * `key` - The attribute key
    /// * `value` - The attribute value
    fn set_attribute(&mut self, key: &str, value: &str);

    /// Set the span status.
    ///
    /// # Arguments
    /// * `status` - The span status (Ok or Error with message)
    fn set_status(&mut self, status: SpanStatus);

    /// Record an event on the span.
    ///
    /// # Arguments
    /// * `name` - The event name
    /// * `attributes` - Optional attributes for the event
    fn add_event(&mut self, name: &str, attributes: Option<HashMap<String, String>>);

    /// End the span and record its duration.
    ///
    /// This consumes the span and should be called when the operation completes.
    fn end(self: Box<Self>);
}

/// Status of a span.
#[derive(Debug, Clone)]
pub enum SpanStatus {
    /// Operation completed successfully.
    Ok,
    /// Operation failed with an error message.
    Error(String),
}

/// Tracing-based tracer implementation.
///
/// This tracer integrates with the tracing crate and emits structured
/// span events.
pub struct TracingTracer {
    service_name: String,
}

impl TracingTracer {
    /// Create a new tracing tracer.
    ///
    /// # Arguments
    /// * `service_name` - The service name to include in spans
    pub fn new(service_name: &str) -> Self {
        Self {
            service_name: service_name.to_string(),
        }
    }
}

impl Tracer for TracingTracer {
    fn start_span(&self, name: &str) -> Box<dyn Span> {
        let span = TracingSpan {
            name: name.to_string(),
            service_name: self.service_name.clone(),
            start: Instant::now(),
            attributes: HashMap::new(),
            events: Vec::new(),
            status: None,
        };

        tracing::debug!(
            service = %self.service_name,
            span_name = %name,
            "Span started"
        );

        Box::new(span)
    }
}

/// Span implementation using the tracing crate.
pub struct TracingSpan {
    name: String,
    service_name: String,
    start: Instant,
    attributes: HashMap<String, String>,
    events: Vec<SpanEvent>,
    status: Option<SpanStatus>,
}

struct SpanEvent {
    name: String,
    attributes: HashMap<String, String>,
}

impl Span for TracingSpan {
    fn set_attribute(&mut self, key: &str, value: &str) {
        self.attributes.insert(key.to_string(), value.to_string());

        tracing::trace!(
            span_name = %self.name,
            attribute_key = %key,
            attribute_value = %value,
            "Span attribute set"
        );
    }

    fn set_status(&mut self, status: SpanStatus) {
        match &status {
            SpanStatus::Ok => {
                tracing::debug!(
                    span_name = %self.name,
                    "Span completed successfully"
                );
            }
            SpanStatus::Error(msg) => {
                tracing::error!(
                    span_name = %self.name,
                    error = %msg,
                    "Span failed"
                );
            }
        }
        self.status = Some(status);
    }

    fn add_event(&mut self, name: &str, attributes: Option<HashMap<String, String>>) {
        let attrs = attributes.unwrap_or_default();

        tracing::debug!(
            span_name = %self.name,
            event_name = %name,
            event_attributes = ?attrs,
            "Span event recorded"
        );

        self.events.push(SpanEvent {
            name: name.to_string(),
            attributes: attrs,
        });
    }

    fn end(self: Box<Self>) {
        let duration = self.start.elapsed();
        let duration_ms = duration.as_millis();

        // Build attributes for the final span event
        let mut attrs: Vec<(&str, String)> = self.attributes
            .iter()
            .map(|(k, v)| (k.as_str(), v.clone()))
            .collect();

        let status_str = match &self.status {
            Some(SpanStatus::Ok) => "ok",
            Some(SpanStatus::Error(_)) => "error",
            None => "unknown",
        };

        tracing::info!(
            service = %self.service_name,
            span_name = %self.name,
            duration_ms = duration_ms,
            status = status_str,
            attributes = ?self.attributes,
            event_count = self.events.len(),
            "Span ended"
        );
    }
}

/// Default tracer implementation (no-op).
///
/// This tracer is suitable for environments where tracing is disabled.
pub struct DefaultTracer {
    _prefix: String,
}

impl DefaultTracer {
    /// Creates a new default tracer.
    pub fn new(prefix: impl Into<String>) -> Self {
        Self {
            _prefix: prefix.into(),
        }
    }
}

impl Tracer for DefaultTracer {
    fn start_span(&self, _name: &str) -> Box<dyn Span> {
        Box::new(NoOpSpan)
    }
}

/// No-op span implementation.
struct NoOpSpan;

impl Span for NoOpSpan {
    fn set_attribute(&mut self, _key: &str, _value: &str) {}
    fn set_status(&mut self, _status: SpanStatus) {}
    fn add_event(&mut self, _name: &str, _attributes: Option<HashMap<String, String>>) {}
    fn end(self: Box<Self>) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracing_tracer_creation() {
        let tracer = TracingTracer::new("test-service");
        assert_eq!(tracer.service_name, "test-service");
    }

    #[test]
    fn test_span_lifecycle() {
        let tracer = TracingTracer::new("test-service");
        let mut span = tracer.start_span("test.operation");

        span.set_attribute("model", "gemini-pro");
        span.set_attribute("request_id", "123");
        span.set_status(SpanStatus::Ok);

        // Verify attributes were set
        if let Some(tracing_span) = (span as Box<dyn std::any::Any>).downcast_ref::<TracingSpan>() {
            assert_eq!(tracing_span.attributes.get("model").unwrap(), "gemini-pro");
            assert_eq!(tracing_span.attributes.get("request_id").unwrap(), "123");
        }
    }

    #[test]
    fn test_span_with_events() {
        let tracer = TracingTracer::new("test-service");
        let mut span = tracer.start_span("test.operation");

        let mut event_attrs = HashMap::new();
        event_attrs.insert("key".to_string(), "value".to_string());

        span.add_event("test.event", Some(event_attrs));
        span.set_status(SpanStatus::Ok);
    }

    #[test]
    fn test_span_status_error() {
        let tracer = TracingTracer::new("test-service");
        let mut span = tracer.start_span("test.operation");

        span.set_status(SpanStatus::Error("Test error".to_string()));
    }

    #[test]
    fn test_default_tracer_noop() {
        let tracer = DefaultTracer::new("test");
        let mut span = tracer.start_span("test.operation");

        // These should not panic
        span.set_attribute("key", "value");
        span.set_status(SpanStatus::Ok);
        span.add_event("event", None);
        span.end();
    }
}
