use crate::auth::AuthManager;
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::images::{
    ImageEditRequest, ImageGenerationRequest, ImageResponse, ImageVariationRequest,
};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::Method;
use std::sync::Arc;

#[async_trait]
pub trait ImageService: Send + Sync {
    async fn generate(&self, request: ImageGenerationRequest) -> OpenAIResult<ImageResponse>;
    async fn edit(&self, request: ImageEditRequest) -> OpenAIResult<ImageResponse>;
    async fn variation(&self, request: ImageVariationRequest) -> OpenAIResult<ImageResponse>;
}

pub struct ImageServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl ImageServiceImpl {
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
impl ImageService for ImageServiceImpl {
    async fn generate(&self, request: ImageGenerationRequest) -> OpenAIResult<ImageResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        self.resilience
            .execute(async {
                self.transport
                    .request(
                        Method::POST,
                        "/images/generations",
                        Some(&request),
                        Some(headers.clone()),
                    )
                    .await
            })
            .await
    }

    async fn edit(&self, request: ImageEditRequest) -> OpenAIResult<ImageResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        // Build multipart form for image edit
        let mut form = crate::transport::MultipartForm::new()
            .file("image", "image.png", "image/png", request.image)
            .text("prompt", &request.prompt);

        if let Some(mask) = request.mask {
            form = form.file("mask", "mask.png", "image/png", mask);
        }
        if let Some(model) = &request.model {
            form = form.text("model", model);
        }
        if let Some(n) = request.n {
            form = form.text("n", &n.to_string());
        }
        if let Some(size) = request.size {
            form = form.text("size", &serde_json::to_string(&size).unwrap().trim_matches('"').to_string());
        }
        if let Some(format) = request.response_format {
            form = form.text("response_format", &serde_json::to_string(&format).unwrap().trim_matches('"').to_string());
        }

        let (content_type, body) = form.build();
        headers.insert(http::header::CONTENT_TYPE, content_type.parse().unwrap());

        self.resilience
            .execute(async {
                self.transport
                    .request_raw(Method::POST, "/images/edits", body, Some(headers.clone()))
                    .await
            })
            .await
    }

    async fn variation(
        &self,
        request: ImageVariationRequest,
    ) -> OpenAIResult<ImageResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        let mut form = crate::transport::MultipartForm::new()
            .file("image", "image.png", "image/png", request.image);

        if let Some(model) = &request.model {
            form = form.text("model", model);
        }
        if let Some(n) = request.n {
            form = form.text("n", &n.to_string());
        }
        if let Some(size) = request.size {
            form = form.text("size", &serde_json::to_string(&size).unwrap().trim_matches('"').to_string());
        }
        if let Some(format) = request.response_format {
            form = form.text("response_format", &serde_json::to_string(&format).unwrap().trim_matches('"').to_string());
        }

        let (content_type, body) = form.build();
        headers.insert(http::header::CONTENT_TYPE, content_type.parse().unwrap());

        self.resilience
            .execute(async {
                self.transport
                    .request_raw(Method::POST, "/images/variations", body, Some(headers.clone()))
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
        assert_send_sync::<ImageServiceImpl>();
    }
}
