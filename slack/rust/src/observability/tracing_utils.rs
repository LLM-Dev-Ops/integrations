//! Tracing utilities for distributed tracing.

use std::collections::HashMap;
use tracing::{span, Level, Span};

/// Create a request span with common attributes
pub fn create_request_span(method: &str, endpoint: &str) -> Span {
    span!(
        Level::INFO,
        "slack_request",
        method = %method,
        endpoint = %endpoint,
        otel.kind = "client",
        otel.status_code = tracing::field::Empty,
        slack.request_id = tracing::field::Empty,
        slack.rate_limit_remaining = tracing::field::Empty,
    )
}

/// Record success on a span
pub fn record_success(span: &Span) {
    span.record("otel.status_code", "OK");
}

/// Record error on a span
pub fn record_error(span: &Span, error: &str) {
    span.record("otel.status_code", "ERROR");
    span.record("error.message", error);
}

/// Record rate limit info
pub fn record_rate_limit(span: &Span, remaining: i32) {
    span.record("slack.rate_limit_remaining", remaining);
}

/// Trace context for propagation
#[derive(Debug, Clone, Default)]
pub struct TraceContext {
    /// Trace ID
    pub trace_id: Option<String>,
    /// Span ID
    pub span_id: Option<String>,
    /// Trace flags
    pub trace_flags: Option<String>,
    /// Additional baggage
    pub baggage: HashMap<String, String>,
}

impl TraceContext {
    /// Create a new empty context
    pub fn new() -> Self {
        Self::default()
    }

    /// Create from W3C traceparent header
    pub fn from_traceparent(header: &str) -> Option<Self> {
        let parts: Vec<&str> = header.split('-').collect();
        if parts.len() >= 4 && parts[0] == "00" {
            Some(Self {
                trace_id: Some(parts[1].to_string()),
                span_id: Some(parts[2].to_string()),
                trace_flags: Some(parts[3].to_string()),
                baggage: HashMap::new(),
            })
        } else {
            None
        }
    }

    /// Convert to W3C traceparent header
    pub fn to_traceparent(&self) -> Option<String> {
        match (&self.trace_id, &self.span_id, &self.trace_flags) {
            (Some(trace_id), Some(span_id), Some(flags)) => {
                Some(format!("00-{}-{}-{}", trace_id, span_id, flags))
            }
            (Some(trace_id), Some(span_id), None) => {
                Some(format!("00-{}-{}-00", trace_id, span_id))
            }
            _ => None,
        }
    }

    /// Add baggage item
    pub fn with_baggage(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.baggage.insert(key.into(), value.into());
        self
    }
}

/// Request-scoped trace info
#[derive(Debug, Clone)]
pub struct RequestTrace {
    /// Start time
    pub start_time: std::time::Instant,
    /// Request ID
    pub request_id: String,
    /// Method name
    pub method: String,
    /// Endpoint
    pub endpoint: String,
}

impl RequestTrace {
    /// Create a new request trace
    pub fn new(method: impl Into<String>, endpoint: impl Into<String>) -> Self {
        Self {
            start_time: std::time::Instant::now(),
            request_id: uuid::Uuid::new_v4().to_string(),
            method: method.into(),
            endpoint: endpoint.into(),
        }
    }

    /// Get elapsed time
    pub fn elapsed(&self) -> std::time::Duration {
        self.start_time.elapsed()
    }

    /// Get elapsed milliseconds
    pub fn elapsed_ms(&self) -> u64 {
        self.elapsed().as_millis() as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trace_context_from_traceparent() {
        let header = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
        let ctx = TraceContext::from_traceparent(header).unwrap();

        assert_eq!(ctx.trace_id.as_deref(), Some("0af7651916cd43dd8448eb211c80319c"));
        assert_eq!(ctx.span_id.as_deref(), Some("b7ad6b7169203331"));
        assert_eq!(ctx.trace_flags.as_deref(), Some("01"));
    }

    #[test]
    fn test_trace_context_to_traceparent() {
        let ctx = TraceContext {
            trace_id: Some("0af7651916cd43dd8448eb211c80319c".to_string()),
            span_id: Some("b7ad6b7169203331".to_string()),
            trace_flags: Some("01".to_string()),
            baggage: HashMap::new(),
        };

        let header = ctx.to_traceparent().unwrap();
        assert_eq!(header, "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    }

    #[test]
    fn test_request_trace() {
        let trace = RequestTrace::new("POST", "chat.postMessage");
        assert!(!trace.request_id.is_empty());
        assert_eq!(trace.method, "POST");
        assert_eq!(trace.endpoint, "chat.postMessage");
    }
}
