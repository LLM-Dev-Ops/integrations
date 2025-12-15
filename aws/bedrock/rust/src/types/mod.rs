//! Core types for the AWS Bedrock integration.
//!
//! This module defines unified request/response types and model-specific formats
//! following the SPARC specification.

mod common;
mod requests;
mod responses;

pub use common::*;
pub use requests::*;
pub use responses::*;
