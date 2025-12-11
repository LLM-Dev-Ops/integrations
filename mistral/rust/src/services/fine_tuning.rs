//! Fine-tuning service.

use async_trait::async_trait;

use crate::errors::MistralError;
use crate::types::fine_tuning::{
    CreateFineTuningJobRequest, FineTuningCheckpoint, FineTuningEvent, FineTuningJob,
    FineTuningJobListResponse,
};

/// Query parameters for listing fine-tuning jobs.
#[derive(Debug, Default)]
pub struct ListFineTuningJobsParams {
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
    /// Created by user.
    pub created_by_me: Option<bool>,
    /// Wandb project filter.
    pub wandb_project: Option<String>,
    /// Wandb name filter.
    pub wandb_name: Option<String>,
    /// Suffix filter.
    pub suffix: Option<String>,
}

impl ListFineTuningJobsParams {
    /// Creates a new builder.
    pub fn builder() -> ListFineTuningJobsParamsBuilder {
        ListFineTuningJobsParamsBuilder::default()
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
        if let Some(created_by_me) = self.created_by_me {
            params.push(format!("created_by_me={}", created_by_me));
        }
        if let Some(ref wandb_project) = self.wandb_project {
            params.push(format!("wandb_project={}", wandb_project));
        }
        if let Some(ref wandb_name) = self.wandb_name {
            params.push(format!("wandb_name={}", wandb_name));
        }
        if let Some(ref suffix) = self.suffix {
            params.push(format!("suffix={}", suffix));
        }

        if params.is_empty() {
            String::new()
        } else {
            format!("?{}", params.join("&"))
        }
    }
}

/// Builder for listing fine-tuning jobs params.
#[derive(Default)]
pub struct ListFineTuningJobsParamsBuilder {
    inner: ListFineTuningJobsParams,
}

impl ListFineTuningJobsParamsBuilder {
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

    /// Sets created by me filter.
    pub fn created_by_me(mut self, created_by_me: bool) -> Self {
        self.inner.created_by_me = Some(created_by_me);
        self
    }

    /// Builds the params.
    pub fn build(self) -> ListFineTuningJobsParams {
        self.inner
    }
}

/// Fine-tuning service trait.
#[async_trait]
pub trait FineTuningService: Send + Sync {
    /// Lists fine-tuning jobs.
    async fn list(&self, params: Option<ListFineTuningJobsParams>) -> Result<FineTuningJobListResponse, MistralError>;

    /// Retrieves a specific fine-tuning job.
    async fn retrieve(&self, job_id: &str) -> Result<FineTuningJob, MistralError>;

    /// Creates a new fine-tuning job.
    async fn create(&self, request: CreateFineTuningJobRequest) -> Result<FineTuningJob, MistralError>;

    /// Cancels a fine-tuning job.
    async fn cancel(&self, job_id: &str) -> Result<FineTuningJob, MistralError>;

    /// Starts a fine-tuning job.
    async fn start(&self, job_id: &str) -> Result<FineTuningJob, MistralError>;

    /// Gets events for a fine-tuning job.
    async fn list_events(&self, job_id: &str) -> Result<Vec<FineTuningEvent>, MistralError>;

    /// Gets checkpoints for a fine-tuning job.
    async fn list_checkpoints(&self, job_id: &str) -> Result<Vec<FineTuningCheckpoint>, MistralError>;
}

/// Default implementation of the fine-tuning service.
pub struct DefaultFineTuningService<T> {
    transport: T,
}

impl<T> DefaultFineTuningService<T> {
    /// Creates a new fine-tuning service.
    pub fn new(transport: T) -> Self {
        Self { transport }
    }
}

#[async_trait]
impl<T> FineTuningService for DefaultFineTuningService<T>
where
    T: crate::transport::HttpTransport + Send + Sync,
{
    async fn list(&self, params: Option<ListFineTuningJobsParams>) -> Result<FineTuningJobListResponse, MistralError> {
        let query = params
            .map(|p| p.to_query_string())
            .unwrap_or_default();

        let path = format!("/v1/fine_tuning/jobs{}", query);
        let response = self.transport
            .get(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn retrieve(&self, job_id: &str) -> Result<FineTuningJob, MistralError> {
        let path = format!("/v1/fine_tuning/jobs/{}", job_id);
        let response = self.transport
            .get(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn create(&self, request: CreateFineTuningJobRequest) -> Result<FineTuningJob, MistralError> {
        let body = serde_json::to_vec(&request)
            .map_err(|e| MistralError::Serialization { message: e.to_string() })?;

        let response = self.transport
            .post("/v1/fine_tuning/jobs", body)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn cancel(&self, job_id: &str) -> Result<FineTuningJob, MistralError> {
        let path = format!("/v1/fine_tuning/jobs/{}/cancel", job_id);
        let response = self.transport
            .post(&path, vec![])
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn start(&self, job_id: &str) -> Result<FineTuningJob, MistralError> {
        let path = format!("/v1/fine_tuning/jobs/{}/start", job_id);
        let response = self.transport
            .post(&path, vec![])
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn list_events(&self, job_id: &str) -> Result<Vec<FineTuningEvent>, MistralError> {
        let path = format!("/v1/fine_tuning/jobs/{}/events", job_id);
        let response = self.transport
            .get(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn list_checkpoints(&self, job_id: &str) -> Result<Vec<FineTuningCheckpoint>, MistralError> {
        let path = format!("/v1/fine_tuning/jobs/{}/checkpoints", job_id);
        let response = self.transport
            .get(&path)
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
        let params = ListFineTuningJobsParams::builder()
            .page(1)
            .page_size(10)
            .model("open-mistral-7b")
            .build();

        let query = params.to_query_string();
        assert!(query.contains("page=1"));
        assert!(query.contains("page_size=10"));
        assert!(query.contains("model=open-mistral-7b"));
    }

    #[test]
    fn test_empty_params_query_string() {
        let params = ListFineTuningJobsParams::default();
        assert_eq!(params.to_query_string(), "");
    }
}
