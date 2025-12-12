//! Bookmarks service for Slack API.
//!
//! Provides methods for managing channel bookmarks.

mod requests;
mod responses;
mod service;

pub use requests::*;
pub use responses::*;
pub use service::*;
