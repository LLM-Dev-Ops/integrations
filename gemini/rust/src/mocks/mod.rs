//! Mock implementations for testing.
//!
//! This module provides mock implementations of transport and authentication
//! components for testing the Gemini API client in isolation.

use async_trait::async_trait;
use bytes::Bytes;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use futures::stream;

use crate::transport::{HttpTransport, HttpRequest, HttpResponse, HttpMethod, ChunkedStream, TransportError};
use crate::auth::AuthManager;

/// Mock HTTP transport for testing.
///
/// This mock allows tests to enqueue responses and verify requests in a controlled manner.
/// Supports both regular and streaming responses.
///
/// # Example
///
/// ```
/// use gemini_rust::mocks::MockHttpTransport;
/// use gemini_rust::transport::{HttpRequest, HttpMethod};
/// use std::collections::HashMap;
///
/// #[tokio::test]
/// async fn test_with_mock() {
///     let transport = MockHttpTransport::new();
///
///     // Enqueue a successful response
///     transport.enqueue_json_response(200, r#"{"status": "ok"}"#);
///
///     // Make a request
///     let request = HttpRequest {
///         method: HttpMethod::Get,
///         url: "https://example.com".to_string(),
///         headers: HashMap::new(),
///         body: None,
///     };
///
///     let response = transport.send(request).await.unwrap();
///     assert_eq!(response.status, 200);
///
///     // Verify the request was made
///     transport.verify_request_count(1);
/// }
/// ```
pub struct MockHttpTransport {
    responses: Arc<Mutex<VecDeque<Result<HttpResponse, TransportError>>>>,
    streaming_responses: Arc<Mutex<VecDeque<Result<Vec<Bytes>, TransportError>>>>,
    requests: Arc<Mutex<Vec<HttpRequest>>>,
}

impl MockHttpTransport {
    /// Create a new mock HTTP transport.
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(VecDeque::new())),
            streaming_responses: Arc::new(Mutex::new(VecDeque::new())),
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Enqueue a response to be returned by the next request.
    pub fn enqueue_response(&self, response: Result<HttpResponse, TransportError>) {
        self.responses.lock().unwrap().push_back(response);
    }

    /// Enqueue a JSON response with the given status code and body.
    pub fn enqueue_json_response(&self, status: u16, body: &str) {
        let mut headers = std::collections::HashMap::new();
        headers.insert("content-type".to_string(), "application/json".to_string());

        self.enqueue_response(Ok(HttpResponse {
            status,
            body: Bytes::from(body.to_string()),
            headers,
        }));
    }

    /// Enqueue an error response.
    pub fn enqueue_error(&self, error: TransportError) {
        self.enqueue_response(Err(error));
    }

    /// Enqueue a streaming response with multiple chunks.
    pub fn enqueue_streaming_response(&self, chunks: Vec<Bytes>) {
        self.streaming_responses.lock().unwrap().push_back(Ok(chunks));
    }

    /// Enqueue a streaming error.
    pub fn enqueue_streaming_error(&self, error: TransportError) {
        self.streaming_responses.lock().unwrap().push_back(Err(error));
    }

    /// Get all requests that were made.
    pub fn get_requests(&self) -> Vec<HttpRequest> {
        self.requests.lock().unwrap().clone()
    }

    /// Get the last request that was made.
    pub fn last_request(&self) -> Option<HttpRequest> {
        self.requests.lock().unwrap().last().cloned()
    }

    /// Verify that exactly `expected` requests were made.
    pub fn verify_request_count(&self, expected: usize) {
        let actual = self.requests.lock().unwrap().len();
        assert_eq!(actual, expected, "Expected {} requests, got {}", expected, actual);
    }

    /// Clear all recorded requests.
    pub fn clear_requests(&self) {
        self.requests.lock().unwrap().clear();
    }

    /// Verify that a request was made with the expected method and URL.
    pub fn verify_request(&self, index: usize, method: HttpMethod, url_contains: &str) {
        let requests = self.requests.lock().unwrap();
        assert!(index < requests.len(), "No request at index {}", index);

        let request = &requests[index];
        assert_eq!(request.method, method, "Expected method {:?}, got {:?}", method, request.method);
        assert!(
            request.url.contains(url_contains),
            "Expected URL to contain '{}', got '{}'",
            url_contains,
            request.url
        );
    }

    /// Verify that a request contains a specific header.
    pub fn verify_header(&self, index: usize, header_name: &str, header_value: &str) {
        let requests = self.requests.lock().unwrap();
        assert!(index < requests.len(), "No request at index {}", index);

        let request = &requests[index];
        let actual_value = request.headers.get(header_name);
        assert_eq!(
            actual_value,
            Some(&header_value.to_string()),
            "Expected header '{}' to be '{}', got {:?}",
            header_name,
            header_value,
            actual_value
        );
    }
}

impl Default for MockHttpTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpTransport for MockHttpTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        // Record the request
        self.requests.lock().unwrap().push(request);

        // Return the next response or an error if none configured
        self.responses
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| {
                Err(TransportError::Connection {
                    message: "No response configured in MockHttpTransport".into(),
                    source: None,
                })
            })
    }

    async fn send_streaming(&self, request: HttpRequest) -> Result<ChunkedStream, TransportError> {
        // Record the request
        self.requests.lock().unwrap().push(request);

        // Get the next streaming response
        let chunks = self.streaming_responses
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| {
                Err(TransportError::Connection {
                    message: "No streaming response configured in MockHttpTransport".into(),
                    source: None,
                })
            })?;

        // Convert chunks to a stream
        let stream = stream::iter(chunks.into_iter().map(Ok));
        Ok(Box::pin(stream))
    }
}

/// Mock authentication manager for testing.
///
/// This mock allows tests to verify authentication behavior without using real API keys.
///
/// # Example
///
/// ```
/// use gemini_rust::mocks::MockAuthManager;
/// use gemini_rust::auth::AuthManager;
///
/// let auth = MockAuthManager::new("test-api-key");
/// let header = auth.get_auth_header();
/// assert_eq!(header, Some(("x-goog-api-key".to_string(), "test-api-key".to_string())));
/// ```
#[derive(Clone)]
pub struct MockAuthManager {
    api_key: String,
    use_header: bool,
}

impl MockAuthManager {
    /// Create a new mock auth manager with the given API key.
    /// By default, uses header authentication.
    pub fn new(api_key: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            use_header: true,
        }
    }

    /// Create a mock auth manager that uses query parameter authentication.
    pub fn with_query_param(api_key: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            use_header: false,
        }
    }
}

impl AuthManager for MockAuthManager {
    fn get_auth_header(&self) -> Option<(String, String)> {
        if self.use_header {
            Some(("x-goog-api-key".to_string(), self.api_key.clone()))
        } else {
            None
        }
    }

    fn get_auth_query_param(&self) -> Option<(String, String)> {
        if !self.use_header {
            Some(("key".to_string(), self.api_key.clone()))
        } else {
            None
        }
    }

    fn clone_box(&self) -> Box<dyn AuthManager> {
        Box::new(self.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_transport_basic() {
        let transport = MockHttpTransport::new();
        transport.enqueue_json_response(200, r#"{"status": "ok"}"#);

        let request = HttpRequest {
            method: HttpMethod::Get,
            url: "https://example.com".to_string(),
            headers: std::collections::HashMap::new(),
            body: None,
        };

        let response = transport.send(request).await.unwrap();
        assert_eq!(response.status, 200);
        transport.verify_request_count(1);
    }

    #[tokio::test]
    async fn test_mock_transport_multiple_responses() {
        let transport = MockHttpTransport::new();
        transport.enqueue_json_response(200, r#"{"id": 1}"#);
        transport.enqueue_json_response(201, r#"{"id": 2}"#);

        let request1 = HttpRequest {
            method: HttpMethod::Post,
            url: "https://example.com/1".to_string(),
            headers: std::collections::HashMap::new(),
            body: None,
        };

        let request2 = HttpRequest {
            method: HttpMethod::Post,
            url: "https://example.com/2".to_string(),
            headers: std::collections::HashMap::new(),
            body: None,
        };

        let response1 = transport.send(request1).await.unwrap();
        let response2 = transport.send(request2).await.unwrap();

        assert_eq!(response1.status, 200);
        assert_eq!(response2.status, 201);
        transport.verify_request_count(2);
    }

    #[tokio::test]
    async fn test_mock_transport_error() {
        let transport = MockHttpTransport::new();
        transport.enqueue_error(TransportError::Connection {
            message: "Network error".into(),
            source: None,
        });

        let request = HttpRequest {
            method: HttpMethod::Get,
            url: "https://example.com".to_string(),
            headers: std::collections::HashMap::new(),
            body: None,
        };

        let result = transport.send(request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_mock_transport_streaming() {
        let transport = MockHttpTransport::new();
        let chunks = vec![
            Bytes::from("chunk1"),
            Bytes::from("chunk2"),
            Bytes::from("chunk3"),
        ];
        transport.enqueue_streaming_response(chunks.clone());

        let request = HttpRequest {
            method: HttpMethod::Post,
            url: "https://example.com/stream".to_string(),
            headers: std::collections::HashMap::new(),
            body: None,
        };

        let mut stream = transport.send_streaming(request).await.unwrap();

        use futures::StreamExt;
        let mut collected = Vec::new();
        while let Some(chunk) = stream.next().await {
            collected.push(chunk.unwrap());
        }

        assert_eq!(collected.len(), 3);
        assert_eq!(collected[0], chunks[0]);
        assert_eq!(collected[1], chunks[1]);
        assert_eq!(collected[2], chunks[2]);
    }

    #[test]
    fn test_mock_auth_manager_header() {
        let auth = MockAuthManager::new("test-key");

        let header = auth.get_auth_header();
        assert!(header.is_some());
        let (name, value) = header.unwrap();
        assert_eq!(name, "x-goog-api-key");
        assert_eq!(value, "test-key");

        assert!(auth.get_auth_query_param().is_none());
    }

    #[test]
    fn test_mock_auth_manager_query_param() {
        let auth = MockAuthManager::with_query_param("test-key");

        assert!(auth.get_auth_header().is_none());

        let param = auth.get_auth_query_param();
        assert!(param.is_some());
        let (name, value) = param.unwrap();
        assert_eq!(name, "key");
        assert_eq!(value, "test-key");
    }
}
