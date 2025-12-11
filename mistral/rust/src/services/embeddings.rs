//! Embeddings service.

use async_trait::async_trait;

use crate::errors::MistralError;
use crate::types::embeddings::{EmbeddingRequest, EmbeddingResponse};

/// Embeddings service trait.
#[async_trait]
pub trait EmbeddingsService: Send + Sync {
    /// Creates embeddings for the given input.
    async fn create(&self, request: EmbeddingRequest) -> Result<EmbeddingResponse, MistralError>;
}

/// Default implementation of the embeddings service.
pub struct DefaultEmbeddingsService<T> {
    transport: T,
}

impl<T> DefaultEmbeddingsService<T> {
    /// Creates a new embeddings service.
    pub fn new(transport: T) -> Self {
        Self { transport }
    }
}

#[async_trait]
impl<T> EmbeddingsService for DefaultEmbeddingsService<T>
where
    T: crate::transport::HttpTransport + Send + Sync,
{
    async fn create(&self, request: EmbeddingRequest) -> Result<EmbeddingResponse, MistralError> {
        let body = serde_json::to_vec(&request)
            .map_err(|e| MistralError::Serialization { message: e.to_string() })?;

        let response = self.transport
            .post("/v1/embeddings", body)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::embeddings::EmbeddingInput;

    #[test]
    fn test_embedding_request_serialization() {
        let request = EmbeddingRequest::new("mistral-embed", "Hello world");
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("mistral-embed"));
        assert!(json.contains("Hello world"));
    }

    #[test]
    fn test_embedding_input_variants() {
        let single: EmbeddingInput = "test".into();
        assert!(matches!(single, EmbeddingInput::Single(_)));

        let multiple: EmbeddingInput = vec!["a", "b", "c"].into();
        assert!(matches!(multiple, EmbeddingInput::Multiple(_)));
    }
}
