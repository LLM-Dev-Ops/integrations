//! Cached content service implementation for Gemini API.

use super::CachedContentService;
use super::validation::{validate_create_request, validate_update_request, validate_cached_content_name};
use crate::auth::AuthManager;
use crate::config::GeminiConfig;
use crate::error::{GeminiError, GeminiResult, RequestError, ResourceError};
use crate::transport::{HttpTransport, HttpRequest, HttpMethod};
use crate::types::{
    CachedContent, CreateCachedContentRequest, UpdateCachedContentRequest,
    ListCachedContentsParams, ListCachedContentsResponse,
};
use async_trait::async_trait;
use bytes::Bytes;
use std::collections::HashMap;
use std::sync::Arc;

/// Implementation of the CachedContent service.
pub struct CachedContentServiceImpl {
    config: Arc<GeminiConfig>,
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
}

impl CachedContentServiceImpl {
    /// Create a new cached content service instance.
    pub fn new(
        config: Arc<GeminiConfig>,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
    ) -> Self {
        Self {
            config,
            transport,
            auth_manager,
        }
    }

    /// Build the base URL for cached contents.
    fn build_base_url(&self) -> String {
        format!(
            "{}/{}/cachedContents",
            self.config.base_url,
            self.config.api_version
        )
    }

    /// Build the URL for a specific cached content.
    fn build_cached_content_url(&self, name: &str) -> String {
        format!(
            "{}/{}/{}",
            self.config.base_url,
            self.config.api_version,
            name
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

    /// Add auth and pagination query params to URL.
    fn add_query_params(&self, mut url: String, params: Option<&ListCachedContentsParams>) -> String {
        let mut query_parts = Vec::new();

        // Add auth query param if needed
        if let Some((key, value)) = self.auth_manager.get_auth_query_param() {
            query_parts.push(format!("{}={}", key, value));
        }

        // Add pagination params
        if let Some(params) = params {
            if let Some(page_size) = params.page_size {
                query_parts.push(format!("pageSize={}", page_size));
            }
            if let Some(ref page_token) = params.page_token {
                query_parts.push(format!("pageToken={}", urlencoding::encode(page_token)));
            }
        }

        if !query_parts.is_empty() {
            url = format!("{}?{}", url, query_parts.join("&"));
        }

        url
    }

    /// Add updateMask query param for PATCH requests.
    fn add_update_mask(&self, mut url: String, request: &UpdateCachedContentRequest) -> String {
        let mut query_parts = Vec::new();

        // Add auth query param if needed
        if let Some((key, value)) = self.auth_manager.get_auth_query_param() {
            query_parts.push(format!("{}={}", key, value));
        }

        // Build update mask
        let mut fields = Vec::new();
        if request.ttl.is_some() {
            fields.push("ttl");
        }
        if request.expire_time.is_some() {
            fields.push("expire_time");
        }

        if !fields.is_empty() {
            query_parts.push(format!("updateMask={}", fields.join(",")));
        }

        if !query_parts.is_empty() {
            url = format!("{}?{}", url, query_parts.join("&"));
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
                        404 => GeminiError::Resource(ResourceError::CachedContentNotFound {
                            name: "unknown".to_string(),
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
impl CachedContentService for CachedContentServiceImpl {
    async fn create(
        &self,
        request: CreateCachedContentRequest,
    ) -> Result<CachedContent, GeminiError> {
        // Validate request
        validate_create_request(&request)?;

        // Build URL
        let url = self.build_base_url();
        let url = self.add_query_params(url, None);

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
        let cached_content: CachedContent = serde_json::from_slice(&response.body)?;
        Ok(cached_content)
    }

    async fn list(
        &self,
        params: Option<ListCachedContentsParams>,
    ) -> Result<ListCachedContentsResponse, GeminiError> {
        // Build URL
        let url = self.build_base_url();
        let url = self.add_query_params(url, params.as_ref());

        // Build headers
        let headers = self.build_headers();

        // Create HTTP request
        let http_request = HttpRequest {
            method: HttpMethod::Get,
            url,
            headers,
            body: None,
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
        let list_response: ListCachedContentsResponse = serde_json::from_slice(&response.body)?;
        Ok(list_response)
    }

    async fn get(&self, name: &str) -> Result<CachedContent, GeminiError> {
        // Validate name
        validate_cached_content_name(name)?;

        // Build URL - handle both "cachedContents/name" and just "name"
        let resource_name = if name.starts_with("cachedContents/") {
            name.to_string()
        } else {
            format!("cachedContents/{}", name)
        };

        let url = self.build_cached_content_url(&resource_name);
        let url = self.add_query_params(url, None);

        // Build headers
        let headers = self.build_headers();

        // Create HTTP request
        let http_request = HttpRequest {
            method: HttpMethod::Get,
            url,
            headers,
            body: None,
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
        let cached_content: CachedContent = serde_json::from_slice(&response.body)?;
        Ok(cached_content)
    }

    async fn update(
        &self,
        name: &str,
        request: UpdateCachedContentRequest,
    ) -> Result<CachedContent, GeminiError> {
        // Validate name and request
        validate_cached_content_name(name)?;
        validate_update_request(&request)?;

        // Build URL - handle both "cachedContents/name" and just "name"
        let resource_name = if name.starts_with("cachedContents/") {
            name.to_string()
        } else {
            format!("cachedContents/{}", name)
        };

        let url = self.build_cached_content_url(&resource_name);
        let url = self.add_update_mask(url, &request);

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
            method: HttpMethod::Patch,
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
        let cached_content: CachedContent = serde_json::from_slice(&response.body)?;
        Ok(cached_content)
    }

    async fn delete(&self, name: &str) -> Result<(), GeminiError> {
        // Validate name
        validate_cached_content_name(name)?;

        // Build URL - handle both "cachedContents/name" and just "name"
        let resource_name = if name.starts_with("cachedContents/") {
            name.to_string()
        } else {
            format!("cachedContents/{}", name)
        };

        let url = self.build_cached_content_url(&resource_name);
        let url = self.add_query_params(url, None);

        // Build headers
        let headers = self.build_headers();

        // Create HTTP request
        let http_request = HttpRequest {
            method: HttpMethod::Delete,
            url,
            headers,
            body: None,
        };

        // Send request
        let response = self.transport.send(http_request)
            .await
            .map_err(|e| GeminiError::Network(crate::error::NetworkError::ConnectionFailed {
                message: e.to_string(),
            }))?;

        // Check status - DELETE typically returns 204 No Content on success
        if response.status != 200 && response.status != 204 {
            return Err(self.parse_error(response.status, &response.body));
        }

        Ok(())
    }
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}
