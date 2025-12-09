use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::moderations::{ModerationRequest, ModerationResponse};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait ModerationService: Send + Sync {
    async fn create(&self, request: ModerationRequest) -> OpenAIResult<ModerationResponse>;
}

pub struct ModerationServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl ModerationServiceImpl {
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
impl ModerationService for ModerationServiceImpl {
    async fn create(&self, request: ModerationRequest) -> OpenAIResult<ModerationResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        self.resilience.execute(|| async {
            self.transport.request(Method::POST, "/moderations", Some(&request), Some(headers.clone())).await
        }).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<ModerationServiceImpl>();
    }
}
