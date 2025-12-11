//! Mock transport for testing.

use async_trait::async_trait;
use bytes::Bytes;
use std::collections::{HashMap, VecDeque};
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use crate::errors::{MistralError, MistralResult};
use crate::transport::{ByteStream, HttpResponse, HttpTransport, Method};

/// A recorded request for verification.
#[derive(Debug, Clone)]
pub struct RecordedRequest {
    /// HTTP method.
    pub method: Method,
    /// Request URL.
    pub url: String,
    /// Request headers.
    pub headers: HashMap<String, String>,
    /// Request body.
    pub body: Option<Bytes>,
}

/// A mock response to return.
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
    /// Creates a successful JSON response.
    pub fn json(body: impl serde::Serialize) -> Self {
        Self {
            status: 200,
            headers: {
                let mut h = HashMap::new();
                h.insert("content-type".to_string(), "application/json".to_string());
                h
            },
            body: Bytes::from(serde_json::to_vec(&body).unwrap()),
        }
    }

    /// Creates an error response.
    pub fn error(status: u16, message: &str) -> Self {
        Self {
            status,
            headers: HashMap::new(),
            body: Bytes::from(format!(
                r#"{{"error":{{"message":"{}","type":"error"}}}}"#,
                message
            )),
        }
    }

    /// Creates a rate limit error response.
    pub fn rate_limited(retry_after: u64) -> Self {
        Self {
            status: 429,
            headers: {
                let mut h = HashMap::new();
                h.insert("retry-after".to_string(), retry_after.to_string());
                h
            },
            body: Bytes::from(
                r#"{"error":{"message":"Rate limit exceeded","type":"rate_limit_error"}}"#,
            ),
        }
    }
}

/// Mock transport for testing.
pub struct MockTransport {
    responses: Arc<Mutex<VecDeque<MockResponse>>>,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    default_response: Option<MockResponse>,
}

impl Default for MockTransport {
    fn default() -> Self {
        Self::new()
    }
}

impl MockTransport {
    /// Creates a new mock transport.
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(VecDeque::new())),
            requests: Arc::new(Mutex::new(Vec::new())),
            default_response: None,
        }
    }

    /// Adds a response to the queue.
    pub fn enqueue_response(&self, response: MockResponse) {
        self.responses.lock().unwrap().push_back(response);
    }

    /// Sets a default response for when the queue is empty.
    pub fn set_default_response(mut self, response: MockResponse) -> Self {
        self.default_response = Some(response);
        self
    }

    /// Gets all recorded requests.
    pub fn get_requests(&self) -> Vec<RecordedRequest> {
        self.requests.lock().unwrap().clone()
    }

    /// Gets the last recorded request.
    pub fn last_request(&self) -> Option<RecordedRequest> {
        self.requests.lock().unwrap().last().cloned()
    }

    /// Clears all recorded requests.
    pub fn clear_requests(&self) {
        self.requests.lock().unwrap().clear();
    }

    /// Returns the number of requests made.
    pub fn request_count(&self) -> usize {
        self.requests.lock().unwrap().len()
    }

    fn record_request(
        &self,
        method: Method,
        url: String,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) {
        self.requests.lock().unwrap().push(RecordedRequest {
            method,
            url,
            headers,
            body,
        });
    }

    fn get_response(&self) -> MockResponse {
        self.responses
            .lock()
            .unwrap()
            .pop_front()
            .or_else(|| self.default_response.clone())
            .unwrap_or_else(|| MockResponse::error(500, "No mock response configured"))
    }
}

#[async_trait]
impl HttpTransport for MockTransport {
    async fn execute(
        &self,
        method: Method,
        url: String,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<HttpResponse> {
        self.record_request(method, url, headers, body);

        let response = self.get_response();

        if response.status >= 400 {
            return Err(MistralError::Unknown {
                status: response.status,
                message: String::from_utf8_lossy(&response.body).to_string(),
                body: Some(String::from_utf8_lossy(&response.body).to_string()),
            });
        }

        Ok(HttpResponse {
            status: response.status,
            headers: response.headers,
            body: response.body,
        })
    }

    async fn execute_stream(
        &self,
        method: Method,
        url: String,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<ByteStream> {
        self.record_request(method, url, headers, body);

        let response = self.get_response();

        if response.status >= 400 {
            return Err(MistralError::Unknown {
                status: response.status,
                message: String::from_utf8_lossy(&response.body).to_string(),
                body: Some(String::from_utf8_lossy(&response.body).to_string()),
            });
        }

        // Return a simple stream with the response body
        let stream = futures::stream::once(async move { Ok(response.body) });

        Ok(Box::pin(stream))
    }

    async fn execute_multipart(
        &self,
        url: String,
        headers: HashMap<String, String>,
        _form: reqwest::multipart::Form,
    ) -> MistralResult<HttpResponse> {
        self.record_request(Method::Post, url, headers, None);

        let response = self.get_response();

        if response.status >= 400 {
            return Err(MistralError::Unknown {
                status: response.status,
                message: String::from_utf8_lossy(&response.body).to_string(),
                body: Some(String::from_utf8_lossy(&response.body).to_string()),
            });
        }

        Ok(HttpResponse {
            status: response.status,
            headers: response.headers,
            body: response.body,
        })
    }

    async fn get(&self, path: &str) -> MistralResult<Vec<u8>> {
        let response = self
            .execute(Method::Get, path.to_string(), HashMap::new(), None)
            .await?;
        Ok(response.body.to_vec())
    }

    async fn post(&self, path: &str, body: Vec<u8>) -> MistralResult<Vec<u8>> {
        let response = self
            .execute(
                Method::Post,
                path.to_string(),
                HashMap::new(),
                Some(Bytes::from(body)),
            )
            .await?;
        Ok(response.body.to_vec())
    }

    async fn post_stream<T: serde::de::DeserializeOwned + Send + 'static>(
        &self,
        path: &str,
        body: Vec<u8>,
    ) -> MistralResult<Pin<Box<dyn futures::Stream<Item = MistralResult<T>> + Send>>> {
        let response = self.get_response();
        self.record_request(
            Method::Post,
            path.to_string(),
            HashMap::new(),
            Some(Bytes::from(body)),
        );

        // Parse the response body as a single item
        let parsed: T = serde_json::from_slice(&response.body).map_err(|e| {
            MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response.body).to_string(),
            }
        })?;

        let stream = futures::stream::once(async move { Ok(parsed) });
        Ok(Box::pin(stream))
    }

    async fn patch(&self, path: &str, body: Vec<u8>) -> MistralResult<Vec<u8>> {
        let response = self
            .execute(
                Method::Patch,
                path.to_string(),
                HashMap::new(),
                Some(Bytes::from(body)),
            )
            .await?;
        Ok(response.body.to_vec())
    }

    async fn delete(&self, path: &str) -> MistralResult<Vec<u8>> {
        let response = self
            .execute(Method::Delete, path.to_string(), HashMap::new(), None)
            .await?;
        Ok(response.body.to_vec())
    }

    async fn post_multipart(
        &self,
        path: &str,
        _file: Vec<u8>,
        _filename: &str,
        _purpose: &str,
    ) -> MistralResult<Vec<u8>> {
        let response = self
            .execute(Method::Post, path.to_string(), HashMap::new(), None)
            .await?;
        Ok(response.body.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_transport_basic() {
        let transport = MockTransport::new();
        transport.enqueue_response(MockResponse::json(serde_json::json!({"status": "ok"})));

        let response = transport.get("/test").await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&response).unwrap();

        assert_eq!(json["status"], "ok");
    }

    #[tokio::test]
    async fn test_mock_transport_records_requests() {
        let transport = MockTransport::new();
        transport.enqueue_response(MockResponse::json(serde_json::json!({})));

        let _ = transport.post("/test", b"body".to_vec()).await;

        assert_eq!(transport.request_count(), 1);

        let request = transport.last_request().unwrap();
        assert_eq!(request.url, "/test");
        assert!(matches!(request.method, Method::Post));
    }

    #[tokio::test]
    async fn test_mock_transport_error_response() {
        let transport = MockTransport::new();
        transport.enqueue_response(MockResponse::error(500, "Server error"));

        let result = transport.get("/test").await;
        assert!(result.is_err());
    }

    #[test]
    fn test_mock_response_helpers() {
        let json_response = MockResponse::json(serde_json::json!({"key": "value"}));
        assert_eq!(json_response.status, 200);

        let error_response = MockResponse::error(404, "Not found");
        assert_eq!(error_response.status, 404);

        let rate_limited = MockResponse::rate_limited(60);
        assert_eq!(rate_limited.status, 429);
        assert_eq!(rate_limited.headers.get("retry-after"), Some(&"60".to_string()));
    }
}
