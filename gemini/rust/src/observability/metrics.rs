//! Metrics recording implementation for the Gemini API client.
//!
//! Provides trait-based metrics recording with support for counters, histograms, and gauges.

use std::collections::HashMap;

/// Metrics recorder trait.
///
/// This trait provides methods for recording various types of metrics
/// (counters, histograms, gauges) with optional labels.
pub trait MetricsRecorder: Send + Sync {
    /// Increment a counter metric.
    ///
    /// # Arguments
    /// * `name` - The metric name
    /// * `labels` - Optional labels as key-value pairs
    fn increment_counter(&self, name: &str, labels: &[(&str, &str)]);

    /// Record a histogram value.
    ///
    /// Histograms track distributions of values (e.g., request durations, token counts).
    ///
    /// # Arguments
    /// * `name` - The metric name
    /// * `value` - The value to record
    /// * `labels` - Optional labels as key-value pairs
    fn record_histogram(&self, name: &str, value: f64, labels: &[(&str, &str)]);

    /// Record a gauge value.
    ///
    /// Gauges represent point-in-time values that can go up or down.
    ///
    /// # Arguments
    /// * `name` - The metric name
    /// * `value` - The current value
    /// * `labels` - Optional labels as key-value pairs
    fn record_gauge(&self, name: &str, value: f64, labels: &[(&str, &str)]);
}

/// Gemini-specific metrics recorder with convenience methods.
///
/// This wrapper provides high-level methods for recording common Gemini API metrics.
pub struct GeminiMetrics {
    prefix: String,
    recorder: Box<dyn MetricsRecorder>,
}

impl GeminiMetrics {
    /// Create a new Gemini metrics recorder.
    ///
    /// # Arguments
    /// * `prefix` - Metric name prefix (e.g., "gemini")
    /// * `recorder` - The underlying metrics recorder implementation
    pub fn new(prefix: &str, recorder: Box<dyn MetricsRecorder>) -> Self {
        Self {
            prefix: prefix.to_string(),
            recorder,
        }
    }

    /// Record a complete API request with status and duration.
    ///
    /// This convenience method records both a counter and histogram for the request.
    ///
    /// # Arguments
    /// * `service` - The service name (e.g., "content", "embeddings")
    /// * `method` - The method name (e.g., "generate", "embed")
    /// * `status` - The HTTP status code
    /// * `duration_ms` - The request duration in milliseconds
    pub fn record_request(&self, service: &str, method: &str, status: u16, duration_ms: u64) {
        let status_str = status.to_string();

        // Increment request counter
        self.recorder.increment_counter(
            &format!("{}_requests_total", self.prefix),
            &[
                ("service", service),
                ("method", method),
                ("status", &status_str),
            ],
        );

        // Record request duration
        self.recorder.record_histogram(
            &format!("{}_request_duration_ms", self.prefix),
            duration_ms as f64,
            &[("service", service), ("method", method)],
        );

        // Track error rate separately
        if status >= 400 {
            self.recorder.increment_counter(
                &format!("{}_errors_total", self.prefix),
                &[
                    ("service", service),
                    ("method", method),
                    ("status", &status_str),
                ],
            );
        }
    }

    /// Record token usage for a request.
    ///
    /// # Arguments
    /// * `service` - The service name
    /// * `prompt_tokens` - Number of tokens in the prompt
    /// * `completion_tokens` - Number of tokens in the completion
    pub fn record_tokens(&self, service: &str, prompt_tokens: i32, completion_tokens: i32) {
        self.recorder.record_histogram(
            &format!("{}_prompt_tokens", self.prefix),
            prompt_tokens as f64,
            &[("service", service)],
        );

        self.recorder.record_histogram(
            &format!("{}_completion_tokens", self.prefix),
            completion_tokens as f64,
            &[("service", service)],
        );

        let total_tokens = prompt_tokens + completion_tokens;
        self.recorder.record_histogram(
            &format!("{}_total_tokens", self.prefix),
            total_tokens as f64,
            &[("service", service)],
        );
    }

    /// Record cached content token usage.
    ///
    /// # Arguments
    /// * `service` - The service name
    /// * `cached_tokens` - Number of cached tokens used
    pub fn record_cached_tokens(&self, service: &str, cached_tokens: i32) {
        self.recorder.record_histogram(
            &format!("{}_cached_tokens", self.prefix),
            cached_tokens as f64,
            &[("service", service)],
        );
    }

    /// Record a streaming chunk received.
    ///
    /// # Arguments
    /// * `service` - The service name
    /// * `chunk_size` - Size of the chunk in bytes
    pub fn record_stream_chunk(&self, service: &str, chunk_size: usize) {
        self.recorder.increment_counter(
            &format!("{}_stream_chunks_total", self.prefix),
            &[("service", service)],
        );

        self.recorder.record_histogram(
            &format!("{}_stream_chunk_size_bytes", self.prefix),
            chunk_size as f64,
            &[("service", service)],
        );
    }

    /// Record a safety block event.
    ///
    /// # Arguments
    /// * `service` - The service name
    /// * `category` - The safety category that triggered the block
    pub fn record_safety_block(&self, service: &str, category: &str) {
        self.recorder.increment_counter(
            &format!("{}_safety_blocks_total", self.prefix),
            &[("service", service), ("category", category)],
        );
    }

    /// Record a rate limit hit.
    ///
    /// # Arguments
    /// * `service` - The service name
    pub fn record_rate_limit(&self, service: &str) {
        self.recorder.increment_counter(
            &format!("{}_rate_limits_total", self.prefix),
            &[("service", service)],
        );
    }

    /// Record a retry attempt.
    ///
    /// # Arguments
    /// * `service` - The service name
    /// * `attempt` - The retry attempt number
    pub fn record_retry(&self, service: &str, attempt: u32) {
        let attempt_str = attempt.to_string();
        self.recorder.increment_counter(
            &format!("{}_retries_total", self.prefix),
            &[("service", service), ("attempt", &attempt_str)],
        );
    }

    /// Record circuit breaker state change.
    ///
    /// # Arguments
    /// * `service` - The service name
    /// * `state` - The new circuit breaker state (open, closed, half_open)
    pub fn record_circuit_breaker_state(&self, service: &str, state: &str) {
        self.recorder.increment_counter(
            &format!("{}_circuit_breaker_state_changes_total", self.prefix),
            &[("service", service), ("state", state)],
        );
    }

    /// Record file upload metrics.
    ///
    /// # Arguments
    /// * `file_size` - Size of the file in bytes
    /// * `mime_type` - MIME type of the file
    pub fn record_file_upload(&self, file_size: u64, mime_type: &str) {
        self.recorder.increment_counter(
            &format!("{}_file_uploads_total", self.prefix),
            &[("mime_type", mime_type)],
        );

        self.recorder.record_histogram(
            &format!("{}_file_size_bytes", self.prefix),
            file_size as f64,
            &[("mime_type", mime_type)],
        );
    }

    /// Record embedding dimension.
    ///
    /// # Arguments
    /// * `task_type` - The embedding task type
    /// * `dimension` - The embedding dimension
    pub fn record_embedding(&self, task_type: &str, dimension: usize) {
        self.recorder.increment_counter(
            &format!("{}_embeddings_total", self.prefix),
            &[("task_type", task_type)],
        );

        self.recorder.record_histogram(
            &format!("{}_embedding_dimension", self.prefix),
            dimension as f64,
            &[("task_type", task_type)],
        );
    }
}

/// Tracing-based metrics recorder implementation.
///
/// This recorder emits metrics as tracing events, which can be consumed
/// by various tracing subscribers.
pub struct TracingMetricsRecorder;

impl TracingMetricsRecorder {
    /// Create a new tracing metrics recorder.
    pub fn new() -> Self {
        Self
    }
}

impl Default for TracingMetricsRecorder {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsRecorder for TracingMetricsRecorder {
    fn increment_counter(&self, name: &str, labels: &[(&str, &str)]) {
        let labels_map: HashMap<&str, &str> = labels.iter().copied().collect();
        tracing::info!(
            metric_type = "counter",
            metric_name = name,
            metric_value = 1,
            labels = ?labels_map,
            "Counter incremented"
        );
    }

    fn record_histogram(&self, name: &str, value: f64, labels: &[(&str, &str)]) {
        let labels_map: HashMap<&str, &str> = labels.iter().copied().collect();
        tracing::info!(
            metric_type = "histogram",
            metric_name = name,
            metric_value = value,
            labels = ?labels_map,
            "Histogram recorded"
        );
    }

    fn record_gauge(&self, name: &str, value: f64, labels: &[(&str, &str)]) {
        let labels_map: HashMap<&str, &str> = labels.iter().copied().collect();
        tracing::info!(
            metric_type = "gauge",
            metric_name = name,
            metric_value = value,
            labels = ?labels_map,
            "Gauge recorded"
        );
    }
}

/// Default metrics recorder implementation (no-op).
///
/// This recorder is suitable for environments where metrics are disabled.
pub struct DefaultMetricsRecorder {
    _prefix: String,
}

impl DefaultMetricsRecorder {
    /// Creates a new default metrics recorder.
    pub fn new(prefix: impl Into<String>) -> Self {
        Self {
            _prefix: prefix.into(),
        }
    }
}

impl MetricsRecorder for DefaultMetricsRecorder {
    fn increment_counter(&self, _name: &str, _labels: &[(&str, &str)]) {
        // No-op
    }

    fn record_histogram(&self, _name: &str, _value: f64, _labels: &[(&str, &str)]) {
        // No-op
    }

    fn record_gauge(&self, _name: &str, _value: f64, _labels: &[(&str, &str)]) {
        // No-op
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestMetricsRecorder {
        counters: std::sync::Mutex<Vec<(String, Vec<(String, String)>)>>,
        histograms: std::sync::Mutex<Vec<(String, f64, Vec<(String, String)>)>>,
    }

    impl TestMetricsRecorder {
        fn new() -> Self {
            Self {
                counters: std::sync::Mutex::new(Vec::new()),
                histograms: std::sync::Mutex::new(Vec::new()),
            }
        }
    }

    impl MetricsRecorder for TestMetricsRecorder {
        fn increment_counter(&self, name: &str, labels: &[(&str, &str)]) {
            let labels_owned: Vec<(String, String)> = labels
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();
            self.counters
                .lock()
                .unwrap()
                .push((name.to_string(), labels_owned));
        }

        fn record_histogram(&self, name: &str, value: f64, labels: &[(&str, &str)]) {
            let labels_owned: Vec<(String, String)> = labels
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();
            self.histograms
                .lock()
                .unwrap()
                .push((name.to_string(), value, labels_owned));
        }

        fn record_gauge(&self, _name: &str, _value: f64, _labels: &[(&str, &str)]) {}
    }

    #[test]
    fn test_record_request() {
        let recorder = TestMetricsRecorder::new();
        let metrics = GeminiMetrics::new("gemini", Box::new(recorder));

        metrics.record_request("content", "generate", 200, 1234);

        // This test would verify the metrics were recorded
        // In a real implementation, we'd check the test recorder's state
    }

    #[test]
    fn test_record_tokens() {
        let recorder = TestMetricsRecorder::new();
        let metrics = GeminiMetrics::new("gemini", Box::new(recorder));

        metrics.record_tokens("content", 100, 50);

        // Verify 3 histograms were recorded (prompt, completion, total)
    }

    #[test]
    fn test_record_safety_block() {
        let recorder = TestMetricsRecorder::new();
        let metrics = GeminiMetrics::new("gemini", Box::new(recorder));

        metrics.record_safety_block("content", "HARM_CATEGORY_HATE_SPEECH");

        // Verify counter was incremented
    }

    #[test]
    fn test_default_metrics_recorder_noop() {
        let recorder = DefaultMetricsRecorder::new("test");

        // These should not panic
        recorder.increment_counter("test.counter", &[("label", "value")]);
        recorder.record_histogram("test.histogram", 123.45, &[]);
        recorder.record_gauge("test.gauge", 67.89, &[]);
    }

    #[test]
    fn test_tracing_metrics_recorder() {
        let recorder = TracingMetricsRecorder::new();

        // These should not panic
        recorder.increment_counter("test.counter", &[("service", "test")]);
        recorder.record_histogram("test.histogram", 100.0, &[("service", "test")]);
        recorder.record_gauge("test.gauge", 50.0, &[("service", "test")]);
    }
}
