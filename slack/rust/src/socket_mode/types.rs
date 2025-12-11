//! Socket Mode types.

use crate::events::InnerEvent;
use serde::{Deserialize, Serialize};

/// Socket Mode envelope wrapping events
#[derive(Debug, Clone, Deserialize)]
pub struct SocketModeEnvelope {
    /// Envelope ID (for acknowledgment)
    pub envelope_id: String,
    /// Payload type
    #[serde(rename = "type")]
    pub envelope_type: EnvelopeType,
    /// Whether retry
    #[serde(default)]
    pub retry_attempt: Option<i32>,
    /// Retry reason
    #[serde(default)]
    pub retry_reason: Option<String>,
    /// Accepts response payload
    #[serde(default)]
    pub accepts_response_payload: bool,
    /// The actual payload
    pub payload: SocketModePayload,
}

/// Envelope type
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EnvelopeType {
    /// Events API event
    EventsApi,
    /// Interactive message
    Interactive,
    /// Slash command
    SlashCommands,
    /// Unknown type
    #[serde(other)]
    Unknown,
}

/// Socket Mode payload variants
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum SocketModePayload {
    /// Events API payload
    EventsApi(EventsApiPayload),
    /// Interactive payload
    Interactive(InteractivePayload),
    /// Slash command payload
    SlashCommand(SlashCommandPayload),
    /// Unknown payload
    Unknown(serde_json::Value),
}

/// Events API payload in Socket Mode
#[derive(Debug, Clone, Deserialize)]
pub struct EventsApiPayload {
    /// Token (deprecated)
    #[serde(default)]
    pub token: Option<String>,
    /// Team ID
    pub team_id: String,
    /// API app ID
    pub api_app_id: String,
    /// The event
    pub event: InnerEvent,
    /// Event type
    #[serde(rename = "type")]
    pub payload_type: String,
    /// Event ID
    #[serde(default)]
    pub event_id: Option<String>,
    /// Event time
    #[serde(default)]
    pub event_time: Option<i64>,
    /// Authorizations
    #[serde(default)]
    pub authorizations: Vec<SocketModeAuthorization>,
    /// Is external shared channel
    #[serde(default)]
    pub is_ext_shared_channel: bool,
    /// Event context
    #[serde(default)]
    pub event_context: Option<String>,
}

/// Authorization in Socket Mode
#[derive(Debug, Clone, Deserialize)]
pub struct SocketModeAuthorization {
    /// Enterprise ID
    #[serde(default)]
    pub enterprise_id: Option<String>,
    /// Team ID
    pub team_id: String,
    /// User ID
    pub user_id: String,
    /// Is bot
    #[serde(default)]
    pub is_bot: bool,
    /// Is enterprise install
    #[serde(default)]
    pub is_enterprise_install: bool,
}

/// Interactive payload in Socket Mode
#[derive(Debug, Clone, Deserialize)]
pub struct InteractivePayload {
    /// Payload type
    #[serde(rename = "type")]
    pub payload_type: String,
    /// User
    pub user: InteractiveUser,
    /// API app ID
    #[serde(default)]
    pub api_app_id: Option<String>,
    /// Team
    #[serde(default)]
    pub team: Option<InteractiveTeam>,
    /// Channel
    #[serde(default)]
    pub channel: Option<InteractiveChannel>,
    /// Trigger ID
    #[serde(default)]
    pub trigger_id: Option<String>,
    /// Actions
    #[serde(default)]
    pub actions: Vec<serde_json::Value>,
    /// View (for modals)
    #[serde(default)]
    pub view: Option<serde_json::Value>,
    /// Container
    #[serde(default)]
    pub container: Option<serde_json::Value>,
    /// Response URL
    #[serde(default)]
    pub response_url: Option<String>,
    /// Message
    #[serde(default)]
    pub message: Option<serde_json::Value>,
}

/// User in interactive payload
#[derive(Debug, Clone, Deserialize)]
pub struct InteractiveUser {
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

/// Team in interactive payload
#[derive(Debug, Clone, Deserialize)]
pub struct InteractiveTeam {
    /// Team ID
    pub id: String,
    /// Domain
    #[serde(default)]
    pub domain: Option<String>,
}

/// Channel in interactive payload
#[derive(Debug, Clone, Deserialize)]
pub struct InteractiveChannel {
    /// Channel ID
    pub id: String,
    /// Name
    #[serde(default)]
    pub name: Option<String>,
}

/// Slash command payload in Socket Mode
#[derive(Debug, Clone, Deserialize)]
pub struct SlashCommandPayload {
    /// Command
    pub command: String,
    /// Text after command
    pub text: String,
    /// Response URL
    pub response_url: String,
    /// Trigger ID
    pub trigger_id: String,
    /// User ID
    pub user_id: String,
    /// Username
    pub user_name: String,
    /// Team ID
    pub team_id: String,
    /// Team domain
    pub team_domain: String,
    /// Channel ID
    pub channel_id: String,
    /// Channel name
    pub channel_name: String,
    /// API app ID
    #[serde(default)]
    pub api_app_id: Option<String>,
}

/// Acknowledgment message to send back
#[derive(Debug, Clone, Serialize)]
pub struct SocketModeAck {
    /// Envelope ID being acknowledged
    pub envelope_id: String,
    /// Optional payload for response
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
}

impl SocketModeAck {
    /// Create a simple acknowledgment
    pub fn simple(envelope_id: impl Into<String>) -> Self {
        Self {
            envelope_id: envelope_id.into(),
            payload: None,
        }
    }

    /// Create acknowledgment with response payload
    pub fn with_payload(envelope_id: impl Into<String>, payload: serde_json::Value) -> Self {
        Self {
            envelope_id: envelope_id.into(),
            payload: Some(payload),
        }
    }
}

/// Hello message from Slack
#[derive(Debug, Clone, Deserialize)]
pub struct HelloMessage {
    /// Message type
    #[serde(rename = "type")]
    pub message_type: String,
    /// Number of active connections
    #[serde(default)]
    pub num_connections: Option<i32>,
    /// Debug info
    #[serde(default)]
    pub debug_info: Option<HelloDebugInfo>,
    /// Connection info
    #[serde(default)]
    pub connection_info: Option<ConnectionInfo>,
}

/// Debug info in hello message
#[derive(Debug, Clone, Deserialize)]
pub struct HelloDebugInfo {
    /// Host
    #[serde(default)]
    pub host: Option<String>,
    /// Build number
    #[serde(default)]
    pub build_number: Option<i32>,
    /// Approximate connection time
    #[serde(default)]
    pub approximate_connection_time: Option<i64>,
}

/// Connection info
#[derive(Debug, Clone, Deserialize)]
pub struct ConnectionInfo {
    /// App ID
    #[serde(default)]
    pub app_id: Option<String>,
}

/// Disconnect message from Slack
#[derive(Debug, Clone, Deserialize)]
pub struct DisconnectMessage {
    /// Message type
    #[serde(rename = "type")]
    pub message_type: String,
    /// Reason for disconnect
    #[serde(default)]
    pub reason: Option<String>,
    /// Debug info
    #[serde(default)]
    pub debug_info: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_hello() {
        let json = r#"{
            "type": "hello",
            "num_connections": 1,
            "debug_info": {
                "host": "applink-123",
                "build_number": 42
            }
        }"#;

        let hello: HelloMessage = serde_json::from_str(json).unwrap();
        assert_eq!(hello.message_type, "hello");
        assert_eq!(hello.num_connections, Some(1));
    }

    #[test]
    fn test_socket_mode_ack() {
        let ack = SocketModeAck::simple("abc123");
        let json = serde_json::to_string(&ack).unwrap();
        assert!(json.contains("abc123"));
        assert!(!json.contains("payload"));
    }
}
