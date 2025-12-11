//! Types for the Classify service.

use crate::types::{ApiMeta, TruncateOption};
use serde::{Deserialize, Serialize};

/// A classification example for few-shot learning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifyExample {
    /// The example text
    pub text: String,
    /// The label for this example
    pub label: String,
}

impl ClassifyExample {
    /// Create a new classification example
    pub fn new(text: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            label: label.into(),
        }
    }
}

/// Classify request
#[derive(Debug, Clone, Serialize)]
pub struct ClassifyRequest {
    /// Texts to classify
    pub inputs: Vec<String>,
    /// Classification examples (few-shot)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub examples: Option<Vec<ClassifyExample>>,
    /// Model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Preset (classifier ID)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset: Option<String>,
    /// Truncation behavior
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncate: Option<TruncateOption>,
}

impl ClassifyRequest {
    /// Create a new classify request
    pub fn new(inputs: Vec<String>) -> Self {
        Self {
            inputs,
            examples: None,
            model: None,
            preset: None,
            truncate: None,
        }
    }

    /// Create a request for a single input
    pub fn single(input: impl Into<String>) -> Self {
        Self::new(vec![input.into()])
    }

    /// Create a builder
    pub fn builder(inputs: Vec<String>) -> ClassifyRequestBuilder {
        ClassifyRequestBuilder::new(inputs)
    }
}

/// Builder for ClassifyRequest
#[derive(Debug, Clone)]
pub struct ClassifyRequestBuilder {
    request: ClassifyRequest,
}

impl ClassifyRequestBuilder {
    /// Create a new builder
    pub fn new(inputs: Vec<String>) -> Self {
        Self {
            request: ClassifyRequest::new(inputs),
        }
    }

    /// Add examples
    pub fn examples(mut self, examples: Vec<ClassifyExample>) -> Self {
        self.request.examples = Some(examples);
        self
    }

    /// Add a single example
    pub fn add_example(mut self, text: impl Into<String>, label: impl Into<String>) -> Self {
        let examples = self.request.examples.get_or_insert_with(Vec::new);
        examples.push(ClassifyExample::new(text, label));
        self
    }

    /// Set the model
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.request.model = Some(model.into());
        self
    }

    /// Set the preset
    pub fn preset(mut self, preset: impl Into<String>) -> Self {
        self.request.preset = Some(preset.into());
        self
    }

    /// Set truncation behavior
    pub fn truncate(mut self, truncate: TruncateOption) -> Self {
        self.request.truncate = Some(truncate);
        self
    }

    /// Build the request
    pub fn build(self) -> ClassifyRequest {
        self.request
    }
}

/// Confidence score for a label
#[derive(Debug, Clone, Deserialize)]
pub struct LabelConfidence {
    /// The label
    pub label: String,
    /// Confidence score (0 to 1)
    pub confidence: f64,
}

/// Classification result for a single input
#[derive(Debug, Clone, Deserialize)]
pub struct ClassificationResult {
    /// The input text
    pub input: String,
    /// The predicted label
    pub prediction: String,
    /// Confidence score for the prediction
    pub confidence: f64,
    /// All label confidences
    #[serde(default)]
    pub labels: Option<Vec<LabelConfidence>>,
    /// Classification ID
    #[serde(default)]
    pub id: Option<String>,
}

impl ClassificationResult {
    /// Get confidence for a specific label
    pub fn get_label_confidence(&self, label: &str) -> Option<f64> {
        self.labels
            .as_ref()
            .and_then(|labels| labels.iter().find(|l| l.label == label).map(|l| l.confidence))
    }

    /// Get all labels sorted by confidence (highest first)
    pub fn sorted_labels(&self) -> Option<Vec<&LabelConfidence>> {
        self.labels.as_ref().map(|labels| {
            let mut sorted: Vec<_> = labels.iter().collect();
            sorted.sort_by(|a, b| {
                b.confidence
                    .partial_cmp(&a.confidence)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            sorted
        })
    }
}

/// Classify response
#[derive(Debug, Clone, Deserialize)]
pub struct ClassifyResponse {
    /// Response ID
    #[serde(default)]
    pub id: Option<String>,
    /// Classification results
    pub classifications: Vec<ClassificationResult>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

impl ClassifyResponse {
    /// Get result for a specific input index
    pub fn get(&self, index: usize) -> Option<&ClassificationResult> {
        self.classifications.get(index)
    }

    /// Get all predictions
    pub fn predictions(&self) -> Vec<&str> {
        self.classifications.iter().map(|c| c.prediction.as_str()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_example() {
        let example = ClassifyExample::new("This is great!", "positive");
        assert_eq!(example.text, "This is great!");
        assert_eq!(example.label, "positive");
    }

    #[test]
    fn test_classify_request_builder() {
        let request = ClassifyRequest::builder(vec!["text1".to_string(), "text2".to_string()])
            .model("embed-english-v3.0")
            .add_example("This is great!", "positive")
            .add_example("This is terrible!", "negative")
            .build();

        assert_eq!(request.inputs.len(), 2);
        assert_eq!(request.examples.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn test_classification_result() {
        let result = ClassificationResult {
            input: "test".to_string(),
            prediction: "positive".to_string(),
            confidence: 0.9,
            labels: Some(vec![
                LabelConfidence {
                    label: "positive".to_string(),
                    confidence: 0.9,
                },
                LabelConfidence {
                    label: "negative".to_string(),
                    confidence: 0.1,
                },
            ]),
            id: None,
        };

        assert_eq!(result.get_label_confidence("positive"), Some(0.9));
        assert_eq!(result.get_label_confidence("negative"), Some(0.1));

        let sorted = result.sorted_labels().unwrap();
        assert_eq!(sorted[0].label, "positive");
    }
}
