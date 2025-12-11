//! Types for AWS SES v2 operations.
//!
//! This module provides comprehensive type definitions for Amazon Simple Email Service (SES) v2,
//! including email types, identity management, configuration sets, suppression lists, and contact management.

mod configuration;
mod contacts;
mod email;
mod identity;
mod requests;
mod responses;
mod suppression;

pub use configuration::*;
pub use contacts::*;
pub use email::*;
pub use identity::*;
pub use requests::*;
pub use responses::*;
pub use suppression::*;
