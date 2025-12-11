//! Types for the Fine-tune service.

use crate::types::ApiMeta;
use serde::{Deserialize, Serialize};

/// Fine-tune job status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FineTuneStatus {
    /// Job is not started
    NotStarted,
    /// Job is queued
    Queued,
    /// Fine-tuning in progress
    FinetuningInProgress,
    /// Deploying the model
    Deploying,
    /// Fine-tune is ready
    Ready,
    /// Job failed
    Failed,
    /// Job was cancelled
    Cancelled,
    /// Job is paused
    Paused,
    /// Unknown status
    Unknown,
}

impl FineTuneStatus {
    /// Check if the fine-tune is complete
    pub fn is_complete(&self) -> bool {
        matches!(self, FineTuneStatus::Ready | FineTuneStatus::Failed | FineTuneStatus::Cancelled)
    }

    /// Check if the fine-tune is in progress
    pub fn is_in_progress(&self) -> bool {
        matches!(
            self,
            FineTuneStatus::Queued
                | FineTuneStatus::FinetuningInProgress
                | FineTuneStatus::Deploying
        )
    }

    /// Check if the fine-tune is ready
    pub fn is_ready(&self) -> bool {
        matches!(self, FineTuneStatus::Ready)
    }
}

/// Hyperparameters for fine-tuning
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FineTuneHyperparameters {
    /// Number of training epochs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub train_epochs: Option<u32>,
    /// Learning rate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub learning_rate: Option<f64>,
    /// Batch size
    #[serde(skip_serializing_if = "Option::is_none")]
    pub train_batch_size: Option<u32>,
    /// Early stopping patience
    #[serde(skip_serializing_if = "Option::is_none")]
    pub early_stopping_patience: Option<u32>,
    /// Early stopping threshold
    #[serde(skip_serializing_if = "Option::is_none")]
    pub early_stopping_threshold: Option<f64>,
}

impl FineTuneHyperparameters {
    /// Create new hyperparameters with defaults
    pub fn new() -> Self {
        Self::default()
    }

    /// Set training epochs
    pub fn train_epochs(mut self, epochs: u32) -> Self {
        self.train_epochs = Some(epochs);
        self
    }

    /// Set learning rate
    pub fn learning_rate(mut self, rate: f64) -> Self {
        self.learning_rate = Some(rate);
        self
    }

    /// Set batch size
    pub fn train_batch_size(mut self, size: u32) -> Self {
        self.train_batch_size = Some(size);
        self
    }
}

/// Settings for fine-tuning
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FineTuneSettings {
    /// Base model to fine-tune
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_model: Option<FineTuneBaseModel>,
    /// Dataset ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dataset_id: Option<String>,
    /// Hyperparameters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hyperparameters: Option<FineTuneHyperparameters>,
}

/// Base model for fine-tuning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FineTuneBaseModel {
    /// Base model type
    #[serde(rename = "base_type")]
    pub base_type: String,
    /// Model name/ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl FineTuneBaseModel {
    /// Create a new base model
    pub fn new(base_type: impl Into<String>) -> Self {
        Self {
            base_type: base_type.into(),
            name: None,
        }
    }
}

/// A fine-tuned model
#[derive(Debug, Clone, Deserialize)]
pub struct FinetuneModel {
    /// Fine-tune ID
    pub id: String,
    /// Fine-tune name
    pub name: String,
    /// Status
    pub status: FineTuneStatus,
    /// Settings
    #[serde(default)]
    pub settings: Option<FineTuneSettings>,
    /// Creation time
    #[serde(default)]
    pub created_at: Option<String>,
    /// Completion time
    #[serde(default)]
    pub completed_at: Option<String>,
    /// Last used time
    #[serde(default)]
    pub last_used: Option<String>,
    /// Model ID (when ready)
    #[serde(default)]
    pub model_id: Option<String>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

impl FinetuneModel {
    /// Get the model ID for use in API calls (if ready)
    pub fn model_name(&self) -> Option<&str> {
        if self.status.is_ready() {
            self.model_id.as_deref().or(Some(&self.id))
        } else {
            None
        }
    }
}

/// Request to create a fine-tune
#[derive(Debug, Clone, Serialize)]
pub struct CreateFinetuneRequest {
    /// Fine-tune name
    pub name: String,
    /// Settings
    pub settings: FineTuneSettings,
}

impl CreateFinetuneRequest {
    /// Create a new fine-tune request
    pub fn new(name: impl Into<String>, base_model: impl Into<String>, dataset_id: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            settings: FineTuneSettings {
                base_model: Some(FineTuneBaseModel::new(base_model)),
                dataset_id: Some(dataset_id.into()),
                hyperparameters: None,
            },
        }
    }

    /// Add hyperparameters
    pub fn hyperparameters(mut self, params: FineTuneHyperparameters) -> Self {
        self.settings.hyperparameters = Some(params);
        self
    }
}

/// Response from listing fine-tunes
#[derive(Debug, Clone, Deserialize)]
pub struct ListFinetuneResponse {
    /// List of fine-tunes
    pub finetuned_models: Vec<FinetuneModel>,
    /// Next page token
    #[serde(default)]
    pub next_page_token: Option<String>,
    /// Total count
    #[serde(default)]
    pub total_size: Option<u64>,
}

impl ListFinetuneResponse {
    /// Check if there are more pages
    pub fn has_more(&self) -> bool {
        self.next_page_token.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_finetune_status() {
        assert!(FineTuneStatus::Ready.is_ready());
        assert!(FineTuneStatus::FinetuningInProgress.is_in_progress());
        assert!(FineTuneStatus::Failed.is_complete());
    }

    #[test]
    fn test_hyperparameters() {
        let params = FineTuneHyperparameters::new()
            .train_epochs(5)
            .learning_rate(0.001)
            .train_batch_size(16);

        assert_eq!(params.train_epochs, Some(5));
        assert_eq!(params.learning_rate, Some(0.001));
        assert_eq!(params.train_batch_size, Some(16));
    }

    #[test]
    fn test_create_finetune_request() {
        let request = CreateFinetuneRequest::new("my-model", "command", "dataset-123")
            .hyperparameters(FineTuneHyperparameters::new().train_epochs(3));

        assert_eq!(request.name, "my-model");
        assert!(request.settings.hyperparameters.is_some());
    }
}
