//! Stars service for Slack API.
//!
//! Provides methods for managing starred items (messages, files, channels).

mod requests;
mod responses;
mod service;

pub use requests::*;
pub use responses::*;
pub use service::*;
