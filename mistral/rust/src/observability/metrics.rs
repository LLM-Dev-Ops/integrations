//! Metrics collection for the Mistral client.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// Metrics collector for tracking API usage.
pub trait MetricsCollector: Send + Sync {
    /// Records a request.
    fn record_request(&self, endpoint: &str, method: &str, duration: Duration, status: u16);

    /// Records token usage.
    fn record_tokens(&self, prompt_tokens: u32, completion_tokens: u32);

    /// Records an error.
    fn record_error(&self, endpoint: &str, error_type: &str);

    /// Records a retry attempt.
    fn record_retry(&self, endpoint: &str, attempt: u32);

    /// Records circuit breaker state change.
    fn record_circuit_breaker_state(&self, state: &str);

    /// Gets current metrics snapshot.
    fn get_metrics(&self) -> ServiceMetrics;
}

/// Request-level metrics.
#[derive(Debug, Clone)]
pub struct RequestMetrics {
    /// Request start time.
    pub started_at: Instant,
    /// Endpoint called.
    pub endpoint: String,
    /// HTTP method.
    pub method: String,
    /// Response status code.
    pub status: Option<u16>,
    /// Request duration.
    pub duration: Option<Duration>,
    /// Number of retry attempts.
    pub retries: u32,
    /// Error type if failed.
    pub error_type: Option<String>,
}

impl RequestMetrics {
    /// Creates new request metrics.
    pub fn new(endpoint: impl Into<String>, method: impl Into<String>) -> Self {
        Self {
            started_at: Instant::now(),
            endpoint: endpoint.into(),
            method: method.into(),
            status: None,
            duration: None,
            retries: 0,
            error_type: None,
        }
    }

    /// Records completion of the request.
    pub fn complete(&mut self, status: u16) {
        self.status = Some(status);
        self.duration = Some(self.started_at.elapsed());
    }

    /// Records a failure.
    pub fn fail(&mut self, error_type: &str) {
        self.error_type = Some(error_type.to_string());
        self.duration = Some(self.started_at.elapsed());
    }

    /// Increments retry count.
    pub fn add_retry(&mut self) {
        self.retries += 1;
    }
}

/// Aggregated service metrics.
#[derive(Debug, Clone, Default)]
pub struct ServiceMetrics {
    /// Total requests made.
    pub total_requests: u64,
    /// Successful requests.
    pub successful_requests: u64,
    /// Failed requests.
    pub failed_requests: u64,
    /// Total retries.
    pub total_retries: u64,
    /// Total prompt tokens.
    pub total_prompt_tokens: u64,
    /// Total completion tokens.
    pub total_completion_tokens: u64,
    /// Average request duration in milliseconds.
    pub avg_duration_ms: f64,
    /// Requests per endpoint.
    pub requests_by_endpoint: HashMap<String, u64>,
    /// Errors by type.
    pub errors_by_type: HashMap<String, u64>,
    /// Current circuit breaker state.
    pub circuit_breaker_state: String,
}

/// Default in-memory metrics collector.
pub struct DefaultMetricsCollector {
    total_requests: AtomicU64,
    successful_requests: AtomicU64,
    failed_requests: AtomicU64,
    total_retries: AtomicU64,
    total_prompt_tokens: AtomicU64,
    total_completion_tokens: AtomicU64,
    total_duration_ms: AtomicU64,
    requests_by_endpoint: RwLock<HashMap<String, u64>>,
    errors_by_type: RwLock<HashMap<String, u64>>,
    circuit_breaker_state: RwLock<String>,
}

impl Default for DefaultMetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl DefaultMetricsCollector {
    /// Creates a new metrics collector.
    pub fn new() -> Self {
        Self {
            total_requests: AtomicU64::new(0),
            successful_requests: AtomicU64::new(0),
            failed_requests: AtomicU64::new(0),
            total_retries: AtomicU64::new(0),
            total_prompt_tokens: AtomicU64::new(0),
            total_completion_tokens: AtomicU64::new(0),
            total_duration_ms: AtomicU64::new(0),
            requests_by_endpoint: RwLock::new(HashMap::new()),
            errors_by_type: RwLock::new(HashMap::new()),
            circuit_breaker_state: RwLock::new("closed".to_string()),
        }
    }

    /// Resets all metrics.
    pub fn reset(&self) {
        self.total_requests.store(0, Ordering::SeqCst);
        self.successful_requests.store(0, Ordering::SeqCst);
        self.failed_requests.store(0, Ordering::SeqCst);
        self.total_retries.store(0, Ordering::SeqCst);
        self.total_prompt_tokens.store(0, Ordering::SeqCst);
        self.total_completion_tokens.store(0, Ordering::SeqCst);
        self.total_duration_ms.store(0, Ordering::SeqCst);

        if let Ok(mut endpoints) = self.requests_by_endpoint.write() {
            endpoints.clear();
        }
        if let Ok(mut errors) = self.errors_by_type.write() {
            errors.clear();
        }
    }
}

impl MetricsCollector for DefaultMetricsCollector {
    fn record_request(&self, endpoint: &str, _method: &str, duration: Duration, status: u16) {
        self.total_requests.fetch_add(1, Ordering::SeqCst);
        self.total_duration_ms
            .fetch_add(duration.as_millis() as u64, Ordering::SeqCst);

        if status < 400 {
            self.successful_requests.fetch_add(1, Ordering::SeqCst);
        } else {
            self.failed_requests.fetch_add(1, Ordering::SeqCst);
        }

        if let Ok(mut endpoints) = self.requests_by_endpoint.write() {
            *endpoints.entry(endpoint.to_string()).or_insert(0) += 1;
        }
    }

    fn record_tokens(&self, prompt_tokens: u32, completion_tokens: u32) {
        self.total_prompt_tokens
            .fetch_add(prompt_tokens as u64, Ordering::SeqCst);
        self.total_completion_tokens
            .fetch_add(completion_tokens as u64, Ordering::SeqCst);
    }

    fn record_error(&self, _endpoint: &str, error_type: &str) {
        if let Ok(mut errors) = self.errors_by_type.write() {
            *errors.entry(error_type.to_string()).or_insert(0) += 1;
        }
    }

    fn record_retry(&self, _endpoint: &str, _attempt: u32) {
        self.total_retries.fetch_add(1, Ordering::SeqCst);
    }

    fn record_circuit_breaker_state(&self, state: &str) {
        if let Ok(mut cb_state) = self.circuit_breaker_state.write() {
            *cb_state = state.to_string();
        }
    }

    fn get_metrics(&self) -> ServiceMetrics {
        let total = self.total_requests.load(Ordering::SeqCst);
        let total_duration = self.total_duration_ms.load(Ordering::SeqCst);
        let avg_duration = if total > 0 {
            total_duration as f64 / total as f64
        } else {
            0.0
        };

        ServiceMetrics {
            total_requests: total,
            successful_requests: self.successful_requests.load(Ordering::SeqCst),
            failed_requests: self.failed_requests.load(Ordering::SeqCst),
            total_retries: self.total_retries.load(Ordering::SeqCst),
            total_prompt_tokens: self.total_prompt_tokens.load(Ordering::SeqCst),
            total_completion_tokens: self.total_completion_tokens.load(Ordering::SeqCst),
            avg_duration_ms: avg_duration,
            requests_by_endpoint: self
                .requests_by_endpoint
                .read()
                .map(|r| r.clone())
                .unwrap_or_default(),
            errors_by_type: self
                .errors_by_type
                .read()
                .map(|r| r.clone())
                .unwrap_or_default(),
            circuit_breaker_state: self
                .circuit_breaker_state
                .read()
                .map(|r| r.clone())
                .unwrap_or_else(|_| "unknown".to_string()),
        }
    }
}

/// No-op metrics collector for when metrics are disabled.
pub struct NoopMetricsCollector;

impl MetricsCollector for NoopMetricsCollector {
    fn record_request(&self, _endpoint: &str, _method: &str, _duration: Duration, _status: u16) {}
    fn record_tokens(&self, _prompt_tokens: u32, _completion_tokens: u32) {}
    fn record_error(&self, _endpoint: &str, _error_type: &str) {}
    fn record_retry(&self, _endpoint: &str, _attempt: u32) {}
    fn record_circuit_breaker_state(&self, _state: &str) {}
    fn get_metrics(&self) -> ServiceMetrics {
        ServiceMetrics::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_metrics_creation() {
        let metrics = RequestMetrics::new("/v1/chat/completions", "POST");
        assert_eq!(metrics.endpoint, "/v1/chat/completions");
        assert_eq!(metrics.method, "POST");
        assert!(metrics.status.is_none());
    }

    #[test]
    fn test_request_metrics_complete() {
        let mut metrics = RequestMetrics::new("/v1/chat/completions", "POST");
        std::thread::sleep(Duration::from_millis(10));
        metrics.complete(200);

        assert_eq!(metrics.status, Some(200));
        assert!(metrics.duration.is_some());
        assert!(metrics.duration.unwrap() >= Duration::from_millis(10));
    }

    #[test]
    fn test_default_metrics_collector() {
        let collector = DefaultMetricsCollector::new();

        collector.record_request("/v1/chat", "POST", Duration::from_millis(100), 200);
        collector.record_request("/v1/chat", "POST", Duration::from_millis(200), 200);
        collector.record_tokens(100, 50);

        let metrics = collector.get_metrics();
        assert_eq!(metrics.total_requests, 2);
        assert_eq!(metrics.successful_requests, 2);
        assert_eq!(metrics.total_prompt_tokens, 100);
        assert_eq!(metrics.total_completion_tokens, 50);
        assert_eq!(metrics.avg_duration_ms, 150.0);
    }

    #[test]
    fn test_metrics_collector_reset() {
        let collector = DefaultMetricsCollector::new();

        collector.record_request("/v1/chat", "POST", Duration::from_millis(100), 200);
        collector.reset();

        let metrics = collector.get_metrics();
        assert_eq!(metrics.total_requests, 0);
    }
}
