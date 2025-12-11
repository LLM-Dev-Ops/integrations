//! Structured logging implementation for the Gemini API client.
//!
//! Provides trait-based logging with structured field support.

use serde_json::Value;
use crate::config::LogLevel;

/// Logger trait for structured logging.
///
/// This trait provides methods for logging messages with structured context data.
/// Implementations can integrate with various logging backends (e.g., tracing, log, custom).
pub trait Logger: Send + Sync {
    /// Log a debug message with structured context.
    fn debug(&self, message: &str, fields: Value);

    /// Log an info message with structured context.
    fn info(&self, message: &str, fields: Value);

    /// Log a warning message with structured context.
    fn warn(&self, message: &str, fields: Value);

    /// Log an error message with structured context.
    fn error(&self, message: &str, fields: Value);
}

/// Structured logger implementation using the tracing crate.
///
/// This logger integrates with the tracing ecosystem and emits structured
/// log events with JSON-formatted context fields.
pub struct StructuredLogger {
    name: String,
    level: LogLevel,
}

impl StructuredLogger {
    /// Create a new structured logger with the given name.
    ///
    /// # Arguments
    /// * `name` - The logger name (typically service or module name)
    ///
    /// # Example
    /// ```
    /// use integrations_gemini::observability::StructuredLogger;
    ///
    /// let logger = StructuredLogger::new("gemini.content");
    /// ```
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            level: LogLevel::Info,
        }
    }

    /// Set the minimum log level for this logger.
    ///
    /// # Arguments
    /// * `level` - The minimum log level to emit
    pub fn with_level(mut self, level: LogLevel) -> Self {
        self.level = level;
        self
    }

    /// Check if a given level should be logged.
    fn should_log(&self, level: LogLevel) -> bool {
        use LogLevel::*;
        let level_value = match level {
            Error => 0,
            Warn => 1,
            Info => 2,
            Debug => 3,
            Trace => 4,
        };
        let min_value = match self.level {
            Error => 0,
            Warn => 1,
            Info => 2,
            Debug => 3,
            Trace => 4,
        };
        level_value <= min_value
    }

    /// Redact sensitive fields from log data.
    ///
    /// This function removes or masks sensitive information like API keys,
    /// tokens, and other credentials from structured log fields.
    fn redact_sensitive_fields(&self, mut fields: Value) -> Value {
        if let Some(obj) = fields.as_object_mut() {
            // List of sensitive field names to redact
            let sensitive_keys = [
                "api_key", "apiKey", "key",
                "token", "access_token", "accessToken",
                "secret", "password", "credential",
                "authorization", "auth",
            ];

            for key in &sensitive_keys {
                if obj.contains_key(*key) {
                    obj.insert(key.to_string(), Value::String("***REDACTED***".to_string()));
                }
            }

            // Recursively redact nested objects
            for (_, value) in obj.iter_mut() {
                if value.is_object() {
                    *value = self.redact_sensitive_fields(value.clone());
                }
            }
        }

        fields
    }
}

impl Logger for StructuredLogger {
    fn debug(&self, message: &str, fields: Value) {
        if !self.should_log(LogLevel::Debug) {
            return;
        }

        let redacted_fields = self.redact_sensitive_fields(fields);
        tracing::debug!(
            target: &self.name,
            message = message,
            fields = %redacted_fields,
        );
    }

    fn info(&self, message: &str, fields: Value) {
        if !self.should_log(LogLevel::Info) {
            return;
        }

        let redacted_fields = self.redact_sensitive_fields(fields);
        tracing::info!(
            target: &self.name,
            message = message,
            fields = %redacted_fields,
        );
    }

    fn warn(&self, message: &str, fields: Value) {
        if !self.should_log(LogLevel::Warn) {
            return;
        }

        let redacted_fields = self.redact_sensitive_fields(fields);
        tracing::warn!(
            target: &self.name,
            message = message,
            fields = %redacted_fields,
        );
    }

    fn error(&self, message: &str, fields: Value) {
        if !self.should_log(LogLevel::Error) {
            return;
        }

        let redacted_fields = self.redact_sensitive_fields(fields);
        tracing::error!(
            target: &self.name,
            message = message,
            fields = %redacted_fields,
        );
    }
}

/// Default logger implementation that logs to stderr.
///
/// This is a simple logger suitable for development and testing.
pub struct DefaultLogger {
    prefix: String,
    level: LogLevel,
}

impl DefaultLogger {
    /// Creates a new default logger.
    pub fn new(prefix: impl Into<String>) -> Self {
        Self {
            prefix: prefix.into(),
            level: LogLevel::Info,
        }
    }

    /// Set the minimum log level.
    pub fn with_level(mut self, level: LogLevel) -> Self {
        self.level = level;
        self
    }

    fn should_log(&self, level: LogLevel) -> bool {
        use LogLevel::*;
        let level_value = match level {
            Error => 0,
            Warn => 1,
            Info => 2,
            Debug => 3,
            Trace => 4,
        };
        let min_value = match self.level {
            Error => 0,
            Warn => 1,
            Info => 2,
            Debug => 3,
            Trace => 4,
        };
        level_value <= min_value
    }
}

impl Logger for DefaultLogger {
    fn debug(&self, message: &str, context: Value) {
        if self.should_log(LogLevel::Debug) {
            eprintln!("[{}] DEBUG: {} {:?}", self.prefix, message, context);
        }
    }

    fn info(&self, message: &str, context: Value) {
        if self.should_log(LogLevel::Info) {
            eprintln!("[{}] INFO: {} {:?}", self.prefix, message, context);
        }
    }

    fn warn(&self, message: &str, context: Value) {
        if self.should_log(LogLevel::Warn) {
            eprintln!("[{}] WARN: {} {:?}", self.prefix, message, context);
        }
    }

    fn error(&self, message: &str, context: Value) {
        if self.should_log(LogLevel::Error) {
            eprintln!("[{}] ERROR: {} {:?}", self.prefix, message, context);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_structured_logger_creation() {
        let logger = StructuredLogger::new("test");
        assert_eq!(logger.name, "test");
    }

    #[test]
    fn test_structured_logger_with_level() {
        let logger = StructuredLogger::new("test").with_level(LogLevel::Debug);
        assert!(matches!(logger.level, LogLevel::Debug));
    }

    #[test]
    fn test_should_log() {
        let logger = StructuredLogger::new("test").with_level(LogLevel::Info);
        assert!(logger.should_log(LogLevel::Error));
        assert!(logger.should_log(LogLevel::Warn));
        assert!(logger.should_log(LogLevel::Info));
        assert!(!logger.should_log(LogLevel::Debug));
        assert!(!logger.should_log(LogLevel::Trace));
    }

    #[test]
    fn test_redact_sensitive_fields() {
        let logger = StructuredLogger::new("test");

        let fields = json!({
            "api_key": "secret-key-123",
            "model": "gemini-pro",
            "user": "test-user"
        });

        let redacted = logger.redact_sensitive_fields(fields);

        assert_eq!(redacted["api_key"], "***REDACTED***");
        assert_eq!(redacted["model"], "gemini-pro");
        assert_eq!(redacted["user"], "test-user");
    }

    #[test]
    fn test_redact_nested_sensitive_fields() {
        let logger = StructuredLogger::new("test");

        let fields = json!({
            "request": {
                "authorization": "Bearer token-123",
                "model": "gemini-pro"
            },
            "user": "test-user"
        });

        let redacted = logger.redact_sensitive_fields(fields);

        assert_eq!(redacted["request"]["authorization"], "***REDACTED***");
        assert_eq!(redacted["request"]["model"], "gemini-pro");
        assert_eq!(redacted["user"], "test-user");
    }

    #[test]
    fn test_default_logger_level_filtering() {
        let logger = DefaultLogger::new("test").with_level(LogLevel::Warn);
        assert!(logger.should_log(LogLevel::Error));
        assert!(logger.should_log(LogLevel::Warn));
        assert!(!logger.should_log(LogLevel::Info));
    }
}
