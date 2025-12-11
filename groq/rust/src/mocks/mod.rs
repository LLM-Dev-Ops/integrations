//! Mock implementations for testing.
//!
//! Provides mock transport, auth, and service implementations for
//! unit testing without making real API calls.

use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::auth::AuthProvider;
use crate::errors::GroqError;
use crate::transport::{
    HttpMethod, HttpRequest, HttpResponse, HttpTransport, MultipartRequest, StreamingResponse,
    TransportError,
};

/// Mock HTTP transport for testing.
pub struct MockTransport {
    responses: Mutex<Vec<MockResponse>>,
    requests: Mutex<Vec<RecordedRequest>>,
    default_response: Mutex<Option<MockResponse>>,
}

/// A recorded request.
#[derive(Debug, Clone)]
pub struct RecordedRequest {
    /// HTTP method.
    pub method: HttpMethod,
    /// Request path.
    pub path: String,
    /// Request body.
    pub body: Option<Vec<u8>>,
    /// Request headers.
    pub headers: HashMap<String, String>,
}

/// A mock response.
#[derive(Debug, Clone)]
pub struct MockResponse {
    /// HTTP status code.
    pub status: u16,
    /// Response headers.
    pub headers: HashMap<String, String>,
    /// Response body.
    pub body: Vec<u8>,
}

impl MockResponse {
    /// Creates a successful JSON response.
    pub fn json<T: serde::Serialize>(value: &T) -> Self {
        let body = serde_json::to_vec(value).unwrap_or_default();
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/json".to_string());

        Self {
            status: 200,
            headers,
            body,
        }
    }

    /// Creates an error response.
    pub fn error(status: u16, message: &str) -> Self {
        let error = serde_json::json!({
            "error": {
                "message": message,
                "type": "error"
            }
        });

        let body = serde_json::to_vec(&error).unwrap_or_default();
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/json".to_string());

        Self {
            status,
            headers,
            body,
        }
    }

    /// Creates a response with custom status.
    pub fn with_status(mut self, status: u16) -> Self {
        self.status = status;
        self
    }

    /// Adds a header.
    pub fn with_header(mut self, name: &str, value: &str) -> Self {
        self.headers.insert(name.to_string(), value.to_string());
        self
    }
}

impl MockTransport {
    /// Creates a new mock transport.
    pub fn new() -> Self {
        Self {
            responses: Mutex::new(Vec::new()),
            requests: Mutex::new(Vec::new()),
            default_response: Mutex::new(None),
        }
    }

    /// Queues a response.
    pub fn queue(&self, response: MockResponse) {
        self.responses.lock().unwrap().push(response);
    }

    /// Queues a JSON response.
    pub fn queue_json<T: serde::Serialize>(&self, value: &T) {
        self.queue(MockResponse::json(value));
    }

    /// Queues an error response.
    pub fn queue_error(&self, status: u16, message: &str) {
        self.queue(MockResponse::error(status, message));
    }

    /// Sets the default response.
    pub fn set_default(&self, response: MockResponse) {
        *self.default_response.lock().unwrap() = Some(response);
    }

    /// Gets all recorded requests.
    pub fn requests(&self) -> Vec<RecordedRequest> {
        self.requests.lock().unwrap().clone()
    }

    /// Gets the last recorded request.
    pub fn last_request(&self) -> Option<RecordedRequest> {
        self.requests.lock().unwrap().last().cloned()
    }

    /// Clears recorded requests.
    pub fn clear_requests(&self) {
        self.requests.lock().unwrap().clear();
    }

    /// Returns the number of requests made.
    pub fn request_count(&self) -> usize {
        self.requests.lock().unwrap().len()
    }

    fn get_response(&self) -> MockResponse {
        let mut responses = self.responses.lock().unwrap();
        if !responses.is_empty() {
            responses.remove(0)
        } else {
            self.default_response
                .lock()
                .unwrap()
                .clone()
                .unwrap_or_else(|| MockResponse::error(500, "No mock response configured"))
        }
    }

    fn record_request(&self, method: HttpMethod, path: &str, body: Option<Vec<u8>>, headers: HashMap<String, String>) {
        self.requests.lock().unwrap().push(RecordedRequest {
            method,
            path: path.to_string(),
            body,
            headers,
        });
    }
}

impl Default for MockTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpTransport for MockTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        self.record_request(
            request.method,
            &request.path,
            request.body.clone(),
            request.headers.clone(),
        );

        let response = self.get_response();
        Ok(HttpResponse {
            status: response.status,
            headers: response.headers,
            body: response.body,
        })
    }

    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<StreamingResponse, TransportError> {
        self.record_request(
            request.method,
            &request.path,
            request.body.clone(),
            request.headers.clone(),
        );

        let response = self.get_response();

        // Create a simple stream from the response body
        let body = response.body.clone();
        let stream = futures::stream::once(async move { Ok(bytes::Bytes::from(body)) });

        Ok(StreamingResponse {
            status: response.status,
            headers: response.headers,
            stream: Box::pin(stream),
        })
    }

    async fn send_multipart(
        &self,
        request: MultipartRequest,
    ) -> Result<HttpResponse, TransportError> {
        self.record_request(
            HttpMethod::Post,
            &request.path,
            None,
            request.headers.clone(),
        );

        let response = self.get_response();
        Ok(HttpResponse {
            status: response.status,
            headers: response.headers,
            body: response.body,
        })
    }
}

impl std::fmt::Debug for MockTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockTransport")
            .field("request_count", &self.request_count())
            .finish()
    }
}

/// Mock auth provider for testing.
pub struct MockAuth {
    api_key: String,
}

impl MockAuth {
    /// Creates a new mock auth provider.
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
        }
    }
}

impl Default for MockAuth {
    fn default() -> Self {
        Self::new("gsk_mock_test_key")
    }
}

#[async_trait]
impl AuthProvider for MockAuth {
    fn apply_auth(&self, headers: &mut HashMap<String, String>) {
        headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", self.api_key),
        );
    }

    fn scheme(&self) -> &str {
        "Bearer"
    }

    fn validate(&self) -> Result<(), GroqError> {
        Ok(())
    }
}

impl std::fmt::Debug for MockAuth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockAuth").finish()
    }
}

/// Test fixtures for common response types.
pub mod fixtures {
    use crate::types::chat::{AssistantMessage, ChatResponse, Choice, FinishReason, Role, Usage};

    /// Creates a mock chat response.
    pub fn chat_response(content: &str) -> ChatResponse {
        ChatResponse {
            id: "chatcmpl-mock".to_string(),
            object: "chat.completion".to_string(),
            created: 1699999999,
            model: "llama-3.3-70b-versatile".to_string(),
            choices: vec![Choice {
                index: 0,
                message: AssistantMessage {
                    role: Role::Assistant,
                    content: Some(content.to_string()),
                    tool_calls: None,
                },
                finish_reason: FinishReason::Stop,
                logprobs: None,
            }],
            usage: Usage {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
                prompt_time: Some(0.001),
                completion_time: Some(0.002),
                total_time: Some(0.003),
            },
            system_fingerprint: None,
            x_groq: None,
        }
    }

    /// Creates a mock model list response.
    pub fn model_list() -> crate::types::models::ModelList {
        crate::types::models::ModelList {
            object: "list".to_string(),
            data: vec![
                crate::types::models::Model {
                    id: "llama-3.3-70b-versatile".to_string(),
                    object: "model".to_string(),
                    created: 1699999999,
                    owned_by: "groq".to_string(),
                    active: true,
                    context_window: Some(128000),
                    public_apps: Some(true),
                },
                crate::types::models::Model {
                    id: "whisper-large-v3".to_string(),
                    object: "model".to_string(),
                    created: 1699999999,
                    owned_by: "groq".to_string(),
                    active: true,
                    context_window: None,
                    public_apps: Some(true),
                },
            ],
        }
    }

    /// Creates a mock transcription response.
    pub fn transcription_response(text: &str) -> crate::types::audio::TranscriptionResponse {
        crate::types::audio::TranscriptionResponse {
            text: text.to_string(),
            task: Some("transcribe".to_string()),
            language: Some("en".to_string()),
            duration: Some(5.0),
            segments: None,
            words: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_transport_queue() {
        let transport = MockTransport::new();
        transport.queue_json(&serde_json::json!({"test": "value"}));

        let request = HttpRequest::get("test");
        let response = transport.send(request).await.unwrap();

        assert_eq!(response.status, 200);
        assert!(String::from_utf8_lossy(&response.body).contains("value"));
    }

    #[tokio::test]
    async fn test_mock_transport_records_requests() {
        let transport = MockTransport::new();
        transport.set_default(MockResponse::json(&serde_json::json!({})));

        transport.send(HttpRequest::get("path1")).await.unwrap();
        transport.send(HttpRequest::post("path2")).await.unwrap();

        let requests = transport.requests();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].path, "path1");
        assert_eq!(requests[1].path, "path2");
    }

    #[tokio::test]
    async fn test_mock_transport_error_response() {
        let transport = MockTransport::new();
        transport.queue_error(429, "Rate limit exceeded");

        let request = HttpRequest::get("test");
        let response = transport.send(request).await.unwrap();

        assert_eq!(response.status, 429);
    }
}
