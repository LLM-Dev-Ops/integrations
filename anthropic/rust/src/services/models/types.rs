//! Type definitions for the Models API

use serde::{Deserialize, Serialize};

/// Information about a Claude model
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelInfo {
    /// Unique model identifier
    pub id: String,
    /// Human-readable display name
    pub display_name: String,
    /// Model creation timestamp (RFC 3339 format)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// Type field (always "model")
    #[serde(rename = "type")]
    pub type_: String,
}

impl ModelInfo {
    /// Create a new ModelInfo
    pub fn new(id: impl Into<String>, display_name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            display_name: display_name.into(),
            created_at: None,
            type_: "model".to_string(),
        }
    }

    /// Set the created_at timestamp
    pub fn with_created_at(mut self, created_at: impl Into<String>) -> Self {
        self.created_at = Some(created_at.into());
        self
    }
}

/// Response from listing models
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelListResponse {
    /// List of available models
    pub data: Vec<ModelInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Whether there are more results
    pub has_more: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// ID of the first model in the list
    pub first_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// ID of the last model in the list
    pub last_id: Option<String>,
}

impl ModelListResponse {
    /// Create a new ModelListResponse with the given models
    pub fn new(data: Vec<ModelInfo>) -> Self {
        let first_id = data.first().map(|m| m.id.clone());
        let last_id = data.last().map(|m| m.id.clone());

        Self {
            data,
            has_more: None,
            first_id,
            last_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_info_new() {
        let model = ModelInfo::new("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet");
        assert_eq!(model.id, "claude-3-5-sonnet-20241022");
        assert_eq!(model.display_name, "Claude 3.5 Sonnet");
        assert_eq!(model.type_, "model");
        assert!(model.created_at.is_none());
    }

    #[test]
    fn test_model_info_with_created_at() {
        let model = ModelInfo::new("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet")
            .with_created_at("2024-10-22T00:00:00Z");
        assert_eq!(model.created_at, Some("2024-10-22T00:00:00Z".to_string()));
    }

    #[test]
    fn test_model_list_response_new() {
        let models = vec![
            ModelInfo::new("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet"),
            ModelInfo::new("claude-3-opus-20240229", "Claude 3 Opus"),
        ];

        let response = ModelListResponse::new(models);
        assert_eq!(response.data.len(), 2);
        assert_eq!(response.first_id, Some("claude-3-5-sonnet-20241022".to_string()));
        assert_eq!(response.last_id, Some("claude-3-opus-20240229".to_string()));
    }

    #[test]
    fn test_model_info_serialization() {
        let model = ModelInfo::new("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet")
            .with_created_at("2024-10-22T00:00:00Z");

        let json = serde_json::to_string(&model).unwrap();
        assert!(json.contains("\"type\":\"model\""));
        assert!(json.contains("\"id\":\"claude-3-5-sonnet-20241022\""));

        let deserialized: ModelInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(model, deserialized);
    }
}
