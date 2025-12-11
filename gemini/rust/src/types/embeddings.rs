//! Embedding-related types for the Gemini API.
//!
//! This module contains types for generating and working with embeddings.

use serde::{Deserialize, Serialize};

use super::content::Content;

/// Request to embed content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EmbedContentRequest {
    /// The model to use for embedding.
    pub model: String,
    /// The content to embed.
    pub content: Content,
    /// The task type for the embedding.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_type: Option<TaskType>,
    /// The title for retrieval tasks.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The desired output dimensionality.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_dimensionality: Option<i32>,
}

/// Task types for embeddings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskType {
    /// Retrieval query task.
    RetrievalQuery,
    /// Retrieval document task.
    RetrievalDocument,
    /// Semantic similarity task.
    SemanticSimilarity,
    /// Classification task.
    Classification,
    /// Clustering task.
    Clustering,
}

/// Response from embedding content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EmbedContentResponse {
    /// The embedding values.
    pub embedding: Embedding,
}

/// An embedding vector.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Embedding {
    /// The embedding values.
    pub values: Vec<f32>,
}

/// Response from batch embedding.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BatchEmbedContentsResponse {
    /// The embeddings for each input.
    pub embeddings: Vec<Embedding>,
}
