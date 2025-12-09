use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;
use crate::types::{DeletionStatus, ListResponse};
use async_trait::async_trait;
use http::Method;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorStore {
    pub id: String,
    pub object: String,
    pub created_at: i64,
    pub name: String,
    pub usage_bytes: u64,
    pub file_counts: FileCount,
    pub status: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileCount {
    pub in_progress: u32,
    pub completed: u32,
    pub failed: u32,
    pub cancelled: u32,
    pub total: u32,
}

#[async_trait]
pub trait VectorStoreService: Send + Sync {
    async fn create(&self, name: &str) -> OpenAIResult<VectorStore>;
    async fn retrieve(&self, vector_store_id: &str) -> OpenAIResult<VectorStore>;
    async fn delete(&self, vector_store_id: &str) -> OpenAIResult<DeletionStatus>;
    async fn list(&self) -> OpenAIResult<ListResponse<VectorStore>>;
}

pub struct VectorStoreServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl VectorStoreServiceImpl {
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
impl VectorStoreService for VectorStoreServiceImpl {
    async fn create(&self, name: &str) -> OpenAIResult<VectorStore> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let body = serde_json::json!({ "name": name });

        self.resilience
            .execute(async {
                self.transport
                    .request(
                        Method::POST,
                        "/vector_stores",
                        Some(&body),
                        Some(headers.clone()),
                    )
                    .await
            })
            .await
    }

    async fn retrieve(&self, vector_store_id: &str) -> OpenAIResult<VectorStore> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/vector_stores/{}", vector_store_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), VectorStore>(Method::GET, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn delete(&self, vector_store_id: &str) -> OpenAIResult<DeletionStatus> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/vector_stores/{}", vector_store_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), DeletionStatus>(Method::DELETE, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn list(&self) -> OpenAIResult<ListResponse<VectorStore>> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        self.resilience
            .execute(async {
                self.transport
                    .request::<(), ListResponse<VectorStore>>(
                        Method::GET,
                        "/vector_stores",
                        None,
                        Some(headers.clone()),
                    )
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
        assert_send_sync::<VectorStoreServiceImpl>();
    }
}
