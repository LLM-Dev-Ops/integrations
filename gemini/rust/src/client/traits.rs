//! Client trait definitions for Gemini API.

use async_trait::async_trait;
use std::sync::Arc;

use crate::config::GeminiConfig;
use crate::error::GeminiError;
use crate::services::{
    CachedContentService, ContentService, EmbeddingsService, FilesService, ModelsService,
};

/// Main client for interacting with Google Gemini API.
#[async_trait]
pub trait GeminiClient: Send + Sync {
    /// Access the content generation service.
    fn content(&self) -> &dyn ContentService;

    /// Access the embeddings service.
    fn embeddings(&self) -> &dyn EmbeddingsService;

    /// Access the models service.
    fn models(&self) -> &dyn ModelsService;

    /// Access the files service.
    fn files(&self) -> &dyn FilesService;

    /// Access the cached content service.
    fn cached_content(&self) -> &dyn CachedContentService;
}

/// Factory for creating Gemini clients.
pub trait GeminiClientFactory: Send + Sync {
    /// Create a new client with the given configuration.
    fn create(&self, config: GeminiConfig) -> Result<Arc<dyn GeminiClient>, GeminiError>;
}
