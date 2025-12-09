use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FineTuningJobStatus {
    ValidatingFiles,
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
pub struct FineTuningJobRequest {
    pub model: String,
    pub training_file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hyperparameters: Option<Hyperparameters>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suffix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hyperparameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_epochs: Option<HyperparameterValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_size: Option<HyperparameterValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub learning_rate_multiplier: Option<HyperparameterValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HyperparameterValue {
    Auto(String),
    Number(f64),
}

impl FineTuningJobRequest {
    pub fn new(model: impl Into<String>, training_file: impl Into<String>) -> Self {
        Self { model: model.into(), training_file: training_file.into(), validation_file: None, hyperparameters: None, suffix: None }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct FineTuningJob {
    pub id: String,
    pub object: String,
    pub created_at: i64,
    pub finished_at: Option<i64>,
    pub model: String,
    pub fine_tuned_model: Option<String>,
    pub organization_id: String,
    pub status: FineTuningJobStatus,
    pub hyperparameters: Hyperparameters,
    pub training_file: String,
    pub validation_file: Option<String>,
    pub result_files: Vec<String>,
    pub trained_tokens: Option<u64>,
    pub error: Option<FineTuningError>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FineTuningError {
    pub code: String,
    pub message: String,
    pub param: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FineTuningJobListResponse {
    pub object: String,
    pub data: Vec<FineTuningJob>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FineTuningEvent {
    pub id: String,
    pub object: String,
    pub created_at: i64,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FineTuningEventListResponse {
    pub object: String,
    pub data: Vec<FineTuningEvent>,
    pub has_more: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fine_tuning_request() {
        let request = FineTuningJobRequest::new("gpt-3.5-turbo", "file-123");
        assert_eq!(request.model, "gpt-3.5-turbo");
        assert_eq!(request.training_file, "file-123");
    }
}
