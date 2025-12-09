use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;
use crate::types::DeletionStatus;
use async_trait::async_trait;
use http::Method;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thread {
    pub id: String,
    pub object: String,
    pub created_at: i64,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

#[async_trait]
pub trait ThreadService: Send + Sync {
    async fn create(&self) -> OpenAIResult<Thread>;
    async fn retrieve(&self, thread_id: &str) -> OpenAIResult<Thread>;
    async fn delete(&self, thread_id: &str) -> OpenAIResult<DeletionStatus>;
}

pub struct ThreadServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl ThreadServiceImpl {
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
impl ThreadService for ThreadServiceImpl {
    async fn create(&self) -> OpenAIResult<Thread> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        self.resilience
            .execute(async {
                self.transport
                    .request::<(), Thread>(Method::POST, "/threads", None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn retrieve(&self, thread_id: &str) -> OpenAIResult<Thread> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/threads/{}", thread_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), Thread>(Method::GET, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn delete(&self, thread_id: &str) -> OpenAIResult<DeletionStatus> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/threads/{}", thread_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), DeletionStatus>(Method::DELETE, &path, None, Some(headers.clone()))
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
        assert_send_sync::<ThreadServiceImpl>();
    }
}
