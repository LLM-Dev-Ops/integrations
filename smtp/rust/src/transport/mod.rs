//! Transport layer for SMTP connections.
//!
//! Provides abstractions for TCP connections with optional TLS,
//! connection pooling, and health checks.

use async_trait::async_trait;
use std::fmt;
use std::io;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::config::{SmtpConfig, TlsConfig, TlsMode};
use crate::errors::{SmtpError, SmtpErrorKind, SmtpResult};
use crate::protocol::{EsmtpCapabilities, SmtpCommand, SmtpResponse, TransactionState};

/// Trait for SMTP transport abstraction.
#[async_trait]
pub trait SmtpTransport: Send + Sync + fmt::Debug {
    /// Sends a command and receives a response.
    async fn send_command(&mut self, command: &SmtpCommand) -> SmtpResult<SmtpResponse>;

    /// Sends raw data (for DATA command body).
    async fn send_data(&mut self, data: &[u8]) -> SmtpResult<()>;

    /// Reads a response from the server.
    async fn read_response(&mut self) -> SmtpResult<SmtpResponse>;

    /// Upgrades the connection to TLS.
    async fn upgrade_tls(&mut self, config: &TlsConfig, host: &str) -> SmtpResult<()>;

    /// Returns true if TLS is enabled.
    fn is_tls(&self) -> bool;

    /// Performs a health check (NOOP).
    async fn health_check(&mut self) -> SmtpResult<()>;

    /// Closes the connection gracefully.
    async fn close(&mut self) -> SmtpResult<()>;

    /// Returns the current transaction state.
    fn state(&self) -> TransactionState;

    /// Sets the transaction state.
    fn set_state(&mut self, state: TransactionState);

    /// Returns the server capabilities.
    fn capabilities(&self) -> Option<&EsmtpCapabilities>;

    /// Sets the server capabilities.
    fn set_capabilities(&mut self, caps: EsmtpCapabilities);
}

/// TCP connection with optional TLS.
pub struct TcpTransport {
    /// Read/write stream.
    stream: TransportStream,
    /// Command timeout.
    command_timeout: Duration,
    /// Transaction state.
    state: TransactionState,
    /// Server capabilities.
    capabilities: Option<EsmtpCapabilities>,
    /// TLS enabled flag.
    tls_enabled: bool,
    /// Server host.
    host: String,
}

/// Stream type that can be plain TCP or TLS.
enum TransportStream {
    Plain(BufReader<TcpStream>),
    #[cfg(feature = "rustls-tls")]
    Tls(BufReader<tokio_rustls::client::TlsStream<TcpStream>>),
    #[cfg(feature = "native-tls")]
    NativeTls(BufReader<tokio_native_tls::TlsStream<TcpStream>>),
}

impl fmt::Debug for TcpTransport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TcpTransport")
            .field("host", &self.host)
            .field("tls_enabled", &self.tls_enabled)
            .field("state", &self.state)
            .finish()
    }
}

impl TcpTransport {
    /// Connects to an SMTP server.
    pub async fn connect(config: &SmtpConfig) -> SmtpResult<Self> {
        let address = config.address();

        // Connect with timeout
        let stream = timeout(config.connect_timeout, TcpStream::connect(&address))
            .await
            .map_err(|_| SmtpError::timeout(SmtpErrorKind::ConnectTimeout, "Connect timed out"))?
            .map_err(|e| Self::map_io_error(e, &address))?;

        // Set TCP options
        stream.set_nodelay(true).ok();

        let mut transport = Self {
            stream: TransportStream::Plain(BufReader::new(stream)),
            command_timeout: config.command_timeout,
            state: TransactionState::Initial,
            capabilities: None,
            tls_enabled: false,
            host: config.host.clone(),
        };

        // Read server greeting
        let greeting = transport.read_response().await?;
        if !greeting.is_success() {
            return Err(greeting.to_error());
        }

        transport.state = TransactionState::Connected;

        // Handle implicit TLS
        if matches!(config.tls.mode, TlsMode::Implicit) {
            transport.upgrade_tls(&config.tls, &config.host).await?;
        }

        Ok(transport)
    }

    /// Maps IO errors to SMTP errors.
    fn map_io_error(error: io::Error, address: &str) -> SmtpError {
        match error.kind() {
            io::ErrorKind::ConnectionRefused => {
                SmtpError::new(SmtpErrorKind::ConnectionRefused, format!("Connection refused to {}", address))
            }
            io::ErrorKind::TimedOut => {
                SmtpError::timeout(SmtpErrorKind::ConnectTimeout, "Connect timed out")
            }
            io::ErrorKind::ConnectionReset => {
                SmtpError::new(SmtpErrorKind::ConnectionReset, "Connection reset by server")
            }
            _ => SmtpError::connection(format!("Connection error: {}", error)),
        }
    }

    /// Reads lines until we have a complete response.
    async fn read_response_inner<R: AsyncBufReadExt + Unpin>(
        reader: &mut R,
        timeout_duration: Duration,
    ) -> SmtpResult<SmtpResponse> {
        let mut lines = Vec::new();

        loop {
            let mut line = String::new();

            let result = timeout(timeout_duration, reader.read_line(&mut line))
                .await
                .map_err(|_| SmtpError::timeout(SmtpErrorKind::ReadTimeout, "Read timed out"))?
                .map_err(|e| SmtpError::protocol(format!("Read error: {}", e)))?;

            if result == 0 {
                return Err(SmtpError::new(
                    SmtpErrorKind::ConnectionReset,
                    "Server closed connection",
                ));
            }

            let line = line.trim_end().to_string();

            // Check for continuation (code-hyphen)
            let is_continuation = line.len() >= 4 && line.chars().nth(3) == Some('-');
            lines.push(line);

            if !is_continuation {
                break;
            }
        }

        SmtpResponse::parse(&lines)
    }

    /// Writes data to the stream.
    async fn write_all<W: AsyncWrite + Unpin>(
        writer: &mut W,
        data: &[u8],
        timeout_duration: Duration,
    ) -> SmtpResult<()> {
        timeout(timeout_duration, writer.write_all(data))
            .await
            .map_err(|_| SmtpError::timeout(SmtpErrorKind::WriteTimeout, "Write timed out"))?
            .map_err(|e| SmtpError::protocol(format!("Write error: {}", e)))?;

        timeout(timeout_duration, writer.flush())
            .await
            .map_err(|_| SmtpError::timeout(SmtpErrorKind::WriteTimeout, "Flush timed out"))?
            .map_err(|e| SmtpError::protocol(format!("Flush error: {}", e)))?;

        Ok(())
    }
}

#[async_trait]
impl SmtpTransport for TcpTransport {
    async fn send_command(&mut self, command: &SmtpCommand) -> SmtpResult<SmtpResponse> {
        let cmd_str = format!("{}\r\n", command.to_smtp_string());

        #[cfg(feature = "tracing")]
        tracing::debug!(command = %command, "Sending SMTP command");

        match &mut self.stream {
            TransportStream::Plain(ref mut stream) => {
                Self::write_all(stream.get_mut(), cmd_str.as_bytes(), self.command_timeout).await?;
            }
            #[cfg(feature = "rustls-tls")]
            TransportStream::Tls(ref mut stream) => {
                Self::write_all(stream.get_mut(), cmd_str.as_bytes(), self.command_timeout).await?;
            }
            #[cfg(feature = "native-tls")]
            TransportStream::NativeTls(ref mut stream) => {
                Self::write_all(stream.get_mut(), cmd_str.as_bytes(), self.command_timeout).await?;
            }
        }

        self.read_response().await
    }

    async fn send_data(&mut self, data: &[u8]) -> SmtpResult<()> {
        match &mut self.stream {
            TransportStream::Plain(ref mut stream) => {
                Self::write_all(stream.get_mut(), data, self.command_timeout).await?;
            }
            #[cfg(feature = "rustls-tls")]
            TransportStream::Tls(ref mut stream) => {
                Self::write_all(stream.get_mut(), data, self.command_timeout).await?;
            }
            #[cfg(feature = "native-tls")]
            TransportStream::NativeTls(ref mut stream) => {
                Self::write_all(stream.get_mut(), data, self.command_timeout).await?;
            }
        }
        Ok(())
    }

    async fn read_response(&mut self) -> SmtpResult<SmtpResponse> {
        let response = match &mut self.stream {
            TransportStream::Plain(ref mut stream) => {
                Self::read_response_inner(stream, self.command_timeout).await?
            }
            #[cfg(feature = "rustls-tls")]
            TransportStream::Tls(ref mut stream) => {
                Self::read_response_inner(stream, self.command_timeout).await?
            }
            #[cfg(feature = "native-tls")]
            TransportStream::NativeTls(ref mut stream) => {
                Self::read_response_inner(stream, self.command_timeout).await?
            }
        };

        #[cfg(feature = "tracing")]
        tracing::debug!(code = response.code, message = %response.first_message(), "Received SMTP response");

        Ok(response)
    }

    async fn upgrade_tls(&mut self, config: &TlsConfig, host: &str) -> SmtpResult<()> {
        if self.tls_enabled {
            return Ok(());
        }

        #[cfg(feature = "rustls-tls")]
        {
            use rustls::pki_types::ServerName;
            use std::sync::Arc;

            // Build TLS config
            let mut root_store = rustls::RootCertStore::empty();
            root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

            let tls_config = rustls::ClientConfig::builder()
                .with_root_certificates(root_store)
                .with_no_client_auth();

            let connector = tokio_rustls::TlsConnector::from(Arc::new(tls_config));
            let server_name = ServerName::try_from(host.to_string())
                .map_err(|_| SmtpError::tls(format!("Invalid server name: {}", host)))?;

            // Extract TCP stream
            let tcp_stream = match std::mem::replace(
                &mut self.stream,
                TransportStream::Plain(BufReader::new(unsafe {
                    std::mem::zeroed()
                })),
            ) {
                TransportStream::Plain(reader) => reader.into_inner(),
                _ => return Err(SmtpError::tls("Already using TLS")),
            };

            // Perform TLS handshake
            let tls_stream = timeout(
                Duration::from_secs(30),
                connector.connect(server_name, tcp_stream),
            )
            .await
            .map_err(|_| SmtpError::timeout(SmtpErrorKind::ConnectTimeout, "TLS handshake timed out"))?
            .map_err(|e| SmtpError::tls(format!("TLS handshake failed: {}", e)))?;

            self.stream = TransportStream::Tls(BufReader::new(tls_stream));
            self.tls_enabled = true;
            self.state = TransactionState::TlsEstablished;

            Ok(())
        }

        #[cfg(all(feature = "native-tls", not(feature = "rustls-tls")))]
        {
            use native_tls::TlsConnector;

            let mut builder = TlsConnector::builder();

            if config.accept_invalid_certs {
                builder.danger_accept_invalid_certs(true);
            }

            let connector = builder
                .build()
                .map_err(|e| SmtpError::tls(format!("Failed to build TLS connector: {}", e)))?;

            let connector = tokio_native_tls::TlsConnector::from(connector);

            // Extract TCP stream
            let tcp_stream = match std::mem::replace(
                &mut self.stream,
                TransportStream::Plain(BufReader::new(unsafe {
                    std::mem::zeroed()
                })),
            ) {
                TransportStream::Plain(reader) => reader.into_inner(),
                _ => return Err(SmtpError::tls("Already using TLS")),
            };

            let tls_stream = timeout(Duration::from_secs(30), connector.connect(host, tcp_stream))
                .await
                .map_err(|_| SmtpError::timeout(SmtpErrorKind::ConnectTimeout, "TLS handshake timed out"))?
                .map_err(|e| SmtpError::tls(format!("TLS handshake failed: {}", e)))?;

            self.stream = TransportStream::NativeTls(BufReader::new(tls_stream));
            self.tls_enabled = true;
            self.state = TransactionState::TlsEstablished;

            Ok(())
        }

        #[cfg(not(any(feature = "rustls-tls", feature = "native-tls")))]
        {
            Err(SmtpError::configuration("No TLS implementation available"))
        }
    }

    fn is_tls(&self) -> bool {
        self.tls_enabled
    }

    async fn health_check(&mut self) -> SmtpResult<()> {
        let response = self.send_command(&SmtpCommand::Noop).await?;
        if response.is_success() {
            Ok(())
        } else {
            Err(SmtpError::pool(
                SmtpErrorKind::ConnectionUnhealthy,
                format!("Health check failed: {}", response),
            ))
        }
    }

    async fn close(&mut self) -> SmtpResult<()> {
        if self.state != TransactionState::Closed {
            let _ = self.send_command(&SmtpCommand::Quit).await;
            self.state = TransactionState::Closed;
        }
        Ok(())
    }

    fn state(&self) -> TransactionState {
        self.state
    }

    fn set_state(&mut self, state: TransactionState) {
        self.state = state;
    }

    fn capabilities(&self) -> Option<&EsmtpCapabilities> {
        self.capabilities.as_ref()
    }

    fn set_capabilities(&mut self, caps: EsmtpCapabilities) {
        self.capabilities = Some(caps);
    }
}

/// Connection pool manager.
pub mod pool {
    use super::*;
    use deadpool::managed::{Manager, Metrics, Object, Pool, PoolConfig, RecycleResult};
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Manager for SMTP connections.
    #[derive(Debug)]
    pub struct SmtpConnectionManager {
        config: Arc<SmtpConfig>,
        created: AtomicUsize,
    }

    impl SmtpConnectionManager {
        /// Creates a new connection manager.
        pub fn new(config: SmtpConfig) -> Self {
            Self {
                config: Arc::new(config),
                created: AtomicUsize::new(0),
            }
        }
    }

    #[async_trait]
    impl Manager for SmtpConnectionManager {
        type Type = TcpTransport;
        type Error = SmtpError;

        async fn create(&self) -> Result<Self::Type, Self::Error> {
            self.created.fetch_add(1, Ordering::SeqCst);
            TcpTransport::connect(&self.config).await
        }

        async fn recycle(&self, conn: &mut Self::Type, _: &Metrics) -> RecycleResult<Self::Error> {
            // Health check
            conn.health_check().await.map_err(|e| {
                deadpool::managed::RecycleError::Backend(e)
            })?;
            Ok(())
        }
    }

    /// Type alias for connection pool.
    pub type SmtpPool = Pool<SmtpConnectionManager>;

    /// Creates a connection pool.
    pub fn create_pool(config: SmtpConfig) -> SmtpResult<SmtpPool> {
        let pool_config = PoolConfig {
            max_size: config.pool.max_connections,
            ..Default::default()
        };

        let manager = SmtpConnectionManager::new(config);
        let pool = Pool::builder(manager)
            .config(pool_config)
            .build()
            .map_err(|e| SmtpError::configuration(format!("Failed to create pool: {}", e)))?;

        Ok(pool)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transport_debug() {
        // Just ensure debug formatting works
        let state = TransactionState::Connected;
        assert!(format!("{:?}", state).contains("Connected"));
    }
}
