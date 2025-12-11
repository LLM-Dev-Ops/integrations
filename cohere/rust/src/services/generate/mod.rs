//! Generate service for text generation.
//!
//! This module provides the Generate API implementation for:
//! - Text generation/completion
//! - Streaming responses
//! - Batch generation

mod service;
mod stream;
mod types;

pub use service::{GenerateService, GenerateServiceImpl};
pub use stream::{GenerateStream, GenerateStreamEvent};
pub use types::{
    GenerateRequest, GenerateRequestBuilder, GenerateResponse, Generation, Generations,
    ReturnLikelihoods, TokenLikelihood, Truncate,
};
