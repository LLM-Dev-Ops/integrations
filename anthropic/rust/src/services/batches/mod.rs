//! Batches API service
//!
//! This module provides the Batches API implementation for creating, managing,
//! and retrieving batch message processing results.

mod types;
mod service;

#[cfg(test)]
mod tests;

pub use types::*;
pub use service::*;
