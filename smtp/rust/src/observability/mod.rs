//! Observability infrastructure for SMTP operations.
//!
//! Provides logging, metrics, and tracing support.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// Log levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    /// Trace level (most verbose).
    Trace,
    /// Debug level.
    Debug,
    /// Info level.
    Info,
    /// Warning level.
    Warn,
    /// Error level.
    Error,
}

impl LogLevel {
    /// Returns the level name.
    pub fn name(&self) -> &'static str {
        match self {
            LogLevel::Trace => "TRACE",
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
        }
    }
}

/// SMTP metrics collector.
#[derive(Debug, Default)]
pub struct SmtpMetrics {
    /// Total emails sent successfully.
    pub emails_sent: AtomicU64,
    /// Total emails failed.
    pub emails_failed: AtomicU64,
    /// Total connection attempts.
    pub connection_attempts: AtomicU64,
    /// Successful connections.
    pub connections_successful: AtomicU64,
    /// Failed connections.
    pub connections_failed: AtomicU64,
    /// Total authentication attempts.
    pub auth_attempts: AtomicU64,
    /// Successful authentications.
    pub auth_successful: AtomicU64,
    /// Failed authentications.
    pub auth_failed: AtomicU64,
    /// TLS upgrades.
    pub tls_upgrades: AtomicU64,
    /// Total retries.
    pub retries: AtomicU64,
    /// Circuit breaker trips.
    pub circuit_trips: AtomicU64,
    /// Rate limit hits.
    pub rate_limits: AtomicU64,
}

impl SmtpMetrics {
    /// Creates a new metrics collector.
    pub fn new() -> Self {
        Self::default()
    }

    /// Records a successful email send.
    pub fn record_send_success(&self) {
        self.emails_sent.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a failed email send.
    pub fn record_send_failure(&self) {
        self.emails_failed.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a connection attempt.
    pub fn record_connection_attempt(&self, success: bool) {
        self.connection_attempts.fetch_add(1, Ordering::Relaxed);
        if success {
            self.connections_successful.fetch_add(1, Ordering::Relaxed);
        } else {
            self.connections_failed.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Records an authentication attempt.
    pub fn record_auth_attempt(&self, success: bool) {
        self.auth_attempts.fetch_add(1, Ordering::Relaxed);
        if success {
            self.auth_successful.fetch_add(1, Ordering::Relaxed);
        } else {
            self.auth_failed.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Records a TLS upgrade.
    pub fn record_tls_upgrade(&self) {
        self.tls_upgrades.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a retry.
    pub fn record_retry(&self) {
        self.retries.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a circuit breaker trip.
    pub fn record_circuit_trip(&self) {
        self.circuit_trips.fetch_add(1, Ordering::Relaxed);
    }

    /// Records a rate limit hit.
    pub fn record_rate_limit(&self) {
        self.rate_limits.fetch_add(1, Ordering::Relaxed);
    }

    /// Returns a snapshot of all metrics.
    pub fn snapshot(&self) -> MetricsSnapshot {
        MetricsSnapshot {
            emails_sent: self.emails_sent.load(Ordering::Relaxed),
            emails_failed: self.emails_failed.load(Ordering::Relaxed),
            connection_attempts: self.connection_attempts.load(Ordering::Relaxed),
            connections_successful: self.connections_successful.load(Ordering::Relaxed),
            connections_failed: self.connections_failed.load(Ordering::Relaxed),
            auth_attempts: self.auth_attempts.load(Ordering::Relaxed),
            auth_successful: self.auth_successful.load(Ordering::Relaxed),
            auth_failed: self.auth_failed.load(Ordering::Relaxed),
            tls_upgrades: self.tls_upgrades.load(Ordering::Relaxed),
            retries: self.retries.load(Ordering::Relaxed),
            circuit_trips: self.circuit_trips.load(Ordering::Relaxed),
            rate_limits: self.rate_limits.load(Ordering::Relaxed),
        }
    }

    /// Resets all metrics.
    pub fn reset(&self) {
        self.emails_sent.store(0, Ordering::Relaxed);
        self.emails_failed.store(0, Ordering::Relaxed);
        self.connection_attempts.store(0, Ordering::Relaxed);
        self.connections_successful.store(0, Ordering::Relaxed);
        self.connections_failed.store(0, Ordering::Relaxed);
        self.auth_attempts.store(0, Ordering::Relaxed);
        self.auth_successful.store(0, Ordering::Relaxed);
        self.auth_failed.store(0, Ordering::Relaxed);
        self.tls_upgrades.store(0, Ordering::Relaxed);
        self.retries.store(0, Ordering::Relaxed);
        self.circuit_trips.store(0, Ordering::Relaxed);
        self.rate_limits.store(0, Ordering::Relaxed);
    }
}

/// Snapshot of metrics at a point in time.
#[derive(Debug, Clone)]
pub struct MetricsSnapshot {
    /// Total emails sent successfully.
    pub emails_sent: u64,
    /// Total emails failed.
    pub emails_failed: u64,
    /// Total connection attempts.
    pub connection_attempts: u64,
    /// Successful connections.
    pub connections_successful: u64,
    /// Failed connections.
    pub connections_failed: u64,
    /// Total authentication attempts.
    pub auth_attempts: u64,
    /// Successful authentications.
    pub auth_successful: u64,
    /// Failed authentications.
    pub auth_failed: u64,
    /// TLS upgrades.
    pub tls_upgrades: u64,
    /// Total retries.
    pub retries: u64,
    /// Circuit breaker trips.
    pub circuit_trips: u64,
    /// Rate limit hits.
    pub rate_limits: u64,
}

impl MetricsSnapshot {
    /// Returns the email success rate.
    pub fn success_rate(&self) -> f64 {
        let total = self.emails_sent + self.emails_failed;
        if total == 0 {
            1.0
        } else {
            self.emails_sent as f64 / total as f64
        }
    }

    /// Returns the connection success rate.
    pub fn connection_success_rate(&self) -> f64 {
        if self.connection_attempts == 0 {
            1.0
        } else {
            self.connections_successful as f64 / self.connection_attempts as f64
        }
    }

    /// Returns the authentication success rate.
    pub fn auth_success_rate(&self) -> f64 {
        if self.auth_attempts == 0 {
            1.0
        } else {
            self.auth_successful as f64 / self.auth_attempts as f64
        }
    }
}

/// Timer for measuring operation duration.
#[derive(Debug)]
pub struct Timer {
    start: Instant,
    name: String,
}

impl Timer {
    /// Creates and starts a new timer.
    pub fn start(name: impl Into<String>) -> Self {
        Self {
            start: Instant::now(),
            name: name.into(),
        }
    }

    /// Returns the elapsed time.
    pub fn elapsed(&self) -> Duration {
        self.start.elapsed()
    }

    /// Stops the timer and returns the duration.
    pub fn stop(self) -> Duration {
        let elapsed = self.start.elapsed();

        #[cfg(feature = "tracing")]
        tracing::debug!(
            timer = %self.name,
            duration_ms = elapsed.as_millis(),
            "Timer stopped"
        );

        elapsed
    }
}

/// Request context for tracing.
#[derive(Debug, Clone)]
pub struct RequestContext {
    /// Unique request ID.
    pub request_id: String,
    /// SMTP host.
    pub host: String,
    /// SMTP port.
    pub port: u16,
    /// Sender address.
    pub from: Option<String>,
    /// Recipient count.
    pub recipient_count: usize,
    /// Has attachments.
    pub has_attachments: bool,
    /// Message size.
    pub message_size: usize,
}

impl RequestContext {
    /// Creates a new request context.
    pub fn new(host: impl Into<String>, port: u16) -> Self {
        Self {
            request_id: uuid::Uuid::new_v4().to_string(),
            host: host.into(),
            port,
            from: None,
            recipient_count: 0,
            has_attachments: false,
            message_size: 0,
        }
    }

    /// Sets the sender.
    pub fn with_from(mut self, from: impl Into<String>) -> Self {
        self.from = Some(from.into());
        self
    }

    /// Sets the recipient count.
    pub fn with_recipients(mut self, count: usize) -> Self {
        self.recipient_count = count;
        self
    }

    /// Sets the attachments flag.
    pub fn with_attachments(mut self, has_attachments: bool) -> Self {
        self.has_attachments = has_attachments;
        self
    }

    /// Sets the message size.
    pub fn with_message_size(mut self, size: usize) -> Self {
        self.message_size = size;
        self
    }
}

/// Structured log entry.
#[derive(Debug, Clone)]
pub struct LogEntry {
    /// Log level.
    pub level: LogLevel,
    /// Message.
    pub message: String,
    /// Request context.
    pub context: Option<RequestContext>,
    /// Additional fields.
    pub fields: Vec<(String, String)>,
}

impl LogEntry {
    /// Creates a new log entry.
    pub fn new(level: LogLevel, message: impl Into<String>) -> Self {
        Self {
            level,
            message: message.into(),
            context: None,
            fields: Vec::new(),
        }
    }

    /// Sets the request context.
    pub fn with_context(mut self, context: RequestContext) -> Self {
        self.context = Some(context);
        self
    }

    /// Adds a field.
    pub fn with_field(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.fields.push((key.into(), value.into()));
        self
    }

    /// Formats the log entry as JSON.
    pub fn to_json(&self) -> String {
        let mut obj = serde_json::Map::new();
        obj.insert("level".to_string(), serde_json::Value::String(self.level.name().to_string()));
        obj.insert("message".to_string(), serde_json::Value::String(self.message.clone()));

        if let Some(ctx) = &self.context {
            obj.insert("request_id".to_string(), serde_json::Value::String(ctx.request_id.clone()));
            obj.insert("host".to_string(), serde_json::Value::String(ctx.host.clone()));
            obj.insert("port".to_string(), serde_json::Value::Number(ctx.port.into()));
        }

        for (key, value) in &self.fields {
            obj.insert(key.clone(), serde_json::Value::String(value.clone()));
        }

        serde_json::to_string(&obj).unwrap_or_else(|_| self.message.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics() {
        let metrics = SmtpMetrics::new();

        metrics.record_send_success();
        metrics.record_send_success();
        metrics.record_send_failure();

        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.emails_sent, 2);
        assert_eq!(snapshot.emails_failed, 1);
        assert!((snapshot.success_rate() - 0.666).abs() < 0.01);
    }

    #[test]
    fn test_timer() {
        let timer = Timer::start("test");
        std::thread::sleep(std::time::Duration::from_millis(10));
        let duration = timer.stop();
        assert!(duration >= std::time::Duration::from_millis(10));
    }

    #[test]
    fn test_log_entry_json() {
        let entry = LogEntry::new(LogLevel::Info, "Test message")
            .with_field("key", "value");

        let json = entry.to_json();
        assert!(json.contains("INFO"));
        assert!(json.contains("Test message"));
        assert!(json.contains("key"));
    }
}
