//! Chat completion types.

use serde::{Deserialize, Serialize};

use super::common::GroqMetadata;
use super::tools::{ToolCall, ToolCallDelta, ToolChoice, Tool};
use crate::errors::GroqError;

/// Chat completion request.
#[derive(Debug, Clone, Serialize)]
pub struct ChatRequest {
    /// Model ID (required).
    pub model: String,

    /// Messages array (required).
    pub messages: Vec<Message>,

    /// Temperature (0.0-2.0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,

    /// Max completion tokens.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,

    /// Top P sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,

    /// Stop sequences.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,

    /// Frequency penalty (-2.0 to 2.0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,

    /// Presence penalty (-2.0 to 2.0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,

    /// Response format.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<ResponseFormat>,

    /// Seed for reproducibility.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,

    /// Tools/functions.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,

    /// Tool choice.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,

    /// End user ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,

    /// Enable streaming.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,

    /// Stream options.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<StreamOptions>,
}

impl ChatRequest {
    /// Creates a new request with model and messages.
    pub fn new(model: impl Into<String>, messages: Vec<Message>) -> Self {
        Self {
            model: model.into(),
            messages,
            temperature: None,
            max_tokens: None,
            top_p: None,
            stop: None,
            frequency_penalty: None,
            presence_penalty: None,
            response_format: None,
            seed: None,
            tools: None,
            tool_choice: None,
            user: None,
            stream: None,
            stream_options: None,
        }
    }

    /// Creates a new request builder.
    pub fn builder() -> ChatRequestBuilder {
        ChatRequestBuilder::new()
    }

    /// Validates the request.
    pub fn validate(&self) -> Result<(), GroqError> {
        if self.model.is_empty() {
            return Err(GroqError::validation_param(
                "Model is required",
                "model",
                None,
            ));
        }

        if self.messages.is_empty() {
            return Err(GroqError::validation_param(
                "At least one message is required",
                "messages",
                None,
            ));
        }

        if let Some(temp) = self.temperature {
            if !(0.0..=2.0).contains(&temp) {
                return Err(GroqError::validation_param(
                    "Temperature must be between 0.0 and 2.0",
                    "temperature",
                    Some(temp.to_string()),
                ));
            }
        }

        if let Some(top_p) = self.top_p {
            if !(0.0..=1.0).contains(&top_p) {
                return Err(GroqError::validation_param(
                    "top_p must be between 0.0 and 1.0",
                    "top_p",
                    Some(top_p.to_string()),
                ));
            }
        }

        if let Some(fp) = self.frequency_penalty {
            if !(-2.0..=2.0).contains(&fp) {
                return Err(GroqError::validation_param(
                    "frequency_penalty must be between -2.0 and 2.0",
                    "frequency_penalty",
                    Some(fp.to_string()),
                ));
            }
        }

        if let Some(pp) = self.presence_penalty {
            if !(-2.0..=2.0).contains(&pp) {
                return Err(GroqError::validation_param(
                    "presence_penalty must be between -2.0 and 2.0",
                    "presence_penalty",
                    Some(pp.to_string()),
                ));
            }
        }

        // Validate messages
        for (i, msg) in self.messages.iter().enumerate() {
            if let Err(e) = msg.validate() {
                return Err(GroqError::validation_param(
                    format!("Message {}: {}", i, e),
                    format!("messages[{}]", i),
                    None,
                ));
            }
        }

        // Validate tools if present
        if let Some(ref tools) = self.tools {
            for (i, tool) in tools.iter().enumerate() {
                if let Err(e) = tool.validate() {
                    return Err(GroqError::validation_param(
                        format!("Tool {}: {}", i, e),
                        format!("tools[{}]", i),
                        None,
                    ));
                }
            }
        }

        Ok(())
    }
}

/// Chat request builder.
#[derive(Debug, Default)]
pub struct ChatRequestBuilder {
    model: Option<String>,
    messages: Vec<Message>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    top_p: Option<f32>,
    stop: Option<Vec<String>>,
    frequency_penalty: Option<f32>,
    presence_penalty: Option<f32>,
    response_format: Option<ResponseFormat>,
    seed: Option<i64>,
    tools: Option<Vec<Tool>>,
    tool_choice: Option<ToolChoice>,
    user: Option<String>,
    stream: Option<bool>,
    stream_options: Option<StreamOptions>,
}

impl ChatRequestBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the model.
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    /// Sets all messages.
    pub fn messages(mut self, messages: Vec<Message>) -> Self {
        self.messages = messages;
        self
    }

    /// Adds a message.
    pub fn message(mut self, message: Message) -> Self {
        self.messages.push(message);
        self
    }

    /// Adds a system message.
    pub fn system(mut self, content: impl Into<String>) -> Self {
        self.messages.push(Message::system(content));
        self
    }

    /// Adds a user message.
    pub fn user(mut self, content: impl Into<String>) -> Self {
        self.messages.push(Message::user(content));
        self
    }

    /// Adds an assistant message.
    pub fn assistant(mut self, content: impl Into<String>) -> Self {
        self.messages.push(Message::assistant(content));
        self
    }

    /// Sets the temperature.
    pub fn temperature(mut self, temp: f32) -> Self {
        self.temperature = Some(temp);
        self
    }

    /// Sets the max tokens.
    pub fn max_tokens(mut self, tokens: u32) -> Self {
        self.max_tokens = Some(tokens);
        self
    }

    /// Sets top_p.
    pub fn top_p(mut self, top_p: f32) -> Self {
        self.top_p = Some(top_p);
        self
    }

    /// Sets stop sequences.
    pub fn stop(mut self, sequences: Vec<String>) -> Self {
        self.stop = Some(sequences);
        self
    }

    /// Sets frequency penalty.
    pub fn frequency_penalty(mut self, penalty: f32) -> Self {
        self.frequency_penalty = Some(penalty);
        self
    }

    /// Sets presence penalty.
    pub fn presence_penalty(mut self, penalty: f32) -> Self {
        self.presence_penalty = Some(penalty);
        self
    }

    /// Enables JSON mode.
    pub fn json_mode(mut self) -> Self {
        self.response_format = Some(ResponseFormat {
            type_: ResponseFormatType::JsonObject,
        });
        self
    }

    /// Sets the seed.
    pub fn seed(mut self, seed: i64) -> Self {
        self.seed = Some(seed);
        self
    }

    /// Sets all tools.
    pub fn tools(mut self, tools: Vec<Tool>) -> Self {
        self.tools = Some(tools);
        self
    }

    /// Adds a tool.
    pub fn tool(mut self, tool: Tool) -> Self {
        self.tools.get_or_insert_with(Vec::new).push(tool);
        self
    }

    /// Sets tool choice.
    pub fn tool_choice(mut self, choice: ToolChoice) -> Self {
        self.tool_choice = Some(choice);
        self
    }

    /// Sets the user ID.
    pub fn user_id(mut self, user: impl Into<String>) -> Self {
        self.user = Some(user.into());
        self
    }

    /// Enables streaming.
    pub fn stream(mut self, stream: bool) -> Self {
        self.stream = Some(stream);
        self
    }

    /// Includes usage in stream chunks.
    pub fn include_usage(mut self) -> Self {
        self.stream_options = Some(StreamOptions {
            include_usage: Some(true),
        });
        self
    }

    /// Builds the request.
    pub fn build(self) -> Result<ChatRequest, GroqError> {
        let model = self.model.ok_or_else(|| {
            GroqError::validation_param("Model is required", "model", None)
        })?;

        if self.messages.is_empty() {
            return Err(GroqError::validation_param(
                "At least one message is required",
                "messages",
                None,
            ));
        }

        let request = ChatRequest {
            model,
            messages: self.messages,
            temperature: self.temperature,
            max_tokens: self.max_tokens,
            top_p: self.top_p,
            stop: self.stop,
            frequency_penalty: self.frequency_penalty,
            presence_penalty: self.presence_penalty,
            response_format: self.response_format,
            seed: self.seed,
            tools: self.tools,
            tool_choice: self.tool_choice,
            user: self.user,
            stream: self.stream,
            stream_options: self.stream_options,
        };

        request.validate()?;
        Ok(request)
    }
}

/// Chat message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    /// Message role.
    pub role: Role,

    /// Message content.
    pub content: Content,

    /// Participant name (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Tool calls (for assistant messages).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,

    /// Tool call ID (for tool messages).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl Message {
    /// Creates a system message.
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: Role::System,
            content: Content::Text(content.into()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Creates a user message.
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: Content::Text(content.into()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Creates a user message with image.
    pub fn user_with_image(text: impl Into<String>, image_url: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: Content::Parts(vec![
                ContentPart::Text { text: text.into() },
                ContentPart::ImageUrl {
                    image_url: ImageUrl {
                        url: image_url.into(),
                        detail: None,
                    },
                },
            ]),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Creates an assistant message.
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: Role::Assistant,
            content: Content::Text(content.into()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Creates an assistant message with tool calls.
    pub fn assistant_with_tools(tool_calls: Vec<ToolCall>) -> Self {
        Self {
            role: Role::Assistant,
            content: Content::Text(String::new()),
            name: None,
            tool_calls: Some(tool_calls),
            tool_call_id: None,
        }
    }

    /// Creates a tool result message.
    pub fn tool(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: Role::Tool,
            content: Content::Text(content.into()),
            name: None,
            tool_calls: None,
            tool_call_id: Some(tool_call_id.into()),
        }
    }

    /// Validates the message.
    pub fn validate(&self) -> Result<(), String> {
        // Tool messages require tool_call_id
        if self.role == Role::Tool && self.tool_call_id.is_none() {
            return Err("Tool messages require tool_call_id".to_string());
        }

        // Validate content
        match &self.content {
            Content::Text(text) => {
                // Empty text is allowed for assistant with tool_calls
                if text.is_empty() && self.tool_calls.is_none() && self.role != Role::Assistant {
                    return Err("Content cannot be empty".to_string());
                }
            }
            Content::Parts(parts) => {
                if parts.is_empty() {
                    return Err("Content parts cannot be empty".to_string());
                }
            }
        }

        Ok(())
    }
}

/// Message role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// System message.
    System,
    /// User message.
    User,
    /// Assistant message.
    Assistant,
    /// Tool result message.
    Tool,
}

/// Message content.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Content {
    /// Text content.
    Text(String),
    /// Multipart content.
    Parts(Vec<ContentPart>),
}

/// Content part for multimodal messages.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    /// Text part.
    Text {
        /// Text content.
        text: String,
    },
    /// Image URL part.
    ImageUrl {
        /// Image URL.
        image_url: ImageUrl,
    },
}

/// Image URL for vision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageUrl {
    /// Image URL or base64 data URI.
    pub url: String,

    /// Image detail level.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<ImageDetail>,
}

/// Image detail level.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageDetail {
    /// Low detail.
    Low,
    /// High detail.
    High,
    /// Auto (model decides).
    Auto,
}

/// Response format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseFormat {
    /// Format type.
    #[serde(rename = "type")]
    pub type_: ResponseFormatType,
}

/// Response format type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResponseFormatType {
    /// Plain text.
    Text,
    /// JSON object.
    JsonObject,
}

/// Stream options.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamOptions {
    /// Include usage in final chunk.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_usage: Option<bool>,
}

/// Chat completion response.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatResponse {
    /// Response ID.
    pub id: String,

    /// Object type.
    pub object: String,

    /// Creation timestamp.
    pub created: i64,

    /// Model ID.
    pub model: String,

    /// Response choices.
    pub choices: Vec<Choice>,

    /// Token usage.
    pub usage: Usage,

    /// System fingerprint.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_fingerprint: Option<String>,

    /// Groq-specific metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x_groq: Option<GroqMetadata>,
}

impl ChatResponse {
    /// Gets the first choice content.
    pub fn content(&self) -> Option<&str> {
        self.choices.first().and_then(|c| c.message.content.as_deref())
    }

    /// Gets tool calls from the first choice.
    pub fn tool_calls(&self) -> Option<&Vec<ToolCall>> {
        self.choices.first().and_then(|c| c.message.tool_calls.as_ref())
    }

    /// Gets the finish reason from the first choice.
    pub fn finish_reason(&self) -> Option<FinishReason> {
        self.choices.first().map(|c| c.finish_reason)
    }

    /// Builds a response from streaming chunks.
    pub fn from_chunks(chunks: Vec<ChatChunk>) -> Result<Self, GroqError> {
        if chunks.is_empty() {
            return Err(GroqError::Stream {
                message: "No chunks received".to_string(),
                partial_content: None,
            });
        }

        let first = &chunks[0];
        let last = chunks.last().ok_or_else(|| GroqError::Stream {
            message: "No chunks received".to_string(),
            partial_content: None,
        })?;

        // Accumulate content
        let mut content = String::new();
        let mut tool_calls: Vec<ToolCall> = Vec::new();

        for chunk in &chunks {
            for choice in &chunk.choices {
                if let Some(c) = &choice.delta.content {
                    content.push_str(c);
                }
                if let Some(tc) = &choice.delta.tool_calls {
                    for tc_delta in tc {
                        merge_tool_call_delta(&mut tool_calls, tc_delta);
                    }
                }
            }
        }

        Ok(Self {
            id: first.id.clone(),
            object: "chat.completion".to_string(),
            created: first.created,
            model: first.model.clone(),
            choices: vec![Choice {
                index: 0,
                message: AssistantMessage {
                    role: Role::Assistant,
                    content: if content.is_empty() {
                        None
                    } else {
                        Some(content)
                    },
                    tool_calls: if tool_calls.is_empty() {
                        None
                    } else {
                        Some(tool_calls)
                    },
                },
                finish_reason: last
                    .choices
                    .first()
                    .and_then(|c| c.finish_reason)
                    .unwrap_or(FinishReason::Stop),
                logprobs: None,
            }],
            usage: last.usage.clone().unwrap_or_default(),
            system_fingerprint: last.system_fingerprint.clone(),
            x_groq: last.x_groq.clone(),
        })
    }
}

/// Merge a tool call delta into the accumulated tool calls.
fn merge_tool_call_delta(tool_calls: &mut Vec<ToolCall>, delta: &ToolCallDelta) {
    let index = delta.index as usize;

    // Ensure we have enough entries
    while tool_calls.len() <= index {
        tool_calls.push(ToolCall {
            id: String::new(),
            type_: "function".to_string(),
            function: super::tools::FunctionCall {
                name: String::new(),
                arguments: String::new(),
            },
        });
    }

    let tool_call = &mut tool_calls[index];

    if let Some(id) = &delta.id {
        tool_call.id = id.clone();
    }
    if let Some(type_) = &delta.type_ {
        tool_call.type_ = type_.clone();
    }
    if let Some(func) = &delta.function {
        if let Some(name) = &func.name {
            tool_call.function.name = name.clone();
        }
        if let Some(args) = &func.arguments {
            tool_call.function.arguments.push_str(args);
        }
    }
}

/// Response choice.
#[derive(Debug, Clone, Deserialize)]
pub struct Choice {
    /// Choice index.
    pub index: u32,

    /// Assistant message.
    pub message: AssistantMessage,

    /// Finish reason.
    pub finish_reason: FinishReason,

    /// Log probabilities.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logprobs: Option<serde_json::Value>,
}

/// Assistant message in response.
#[derive(Debug, Clone, Deserialize)]
pub struct AssistantMessage {
    /// Message role.
    pub role: Role,

    /// Message content.
    pub content: Option<String>,

    /// Tool calls.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

/// Finish reason.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    /// Normal completion.
    Stop,
    /// Max tokens reached.
    Length,
    /// Tool calls needed.
    ToolCalls,
    /// Content filter triggered.
    ContentFilter,
}

/// Token usage.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Usage {
    /// Prompt tokens.
    pub prompt_tokens: u32,

    /// Completion tokens.
    pub completion_tokens: u32,

    /// Total tokens.
    pub total_tokens: u32,

    /// Prompt time (Groq).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_time: Option<f64>,

    /// Completion time (Groq).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion_time: Option<f64>,

    /// Total time (Groq).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_time: Option<f64>,
}

/// Streaming chunk.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatChunk {
    /// Response ID.
    pub id: String,

    /// Object type.
    pub object: String,

    /// Creation timestamp.
    pub created: i64,

    /// Model ID.
    pub model: String,

    /// Chunk choices.
    pub choices: Vec<ChunkChoice>,

    /// Usage (in final chunk with include_usage).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,

    /// System fingerprint.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_fingerprint: Option<String>,

    /// Groq metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x_groq: Option<GroqMetadata>,
}

/// Streaming choice.
#[derive(Debug, Clone, Deserialize)]
pub struct ChunkChoice {
    /// Choice index.
    pub index: u32,

    /// Delta content.
    pub delta: Delta,

    /// Finish reason (in final chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<FinishReason>,

    /// Log probabilities.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logprobs: Option<serde_json::Value>,
}

/// Delta content in streaming.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Delta {
    /// Role (first chunk only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<Role>,

    /// Content delta.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,

    /// Tool call deltas.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCallDelta>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_request_builder() {
        let request = ChatRequest::builder()
            .model("llama-3.3-70b-versatile")
            .system("You are a helpful assistant.")
            .user("Hello!")
            .temperature(0.7)
            .max_tokens(100)
            .build()
            .unwrap();

        assert_eq!(request.model, "llama-3.3-70b-versatile");
        assert_eq!(request.messages.len(), 2);
        assert_eq!(request.temperature, Some(0.7));
        assert_eq!(request.max_tokens, Some(100));
    }

    #[test]
    fn test_chat_request_validation_no_model() {
        let result = ChatRequest::builder().user("Hello").build();
        assert!(result.is_err());
    }

    #[test]
    fn test_chat_request_validation_no_messages() {
        let result = ChatRequest::builder().model("test-model").build();
        assert!(result.is_err());
    }

    #[test]
    fn test_chat_request_validation_invalid_temperature() {
        let result = ChatRequest::builder()
            .model("test-model")
            .user("Hello")
            .temperature(3.0)
            .build();
        assert!(result.is_err());
    }

    #[test]
    fn test_message_creation() {
        let system = Message::system("You are helpful");
        assert_eq!(system.role, Role::System);

        let user = Message::user("Hello");
        assert_eq!(user.role, Role::User);

        let assistant = Message::assistant("Hi there!");
        assert_eq!(assistant.role, Role::Assistant);

        let tool = Message::tool("call_123", "result");
        assert_eq!(tool.role, Role::Tool);
        assert_eq!(tool.tool_call_id, Some("call_123".to_string()));
    }

    #[test]
    fn test_message_with_image() {
        let msg = Message::user_with_image("What's in this image?", "https://example.com/img.jpg");
        assert_eq!(msg.role, Role::User);
        match msg.content {
            Content::Parts(parts) => {
                assert_eq!(parts.len(), 2);
            }
            _ => panic!("Expected Parts content"),
        }
    }

    #[test]
    fn test_message_validation_tool_without_id() {
        let msg = Message {
            role: Role::Tool,
            content: Content::Text("result".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None, // Missing!
        };
        assert!(msg.validate().is_err());
    }

    #[test]
    fn test_chat_response_content() {
        let json = r#"{
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1705312345,
            "model": "llama-3.3-70b-versatile",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello!"
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15
            }
        }"#;

        let response: ChatResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.content(), Some("Hello!"));
        assert_eq!(response.finish_reason(), Some(FinishReason::Stop));
    }
}
