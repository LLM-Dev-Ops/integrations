//! Types for the Embed service.

use crate::types::{ApiMeta, EmbeddingType, InputType, TruncateOption};
use serde::{Deserialize, Serialize};

/// Embed request
#[derive(Debug, Clone, Serialize)]
pub struct EmbedRequest {
    /// Texts to embed
    pub texts: Vec<String>,
    /// Model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Input type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_type: Option<InputType>,
    /// Embedding types to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding_types: Option<Vec<EmbeddingType>>,
    /// Truncation behavior
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncate: Option<TruncateOption>,
}

impl EmbedRequest {
    /// Create a new embed request
    pub fn new(texts: Vec<String>) -> Self {
        Self {
            texts,
            model: None,
            input_type: None,
            embedding_types: None,
            truncate: None,
        }
    }

    /// Create a request for a single text
    pub fn single(text: impl Into<String>) -> Self {
        Self::new(vec![text.into()])
    }

    /// Create a builder
    pub fn builder(texts: Vec<String>) -> EmbedRequestBuilder {
        EmbedRequestBuilder::new(texts)
    }
}

/// Builder for EmbedRequest
#[derive(Debug, Clone)]
pub struct EmbedRequestBuilder {
    request: EmbedRequest,
}

impl EmbedRequestBuilder {
    /// Create a new builder
    pub fn new(texts: Vec<String>) -> Self {
        Self {
            request: EmbedRequest::new(texts),
        }
    }

    /// Set the model
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.request.model = Some(model.into());
        self
    }

    /// Set the input type
    pub fn input_type(mut self, input_type: InputType) -> Self {
        self.request.input_type = Some(input_type);
        self
    }

    /// Set embedding types
    pub fn embedding_types(mut self, types: Vec<EmbeddingType>) -> Self {
        self.request.embedding_types = Some(types);
        self
    }

    /// Set truncation behavior
    pub fn truncate(mut self, truncate: TruncateOption) -> Self {
        self.request.truncate = Some(truncate);
        self
    }

    /// Build the request
    pub fn build(self) -> EmbedRequest {
        self.request
    }
}

/// A single embedding
#[derive(Debug, Clone)]
pub struct Embedding {
    /// Float embedding values
    pub float: Option<Vec<f32>>,
    /// Int8 embedding values
    pub int8: Option<Vec<i8>>,
    /// Uint8 embedding values
    pub uint8: Option<Vec<u8>>,
    /// Binary embedding values
    pub binary: Option<Vec<i8>>,
    /// Ubinary embedding values
    pub ubinary: Option<Vec<u8>>,
}

impl Embedding {
    /// Get the float embedding
    pub fn as_float(&self) -> Option<&[f32]> {
        self.float.as_deref()
    }

    /// Get the int8 embedding
    pub fn as_int8(&self) -> Option<&[i8]> {
        self.int8.as_deref()
    }

    /// Get the dimension of the embedding
    pub fn dimension(&self) -> usize {
        if let Some(ref f) = self.float {
            return f.len();
        }
        if let Some(ref i) = self.int8 {
            return i.len();
        }
        if let Some(ref u) = self.uint8 {
            return u.len();
        }
        if let Some(ref b) = self.binary {
            return b.len() * 8;
        }
        if let Some(ref u) = self.ubinary {
            return u.len() * 8;
        }
        0
    }
}

/// Embeddings grouped by type
#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingsByType {
    /// Float embeddings
    #[serde(default)]
    pub float: Option<Vec<Vec<f32>>>,
    /// Int8 embeddings
    #[serde(default)]
    pub int8: Option<Vec<Vec<i8>>>,
    /// Uint8 embeddings
    #[serde(default)]
    pub uint8: Option<Vec<Vec<u8>>>,
    /// Binary embeddings
    #[serde(default)]
    pub binary: Option<Vec<Vec<i8>>>,
    /// Ubinary embeddings
    #[serde(default)]
    pub ubinary: Option<Vec<Vec<u8>>>,
}

impl EmbeddingsByType {
    /// Get embeddings at a specific index
    pub fn get(&self, index: usize) -> Option<Embedding> {
        let float = self.float.as_ref().and_then(|v| v.get(index).cloned());
        let int8 = self.int8.as_ref().and_then(|v| v.get(index).cloned());
        let uint8 = self.uint8.as_ref().and_then(|v| v.get(index).cloned());
        let binary = self.binary.as_ref().and_then(|v| v.get(index).cloned());
        let ubinary = self.ubinary.as_ref().and_then(|v| v.get(index).cloned());

        if float.is_some()
            || int8.is_some()
            || uint8.is_some()
            || binary.is_some()
            || ubinary.is_some()
        {
            Some(Embedding {
                float,
                int8,
                uint8,
                binary,
                ubinary,
            })
        } else {
            None
        }
    }

    /// Get the number of embeddings
    pub fn len(&self) -> usize {
        if let Some(ref f) = self.float {
            return f.len();
        }
        if let Some(ref i) = self.int8 {
            return i.len();
        }
        if let Some(ref u) = self.uint8 {
            return u.len();
        }
        if let Some(ref b) = self.binary {
            return b.len();
        }
        if let Some(ref u) = self.ubinary {
            return u.len();
        }
        0
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Embed response
#[derive(Debug, Clone, Deserialize)]
pub struct EmbedResponse {
    /// Response ID
    #[serde(default)]
    pub id: Option<String>,
    /// Embeddings (legacy format - float only)
    #[serde(default)]
    pub embeddings: Option<Vec<Vec<f32>>>,
    /// Embeddings by type (new format)
    #[serde(default)]
    pub embeddings_by_type: Option<EmbeddingsByType>,
    /// Texts that were embedded
    #[serde(default)]
    pub texts: Option<Vec<String>>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

impl EmbedResponse {
    /// Get embedding at index
    pub fn get(&self, index: usize) -> Option<Embedding> {
        // Try new format first
        if let Some(ref by_type) = self.embeddings_by_type {
            return by_type.get(index);
        }

        // Fall back to legacy format
        if let Some(ref embeddings) = self.embeddings {
            return embeddings.get(index).map(|e| Embedding {
                float: Some(e.clone()),
                int8: None,
                uint8: None,
                binary: None,
                ubinary: None,
            });
        }

        None
    }

    /// Get all float embeddings
    pub fn float_embeddings(&self) -> Option<&[Vec<f32>]> {
        if let Some(ref by_type) = self.embeddings_by_type {
            return by_type.float.as_deref();
        }
        self.embeddings.as_deref()
    }

    /// Get the number of embeddings
    pub fn len(&self) -> usize {
        if let Some(ref by_type) = self.embeddings_by_type {
            return by_type.len();
        }
        self.embeddings.as_ref().map(|e| e.len()).unwrap_or(0)
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Status of an embed job
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmbedJobStatus {
    /// Job is processing
    Processing,
    /// Job completed successfully
    Complete,
    /// Job failed
    Failed,
    /// Job was cancelled
    Cancelled,
}

/// Embed job request
#[derive(Debug, Clone, Serialize)]
pub struct EmbedJobRequest {
    /// Dataset ID to embed
    pub dataset_id: String,
    /// Model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Input type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_type: Option<InputType>,
    /// Embedding types
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding_types: Option<Vec<EmbeddingType>>,
    /// Truncation behavior
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncate: Option<TruncateOption>,
    /// Job name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl EmbedJobRequest {
    /// Create a new embed job request
    pub fn new(dataset_id: impl Into<String>) -> Self {
        Self {
            dataset_id: dataset_id.into(),
            model: None,
            input_type: None,
            embedding_types: None,
            truncate: None,
            name: None,
        }
    }
}

/// An embed job
#[derive(Debug, Clone, Deserialize)]
pub struct EmbedJob {
    /// Job ID
    pub job_id: String,
    /// Job name
    #[serde(default)]
    pub name: Option<String>,
    /// Job status
    pub status: EmbedJobStatus,
    /// Model used
    #[serde(default)]
    pub model: Option<String>,
    /// Input dataset ID
    #[serde(default)]
    pub input_dataset_id: Option<String>,
    /// Output dataset ID (when complete)
    #[serde(default)]
    pub output_dataset_id: Option<String>,
    /// Creation time
    #[serde(default)]
    pub created_at: Option<String>,
    /// Completion time
    #[serde(default)]
    pub completed_at: Option<String>,
    /// Truncation used
    #[serde(default)]
    pub truncate: Option<TruncateOption>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embed_request_single() {
        let request = EmbedRequest::single("Hello, world!");
        assert_eq!(request.texts.len(), 1);
        assert_eq!(request.texts[0], "Hello, world!");
    }

    #[test]
    fn test_embed_request_builder() {
        let request = EmbedRequest::builder(vec!["text1".to_string(), "text2".to_string()])
            .model("embed-english-v3.0")
            .input_type(InputType::SearchDocument)
            .embedding_types(vec![EmbeddingType::Float, EmbeddingType::Int8])
            .truncate(TruncateOption::End)
            .build();

        assert_eq!(request.texts.len(), 2);
        assert_eq!(request.model, Some("embed-english-v3.0".to_string()));
        assert_eq!(request.input_type, Some(InputType::SearchDocument));
        assert_eq!(request.embedding_types.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn test_embedding_dimension() {
        let embedding = Embedding {
            float: Some(vec![0.1, 0.2, 0.3]),
            int8: None,
            uint8: None,
            binary: None,
            ubinary: None,
        };
        assert_eq!(embedding.dimension(), 3);
    }

    #[test]
    fn test_embeddings_by_type_get() {
        let by_type = EmbeddingsByType {
            float: Some(vec![vec![0.1, 0.2], vec![0.3, 0.4]]),
            int8: None,
            uint8: None,
            binary: None,
            ubinary: None,
        };

        let emb = by_type.get(0).unwrap();
        assert_eq!(emb.float.as_ref().unwrap(), &[0.1, 0.2]);

        let emb2 = by_type.get(1).unwrap();
        assert_eq!(emb2.float.as_ref().unwrap(), &[0.3, 0.4]);
    }
}
