//! Model types.

use serde::{Deserialize, Serialize};

/// Model information.
#[derive(Debug, Clone, Deserialize)]
pub struct Model {
    /// Model ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Creation timestamp.
    pub created: i64,
    /// Owner of the model.
    pub owned_by: String,
    /// Model capabilities.
    #[serde(default)]
    pub capabilities: ModelCapabilities,
    /// Model name (display name).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Model description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Maximum context length.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_context_length: Option<u32>,
    /// Model aliases.
    #[serde(default)]
    pub aliases: Vec<String>,
    /// Deprecation information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deprecation: Option<String>,
    /// Default model temperature.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model_temperature: Option<f64>,
    /// Model type.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    pub model_type: Option<String>,
}

/// Model capabilities.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ModelCapabilities {
    /// Can generate completions.
    #[serde(default)]
    pub completion_chat: bool,
    /// Can generate FIM completions.
    #[serde(default)]
    pub completion_fim: bool,
    /// Can generate embeddings.
    #[serde(default)]
    pub fine_tuning: bool,
    /// Can be used for function calling.
    #[serde(default)]
    pub function_calling: bool,
    /// Supports vision.
    #[serde(default)]
    pub vision: bool,
}

/// Response from listing models.
#[derive(Debug, Clone, Deserialize)]
pub struct ModelListResponse {
    /// Object type.
    pub object: String,
    /// List of models.
    pub data: Vec<Model>,
}

/// Model archive request.
#[derive(Debug, Clone, Serialize)]
pub struct ArchiveModelRequest {
    /// Model ID to archive.
    pub model_id: String,
}

/// Model archive response.
#[derive(Debug, Clone, Deserialize)]
pub struct ArchiveModelResponse {
    /// Model ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Whether the model was archived.
    pub archived: bool,
}

/// Model unarchive response.
#[derive(Debug, Clone, Deserialize)]
pub struct UnarchiveModelResponse {
    /// Model ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Whether the model was unarchived.
    pub archived: bool,
}

/// Model update request.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateModelRequest {
    /// New name for the model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// New description for the model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Model deletion response.
#[derive(Debug, Clone, Deserialize)]
pub struct DeleteModelResponse {
    /// Model ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Whether the model was deleted.
    pub deleted: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_capabilities_default() {
        let caps = ModelCapabilities::default();
        assert!(!caps.completion_chat);
        assert!(!caps.vision);
    }

    #[test]
    fn test_model_deserialization() {
        let json = r#"{
            "id": "mistral-large-latest",
            "object": "model",
            "created": 1700000000,
            "owned_by": "mistral",
            "capabilities": {
                "completion_chat": true,
                "function_calling": true
            }
        }"#;

        let model: Model = serde_json::from_str(json).unwrap();
        assert_eq!(model.id, "mistral-large-latest");
        assert!(model.capabilities.completion_chat);
        assert!(model.capabilities.function_calling);
    }
}
