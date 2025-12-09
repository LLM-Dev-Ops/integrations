use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::audio::{SpeechRequest, TranscriptionRequest, TranscriptionResponse, TranslationRequest};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use bytes::Bytes;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait AudioService: Send + Sync {
    async fn transcribe(&self, request: TranscriptionRequest) -> OpenAIResult<TranscriptionResponse>;
    async fn translate(&self, request: TranslationRequest) -> OpenAIResult<TranscriptionResponse>;
    async fn speech(&self, request: SpeechRequest) -> OpenAIResult<Bytes>;
}

pub struct AudioServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl AudioServiceImpl {
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
impl AudioService for AudioServiceImpl {
    async fn transcribe(&self, request: TranscriptionRequest) -> OpenAIResult<TranscriptionResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let mut form = crate::transport::MultipartForm::new()
            .file("file", &request.filename, "audio/mpeg", request.file)
            .text("model", &request.model);

        if let Some(lang) = &request.language {
            form = form.text("language", lang);
        }
        if let Some(prompt) = &request.prompt {
            form = form.text("prompt", prompt);
        }
        if let Some(fmt) = &request.response_format {
            form = form.text("response_format", &serde_json::to_string(fmt).unwrap().trim_matches('"').to_string());
        }
        if let Some(temp) = request.temperature {
            form = form.text("temperature", &temp.to_string());
        }

        let (content_type, body) = form.build();
        headers.insert(http::header::CONTENT_TYPE, content_type.parse().unwrap());

        self.resilience
            .execute(async {
                self.transport
                    .request_raw(Method::POST, "/audio/transcriptions", body, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn translate(&self, request: TranslationRequest) -> OpenAIResult<TranscriptionResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let mut form = crate::transport::MultipartForm::new()
            .file("file", &request.filename, "audio/mpeg", request.file)
            .text("model", &request.model);

        if let Some(prompt) = &request.prompt {
            form = form.text("prompt", prompt);
        }
        if let Some(fmt) = &request.response_format {
            form = form.text("response_format", &serde_json::to_string(fmt).unwrap().trim_matches('"').to_string());
        }
        if let Some(temp) = request.temperature {
            form = form.text("temperature", &temp.to_string());
        }

        let (content_type, body) = form.build();
        headers.insert(http::header::CONTENT_TYPE, content_type.parse().unwrap());

        self.resilience
            .execute(async {
                self.transport
                    .request_raw(Method::POST, "/audio/translations", body, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn speech(&self, request: SpeechRequest) -> OpenAIResult<Bytes> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        self.resilience
            .execute(async {
                self.transport
                    .request_bytes(Method::POST, "/audio/speech", Some(&request), Some(headers.clone()))
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
        assert_send_sync::<AudioServiceImpl>();
    }
}
