//! Cached content service for Gemini API.

mod service;
mod validation;

use async_trait::async_trait;
use crate::error::GeminiError;
use crate::types::{
    CachedContent, CreateCachedContentRequest, UpdateCachedContentRequest,
    ListCachedContentsParams, ListCachedContentsResponse,
};

pub use service::CachedContentServiceImpl;
pub use validation::{validate_create_request, validate_update_request, validate_cached_content_name};

/// Service for cached content management.
#[async_trait]
pub trait CachedContentService: Send + Sync {
    /// Create cached content.
    async fn create(
        &self,
        request: CreateCachedContentRequest,
    ) -> Result<CachedContent, GeminiError>;

    /// List cached contents.
    async fn list(
        &self,
        params: Option<ListCachedContentsParams>,
    ) -> Result<ListCachedContentsResponse, GeminiError>;

    /// Get cached content by name.
    async fn get(&self, name: &str) -> Result<CachedContent, GeminiError>;

    /// Update cached content TTL.
    async fn update(
        &self,
        name: &str,
        request: UpdateCachedContentRequest,
    ) -> Result<CachedContent, GeminiError>;

    /// Delete cached content.
    async fn delete(&self, name: &str) -> Result<(), GeminiError>;
}
