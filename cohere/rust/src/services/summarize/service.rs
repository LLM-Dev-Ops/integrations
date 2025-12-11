//! Summarize service implementation.

use super::types::{SummarizeRequest, SummarizeResponse};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult, ValidationDetail};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Summarize service trait for testability
#[async_trait]
pub trait SummarizeService: Send + Sync {
    /// Summarize text
    async fn summarize(&self, request: SummarizeRequest) -> CohereResult<SummarizeResponse>;
}

/// Implementation of the Summarize service
pub struct SummarizeServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl SummarizeServiceImpl {
    /// Create a new Summarize service
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
    fn summarize_url(&self) -> CohereResult<String> {
        self.base_url
            .join("/v1/summarize")
            .map(|u| u.to_string())
            .map_err(|e| CohereError::Configuration {
                message: format!("Invalid URL: {}", e),
            })
    }

    /// Validate a summarize request
    fn validate(&self, request: &SummarizeRequest) -> CohereResult<()> {
        let mut errors = Vec::new();

        if request.text.is_empty() {
            errors.push(ValidationDetail::new("text", "Text cannot be empty"));
        }

        if request.text.len() < 250 {
            errors.push(ValidationDetail::with_value(
                "text",
                "Text must be at least 250 characters",
                request.text.len().to_string(),
            ));
        }

        if let Some(temp) = request.temperature {
            if !(0.0..=5.0).contains(&temp) {
                errors.push(ValidationDetail::with_value(
                    "temperature",
                    "Temperature must be between 0.0 and 5.0",
                    temp.to_string(),
                ));
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(CohereError::Validation {
                message: format!(
                    "Summarize request validation failed: {} error(s)",
                    errors.len()
                ),
                details: errors,
            })
        }
    }
}

#[async_trait]
impl SummarizeService for SummarizeServiceImpl {
    async fn summarize(&self, request: SummarizeRequest) -> CohereResult<SummarizeResponse> {
        // Validate request
        self.validate(&request)?;

        // Build URL
        let url = self.summarize_url()?;

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
        let summarize_response: SummarizeResponse = serde_json::from_slice(&response.body)?;

        Ok(summarize_response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_service() -> SummarizeServiceImpl {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        SummarizeServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap())
    }

    #[test]
    fn test_validate_valid_request() {
        let service = create_service();
        let long_text = "A".repeat(300);
        let request = SummarizeRequest::new(long_text);
        assert!(service.validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_text() {
        let service = create_service();
        let request = SummarizeRequest::new("");
        assert!(service.validate(&request).is_err());
    }

    #[test]
    fn test_validate_short_text() {
        let service = create_service();
        let request = SummarizeRequest::new("Short text");
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
