//! Response types for AWS Bedrock operations.

use super::common::{StopReason, UsageInfo};
use serde::{Deserialize, Serialize};

/// Unified invoke response that works across all model families.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedInvokeResponse {
    /// Generated content.
    pub content: String,
    /// Reason for stopping generation.
    pub stop_reason: StopReason,
    /// Token usage information.
    pub usage: UsageInfo,
    /// Model ID that was invoked.
    pub model_id: String,
}

/// Unified streaming chunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedStreamChunk {
    /// Incremental content delta.
    pub delta: String,
    /// Whether this is the final chunk.
    pub is_final: bool,
    /// Stop reason (only on final chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<StopReason>,
    /// Usage info (only on final chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageInfo>,
    /// Content block index (for multi-block responses).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<usize>,
}

impl UnifiedStreamChunk {
    /// Create a content chunk.
    pub fn content(delta: impl Into<String>) -> Self {
        Self {
            delta: delta.into(),
            is_final: false,
            stop_reason: None,
            usage: None,
            index: None,
        }
    }

    /// Create a final chunk.
    pub fn final_chunk(stop_reason: StopReason, usage: UsageInfo) -> Self {
        Self {
            delta: String::new(),
            is_final: true,
            stop_reason: Some(stop_reason),
            usage: Some(usage),
            index: None,
        }
    }
}

// ============================================================================
// Titan-specific response types
// ============================================================================

/// Titan text generation response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitanTextResponse {
    /// Generation results.
    pub results: Vec<TitanTextResult>,
}

/// Titan text generation result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitanTextResult {
    /// Generated text output.
    pub output_text: String,
    /// Token count for this result.
    #[serde(default)]
    pub token_count: u32,
    /// Reason for completion.
    #[serde(default)]
    pub completion_reason: Option<String>,
}

/// Titan embedding response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitanEmbedResponse {
    /// The embedding vector.
    pub embedding: Vec<f32>,
    /// Token count for the input text.
    pub input_text_token_count: u32,
}

/// Titan streaming chunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitanStreamChunk {
    /// Output text delta.
    pub output_text: String,
    /// Index of the result.
    #[serde(default)]
    pub index: usize,
    /// Total output token count so far.
    #[serde(default)]
    pub total_output_text_token_count: Option<u32>,
    /// Completion reason (null until final).
    pub completion_reason: Option<String>,
}

// ============================================================================
// Claude-specific response types
// ============================================================================

/// Claude messages API response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeResponse {
    /// Response ID.
    pub id: String,
    /// Response type (always "message").
    #[serde(rename = "type")]
    pub response_type: String,
    /// Role (always "assistant").
    pub role: String,
    /// Content blocks.
    pub content: Vec<ClaudeContentBlock>,
    /// Model that generated the response.
    pub model: String,
    /// Stop reason.
    pub stop_reason: String,
    /// Stop sequence if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequence: Option<String>,
    /// Token usage.
    pub usage: ClaudeUsage,
}

/// Claude content block.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClaudeContentBlock {
    /// Text content block.
    #[serde(rename = "text")]
    Text {
        /// The text content.
        text: String,
    },
}

/// Claude usage information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeUsage {
    /// Input tokens.
    pub input_tokens: u32,
    /// Output tokens.
    pub output_tokens: u32,
}

impl From<ClaudeUsage> for UsageInfo {
    fn from(usage: ClaudeUsage) -> Self {
        UsageInfo::new(usage.input_tokens, usage.output_tokens)
    }
}

/// Claude streaming event types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClaudeStreamEvent {
    /// Message start event.
    #[serde(rename = "message_start")]
    MessageStart {
        /// Message metadata.
        message: ClaudeMessageStart,
    },
    /// Content block start.
    #[serde(rename = "content_block_start")]
    ContentBlockStart {
        /// Block index.
        index: usize,
        /// Content block.
        content_block: ClaudeContentBlock,
    },
    /// Content block delta.
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta {
        /// Block index.
        index: usize,
        /// Delta content.
        delta: ClaudeTextDelta,
    },
    /// Content block stop.
    #[serde(rename = "content_block_stop")]
    ContentBlockStop {
        /// Block index.
        index: usize,
    },
    /// Message delta.
    #[serde(rename = "message_delta")]
    MessageDelta {
        /// Delta information.
        delta: ClaudeMessageDeltaInfo,
        /// Usage information.
        usage: ClaudeOutputUsage,
    },
    /// Message stop.
    #[serde(rename = "message_stop")]
    MessageStop,
}

/// Claude message start metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMessageStart {
    /// Message ID.
    pub id: String,
    /// Role.
    pub role: String,
    /// Model.
    pub model: String,
}

/// Claude text delta.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeTextDelta {
    /// Delta type.
    #[serde(rename = "type")]
    pub delta_type: String,
    /// Text content.
    pub text: String,
}

/// Claude message delta info.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMessageDeltaInfo {
    /// Stop reason.
    pub stop_reason: String,
}

/// Claude output usage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeOutputUsage {
    /// Output tokens.
    pub output_tokens: u32,
}

// ============================================================================
// LLaMA-specific response types
// ============================================================================

/// LLaMA generation response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlamaResponse {
    /// Generated text.
    pub generation: String,
    /// Number of prompt tokens.
    pub prompt_token_count: u32,
    /// Number of generation tokens.
    pub generation_token_count: u32,
    /// Stop reason.
    pub stop_reason: String,
}

/// LLaMA streaming chunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlamaStreamChunk {
    /// Generated text delta.
    pub generation: String,
    /// Prompt token count (only on first chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_token_count: Option<u32>,
    /// Generation token count.
    #[serde(default)]
    pub generation_token_count: u32,
    /// Stop reason (null until final).
    pub stop_reason: Option<String>,
}

// ============================================================================
// Model discovery response types
// ============================================================================

/// List foundation models response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListModelsResponse {
    /// List of model summaries.
    pub model_summaries: Vec<ModelSummary>,
}

/// Foundation model summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSummary {
    /// Model ARN.
    pub model_arn: String,
    /// Model ID.
    pub model_id: String,
    /// Model name.
    pub model_name: String,
    /// Provider name.
    pub provider_name: String,
    /// Input modalities.
    pub input_modalities: Vec<String>,
    /// Output modalities.
    pub output_modalities: Vec<String>,
    /// Whether streaming is supported.
    #[serde(default)]
    pub response_streaming_supported: bool,
    /// Customization types supported.
    #[serde(default)]
    pub customizations_supported: Vec<String>,
    /// Inference types supported.
    #[serde(default)]
    pub inference_types_supported: Vec<String>,
}

/// Get foundation model response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetModelResponse {
    /// Detailed model information.
    pub model_details: ModelDetails,
}

/// Detailed model information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDetails {
    /// Model ARN.
    pub model_arn: String,
    /// Model ID.
    pub model_id: String,
    /// Model name.
    pub model_name: String,
    /// Provider name.
    pub provider_name: String,
    /// Input modalities.
    pub input_modalities: Vec<String>,
    /// Output modalities.
    pub output_modalities: Vec<String>,
    /// Whether streaming is supported.
    #[serde(default)]
    pub response_streaming_supported: bool,
    /// Model lifecycle status.
    pub model_lifecycle: Option<ModelLifecycle>,
}

/// Model lifecycle information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelLifecycle {
    /// Lifecycle status.
    pub status: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unified_stream_chunk() {
        let chunk = UnifiedStreamChunk::content("Hello");
        assert_eq!(chunk.delta, "Hello");
        assert!(!chunk.is_final);
        assert!(chunk.stop_reason.is_none());

        let final_chunk =
            UnifiedStreamChunk::final_chunk(StopReason::EndTurn, UsageInfo::new(100, 50));
        assert!(final_chunk.is_final);
        assert_eq!(final_chunk.stop_reason, Some(StopReason::EndTurn));
    }

    #[test]
    fn test_claude_usage_conversion() {
        let claude_usage = ClaudeUsage {
            input_tokens: 100,
            output_tokens: 50,
        };
        let usage: UsageInfo = claude_usage.into();

        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 50);
        assert_eq!(usage.total_tokens, 150);
    }

    #[test]
    fn test_titan_response_deserialization() {
        let json = r#"{
            "results": [{
                "outputText": "Hello, world!",
                "tokenCount": 5,
                "completionReason": "FINISH"
            }]
        }"#;

        let response: TitanTextResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.results.len(), 1);
        assert_eq!(response.results[0].output_text, "Hello, world!");
        assert_eq!(response.results[0].completion_reason, Some("FINISH".to_string()));
    }
}
