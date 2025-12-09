use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::models::{Model, ModelListResponse, ModelDeleteResponse};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait ModelService: Send + Sync {
    async fn list(&self) -> OpenAIResult<ModelListResponse>;
    async fn retrieve(&self, model_id: &str) -> OpenAIResult<Model>;
    async fn delete(&self, model_id: &str) -> OpenAIResult<ModelDeleteResponse>;
}

pub struct ModelServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl ModelServiceImpl {
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
impl ModelService for ModelServiceImpl {
    async fn list(&self) -> OpenAIResult<ModelListResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        self.resilience
            .execute(async {
                self.transport
                    .request::<(), ModelListResponse>(
                        Method::GET,
                        "/models",
                        None,
                        Some(headers.clone()),
                    )
                    .await
            })
            .await
    }

    async fn retrieve(&self, model_id: &str) -> OpenAIResult<Model> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = format!("/models/{}", model_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), Model>(Method::GET, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn delete(&self, model_id: &str) -> OpenAIResult<ModelDeleteResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = format!("/models/{}", model_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), ModelDeleteResponse>(Method::DELETE, &path, None, Some(headers.clone()))
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
        assert_send_sync::<ModelServiceImpl>();
    }
}
