use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::files::{FileObject, FileListResponse, FileDeleteResponse, FileUploadRequest, FilePurpose};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use bytes::Bytes;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait FileService: Send + Sync {
    async fn list(&self, purpose: Option<FilePurpose>) -> OpenAIResult<FileListResponse>;
    async fn upload(&self, request: FileUploadRequest) -> OpenAIResult<FileObject>;
    async fn retrieve(&self, file_id: &str) -> OpenAIResult<FileObject>;
    async fn delete(&self, file_id: &str) -> OpenAIResult<FileDeleteResponse>;
    async fn content(&self, file_id: &str) -> OpenAIResult<Bytes>;
}

pub struct FileServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl FileServiceImpl {
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
impl FileService for FileServiceImpl {
    async fn list(&self, purpose: Option<FilePurpose>) -> OpenAIResult<FileListResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = match purpose {
            Some(p) => format!("/files?purpose={}", serde_json::to_string(&p).unwrap().trim_matches('"')),
            None => "/files".to_string(),
        };

        self.resilience
            .execute(async {
                self.transport
                    .request::<(), FileListResponse>(Method::GET, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn upload(&self, request: FileUploadRequest) -> OpenAIResult<FileObject> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let purpose_str = serde_json::to_string(&request.purpose).unwrap().trim_matches('"').to_string();

        self.resilience
            .execute(async {
                self.transport
                    .upload_file(
                        "/files",
                        request.file_data,
                        &request.filename,
                        &purpose_str,
                        Some(headers.clone()),
                    )
                    .await
                    .and_then(|v| serde_json::from_value(v).map_err(Into::into))
            })
            .await
    }

    async fn retrieve(&self, file_id: &str) -> OpenAIResult<FileObject> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = format!("/files/{}", file_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), FileObject>(Method::GET, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn delete(&self, file_id: &str) -> OpenAIResult<FileDeleteResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = format!("/files/{}", file_id);
        self.resilience
            .execute(async {
                self.transport
                    .request::<(), FileDeleteResponse>(Method::DELETE, &path, None, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn content(&self, file_id: &str) -> OpenAIResult<Bytes> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let path = format!("/files/{}/content", file_id);
        self.resilience
            .execute(async {
                self.transport
                    .download_file(&path, Some(headers.clone()))
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
        assert_send_sync::<FileServiceImpl>();
    }
}
