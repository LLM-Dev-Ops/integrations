//! Messages API service
//!
//! This module provides the Messages API implementation for creating and streaming
//! messages with Claude, counting tokens, and handling tool use.

mod types;
mod service;
mod stream;
mod validation;

#[cfg(test)]
mod tests;

// Re-export public types
pub use types::{
    Message, MessageParam, MessageContent, ContentBlock, ContentDelta,
    CreateMessageRequest, CountTokensRequest, TokenCount,
    Role, StopReason, Usage, Tool, ToolChoice, ToolResultContent,
    ImageSource, DocumentSource, CacheControl, Metadata,
    ThinkingConfig, SystemPrompt, PartialMessage, MessageDelta,
};

pub use service::{MessagesService, MessagesServiceImpl};
pub use stream::{MessageStream, MessageStreamEvent};
pub use validation::{validate_create_message_request, validate_count_tokens_request};
