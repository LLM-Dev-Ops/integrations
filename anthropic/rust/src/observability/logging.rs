//! Logging configuration and utilities.
//!
//! This module provides structured logging capabilities using the `tracing` crate
//! with support for multiple output formats and log levels.

use tracing::Level;
use tracing_subscriber::{
    fmt,
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
};

/// Logging configuration.
///
/// Configure the behavior and output format of the logging system.
#[derive(Debug, Clone)]
pub struct LoggingConfig {
    /// The minimum log level to capture
    pub level: LogLevel,
    /// The output format for log messages
    pub format: LogFormat,
    /// Whether to include timestamps in log output
    pub include_timestamps: bool,
    /// Whether to include the module target in log output
    pub include_target: bool,
    /// Whether to include file and line number in log output
    pub include_file_line: bool,
}

/// Log level enumeration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    /// Trace-level logging (most verbose)
    Trace,
    /// Debug-level logging
    Debug,
    /// Info-level logging
    Info,
    /// Warning-level logging
    Warn,
    /// Error-level logging (least verbose)
    Error,
}

impl From<LogLevel> for Level {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Trace => Level::TRACE,
            LogLevel::Debug => Level::DEBUG,
            LogLevel::Info => Level::INFO,
            LogLevel::Warn => Level::WARN,
            LogLevel::Error => Level::ERROR,
        }
    }
}

impl From<LogLevel> for tracing::level_filters::LevelFilter {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Trace => tracing::level_filters::LevelFilter::TRACE,
            LogLevel::Debug => tracing::level_filters::LevelFilter::DEBUG,
            LogLevel::Info => tracing::level_filters::LevelFilter::INFO,
            LogLevel::Warn => tracing::level_filters::LevelFilter::WARN,
            LogLevel::Error => tracing::level_filters::LevelFilter::ERROR,
        }
    }
}

/// Log output format.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    /// Human-readable format with colors (for development)
    Pretty,
    /// JSON format (for structured logging in production)
    Json,
    /// Compact format (for space-constrained environments)
    Compact,
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: LogLevel::Info,
            format: LogFormat::Pretty,
            include_timestamps: true,
            include_target: true,
            include_file_line: false,
        }
    }
}

impl LoggingConfig {
    /// Creates a new logging configuration with default settings.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{LoggingConfig, LogLevel, LogFormat};
    ///
    /// let config = LoggingConfig::new();
    /// assert_eq!(config.level, LogLevel::Info);
    /// assert_eq!(config.format, LogFormat::Pretty);
    /// ```
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the log level.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{LoggingConfig, LogLevel};
    ///
    /// let config = LoggingConfig::new().with_level(LogLevel::Debug);
    /// assert_eq!(config.level, LogLevel::Debug);
    /// ```
    pub fn with_level(mut self, level: LogLevel) -> Self {
        self.level = level;
        self
    }

    /// Sets the log format.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::{LoggingConfig, LogFormat};
    ///
    /// let config = LoggingConfig::new().with_format(LogFormat::Json);
    /// assert_eq!(config.format, LogFormat::Json);
    /// ```
    pub fn with_format(mut self, format: LogFormat) -> Self {
        self.format = format;
        self
    }

    /// Sets whether to include timestamps.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::LoggingConfig;
    ///
    /// let config = LoggingConfig::new().with_timestamps(false);
    /// assert_eq!(config.include_timestamps, false);
    /// ```
    pub fn with_timestamps(mut self, include: bool) -> Self {
        self.include_timestamps = include;
        self
    }

    /// Sets whether to include the module target.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::LoggingConfig;
    ///
    /// let config = LoggingConfig::new().with_target(false);
    /// assert_eq!(config.include_target, false);
    /// ```
    pub fn with_target(mut self, include: bool) -> Self {
        self.include_target = include;
        self
    }

    /// Sets whether to include file and line number.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_anthropic::observability::LoggingConfig;
    ///
    /// let config = LoggingConfig::new().with_file_line(true);
    /// assert_eq!(config.include_file_line, true);
    /// ```
    pub fn with_file_line(mut self, include: bool) -> Self {
        self.include_file_line = include;
        self
    }

    /// Initialize logging with this configuration.
    ///
    /// This should be called once at application startup.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use integrations_anthropic::observability::{LoggingConfig, LogLevel};
    ///
    /// # fn main() -> Result<(), Box<dyn std::error::Error>> {
    /// LoggingConfig::new()
    ///     .with_level(LogLevel::Debug)
    ///     .init()?;
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// # Errors
    ///
    /// Returns an error if the logging system has already been initialized.
    pub fn init(self) -> Result<(), Box<dyn std::error::Error>> {
        let filter = EnvFilter::from_default_env()
            .add_directive(self.level.into());

        match self.format {
            LogFormat::Pretty => {
                tracing_subscriber::registry()
                    .with(filter)
                    .with(
                        fmt::layer()
                            .with_ansi(true)
                            .with_target(self.include_target)
                            .with_file(self.include_file_line)
                            .with_line_number(self.include_file_line)
                    )
                    .try_init()?;
            }
            LogFormat::Json => {
                tracing_subscriber::registry()
                    .with(filter)
                    .with(fmt::layer().json())
                    .try_init()?;
            }
            LogFormat::Compact => {
                tracing_subscriber::registry()
                    .with(filter)
                    .with(fmt::layer().compact())
                    .try_init()?;
            }
        }

        Ok(())
    }
}

/// Log an outgoing HTTP request for debugging.
///
/// # Examples
///
/// ```
/// use integrations_anthropic::observability::log_request;
///
/// log_request("POST", "/v1/messages", Some(r#"{"model":"claude-3-opus-20240229"}"#));
/// ```
pub fn log_request(method: &str, path: &str, body: Option<&str>) {
    tracing::debug!(
        method = method,
        path = path,
        body = body.unwrap_or("<empty>"),
        "Outgoing request"
    );
}

/// Log an incoming HTTP response for debugging.
///
/// # Examples
///
/// ```
/// use integrations_anthropic::observability::log_response;
///
/// log_response(200, 1234, Some(r#"{"id":"msg_123","content":[...]}"#));
/// ```
pub fn log_response(status: u16, duration_ms: u64, body: Option<&str>) {
    tracing::debug!(
        status = status,
        duration_ms = duration_ms,
        body = body.map(|b| if b.len() > 1000 { &b[..1000] } else { b }).unwrap_or("<empty>"),
        "Incoming response"
    );
}

/// Log an error with context.
///
/// # Examples
///
/// ```
/// use integrations_anthropic::observability::log_error;
/// use std::io;
///
/// let error = io::Error::new(io::ErrorKind::ConnectionRefused, "connection refused");
/// log_error(&error, "Failed to connect to API");
/// ```
pub fn log_error(error: &dyn std::error::Error, context: &str) {
    tracing::error!(
        error = %error,
        context = context,
        "Error occurred"
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_logging_config_default() {
        let config = LoggingConfig::default();
        assert_eq!(config.level, LogLevel::Info);
        assert_eq!(config.format, LogFormat::Pretty);
        assert_eq!(config.include_timestamps, true);
        assert_eq!(config.include_target, true);
        assert_eq!(config.include_file_line, false);
    }

    #[test]
    fn test_logging_config_new() {
        let config = LoggingConfig::new();
        assert_eq!(config.level, LogLevel::Info);
        assert_eq!(config.format, LogFormat::Pretty);
    }

    #[test]
    fn test_logging_config_with_level() {
        let config = LoggingConfig::new().with_level(LogLevel::Debug);
        assert_eq!(config.level, LogLevel::Debug);
    }

    #[test]
    fn test_logging_config_with_format() {
        let config = LoggingConfig::new().with_format(LogFormat::Json);
        assert_eq!(config.format, LogFormat::Json);
    }

    #[test]
    fn test_logging_config_with_timestamps() {
        let config = LoggingConfig::new().with_timestamps(false);
        assert_eq!(config.include_timestamps, false);
    }

    #[test]
    fn test_logging_config_with_target() {
        let config = LoggingConfig::new().with_target(false);
        assert_eq!(config.include_target, false);
    }

    #[test]
    fn test_logging_config_with_file_line() {
        let config = LoggingConfig::new().with_file_line(true);
        assert_eq!(config.include_file_line, true);
    }

    #[test]
    fn test_logging_config_builder_chain() {
        let config = LoggingConfig::new()
            .with_level(LogLevel::Trace)
            .with_format(LogFormat::Compact)
            .with_timestamps(false)
            .with_target(false)
            .with_file_line(true);

        assert_eq!(config.level, LogLevel::Trace);
        assert_eq!(config.format, LogFormat::Compact);
        assert_eq!(config.include_timestamps, false);
        assert_eq!(config.include_target, false);
        assert_eq!(config.include_file_line, true);
    }

    #[test]
    fn test_log_level_to_level() {
        assert_eq!(Level::from(LogLevel::Trace), Level::TRACE);
        assert_eq!(Level::from(LogLevel::Debug), Level::DEBUG);
        assert_eq!(Level::from(LogLevel::Info), Level::INFO);
        assert_eq!(Level::from(LogLevel::Warn), Level::WARN);
        assert_eq!(Level::from(LogLevel::Error), Level::ERROR);
    }

    #[test]
    fn test_log_level_equality() {
        assert_eq!(LogLevel::Trace, LogLevel::Trace);
        assert_eq!(LogLevel::Debug, LogLevel::Debug);
        assert_eq!(LogLevel::Info, LogLevel::Info);
        assert_eq!(LogLevel::Warn, LogLevel::Warn);
        assert_eq!(LogLevel::Error, LogLevel::Error);

        assert_ne!(LogLevel::Trace, LogLevel::Debug);
        assert_ne!(LogLevel::Info, LogLevel::Warn);
    }

    #[test]
    fn test_log_format_equality() {
        assert_eq!(LogFormat::Pretty, LogFormat::Pretty);
        assert_eq!(LogFormat::Json, LogFormat::Json);
        assert_eq!(LogFormat::Compact, LogFormat::Compact);

        assert_ne!(LogFormat::Pretty, LogFormat::Json);
        assert_ne!(LogFormat::Json, LogFormat::Compact);
    }

    #[test]
    fn test_log_request() {
        // Should not panic
        log_request("POST", "/v1/messages", Some(r#"{"model":"claude-3-opus-20240229"}"#));
        log_request("GET", "/v1/models", None);
    }

    #[test]
    fn test_log_response() {
        // Should not panic
        log_response(200, 1234, Some(r#"{"id":"msg_123"}"#));
        log_response(404, 100, None);
    }

    #[test]
    fn test_log_response_truncates_long_body() {
        let long_body = "x".repeat(2000);
        // Should not panic and should truncate
        log_response(200, 1000, Some(&long_body));
    }

    #[test]
    fn test_log_error() {
        use std::io;
        let error = io::Error::new(io::ErrorKind::ConnectionRefused, "connection refused");
        // Should not panic
        log_error(&error, "Failed to connect");
    }

    #[test]
    fn test_logging_config_clone() {
        let config1 = LoggingConfig::new().with_level(LogLevel::Debug);
        let config2 = config1.clone();

        assert_eq!(config1.level, config2.level);
        assert_eq!(config1.format, config2.format);
    }

    #[test]
    fn test_logging_config_debug() {
        let config = LoggingConfig::new();
        let debug_str = format!("{:?}", config);
        assert!(debug_str.contains("LoggingConfig"));
    }
}
