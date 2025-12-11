//! Structured logging for the Cohere client.

use serde::Serialize;
use std::collections::HashMap;
use tracing::{debug, error, info, warn, Level};

/// Log level
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    /// Debug level - verbose debugging information
    Debug,
    /// Info level - general information
    Info,
    /// Warn level - warnings
    Warn,
    /// Error level - errors
    Error,
}

impl From<LogLevel> for Level {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Debug => Level::DEBUG,
            LogLevel::Info => Level::INFO,
            LogLevel::Warn => Level::WARN,
            LogLevel::Error => Level::ERROR,
        }
    }
}

/// Log format
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    /// Pretty printed format for development
    Pretty,
    /// JSON format for production
    Json,
    /// Compact format
    Compact,
}

/// Configuration for logging
#[derive(Debug, Clone)]
pub struct LoggingConfig {
    /// Minimum log level
    pub level: LogLevel,
    /// Log format
    pub format: LogFormat,
    /// Whether to include timestamps
    pub include_timestamps: bool,
    /// Whether to include target (module path)
    pub include_target: bool,
    /// Whether to redact sensitive information
    pub redact_sensitive: bool,
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: LogLevel::Info,
            format: LogFormat::Pretty,
            include_timestamps: true,
            include_target: false,
            redact_sensitive: true,
        }
    }
}

impl LoggingConfig {
    /// Create a new logging configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the log level
    pub fn with_level(mut self, level: LogLevel) -> Self {
        self.level = level;
        self
    }

    /// Set the log format
    pub fn with_format(mut self, format: LogFormat) -> Self {
        self.format = format;
        self
    }

    /// Enable or disable timestamps
    pub fn with_timestamps(mut self, include: bool) -> Self {
        self.include_timestamps = include;
        self
    }

    /// Enable or disable target
    pub fn with_target(mut self, include: bool) -> Self {
        self.include_target = include;
        self
    }

    /// Enable or disable sensitive data redaction
    pub fn with_redaction(mut self, redact: bool) -> Self {
        self.redact_sensitive = redact;
        self
    }

    /// Create configuration for development
    pub fn development() -> Self {
        Self {
            level: LogLevel::Debug,
            format: LogFormat::Pretty,
            include_timestamps: true,
            include_target: true,
            redact_sensitive: false,
        }
    }

    /// Create configuration for production
    pub fn production() -> Self {
        Self {
            level: LogLevel::Info,
            format: LogFormat::Json,
            include_timestamps: true,
            include_target: false,
            redact_sensitive: true,
        }
    }
}

/// Structured logger for Cohere operations
pub struct StructuredLogger {
    config: LoggingConfig,
}

impl StructuredLogger {
    /// Create a new structured logger
    pub fn new(config: LoggingConfig) -> Self {
        Self { config }
    }

    /// Log a request
    pub fn log_request(&self, service: &str, operation: &str, attributes: HashMap<String, String>) {
        let attrs = self.redact_attributes(attributes);
        info!(
            service = service,
            operation = operation,
            attributes = ?attrs,
            "Starting request"
        );
    }

    /// Log a response
    pub fn log_response(
        &self,
        service: &str,
        operation: &str,
        status: &str,
        duration_ms: u64,
        attributes: HashMap<String, String>,
    ) {
        let attrs = self.redact_attributes(attributes);
        info!(
            service = service,
            operation = operation,
            status = status,
            duration_ms = duration_ms,
            attributes = ?attrs,
            "Request completed"
        );
    }

    /// Log an error
    pub fn log_error(
        &self,
        service: &str,
        operation: &str,
        error: &str,
        attributes: HashMap<String, String>,
    ) {
        let attrs = self.redact_attributes(attributes);
        error!(
            service = service,
            operation = operation,
            error = error,
            attributes = ?attrs,
            "Request failed"
        );
    }

    /// Log a warning
    pub fn log_warning(&self, message: &str, attributes: HashMap<String, String>) {
        let attrs = self.redact_attributes(attributes);
        warn!(message = message, attributes = ?attrs, "Warning");
    }

    /// Log debug information
    pub fn log_debug(&self, message: &str, attributes: HashMap<String, String>) {
        let attrs = self.redact_attributes(attributes);
        debug!(message = message, attributes = ?attrs, "Debug");
    }

    /// Redact sensitive attributes if configured
    fn redact_attributes(&self, mut attrs: HashMap<String, String>) -> HashMap<String, String> {
        if !self.config.redact_sensitive {
            return attrs;
        }

        let sensitive_keys = [
            "api_key",
            "authorization",
            "auth",
            "token",
            "secret",
            "password",
            "credential",
        ];

        for key in attrs.keys().cloned().collect::<Vec<_>>() {
            let key_lower = key.to_lowercase();
            if sensitive_keys.iter().any(|s| key_lower.contains(s)) {
                attrs.insert(key, "[REDACTED]".to_string());
            }
        }

        attrs
    }
}

impl Default for StructuredLogger {
    fn default() -> Self {
        Self::new(LoggingConfig::default())
    }
}

/// A log entry for serialization
#[derive(Debug, Serialize)]
pub struct LogEntry {
    /// Timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    /// Log level
    pub level: String,
    /// Message
    pub message: String,
    /// Service name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service: Option<String>,
    /// Operation name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation: Option<String>,
    /// Additional attributes
    #[serde(flatten)]
    pub attributes: HashMap<String, serde_json::Value>,
}

impl LogEntry {
    /// Create a new log entry
    pub fn new(level: &str, message: impl Into<String>) -> Self {
        Self {
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
            level: level.to_string(),
            message: message.into(),
            service: None,
            operation: None,
            attributes: HashMap::new(),
        }
    }

    /// Set the service
    pub fn with_service(mut self, service: impl Into<String>) -> Self {
        self.service = Some(service.into());
        self
    }

    /// Set the operation
    pub fn with_operation(mut self, operation: impl Into<String>) -> Self {
        self.operation = Some(operation.into());
        self
    }

    /// Add an attribute
    pub fn with_attribute(
        mut self,
        key: impl Into<String>,
        value: impl Into<serde_json::Value>,
    ) -> Self {
        self.attributes.insert(key.into(), value.into());
        self
    }

    /// Convert to JSON string
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_logging_config() {
        let config = LoggingConfig::new()
            .with_level(LogLevel::Debug)
            .with_format(LogFormat::Json);

        assert_eq!(config.level, LogLevel::Debug);
        assert_eq!(config.format, LogFormat::Json);
    }

    #[test]
    fn test_development_config() {
        let config = LoggingConfig::development();
        assert_eq!(config.level, LogLevel::Debug);
        assert!(!config.redact_sensitive);
    }

    #[test]
    fn test_production_config() {
        let config = LoggingConfig::production();
        assert_eq!(config.level, LogLevel::Info);
        assert_eq!(config.format, LogFormat::Json);
        assert!(config.redact_sensitive);
    }

    #[test]
    fn test_redact_attributes() {
        let logger = StructuredLogger::new(LoggingConfig::default());

        let mut attrs = HashMap::new();
        attrs.insert("api_key".to_string(), "secret123".to_string());
        attrs.insert("model".to_string(), "command".to_string());

        let redacted = logger.redact_attributes(attrs);

        assert_eq!(redacted.get("api_key"), Some(&"[REDACTED]".to_string()));
        assert_eq!(redacted.get("model"), Some(&"command".to_string()));
    }

    #[test]
    fn test_log_entry() {
        let entry = LogEntry::new("INFO", "Test message")
            .with_service("cohere")
            .with_operation("chat")
            .with_attribute("duration_ms", serde_json::json!(100));

        assert_eq!(entry.level, "INFO");
        assert_eq!(entry.message, "Test message");
        assert_eq!(entry.service, Some("cohere".to_string()));
        assert!(entry.attributes.contains_key("duration_ms"));
    }

    #[test]
    fn test_log_entry_to_json() {
        let entry = LogEntry::new("INFO", "Test").with_service("test");

        let json = entry.to_json().unwrap();
        assert!(json.contains("\"level\":\"INFO\""));
        assert!(json.contains("\"message\":\"Test\""));
    }
}
