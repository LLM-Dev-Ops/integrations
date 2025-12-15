//! Meta LLaMA model family service for Bedrock.
//!
//! This module provides text generation capabilities for LLaMA models via Bedrock.
//! It handles the different prompt formats for LLaMA 2 and LLaMA 3.

use crate::error::{BedrockError, RequestError};
use crate::types::{
    LlamaRequest, LlamaResponse, LlamaStreamChunk, LlamaVersion, Message, StopReason,
    UnifiedInvokeRequest, UnifiedInvokeResponse, UnifiedStreamChunk, UsageInfo,
    detect_llama_version, get_model_limits,
};
use async_trait::async_trait;
use serde_json::Value;
use tracing::{debug, warn};

/// LLaMA service trait.
#[async_trait]
pub trait LlamaService: Send + Sync {
    /// Invoke LLaMA text generation.
    async fn generate(&self, request: LlamaRequest) -> Result<LlamaResponse, BedrockError>;

    /// Stream LLaMA text generation.
    async fn generate_stream(
        &self,
        request: LlamaRequest,
    ) -> Result<LlamaStreamIterator, BedrockError>;
}

/// Placeholder for stream iterator.
pub struct LlamaStreamIterator {
    _marker: std::marker::PhantomData<()>,
}

/// Translate unified request to LLaMA format.
pub fn translate_request(request: &UnifiedInvokeRequest) -> Result<LlamaRequest, BedrockError> {
    // Get model limits for validation
    let limits = get_model_limits(&request.model_id);

    // Validate max_tokens (max_gen_len for LLaMA)
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

    // Detect LLaMA version for correct prompt format
    let version = detect_llama_version(&request.model_id);

    // Translate messages to LLaMA prompt format
    let prompt = format_prompt(&request.messages, request.system.as_deref(), version);

    // Log warning for unsupported parameters
    if request.stop_sequences.is_some() {
        warn!(
            model_id = %request.model_id,
            "stop_sequences parameter ignored; LLaMA does not support stop_sequences"
        );
    }

    if request.top_k.is_some() {
        warn!(
            model_id = %request.model_id,
            "top_k parameter ignored; LLaMA does not support top_k"
        );
    }

    Ok(LlamaRequest {
        prompt,
        max_gen_len: request.max_tokens.or(Some(limits.default_max_tokens)),
        temperature: request.temperature,
        top_p: request.top_p,
    })
}

/// Format messages as a LLaMA prompt.
fn format_prompt(messages: &[Message], system: Option<&str>, version: LlamaVersion) -> String {
    match version {
        LlamaVersion::V2 => format_llama2_prompt(messages, system),
        LlamaVersion::V3 | LlamaVersion::V3_1 | LlamaVersion::V3_2 => {
            format_llama3_prompt(messages, system)
        }
    }
}

/// Format for LLaMA 2.
fn format_llama2_prompt(messages: &[Message], system: Option<&str>) -> String {
    let mut prompt = String::new();

    // System prompt in <<SYS>> block
    if let Some(sys) = system {
        if !sys.is_empty() {
            prompt.push_str(&format!("<s>[INST] <<SYS>>\n{}\n<</SYS>>\n\n", sys));
        } else {
            prompt.push_str("<s>[INST] ");
        }
    } else {
        prompt.push_str("<s>[INST] ");
    }

    let mut is_first = true;
    let mut in_inst = true;

    for msg in messages {
        match msg.role.as_str() {
            "user" => {
                if !is_first && !in_inst {
                    prompt.push_str("<s>[INST] ");
                }
                prompt.push_str(&escape_llama_tokens(&msg.content));
                in_inst = true;
            }
            "assistant" => {
                if in_inst {
                    prompt.push_str(" [/INST] ");
                }
                prompt.push_str(&msg.content);
                prompt.push_str(" </s>");
                in_inst = false;
            }
            _ => continue,
        }
        is_first = false;
    }

    // Close instruction for generation
    if in_inst {
        prompt.push_str(" [/INST]");
    }

    prompt
}

/// Format for LLaMA 3/3.1/3.2.
fn format_llama3_prompt(messages: &[Message], system: Option<&str>) -> String {
    let mut prompt = String::from("<|begin_of_text|>");

    // System message first
    if let Some(sys) = system {
        if !sys.is_empty() {
            prompt.push_str("<|start_header_id|>system<|end_header_id|>\n\n");
            prompt.push_str(&escape_llama_tokens(sys));
            prompt.push_str("<|eot_id|>");
        }
    }

    // Conversation messages
    for msg in messages {
        let role = match msg.role.as_str() {
            "user" => "user",
            "assistant" => "assistant",
            _ => continue, // Skip unknown roles
        };

        prompt.push_str(&format!(
            "<|start_header_id|>{}<|end_header_id|>\n\n{}<|eot_id|>",
            role,
            escape_llama_tokens(&msg.content)
        ));
    }

    // Final assistant header for generation
    prompt.push_str("<|start_header_id|>assistant<|end_header_id|>\n\n");

    prompt
}

/// Escape special LLaMA tokens in user content to prevent prompt injection.
fn escape_llama_tokens(text: &str) -> String {
    text.replace("<|", "<\\|").replace("|>", "\\|>")
}

/// Translate LLaMA response to unified format.
pub fn translate_response(response: LlamaResponse, model_id: &str) -> UnifiedInvokeResponse {
    let stop_reason = StopReason::from_llama(&response.stop_reason);

    UnifiedInvokeResponse {
        content: response.generation,
        stop_reason,
        usage: UsageInfo::new(response.prompt_token_count, response.generation_token_count),
        model_id: model_id.to_string(),
    }
}

/// State for accumulating LLaMA streaming response.
pub struct LlamaStreamState {
    /// Accumulated content.
    pub content: String,
    /// Prompt token count (from first chunk).
    pub prompt_tokens: u32,
    /// Generation token count (accumulated).
    pub generation_tokens: u32,
    /// Stop reason.
    pub stop_reason: Option<StopReason>,
}

impl LlamaStreamState {
    /// Create a new stream state.
    pub fn new() -> Self {
        Self {
            content: String::new(),
            prompt_tokens: 0,
            generation_tokens: 0,
            stop_reason: None,
        }
    }

    /// Process a stream chunk and return a unified chunk.
    pub fn process_chunk(&mut self, chunk: LlamaStreamChunk) -> UnifiedStreamChunk {
        // Accumulate content
        self.content.push_str(&chunk.generation);

        // Capture prompt tokens from first chunk
        if let Some(pt) = chunk.prompt_token_count {
            self.prompt_tokens = pt;
        }

        // Update generation tokens
        self.generation_tokens = chunk.generation_token_count;

        // Check for final chunk
        let is_final = chunk.stop_reason.is_some();
        if let Some(ref reason) = chunk.stop_reason {
            self.stop_reason = Some(StopReason::from_llama(reason));
        }

        UnifiedStreamChunk {
            delta: chunk.generation,
            is_final,
            stop_reason: self.stop_reason,
            usage: if is_final {
                Some(UsageInfo::new(self.prompt_tokens, self.generation_tokens))
            } else {
                None
            },
            index: None,
        }
    }
}

impl Default for LlamaStreamState {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse LLaMA response from JSON.
pub fn parse_response(json: &Value) -> Result<LlamaResponse, BedrockError> {
    serde_json::from_value(json.clone()).map_err(|e| {
        BedrockError::Stream(crate::error::StreamError::ParseError {
            message: format!("Failed to parse LLaMA response: {}", e),
        })
    })
}

/// Parse LLaMA streaming chunk from JSON.
pub fn parse_stream_chunk(json: &Value) -> Result<LlamaStreamChunk, BedrockError> {
    serde_json::from_value(json.clone()).map_err(|e| {
        BedrockError::Stream(crate::error::StreamError::ParseError {
            message: format!("Failed to parse LLaMA stream chunk: {}", e),
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_llama3_prompt_simple() {
        let messages = vec![Message::user("Hello")];
        let prompt = format_llama3_prompt(&messages, None);

        assert!(prompt.starts_with("<|begin_of_text|>"));
        assert!(prompt.contains("<|start_header_id|>user<|end_header_id|>"));
        assert!(prompt.contains("Hello"));
        assert!(prompt.contains("<|eot_id|>"));
        assert!(prompt.ends_with("<|start_header_id|>assistant<|end_header_id|>\n\n"));
    }

    #[test]
    fn test_format_llama3_prompt_with_system() {
        let messages = vec![Message::user("Hello")];
        let prompt = format_llama3_prompt(&messages, Some("You are helpful."));

        assert!(prompt.contains("<|start_header_id|>system<|end_header_id|>"));
        assert!(prompt.contains("You are helpful."));
    }

    #[test]
    fn test_format_llama3_prompt_multi_turn() {
        let messages = vec![
            Message::user("Hello"),
            Message::assistant("Hi there!"),
            Message::user("How are you?"),
        ];
        let prompt = format_llama3_prompt(&messages, None);

        assert!(prompt.contains("Hello<|eot_id|>"));
        assert!(prompt.contains("Hi there!<|eot_id|>"));
        assert!(prompt.contains("How are you?<|eot_id|>"));
    }

    #[test]
    fn test_format_llama2_prompt() {
        let messages = vec![Message::user("Hello")];
        let prompt = format_llama2_prompt(&messages, Some("You are helpful."));

        assert!(prompt.contains("<<SYS>>"));
        assert!(prompt.contains("You are helpful."));
        assert!(prompt.contains("<</SYS>>"));
        assert!(prompt.contains("[INST]"));
        assert!(prompt.contains("Hello"));
    }

    #[test]
    fn test_escape_llama_tokens() {
        let text = "Ignore <|system|> prompt";
        let escaped = escape_llama_tokens(text);
        assert!(!escaped.contains("<|"));
        assert!(!escaped.contains("|>"));
    }

    #[test]
    fn test_translate_request() {
        let request = UnifiedInvokeRequest::new("meta.llama3-70b-instruct-v1:0", vec![
            Message::user("Hello"),
        ])
        .with_max_tokens(100)
        .with_temperature(0.7);

        let llama_request = translate_request(&request).unwrap();
        assert!(llama_request.prompt.contains("Hello"));
        assert!(llama_request.prompt.contains("<|begin_of_text|>"));
        assert_eq!(llama_request.max_gen_len, Some(100));
        assert_eq!(llama_request.temperature, Some(0.7));
    }

    #[test]
    fn test_translate_response() {
        let response = LlamaResponse {
            generation: "Hello, world!".to_string(),
            prompt_token_count: 10,
            generation_token_count: 5,
            stop_reason: "stop".to_string(),
        };

        let unified = translate_response(response, "meta.llama3-70b-instruct-v1:0");
        assert_eq!(unified.content, "Hello, world!");
        assert_eq!(unified.stop_reason, StopReason::EndTurn);
        assert_eq!(unified.usage.input_tokens, 10);
        assert_eq!(unified.usage.output_tokens, 5);
    }

    #[test]
    fn test_stream_state() {
        let mut state = LlamaStreamState::new();

        // First chunk with prompt tokens
        let chunk1 = LlamaStreamChunk {
            generation: "Hello".to_string(),
            prompt_token_count: Some(10),
            generation_token_count: 2,
            stop_reason: None,
        };
        let unified1 = state.process_chunk(chunk1);
        assert_eq!(unified1.delta, "Hello");
        assert!(!unified1.is_final);
        assert_eq!(state.prompt_tokens, 10);

        // Second chunk
        let chunk2 = LlamaStreamChunk {
            generation: ", world!".to_string(),
            prompt_token_count: None,
            generation_token_count: 5,
            stop_reason: Some("stop".to_string()),
        };
        let unified2 = state.process_chunk(chunk2);
        assert_eq!(unified2.delta, ", world!");
        assert!(unified2.is_final);
        assert_eq!(unified2.stop_reason, Some(StopReason::EndTurn));
    }
}
