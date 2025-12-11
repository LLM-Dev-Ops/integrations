//! Conversations service for Slack API.
//!
//! Provides methods for managing channels, DMs, and group messages.

mod requests;
mod responses;
mod service;

pub use requests::*;
pub use responses::*;
pub use service::*;
