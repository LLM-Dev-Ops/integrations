//! Models service implementation

use super::types::{ModelInfo, ModelListResponse};
use crate::auth::AuthManager;
use crate::error::{AnthropicError, ApiErrorResponse, ValidationError};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Models service trait for testability
#[async_trait]
pub trait ModelsService: Send + Sync {
    /// List all available models
    async fn list(&self) -> Result<ModelListResponse, AnthropicError>;

    /// Retrieve information about a specific model
    async fn retrieve(&self, model_id: &str) -> Result<ModelInfo, AnthropicError>;
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
impl ModelsService for ModelsServiceImpl {
    async fn list(&self) -> Result<ModelListResponse, AnthropicError> {
        // Build URL
        let url = self.base_url
            .join("/v1/models")
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self.transport
            .execute(
                Method::GET,
                url.to_string(),
                headers,
                None,
            )
            .await?;

        // Handle response
        if response.status == 200 {
            let model_list = serde_json::from_slice::<ModelListResponse>(&response.body)?;
            Ok(model_list)
        } else {
            Err(self.parse_api_error(response.status, &response.body))
        }
    }

    async fn retrieve(&self, model_id: &str) -> Result<ModelInfo, AnthropicError> {
        // Validate input
        if model_id.is_empty() {
            return Err(AnthropicError::Validation(
                ValidationError::Required {
                    field: "model_id".to_string(),
                }
            ));
        }

        // Build URL
        let url = self.base_url
            .join(&format!("/v1/models/{}", model_id))
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self.transport
            .execute(
                Method::GET,
                url.to_string(),
                headers,
                None,
            )
            .await?;

        // Handle response
        if response.status == 200 {
            let model_info = serde_json::from_slice::<ModelInfo>(&response.body)?;
            Ok(model_info)
        } else {
            Err(self.parse_api_error(response.status, &response.body))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_models_service_trait_bounds() {
        // This ensures the trait has the correct bounds
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Box<dyn ModelsService>>();
    }
}
