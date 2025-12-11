//! Embedding types.

use serde::{Deserialize, Serialize};

/// Embedding request.
#[derive(Debug, Clone, Serialize)]
pub struct EmbeddingRequest {
    /// Model ID to use.
    pub model: String,
    /// Input text(s) to embed.
    pub input: EmbeddingInput,
    /// Encoding format.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoding_format: Option<EncodingFormat>,
}

impl EmbeddingRequest {
    /// Creates a new embedding request.
    pub fn new(model: impl Into<String>, input: impl Into<EmbeddingInput>) -> Self {
        Self {
            model: model.into(),
            input: input.into(),
            encoding_format: None,
        }
    }

    /// Sets the encoding format.
    pub fn with_encoding_format(mut self, format: EncodingFormat) -> Self {
        self.encoding_format = Some(format);
        self
    }
}

/// Input for embedding requests.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EmbeddingInput {
    /// Single text input.
    Single(String),
    /// Multiple text inputs.
    Multiple(Vec<String>),
}

impl From<String> for EmbeddingInput {
    fn from(s: String) -> Self {
        EmbeddingInput::Single(s)
    }
}

impl From<&str> for EmbeddingInput {
    fn from(s: &str) -> Self {
        EmbeddingInput::Single(s.to_string())
    }
}

impl From<Vec<String>> for EmbeddingInput {
    fn from(v: Vec<String>) -> Self {
        EmbeddingInput::Multiple(v)
    }
}

impl From<Vec<&str>> for EmbeddingInput {
    fn from(v: Vec<&str>) -> Self {
        EmbeddingInput::Multiple(v.into_iter().map(String::from).collect())
    }
}

/// Encoding format for embeddings.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EncodingFormat {
    /// Float format.
    Float,
    /// Base64 format.
    Base64,
}

/// Embedding response.
#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingResponse {
    /// Response ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Model used.
    pub model: String,
    /// Embedding data.
    pub data: Vec<EmbeddingData>,
    /// Token usage.
    pub usage: EmbeddingUsage,
}

/// Embedding data.
#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingData {
    /// Object type.
    pub object: String,
    /// Embedding vector.
    pub embedding: Vec<f32>,
    /// Index in the input.
    pub index: u32,
}

/// Embedding usage information.
#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingUsage {
    /// Number of prompt tokens.
    pub prompt_tokens: u32,
    /// Total tokens.
    pub total_tokens: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedding_request_creation() {
        let request = EmbeddingRequest::new("mistral-embed", "Hello, world!");
        assert_eq!(request.model, "mistral-embed");
        assert!(matches!(request.input, EmbeddingInput::Single(_)));
    }

    #[test]
    fn test_embedding_input_from_vec() {
        let input: EmbeddingInput = vec!["Hello", "World"].into();
        assert!(matches!(input, EmbeddingInput::Multiple(_)));
    }

    #[test]
    fn test_embedding_request_with_format() {
        let request = EmbeddingRequest::new("mistral-embed", "test")
            .with_encoding_format(EncodingFormat::Float);
        assert_eq!(request.encoding_format, Some(EncodingFormat::Float));
    }
}
