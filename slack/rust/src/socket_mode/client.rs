//! Socket Mode client implementation.
//!
//! Provides WebSocket-based real-time communication with Slack.

use crate::config::SlackConfig;
use crate::errors::{SlackError, SlackResult, SocketModeError};
use super::types::*;
use super::handler::SocketModeHandler;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, error, info, warn};

/// Socket Mode connection state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SocketState {
    /// Not connected
    Disconnected,
    /// Connecting to Slack
    Connecting,
    /// Connected and ready
    Connected,
    /// Reconnecting after disconnect
    Reconnecting,
}

/// Socket Mode configuration
#[derive(Debug, Clone)]
pub struct SocketModeConfig {
    /// App-level token (starts with xapp-)
    pub app_token: String,
    /// Auto-reconnect on disconnect
    pub auto_reconnect: bool,
    /// Delay between reconnect attempts
    pub reconnect_delay: Duration,
    /// Maximum reconnect attempts
    pub max_reconnect_attempts: u32,
    /// Ping interval
    pub ping_interval: Duration,
}

impl Default for SocketModeConfig {
    fn default() -> Self {
        Self {
            app_token: String::new(),
            auto_reconnect: true,
            reconnect_delay: Duration::from_secs(5),
            max_reconnect_attempts: 10,
            ping_interval: Duration::from_secs(30),
        }
    }
}

impl SocketModeConfig {
    /// Create new config with app token
    pub fn new(app_token: impl Into<String>) -> Self {
        Self {
            app_token: app_token.into(),
            ..Default::default()
        }
    }

    /// Set auto-reconnect
    pub fn with_auto_reconnect(mut self, auto_reconnect: bool) -> Self {
        self.auto_reconnect = auto_reconnect;
        self
    }

    /// Set reconnect delay
    pub fn with_reconnect_delay(mut self, delay: Duration) -> Self {
        self.reconnect_delay = delay;
        self
    }

    /// Set max reconnect attempts
    pub fn with_max_reconnect_attempts(mut self, attempts: u32) -> Self {
        self.max_reconnect_attempts = attempts;
        self
    }
}

/// Socket Mode client for real-time events
pub struct SocketModeClient {
    config: SocketModeConfig,
    state: Arc<RwLock<SocketState>>,
    handler: Arc<dyn SocketModeHandler>,
    reconnect_attempts: Arc<RwLock<u32>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl SocketModeClient {
    /// Create new Socket Mode client
    pub fn new(config: SocketModeConfig, handler: Arc<dyn SocketModeHandler>) -> Self {
        Self {
            config,
            state: Arc::new(RwLock::new(SocketState::Disconnected)),
            handler,
            reconnect_attempts: Arc::new(RwLock::new(0)),
            shutdown_tx: None,
        }
    }

    /// Get current connection state
    pub async fn state(&self) -> SocketState {
        *self.state.read().await
    }

    /// Connect to Socket Mode
    pub async fn connect(&mut self) -> SlackResult<()> {
        let current_state = *self.state.read().await;
        if current_state == SocketState::Connected || current_state == SocketState::Connecting {
            return Ok(());
        }

        *self.state.write().await = SocketState::Connecting;

        // Get WebSocket URL
        let ws_url = self.get_websocket_url().await?;

        // Establish connection
        self.establish_connection(&ws_url).await
    }

    /// Disconnect from Socket Mode
    pub async fn disconnect(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }
        *self.state.write().await = SocketState::Disconnected;
        self.handler.on_disconnect(None).await;
    }

    /// Get WebSocket URL from Slack
    async fn get_websocket_url(&self) -> SlackResult<String> {
        let client = reqwest::Client::new();
        let response = client
            .post("https://slack.com/api/apps.connections.open")
            .header("Authorization", format!("Bearer {}", self.config.app_token))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .send()
            .await
            .map_err(|e| SlackError::SocketMode(SocketModeError::ConnectionFailed {
                message: e.to_string(),
            }))?;

        let data: serde_json::Value = response.json().await.map_err(|e| {
            SlackError::SocketMode(SocketModeError::ConnectionFailed {
                message: e.to_string(),
            })
        })?;

        if !data["ok"].as_bool().unwrap_or(false) {
            let error = data["error"].as_str().unwrap_or("Unknown error");
            return Err(SlackError::SocketMode(SocketModeError::ConnectionFailed {
                message: error.to_string(),
            }));
        }

        data["url"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| {
                SlackError::SocketMode(SocketModeError::ConnectionFailed {
                    message: "No URL in response".to_string(),
                })
            })
    }

    /// Establish WebSocket connection
    async fn establish_connection(&mut self, url: &str) -> SlackResult<()> {
        let (ws_stream, _) = connect_async(url).await.map_err(|e| {
            SlackError::SocketMode(SocketModeError::ConnectionFailed {
                message: e.to_string(),
            })
        })?;

        let (mut write, mut read) = ws_stream.split();

        // Create shutdown channel
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        self.shutdown_tx = Some(shutdown_tx);

        // Clone state and handler for the read loop
        let state = self.state.clone();
        let handler = self.handler.clone();
        let reconnect_attempts = self.reconnect_attempts.clone();
        let config = self.config.clone();

        // Mark as connected
        *self.state.write().await = SocketState::Connected;
        *self.reconnect_attempts.write().await = 0;
        self.handler.on_connect().await;

        // Spawn message handling loop
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        info!("Socket Mode shutdown requested");
                        break;
                    }
                    msg = read.next() => {
                        match msg {
                            Some(Ok(Message::Text(text))) => {
                                Self::handle_message(&handler, &mut write, &text).await;
                            }
                            Some(Ok(Message::Close(frame))) => {
                                let reason = frame.map(|f| f.reason.to_string());
                                warn!("WebSocket closed: {:?}", reason);
                                *state.write().await = SocketState::Disconnected;
                                handler.on_disconnect(reason.as_deref()).await;

                                // Auto-reconnect logic
                                if config.auto_reconnect {
                                    Self::schedule_reconnect(
                                        state.clone(),
                                        handler.clone(),
                                        reconnect_attempts.clone(),
                                        &config,
                                    ).await;
                                }
                                break;
                            }
                            Some(Ok(_)) => {
                                // Ignore other message types (ping/pong handled by tungstenite)
                            }
                            Some(Err(e)) => {
                                error!("WebSocket error: {}", e);
                                handler.on_error(SlackError::SocketMode(SocketModeError::WebSocket {
                                    message: e.to_string(),
                                })).await;
                                break;
                            }
                            None => {
                                warn!("WebSocket stream ended");
                                break;
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    /// Handle incoming message
    async fn handle_message<W>(handler: &Arc<dyn SocketModeHandler>, write: &mut W, text: &str)
    where
        W: SinkExt<Message> + Unpin,
        W::Error: std::fmt::Debug,
    {
        // Check if it's a hello message
        if let Ok(hello) = serde_json::from_str::<HelloMessage>(text) {
            if hello.message_type == "hello" {
                debug!("Received hello message: {:?}", hello);
                return;
            }
        }

        // Check if it's a disconnect message
        if let Ok(disconnect) = serde_json::from_str::<DisconnectMessage>(text) {
            if disconnect.message_type == "disconnect" {
                debug!("Received disconnect message: {:?}", disconnect);
                return;
            }
        }

        // Try to parse as envelope
        match serde_json::from_str::<SocketModeEnvelope>(text) {
            Ok(envelope) => {
                let envelope_id = envelope.envelope_id.clone();
                let accepts_response = envelope.accepts_response_payload;

                // Handle the envelope
                let response = handler.handle_envelope(envelope).await;

                // Send acknowledgment
                let ack = if accepts_response && response.is_some() {
                    SocketModeAck::with_payload(envelope_id, response.unwrap())
                } else {
                    SocketModeAck::simple(envelope_id)
                };

                let ack_json = serde_json::to_string(&ack).unwrap();
                if let Err(e) = write.send(Message::Text(ack_json)).await {
                    error!("Failed to send acknowledgment: {:?}", e);
                }
            }
            Err(e) => {
                debug!("Failed to parse message: {} - {}", e, text);
            }
        }
    }

    /// Schedule reconnection
    async fn schedule_reconnect(
        state: Arc<RwLock<SocketState>>,
        handler: Arc<dyn SocketModeHandler>,
        reconnect_attempts: Arc<RwLock<u32>>,
        config: &SocketModeConfig,
    ) {
        let attempts = {
            let mut attempts = reconnect_attempts.write().await;
            *attempts += 1;
            *attempts
        };

        if attempts > config.max_reconnect_attempts {
            handler
                .on_error(SlackError::SocketMode(SocketModeError::ReconnectFailed { attempts }))
                .await;
            return;
        }

        *state.write().await = SocketState::Reconnecting;

        // Exponential backoff
        let delay = config.reconnect_delay * 2u32.pow(attempts.saturating_sub(1));
        tokio::time::sleep(delay).await;

        info!("Reconnect attempt {} of {}", attempts, config.max_reconnect_attempts);

        // Note: The actual reconnection would need to be triggered externally
        // since we don't have access to the full client here
    }
}

impl std::fmt::Debug for SocketModeClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SocketModeClient")
            .field("config", &self.config)
            .finish()
    }
}
