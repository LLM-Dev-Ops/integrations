//! Batches service implementation

use super::types::{
    BatchListParams, BatchListResponse, BatchResultsResponse, CreateBatchRequest, MessageBatch,
};
use crate::auth::AuthManager;
use crate::error::{AnthropicError, ApiErrorResponse, ValidationError};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Batches service trait for testability
#[async_trait]
pub trait BatchesService: Send + Sync {
    /// Create a new message batch
    async fn create(
        &self,
        request: CreateBatchRequest,
    ) -> Result<MessageBatch, AnthropicError>;

    /// Retrieve information about a specific batch
    async fn retrieve(&self, batch_id: &str) -> Result<MessageBatch, AnthropicError>;

    /// List batches with optional pagination
    async fn list(
        &self,
        params: Option<BatchListParams>,
    ) -> Result<BatchListResponse, AnthropicError>;

    /// Cancel a batch that is in progress
    async fn cancel(&self, batch_id: &str) -> Result<MessageBatch, AnthropicError>;

    /// Download results for a completed batch
    async fn results(&self, batch_id: &str) -> Result<BatchResultsResponse, AnthropicError>;

    /// Stream results for a completed batch (memory-efficient for large batches)
    async fn results_stream(
        &self,
        batch_id: &str,
    ) -> Result<super::stream::BatchResultsStream, AnthropicError>;
}

/// Implementation of the Batches service
pub struct BatchesServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl BatchesServiceImpl {
    /// Create a new Batches service
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        base_url: Url,
    ) -> Self {
        Self {
            transport,
            auth_manager,
            base_url,
        }
    }

    /// Build headers for a request
    fn build_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        self.auth_manager.add_auth_headers(&mut headers);
        headers
    }

    /// Parse API error from response
    fn parse_api_error(&self, status: u16, body: &[u8]) -> AnthropicError {
        if let Ok(error_response) = serde_json::from_slice::<ApiErrorResponse>(body) {
            AnthropicError::Api {
                status,
                message: error_response.error.message,
                error_type: error_response.error.error_type,
            }
        } else {
            AnthropicError::Api {
                status,
                message: String::from_utf8_lossy(body).to_string(),
                error_type: "unknown".to_string(),
            }
        }
    }
}

#[async_trait]
impl BatchesService for BatchesServiceImpl {
    async fn create(
        &self,
        request: CreateBatchRequest,
    ) -> Result<MessageBatch, AnthropicError> {
        // Validate request
        if request.requests.is_empty() {
            return Err(AnthropicError::Validation(
                ValidationError::Invalid {
                    field: "requests".to_string(),
                    reason: "At least one request is required".to_string(),
                }
            ));
        }

        // Build URL
        let url = self
            .base_url
            .join("/v1/messages/batches")
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute request
        let response = self
            .transport
            .execute(Method::POST, url.to_string(), headers, Some(body))
            .await?;

        // Handle response
        if response.status == 200 {
            let batch = serde_json::from_slice::<MessageBatch>(&response.body)?;
            Ok(batch)
        } else {
            Err(self.parse_api_error(response.status, &response.body))
        }
    }

    async fn retrieve(&self, batch_id: &str) -> Result<MessageBatch, AnthropicError> {
        // Validate input
        if batch_id.is_empty() {
            return Err(AnthropicError::Validation(
                ValidationError::Required {
                    field: "batch_id".to_string(),
                }
            ));
        }

        // Build URL
        let url = self
            .base_url
            .join(&format!("/v1/messages/batches/{}", batch_id))
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url.to_string(), headers, None)
            .await?;

        // Handle response
        if response.status == 200 {
            let batch = serde_json::from_slice::<MessageBatch>(&response.body)?;
            Ok(batch)
        } else {
            Err(self.parse_api_error(response.status, &response.body))
        }
    }

    async fn list(
        &self,
        params: Option<BatchListParams>,
    ) -> Result<BatchListResponse, AnthropicError> {
        // Build URL with query parameters
        let mut url = self
            .base_url
            .join("/v1/messages/batches")
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        if let Some(params) = params {
            let mut query_pairs = url.query_pairs_mut();

            if let Some(before_id) = params.before_id {
                query_pairs.append_pair("before_id", &before_id);
            }

            if let Some(after_id) = params.after_id {
                query_pairs.append_pair("after_id", &after_id);
            }

            if let Some(limit) = params.limit {
                query_pairs.append_pair("limit", &limit.to_string());
            }

            drop(query_pairs);
        }

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url.to_string(), headers, None)
            .await?;

        // Handle response
        if response.status == 200 {
            let batch_list = serde_json::from_slice::<BatchListResponse>(&response.body)?;
            Ok(batch_list)
        } else {
            Err(self.parse_api_error(response.status, &response.body))
        }
    }

    async fn cancel(&self, batch_id: &str) -> Result<MessageBatch, AnthropicError> {
        // Validate input
        if batch_id.is_empty() {
            return Err(AnthropicError::Validation(
                ValidationError::Required {
                    field: "batch_id".to_string(),
                }
            ));
        }

        // Build URL
        let url = self
            .base_url
            .join(&format!("/v1/messages/batches/{}/cancel", batch_id))
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::POST, url.to_string(), headers, None)
            .await?;

        // Handle response
        if response.status == 200 {
            let batch = serde_json::from_slice::<MessageBatch>(&response.body)?;
            Ok(batch)
        } else {
            Err(self.parse_api_error(response.status, &response.body))
        }
    }

    async fn results(&self, batch_id: &str) -> Result<BatchResultsResponse, AnthropicError> {
        // Validate input
        if batch_id.is_empty() {
            return Err(AnthropicError::Validation(
                ValidationError::Required {
                    field: "batch_id".to_string(),
                }
            ));
        }

        // Build URL
        let url = self
            .base_url
            .join(&format!("/v1/messages/batches/{}/results", batch_id))
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url.to_string(), headers, None)
            .await?;

        // Handle response
        if response.status == 200 {
            // Parse JSONL format (one JSON object per line)
            let body_str = String::from_utf8_lossy(&response.body);
            let results: Vec<super::types::BatchResult> = body_str
                .lines()
                .filter(|line| !line.trim().is_empty())
                .map(|line| serde_json::from_str(line))
                .collect::<Result<Vec<_>, _>>()?;

            Ok(BatchResultsResponse::new(results))
        } else {
            Err(self.parse_api_error(response.status, &response.body))
        }
    }

    async fn results_stream(
        &self,
        batch_id: &str,
    ) -> Result<super::stream::BatchResultsStream, AnthropicError> {
        // Validate input
        if batch_id.is_empty() {
            return Err(AnthropicError::Validation(
                ValidationError::Required {
                    field: "batch_id".to_string(),
                }
            ));
        }

        // Build URL
        let url = self
            .base_url
            .join(&format!("/v1/messages/batches/{}/results", batch_id))
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Get streaming response from transport
        let stream = self
            .transport
            .execute_stream(Method::GET, url.to_string(), headers, None)
            .await?;

        Ok(super::stream::BatchResultsStream::new(stream))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_batches_service_trait_bounds() {
        // This ensures the trait has the correct bounds
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Box<dyn BatchesService>>();
    }
}
