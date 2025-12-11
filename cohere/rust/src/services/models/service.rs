//! Models service implementation.

use super::types::{ModelInfo, ModelListResponse};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Models service trait for testability
#[async_trait]
pub trait ModelsService: Send + Sync {
    /// List all available models
    async fn list(&self) -> CohereResult<ModelListResponse>;

    /// Get a specific model by name
    async fn get(&self, model_name: &str) -> CohereResult<ModelInfo>;
}

/// Implementation of the Models service
pub struct ModelsServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl ModelsServiceImpl {
    /// Create a new Models service
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
impl ModelsService for ModelsServiceImpl {
    async fn list(&self) -> CohereResult<ModelListResponse> {
        // Build URL
        let url = self.url("/v1/models")?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response
        let models_response: ModelListResponse = serde_json::from_slice(&response.body)?;

        Ok(models_response)
    }

    async fn get(&self, model_name: &str) -> CohereResult<ModelInfo> {
        // Build URL
        let url = self.url(&format!("/v1/models/{}", model_name))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response
        let model_info: ModelInfo = serde_json::from_slice(&response.body)?;

        Ok(model_info)
    }
}

#[cfg(test)]
mod tests {
    // Tests would go here with mock implementations
}
