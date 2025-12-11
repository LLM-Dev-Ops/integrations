//! Users service for Slack API.
//!
//! Provides methods for managing users and their profiles.

mod requests;
mod responses;
mod service;

pub use requests::*;
pub use responses::*;
pub use service::*;
