//! Main SMTP client implementation.
//!
//! Provides a high-level interface for sending emails with:
//! - Connection pooling
//! - Automatic authentication
//! - TLS negotiation
//! - Resilience (retry, circuit breaker, rate limiting)

use std::sync::Arc;
use std::time::Instant;

use crate::auth::{AuthMethod, Authenticator, CredentialProvider, Credentials, StaticCredentialProvider};
use crate::config::{SmtpConfig, TlsMode};
use crate::errors::{SmtpError, SmtpErrorKind, SmtpResult};
use crate::mime::MimeEncoder;
use crate::observability::{SmtpMetrics, Timer};
use crate::protocol::{EsmtpCapabilities, SmtpCommand, TransactionState, codes};
use crate::resilience::{CircuitBreaker, RateLimiter, ResilienceOrchestrator, RetryExecutor};
use crate::transport::{SmtpTransport, TcpTransport, pool::{SmtpPool, create_pool}};
use crate::types::{
    Address, BatchSendResult, ConnectionInfo, Email, PoolStatus, RejectedRecipient, SendResult,
};

/// High-level SMTP client.
pub struct SmtpClient {
    /// Configuration.
    config: Arc<SmtpConfig>,
    /// Connection pool.
    pool: Option<SmtpPool>,
    /// Credential provider.
    credential_provider: Option<Arc<dyn CredentialProvider>>,
    /// Resilience orchestrator.
    resilience: ResilienceOrchestrator,
    /// Metrics collector.
    metrics: Arc<SmtpMetrics>,
    /// MIME encoder.
    encoder: MimeEncoder,
}

impl SmtpClient {
    /// Creates a new SMTP client.
    pub async fn new(config: SmtpConfig) -> SmtpResult<Self> {
        let config = Arc::new(config);

        // Create credential provider if credentials are configured
        let credential_provider: Option<Arc<dyn CredentialProvider>> = if config.has_auth() {
            Some(Arc::new(StaticCredentialProvider::plain(
                config.username.clone().unwrap_or_default(),
                config.password.as_ref().map(|s| s.expose_secret()).unwrap_or("").to_string(),
            )))
        } else {
            None
        };

        // Create connection pool
        let pool = create_pool((*config).clone())?;

        // Create resilience orchestrator
        let resilience = ResilienceOrchestrator::new(
            config.retry.clone(),
            config.circuit_breaker.clone(),
            config.rate_limit.clone(),
        );

        // Create MIME encoder
        let encoder = MimeEncoder::new(&config.host);

        Ok(Self {
            config,
            pool: Some(pool),
            credential_provider,
            resilience,
            metrics: Arc::new(SmtpMetrics::new()),
            encoder,
        })
    }

    /// Creates a builder for the SMTP client.
    pub fn builder() -> SmtpClientBuilder {
        SmtpClientBuilder::default()
    }

    /// Sends an email.
    pub async fn send(&self, email: Email) -> SmtpResult<SendResult> {
        let start = Instant::now();
        let message_id = email.message_id.clone()
            .unwrap_or_else(|| self.encoder.generate_message_id());

        // Encode the email
        let encoded = self.encoder.encode(&email)?;
        let data = MimeEncoder::prepare_data_content(&encoded);

        // Execute with resilience
        let result = self.resilience.execute(|| {
            let email = email.clone();
            let data = data.clone();
            let message_id = message_id.clone();
            async move {
                self.send_inner(&email, &data, &message_id).await
            }
        }).await;

        match &result {
            Ok(_) => self.metrics.record_send_success(),
            Err(_) => self.metrics.record_send_failure(),
        }

        result.map(|mut r| {
            r.duration = start.elapsed();
            r
        })
    }

    /// Sends multiple emails.
    pub async fn send_batch(&self, emails: Vec<Email>) -> BatchSendResult {
        let start = Instant::now();
        let total = emails.len();
        let mut results = Vec::with_capacity(total);
        let mut succeeded = 0;
        let mut failed = 0;

        for email in emails {
            match self.send(email).await {
                Ok(result) => {
                    succeeded += 1;
                    results.push(Ok(result));
                }
                Err(e) => {
                    failed += 1;
                    results.push(Err(e));
                }
            }
        }

        BatchSendResult {
            results,
            total,
            succeeded,
            failed,
            duration: start.elapsed(),
        }
    }

    /// Tests the connection to the server.
    pub async fn test_connection(&self) -> SmtpResult<ConnectionInfo> {
        let mut transport = TcpTransport::connect(&self.config).await?;

        // Send EHLO
        let client_id = self.config.client_id();
        let response = transport.send_command(&SmtpCommand::Ehlo(client_id.to_string())).await?;

        if !response.is_success() {
            // Fall back to HELO
            let response = transport.send_command(&SmtpCommand::Helo(client_id.to_string())).await?;
            if !response.is_success() {
                return Err(response.to_error());
            }
        }

        let capabilities = EsmtpCapabilities::from_ehlo_response(&response);
        transport.set_capabilities(capabilities.clone());

        let info = ConnectionInfo {
            host: self.config.host.clone(),
            port: self.config.port,
            tls_enabled: transport.is_tls(),
            tls_version: None, // Would need to extract from TLS connection
            capabilities: capabilities.raw.clone(),
            banner: response.full_message(),
            authenticated_user: None,
        };

        transport.close().await?;
        Ok(info)
    }

    /// Returns the connection pool status.
    pub fn pool_status(&self) -> PoolStatus {
        if let Some(pool) = &self.pool {
            let status = pool.status();
            PoolStatus {
                total: status.size,
                idle: status.available,
                in_use: status.size - status.available,
                pending: status.waiting,
                max_size: status.max_size,
            }
        } else {
            PoolStatus::default()
        }
    }

    /// Returns a reference to the metrics collector.
    pub fn metrics(&self) -> &SmtpMetrics {
        &self.metrics
    }

    /// Returns a reference to the circuit breaker.
    pub fn circuit_breaker(&self) -> &Arc<CircuitBreaker> {
        self.resilience.circuit_breaker()
    }

    /// Resets resilience state.
    pub fn reset_resilience(&self) {
        self.resilience.reset();
    }

    /// Internal send implementation.
    async fn send_inner(
        &self,
        email: &Email,
        data: &[u8],
        message_id: &str,
    ) -> SmtpResult<SendResult> {
        // Get connection from pool
        let pool = self.pool.as_ref().ok_or_else(|| {
            SmtpError::configuration("Connection pool not available")
        })?;

        let mut conn = pool.get().await.map_err(|e| {
            SmtpError::pool(SmtpErrorKind::AcquireTimeout, format!("Pool acquire failed: {}", e))
        })?;

        let transport: &mut TcpTransport = &mut *conn;

        // Perform SMTP transaction
        self.perform_transaction(transport, email, data, message_id).await
    }

    /// Performs the SMTP transaction.
    async fn perform_transaction(
        &self,
        transport: &mut TcpTransport,
        email: &Email,
        data: &[u8],
        message_id: &str,
    ) -> SmtpResult<SendResult> {
        // Ensure we're in a good state
        self.ensure_ready(transport).await?;

        // Start mail transaction
        let mail_from = SmtpCommand::MailFrom {
            address: email.from.to_smtp(),
            size: Some(data.len()),
            body_8bit: transport.capabilities()
                .map(|c| c.eight_bit_mime)
                .unwrap_or(false),
            smtputf8: false,
        };

        let response = transport.send_command(&mail_from).await?;
        if !response.is_success() {
            return Err(response.to_error());
        }
        transport.set_state(TransactionState::InTransaction);

        // Add recipients
        let mut accepted = Vec::new();
        let mut rejected = Vec::new();

        for recipient in email.all_recipients() {
            let rcpt_to = SmtpCommand::RcptTo {
                address: recipient.to_smtp(),
            };

            let response = transport.send_command(&rcpt_to).await?;
            if response.is_success() {
                accepted.push(recipient.clone());
            } else {
                rejected.push(RejectedRecipient {
                    address: recipient.clone(),
                    code: response.code,
                    message: response.full_message(),
                });
            }
        }

        if accepted.is_empty() {
            // Reset and fail
            transport.send_command(&SmtpCommand::Rset).await?;
            return Err(SmtpError::message_error(
                SmtpErrorKind::InvalidRecipientAddress,
                "All recipients were rejected",
            ));
        }

        transport.set_state(TransactionState::RecipientsAdded);

        // Send DATA command
        let response = transport.send_command(&SmtpCommand::Data).await?;
        if response.code != codes::START_MAIL_INPUT {
            return Err(response.to_error());
        }
        transport.set_state(TransactionState::SendingData);

        // Send message content
        transport.send_data(data).await?;

        // Read final response
        let response = transport.read_response().await?;
        transport.set_state(TransactionState::Complete);

        if !response.is_success() {
            return Err(response.to_error());
        }

        Ok(SendResult {
            message_id: message_id.to_string(),
            server_id: None, // Could parse from response
            accepted,
            rejected,
            response: response.full_message(),
            duration: std::time::Duration::ZERO, // Filled in by caller
        })
    }

    /// Ensures the transport is ready for a new transaction.
    async fn ensure_ready(&self, transport: &mut TcpTransport) -> SmtpResult<()> {
        let state = transport.state();

        // If already authenticated, we're good
        if matches!(state, TransactionState::Authenticated | TransactionState::Complete) {
            return Ok(());
        }

        // Need to go through connection setup
        if matches!(state, TransactionState::Connected | TransactionState::Initial) {
            // Send EHLO
            let client_id = self.config.client_id();
            let response = transport.send_command(&SmtpCommand::Ehlo(client_id.to_string())).await?;

            if !response.is_success() {
                // Fall back to HELO
                let response = transport.send_command(&SmtpCommand::Helo(client_id.to_string())).await?;
                if !response.is_success() {
                    return Err(response.to_error());
                }
            }

            let capabilities = EsmtpCapabilities::from_ehlo_response(&response);
            transport.set_capabilities(capabilities);
            transport.set_state(TransactionState::Greeted);
        }

        // Handle TLS if needed
        if !transport.is_tls() {
            let needs_tls = match self.config.tls.mode {
                TlsMode::StartTls | TlsMode::StartTlsRequired => {
                    transport.capabilities()
                        .map(|c| c.starttls)
                        .unwrap_or(false)
                }
                TlsMode::Implicit => false, // Already TLS
                TlsMode::None => false,
            };

            if needs_tls {
                let response = transport.send_command(&SmtpCommand::StartTls).await?;
                if !response.is_success() {
                    if self.config.tls.mode == TlsMode::StartTlsRequired {
                        return Err(SmtpError::new(
                            SmtpErrorKind::StarttlsNotSupported,
                            "Server does not support STARTTLS",
                        ));
                    }
                } else {
                    transport.upgrade_tls(&self.config.tls, &self.config.host).await?;
                    self.metrics.record_tls_upgrade();

                    // Re-send EHLO after TLS
                    let client_id = self.config.client_id();
                    let response = transport.send_command(&SmtpCommand::Ehlo(client_id.to_string())).await?;
                    if response.is_success() {
                        let capabilities = EsmtpCapabilities::from_ehlo_response(&response);
                        transport.set_capabilities(capabilities);
                    }
                }
            }
        }

        // Authenticate if needed
        if let Some(provider) = &self.credential_provider {
            if transport.state() != TransactionState::Authenticated {
                let credentials = provider.get_credentials().await?;
                self.authenticate(transport, &credentials).await?;
            }
        }

        Ok(())
    }

    /// Performs authentication.
    async fn authenticate(
        &self,
        transport: &mut TcpTransport,
        credentials: &Credentials,
    ) -> SmtpResult<()> {
        let capabilities = transport.capabilities().ok_or_else(|| {
            SmtpError::protocol("No capabilities available")
        })?;

        // Select best auth method
        let available: Vec<AuthMethod> = capabilities.auth_mechanisms.iter().copied().collect();
        let method = if let Some(preferred) = self.config.auth_method {
            if available.contains(&preferred) {
                preferred
            } else {
                return Err(SmtpError::new(
                    SmtpErrorKind::AuthMethodNotSupported,
                    format!("Preferred auth method {:?} not supported", preferred),
                ));
            }
        } else {
            Authenticator::select_best_method(&available, credentials, transport.is_tls())?
        };

        self.metrics.record_auth_attempt(true);

        // Perform authentication based on method
        let result = match method {
            AuthMethod::Plain => self.auth_plain(transport, credentials).await,
            AuthMethod::Login => self.auth_login(transport, credentials).await,
            AuthMethod::CramMd5 => self.auth_cram_md5(transport, credentials).await,
            AuthMethod::XOAuth2 => self.auth_xoauth2(transport, credentials).await,
            AuthMethod::OAuthBearer => self.auth_oauth_bearer(transport, credentials).await,
        };

        match result {
            Ok(()) => {
                transport.set_state(TransactionState::Authenticated);
                Ok(())
            }
            Err(e) => {
                self.metrics.record_auth_attempt(false);
                Err(e)
            }
        }
    }

    async fn auth_plain(&self, transport: &mut TcpTransport, credentials: &Credentials) -> SmtpResult<()> {
        if let Credentials::Plain { username, password } = credentials {
            let initial_response = Authenticator::plain_initial_response(username, password);
            let command = SmtpCommand::Auth {
                mechanism: "PLAIN".to_string(),
                initial_response: Some(initial_response),
            };

            let response = transport.send_command(&command).await?;
            if response.code == codes::AUTH_SUCCESS {
                Ok(())
            } else {
                Err(response.to_error())
            }
        } else {
            Err(SmtpError::authentication("Invalid credentials for PLAIN auth"))
        }
    }

    async fn auth_login(&self, transport: &mut TcpTransport, credentials: &Credentials) -> SmtpResult<()> {
        if let Credentials::Plain { username, password } = credentials {
            // Send AUTH LOGIN
            let command = SmtpCommand::Auth {
                mechanism: "LOGIN".to_string(),
                initial_response: None,
            };

            let response = transport.send_command(&command).await?;
            if response.code != codes::AUTH_CONTINUE {
                return Err(response.to_error());
            }

            // Send username
            let username_encoded = Authenticator::login_username(username);
            transport.send_data(format!("{}\r\n", username_encoded).as_bytes()).await?;

            let response = transport.read_response().await?;
            if response.code != codes::AUTH_CONTINUE {
                return Err(response.to_error());
            }

            // Send password
            let password_encoded = Authenticator::login_password(password);
            transport.send_data(format!("{}\r\n", password_encoded).as_bytes()).await?;

            let response = transport.read_response().await?;
            if response.code == codes::AUTH_SUCCESS {
                Ok(())
            } else {
                Err(response.to_error())
            }
        } else {
            Err(SmtpError::authentication("Invalid credentials for LOGIN auth"))
        }
    }

    async fn auth_cram_md5(&self, transport: &mut TcpTransport, credentials: &Credentials) -> SmtpResult<()> {
        if let Credentials::Plain { username, password } = credentials {
            // Send AUTH CRAM-MD5
            let command = SmtpCommand::Auth {
                mechanism: "CRAM-MD5".to_string(),
                initial_response: None,
            };

            let response = transport.send_command(&command).await?;
            if response.code != codes::AUTH_CONTINUE {
                return Err(response.to_error());
            }

            // Parse challenge and respond
            let challenge = response.first_message();
            let response_str = Authenticator::cram_md5_response(challenge, username, password)?;
            transport.send_data(format!("{}\r\n", response_str).as_bytes()).await?;

            let response = transport.read_response().await?;
            if response.code == codes::AUTH_SUCCESS {
                Ok(())
            } else {
                Err(response.to_error())
            }
        } else {
            Err(SmtpError::authentication("Invalid credentials for CRAM-MD5 auth"))
        }
    }

    async fn auth_xoauth2(&self, transport: &mut TcpTransport, credentials: &Credentials) -> SmtpResult<()> {
        if let Credentials::XOAuth2 { username, access_token } = credentials {
            let initial_response = Authenticator::xoauth2_initial_response(username, access_token);
            let command = SmtpCommand::Auth {
                mechanism: "XOAUTH2".to_string(),
                initial_response: Some(initial_response),
            };

            let response = transport.send_command(&command).await?;
            if response.code == codes::AUTH_SUCCESS {
                Ok(())
            } else {
                Err(response.to_error())
            }
        } else {
            Err(SmtpError::authentication("Invalid credentials for XOAUTH2 auth"))
        }
    }

    async fn auth_oauth_bearer(&self, transport: &mut TcpTransport, credentials: &Credentials) -> SmtpResult<()> {
        if let Credentials::OAuthBearer { access_token } = credentials {
            let initial_response = Authenticator::oauth_bearer_initial_response(
                access_token,
                Some(&self.config.host),
                Some(self.config.port),
            );
            let command = SmtpCommand::Auth {
                mechanism: "OAUTHBEARER".to_string(),
                initial_response: Some(initial_response),
            };

            let response = transport.send_command(&command).await?;
            if response.code == codes::AUTH_SUCCESS {
                Ok(())
            } else {
                Err(response.to_error())
            }
        } else {
            Err(SmtpError::authentication("Invalid credentials for OAUTHBEARER auth"))
        }
    }
}

impl MimeEncoder {
    /// Generates a message ID.
    pub fn generate_message_id(&self) -> String {
        let uuid = uuid::Uuid::new_v4();
        format!("{}.{}@{}", uuid, chrono::Utc::now().timestamp(), self.domain)
    }
}

/// Builder for SmtpClient.
#[derive(Debug, Default)]
pub struct SmtpClientBuilder {
    config_builder: Option<crate::config::SmtpConfigBuilder>,
    credential_provider: Option<Arc<dyn CredentialProvider>>,
}

impl SmtpClientBuilder {
    /// Sets the SMTP host.
    pub fn host(mut self, host: impl Into<String>) -> Self {
        self.config_builder = Some(
            self.config_builder
                .unwrap_or_else(crate::config::SmtpConfig::builder)
                .host(host),
        );
        self
    }

    /// Sets the SMTP port.
    pub fn port(mut self, port: u16) -> Self {
        if let Some(builder) = self.config_builder.take() {
            self.config_builder = Some(builder.port(port));
        }
        self
    }

    /// Sets plain credentials.
    pub fn credentials(mut self, username: impl Into<String>, password: impl Into<String>) -> Self {
        if let Some(builder) = self.config_builder.take() {
            self.config_builder = Some(builder.credentials(username, password));
        }
        self
    }

    /// Sets a custom credential provider.
    pub fn credential_provider(mut self, provider: Arc<dyn CredentialProvider>) -> Self {
        self.credential_provider = Some(provider);
        self
    }

    /// Builds the client.
    pub async fn build(self) -> SmtpResult<SmtpClient> {
        let config = self.config_builder
            .ok_or_else(|| SmtpError::configuration("Host is required"))?
            .build()?;

        SmtpClient::new(config).await
    }
}

use secrecy::ExposeSecret;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_builder() {
        // Builder pattern test (doesn't actually connect)
        let builder = SmtpClient::builder()
            .host("smtp.example.com")
            .port(587);

        // Can't test build() without actual server
        assert!(builder.config_builder.is_some());
    }
}
