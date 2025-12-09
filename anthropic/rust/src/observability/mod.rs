//! Observability module providing tracing, metrics, and logging capabilities.
//!
//! This module provides comprehensive observability features for monitoring and debugging
//! the Anthropic API client:
//!
//! - **Tracing**: Request lifecycle tracking with distributed tracing support
//! - **Metrics**: API usage metrics (counters, histograms, gauges)
//! - **Logging**: Structured logging with multiple formats
//!
//! ## Examples
//!
//! ```rust,no_run
//! use integrations_anthropic::observability::{
//!     DefaultTracer, Tracer, InMemoryMetricsCollector, MetricsCollector,
//!     LoggingConfig, LogLevel, LogFormat
//! };
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! // Initialize logging
//! LoggingConfig::new()
//!     .with_level(LogLevel::Info)
//!     .with_format(LogFormat::Pretty)
//!     .init()?;
//!
//! // Create tracer
//! let tracer = DefaultTracer::new("my-service");
//! let span = tracer.start_span("api_request");
//! // ... do work ...
//! tracer.end_span(span);
//!
//! // Create metrics collector
//! let metrics = InMemoryMetricsCollector::new();
//! metrics.increment_counter("requests", 1, &[("status", "200")]);
//! # Ok(())
//! # }
//! ```

mod tracing;
mod metrics;
mod logging;

#[cfg(test)]
mod tests;

pub use tracing::*;
pub use metrics::*;
pub use logging::*;
