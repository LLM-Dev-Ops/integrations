//! Types for the Models service.

use serde::{Deserialize, Serialize};

/// Model capability/endpoint
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelCapability {
    /// Chat capability
    Chat,
    /// Generate/completion capability
    Generate,
    /// Embed capability
    Embed,
    /// Rerank capability
    Rerank,
    /// Classify capability
    Classify,
    /// Summarize capability
    Summarize,
}

/// Model information
#[derive(Debug, Clone, Deserialize)]
pub struct ModelInfo {
    /// Model name/ID
    pub name: String,
    /// Model version
    #[serde(default)]
    pub version: Option<String>,
    /// Default model for its capabilities
    #[serde(default)]
    pub default_endpoints: Option<Vec<ModelCapability>>,
    /// Supported capabilities/endpoints
    #[serde(default)]
    pub endpoints: Option<Vec<ModelCapability>>,
    /// Whether this is a fine-tuned model
    #[serde(default)]
    pub finetuned: Option<bool>,
    /// Context length
    #[serde(default)]
    pub context_length: Option<u32>,
    /// Tokenizer URL
    #[serde(default)]
    pub tokenizer_url: Option<String>,
}

impl ModelInfo {
    /// Check if the model supports a capability
    pub fn supports(&self, capability: ModelCapability) -> bool {
        self.endpoints
            .as_ref()
            .map(|e| e.contains(&capability))
            .unwrap_or(false)
    }

    /// Check if this is a default model for a capability
    pub fn is_default_for(&self, capability: ModelCapability) -> bool {
        self.default_endpoints
            .as_ref()
            .map(|e| e.contains(&capability))
            .unwrap_or(false)
    }
}

/// Response from listing models
#[derive(Debug, Clone, Deserialize)]
pub struct ModelListResponse {
    /// List of models
    pub models: Vec<ModelInfo>,
}

impl ModelListResponse {
    /// Find a model by name
    pub fn find(&self, name: &str) -> Option<&ModelInfo> {
        self.models.iter().find(|m| m.name == name)
    }

    /// Get models that support a capability
    pub fn with_capability(&self, capability: ModelCapability) -> Vec<&ModelInfo> {
        self.models.iter().filter(|m| m.supports(capability)).collect()
    }

    /// Get default models for a capability
    pub fn default_for(&self, capability: ModelCapability) -> Option<&ModelInfo> {
        self.models.iter().find(|m| m.is_default_for(capability))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_info_supports() {
        let model = ModelInfo {
            name: "command".to_string(),
            version: Some("1.0".to_string()),
            default_endpoints: Some(vec![ModelCapability::Chat, ModelCapability::Generate]),
            endpoints: Some(vec![
                ModelCapability::Chat,
                ModelCapability::Generate,
                ModelCapability::Summarize,
            ]),
            finetuned: Some(false),
            context_length: Some(4096),
            tokenizer_url: None,
        };

        assert!(model.supports(ModelCapability::Chat));
        assert!(model.supports(ModelCapability::Generate));
        assert!(model.supports(ModelCapability::Summarize));
        assert!(!model.supports(ModelCapability::Embed));
    }

    #[test]
    fn test_model_info_is_default_for() {
        let model = ModelInfo {
            name: "command".to_string(),
            version: None,
            default_endpoints: Some(vec![ModelCapability::Chat]),
            endpoints: Some(vec![ModelCapability::Chat, ModelCapability::Generate]),
            finetuned: None,
            context_length: None,
            tokenizer_url: None,
        };

        assert!(model.is_default_for(ModelCapability::Chat));
        assert!(!model.is_default_for(ModelCapability::Generate));
    }

    #[test]
    fn test_model_list_response() {
        let response = ModelListResponse {
            models: vec![
                ModelInfo {
                    name: "command".to_string(),
                    version: None,
                    default_endpoints: Some(vec![ModelCapability::Chat]),
                    endpoints: Some(vec![ModelCapability::Chat]),
                    finetuned: None,
                    context_length: None,
                    tokenizer_url: None,
                },
                ModelInfo {
                    name: "embed-english-v3.0".to_string(),
                    version: None,
                    default_endpoints: Some(vec![ModelCapability::Embed]),
                    endpoints: Some(vec![ModelCapability::Embed]),
                    finetuned: None,
                    context_length: None,
                    tokenizer_url: None,
                },
            ],
        };

        assert!(response.find("command").is_some());
        assert!(response.find("unknown").is_none());

        let embed_models = response.with_capability(ModelCapability::Embed);
        assert_eq!(embed_models.len(), 1);
        assert_eq!(embed_models[0].name, "embed-english-v3.0");

        let default_embed = response.default_for(ModelCapability::Embed);
        assert!(default_embed.is_some());
    }
}
