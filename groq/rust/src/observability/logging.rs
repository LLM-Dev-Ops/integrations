//! Logging configuration and utilities.

use std::collections::HashMap;

/// Log level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    /// Trace level.
    Trace = 0,
    /// Debug level.
    Debug = 1,
    /// Info level.
    Info = 2,
    /// Warning level.
    Warn = 3,
    /// Error level.
    Error = 4,
    /// Off (no logging).
    Off = 5,
}

impl Default for LogLevel {
    fn default() -> Self {
        Self::Info
    }
}

/// Logging configuration.
#[derive(Debug, Clone)]
pub struct LogConfig {
    /// Minimum log level.
    pub level: LogLevel,
    /// Include timestamps.
    pub include_timestamps: bool,
    /// Include request IDs.
    pub include_request_ids: bool,
    /// Log request bodies.
    pub log_request_bodies: bool,
    /// Log response bodies.
    pub log_response_bodies: bool,
    /// Maximum body length to log.
    pub max_body_length: usize,
    /// Redact sensitive data.
    pub redact_sensitive: bool,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: LogLevel::Info,
            include_timestamps: true,
            include_request_ids: true,
            log_request_bodies: false,
            log_response_bodies: false,
            max_body_length: 1024,
            redact_sensitive: true,
        }
    }
}

impl LogConfig {
    /// Creates a new log configuration.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the log level.
    pub fn level(mut self, level: LogLevel) -> Self {
        self.level = level;
        self
    }

    /// Enables request body logging.
    pub fn log_bodies(mut self) -> Self {
        self.log_request_bodies = true;
        self.log_response_bodies = true;
        self
    }

    /// Disables sensitive data redaction.
    pub fn no_redact(mut self) -> Self {
        self.redact_sensitive = false;
        self
    }
}

/// Logger interface.
pub trait Logger: Send + Sync {
    /// Logs a message at the specified level.
    fn log(&self, level: LogLevel, message: &str, context: Option<&HashMap<String, String>>);

    /// Logs at trace level.
    fn trace(&self, message: &str) {
        self.log(LogLevel::Trace, message, None);
    }

    /// Logs at debug level.
    fn debug(&self, message: &str) {
        self.log(LogLevel::Debug, message, None);
    }

    /// Logs at info level.
    fn info(&self, message: &str) {
        self.log(LogLevel::Info, message, None);
    }

    /// Logs at warning level.
    fn warn(&self, message: &str) {
        self.log(LogLevel::Warn, message, None);
    }

    /// Logs at error level.
    fn error(&self, message: &str) {
        self.log(LogLevel::Error, message, None);
    }
}

/// Console logger implementation.
pub struct ConsoleLogger {
    config: LogConfig,
}

impl ConsoleLogger {
    /// Creates a new console logger.
    pub fn new(config: LogConfig) -> Self {
        Self { config }
    }

    /// Creates with default configuration.
    pub fn default_config() -> Self {
        Self::new(LogConfig::default())
    }

    /// Redacts sensitive data from text.
    fn redact(&self, text: &str) -> String {
        if !self.config.redact_sensitive {
            return text.to_string();
        }

        // Redact API keys and secrets
        let patterns = [
            (r"gsk_[a-zA-Z0-9]+", "gsk_***"),
            (r"Bearer [a-zA-Z0-9_-]+", "Bearer ***"),
            (r"api[_-]?key[=:][^\s,}]+", "api_key=***"),
            (r"authorization[=:][^\s,}]+", "authorization=***"),
        ];

        let mut result = text.to_string();
        for (pattern, replacement) in patterns {
            if let Ok(re) = regex::Regex::new(pattern) {
                result = re.replace_all(&result, replacement).to_string();
            }
        }

        result
    }
}

impl Logger for ConsoleLogger {
    fn log(&self, level: LogLevel, message: &str, context: Option<&HashMap<String, String>>) {
        if level < self.config.level {
            return;
        }

        let mut parts = Vec::new();

        // Timestamp
        if self.config.include_timestamps {
            parts.push(format!("[{}]", chrono::Utc::now().to_rfc3339()));
        }

        // Level
        let level_str = match level {
            LogLevel::Trace => "TRACE",
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
            LogLevel::Off => return,
        };
        parts.push(format!("[{}]", level_str));

        // Message
        parts.push(self.redact(message));

        // Context
        if let Some(ctx) = context {
            let redacted: HashMap<String, String> = ctx
                .iter()
                .map(|(k, v)| {
                    let v = if self.config.redact_sensitive
                        && (k.contains("key") || k.contains("token") || k.contains("auth"))
                    {
                        "***".to_string()
                    } else {
                        v.clone()
                    };
                    (k.clone(), v)
                })
                .collect();

            if let Ok(json) = serde_json::to_string(&redacted) {
                parts.push(json);
            }
        }

        let output = parts.join(" ");

        match level {
            LogLevel::Error => eprintln!("{}", output),
            LogLevel::Warn => eprintln!("{}", output),
            _ => println!("{}", output),
        }
    }
}

impl Default for ConsoleLogger {
    fn default() -> Self {
        Self::default_config()
    }
}

impl std::fmt::Debug for ConsoleLogger {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ConsoleLogger")
            .field("config", &self.config)
            .finish()
    }
}

/// No-op logger that discards all messages.
pub struct NoopLogger;

impl Logger for NoopLogger {
    fn log(&self, _level: LogLevel, _message: &str, _context: Option<&HashMap<String, String>>) {
        // Do nothing
    }
}

impl std::fmt::Debug for NoopLogger {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NoopLogger").finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_level_ordering() {
        assert!(LogLevel::Trace < LogLevel::Debug);
        assert!(LogLevel::Debug < LogLevel::Info);
        assert!(LogLevel::Info < LogLevel::Warn);
        assert!(LogLevel::Warn < LogLevel::Error);
        assert!(LogLevel::Error < LogLevel::Off);
    }

    #[test]
    fn test_console_logger_redaction() {
        let logger = ConsoleLogger::new(LogConfig::default());

        let redacted = logger.redact("API key: gsk_test123456");
        assert!(!redacted.contains("test123456"));
        assert!(redacted.contains("gsk_***"));

        let redacted = logger.redact("Bearer token123");
        assert!(!redacted.contains("token123"));
    }

    #[test]
    fn test_console_logger_no_redact() {
        let logger = ConsoleLogger::new(LogConfig::new().no_redact());

        let text = "API key: gsk_test123456";
        let result = logger.redact(text);
        assert_eq!(result, text);
    }
}
