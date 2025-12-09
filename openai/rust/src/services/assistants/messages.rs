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
pub struct Message {
    pub id: String,
    pub object: String,
    pub created_at: i64,
    pub thread_id: String,
    pub role: String,
    pub content: Vec<MessageContent>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub assistant_id: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MessageContent {
    #[serde(rename = "text")]
    Text { text: TextContent },
    #[serde(rename = "image_file")]
    ImageFile { image_file: ImageFileContent },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextContent {
    pub value: String,
    pub annotations: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageFileContent {
    pub file_id: String,
}

#[async_trait]
pub trait MessageService: Send + Sync {
    async fn create(&self, thread_id: &str, role: &str, content: &str) -> OpenAIResult<Message>;
    async fn retrieve(&self, thread_id: &str, message_id: &str) -> OpenAIResult<Message>;
    async fn list(&self, thread_id: &str) -> OpenAIResult<ListResponse<Message>>;
}

pub struct MessageServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl MessageServiceImpl {
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
impl MessageService for MessageServiceImpl {
    async fn create(&self, thread_id: &str, role: &str, content: &str) -> OpenAIResult<Message> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/threads/{}/messages", thread_id);
        let body = serde_json::json!({
            "role": role,
            "content": content,
        });

        self.resilience
            .execute(async {
                self.transport
                    .request(Method::POST, &path, Some(&body), Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn retrieve(&self, thread_id: &str, message_id: &str) -> OpenAIResult<Message> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/threads/{}/messages/{}", thread_id, message_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), Message>(Method::GET, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn list(&self, thread_id: &str) -> OpenAIResult<ListResponse<Message>> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;
        headers.insert("OpenAI-Beta", "assistants=v2".parse().unwrap());

        let path = format!("/threads/{}/messages", thread_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), ListResponse<Message>>(
                        Method::GET,
                        &path,
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
        assert_send_sync::<MessageServiceImpl>();
    }
}
