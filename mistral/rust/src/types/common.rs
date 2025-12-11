//! Common types shared across the API.

use serde::{Deserialize, Serialize};

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
    /// Tool message.
    Tool,
}

/// Token usage information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    /// Number of tokens in the prompt.
    pub prompt_tokens: u32,
    /// Number of tokens in the completion.
    pub completion_tokens: u32,
    /// Total number of tokens.
    pub total_tokens: u32,
}

impl Usage {
    /// Creates a new usage instance.
    pub fn new(prompt_tokens: u32, completion_tokens: u32) -> Self {
        Self {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        }
    }
}

/// Reason for completion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    /// Natural stop.
    Stop,
    /// Max tokens reached.
    Length,
    /// Tool calls required.
    ToolCalls,
    /// Model decided to stop.
    ModelLength,
    /// Error occurred.
    Error,
}

/// Response format specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ResponseFormat {
    /// Plain text response.
    Text,
    /// JSON object response.
    JsonObject,
}

impl Default for ResponseFormat {
    fn default() -> Self {
        Self::Text
    }
}

/// Safe prompt setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SafePrompt {
    /// Safe prompt enabled.
    On,
    /// Safe prompt disabled.
    Off,
}

impl Default for SafePrompt {
    fn default() -> Self {
        Self::Off
    }
}

impl From<bool> for SafePrompt {
    fn from(value: bool) -> Self {
        if value {
            Self::On
        } else {
            Self::Off
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_usage_new() {
        let usage = Usage::new(100, 50);
        assert_eq!(usage.prompt_tokens, 100);
        assert_eq!(usage.completion_tokens, 50);
        assert_eq!(usage.total_tokens, 150);
    }

    #[test]
    fn test_role_serialization() {
        assert_eq!(serde_json::to_string(&Role::User).unwrap(), "\"user\"");
        assert_eq!(serde_json::to_string(&Role::Assistant).unwrap(), "\"assistant\"");
    }

    #[test]
    fn test_finish_reason_serialization() {
        assert_eq!(serde_json::to_string(&FinishReason::Stop).unwrap(), "\"stop\"");
        assert_eq!(serde_json::to_string(&FinishReason::ToolCalls).unwrap(), "\"tool_calls\"");
    }
}
