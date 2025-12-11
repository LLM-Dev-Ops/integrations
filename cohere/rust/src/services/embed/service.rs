//! Embed service implementation.

use super::types::{EmbedJob, EmbedJobRequest, EmbedRequest, EmbedResponse};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult, ValidationDetail};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Embed service trait for testability
#[async_trait]
pub trait EmbedService: Send + Sync {
    /// Embed texts
    async fn embed(&self, request: EmbedRequest) -> CohereResult<EmbedResponse>;

    /// Create an embed job for async processing
    async fn create_embed_job(&self, request: EmbedJobRequest) -> CohereResult<EmbedJob>;

    /// Get an embed job by ID
    async fn get_embed_job(&self, job_id: &str) -> CohereResult<EmbedJob>;

    /// List embed jobs
    async fn list_embed_jobs(&self) -> CohereResult<Vec<EmbedJob>>;

    /// Cancel an embed job
    async fn cancel_embed_job(&self, job_id: &str) -> CohereResult<()>;
}

/// Implementation of the Embed service
pub struct EmbedServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl EmbedServiceImpl {
    /// Create a new Embed service
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

    /// Validate an embed request
    fn validate(&self, request: &EmbedRequest) -> CohereResult<()> {
        let mut errors = Vec::new();

        if request.texts.is_empty() {
            errors.push(ValidationDetail::new("texts", "Texts cannot be empty"));
        }

        if request.texts.len() > 96 {
            errors.push(ValidationDetail::with_value(
                "texts",
                "Cannot embed more than 96 texts at once",
                request.texts.len().to_string(),
            ));
        }

        for (i, text) in request.texts.iter().enumerate() {
            if text.is_empty() {
                errors.push(ValidationDetail::new(
                    format!("texts[{}]", i),
                    "Text cannot be empty",
                ));
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(CohereError::Validation {
                message: format!("Embed request validation failed: {} error(s)", errors.len()),
                details: errors,
            })
        }
    }
}

#[async_trait]
impl EmbedService for EmbedServiceImpl {
    async fn embed(&self, request: EmbedRequest) -> CohereResult<EmbedResponse> {
        // Validate request
        self.validate(&request)?;

        // Build URL
        let url = self.url("/v1/embed")?;

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
        let embed_response: EmbedResponse = serde_json::from_slice(&response.body)?;

        Ok(embed_response)
    }

    async fn create_embed_job(&self, request: EmbedJobRequest) -> CohereResult<EmbedJob> {
        // Build URL
        let url = self.url("/v1/embed-jobs")?;

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
        let job: EmbedJob = serde_json::from_slice(&response.body)?;

        Ok(job)
    }

    async fn get_embed_job(&self, job_id: &str) -> CohereResult<EmbedJob> {
        // Build URL
        let url = self.url(&format!("/v1/embed-jobs/{}", job_id))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response
        let job: EmbedJob = serde_json::from_slice(&response.body)?;

        Ok(job)
    }

    async fn list_embed_jobs(&self) -> CohereResult<Vec<EmbedJob>> {
        // Build URL
        let url = self.url("/v1/embed-jobs")?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response - API returns {"embed_jobs": [...]}
        #[derive(serde::Deserialize)]
        struct ListResponse {
            embed_jobs: Vec<EmbedJob>,
        }

        let list_response: ListResponse = serde_json::from_slice(&response.body)?;

        Ok(list_response.embed_jobs)
    }

    async fn cancel_embed_job(&self, job_id: &str) -> CohereResult<()> {
        // Build URL
        let url = self.url(&format!("/v1/embed-jobs/{}/cancel", job_id))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        self.transport
            .execute(Method::POST, url, headers, None)
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_valid_request() {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        let service =
            EmbedServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap());

        let request = EmbedRequest::new(vec!["Hello".to_string(), "World".to_string()]);
        assert!(service.validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_texts() {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        let service =
            EmbedServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap());

        let request = EmbedRequest::new(vec![]);
        assert!(service.validate(&request).is_err());
    }

    #[test]
    fn test_validate_too_many_texts() {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        let service =
            EmbedServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap());

        let texts: Vec<String> = (0..100).map(|i| format!("text {}", i)).collect();
        let request = EmbedRequest::new(texts);
        assert!(service.validate(&request).is_err());
    }

    // Mock implementations
    struct MockTransport;

    #[async_trait]
    impl HttpTransport for MockTransport {
        async fn send(
            &self,
            _method: Method,
            _url: Url,
            _headers: HeaderMap,
            _body: Option<bytes::Bytes>,
        ) -> CohereResult<crate::transport::TransportResponse> {
            unimplemented!()
        }

        async fn send_streaming(
            &self,
            _method: Method,
            _url: Url,
            _headers: HeaderMap,
            _body: Option<bytes::Bytes>,
        ) -> CohereResult<
            std::pin::Pin<Box<dyn futures::Stream<Item = CohereResult<bytes::Bytes>> + Send>>,
        > {
            unimplemented!()
        }
    }

    struct MockAuth;

    #[async_trait]
    impl AuthManager for MockAuth {
        fn get_headers(&self) -> HeaderMap {
            HeaderMap::new()
        }

        fn add_auth_headers(&self, _headers: &mut HeaderMap) {}

        fn validate_api_key(&self) -> Result<(), String> {
            Ok(())
        }
    }
}
