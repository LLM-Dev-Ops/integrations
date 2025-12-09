use http::HeaderMap;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;
use std::time::Duration;

/// Request options for API calls
#[derive(Debug, Clone, Default)]
pub struct RequestOptions {
    pub timeout: Option<Duration>,
    pub headers: Option<HeaderMap>,
    pub signal: Option<()>, // Placeholder for cancellation token
}

impl RequestOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn with_headers(mut self, headers: HeaderMap) -> Self {
        self.headers = Some(headers);
        self
    }
}

/// Pagination parameters for list operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<SortOrder>,
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            limit: Some(20),
            after: None,
            before: None,
            order: Some(SortOrder::Descending),
        }
    }
}

impl PaginationParams {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_limit(mut self, limit: u32) -> Self {
        self.limit = Some(limit);
        self
    }

    pub fn with_after(mut self, after: impl Into<String>) -> Self {
        self.after = Some(after.into());
        self
    }

    pub fn with_before(mut self, before: impl Into<String>) -> Self {
        self.before = Some(before.into());
        self
    }

    pub fn with_order(mut self, order: SortOrder) -> Self {
        self.order = Some(order);
        self
    }
}

/// Sort order for pagination
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    Ascending,
    Descending,
}

/// Paginated response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub object: String,
    pub data: Vec<T>,
    pub has_more: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_id: Option<String>,
}

impl<T> PaginatedResponse<T> {
    pub fn new(data: Vec<T>) -> Self {
        Self {
            object: "list".to_string(),
            data,
            has_more: false,
            first_id: None,
            last_id: None,
        }
    }
}

/// Token usage information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: Option<u32>,
    pub total_tokens: u32,
}

impl Usage {
    pub fn new(prompt_tokens: u32, completion_tokens: u32) -> Self {
        Self {
            prompt_tokens,
            completion_tokens: Some(completion_tokens),
            total_tokens: prompt_tokens + completion_tokens,
        }
    }
}

/// Legacy list response (alias for PaginatedResponse)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListResponse<T> {
    pub object: String,
    pub data: Vec<T>,
    pub has_more: Option<bool>,
    pub first_id: Option<String>,
    pub last_id: Option<String>,
}

/// Deletion status response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletionStatus {
    pub id: String,
    pub object: String,
    pub deleted: bool,
}

/// OpenAI model identifiers
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Model {
    #[serde(rename = "gpt-4")]
    Gpt4,

    #[serde(rename = "gpt-4-turbo")]
    Gpt4Turbo,

    #[serde(rename = "gpt-4-turbo-preview")]
    Gpt4TurboPreview,

    #[serde(rename = "gpt-4-32k")]
    Gpt4_32k,

    #[serde(rename = "gpt-3.5-turbo")]
    Gpt35Turbo,

    #[serde(rename = "gpt-3.5-turbo-16k")]
    Gpt35Turbo16k,

    #[serde(rename = "text-embedding-ada-002")]
    TextEmbeddingAda002,

    #[serde(rename = "text-embedding-3-small")]
    TextEmbedding3Small,

    #[serde(rename = "text-embedding-3-large")]
    TextEmbedding3Large,

    #[serde(rename = "dall-e-3")]
    DallE3,

    #[serde(rename = "dall-e-2")]
    DallE2,

    #[serde(rename = "whisper-1")]
    Whisper1,

    #[serde(rename = "tts-1")]
    Tts1,

    #[serde(rename = "tts-1-hd")]
    Tts1Hd,

    #[serde(untagged)]
    Custom(String),
}

impl Model {
    pub fn as_str(&self) -> &str {
        match self {
            Model::Gpt4 => "gpt-4",
            Model::Gpt4Turbo => "gpt-4-turbo",
            Model::Gpt4TurboPreview => "gpt-4-turbo-preview",
            Model::Gpt4_32k => "gpt-4-32k",
            Model::Gpt35Turbo => "gpt-3.5-turbo",
            Model::Gpt35Turbo16k => "gpt-3.5-turbo-16k",
            Model::TextEmbeddingAda002 => "text-embedding-ada-002",
            Model::TextEmbedding3Small => "text-embedding-3-small",
            Model::TextEmbedding3Large => "text-embedding-3-large",
            Model::DallE3 => "dall-e-3",
            Model::DallE2 => "dall-e-2",
            Model::Whisper1 => "whisper-1",
            Model::Tts1 => "tts-1",
            Model::Tts1Hd => "tts-1-hd",
            Model::Custom(s) => s.as_str(),
        }
    }
}

impl fmt::Display for Model {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for Model {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s {
            "gpt-4" => Model::Gpt4,
            "gpt-4-turbo" => Model::Gpt4Turbo,
            "gpt-4-turbo-preview" => Model::Gpt4TurboPreview,
            "gpt-4-32k" => Model::Gpt4_32k,
            "gpt-3.5-turbo" => Model::Gpt35Turbo,
            "gpt-3.5-turbo-16k" => Model::Gpt35Turbo16k,
            "text-embedding-ada-002" => Model::TextEmbeddingAda002,
            "text-embedding-3-small" => Model::TextEmbedding3Small,
            "text-embedding-3-large" => Model::TextEmbedding3Large,
            "dall-e-3" => Model::DallE3,
            "dall-e-2" => Model::DallE2,
            "whisper-1" => Model::Whisper1,
            "tts-1" => Model::Tts1,
            "tts-1-hd" => Model::Tts1Hd,
            _ => Model::Custom(s.to_string()),
        })
    }
}

/// Object type identifiers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ObjectType {
    Chat,
    Completion,
    Edit,
    Image,
    Model,
    Embedding,
    File,
    FineTune,
    FineTuningJob,
    List,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_usage_serialization() {
        let usage = Usage {
            prompt_tokens: 10,
            completion_tokens: Some(20),
            total_tokens: 30,
        };

        let json = serde_json::to_string(&usage).unwrap();
        assert!(json.contains("prompt_tokens"));
        assert!(json.contains("completion_tokens"));
        assert!(json.contains("total_tokens"));
    }

    #[test]
    fn test_usage_new() {
        let usage = Usage::new(10, 20);
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, Some(20));
        assert_eq!(usage.total_tokens, 30);
    }

    #[test]
    fn test_list_response() {
        let response: ListResponse<String> = ListResponse {
            object: "list".to_string(),
            data: vec!["item1".to_string(), "item2".to_string()],
            has_more: Some(false),
            first_id: None,
            last_id: None,
        };

        assert_eq!(response.data.len(), 2);
    }

    #[test]
    fn test_paginated_response() {
        let response: PaginatedResponse<String> = PaginatedResponse::new(vec![
            "item1".to_string(),
            "item2".to_string(),
        ]);

        assert_eq!(response.data.len(), 2);
        assert!(!response.has_more);
    }

    #[test]
    fn test_pagination_params() {
        let params = PaginationParams::new()
            .with_limit(50)
            .with_after("id123")
            .with_order(SortOrder::Ascending);

        assert_eq!(params.limit, Some(50));
        assert_eq!(params.after, Some("id123".to_string()));
        assert_eq!(params.order, Some(SortOrder::Ascending));
    }

    #[test]
    fn test_model_display() {
        assert_eq!(Model::Gpt4.to_string(), "gpt-4");
        assert_eq!(Model::Gpt35Turbo.to_string(), "gpt-3.5-turbo");
        assert_eq!(Model::TextEmbedding3Small.to_string(), "text-embedding-3-small");
    }

    #[test]
    fn test_model_from_str() {
        assert_eq!("gpt-4".parse::<Model>().unwrap(), Model::Gpt4);
        assert_eq!(
            "gpt-3.5-turbo".parse::<Model>().unwrap(),
            Model::Gpt35Turbo
        );
        assert_eq!(
            "custom-model".parse::<Model>().unwrap(),
            Model::Custom("custom-model".to_string())
        );
    }

    #[test]
    fn test_request_options() {
        let opts = RequestOptions::new()
            .with_timeout(Duration::from_secs(30));

        assert_eq!(opts.timeout, Some(Duration::from_secs(30)));
    }
}
