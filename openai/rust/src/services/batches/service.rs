use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::batches::{BatchRequest, BatchObject, BatchListResponse};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait BatchService: Send + Sync {
    async fn create(&self, request: BatchRequest) -> OpenAIResult<BatchObject>;
    async fn retrieve(&self, batch_id: &str) -> OpenAIResult<BatchObject>;
    async fn cancel(&self, batch_id: &str) -> OpenAIResult<BatchObject>;
    async fn list(&self, limit: Option<u32>, after: Option<&str>) -> OpenAIResult<BatchListResponse>;
}

pub struct BatchServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl BatchServiceImpl {
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
impl BatchService for BatchServiceImpl {
    async fn create(&self, request: BatchRequest) -> OpenAIResult<BatchObject> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        self.resilience.execute(|| async {
            self.transport.request(Method::POST, "/batches", Some(&request), Some(headers.clone())).await
        }).await
    }

    async fn retrieve(&self, batch_id: &str) -> OpenAIResult<BatchObject> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = format!("/batches/{}", batch_id);
        self.resilience.execute(|| async {
            self.transport.request::<(), BatchObject>(Method::GET, &path, None, Some(headers.clone())).await
        }).await
    }

    async fn cancel(&self, batch_id: &str) -> OpenAIResult<BatchObject> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = format!("/batches/{}/cancel", batch_id);
        self.resilience.execute(|| async {
            self.transport.request::<(), BatchObject>(Method::POST, &path, None, Some(headers.clone())).await
        }).await
    }

    async fn list(&self, limit: Option<u32>, after: Option<&str>) -> OpenAIResult<BatchListResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let mut path = "/batches".to_string();
        let mut params = vec![];
        if let Some(l) = limit { params.push(format!("limit={}", l)); }
        if let Some(a) = after { params.push(format!("after={}", a)); }
        if !params.is_empty() { path = format!("{}?{}", path, params.join("&")); }

        self.resilience.execute(|| async {
            self.transport.request::<(), BatchListResponse>(Method::GET, &path, None, Some(headers.clone())).await
        }).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<BatchServiceImpl>();
    }
}
