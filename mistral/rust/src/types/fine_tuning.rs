//! Fine-tuning types for Mistral API.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Fine-tuning job status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FineTuningJobStatus {
    /// Job is queued.
    Queued,
    /// Job is started.
    Started,
    /// Job is validating.
    Validating,
    /// Job has validated.
    Validated,
    /// Job is running.
    Running,
    /// Job failed validation.
    FailedValidation,
    /// Job failed.
    Failed,
    /// Job succeeded.
    Success,
    /// Job was cancelled.
    Cancelled,
    /// Job is cancelling.
    Cancelling,
}

/// Hyperparameters for fine-tuning.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FineTuningHyperparameters {
    /// Number of training epochs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub training_steps: Option<u32>,
    /// Learning rate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub learning_rate: Option<f64>,
    /// Weight decay.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight_decay: Option<f64>,
    /// Warmup fraction.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warmup_fraction: Option<f64>,
    /// Epochs (alternative to training_steps).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub epochs: Option<f64>,
    /// LoRA r parameter.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lora_r: Option<u32>,
    /// LoRA alpha parameter.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lora_alpha: Option<f64>,
    /// Sequence length.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seq_len: Option<u32>,
}

impl FineTuningHyperparameters {
    /// Creates a new hyperparameters builder.
    pub fn builder() -> FineTuningHyperparametersBuilder {
        FineTuningHyperparametersBuilder::default()
    }
}

/// Builder for fine-tuning hyperparameters.
#[derive(Default)]
pub struct FineTuningHyperparametersBuilder {
    inner: FineTuningHyperparameters,
}

impl FineTuningHyperparametersBuilder {
    /// Sets training steps.
    pub fn training_steps(mut self, steps: u32) -> Self {
        self.inner.training_steps = Some(steps);
        self
    }

    /// Sets learning rate.
    pub fn learning_rate(mut self, rate: f64) -> Self {
        self.inner.learning_rate = Some(rate);
        self
    }

    /// Sets weight decay.
    pub fn weight_decay(mut self, decay: f64) -> Self {
        self.inner.weight_decay = Some(decay);
        self
    }

    /// Sets warmup fraction.
    pub fn warmup_fraction(mut self, fraction: f64) -> Self {
        self.inner.warmup_fraction = Some(fraction);
        self
    }

    /// Sets epochs.
    pub fn epochs(mut self, epochs: f64) -> Self {
        self.inner.epochs = Some(epochs);
        self
    }

    /// Sets LoRA r parameter.
    pub fn lora_r(mut self, r: u32) -> Self {
        self.inner.lora_r = Some(r);
        self
    }

    /// Sets LoRA alpha parameter.
    pub fn lora_alpha(mut self, alpha: f64) -> Self {
        self.inner.lora_alpha = Some(alpha);
        self
    }

    /// Sets sequence length.
    pub fn seq_len(mut self, len: u32) -> Self {
        self.inner.seq_len = Some(len);
        self
    }

    /// Builds the hyperparameters.
    pub fn build(self) -> FineTuningHyperparameters {
        self.inner
    }
}

/// Integration with Weights & Biases.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WandbIntegration {
    /// W&B project name.
    pub project: String,
    /// W&B run name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// W&B API key.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
}

/// Fine-tuning integrations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum FineTuningIntegration {
    /// Weights & Biases integration.
    Wandb(WandbIntegration),
}

/// Fine-tuning job creation request.
#[derive(Debug, Clone, Serialize)]
pub struct CreateFineTuningJobRequest {
    /// Base model to fine-tune.
    pub model: String,
    /// Training file ID.
    pub training_files: Vec<TrainingFile>,
    /// Validation file ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_files: Option<Vec<String>>,
    /// Hyperparameters.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hyperparameters: Option<FineTuningHyperparameters>,
    /// Suffix for the fine-tuned model name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suffix: Option<String>,
    /// Integrations.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub integrations: Option<Vec<FineTuningIntegration>>,
    /// Auto-start the job.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_start: Option<bool>,
}

/// Training file reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingFile {
    /// File ID.
    pub file_id: String,
    /// Weight for this file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<f64>,
}

impl TrainingFile {
    /// Creates a new training file reference.
    pub fn new(file_id: impl Into<String>) -> Self {
        Self {
            file_id: file_id.into(),
            weight: None,
        }
    }

    /// Sets the weight.
    pub fn with_weight(mut self, weight: f64) -> Self {
        self.weight = Some(weight);
        self
    }
}

impl CreateFineTuningJobRequest {
    /// Creates a new builder.
    pub fn builder() -> CreateFineTuningJobRequestBuilder {
        CreateFineTuningJobRequestBuilder::default()
    }
}

/// Builder for fine-tuning job creation requests.
#[derive(Default)]
pub struct CreateFineTuningJobRequestBuilder {
    model: Option<String>,
    training_files: Vec<TrainingFile>,
    validation_files: Option<Vec<String>>,
    hyperparameters: Option<FineTuningHyperparameters>,
    suffix: Option<String>,
    integrations: Option<Vec<FineTuningIntegration>>,
    auto_start: Option<bool>,
}

impl CreateFineTuningJobRequestBuilder {
    /// Sets the model.
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    /// Adds a training file.
    pub fn training_file(mut self, file: TrainingFile) -> Self {
        self.training_files.push(file);
        self
    }

    /// Adds a validation file.
    pub fn validation_file(mut self, file_id: impl Into<String>) -> Self {
        self.validation_files
            .get_or_insert_with(Vec::new)
            .push(file_id.into());
        self
    }

    /// Sets hyperparameters.
    pub fn hyperparameters(mut self, params: FineTuningHyperparameters) -> Self {
        self.hyperparameters = Some(params);
        self
    }

    /// Sets the suffix.
    pub fn suffix(mut self, suffix: impl Into<String>) -> Self {
        self.suffix = Some(suffix.into());
        self
    }

    /// Adds an integration.
    pub fn integration(mut self, integration: FineTuningIntegration) -> Self {
        self.integrations
            .get_or_insert_with(Vec::new)
            .push(integration);
        self
    }

    /// Sets auto-start.
    pub fn auto_start(mut self, auto_start: bool) -> Self {
        self.auto_start = Some(auto_start);
        self
    }

    /// Builds the request.
    pub fn build(self) -> CreateFineTuningJobRequest {
        CreateFineTuningJobRequest {
            model: self.model.unwrap_or_else(|| "open-mistral-7b".to_string()),
            training_files: self.training_files,
            validation_files: self.validation_files,
            hyperparameters: self.hyperparameters,
            suffix: self.suffix,
            integrations: self.integrations,
            auto_start: self.auto_start,
        }
    }
}

/// Fine-tuning job.
#[derive(Debug, Clone, Deserialize)]
pub struct FineTuningJob {
    /// Job ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Base model.
    pub model: String,
    /// Job status.
    pub status: FineTuningJobStatus,
    /// Training files.
    pub training_files: Vec<String>,
    /// Validation files.
    #[serde(default)]
    pub validation_files: Vec<String>,
    /// Hyperparameters used.
    #[serde(default)]
    pub hyperparameters: FineTuningHyperparameters,
    /// Fine-tuned model name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fine_tuned_model: Option<String>,
    /// Creation timestamp.
    pub created_at: i64,
    /// Modification timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<i64>,
    /// Suffix.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suffix: Option<String>,
    /// Integrations.
    #[serde(default)]
    pub integrations: Vec<FineTuningIntegration>,
    /// Trained tokens.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trained_tokens: Option<u64>,
    /// Metadata.
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

/// Response from listing fine-tuning jobs.
#[derive(Debug, Clone, Deserialize)]
pub struct FineTuningJobListResponse {
    /// Object type.
    pub object: String,
    /// List of jobs.
    pub data: Vec<FineTuningJob>,
    /// Total count.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u32>,
}

/// Fine-tuning event.
#[derive(Debug, Clone, Deserialize)]
pub struct FineTuningEvent {
    /// Event name.
    pub name: String,
    /// Event data.
    #[serde(default)]
    pub data: HashMap<String, serde_json::Value>,
    /// Event timestamp.
    pub created_at: i64,
}

/// Checkpoint from fine-tuning.
#[derive(Debug, Clone, Deserialize)]
pub struct FineTuningCheckpoint {
    /// Checkpoint metrics.
    pub metrics: CheckpointMetrics,
    /// Step number.
    pub step_number: u32,
    /// Creation timestamp.
    pub created_at: i64,
}

/// Metrics for a checkpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct CheckpointMetrics {
    /// Training loss.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub train_loss: Option<f64>,
    /// Validation loss.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valid_loss: Option<f64>,
    /// Validation mean per-token accuracy.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valid_mean_token_accuracy: Option<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_job_status_serialization() {
        assert_eq!(
            serde_json::to_string(&FineTuningJobStatus::Running).unwrap(),
            "\"RUNNING\""
        );
        assert_eq!(
            serde_json::to_string(&FineTuningJobStatus::Success).unwrap(),
            "\"SUCCESS\""
        );
    }

    #[test]
    fn test_hyperparameters_builder() {
        let params = FineTuningHyperparameters::builder()
            .learning_rate(1e-5)
            .epochs(3.0)
            .build();

        assert_eq!(params.learning_rate, Some(1e-5));
        assert_eq!(params.epochs, Some(3.0));
    }

    #[test]
    fn test_request_builder() {
        let request = CreateFineTuningJobRequest::builder()
            .model("open-mistral-7b")
            .training_file(TrainingFile::new("file-123"))
            .suffix("my-model")
            .auto_start(true)
            .build();

        assert_eq!(request.model, "open-mistral-7b");
        assert_eq!(request.training_files.len(), 1);
        assert_eq!(request.suffix, Some("my-model".to_string()));
        assert_eq!(request.auto_start, Some(true));
    }

    #[test]
    fn test_training_file_with_weight() {
        let file = TrainingFile::new("file-123").with_weight(0.8);
        assert_eq!(file.file_id, "file-123");
        assert_eq!(file.weight, Some(0.8));
    }
}
