//! Request types for AWS Bedrock operations.

use super::common::Message;
use serde::{Deserialize, Serialize};

/// Unified invoke request that works across all model families.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedInvokeRequest {
    /// The model ID to invoke.
    pub model_id: String,
    /// Conversation messages.
    pub messages: Vec<Message>,
    /// Optional system prompt.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    /// Maximum tokens to generate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    /// Temperature for sampling (0.0 - 1.0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Top-p (nucleus) sampling parameter.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    /// Top-k sampling parameter (Claude only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    /// Stop sequences to end generation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
}

impl UnifiedInvokeRequest {
    /// Create a new request with required fields.
    pub fn new(model_id: impl Into<String>, messages: Vec<Message>) -> Self {
        Self {
            model_id: model_id.into(),
            messages,
            system: None,
            max_tokens: None,
            temperature: None,
            top_p: None,
            top_k: None,
            stop_sequences: None,
        }
    }

    /// Set the system prompt.
    pub fn with_system(mut self, system: impl Into<String>) -> Self {
        self.system = Some(system.into());
        self
    }

    /// Set maximum tokens.
    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = Some(max_tokens);
        self
    }

    /// Set temperature.
    pub fn with_temperature(mut self, temperature: f32) -> Self {
        self.temperature = Some(temperature);
        self
    }

    /// Set top-p.
    pub fn with_top_p(mut self, top_p: f32) -> Self {
        self.top_p = Some(top_p);
        self
    }

    /// Set top-k (Claude only).
    pub fn with_top_k(mut self, top_k: u32) -> Self {
        self.top_k = Some(top_k);
        self
    }

    /// Set stop sequences.
    pub fn with_stop_sequences(mut self, stop_sequences: Vec<String>) -> Self {
        self.stop_sequences = Some(stop_sequences);
        self
    }
}

// ============================================================================
// Titan-specific request types
// ============================================================================

/// Titan text generation request body.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitanTextRequest {
    /// The input text prompt.
    pub input_text: String,
    /// Text generation configuration.
    pub text_generation_config: TitanTextConfig,
}

/// Titan text generation configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitanTextConfig {
    /// Maximum token count for generation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_token_count: Option<u32>,
    /// Temperature for sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Top-p for nucleus sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    /// Stop sequences.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
}

/// Titan embedding request body.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitanEmbedRequest {
    /// The input text to embed.
    pub input_text: String,
    /// Embedding dimensions (for v2 models).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dimensions: Option<u32>,
    /// Whether to normalize the embedding.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub normalize: Option<bool>,
}

impl TitanEmbedRequest {
    /// Create a new embedding request.
    pub fn new(input_text: impl Into<String>) -> Self {
        Self {
            input_text: input_text.into(),
            dimensions: None,
            normalize: None,
        }
    }

    /// Set embedding dimensions (256, 384, 512, or 1024 for v2).
    pub fn with_dimensions(mut self, dimensions: u32) -> Self {
        self.dimensions = Some(dimensions);
        self
    }

    /// Set normalization.
    pub fn with_normalize(mut self, normalize: bool) -> Self {
        self.normalize = Some(normalize);
        self
    }
}

// ============================================================================
// Claude-specific request types
// ============================================================================

/// Claude messages API request body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeRequest {
    /// The model ID (anthropic_version).
    pub anthropic_version: String,
    /// Maximum tokens to generate.
    pub max_tokens: u32,
    /// Conversation messages.
    pub messages: Vec<ClaudeMessage>,
    /// Optional system prompt.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    /// Temperature for sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Top-p for nucleus sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    /// Top-k for sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    /// Stop sequences.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
}

/// Claude message format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMessage {
    /// Role: "user" or "assistant".
    pub role: String,
    /// Message content.
    pub content: String,
}

impl From<Message> for ClaudeMessage {
    fn from(msg: Message) -> Self {
        Self {
            role: msg.role,
            content: msg.content,
        }
    }
}

// ============================================================================
// LLaMA-specific request types
// ============================================================================

/// LLaMA request body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlamaRequest {
    /// The formatted prompt string.
    pub prompt: String,
    /// Maximum generation length in tokens.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_gen_len: Option<u32>,
    /// Temperature for sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Top-p for nucleus sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
}

// ============================================================================
// Model discovery request types
// ============================================================================

/// Request for listing foundation models.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ListModelsRequest {
    /// Filter by provider (e.g., "amazon", "anthropic", "meta").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by_provider: Option<String>,
    /// Filter by output modality (e.g., "TEXT", "EMBEDDING").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by_output_modality: Option<String>,
    /// Filter by customization type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by_customization_type: Option<String>,
    /// Filter by inference type (e.g., "ON_DEMAND", "PROVISIONED").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by_inference_type: Option<String>,
}

/// Request for getting a specific foundation model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetModelRequest {
    /// The model ID to get details for.
    pub model_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unified_invoke_request_builder() {
        let request = UnifiedInvokeRequest::new(
            "amazon.titan-text-express-v1",
            vec![Message::user("Hello")],
        )
        .with_system("You are helpful")
        .with_max_tokens(100)
        .with_temperature(0.7);

        assert_eq!(request.model_id, "amazon.titan-text-express-v1");
        assert_eq!(request.messages.len(), 1);
        assert_eq!(request.system, Some("You are helpful".to_string()));
        assert_eq!(request.max_tokens, Some(100));
        assert_eq!(request.temperature, Some(0.7));
    }

    #[test]
    fn test_titan_embed_request() {
        let request = TitanEmbedRequest::new("Hello, world!")
            .with_dimensions(1024)
            .with_normalize(true);

        assert_eq!(request.input_text, "Hello, world!");
        assert_eq!(request.dimensions, Some(1024));
        assert_eq!(request.normalize, Some(true));
    }

    #[test]
    fn test_claude_message_from_message() {
        let msg = Message::user("Hello");
        let claude_msg: ClaudeMessage = msg.into();

        assert_eq!(claude_msg.role, "user");
        assert_eq!(claude_msg.content, "Hello");
    }
}
