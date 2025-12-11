//! Fine-tune service implementation.

use super::types::{CreateFinetuneRequest, FinetuneModel, ListFinetuneResponse};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Fine-tune service trait for testability
#[async_trait]
pub trait FinetuneService: Send + Sync {
    /// Create a new fine-tune job
    async fn create(&self, request: CreateFinetuneRequest) -> CohereResult<FinetuneModel>;

    /// Get a fine-tune by ID
    async fn get(&self, finetune_id: &str) -> CohereResult<FinetuneModel>;

    /// List all fine-tunes
    async fn list(&self) -> CohereResult<ListFinetuneResponse>;

    /// Delete a fine-tune
    async fn delete(&self, finetune_id: &str) -> CohereResult<()>;
}

/// Implementation of the Fine-tune service
pub struct FinetuneServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl FinetuneServiceImpl {
    /// Create a new Fine-tune service
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
impl FinetuneService for FinetuneServiceImpl {
    async fn create(&self, request: CreateFinetuneRequest) -> CohereResult<FinetuneModel> {
        // Build URL
        let url = self.url("/v1/finetuning/finetuned-models")?;

        // Build headers
        let headers = self.build_headers();

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute request
        let response = self
            .transport
            .execute(Method::POST, url, headers, Some(body))
            .await?;

        // Parse response
        let finetune: FinetuneModel = serde_json::from_slice(&response.body)?;

        Ok(finetune)
    }

    async fn get(&self, finetune_id: &str) -> CohereResult<FinetuneModel> {
        // Build URL
        let url = self.url(&format!("/v1/finetuning/finetuned-models/{}", finetune_id))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response
        let finetune: FinetuneModel = serde_json::from_slice(&response.body)?;

        Ok(finetune)
    }

    async fn list(&self) -> CohereResult<ListFinetuneResponse> {
        // Build URL
        let url = self.url("/v1/finetuning/finetuned-models")?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response
        let list_response: ListFinetuneResponse = serde_json::from_slice(&response.body)?;

        Ok(list_response)
    }

    async fn delete(&self, finetune_id: &str) -> CohereResult<()> {
        // Build URL
        let url = self.url(&format!("/v1/finetuning/finetuned-models/{}", finetune_id))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        self.transport
            .execute(Method::DELETE, url, headers, None)
            .await?;

        Ok(())
    }
}
