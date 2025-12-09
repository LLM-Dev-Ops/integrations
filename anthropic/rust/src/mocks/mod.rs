//! Mock implementations for testing.
//!
//! This module provides mock implementations of core traits to support
//! London-School TDD practices.

use crate::auth::AuthManager;
use crate::errors::{AnthropicError, AnthropicResult};
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;
use async_trait::async_trait;
use bytes::Bytes;
use futures::stream::{self, Stream};
use http::{HeaderMap, Method, Response};
use mockall::mock;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use url::Url;

/// Mock HTTP transport for testing
pub struct MockHttpTransport {
    responses: Arc<Mutex<HashMap<String, AnthropicResult<Response<Bytes>>>>>,
    streaming_responses: Arc<Mutex<HashMap<String, Vec<AnthropicResult<Bytes>>>>>,
}

impl MockHttpTransport {
    /// Create a new mock transport
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(HashMap::new())),
            streaming_responses: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Set a mock response for a URL
    pub fn expect_response(&self, url: impl Into<String>, response: Response<Bytes>) {
        let mut responses = self.responses.lock().unwrap();
        responses.insert(url.into(), Ok(response));
    }

    /// Set a mock error for a URL
    pub fn expect_error(&self, url: impl Into<String>, error: AnthropicError) {
        let mut responses = self.responses.lock().unwrap();
        responses.insert(url.into(), Err(error));
    }

    /// Set a mock streaming response for a URL
    pub fn expect_streaming_response(&self, url: impl Into<String>, chunks: Vec<Bytes>) {
        let mut streaming_responses = self.streaming_responses.lock().unwrap();
        streaming_responses.insert(url.into(), chunks.into_iter().map(Ok).collect());
    }

    /// Set a mock streaming error for a URL
    pub fn expect_streaming_error(&self, url: impl Into<String>, error: AnthropicError) {
        let mut streaming_responses = self.streaming_responses.lock().unwrap();
        streaming_responses.insert(url.into(), vec![Err(error)]);
    }
}

impl Default for MockHttpTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpTransport for MockHttpTransport {
    async fn send(
        &self,
        _method: Method,
        url: Url,
        _headers: HeaderMap,
        _body: Option<Bytes>,
    ) -> AnthropicResult<Response<Bytes>> {
        let responses = self.responses.lock().unwrap();
        
        responses
            .get(url.as_str())
            .cloned()
            .unwrap_or_else(|| {
                Err(AnthropicError::Internal {
                    message: format!("No mock response configured for URL: {}", url),
                })
            })
    }

    async fn send_streaming(
        &self,
        _method: Method,
        url: Url,
        _headers: HeaderMap,
        _body: Option<Bytes>,
    ) -> AnthropicResult<Pin<Box<dyn Stream<Item = AnthropicResult<Bytes>> + Send>>> {
        let streaming_responses = self.streaming_responses.lock().unwrap();
        
        let chunks = streaming_responses
            .get(url.as_str())
            .cloned()
            .unwrap_or_else(|| {
                vec![Err(AnthropicError::Internal {
                    message: format!("No mock streaming response configured for URL: {}", url),
                })]
            });

        Ok(Box::pin(stream::iter(chunks)))
    }
}

/// Mock auth manager for testing
pub struct MockAuthManager {
    headers: HeaderMap,
    validation_result: Result<(), String>,
}

impl MockAuthManager {
    /// Create a new mock auth manager
    pub fn new() -> Self {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", "mock-key".parse().unwrap());
        headers.insert("anthropic-version", "2023-06-01".parse().unwrap());
        headers.insert("content-type", "application/json".parse().unwrap());

        Self {
            headers,
            validation_result: Ok(()),
        }
    }

    /// Set custom headers
    pub fn with_headers(mut self, headers: HeaderMap) -> Self {
        self.headers = headers;
        self
    }

    /// Set validation result
    pub fn with_validation_result(mut self, result: Result<(), String>) -> Self {
        self.validation_result = result;
        self
    }
}

impl Default for MockAuthManager {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl AuthManager for MockAuthManager {
    fn get_headers(&self) -> HeaderMap {
        self.headers.clone()
    }

    fn validate_api_key(&self) -> Result<(), String> {
        self.validation_result.clone()
    }
}

// Mockall-based mocks for better expectations
mock! {
    pub HttpTransport {}

    #[async_trait]
    impl HttpTransport for HttpTransport {
        async fn send(
            &self,
            method: Method,
            url: url::Url,
            headers: HeaderMap,
            body: Option<Bytes>,
        ) -> AnthropicResult<Response<Bytes>>;

        async fn send_streaming(
            &self,
            method: Method,
            url: url::Url,
            headers: HeaderMap,
            body: Option<Bytes>,
        ) -> AnthropicResult<Pin<Box<dyn Stream<Item = AnthropicResult<Bytes>> + Send>>>;
    }
}

mock! {
    pub AuthManager {}

    #[async_trait]
    impl AuthManager for AuthManager {
        fn get_headers(&self) -> HeaderMap;
        fn validate_api_key(&self) -> Result<(), String>;
    }
}

mock! {
    pub ResilienceOrchestrator {}

    #[async_trait]
    impl ResilienceOrchestrator for ResilienceOrchestrator {
        async fn execute<F, Fut, T>(&self, operation: &str, f: F) -> Result<T, AnthropicError>
        where
            F: Fn() -> Fut + Send + Sync + 'static,
            Fut: Future<Output = Result<T, AnthropicError>> + Send + 'static,
            T: Send + 'static;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::StatusCode;

    #[tokio::test]
    async fn test_mock_transport_response() {
        let transport = MockHttpTransport::new();
        
        let response = Response::builder()
            .status(StatusCode::OK)
            .body(Bytes::from("test"))
            .unwrap();

        transport.expect_response("https://example.com/test", response);

        let result = transport
            .send(
                Method::GET,
                Url::parse("https://example.com/test").unwrap(),
                HeaderMap::new(),
                None,
            )
            .await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body(), &Bytes::from("test"));
    }

    #[tokio::test]
    async fn test_mock_transport_error() {
        let transport = MockHttpTransport::new();
        
        transport.expect_error(
            "https://example.com/error",
            AnthropicError::Network {
                message: "Connection failed".to_string(),
            },
        );

        let result = transport
            .send(
                Method::GET,
                Url::parse("https://example.com/error").unwrap(),
                HeaderMap::new(),
                None,
            )
            .await;

        assert!(result.is_err());
    }

    #[test]
    fn test_mock_auth_manager() {
        let manager = MockAuthManager::new();
        let headers = manager.get_headers();
        
        assert!(headers.contains_key("x-api-key"));
        assert!(headers.contains_key("anthropic-version"));
        assert_eq!(manager.validate_api_key(), Ok(()));
    }
}
