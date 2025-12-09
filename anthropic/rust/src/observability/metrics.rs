//! Metrics collection for API usage tracking.
//!
//! This module provides metrics collection capabilities including counters, histograms,
//! and gauges with support for labels.

use std::sync::atomic::{AtomicU64, Ordering};
use std::collections::HashMap;
use parking_lot::RwLock;

/// Metrics collector for tracking API usage.
///
/// Implementations of this trait are responsible for collecting and storing metrics
/// data such as counters, histograms, and gauges.
pub trait MetricsCollector: Send + Sync {
    /// Increments a counter by the given value.
    ///
    /// # Arguments
    ///
    /// * `name` - The name of the counter
    /// * `value` - The value to add to the counter
    /// * `labels` - Optional key-value labels for the metric
    fn increment_counter(&self, name: &str, value: u64, labels: &[(&str, &str)]);

    /// Records a value in a histogram.
    ///
    /// # Arguments
    ///
    /// * `name` - The name of the histogram
    /// * `value` - The value to record
    /// * `labels` - Optional key-value labels for the metric
    fn record_histogram(&self, name: &str, value: f64, labels: &[(&str, &str)]);

    /// Sets a gauge to the given value.
    ///
    /// # Arguments
    ///
    /// * `name` - The name of the gauge
    /// * `value` - The value to set
    /// * `labels` - Optional key-value labels for the metric
    fn set_gauge(&self, name: &str, value: f64, labels: &[(&str, &str)]);
}

/// In-memory metrics collector for testing and simple use cases.
///
/// This collector stores all metrics in memory using thread-safe data structures.
/// It's useful for testing, development, or applications that don't need persistent
/// metrics storage.
#[derive(Default)]
pub struct InMemoryMetricsCollector {
    counters: RwLock<HashMap<String, AtomicU64>>,
    histograms: RwLock<HashMap<String, Vec<f64>>>,
    gauges: RwLock<HashMap<String, f64>>,
}

impl InMemoryMetricsCollector {
    /// Creates a new in-memory metrics collector.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{InMemoryMetricsCollector, MetricsCollector};
    ///
    /// let collector = InMemoryMetricsCollector::new();
    /// collector.increment_counter("requests", 1, &[]);
    /// assert_eq!(collector.get_counter("requests"), 1);
    /// ```
    pub fn new() -> Self {
        Self::default()
    }

    /// Gets the current value of a counter.
    ///
    /// Returns 0 if the counter doesn't exist.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{InMemoryMetricsCollector, MetricsCollector};
    ///
    /// let collector = InMemoryMetricsCollector::new();
    /// collector.increment_counter("requests", 5, &[]);
    /// assert_eq!(collector.get_counter("requests"), 5);
    /// ```
    pub fn get_counter(&self, name: &str) -> u64 {
        self.counters
            .read()
            .get(name)
            .map(|c| c.load(Ordering::Relaxed))
            .unwrap_or(0)
    }

    /// Gets all recorded values for a histogram.
    ///
    /// Returns an empty vector if the histogram doesn't exist.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{InMemoryMetricsCollector, MetricsCollector};
    ///
    /// let collector = InMemoryMetricsCollector::new();
    /// collector.record_histogram("latency", 100.0, &[]);
    /// collector.record_histogram("latency", 200.0, &[]);
    /// let values = collector.get_histogram("latency");
    /// assert_eq!(values.len(), 2);
    /// ```
    pub fn get_histogram(&self, name: &str) -> Vec<f64> {
        self.histograms
            .read()
            .get(name)
            .cloned()
            .unwrap_or_default()
    }

    /// Gets the current value of a gauge.
    ///
    /// Returns None if the gauge doesn't exist.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{InMemoryMetricsCollector, MetricsCollector};
    ///
    /// let collector = InMemoryMetricsCollector::new();
    /// collector.set_gauge("queue_size", 42.0, &[]);
    /// assert_eq!(collector.get_gauge("queue_size"), Some(42.0));
    /// ```
    pub fn get_gauge(&self, name: &str) -> Option<f64> {
        self.gauges.read().get(name).copied()
    }

    /// Resets all metrics.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{InMemoryMetricsCollector, MetricsCollector};
    ///
    /// let collector = InMemoryMetricsCollector::new();
    /// collector.increment_counter("requests", 5, &[]);
    /// collector.reset();
    /// assert_eq!(collector.get_counter("requests"), 0);
    /// ```
    pub fn reset(&self) {
        self.counters.write().clear();
        self.histograms.write().clear();
        self.gauges.write().clear();
    }

    fn make_key(name: &str, labels: &[(&str, &str)]) -> String {
        if labels.is_empty() {
            name.to_string()
        } else {
            let label_str: Vec<String> = labels
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect();
            format!("{}:{}", name, label_str.join(","))
        }
    }
}

impl MetricsCollector for InMemoryMetricsCollector {
    fn increment_counter(&self, name: &str, value: u64, labels: &[(&str, &str)]) {
        let key = Self::make_key(name, labels);
        let mut counters = self.counters.write();
        counters
            .entry(key)
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(value, Ordering::Relaxed);
    }

    fn record_histogram(&self, name: &str, value: f64, labels: &[(&str, &str)]) {
        let key = Self::make_key(name, labels);
        let mut histograms = self.histograms.write();
        histograms.entry(key).or_default().push(value);
    }

    fn set_gauge(&self, name: &str, value: f64, labels: &[(&str, &str)]) {
        let key = Self::make_key(name, labels);
        let mut gauges = self.gauges.write();
        gauges.insert(key, value);
    }
}

/// No-op metrics collector.
///
/// This collector discards all metrics. Useful for testing or when metrics
/// collection is not needed.
pub struct NoopMetricsCollector;

impl MetricsCollector for NoopMetricsCollector {
    fn increment_counter(&self, _name: &str, _value: u64, _labels: &[(&str, &str)]) {}
    fn record_histogram(&self, _name: &str, _value: f64, _labels: &[(&str, &str)]) {}
    fn set_gauge(&self, _name: &str, _value: f64, _labels: &[(&str, &str)]) {}
}

/// Pre-defined metric names for common Anthropic API operations.
///
/// These constants provide standardized metric names for consistent monitoring
/// across applications.
pub mod metric_names {
    /// Total number of API requests made
    pub const REQUEST_COUNT: &str = "anthropic.requests.total";

    /// Duration of API requests in milliseconds
    pub const REQUEST_DURATION_MS: &str = "anthropic.requests.duration_ms";

    /// Total number of request errors
    pub const REQUEST_ERRORS: &str = "anthropic.requests.errors";

    /// Number of input tokens used
    pub const TOKENS_INPUT: &str = "anthropic.tokens.input";

    /// Number of output tokens generated
    pub const TOKENS_OUTPUT: &str = "anthropic.tokens.output";

    /// Number of times rate limits were hit
    pub const RATE_LIMIT_HITS: &str = "anthropic.rate_limit.hits";

    /// Current state of the circuit breaker (0=closed, 1=open, 2=half-open)
    pub const CIRCUIT_BREAKER_STATE: &str = "anthropic.circuit_breaker.state";

    /// Number of retry attempts made
    pub const RETRY_ATTEMPTS: &str = "anthropic.retry.attempts";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_in_memory_collector_counter() {
        let collector = InMemoryMetricsCollector::new();

        collector.increment_counter("test", 1, &[]);
        assert_eq!(collector.get_counter("test"), 1);

        collector.increment_counter("test", 5, &[]);
        assert_eq!(collector.get_counter("test"), 6);
    }

    #[test]
    fn test_in_memory_collector_counter_with_labels() {
        let collector = InMemoryMetricsCollector::new();

        collector.increment_counter("requests", 1, &[("status", "200")]);
        collector.increment_counter("requests", 1, &[("status", "404")]);
        collector.increment_counter("requests", 2, &[("status", "200")]);

        assert_eq!(collector.get_counter("requests:status=200"), 3);
        assert_eq!(collector.get_counter("requests:status=404"), 1);
    }

    #[test]
    fn test_in_memory_collector_histogram() {
        let collector = InMemoryMetricsCollector::new();

        collector.record_histogram("latency", 100.0, &[]);
        collector.record_histogram("latency", 200.0, &[]);
        collector.record_histogram("latency", 150.0, &[]);

        let values = collector.get_histogram("latency");
        assert_eq!(values.len(), 3);
        assert_eq!(values, vec![100.0, 200.0, 150.0]);
    }

    #[test]
    fn test_in_memory_collector_histogram_with_labels() {
        let collector = InMemoryMetricsCollector::new();

        collector.record_histogram("latency", 100.0, &[("endpoint", "messages")]);
        collector.record_histogram("latency", 200.0, &[("endpoint", "models")]);

        let messages_values = collector.get_histogram("latency:endpoint=messages");
        let models_values = collector.get_histogram("latency:endpoint=models");

        assert_eq!(messages_values, vec![100.0]);
        assert_eq!(models_values, vec![200.0]);
    }

    #[test]
    fn test_in_memory_collector_gauge() {
        let collector = InMemoryMetricsCollector::new();

        collector.set_gauge("queue_size", 42.0, &[]);
        assert_eq!(collector.get_gauge("queue_size"), Some(42.0));

        collector.set_gauge("queue_size", 10.0, &[]);
        assert_eq!(collector.get_gauge("queue_size"), Some(10.0));
    }

    #[test]
    fn test_in_memory_collector_gauge_with_labels() {
        let collector = InMemoryMetricsCollector::new();

        collector.set_gauge("queue_size", 42.0, &[("queue", "high_priority")]);
        collector.set_gauge("queue_size", 10.0, &[("queue", "low_priority")]);

        assert_eq!(collector.get_gauge("queue_size:queue=high_priority"), Some(42.0));
        assert_eq!(collector.get_gauge("queue_size:queue=low_priority"), Some(10.0));
    }

    #[test]
    fn test_in_memory_collector_nonexistent_metrics() {
        let collector = InMemoryMetricsCollector::new();

        assert_eq!(collector.get_counter("nonexistent"), 0);
        assert_eq!(collector.get_histogram("nonexistent"), Vec::<f64>::new());
        assert_eq!(collector.get_gauge("nonexistent"), None);
    }

    #[test]
    fn test_in_memory_collector_reset() {
        let collector = InMemoryMetricsCollector::new();

        collector.increment_counter("test", 5, &[]);
        collector.record_histogram("latency", 100.0, &[]);
        collector.set_gauge("queue_size", 42.0, &[]);

        collector.reset();

        assert_eq!(collector.get_counter("test"), 0);
        assert_eq!(collector.get_histogram("latency"), Vec::<f64>::new());
        assert_eq!(collector.get_gauge("queue_size"), None);
    }

    #[test]
    fn test_make_key_no_labels() {
        let key = InMemoryMetricsCollector::make_key("test", &[]);
        assert_eq!(key, "test");
    }

    #[test]
    fn test_make_key_with_labels() {
        let key = InMemoryMetricsCollector::make_key("test", &[("k1", "v1"), ("k2", "v2")]);
        assert_eq!(key, "test:k1=v1,k2=v2");
    }

    #[test]
    fn test_noop_collector() {
        let collector = NoopMetricsCollector;

        // Should not panic
        collector.increment_counter("test", 1, &[]);
        collector.record_histogram("test", 1.0, &[]);
        collector.set_gauge("test", 1.0, &[]);
    }

    #[test]
    fn test_metric_names_constants() {
        assert_eq!(metric_names::REQUEST_COUNT, "anthropic.requests.total");
        assert_eq!(metric_names::REQUEST_DURATION_MS, "anthropic.requests.duration_ms");
        assert_eq!(metric_names::REQUEST_ERRORS, "anthropic.requests.errors");
        assert_eq!(metric_names::TOKENS_INPUT, "anthropic.tokens.input");
        assert_eq!(metric_names::TOKENS_OUTPUT, "anthropic.tokens.output");
        assert_eq!(metric_names::RATE_LIMIT_HITS, "anthropic.rate_limit.hits");
        assert_eq!(metric_names::CIRCUIT_BREAKER_STATE, "anthropic.circuit_breaker.state");
        assert_eq!(metric_names::RETRY_ATTEMPTS, "anthropic.retry.attempts");
    }

    #[test]
    fn test_concurrent_counter_increments() {
        use std::sync::Arc;
        use std::thread;

        let collector = Arc::new(InMemoryMetricsCollector::new());
        let mut handles = vec![];

        for _ in 0..10 {
            let collector_clone = Arc::clone(&collector);
            let handle = thread::spawn(move || {
                for _ in 0..100 {
                    collector_clone.increment_counter("concurrent", 1, &[]);
                }
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(collector.get_counter("concurrent"), 1000);
    }

    #[test]
    fn test_histogram_statistics() {
        let collector = InMemoryMetricsCollector::new();

        let values = vec![10.0, 20.0, 30.0, 40.0, 50.0];
        for value in &values {
            collector.record_histogram("test", *value, &[]);
        }

        let recorded = collector.get_histogram("test");
        assert_eq!(recorded.len(), 5);

        let sum: f64 = recorded.iter().sum();
        let avg = sum / recorded.len() as f64;
        assert_eq!(avg, 30.0);
    }
}
