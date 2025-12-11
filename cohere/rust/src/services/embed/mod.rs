//! Embed service for text embeddings.
//!
//! This module provides the Embed API implementation for:
//! - Text embedding generation
//! - Multiple embedding types (float, int8, uint8, binary)
//! - Batch embedding
//! - Async embed jobs

mod service;
mod types;

pub use service::{EmbedService, EmbedServiceImpl};
pub use types::{
    EmbedJob, EmbedJobRequest, EmbedJobStatus, EmbedRequest, EmbedRequestBuilder, EmbedResponse,
    Embedding, EmbeddingsByType,
};
