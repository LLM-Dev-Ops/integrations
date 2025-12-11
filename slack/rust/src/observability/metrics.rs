//! Metrics collection for the Slack client.

use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

/// Metrics collector for Slack API operations
#[derive(Debug)]
pub struct MetricsCollector {
    /// Request counters by endpoint
    request_counts: RwLock<HashMap<String, AtomicU64>>,
    /// Error counters by endpoint and error type
    error_counts: RwLock<HashMap<String, AtomicU64>>,
    /// Latency histograms by endpoint
    latencies: RwLock<HashMap<String, LatencyHistogram>>,
    /// Rate limit hits
    rate_limit_hits: AtomicU64,
    /// Circuit breaker trips
    circuit_breaker_trips: AtomicU64,
    /// Active requests gauge
    active_requests: AtomicU64,
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsCollector {
    /// Create a new metrics collector
    pub fn new() -> Self {
        Self {
            request_counts: RwLock::new(HashMap::new()),
            error_counts: RwLock::new(HashMap::new()),
            latencies: RwLock::new(HashMap::new()),
            rate_limit_hits: AtomicU64::new(0),
            circuit_breaker_trips: AtomicU64::new(0),
            active_requests: AtomicU64::new(0),
        }
    }

    /// Record a request start
    pub fn record_request_start(&self, endpoint: &str) {
        self.active_requests.fetch_add(1, Ordering::Relaxed);

        let mut counts = self.request_counts.write();
        counts
            .entry(endpoint.to_string())
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(1, Ordering::Relaxed);
    }

    /// Record a request completion
    pub fn record_request_end(&self, endpoint: &str, duration_ms: u64, success: bool) {
        self.active_requests.fetch_sub(1, Ordering::Relaxed);

        // Record latency
        let mut latencies = self.latencies.write();
        let histogram = latencies
            .entry(endpoint.to_string())
            .or_insert_with(LatencyHistogram::new);
        histogram.record(duration_ms);

        // Record error if failed
        if !success {
            let mut errors = self.error_counts.write();
            errors
                .entry(endpoint.to_string())
                .or_insert_with(|| AtomicU64::new(0))
                .fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Record a rate limit hit
    pub fn record_rate_limit(&self) {
        self.rate_limit_hits.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a circuit breaker trip
    pub fn record_circuit_breaker_trip(&self) {
        self.circuit_breaker_trips.fetch_add(1, Ordering::Relaxed);
    }

    /// Get total request count for an endpoint
    pub fn request_count(&self, endpoint: &str) -> u64 {
        self.request_counts
            .read()
            .get(endpoint)
            .map(|c| c.load(Ordering::Relaxed))
            .unwrap_or(0)
    }

    /// Get total error count for an endpoint
    pub fn error_count(&self, endpoint: &str) -> u64 {
        self.error_counts
            .read()
            .get(endpoint)
            .map(|c| c.load(Ordering::Relaxed))
            .unwrap_or(0)
    }

    /// Get error rate for an endpoint
    pub fn error_rate(&self, endpoint: &str) -> f64 {
        let requests = self.request_count(endpoint);
        let errors = self.error_count(endpoint);
        if requests == 0 {
            0.0
        } else {
            errors as f64 / requests as f64
        }
    }

    /// Get latency stats for an endpoint
    pub fn latency_stats(&self, endpoint: &str) -> Option<LatencyStats> {
        self.latencies.read().get(endpoint).map(|h| h.stats())
    }

    /// Get rate limit hit count
    pub fn rate_limit_hits(&self) -> u64 {
        self.rate_limit_hits.load(Ordering::Relaxed)
    }

    /// Get circuit breaker trip count
    pub fn circuit_breaker_trips(&self) -> u64 {
        self.circuit_breaker_trips.load(Ordering::Relaxed)
    }

    /// Get active request count
    pub fn active_requests(&self) -> u64 {
        self.active_requests.load(Ordering::Relaxed)
    }

    /// Get all metrics as a snapshot
    pub fn snapshot(&self) -> MetricsSnapshot {
        let request_counts = self.request_counts.read();
        let error_counts = self.error_counts.read();
        let latencies = self.latencies.read();

        let mut endpoints = HashMap::new();
        for (endpoint, count) in request_counts.iter() {
            let errors = error_counts
                .get(endpoint)
                .map(|c| c.load(Ordering::Relaxed))
                .unwrap_or(0);
            let latency_stats = latencies.get(endpoint).map(|h| h.stats());

            endpoints.insert(
                endpoint.clone(),
                EndpointMetrics {
                    request_count: count.load(Ordering::Relaxed),
                    error_count: errors,
                    latency_stats,
                },
            );
        }

        MetricsSnapshot {
            endpoints,
            rate_limit_hits: self.rate_limit_hits.load(Ordering::Relaxed),
            circuit_breaker_trips: self.circuit_breaker_trips.load(Ordering::Relaxed),
            active_requests: self.active_requests.load(Ordering::Relaxed),
        }
    }

    /// Reset all metrics
    pub fn reset(&self) {
        self.request_counts.write().clear();
        self.error_counts.write().clear();
        self.latencies.write().clear();
        self.rate_limit_hits.store(0, Ordering::Relaxed);
        self.circuit_breaker_trips.store(0, Ordering::Relaxed);
    }
}

/// Latency histogram using buckets
#[derive(Debug)]
pub struct LatencyHistogram {
    /// Count of samples
    count: AtomicU64,
    /// Sum of all samples
    sum: AtomicU64,
    /// Minimum value
    min: AtomicU64,
    /// Maximum value
    max: AtomicU64,
    /// Bucket counts (0-10ms, 10-50ms, 50-100ms, 100-500ms, 500ms+)
    buckets: [AtomicU64; 5],
}

impl LatencyHistogram {
    /// Create a new histogram
    pub fn new() -> Self {
        Self {
            count: AtomicU64::new(0),
            sum: AtomicU64::new(0),
            min: AtomicU64::new(u64::MAX),
            max: AtomicU64::new(0),
            buckets: Default::default(),
        }
    }

    /// Record a latency value
    pub fn record(&self, ms: u64) {
        self.count.fetch_add(1, Ordering::Relaxed);
        self.sum.fetch_add(ms, Ordering::Relaxed);

        // Update min
        let mut current_min = self.min.load(Ordering::Relaxed);
        while ms < current_min {
            match self.min.compare_exchange_weak(
                current_min,
                ms,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(x) => current_min = x,
            }
        }

        // Update max
        let mut current_max = self.max.load(Ordering::Relaxed);
        while ms > current_max {
            match self.max.compare_exchange_weak(
                current_max,
                ms,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(x) => current_max = x,
            }
        }

        // Update bucket
        let bucket_idx = match ms {
            0..=10 => 0,
            11..=50 => 1,
            51..=100 => 2,
            101..=500 => 3,
            _ => 4,
        };
        self.buckets[bucket_idx].fetch_add(1, Ordering::Relaxed);
    }

    /// Get statistics
    pub fn stats(&self) -> LatencyStats {
        let count = self.count.load(Ordering::Relaxed);
        let sum = self.sum.load(Ordering::Relaxed);
        let min = self.min.load(Ordering::Relaxed);
        let max = self.max.load(Ordering::Relaxed);

        LatencyStats {
            count,
            sum_ms: sum,
            min_ms: if min == u64::MAX { 0 } else { min },
            max_ms: max,
            avg_ms: if count > 0 { sum / count } else { 0 },
            buckets: [
                self.buckets[0].load(Ordering::Relaxed),
                self.buckets[1].load(Ordering::Relaxed),
                self.buckets[2].load(Ordering::Relaxed),
                self.buckets[3].load(Ordering::Relaxed),
                self.buckets[4].load(Ordering::Relaxed),
            ],
        }
    }
}

impl Default for LatencyHistogram {
    fn default() -> Self {
        Self::new()
    }
}

/// Latency statistics
#[derive(Debug, Clone)]
pub struct LatencyStats {
    /// Sample count
    pub count: u64,
    /// Total sum in milliseconds
    pub sum_ms: u64,
    /// Minimum latency
    pub min_ms: u64,
    /// Maximum latency
    pub max_ms: u64,
    /// Average latency
    pub avg_ms: u64,
    /// Bucket counts [0-10ms, 10-50ms, 50-100ms, 100-500ms, 500ms+]
    pub buckets: [u64; 5],
}

/// Per-endpoint metrics
#[derive(Debug, Clone)]
pub struct EndpointMetrics {
    /// Request count
    pub request_count: u64,
    /// Error count
    pub error_count: u64,
    /// Latency stats
    pub latency_stats: Option<LatencyStats>,
}

/// Complete metrics snapshot
#[derive(Debug, Clone)]
pub struct MetricsSnapshot {
    /// Per-endpoint metrics
    pub endpoints: HashMap<String, EndpointMetrics>,
    /// Rate limit hits
    pub rate_limit_hits: u64,
    /// Circuit breaker trips
    pub circuit_breaker_trips: u64,
    /// Active requests
    pub active_requests: u64,
}

/// Create a shared metrics collector
pub fn create_metrics_collector() -> Arc<MetricsCollector> {
    Arc::new(MetricsCollector::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_collector() {
        let metrics = MetricsCollector::new();

        metrics.record_request_start("chat.postMessage");
        metrics.record_request_end("chat.postMessage", 50, true);

        assert_eq!(metrics.request_count("chat.postMessage"), 1);
        assert_eq!(metrics.error_count("chat.postMessage"), 0);
    }

    #[test]
    fn test_error_recording() {
        let metrics = MetricsCollector::new();

        metrics.record_request_start("users.list");
        metrics.record_request_end("users.list", 100, false);

        assert_eq!(metrics.error_count("users.list"), 1);
        assert_eq!(metrics.error_rate("users.list"), 1.0);
    }

    #[test]
    fn test_latency_histogram() {
        let histogram = LatencyHistogram::new();

        histogram.record(5);
        histogram.record(25);
        histogram.record(150);

        let stats = histogram.stats();
        assert_eq!(stats.count, 3);
        assert_eq!(stats.min_ms, 5);
        assert_eq!(stats.max_ms, 150);
        assert_eq!(stats.buckets[0], 1); // 0-10ms
        assert_eq!(stats.buckets[1], 1); // 10-50ms
        assert_eq!(stats.buckets[3], 1); // 100-500ms
    }
}
