//! Search service for Slack API.
//!
//! Provides methods for searching messages and files.

mod requests;
mod responses;
mod service;

pub use requests::*;
pub use responses::*;
pub use service::*;
