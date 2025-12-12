//! Socket Mode client for real-time events.
//!
//! Provides WebSocket-based communication with Slack for receiving events.
//!
//! # Example
//!
//! ```rust,ignore
//! use slack::socket_mode::{SocketModeClient, SocketModeConfig, FnHandler};
//!
//! let config = SocketModeConfig::new("xapp-your-token");
//! let handler = FnHandler::new()
//!     .on_events(|event| {
//!         println!("Event: {:?}", event);
//!         None
//!     })
//!     .on_connect(|| {
//!         println!("Connected!");
//!     });
//!
//! let mut client = SocketModeClient::new(config, Arc::new(handler));
//! client.connect().await?;
//! ```

mod client;
mod handler;
mod types;

pub use client::*;
pub use handler::*;
pub use types::*;
