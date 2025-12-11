//! Types for the Chat service.

use crate::types::{ApiMeta, BilledUnits, FinishReason, GenerationId};
use serde::{Deserialize, Serialize};

/// Role in a chat conversation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MessageRole {
    /// User message
    User,
    /// Assistant/chatbot response
    Chatbot,
    /// System message
    System,
    /// Tool result
    Tool,
}

/// A message in a chat conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    /// Role of the message sender
    pub role: MessageRole,
    /// Content of the message
    pub message: String,
    /// Tool calls made by the assistant (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// Tool results (if role is Tool)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_results: Option<Vec<ToolResult>>,
}

impl ChatMessage {
    /// Create a user message
    pub fn user(message: impl Into<String>) -> Self {
        Self {
            role: MessageRole::User,
            message: message.into(),
            tool_calls: None,
            tool_results: None,
        }
    }

    /// Create a chatbot/assistant message
    pub fn chatbot(message: impl Into<String>) -> Self {
        Self {
            role: MessageRole::Chatbot,
            message: message.into(),
            tool_calls: None,
            tool_results: None,
        }
    }

    /// Create a system message
    pub fn system(message: impl Into<String>) -> Self {
        Self {
            role: MessageRole::System,
            message: message.into(),
            tool_calls: None,
            tool_results: None,
        }
    }

    /// Create a tool result message
    pub fn tool(results: Vec<ToolResult>) -> Self {
        Self {
            role: MessageRole::Tool,
            message: String::new(),
            tool_calls: None,
            tool_results: Some(results),
        }
    }
}

/// A tool definition for function calling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    /// Name of the tool
    pub name: String,
    /// Description of what the tool does
    pub description: String,
    /// JSON schema for the tool parameters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameter_definitions: Option<serde_json::Value>,
}

impl Tool {
    /// Create a new tool definition
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            parameter_definitions: None,
        }
    }

    /// Add parameter definitions
    pub fn with_parameters(mut self, params: serde_json::Value) -> Self {
        self.parameter_definitions = Some(params);
        self
    }
}

/// A tool call made by the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// ID of the tool call
    pub id: String,
    /// Name of the tool to call
    pub name: String,
    /// Parameters for the tool
    pub parameters: serde_json::Value,
}

/// Result of a tool call
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    /// ID of the tool call this is a result for
    pub call: ToolCall,
    /// Output from the tool
    pub outputs: Vec<serde_json::Value>,
}

/// A document for RAG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    /// Unique document ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Document text content
    pub text: String,
    /// Document title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Document URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

impl Document {
    /// Create a new document with text
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            id: None,
            text: text.into(),
            title: None,
            url: None,
        }
    }

    /// Add an ID
    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Add a title
    pub fn with_title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    /// Add a URL
    pub fn with_url(mut self, url: impl Into<String>) -> Self {
        self.url = Some(url.into());
        self
    }
}

/// A connector for web search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connector {
    /// Connector ID
    pub id: String,
    /// Search query options (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<serde_json::Value>,
}

impl Connector {
    /// Create a web search connector
    pub fn web_search() -> Self {
        Self {
            id: "web-search".to_string(),
            options: None,
        }
    }

    /// Create a connector with custom ID
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            options: None,
        }
    }
}

/// Search query for RAG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    /// Search text
    pub text: String,
    /// Generation ID this search is for
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_id: Option<String>,
}

/// Search result from RAG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// The search query
    pub search_query: SearchQuery,
    /// Connector used
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connector: Option<Connector>,
    /// Document IDs returned
    pub document_ids: Vec<String>,
}

/// Citation in a response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citation {
    /// Start position in the text
    pub start: u32,
    /// End position in the text
    pub end: u32,
    /// Text being cited
    pub text: String,
    /// Document IDs that support this citation
    pub document_ids: Vec<String>,
}

/// Chat request
#[derive(Debug, Clone, Serialize)]
pub struct ChatRequest {
    /// The message to send
    pub message: String,
    /// Model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Preamble/system prompt
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preamble: Option<String>,
    /// Chat history
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_history: Option<Vec<ChatMessage>>,
    /// Conversation ID for multi-turn
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    /// Whether to stream the response
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    /// Temperature (0.0 to 1.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Maximum tokens to generate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    /// Top-k sampling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub k: Option<u32>,
    /// Top-p (nucleus) sampling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p: Option<f32>,
    /// Stop sequences
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
    /// Frequency penalty
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,
    /// Presence penalty
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,
    /// Tools for function calling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    /// Force tool use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub force_single_step: Option<bool>,
    /// Documents for RAG
    #[serde(skip_serializing_if = "Option::is_none")]
    pub documents: Option<Vec<Document>>,
    /// Connectors for search
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connectors: Option<Vec<Connector>>,
    /// Search queries override
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_queries_only: Option<bool>,
    /// Random seed for reproducibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,
}

impl ChatRequest {
    /// Create a new chat request
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            model: None,
            preamble: None,
            chat_history: None,
            conversation_id: None,
            stream: None,
            temperature: None,
            max_tokens: None,
            k: None,
            p: None,
            stop_sequences: None,
            frequency_penalty: None,
            presence_penalty: None,
            tools: None,
            force_single_step: None,
            documents: None,
            connectors: None,
            search_queries_only: None,
            seed: None,
        }
    }

    /// Create a builder
    pub fn builder(message: impl Into<String>) -> ChatRequestBuilder {
        ChatRequestBuilder::new(message)
    }
}

/// Builder for ChatRequest
#[derive(Debug, Clone)]
pub struct ChatRequestBuilder {
    request: ChatRequest,
}

impl ChatRequestBuilder {
    /// Create a new builder
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            request: ChatRequest::new(message),
        }
    }

    /// Set the model
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.request.model = Some(model.into());
        self
    }

    /// Set the preamble/system prompt
    pub fn preamble(mut self, preamble: impl Into<String>) -> Self {
        self.request.preamble = Some(preamble.into());
        self
    }

    /// Set the chat history
    pub fn chat_history(mut self, history: Vec<ChatMessage>) -> Self {
        self.request.chat_history = Some(history);
        self
    }

    /// Set the conversation ID
    pub fn conversation_id(mut self, id: impl Into<String>) -> Self {
        self.request.conversation_id = Some(id.into());
        self
    }

    /// Enable streaming
    pub fn stream(mut self) -> Self {
        self.request.stream = Some(true);
        self
    }

    /// Set temperature
    pub fn temperature(mut self, temp: f32) -> Self {
        self.request.temperature = Some(temp);
        self
    }

    /// Set max tokens
    pub fn max_tokens(mut self, max: u32) -> Self {
        self.request.max_tokens = Some(max);
        self
    }

    /// Set top-k
    pub fn k(mut self, k: u32) -> Self {
        self.request.k = Some(k);
        self
    }

    /// Set top-p
    pub fn p(mut self, p: f32) -> Self {
        self.request.p = Some(p);
        self
    }

    /// Set stop sequences
    pub fn stop_sequences(mut self, sequences: Vec<String>) -> Self {
        self.request.stop_sequences = Some(sequences);
        self
    }

    /// Add tools
    pub fn tools(mut self, tools: Vec<Tool>) -> Self {
        self.request.tools = Some(tools);
        self
    }

    /// Add documents for RAG
    pub fn documents(mut self, docs: Vec<Document>) -> Self {
        self.request.documents = Some(docs);
        self
    }

    /// Add connectors
    pub fn connectors(mut self, connectors: Vec<Connector>) -> Self {
        self.request.connectors = Some(connectors);
        self
    }

    /// Set seed for reproducibility
    pub fn seed(mut self, seed: u64) -> Self {
        self.request.seed = Some(seed);
        self
    }

    /// Build the request
    pub fn build(self) -> ChatRequest {
        self.request
    }
}

/// Chat response
#[derive(Debug, Clone, Deserialize)]
pub struct ChatResponse {
    /// Generated text
    pub text: String,
    /// Generation ID
    pub generation_id: Option<GenerationId>,
    /// Finish reason
    #[serde(default)]
    pub finish_reason: Option<FinishReason>,
    /// Chat history including this response
    #[serde(default)]
    pub chat_history: Option<Vec<ChatMessage>>,
    /// Tool calls (if any)
    #[serde(default)]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// Citations (if RAG was used)
    #[serde(default)]
    pub citations: Option<Vec<Citation>>,
    /// Documents used
    #[serde(default)]
    pub documents: Option<Vec<Document>>,
    /// Search queries performed
    #[serde(default)]
    pub search_queries: Option<Vec<SearchQuery>>,
    /// Search results
    #[serde(default)]
    pub search_results: Option<Vec<SearchResult>>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_message_user() {
        let msg = ChatMessage::user("Hello");
        assert_eq!(msg.role, MessageRole::User);
        assert_eq!(msg.message, "Hello");
    }

    #[test]
    fn test_chat_message_chatbot() {
        let msg = ChatMessage::chatbot("Hi there!");
        assert_eq!(msg.role, MessageRole::Chatbot);
    }

    #[test]
    fn test_document_builder() {
        let doc = Document::new("Some text")
            .with_id("doc1")
            .with_title("Title")
            .with_url("https://example.com");

        assert_eq!(doc.text, "Some text");
        assert_eq!(doc.id, Some("doc1".to_string()));
        assert_eq!(doc.title, Some("Title".to_string()));
    }

    #[test]
    fn test_chat_request_builder() {
        let request = ChatRequest::builder("Hello")
            .model("command")
            .temperature(0.7)
            .max_tokens(1024)
            .stream()
            .build();

        assert_eq!(request.message, "Hello");
        assert_eq!(request.model, Some("command".to_string()));
        assert_eq!(request.temperature, Some(0.7));
        assert_eq!(request.max_tokens, Some(1024));
        assert_eq!(request.stream, Some(true));
    }

    #[test]
    fn test_tool_definition() {
        let tool = Tool::new("calculator", "Performs basic arithmetic")
            .with_parameters(serde_json::json!({
                "type": "object",
                "properties": {
                    "operation": {"type": "string"},
                    "a": {"type": "number"},
                    "b": {"type": "number"}
                }
            }));

        assert_eq!(tool.name, "calculator");
        assert!(tool.parameter_definitions.is_some());
    }
}
