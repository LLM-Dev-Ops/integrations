use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::assistants::{Assistant, CreateAssistantRequest, AssistantListResponse, AssistantDeleteResponse};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait AssistantService: Send + Sync {
    async fn create(&self, request: CreateAssistantRequest) -> OpenAIResult<Assistant>;
    async fn retrieve(&self, assistant_id: &str) -> OpenAIResult<Assistant>;
    async fn modify(&self, assistant_id: &str, request: CreateAssistantRequest) -> OpenAIResult<Assistant>;
    async fn delete(&self, assistant_id: &str) -> OpenAIResult<AssistantDeleteResponse>;
    async fn list(&self) -> OpenAIResult<AssistantListResponse>;
}

pub struct AssistantServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl AssistantServiceImpl {
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
impl AssistantService for AssistantServiceImpl {
    async fn create(&self, request: CreateAssistantRequest) -> OpenAIResult<Assistant> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        self.resilience.execute(|| async {
            self.transport.request(Method::POST, "/assistants", Some(&request), Some(headers.clone())).await
        }).await
    }

    async fn retrieve(&self, assistant_id: &str) -> OpenAIResult<Assistant> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/assistants/{}", assistant_id);
        self.resilience.execute(|| async {
            self.transport.request::<(), Assistant>(Method::GET, &path, None, Some(headers.clone())).await
        }).await
    }

    async fn modify(&self, assistant_id: &str, request: CreateAssistantRequest) -> OpenAIResult<Assistant> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/assistants/{}", assistant_id);
        self.resilience.execute(|| async {
            self.transport.request(Method::POST, &path, Some(&request), Some(headers.clone())).await
        }).await
    }

    async fn delete(&self, assistant_id: &str) -> OpenAIResult<AssistantDeleteResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/assistants/{}", assistant_id);
        self.resilience.execute(|| async {
            self.transport.request::<(), AssistantDeleteResponse>(Method::DELETE, &path, None, Some(headers.clone())).await
        }).await
    }

    async fn list(&self) -> OpenAIResult<AssistantListResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        self.resilience.execute(|| async {
            self.transport.request::<(), AssistantListResponse>(Method::GET, "/assistants", None, Some(headers.clone())).await
        }).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<AssistantServiceImpl>();
    }
}
