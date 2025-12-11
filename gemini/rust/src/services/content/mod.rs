//! Content generation service for Gemini API.

mod service;
mod validation;

use async_trait::async_trait;
use crate::error::GeminiError;
use crate::types::{
    GenerateContentRequest, GenerateContentResponse,
    CountTokensRequest, CountTokensResponse,
};
use std::pin::Pin;
use futures::Stream;

pub use service::ContentServiceImpl;

/// Type alias for the content stream.
pub type ContentStream = Pin<Box<dyn Stream<Item = Result<GenerateContentResponse, GeminiError>> + Send>>;

/// Service for content generation with Gemini models.
#[async_trait]
pub trait ContentService: Send + Sync {
    /// Generate content (non-streaming).
    async fn generate(
        &self,
        model: &str,
        request: GenerateContentRequest,
    ) -> Result<GenerateContentResponse, GeminiError>;

    /// Generate content with streaming response.
    async fn generate_stream(
        &self,
        model: &str,
        request: GenerateContentRequest,
    ) -> Result<ContentStream, GeminiError>;

    /// Count tokens for content.
    async fn count_tokens(
        &self,
        model: &str,
        request: CountTokensRequest,
    ) -> Result<CountTokensResponse, GeminiError>;
}
