//! Embeddings service for Gemini API.

mod service;
mod validation;

use async_trait::async_trait;
use crate::error::GeminiError;
use crate::types::{
    EmbedContentRequest, EmbedContentResponse, BatchEmbedContentsResponse,
};

pub use service::EmbeddingsServiceImpl;
pub use validation::{validate_embed_request, validate_batch_size};

/// Service for generating embeddings.
#[async_trait]
pub trait EmbeddingsService: Send + Sync {
    /// Generate embedding for single content.
    async fn embed(
        &self,
        model: &str,
        request: EmbedContentRequest,
    ) -> Result<EmbedContentResponse, GeminiError>;

    /// Generate embeddings for multiple contents (batch).
    async fn batch_embed(
        &self,
        model: &str,
        requests: Vec<EmbedContentRequest>,
    ) -> Result<BatchEmbedContentsResponse, GeminiError>;
}
