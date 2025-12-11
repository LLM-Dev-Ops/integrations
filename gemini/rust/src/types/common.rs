//! Common types shared across the Gemini API.
//!
//! This module contains types that are used across multiple API domains.

use serde::{Deserialize, Serialize};

use super::content::Content;
use super::generation::GenerateContentRequest;

/// Request to count tokens.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CountTokensRequest {
    /// The contents to count tokens for.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contents: Option<Vec<Content>>,
    /// A generate content request to count tokens for.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generate_content_request: Option<Box<GenerateContentRequest>>,
}

/// Response from counting tokens.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CountTokensResponse {
    /// The total number of tokens.
    pub total_tokens: i32,
    /// The number of cached content tokens.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_content_token_count: Option<i32>,
}
