//! Chat service implementation.

use super::stream::ChatStream;
use super::types::{ChatRequest, ChatResponse};
use super::validation::validate_chat_request;
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Chat service trait for testability
#[async_trait]
pub trait ChatService: Send + Sync {
    /// Send a chat message and get a response
    async fn chat(&self, request: ChatRequest) -> CohereResult<ChatResponse>;

    /// Send a chat message and get a streaming response
    async fn chat_stream(&self, request: ChatRequest) -> CohereResult<ChatStream>;
}

/// Implementation of the Chat service
pub struct ChatServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl ChatServiceImpl {
    /// Create a new Chat service
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

    /// Build the chat endpoint URL
    fn chat_url(&self) -> CohereResult<String> {
        self.base_url
            .join("/v1/chat")
            .map(|u| u.to_string())
            .map_err(|e| CohereError::Configuration {
                message: format!("Invalid URL: {}", e),
            })
    }
}

#[async_trait]
impl ChatService for ChatServiceImpl {
    async fn chat(&self, mut request: ChatRequest) -> CohereResult<ChatResponse> {
        // Validate request
        validate_chat_request(&request)?;

        // Ensure stream is disabled
        request.stream = Some(false);

        // Build URL
        let url = self.chat_url()?;

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
        let chat_response: ChatResponse = serde_json::from_slice(&response.body)?;

        Ok(chat_response)
    }

    async fn chat_stream(&self, mut request: ChatRequest) -> CohereResult<ChatStream> {
        // Validate request
        validate_chat_request(&request)?;

        // Enable streaming
        request.stream = Some(true);

        // Build URL
        let url = self.chat_url()?;

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

        // Wrap in ChatStream
        Ok(ChatStream::new(stream))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_service_creation() {
        // This test just verifies the types compile correctly
        // Full integration tests would use mocks
    }
}
