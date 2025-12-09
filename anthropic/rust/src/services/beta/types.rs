//! Beta feature type definitions
//!
//! This module contains type definitions for beta features including extended thinking,
//! PDF support, prompt caching, token counting, and computer use.

use serde::{Deserialize, Serialize};

// Re-export types from messages module that are also used in beta features
pub use crate::services::messages::{
    CacheControl, ContentBlock, ImageSource, DocumentSource, MessageParam,
    Role, SystemPrompt, ThinkingConfig, Tool, Usage,
};

/// Token count request for beta token counting API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenCountRequest {
    pub model: String,
    pub messages: Vec<MessageParam>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<SystemPrompt>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
}

impl TokenCountRequest {
    pub fn new(model: impl Into<String>, messages: Vec<MessageParam>) -> Self {
        Self {
            model: model.into(),
            messages,
            system: None,
            tools: None,
        }
    }

    pub fn with_system(mut self, system: impl Into<String>) -> Self {
        self.system = Some(SystemPrompt::Text(system.into()));
        self
    }

    pub fn with_system_blocks(mut self, blocks: Vec<ContentBlock>) -> Self {
        self.system = Some(SystemPrompt::Blocks(blocks));
        self
    }

    pub fn with_tools(mut self, tools: Vec<Tool>) -> Self {
        self.tools = Some(tools);
        self
    }
}

/// Token count response from the beta API
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TokenCountResponse {
    pub input_tokens: u32,
}

/// Computer use tool types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ComputerToolType {
    #[serde(rename = "computer_20241022")]
    Computer20241022,
    #[serde(rename = "text_editor_20241022")]
    TextEditor20241022,
    #[serde(rename = "bash_20241022")]
    Bash20241022,
}

/// Computer use tool definition
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ComputerTool {
    #[serde(rename = "type")]
    pub type_: ComputerToolType,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_width_px: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_height_px: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_number: Option<u32>,
}

impl ComputerTool {
    /// Create a computer tool with display dimensions
    pub fn computer(width: u32, height: u32) -> Self {
        Self {
            type_: ComputerToolType::Computer20241022,
            name: "computer".to_string(),
            display_width_px: Some(width),
            display_height_px: Some(height),
            display_number: Some(1),
        }
    }

    /// Create a text editor tool
    pub fn text_editor() -> Self {
        Self {
            type_: ComputerToolType::TextEditor20241022,
            name: "str_replace_editor".to_string(),
            display_width_px: None,
            display_height_px: None,
            display_number: None,
        }
    }

    /// Create a bash tool
    pub fn bash() -> Self {
        Self {
            type_: ComputerToolType::Bash20241022,
            name: "bash".to_string(),
            display_width_px: None,
            display_height_px: None,
            display_number: None,
        }
    }
}

/// Computer use tool result
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ComputerToolResult {
    #[serde(rename = "type")]
    pub type_: String,
    pub tool_use_id: String,
    pub content: Vec<ComputerToolResultContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

/// Content types for computer tool results
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum ComputerToolResultContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { source: ComputerImageSource },
}

/// Image source for computer tool results
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ComputerImageSource {
    #[serde(rename = "type")]
    pub type_: String,
    pub media_type: String,
    pub data: String,
}

impl ComputerImageSource {
    pub fn base64(media_type: impl Into<String>, data: impl Into<String>) -> Self {
        Self {
            type_: "base64".to_string(),
            media_type: media_type.into(),
            data: data.into(),
        }
    }
}

/// System prompt with cache control for prompt caching
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SystemPromptWithCache {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_control: Option<CacheControl>,
}

impl SystemPromptWithCache {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            cache_control: None,
        }
    }

    pub fn with_cache(mut self) -> Self {
        self.cache_control = Some(CacheControl::ephemeral());
        self
    }
}

/// Cache usage statistics
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CacheUsage {
    pub cache_creation_input_tokens: u32,
    pub cache_read_input_tokens: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_computer_tool_creation() {
        let computer = ComputerTool::computer(1920, 1080);
        assert_eq!(computer.name, "computer");
        assert_eq!(computer.display_width_px, Some(1920));
        assert_eq!(computer.display_height_px, Some(1080));
        assert_eq!(computer.display_number, Some(1));

        let editor = ComputerTool::text_editor();
        assert_eq!(editor.name, "str_replace_editor");
        assert_eq!(editor.display_width_px, None);

        let bash = ComputerTool::bash();
        assert_eq!(bash.name, "bash");
    }

    #[test]
    fn test_token_count_request_builder() {
        let messages = vec![MessageParam::user("Hello")];
        let request = TokenCountRequest::new("claude-3-5-sonnet-20241022", messages.clone())
            .with_system("You are helpful");

        assert_eq!(request.model, "claude-3-5-sonnet-20241022");
        assert_eq!(request.messages.len(), 1);
        assert!(request.system.is_some());
    }

    #[test]
    fn test_system_prompt_with_cache() {
        let prompt = SystemPromptWithCache::new("Test prompt")
            .with_cache();

        assert_eq!(prompt.text, "Test prompt");
        assert!(prompt.cache_control.is_some());
    }

    #[test]
    fn test_computer_image_source() {
        let source = ComputerImageSource::base64("image/png", "base64data");
        assert_eq!(source.type_, "base64");
        assert_eq!(source.media_type, "image/png");
        assert_eq!(source.data, "base64data");
    }
}
