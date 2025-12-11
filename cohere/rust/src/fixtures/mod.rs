//! Test fixtures for the Cohere client.
//!
//! This module provides pre-built test data for use in tests.

use crate::services::chat::{ChatMessage, ChatResponse, MessageRole};
use crate::services::classify::{ClassificationResult, ClassifyExample, ClassifyResponse, LabelConfidence};
use crate::services::embed::{EmbedResponse, EmbeddingsByType};
use crate::services::generate::{GenerateResponse, Generation};
use crate::services::rerank::{RerankResponse, RerankResult};
use crate::types::{ApiMeta, BilledUnits, FinishReason, GenerationId};

/// Create a sample chat response
pub fn chat_response() -> ChatResponse {
    ChatResponse {
        text: "Hello! How can I help you today?".to_string(),
        generation_id: Some(GenerationId::new("gen-123")),
        finish_reason: Some(FinishReason::Complete),
        chat_history: Some(vec![
            ChatMessage::user("Hello"),
            ChatMessage::chatbot("Hello! How can I help you today?"),
        ]),
        tool_calls: None,
        citations: None,
        documents: None,
        search_queries: None,
        search_results: None,
        meta: Some(api_meta()),
    }
}

/// Create a sample generate response
pub fn generate_response() -> GenerateResponse {
    GenerateResponse {
        generations: vec![Generation {
            text: "Once upon a time, in a land far away...".to_string(),
            id: Some("gen-456".to_string()),
            finish_reason: Some(FinishReason::Complete),
            token_likelihoods: None,
        }],
        id: Some(GenerationId::new("gen-456")),
        prompt: Some("Once upon a time".to_string()),
        meta: Some(api_meta()),
    }
}

/// Create a sample embed response
pub fn embed_response() -> EmbedResponse {
    EmbedResponse {
        id: Some("embed-789".to_string()),
        embeddings: Some(vec![
            vec![0.1, 0.2, 0.3, 0.4, 0.5],
            vec![0.2, 0.3, 0.4, 0.5, 0.6],
        ]),
        embeddings_by_type: None,
        texts: Some(vec!["Hello".to_string(), "World".to_string()]),
        meta: Some(api_meta()),
    }
}

/// Create a sample embed response with multiple types
pub fn embed_response_multi_type() -> EmbedResponse {
    EmbedResponse {
        id: Some("embed-multi-123".to_string()),
        embeddings: None,
        embeddings_by_type: Some(EmbeddingsByType {
            float: Some(vec![vec![0.1, 0.2, 0.3]]),
            int8: Some(vec![vec![10, 20, 30]]),
            uint8: None,
            binary: None,
            ubinary: None,
        }),
        texts: Some(vec!["Test text".to_string()]),
        meta: Some(api_meta()),
    }
}

/// Create a sample rerank response
pub fn rerank_response() -> RerankResponse {
    RerankResponse {
        id: Some("rerank-123".to_string()),
        results: vec![
            RerankResult {
                index: 2,
                relevance_score: 0.95,
                document: None,
            },
            RerankResult {
                index: 0,
                relevance_score: 0.85,
                document: None,
            },
            RerankResult {
                index: 1,
                relevance_score: 0.60,
                document: None,
            },
        ],
        meta: Some(api_meta()),
    }
}

/// Create a sample classify response
pub fn classify_response() -> ClassifyResponse {
    ClassifyResponse {
        id: Some("classify-123".to_string()),
        classifications: vec![
            ClassificationResult {
                input: "This product is amazing!".to_string(),
                prediction: "positive".to_string(),
                confidence: 0.92,
                labels: Some(vec![
                    LabelConfidence {
                        label: "positive".to_string(),
                        confidence: 0.92,
                    },
                    LabelConfidence {
                        label: "negative".to_string(),
                        confidence: 0.08,
                    },
                ]),
                id: None,
            },
        ],
        meta: Some(api_meta()),
    }
}

/// Create sample classification examples
pub fn classify_examples() -> Vec<ClassifyExample> {
    vec![
        ClassifyExample::new("This is wonderful!", "positive"),
        ClassifyExample::new("This is terrible!", "negative"),
        ClassifyExample::new("I love this product", "positive"),
        ClassifyExample::new("I hate this product", "negative"),
    ]
}

/// Create a sample API meta
pub fn api_meta() -> ApiMeta {
    ApiMeta {
        api_version: Some(crate::types::ApiVersion {
            version: "1.0".to_string(),
            is_deprecated: false,
            deprecation_date: None,
        }),
        billed_units: Some(BilledUnits {
            input_tokens: 100,
            output_tokens: 50,
            search_units: None,
            classifications: None,
        }),
        warnings: vec![],
    }
}

/// Create sample SSE data for streaming tests
pub fn sse_chat_stream_data() -> Vec<String> {
    vec![
        r#"event: stream-start
data: {"event_type": "stream-start", "generation_id": "gen-stream-123"}

"#.to_string(),
        r#"event: text-generation
data: {"event_type": "text-generation", "text": "Hello"}

"#.to_string(),
        r#"event: text-generation
data: {"event_type": "text-generation", "text": " World"}

"#.to_string(),
        r#"event: stream-end
data: {"event_type": "stream-end", "finish_reason": "COMPLETE"}

"#.to_string(),
    ]
}

/// Create sample SSE data for generate streaming tests
pub fn sse_generate_stream_data() -> Vec<String> {
    vec![
        r#"data: {"text": "Once", "is_finished": false}

"#.to_string(),
        r#"data: {"text": " upon", "is_finished": false}

"#.to_string(),
        r#"data: {"text": " a", "is_finished": false}

"#.to_string(),
        r#"data: {"text": " time", "is_finished": true, "finish_reason": "COMPLETE"}

"#.to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_response_fixture() {
        let response = chat_response();
        assert!(!response.text.is_empty());
        assert!(response.generation_id.is_some());
    }

    #[test]
    fn test_generate_response_fixture() {
        let response = generate_response();
        assert!(!response.generations.is_empty());
        assert!(!response.generations[0].text.is_empty());
    }

    #[test]
    fn test_embed_response_fixture() {
        let response = embed_response();
        assert!(response.embeddings.is_some());
        assert!(!response.embeddings.as_ref().unwrap().is_empty());
    }

    #[test]
    fn test_rerank_response_fixture() {
        let response = rerank_response();
        assert!(!response.results.is_empty());
        // Results should be sorted by relevance (highest first)
        let sorted = response.sorted_results();
        assert_eq!(sorted[0].index, 2);
    }

    #[test]
    fn test_classify_response_fixture() {
        let response = classify_response();
        assert!(!response.classifications.is_empty());
        assert_eq!(response.classifications[0].prediction, "positive");
    }
}
