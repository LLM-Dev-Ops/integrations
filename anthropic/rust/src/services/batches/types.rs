//! Type definitions for the Batches API

use crate::services::messages::CreateMessageRequest;
use serde::{Deserialize, Serialize};

/// Status of a message batch
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchStatus {
    /// Batch is being processed
    InProgress,
    /// Batch processing has ended
    Ended,
    /// Batch is being canceled
    Canceling,
    /// Batch has been canceled
    Canceled,
}

/// Processing status with request counts
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct BatchProcessingStatus {
    /// Number of requests that succeeded
    pub succeeded: u32,
    /// Number of requests that errored
    pub errored: u32,
    /// Number of requests that expired
    pub expired: u32,
    /// Number of requests that were canceled
    pub canceled: u32,
}

impl BatchProcessingStatus {
    /// Create a new empty processing status
    pub fn new() -> Self {
        Self {
            succeeded: 0,
            errored: 0,
            expired: 0,
            canceled: 0,
        }
    }

    /// Get the total number of processed requests
    pub fn total(&self) -> u32 {
        self.succeeded + self.errored + self.expired + self.canceled
    }
}

impl Default for BatchProcessingStatus {
    fn default() -> Self {
        Self::new()
    }
}

/// A message batch
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MessageBatch {
    /// Unique batch identifier
    pub id: String,
    /// Type field (always "message_batch")
    #[serde(rename = "type")]
    pub type_: String,
    /// Current processing status
    pub processing_status: BatchStatus,
    /// Request counts
    pub request_counts: BatchProcessingStatus,
    /// When the batch processing ended (ISO 8601 format)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    /// When the batch was created (ISO 8601 format)
    pub created_at: String,
    /// When the batch will expire (ISO 8601 format)
    pub expires_at: String,
    /// When cancellation was initiated (ISO 8601 format)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancel_initiated_at: Option<String>,
    /// URL to download batch results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub results_url: Option<String>,
}

/// Request to create a batch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBatchRequest {
    /// List of batch requests to process
    pub requests: Vec<BatchRequest>,
}

impl CreateBatchRequest {
    /// Create a new batch request
    pub fn new(requests: Vec<BatchRequest>) -> Self {
        Self { requests }
    }
}

/// A single request within a batch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchRequest {
    /// Custom identifier for this request (must be unique within the batch)
    pub custom_id: String,
    /// The message request parameters
    pub params: CreateMessageRequest,
}

impl BatchRequest {
    /// Create a new batch request
    pub fn new(custom_id: impl Into<String>, params: CreateMessageRequest) -> Self {
        Self {
            custom_id: custom_id.into(),
            params,
        }
    }
}

/// Parameters for listing batches
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BatchListParams {
    /// List batches before this ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before_id: Option<String>,
    /// List batches after this ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after_id: Option<String>,
    /// Maximum number of batches to return (1-100, default 20)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

impl BatchListParams {
    /// Create new empty list parameters
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the before_id cursor
    pub fn with_before_id(mut self, before_id: impl Into<String>) -> Self {
        self.before_id = Some(before_id.into());
        self
    }

    /// Set the after_id cursor
    pub fn with_after_id(mut self, after_id: impl Into<String>) -> Self {
        self.after_id = Some(after_id.into());
        self
    }

    /// Set the limit
    pub fn with_limit(mut self, limit: u32) -> Self {
        self.limit = Some(limit);
        self
    }
}

/// Response from listing batches
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BatchListResponse {
    /// List of batches
    pub data: Vec<MessageBatch>,
    /// Whether there are more results
    pub has_more: bool,
    /// ID of the first batch in the list
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_id: Option<String>,
    /// ID of the last batch in the list
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_id: Option<String>,
}

impl BatchListResponse {
    /// Create a new batch list response
    pub fn new(data: Vec<MessageBatch>, has_more: bool) -> Self {
        let first_id = data.first().map(|b| b.id.clone());
        let last_id = data.last().map(|b| b.id.clone());

        Self {
            data,
            has_more,
            first_id,
            last_id,
        }
    }
}

/// A single result from a batch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    /// The custom_id from the request
    pub custom_id: String,
    /// The result type
    #[serde(rename = "type")]
    pub result_type: String,
    /// The message result (if successful)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<crate::services::messages::Message>,
    /// Error information (if failed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BatchError>,
}

/// Error information for a failed batch request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchError {
    /// Error type
    #[serde(rename = "type")]
    pub error_type: String,
    /// Error message
    pub message: String,
}

/// Response from downloading batch results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResultsResponse {
    /// List of results (one per request in the batch)
    pub results: Vec<BatchResult>,
}

impl BatchResultsResponse {
    /// Create a new batch results response
    pub fn new(results: Vec<BatchResult>) -> Self {
        Self { results }
    }

    /// Get results that succeeded
    pub fn succeeded(&self) -> Vec<&BatchResult> {
        self.results
            .iter()
            .filter(|r| r.result_type == "succeeded")
            .collect()
    }

    /// Get results that errored
    pub fn errored(&self) -> Vec<&BatchResult> {
        self.results
            .iter()
            .filter(|r| r.result_type == "errored")
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_batch_status_serialization() {
        assert_eq!(
            serde_json::to_string(&BatchStatus::InProgress).unwrap(),
            "\"in_progress\""
        );
        assert_eq!(
            serde_json::to_string(&BatchStatus::Ended).unwrap(),
            "\"ended\""
        );
        assert_eq!(
            serde_json::to_string(&BatchStatus::Canceling).unwrap(),
            "\"canceling\""
        );
        assert_eq!(
            serde_json::to_string(&BatchStatus::Canceled).unwrap(),
            "\"canceled\""
        );
    }

    #[test]
    fn test_batch_processing_status_total() {
        let status = BatchProcessingStatus {
            succeeded: 10,
            errored: 2,
            expired: 1,
            canceled: 3,
        };
        assert_eq!(status.total(), 16);
    }

    #[test]
    fn test_batch_list_params_builder() {
        let params = BatchListParams::new()
            .with_before_id("batch_123")
            .with_limit(50);

        assert_eq!(params.before_id, Some("batch_123".to_string()));
        assert_eq!(params.limit, Some(50));
        assert!(params.after_id.is_none());
    }

    #[test]
    fn test_batch_results_response_filtering() {
        let results = BatchResultsResponse::new(vec![
            BatchResult {
                custom_id: "req1".to_string(),
                result_type: "succeeded".to_string(),
                message: None,
                error: None,
            },
            BatchResult {
                custom_id: "req2".to_string(),
                result_type: "errored".to_string(),
                message: None,
                error: Some(BatchError {
                    error_type: "invalid_request".to_string(),
                    message: "Invalid request".to_string(),
                }),
            },
            BatchResult {
                custom_id: "req3".to_string(),
                result_type: "succeeded".to_string(),
                message: None,
                error: None,
            },
        ]);

        assert_eq!(results.succeeded().len(), 2);
        assert_eq!(results.errored().len(), 1);
    }
}
