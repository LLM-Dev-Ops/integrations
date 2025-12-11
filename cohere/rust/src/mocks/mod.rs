//! Mock implementations for testing.
//!
//! This module provides mock implementations of all service traits
//! for use in unit and integration tests following London-School TDD.

use crate::auth::AuthManager;
use crate::errors::CohereResult;
use crate::services::chat::{ChatRequest, ChatResponse, ChatService, ChatStream};
use crate::services::classify::{ClassifyRequest, ClassifyResponse, ClassifyService};
use crate::services::embed::{EmbedJob, EmbedJobRequest, EmbedRequest, EmbedResponse, EmbedService};
use crate::services::generate::{GenerateRequest, GenerateResponse, GenerateService, GenerateStream};
use crate::services::models::{ModelInfo, ModelListResponse, ModelsService};
use crate::services::rerank::{RerankRequest, RerankResponse, RerankService};
use crate::services::summarize::{SummarizeRequest, SummarizeResponse, SummarizeService};
use crate::services::tokenize::{
    DetokenizeRequest, DetokenizeResponse, TokenizeRequest, TokenizeResponse, TokenizeService,
};
use crate::transport::{HttpTransport, TransportResponse};
use async_trait::async_trait;
use bytes::Bytes;
use http::{HeaderMap, Method};
use parking_lot::Mutex;
use std::collections::VecDeque;
use std::sync::Arc;
use url::Url;

/// Mock HTTP transport for testing
pub struct MockHttpTransport {
    responses: Mutex<VecDeque<MockResponse>>,
    requests: Mutex<Vec<MockRequest>>,
}

/// A mock response to return
#[derive(Clone)]
pub struct MockResponse {
    /// HTTP status code
    pub status: u16,
    /// Response body
    pub body: Vec<u8>,
    /// Response headers
    pub headers: HeaderMap,
}

impl MockResponse {
    /// Create a successful JSON response
    pub fn json<T: serde::Serialize>(data: &T) -> Self {
        Self {
            status: 200,
            body: serde_json::to_vec(data).unwrap(),
            headers: HeaderMap::new(),
        }
    }

    /// Create an error response
    pub fn error(status: u16, message: &str) -> Self {
        let body = serde_json::json!({
            "message": message
        });
        Self {
            status,
            body: serde_json::to_vec(&body).unwrap(),
            headers: HeaderMap::new(),
        }
    }
}

/// A recorded request
#[derive(Debug, Clone)]
pub struct MockRequest {
    /// HTTP method
    pub method: Method,
    /// Request URL
    pub url: String,
    /// Request body
    pub body: Option<Vec<u8>>,
}

impl MockHttpTransport {
    /// Create a new mock transport
    pub fn new() -> Self {
        Self {
            responses: Mutex::new(VecDeque::new()),
            requests: Mutex::new(Vec::new()),
        }
    }

    /// Add a response to return
    pub fn add_response(&self, response: MockResponse) {
        self.responses.lock().push_back(response);
    }

    /// Get recorded requests
    pub fn get_requests(&self) -> Vec<MockRequest> {
        self.requests.lock().clone()
    }

    /// Get the last request
    pub fn last_request(&self) -> Option<MockRequest> {
        self.requests.lock().last().cloned()
    }

    /// Clear recorded requests
    pub fn clear_requests(&self) {
        self.requests.lock().clear();
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
        method: Method,
        url: Url,
        _headers: HeaderMap,
        body: Option<Bytes>,
    ) -> CohereResult<TransportResponse> {
        // Record the request
        self.requests.lock().push(MockRequest {
            method: method.clone(),
            url: url.to_string(),
            body: body.as_ref().map(|b| b.to_vec()),
        });

        // Return the next response
        let response = self.responses.lock().pop_front().unwrap_or(MockResponse {
            status: 500,
            body: b"No mock response configured".to_vec(),
            headers: HeaderMap::new(),
        });

        Ok(TransportResponse {
            status: response.status,
            headers: response.headers,
            body: Bytes::from(response.body),
        })
    }

    async fn send_streaming(
        &self,
        method: Method,
        url: Url,
        headers: HeaderMap,
        body: Option<Bytes>,
    ) -> CohereResult<std::pin::Pin<Box<dyn futures::Stream<Item = CohereResult<Bytes>> + Send>>>
    {
        // For streaming, we just return an empty stream in the mock
        // A more sophisticated mock could return test SSE data
        let _ = self.send(method, url, headers, body).await?;
        Ok(Box::pin(futures::stream::empty()))
    }
}

/// Mock auth manager
pub struct MockAuthManager {
    headers: HeaderMap,
}

impl MockAuthManager {
    /// Create a new mock auth manager
    pub fn new() -> Self {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer mock-api-key".parse().unwrap());
        headers.insert("content-type", "application/json".parse().unwrap());
        Self { headers }
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

    fn add_auth_headers(&self, headers: &mut HeaderMap) {
        for (name, value) in &self.headers {
            headers.insert(name.clone(), value.clone());
        }
    }

    fn validate_api_key(&self) -> Result<(), String> {
        Ok(())
    }
}

/// Builder for creating mock clients
pub struct MockClientBuilder {
    transport: Arc<MockHttpTransport>,
    auth: Arc<MockAuthManager>,
}

impl MockClientBuilder {
    /// Create a new mock client builder
    pub fn new() -> Self {
        Self {
            transport: Arc::new(MockHttpTransport::new()),
            auth: Arc::new(MockAuthManager::new()),
        }
    }

    /// Add a mock response
    pub fn with_response(self, response: MockResponse) -> Self {
        self.transport.add_response(response);
        self
    }

    /// Get the transport for adding more responses
    pub fn transport(&self) -> Arc<MockHttpTransport> {
        self.transport.clone()
    }

    /// Build a mock service
    pub fn build<S, F>(self, factory: F) -> (S, Arc<MockHttpTransport>)
    where
        F: FnOnce(Arc<dyn HttpTransport>, Arc<dyn AuthManager>, Url) -> S,
    {
        let transport = self.transport.clone();
        let service = factory(
            self.transport as Arc<dyn HttpTransport>,
            self.auth as Arc<dyn AuthManager>,
            Url::parse("https://api.cohere.ai").unwrap(),
        );
        (service, transport)
    }
}

impl Default for MockClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_transport() {
        let transport = MockHttpTransport::new();
        transport.add_response(MockResponse::json(&serde_json::json!({"text": "Hello"})));

        let response = transport
            .send(
                Method::POST,
                Url::parse("https://api.cohere.ai/v1/chat").unwrap(),
                HeaderMap::new(),
                Some(Bytes::from(r#"{"message": "Hi"}"#)),
            )
            .await
            .unwrap();

        assert_eq!(response.status, 200);

        let requests = transport.get_requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].method, Method::POST);
    }

    #[test]
    fn test_mock_auth_manager() {
        let auth = MockAuthManager::new();
        let headers = auth.get_headers();

        assert!(headers.get("authorization").is_some());
        assert!(auth.validate_api_key().is_ok());
    }
}
