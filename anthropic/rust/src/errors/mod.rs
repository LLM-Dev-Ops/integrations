//! Error types for the Anthropic API client.
//!
//! This module provides a comprehensive error taxonomy following the specification.

mod error;
mod categories;

pub use error::{AnthropicError, AnthropicResult};
pub use categories::{ValidationDetail, ErrorCategory};
