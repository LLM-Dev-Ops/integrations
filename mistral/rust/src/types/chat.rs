//! Chat completion types.

use serde::{Deserialize, Serialize};

use super::common::{FinishReason, ResponseFormat, Role, SafePrompt, Usage};
use super::tools::{Tool, ToolCall, ToolChoice};

/// Chat completion request.
#[derive(Debug, Clone, Serialize)]
pub struct ChatCompletionRequest {
    /// Model ID to use.
    pub model: String,
    /// Messages in the conversation.
    pub messages: Vec<Message>,
    /// Sampling temperature (0.0 to 1.0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    /// Top-p (nucleus) sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    /// Maximum tokens to generate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    /// Minimum tokens to generate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_tokens: Option<u32>,
    /// Whether to stream the response.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    /// Stop sequences.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
    /// Random seed for reproducibility.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub random_seed: Option<u64>,
    /// Response format.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<ResponseFormat>,
    /// Available tools.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    /// Tool choice.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,
    /// Safe prompt setting.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safe_prompt: Option<SafePrompt>,
    /// Presence penalty.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f64>,
    /// Frequency penalty.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f64>,
    /// Number of completions to generate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u32>,
}

impl ChatCompletionRequest {
    /// Creates a new chat completion request builder.
    pub fn builder() -> ChatCompletionRequestBuilder {
        ChatCompletionRequestBuilder::new()
    }

    /// Creates a simple request with model and messages.
    pub fn new(model: impl Into<String>, messages: Vec<Message>) -> Self {
        Self {
            model: model.into(),
            messages,
            temperature: None,
            top_p: None,
            max_tokens: None,
            min_tokens: None,
            stream: None,
            stop: None,
            random_seed: None,
            response_format: None,
            tools: None,
            tool_choice: None,
            safe_prompt: None,
            presence_penalty: None,
            frequency_penalty: None,
            n: None,
        }
    }
}

/// Builder for chat completion requests.
#[derive(Default)]
pub struct ChatCompletionRequestBuilder {
    model: Option<String>,
    messages: Vec<Message>,
    temperature: Option<f64>,
    top_p: Option<f64>,
    max_tokens: Option<u32>,
    min_tokens: Option<u32>,
    stream: Option<bool>,
    stop: Option<Vec<String>>,
    random_seed: Option<u64>,
    response_format: Option<ResponseFormat>,
    tools: Option<Vec<Tool>>,
    tool_choice: Option<ToolChoice>,
    safe_prompt: Option<SafePrompt>,
    presence_penalty: Option<f64>,
    frequency_penalty: Option<f64>,
    n: Option<u32>,
}

impl ChatCompletionRequestBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the model.
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    /// Sets the messages.
    pub fn messages(mut self, messages: Vec<Message>) -> Self {
        self.messages = messages;
        self
    }

    /// Adds a message.
    pub fn message(mut self, message: Message) -> Self {
        self.messages.push(message);
        self
    }

    /// Sets the temperature.
    pub fn temperature(mut self, temperature: f64) -> Self {
        self.temperature = Some(temperature);
        self
    }

    /// Sets top_p.
    pub fn top_p(mut self, top_p: f64) -> Self {
        self.top_p = Some(top_p);
        self
    }

    /// Sets max_tokens.
    pub fn max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = Some(max_tokens);
        self
    }

    /// Sets min_tokens.
    pub fn min_tokens(mut self, min_tokens: u32) -> Self {
        self.min_tokens = Some(min_tokens);
        self
    }

    /// Enables streaming.
    pub fn stream(mut self, stream: bool) -> Self {
        self.stream = Some(stream);
        self
    }

    /// Sets stop sequences.
    pub fn stop(mut self, stop: Vec<String>) -> Self {
        self.stop = Some(stop);
        self
    }

    /// Sets random seed.
    pub fn random_seed(mut self, seed: u64) -> Self {
        self.random_seed = Some(seed);
        self
    }

    /// Sets response format.
    pub fn response_format(mut self, format: ResponseFormat) -> Self {
        self.response_format = Some(format);
        self
    }

    /// Sets tools.
    pub fn tools(mut self, tools: Vec<Tool>) -> Self {
        self.tools = Some(tools);
        self
    }

    /// Sets tool choice.
    pub fn tool_choice(mut self, choice: ToolChoice) -> Self {
        self.tool_choice = Some(choice);
        self
    }

    /// Sets safe prompt.
    pub fn safe_prompt(mut self, safe: bool) -> Self {
        self.safe_prompt = Some(safe.into());
        self
    }

    /// Sets presence penalty.
    pub fn presence_penalty(mut self, penalty: f64) -> Self {
        self.presence_penalty = Some(penalty);
        self
    }

    /// Sets frequency penalty.
    pub fn frequency_penalty(mut self, penalty: f64) -> Self {
        self.frequency_penalty = Some(penalty);
        self
    }

    /// Sets number of completions.
    pub fn n(mut self, n: u32) -> Self {
        self.n = Some(n);
        self
    }

    /// Builds the request.
    pub fn build(self) -> ChatCompletionRequest {
        ChatCompletionRequest {
            model: self.model.unwrap_or_else(|| "mistral-large-latest".to_string()),
            messages: self.messages,
            temperature: self.temperature,
            top_p: self.top_p,
            max_tokens: self.max_tokens,
            min_tokens: self.min_tokens,
            stream: self.stream,
            stop: self.stop,
            random_seed: self.random_seed,
            response_format: self.response_format,
            tools: self.tools,
            tool_choice: self.tool_choice,
            safe_prompt: self.safe_prompt,
            presence_penalty: self.presence_penalty,
            frequency_penalty: self.frequency_penalty,
            n: self.n,
        }
    }
}

/// Chat completion response.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatCompletionResponse {
    /// Response ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Model used.
    pub model: String,
    /// Creation timestamp.
    pub created: i64,
    /// Completion choices.
    pub choices: Vec<ChatChoice>,
    /// Token usage.
    pub usage: Usage,
}

/// A completion choice.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatChoice {
    /// Choice index.
    pub index: u32,
    /// The assistant's message.
    pub message: AssistantMessage,
    /// Reason for stopping.
    pub finish_reason: Option<FinishReason>,
}

/// A message in the conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role", rename_all = "lowercase")]
pub enum Message {
    /// System message.
    System(SystemMessage),
    /// User message.
    User(UserMessage),
    /// Assistant message.
    Assistant(AssistantMessage),
    /// Tool message.
    Tool(ToolMessage),
}

impl Message {
    /// Creates a system message.
    pub fn system(content: impl Into<String>) -> Self {
        Message::System(SystemMessage {
            content: content.into(),
        })
    }

    /// Creates a user message.
    pub fn user(content: impl Into<MessageContent>) -> Self {
        Message::User(UserMessage {
            content: content.into(),
        })
    }

    /// Creates an assistant message.
    pub fn assistant(content: impl Into<String>) -> Self {
        Message::Assistant(AssistantMessage {
            content: Some(content.into()),
            tool_calls: None,
            prefix: None,
        })
    }

    /// Creates a tool result message.
    pub fn tool(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Message::Tool(ToolMessage {
            tool_call_id: tool_call_id.into(),
            content: content.into(),
            name: None,
        })
    }
}

/// System message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMessage {
    /// Message content.
    pub content: String,
}

/// User message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMessage {
    /// Message content.
    pub content: MessageContent,
}

/// Assistant message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantMessage {
    /// Message content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Tool calls made by the assistant.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// Whether this is a prefix message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<bool>,
}

/// Tool message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolMessage {
    /// Tool call ID this message is responding to.
    pub tool_call_id: String,
    /// Tool result content.
    pub content: String,
    /// Tool name (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Message content (text or multimodal).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    /// Plain text content.
    Text(String),
    /// Multimodal content parts.
    Parts(Vec<ContentPart>),
}

impl From<String> for MessageContent {
    fn from(s: String) -> Self {
        MessageContent::Text(s)
    }
}

impl From<&str> for MessageContent {
    fn from(s: &str) -> Self {
        MessageContent::Text(s.to_string())
    }
}

/// A part of multimodal content.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    /// Text content.
    Text {
        /// The text content.
        text: String,
    },
    /// Image content.
    ImageUrl {
        /// Image URL.
        image_url: ImageUrl,
    },
}

/// Image URL specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageUrl {
    /// The URL of the image.
    pub url: String,
    /// Optional detail level.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Streaming chunk for chat completions.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatCompletionChunk {
    /// Chunk ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Model used.
    pub model: String,
    /// Creation timestamp.
    pub created: i64,
    /// Streaming choices.
    pub choices: Vec<StreamChoice>,
    /// Usage (only in final chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
}

/// A streaming choice.
#[derive(Debug, Clone, Deserialize)]
pub struct StreamChoice {
    /// Choice index.
    pub index: u32,
    /// Content delta.
    pub delta: ContentDelta,
    /// Finish reason (in final chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<FinishReason>,
}

/// Content delta in streaming.
#[derive(Debug, Clone, Deserialize)]
pub struct ContentDelta {
    /// Role (in first chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<Role>,
    /// Content text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Tool calls.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_constructors() {
        let system = Message::system("You are helpful.");
        let user = Message::user("Hello!");
        let assistant = Message::assistant("Hi there!");

        assert!(matches!(system, Message::System(_)));
        assert!(matches!(user, Message::User(_)));
        assert!(matches!(assistant, Message::Assistant(_)));
    }

    #[test]
    fn test_request_builder() {
        let request = ChatCompletionRequest::builder()
            .model("mistral-large-latest")
            .message(Message::user("Hello"))
            .temperature(0.7)
            .max_tokens(100)
            .build();

        assert_eq!(request.model, "mistral-large-latest");
        assert_eq!(request.messages.len(), 1);
        assert_eq!(request.temperature, Some(0.7));
        assert_eq!(request.max_tokens, Some(100));
    }

    #[test]
    fn test_message_content_from_string() {
        let content: MessageContent = "Hello".into();
        assert!(matches!(content, MessageContent::Text(_)));
    }
}
