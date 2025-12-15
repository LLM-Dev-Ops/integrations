//! Anthropic Claude model family service for Bedrock.
//!
//! This module provides text generation capabilities for Claude models via Bedrock.

use crate::error::{BedrockError, RequestError};
use crate::types::{
    ClaudeContentBlock, ClaudeMessage, ClaudeRequest, ClaudeResponse, ClaudeStreamEvent,
    ClaudeUsage, Message, StopReason, UnifiedInvokeRequest, UnifiedInvokeResponse,
    UnifiedStreamChunk, UsageInfo, get_model_limits,
};
use async_trait::async_trait;
use serde_json::Value;
use tracing::{debug, warn};

/// Claude service trait.
#[async_trait]
pub trait ClaudeService: Send + Sync {
    /// Invoke Claude text generation.
    async fn generate(&self, request: ClaudeRequest) -> Result<ClaudeResponse, BedrockError>;

    /// Stream Claude text generation.
    async fn generate_stream(
        &self,
        request: ClaudeRequest,
    ) -> Result<ClaudeStreamIterator, BedrockError>;
}

/// Placeholder for stream iterator.
pub struct ClaudeStreamIterator {
    _marker: std::marker::PhantomData<()>,
}

/// Anthropic API version for Bedrock.
const ANTHROPIC_VERSION: &str = "bedrock-2023-05-31";

/// Translate unified request to Claude format.
pub fn translate_request(request: &UnifiedInvokeRequest) -> Result<ClaudeRequest, BedrockError> {
    // Get model limits for validation
    let limits = get_model_limits(&request.model_id);

    // Validate max_tokens
    let max_tokens = request.max_tokens.unwrap_or(limits.default_max_tokens);
    if max_tokens > limits.max_output_tokens {
        return Err(BedrockError::Request(RequestError::InvalidParameter {
            parameter: "max_tokens".to_string(),
            message: format!(
                "max_tokens {} exceeds limit {} for model {}",
                max_tokens, limits.max_output_tokens, request.model_id
            ),
        }));
    }

    // Translate messages to Claude format
    let messages: Vec<ClaudeMessage> = request
        .messages
        .iter()
        .map(|m| ClaudeMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    // Handle empty system message
    let system = request
        .system
        .as_ref()
        .filter(|s| !s.is_empty())
        .cloned();

    Ok(ClaudeRequest {
        anthropic_version: ANTHROPIC_VERSION.to_string(),
        max_tokens,
        messages,
        system,
        temperature: request.temperature,
        top_p: request.top_p,
        top_k: request.top_k,
        stop_sequences: request.stop_sequences.clone(),
    })
}

/// Translate Claude response to unified format.
pub fn translate_response(
    response: ClaudeResponse,
    model_id: &str,
) -> UnifiedInvokeResponse {
    // Extract text content from content blocks
    let content = response
        .content
        .iter()
        .filter_map(|block| match block {
            ClaudeContentBlock::Text { text } => Some(text.clone()),
        })
        .collect::<Vec<_>>()
        .join("");

    let stop_reason = StopReason::from_claude(&response.stop_reason);

    UnifiedInvokeResponse {
        content,
        stop_reason,
        usage: UsageInfo::new(response.usage.input_tokens, response.usage.output_tokens),
        model_id: model_id.to_string(),
    }
}

/// State for accumulating Claude streaming response.
pub struct ClaudeStreamState {
    /// Message ID.
    pub message_id: Option<String>,
    /// Current content blocks being built.
    pub content_blocks: Vec<String>,
    /// Input tokens (from message_start).
    pub input_tokens: u32,
    /// Output tokens (accumulated).
    pub output_tokens: u32,
    /// Stop reason.
    pub stop_reason: Option<StopReason>,
}

impl ClaudeStreamState {
    /// Create a new stream state.
    pub fn new() -> Self {
        Self {
            message_id: None,
            content_blocks: Vec::new(),
            input_tokens: 0,
            output_tokens: 0,
            stop_reason: None,
        }
    }

    /// Process a stream event and return a unified chunk if applicable.
    pub fn process_event(&mut self, event: ClaudeStreamEvent) -> Option<UnifiedStreamChunk> {
        match event {
            ClaudeStreamEvent::MessageStart { message } => {
                self.message_id = Some(message.id);
                None
            }
            ClaudeStreamEvent::ContentBlockStart { index, content_block } => {
                // Ensure we have enough content blocks
                while self.content_blocks.len() <= index {
                    self.content_blocks.push(String::new());
                }
                // Initialize with any initial content
                if let ClaudeContentBlock::Text { text } = content_block {
                    self.content_blocks[index] = text;
                }
                None
            }
            ClaudeStreamEvent::ContentBlockDelta { index, delta } => {
                // Ensure we have enough content blocks
                while self.content_blocks.len() <= index {
                    self.content_blocks.push(String::new());
                }
                // Append delta
                self.content_blocks[index].push_str(&delta.text);

                Some(UnifiedStreamChunk {
                    delta: delta.text,
                    is_final: false,
                    stop_reason: None,
                    usage: None,
                    index: Some(index),
                })
            }
            ClaudeStreamEvent::ContentBlockStop { index: _ } => {
                // Content block complete, but stream continues
                None
            }
            ClaudeStreamEvent::MessageDelta { delta, usage } => {
                self.stop_reason = Some(StopReason::from_claude(&delta.stop_reason));
                self.output_tokens = usage.output_tokens;
                None
            }
            ClaudeStreamEvent::MessageStop => {
                Some(UnifiedStreamChunk {
                    delta: String::new(),
                    is_final: true,
                    stop_reason: self.stop_reason,
                    usage: Some(UsageInfo::new(self.input_tokens, self.output_tokens)),
                    index: None,
                })
            }
        }
    }
}

impl Default for ClaudeStreamState {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse Claude response from JSON.
pub fn parse_response(json: &Value) -> Result<ClaudeResponse, BedrockError> {
    serde_json::from_value(json.clone()).map_err(|e| {
        BedrockError::Stream(crate::error::StreamError::ParseError {
            message: format!("Failed to parse Claude response: {}", e),
        })
    })
}

/// Parse Claude streaming event from JSON.
pub fn parse_stream_event(json: &Value) -> Result<ClaudeStreamEvent, BedrockError> {
    serde_json::from_value(json.clone()).map_err(|e| {
        BedrockError::Stream(crate::error::StreamError::ParseError {
            message: format!("Failed to parse Claude stream event: {}", e),
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_translate_request() {
        let request = UnifiedInvokeRequest::new(
            "anthropic.claude-3-sonnet-20240229-v1:0",
            vec![Message::user("Hello")],
        )
        .with_system("You are helpful.")
        .with_max_tokens(1000)
        .with_temperature(0.7)
        .with_top_k(50);

        let claude_request = translate_request(&request).unwrap();
        assert_eq!(claude_request.anthropic_version, ANTHROPIC_VERSION);
        assert_eq!(claude_request.max_tokens, 1000);
        assert_eq!(claude_request.messages.len(), 1);
        assert_eq!(claude_request.system, Some("You are helpful.".to_string()));
        assert_eq!(claude_request.temperature, Some(0.7));
        assert_eq!(claude_request.top_k, Some(50));
    }

    #[test]
    fn test_translate_request_empty_system() {
        let request = UnifiedInvokeRequest::new(
            "anthropic.claude-3-sonnet-20240229-v1:0",
            vec![Message::user("Hello")],
        )
        .with_system("");

        let claude_request = translate_request(&request).unwrap();
        assert!(claude_request.system.is_none());
    }

    #[test]
    fn test_translate_response() {
        let response = ClaudeResponse {
            id: "msg_123".to_string(),
            response_type: "message".to_string(),
            role: "assistant".to_string(),
            content: vec![ClaudeContentBlock::Text {
                text: "Hello, world!".to_string(),
            }],
            model: "claude-3-sonnet-20240229".to_string(),
            stop_reason: "end_turn".to_string(),
            stop_sequence: None,
            usage: ClaudeUsage {
                input_tokens: 10,
                output_tokens: 5,
            },
        };

        let unified = translate_response(response, "anthropic.claude-3-sonnet-20240229-v1:0");
        assert_eq!(unified.content, "Hello, world!");
        assert_eq!(unified.stop_reason, StopReason::EndTurn);
        assert_eq!(unified.usage.input_tokens, 10);
        assert_eq!(unified.usage.output_tokens, 5);
    }

    #[test]
    fn test_stream_state() {
        let mut state = ClaudeStreamState::new();

        // Process message start
        let event = ClaudeStreamEvent::MessageStart {
            message: crate::types::ClaudeMessageStart {
                id: "msg_123".to_string(),
                role: "assistant".to_string(),
                model: "claude-3".to_string(),
            },
        };
        assert!(state.process_event(event).is_none());

        // Process content block start
        let event = ClaudeStreamEvent::ContentBlockStart {
            index: 0,
            content_block: ClaudeContentBlock::Text {
                text: String::new(),
            },
        };
        assert!(state.process_event(event).is_none());

        // Process content delta
        let event = ClaudeStreamEvent::ContentBlockDelta {
            index: 0,
            delta: crate::types::ClaudeTextDelta {
                delta_type: "text_delta".to_string(),
                text: "Hello".to_string(),
            },
        };
        let chunk = state.process_event(event).unwrap();
        assert_eq!(chunk.delta, "Hello");
        assert!(!chunk.is_final);

        // Process message stop
        let event = ClaudeStreamEvent::MessageStop;
        let chunk = state.process_event(event).unwrap();
        assert!(chunk.is_final);
    }
}
