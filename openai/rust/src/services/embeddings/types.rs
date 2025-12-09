use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct EmbeddingsRequest {
    pub model: String,
    pub input: EmbeddingInput,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoding_format: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub dimensions: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum EmbeddingInput {
    Single(String),
    Multiple(Vec<String>),
    Tokens(Vec<i32>),
    MultipleTokens(Vec<Vec<i32>>),
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingsResponse {
    pub object: String,
    pub data: Vec<Embedding>,
    pub model: String,
    pub usage: EmbeddingUsage,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Embedding {
    pub object: String,
    pub embedding: Vec<f32>,
    pub index: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingUsage {
    pub prompt_tokens: u32,
    pub total_tokens: u32,
}

impl EmbeddingsRequest {
    pub fn new(model: impl Into<String>, input: impl Into<String>) -> Self {
        Self {
            model: model.into(),
            input: EmbeddingInput::Single(input.into()),
            encoding_format: None,
            dimensions: None,
            user: None,
        }
    }

    pub fn with_multiple(model: impl Into<String>, inputs: Vec<String>) -> Self {
        Self {
            model: model.into(),
            input: EmbeddingInput::Multiple(inputs),
            encoding_format: None,
            dimensions: None,
            user: None,
        }
    }

    pub fn with_dimensions(mut self, dims: u32) -> Self {
        self.dimensions = Some(dims);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embeddings_request_builder() {
        let request = EmbeddingsRequest::new(
            "text-embedding-3-small",
            "Hello world",
        )
        .with_dimensions(512);

        assert_eq!(request.model, "text-embedding-3-small");
        assert_eq!(request.dimensions, Some(512));
    }

    #[test]
    fn test_embedding_input_serialization() {
        let input = EmbeddingInput::Multiple(vec!["hello".to_string(), "world".to_string()]);
        let json = serde_json::to_string(&input).unwrap();
        assert!(json.contains("hello"));
        assert!(json.contains("world"));
    }
}
