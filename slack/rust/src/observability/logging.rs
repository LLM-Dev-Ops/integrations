//! Logging utilities with sensitive data redaction.

use std::fmt;

/// Wrapper for sensitive data that redacts on display
#[derive(Clone)]
pub struct Redacted<T>(T);

impl<T> Redacted<T> {
    /// Create a new redacted value
    pub fn new(value: T) -> Self {
        Self(value)
    }

    /// Get the inner value (use sparingly)
    pub fn expose(&self) -> &T {
        &self.0
    }
}

impl<T> fmt::Debug for Redacted<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl<T> fmt::Display for Redacted<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[REDACTED]")
    }
}

/// Redact token from a string, preserving prefix for debugging
pub fn redact_token(token: &str) -> String {
    if token.len() <= 8 {
        "[REDACTED]".to_string()
    } else {
        format!("{}...[REDACTED]", &token[..8])
    }
}

/// Redact a URL, hiding any tokens in query parameters
pub fn redact_url(url: &str) -> String {
    if let Some(query_start) = url.find('?') {
        let (base, query) = url.split_at(query_start);
        let redacted_query = redact_query_params(query);
        format!("{}{}", base, redacted_query)
    } else {
        url.to_string()
    }
}

/// Redact sensitive query parameters
fn redact_query_params(query: &str) -> String {
    let sensitive_params = ["token", "key", "secret", "password", "api_key"];

    let mut result = String::from("?");
    let params = query.trim_start_matches('?');

    for (i, pair) in params.split('&').enumerate() {
        if i > 0 {
            result.push('&');
        }

        if let Some(eq_pos) = pair.find('=') {
            let (key, _value) = pair.split_at(eq_pos);
            if sensitive_params.iter().any(|&s| key.eq_ignore_ascii_case(s)) {
                result.push_str(key);
                result.push_str("=[REDACTED]");
            } else {
                result.push_str(pair);
            }
        } else {
            result.push_str(pair);
        }
    }

    result
}

/// Log level for Slack operations
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    /// Error level
    Error,
    /// Warning level
    Warn,
    /// Info level
    Info,
    /// Debug level
    Debug,
    /// Trace level
    Trace,
}

impl fmt::Display for LogLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogLevel::Error => write!(f, "ERROR"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Trace => write!(f, "TRACE"),
        }
    }
}

/// Structured log entry
#[derive(Debug)]
pub struct LogEntry {
    /// Log level
    pub level: LogLevel,
    /// Log message
    pub message: String,
    /// Request ID
    pub request_id: Option<String>,
    /// Endpoint
    pub endpoint: Option<String>,
    /// Duration in milliseconds
    pub duration_ms: Option<u64>,
    /// Error message
    pub error: Option<String>,
    /// Additional fields
    pub fields: Vec<(String, String)>,
}

impl LogEntry {
    /// Create a new log entry
    pub fn new(level: LogLevel, message: impl Into<String>) -> Self {
        Self {
            level,
            message: message.into(),
            request_id: None,
            endpoint: None,
            duration_ms: None,
            error: None,
            fields: Vec::new(),
        }
    }

    /// Set request ID
    pub fn request_id(mut self, id: impl Into<String>) -> Self {
        self.request_id = Some(id.into());
        self
    }

    /// Set endpoint
    pub fn endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = Some(endpoint.into());
        self
    }

    /// Set duration
    pub fn duration_ms(mut self, ms: u64) -> Self {
        self.duration_ms = Some(ms);
        self
    }

    /// Set error
    pub fn error(mut self, error: impl Into<String>) -> Self {
        self.error = Some(error.into());
        self
    }

    /// Add a field
    pub fn field(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.fields.push((key.into(), value.into()));
        self
    }

    /// Format as JSON
    pub fn to_json(&self) -> String {
        let mut parts = vec![
            format!(r#""level":"{}""#, self.level),
            format!(r#""message":"{}""#, escape_json(&self.message)),
        ];

        if let Some(ref id) = self.request_id {
            parts.push(format!(r#""request_id":"{}""#, id));
        }
        if let Some(ref endpoint) = self.endpoint {
            parts.push(format!(r#""endpoint":"{}""#, endpoint));
        }
        if let Some(ms) = self.duration_ms {
            parts.push(format!(r#""duration_ms":{}"#, ms));
        }
        if let Some(ref error) = self.error {
            parts.push(format!(r#""error":"{}""#, escape_json(error)));
        }

        for (key, value) in &self.fields {
            parts.push(format!(r#""{}":"{}""#, key, escape_json(value)));
        }

        format!("{{{}}}", parts.join(","))
    }
}

/// Escape special characters for JSON
fn escape_json(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            c => result.push(c),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redacted_display() {
        let secret = Redacted::new("my-secret-token");
        assert_eq!(format!("{}", secret), "[REDACTED]");
        assert_eq!(format!("{:?}", secret), "[REDACTED]");
        assert_eq!(secret.expose(), &"my-secret-token");
    }

    #[test]
    fn test_redact_token() {
        assert_eq!(redact_token("xoxb-123456789"), "xoxb-123...[REDACTED]");
        assert_eq!(redact_token("short"), "[REDACTED]");
    }

    #[test]
    fn test_redact_url() {
        let url = "https://api.slack.com/test?token=secret&channel=C123";
        let redacted = redact_url(url);
        assert!(redacted.contains("token=[REDACTED]"));
        assert!(redacted.contains("channel=C123"));
    }

    #[test]
    fn test_log_entry_json() {
        let entry = LogEntry::new(LogLevel::Info, "Request completed")
            .request_id("req-123")
            .endpoint("chat.postMessage")
            .duration_ms(150);

        let json = entry.to_json();
        assert!(json.contains(r#""level":"INFO""#));
        assert!(json.contains(r#""message":"Request completed""#));
        assert!(json.contains(r#""request_id":"req-123""#));
        assert!(json.contains(r#""duration_ms":150"#));
    }
}
