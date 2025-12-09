use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::embeddings::{EmbeddingsRequest, EmbeddingsResponse};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait EmbeddingsService: Send + Sync {
    async fn create(&self, request: EmbeddingsRequest) -> OpenAIResult<EmbeddingsResponse>;
}

pub struct EmbeddingsServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl EmbeddingsServiceImpl {
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
impl EmbeddingsService for EmbeddingsServiceImpl {
    async fn create(&self, request: EmbeddingsRequest) -> OpenAIResult<EmbeddingsResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        self.resilience
            .execute(async {
                self.transport
                    .request(Method::POST, "/embeddings", Some(&request), Some(headers.clone()))
                    .await
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<EmbeddingsServiceImpl>();
    }
}
