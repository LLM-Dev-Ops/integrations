//! Common types shared across model families.

use serde::{Deserialize, Serialize};

/// Model family enumeration for routing requests.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelFamily {
    /// Amazon Titan models (text and embeddings).
    Titan,
    /// Anthropic Claude models.
    Claude,
    /// Meta LLaMA models.
    Llama,
}

impl std::fmt::Display for ModelFamily {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModelFamily::Titan => write!(f, "titan"),
            ModelFamily::Claude => write!(f, "claude"),
            ModelFamily::Llama => write!(f, "llama"),
        }
    }
}

/// LLaMA version for prompt format selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LlamaVersion {
    /// LLaMA 2 format.
    V2,
    /// LLaMA 3 format.
    V3,
    /// LLaMA 3.1 format.
    V3_1,
    /// LLaMA 3.2 format.
    V3_2,
}

/// Detect model family from model ID.
///
/// Handles both base model IDs and ARN formats.
pub fn detect_model_family(model_id: &str) -> Result<ModelFamily, crate::error::ModelError> {
    // Handle ARN format
    let effective_id = if model_id.starts_with("arn:") {
        // For ARN format, we need to check the model-id portion
        // Format: arn:aws:bedrock:region:account:model/model-id
        model_id
            .split('/')
            .last()
            .unwrap_or(model_id)
    } else {
        model_id
    };

    let lower = effective_id.to_lowercase();

    if lower.starts_with("amazon.titan") || lower.contains("titan") {
        Ok(ModelFamily::Titan)
    } else if lower.starts_with("anthropic.claude") || lower.contains("claude") {
        Ok(ModelFamily::Claude)
    } else if lower.starts_with("meta.llama") || lower.contains("llama") {
        Ok(ModelFamily::Llama)
    } else {
        Err(crate::error::ModelError::UnknownFamily {
            model_id: model_id.to_string(),
        })
    }
}

/// Detect LLaMA version from model ID for prompt format selection.
pub fn detect_llama_version(model_id: &str) -> LlamaVersion {
    let lower = model_id.to_lowercase();

    if lower.contains("llama2") {
        LlamaVersion::V2
    } else if lower.contains("llama3-2") || lower.contains("llama3.2") {
        LlamaVersion::V3_2
    } else if lower.contains("llama3-1") || lower.contains("llama3.1") {
        LlamaVersion::V3_1
    } else if lower.contains("llama3") {
        LlamaVersion::V3
    } else {
        // Default to latest format for unknown versions
        tracing::warn!(
            model_id = %model_id,
            "Unknown LLaMA version in model_id, using v3 format"
        );
        LlamaVersion::V3
    }
}

/// Unified message format for conversations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    /// The role of the message sender.
    pub role: String,
    /// The content of the message.
    pub content: String,
}

impl Message {
    /// Create a user message.
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_string(),
            content: content.into(),
        }
    }

    /// Create an assistant message.
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".to_string(),
            content: content.into(),
        }
    }
}

/// Unified stop reason enumeration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    /// Model completed its response naturally.
    EndTurn,
    /// Maximum tokens reached.
    MaxTokens,
    /// Stop sequence encountered.
    StopSequence,
    /// Content was filtered.
    ContentFilter,
    /// Tool use requested.
    ToolUse,
}

impl StopReason {
    /// Normalize Titan completion reason to unified format.
    pub fn from_titan(reason: &str) -> Self {
        match reason.to_uppercase().as_str() {
            "FINISH" => StopReason::EndTurn,
            "LENGTH" => StopReason::MaxTokens,
            "STOP_SEQUENCE" => StopReason::StopSequence,
            "CONTENT_FILTERED" => StopReason::ContentFilter,
            _ => StopReason::EndTurn,
        }
    }

    /// Normalize Claude stop reason to unified format.
    pub fn from_claude(reason: &str) -> Self {
        match reason {
            "end_turn" => StopReason::EndTurn,
            "max_tokens" => StopReason::MaxTokens,
            "stop_sequence" => StopReason::StopSequence,
            "tool_use" => StopReason::ToolUse,
            _ => StopReason::EndTurn,
        }
    }

    /// Normalize LLaMA stop reason to unified format.
    pub fn from_llama(reason: &str) -> Self {
        match reason {
            "stop" => StopReason::EndTurn,
            "length" => StopReason::MaxTokens,
            _ => StopReason::EndTurn,
        }
    }
}

/// Token usage information.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UsageInfo {
    /// Number of input tokens.
    pub input_tokens: u32,
    /// Number of output tokens.
    pub output_tokens: u32,
    /// Total tokens (input + output).
    pub total_tokens: u32,
}

impl UsageInfo {
    /// Create new usage info.
    pub fn new(input_tokens: u32, output_tokens: u32) -> Self {
        Self {
            input_tokens,
            output_tokens,
            total_tokens: input_tokens + output_tokens,
        }
    }
}

/// Model capability information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCapabilities {
    /// Whether the model supports text generation.
    pub text_generation: bool,
    /// Whether the model supports embeddings.
    pub embeddings: bool,
    /// Whether the model supports image generation.
    pub image_generation: bool,
    /// Whether the model supports streaming.
    pub streaming: bool,
    /// Whether the model supports tool use.
    pub tool_use: bool,
    /// Maximum context window in tokens.
    pub max_context_tokens: u32,
    /// Maximum output tokens.
    pub max_output_tokens: u32,
    /// Embedding dimensions (if applicable).
    pub embedding_dimensions: Option<Vec<u32>>,
}

impl Default for ModelCapabilities {
    fn default() -> Self {
        Self {
            text_generation: true,
            embeddings: false,
            image_generation: false,
            streaming: true,
            tool_use: false,
            max_context_tokens: 4096,
            max_output_tokens: 4096,
            embedding_dimensions: None,
        }
    }
}

/// Model limits configuration.
#[derive(Debug, Clone)]
pub struct ModelLimits {
    /// Maximum output tokens for this model.
    pub max_output_tokens: u32,
    /// Default max tokens if not specified.
    pub default_max_tokens: u32,
    /// Maximum context window.
    pub max_context_tokens: u32,
    /// Maximum number of stop sequences.
    pub max_stop_sequences: usize,
}

/// Get model limits based on model ID.
pub fn get_model_limits(model_id: &str) -> ModelLimits {
    let lower = model_id.to_lowercase();

    // Titan limits
    if lower.contains("titan-text-express") {
        return ModelLimits {
            max_output_tokens: 8192,
            default_max_tokens: 512,
            max_context_tokens: 8192,
            max_stop_sequences: 4,
        };
    }
    if lower.contains("titan-text-lite") {
        return ModelLimits {
            max_output_tokens: 4096,
            default_max_tokens: 512,
            max_context_tokens: 4096,
            max_stop_sequences: 4,
        };
    }

    // Claude limits
    if lower.contains("claude-3") {
        return ModelLimits {
            max_output_tokens: 4096,
            default_max_tokens: 1024,
            max_context_tokens: 200_000,
            max_stop_sequences: 8192,
        };
    }
    if lower.contains("claude-2") || lower.contains("claude-instant") {
        return ModelLimits {
            max_output_tokens: 4096,
            default_max_tokens: 1024,
            max_context_tokens: 100_000,
            max_stop_sequences: 8192,
        };
    }

    // LLaMA limits
    if lower.contains("llama3-1") || lower.contains("llama3.1") {
        return ModelLimits {
            max_output_tokens: 2048,
            default_max_tokens: 512,
            max_context_tokens: 128_000,
            max_stop_sequences: 0, // LLaMA doesn't support stop sequences
        };
    }
    if lower.contains("llama3") {
        return ModelLimits {
            max_output_tokens: 2048,
            default_max_tokens: 512,
            max_context_tokens: 8192,
            max_stop_sequences: 0,
        };
    }
    if lower.contains("llama2") {
        return ModelLimits {
            max_output_tokens: 2048,
            default_max_tokens: 512,
            max_context_tokens: 4096,
            max_stop_sequences: 0,
        };
    }

    // Default limits
    ModelLimits {
        max_output_tokens: 4096,
        default_max_tokens: 512,
        max_context_tokens: 8192,
        max_stop_sequences: 4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_model_family_titan() {
        assert_eq!(
            detect_model_family("amazon.titan-text-express-v1").unwrap(),
            ModelFamily::Titan
        );
        assert_eq!(
            detect_model_family("amazon.titan-embed-text-v2:0").unwrap(),
            ModelFamily::Titan
        );
    }

    #[test]
    fn test_detect_model_family_claude() {
        assert_eq!(
            detect_model_family("anthropic.claude-3-sonnet-20240229-v1:0").unwrap(),
            ModelFamily::Claude
        );
        assert_eq!(
            detect_model_family("anthropic.claude-v2").unwrap(),
            ModelFamily::Claude
        );
    }

    #[test]
    fn test_detect_model_family_llama() {
        assert_eq!(
            detect_model_family("meta.llama3-70b-instruct-v1:0").unwrap(),
            ModelFamily::Llama
        );
        assert_eq!(
            detect_model_family("meta.llama2-13b-chat-v1").unwrap(),
            ModelFamily::Llama
        );
    }

    #[test]
    fn test_detect_model_family_arn() {
        assert_eq!(
            detect_model_family("arn:aws:bedrock:us-east-1:123456789012:provisioned-model/amazon.titan-text-express-v1").unwrap(),
            ModelFamily::Titan
        );
    }

    #[test]
    fn test_detect_model_family_unknown() {
        assert!(detect_model_family("unknown.model-v1").is_err());
    }

    #[test]
    fn test_detect_llama_version() {
        assert_eq!(detect_llama_version("meta.llama2-70b"), LlamaVersion::V2);
        assert_eq!(detect_llama_version("meta.llama3-70b"), LlamaVersion::V3);
        assert_eq!(detect_llama_version("meta.llama3-1-70b"), LlamaVersion::V3_1);
        assert_eq!(detect_llama_version("meta.llama3-2-90b"), LlamaVersion::V3_2);
    }

    #[test]
    fn test_stop_reason_normalization() {
        assert_eq!(StopReason::from_titan("FINISH"), StopReason::EndTurn);
        assert_eq!(StopReason::from_titan("LENGTH"), StopReason::MaxTokens);
        assert_eq!(StopReason::from_claude("end_turn"), StopReason::EndTurn);
        assert_eq!(StopReason::from_claude("max_tokens"), StopReason::MaxTokens);
        assert_eq!(StopReason::from_llama("stop"), StopReason::EndTurn);
        assert_eq!(StopReason::from_llama("length"), StopReason::MaxTokens);
    }

    #[test]
    fn test_usage_info() {
        let usage = UsageInfo::new(100, 50);
        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 50);
        assert_eq!(usage.total_tokens, 150);
    }
}
