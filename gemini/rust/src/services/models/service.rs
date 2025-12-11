//! Models service implementation.

use super::ModelsService;
use crate::auth::AuthManager;
use crate::config::GeminiConfig;
use crate::error::{GeminiError, ResourceError};
use crate::transport::{HttpTransport, HttpRequest, HttpMethod};
use crate::types::{Model, ListModelsParams, ListModelsResponse};
use async_trait::async_trait;
use bytes::Bytes;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Default cache TTL for model metadata (5 minutes).
const DEFAULT_CACHE_TTL: Duration = Duration::from_secs(300);

/// Cache entry for model metadata.
#[derive(Debug, Clone)]
struct CacheEntry {
    model: Model,
    expires_at: Instant,
}

/// Models cache with TTL support.
#[derive(Debug, Clone)]
struct ModelsCache {
    entries: Arc<Mutex<HashMap<String, CacheEntry>>>,
    ttl: Duration,
}

impl ModelsCache {
    /// Create a new models cache with the specified TTL.
    fn new(ttl: Duration) -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            ttl,
        }
    }

    /// Get a model from the cache if it exists and hasn't expired.
    fn get(&self, name: &str) -> Option<Model> {
        let mut entries = self.entries.lock().unwrap();
        if let Some(entry) = entries.get(name) {
            if entry.expires_at > Instant::now() {
                return Some(entry.model.clone());
            } else {
                // Entry has expired, remove it
                entries.remove(name);
            }
        }
        None
    }

    /// Insert a model into the cache.
    fn insert(&self, name: String, model: Model) {
        let mut entries = self.entries.lock().unwrap();
        entries.insert(name, CacheEntry {
            model,
            expires_at: Instant::now() + self.ttl,
        });
    }

    /// Clear all cached entries.
    fn clear(&self) {
        let mut entries = self.entries.lock().unwrap();
        entries.clear();
    }
}

/// Implementation of the ModelsService.
pub struct ModelsServiceImpl {
    config: Arc<GeminiConfig>,
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    cache: Option<ModelsCache>,
}

impl ModelsServiceImpl {
    /// Create a new models service implementation.
    pub fn new(
        config: Arc<GeminiConfig>,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
    ) -> Self {
        Self {
            config,
            transport,
            auth_manager,
            cache: Some(ModelsCache::new(DEFAULT_CACHE_TTL)),
        }
    }

    /// Create a new models service implementation without caching.
    pub fn new_without_cache(
        config: Arc<GeminiConfig>,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
    ) -> Self {
        Self {
            config,
            transport,
            auth_manager,
            cache: None,
        }
    }

    /// Normalize model name by adding "models/" prefix if missing.
    fn normalize_model_name(&self, name: &str) -> String {
        if name.starts_with("models/") {
            name.to_string()
        } else {
            format!("models/{}", name)
        }
    }

    /// Build the URL for listing models.
    fn build_list_url(&self, params: &Option<ListModelsParams>) -> String {
        let mut url = format!(
            "{}/{}/models",
            self.config.base_url,
            self.config.api_version
        );

        // Add query parameters if present
        if let Some(params) = params {
            let mut query_params = Vec::new();

            if let Some(page_size) = params.page_size {
                query_params.push(format!("pageSize={}", page_size));
            }

            if let Some(ref page_token) = params.page_token {
                query_params.push(format!("pageToken={}", page_token));
            }

            if !query_params.is_empty() {
                url = format!("{}?{}", url, query_params.join("&"));
            }
        }

        url
    }

    /// Build the URL for getting a specific model.
    fn build_get_url(&self, name: &str) -> String {
        let normalized_name = self.normalize_model_name(name);
        format!(
            "{}/{}/{}",
            self.config.base_url,
            self.config.api_version,
            normalized_name
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
            let separator = if url.contains('?') { "&" } else { "?" };
            url = format!("{}{}{}}={}", url, separator, key, value);
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
                        400 => GeminiError::Request(crate::error::RequestError::InvalidParameter {
                            parameter: "request".to_string(),
                            message,
                        }),
                        401 | 403 => GeminiError::Authentication(
                            crate::error::AuthenticationError::InvalidApiKey
                        ),
                        404 => GeminiError::Resource(ResourceError::ModelNotFound {
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

    /// List all models by paginating through all pages.
    pub async fn list_all(&self) -> Result<Vec<Model>, GeminiError> {
        let mut all_models = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let params = ListModelsParams {
                page_size: Some(100),
                page_token: page_token.clone(),
            };

            let response = self.list(Some(params)).await?;
            all_models.extend(response.models);

            if response.next_page_token.is_none() {
                break;
            }

            page_token = response.next_page_token;
        }

        Ok(all_models)
    }
}

#[async_trait]
impl ModelsService for ModelsServiceImpl {
    async fn list(
        &self,
        params: Option<ListModelsParams>,
    ) -> Result<ListModelsResponse, GeminiError> {
        // Build URL with query parameters
        let url = self.build_list_url(&params);
        let url = self.add_auth_to_url(url);

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
        let list_response: ListModelsResponse = serde_json::from_slice(&response.body)?;
        Ok(list_response)
    }

    async fn get(&self, model: &str) -> Result<Model, GeminiError> {
        let normalized_name = self.normalize_model_name(model);

        // Check cache first
        if let Some(ref cache) = self.cache {
            if let Some(cached_model) = cache.get(&normalized_name) {
                return Ok(cached_model);
            }
        }

        // Build URL
        let url = self.build_get_url(model);
        let url = self.add_auth_to_url(url);

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
        let model_info: Model = serde_json::from_slice(&response.body)?;

        // Cache the result
        if let Some(ref cache) = self.cache {
            cache.insert(normalized_name, model_info.clone());
        }

        Ok(model_info)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_expiration() {
        let cache = ModelsCache::new(Duration::from_millis(100));

        let model = Model {
            name: "models/gemini-pro".to_string(),
            version: Some("001".to_string()),
            display_name: Some("Gemini Pro".to_string()),
            description: Some("Test model".to_string()),
            input_token_limit: Some(32000),
            output_token_limit: Some(8000),
            supported_generation_methods: Some(vec!["generateContent".to_string()]),
            temperature: Some(0.7),
            top_p: Some(0.9),
            top_k: Some(40),
            max_temperature: Some(2.0),
        };

        cache.insert("models/gemini-pro".to_string(), model.clone());

        // Should be in cache immediately
        assert!(cache.get("models/gemini-pro").is_some());

        // Wait for expiration
        std::thread::sleep(Duration::from_millis(150));

        // Should be expired
        assert!(cache.get("models/gemini-pro").is_none());
    }

    #[test]
    fn test_normalize_model_name() {
        use crate::auth::ApiKeyAuthManager;
        use crate::transport::ReqwestTransport;
        use secrecy::SecretString;

        let config = Arc::new(GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap());

        let transport = Arc::new(ReqwestTransport::new(&config).unwrap());
        let auth = Arc::new(ApiKeyAuthManager::from_config(&config));

        let service = ModelsServiceImpl::new(config, transport, auth);

        assert_eq!(
            service.normalize_model_name("gemini-pro"),
            "models/gemini-pro"
        );
        assert_eq!(
            service.normalize_model_name("models/gemini-pro"),
            "models/gemini-pro"
        );
    }
}
