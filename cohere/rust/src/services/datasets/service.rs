//! Datasets service implementation.

use super::types::{CreateDatasetRequest, Dataset};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Datasets service trait for testability
#[async_trait]
pub trait DatasetsService: Send + Sync {
    /// Create a new dataset
    async fn create(&self, request: CreateDatasetRequest, data: Vec<u8>) -> CohereResult<Dataset>;

    /// Get a dataset by ID
    async fn get(&self, dataset_id: &str) -> CohereResult<Dataset>;

    /// List all datasets
    async fn list(&self) -> CohereResult<Vec<Dataset>>;

    /// Delete a dataset
    async fn delete(&self, dataset_id: &str) -> CohereResult<()>;
}

/// Implementation of the Datasets service
pub struct DatasetsServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl DatasetsServiceImpl {
    /// Create a new Datasets service
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
        self.auth_manager.get_headers()
    }

    /// Build endpoint URL
    fn url(&self, path: &str) -> CohereResult<String> {
        self.base_url
            .join(path)
            .map(|u| u.to_string())
            .map_err(|e| CohereError::Configuration {
                message: format!("Invalid URL: {}", e),
            })
    }
}

#[async_trait]
impl DatasetsService for DatasetsServiceImpl {
    async fn create(&self, request: CreateDatasetRequest, _data: Vec<u8>) -> CohereResult<Dataset> {
        // Build URL
        let url = self.url("/v1/datasets")?;

        // Build headers - for file upload we'd use multipart
        let headers = self.build_headers();

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute request (simplified - real implementation would use multipart)
        let response = self
            .transport
            .execute(Method::POST, url, headers, Some(body))
            .await?;

        // Parse response
        let dataset: Dataset = serde_json::from_slice(&response.body)?;

        Ok(dataset)
    }

    async fn get(&self, dataset_id: &str) -> CohereResult<Dataset> {
        // Build URL
        let url = self.url(&format!("/v1/datasets/{}", dataset_id))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response
        let dataset: Dataset = serde_json::from_slice(&response.body)?;

        Ok(dataset)
    }

    async fn list(&self) -> CohereResult<Vec<Dataset>> {
        // Build URL
        let url = self.url("/v1/datasets")?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response
        #[derive(serde::Deserialize)]
        struct ListResponse {
            datasets: Vec<Dataset>,
        }

        let list_response: ListResponse = serde_json::from_slice(&response.body)?;

        Ok(list_response.datasets)
    }

    async fn delete(&self, dataset_id: &str) -> CohereResult<()> {
        // Build URL
        let url = self.url(&format!("/v1/datasets/{}", dataset_id))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        self.transport
            .execute(Method::DELETE, url, headers, None)
            .await?;

        Ok(())
    }
}
