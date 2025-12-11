//! Mock HTTP transport for testing.

use crate::error::S3Error;
use crate::transport::{HttpRequest, HttpResponse, HttpTransport};
use async_trait::async_trait;
use bytes::Bytes;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Mock HTTP response.
#[derive(Debug, Clone)]
pub struct MockResponse {
    /// HTTP status code.
    pub status: u16,
    /// Response headers.
    pub headers: HashMap<String, String>,
    /// Response body.
    pub body: Bytes,
}

impl MockResponse {
    /// Create a successful response with empty body.
    pub fn ok() -> Self {
        Self {
            status: 200,
            headers: HashMap::new(),
            body: Bytes::new(),
        }
    }

    /// Create a successful response with body.
    pub fn ok_with_body(body: impl Into<Bytes>) -> Self {
        Self {
            status: 200,
            headers: HashMap::new(),
            body: body.into(),
        }
    }

    /// Create a 204 No Content response.
    pub fn no_content() -> Self {
        Self {
            status: 204,
            headers: HashMap::new(),
            body: Bytes::new(),
        }
    }

    /// Create an error response.
    pub fn error(status: u16, body: impl Into<Bytes>) -> Self {
        Self {
            status,
            headers: HashMap::new(),
            body: body.into(),
        }
    }

    /// Add a header to the response.
    pub fn with_header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(key.into(), value.into());
        self
    }

    /// Add multiple headers to the response.
    pub fn with_headers(mut self, headers: HashMap<String, String>) -> Self {
        self.headers.extend(headers);
        self
    }
}

/// Builder for mock responses.
pub struct MockResponseBuilder {
    responses: Vec<MockResponse>,
}

impl MockResponseBuilder {
    /// Create a new mock response builder.
    pub fn new() -> Self {
        Self {
            responses: Vec::new(),
        }
    }

    /// Add a response to return.
    pub fn respond(mut self, response: MockResponse) -> Self {
        self.responses.push(response);
        self
    }

    /// Add multiple responses.
    pub fn respond_all(mut self, responses: Vec<MockResponse>) -> Self {
        self.responses.extend(responses);
        self
    }

    /// Build the mock transport.
    pub fn build(self) -> MockTransport {
        MockTransport::with_responses(self.responses)
    }
}

impl Default for MockResponseBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Mock HTTP transport for testing.
pub struct MockTransport {
    /// Queue of responses to return.
    responses: Mutex<Vec<MockResponse>>,
    /// Recorded requests.
    requests: Mutex<Vec<HttpRequest>>,
    /// Default response if no responses are queued.
    default_response: Option<MockResponse>,
}

impl MockTransport {
    /// Create a new mock transport with no responses.
    pub fn new() -> Self {
        Self {
            responses: Mutex::new(Vec::new()),
            requests: Mutex::new(Vec::new()),
            default_response: None,
        }
    }

    /// Create a mock transport with queued responses.
    pub fn with_responses(responses: Vec<MockResponse>) -> Self {
        Self {
            responses: Mutex::new(responses),
            requests: Mutex::new(Vec::new()),
            default_response: None,
        }
    }

    /// Create a mock transport with a default response.
    pub fn with_default(response: MockResponse) -> Self {
        Self {
            responses: Mutex::new(Vec::new()),
            requests: Mutex::new(Vec::new()),
            default_response: Some(response),
        }
    }

    /// Create a builder for the mock transport.
    pub fn builder() -> MockResponseBuilder {
        MockResponseBuilder::new()
    }

    /// Queue a response to return.
    pub fn queue_response(&self, response: MockResponse) {
        self.responses.lock().unwrap().push(response);
    }

    /// Get all recorded requests.
    pub fn requests(&self) -> Vec<HttpRequest> {
        self.requests.lock().unwrap().clone()
    }

    /// Get the number of requests made.
    pub fn request_count(&self) -> usize {
        self.requests.lock().unwrap().len()
    }

    /// Get the last request made.
    pub fn last_request(&self) -> Option<HttpRequest> {
        self.requests.lock().unwrap().last().cloned()
    }

    /// Clear all recorded requests.
    pub fn clear_requests(&self) {
        self.requests.lock().unwrap().clear();
    }

    /// Clear all queued responses.
    pub fn clear_responses(&self) {
        self.responses.lock().unwrap().clear();
    }
}

impl Default for MockTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpTransport for MockTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, S3Error> {
        // Record the request
        self.requests.lock().unwrap().push(request.clone());

        // Get the next response from the queue
        let response = {
            let mut responses = self.responses.lock().unwrap();
            if responses.is_empty() {
                self.default_response.clone()
            } else {
                Some(responses.remove(0))
            }
        };

        match response {
            Some(mock) => Ok(HttpResponse {
                status: mock.status,
                headers: mock.headers,
                body: mock.body,
            }),
            None => Err(S3Error::Network(crate::error::NetworkError::Connection {
                message: "No mock response available".to_string(),
            })),
        }
    }
}

impl std::fmt::Debug for MockTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockTransport")
            .field("queued_responses", &self.responses.lock().unwrap().len())
            .field("recorded_requests", &self.requests.lock().unwrap().len())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_transport_basic() {
        let transport = MockTransport::with_responses(vec![MockResponse::ok()]);

        let request = HttpRequest::new("GET", "https://example.com");
        let response = transport.send(request).await.unwrap();

        assert_eq!(response.status, 200);
        assert_eq!(transport.request_count(), 1);
    }

    #[tokio::test]
    async fn test_mock_transport_with_body() {
        let transport = MockTransport::with_responses(vec![
            MockResponse::ok_with_body("test body")
        ]);

        let request = HttpRequest::new("GET", "https://example.com");
        let response = transport.send(request).await.unwrap();

        assert_eq!(response.body, Bytes::from("test body"));
    }

    #[tokio::test]
    async fn test_mock_transport_with_headers() {
        let transport = MockTransport::with_responses(vec![
            MockResponse::ok()
                .with_header("x-custom", "value")
        ]);

        let request = HttpRequest::new("GET", "https://example.com");
        let response = transport.send(request).await.unwrap();

        assert_eq!(response.get_header("x-custom"), Some("value"));
    }

    #[tokio::test]
    async fn test_mock_transport_multiple_responses() {
        let transport = MockTransport::with_responses(vec![
            MockResponse::ok_with_body("first"),
            MockResponse::ok_with_body("second"),
        ]);

        let request1 = HttpRequest::new("GET", "https://example.com/1");
        let response1 = transport.send(request1).await.unwrap();
        assert_eq!(response1.body, Bytes::from("first"));

        let request2 = HttpRequest::new("GET", "https://example.com/2");
        let response2 = transport.send(request2).await.unwrap();
        assert_eq!(response2.body, Bytes::from("second"));
    }

    #[tokio::test]
    async fn test_mock_transport_default_response() {
        let transport = MockTransport::with_default(MockResponse::ok_with_body("default"));

        let request1 = HttpRequest::new("GET", "https://example.com/1");
        let response1 = transport.send(request1).await.unwrap();
        assert_eq!(response1.body, Bytes::from("default"));

        let request2 = HttpRequest::new("GET", "https://example.com/2");
        let response2 = transport.send(request2).await.unwrap();
        assert_eq!(response2.body, Bytes::from("default"));
    }

    #[tokio::test]
    async fn test_mock_transport_records_requests() {
        let transport = MockTransport::with_default(MockResponse::ok());

        let request = HttpRequest::new("POST", "https://example.com")
            .with_body(Bytes::from("request body"));
        transport.send(request).await.unwrap();

        let recorded = transport.last_request().unwrap();
        assert_eq!(recorded.method, "POST");
        assert_eq!(recorded.url, "https://example.com");
        assert_eq!(recorded.body, Some(Bytes::from("request body")));
    }

    #[tokio::test]
    async fn test_mock_response_builder() {
        let transport = MockTransport::builder()
            .respond(MockResponse::ok_with_body("first"))
            .respond(MockResponse::error(404, "Not Found"))
            .build();

        let request1 = HttpRequest::new("GET", "https://example.com");
        let response1 = transport.send(request1).await.unwrap();
        assert_eq!(response1.status, 200);

        let request2 = HttpRequest::new("GET", "https://example.com");
        let response2 = transport.send(request2).await.unwrap();
        assert_eq!(response2.status, 404);
    }
}
