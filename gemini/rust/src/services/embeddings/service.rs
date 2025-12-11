//! Embeddings service implementation.

use super::EmbeddingsService;
use super::validation::{validate_embed_request, validate_batch_size};
use crate::auth::AuthManager;
use crate::config::GeminiConfig;
use crate::error::{GeminiError, GeminiResult, RequestError};
use crate::transport::{HttpTransport, HttpRequest, HttpMethod};
use crate::types::{
    EmbedContentRequest, EmbedContentResponse, BatchEmbedContentsResponse,
};
use async_trait::async_trait;
use bytes::Bytes;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;

/// Default embedding model.
pub const DEFAULT_EMBEDDING_MODEL: &str = "text-embedding-004";

/// Internal batch embed request structure.
#[derive(Debug, Clone, Serialize)]
struct BatchEmbedContentsRequest {
    requests: Vec<EmbedContentRequest>,
}

/// Implementation of the EmbeddingsService.
pub struct EmbeddingsServiceImpl {
    config: Arc<GeminiConfig>,
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    default_model: String,
}

impl EmbeddingsServiceImpl {
    /// Create a new embeddings service implementation.
    pub fn new(
        config: Arc<GeminiConfig>,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
    ) -> Self {
        Self {
            config,
            transport,
            auth_manager,
            default_model: DEFAULT_EMBEDDING_MODEL.to_string(),
        }
    }

    /// Normalize model name by adding "models/" prefix if missing.
    fn normalize_model_name(&self, model: &str) -> String {
        if model.starts_with("models/") {
            model.to_string()
        } else {
            format!("models/{}", model)
        }
    }

    /// Build the URL for embed requests.
    fn build_embed_url(&self, model: &str) -> String {
        let normalized_model = self.normalize_model_name(model);
        format!(
            "{}/{}/{}:embedContent",
            self.config.base_url,
            self.config.api_version,
            normalized_model
        )
    }

    /// Build the URL for batch embed requests.
    fn build_batch_embed_url(&self, model: &str) -> String {
        let normalized_model = self.normalize_model_name(model);
        format!(
            "{}/{}/{}:batchEmbedContents",
            self.config.base_url,
            self.config.api_version,
            normalized_model
        )
    }

    /// Build headers for the request.
    fn build_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        // Add authentication
        if let Some((name, value)) = self.auth_manager.get_auth_header() {
            headers.insert(name, value);
        }

        headers
    }

    /// Add auth query param to URL if needed.
    fn add_auth_to_url(&self, mut url: String) -> String {
        if let Some((key, value)) = self.auth_manager.get_auth_query_param() {
            url = format!("{}?{}={}", url, key, value);
        }
        url
    }


    /// Parse error response from API.
    fn parse_error(&self, status: u16, body: &Bytes) -> GeminiError {
        // Try to parse as JSON error
        if let Ok(text) = std::str::from_utf8(body) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(text) {
                if let Some(error_obj) = json.get("error") {
                    let message = error_obj.get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or(text)
                        .to_string();

                    // Map status codes to appropriate errors
                    return match status {
                        400 => GeminiError::Request(RequestError::InvalidParameter {
                            parameter: "request".to_string(),
                            message,
                        }),
                        401 | 403 => GeminiError::Authentication(
                            crate::error::AuthenticationError::InvalidApiKey
                        ),
                        404 => GeminiError::Request(RequestError::InvalidModel {
                            model: "unknown".to_string(),
                        }),
                        429 => GeminiError::RateLimit(
                            crate::error::RateLimitError::TooManyRequests { retry_after: None }
                        ),
                        500..=599 => GeminiError::Server(
                            crate::error::ServerError::InternalError { message }
                        ),
                        _ => GeminiError::Response(
                            crate::error::ResponseError::UnexpectedFormat { message }
                        ),
                    };
                }
            }
        }

        // Fallback error
        GeminiError::Response(crate::error::ResponseError::UnexpectedFormat {
            message: format!("HTTP {} - {}", status, String::from_utf8_lossy(body)),
        })
    }
}

#[async_trait]
impl EmbeddingsService for EmbeddingsServiceImpl {
    async fn embed(
        &self,
        model: &str,
        request: EmbedContentRequest,
    ) -> Result<EmbedContentResponse, GeminiError> {
        // Validate request
        validate_embed_request(&request)?;

        // Build URL
        let url = self.build_embed_url(model);
        let url = self.add_auth_to_url(url);

        // Build headers
        let headers = self.build_headers();

        // Serialize request body
        let body_json = serde_json::to_vec(&request)
            .map_err(|e| GeminiError::Request(RequestError::InvalidParameter {
                parameter: "request".to_string(),
                message: format!("Failed to serialize request: {}", e),
            }))?;

        // Create HTTP request
        let http_request = HttpRequest {
            method: HttpMethod::Post,
            url,
            headers,
            body: Some(Bytes::from(body_json)),
        };

        // Send request
        let response = self.transport.send(http_request)
            .await
            .map_err(|e| GeminiError::Network(crate::error::NetworkError::ConnectionFailed {
                message: e.to_string(),
            }))?;

        // Check status
        if response.status != 200 {
            return Err(self.parse_error(response.status, &response.body));
        }

        // Parse response
        let embed_response: EmbedContentResponse = serde_json::from_slice(&response.body)?;
        Ok(embed_response)
    }

    async fn batch_embed(
        &self,
        model: &str,
        requests: Vec<EmbedContentRequest>,
    ) -> Result<BatchEmbedContentsResponse, GeminiError> {
        // Validate batch size
        validate_batch_size(requests.len())?;

        // Validate all requests
        for request in &requests {
            validate_embed_request(request)?;
        }

        // Build URL
        let url = self.build_batch_embed_url(model);
        let url = self.add_auth_to_url(url);

        // Build headers
        let headers = self.build_headers();

        // Create batch request
        let batch_request = BatchEmbedContentsRequest { requests };

        // Serialize request body
        let body_json = serde_json::to_vec(&batch_request)
            .map_err(|e| GeminiError::Request(RequestError::InvalidParameter {
                parameter: "requests".to_string(),
                message: format!("Failed to serialize batch request: {}", e),
            }))?;

        // Create HTTP request
        let http_request = HttpRequest {
            method: HttpMethod::Post,
            url,
            headers,
            body: Some(Bytes::from(body_json)),
        };

        // Send request
        let response = self.transport.send(http_request)
            .await
            .map_err(|e| GeminiError::Network(crate::error::NetworkError::ConnectionFailed {
                message: e.to_string(),
            }))?;

        // Check status
        if response.status != 200 {
            return Err(self.parse_error(response.status, &response.body));
        }

        // Parse response
        let batch_response: BatchEmbedContentsResponse = serde_json::from_slice(&response.body)?;
        Ok(batch_response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Content, Part};

    fn create_test_config() -> Arc<GeminiConfig> {
        use secrecy::SecretString;
        Arc::new(GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap())
    }

    #[test]
    fn test_normalize_model_name() {
        use crate::transport::ReqwestTransport;
        use crate::auth::ApiKeyAuthManager;

        let config = create_test_config();
        let transport = Arc::new(ReqwestTransport::new(&config).unwrap());
        let auth = Arc::new(ApiKeyAuthManager::from_config(&config));

        let service = EmbeddingsServiceImpl::new(config, transport, auth);

        assert_eq!(
            service.normalize_model_name("text-embedding-004"),
            "models/text-embedding-004"
        );
        assert_eq!(
            service.normalize_model_name("models/text-embedding-004"),
            "models/text-embedding-004"
        );
    }

}
