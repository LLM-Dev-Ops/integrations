//! Observability module for the Groq client.
//!
//! Provides tracing, metrics, and logging support for monitoring
//! API requests and client performance.

mod logging;
mod metrics;

pub use logging::{LogConfig, LogLevel, Logger, ConsoleLogger, NoopLogger};
pub use metrics::{MetricsCollector, DefaultMetricsCollector, RequestMetrics};

use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{info_span, Instrument};

/// Observability configuration.
#[derive(Debug, Clone)]
pub struct ObservabilityConfig {
    /// Logging configuration.
    pub logging: LogConfig,
    /// Enable metrics collection.
    pub enable_metrics: bool,
    /// Enable distributed tracing.
    pub enable_tracing: bool,
}

impl Default for ObservabilityConfig {
    fn default() -> Self {
        Self {
            logging: LogConfig::default(),
            enable_metrics: true,
            enable_tracing: true,
        }
    }
}

/// Observability facade for instrumenting operations.
pub struct Observability {
    logger: Arc<dyn Logger>,
    metrics: Arc<dyn MetricsCollector>,
    config: ObservabilityConfig,
}

impl Observability {
    /// Creates a new observability facade.
    pub fn new(config: ObservabilityConfig) -> Self {
        Self {
            logger: Arc::new(ConsoleLogger::new(config.logging.clone())),
            metrics: Arc::new(DefaultMetricsCollector::new()),
            config,
        }
    }

    /// Creates with custom logger and metrics collector.
    pub fn with_components(
        logger: Arc<dyn Logger>,
        metrics: Arc<dyn MetricsCollector>,
        config: ObservabilityConfig,
    ) -> Self {
        Self {
            logger,
            metrics,
            config,
        }
    }

    /// Returns the logger.
    pub fn logger(&self) -> &Arc<dyn Logger> {
        &self.logger
    }

    /// Returns the metrics collector.
    pub fn metrics(&self) -> &Arc<dyn MetricsCollector> {
        &self.metrics
    }

    /// Records a successful request.
    pub fn record_success(&self, operation: &str, duration: Duration, model: Option<&str>) {
        if self.config.enable_metrics {
            self.metrics.record_request(operation, true, duration);
            if let Some(m) = model {
                self.metrics.record_model_usage(m);
            }
        }
    }

    /// Records a failed request.
    pub fn record_failure(&self, operation: &str, duration: Duration, error: &str) {
        if self.config.enable_metrics {
            self.metrics.record_request(operation, false, duration);
            self.metrics.record_error(error);
        }
    }

    /// Records latency.
    pub fn record_latency(&self, operation: &str, duration: Duration) {
        if self.config.enable_metrics {
            self.metrics.record_latency(operation, duration);
        }
    }

    /// Records token usage.
    pub fn record_tokens(&self, prompt_tokens: u32, completion_tokens: u32) {
        if self.config.enable_metrics {
            self.metrics.record_tokens(prompt_tokens, completion_tokens);
        }
    }
}

impl Default for Observability {
    fn default() -> Self {
        Self::new(ObservabilityConfig::default())
    }
}

impl std::fmt::Debug for Observability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Observability")
            .field("config", &self.config)
            .finish()
    }
}

/// Request timer for measuring operation duration.
pub struct RequestTimer {
    start: Instant,
    operation: String,
}

impl RequestTimer {
    /// Creates a new request timer.
    pub fn new(operation: impl Into<String>) -> Self {
        Self {
            start: Instant::now(),
            operation: operation.into(),
        }
    }

    /// Returns the elapsed time.
    pub fn elapsed(&self) -> Duration {
        self.start.elapsed()
    }

    /// Returns the operation name.
    pub fn operation(&self) -> &str {
        &self.operation
    }
}
