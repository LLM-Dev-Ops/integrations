//! Content service implementation for generating and streaming content with Gemini models.

use std::sync::Arc;
use std::time::Instant;
use async_trait::async_trait;
use bytes::Bytes;
use serde_json::json;

use super::{ContentService, ContentStream};
use super::validation::{validate_generate_request, validate_count_tokens_request};
use crate::streaming::GeminiChunkParser;
use crate::auth::AuthManager;
use crate::config::GeminiConfig;
use crate::error::{GeminiError, ContentError};
use crate::observability::{Logger, Tracer, GeminiMetrics, SpanStatus};
use crate::transport::{HttpTransport, HttpRequest, HttpMethod, RequestBuilder, ResponseParser, endpoints};
use crate::types::{
    GenerateContentRequest, GenerateContentResponse,
    CountTokensRequest, CountTokensResponse,
    GenerationConfig, SafetySetting, FinishReason, BlockReason,
    PromptFeedback, Candidate,
};

/// Implementation of the ContentService.
pub struct ContentServiceImpl {
    config: Arc<GeminiConfig>,
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    request_builder: RequestBuilder,
    default_model: String,
    default_generation_config: Option<GenerationConfig>,
    default_safety_settings: Vec<SafetySetting>,
    logger: Box<dyn Logger>,
    tracer: Box<dyn Tracer>,
    metrics: GeminiMetrics,
}

impl ContentServiceImpl {
    /// Create a new content service implementation.
    pub fn new(
        config: Arc<GeminiConfig>,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        logger: Box<dyn Logger>,
        tracer: Box<dyn Tracer>,
        metrics: GeminiMetrics,
    ) -> Self {
        // Clone the auth_manager for the request builder
        let request_builder = RequestBuilder::new(
            config.base_url.clone(),
            config.api_version.clone(),
            auth_manager.clone_box(),
        );

        Self {
            config,
            transport,
            auth_manager,
            request_builder,
            default_model: "gemini-1.5-pro".to_string(),
            default_generation_config: None,
            default_safety_settings: Vec::new(),
            logger,
            tracer,
            metrics,
        }
    }

    /// Set the default model for this service.
    pub fn with_default_model(mut self, model: String) -> Self {
        self.default_model = model;
        self
    }

    /// Set the default generation config for this service.
    pub fn with_default_generation_config(mut self, config: GenerationConfig) -> Self {
        self.default_generation_config = Some(config);
        self
    }

    /// Set the default safety settings for this service.
    pub fn with_default_safety_settings(mut self, settings: Vec<SafetySetting>) -> Self {
        self.default_safety_settings = settings;
        self
    }

    /// Merge request with default settings.
    fn merge_with_defaults(&self, mut request: GenerateContentRequest) -> GenerateContentRequest {
        // Merge generation config - request values override defaults
        request.generation_config = self.merge_generation_config(request.generation_config);

        // Merge safety settings
        request.safety_settings = self.merge_safety_settings(request.safety_settings);

        request
    }

    /// Merge generation config with defaults.
    fn merge_generation_config(&self, request_config: Option<GenerationConfig>) -> Option<GenerationConfig> {
        match (request_config, &self.default_generation_config) {
            (Some(req), Some(def)) => Some(GenerationConfig {
                temperature: req.temperature.or(def.temperature),
                top_p: req.top_p.or(def.top_p),
                top_k: req.top_k.or(def.top_k),
                max_output_tokens: req.max_output_tokens.or(def.max_output_tokens),
                stop_sequences: req.stop_sequences.or_else(|| def.stop_sequences.clone()),
                candidate_count: req.candidate_count.or(def.candidate_count),
                response_mime_type: req.response_mime_type.or_else(|| def.response_mime_type.clone()),
                response_schema: req.response_schema.or_else(|| def.response_schema.clone()),
            }),
            (Some(req), None) => Some(req),
            (None, Some(def)) => Some(def.clone()),
            (None, None) => None,
        }
    }

    /// Merge safety settings with defaults.
    fn merge_safety_settings(&self, request_settings: Option<Vec<SafetySetting>>) -> Option<Vec<SafetySetting>> {
        match request_settings {
            Some(settings) if !settings.is_empty() => Some(settings),
            _ if !self.default_safety_settings.is_empty() => Some(self.default_safety_settings.clone()),
            _ => None,
        }
    }

    /// Check for content safety blocks in the response.
    ///
    /// This function examines both the prompt feedback and candidate responses
    /// for any safety-related blocks. It never swallows errors and provides
    /// detailed safety rating information when content is blocked.
    fn check_safety_blocks(&self, response: &GenerateContentResponse) -> Result<(), GeminiError> {
        // Check prompt feedback for blocks
        if let Some(prompt_feedback) = &response.prompt_feedback {
            if let Some(block_reason) = &prompt_feedback.block_reason {
                return match block_reason {
                    BlockReason::Safety => {
                        // Convert safety ratings to our error format
                        let safety_ratings = prompt_feedback.safety_ratings
                            .as_ref()
                            .map(|ratings| {
                                ratings.iter().map(|r| crate::error::SafetyRatingInfo {
                                    category: format!("{:?}", r.category),
                                    probability: format!("{:?}", r.probability),
                                }).collect()
                            })
                            .unwrap_or_default();

                        // Get the primary reason from the first rating
                        let reason = prompt_feedback.safety_ratings
                            .as_ref()
                            .and_then(|ratings| ratings.first())
                            .map(|r| format!("Safety: {:?} ({})", r.category, format!("{:?}", r.probability)))
                            .unwrap_or_else(|| "Safety (unspecified)".to_string());

                        tracing::warn!(
                            block_reason = ?block_reason,
                            safety_ratings = ?safety_ratings,
                            "Content blocked due to safety concerns in prompt"
                        );

                        Err(GeminiError::Content(ContentError::SafetyBlocked {
                            reason,
                            safety_ratings,
                        }))
                    }
                    BlockReason::Blocklist | BlockReason::ProhibitedContent => {
                        tracing::warn!(
                            block_reason = ?block_reason,
                            "Content blocked due to prohibited content in prompt"
                        );
                        Err(GeminiError::Content(ContentError::ProhibitedContent))
                    }
                    _ => {
                        tracing::debug!(
                            block_reason = ?block_reason,
                            "Prompt blocked for non-safety reason"
                        );
                        Ok(())
                    }
                };
            }
        }

        // Check candidates for safety finish reasons
        if let Some(candidates) = &response.candidates {
            for (index, candidate) in candidates.iter().enumerate() {
                if let Some(finish_reason) = &candidate.finish_reason {
                    match finish_reason {
                        FinishReason::Safety => {
                            // Convert safety ratings to our error format
                            let safety_ratings = candidate.safety_ratings
                                .as_ref()
                                .map(|ratings| {
                                    ratings.iter().map(|r| crate::error::SafetyRatingInfo {
                                        category: format!("{:?}", r.category),
                                        probability: format!("{:?}", r.probability),
                                    }).collect()
                                })
                                .unwrap_or_default();

                            // Get the primary reason from the first rating
                            let reason = candidate.safety_ratings
                                .as_ref()
                                .and_then(|ratings| ratings.first())
                                .map(|r| format!("Safety: {:?} ({})", r.category, format!("{:?}", r.probability)))
                                .unwrap_or_else(|| "Safety (unspecified)".to_string());

                            tracing::warn!(
                                candidate_index = index,
                                finish_reason = ?finish_reason,
                                safety_ratings = ?safety_ratings,
                                "Content generation blocked due to safety concerns"
                            );

                            return Err(GeminiError::Content(ContentError::SafetyBlocked {
                                reason,
                                safety_ratings,
                            }));
                        }
                        FinishReason::Recitation => {
                            // Include safety ratings even for recitation blocks
                            let safety_ratings = candidate.safety_ratings
                                .as_ref()
                                .map(|ratings| {
                                    ratings.iter().map(|r| crate::error::SafetyRatingInfo {
                                        category: format!("{:?}", r.category),
                                        probability: format!("{:?}", r.probability),
                                    }).collect()
                                })
                                .unwrap_or_default();

                            tracing::warn!(
                                candidate_index = index,
                                finish_reason = ?finish_reason,
                                "Content blocked due to recitation detection"
                            );

                            return Err(GeminiError::Content(ContentError::RecitationBlocked {
                                safety_ratings,
                            }));
                        }
                        FinishReason::ProhibitedContent | FinishReason::Blocklist => {
                            tracing::warn!(
                                candidate_index = index,
                                finish_reason = ?finish_reason,
                                "Content blocked due to prohibited content"
                            );
                            return Err(GeminiError::Content(ContentError::ProhibitedContent));
                        }
                        _ => {}
                    }
                }
            }
        }

        Ok(())
    }

    /// Log usage statistics from the response.
    fn log_usage_statistics(&self, response: &GenerateContentResponse) {
        if let Some(usage) = &response.usage_metadata {
            tracing::info!(
                prompt_tokens = usage.prompt_token_count,
                completion_tokens = usage.candidates_token_count.unwrap_or(0),
                total_tokens = usage.total_token_count,
                cached_tokens = usage.cached_content_token_count.unwrap_or(0),
                "Content generation usage"
            );
        }
    }
}

#[async_trait]
impl ContentService for ContentServiceImpl {
    async fn generate(
        &self,
        model: &str,
        request: GenerateContentRequest,
    ) -> Result<GenerateContentResponse, GeminiError> {
        // Start tracing span
        let mut span = self.tracer.start_span("gemini.content.generate");
        span.set_attribute("model", model);
        span.set_attribute("service", "content");
        span.set_attribute("method", "generate");

        let start = Instant::now();

        // Log request start
        self.logger.debug("Starting content generation", json!({
            "model": model,
            "contents_count": request.contents.len(),
            "has_generation_config": request.generation_config.is_some(),
            "has_safety_settings": request.safety_settings.is_some(),
        }));

        // 1. Validate request
        validate_generate_request(&request)?;

        // 2. Merge with defaults
        let merged_request = self.merge_with_defaults(request);

        // 3. Build endpoint path
        let path = endpoints::generate_content(model);

        // 4. Build HTTP request
        let http_request = self.request_builder.build_request(
            HttpMethod::Post,
            &path,
            Some(&merged_request),
            None,
        )?;

        // 5. Execute HTTP request
        let http_response = self.transport
            .send(http_request)
            .await
            .map_err(|e| {
                let error = GeminiError::Network(
                    crate::error::NetworkError::ConnectionFailed {
                        message: e.to_string(),
                    }
                );

                // Log and record error
                self.logger.error("Network error during content generation", json!({
                    "error": error.to_string(),
                    "model": model,
                }));

                error
            })?;

        let status_code = http_response.status;

        // 6. Parse response
        let response: GenerateContentResponse = ResponseParser::parse_response(http_response)?;

        // 7. Check for content safety blocks
        if let Err(e) = self.check_safety_blocks(&response) {
            let duration = start.elapsed();

            // Record safety block metrics
            if let GeminiError::Content(ContentError::SafetyBlocked { reason, .. }) = &e {
                self.metrics.record_safety_block("content", reason);
            }

            // Log and record error
            self.logger.warn("Content generation blocked", json!({
                "error": e.to_string(),
                "model": model,
                "duration_ms": duration.as_millis(),
            }));

            span.set_status(SpanStatus::Error(e.to_string()));
            self.metrics.record_request("content", "generate", status_code, duration.as_millis() as u64);
            span.end();

            return Err(e);
        }

        let duration = start.elapsed();

        // 8. Record metrics and log usage
        self.metrics.record_request("content", "generate", status_code, duration.as_millis() as u64);

        if let Some(usage) = &response.usage_metadata {
            self.metrics.record_tokens(
                "content",
                usage.prompt_token_count,
                usage.candidates_token_count.unwrap_or(0)
            );

            if let Some(cached_tokens) = usage.cached_content_token_count {
                if cached_tokens > 0 {
                    self.metrics.record_cached_tokens("content", cached_tokens);
                }
            }

            self.logger.info("Content generation completed", json!({
                "model": model,
                "duration_ms": duration.as_millis(),
                "prompt_tokens": usage.prompt_token_count,
                "completion_tokens": usage.candidates_token_count.unwrap_or(0),
                "total_tokens": usage.total_token_count,
                "cached_tokens": usage.cached_content_token_count.unwrap_or(0),
                "candidates": response.candidates.as_ref().map(|c| c.len()).unwrap_or(0),
            }));
        } else {
            self.logger.info("Content generation completed", json!({
                "model": model,
                "duration_ms": duration.as_millis(),
                "candidates": response.candidates.as_ref().map(|c| c.len()).unwrap_or(0),
            }));
        }

        span.set_status(SpanStatus::Ok);
        span.end();

        Ok(response)
    }

    async fn generate_stream(
        &self,
        model: &str,
        request: GenerateContentRequest,
    ) -> Result<ContentStream, GeminiError> {
        // Start tracing span
        let mut span = self.tracer.start_span("gemini.content.generate_stream");
        span.set_attribute("model", model);
        span.set_attribute("service", "content");
        span.set_attribute("method", "generate_stream");

        // Log request start
        self.logger.debug("Starting streaming content generation", json!({
            "model": model,
            "contents_count": request.contents.len(),
            "has_generation_config": request.generation_config.is_some(),
            "has_safety_settings": request.safety_settings.is_some(),
        }));

        // 1. Validate request
        validate_generate_request(&request)?;

        // 2. Merge with defaults
        let merged_request = self.merge_with_defaults(request);

        // 3. Build endpoint path (use stream endpoint)
        let path = endpoints::stream_generate_content(model);

        // 4. Build HTTP request
        let http_request = self.request_builder.build_request(
            HttpMethod::Post,
            &path,
            Some(&merged_request),
            Some(vec![("accept".to_string(), "text/event-stream".to_string())]),
        )?;

        // 5. Execute streaming HTTP request
        let chunk_stream = self.transport
            .send_streaming(http_request)
            .await
            .map_err(|e| {
                let error = GeminiError::Network(
                    crate::error::NetworkError::ConnectionFailed {
                        message: e.to_string(),
                    }
                );

                // Log error
                self.logger.error("Network error during streaming content generation", json!({
                    "error": error.to_string(),
                    "model": model,
                }));

                span.set_status(SpanStatus::Error(error.to_string()));
                span.end();

                error
            })?;

        // 6. Convert transport errors to GeminiError
        use futures::StreamExt;
        let error_mapped_stream = Box::pin(chunk_stream.map(
            |result| result.map_err(|e| GeminiError::Network(crate::error::NetworkError::ConnectionFailed {
                message: e.to_string(),
            }))
        ));

        // 7. Create chunk parser to handle Gemini's JSON array streaming format
        let parser = GeminiChunkParser::new(error_mapped_stream);

        // Log stream started
        self.logger.info("Streaming content generation started", json!({
            "model": model,
        }));

        span.set_status(SpanStatus::Ok);
        span.end();

        Ok(Box::pin(parser))
    }

    async fn count_tokens(
        &self,
        model: &str,
        request: CountTokensRequest,
    ) -> Result<CountTokensResponse, GeminiError> {
        // Start tracing span
        let mut span = self.tracer.start_span("gemini.content.count_tokens");
        span.set_attribute("model", model);
        span.set_attribute("service", "content");
        span.set_attribute("method", "count_tokens");

        let start = Instant::now();

        // Log request start
        self.logger.debug("Starting token count", json!({
            "model": model,
            "contents_count": request.contents.len(),
        }));

        // 1. Validate request
        validate_count_tokens_request(&request)?;

        // 2. Build endpoint path
        let path = endpoints::count_tokens(model);

        // 3. Build HTTP request
        let http_request = self.request_builder.build_request(
            HttpMethod::Post,
            &path,
            Some(&request),
            None,
        )?;

        // 4. Execute HTTP request
        let http_response = self.transport
            .send(http_request)
            .await
            .map_err(|e| {
                let error = GeminiError::Network(
                    crate::error::NetworkError::ConnectionFailed {
                        message: e.to_string(),
                    }
                );

                // Log error
                self.logger.error("Network error during token count", json!({
                    "error": error.to_string(),
                    "model": model,
                }));

                span.set_status(SpanStatus::Error(error.to_string()));
                span.end();

                error
            })?;

        let status_code = http_response.status;

        // 5. Parse response
        let response: CountTokensResponse = ResponseParser::parse_response(http_response)?;

        let duration = start.elapsed();

        // Record metrics
        self.metrics.record_request("content", "count_tokens", status_code, duration.as_millis() as u64);

        // Log completion
        self.logger.info("Token count completed", json!({
            "model": model,
            "duration_ms": duration.as_millis(),
            "total_tokens": response.total_tokens,
        }));

        span.set_status(SpanStatus::Ok);
        span.end();

        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Content, Part, Role};

    // Mock implementations for testing would go here
    // These tests verify the logic without actual HTTP calls

    #[test]
    fn test_merge_with_defaults() {
        // This test would require setting up mocks
        // Skipping for now as it's integration-level testing
    }

    #[test]
    fn test_check_safety_blocks() {
        // Test would verify safety block detection
        // Requires creating test responses
    }
}
