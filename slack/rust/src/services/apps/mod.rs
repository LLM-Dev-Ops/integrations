//! Apps service for Slack API.
//!
//! Provides methods for app management, Socket Mode connections, and event authorizations.

mod requests;
mod responses;
mod service;

pub use requests::*;
pub use responses::*;
pub use service::*;
