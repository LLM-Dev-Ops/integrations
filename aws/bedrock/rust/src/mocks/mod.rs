//! Mock implementations for testing.
//!
//! This module provides mock implementations of the Bedrock client and services
//! for unit testing without actual AWS calls.

use crate::credentials::{AwsCredentials, CredentialsProvider};
use crate::error::BedrockError;
use async_trait::async_trait;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// Mock credentials provider.
pub struct MockCredentialsProvider {
    credentials: AwsCredentials,
    call_count: AtomicUsize,
}

impl MockCredentialsProvider {
    /// Create a new mock provider with default test credentials.
    pub fn new() -> Self {
        Self {
            credentials: AwsCredentials::new("AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
            call_count: AtomicUsize::new(0),
        }
    }

    /// Create with custom credentials.
    pub fn with_credentials(credentials: AwsCredentials) -> Self {
        Self {
            credentials,
            call_count: AtomicUsize::new(0),
        }
    }

    /// Get the number of times credentials were requested.
    pub fn call_count(&self) -> usize {
        self.call_count.load(Ordering::SeqCst)
    }
}

impl Default for MockCredentialsProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialsProvider for MockCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, BedrockError> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        Ok(self.credentials.clone())
    }

    fn name(&self) -> &'static str {
        "mock"
    }
}

/// Mock Titan response builder.
pub struct MockTitanResponse {
    output_text: String,
    token_count: u32,
    completion_reason: String,
}

impl MockTitanResponse {
    /// Create a new mock response.
    pub fn new(output_text: impl Into<String>) -> Self {
        Self {
            output_text: output_text.into(),
            token_count: 10,
            completion_reason: "FINISH".to_string(),
        }
    }

    /// Set token count.
    pub fn with_token_count(mut self, count: u32) -> Self {
        self.token_count = count;
        self
    }

    /// Set completion reason.
    pub fn with_completion_reason(mut self, reason: impl Into<String>) -> Self {
        self.completion_reason = reason.into();
        self
    }

    /// Build to JSON string.
    pub fn to_json(&self) -> String {
        serde_json::json!({
            "results": [{
                "outputText": self.output_text,
                "tokenCount": self.token_count,
                "completionReason": self.completion_reason
            }]
        })
        .to_string()
    }
}

/// Mock Claude response builder.
pub struct MockClaudeResponse {
    id: String,
    content: String,
    stop_reason: String,
    input_tokens: u32,
    output_tokens: u32,
}

impl MockClaudeResponse {
    /// Create a new mock response.
    pub fn new(content: impl Into<String>) -> Self {
        Self {
            id: format!("msg_{}", uuid::Uuid::new_v4()),
            content: content.into(),
            stop_reason: "end_turn".to_string(),
            input_tokens: 10,
            output_tokens: 5,
        }
    }

    /// Set stop reason.
    pub fn with_stop_reason(mut self, reason: impl Into<String>) -> Self {
        self.stop_reason = reason.into();
        self
    }

    /// Set usage.
    pub fn with_usage(mut self, input: u32, output: u32) -> Self {
        self.input_tokens = input;
        self.output_tokens = output;
        self
    }

    /// Build to JSON string.
    pub fn to_json(&self) -> String {
        serde_json::json!({
            "id": self.id,
            "type": "message",
            "role": "assistant",
            "content": [{
                "type": "text",
                "text": self.content
            }],
            "model": "claude-3-sonnet-20240229",
            "stop_reason": self.stop_reason,
            "usage": {
                "input_tokens": self.input_tokens,
                "output_tokens": self.output_tokens
            }
        })
        .to_string()
    }
}

/// Mock LLaMA response builder.
pub struct MockLlamaResponse {
    generation: String,
    prompt_token_count: u32,
    generation_token_count: u32,
    stop_reason: String,
}

impl MockLlamaResponse {
    /// Create a new mock response.
    pub fn new(generation: impl Into<String>) -> Self {
        Self {
            generation: generation.into(),
            prompt_token_count: 10,
            generation_token_count: 5,
            stop_reason: "stop".to_string(),
        }
    }

    /// Set token counts.
    pub fn with_token_counts(mut self, prompt: u32, generation: u32) -> Self {
        self.prompt_token_count = prompt;
        self.generation_token_count = generation;
        self
    }

    /// Build to JSON string.
    pub fn to_json(&self) -> String {
        serde_json::json!({
            "generation": self.generation,
            "prompt_token_count": self.prompt_token_count,
            "generation_token_count": self.generation_token_count,
            "stop_reason": self.stop_reason
        })
        .to_string()
    }
}

/// Mock embedding response builder.
pub struct MockEmbeddingResponse {
    embedding: Vec<f32>,
    token_count: u32,
}

impl MockEmbeddingResponse {
    /// Create with specified dimensions.
    pub fn new(dimensions: usize) -> Self {
        Self {
            embedding: vec![0.1; dimensions],
            token_count: 5,
        }
    }

    /// Build to JSON string.
    pub fn to_json(&self) -> String {
        serde_json::json!({
            "embedding": self.embedding,
            "inputTextTokenCount": self.token_count
        })
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_credentials_provider() {
        let provider = MockCredentialsProvider::new();
        assert_eq!(provider.call_count(), 0);

        let creds = provider.get_credentials().await.unwrap();
        assert_eq!(provider.call_count(), 1);
        assert_eq!(creds.access_key_id(), "AKIAIOSFODNN7EXAMPLE");
    }

    #[test]
    fn test_mock_titan_response() {
        let response = MockTitanResponse::new("Hello, world!")
            .with_token_count(15)
            .with_completion_reason("LENGTH");

        let json = response.to_json();
        assert!(json.contains("Hello, world!"));
        assert!(json.contains("15"));
        assert!(json.contains("LENGTH"));
    }

    #[test]
    fn test_mock_claude_response() {
        let response = MockClaudeResponse::new("Hi there!")
            .with_usage(20, 10);

        let json = response.to_json();
        assert!(json.contains("Hi there!"));
        assert!(json.contains("end_turn"));
    }

    #[test]
    fn test_mock_llama_response() {
        let response = MockLlamaResponse::new("Generated text")
            .with_token_counts(50, 25);

        let json = response.to_json();
        assert!(json.contains("Generated text"));
        assert!(json.contains("50"));
        assert!(json.contains("25"));
    }

    #[test]
    fn test_mock_embedding_response() {
        let response = MockEmbeddingResponse::new(1024);
        let json = response.to_json();
        assert!(json.contains("embedding"));
    }
}
