//! Usergroups service for Slack API.
//!
//! Provides methods for managing user groups (team groups).

mod requests;
mod responses;
mod service;

pub use requests::*;
pub use responses::*;
pub use service::*;
