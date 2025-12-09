use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::fine_tuning::*;
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait FineTuningService: Send + Sync {
    async fn create(&self, request: FineTuningJobRequest) -> OpenAIResult<FineTuningJob>;
    async fn list(&self, limit: Option<u32>, after: Option<&str>) -> OpenAIResult<FineTuningJobListResponse>;
    async fn retrieve(&self, job_id: &str) -> OpenAIResult<FineTuningJob>;
    async fn cancel(&self, job_id: &str) -> OpenAIResult<FineTuningJob>;
    async fn events(&self, job_id: &str, limit: Option<u32>, after: Option<&str>) -> OpenAIResult<FineTuningEventListResponse>;
}

pub struct FineTuningServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl FineTuningServiceImpl {
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
impl FineTuningService for FineTuningServiceImpl {
    async fn create(&self, request: FineTuningJobRequest) -> OpenAIResult<FineTuningJob> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        self.resilience.execute(|| async {
            self.transport.request(Method::POST, "/fine_tuning/jobs", Some(&request), Some(headers.clone())).await
        }).await
    }

    async fn list(&self, limit: Option<u32>, after: Option<&str>) -> OpenAIResult<FineTuningJobListResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let mut path = "/fine_tuning/jobs".to_string();
        let mut params = vec![];
        if let Some(l) = limit { params.push(format!("limit={}", l)); }
        if let Some(a) = after { params.push(format!("after={}", a)); }
        if !params.is_empty() { path = format!("{}?{}", path, params.join("&")); }

        self.resilience.execute(|| async {
            self.transport.request::<(), FineTuningJobListResponse>(Method::GET, &path, None, Some(headers.clone())).await
        }).await
    }

    async fn retrieve(&self, job_id: &str) -> OpenAIResult<FineTuningJob> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = format!("/fine_tuning/jobs/{}", job_id);
        self.resilience.execute(|| async {
            self.transport.request::<(), FineTuningJob>(Method::GET, &path, None, Some(headers.clone())).await
        }).await
    }

    async fn cancel(&self, job_id: &str) -> OpenAIResult<FineTuningJob> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = format!("/fine_tuning/jobs/{}/cancel", job_id);
        self.resilience.execute(|| async {
            self.transport.request::<(), FineTuningJob>(Method::POST, &path, None, Some(headers.clone())).await
        }).await
    }

    async fn events(&self, job_id: &str, limit: Option<u32>, after: Option<&str>) -> OpenAIResult<FineTuningEventListResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let mut path = format!("/fine_tuning/jobs/{}/events", job_id);
        let mut params = vec![];
        if let Some(l) = limit { params.push(format!("limit={}", l)); }
        if let Some(a) = after { params.push(format!("after={}", a)); }
        if !params.is_empty() { path = format!("{}?{}", path, params.join("&")); }

        self.resilience.execute(|| async {
            self.transport.request::<(), FineTuningEventListResponse>(Method::GET, &path, None, Some(headers.clone())).await
        }).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<FineTuningServiceImpl>();
    }
}
