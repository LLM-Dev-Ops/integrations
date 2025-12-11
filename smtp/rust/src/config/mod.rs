//! Configuration types for the SMTP client.
//!
//! Provides comprehensive configuration with builder pattern for:
//! - Server connection settings
//! - TLS/SSL configuration
//! - Authentication credentials
//! - Connection pooling
//! - Retry and circuit breaker policies
//! - Rate limiting

use std::path::PathBuf;
use std::time::Duration;
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};

use crate::auth::AuthMethod;
use crate::errors::{SmtpError, SmtpResult};

/// Default SMTP port (submission with STARTTLS).
pub const DEFAULT_PORT: u16 = 587;

/// Default timeout for connections.
pub const DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

/// Default timeout for commands.
pub const DEFAULT_COMMAND_TIMEOUT: Duration = Duration::from_secs(60);

/// Default maximum message size (10 MB).
pub const DEFAULT_MAX_MESSAGE_SIZE: usize = 10 * 1024 * 1024;

/// TLS mode for SMTP connections.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TlsMode {
    /// No TLS (insecure, not recommended).
    None,
    /// Opportunistic STARTTLS (default).
    #[default]
    StartTls,
    /// Required STARTTLS (fail if not supported).
    StartTlsRequired,
    /// Implicit TLS (port 465).
    Implicit,
}

/// Minimum TLS version.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TlsVersion {
    /// TLS 1.0 (not recommended).
    Tls10,
    /// TLS 1.1 (not recommended).
    Tls11,
    /// TLS 1.2 (default).
    #[default]
    Tls12,
    /// TLS 1.3 (preferred).
    Tls13,
}

/// TLS configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TlsConfig {
    /// TLS mode.
    pub mode: TlsMode,
    /// Minimum TLS version.
    pub min_version: TlsVersion,
    /// Verify server certificate.
    #[serde(default = "default_true")]
    pub verify_certificate: bool,
    /// Verify hostname matches certificate.
    #[serde(default = "default_true")]
    pub verify_hostname: bool,
    /// Accept invalid certificates (NEVER in production).
    #[serde(default)]
    pub accept_invalid_certs: bool,
    /// Path to CA certificate file.
    pub ca_cert_path: Option<PathBuf>,
    /// Path to client certificate file (for mTLS).
    pub client_cert_path: Option<PathBuf>,
    /// Path to client key file (for mTLS).
    pub client_key_path: Option<PathBuf>,
    /// Server Name Indication override.
    pub sni_override: Option<String>,
}

fn default_true() -> bool {
    true
}

impl TlsConfig {
    /// Creates a new TLS config builder.
    pub fn builder() -> TlsConfigBuilder {
        TlsConfigBuilder::default()
    }

    /// Validates the TLS configuration.
    pub fn validate(&self) -> SmtpResult<()> {
        // In production, don't allow insecure settings
        if self.accept_invalid_certs && !cfg!(debug_assertions) {
            return Err(SmtpError::configuration(
                "accept_invalid_certs is not allowed in production",
            ));
        }

        // Warn about old TLS versions
        if matches!(self.min_version, TlsVersion::Tls10 | TlsVersion::Tls11) {
            // Log warning but don't fail
            #[cfg(feature = "tracing")]
            tracing::warn!("TLS 1.0/1.1 are deprecated and should not be used");
        }

        Ok(())
    }
}

/// Builder for TLS configuration.
#[derive(Debug, Default)]
pub struct TlsConfigBuilder {
    config: TlsConfig,
}

impl TlsConfigBuilder {
    /// Sets the TLS mode.
    pub fn mode(mut self, mode: TlsMode) -> Self {
        self.config.mode = mode;
        self
    }

    /// Sets the minimum TLS version.
    pub fn min_version(mut self, version: TlsVersion) -> Self {
        self.config.min_version = version;
        self
    }

    /// Sets whether to verify certificates.
    pub fn verify_certificate(mut self, verify: bool) -> Self {
        self.config.verify_certificate = verify;
        self
    }

    /// Sets whether to verify hostname.
    pub fn verify_hostname(mut self, verify: bool) -> Self {
        self.config.verify_hostname = verify;
        self
    }

    /// Sets whether to accept invalid certificates (testing only).
    pub fn accept_invalid_certs(mut self, accept: bool) -> Self {
        self.config.accept_invalid_certs = accept;
        self
    }

    /// Sets the CA certificate path.
    pub fn ca_cert_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.config.ca_cert_path = Some(path.into());
        self
    }

    /// Sets the client certificate path for mTLS.
    pub fn client_cert_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.config.client_cert_path = Some(path.into());
        self
    }

    /// Sets the client key path for mTLS.
    pub fn client_key_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.config.client_key_path = Some(path.into());
        self
    }

    /// Sets the SNI override.
    pub fn sni_override(mut self, sni: impl Into<String>) -> Self {
        self.config.sni_override = Some(sni.into());
        self
    }

    /// Builds the TLS configuration.
    pub fn build(self) -> SmtpResult<TlsConfig> {
        self.config.validate()?;
        Ok(self.config)
    }
}

/// Connection pool configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolConfig {
    /// Maximum number of connections.
    #[serde(default = "default_max_connections")]
    pub max_connections: usize,
    /// Minimum idle connections.
    #[serde(default = "default_min_idle")]
    pub min_idle: usize,
    /// Connection acquire timeout.
    #[serde(default = "default_acquire_timeout", with = "humantime_serde")]
    pub acquire_timeout: Duration,
    /// Idle connection timeout.
    #[serde(default = "default_idle_timeout", with = "humantime_serde")]
    pub idle_timeout: Duration,
    /// Maximum connection lifetime.
    #[serde(default = "default_max_lifetime", with = "humantime_serde")]
    pub max_lifetime: Duration,
    /// Enable health checks.
    #[serde(default = "default_true")]
    pub health_check_enabled: bool,
    /// Health check interval.
    #[serde(default = "default_health_check_interval", with = "humantime_serde")]
    pub health_check_interval: Duration,
}

fn default_max_connections() -> usize { 5 }
fn default_min_idle() -> usize { 1 }
fn default_acquire_timeout() -> Duration { Duration::from_secs(30) }
fn default_idle_timeout() -> Duration { Duration::from_secs(300) }
fn default_max_lifetime() -> Duration { Duration::from_secs(3600) }
fn default_health_check_interval() -> Duration { Duration::from_secs(60) }

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_connections: default_max_connections(),
            min_idle: default_min_idle(),
            acquire_timeout: default_acquire_timeout(),
            idle_timeout: default_idle_timeout(),
            max_lifetime: default_max_lifetime(),
            health_check_enabled: true,
            health_check_interval: default_health_check_interval(),
        }
    }
}

/// Retry configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    /// Maximum retry attempts.
    #[serde(default = "default_max_attempts")]
    pub max_attempts: u32,
    /// Initial retry delay.
    #[serde(default = "default_initial_delay", with = "humantime_serde")]
    pub initial_delay: Duration,
    /// Maximum retry delay.
    #[serde(default = "default_max_delay", with = "humantime_serde")]
    pub max_delay: Duration,
    /// Backoff multiplier.
    #[serde(default = "default_multiplier")]
    pub multiplier: f64,
    /// Enable jitter.
    #[serde(default = "default_true")]
    pub jitter: bool,
    /// Enable retries.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_max_attempts() -> u32 { 3 }
fn default_initial_delay() -> Duration { Duration::from_millis(500) }
fn default_max_delay() -> Duration { Duration::from_secs(30) }
fn default_multiplier() -> f64 { 2.0 }

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: default_max_attempts(),
            initial_delay: default_initial_delay(),
            max_delay: default_max_delay(),
            multiplier: default_multiplier(),
            jitter: true,
            enabled: true,
        }
    }
}

/// Circuit breaker configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerConfig {
    /// Failure threshold to open circuit.
    #[serde(default = "default_failure_threshold")]
    pub failure_threshold: u32,
    /// Time window for counting failures.
    #[serde(default = "default_failure_window", with = "humantime_serde")]
    pub failure_window: Duration,
    /// Recovery timeout (time before half-open).
    #[serde(default = "default_recovery_timeout", with = "humantime_serde")]
    pub recovery_timeout: Duration,
    /// Success threshold to close circuit.
    #[serde(default = "default_success_threshold")]
    pub success_threshold: u32,
    /// Enable circuit breaker.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_failure_threshold() -> u32 { 5 }
fn default_failure_window() -> Duration { Duration::from_secs(60) }
fn default_recovery_timeout() -> Duration { Duration::from_secs(30) }
fn default_success_threshold() -> u32 { 3 }

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: default_failure_threshold(),
            failure_window: default_failure_window(),
            recovery_timeout: default_recovery_timeout(),
            success_threshold: default_success_threshold(),
            enabled: true,
        }
    }
}

/// Behavior when rate limit is exceeded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnLimitBehavior {
    /// Reject immediately with error.
    #[default]
    Reject,
    /// Wait until capacity is available.
    Wait,
    /// Wait with a maximum timeout.
    WaitWithTimeout,
}

/// Rate limit configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    /// Maximum emails per time window.
    pub max_emails: Option<u32>,
    /// Time window for rate limiting.
    #[serde(default = "default_rate_window", with = "humantime_serde")]
    pub window: Duration,
    /// Maximum concurrent connections.
    pub max_connections: Option<u32>,
    /// Behavior when limit is exceeded.
    #[serde(default)]
    pub on_limit: OnLimitBehavior,
    /// Enable rate limiting.
    #[serde(default)]
    pub enabled: bool,
}

fn default_rate_window() -> Duration { Duration::from_secs(60) }

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            max_emails: None,
            window: default_rate_window(),
            max_connections: None,
            on_limit: OnLimitBehavior::default(),
            enabled: false,
        }
    }
}

/// SMTP client configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmtpConfig {
    /// SMTP server hostname.
    pub host: String,
    /// SMTP server port.
    #[serde(default = "default_port")]
    pub port: u16,
    /// TLS configuration.
    #[serde(default)]
    pub tls: TlsConfig,
    /// Authentication username.
    pub username: Option<String>,
    /// Authentication password (serialization skipped for security).
    #[serde(skip)]
    pub password: Option<SecretString>,
    /// Preferred authentication method.
    pub auth_method: Option<AuthMethod>,
    /// Connect timeout.
    #[serde(default = "default_connect_timeout", with = "humantime_serde")]
    pub connect_timeout: Duration,
    /// Command timeout.
    #[serde(default = "default_command_timeout", with = "humantime_serde")]
    pub command_timeout: Duration,
    /// Maximum message size.
    #[serde(default = "default_max_message_size")]
    pub max_message_size: usize,
    /// Connection pool configuration.
    #[serde(default)]
    pub pool: PoolConfig,
    /// Retry configuration.
    #[serde(default)]
    pub retry: RetryConfig,
    /// Circuit breaker configuration.
    #[serde(default)]
    pub circuit_breaker: CircuitBreakerConfig,
    /// Rate limit configuration.
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
    /// Client identifier for EHLO.
    pub client_id: Option<String>,
}

fn default_port() -> u16 { DEFAULT_PORT }
fn default_connect_timeout() -> Duration { DEFAULT_CONNECT_TIMEOUT }
fn default_command_timeout() -> Duration { DEFAULT_COMMAND_TIMEOUT }
fn default_max_message_size() -> usize { DEFAULT_MAX_MESSAGE_SIZE }

impl SmtpConfig {
    /// Creates a new configuration builder.
    pub fn builder() -> SmtpConfigBuilder {
        SmtpConfigBuilder::default()
    }

    /// Validates the configuration.
    pub fn validate(&self) -> SmtpResult<()> {
        if self.host.is_empty() {
            return Err(SmtpError::configuration("Host is required"));
        }

        if self.port == 0 {
            return Err(SmtpError::configuration("Port must be non-zero"));
        }

        // Validate TLS config
        self.tls.validate()?;

        // Validate pool config
        if self.pool.max_connections == 0 {
            return Err(SmtpError::configuration("max_connections must be positive"));
        }

        if self.pool.min_idle > self.pool.max_connections {
            return Err(SmtpError::configuration(
                "min_idle cannot exceed max_connections",
            ));
        }

        Ok(())
    }

    /// Returns the full server address.
    pub fn address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }

    /// Returns true if authentication is configured.
    pub fn has_auth(&self) -> bool {
        self.username.is_some() && self.password.is_some()
    }

    /// Returns the client identifier for EHLO.
    pub fn client_id(&self) -> &str {
        self.client_id.as_deref().unwrap_or("localhost")
    }
}

/// Builder for SMTP configuration.
#[derive(Debug, Default)]
pub struct SmtpConfigBuilder {
    host: Option<String>,
    port: u16,
    tls: TlsConfig,
    username: Option<String>,
    password: Option<SecretString>,
    auth_method: Option<AuthMethod>,
    connect_timeout: Duration,
    command_timeout: Duration,
    max_message_size: usize,
    pool: PoolConfig,
    retry: RetryConfig,
    circuit_breaker: CircuitBreakerConfig,
    rate_limit: RateLimitConfig,
    client_id: Option<String>,
}

impl SmtpConfigBuilder {
    /// Sets the SMTP server host.
    pub fn host(mut self, host: impl Into<String>) -> Self {
        self.host = Some(host.into());
        self
    }

    /// Sets the SMTP server port.
    pub fn port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }

    /// Sets plain credentials.
    pub fn credentials(mut self, username: impl Into<String>, password: impl Into<String>) -> Self {
        self.username = Some(username.into());
        self.password = Some(SecretString::new(password.into()));
        self
    }

    /// Sets the username.
    pub fn username(mut self, username: impl Into<String>) -> Self {
        self.username = Some(username.into());
        self
    }

    /// Sets the password.
    pub fn password(mut self, password: impl Into<String>) -> Self {
        self.password = Some(SecretString::new(password.into()));
        self
    }

    /// Sets the authentication method.
    pub fn auth_method(mut self, method: AuthMethod) -> Self {
        self.auth_method = Some(method);
        self
    }

    /// Sets the TLS mode.
    pub fn tls_mode(mut self, mode: TlsMode) -> Self {
        self.tls.mode = mode;
        self
    }

    /// Sets the TLS configuration.
    pub fn tls(mut self, config: TlsConfig) -> Self {
        self.tls = config;
        self
    }

    /// Disables TLS (insecure).
    pub fn no_tls(mut self) -> Self {
        self.tls.mode = TlsMode::None;
        self
    }

    /// Sets connect timeout.
    pub fn connect_timeout(mut self, timeout: Duration) -> Self {
        self.connect_timeout = timeout;
        self
    }

    /// Sets command timeout.
    pub fn command_timeout(mut self, timeout: Duration) -> Self {
        self.command_timeout = timeout;
        self
    }

    /// Sets maximum message size.
    pub fn max_message_size(mut self, size: usize) -> Self {
        self.max_message_size = size;
        self
    }

    /// Sets pool configuration.
    pub fn pool(mut self, config: PoolConfig) -> Self {
        self.pool = config;
        self
    }

    /// Sets retry configuration.
    pub fn retry(mut self, config: RetryConfig) -> Self {
        self.retry = config;
        self
    }

    /// Disables retries.
    pub fn no_retry(mut self) -> Self {
        self.retry.enabled = false;
        self
    }

    /// Sets circuit breaker configuration.
    pub fn circuit_breaker(mut self, config: CircuitBreakerConfig) -> Self {
        self.circuit_breaker = config;
        self
    }

    /// Disables circuit breaker.
    pub fn no_circuit_breaker(mut self) -> Self {
        self.circuit_breaker.enabled = false;
        self
    }

    /// Sets rate limit configuration.
    pub fn rate_limit(mut self, config: RateLimitConfig) -> Self {
        self.rate_limit = config;
        self
    }

    /// Sets the client identifier for EHLO.
    pub fn client_id(mut self, id: impl Into<String>) -> Self {
        self.client_id = Some(id.into());
        self
    }

    /// Builds the configuration.
    pub fn build(self) -> SmtpResult<SmtpConfig> {
        let config = SmtpConfig {
            host: self.host.ok_or_else(|| SmtpError::configuration("Host is required"))?,
            port: if self.port == 0 { DEFAULT_PORT } else { self.port },
            tls: self.tls,
            username: self.username,
            password: self.password,
            auth_method: self.auth_method,
            connect_timeout: if self.connect_timeout == Duration::ZERO {
                DEFAULT_CONNECT_TIMEOUT
            } else {
                self.connect_timeout
            },
            command_timeout: if self.command_timeout == Duration::ZERO {
                DEFAULT_COMMAND_TIMEOUT
            } else {
                self.command_timeout
            },
            max_message_size: if self.max_message_size == 0 {
                DEFAULT_MAX_MESSAGE_SIZE
            } else {
                self.max_message_size
            },
            pool: self.pool,
            retry: self.retry,
            circuit_breaker: self.circuit_breaker,
            rate_limit: self.rate_limit,
            client_id: self.client_id,
        };

        config.validate()?;
        Ok(config)
    }
}

// Humantime serde support
mod humantime_serde {
    use serde::{Deserialize, Deserializer, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let s = humantime::format_duration(*duration).to_string();
        serializer.serialize_str(&s)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        humantime::parse_duration(&s).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_builder() {
        let config = SmtpConfig::builder()
            .host("smtp.example.com")
            .port(587)
            .credentials("user", "pass")
            .build()
            .unwrap();

        assert_eq!(config.host, "smtp.example.com");
        assert_eq!(config.port, 587);
        assert_eq!(config.username, Some("user".to_string()));
        assert!(config.password.is_some());
    }

    #[test]
    fn test_config_defaults() {
        let config = SmtpConfig::builder()
            .host("smtp.example.com")
            .build()
            .unwrap();

        assert_eq!(config.port, DEFAULT_PORT);
        assert_eq!(config.connect_timeout, DEFAULT_CONNECT_TIMEOUT);
        assert_eq!(config.tls.mode, TlsMode::StartTls);
    }

    #[test]
    fn test_config_validation() {
        // Missing host
        let result = SmtpConfig::builder().build();
        assert!(result.is_err());

        // Invalid pool config
        let result = SmtpConfig::builder()
            .host("smtp.example.com")
            .pool(PoolConfig {
                max_connections: 0,
                ..Default::default()
            })
            .build();
        assert!(result.is_err());
    }

    #[test]
    fn test_tls_config() {
        let tls = TlsConfig::builder()
            .mode(TlsMode::StartTlsRequired)
            .min_version(TlsVersion::Tls13)
            .build()
            .unwrap();

        assert_eq!(tls.mode, TlsMode::StartTlsRequired);
        assert_eq!(tls.min_version, TlsVersion::Tls13);
        assert!(tls.verify_certificate);
    }
}
