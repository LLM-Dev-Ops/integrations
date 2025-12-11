//! Slack API Client
//!
//! Production-ready Slack API client with:
//! - Full Web API coverage (Conversations, Messages, Users, Files, etc.)
//! - Socket Mode for real-time events
//! - Events API webhook handling
//! - Resilience patterns (retry, circuit breaker, rate limiting)
//! - Comprehensive observability (tracing, metrics, logging)
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use slack_client::{SlackClient, SlackConfig};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create client from environment
//!     let client = slack_client::create_client_from_env()?;
//!
//!     // Post a message
//!     let response = client.messages().post(
//!         slack_client::services::messages::PostMessageRequest::new("#general", "Hello, Slack!")
//!     ).await?;
//!
//!     println!("Message posted: {}", response.ts);
//!     Ok(())
//! }
//! ```
//!
//! # Features
//!
//! - `socket-mode` - Enable Socket Mode WebSocket support
//! - `full` - Enable all features

#![warn(missing_docs)]
#![warn(rustdoc::missing_crate_level_docs)]

// Core modules
pub mod auth;
pub mod client;
pub mod config;
pub mod errors;
pub mod transport;
pub mod types;

// Services
pub mod services;

// Real-time features
pub mod events;
pub mod socket_mode;
pub mod webhooks;

// Resilience
pub mod resilience;

// Observability
pub mod observability;

// Testing utilities
pub mod fixtures;
pub mod mocks;

// Tests
#[cfg(test)]
mod tests;

// Re-exports for convenience
pub use client::{SlackClient, SlackClientImpl};
pub use config::{SlackConfig, SlackConfigBuilder};
pub use errors::{SlackError, SlackResult};

/// Default base URL for Slack API
pub const DEFAULT_BASE_URL: &str = "https://slack.com/api";

/// Default timeout in seconds
pub const DEFAULT_TIMEOUT_SECS: u64 = 30;

/// Default maximum retries
pub const DEFAULT_MAX_RETRIES: u32 = 3;

/// Create a Slack client with the given configuration
pub fn create_client(config: SlackConfig) -> SlackResult<SlackClientImpl> {
    SlackClientImpl::new(config)
}

/// Create a Slack client from environment variables
///
/// Reads:
/// - `SLACK_BOT_TOKEN` - Bot token (xoxb-*)
/// - `SLACK_USER_TOKEN` - User token (xoxp-*)
/// - `SLACK_APP_TOKEN` - App-level token (xapp-*) for Socket Mode
/// - `SLACK_SIGNING_SECRET` - Signing secret for webhook verification
/// - `SLACK_CLIENT_ID` - OAuth client ID
/// - `SLACK_CLIENT_SECRET` - OAuth client secret
pub fn create_client_from_env() -> SlackResult<SlackClientImpl> {
    let config = SlackConfig::from_env()?;
    create_client(config)
}
