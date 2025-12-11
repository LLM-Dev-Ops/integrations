//! Error types for the Cohere API client.
//!
//! This module provides a comprehensive error taxonomy following the specification.

mod error;
mod categories;

pub use error::{CohereError, CohereResult};
pub use categories::{ValidationDetail, ErrorCategory};
