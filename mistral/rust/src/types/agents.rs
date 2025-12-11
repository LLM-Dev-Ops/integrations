//! Agent types for Mistral API.

use serde::{Deserialize, Serialize};

use super::chat::{AssistantMessage, Message, MessageContent};
use super::common::{FinishReason, Usage};
use super::tools::{Tool, ToolCall, ToolChoice};

/// Agent completion request.
#[derive(Debug, Clone, Serialize)]
pub struct AgentCompletionRequest {
    /// Agent ID to use.
    pub agent_id: String,
    /// Messages in the conversation.
    pub messages: Vec<Message>,
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
    /// Random seed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub random_seed: Option<u64>,
    /// Additional tools.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    /// Tool choice.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,
}

impl AgentCompletionRequest {
    /// Creates a new agent completion request.
    pub fn new(agent_id: impl Into<String>, messages: Vec<Message>) -> Self {
        Self {
            agent_id: agent_id.into(),
            messages,
            max_tokens: None,
            min_tokens: None,
            stream: None,
            stop: None,
            random_seed: None,
            tools: None,
            tool_choice: None,
        }
    }

    /// Creates a new builder.
    pub fn builder() -> AgentCompletionRequestBuilder {
        AgentCompletionRequestBuilder::default()
    }
}

/// Builder for agent completion requests.
#[derive(Default)]
pub struct AgentCompletionRequestBuilder {
    agent_id: Option<String>,
    messages: Vec<Message>,
    max_tokens: Option<u32>,
    min_tokens: Option<u32>,
    stream: Option<bool>,
    stop: Option<Vec<String>>,
    random_seed: Option<u64>,
    tools: Option<Vec<Tool>>,
    tool_choice: Option<ToolChoice>,
}

impl AgentCompletionRequestBuilder {
    /// Sets the agent ID.
    pub fn agent_id(mut self, agent_id: impl Into<String>) -> Self {
        self.agent_id = Some(agent_id.into());
        self
    }

    /// Sets messages.
    pub fn messages(mut self, messages: Vec<Message>) -> Self {
        self.messages = messages;
        self
    }

    /// Adds a message.
    pub fn message(mut self, message: Message) -> Self {
        self.messages.push(message);
        self
    }

    /// Sets max tokens.
    pub fn max_tokens(mut self, max: u32) -> Self {
        self.max_tokens = Some(max);
        self
    }

    /// Sets min tokens.
    pub fn min_tokens(mut self, min: u32) -> Self {
        self.min_tokens = Some(min);
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

    /// Builds the request.
    pub fn build(self) -> AgentCompletionRequest {
        AgentCompletionRequest {
            agent_id: self.agent_id.unwrap_or_default(),
            messages: self.messages,
            max_tokens: self.max_tokens,
            min_tokens: self.min_tokens,
            stream: self.stream,
            stop: self.stop,
            random_seed: self.random_seed,
            tools: self.tools,
            tool_choice: self.tool_choice,
        }
    }
}

/// Agent completion response.
#[derive(Debug, Clone, Deserialize)]
pub struct AgentCompletionResponse {
    /// Response ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Agent ID.
    pub agent_id: String,
    /// Creation timestamp.
    pub created: i64,
    /// Completion choices.
    pub choices: Vec<AgentChoice>,
    /// Token usage.
    pub usage: Usage,
}

/// An agent completion choice.
#[derive(Debug, Clone, Deserialize)]
pub struct AgentChoice {
    /// Choice index.
    pub index: u32,
    /// The assistant's message.
    pub message: AssistantMessage,
    /// Reason for stopping.
    pub finish_reason: Option<FinishReason>,
}

/// Streaming chunk for agent completions.
#[derive(Debug, Clone, Deserialize)]
pub struct AgentCompletionChunk {
    /// Chunk ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Agent ID.
    pub agent_id: String,
    /// Creation timestamp.
    pub created: i64,
    /// Streaming choices.
    pub choices: Vec<AgentStreamChoice>,
    /// Usage (only in final chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
}

/// A streaming agent choice.
#[derive(Debug, Clone, Deserialize)]
pub struct AgentStreamChoice {
    /// Choice index.
    pub index: u32,
    /// Content delta.
    pub delta: AgentDelta,
    /// Finish reason (in final chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<FinishReason>,
}

/// Content delta in agent streaming.
#[derive(Debug, Clone, Deserialize)]
pub struct AgentDelta {
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
    fn test_agent_request_creation() {
        let request = AgentCompletionRequest::new(
            "agent-123",
            vec![Message::user("Hello")],
        );
        assert_eq!(request.agent_id, "agent-123");
        assert_eq!(request.messages.len(), 1);
    }

    #[test]
    fn test_agent_request_builder() {
        let request = AgentCompletionRequest::builder()
            .agent_id("agent-456")
            .message(Message::user("Test"))
            .max_tokens(100)
            .stream(true)
            .build();

        assert_eq!(request.agent_id, "agent-456");
        assert_eq!(request.max_tokens, Some(100));
        assert_eq!(request.stream, Some(true));
    }

    #[test]
    fn test_agent_response_deserialization() {
        let json = r#"{
            "id": "resp-123",
            "object": "agent.completion",
            "agent_id": "agent-456",
            "created": 1700000000,
            "choices": [{
                "index": 0,
                "message": {
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

        let response: AgentCompletionResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.id, "resp-123");
        assert_eq!(response.agent_id, "agent-456");
        assert_eq!(response.choices.len(), 1);
    }
}
