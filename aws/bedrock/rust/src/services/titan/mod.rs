//! Amazon Titan model family service.
//!
//! This module provides text generation and embedding capabilities for Titan models.

use crate::error::{BedrockError, RequestError};
use crate::streaming::EventStreamParser;
use crate::types::{
    Message, StopReason, TitanEmbedRequest, TitanEmbedResponse, TitanStreamChunk,
    TitanTextConfig, TitanTextRequest, TitanTextResponse, UnifiedInvokeRequest,
    UnifiedInvokeResponse, UnifiedStreamChunk, UsageInfo, get_model_limits,
};
use async_trait::async_trait;
use serde_json::Value;
use tracing::{debug, warn};

/// Titan service trait.
#[async_trait]
pub trait TitanService: Send + Sync {
    /// Invoke Titan text generation.
    async fn generate(&self, request: TitanTextRequest) -> Result<TitanTextResponse, BedrockError>;

    /// Stream Titan text generation.
    async fn generate_stream(
        &self,
        request: TitanTextRequest,
    ) -> Result<TitanStreamIterator, BedrockError>;

    /// Generate embeddings.
    async fn embed(&self, request: TitanEmbedRequest) -> Result<TitanEmbedResponse, BedrockError>;

    /// Batch embed multiple texts.
    async fn batch_embed(
        &self,
        texts: Vec<String>,
        dimensions: Option<u32>,
        normalize: Option<bool>,
    ) -> Result<Vec<TitanEmbedResponse>, BedrockError>;
}

/// Placeholder for stream iterator.
pub struct TitanStreamIterator {
    _marker: std::marker::PhantomData<()>,
}

/// Translate unified request to Titan format.
pub fn translate_request(request: &UnifiedInvokeRequest) -> Result<TitanTextRequest, BedrockError> {
    // Get model limits for validation
    let limits = get_model_limits(&request.model_id);

    // Validate max_tokens
    if let Some(max_tokens) = request.max_tokens {
        if max_tokens > limits.max_output_tokens {
            return Err(BedrockError::Request(RequestError::InvalidParameter {
                parameter: "max_tokens".to_string(),
                message: format!(
                    "max_tokens {} exceeds limit {} for model {}",
                    max_tokens, limits.max_output_tokens, request.model_id
                ),
            }));
        }
    }

    // Translate messages to Titan's inputText format
    let input_text = translate_messages(&request.messages, request.system.as_deref());

    // Translate stop sequences (Titan supports max 4)
    let stop_sequences = if let Some(sequences) = &request.stop_sequences {
        if sequences.len() > limits.max_stop_sequences {
            warn!(
                model_id = %request.model_id,
                max = limits.max_stop_sequences,
                provided = sequences.len(),
                "Titan supports max {} stop sequences; truncating", limits.max_stop_sequences
            );
        }
        Some(sequences.iter().take(limits.max_stop_sequences).cloned().collect())
    } else {
        None
    };

    // Log warning for unsupported parameters
    if request.top_k.is_some() {
        warn!(
            model_id = %request.model_id,
            "top_k parameter ignored; Titan does not support top_k"
        );
    }

    Ok(TitanTextRequest {
        input_text,
        text_generation_config: TitanTextConfig {
            max_token_count: request.max_tokens.or(Some(limits.default_max_tokens)),
            temperature: request.temperature,
            top_p: request.top_p,
            stop_sequences,
        },
    })
}

/// Translate messages to Titan's text format.
fn translate_messages(messages: &[Message], system: Option<&str>) -> String {
    let mut result = String::new();

    // Prepend system message if present
    if let Some(sys) = system {
        if !sys.is_empty() {
            result.push_str(sys);
            result.push_str("\n\n");
        }
    }

    // Convert messages to "User: ... Bot: ..." format
    for msg in messages {
        let role_label = match msg.role.as_str() {
            "user" => "User",
            "assistant" => "Bot",
            _ => continue, // Skip unknown roles
        };
        result.push_str(&format!("{}: {}\n", role_label, msg.content));
    }

    // Append final Bot: to prompt generation
    result.push_str("Bot:");

    result
}

/// Translate Titan response to unified format.
pub fn translate_response(
    response: TitanTextResponse,
    model_id: &str,
    input_tokens: u32,
) -> UnifiedInvokeResponse {
    let result = response.results.first();

    let content = result
        .map(|r| r.output_text.clone())
        .unwrap_or_default();

    let stop_reason = result
        .and_then(|r| r.completion_reason.as_ref())
        .map(|r| StopReason::from_titan(r))
        .unwrap_or(StopReason::EndTurn);

    let output_tokens = result.map(|r| r.token_count).unwrap_or(0);

    UnifiedInvokeResponse {
        content,
        stop_reason,
        usage: UsageInfo::new(input_tokens, output_tokens),
        model_id: model_id.to_string(),
    }
}

/// Translate Titan streaming chunk to unified format.
pub fn translate_stream_chunk(chunk: TitanStreamChunk) -> UnifiedStreamChunk {
    let is_final = chunk.completion_reason.is_some();
    let stop_reason = chunk.completion_reason.as_ref().map(|r| StopReason::from_titan(r));

    UnifiedStreamChunk {
        delta: chunk.output_text,
        is_final,
        stop_reason,
        usage: if is_final {
            chunk.total_output_text_token_count.map(|out| UsageInfo::new(0, out))
        } else {
            None
        },
        index: Some(chunk.index),
    }
}

/// Parse Titan response from JSON.
pub fn parse_response(json: &Value) -> Result<TitanTextResponse, BedrockError> {
    serde_json::from_value(json.clone()).map_err(|e| {
        BedrockError::Stream(crate::error::StreamError::ParseError {
            message: format!("Failed to parse Titan response: {}", e),
        })
    })
}

/// Parse Titan streaming chunk from JSON.
pub fn parse_stream_chunk(json: &Value) -> Result<TitanStreamChunk, BedrockError> {
    serde_json::from_value(json.clone()).map_err(|e| {
        BedrockError::Stream(crate::error::StreamError::ParseError {
            message: format!("Failed to parse Titan stream chunk: {}", e),
        })
    })
}

/// Parse Titan embedding response from JSON.
pub fn parse_embed_response(json: &Value) -> Result<TitanEmbedResponse, BedrockError> {
    serde_json::from_value(json.clone()).map_err(|e| {
        BedrockError::Stream(crate::error::StreamError::ParseError {
            message: format!("Failed to parse Titan embedding response: {}", e),
        })
    })
}

/// Validate embedding request.
pub fn validate_embed_request(request: &TitanEmbedRequest) -> Result<(), BedrockError> {
    if request.input_text.is_empty() {
        return Err(BedrockError::Request(RequestError::Validation {
            message: "input_text cannot be empty".to_string(),
            request_id: None,
        }));
    }

    // Rough character limit check (Titan v2 max is ~8192 tokens)
    if request.input_text.len() > 32000 {
        return Err(BedrockError::Request(RequestError::Validation {
            message: "input_text exceeds maximum length".to_string(),
            request_id: None,
        }));
    }

    // Validate dimensions for v2
    if let Some(dims) = request.dimensions {
        if !matches!(dims, 256 | 384 | 512 | 1024) {
            return Err(BedrockError::Request(RequestError::InvalidParameter {
                parameter: "dimensions".to_string(),
                message: "dimensions must be 256, 384, 512, or 1024".to_string(),
            }));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_translate_messages() {
        let messages = vec![
            Message::user("Hello"),
            Message::assistant("Hi there!"),
            Message::user("How are you?"),
        ];

        let result = translate_messages(&messages, None);
        assert!(result.contains("User: Hello"));
        assert!(result.contains("Bot: Hi there!"));
        assert!(result.contains("User: How are you?"));
        assert!(result.ends_with("Bot:"));
    }

    #[test]
    fn test_translate_messages_with_system() {
        let messages = vec![Message::user("Hello")];
        let result = translate_messages(&messages, Some("You are helpful."));
        assert!(result.starts_with("You are helpful."));
        assert!(result.contains("User: Hello"));
    }

    #[test]
    fn test_translate_request() {
        let request = UnifiedInvokeRequest::new(
            "amazon.titan-text-express-v1",
            vec![Message::user("Hello")],
        )
        .with_max_tokens(100)
        .with_temperature(0.7);

        let titan_request = translate_request(&request).unwrap();
        assert!(titan_request.input_text.contains("User: Hello"));
        assert_eq!(titan_request.text_generation_config.max_token_count, Some(100));
        assert_eq!(titan_request.text_generation_config.temperature, Some(0.7));
    }

    #[test]
    fn test_translate_response() {
        let response = TitanTextResponse {
            results: vec![crate::types::TitanTextResult {
                output_text: "Hello, world!".to_string(),
                token_count: 5,
                completion_reason: Some("FINISH".to_string()),
            }],
        };

        let unified = translate_response(response, "amazon.titan-text-express-v1", 10);
        assert_eq!(unified.content, "Hello, world!");
        assert_eq!(unified.stop_reason, StopReason::EndTurn);
        assert_eq!(unified.usage.input_tokens, 10);
        assert_eq!(unified.usage.output_tokens, 5);
    }

    #[test]
    fn test_validate_embed_request_empty() {
        let request = TitanEmbedRequest::new("");
        assert!(validate_embed_request(&request).is_err());
    }

    #[test]
    fn test_validate_embed_request_invalid_dims() {
        let request = TitanEmbedRequest::new("test").with_dimensions(999);
        assert!(validate_embed_request(&request).is_err());
    }

    #[test]
    fn test_validate_embed_request_valid_dims() {
        for dims in [256, 384, 512, 1024] {
            let request = TitanEmbedRequest::new("test").with_dimensions(dims);
            assert!(validate_embed_request(&request).is_ok());
        }
    }
}
