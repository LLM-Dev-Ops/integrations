//! Metrics
//!
//! OAuth2 metrics collection interfaces and implementations.

use std::collections::HashMap;
use std::sync::Mutex;

/// Metric labels.
pub type MetricLabels = HashMap<String, String>;

/// Counter metric interface.
pub trait Counter: Send + Sync {
    /// Increment the counter.
    fn increment(&self, labels: &MetricLabels);

    /// Add a value to the counter.
    fn add(&self, value: u64, labels: &MetricLabels);
}

/// Gauge metric interface.
pub trait Gauge: Send + Sync {
    /// Set the gauge value.
    fn set(&self, value: f64, labels: &MetricLabels);

    /// Increment the gauge.
    fn increment(&self, labels: &MetricLabels);

    /// Decrement the gauge.
    fn decrement(&self, labels: &MetricLabels);
}

/// Histogram metric interface.
pub trait Histogram: Send + Sync {
    /// Record a value.
    fn record(&self, value: f64, labels: &MetricLabels);
}

/// OAuth2 metrics interface.
pub trait OAuth2Metrics: Send + Sync {
    /// Record authorization request.
    fn record_authorization_request(&self, provider: &str);

    /// Record token request.
    fn record_token_request(&self, provider: &str, grant_type: &str);

    /// Record token refresh.
    fn record_token_refresh(&self, provider: &str, success: bool);

    /// Record token revocation.
    fn record_token_revocation(&self, provider: &str, success: bool);

    /// Record token introspection.
    fn record_token_introspection(&self, provider: &str, active: bool);

    /// Record request duration.
    fn record_request_duration(&self, endpoint: &str, duration_ms: f64);

    /// Record error.
    fn record_error(&self, error_type: &str, provider: &str);

    /// Record circuit breaker state change.
    fn record_circuit_breaker_state(&self, provider: &str, state: &str);

    /// Set active tokens gauge.
    fn set_active_tokens(&self, provider: &str, count: u64);
}

/// No-op metrics implementation.
pub struct NoOpMetrics;

impl OAuth2Metrics for NoOpMetrics {
    fn record_authorization_request(&self, _provider: &str) {}
    fn record_token_request(&self, _provider: &str, _grant_type: &str) {}
    fn record_token_refresh(&self, _provider: &str, _success: bool) {}
    fn record_token_revocation(&self, _provider: &str, _success: bool) {}
    fn record_token_introspection(&self, _provider: &str, _active: bool) {}
    fn record_request_duration(&self, _endpoint: &str, _duration_ms: f64) {}
    fn record_error(&self, _error_type: &str, _provider: &str) {}
    fn record_circuit_breaker_state(&self, _provider: &str, _state: &str) {}
    fn set_active_tokens(&self, _provider: &str, _count: u64) {}
}

/// No-op metrics singleton.
pub fn no_op_metrics() -> NoOpMetrics {
    NoOpMetrics
}

/// Metric entry for in-memory storage.
#[derive(Debug, Clone)]
pub struct MetricEntry {
    pub name: String,
    pub value: f64,
    pub labels: MetricLabels,
    pub timestamp: u64,
}

/// In-memory metrics for testing.
pub struct InMemoryMetrics {
    entries: Mutex<Vec<MetricEntry>>,
}

impl InMemoryMetrics {
    /// Create new in-memory metrics.
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(Vec::new()),
        }
    }

    /// Get all recorded entries.
    pub fn get_entries(&self) -> Vec<MetricEntry> {
        self.entries.lock().unwrap().clone()
    }

    /// Get entries by name.
    pub fn get_entries_by_name(&self, name: &str) -> Vec<MetricEntry> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.name == name)
            .cloned()
            .collect()
    }

    /// Clear all entries.
    pub fn clear(&self) {
        self.entries.lock().unwrap().clear();
    }

    fn record(&self, name: &str, value: f64, labels: MetricLabels) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        self.entries.lock().unwrap().push(MetricEntry {
            name: name.to_string(),
            value,
            labels,
            timestamp: now,
        });
    }
}

impl Default for InMemoryMetrics {
    fn default() -> Self {
        Self::new()
    }
}

impl OAuth2Metrics for InMemoryMetrics {
    fn record_authorization_request(&self, provider: &str) {
        let mut labels = MetricLabels::new();
        labels.insert("provider".to_string(), provider.to_string());
        self.record("oauth2_authorization_requests_total", 1.0, labels);
    }

    fn record_token_request(&self, provider: &str, grant_type: &str) {
        let mut labels = MetricLabels::new();
        labels.insert("provider".to_string(), provider.to_string());
        labels.insert("grant_type".to_string(), grant_type.to_string());
        self.record("oauth2_token_requests_total", 1.0, labels);
    }

    fn record_token_refresh(&self, provider: &str, success: bool) {
        let mut labels = MetricLabels::new();
        labels.insert("provider".to_string(), provider.to_string());
        labels.insert("success".to_string(), success.to_string());
        self.record("oauth2_token_refreshes_total", 1.0, labels);
    }

    fn record_token_revocation(&self, provider: &str, success: bool) {
        let mut labels = MetricLabels::new();
        labels.insert("provider".to_string(), provider.to_string());
        labels.insert("success".to_string(), success.to_string());
        self.record("oauth2_token_revocations_total", 1.0, labels);
    }

    fn record_token_introspection(&self, provider: &str, active: bool) {
        let mut labels = MetricLabels::new();
        labels.insert("provider".to_string(), provider.to_string());
        labels.insert("active".to_string(), active.to_string());
        self.record("oauth2_token_introspections_total", 1.0, labels);
    }

    fn record_request_duration(&self, endpoint: &str, duration_ms: f64) {
        let mut labels = MetricLabels::new();
        labels.insert("endpoint".to_string(), endpoint.to_string());
        self.record("oauth2_request_duration_ms", duration_ms, labels);
    }

    fn record_error(&self, error_type: &str, provider: &str) {
        let mut labels = MetricLabels::new();
        labels.insert("error_type".to_string(), error_type.to_string());
        labels.insert("provider".to_string(), provider.to_string());
        self.record("oauth2_errors_total", 1.0, labels);
    }

    fn record_circuit_breaker_state(&self, provider: &str, state: &str) {
        let mut labels = MetricLabels::new();
        labels.insert("provider".to_string(), provider.to_string());
        labels.insert("state".to_string(), state.to_string());
        self.record("oauth2_circuit_breaker_state", 1.0, labels);
    }

    fn set_active_tokens(&self, provider: &str, count: u64) {
        let mut labels = MetricLabels::new();
        labels.insert("provider".to_string(), provider.to_string());
        self.record("oauth2_active_tokens", count as f64, labels);
    }
}

/// Create in-memory metrics for testing.
pub fn create_in_memory_metrics() -> InMemoryMetrics {
    InMemoryMetrics::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_op_metrics() {
        let metrics = no_op_metrics();
        // Should not panic
        metrics.record_authorization_request("google");
        metrics.record_token_request("google", "authorization_code");
        metrics.record_error("invalid_grant", "google");
    }

    #[test]
    fn test_in_memory_metrics() {
        let metrics = InMemoryMetrics::new();

        metrics.record_authorization_request("google");
        metrics.record_token_request("google", "authorization_code");

        let entries = metrics.get_entries();
        assert_eq!(entries.len(), 2);

        let auth_entries = metrics.get_entries_by_name("oauth2_authorization_requests_total");
        assert_eq!(auth_entries.len(), 1);
        assert_eq!(
            auth_entries[0].labels.get("provider"),
            Some(&"google".to_string())
        );
    }

    #[test]
    fn test_clear_entries() {
        let metrics = InMemoryMetrics::new();
        metrics.record_authorization_request("google");

        assert!(!metrics.get_entries().is_empty());
        metrics.clear();
        assert!(metrics.get_entries().is_empty());
    }
}
