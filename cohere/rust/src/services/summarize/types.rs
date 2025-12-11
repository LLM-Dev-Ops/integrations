//! Types for the Summarize service.

use crate::types::ApiMeta;
use serde::{Deserialize, Serialize};

/// Output format for summarization
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SummarizeFormat {
    /// Paragraph format
    Paragraph,
    /// Bullet points
    Bullets,
}

impl Default for SummarizeFormat {
    fn default() -> Self {
        Self::Paragraph
    }
}

/// Length of the summary
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SummarizeLength {
    /// Short summary
    Short,
    /// Medium length summary
    Medium,
    /// Long summary
    Long,
    /// Auto-determine length
    Auto,
}

impl Default for SummarizeLength {
    fn default() -> Self {
        Self::Medium
    }
}

/// Extractiveness of the summary
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SummarizeExtractiveness {
    /// Low extractiveness (more abstractive)
    Low,
    /// Medium extractiveness
    Medium,
    /// High extractiveness (more extractive)
    High,
    /// Auto-determine extractiveness
    Auto,
}

impl Default for SummarizeExtractiveness {
    fn default() -> Self {
        Self::Medium
    }
}

/// Summarize request
#[derive(Debug, Clone, Serialize)]
pub struct SummarizeRequest {
    /// Text to summarize
    pub text: String,
    /// Model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Output format
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<SummarizeFormat>,
    /// Summary length
    #[serde(skip_serializing_if = "Option::is_none")]
    pub length: Option<SummarizeLength>,
    /// Extractiveness
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extractiveness: Option<SummarizeExtractiveness>,
    /// Temperature (0.0 to 5.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Additional command/prompt
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_command: Option<String>,
}

impl SummarizeRequest {
    /// Create a new summarize request
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            model: None,
            format: None,
            length: None,
            extractiveness: None,
            temperature: None,
            additional_command: None,
        }
    }

    /// Create a builder
    pub fn builder(text: impl Into<String>) -> SummarizeRequestBuilder {
        SummarizeRequestBuilder::new(text)
    }
}

/// Builder for SummarizeRequest
#[derive(Debug, Clone)]
pub struct SummarizeRequestBuilder {
    request: SummarizeRequest,
}

impl SummarizeRequestBuilder {
    /// Create a new builder
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            request: SummarizeRequest::new(text),
        }
    }

    /// Set the model
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.request.model = Some(model.into());
        self
    }

    /// Set the format
    pub fn format(mut self, format: SummarizeFormat) -> Self {
        self.request.format = Some(format);
        self
    }

    /// Set the length
    pub fn length(mut self, length: SummarizeLength) -> Self {
        self.request.length = Some(length);
        self
    }

    /// Set the extractiveness
    pub fn extractiveness(mut self, extractiveness: SummarizeExtractiveness) -> Self {
        self.request.extractiveness = Some(extractiveness);
        self
    }

    /// Set the temperature
    pub fn temperature(mut self, temperature: f32) -> Self {
        self.request.temperature = Some(temperature);
        self
    }

    /// Set an additional command
    pub fn additional_command(mut self, command: impl Into<String>) -> Self {
        self.request.additional_command = Some(command.into());
        self
    }

    /// Build the request
    pub fn build(self) -> SummarizeRequest {
        self.request
    }
}

/// Summarize response
#[derive(Debug, Clone, Deserialize)]
pub struct SummarizeResponse {
    /// Response ID
    #[serde(default)]
    pub id: Option<String>,
    /// The summary text
    pub summary: String,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_summarize_format_serialization() {
        let paragraph = SummarizeFormat::Paragraph;
        assert_eq!(serde_json::to_string(&paragraph).unwrap(), "\"paragraph\"");

        let bullets = SummarizeFormat::Bullets;
        assert_eq!(serde_json::to_string(&bullets).unwrap(), "\"bullets\"");
    }

    #[test]
    fn test_summarize_length_serialization() {
        let short = SummarizeLength::Short;
        assert_eq!(serde_json::to_string(&short).unwrap(), "\"short\"");

        let medium = SummarizeLength::Medium;
        assert_eq!(serde_json::to_string(&medium).unwrap(), "\"medium\"");
    }

    #[test]
    fn test_summarize_request_builder() {
        let request = SummarizeRequest::builder("This is a long text to summarize...")
            .model("command")
            .format(SummarizeFormat::Bullets)
            .length(SummarizeLength::Short)
            .extractiveness(SummarizeExtractiveness::High)
            .temperature(0.5)
            .build();

        assert_eq!(request.text, "This is a long text to summarize...");
        assert_eq!(request.model, Some("command".to_string()));
        assert_eq!(request.format, Some(SummarizeFormat::Bullets));
        assert_eq!(request.length, Some(SummarizeLength::Short));
        assert_eq!(request.extractiveness, Some(SummarizeExtractiveness::High));
        assert_eq!(request.temperature, Some(0.5));
    }
}
