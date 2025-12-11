//! Socket Mode client for real-time events.
//!
//! Provides WebSocket-based communication with Slack for receiving events.

#[cfg(feature = "socket-mode")]
mod client;
#[cfg(feature = "socket-mode")]
mod handler;
mod types;

#[cfg(feature = "socket-mode")]
pub use client::*;
#[cfg(feature = "socket-mode")]
pub use handler::*;
pub use types::*;
