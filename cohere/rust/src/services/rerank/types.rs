//! Types for the Rerank service.

use crate::types::ApiMeta;
use serde::{Deserialize, Serialize};

/// A document to rerank
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RerankDocument {
    /// Simple text document
    Text(String),
    /// Structured document with fields
    Structured {
        /// Document text
        text: String,
        /// Document title (optional)
        #[serde(skip_serializing_if = "Option::is_none")]
        title: Option<String>,
    },
}

impl RerankDocument {
    /// Create a simple text document
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text(text.into())
    }

    /// Create a structured document
    pub fn structured(text: impl Into<String>) -> Self {
        Self::Structured {
            text: text.into(),
            title: None,
        }
    }

    /// Create a structured document with title
    pub fn with_title(text: impl Into<String>, title: impl Into<String>) -> Self {
        Self::Structured {
            text: text.into(),
            title: Some(title.into()),
        }
    }

    /// Get the text content
    pub fn text_content(&self) -> &str {
        match self {
            RerankDocument::Text(t) => t,
            RerankDocument::Structured { text, .. } => text,
        }
    }
}

impl From<String> for RerankDocument {
    fn from(s: String) -> Self {
        Self::Text(s)
    }
}

impl From<&str> for RerankDocument {
    fn from(s: &str) -> Self {
        Self::Text(s.to_string())
    }
}

/// Rerank request
#[derive(Debug, Clone, Serialize)]
pub struct RerankRequest {
    /// Query to rerank documents against
    pub query: String,
    /// Documents to rerank
    pub documents: Vec<RerankDocument>,
    /// Model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Number of top results to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_n: Option<u32>,
    /// Maximum number of chunks per document
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_chunks_per_doc: Option<u32>,
    /// Whether to return the documents in the response
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_documents: Option<bool>,
    /// Rank fields to use (for JSON documents)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rank_fields: Option<Vec<String>>,
}

impl RerankRequest {
    /// Create a new rerank request
    pub fn new(query: impl Into<String>, documents: Vec<RerankDocument>) -> Self {
        Self {
            query: query.into(),
            documents,
            model: None,
            top_n: None,
            max_chunks_per_doc: None,
            return_documents: None,
            rank_fields: None,
        }
    }

    /// Create a request from string documents
    pub fn from_strings(query: impl Into<String>, documents: Vec<String>) -> Self {
        let docs = documents.into_iter().map(RerankDocument::Text).collect();
        Self::new(query, docs)
    }

    /// Create a builder
    pub fn builder(query: impl Into<String>, documents: Vec<RerankDocument>) -> RerankRequestBuilder {
        RerankRequestBuilder::new(query, documents)
    }
}

/// Builder for RerankRequest
#[derive(Debug, Clone)]
pub struct RerankRequestBuilder {
    request: RerankRequest,
}

impl RerankRequestBuilder {
    /// Create a new builder
    pub fn new(query: impl Into<String>, documents: Vec<RerankDocument>) -> Self {
        Self {
            request: RerankRequest::new(query, documents),
        }
    }

    /// Set the model
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.request.model = Some(model.into());
        self
    }

    /// Set top_n
    pub fn top_n(mut self, n: u32) -> Self {
        self.request.top_n = Some(n);
        self
    }

    /// Set max_chunks_per_doc
    pub fn max_chunks_per_doc(mut self, max: u32) -> Self {
        self.request.max_chunks_per_doc = Some(max);
        self
    }

    /// Set return_documents
    pub fn return_documents(mut self, return_docs: bool) -> Self {
        self.request.return_documents = Some(return_docs);
        self
    }

    /// Set rank fields
    pub fn rank_fields(mut self, fields: Vec<String>) -> Self {
        self.request.rank_fields = Some(fields);
        self
    }

    /// Build the request
    pub fn build(self) -> RerankRequest {
        self.request
    }
}

/// A single rerank result
#[derive(Debug, Clone, Deserialize)]
pub struct RerankResult {
    /// Original index of the document
    pub index: usize,
    /// Relevance score (higher is more relevant)
    pub relevance_score: f64,
    /// The document (if return_documents was true)
    #[serde(default)]
    pub document: Option<RerankDocument>,
}

/// Rerank response
#[derive(Debug, Clone, Deserialize)]
pub struct RerankResponse {
    /// Response ID
    #[serde(default)]
    pub id: Option<String>,
    /// Reranked results
    pub results: Vec<RerankResult>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

impl RerankResponse {
    /// Get results sorted by relevance (highest first)
    pub fn sorted_results(&self) -> Vec<&RerankResult> {
        let mut results: Vec<_> = self.results.iter().collect();
        results.sort_by(|a, b| {
            b.relevance_score
                .partial_cmp(&a.relevance_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        results
    }

    /// Get the top result
    pub fn top(&self) -> Option<&RerankResult> {
        self.results
            .iter()
            .max_by(|a, b| {
                a.relevance_score
                    .partial_cmp(&b.relevance_score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    }

    /// Get results above a relevance threshold
    pub fn above_threshold(&self, threshold: f64) -> Vec<&RerankResult> {
        self.results
            .iter()
            .filter(|r| r.relevance_score >= threshold)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rerank_document_text() {
        let doc = RerankDocument::text("Hello, world!");
        assert_eq!(doc.text_content(), "Hello, world!");
    }

    #[test]
    fn test_rerank_document_with_title() {
        let doc = RerankDocument::with_title("Document content", "Document Title");
        assert_eq!(doc.text_content(), "Document content");
    }

    #[test]
    fn test_rerank_request_builder() {
        let docs = vec![
            RerankDocument::text("doc1"),
            RerankDocument::text("doc2"),
        ];
        let request = RerankRequest::builder("query", docs)
            .model("rerank-english-v3.0")
            .top_n(5)
            .return_documents(true)
            .build();

        assert_eq!(request.query, "query");
        assert_eq!(request.documents.len(), 2);
        assert_eq!(request.model, Some("rerank-english-v3.0".to_string()));
        assert_eq!(request.top_n, Some(5));
    }

    #[test]
    fn test_rerank_request_from_strings() {
        let docs = vec!["doc1".to_string(), "doc2".to_string()];
        let request = RerankRequest::from_strings("query", docs);

        assert_eq!(request.documents.len(), 2);
    }

    #[test]
    fn test_rerank_response_sorted() {
        let response = RerankResponse {
            id: None,
            results: vec![
                RerankResult {
                    index: 0,
                    relevance_score: 0.5,
                    document: None,
                },
                RerankResult {
                    index: 1,
                    relevance_score: 0.9,
                    document: None,
                },
                RerankResult {
                    index: 2,
                    relevance_score: 0.3,
                    document: None,
                },
            ],
            meta: None,
        };

        let sorted = response.sorted_results();
        assert_eq!(sorted[0].index, 1);
        assert_eq!(sorted[1].index, 0);
        assert_eq!(sorted[2].index, 2);
    }

    #[test]
    fn test_rerank_response_top() {
        let response = RerankResponse {
            id: None,
            results: vec![
                RerankResult {
                    index: 0,
                    relevance_score: 0.5,
                    document: None,
                },
                RerankResult {
                    index: 1,
                    relevance_score: 0.9,
                    document: None,
                },
            ],
            meta: None,
        };

        let top = response.top().unwrap();
        assert_eq!(top.index, 1);
    }
}
