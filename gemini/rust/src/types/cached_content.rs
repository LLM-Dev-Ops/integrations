//! Cached content types for the Gemini API.
//!
//! This module contains types for working with cached content in context caching.

use serde::{Deserialize, Serialize};

use super::content::Content;
use super::tools::Tool;

/// Cached content for context caching.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CachedContent {
    /// The resource name of the cached content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The display name of the cached content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The model name.
    pub model: String,
    /// The creation time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,
    /// The last update time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    /// The expiration time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expire_time: Option<String>,
    /// Usage metadata for the cached content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_metadata: Option<CachedContentUsageMetadata>,
}

/// Usage metadata for cached content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CachedContentUsageMetadata {
    /// The total number of tokens in the cached content.
    pub total_token_count: i32,
}

/// Request to create cached content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreateCachedContentRequest {
    /// The model to use.
    pub model: String,
    /// The display name for the cached content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The contents to cache.
    pub contents: Vec<Content>,
    /// Optional system instruction.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<Content>,
    /// Tools to cache.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    /// Time to live (duration string).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl: Option<String>,
    /// Absolute expiration time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expire_time: Option<String>,
}

/// Request to update cached content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateCachedContentRequest {
    /// Time to live (duration string).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl: Option<String>,
    /// Absolute expiration time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expire_time: Option<String>,
}

/// Response from listing cached contents.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ListCachedContentsResponse {
    /// The list of cached contents.
    pub cached_contents: Vec<CachedContent>,
    /// Token for the next page.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,
}

/// Parameters for listing cached contents.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ListCachedContentsParams {
    /// The page size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<i32>,
    /// The page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
}
