//! Generate service implementation.

use super::stream::GenerateStream;
use super::types::{GenerateRequest, GenerateResponse};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult, ValidationDetail};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Generate service trait for testability
#[async_trait]
pub trait GenerateService: Send + Sync {
    /// Generate text from a prompt
    async fn generate(&self, request: GenerateRequest) -> CohereResult<GenerateResponse>;

    /// Generate text with streaming
    async fn generate_stream(&self, request: GenerateRequest) -> CohereResult<GenerateStream>;
}

/// Implementation of the Generate service
pub struct GenerateServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl GenerateServiceImpl {
    /// Create a new Generate service
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

    /// Build the generate endpoint URL
    fn generate_url(&self) -> CohereResult<String> {
        self.base_url
            .join("/v1/generate")
            .map(|u| u.to_string())
            .map_err(|e| CohereError::Configuration {
                message: format!("Invalid URL: {}", e),
            })
    }

    /// Validate a generate request
    fn validate(&self, request: &GenerateRequest) -> CohereResult<()> {
        let mut errors = Vec::new();

        if request.prompt.is_empty() {
            errors.push(ValidationDetail::new("prompt", "Prompt cannot be empty"));
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

        if let Some(max) = request.max_tokens {
            if max == 0 {
                errors.push(ValidationDetail::with_value(
                    "max_tokens",
                    "max_tokens must be greater than 0",
                    max.to_string(),
                ));
            }
        }

        if let Some(num) = request.num_generations {
            if num == 0 || num > 5 {
                errors.push(ValidationDetail::with_value(
                    "num_generations",
                    "num_generations must be between 1 and 5",
                    num.to_string(),
                ));
            }
        }

        if let Some(p) = request.p {
            if !(0.0..=1.0).contains(&p) {
                errors.push(ValidationDetail::with_value(
                    "p",
                    "p must be between 0.0 and 1.0",
                    p.to_string(),
                ));
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(CohereError::Validation {
                message: format!(
                    "Generate request validation failed: {} error(s)",
                    errors.len()
                ),
                details: errors,
            })
        }
    }
}

#[async_trait]
impl GenerateService for GenerateServiceImpl {
    async fn generate(&self, mut request: GenerateRequest) -> CohereResult<GenerateResponse> {
        // Validate request
        self.validate(&request)?;

        // Ensure stream is disabled
        request.stream = Some(false);

        // Build URL
        let url = self.generate_url()?;

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
        let generate_response: GenerateResponse = serde_json::from_slice(&response.body)?;

        Ok(generate_response)
    }

    async fn generate_stream(&self, mut request: GenerateRequest) -> CohereResult<GenerateStream> {
        // Validate request
        self.validate(&request)?;

        // Enable streaming
        request.stream = Some(true);

        // Only 1 generation allowed for streaming
        request.num_generations = Some(1);

        // Build URL
        let url = self.generate_url()?;

        // Build headers
        let mut headers = self.build_headers();
        headers.insert("accept", "text/event-stream".parse().unwrap());

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute streaming request
        let stream = self
            .transport
            .execute_stream(Method::POST, url, headers, Some(body))
            .await?;

        // Wrap in GenerateStream
        Ok(GenerateStream::new(stream))
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
            GenerateServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap());

        let request = GenerateRequest::new("Hello, world!");
        assert!(service.validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_prompt() {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        let service =
            GenerateServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap());

        let request = GenerateRequest::new("");
        assert!(service.validate(&request).is_err());
    }

    // Mock implementations for testing
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
