//! Tokenize service implementation.

use super::types::{DetokenizeRequest, DetokenizeResponse, TokenizeRequest, TokenizeResponse};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult, ValidationDetail};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Tokenize service trait for testability
#[async_trait]
pub trait TokenizeService: Send + Sync {
    /// Tokenize text
    async fn tokenize(&self, request: TokenizeRequest) -> CohereResult<TokenizeResponse>;

    /// Detokenize tokens
    async fn detokenize(&self, request: DetokenizeRequest) -> CohereResult<DetokenizeResponse>;

    /// Count tokens in text
    async fn count_tokens(&self, text: &str, model: &str) -> CohereResult<usize> {
        let response = self.tokenize(TokenizeRequest::new(text, model)).await?;
        Ok(response.len())
    }
}

/// Implementation of the Tokenize service
pub struct TokenizeServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl TokenizeServiceImpl {
    /// Create a new Tokenize service
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

    /// Validate a tokenize request
    fn validate_tokenize(&self, request: &TokenizeRequest) -> CohereResult<()> {
        let mut errors = Vec::new();

        if request.text.is_empty() {
            errors.push(ValidationDetail::new("text", "Text cannot be empty"));
        }

        if request.model.is_empty() {
            errors.push(ValidationDetail::new("model", "Model is required"));
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(CohereError::Validation {
                message: format!(
                    "Tokenize request validation failed: {} error(s)",
                    errors.len()
                ),
                details: errors,
            })
        }
    }

    /// Validate a detokenize request
    fn validate_detokenize(&self, request: &DetokenizeRequest) -> CohereResult<()> {
        let mut errors = Vec::new();

        if request.tokens.is_empty() {
            errors.push(ValidationDetail::new("tokens", "Tokens cannot be empty"));
        }

        if request.model.is_empty() {
            errors.push(ValidationDetail::new("model", "Model is required"));
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(CohereError::Validation {
                message: format!(
                    "Detokenize request validation failed: {} error(s)",
                    errors.len()
                ),
                details: errors,
            })
        }
    }
}

#[async_trait]
impl TokenizeService for TokenizeServiceImpl {
    async fn tokenize(&self, request: TokenizeRequest) -> CohereResult<TokenizeResponse> {
        // Validate request
        self.validate_tokenize(&request)?;

        // Build URL
        let url = self.url("/v1/tokenize")?;

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
        let tokenize_response: TokenizeResponse = serde_json::from_slice(&response.body)?;

        Ok(tokenize_response)
    }

    async fn detokenize(&self, request: DetokenizeRequest) -> CohereResult<DetokenizeResponse> {
        // Validate request
        self.validate_detokenize(&request)?;

        // Build URL
        let url = self.url("/v1/detokenize")?;

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
        let detokenize_response: DetokenizeResponse = serde_json::from_slice(&response.body)?;

        Ok(detokenize_response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_service() -> TokenizeServiceImpl {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        TokenizeServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap())
    }

    #[test]
    fn test_validate_tokenize() {
        let service = create_service();
        let request = TokenizeRequest::new("Hello, world!", "command");
        assert!(service.validate_tokenize(&request).is_ok());
    }

    #[test]
    fn test_validate_tokenize_empty_text() {
        let service = create_service();
        let request = TokenizeRequest::new("", "command");
        assert!(service.validate_tokenize(&request).is_err());
    }

    #[test]
    fn test_validate_detokenize() {
        let service = create_service();
        let request = DetokenizeRequest::new(vec![1, 2, 3], "command");
        assert!(service.validate_detokenize(&request).is_ok());
    }

    #[test]
    fn test_validate_detokenize_empty_tokens() {
        let service = create_service();
        let request = DetokenizeRequest::new(vec![], "command");
        assert!(service.validate_detokenize(&request).is_err());
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
