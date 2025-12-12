//! Socket Mode event handler trait.
//!
//! Defines the interface for handling Socket Mode events.

use crate::errors::SlackError;
use super::types::*;
use async_trait::async_trait;
use std::sync::Arc;

/// Handler for Socket Mode events
#[async_trait]
pub trait SocketModeHandler: Send + Sync {
    /// Handle an incoming envelope
    async fn handle_envelope(&self, envelope: SocketModeEnvelope) -> Option<serde_json::Value>;

    /// Called when Events API payload is received
    async fn on_events_api(&self, payload: EventsApiPayload) -> Option<serde_json::Value> {
        let _ = payload;
        None
    }

    /// Called when Interactive payload is received
    async fn on_interactive(&self, payload: InteractivePayload) -> Option<serde_json::Value> {
        let _ = payload;
        None
    }

    /// Called when Slash Command payload is received
    async fn on_slash_command(&self, payload: SlashCommandPayload) -> Option<serde_json::Value> {
        let _ = payload;
        None
    }

    /// Called when connection is established
    async fn on_connect(&self) {}

    /// Called when connection is closed
    async fn on_disconnect(&self, reason: Option<&str>) {
        let _ = reason;
    }

    /// Called when an error occurs
    async fn on_error(&self, error: SlackError) {
        let _ = error;
    }
}

/// Default handler that routes to specific methods
pub struct DefaultSocketModeHandler<F, I, S>
where
    F: Fn(EventsApiPayload) -> Option<serde_json::Value> + Send + Sync,
    I: Fn(InteractivePayload) -> Option<serde_json::Value> + Send + Sync,
    S: Fn(SlashCommandPayload) -> Option<serde_json::Value> + Send + Sync,
{
    events_handler: Option<F>,
    interactive_handler: Option<I>,
    slash_command_handler: Option<S>,
}

impl<F, I, S> DefaultSocketModeHandler<F, I, S>
where
    F: Fn(EventsApiPayload) -> Option<serde_json::Value> + Send + Sync,
    I: Fn(InteractivePayload) -> Option<serde_json::Value> + Send + Sync,
    S: Fn(SlashCommandPayload) -> Option<serde_json::Value> + Send + Sync,
{
    /// Create a new default handler
    pub fn new() -> Self {
        Self {
            events_handler: None,
            interactive_handler: None,
            slash_command_handler: None,
        }
    }

    /// Set Events API handler
    pub fn with_events_handler(mut self, handler: F) -> Self {
        self.events_handler = Some(handler);
        self
    }

    /// Set Interactive handler
    pub fn with_interactive_handler(mut self, handler: I) -> Self {
        self.interactive_handler = Some(handler);
        self
    }

    /// Set Slash Command handler
    pub fn with_slash_command_handler(mut self, handler: S) -> Self {
        self.slash_command_handler = Some(handler);
        self
    }
}

#[async_trait]
impl<F, I, S> SocketModeHandler for DefaultSocketModeHandler<F, I, S>
where
    F: Fn(EventsApiPayload) -> Option<serde_json::Value> + Send + Sync,
    I: Fn(InteractivePayload) -> Option<serde_json::Value> + Send + Sync,
    S: Fn(SlashCommandPayload) -> Option<serde_json::Value> + Send + Sync,
{
    async fn handle_envelope(&self, envelope: SocketModeEnvelope) -> Option<serde_json::Value> {
        match envelope.payload {
            SocketModePayload::EventsApi(payload) => {
                if let Some(ref handler) = self.events_handler {
                    handler(payload)
                } else {
                    self.on_events_api(payload).await
                }
            }
            SocketModePayload::Interactive(payload) => {
                if let Some(ref handler) = self.interactive_handler {
                    handler(payload)
                } else {
                    self.on_interactive(payload).await
                }
            }
            SocketModePayload::SlashCommand(payload) => {
                if let Some(ref handler) = self.slash_command_handler {
                    handler(payload)
                } else {
                    self.on_slash_command(payload).await
                }
            }
            SocketModePayload::Unknown(_) => None,
        }
    }
}

/// Simple handler using closures
pub struct FnHandler {
    events_fn: Option<Box<dyn Fn(EventsApiPayload) -> Option<serde_json::Value> + Send + Sync>>,
    interactive_fn: Option<Box<dyn Fn(InteractivePayload) -> Option<serde_json::Value> + Send + Sync>>,
    slash_fn: Option<Box<dyn Fn(SlashCommandPayload) -> Option<serde_json::Value> + Send + Sync>>,
    connect_fn: Option<Box<dyn Fn() + Send + Sync>>,
    disconnect_fn: Option<Box<dyn Fn(Option<&str>) + Send + Sync>>,
    error_fn: Option<Box<dyn Fn(SlackError) + Send + Sync>>,
}

impl FnHandler {
    /// Create new function handler
    pub fn new() -> Self {
        Self {
            events_fn: None,
            interactive_fn: None,
            slash_fn: None,
            connect_fn: None,
            disconnect_fn: None,
            error_fn: None,
        }
    }

    /// Set events handler
    pub fn on_events<F>(mut self, f: F) -> Self
    where
        F: Fn(EventsApiPayload) -> Option<serde_json::Value> + Send + Sync + 'static,
    {
        self.events_fn = Some(Box::new(f));
        self
    }

    /// Set interactive handler
    pub fn on_interactive<F>(mut self, f: F) -> Self
    where
        F: Fn(InteractivePayload) -> Option<serde_json::Value> + Send + Sync + 'static,
    {
        self.interactive_fn = Some(Box::new(f));
        self
    }

    /// Set slash command handler
    pub fn on_slash_command<F>(mut self, f: F) -> Self
    where
        F: Fn(SlashCommandPayload) -> Option<serde_json::Value> + Send + Sync + 'static,
    {
        self.slash_fn = Some(Box::new(f));
        self
    }

    /// Set connect handler
    pub fn on_connect<F>(mut self, f: F) -> Self
    where
        F: Fn() + Send + Sync + 'static,
    {
        self.connect_fn = Some(Box::new(f));
        self
    }

    /// Set disconnect handler
    pub fn on_disconnect<F>(mut self, f: F) -> Self
    where
        F: Fn(Option<&str>) + Send + Sync + 'static,
    {
        self.disconnect_fn = Some(Box::new(f));
        self
    }

    /// Set error handler
    pub fn on_error<F>(mut self, f: F) -> Self
    where
        F: Fn(SlackError) + Send + Sync + 'static,
    {
        self.error_fn = Some(Box::new(f));
        self
    }
}

impl Default for FnHandler {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SocketModeHandler for FnHandler {
    async fn handle_envelope(&self, envelope: SocketModeEnvelope) -> Option<serde_json::Value> {
        match envelope.payload {
            SocketModePayload::EventsApi(payload) => {
                self.events_fn.as_ref().and_then(|f| f(payload))
            }
            SocketModePayload::Interactive(payload) => {
                self.interactive_fn.as_ref().and_then(|f| f(payload))
            }
            SocketModePayload::SlashCommand(payload) => {
                self.slash_fn.as_ref().and_then(|f| f(payload))
            }
            SocketModePayload::Unknown(_) => None,
        }
    }

    async fn on_connect(&self) {
        if let Some(ref f) = self.connect_fn {
            f();
        }
    }

    async fn on_disconnect(&self, reason: Option<&str>) {
        if let Some(ref f) = self.disconnect_fn {
            f(reason);
        }
    }

    async fn on_error(&self, error: SlackError) {
        if let Some(ref f) = self.error_fn {
            f(error);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fn_handler() {
        let handler = FnHandler::new()
            .on_connect(|| {
                println!("Connected!");
            })
            .on_disconnect(|reason| {
                println!("Disconnected: {:?}", reason);
            });

        handler.on_connect().await;
        handler.on_disconnect(Some("test")).await;
    }
}
