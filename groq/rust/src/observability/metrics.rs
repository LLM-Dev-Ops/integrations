//! Metrics collection for the Groq client.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::Duration;

/// Metrics collector interface.
pub trait MetricsCollector: Send + Sync {
    /// Records a request.
    fn record_request(&self, operation: &str, success: bool, duration: Duration);

    /// Records latency.
    fn record_latency(&self, operation: &str, duration: Duration);

    /// Records token usage.
    fn record_tokens(&self, prompt_tokens: u32, completion_tokens: u32);

    /// Records model usage.
    fn record_model_usage(&self, model: &str);

    /// Records an error.
    fn record_error(&self, error_type: &str);

    /// Gets current metrics.
    fn get_metrics(&self) -> RequestMetrics;

    /// Resets all metrics.
    fn reset(&self);
}

/// Request metrics snapshot.
#[derive(Debug, Clone, Default)]
pub struct RequestMetrics {
    /// Total requests.
    pub total_requests: u64,
    /// Successful requests.
    pub successful_requests: u64,
    /// Failed requests.
    pub failed_requests: u64,
    /// Total latency in milliseconds.
    pub total_latency_ms: u64,
    /// Total prompt tokens.
    pub prompt_tokens: u64,
    /// Total completion tokens.
    pub completion_tokens: u64,
    /// Requests per operation.
    pub operations: HashMap<String, u64>,
    /// Model usage counts.
    pub models: HashMap<String, u64>,
    /// Error counts by type.
    pub errors: HashMap<String, u64>,
}

impl RequestMetrics {
    /// Calculates average latency in milliseconds.
    pub fn average_latency_ms(&self) -> f64 {
        if self.total_requests == 0 {
            0.0
        } else {
            self.total_latency_ms as f64 / self.total_requests as f64
        }
    }

    /// Calculates success rate as a percentage.
    pub fn success_rate(&self) -> f64 {
        if self.total_requests == 0 {
            100.0
        } else {
            (self.successful_requests as f64 / self.total_requests as f64) * 100.0
        }
    }

    /// Calculates total tokens.
    pub fn total_tokens(&self) -> u64 {
        self.prompt_tokens + self.completion_tokens
    }
}

/// Default metrics collector implementation.
pub struct DefaultMetricsCollector {
    total_requests: AtomicU64,
    successful_requests: AtomicU64,
    failed_requests: AtomicU64,
    total_latency_ms: AtomicU64,
    prompt_tokens: AtomicU64,
    completion_tokens: AtomicU64,
    operations: RwLock<HashMap<String, u64>>,
    models: RwLock<HashMap<String, u64>>,
    errors: RwLock<HashMap<String, u64>>,
}

impl DefaultMetricsCollector {
    /// Creates a new metrics collector.
    pub fn new() -> Self {
        Self {
            total_requests: AtomicU64::new(0),
            successful_requests: AtomicU64::new(0),
            failed_requests: AtomicU64::new(0),
            total_latency_ms: AtomicU64::new(0),
            prompt_tokens: AtomicU64::new(0),
            completion_tokens: AtomicU64::new(0),
            operations: RwLock::new(HashMap::new()),
            models: RwLock::new(HashMap::new()),
            errors: RwLock::new(HashMap::new()),
        }
    }
}

impl Default for DefaultMetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsCollector for DefaultMetricsCollector {
    fn record_request(&self, operation: &str, success: bool, duration: Duration) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);

        if success {
            self.successful_requests.fetch_add(1, Ordering::Relaxed);
        } else {
            self.failed_requests.fetch_add(1, Ordering::Relaxed);
        }

        self.total_latency_ms
            .fetch_add(duration.as_millis() as u64, Ordering::Relaxed);

        if let Ok(mut ops) = self.operations.write() {
            *ops.entry(operation.to_string()).or_insert(0) += 1;
        }
    }

    fn record_latency(&self, _operation: &str, duration: Duration) {
        self.total_latency_ms
            .fetch_add(duration.as_millis() as u64, Ordering::Relaxed);
    }

    fn record_tokens(&self, prompt_tokens: u32, completion_tokens: u32) {
        self.prompt_tokens
            .fetch_add(prompt_tokens as u64, Ordering::Relaxed);
        self.completion_tokens
            .fetch_add(completion_tokens as u64, Ordering::Relaxed);
    }

    fn record_model_usage(&self, model: &str) {
        if let Ok(mut models) = self.models.write() {
            *models.entry(model.to_string()).or_insert(0) += 1;
        }
    }

    fn record_error(&self, error_type: &str) {
        if let Ok(mut errors) = self.errors.write() {
            *errors.entry(error_type.to_string()).or_insert(0) += 1;
        }
    }

    fn get_metrics(&self) -> RequestMetrics {
        RequestMetrics {
            total_requests: self.total_requests.load(Ordering::Relaxed),
            successful_requests: self.successful_requests.load(Ordering::Relaxed),
            failed_requests: self.failed_requests.load(Ordering::Relaxed),
            total_latency_ms: self.total_latency_ms.load(Ordering::Relaxed),
            prompt_tokens: self.prompt_tokens.load(Ordering::Relaxed),
            completion_tokens: self.completion_tokens.load(Ordering::Relaxed),
            operations: self.operations.read().map(|o| o.clone()).unwrap_or_default(),
            models: self.models.read().map(|m| m.clone()).unwrap_or_default(),
            errors: self.errors.read().map(|e| e.clone()).unwrap_or_default(),
        }
    }

    fn reset(&self) {
        self.total_requests.store(0, Ordering::Relaxed);
        self.successful_requests.store(0, Ordering::Relaxed);
        self.failed_requests.store(0, Ordering::Relaxed);
        self.total_latency_ms.store(0, Ordering::Relaxed);
        self.prompt_tokens.store(0, Ordering::Relaxed);
        self.completion_tokens.store(0, Ordering::Relaxed);

        if let Ok(mut ops) = self.operations.write() {
            ops.clear();
        }
        if let Ok(mut models) = self.models.write() {
            models.clear();
        }
        if let Ok(mut errors) = self.errors.write() {
            errors.clear();
        }
    }
}

impl std::fmt::Debug for DefaultMetricsCollector {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DefaultMetricsCollector")
            .field("total_requests", &self.total_requests.load(Ordering::Relaxed))
            .field(
                "successful_requests",
                &self.successful_requests.load(Ordering::Relaxed),
            )
            .field("failed_requests", &self.failed_requests.load(Ordering::Relaxed))
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_record_request() {
        let collector = DefaultMetricsCollector::new();

        collector.record_request("chat", true, Duration::from_millis(100));
        collector.record_request("chat", true, Duration::from_millis(200));
        collector.record_request("chat", false, Duration::from_millis(50));

        let metrics = collector.get_metrics();
        assert_eq!(metrics.total_requests, 3);
        assert_eq!(metrics.successful_requests, 2);
        assert_eq!(metrics.failed_requests, 1);
        assert_eq!(metrics.total_latency_ms, 350);
    }

    #[test]
    fn test_record_tokens() {
        let collector = DefaultMetricsCollector::new();

        collector.record_tokens(100, 50);
        collector.record_tokens(200, 100);

        let metrics = collector.get_metrics();
        assert_eq!(metrics.prompt_tokens, 300);
        assert_eq!(metrics.completion_tokens, 150);
        assert_eq!(metrics.total_tokens(), 450);
    }

    #[test]
    fn test_average_latency() {
        let collector = DefaultMetricsCollector::new();

        collector.record_request("chat", true, Duration::from_millis(100));
        collector.record_request("chat", true, Duration::from_millis(200));

        let metrics = collector.get_metrics();
        assert!((metrics.average_latency_ms() - 150.0).abs() < 0.1);
    }

    #[test]
    fn test_success_rate() {
        let collector = DefaultMetricsCollector::new();

        collector.record_request("chat", true, Duration::from_millis(100));
        collector.record_request("chat", true, Duration::from_millis(100));
        collector.record_request("chat", false, Duration::from_millis(100));
        collector.record_request("chat", false, Duration::from_millis(100));

        let metrics = collector.get_metrics();
        assert!((metrics.success_rate() - 50.0).abs() < 0.1);
    }

    #[test]
    fn test_model_usage() {
        let collector = DefaultMetricsCollector::new();

        collector.record_model_usage("llama-3.3-70b-versatile");
        collector.record_model_usage("llama-3.3-70b-versatile");
        collector.record_model_usage("mixtral-8x7b");

        let metrics = collector.get_metrics();
        assert_eq!(metrics.models.get("llama-3.3-70b-versatile"), Some(&2));
        assert_eq!(metrics.models.get("mixtral-8x7b"), Some(&1));
    }

    #[test]
    fn test_reset() {
        let collector = DefaultMetricsCollector::new();

        collector.record_request("chat", true, Duration::from_millis(100));
        collector.record_tokens(100, 50);
        collector.record_model_usage("test");

        collector.reset();

        let metrics = collector.get_metrics();
        assert_eq!(metrics.total_requests, 0);
        assert_eq!(metrics.prompt_tokens, 0);
        assert!(metrics.models.is_empty());
    }
}
