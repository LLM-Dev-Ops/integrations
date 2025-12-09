use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::chat::{ChatCompletionRequest, ChatCompletionResponse, ChatCompletionStream};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait ChatCompletionService: Send + Sync {
    async fn create(&self, request: ChatCompletionRequest) -> OpenAIResult<ChatCompletionResponse>;

    async fn create_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> OpenAIResult<ChatCompletionStream>;
}

pub struct ChatCompletionServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl ChatCompletionServiceImpl {
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        resilience: Arc<dyn ResilienceOrchestrator>,
    ) -> Self {
        Self {
            transport,
            auth_manager,
            resilience,
        }
    }
}

#[async_trait]
impl ChatCompletionService for ChatCompletionServiceImpl {
    async fn create(&self, request: ChatCompletionRequest) -> OpenAIResult<ChatCompletionResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        self.resilience
            .execute(async {
                self.transport
                    .request(Method::POST, "/chat/completions", Some(&request), Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn create_stream(
        &self,
        mut request: ChatCompletionRequest,
    ) -> OpenAIResult<ChatCompletionStream> {
        request.stream = Some(true);

        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let stream = self
            .transport
            .request_stream(Method::POST, "/chat/completions", Some(&request), Some(headers))
            .await?;

        Ok(ChatCompletionStream::new(stream))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<ChatCompletionServiceImpl>();
    }
}
