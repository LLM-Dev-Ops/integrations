//! Models service for Gemini API.

mod service;

use async_trait::async_trait;
use crate::error::GeminiError;
use crate::types::{Model, ListModelsParams, ListModelsResponse};

pub use service::ModelsServiceImpl;

/// Service for listing and retrieving model information.
#[async_trait]
pub trait ModelsService: Send + Sync {
    /// List all available models.
    async fn list(
        &self,
        params: Option<ListModelsParams>,
    ) -> Result<ListModelsResponse, GeminiError>;

    /// Get a specific model by name.
    async fn get(&self, model: &str) -> Result<Model, GeminiError>;
}
