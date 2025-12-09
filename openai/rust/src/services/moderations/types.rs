use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct ModerationRequest {
    pub input: ModerationInput,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum ModerationInput {
    Single(String),
    Multiple(Vec<String>),
}

impl ModerationRequest {
    pub fn new(input: impl Into<String>) -> Self {
        Self { input: ModerationInput::Single(input.into()), model: None }
    }

    pub fn multiple(inputs: Vec<String>) -> Self {
        Self { input: ModerationInput::Multiple(inputs), model: None }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModerationResponse {
    pub id: String,
    pub model: String,
    pub results: Vec<ModerationResult>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModerationResult {
    pub flagged: bool,
    pub categories: ModerationCategories,
    pub category_scores: ModerationCategoryScores,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModerationCategories {
    pub hate: bool,
    #[serde(rename = "hate/threatening")]
    pub hate_threatening: bool,
    pub harassment: bool,
    #[serde(rename = "harassment/threatening")]
    pub harassment_threatening: bool,
    #[serde(rename = "self-harm")]
    pub self_harm: bool,
    #[serde(rename = "self-harm/intent")]
    pub self_harm_intent: bool,
    #[serde(rename = "self-harm/instructions")]
    pub self_harm_instructions: bool,
    pub sexual: bool,
    #[serde(rename = "sexual/minors")]
    pub sexual_minors: bool,
    pub violence: bool,
    #[serde(rename = "violence/graphic")]
    pub violence_graphic: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModerationCategoryScores {
    pub hate: f64,
    #[serde(rename = "hate/threatening")]
    pub hate_threatening: f64,
    pub harassment: f64,
    #[serde(rename = "harassment/threatening")]
    pub harassment_threatening: f64,
    #[serde(rename = "self-harm")]
    pub self_harm: f64,
    #[serde(rename = "self-harm/intent")]
    pub self_harm_intent: f64,
    #[serde(rename = "self-harm/instructions")]
    pub self_harm_instructions: f64,
    pub sexual: f64,
    #[serde(rename = "sexual/minors")]
    pub sexual_minors: f64,
    pub violence: f64,
    #[serde(rename = "violence/graphic")]
    pub violence_graphic: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_moderation_request() {
        let request = ModerationRequest::new("Test text");
        assert_eq!(matches!(request.input, ModerationInput::Single(_)), true);
    }

    #[test]
    fn test_moderation_request_multiple() {
        let request = ModerationRequest::multiple(vec!["Text 1".to_string(), "Text 2".to_string()]);
        assert_eq!(matches!(request.input, ModerationInput::Multiple(_)), true);
    }
}
