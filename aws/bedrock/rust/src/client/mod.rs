//! Bedrock client implementation.
//!
//! This module provides the main client interface for interacting with AWS Bedrock.

use crate::config::BedrockConfig;
use crate::credentials::{AwsCredentials, ChainCredentialsProvider, CredentialsProvider, StaticCredentialsProvider};
use crate::error::{BedrockError, NetworkError};
use crate::services::{FamilyRequest, UnifiedService};
use crate::signing::{AwsSigner, BedrockSigner};
use crate::streaming::EventStreamParser;
use crate::types::{
    detect_model_family, GetModelRequest, GetModelResponse, ListModelsRequest,
    ListModelsResponse, ModelFamily, TitanEmbedRequest, TitanEmbedResponse,
    UnifiedInvokeRequest, UnifiedInvokeResponse, UnifiedStreamChunk, UsageInfo,
};
use async_stream::try_stream;
use async_trait::async_trait;
use bytes::Bytes;
use futures::Stream;
use reqwest::{Client as HttpClient, Response};
use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, info, instrument, trace, warn};
use url::Url;

/// Bedrock client trait defining the public API.
#[async_trait]
pub trait BedrockClient: Send + Sync {
    /// Invoke a model with a unified request.
    async fn invoke(&self, request: UnifiedInvokeRequest) -> Result<UnifiedInvokeResponse, BedrockError>;

    /// Invoke a model with streaming response.
    fn invoke_stream(
        &self,
        request: UnifiedInvokeRequest,
    ) -> Pin<Box<dyn Stream<Item = Result<UnifiedStreamChunk, BedrockError>> + Send + '_>>;

    /// Generate embeddings using Titan.
    async fn embed(&self, request: TitanEmbedRequest, model_id: &str) -> Result<TitanEmbedResponse, BedrockError>;

    /// List available foundation models.
    async fn list_models(&self, request: ListModelsRequest) -> Result<ListModelsResponse, BedrockError>;

    /// Get details for a specific model.
    async fn get_model(&self, model_id: &str) -> Result<GetModelResponse, BedrockError>;
}

/// Bedrock client implementation.
pub struct BedrockClientImpl {
    config: BedrockConfig,
    http_client: HttpClient,
    runtime_signer: BedrockSigner,
    api_signer: BedrockSigner,
}

impl BedrockClientImpl {
    /// Create a new client with the given configuration and credentials.
    pub fn new(
        config: BedrockConfig,
        credentials_provider: Arc<dyn CredentialsProvider>,
    ) -> Result<Self, BedrockError> {
        let http_client = HttpClient::builder()
            .timeout(config.timeout)
            .build()
            .map_err(|e| BedrockError::Network(NetworkError::ConnectionFailed {
                message: format!("Failed to create HTTP client: {}", e),
            }))?;

        let runtime_signer = BedrockSigner::runtime(credentials_provider.clone(), &config.region);
        let api_signer = BedrockSigner::new(credentials_provider, &config.region);

        Ok(Self {
            config,
            http_client,
            runtime_signer,
            api_signer,
        })
    }

    /// Build the invoke URL for a model.
    fn build_invoke_url(&self, model_id: &str) -> String {
        format!(
            "{}/model/{}/invoke",
            self.config.runtime_endpoint(),
            model_id
        )
    }

    /// Build the invoke-with-response-stream URL for a model.
    fn build_stream_url(&self, model_id: &str) -> String {
        format!(
            "{}/model/{}/invoke-with-response-stream",
            self.config.runtime_endpoint(),
            model_id
        )
    }

    /// Build the list foundation models URL.
    fn build_list_models_url(&self, params: &[(String, String)]) -> String {
        let mut url = format!("{}/foundation-models", self.config.api_endpoint());
        if !params.is_empty() {
            let query: Vec<String> = params
                .iter()
                .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
                .collect();
            url.push('?');
            url.push_str(&query.join("&"));
        }
        url
    }

    /// Build the get foundation model URL.
    fn build_get_model_url(&self, model_id: &str) -> String {
        format!(
            "{}/foundation-models/{}",
            self.config.api_endpoint(),
            model_id
        )
    }

    /// Build the embeddings URL.
    fn build_embed_url(&self, model_id: &str) -> String {
        format!(
            "{}/model/{}/invoke",
            self.config.runtime_endpoint(),
            model_id
        )
    }

    /// Execute a signed request.
    async fn execute_request(
        &self,
        method: &str,
        url: &str,
        body: Option<&[u8]>,
        signer: &BedrockSigner,
    ) -> Result<Response, BedrockError> {
        let parsed_url = Url::parse(url).map_err(|e| {
            BedrockError::Configuration(crate::error::ConfigurationError::InvalidConfiguration {
                field: "url".to_string(),
                message: format!("Invalid URL: {}", e),
            })
        })?;

        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/json".to_string());
        headers.insert("accept".to_string(), "application/json".to_string());

        let signed = signer.sign(method, &parsed_url, &headers, body).await?;

        let mut request = match method {
            "GET" => self.http_client.get(signed.url.as_str()),
            "POST" => self.http_client.post(signed.url.as_str()),
            _ => self.http_client.request(
                method.parse().unwrap(),
                signed.url.as_str(),
            ),
        };

        for (name, value) in signed.headers {
            request = request.header(&name, &value);
        }

        if let Some(body) = signed.body {
            request = request.body(body);
        }

        let response = request.send().await.map_err(|e| {
            if e.is_timeout() {
                BedrockError::Network(NetworkError::Timeout {
                    duration: self.config.timeout,
                })
            } else if e.is_connect() {
                BedrockError::Network(NetworkError::ConnectionFailed {
                    message: e.to_string(),
                })
            } else {
                BedrockError::Network(NetworkError::ConnectionFailed {
                    message: e.to_string(),
                })
            }
        })?;

        Ok(response)
    }

    /// Parse an error response.
    async fn parse_error_response(
        &self,
        response: Response,
        model_id: Option<&str>,
    ) -> BedrockError {
        let status = response.status().as_u16();
        let request_id = response
            .headers()
            .get("x-amzn-requestid")
            .and_then(|v| v.to_str().ok())
            .map(String::from);
        let error_type = response
            .headers()
            .get("x-amzn-errortype")
            .and_then(|v| v.to_str().ok())
            .map(|s| crate::error::mapping::parse_error_type(s));

        let body = response.text().await.unwrap_or_default();
        let message: Option<String> = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from));

        crate::error::mapping::map_bedrock_error(
            status,
            error_type,
            message.as_deref(),
            request_id,
            model_id,
            Some(&self.config.region),
        )
    }

    /// Parse response based on model family.
    fn parse_invoke_response(
        &self,
        body: &[u8],
        model_id: &str,
        family: ModelFamily,
    ) -> Result<UnifiedInvokeResponse, BedrockError> {
        let json: serde_json::Value = serde_json::from_slice(body).map_err(|e| {
            BedrockError::Stream(crate::error::StreamError::ParseError {
                message: format!("Failed to parse response JSON: {}", e),
            })
        })?;

        match family {
            ModelFamily::Titan => {
                // Extract input token count from headers if available
                let titan_response = crate::services::titan::parse_response(&json)?;
                Ok(crate::services::titan::translate_response(
                    titan_response,
                    model_id,
                    0, // Token count from headers in real implementation
                ))
            }
            ModelFamily::Claude => {
                let claude_response = crate::services::claude::parse_response(&json)?;
                Ok(crate::services::claude::translate_response(
                    claude_response,
                    model_id,
                ))
            }
            ModelFamily::Llama => {
                let llama_response = crate::services::llama::parse_response(&json)?;
                Ok(crate::services::llama::translate_response(
                    llama_response,
                    model_id,
                ))
            }
        }
    }
}

#[async_trait]
impl BedrockClient for BedrockClientImpl {
    #[instrument(skip(self, request), fields(model_id = %request.model_id))]
    async fn invoke(&self, request: UnifiedInvokeRequest) -> Result<UnifiedInvokeResponse, BedrockError> {
        let model_id = request.model_id.clone();
        let family = detect_model_family(&model_id)?;

        // Translate request to family-specific format
        let family_request = UnifiedService::translate_request(&request)?;
        let body = family_request.to_json_bytes()?;

        debug!(
            model_id = %model_id,
            family = %family,
            body_size = body.len(),
            "Invoking model"
        );

        // Build URL and execute request
        let url = self.build_invoke_url(&model_id);
        let response = self.execute_request("POST", &url, Some(&body), &self.runtime_signer).await?;

        if !response.status().is_success() {
            return Err(self.parse_error_response(response, Some(&model_id)).await);
        }

        // Parse response
        let response_body = response.bytes().await.map_err(|e| {
            BedrockError::Network(NetworkError::ConnectionFailed {
                message: format!("Failed to read response: {}", e),
            })
        })?;

        self.parse_invoke_response(&response_body, &model_id, family)
    }

    fn invoke_stream(
        &self,
        request: UnifiedInvokeRequest,
    ) -> Pin<Box<dyn Stream<Item = Result<UnifiedStreamChunk, BedrockError>> + Send + '_>> {
        let model_id = request.model_id.clone();

        Box::pin(try_stream! {
            let family = detect_model_family(&model_id)?;

            // Translate request to family-specific format
            let family_request = UnifiedService::translate_request(&request)?;
            let body = family_request.to_json_bytes()?;

            debug!(
                model_id = %model_id,
                family = %family,
                "Starting streaming invoke"
            );

            // Build URL and execute streaming request
            let url = self.build_stream_url(&model_id);
            let parsed_url = Url::parse(&url).map_err(|e| {
                BedrockError::Configuration(crate::error::ConfigurationError::InvalidConfiguration {
                    field: "url".to_string(),
                    message: format!("Invalid URL: {}", e),
                })
            })?;

            let mut headers = HashMap::new();
            headers.insert("content-type".to_string(), "application/json".to_string());
            headers.insert("accept".to_string(), "application/vnd.amazon.eventstream".to_string());

            let signed = self.runtime_signer.sign("POST", &parsed_url, &headers, Some(&body)).await?;

            let mut request_builder = self.http_client.post(signed.url.as_str());
            for (name, value) in signed.headers {
                request_builder = request_builder.header(&name, &value);
            }
            if let Some(body) = signed.body {
                request_builder = request_builder.body(body);
            }

            let response = request_builder.send().await.map_err(|e| {
                BedrockError::Network(NetworkError::ConnectionFailed {
                    message: e.to_string(),
                })
            })?;

            if !response.status().is_success() {
                let error = self.parse_error_response(response, Some(&model_id)).await;
                Err(error)?;
            }

            // Parse event stream
            let mut parser = EventStreamParser::new();
            let mut stream = response.bytes_stream();
            let mut stream_state = match family {
                ModelFamily::Claude => StreamState::Claude(crate::services::claude::ClaudeStreamState::new()),
                ModelFamily::Llama => StreamState::Llama(crate::services::llama::LlamaStreamState::new()),
                ModelFamily::Titan => StreamState::Titan,
            };

            use futures::StreamExt;
            while let Some(chunk_result) = stream.next().await {
                let chunk = chunk_result.map_err(|e| {
                    BedrockError::Stream(crate::error::StreamError::StreamInterrupted {
                        chunks_received: 0,
                        message: e.to_string(),
                        request_id: None,
                    })
                })?;

                parser.feed(&chunk);

                // Process all available messages
                loop {
                    match parser.next_message()? {
                        Some(msg) => {
                            // Check for exception
                            if msg.is_exception() {
                                let error_msg = msg.payload_str().unwrap_or("Unknown error");
                                Err(BedrockError::Stream(crate::error::StreamError::ModelError {
                                    message: error_msg.to_string(),
                                    request_id: None,
                                }))?;
                            }

                            // Parse the chunk payload
                            if let Ok(payload_str) = msg.payload_str() {
                                if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload_str) {
                                    if let Some(unified_chunk) = process_stream_chunk(&mut stream_state, &json, family)? {
                                        yield unified_chunk;
                                    }
                                }
                            }
                        }
                        None => break,
                    }
                }
            }
        })
    }

    #[instrument(skip(self, request), fields(model_id = %model_id))]
    async fn embed(&self, request: TitanEmbedRequest, model_id: &str) -> Result<TitanEmbedResponse, BedrockError> {
        // Validate request
        crate::services::titan::validate_embed_request(&request)?;

        let body = serde_json::to_vec(&request).map_err(|e| {
            BedrockError::Request(crate::error::RequestError::Validation {
                message: format!("Failed to serialize embed request: {}", e),
                request_id: None,
            })
        })?;

        debug!(
            model_id = %model_id,
            text_length = request.input_text.len(),
            "Generating embeddings"
        );

        let url = self.build_embed_url(model_id);
        let response = self.execute_request("POST", &url, Some(&body), &self.runtime_signer).await?;

        if !response.status().is_success() {
            return Err(self.parse_error_response(response, Some(model_id)).await);
        }

        let response_body = response.bytes().await.map_err(|e| {
            BedrockError::Network(NetworkError::ConnectionFailed {
                message: format!("Failed to read response: {}", e),
            })
        })?;

        let json: serde_json::Value = serde_json::from_slice(&response_body).map_err(|e| {
            BedrockError::Stream(crate::error::StreamError::ParseError {
                message: format!("Failed to parse embed response: {}", e),
            })
        })?;

        crate::services::titan::parse_embed_response(&json)
    }

    #[instrument(skip(self))]
    async fn list_models(&self, request: ListModelsRequest) -> Result<ListModelsResponse, BedrockError> {
        let params = crate::services::models::build_list_query_params(&request);
        let url = self.build_list_models_url(&params);

        debug!("Listing foundation models");

        let response = self.execute_request("GET", &url, None, &self.api_signer).await?;

        if !response.status().is_success() {
            return Err(self.parse_error_response(response, None).await);
        }

        let response_body = response.bytes().await.map_err(|e| {
            BedrockError::Network(NetworkError::ConnectionFailed {
                message: format!("Failed to read response: {}", e),
            })
        })?;

        serde_json::from_slice(&response_body).map_err(|e| {
            BedrockError::Stream(crate::error::StreamError::ParseError {
                message: format!("Failed to parse list models response: {}", e),
            })
        })
    }

    #[instrument(skip(self), fields(model_id = %model_id))]
    async fn get_model(&self, model_id: &str) -> Result<GetModelResponse, BedrockError> {
        let url = self.build_get_model_url(model_id);

        debug!(model_id = %model_id, "Getting model details");

        let response = self.execute_request("GET", &url, None, &self.api_signer).await?;

        if !response.status().is_success() {
            return Err(self.parse_error_response(response, Some(model_id)).await);
        }

        let response_body = response.bytes().await.map_err(|e| {
            BedrockError::Network(NetworkError::ConnectionFailed {
                message: format!("Failed to read response: {}", e),
            })
        })?;

        serde_json::from_slice(&response_body).map_err(|e| {
            BedrockError::Stream(crate::error::StreamError::ParseError {
                message: format!("Failed to parse get model response: {}", e),
            })
        })
    }
}

/// Stream state for different model families.
enum StreamState {
    Titan,
    Claude(crate::services::claude::ClaudeStreamState),
    Llama(crate::services::llama::LlamaStreamState),
}

/// Process a streaming chunk based on model family.
fn process_stream_chunk(
    state: &mut StreamState,
    json: &serde_json::Value,
    family: ModelFamily,
) -> Result<Option<UnifiedStreamChunk>, BedrockError> {
    match (state, family) {
        (StreamState::Titan, ModelFamily::Titan) => {
            let chunk = crate::services::titan::parse_stream_chunk(json)?;
            Ok(Some(crate::services::titan::translate_stream_chunk(chunk)))
        }
        (StreamState::Claude(ref mut s), ModelFamily::Claude) => {
            let event = crate::services::claude::parse_stream_event(json)?;
            Ok(s.process_event(event))
        }
        (StreamState::Llama(ref mut s), ModelFamily::Llama) => {
            let chunk = crate::services::llama::parse_stream_chunk(json)?;
            Ok(Some(s.process_chunk(chunk)))
        }
        _ => Ok(None),
    }
}

/// Client builder.
pub struct BedrockClientBuilder {
    config: Option<BedrockConfig>,
    credentials_provider: Option<Arc<dyn CredentialsProvider>>,
}

impl BedrockClientBuilder {
    /// Create a new builder.
    pub fn new() -> Self {
        Self {
            config: None,
            credentials_provider: None,
        }
    }

    /// Set configuration.
    pub fn config(mut self, config: BedrockConfig) -> Self {
        self.config = Some(config);
        self
    }

    /// Set credentials provider.
    pub fn credentials_provider(mut self, provider: Arc<dyn CredentialsProvider>) -> Self {
        self.credentials_provider = Some(provider);
        self
    }

    /// Set static credentials.
    pub fn credentials(mut self, credentials: AwsCredentials) -> Self {
        self.credentials_provider = Some(Arc::new(StaticCredentialsProvider::new(credentials)));
        self
    }

    /// Build from environment variables.
    pub fn from_env(mut self) -> Self {
        if self.config.is_none() {
            if let Ok(config) = BedrockConfig::builder().from_env().build() {
                self.config = Some(config);
            }
        }
        if self.credentials_provider.is_none() {
            self.credentials_provider = Some(Arc::new(ChainCredentialsProvider::new()));
        }
        self
    }

    /// Build the client.
    pub fn build(self) -> Result<BedrockClientImpl, BedrockError> {
        let config = self.config.ok_or_else(|| {
            BedrockError::Configuration(crate::error::ConfigurationError::MissingRegion)
        })?;

        let credentials_provider = self.credentials_provider.ok_or_else(|| {
            BedrockError::Configuration(crate::error::ConfigurationError::MissingCredentials)
        })?;

        BedrockClientImpl::new(config, credentials_provider)
    }
}

impl Default for BedrockClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for BedrockClientImpl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BedrockClientImpl")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_invoke_url() {
        let config = BedrockConfig::builder()
            .region("us-east-1")
            .build()
            .unwrap();
        let provider = Arc::new(StaticCredentialsProvider::new(
            AwsCredentials::new("AKID", "SECRET"),
        ));
        let client = BedrockClientImpl::new(config, provider).unwrap();

        let url = client.build_invoke_url("amazon.titan-text-express-v1");
        assert!(url.contains("bedrock-runtime.us-east-1.amazonaws.com"));
        assert!(url.contains("/model/amazon.titan-text-express-v1/invoke"));
    }

    #[test]
    fn test_build_stream_url() {
        let config = BedrockConfig::builder()
            .region("us-west-2")
            .build()
            .unwrap();
        let provider = Arc::new(StaticCredentialsProvider::new(
            AwsCredentials::new("AKID", "SECRET"),
        ));
        let client = BedrockClientImpl::new(config, provider).unwrap();

        let url = client.build_stream_url("anthropic.claude-3-sonnet-v1");
        assert!(url.contains("bedrock-runtime.us-west-2.amazonaws.com"));
        assert!(url.contains("/invoke-with-response-stream"));
    }

    #[test]
    fn test_builder() {
        let config = BedrockConfig::builder()
            .region("us-east-1")
            .build()
            .unwrap();

        let result = BedrockClientBuilder::new()
            .config(config)
            .credentials(AwsCredentials::new("AKID", "SECRET"))
            .build();

        assert!(result.is_ok());
    }
}
