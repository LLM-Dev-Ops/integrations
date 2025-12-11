//! Chat completion service.

use async_trait::async_trait;
use futures::Stream;
use std::pin::Pin;

use crate::errors::MistralError;
use crate::types::chat::{ChatCompletionChunk, ChatCompletionRequest, ChatCompletionResponse};

/// Chat service trait for chat completions.
#[async_trait]
pub trait ChatService: Send + Sync {
    /// Creates a chat completion.
    async fn create(&self, request: ChatCompletionRequest) -> Result<ChatCompletionResponse, MistralError>;

    /// Creates a streaming chat completion.
    async fn create_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<ChatCompletionChunk, MistralError>> + Send>>, MistralError>;
}

/// Default implementation of the chat service.
pub struct DefaultChatService<T> {
    transport: T,
}

impl<T> DefaultChatService<T> {
    /// Creates a new chat service.
    pub fn new(transport: T) -> Self {
        Self { transport }
    }
}

#[async_trait]
impl<T> ChatService for DefaultChatService<T>
where
    T: crate::transport::HttpTransport + Send + Sync,
{
    async fn create(&self, request: ChatCompletionRequest) -> Result<ChatCompletionResponse, MistralError> {
        let body = serde_json::to_vec(&request)
            .map_err(|e| MistralError::Serialization { message: e.to_string() })?;

        let response = self.transport
            .post("/v1/chat/completions", body)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn create_stream(
        &self,
        mut request: ChatCompletionRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<ChatCompletionChunk, MistralError>> + Send>>, MistralError> {
        request.stream = Some(true);

        let body = serde_json::to_vec(&request)
            .map_err(|e| MistralError::Serialization { message: e.to_string() })?;

        let stream = self.transport
            .post_stream("/v1/chat/completions", body)
            .await?;

        Ok(stream)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::chat::Message;

    #[test]
    fn test_chat_service_creation() {
        struct MockTransport;
        let _service = DefaultChatService::new(MockTransport);
    }

    #[tokio::test]
    async fn test_chat_request_serialization() {
        let request = ChatCompletionRequest::new(
            "mistral-large-latest",
            vec![Message::user("Hello!")],
        );

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("mistral-large-latest"));
        assert!(json.contains("Hello!"));
    }
}
