//! Mock implementations for testing.
//!
//! Provides mock transports and utilities for London-School TDD.

use async_trait::async_trait;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use crate::config::TlsConfig;
use crate::errors::{SmtpError, SmtpResult};
use crate::protocol::{EsmtpCapabilities, SmtpCommand, SmtpResponse, TransactionState, codes};
use crate::transport::SmtpTransport;
use crate::types::{Address, Email};

/// Mock SMTP transport for testing.
#[derive(Debug)]
pub struct MockTransport {
    /// Recorded commands.
    commands: Arc<Mutex<Vec<SmtpCommand>>>,
    /// Queued responses.
    responses: Arc<Mutex<VecDeque<SmtpResponse>>>,
    /// Default response.
    default_response: SmtpResponse,
    /// Current state.
    state: TransactionState,
    /// Server capabilities.
    capabilities: Option<EsmtpCapabilities>,
    /// TLS enabled.
    tls_enabled: bool,
    /// Data received.
    data_received: Arc<Mutex<Vec<Vec<u8>>>>,
    /// Simulate failure.
    fail_next: Arc<Mutex<Option<SmtpError>>>,
}

impl MockTransport {
    /// Creates a new mock transport.
    pub fn new() -> Self {
        Self {
            commands: Arc::new(Mutex::new(Vec::new())),
            responses: Arc::new(Mutex::new(VecDeque::new())),
            default_response: SmtpResponse::new(250, "OK"),
            state: TransactionState::Connected,
            capabilities: Some(Self::default_capabilities()),
            tls_enabled: false,
            data_received: Arc::new(Mutex::new(Vec::new())),
            fail_next: Arc::new(Mutex::new(None)),
        }
    }

    /// Creates default ESMTP capabilities.
    pub fn default_capabilities() -> EsmtpCapabilities {
        let mut caps = EsmtpCapabilities::default();
        caps.starttls = true;
        caps.eight_bit_mime = true;
        caps.pipelining = true;
        caps.auth_mechanisms.insert(crate::auth::AuthMethod::Plain);
        caps.auth_mechanisms.insert(crate::auth::AuthMethod::Login);
        caps.size = Some(10 * 1024 * 1024);
        caps.raw = vec![
            "SIZE 10485760".to_string(),
            "AUTH PLAIN LOGIN".to_string(),
            "STARTTLS".to_string(),
            "8BITMIME".to_string(),
            "PIPELINING".to_string(),
        ];
        caps
    }

    /// Queues a response.
    pub fn queue_response(&self, response: SmtpResponse) -> &Self {
        self.responses.lock().unwrap().push_back(response);
        self
    }

    /// Queues an OK response.
    pub fn queue_ok(&self) -> &Self {
        self.queue_response(SmtpResponse::new(codes::OK, "OK"))
    }

    /// Queues an error response.
    pub fn queue_error(&self, code: u16, message: &str) -> &Self {
        self.queue_response(SmtpResponse::new(code, message))
    }

    /// Sets the next call to fail.
    pub fn fail_next_with(&self, error: SmtpError) -> &Self {
        *self.fail_next.lock().unwrap() = Some(error);
        self
    }

    /// Sets TLS enabled.
    pub fn set_tls_enabled(&mut self, enabled: bool) {
        self.tls_enabled = enabled;
    }

    /// Returns recorded commands.
    pub fn recorded_commands(&self) -> Vec<SmtpCommand> {
        self.commands.lock().unwrap().clone()
    }

    /// Returns received data.
    pub fn received_data(&self) -> Vec<Vec<u8>> {
        self.data_received.lock().unwrap().clone()
    }

    /// Clears recorded data.
    pub fn clear(&self) {
        self.commands.lock().unwrap().clear();
        self.responses.lock().unwrap().clear();
        self.data_received.lock().unwrap().clear();
        *self.fail_next.lock().unwrap() = None;
    }

    fn get_next_response(&self) -> SmtpResponse {
        self.responses
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| self.default_response.clone())
    }
}

impl Default for MockTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SmtpTransport for MockTransport {
    async fn send_command(&mut self, command: &SmtpCommand) -> SmtpResult<SmtpResponse> {
        // Check for programmed failure
        if let Some(error) = self.fail_next.lock().unwrap().take() {
            return Err(error);
        }

        self.commands.lock().unwrap().push(command.clone());
        Ok(self.get_next_response())
    }

    async fn send_data(&mut self, data: &[u8]) -> SmtpResult<()> {
        if let Some(error) = self.fail_next.lock().unwrap().take() {
            return Err(error);
        }

        self.data_received.lock().unwrap().push(data.to_vec());
        Ok(())
    }

    async fn read_response(&mut self) -> SmtpResult<SmtpResponse> {
        if let Some(error) = self.fail_next.lock().unwrap().take() {
            return Err(error);
        }

        Ok(self.get_next_response())
    }

    async fn upgrade_tls(&mut self, _config: &TlsConfig, _host: &str) -> SmtpResult<()> {
        if let Some(error) = self.fail_next.lock().unwrap().take() {
            return Err(error);
        }

        self.tls_enabled = true;
        self.state = TransactionState::TlsEstablished;
        Ok(())
    }

    fn is_tls(&self) -> bool {
        self.tls_enabled
    }

    async fn health_check(&mut self) -> SmtpResult<()> {
        Ok(())
    }

    async fn close(&mut self) -> SmtpResult<()> {
        self.state = TransactionState::Closed;
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

/// Mock credential provider.
#[derive(Debug, Clone)]
pub struct MockCredentialProvider {
    credentials: crate::auth::Credentials,
    should_fail: bool,
}

impl MockCredentialProvider {
    /// Creates a new mock provider with plain credentials.
    pub fn new(username: &str, password: &str) -> Self {
        Self {
            credentials: crate::auth::Credentials::plain(username, password),
            should_fail: false,
        }
    }

    /// Sets whether get_credentials should fail.
    pub fn set_should_fail(&mut self, fail: bool) {
        self.should_fail = fail;
    }
}

#[async_trait]
impl crate::auth::CredentialProvider for MockCredentialProvider {
    async fn get_credentials(&self) -> SmtpResult<crate::auth::Credentials> {
        if self.should_fail {
            Err(SmtpError::authentication("Mock credential failure"))
        } else {
            Ok(self.credentials.clone())
        }
    }

    async fn refresh(&self) -> SmtpResult<()> {
        Ok(())
    }
}

/// Creates a test email.
pub fn test_email() -> SmtpResult<Email> {
    Email::builder()
        .from("sender@example.com")?
        .to("recipient@example.com")?
        .subject("Test Subject")
        .text("Test body")
        .build()
}

/// Creates a test email with HTML.
pub fn test_email_html() -> SmtpResult<Email> {
    Email::builder()
        .from("sender@example.com")?
        .to("recipient@example.com")?
        .subject("Test Subject")
        .text("Plain text version")
        .html("<html><body><h1>HTML version</h1></body></html>")
        .build()
}

/// Creates a test email with attachment.
pub fn test_email_with_attachment() -> SmtpResult<Email> {
    use crate::types::Attachment;

    Email::builder()
        .from("sender@example.com")?
        .to("recipient@example.com")?
        .subject("Test with Attachment")
        .text("See attached")
        .attachment(Attachment::new(
            "test.txt",
            "text/plain",
            b"Hello, World!".to_vec(),
        ))
        .build()
}

/// Creates an EHLO response with standard capabilities.
pub fn ehlo_response() -> SmtpResponse {
    SmtpResponse {
        code: codes::OK,
        enhanced_code: None,
        message: vec![
            "smtp.example.com Hello".to_string(),
            "SIZE 10485760".to_string(),
            "AUTH PLAIN LOGIN CRAM-MD5".to_string(),
            "STARTTLS".to_string(),
            "8BITMIME".to_string(),
            "PIPELINING".to_string(),
            "ENHANCEDSTATUSCODES".to_string(),
        ],
        is_multiline: true,
    }
}

/// Creates a greeting response.
pub fn greeting_response() -> SmtpResponse {
    SmtpResponse::new(codes::SERVICE_READY, "smtp.example.com ESMTP ready")
}

/// Creates an authentication success response.
pub fn auth_success_response() -> SmtpResponse {
    SmtpResponse::new(codes::AUTH_SUCCESS, "Authentication successful")
}

/// Creates a DATA ready response.
pub fn data_ready_response() -> SmtpResponse {
    SmtpResponse::new(codes::START_MAIL_INPUT, "Start mail input")
}

/// Creates an AUTH continue response.
pub fn auth_continue_response(challenge: &str) -> SmtpResponse {
    SmtpResponse::new(codes::AUTH_CONTINUE, challenge)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_transport() {
        let mut transport = MockTransport::new();

        // Queue some responses
        transport.queue_ok();
        transport.queue_ok();

        // Send commands
        let response = transport
            .send_command(&SmtpCommand::Ehlo("test".to_string()))
            .await
            .unwrap();
        assert_eq!(response.code, 250);

        let response = transport
            .send_command(&SmtpCommand::Noop)
            .await
            .unwrap();
        assert_eq!(response.code, 250);

        // Check recorded commands
        let commands = transport.recorded_commands();
        assert_eq!(commands.len(), 2);
    }

    #[tokio::test]
    async fn test_mock_transport_failure() {
        let mut transport = MockTransport::new();

        transport.fail_next_with(SmtpError::connection("Test failure"));

        let result = transport
            .send_command(&SmtpCommand::Noop)
            .await;
        assert!(result.is_err());
    }

    #[test]
    fn test_test_email() {
        let email = test_email().unwrap();
        assert_eq!(email.from.email, "sender@example.com");
        assert_eq!(email.to.len(), 1);
    }
}
