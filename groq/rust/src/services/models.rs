//! Models service.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::instrument;

use crate::auth::AuthProvider;
use crate::errors::{ApiErrorResponse, GroqError, RateLimitType};
use crate::resilience::{RateLimitManager, ResilienceOrchestrator};
use crate::transport::{HttpMethod, HttpRequest, HttpResponse, HttpTransport};
use crate::types::models::{Model, ModelList};

/// Models service for listing and retrieving model information.
pub struct ModelsService {
    transport: Arc<dyn HttpTransport>,
    auth: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    rate_limiter: Arc<RwLock<RateLimitManager>>,
}

impl ModelsService {
    /// Creates a new models service.
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth: Arc<dyn AuthProvider>,
        resilience: Arc<ResilienceOrchestrator>,
        rate_limiter: Arc<RwLock<RateLimitManager>>,
    ) -> Self {
        Self {
            transport,
            auth,
            resilience,
            rate_limiter,
        }
    }

    /// Lists all available models.
    #[instrument(skip(self))]
    pub async fn list(&self) -> Result<ModelList, GroqError> {
        // Check rate limits
        {
            let rate_limiter = self.rate_limiter.read().await;
            if let Some(wait) = rate_limiter.should_wait() {
                tracing::info!(wait_ms = wait.as_millis(), "Rate limit throttling");
                tokio::time::sleep(wait).await;
            }
        }

        // Build HTTP request
        let http_request = self.build_request("models")?;

        // Execute with resilience
        let response = self
            .resilience
            .execute(|| {
                let transport = Arc::clone(&self.transport);
                let req = http_request.clone();
                async move { transport.send(req).await.map_err(|e| GroqError::Network {
                    message: e.to_string(),
                    cause: None,
                }) }
            })
            .await?;

        // Update rate limits
        self.rate_limiter
            .write()
            .await
            .update_from_headers(&response.headers);

        // Parse response
        self.parse_response(response)
    }

    /// Gets a specific model by ID.
    #[instrument(skip(self), fields(model = %model_id))]
    pub async fn get(&self, model_id: &str) -> Result<Model, GroqError> {
        if model_id.is_empty() {
            return Err(GroqError::validation_param(
                "Model ID is required",
                "model_id",
                None,
            ));
        }

        // Check rate limits
        {
            let rate_limiter = self.rate_limiter.read().await;
            if let Some(wait) = rate_limiter.should_wait() {
                tracing::info!(wait_ms = wait.as_millis(), "Rate limit throttling");
                tokio::time::sleep(wait).await;
            }
        }

        // Build HTTP request
        let path = format!("models/{}", model_id);
        let http_request = self.build_request(&path)?;

        // Execute with resilience
        let response = self
            .resilience
            .execute(|| {
                let transport = Arc::clone(&self.transport);
                let req = http_request.clone();
                async move { transport.send(req).await.map_err(|e| GroqError::Network {
                    message: e.to_string(),
                    cause: None,
                }) }
            })
            .await?;

        // Update rate limits
        self.rate_limiter
            .write()
            .await
            .update_from_headers(&response.headers);

        // Parse response
        self.parse_response(response)
    }

    /// Builds an HTTP request.
    fn build_request(&self, path: &str) -> Result<HttpRequest, GroqError> {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        // Apply auth
        self.auth.apply_auth(&mut headers);

        Ok(HttpRequest {
            method: HttpMethod::Get,
            path: path.to_string(),
            headers,
            body: None,
            timeout: None,
        })
    }

    /// Parses the HTTP response.
    fn parse_response<T: serde::de::DeserializeOwned>(
        &self,
        response: HttpResponse,
    ) -> Result<T, GroqError> {
        if response.status != 200 {
            return Err(self.parse_error_response(&response));
        }

        serde_json::from_slice(&response.body).map_err(|e| GroqError::Server {
            message: format!("Failed to parse response: {}", e),
            status_code: response.status,
            request_id: response.headers.get("x-request-id").cloned(),
        })
    }

    /// Parses an error response.
    fn parse_error_response(&self, response: &HttpResponse) -> GroqError {
        let request_id = response.headers.get("x-request-id").cloned();

        if let Ok(error_body) = serde_json::from_slice::<ApiErrorResponse>(&response.body) {
            return match response.status {
                401 => GroqError::Authentication {
                    message: error_body.error.message,
                    api_key_hint: None,
                },
                404 => GroqError::Model {
                    message: error_body.error.message,
                    model: String::new(),
                    available_models: None,
                },
                429 => GroqError::RateLimit {
                    message: error_body.error.message,
                    retry_after: None,
                    limit_type: RateLimitType::Requests,
                },
                _ => GroqError::Server {
                    message: error_body.error.message,
                    status_code: response.status,
                    request_id,
                },
            };
        }

        GroqError::Server {
            message: format!("HTTP error: {}", response.status),
            status_code: response.status,
            request_id,
        }
    }
}

impl std::fmt::Debug for ModelsService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ModelsService").finish()
    }
}
