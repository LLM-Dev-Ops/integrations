//! Chat service for conversational AI.
//!
//! This module provides the Chat API implementation for:
//! - Single-turn and multi-turn conversations
//! - Streaming responses
//! - Tool use and function calling
//! - RAG (Retrieval Augmented Generation)

mod service;
mod stream;
mod types;
mod validation;

pub use service::{ChatService, ChatServiceImpl};
pub use stream::{ChatStream, ChatStreamEvent};
pub use types::{
    ChatMessage, ChatRequest, ChatRequestBuilder, ChatResponse, Citation, Connector, Document,
    MessageRole, SearchQuery, SearchResult, Tool, ToolCall, ToolResult,
};
pub use validation::validate_chat_request;
