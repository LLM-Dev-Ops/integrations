//! Content generation types for the Gemini API.
//!
//! This module contains types for configuring and handling content generation.

use serde::{Deserialize, Serialize};

use super::content::Content;
use super::safety::{SafetyRating, SafetySetting};
use super::tools::{Tool, ToolConfig};

/// Configuration for content generation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GenerationConfig {
    /// The temperature for sampling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// The nucleus sampling probability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    /// The top-k sampling parameter.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    /// The maximum number of tokens to generate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<i32>,
    /// Sequences that will stop generation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
    /// The number of candidates to generate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate_count: Option<i32>,
    /// The MIME type of the response.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_mime_type: Option<String>,
    /// The schema for the response.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_schema: Option<serde_json::Value>,
}

/// The reason why content generation finished.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FinishReason {
    /// Natural stop point.
    Stop,
    /// Maximum token limit reached.
    MaxTokens,
    /// Safety threshold triggered.
    Safety,
    /// Content recitation detected.
    Recitation,
    /// Other reason.
    Other,
    /// Content on blocklist.
    Blocklist,
    /// Prohibited content detected.
    ProhibitedContent,
    /// Sensitive personally identifiable information detected.
    Spii,
}

/// Metadata about token usage.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UsageMetadata {
    /// Number of tokens in the prompt.
    pub prompt_token_count: i32,
    /// Number of tokens in the candidates.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidates_token_count: Option<i32>,
    /// Total number of tokens.
    pub total_token_count: i32,
    /// Number of tokens from cached content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_content_token_count: Option<i32>,
}

/// Metadata about citations in the content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CitationMetadata {
    /// Sources that were cited.
    pub citation_sources: Vec<CitationSource>,
}

/// A source that was cited in the content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CitationSource {
    /// Start index of the citation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_index: Option<i32>,
    /// End index of the citation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_index: Option<i32>,
    /// URI of the source.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

/// Metadata about grounding sources.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GroundingMetadata {
    /// Web search queries used for grounding.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_search_queries: Option<Vec<String>>,
    /// Search entry point information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_entry_point: Option<serde_json::Value>,
    /// Grounding chunks retrieved.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounding_chunks: Option<Vec<serde_json::Value>>,
    /// Grounding supports for the content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounding_supports: Option<Vec<serde_json::Value>>,
}

/// A candidate response from the model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Candidate {
    /// The content of the candidate.
    pub content: Content,
    /// The reason generation finished.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<FinishReason>,
    /// Safety ratings for the candidate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safety_ratings: Option<Vec<SafetyRating>>,
    /// Citation metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub citation_metadata: Option<CitationMetadata>,
    /// Grounding metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounding_metadata: Option<GroundingMetadata>,
    /// The index of this candidate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<i32>,
    /// The number of tokens in this candidate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_count: Option<i32>,
}

/// Request to generate content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GenerateContentRequest {
    /// The content to send to the model.
    pub contents: Vec<Content>,
    /// Optional system instruction.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<Content>,
    /// Tools available to the model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    /// Tool usage configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_config: Option<ToolConfig>,
    /// Safety settings.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safety_settings: Option<Vec<SafetySetting>>,
    /// Generation configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<GenerationConfig>,
    /// Cached content to use.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_content: Option<String>,
}

/// Feedback on why the prompt was blocked or altered.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptFeedback {
    /// The reason the prompt was blocked, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_reason: Option<BlockReason>,
    /// Safety ratings for the prompt.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safety_ratings: Option<Vec<SafetyRating>>,
}

/// Reason why the prompt was blocked.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BlockReason {
    /// Unspecified block reason.
    BlockReasonUnspecified,
    /// Blocked due to safety.
    Safety,
    /// Blocked due to other reasons.
    Other,
    /// Blocked due to prohibited content.
    Blocklist,
    /// Blocked due to prohibited content.
    ProhibitedContent,
}

/// Response from content generation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GenerateContentResponse {
    /// The candidate responses.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidates: Option<Vec<Candidate>>,
    /// Feedback about the prompt.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_feedback: Option<PromptFeedback>,
    /// Usage metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_metadata: Option<UsageMetadata>,
    /// The version of the model used.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,
}
