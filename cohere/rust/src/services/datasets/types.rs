//! Types for the Datasets service.

use crate::types::ApiMeta;
use serde::{Deserialize, Serialize};

/// Dataset type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatasetType {
    /// Embed input dataset
    EmbedInput,
    /// Embed result dataset
    EmbedResult,
    /// Rerank queries dataset
    RerankQueries,
    /// Single-label classification dataset
    SingleLabelClassification,
    /// Chat fine-tuning dataset
    ChatFinetune,
    /// Chat messages export dataset
    ChatMessagesExport,
}

/// Dataset status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DatasetStatus {
    /// Unknown status
    Unknown,
    /// Dataset is being validated
    Validating,
    /// Dataset failed validation
    Failed,
    /// Dataset is validated and ready
    Validated,
    /// Dataset has been skipped
    Skipped,
}

/// Dataset usage information
#[derive(Debug, Clone, Deserialize)]
pub struct DatasetUsage {
    /// Number of rows in the dataset
    #[serde(default)]
    pub row_count: Option<u64>,
    /// Size in bytes
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

/// A part of a dataset
#[derive(Debug, Clone, Deserialize)]
pub struct DatasetPart {
    /// Part ID
    pub id: String,
    /// Part name
    #[serde(default)]
    pub name: Option<String>,
    /// Number of rows
    #[serde(default)]
    pub num_rows: Option<u64>,
    /// Size in bytes
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

/// A dataset
#[derive(Debug, Clone, Deserialize)]
pub struct Dataset {
    /// Dataset ID
    pub id: String,
    /// Dataset name
    pub name: String,
    /// Dataset type
    #[serde(rename = "dataset_type")]
    pub dataset_type: DatasetType,
    /// Validation status
    pub validation_status: DatasetStatus,
    /// Creation time
    #[serde(default)]
    pub created_at: Option<String>,
    /// Last update time
    #[serde(default)]
    pub updated_at: Option<String>,
    /// Dataset parts
    #[serde(default)]
    pub dataset_parts: Option<Vec<DatasetPart>>,
    /// Usage information
    #[serde(default)]
    pub usage: Option<DatasetUsage>,
    /// Validation error (if failed)
    #[serde(default)]
    pub validation_error: Option<String>,
    /// Validation warnings
    #[serde(default)]
    pub validation_warnings: Option<Vec<String>>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

impl Dataset {
    /// Check if the dataset is ready to use
    pub fn is_ready(&self) -> bool {
        self.validation_status == DatasetStatus::Validated
    }

    /// Check if the dataset failed validation
    pub fn is_failed(&self) -> bool {
        self.validation_status == DatasetStatus::Failed
    }

    /// Get total row count across all parts
    pub fn total_rows(&self) -> u64 {
        self.dataset_parts
            .as_ref()
            .map(|parts| parts.iter().filter_map(|p| p.num_rows).sum())
            .unwrap_or(0)
    }

    /// Get total size in bytes
    pub fn total_size_bytes(&self) -> u64 {
        self.dataset_parts
            .as_ref()
            .map(|parts| parts.iter().filter_map(|p| p.size_bytes).sum())
            .unwrap_or(0)
    }
}

/// Request to create a dataset
#[derive(Debug, Clone, Serialize)]
pub struct CreateDatasetRequest {
    /// Dataset name
    pub name: String,
    /// Dataset type
    #[serde(rename = "type")]
    pub dataset_type: DatasetType,
    /// Whether to keep original files
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keep_original_file: Option<bool>,
    /// Whether to skip malformed rows
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip_malformed_input: Option<bool>,
}

impl CreateDatasetRequest {
    /// Create a new dataset request
    pub fn new(name: impl Into<String>, dataset_type: DatasetType) -> Self {
        Self {
            name: name.into(),
            dataset_type,
            keep_original_file: None,
            skip_malformed_input: None,
        }
    }

    /// Keep original files
    pub fn keep_original_file(mut self, keep: bool) -> Self {
        self.keep_original_file = Some(keep);
        self
    }

    /// Skip malformed input
    pub fn skip_malformed_input(mut self, skip: bool) -> Self {
        self.skip_malformed_input = Some(skip);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dataset_type_serialization() {
        let embed = DatasetType::EmbedInput;
        assert_eq!(serde_json::to_string(&embed).unwrap(), "\"embed_input\"");
    }

    #[test]
    fn test_dataset_status() {
        let validated = DatasetStatus::Validated;
        assert_eq!(serde_json::to_string(&validated).unwrap(), "\"validated\"");
    }

    #[test]
    fn test_dataset_is_ready() {
        let dataset = Dataset {
            id: "123".to_string(),
            name: "test".to_string(),
            dataset_type: DatasetType::EmbedInput,
            validation_status: DatasetStatus::Validated,
            created_at: None,
            updated_at: None,
            dataset_parts: None,
            usage: None,
            validation_error: None,
            validation_warnings: None,
            meta: None,
        };

        assert!(dataset.is_ready());
        assert!(!dataset.is_failed());
    }

    #[test]
    fn test_create_dataset_request() {
        let request = CreateDatasetRequest::new("my-dataset", DatasetType::EmbedInput)
            .keep_original_file(true)
            .skip_malformed_input(true);

        assert_eq!(request.name, "my-dataset");
        assert_eq!(request.dataset_type, DatasetType::EmbedInput);
        assert_eq!(request.keep_original_file, Some(true));
    }
}
