//! HTTP transport implementations.

use crate::errors::{AnthropicError, AnthropicResult};
use async_trait::async_trait;
use bytes::Bytes;
use futures::stream::Stream;
use http::{HeaderMap, Method, Request, Response, StatusCode};
use reqwest::Client;
use std::pin::Pin;
use std::time::Duration;
use url::Url;

/// HTTP transport trait for making requests to the Anthropic API.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send a regular HTTP request
    async fn send(
        &self,
        method: Method,
        url: Url,
        headers: HeaderMap,
        body: Option<Bytes>,
    ) -> AnthropicResult<Response<Bytes>>;

    /// Send a streaming HTTP request (returns SSE stream)
    async fn send_streaming(
        &self,
        method: Method,
        url: Url,
        headers: HeaderMap,
        body: Option<Bytes>,
    ) -> AnthropicResult<Pin<Box<dyn Stream<Item = AnthropicResult<Bytes>> + Send>>>;
}

/// Reqwest-based HTTP transport implementation
pub struct ReqwestTransport {
    client: Client,
    timeout: Duration,
}

impl ReqwestTransport {
    /// Create a new reqwest transport
    pub fn new(timeout: Duration) -> AnthropicResult<Self> {
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|e| AnthropicError::Configuration {
                message: format!("Failed to create HTTP client: {}", e),
            })?;

        Ok(Self { client, timeout })
    }

    /// Convert HTTP method to reqwest method
    fn to_reqwest_method(&self, method: Method) -> reqwest::Method {
        match method {
            Method::GET => reqwest::Method::GET,
            Method::POST => reqwest::Method::POST,
            Method::PUT => reqwest::Method::PUT,
            Method::DELETE => reqwest::Method::DELETE,
            Method::PATCH => reqwest::Method::PATCH,
            _ => reqwest::Method::GET,
        }
    }

    /// Convert HeaderMap to reqwest HeaderMap
    fn to_reqwest_headers(&self, headers: HeaderMap) -> reqwest::header::HeaderMap {
        let mut reqwest_headers = reqwest::header::HeaderMap::new();
        for (name, value) in headers.iter() {
            if let Ok(header_name) = reqwest::header::HeaderName::from_bytes(name.as_str().as_bytes()) {
                if let Ok(header_value) = reqwest::header::HeaderValue::from_bytes(value.as_bytes()) {
                    reqwest_headers.insert(header_name, header_value);
                }
            }
        }
        reqwest_headers
    }
}

#[async_trait]
impl HttpTransport for ReqwestTransport {
    async fn send(
        &self,
        method: Method,
        url: Url,
        headers: HeaderMap,
        body: Option<Bytes>,
    ) -> AnthropicResult<Response<Bytes>> {
        let reqwest_method = self.to_reqwest_method(method);
        let reqwest_headers = self.to_reqwest_headers(headers);

        let mut request = self.client
            .request(reqwest_method, url.as_str())
            .headers(reqwest_headers);

        if let Some(body_data) = body {
            request = request.body(body_data.to_vec());
        }

        let response = request.send().await?;

        let status = response.status();
        let response_headers = response.headers().clone();
        let body_bytes = response.bytes().await?;

        // Check for HTTP errors
        if !status.is_success() {
            return Err(self.map_http_error(status, &body_bytes));
        }

        // Convert to http::Response
        let mut http_response = Response::builder()
            .status(StatusCode::from_u16(status.as_u16()).unwrap());

        for (name, value) in response_headers.iter() {
            http_response = http_response.header(name.as_str(), value.as_bytes());
        }

        let response = http_response
            .body(Bytes::from(body_bytes))
            .map_err(|e| AnthropicError::Internal {
                message: format!("Failed to build response: {}", e),
            })?;

        Ok(response)
    }

    async fn send_streaming(
        &self,
        method: Method,
        url: Url,
        headers: HeaderMap,
        body: Option<Bytes>,
    ) -> AnthropicResult<Pin<Box<dyn Stream<Item = AnthropicResult<Bytes>> + Send>>> {
        let reqwest_method = self.to_reqwest_method(method);
        let reqwest_headers = self.to_reqwest_headers(headers);

        let mut request = self.client
            .request(reqwest_method, url.as_str())
            .headers(reqwest_headers);

        if let Some(body_data) = body {
            request = request.body(body_data.to_vec());
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.bytes().await?;
            return Err(self.map_http_error(status, &body));
        }

        let stream = response.bytes_stream();
        let mapped_stream = Box::pin(futures::stream::unfold(stream, |mut stream| async move {
            use futures::StreamExt;
            match stream.next().await {
                Some(Ok(bytes)) => Some((Ok(bytes), stream)),
                Some(Err(e)) => Some((
                    Err(AnthropicError::StreamError {
                        message: format!("Stream error: {}", e),
                    }),
                    stream,
                )),
                None => None,
            }
        }));

        Ok(mapped_stream)
    }
}

impl ReqwestTransport {
    fn map_http_error(&self, status: reqwest::StatusCode, body: &Bytes) -> AnthropicError {
        let body_str = String::from_utf8_lossy(body);

        match status.as_u16() {
            401 => AnthropicError::Authentication {
                message: format!("Authentication failed: {}", body_str),
            },
            429 => {
                // Try to parse retry-after header
                AnthropicError::RateLimit {
                    message: format!("Rate limit exceeded: {}", body_str),
                    retry_after: None, // Could parse from headers
                }
            }
            404 => AnthropicError::NotFound {
                message: body_str.to_string(),
                resource_type: "resource".to_string(),
            },
            400 => AnthropicError::Validation {
                message: format!("Validation error: {}", body_str),
                details: vec![],
            },
            500..=599 => AnthropicError::Server {
                message: format!("Server error: {}", body_str),
                status_code: Some(status.as_u16()),
            },
            _ => AnthropicError::Internal {
                message: format!("HTTP error {}: {}", status.as_u16(), body_str),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_reqwest_transport_creation() {
        let transport = ReqwestTransport::new(Duration::from_secs(30));
        assert!(transport.is_ok());
    }
}
