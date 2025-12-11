//! Common types used across the Cohere API client.

use serde::{Deserialize, Serialize};

/// Usage information returned by API calls
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Usage {
    /// Number of input tokens
    #[serde(default)]
    pub input_tokens: u64,
    /// Number of output tokens
    #[serde(default)]
    pub output_tokens: u64,
    /// Search units used (for RAG operations)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_units: Option<u64>,
}

impl Usage {
    /// Get total tokens
    pub fn total_tokens(&self) -> u64 {
        self.input_tokens + self.output_tokens
    }
}

/// Billed units returned by API calls
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BilledUnits {
    /// Input tokens billed
    #[serde(default)]
    pub input_tokens: u64,
    /// Output tokens billed
    #[serde(default)]
    pub output_tokens: u64,
    /// Search units billed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_units: Option<f64>,
    /// Classification units billed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub classifications: Option<u64>,
}

/// API metadata included in responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiMeta {
    /// API version used
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_version: Option<ApiVersion>,
    /// Billed units
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billed_units: Option<BilledUnits>,
    /// Warnings from the API
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// API version information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiVersion {
    /// Version string
    pub version: String,
    /// Whether this is a deprecated version
    #[serde(default)]
    pub is_deprecated: bool,
    /// Deprecation date if deprecated
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deprecation_date: Option<String>,
}

/// Unique generation ID returned by API
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct GenerationId(pub String);

impl GenerationId {
    /// Create a new generation ID
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }
}

impl std::fmt::Display for GenerationId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<String> for GenerationId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl AsRef<str> for GenerationId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Embedding type for embed requests
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EmbeddingType {
    /// Float embeddings (default)
    Float,
    /// Int8 quantized embeddings
    Int8,
    /// Uint8 quantized embeddings
    Uint8,
    /// Binary embeddings
    Binary,
    /// Ubinary embeddings
    Ubinary,
}

impl Default for EmbeddingType {
    fn default() -> Self {
        Self::Float
    }
}

/// Input type for embed requests
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InputType {
    /// Search document (for indexing)
    SearchDocument,
    /// Search query (for querying)
    SearchQuery,
    /// Classification input
    Classification,
    /// Clustering input
    Clustering,
}

/// Truncate option for text inputs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum TruncateOption {
    /// No truncation (error if too long)
    None,
    /// Truncate from the start
    Start,
    /// Truncate from the end
    End,
}

impl Default for TruncateOption {
    fn default() -> Self {
        Self::End
    }
}

/// Finish reason for generations
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FinishReason {
    /// Generation completed naturally
    Complete,
    /// Reached maximum tokens
    MaxTokens,
    /// Stopped by stop sequence
    StopSequence,
    /// Stopped due to error
    Error,
    /// User requested stop
    UserCancel,
    /// Content filter triggered
    #[serde(alias = "FILTERED")]
    ContentFiltered,
    /// Tool use requested
    ToolUse,
}

/// Safety filter result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyFilter {
    /// Filter ID/name
    pub id: String,
    /// Whether content was filtered
    pub filtered: bool,
    /// Confidence score (0-1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
}

/// Model info used across services
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelReference {
    /// Model name/ID
    pub name: String,
    /// Model version (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

impl ModelReference {
    /// Create a new model reference
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            version: None,
        }
    }

    /// Create a model reference with version
    pub fn with_version(name: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            version: Some(version.into()),
        }
    }
}

/// Pagination parameters for list operations
#[derive(Debug, Clone, Default, Serialize)]
pub struct ListParams {
    /// Page size (max items per page)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    /// Page token for pagination
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
}

impl ListParams {
    /// Create new list params with page size
    pub fn with_page_size(page_size: u32) -> Self {
        Self {
            page_size: Some(page_size),
            page_token: None,
        }
    }

    /// Set the page token for continuation
    pub fn with_page_token(mut self, token: impl Into<String>) -> Self {
        self.page_token = Some(token.into());
        self
    }
}

/// Generic paginated list response
#[derive(Debug, Clone, Deserialize)]
pub struct ListResponse<T> {
    /// Items in this page
    pub data: Vec<T>,
    /// Token for next page (if more results exist)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,
    /// Total count (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_count: Option<u64>,
}

impl<T> ListResponse<T> {
    /// Check if there are more pages
    pub fn has_more(&self) -> bool {
        self.next_page_token.is_some()
    }

    /// Get the next page token
    pub fn next_token(&self) -> Option<&str> {
        self.next_page_token.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_usage() {
        let usage = Usage {
            input_tokens: 100,
            output_tokens: 50,
            search_units: Some(2),
        };
        assert_eq!(usage.total_tokens(), 150);
    }

    #[test]
    fn test_generation_id() {
        let id = GenerationId::new("gen-123");
        assert_eq!(id.to_string(), "gen-123");
        assert_eq!(id.as_ref(), "gen-123");
    }

    #[test]
    fn test_embedding_type_serialize() {
        let float = EmbeddingType::Float;
        assert_eq!(serde_json::to_string(&float).unwrap(), "\"float\"");

        let int8 = EmbeddingType::Int8;
        assert_eq!(serde_json::to_string(&int8).unwrap(), "\"int8\"");
    }

    #[test]
    fn test_truncate_option_serialize() {
        let end = TruncateOption::End;
        assert_eq!(serde_json::to_string(&end).unwrap(), "\"END\"");

        let none = TruncateOption::None;
        assert_eq!(serde_json::to_string(&none).unwrap(), "\"NONE\"");
    }

    #[test]
    fn test_list_params() {
        let params = ListParams::with_page_size(10).with_page_token("token123");
        assert_eq!(params.page_size, Some(10));
        assert_eq!(params.page_token, Some("token123".to_string()));
    }

    #[test]
    fn test_list_response() {
        let response: ListResponse<String> = ListResponse {
            data: vec!["item1".to_string(), "item2".to_string()],
            next_page_token: Some("next".to_string()),
            total_count: Some(100),
        };

        assert!(response.has_more());
        assert_eq!(response.next_token(), Some("next"));
    }
}
