//! Logging
//!
//! Structured logging for OAuth2 operations.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Log level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    /// Trace level.
    Trace,
    /// Debug level.
    Debug,
    /// Info level.
    Info,
    /// Warn level.
    Warn,
    /// Error level.
    Error,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Trace => write!(f, "TRACE"),
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Error => write!(f, "ERROR"),
        }
    }
}

/// OAuth2 log context.
#[derive(Debug, Clone, Default)]
pub struct OAuth2LogContext {
    /// Provider name.
    pub provider: Option<String>,
    /// Operation name.
    pub operation: Option<String>,
    /// Client ID.
    pub client_id: Option<String>,
    /// Request ID for correlation.
    pub request_id: Option<String>,
    /// Additional context.
    pub extra: HashMap<String, String>,
}

impl OAuth2LogContext {
    /// Create new log context.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set provider.
    pub fn provider(mut self, provider: impl Into<String>) -> Self {
        self.provider = Some(provider.into());
        self
    }

    /// Set operation.
    pub fn operation(mut self, operation: impl Into<String>) -> Self {
        self.operation = Some(operation.into());
        self
    }

    /// Set client ID.
    pub fn client_id(mut self, client_id: impl Into<String>) -> Self {
        self.client_id = Some(client_id.into());
        self
    }

    /// Set request ID.
    pub fn request_id(mut self, request_id: impl Into<String>) -> Self {
        self.request_id = Some(request_id.into());
        self
    }

    /// Add extra context.
    pub fn extra(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.extra.insert(key.into(), value.into());
        self
    }
}

/// Logger interface.
pub trait Logger: Send + Sync {
    /// Log at trace level.
    fn trace(&self, message: &str, context: &OAuth2LogContext);

    /// Log at debug level.
    fn debug(&self, message: &str, context: &OAuth2LogContext);

    /// Log at info level.
    fn info(&self, message: &str, context: &OAuth2LogContext);

    /// Log at warn level.
    fn warn(&self, message: &str, context: &OAuth2LogContext);

    /// Log at error level.
    fn error(&self, message: &str, context: &OAuth2LogContext);

    /// Check if a log level is enabled.
    fn is_enabled(&self, level: LogLevel) -> bool;
}

/// No-op logger implementation.
pub struct NoOpLogger;

impl Logger for NoOpLogger {
    fn trace(&self, _message: &str, _context: &OAuth2LogContext) {}
    fn debug(&self, _message: &str, _context: &OAuth2LogContext) {}
    fn info(&self, _message: &str, _context: &OAuth2LogContext) {}
    fn warn(&self, _message: &str, _context: &OAuth2LogContext) {}
    fn error(&self, _message: &str, _context: &OAuth2LogContext) {}
    fn is_enabled(&self, _level: LogLevel) -> bool {
        false
    }
}

/// No-op logger singleton.
pub fn no_op_logger() -> NoOpLogger {
    NoOpLogger
}

/// Log entry for in-memory storage.
#[derive(Debug, Clone)]
pub struct LogEntry {
    pub level: LogLevel,
    pub message: String,
    pub context: OAuth2LogContext,
    pub timestamp: u64,
}

/// In-memory logger for testing.
pub struct InMemoryLogger {
    entries: Mutex<Vec<LogEntry>>,
    min_level: LogLevel,
}

impl InMemoryLogger {
    /// Create new in-memory logger.
    pub fn new() -> Self {
        Self::with_level(LogLevel::Trace)
    }

    /// Create in-memory logger with minimum level.
    pub fn with_level(min_level: LogLevel) -> Self {
        Self {
            entries: Mutex::new(Vec::new()),
            min_level,
        }
    }

    /// Get all log entries.
    pub fn get_entries(&self) -> Vec<LogEntry> {
        self.entries.lock().unwrap().clone()
    }

    /// Get entries by level.
    pub fn get_entries_by_level(&self, level: LogLevel) -> Vec<LogEntry> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.level == level)
            .cloned()
            .collect()
    }

    /// Clear all entries.
    pub fn clear(&self) {
        self.entries.lock().unwrap().clear();
    }

    fn log(&self, level: LogLevel, message: &str, context: &OAuth2LogContext) {
        if level >= self.min_level {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            self.entries.lock().unwrap().push(LogEntry {
                level,
                message: message.to_string(),
                context: context.clone(),
                timestamp: now,
            });
        }
    }
}

impl Default for InMemoryLogger {
    fn default() -> Self {
        Self::new()
    }
}

impl Logger for InMemoryLogger {
    fn trace(&self, message: &str, context: &OAuth2LogContext) {
        self.log(LogLevel::Trace, message, context);
    }

    fn debug(&self, message: &str, context: &OAuth2LogContext) {
        self.log(LogLevel::Debug, message, context);
    }

    fn info(&self, message: &str, context: &OAuth2LogContext) {
        self.log(LogLevel::Info, message, context);
    }

    fn warn(&self, message: &str, context: &OAuth2LogContext) {
        self.log(LogLevel::Warn, message, context);
    }

    fn error(&self, message: &str, context: &OAuth2LogContext) {
        self.log(LogLevel::Error, message, context);
    }

    fn is_enabled(&self, level: LogLevel) -> bool {
        level >= self.min_level
    }
}

/// Console logger implementation.
pub struct ConsoleLogger {
    min_level: LogLevel,
}

impl ConsoleLogger {
    /// Create new console logger.
    pub fn new() -> Self {
        Self::with_level(LogLevel::Info)
    }

    /// Create console logger with minimum level.
    pub fn with_level(min_level: LogLevel) -> Self {
        Self { min_level }
    }

    fn format_log(&self, level: LogLevel, message: &str, context: &OAuth2LogContext) -> String {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut parts = vec![format!("[{}] {} {}", timestamp, level, message)];

        if let Some(provider) = &context.provider {
            parts.push(format!("provider={}", provider));
        }
        if let Some(operation) = &context.operation {
            parts.push(format!("operation={}", operation));
        }
        if let Some(request_id) = &context.request_id {
            parts.push(format!("request_id={}", request_id));
        }

        for (key, value) in &context.extra {
            parts.push(format!("{}={}", key, value));
        }

        parts.join(" ")
    }
}

impl Default for ConsoleLogger {
    fn default() -> Self {
        Self::new()
    }
}

impl Logger for ConsoleLogger {
    fn trace(&self, message: &str, context: &OAuth2LogContext) {
        if self.is_enabled(LogLevel::Trace) {
            println!("{}", self.format_log(LogLevel::Trace, message, context));
        }
    }

    fn debug(&self, message: &str, context: &OAuth2LogContext) {
        if self.is_enabled(LogLevel::Debug) {
            println!("{}", self.format_log(LogLevel::Debug, message, context));
        }
    }

    fn info(&self, message: &str, context: &OAuth2LogContext) {
        if self.is_enabled(LogLevel::Info) {
            println!("{}", self.format_log(LogLevel::Info, message, context));
        }
    }

    fn warn(&self, message: &str, context: &OAuth2LogContext) {
        if self.is_enabled(LogLevel::Warn) {
            eprintln!("{}", self.format_log(LogLevel::Warn, message, context));
        }
    }

    fn error(&self, message: &str, context: &OAuth2LogContext) {
        if self.is_enabled(LogLevel::Error) {
            eprintln!("{}", self.format_log(LogLevel::Error, message, context));
        }
    }

    fn is_enabled(&self, level: LogLevel) -> bool {
        level >= self.min_level
    }
}

/// Create in-memory logger for testing.
pub fn create_in_memory_logger() -> InMemoryLogger {
    InMemoryLogger::new()
}

/// Create console logger.
pub fn create_console_logger() -> ConsoleLogger {
    ConsoleLogger::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_level_ordering() {
        assert!(LogLevel::Error > LogLevel::Warn);
        assert!(LogLevel::Warn > LogLevel::Info);
        assert!(LogLevel::Info > LogLevel::Debug);
        assert!(LogLevel::Debug > LogLevel::Trace);
    }

    #[test]
    fn test_in_memory_logger() {
        let logger = InMemoryLogger::new();
        let context = OAuth2LogContext::new()
            .provider("google")
            .operation("token_exchange");

        logger.info("Token exchange started", &context);
        logger.debug("Debug info", &context);
        logger.error("Error occurred", &context);

        let entries = logger.get_entries();
        assert_eq!(entries.len(), 3);

        let error_entries = logger.get_entries_by_level(LogLevel::Error);
        assert_eq!(error_entries.len(), 1);
    }

    #[test]
    fn test_log_context_builder() {
        let context = OAuth2LogContext::new()
            .provider("google")
            .operation("token_exchange")
            .client_id("client123")
            .request_id("req-456")
            .extra("custom", "value");

        assert_eq!(context.provider, Some("google".to_string()));
        assert_eq!(context.operation, Some("token_exchange".to_string()));
        assert_eq!(context.extra.get("custom"), Some(&"value".to_string()));
    }

    #[test]
    fn test_min_level_filtering() {
        let logger = InMemoryLogger::with_level(LogLevel::Warn);
        let context = OAuth2LogContext::new();

        logger.trace("trace", &context);
        logger.debug("debug", &context);
        logger.info("info", &context);
        logger.warn("warn", &context);
        logger.error("error", &context);

        let entries = logger.get_entries();
        assert_eq!(entries.len(), 2); // Only warn and error
    }
}
