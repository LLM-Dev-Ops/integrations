//! Audio transcription and translation service.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::instrument;

use crate::auth::AuthProvider;
use crate::errors::{ApiErrorResponse, GroqError, RateLimitType};
use crate::resilience::{RateLimitManager, ResilienceOrchestrator};
use crate::transport::{HttpResponse, HttpTransport, MultipartPart, MultipartRequest};
use crate::types::audio::{
    TranscriptionRequest, TranscriptionResponse, TranslationRequest, TranslationResponse,
};

/// Audio transcription and translation service.
pub struct AudioService {
    transport: Arc<dyn HttpTransport>,
    auth: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    rate_limiter: Arc<RwLock<RateLimitManager>>,
}

impl AudioService {
    /// Creates a new audio service.
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth: Arc<dyn AuthProvider>,
        resilience: Arc<ResilienceOrchestrator>,
        rate_limiter: Arc<RwLock<RateLimitManager>>,
    ) -> Self {
        Self {
            transport,
            auth,
            resilience,
            rate_limiter,
        }
    }

    /// Transcribes audio to text.
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn transcribe(
        &self,
        request: TranscriptionRequest,
    ) -> Result<TranscriptionResponse, GroqError> {
        // Validate request
        request.validate()?;

        // Check rate limits
        {
            let rate_limiter = self.rate_limiter.read().await;
            if let Some(wait) = rate_limiter.should_wait() {
                tracing::info!(wait_ms = wait.as_millis(), "Rate limit throttling");
                tokio::time::sleep(wait).await;
            }
        }

        // Build multipart request
        let multipart_request = self.build_transcription_request(&request)?;

        // Execute with resilience
        let response = self
            .resilience
            .execute(|| {
                let transport = Arc::clone(&self.transport);
                let req = multipart_request.clone();
                async move {
                    transport.send_multipart(req).await.map_err(|e| GroqError::Network {
                        message: e.to_string(),
                        cause: None,
                    })
                }
            })
            .await?;

        // Update rate limits
        self.rate_limiter
            .write()
            .await
            .update_from_headers(&response.headers);

        // Parse response
        self.parse_response(response)
    }

    /// Translates audio to English text.
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn translate(
        &self,
        request: TranslationRequest,
    ) -> Result<TranslationResponse, GroqError> {
        // Validate request
        request.validate()?;

        // Check rate limits
        {
            let rate_limiter = self.rate_limiter.read().await;
            if let Some(wait) = rate_limiter.should_wait() {
                tracing::info!(wait_ms = wait.as_millis(), "Rate limit throttling");
                tokio::time::sleep(wait).await;
            }
        }

        // Build multipart request
        let multipart_request = self.build_translation_request(&request)?;

        // Execute with resilience
        let response = self
            .resilience
            .execute(|| {
                let transport = Arc::clone(&self.transport);
                let req = multipart_request.clone();
                async move {
                    transport.send_multipart(req).await.map_err(|e| GroqError::Network {
                        message: e.to_string(),
                        cause: None,
                    })
                }
            })
            .await?;

        // Update rate limits
        self.rate_limiter
            .write()
            .await
            .update_from_headers(&response.headers);

        // Parse response
        self.parse_response(response)
    }

    /// Builds a multipart request for transcription.
    fn build_transcription_request(
        &self,
        request: &TranscriptionRequest,
    ) -> Result<MultipartRequest, GroqError> {
        let mut parts = Vec::new();

        // Add file
        let content_type = self.detect_content_type(&request.filename);
        parts.push(MultipartPart::File {
            name: "file".to_string(),
            filename: request.filename.clone(),
            content_type,
            data: request.file.clone(),
        });

        // Add model
        parts.push(MultipartPart::Text {
            name: "model".to_string(),
            value: request.model.clone(),
        });

        // Add optional parameters
        if let Some(ref language) = request.language {
            parts.push(MultipartPart::Text {
                name: "language".to_string(),
                value: language.clone(),
            });
        }

        if let Some(ref prompt) = request.prompt {
            parts.push(MultipartPart::Text {
                name: "prompt".to_string(),
                value: prompt.clone(),
            });
        }

        if let Some(ref format) = request.response_format {
            parts.push(MultipartPart::Text {
                name: "response_format".to_string(),
                value: format.as_str().to_string(),
            });
        }

        if let Some(temp) = request.temperature {
            parts.push(MultipartPart::Text {
                name: "temperature".to_string(),
                value: temp.to_string(),
            });
        }

        if let Some(ref granularities) = request.timestamp_granularities {
            for g in granularities {
                parts.push(MultipartPart::Text {
                    name: "timestamp_granularities[]".to_string(),
                    value: g.as_str().to_string(),
                });
            }
        }

        let mut headers = HashMap::new();
        self.auth.apply_auth(&mut headers);

        Ok(MultipartRequest {
            path: "audio/transcriptions".to_string(),
            headers,
            parts,
            timeout: None,
        })
    }

    /// Builds a multipart request for translation.
    fn build_translation_request(
        &self,
        request: &TranslationRequest,
    ) -> Result<MultipartRequest, GroqError> {
        let mut parts = Vec::new();

        // Add file
        let content_type = self.detect_content_type(&request.filename);
        parts.push(MultipartPart::File {
            name: "file".to_string(),
            filename: request.filename.clone(),
            content_type,
            data: request.file.clone(),
        });

        // Add model
        parts.push(MultipartPart::Text {
            name: "model".to_string(),
            value: request.model.clone(),
        });

        // Add optional parameters
        if let Some(ref prompt) = request.prompt {
            parts.push(MultipartPart::Text {
                name: "prompt".to_string(),
                value: prompt.clone(),
            });
        }

        if let Some(ref format) = request.response_format {
            parts.push(MultipartPart::Text {
                name: "response_format".to_string(),
                value: format.as_str().to_string(),
            });
        }

        if let Some(temp) = request.temperature {
            parts.push(MultipartPart::Text {
                name: "temperature".to_string(),
                value: temp.to_string(),
            });
        }

        let mut headers = HashMap::new();
        self.auth.apply_auth(&mut headers);

        Ok(MultipartRequest {
            path: "audio/translations".to_string(),
            headers,
            parts,
            timeout: None,
        })
    }

    /// Detects content type from filename.
    fn detect_content_type(&self, filename: &str) -> String {
        let ext = filename
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_lowercase();

        match ext.as_str() {
            "mp3" => "audio/mpeg",
            "mp4" => "audio/mp4",
            "m4a" => "audio/mp4",
            "wav" => "audio/wav",
            "webm" => "audio/webm",
            "flac" => "audio/flac",
            "ogg" => "audio/ogg",
            _ => "application/octet-stream",
        }
        .to_string()
    }

    /// Parses the HTTP response.
    fn parse_response<T: serde::de::DeserializeOwned>(
        &self,
        response: HttpResponse,
    ) -> Result<T, GroqError> {
        if response.status != 200 {
            return Err(self.parse_error_response(&response));
        }

        serde_json::from_slice(&response.body).map_err(|e| GroqError::Server {
            message: format!("Failed to parse response: {}", e),
            status_code: response.status,
            request_id: response.headers.get("x-request-id").cloned(),
        })
    }

    /// Parses an error response.
    fn parse_error_response(&self, response: &HttpResponse) -> GroqError {
        let request_id = response.headers.get("x-request-id").cloned();

        if let Ok(error_body) = serde_json::from_slice::<ApiErrorResponse>(&response.body) {
            return match response.status {
                401 => GroqError::Authentication {
                    message: error_body.error.message,
                    api_key_hint: None,
                },
                429 => GroqError::RateLimit {
                    message: error_body.error.message,
                    retry_after: None,
                    limit_type: RateLimitType::Requests,
                },
                400 => GroqError::Validation {
                    message: error_body.error.message,
                    param: error_body.error.param,
                    value: None,
                },
                _ => GroqError::Server {
                    message: error_body.error.message,
                    status_code: response.status,
                    request_id,
                },
            };
        }

        GroqError::Server {
            message: format!("HTTP error: {}", response.status),
            status_code: response.status,
            request_id,
        }
    }
}

impl std::fmt::Debug for AudioService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AudioService").finish()
    }
}
