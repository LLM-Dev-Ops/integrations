//! SMTP protocol implementation.
//!
//! Implements RFC 5321 SMTP commands and responses,
//! including ESMTP extensions.

use std::collections::HashSet;
use std::fmt;
use std::str::FromStr;

use crate::auth::AuthMethod;
use crate::errors::{EnhancedStatusCode, SmtpError, SmtpErrorKind, SmtpResult};

/// SMTP commands.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SmtpCommand {
    /// Extended HELLO with client identity.
    Ehlo(String),
    /// Basic HELLO.
    Helo(String),
    /// Start TLS negotiation.
    StartTls,
    /// Authenticate.
    Auth {
        /// Authentication mechanism.
        mechanism: String,
        /// Initial response (optional).
        initial_response: Option<String>,
    },
    /// MAIL FROM command.
    MailFrom {
        /// Sender address.
        address: String,
        /// SIZE parameter (optional).
        size: Option<usize>,
        /// 8BITMIME parameter.
        body_8bit: bool,
        /// SMTPUTF8 parameter.
        smtputf8: bool,
    },
    /// RCPT TO command.
    RcptTo {
        /// Recipient address.
        address: String,
    },
    /// DATA command.
    Data,
    /// Reset transaction.
    Rset,
    /// No operation (keepalive).
    Noop,
    /// Quit connection.
    Quit,
    /// Verify address (rarely supported).
    Vrfy(String),
    /// Expand alias (rarely supported).
    Expn(String),
}

impl SmtpCommand {
    /// Formats the command for sending.
    pub fn to_smtp_string(&self) -> String {
        match self {
            SmtpCommand::Ehlo(domain) => format!("EHLO {}", domain),
            SmtpCommand::Helo(domain) => format!("HELO {}", domain),
            SmtpCommand::StartTls => "STARTTLS".to_string(),
            SmtpCommand::Auth {
                mechanism,
                initial_response,
            } => {
                if let Some(response) = initial_response {
                    format!("AUTH {} {}", mechanism, response)
                } else {
                    format!("AUTH {}", mechanism)
                }
            }
            SmtpCommand::MailFrom {
                address,
                size,
                body_8bit,
                smtputf8,
            } => {
                let mut cmd = format!("MAIL FROM:{}", address);
                if let Some(s) = size {
                    cmd.push_str(&format!(" SIZE={}", s));
                }
                if *body_8bit {
                    cmd.push_str(" BODY=8BITMIME");
                }
                if *smtputf8 {
                    cmd.push_str(" SMTPUTF8");
                }
                cmd
            }
            SmtpCommand::RcptTo { address } => format!("RCPT TO:{}", address),
            SmtpCommand::Data => "DATA".to_string(),
            SmtpCommand::Rset => "RSET".to_string(),
            SmtpCommand::Noop => "NOOP".to_string(),
            SmtpCommand::Quit => "QUIT".to_string(),
            SmtpCommand::Vrfy(address) => format!("VRFY {}", address),
            SmtpCommand::Expn(alias) => format!("EXPN {}", alias),
        }
    }
}

impl fmt::Display for SmtpCommand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_smtp_string())
    }
}

/// SMTP response from server.
#[derive(Debug, Clone)]
pub struct SmtpResponse {
    /// Status code (e.g., 250, 354, 550).
    pub code: u16,
    /// Enhanced status code (optional).
    pub enhanced_code: Option<EnhancedStatusCode>,
    /// Response message lines.
    pub message: Vec<String>,
    /// Whether this is a multiline response.
    pub is_multiline: bool,
}

impl SmtpResponse {
    /// Creates a new response.
    pub fn new(code: u16, message: impl Into<String>) -> Self {
        Self {
            code,
            enhanced_code: None,
            message: vec![message.into()],
            is_multiline: false,
        }
    }

    /// Parses a response from raw lines.
    pub fn parse(lines: &[String]) -> SmtpResult<Self> {
        if lines.is_empty() {
            return Err(SmtpError::protocol("Empty response"));
        }

        let mut messages = Vec::new();
        let mut code = 0u16;
        let mut enhanced_code = None;

        for (i, line) in lines.iter().enumerate() {
            if line.len() < 3 {
                return Err(SmtpError::protocol(format!("Response too short: {}", line)));
            }

            let parsed_code: u16 = line[..3]
                .parse()
                .map_err(|_| SmtpError::protocol(format!("Invalid status code: {}", line)))?;

            if i == 0 {
                code = parsed_code;
            } else if parsed_code != code {
                return Err(SmtpError::protocol("Inconsistent status codes in multiline response"));
            }

            // Parse message (after code and separator)
            let message = if line.len() > 4 {
                let msg = &line[4..];
                // Check for enhanced status code
                if i == 0 {
                    if let Some((esc, rest)) = Self::parse_enhanced_code(msg) {
                        enhanced_code = Some(esc);
                        rest.trim().to_string()
                    } else {
                        msg.to_string()
                    }
                } else {
                    msg.to_string()
                }
            } else {
                String::new()
            };

            messages.push(message);
        }

        Ok(Self {
            code,
            enhanced_code,
            message: messages,
            is_multiline: lines.len() > 1,
        })
    }

    /// Parses enhanced status code from message start.
    fn parse_enhanced_code(msg: &str) -> Option<(EnhancedStatusCode, &str)> {
        // Format: X.Y.Z rest
        let parts: Vec<&str> = msg.splitn(2, ' ').collect();
        if parts.is_empty() {
            return None;
        }

        let code = EnhancedStatusCode::parse(parts[0])?;
        let rest = parts.get(1).copied().unwrap_or("");
        Some((code, rest))
    }

    /// Returns true if this is a success response (2xx).
    pub fn is_success(&self) -> bool {
        self.code >= 200 && self.code < 300
    }

    /// Returns true if this is a positive intermediate response (3xx).
    pub fn is_intermediate(&self) -> bool {
        self.code >= 300 && self.code < 400
    }

    /// Returns true if this is a temporary failure (4xx).
    pub fn is_temporary_failure(&self) -> bool {
        self.code >= 400 && self.code < 500
    }

    /// Returns true if this is a permanent failure (5xx).
    pub fn is_permanent_failure(&self) -> bool {
        self.code >= 500 && self.code < 600
    }

    /// Returns true if this response indicates the server supports ESMTP.
    pub fn indicates_esmtp(&self) -> bool {
        self.code == 250 && self.message.iter().any(|m| m.contains("ESMTP"))
    }

    /// Returns the first message line.
    pub fn first_message(&self) -> &str {
        self.message.first().map(|s| s.as_str()).unwrap_or("")
    }

    /// Returns all message lines joined.
    pub fn full_message(&self) -> String {
        self.message.join("\n")
    }

    /// Converts to an error if not successful.
    pub fn to_error(&self) -> SmtpError {
        let mut err = SmtpError::from_smtp_response(self.code, self.full_message());
        if let Some(enhanced) = &self.enhanced_code {
            err = err.with_enhanced_code(enhanced.clone());
        }
        err
    }
}

impl fmt::Display for SmtpResponse {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {}", self.code, self.first_message())
    }
}

/// ESMTP server capabilities.
#[derive(Debug, Clone, Default)]
pub struct EsmtpCapabilities {
    /// Maximum message size.
    pub size: Option<usize>,
    /// Supported authentication mechanisms.
    pub auth_mechanisms: HashSet<AuthMethod>,
    /// STARTTLS supported.
    pub starttls: bool,
    /// 8BITMIME supported.
    pub eight_bit_mime: bool,
    /// PIPELINING supported.
    pub pipelining: bool,
    /// SMTPUTF8 supported.
    pub smtputf8: bool,
    /// CHUNKING supported.
    pub chunking: bool,
    /// Enhanced status codes supported.
    pub enhanced_status_codes: bool,
    /// DSN supported.
    pub dsn: bool,
    /// Raw capability strings.
    pub raw: Vec<String>,
}

impl EsmtpCapabilities {
    /// Parses capabilities from EHLO response.
    pub fn from_ehlo_response(response: &SmtpResponse) -> Self {
        let mut caps = Self::default();

        for line in &response.message {
            let line = line.trim().to_uppercase();
            caps.raw.push(line.clone());

            let parts: Vec<&str> = line.splitn(2, ' ').collect();
            let capability = parts[0];
            let params = parts.get(1).copied().unwrap_or("");

            match capability {
                "SIZE" => {
                    caps.size = params.parse().ok();
                }
                "AUTH" => {
                    for mech in params.split_whitespace() {
                        if let Some(method) = AuthMethod::from_capability(mech) {
                            caps.auth_mechanisms.insert(method);
                        }
                    }
                }
                "STARTTLS" => {
                    caps.starttls = true;
                }
                "8BITMIME" => {
                    caps.eight_bit_mime = true;
                }
                "PIPELINING" => {
                    caps.pipelining = true;
                }
                "SMTPUTF8" => {
                    caps.smtputf8 = true;
                }
                "CHUNKING" => {
                    caps.chunking = true;
                }
                "ENHANCEDSTATUSCODES" => {
                    caps.enhanced_status_codes = true;
                }
                "DSN" => {
                    caps.dsn = true;
                }
                _ => {}
            }
        }

        caps
    }

    /// Returns true if authentication is available.
    pub fn has_auth(&self) -> bool {
        !self.auth_mechanisms.is_empty()
    }

    /// Returns the best authentication method for the given credentials.
    pub fn best_auth_method(&self, compatible: &[AuthMethod]) -> Option<AuthMethod> {
        let mut candidates: Vec<_> = self
            .auth_mechanisms
            .iter()
            .filter(|m| compatible.contains(m))
            .copied()
            .collect();

        candidates.sort_by(|a, b| b.priority().cmp(&a.priority()));
        candidates.first().copied()
    }

    /// Checks if a specific capability is supported.
    pub fn has_capability(&self, name: &str) -> bool {
        let upper = name.to_uppercase();
        self.raw.iter().any(|c| c.starts_with(&upper))
    }
}

/// SMTP transaction state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransactionState {
    /// Initial state, need to send greeting.
    Initial,
    /// Connected, received server greeting.
    Connected,
    /// EHLO/HELO sent, ready for TLS or AUTH.
    Greeted,
    /// TLS established.
    TlsEstablished,
    /// Authenticated.
    Authenticated,
    /// In mail transaction (after MAIL FROM).
    InTransaction,
    /// Recipients added (after RCPT TO).
    RecipientsAdded,
    /// Sending data (after DATA).
    SendingData,
    /// Transaction complete.
    Complete,
    /// Connection closed.
    Closed,
}

impl TransactionState {
    /// Returns true if authentication is allowed in this state.
    pub fn can_authenticate(&self) -> bool {
        matches!(self, TransactionState::Greeted | TransactionState::TlsEstablished)
    }

    /// Returns true if MAIL FROM is allowed in this state.
    pub fn can_start_mail(&self) -> bool {
        matches!(
            self,
            TransactionState::Greeted
                | TransactionState::TlsEstablished
                | TransactionState::Authenticated
                | TransactionState::Complete
        )
    }

    /// Returns true if RCPT TO is allowed in this state.
    pub fn can_add_recipient(&self) -> bool {
        matches!(
            self,
            TransactionState::InTransaction | TransactionState::RecipientsAdded
        )
    }

    /// Returns true if DATA is allowed in this state.
    pub fn can_send_data(&self) -> bool {
        matches!(self, TransactionState::RecipientsAdded)
    }
}

/// Response codes for common SMTP operations.
pub mod codes {
    /// Service ready.
    pub const SERVICE_READY: u16 = 220;
    /// Service closing.
    pub const SERVICE_CLOSING: u16 = 221;
    /// Authentication successful.
    pub const AUTH_SUCCESS: u16 = 235;
    /// OK.
    pub const OK: u16 = 250;
    /// Start mail input.
    pub const START_MAIL_INPUT: u16 = 354;
    /// Continue (AUTH).
    pub const AUTH_CONTINUE: u16 = 334;
    /// Service unavailable.
    pub const SERVICE_UNAVAILABLE: u16 = 421;
    /// Mailbox unavailable (temporary).
    pub const MAILBOX_UNAVAILABLE_TEMP: u16 = 450;
    /// Local error.
    pub const LOCAL_ERROR: u16 = 451;
    /// Insufficient storage.
    pub const INSUFFICIENT_STORAGE: u16 = 452;
    /// Syntax error.
    pub const SYNTAX_ERROR: u16 = 500;
    /// Parameter syntax error.
    pub const PARAM_SYNTAX_ERROR: u16 = 501;
    /// Command not implemented.
    pub const NOT_IMPLEMENTED: u16 = 502;
    /// Bad command sequence.
    pub const BAD_SEQUENCE: u16 = 503;
    /// Parameter not implemented.
    pub const PARAM_NOT_IMPLEMENTED: u16 = 504;
    /// Authentication required.
    pub const AUTH_REQUIRED: u16 = 530;
    /// Authentication failed.
    pub const AUTH_FAILED: u16 = 535;
    /// Mailbox unavailable (permanent).
    pub const MAILBOX_UNAVAILABLE: u16 = 550;
    /// User not local.
    pub const USER_NOT_LOCAL: u16 = 551;
    /// Message too big.
    pub const MESSAGE_TOO_BIG: u16 = 552;
    /// Invalid mailbox name.
    pub const INVALID_MAILBOX: u16 = 553;
    /// Transaction failed.
    pub const TRANSACTION_FAILED: u16 = 554;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_formatting() {
        assert_eq!(
            SmtpCommand::Ehlo("localhost".to_string()).to_smtp_string(),
            "EHLO localhost"
        );
        assert_eq!(SmtpCommand::StartTls.to_smtp_string(), "STARTTLS");
        assert_eq!(
            SmtpCommand::MailFrom {
                address: "<test@example.com>".to_string(),
                size: Some(1024),
                body_8bit: true,
                smtputf8: false,
            }
            .to_smtp_string(),
            "MAIL FROM:<test@example.com> SIZE=1024 BODY=8BITMIME"
        );
    }

    #[test]
    fn test_response_parse() {
        let lines = vec!["250 OK".to_string()];
        let response = SmtpResponse::parse(&lines).unwrap();
        assert_eq!(response.code, 250);
        assert!(response.is_success());
        assert_eq!(response.first_message(), "OK");

        // Multiline
        let lines = vec![
            "250-smtp.example.com Hello".to_string(),
            "250-SIZE 10485760".to_string(),
            "250 STARTTLS".to_string(),
        ];
        let response = SmtpResponse::parse(&lines).unwrap();
        assert_eq!(response.code, 250);
        assert!(response.is_multiline);
        assert_eq!(response.message.len(), 3);
    }

    #[test]
    fn test_response_with_enhanced_code() {
        let lines = vec!["550 5.1.1 User unknown".to_string()];
        let response = SmtpResponse::parse(&lines).unwrap();
        assert_eq!(response.code, 550);
        assert!(response.enhanced_code.is_some());
        let esc = response.enhanced_code.unwrap();
        assert_eq!(esc.class, 5);
        assert_eq!(esc.subject, 1);
        assert_eq!(esc.detail, 1);
    }

    #[test]
    fn test_capabilities_parse() {
        let response = SmtpResponse {
            code: 250,
            enhanced_code: None,
            message: vec![
                "smtp.example.com".to_string(),
                "SIZE 10485760".to_string(),
                "AUTH PLAIN LOGIN CRAM-MD5".to_string(),
                "STARTTLS".to_string(),
                "8BITMIME".to_string(),
                "PIPELINING".to_string(),
            ],
            is_multiline: true,
        };

        let caps = EsmtpCapabilities::from_ehlo_response(&response);
        assert_eq!(caps.size, Some(10485760));
        assert!(caps.auth_mechanisms.contains(&AuthMethod::Plain));
        assert!(caps.auth_mechanisms.contains(&AuthMethod::Login));
        assert!(caps.auth_mechanisms.contains(&AuthMethod::CramMd5));
        assert!(caps.starttls);
        assert!(caps.eight_bit_mime);
        assert!(caps.pipelining);
    }

    #[test]
    fn test_transaction_state() {
        assert!(TransactionState::Greeted.can_authenticate());
        assert!(!TransactionState::InTransaction.can_authenticate());
        assert!(TransactionState::Authenticated.can_start_mail());
        assert!(TransactionState::InTransaction.can_add_recipient());
        assert!(TransactionState::RecipientsAdded.can_send_data());
    }
}
