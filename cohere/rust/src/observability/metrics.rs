//! Metrics collection for the Cohere client.

use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// A counter metric
#[derive(Debug)]
pub struct Counter {
    name: String,
    value: AtomicU64,
    labels: HashMap<String, String>,
}

impl Counter {
    /// Create a new counter
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            value: AtomicU64::new(0),
            labels: HashMap::new(),
        }
    }

    /// Create a counter with labels
    pub fn with_labels(name: impl Into<String>, labels: HashMap<String, String>) -> Self {
        Self {
            name: name.into(),
            value: AtomicU64::new(0),
            labels,
        }
    }

    /// Increment the counter
    pub fn inc(&self) {
        self.value.fetch_add(1, Ordering::Relaxed);
    }

    /// Add a value to the counter
    pub fn add(&self, value: u64) {
        self.value.fetch_add(value, Ordering::Relaxed);
    }

    /// Get the current value
    pub fn get(&self) -> u64 {
        self.value.load(Ordering::Relaxed)
    }

    /// Get the name
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the labels
    pub fn labels(&self) -> &HashMap<String, String> {
        &self.labels
    }
}

/// A gauge metric
#[derive(Debug)]
pub struct Gauge {
    name: String,
    value: AtomicU64,
    labels: HashMap<String, String>,
}

impl Gauge {
    /// Create a new gauge
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            value: AtomicU64::new(0),
            labels: HashMap::new(),
        }
    }

    /// Create a gauge with labels
    pub fn with_labels(name: impl Into<String>, labels: HashMap<String, String>) -> Self {
        Self {
            name: name.into(),
            value: AtomicU64::new(0),
            labels,
        }
    }

    /// Set the gauge value
    pub fn set(&self, value: u64) {
        self.value.store(value, Ordering::Relaxed);
    }

    /// Increment the gauge
    pub fn inc(&self) {
        self.value.fetch_add(1, Ordering::Relaxed);
    }

    /// Decrement the gauge
    pub fn dec(&self) {
        self.value.fetch_sub(1, Ordering::Relaxed);
    }

    /// Get the current value
    pub fn get(&self) -> u64 {
        self.value.load(Ordering::Relaxed)
    }

    /// Get the name
    pub fn name(&self) -> &str {
        &self.name
    }
}

/// A histogram metric for tracking distributions
#[derive(Debug)]
pub struct Histogram {
    name: String,
    buckets: Vec<f64>,
    counts: Vec<AtomicU64>,
    sum: AtomicU64,
    count: AtomicU64,
    labels: HashMap<String, String>,
}

impl Histogram {
    /// Create a new histogram with default buckets
    pub fn new(name: impl Into<String>) -> Self {
        Self::with_buckets(
            name,
            vec![
                0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
            ],
        )
    }

    /// Create a histogram with custom buckets
    pub fn with_buckets(name: impl Into<String>, buckets: Vec<f64>) -> Self {
        let counts = buckets.iter().map(|_| AtomicU64::new(0)).collect();
        Self {
            name: name.into(),
            buckets,
            counts,
            sum: AtomicU64::new(0),
            count: AtomicU64::new(0),
            labels: HashMap::new(),
        }
    }

    /// Observe a value
    pub fn observe(&self, value: f64) {
        // Find the bucket and increment
        for (i, bucket) in self.buckets.iter().enumerate() {
            if value <= *bucket {
                self.counts[i].fetch_add(1, Ordering::Relaxed);
            }
        }

        // Update sum (store as bits)
        let value_bits = value.to_bits();
        self.sum.fetch_add(value_bits, Ordering::Relaxed);
        self.count.fetch_add(1, Ordering::Relaxed);
    }

    /// Get the name
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the count
    pub fn count(&self) -> u64 {
        self.count.load(Ordering::Relaxed)
    }

    /// Get bucket counts
    pub fn bucket_counts(&self) -> Vec<u64> {
        self.counts
            .iter()
            .map(|c| c.load(Ordering::Relaxed))
            .collect()
    }
}

/// Trait for metrics collection
pub trait MetricsCollector: Send + Sync {
    /// Record a request being made
    fn record_request(&self, service: &str, operation: &str);

    /// Record a request completing successfully
    fn record_success(&self, service: &str, operation: &str, duration_ms: u64);

    /// Record a request failing
    fn record_failure(&self, service: &str, operation: &str, error_type: &str);

    /// Record latency
    fn record_latency(&self, service: &str, operation: &str, duration_ms: u64);

    /// Record tokens used
    fn record_tokens(&self, service: &str, input_tokens: u64, output_tokens: u64);

    /// Get a snapshot of all metrics
    fn snapshot(&self) -> MetricsSnapshot;
}

/// A snapshot of metrics
#[derive(Debug, Clone, Default)]
pub struct MetricsSnapshot {
    /// Total requests by service.operation
    pub total_requests: HashMap<String, u64>,
    /// Successful requests by service.operation
    pub successful_requests: HashMap<String, u64>,
    /// Failed requests by service.operation.error_type
    pub failed_requests: HashMap<String, u64>,
    /// Total input tokens
    pub total_input_tokens: u64,
    /// Total output tokens
    pub total_output_tokens: u64,
    /// Average latency by service.operation
    pub avg_latency_ms: HashMap<String, f64>,
}

/// In-memory metrics collector
pub struct InMemoryMetricsCollector {
    requests: RwLock<HashMap<String, Arc<Counter>>>,
    successes: RwLock<HashMap<String, Arc<Counter>>>,
    failures: RwLock<HashMap<String, Arc<Counter>>>,
    latencies: RwLock<HashMap<String, Arc<Histogram>>>,
    input_tokens: Counter,
    output_tokens: Counter,
}

impl InMemoryMetricsCollector {
    /// Create a new in-memory metrics collector
    pub fn new() -> Self {
        Self {
            requests: RwLock::new(HashMap::new()),
            successes: RwLock::new(HashMap::new()),
            failures: RwLock::new(HashMap::new()),
            latencies: RwLock::new(HashMap::new()),
            input_tokens: Counter::new("input_tokens"),
            output_tokens: Counter::new("output_tokens"),
        }
    }

    fn get_or_create_counter(
        map: &RwLock<HashMap<String, Arc<Counter>>>,
        key: &str,
    ) -> Arc<Counter> {
        {
            let read = map.read();
            if let Some(counter) = read.get(key) {
                return counter.clone();
            }
        }

        let mut write = map.write();
        write
            .entry(key.to_string())
            .or_insert_with(|| Arc::new(Counter::new(key)))
            .clone()
    }

    fn get_or_create_histogram(
        map: &RwLock<HashMap<String, Arc<Histogram>>>,
        key: &str,
    ) -> Arc<Histogram> {
        {
            let read = map.read();
            if let Some(histogram) = read.get(key) {
                return histogram.clone();
            }
        }

        let mut write = map.write();
        write
            .entry(key.to_string())
            .or_insert_with(|| Arc::new(Histogram::new(key)))
            .clone()
    }
}

impl Default for InMemoryMetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsCollector for InMemoryMetricsCollector {
    fn record_request(&self, service: &str, operation: &str) {
        let key = format!("{}.{}", service, operation);
        let counter = Self::get_or_create_counter(&self.requests, &key);
        counter.inc();
    }

    fn record_success(&self, service: &str, operation: &str, duration_ms: u64) {
        let key = format!("{}.{}", service, operation);
        let counter = Self::get_or_create_counter(&self.successes, &key);
        counter.inc();
        self.record_latency(service, operation, duration_ms);
    }

    fn record_failure(&self, service: &str, operation: &str, error_type: &str) {
        let key = format!("{}.{}.{}", service, operation, error_type);
        let counter = Self::get_or_create_counter(&self.failures, &key);
        counter.inc();
    }

    fn record_latency(&self, service: &str, operation: &str, duration_ms: u64) {
        let key = format!("{}.{}", service, operation);
        let histogram = Self::get_or_create_histogram(&self.latencies, &key);
        histogram.observe(duration_ms as f64);
    }

    fn record_tokens(&self, _service: &str, input_tokens: u64, output_tokens: u64) {
        self.input_tokens.add(input_tokens);
        self.output_tokens.add(output_tokens);
    }

    fn snapshot(&self) -> MetricsSnapshot {
        let mut snapshot = MetricsSnapshot::default();

        // Collect request counts
        for (key, counter) in self.requests.read().iter() {
            snapshot.total_requests.insert(key.clone(), counter.get());
        }

        // Collect success counts
        for (key, counter) in self.successes.read().iter() {
            snapshot.successful_requests.insert(key.clone(), counter.get());
        }

        // Collect failure counts
        for (key, counter) in self.failures.read().iter() {
            snapshot.failed_requests.insert(key.clone(), counter.get());
        }

        // Collect token counts
        snapshot.total_input_tokens = self.input_tokens.get();
        snapshot.total_output_tokens = self.output_tokens.get();

        snapshot
    }
}

/// No-op metrics collector for testing or when metrics are disabled
#[derive(Debug, Default)]
pub struct NoopMetricsCollector;

impl MetricsCollector for NoopMetricsCollector {
    fn record_request(&self, _service: &str, _operation: &str) {}
    fn record_success(&self, _service: &str, _operation: &str, _duration_ms: u64) {}
    fn record_failure(&self, _service: &str, _operation: &str, _error_type: &str) {}
    fn record_latency(&self, _service: &str, _operation: &str, _duration_ms: u64) {}
    fn record_tokens(&self, _service: &str, _input_tokens: u64, _output_tokens: u64) {}
    fn snapshot(&self) -> MetricsSnapshot {
        MetricsSnapshot::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_counter() {
        let counter = Counter::new("test_counter");
        assert_eq!(counter.get(), 0);

        counter.inc();
        assert_eq!(counter.get(), 1);

        counter.add(5);
        assert_eq!(counter.get(), 6);
    }

    #[test]
    fn test_gauge() {
        let gauge = Gauge::new("test_gauge");
        assert_eq!(gauge.get(), 0);

        gauge.set(10);
        assert_eq!(gauge.get(), 10);

        gauge.inc();
        assert_eq!(gauge.get(), 11);

        gauge.dec();
        assert_eq!(gauge.get(), 10);
    }

    #[test]
    fn test_histogram() {
        let histogram = Histogram::new("test_histogram");

        histogram.observe(0.1);
        histogram.observe(0.5);
        histogram.observe(1.0);

        assert_eq!(histogram.count(), 3);
    }

    #[test]
    fn test_in_memory_collector() {
        let collector = InMemoryMetricsCollector::new();

        collector.record_request("chat", "create");
        collector.record_success("chat", "create", 100);
        collector.record_failure("chat", "create", "timeout");
        collector.record_tokens("chat", 100, 50);

        let snapshot = collector.snapshot();
        assert_eq!(snapshot.total_requests.get("chat.create"), Some(&1));
        assert_eq!(snapshot.successful_requests.get("chat.create"), Some(&1));
        assert_eq!(snapshot.failed_requests.get("chat.create.timeout"), Some(&1));
        assert_eq!(snapshot.total_input_tokens, 100);
        assert_eq!(snapshot.total_output_tokens, 50);
    }
}
