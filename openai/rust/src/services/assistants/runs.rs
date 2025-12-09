use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;
use crate::types::ListResponse;
use async_trait::async_trait;
use http::Method;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub id: String,
    pub object: String,
    pub created_at: i64,
    pub thread_id: String,
    pub assistant_id: String,
    pub status: RunStatus,
    pub required_action: Option<serde_json::Value>,
    pub last_error: Option<RunError>,
    pub expires_at: Option<i64>,
    pub started_at: Option<i64>,
    pub cancelled_at: Option<i64>,
    pub failed_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub model: String,
    pub instructions: Option<String>,
    pub tools: Vec<serde_json::Value>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Queued,
    InProgress,
    RequiresAction,
    Cancelling,
    Cancelled,
    Failed,
    Completed,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunStep {
    pub id: String,
    pub object: String,
    pub created_at: i64,
    pub assistant_id: String,
    pub thread_id: String,
    pub run_id: String,
    pub r#type: String,
    pub status: RunStatus,
    pub step_details: serde_json::Value,
}

#[async_trait]
pub trait RunService: Send + Sync {
    async fn create(&self, thread_id: &str, assistant_id: &str) -> OpenAIResult<Run>;
    async fn retrieve(&self, thread_id: &str, run_id: &str) -> OpenAIResult<Run>;
    async fn cancel(&self, thread_id: &str, run_id: &str) -> OpenAIResult<Run>;
    async fn list(&self, thread_id: &str) -> OpenAIResult<ListResponse<Run>>;
}

pub struct RunServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl RunServiceImpl {
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
impl RunService for RunServiceImpl {
    async fn create(&self, thread_id: &str, assistant_id: &str) -> OpenAIResult<Run> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/threads/{}/runs", thread_id);
        let body = serde_json::json!({
            "assistant_id": assistant_id,
        });

        self.resilience
            .execute(async {
                self.transport
                    .request(Method::POST, &path, Some(&body), Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn retrieve(&self, thread_id: &str, run_id: &str) -> OpenAIResult<Run> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/threads/{}/runs/{}", thread_id, run_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), Run>(Method::GET, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn cancel(&self, thread_id: &str, run_id: &str) -> OpenAIResult<Run> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/threads/{}/runs/{}/cancel", thread_id, run_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), Run>(Method::POST, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn list(&self, thread_id: &str) -> OpenAIResult<ListResponse<Run>> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/threads/{}/runs", thread_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), ListResponse<Run>>(Method::GET, &path, None, Some(headers.clone()))
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
        assert_send_sync::<RunServiceImpl>();
    }
}
