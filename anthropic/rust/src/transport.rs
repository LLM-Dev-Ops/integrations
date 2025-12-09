//! HTTP transport layer

use crate::error::AnthropicError;
use async_trait::async_trait;
use bytes::Bytes;
use futures::Stream;
use http::HeaderMap;
use reqwest::Client;
use std::time::Duration;

/// HTTP transport abstraction for testability
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Execute an HTTP request
    async fn execute(
        &self,
        method: http::Method,
        url: String,
        headers: HeaderMap,
        body: Option<Vec<u8>>,
    ) -> Result<HttpResponse, AnthropicError>;

    /// Execute a streaming HTTP request
    async fn execute_stream(
        &self,
        method: http::Method,
        url: String,
        headers: HeaderMap,
        body: Option<Vec<u8>>,
    ) -> Result<Box<dyn Stream<Item = Result<Bytes, AnthropicError>> + Send + Unpin>, AnthropicError>;
}

/// HTTP response
pub struct HttpResponse {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

/// Reqwest-based HTTP transport implementation
pub struct ReqwestHttpTransport {
    client: Client,
    timeout: Duration,
    max_retries: u32,
}

impl ReqwestHttpTransport {
    pub fn new(timeout: Duration, max_retries: u32) -> Result<Self, AnthropicError> {
        let client = Client::builder()
            .timeout(timeout)
            .pool_max_idle_per_host(20)
            .build()
            .map_err(|e| AnthropicError::Configuration(format!("Failed to build HTTP client: {}", e)))?;

        Ok(Self {
            client,
            timeout,
            max_retries,
        })
    }
}

#[async_trait]
impl HttpTransport for ReqwestHttpTransport {
    async fn execute(
        &self,
        method: http::Method,
        url: String,
        headers: HeaderMap,
        body: Option<Vec<u8>>,
    ) -> Result<HttpResponse, AnthropicError> {
        let mut request = self.client.request(
            method.as_str().parse().unwrap(),
            &url,
        );

        // Add headers
        for (name, value) in headers.iter() {
            request = request.header(name.as_str(), value);
        }

        // Add body if present
        if let Some(body_data) = body {
            request = request.body(body_data);
        }

        // Execute request with retries
        let mut last_error = None;
        for attempt in 0..=self.max_retries {
            match request.try_clone()
                .ok_or_else(|| AnthropicError::Internal("Failed to clone request".to_string()))?
                .send()
                .await
            {
                Ok(response) => {
                    let status = response.status().as_u16();
                    let response_headers = response.headers().clone();
                    let body = response.bytes().await?;

                    return Ok(HttpResponse {
                        status,
                        headers: response_headers,
                        body: body.to_vec(),
                    });
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < self.max_retries {
                        tokio::time::sleep(Duration::from_millis(100 * 2_u64.pow(attempt))).await;
                    }
                }
            }
        }

        Err(AnthropicError::from(last_error.unwrap()))
    }

    async fn execute_stream(
        &self,
        method: http::Method,
        url: String,
        headers: HeaderMap,
        body: Option<Vec<u8>>,
    ) -> Result<Box<dyn Stream<Item = Result<Bytes, AnthropicError>> + Send + Unpin>, AnthropicError> {
        let mut request = self.client.request(
            method.as_str().parse().unwrap(),
            &url,
        );

        // Add headers
        for (name, value) in headers.iter() {
            request = request.header(name.as_str(), value);
        }

        // Add body if present
        if let Some(body_data) = body {
            request = request.body(body_data);
        }

        let response = request.send().await?;
        let status = response.status().as_u16();

        if status != 200 {
            let body = response.bytes().await?;
            return Err(AnthropicError::Api {
                status,
                message: String::from_utf8_lossy(&body).to_string(),
                error_type: "stream_error".to_string(),
            });
        }

        let stream = response.bytes_stream();
        let mapped_stream = futures::stream::StreamExt::map(stream, |result| {
            result.map_err(AnthropicError::from)
        });

        Ok(Box::new(Box::pin(mapped_stream)))
    }
}
