//! Batch processing types for Mistral API.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Batch job status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BatchStatus {
    /// Batch is queued.
    Queued,
    /// Batch is running.
    Running,
    /// Batch succeeded.
    Success,
    /// Batch failed.
    Failed,
    /// Batch timed out.
    TimedOut,
    /// Batch was cancelled.
    Cancelled,
    /// Batch is cancelling.
    Cancelling,
}

/// Batch job creation request.
#[derive(Debug, Clone, Serialize)]
pub struct CreateBatchRequest {
    /// Input file ID.
    pub input_files: Vec<String>,
    /// Endpoint to call (e.g., /v1/chat/completions).
    pub endpoint: String,
    /// Model to use.
    pub model: String,
    /// Optional metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
    /// Timeout in hours.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_hours: Option<u32>,
}

impl CreateBatchRequest {
    /// Creates a new batch request.
    pub fn new(
        input_files: Vec<String>,
        endpoint: impl Into<String>,
        model: impl Into<String>,
    ) -> Self {
        Self {
            input_files,
            endpoint: endpoint.into(),
            model: model.into(),
            metadata: None,
            timeout_hours: None,
        }
    }

    /// Creates a new builder.
    pub fn builder() -> CreateBatchRequestBuilder {
        CreateBatchRequestBuilder::default()
    }
}

/// Builder for batch requests.
#[derive(Default)]
pub struct CreateBatchRequestBuilder {
    input_files: Vec<String>,
    endpoint: Option<String>,
    model: Option<String>,
    metadata: Option<HashMap<String, String>>,
    timeout_hours: Option<u32>,
}

impl CreateBatchRequestBuilder {
    /// Adds an input file.
    pub fn input_file(mut self, file_id: impl Into<String>) -> Self {
        self.input_files.push(file_id.into());
        self
    }

    /// Sets input files.
    pub fn input_files(mut self, files: Vec<String>) -> Self {
        self.input_files = files;
        self
    }

    /// Sets the endpoint.
    pub fn endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = Some(endpoint.into());
        self
    }

    /// Sets the model.
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    /// Adds metadata.
    pub fn metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata
            .get_or_insert_with(HashMap::new)
            .insert(key.into(), value.into());
        self
    }

    /// Sets timeout in hours.
    pub fn timeout_hours(mut self, hours: u32) -> Self {
        self.timeout_hours = Some(hours);
        self
    }

    /// Builds the request.
    pub fn build(self) -> CreateBatchRequest {
        CreateBatchRequest {
            input_files: self.input_files,
            endpoint: self.endpoint.unwrap_or_else(|| "/v1/chat/completions".to_string()),
            model: self.model.unwrap_or_else(|| "mistral-large-latest".to_string()),
            metadata: self.metadata,
            timeout_hours: self.timeout_hours,
        }
    }
}

/// Batch job.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchJob {
    /// Batch ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Input files.
    pub input_files: Vec<String>,
    /// Endpoint.
    pub endpoint: String,
    /// Model.
    pub model: String,
    /// Output file ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_file: Option<String>,
    /// Error file ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_file: Option<String>,
    /// Status.
    pub status: BatchStatus,
    /// Creation timestamp.
    pub created_at: i64,
    /// Started timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
    /// Completed timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<i64>,
    /// Metadata.
    #[serde(default)]
    pub metadata: HashMap<String, String>,
    /// Total requests.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_requests: Option<u32>,
    /// Completed requests.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_requests: Option<u32>,
    /// Succeeded requests.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub succeeded_requests: Option<u32>,
    /// Failed requests.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_requests: Option<u32>,
}

/// Response from listing batch jobs.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchListResponse {
    /// Object type.
    pub object: String,
    /// List of batches.
    pub data: Vec<BatchJob>,
    /// Total count.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u32>,
}

/// A single request in a batch input file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchInputRequest {
    /// Custom ID for this request.
    pub custom_id: String,
    /// Request body.
    pub body: serde_json::Value,
}

impl BatchInputRequest {
    /// Creates a new batch input request.
    pub fn new(custom_id: impl Into<String>, body: serde_json::Value) -> Self {
        Self {
            custom_id: custom_id.into(),
            body,
        }
    }
}

/// A single response from a batch output file.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchOutputResponse {
    /// Custom ID matching the request.
    pub custom_id: String,
    /// Response data.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<BatchResponseData>,
    /// Error if request failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BatchError>,
}

/// Response data from a batch request.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchResponseData {
    /// HTTP status code.
    pub status_code: u16,
    /// Response body.
    pub body: serde_json::Value,
}

/// Error from a batch request.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchError {
    /// Error code.
    pub code: String,
    /// Error message.
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_batch_status_serialization() {
        assert_eq!(
            serde_json::to_string(&BatchStatus::Running).unwrap(),
            "\"RUNNING\""
        );
        assert_eq!(
            serde_json::to_string(&BatchStatus::Success).unwrap(),
            "\"SUCCESS\""
        );
    }

    #[test]
    fn test_create_batch_request() {
        let request = CreateBatchRequest::new(
            vec!["file-123".to_string()],
            "/v1/chat/completions",
            "mistral-large-latest",
        );
        assert_eq!(request.input_files.len(), 1);
        assert_eq!(request.endpoint, "/v1/chat/completions");
    }

    #[test]
    fn test_batch_request_builder() {
        let request = CreateBatchRequest::builder()
            .input_file("file-123")
            .endpoint("/v1/chat/completions")
            .model("mistral-large-latest")
            .metadata("env", "production")
            .timeout_hours(24)
            .build();

        assert_eq!(request.input_files, vec!["file-123"]);
        assert_eq!(request.timeout_hours, Some(24));
        assert!(request.metadata.is_some());
    }

    #[test]
    fn test_batch_input_request() {
        let request = BatchInputRequest::new(
            "req-1",
            json!({
                "model": "mistral-large-latest",
                "messages": [{"role": "user", "content": "Hello"}]
            }),
        );
        assert_eq!(request.custom_id, "req-1");
    }

    #[test]
    fn test_batch_job_deserialization() {
        let json = r#"{
            "id": "batch-123",
            "object": "batch",
            "input_files": ["file-123"],
            "endpoint": "/v1/chat/completions",
            "model": "mistral-large-latest",
            "status": "RUNNING",
            "created_at": 1700000000,
            "total_requests": 100,
            "completed_requests": 50
        }"#;

        let batch: BatchJob = serde_json::from_str(json).unwrap();
        assert_eq!(batch.id, "batch-123");
        assert_eq!(batch.status, BatchStatus::Running);
        assert_eq!(batch.total_requests, Some(100));
    }
}
