//! Mock implementations for testing.
//!
//! Provides mock transports and services for London-School TDD.

use crate::errors::SlackResult;
use crate::transport::{
    FileUpload, FormRequest, HttpTransport, MultipartRequest, RawRequest, TransportRequest,
};
use async_trait::async_trait;
use bytes::Bytes;
use parking_lot::Mutex;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::Arc;

/// Mock response configuration
#[derive(Debug, Clone)]
pub struct MockResponse {
    /// Response body
    pub body: String,
    /// HTTP status code
    pub status: u16,
    /// Delay before response
    pub delay_ms: Option<u64>,
    /// Error to return instead
    pub error: Option<crate::errors::SlackError>,
}

impl MockResponse {
    /// Create a successful JSON response
    pub fn json<T: Serialize>(data: &T) -> Self {
        Self {
            body: serde_json::to_string(data).unwrap(),
            status: 200,
            delay_ms: None,
            error: None,
        }
    }

    /// Create a successful response with raw body
    pub fn ok(body: impl Into<String>) -> Self {
        Self {
            body: body.into(),
            status: 200,
            delay_ms: None,
            error: None,
        }
    }

    /// Create an error response
    pub fn error(error: crate::errors::SlackError) -> Self {
        Self {
            body: String::new(),
            status: 500,
            delay_ms: None,
            error: Some(error),
        }
    }

    /// Create a Slack API error response
    pub fn slack_error(error_code: &str) -> Self {
        Self {
            body: format!(r#"{{"ok":false,"error":"{}"}}"#, error_code),
            status: 200,
            delay_ms: None,
            error: None,
        }
    }

    /// Create a rate limit response
    pub fn rate_limited(retry_after: u64) -> Self {
        Self {
            body: r#"{"ok":false,"error":"rate_limited"}"#.to_string(),
            status: 429,
            delay_ms: None,
            error: Some(crate::errors::SlackError::RateLimit(
                crate::errors::RateLimitError::RateLimited {
                    retry_after: std::time::Duration::from_secs(retry_after),
                    tier: None,
                },
            )),
        }
    }

    /// Add delay to response
    pub fn with_delay(mut self, ms: u64) -> Self {
        self.delay_ms = Some(ms);
        self
    }
}

/// Recorded request for verification
#[derive(Debug, Clone)]
pub struct RecordedRequest {
    /// Request URL
    pub url: String,
    /// Request method
    pub method: String,
    /// Request body (if JSON)
    pub body: Option<String>,
    /// Request headers
    pub headers: Vec<(String, String)>,
}

/// Mock HTTP transport for testing
pub struct MockHttpTransport {
    /// Queue of responses to return
    responses: Arc<Mutex<VecDeque<MockResponse>>>,
    /// Recorded requests
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    /// Default response if queue is empty
    default_response: Option<MockResponse>,
}

impl MockHttpTransport {
    /// Create a new mock transport
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(VecDeque::new())),
            requests: Arc::new(Mutex::new(Vec::new())),
            default_response: None,
        }
    }

    /// Add a response to the queue
    pub fn add_response(self, response: MockResponse) -> Self {
        self.responses.lock().push_back(response);
        self
    }

    /// Add multiple responses
    pub fn add_responses(self, responses: impl IntoIterator<Item = MockResponse>) -> Self {
        let mut queue = self.responses.lock();
        for response in responses {
            queue.push_back(response);
        }
        drop(queue);
        self
    }

    /// Add a JSON response
    pub fn add_json_response<T: Serialize>(self, data: &T) -> Self {
        self.add_response(MockResponse::json(data))
    }

    /// Set default response when queue is empty
    pub fn with_default_response(mut self, response: MockResponse) -> Self {
        self.default_response = Some(response);
        self
    }

    /// Get recorded requests
    pub fn recorded_requests(&self) -> Vec<RecordedRequest> {
        self.requests.lock().clone()
    }

    /// Get the last recorded request
    pub fn last_request(&self) -> Option<RecordedRequest> {
        self.requests.lock().last().cloned()
    }

    /// Clear recorded requests
    pub fn clear_requests(&self) {
        self.requests.lock().clear();
    }

    /// Get remaining response count
    pub fn remaining_responses(&self) -> usize {
        self.responses.lock().len()
    }

    fn record_request(&self, url: &str, method: &str, body: Option<String>, headers: &http::HeaderMap) {
        let header_vec: Vec<(String, String)> = headers
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        self.requests.lock().push(RecordedRequest {
            url: url.to_string(),
            method: method.to_string(),
            body,
            headers: header_vec,
        });
    }

    fn next_response(&self) -> Option<MockResponse> {
        let mut queue = self.responses.lock();
        queue.pop_front().or_else(|| self.default_response.clone())
    }

    async fn handle_response<Res: DeserializeOwned>(&self, response: MockResponse) -> SlackResult<Res> {
        if let Some(delay) = response.delay_ms {
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
        }

        if let Some(error) = response.error {
            return Err(error);
        }

        serde_json::from_str(&response.body).map_err(|e| {
            crate::errors::SlackError::Response(crate::errors::ResponseError::DeserializationError {
                message: e.to_string(),
            })
        })
    }
}

impl Default for MockHttpTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpTransport for MockHttpTransport {
    async fn send_json<Req, Res>(&self, request: TransportRequest<Req>) -> SlackResult<Res>
    where
        Req: Serialize + Send + Sync,
        Res: DeserializeOwned,
    {
        let body = request.body.as_ref().map(|b| serde_json::to_string(b).unwrap());
        self.record_request(&request.url, request.method.as_str(), body, &request.headers);

        let response = self.next_response().ok_or_else(|| {
            crate::errors::SlackError::Response(crate::errors::ResponseError::UnexpectedResponse {
                message: "No mock response configured".to_string(),
            })
        })?;

        self.handle_response(response).await
    }

    async fn send_form<Res>(&self, request: FormRequest) -> SlackResult<Res>
    where
        Res: DeserializeOwned,
    {
        let body = Some(
            request
                .fields
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join("&"),
        );
        self.record_request(&request.url, request.method.as_str(), body, &request.headers);

        let response = self.next_response().ok_or_else(|| {
            crate::errors::SlackError::Response(crate::errors::ResponseError::UnexpectedResponse {
                message: "No mock response configured".to_string(),
            })
        })?;

        self.handle_response(response).await
    }

    async fn send_multipart<Res>(&self, request: MultipartRequest) -> SlackResult<Res>
    where
        Res: DeserializeOwned,
    {
        let body = Some(format!(
            "multipart: fields={:?}, files={}",
            request.fields,
            request.files.len()
        ));
        self.record_request(&request.url, "POST", body, &request.headers);

        let response = self.next_response().ok_or_else(|| {
            crate::errors::SlackError::Response(crate::errors::ResponseError::UnexpectedResponse {
                message: "No mock response configured".to_string(),
            })
        })?;

        self.handle_response(response).await
    }

    async fn send_raw(&self, request: RawRequest) -> SlackResult<Bytes> {
        self.record_request(
            &request.url,
            request.method.as_str(),
            request.body.as_ref().map(|b| format!("{:?}", b)),
            &request.headers,
        );

        let response = self.next_response().ok_or_else(|| {
            crate::errors::SlackError::Response(crate::errors::ResponseError::UnexpectedResponse {
                message: "No mock response configured".to_string(),
            })
        })?;

        if let Some(delay) = response.delay_ms {
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
        }

        if let Some(error) = response.error {
            return Err(error);
        }

        Ok(Bytes::from(response.body))
    }
}

impl std::fmt::Debug for MockHttpTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockHttpTransport")
            .field("pending_responses", &self.responses.lock().len())
            .field("recorded_requests", &self.requests.lock().len())
            .finish()
    }
}

/// Builder for creating mock clients with services
pub struct MockClientBuilder {
    transport: MockHttpTransport,
}

impl MockClientBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self {
            transport: MockHttpTransport::new(),
        }
    }

    /// Add a response
    pub fn with_response(mut self, response: MockResponse) -> Self {
        self.transport = self.transport.add_response(response);
        self
    }

    /// Add a JSON response
    pub fn with_json_response<T: Serialize>(self, data: &T) -> Self {
        self.with_response(MockResponse::json(data))
    }

    /// Build and return the transport
    pub fn build_transport(self) -> Arc<MockHttpTransport> {
        Arc::new(self.transport)
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
    use serde::Deserialize;

    #[derive(Debug, Serialize, Deserialize)]
    struct TestResponse {
        ok: bool,
        value: String,
    }

    #[tokio::test]
    async fn test_mock_transport_json() {
        let transport = MockHttpTransport::new()
            .add_json_response(&TestResponse {
                ok: true,
                value: "test".to_string(),
            });

        let request = TransportRequest::<()>::get(
            "https://slack.com/api/test",
            http::HeaderMap::new(),
        );

        let response: TestResponse = transport.send_json(request).await.unwrap();
        assert!(response.ok);
        assert_eq!(response.value, "test");
    }

    #[tokio::test]
    async fn test_mock_transport_records_requests() {
        let transport = MockHttpTransport::new()
            .with_default_response(MockResponse::ok(r#"{"ok":true}"#));

        let request = TransportRequest::<()>::get(
            "https://slack.com/api/test",
            http::HeaderMap::new(),
        );

        let _: serde_json::Value = transport.send_json(request).await.unwrap();

        let requests = transport.recorded_requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].url, "https://slack.com/api/test");
    }

    #[tokio::test]
    async fn test_mock_transport_error() {
        let transport = MockHttpTransport::new()
            .add_response(MockResponse::slack_error("invalid_auth"));

        let request = TransportRequest::<()>::get(
            "https://slack.com/api/test",
            http::HeaderMap::new(),
        );

        let result: SlackResult<serde_json::Value> = transport.send_json(request).await;
        assert!(result.is_err());
    }
}
