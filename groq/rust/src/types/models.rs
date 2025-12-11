//! Model types.

use serde::Deserialize;

/// Model information.
#[derive(Debug, Clone, Deserialize)]
pub struct Model {
    /// Model ID.
    pub id: String,

    /// Object type (always "model").
    pub object: String,

    /// Creation timestamp.
    pub created: i64,

    /// Owner organization.
    pub owned_by: String,

    /// Whether the model is active.
    #[serde(default)]
    pub active: bool,

    /// Context window size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u32>,

    /// Public applications allowed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_apps: Option<bool>,
}

/// Model list response.
#[derive(Debug, Clone, Deserialize)]
pub struct ModelList {
    /// Object type (always "list").
    pub object: String,

    /// List of models.
    pub data: Vec<Model>,
}

impl ModelList {
    /// Returns the number of models.
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Returns true if empty.
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Gets a model by ID.
    pub fn get(&self, id: &str) -> Option<&Model> {
        self.data.iter().find(|m| m.id == id)
    }

    /// Filters models by owner.
    pub fn by_owner(&self, owner: &str) -> Vec<&Model> {
        self.data.iter().filter(|m| m.owned_by == owner).collect()
    }

    /// Returns iterator over models.
    pub fn iter(&self) -> impl Iterator<Item = &Model> {
        self.data.iter()
    }
}

/// Well-known Groq models.
pub mod known {
    /// Llama 3.3 70B Versatile model.
    pub const LLAMA_3_3_70B_VERSATILE: &str = "llama-3.3-70b-versatile";

    /// Llama 3.1 70B Versatile model.
    pub const LLAMA_3_1_70B_VERSATILE: &str = "llama-3.1-70b-versatile";

    /// Llama 3.1 8B Instant model.
    pub const LLAMA_3_1_8B_INSTANT: &str = "llama-3.1-8b-instant";

    /// Llama Guard 3 8B model.
    pub const LLAMA_GUARD_3_8B: &str = "llama-guard-3-8b";

    /// Mixtral 8x7B model.
    pub const MIXTRAL_8X7B: &str = "mixtral-8x7b-32768";

    /// Gemma 2 9B model.
    pub const GEMMA_2_9B_IT: &str = "gemma2-9b-it";

    /// Whisper Large V3 model.
    pub const WHISPER_LARGE_V3: &str = "whisper-large-v3";

    /// Whisper Large V3 Turbo model.
    pub const WHISPER_LARGE_V3_TURBO: &str = "whisper-large-v3-turbo";

    /// Distil Whisper Large V3 model.
    pub const DISTIL_WHISPER: &str = "distil-whisper-large-v3-en";

    /// Llama 3.2 Vision 90B model.
    pub const LLAMA_3_2_90B_VISION: &str = "llama-3.2-90b-vision-preview";

    /// Llama 3.2 Vision 11B model.
    pub const LLAMA_3_2_11B_VISION: &str = "llama-3.2-11b-vision-preview";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_parsing() {
        let json = r#"{
            "id": "llama-3.3-70b-versatile",
            "object": "model",
            "created": 1699999999,
            "owned_by": "groq",
            "active": true,
            "context_window": 128000
        }"#;

        let model: Model = serde_json::from_str(json).unwrap();
        assert_eq!(model.id, "llama-3.3-70b-versatile");
        assert_eq!(model.owned_by, "groq");
        assert!(model.active);
        assert_eq!(model.context_window, Some(128000));
    }

    #[test]
    fn test_model_list_parsing() {
        let json = r#"{
            "object": "list",
            "data": [
                {
                    "id": "model-1",
                    "object": "model",
                    "created": 1699999999,
                    "owned_by": "groq"
                },
                {
                    "id": "model-2",
                    "object": "model",
                    "created": 1699999999,
                    "owned_by": "meta"
                }
            ]
        }"#;

        let list: ModelList = serde_json::from_str(json).unwrap();
        assert_eq!(list.len(), 2);
        assert!(!list.is_empty());
        assert!(list.get("model-1").is_some());
        assert!(list.get("unknown").is_none());
        assert_eq!(list.by_owner("meta").len(), 1);
    }

    #[test]
    fn test_known_models() {
        assert_eq!(known::LLAMA_3_3_70B_VERSATILE, "llama-3.3-70b-versatile");
        assert_eq!(known::WHISPER_LARGE_V3, "whisper-large-v3");
    }
}
