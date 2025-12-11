//! Chat completions service.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::instrument;

use crate::auth::AuthProvider;
use crate::errors::{ApiErrorResponse, GroqError, RateLimitType};
use crate::resilience::{RateLimitManager, ResilienceOrchestrator};
use crate::transport::{ChatStream, HttpMethod, HttpRequest, HttpResponse, HttpTransport};
use crate::types::chat::{ChatRequest, ChatResponse};

/// Chat completions service.
pub struct ChatService {
    transport: Arc<dyn HttpTransport>,
    auth: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    rate_limiter: Arc<RwLock<RateLimitManager>>,
}

impl ChatService {
    /// Creates a new chat service.
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

    /// Creates a chat completion.
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn create(&self, request: ChatRequest) -> Result<ChatResponse, GroqError> {
        // Validate request
        request.validate()?;

        // Check rate limits
        {
            let rate_limiter = self.rate_limiter.read().await;
            if let Some(wait) = rate_limiter.should_wait() {
                tracing::info!(wait_ms = wait.as_millis(), "Rate limit throttling");
                tokio::time::sleep(wait).await;
            }
        }

        // Build HTTP request
        let http_request = self.build_request(&request, false)?;

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

    /// Creates a streaming chat completion.
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn create_stream(&self, request: ChatRequest) -> Result<ChatStream, GroqError> {
        // Validate request
        request.validate()?;

        // Ensure stream is enabled
        let mut stream_request = request;
        stream_request.stream = Some(true);

        // Check rate limits
        {
            let rate_limiter = self.rate_limiter.read().await;
            if let Some(wait) = rate_limiter.should_wait() {
                tracing::info!(wait_ms = wait.as_millis(), "Rate limit throttling");
                tokio::time::sleep(wait).await;
            }
        }

        // Build HTTP request
        let http_request = self.build_request(&stream_request, true)?;

        // Send streaming request (no retry for streams)
        let response = self
            .transport
            .send_streaming(http_request)
            .await
            .map_err(|e| GroqError::Network {
                message: e.to_string(),
                cause: None,
            })?;

        // Update rate limits
        self.rate_limiter
            .write()
            .await
            .update_from_headers(&response.headers);

        // Check status
        if response.status != 200 {
            return Err(self.parse_error_status(response.status, &response.headers));
        }

        // Create stream
        ChatStream::new(response)
    }

    /// Creates a chat completion with a custom timeout.
    pub async fn create_with_timeout(
        &self,
        request: ChatRequest,
        timeout: Duration,
    ) -> Result<ChatResponse, GroqError> {
        request.validate()?;

        let mut http_request = self.build_request(&request, false)?;
        http_request.timeout = Some(timeout);

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

        self.rate_limiter
            .write()
            .await
            .update_from_headers(&response.headers);

        self.parse_response(response)
    }

    /// Builds an HTTP request from a chat request.
    fn build_request(&self, request: &ChatRequest, streaming: bool) -> Result<HttpRequest, GroqError> {
        let body = serde_json::to_vec(request).map_err(|e| GroqError::Validation {
            message: format!("Failed to serialize request: {}", e),
            param: None,
            value: None,
        })?;

        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        if streaming {
            headers.insert("Accept".to_string(), "text/event-stream".to_string());
        }

        // Apply auth
        self.auth.apply_auth(&mut headers);

        Ok(HttpRequest {
            method: HttpMethod::Post,
            path: "chat/completions".to_string(),
            headers,
            body: Some(body),
            timeout: None,
        })
    }

    /// Parses the HTTP response.
    fn parse_response(&self, response: HttpResponse) -> Result<ChatResponse, GroqError> {
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

        // Try to parse error body
        if let Ok(error_body) = serde_json::from_slice::<ApiErrorResponse>(&response.body) {
            return self.map_error(response.status, error_body, request_id);
        }

        // Fallback to status-based error
        self.parse_error_status(response.status, &response.headers)
    }

    /// Maps an API error to internal error type.
    fn map_error(
        &self,
        status: u16,
        error: ApiErrorResponse,
        request_id: Option<String>,
    ) -> GroqError {
        let error_type = error.error.error_type.as_deref().unwrap_or("");

        match (status, error_type) {
            (401, _) | (_, "invalid_api_key") => GroqError::Authentication {
                message: error.error.message,
                api_key_hint: None,
            },
            (403, _) => GroqError::Authorization {
                message: error.error.message,
                required_permission: None,
            },
            (404, _) | (_, "model_not_found") => GroqError::Model {
                message: error.error.message,
                model: error.error.param.unwrap_or_default(),
                available_models: None,
            },
            (400, _) | (_, "invalid_request_error") => GroqError::Validation {
                message: error.error.message,
                param: error.error.param,
                value: None,
            },
            (429, _) => {
                let retry_after = self.parse_retry_after(&error.error.message);
                GroqError::RateLimit {
                    message: error.error.message,
                    retry_after,
                    limit_type: RateLimitType::Requests,
                }
            }
            (_, "context_length_exceeded") => GroqError::ContextLength {
                message: error.error.message,
                max_context: 0,
                requested: 0,
            },
            (_, "content_filter") => GroqError::ContentFilter {
                message: error.error.message,
                filtered_categories: vec![],
            },
            _ => GroqError::Server {
                message: error.error.message,
                status_code: status,
                request_id,
            },
        }
    }

    /// Parses error from status code only.
    fn parse_error_status(&self, status: u16, headers: &HashMap<String, String>) -> GroqError {
        let request_id = headers.get("x-request-id").cloned();

        match status {
            401 => GroqError::Authentication {
                message: "Invalid API key".to_string(),
                api_key_hint: None,
            },
            403 => GroqError::Authorization {
                message: "Forbidden".to_string(),
                required_permission: None,
            },
            404 => GroqError::Model {
                message: "Resource not found".to_string(),
                model: String::new(),
                available_models: None,
            },
            429 => {
                let retry_after = headers
                    .get("retry-after")
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(Duration::from_secs);
                GroqError::RateLimit {
                    message: "Rate limit exceeded".to_string(),
                    retry_after,
                    limit_type: RateLimitType::Requests,
                }
            }
            500..=599 => GroqError::Server {
                message: format!("Server error: {}", status),
                status_code: status,
                request_id,
            },
            _ => GroqError::Server {
                message: format!("Unexpected status: {}", status),
                status_code: status,
                request_id,
            },
        }
    }

    /// Parses retry-after from error message.
    fn parse_retry_after(&self, _message: &str) -> Option<Duration> {
        // Could implement pattern matching for "try again in Xs"
        None
    }
}

impl std::fmt::Debug for ChatService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ChatService").finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests would use mocks - see mocks module
}
