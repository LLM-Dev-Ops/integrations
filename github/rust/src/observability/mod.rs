//! Observability module providing logging, metrics, and tracing.

use crate::errors::RateLimitInfo;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, instrument, warn, Span};

/// Metrics collector for GitHub API operations.
#[derive(Debug, Default)]
pub struct Metrics {
    /// Total requests made.
    requests_total: AtomicU64,
    /// Successful requests.
    requests_success: AtomicU64,
    /// Failed requests.
    requests_failed: AtomicU64,
    /// Requests that were retried.
    requests_retried: AtomicU64,
    /// Requests blocked by rate limiting.
    requests_rate_limited: AtomicU64,
    /// Requests blocked by circuit breaker.
    requests_circuit_broken: AtomicU64,
    /// Total request latency in microseconds.
    latency_total_us: AtomicU64,
    /// Request count for latency calculation.
    latency_count: AtomicU64,
}

impl Metrics {
    /// Creates a new metrics collector.
    pub fn new() -> Self {
        Self::default()
    }

    /// Records a request.
    pub fn record_request(&self) {
        self.requests_total.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a successful request.
    pub fn record_success(&self) {
        self.requests_success.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a failed request.
    pub fn record_failure(&self) {
        self.requests_failed.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a retried request.
    pub fn record_retry(&self) {
        self.requests_retried.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a rate-limited request.
    pub fn record_rate_limited(&self) {
        self.requests_rate_limited.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a circuit-broken request.
    pub fn record_circuit_broken(&self) {
        self.requests_circuit_broken.fetch_add(1, Ordering::Relaxed);
    }

    /// Records request latency.
    pub fn record_latency(&self, duration: Duration) {
        let us = duration.as_micros() as u64;
        self.latency_total_us.fetch_add(us, Ordering::Relaxed);
        self.latency_count.fetch_add(1, Ordering::Relaxed);
    }

    /// Gets the total request count.
    pub fn total_requests(&self) -> u64 {
        self.requests_total.load(Ordering::Relaxed)
    }

    /// Gets the successful request count.
    pub fn successful_requests(&self) -> u64 {
        self.requests_success.load(Ordering::Relaxed)
    }

    /// Gets the failed request count.
    pub fn failed_requests(&self) -> u64 {
        self.requests_failed.load(Ordering::Relaxed)
    }

    /// Gets the retried request count.
    pub fn retried_requests(&self) -> u64 {
        self.requests_retried.load(Ordering::Relaxed)
    }

    /// Gets the rate-limited request count.
    pub fn rate_limited_requests(&self) -> u64 {
        self.requests_rate_limited.load(Ordering::Relaxed)
    }

    /// Gets the circuit-broken request count.
    pub fn circuit_broken_requests(&self) -> u64 {
        self.requests_circuit_broken.load(Ordering::Relaxed)
    }

    /// Gets the average latency in microseconds.
    pub fn average_latency_us(&self) -> u64 {
        let total = self.latency_total_us.load(Ordering::Relaxed);
        let count = self.latency_count.load(Ordering::Relaxed);
        if count == 0 {
            0
        } else {
            total / count
        }
    }

    /// Gets a snapshot of all metrics.
    pub fn snapshot(&self) -> MetricsSnapshot {
        MetricsSnapshot {
            requests_total: self.total_requests(),
            requests_success: self.successful_requests(),
            requests_failed: self.failed_requests(),
            requests_retried: self.retried_requests(),
            requests_rate_limited: self.rate_limited_requests(),
            requests_circuit_broken: self.circuit_broken_requests(),
            average_latency_us: self.average_latency_us(),
        }
    }

    /// Resets all metrics.
    pub fn reset(&self) {
        self.requests_total.store(0, Ordering::Relaxed);
        self.requests_success.store(0, Ordering::Relaxed);
        self.requests_failed.store(0, Ordering::Relaxed);
        self.requests_retried.store(0, Ordering::Relaxed);
        self.requests_rate_limited.store(0, Ordering::Relaxed);
        self.requests_circuit_broken.store(0, Ordering::Relaxed);
        self.latency_total_us.store(0, Ordering::Relaxed);
        self.latency_count.store(0, Ordering::Relaxed);
    }
}

/// A snapshot of metrics at a point in time.
#[derive(Debug, Clone)]
pub struct MetricsSnapshot {
    /// Total requests.
    pub requests_total: u64,
    /// Successful requests.
    pub requests_success: u64,
    /// Failed requests.
    pub requests_failed: u64,
    /// Retried requests.
    pub requests_retried: u64,
    /// Rate-limited requests.
    pub requests_rate_limited: u64,
    /// Circuit-broken requests.
    pub requests_circuit_broken: u64,
    /// Average latency in microseconds.
    pub average_latency_us: u64,
}

/// Request timer for measuring latency.
pub struct RequestTimer {
    start: Instant,
    metrics: Arc<Metrics>,
}

impl RequestTimer {
    /// Creates a new request timer.
    pub fn new(metrics: Arc<Metrics>) -> Self {
        metrics.record_request();
        Self {
            start: Instant::now(),
            metrics,
        }
    }

    /// Records success and latency.
    pub fn success(self) {
        self.metrics.record_success();
        self.metrics.record_latency(self.start.elapsed());
    }

    /// Records failure and latency.
    pub fn failure(self) {
        self.metrics.record_failure();
        self.metrics.record_latency(self.start.elapsed());
    }

    /// Gets elapsed time without recording.
    pub fn elapsed(&self) -> Duration {
        self.start.elapsed()
    }
}

/// Tracing hooks for GitHub API operations.
pub struct TracingHooks;

impl TracingHooks {
    /// Logs the start of an API request.
    #[instrument(skip(method, url))]
    pub fn on_request_start(method: &str, url: &str) {
        debug!(
            method = %method,
            url = %url,
            "GitHub API request started"
        );
    }

    /// Logs the completion of an API request.
    #[instrument(skip(method, url, status, duration))]
    pub fn on_request_complete(method: &str, url: &str, status: u16, duration: Duration) {
        info!(
            method = %method,
            url = %url,
            status = status,
            duration_ms = duration.as_millis() as u64,
            "GitHub API request completed"
        );
    }

    /// Logs a request error.
    #[instrument(skip(method, url, error))]
    pub fn on_request_error(method: &str, url: &str, error: &str) {
        error!(
            method = %method,
            url = %url,
            error = %error,
            "GitHub API request failed"
        );
    }

    /// Logs a retry attempt.
    #[instrument(skip(method, url, attempt, delay))]
    pub fn on_retry(method: &str, url: &str, attempt: u32, delay: Duration) {
        warn!(
            method = %method,
            url = %url,
            attempt = attempt,
            delay_ms = delay.as_millis() as u64,
            "Retrying GitHub API request"
        );
    }

    /// Logs rate limit info.
    #[instrument(skip(info))]
    pub fn on_rate_limit_update(info: &RateLimitInfo) {
        debug!(
            limit = info.limit,
            remaining = info.remaining,
            reset_at = %info.reset_at,
            resource = info.resource.as_deref().unwrap_or("core"),
            "Rate limit updated"
        );
    }

    /// Logs rate limit exceeded.
    #[instrument(skip(info))]
    pub fn on_rate_limit_exceeded(info: &RateLimitInfo) {
        warn!(
            limit = info.limit,
            remaining = info.remaining,
            reset_at = %info.reset_at,
            resource = info.resource.as_deref().unwrap_or("core"),
            "Rate limit exceeded"
        );
    }

    /// Logs circuit breaker state change.
    #[instrument(skip(old_state, new_state))]
    pub fn on_circuit_breaker_state_change(old_state: &str, new_state: &str) {
        warn!(
            old_state = %old_state,
            new_state = %new_state,
            "Circuit breaker state changed"
        );
    }

    /// Logs authentication token refresh.
    #[instrument]
    pub fn on_auth_token_refresh() {
        info!("Authentication token refreshed");
    }

    /// Logs webhook verification.
    #[instrument(skip(event_type, success))]
    pub fn on_webhook_verified(event_type: &str, success: bool) {
        if success {
            debug!(
                event_type = %event_type,
                "Webhook signature verified successfully"
            );
        } else {
            warn!(
                event_type = %event_type,
                "Webhook signature verification failed"
            );
        }
    }
}

/// Logger configuration.
#[derive(Debug, Clone)]
pub struct LogConfig {
    /// Log level.
    pub level: LogLevel,
    /// Include request bodies in logs.
    pub log_request_bodies: bool,
    /// Include response bodies in logs.
    pub log_response_bodies: bool,
    /// Maximum body length to log.
    pub max_body_length: usize,
    /// Redact sensitive headers.
    pub redact_sensitive: bool,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: LogLevel::Info,
            log_request_bodies: false,
            log_response_bodies: false,
            max_body_length: 1024,
            redact_sensitive: true,
        }
    }
}

/// Log level.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    /// Trace level (most verbose).
    Trace,
    /// Debug level.
    Debug,
    /// Info level.
    Info,
    /// Warning level.
    Warn,
    /// Error level (least verbose).
    Error,
}

/// Sensitive headers that should be redacted in logs.
pub const SENSITIVE_HEADERS: &[&str] = &[
    "authorization",
    "x-github-token",
    "x-access-token",
    "cookie",
    "set-cookie",
];

/// Redacts sensitive values in headers.
pub fn redact_header(name: &str, value: &str) -> String {
    if SENSITIVE_HEADERS.contains(&name.to_lowercase().as_str()) {
        "[REDACTED]".to_string()
    } else {
        value.to_string()
    }
}

/// Health check result.
#[derive(Debug, Clone)]
pub struct HealthCheck {
    /// Overall health status.
    pub healthy: bool,
    /// API connectivity status.
    pub api_connected: bool,
    /// Rate limit status.
    pub rate_limit_ok: bool,
    /// Circuit breaker status.
    pub circuit_breaker_ok: bool,
    /// Remaining rate limit.
    pub rate_limit_remaining: Option<u32>,
    /// Time until rate limit reset.
    pub rate_limit_reset_in: Option<Duration>,
    /// Last successful request time.
    pub last_success: Option<std::time::SystemTime>,
    /// Error message if unhealthy.
    pub error: Option<String>,
}

impl HealthCheck {
    /// Creates a healthy check result.
    pub fn healthy() -> Self {
        Self {
            healthy: true,
            api_connected: true,
            rate_limit_ok: true,
            circuit_breaker_ok: true,
            rate_limit_remaining: None,
            rate_limit_reset_in: None,
            last_success: Some(std::time::SystemTime::now()),
            error: None,
        }
    }

    /// Creates an unhealthy check result.
    pub fn unhealthy(error: impl Into<String>) -> Self {
        Self {
            healthy: false,
            api_connected: false,
            rate_limit_ok: false,
            circuit_breaker_ok: false,
            rate_limit_remaining: None,
            rate_limit_reset_in: None,
            last_success: None,
            error: Some(error.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics() {
        let metrics = Metrics::new();

        metrics.record_request();
        metrics.record_success();
        metrics.record_latency(Duration::from_millis(100));

        assert_eq!(metrics.total_requests(), 1);
        assert_eq!(metrics.successful_requests(), 1);
        assert_eq!(metrics.failed_requests(), 0);
        assert!(metrics.average_latency_us() >= 100_000);
    }

    #[test]
    fn test_metrics_snapshot() {
        let metrics = Metrics::new();

        metrics.record_request();
        metrics.record_request();
        metrics.record_success();
        metrics.record_failure();

        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.requests_total, 2);
        assert_eq!(snapshot.requests_success, 1);
        assert_eq!(snapshot.requests_failed, 1);
    }

    #[test]
    fn test_redact_header() {
        assert_eq!(redact_header("Authorization", "Bearer token"), "[REDACTED]");
        assert_eq!(redact_header("Content-Type", "application/json"), "application/json");
    }
}
