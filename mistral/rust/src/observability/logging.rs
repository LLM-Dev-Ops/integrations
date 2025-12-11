//! Logging configuration and utilities for the Mistral client.

use std::fmt;

/// Log level enumeration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    /// Trace level - most verbose.
    Trace,
    /// Debug level.
    Debug,
    /// Info level.
    Info,
    /// Warning level.
    Warn,
    /// Error level.
    Error,
    /// Off - no logging.
    Off,
}

impl Default for LogLevel {
    fn default() -> Self {
        Self::Info
    }
}

impl fmt::Display for LogLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogLevel::Trace => write!(f, "TRACE"),
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Error => write!(f, "ERROR"),
            LogLevel::Off => write!(f, "OFF"),
        }
    }
}

impl std::str::FromStr for LogLevel {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "trace" => Ok(LogLevel::Trace),
            "debug" => Ok(LogLevel::Debug),
            "info" => Ok(LogLevel::Info),
            "warn" | "warning" => Ok(LogLevel::Warn),
            "error" => Ok(LogLevel::Error),
            "off" | "none" => Ok(LogLevel::Off),
            _ => Err(format!("Unknown log level: {}", s)),
        }
    }
}

/// Logging configuration.
#[derive(Debug, Clone)]
pub struct LogConfig {
    /// Minimum log level.
    pub level: LogLevel,
    /// Whether to include timestamps.
    pub include_timestamps: bool,
    /// Whether to include request IDs.
    pub include_request_ids: bool,
    /// Whether to log request bodies.
    pub log_request_bodies: bool,
    /// Whether to log response bodies.
    pub log_response_bodies: bool,
    /// Maximum body length to log.
    pub max_body_length: usize,
    /// Whether to redact sensitive data.
    pub redact_sensitive: bool,
    /// Custom log target/module.
    pub target: Option<String>,
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
            target: None,
        }
    }
}

impl LogConfig {
    /// Creates a new logging configuration.
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates a builder.
    pub fn builder() -> LogConfigBuilder {
        LogConfigBuilder::default()
    }

    /// Creates a debug configuration.
    pub fn debug() -> Self {
        Self {
            level: LogLevel::Debug,
            log_request_bodies: true,
            log_response_bodies: true,
            ..Default::default()
        }
    }

    /// Creates a production configuration.
    pub fn production() -> Self {
        Self {
            level: LogLevel::Warn,
            log_request_bodies: false,
            log_response_bodies: false,
            redact_sensitive: true,
            ..Default::default()
        }
    }

    /// Checks if a log level should be logged.
    pub fn should_log(&self, level: LogLevel) -> bool {
        level >= self.level && self.level != LogLevel::Off
    }
}

/// Builder for logging configuration.
#[derive(Default)]
pub struct LogConfigBuilder {
    config: LogConfig,
}

impl LogConfigBuilder {
    /// Sets the log level.
    pub fn level(mut self, level: LogLevel) -> Self {
        self.config.level = level;
        self
    }

    /// Sets whether to include timestamps.
    pub fn include_timestamps(mut self, include: bool) -> Self {
        self.config.include_timestamps = include;
        self
    }

    /// Sets whether to include request IDs.
    pub fn include_request_ids(mut self, include: bool) -> Self {
        self.config.include_request_ids = include;
        self
    }

    /// Sets whether to log request bodies.
    pub fn log_request_bodies(mut self, log: bool) -> Self {
        self.config.log_request_bodies = log;
        self
    }

    /// Sets whether to log response bodies.
    pub fn log_response_bodies(mut self, log: bool) -> Self {
        self.config.log_response_bodies = log;
        self
    }

    /// Sets the maximum body length.
    pub fn max_body_length(mut self, length: usize) -> Self {
        self.config.max_body_length = length;
        self
    }

    /// Sets whether to redact sensitive data.
    pub fn redact_sensitive(mut self, redact: bool) -> Self {
        self.config.redact_sensitive = redact;
        self
    }

    /// Sets the log target.
    pub fn target(mut self, target: impl Into<String>) -> Self {
        self.config.target = Some(target.into());
        self
    }

    /// Builds the configuration.
    pub fn build(self) -> LogConfig {
        self.config
    }
}

/// Redacts sensitive information from a string.
pub fn redact_sensitive(input: &str, patterns: &[&str]) -> String {
    let mut result = input.to_string();

    for pattern in patterns {
        // Simple pattern matching for common sensitive fields
        let key_patterns = [
            format!(r#""{}":"[^"]*""#, pattern),
            format!(r#"{}=[^&\s]*"#, pattern),
        ];

        for key_pattern in &key_patterns {
            if let Ok(re) = regex::Regex::new(key_pattern) {
                result = re
                    .replace_all(&result, format!(r#""{}":[REDACTED]"#, pattern))
                    .to_string();
            }
        }
    }

    result
}

/// Common sensitive field names to redact.
pub const SENSITIVE_FIELDS: &[&str] = &[
    "api_key",
    "apiKey",
    "authorization",
    "Authorization",
    "password",
    "secret",
    "token",
    "bearer",
    "credential",
];

/// Logger trait for custom logging implementations.
pub trait Logger: Send + Sync {
    /// Logs a message at the specified level.
    fn log(&self, level: LogLevel, message: &str);

    /// Logs a trace message.
    fn trace(&self, message: &str) {
        self.log(LogLevel::Trace, message);
    }

    /// Logs a debug message.
    fn debug(&self, message: &str) {
        self.log(LogLevel::Debug, message);
    }

    /// Logs an info message.
    fn info(&self, message: &str) {
        self.log(LogLevel::Info, message);
    }

    /// Logs a warning message.
    fn warn(&self, message: &str) {
        self.log(LogLevel::Warn, message);
    }

    /// Logs an error message.
    fn error(&self, message: &str) {
        self.log(LogLevel::Error, message);
    }
}

/// Default logger that uses standard output.
pub struct DefaultLogger {
    config: LogConfig,
}

impl DefaultLogger {
    /// Creates a new logger with the given configuration.
    pub fn new(config: LogConfig) -> Self {
        Self { config }
    }
}

impl Logger for DefaultLogger {
    fn log(&self, level: LogLevel, message: &str) {
        if !self.config.should_log(level) {
            return;
        }

        let mut output = String::new();

        if self.config.include_timestamps {
            let now = chrono::Utc::now();
            output.push_str(&format!("[{}] ", now.format("%Y-%m-%dT%H:%M:%S%.3fZ")));
        }

        output.push_str(&format!("[{}] ", level));

        if let Some(ref target) = self.config.target {
            output.push_str(&format!("[{}] ", target));
        }

        let final_message = if self.config.redact_sensitive {
            redact_sensitive(message, SENSITIVE_FIELDS)
        } else {
            message.to_string()
        };

        output.push_str(&final_message);

        match level {
            LogLevel::Error => eprintln!("{}", output),
            _ => println!("{}", output),
        }
    }
}

/// No-op logger for when logging is disabled.
pub struct NoopLogger;

impl Logger for NoopLogger {
    fn log(&self, _level: LogLevel, _message: &str) {}
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
    fn test_log_level_from_str() {
        assert_eq!("debug".parse::<LogLevel>().unwrap(), LogLevel::Debug);
        assert_eq!("INFO".parse::<LogLevel>().unwrap(), LogLevel::Info);
        assert_eq!("warning".parse::<LogLevel>().unwrap(), LogLevel::Warn);
    }

    #[test]
    fn test_log_config_builder() {
        let config = LogConfig::builder()
            .level(LogLevel::Debug)
            .log_request_bodies(true)
            .max_body_length(2048)
            .build();

        assert_eq!(config.level, LogLevel::Debug);
        assert!(config.log_request_bodies);
        assert_eq!(config.max_body_length, 2048);
    }

    #[test]
    fn test_should_log() {
        let config = LogConfig::builder().level(LogLevel::Info).build();

        assert!(!config.should_log(LogLevel::Debug));
        assert!(config.should_log(LogLevel::Info));
        assert!(config.should_log(LogLevel::Warn));
        assert!(config.should_log(LogLevel::Error));
    }

    #[test]
    fn test_production_config() {
        let config = LogConfig::production();
        assert_eq!(config.level, LogLevel::Warn);
        assert!(!config.log_request_bodies);
        assert!(config.redact_sensitive);
    }
}
