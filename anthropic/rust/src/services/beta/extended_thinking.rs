//! Extended Thinking Support
//!
//! This module provides utilities for working with extended thinking,
//! a beta feature that allows Claude to show its reasoning process.

use crate::services::messages::{ContentBlock, CreateMessageRequest, ThinkingConfig};

/// Extension trait for adding extended thinking to message requests
pub trait ExtendedThinkingExt {
    /// Enable extended thinking with an optional token budget
    fn with_extended_thinking(self, budget_tokens: Option<u32>) -> Self;

    /// Enable extended thinking with a specific token budget
    fn with_thinking_budget(self, budget_tokens: u32) -> Self;
}

impl ExtendedThinkingExt for CreateMessageRequest {
    fn with_extended_thinking(mut self, budget_tokens: Option<u32>) -> Self {
        self.thinking = Some(if let Some(budget) = budget_tokens {
            ThinkingConfig::with_budget(budget)
        } else {
            ThinkingConfig::enabled()
        });
        self
    }

    fn with_thinking_budget(mut self, budget_tokens: u32) -> Self {
        self.thinking = Some(ThinkingConfig::with_budget(budget_tokens));
        self
    }
}

/// Extract thinking content from response content blocks
pub fn extract_thinking_blocks(content: &[ContentBlock]) -> Vec<String> {
    content
        .iter()
        .filter_map(|block| {
            if let ContentBlock::Thinking { thinking } = block {
                Some(thinking.clone())
            } else {
                None
            }
        })
        .collect()
}

/// Check if a response contains thinking blocks
pub fn has_thinking_blocks(content: &[ContentBlock]) -> bool {
    content.iter().any(|block| matches!(block, ContentBlock::Thinking { .. }))
}

/// Extract all text content, excluding thinking blocks
pub fn extract_text_without_thinking(content: &[ContentBlock]) -> Vec<String> {
    content
        .iter()
        .filter_map(|block| {
            if let ContentBlock::Text { text, .. } = block {
                Some(text.clone())
            } else {
                None
            }
        })
        .collect()
}

/// Get the beta header value for extended thinking
pub fn get_extended_thinking_beta_header() -> &'static str {
    "extended-thinking-2024-12-01"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::messages::MessageParam;

    #[test]
    fn test_extended_thinking_ext() {
        let messages = vec![MessageParam::user("What is 2+2?")];
        let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 1024, messages)
            .with_extended_thinking(Some(5000));

        assert!(request.thinking.is_some());
        let thinking = request.thinking.unwrap();
        assert_eq!(thinking.thinking_type, "enabled");
        assert_eq!(thinking.budget_tokens, Some(5000));
    }

    #[test]
    fn test_thinking_budget() {
        let messages = vec![MessageParam::user("What is 2+2?")];
        let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 1024, messages)
            .with_thinking_budget(3000);

        assert!(request.thinking.is_some());
        let thinking = request.thinking.unwrap();
        assert_eq!(thinking.budget_tokens, Some(3000));
    }

    #[test]
    fn test_extract_thinking_blocks() {
        let content = vec![
            ContentBlock::Text {
                text: "Hello".to_string(),
                cache_control: None,
            },
            ContentBlock::Thinking {
                thinking: "Let me think about this...".to_string(),
            },
            ContentBlock::Thinking {
                thinking: "The answer is...".to_string(),
            },
        ];

        let thinking = extract_thinking_blocks(&content);
        assert_eq!(thinking.len(), 2);
        assert_eq!(thinking[0], "Let me think about this...");
        assert_eq!(thinking[1], "The answer is...");
    }

    #[test]
    fn test_has_thinking_blocks() {
        let with_thinking = vec![
            ContentBlock::Text {
                text: "Hello".to_string(),
                cache_control: None,
            },
            ContentBlock::Thinking {
                thinking: "Thinking...".to_string(),
            },
        ];

        let without_thinking = vec![
            ContentBlock::Text {
                text: "Hello".to_string(),
                cache_control: None,
            },
        ];

        assert!(has_thinking_blocks(&with_thinking));
        assert!(!has_thinking_blocks(&without_thinking));
    }

    #[test]
    fn test_extract_text_without_thinking() {
        let content = vec![
            ContentBlock::Text {
                text: "First text".to_string(),
                cache_control: None,
            },
            ContentBlock::Thinking {
                thinking: "Thinking...".to_string(),
            },
            ContentBlock::Text {
                text: "Second text".to_string(),
                cache_control: None,
            },
        ];

        let text = extract_text_without_thinking(&content);
        assert_eq!(text.len(), 2);
        assert_eq!(text[0], "First text");
        assert_eq!(text[1], "Second text");
    }

    #[test]
    fn test_beta_header() {
        assert_eq!(get_extended_thinking_beta_header(), "extended-thinking-2024-12-01");
    }
}
