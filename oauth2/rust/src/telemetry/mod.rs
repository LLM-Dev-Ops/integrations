//! Telemetry
//!
//! Observability components for OAuth2 operations.
//!
//! This module provides:
//!
//! - **Metrics**: Counter, gauge, and histogram metrics
//! - **Tracing**: Distributed tracing with spans
//! - **Logging**: Structured logging with context

pub mod logging;
pub mod metrics;
pub mod tracing;

// Metrics
pub use metrics::{
    create_in_memory_metrics, no_op_metrics, Counter, Gauge, Histogram, InMemoryMetrics,
    MetricEntry, MetricLabels, NoOpMetrics, OAuth2Metrics,
};

// Tracing
pub use tracing::{
    create_in_memory_tracer, no_op_tracer, InMemorySpan, InMemoryTracer, NoOpSpan, NoOpTracer,
    OAuth2SpanAttributes, OAuth2SpanNames, Span, SpanAttributes, SpanStatus, Tracer,
};

// Logging
pub use logging::{
    create_console_logger, create_in_memory_logger, no_op_logger, ConsoleLogger, InMemoryLogger,
    LogEntry, LogLevel, Logger, NoOpLogger, OAuth2LogContext,
};
