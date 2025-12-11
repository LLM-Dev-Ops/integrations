//! Webhook verification and handling.
//!
//! Provides HMAC-SHA256 signature verification for incoming webhooks.

use crate::errors::{SlackResult, WebhookError};
use constant_time_eq::constant_time_eq;
use hmac::{Hmac, Mac};
use secrecy::{ExposeSecret, SecretString};
use sha2::Sha256;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{debug, warn};

/// Default timestamp tolerance (5 minutes)
const DEFAULT_TIMESTAMP_TOLERANCE_SECS: u64 = 300;

/// Webhook signature verifier
pub struct SignatureVerifier {
    signing_secret: SecretString,
    timestamp_tolerance: Duration,
}

impl SignatureVerifier {
    /// Create a new verifier with the signing secret
    pub fn new(signing_secret: impl Into<String>) -> Self {
        Self {
            signing_secret: SecretString::new(signing_secret.into()),
            timestamp_tolerance: Duration::from_secs(DEFAULT_TIMESTAMP_TOLERANCE_SECS),
        }
    }

    /// Set custom timestamp tolerance
    pub fn with_timestamp_tolerance(mut self, tolerance: Duration) -> Self {
        self.timestamp_tolerance = tolerance;
        self
    }

    /// Verify a webhook request
    ///
    /// # Arguments
    /// * `timestamp` - The X-Slack-Request-Timestamp header value
    /// * `signature` - The X-Slack-Signature header value
    /// * `body` - The raw request body
    pub fn verify(&self, timestamp: &str, signature: &str, body: &[u8]) -> SlackResult<()> {
        // Parse and validate timestamp
        let ts: i64 = timestamp.parse().map_err(|_| {
            warn!(timestamp, "Invalid timestamp format");
            WebhookError::InvalidPayload {
                message: "Invalid timestamp format".to_string(),
            }
        })?;

        // Check timestamp is not too old
        self.verify_timestamp(ts)?;

        // Compute expected signature
        let expected = self.compute_signature(timestamp, body);

        // Constant-time comparison
        if !constant_time_eq(signature.as_bytes(), expected.as_bytes()) {
            warn!("Signature verification failed");
            return Err(WebhookError::InvalidSignature.into());
        }

        debug!("Webhook signature verified successfully");
        Ok(())
    }

    /// Verify timestamp is within tolerance
    fn verify_timestamp(&self, timestamp: i64) -> SlackResult<()> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let age = (now - timestamp).abs();

        if age > self.timestamp_tolerance.as_secs() as i64 {
            warn!(
                timestamp,
                now,
                age,
                tolerance = self.timestamp_tolerance.as_secs(),
                "Timestamp too old"
            );
            return Err(WebhookError::ExpiredTimestamp { timestamp }.into());
        }

        Ok(())
    }

    /// Compute HMAC-SHA256 signature
    fn compute_signature(&self, timestamp: &str, body: &[u8]) -> String {
        // Create base string: v0:timestamp:body
        let mut base_string = format!("v0:{}:", timestamp).into_bytes();
        base_string.extend_from_slice(body);

        // Compute HMAC
        let mut mac = Hmac::<Sha256>::new_from_slice(self.signing_secret.expose_secret().as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(&base_string);

        let result = mac.finalize();
        let signature_bytes = result.into_bytes();

        // Format as v0=hex
        format!("v0={}", hex::encode(signature_bytes))
    }
}

impl std::fmt::Debug for SignatureVerifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SignatureVerifier")
            .field("signing_secret", &"[REDACTED]")
            .field("timestamp_tolerance", &self.timestamp_tolerance)
            .finish()
    }
}

/// Incoming webhook (for posting messages)
pub struct IncomingWebhook {
    url: String,
}

impl IncomingWebhook {
    /// Create a new incoming webhook
    pub fn new(url: impl Into<String>) -> Self {
        Self { url: url.into() }
    }

    /// Get the webhook URL
    pub fn url(&self) -> &str {
        &self.url
    }

    /// Build a simple message payload
    pub fn simple_message(text: impl Into<String>) -> IncomingWebhookPayload {
        IncomingWebhookPayload {
            text: Some(text.into()),
            blocks: None,
            attachments: None,
            thread_ts: None,
            mrkdwn: None,
            unfurl_links: None,
            unfurl_media: None,
        }
    }
}

/// Payload for incoming webhook messages
#[derive(Debug, Clone, serde::Serialize)]
pub struct IncomingWebhookPayload {
    /// Message text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Block Kit blocks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocks: Option<Vec<serde_json::Value>>,
    /// Legacy attachments
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<serde_json::Value>>,
    /// Thread timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_ts: Option<String>,
    /// Enable mrkdwn
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mrkdwn: Option<bool>,
    /// Unfurl links
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unfurl_links: Option<bool>,
    /// Unfurl media
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unfurl_media: Option<bool>,
}

impl IncomingWebhookPayload {
    /// Create a new payload with text
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: Some(text.into()),
            blocks: None,
            attachments: None,
            thread_ts: None,
            mrkdwn: None,
            unfurl_links: None,
            unfurl_media: None,
        }
    }

    /// Create a payload with blocks
    pub fn with_blocks(blocks: Vec<serde_json::Value>) -> Self {
        Self {
            text: None,
            blocks: Some(blocks),
            attachments: None,
            thread_ts: None,
            mrkdwn: None,
            unfurl_links: None,
            unfurl_media: None,
        }
    }

    /// Set text
    pub fn text(mut self, text: impl Into<String>) -> Self {
        self.text = Some(text.into());
        self
    }

    /// Set blocks
    pub fn blocks(mut self, blocks: Vec<serde_json::Value>) -> Self {
        self.blocks = Some(blocks);
        self
    }

    /// Set thread
    pub fn thread_ts(mut self, ts: impl Into<String>) -> Self {
        self.thread_ts = Some(ts.into());
        self
    }

    /// Set mrkdwn
    pub fn mrkdwn(mut self, enabled: bool) -> Self {
        self.mrkdwn = Some(enabled);
        self
    }
}

/// Interactive component payload (from button clicks, etc.)
#[derive(Debug, Clone, serde::Deserialize)]
pub struct InteractionPayload {
    /// Payload type
    #[serde(rename = "type")]
    pub payload_type: String,
    /// User who triggered
    pub user: InteractionUser,
    /// API app ID
    #[serde(default)]
    pub api_app_id: Option<String>,
    /// Team
    #[serde(default)]
    pub team: Option<InteractionTeam>,
    /// Channel
    #[serde(default)]
    pub channel: Option<InteractionChannel>,
    /// Trigger ID (for opening modals)
    #[serde(default)]
    pub trigger_id: Option<String>,
    /// Response URL
    #[serde(default)]
    pub response_url: Option<String>,
    /// Actions (for block_actions)
    #[serde(default)]
    pub actions: Vec<InteractionAction>,
    /// View (for view_submission)
    #[serde(default)]
    pub view: Option<serde_json::Value>,
    /// Container (message info)
    #[serde(default)]
    pub container: Option<serde_json::Value>,
    /// Message
    #[serde(default)]
    pub message: Option<serde_json::Value>,
    /// State
    #[serde(default)]
    pub state: Option<serde_json::Value>,
}

/// User info in interaction
#[derive(Debug, Clone, serde::Deserialize)]
pub struct InteractionUser {
    /// User ID
    pub id: String,
    /// Username
    #[serde(default)]
    pub username: Option<String>,
    /// Name
    #[serde(default)]
    pub name: Option<String>,
    /// Team ID
    #[serde(default)]
    pub team_id: Option<String>,
}

/// Team info in interaction
#[derive(Debug, Clone, serde::Deserialize)]
pub struct InteractionTeam {
    /// Team ID
    pub id: String,
    /// Domain
    #[serde(default)]
    pub domain: Option<String>,
}

/// Channel info in interaction
#[derive(Debug, Clone, serde::Deserialize)]
pub struct InteractionChannel {
    /// Channel ID
    pub id: String,
    /// Channel name
    #[serde(default)]
    pub name: Option<String>,
}

/// Action in interaction
#[derive(Debug, Clone, serde::Deserialize)]
pub struct InteractionAction {
    /// Action type
    #[serde(rename = "type")]
    pub action_type: String,
    /// Action ID
    pub action_id: String,
    /// Block ID
    #[serde(default)]
    pub block_id: Option<String>,
    /// Action value
    #[serde(default)]
    pub value: Option<String>,
    /// Action timestamp
    #[serde(default)]
    pub action_ts: Option<String>,
    /// Selected option (for select menus)
    #[serde(default)]
    pub selected_option: Option<SelectedOption>,
    /// Selected options (for multi-select)
    #[serde(default)]
    pub selected_options: Vec<SelectedOption>,
    /// Selected user (for user select)
    #[serde(default)]
    pub selected_user: Option<String>,
    /// Selected users (for multi-user select)
    #[serde(default)]
    pub selected_users: Vec<String>,
    /// Selected channel
    #[serde(default)]
    pub selected_channel: Option<String>,
    /// Selected conversation
    #[serde(default)]
    pub selected_conversation: Option<String>,
    /// Selected date
    #[serde(default)]
    pub selected_date: Option<String>,
    /// Selected time
    #[serde(default)]
    pub selected_time: Option<String>,
}

/// Selected option
#[derive(Debug, Clone, serde::Deserialize)]
pub struct SelectedOption {
    /// Text
    #[serde(default)]
    pub text: Option<serde_json::Value>,
    /// Value
    pub value: String,
}

/// Slash command payload
#[derive(Debug, Clone, serde::Deserialize)]
pub struct SlashCommandPayload {
    /// Command name
    pub command: String,
    /// Command text after /command
    pub text: String,
    /// Response URL
    pub response_url: String,
    /// Trigger ID
    pub trigger_id: String,
    /// User ID
    pub user_id: String,
    /// User name
    pub user_name: String,
    /// Team ID
    pub team_id: String,
    /// Team domain
    pub team_domain: String,
    /// Channel ID
    pub channel_id: String,
    /// Channel name
    pub channel_name: String,
    /// Enterprise ID
    #[serde(default)]
    pub enterprise_id: Option<String>,
    /// Enterprise name
    #[serde(default)]
    pub enterprise_name: Option<String>,
    /// API app ID
    #[serde(default)]
    pub api_app_id: Option<String>,
    /// Whether the command is in enterprise
    #[serde(default)]
    pub is_enterprise_install: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signature_computation() {
        let verifier = SignatureVerifier::new("8f742231b10e8888abcd99yyyzzz85a5");
        let timestamp = "1531420618";
        let body = b"token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmber&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c";

        let sig = verifier.compute_signature(timestamp, body);
        assert!(sig.starts_with("v0="));
    }

    #[test]
    fn test_timestamp_verification() {
        let verifier = SignatureVerifier::new("test_secret");

        // Current timestamp should pass
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        assert!(verifier.verify_timestamp(now).is_ok());

        // Old timestamp should fail
        let old = now - 600; // 10 minutes ago
        assert!(verifier.verify_timestamp(old).is_err());
    }

    #[test]
    fn test_incoming_webhook_payload() {
        let payload = IncomingWebhookPayload::new("Hello, World!")
            .mrkdwn(true)
            .thread_ts("1234567890.123456");

        assert_eq!(payload.text.as_deref(), Some("Hello, World!"));
        assert_eq!(payload.mrkdwn, Some(true));
        assert_eq!(payload.thread_ts.as_deref(), Some("1234567890.123456"));
    }
}
