//! Types for the Tokenize service.

use crate::types::ApiMeta;
use serde::{Deserialize, Serialize};

/// Tokenize request
#[derive(Debug, Clone, Serialize)]
pub struct TokenizeRequest {
    /// Text to tokenize
    pub text: String,
    /// Model to use for tokenization
    pub model: String,
}

impl TokenizeRequest {
    /// Create a new tokenize request
    pub fn new(text: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            model: model.into(),
        }
    }
}

/// Tokenize response
#[derive(Debug, Clone, Deserialize)]
pub struct TokenizeResponse {
    /// Token IDs
    pub tokens: Vec<i64>,
    /// Token strings
    #[serde(default)]
    pub token_strings: Option<Vec<String>>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

impl TokenizeResponse {
    /// Get the number of tokens
    pub fn len(&self) -> usize {
        self.tokens.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }

    /// Get tokens with their string representations (if available)
    pub fn tokens_with_strings(&self) -> Vec<(i64, Option<&str>)> {
        self.tokens
            .iter()
            .enumerate()
            .map(|(i, &id)| {
                let string = self
                    .token_strings
                    .as_ref()
                    .and_then(|strings| strings.get(i))
                    .map(String::as_str);
                (id, string)
            })
            .collect()
    }
}

/// Detokenize request
#[derive(Debug, Clone, Serialize)]
pub struct DetokenizeRequest {
    /// Token IDs to detokenize
    pub tokens: Vec<i64>,
    /// Model to use for detokenization
    pub model: String,
}

impl DetokenizeRequest {
    /// Create a new detokenize request
    pub fn new(tokens: Vec<i64>, model: impl Into<String>) -> Self {
        Self {
            tokens,
            model: model.into(),
        }
    }
}

/// Detokenize response
#[derive(Debug, Clone, Deserialize)]
pub struct DetokenizeResponse {
    /// The detokenized text
    pub text: String,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize_request() {
        let request = TokenizeRequest::new("Hello, world!", "command");
        assert_eq!(request.text, "Hello, world!");
        assert_eq!(request.model, "command");
    }

    #[test]
    fn test_tokenize_response() {
        let response = TokenizeResponse {
            tokens: vec![1, 2, 3],
            token_strings: Some(vec!["Hello".to_string(), ",".to_string(), "world".to_string()]),
            meta: None,
        };

        assert_eq!(response.len(), 3);
        let with_strings = response.tokens_with_strings();
        assert_eq!(with_strings[0], (1, Some("Hello")));
    }

    #[test]
    fn test_detokenize_request() {
        let request = DetokenizeRequest::new(vec![1, 2, 3], "command");
        assert_eq!(request.tokens, vec![1, 2, 3]);
        assert_eq!(request.model, "command");
    }
}
