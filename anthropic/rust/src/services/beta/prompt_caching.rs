//! Prompt Caching Support
//!
//! This module provides utilities for working with prompt caching,
//! a beta feature that allows caching parts of prompts to reduce costs
//! and latency for repeated requests.

use crate::services::messages::{CacheControl, ContentBlock, SystemPrompt, Tool};
use super::types::SystemPromptWithCache;

/// Extension trait for adding cache control to various types
pub trait CacheableContent {
    /// Mark this content for caching
    fn with_cache_control(self) -> Self;
}

impl CacheableContent for ContentBlock {
    fn with_cache_control(self) -> Self {
        match self {
            ContentBlock::Text { text, .. } => ContentBlock::Text {
                text,
                cache_control: Some(CacheControl::ephemeral()),
            },
            ContentBlock::Image { source, .. } => ContentBlock::Image {
                source,
                cache_control: Some(CacheControl::ephemeral()),
            },
            ContentBlock::Document { source, .. } => ContentBlock::Document {
                source,
                cache_control: Some(CacheControl::ephemeral()),
            },
            ContentBlock::ToolResult { tool_use_id, content, is_error, .. } => {
                ContentBlock::ToolResult {
                    tool_use_id,
                    content,
                    is_error,
                    cache_control: Some(CacheControl::ephemeral()),
                }
            }
            // ToolUse and Thinking blocks don't support cache control
            other => other,
        }
    }
}

impl CacheableContent for Tool {
    fn with_cache_control(mut self) -> Self {
        self.cache_control = Some(CacheControl::ephemeral());
        self
    }
}

/// Builder for creating cacheable system prompts
pub struct CacheableSystemPromptBuilder {
    text: String,
    cache_control: Option<CacheControl>,
}

impl CacheableSystemPromptBuilder {
    /// Create a new builder with the given text
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            cache_control: None,
        }
    }

    /// Enable caching for this system prompt
    pub fn with_cache(mut self) -> Self {
        self.cache_control = Some(CacheControl::ephemeral());
        self
    }

    /// Build the final system prompt with cache configuration
    pub fn build(self) -> SystemPromptWithCache {
        SystemPromptWithCache {
            text: self.text,
            cache_control: self.cache_control,
        }
    }

    /// Build as a SystemPrompt enum (for compatibility)
    pub fn build_as_system_prompt(self) -> SystemPrompt {
        if self.cache_control.is_some() {
            // If cache control is set, use blocks format
            SystemPrompt::Blocks(vec![ContentBlock::Text {
                text: self.text,
                cache_control: self.cache_control,
            }])
        } else {
            SystemPrompt::Text(self.text)
        }
    }
}

/// Create a cacheable system prompt
///
/// # Example
/// ```
/// # #[cfg(feature = "beta")]
/// # {
/// use integrations_anthropic::services::beta::cacheable_system_prompt;
///
/// let prompt = cacheable_system_prompt("You are a helpful assistant", true);
/// # }
/// ```
pub fn cacheable_system_prompt(text: impl Into<String>, with_cache: bool) -> SystemPrompt {
    let builder = CacheableSystemPromptBuilder::new(text);
    if with_cache {
        builder.with_cache().build_as_system_prompt()
    } else {
        builder.build_as_system_prompt()
    }
}

/// Mark the last N items in a content block list for caching
///
/// This is useful for marking conversation history for caching while
/// keeping the most recent message uncached.
pub fn cache_last_n_blocks(mut blocks: Vec<ContentBlock>, n: usize) -> Vec<ContentBlock> {
    let len = blocks.len();
    if n > 0 && len > 0 {
        let start = len.saturating_sub(n);
        for block in blocks.iter_mut().skip(start) {
            match block {
                ContentBlock::Text { cache_control, .. }
                | ContentBlock::Image { cache_control, .. }
                | ContentBlock::Document { cache_control, .. }
                | ContentBlock::ToolResult { cache_control, .. } => {
                    *cache_control = Some(CacheControl::ephemeral());
                }
                _ => {}
            }
        }
    }
    blocks
}

/// Mark tools for caching
pub fn cache_tools(mut tools: Vec<Tool>) -> Vec<Tool> {
    for tool in tools.iter_mut() {
        tool.cache_control = Some(CacheControl::ephemeral());
    }
    tools
}

/// Get the beta header value for prompt caching
pub fn get_prompt_caching_beta_header() -> &'static str {
    "prompt-caching-2024-07-31"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::messages::{DocumentSource, ImageSource};

    #[test]
    fn test_cacheable_content_text() {
        let block = ContentBlock::Text {
            text: "Hello".to_string(),
            cache_control: None,
        };

        let cached = block.with_cache_control();

        match cached {
            ContentBlock::Text { cache_control, .. } => {
                assert!(cache_control.is_some());
            }
            _ => panic!("Expected Text content block"),
        }
    }

    #[test]
    fn test_cacheable_content_image() {
        let block = ContentBlock::Image {
            source: ImageSource::base64("image/png", "data"),
            cache_control: None,
        };

        let cached = block.with_cache_control();

        match cached {
            ContentBlock::Image { cache_control, .. } => {
                assert!(cache_control.is_some());
            }
            _ => panic!("Expected Image content block"),
        }
    }

    #[test]
    fn test_cacheable_content_document() {
        let block = ContentBlock::Document {
            source: DocumentSource::base64("application/pdf", "data"),
            cache_control: None,
        };

        let cached = block.with_cache_control();

        match cached {
            ContentBlock::Document { cache_control, .. } => {
                assert!(cache_control.is_some());
            }
            _ => panic!("Expected Document content block"),
        }
    }

    #[test]
    fn test_cacheable_system_prompt_builder() {
        let prompt = CacheableSystemPromptBuilder::new("Test prompt")
            .with_cache()
            .build();

        assert_eq!(prompt.text, "Test prompt");
        assert!(prompt.cache_control.is_some());
    }

    #[test]
    fn test_cacheable_system_prompt_builder_as_enum() {
        let prompt = CacheableSystemPromptBuilder::new("Test prompt")
            .with_cache()
            .build_as_system_prompt();

        match prompt {
            SystemPrompt::Blocks(blocks) => {
                assert_eq!(blocks.len(), 1);
                match &blocks[0] {
                    ContentBlock::Text { text, cache_control } => {
                        assert_eq!(text, "Test prompt");
                        assert!(cache_control.is_some());
                    }
                    _ => panic!("Expected Text block"),
                }
            }
            _ => panic!("Expected Blocks variant"),
        }
    }

    #[test]
    fn test_cacheable_system_prompt_function() {
        let with_cache = cacheable_system_prompt("Test", true);
        let without_cache = cacheable_system_prompt("Test", false);

        assert!(matches!(with_cache, SystemPrompt::Blocks(_)));
        assert!(matches!(without_cache, SystemPrompt::Text(_)));
    }

    #[test]
    fn test_cache_last_n_blocks() {
        let blocks = vec![
            ContentBlock::Text {
                text: "First".to_string(),
                cache_control: None,
            },
            ContentBlock::Text {
                text: "Second".to_string(),
                cache_control: None,
            },
            ContentBlock::Text {
                text: "Third".to_string(),
                cache_control: None,
            },
        ];

        let cached = cache_last_n_blocks(blocks, 2);

        // First should not be cached
        match &cached[0] {
            ContentBlock::Text { cache_control, .. } => {
                assert!(cache_control.is_none());
            }
            _ => panic!("Expected Text block"),
        }

        // Second and third should be cached
        for block in &cached[1..] {
            match block {
                ContentBlock::Text { cache_control, .. } => {
                    assert!(cache_control.is_some());
                }
                _ => panic!("Expected Text block"),
            }
        }
    }

    #[test]
    fn test_cache_last_n_blocks_empty() {
        let blocks: Vec<ContentBlock> = vec![];
        let cached = cache_last_n_blocks(blocks, 2);
        assert!(cached.is_empty());
    }

    #[test]
    fn test_cache_tools() {
        let tools = vec![
            Tool::new("tool1", "Description 1", serde_json::json!({})),
            Tool::new("tool2", "Description 2", serde_json::json!({})),
        ];

        let cached = cache_tools(tools);

        for tool in cached {
            assert!(tool.cache_control.is_some());
        }
    }

    #[test]
    fn test_cacheable_tool() {
        let tool = Tool::new("test", "Test tool", serde_json::json!({}))
            .with_cache_control();

        assert!(tool.cache_control.is_some());
    }

    #[test]
    fn test_beta_header() {
        assert_eq!(get_prompt_caching_beta_header(), "prompt-caching-2024-07-31");
    }
}
