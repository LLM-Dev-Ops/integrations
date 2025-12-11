//! Messages service for Slack API.
//!
//! Provides methods for posting, updating, and deleting messages.

mod requests;
mod responses;
mod service;

pub use requests::*;
pub use responses::*;
pub use service::*;
