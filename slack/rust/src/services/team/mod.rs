//! Team service for Slack API.
//!
//! Provides methods for accessing team/workspace information and logs.

mod requests;
mod responses;
mod service;

pub use requests::*;
pub use responses::*;
pub use service::*;
