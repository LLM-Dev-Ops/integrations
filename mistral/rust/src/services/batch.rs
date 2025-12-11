//! Batch processing service.

use async_trait::async_trait;

use crate::errors::MistralError;
use crate::types::batch::{BatchJob, BatchListResponse, CreateBatchRequest};

/// Query parameters for listing batch jobs.
#[derive(Debug, Default)]
pub struct ListBatchJobsParams {
    /// Page number.
    pub page: Option<u32>,
    /// Page size.
    pub page_size: Option<u32>,
    /// Model filter.
    pub model: Option<String>,
    /// Status filter.
    pub status: Option<String>,
    /// Created after timestamp.
    pub created_after: Option<i64>,
    /// Created before timestamp.
    pub created_before: Option<i64>,
}

impl ListBatchJobsParams {
    /// Creates a new builder.
    pub fn builder() -> ListBatchJobsParamsBuilder {
        ListBatchJobsParamsBuilder::default()
    }

    /// Converts to query string.
    pub fn to_query_string(&self) -> String {
        let mut params = Vec::new();

        if let Some(page) = self.page {
            params.push(format!("page={}", page));
        }
        if let Some(page_size) = self.page_size {
            params.push(format!("page_size={}", page_size));
        }
        if let Some(ref model) = self.model {
            params.push(format!("model={}", model));
        }
        if let Some(ref status) = self.status {
            params.push(format!("status={}", status));
        }
        if let Some(created_after) = self.created_after {
            params.push(format!("created_after={}", created_after));
        }
        if let Some(created_before) = self.created_before {
            params.push(format!("created_before={}", created_before));
        }

        if params.is_empty() {
            String::new()
        } else {
            format!("?{}", params.join("&"))
        }
    }
}

/// Builder for listing batch jobs params.
#[derive(Default)]
pub struct ListBatchJobsParamsBuilder {
    inner: ListBatchJobsParams,
}

impl ListBatchJobsParamsBuilder {
    /// Sets page.
    pub fn page(mut self, page: u32) -> Self {
        self.inner.page = Some(page);
        self
    }

    /// Sets page size.
    pub fn page_size(mut self, size: u32) -> Self {
        self.inner.page_size = Some(size);
        self
    }

    /// Sets model filter.
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.inner.model = Some(model.into());
        self
    }

    /// Sets status filter.
    pub fn status(mut self, status: impl Into<String>) -> Self {
        self.inner.status = Some(status.into());
        self
    }

    /// Sets created after filter.
    pub fn created_after(mut self, timestamp: i64) -> Self {
        self.inner.created_after = Some(timestamp);
        self
    }

    /// Sets created before filter.
    pub fn created_before(mut self, timestamp: i64) -> Self {
        self.inner.created_before = Some(timestamp);
        self
    }

    /// Builds the params.
    pub fn build(self) -> ListBatchJobsParams {
        self.inner
    }
}

/// Batch service trait.
#[async_trait]
pub trait BatchService: Send + Sync {
    /// Lists batch jobs.
    async fn list(&self, params: Option<ListBatchJobsParams>) -> Result<BatchListResponse, MistralError>;

    /// Retrieves a specific batch job.
    async fn retrieve(&self, batch_id: &str) -> Result<BatchJob, MistralError>;

    /// Creates a new batch job.
    async fn create(&self, request: CreateBatchRequest) -> Result<BatchJob, MistralError>;

    /// Cancels a batch job.
    async fn cancel(&self, batch_id: &str) -> Result<BatchJob, MistralError>;
}

/// Default implementation of the batch service.
pub struct DefaultBatchService<T> {
    transport: T,
}

impl<T> DefaultBatchService<T> {
    /// Creates a new batch service.
    pub fn new(transport: T) -> Self {
        Self { transport }
    }
}

#[async_trait]
impl<T> BatchService for DefaultBatchService<T>
where
    T: crate::transport::HttpTransport + Send + Sync,
{
    async fn list(&self, params: Option<ListBatchJobsParams>) -> Result<BatchListResponse, MistralError> {
        let query = params
            .map(|p| p.to_query_string())
            .unwrap_or_default();

        let path = format!("/v1/batch/jobs{}", query);
        let response = self.transport
            .get(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn retrieve(&self, batch_id: &str) -> Result<BatchJob, MistralError> {
        let path = format!("/v1/batch/jobs/{}", batch_id);
        let response = self.transport
            .get(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn create(&self, request: CreateBatchRequest) -> Result<BatchJob, MistralError> {
        let body = serde_json::to_vec(&request)
            .map_err(|e| MistralError::Serialization { message: e.to_string() })?;

        let response = self.transport
            .post("/v1/batch/jobs", body)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn cancel(&self, batch_id: &str) -> Result<BatchJob, MistralError> {
        let path = format!("/v1/batch/jobs/{}/cancel", batch_id);
        let response = self.transport
            .post(&path, vec![])
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_params_query_string() {
        let params = ListBatchJobsParams::builder()
            .page(1)
            .page_size(10)
            .status("RUNNING")
            .build();

        let query = params.to_query_string();
        assert!(query.contains("page=1"));
        assert!(query.contains("page_size=10"));
        assert!(query.contains("status=RUNNING"));
    }

    #[test]
    fn test_create_batch_request_serialization() {
        let request = CreateBatchRequest::new(
            vec!["file-123".to_string()],
            "/v1/chat/completions",
            "mistral-large-latest",
        );

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("file-123"));
        assert!(json.contains("mistral-large-latest"));
    }
}
