//! Mock HTTP transport for testing

use crate::errors::{OpenAIError, OpenAIResult};
use crate::transport::{BoxStream, HttpTransport};
use async_trait::async_trait;
use bytes::Bytes;
use futures::stream;
use http::{HeaderMap, Method};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

/// Mock HTTP transport that allows configuring expected requests and responses
#[derive(Clone)]
pub struct MockHttpTransport {
    inner: Arc<Mutex<MockHttpTransportInner>>,
}

struct MockHttpTransportInner {
    responses: VecDeque<MockResponse>,
    stream_responses: VecDeque<MockStreamResponse>,
    file_upload_responses: VecDeque<OpenAIResult<serde_json::Value>>,
    file_download_responses: VecDeque<OpenAIResult<Bytes>>,
    requests: Vec<MockRequest>,
}

#[derive(Debug, Clone)]
struct MockRequest {
    method: Method,
    path: String,
    body: Option<String>,
}

enum MockResponse {
    Json(serde_json::Value),
    Error(OpenAIError),
}

enum MockStreamResponse {
    Items(Vec<serde_json::Value>),
    Error(OpenAIError),
}

impl MockHttpTransport {
    /// Create a new mock transport
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(MockHttpTransportInner {
                responses: VecDeque::new(),
                stream_responses: VecDeque::new(),
                file_upload_responses: VecDeque::new(),
                file_download_responses: VecDeque::new(),
                requests: Vec::new(),
            })),
        }
    }

    /// Add a successful JSON response
    pub fn with_json_response(self, response: serde_json::Value) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner.responses.push_back(MockResponse::Json(response));
        self
    }

    /// Add an error response
    pub fn with_error_response(self, error: OpenAIError) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner.responses.push_back(MockResponse::Error(error));
        self
    }

    /// Add a successful stream response with multiple items
    pub fn with_stream_response(self, items: Vec<serde_json::Value>) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner
            .stream_responses
            .push_back(MockStreamResponse::Items(items));
        self
    }

    /// Add a stream error response
    pub fn with_stream_error(self, error: OpenAIError) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner
            .stream_responses
            .push_back(MockStreamResponse::Error(error));
        self
    }

    /// Add a file upload response
    pub fn with_file_upload_response(self, response: OpenAIResult<serde_json::Value>) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner.file_upload_responses.push_back(response);
        self
    }

    /// Add a file download response
    pub fn with_file_download_response(self, response: OpenAIResult<Bytes>) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner.file_download_responses.push_back(response);
        self
    }

    /// Get the list of requests made
    pub fn requests(&self) -> Vec<MockRequest> {
        let inner = self.inner.lock().unwrap();
        inner.requests.clone()
    }

    /// Verify that a request was made with the given method and path
    pub fn verify_request(&self, method: Method, path: &str) -> bool {
        let inner = self.inner.lock().unwrap();
        inner
            .requests
            .iter()
            .any(|r| r.method == method && r.path == path)
    }

    /// Verify that a request was made with the given method, path, and body content
    pub fn verify_request_with_body(&self, method: Method, path: &str, body_contains: &str) -> bool {
        let inner = self.inner.lock().unwrap();
        inner.requests.iter().any(|r| {
            r.method == method
                && r.path == path
                && r.body
                    .as_ref()
                    .map(|b| b.contains(body_contains))
                    .unwrap_or(false)
        })
    }

    /// Get the number of requests made
    pub fn request_count(&self) -> usize {
        let inner = self.inner.lock().unwrap();
        inner.requests.len()
    }

    /// Reset the mock, clearing all requests and responses
    pub fn reset(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.responses.clear();
        inner.stream_responses.clear();
        inner.file_upload_responses.clear();
        inner.file_download_responses.clear();
        inner.requests.clear();
    }
}

impl Default for MockHttpTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpTransport for MockHttpTransport {
    async fn request<T, R>(
        &self,
        method: Method,
        path: &str,
        body: Option<&T>,
        _headers: Option<HeaderMap>,
    ) -> OpenAIResult<R>
    where
        T: Serialize + Send + Sync,
        R: DeserializeOwned,
    {
        // Record the request
        let body_str = body.and_then(|b| serde_json::to_string(b).ok());
        {
            let mut inner = self.inner.lock().unwrap();
            inner.requests.push(MockRequest {
                method: method.clone(),
                path: path.to_string(),
                body: body_str,
            });
        }

        // Get the next response
        let mut inner = self.inner.lock().unwrap();
        let response = inner
            .responses
            .pop_front()
            .ok_or_else(|| OpenAIError::internal("No mock response configured"))?;

        match response {
            MockResponse::Json(json) => {
                serde_json::from_value(json).map_err(|e| OpenAIError::internal(e.to_string()))
            }
            MockResponse::Error(err) => Err(err),
        }
    }

    async fn request_stream<T, R>(
        &self,
        method: Method,
        path: &str,
        body: Option<&T>,
        _headers: Option<HeaderMap>,
    ) -> OpenAIResult<BoxStream<R>>
    where
        T: Serialize + Send + Sync,
        R: DeserializeOwned + Send + 'static,
    {
        // Record the request
        let body_str = body.and_then(|b| serde_json::to_string(b).ok());
        {
            let mut inner = self.inner.lock().unwrap();
            inner.requests.push(MockRequest {
                method: method.clone(),
                path: path.to_string(),
                body: body_str,
            });
        }

        // Get the next stream response
        let mut inner = self.inner.lock().unwrap();
        let response = inner
            .stream_responses
            .pop_front()
            .ok_or_else(|| OpenAIError::internal("No mock stream response configured"))?;

        match response {
            MockStreamResponse::Items(items) => {
                let results: Vec<OpenAIResult<R>> = items
                    .into_iter()
                    .map(|json| {
                        serde_json::from_value(json)
                            .map_err(|e| OpenAIError::internal(e.to_string()))
                    })
                    .collect();
                Ok(Box::pin(stream::iter(results)))
            }
            MockStreamResponse::Error(err) => {
                Ok(Box::pin(stream::iter(vec![Err(err)])))
            }
        }
    }

    async fn upload_file(
        &self,
        path: &str,
        _file_data: Bytes,
        _file_name: &str,
        _purpose: &str,
        _headers: Option<HeaderMap>,
    ) -> OpenAIResult<serde_json::Value> {
        // Record the request
        {
            let mut inner = self.inner.lock().unwrap();
            inner.requests.push(MockRequest {
                method: Method::POST,
                path: path.to_string(),
                body: Some("file upload".to_string()),
            });
        }

        let mut inner = self.inner.lock().unwrap();
        inner
            .file_upload_responses
            .pop_front()
            .ok_or_else(|| OpenAIError::internal("No mock file upload response configured"))?
    }

    async fn download_file(
        &self,
        path: &str,
        _headers: Option<HeaderMap>,
    ) -> OpenAIResult<Bytes> {
        // Record the request
        {
            let mut inner = self.inner.lock().unwrap();
            inner.requests.push(MockRequest {
                method: Method::GET,
                path: path.to_string(),
                body: None,
            });
        }

        let mut inner = self.inner.lock().unwrap();
        inner
            .file_download_responses
            .pop_front()
            .ok_or_else(|| OpenAIError::internal("No mock file download response configured"))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_transport_json_response() {
        let mock = MockHttpTransport::new()
            .with_json_response(serde_json::json!({"id": "test-123", "object": "test"}));

        let result: OpenAIResult<serde_json::Value> = mock
            .request(
                Method::POST,
                "/test",
                Some(&serde_json::json!({"input": "test"})),
                None,
            )
            .await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response["id"], "test-123");
        assert!(mock.verify_request(Method::POST, "/test"));
    }

    #[tokio::test]
    async fn test_mock_transport_error_response() {
        let mock = MockHttpTransport::new()
            .with_error_response(OpenAIError::authentication("Invalid API key"));

        let result: OpenAIResult<serde_json::Value> = mock
            .request(Method::POST, "/test", None::<&()>, None)
            .await;

        assert!(result.is_err());
        assert_eq!(mock.request_count(), 1);
    }
}
