//! Reqwest-based HTTP transport implementation.

use super::http::{HttpTransport, HttpRequest, HttpResponse, HttpMethod, ChunkedStream};
use super::error::TransportError;
use async_trait::async_trait;
use bytes::Bytes;
use reqwest::Client;
use std::collections::HashMap;
use std::time::Duration;
use futures::StreamExt;

/// Reqwest-based HTTP transport.
pub struct ReqwestTransport {
    client: Client,
}

impl ReqwestTransport {
    /// Create a new reqwest transport with the given timeout.
    pub fn new(timeout: Duration, connect_timeout: Duration) -> Result<Self, TransportError> {
        let client = Client::builder()
            .timeout(timeout)
            .connect_timeout(connect_timeout)
            .build()
            .map_err(|e| TransportError::Connection(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { client })
    }

    /// Convert HttpMethod to reqwest::Method.
    fn convert_method(&self, method: HttpMethod) -> reqwest::Method {
        match method {
            HttpMethod::Get => reqwest::Method::GET,
            HttpMethod::Post => reqwest::Method::POST,
            HttpMethod::Put => reqwest::Method::PUT,
            HttpMethod::Patch => reqwest::Method::PATCH,
            HttpMethod::Delete => reqwest::Method::DELETE,
        }
    }

    /// Convert headers HashMap to reqwest::header::HeaderMap.
    fn convert_headers(&self, headers: HashMap<String, String>) -> reqwest::header::HeaderMap {
        let mut header_map = reqwest::header::HeaderMap::new();
        for (key, value) in headers {
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(key.as_bytes()),
                reqwest::header::HeaderValue::from_str(&value),
            ) {
                header_map.insert(name, val);
            }
        }
        header_map
    }

    /// Convert reqwest::header::HeaderMap to HashMap.
    fn extract_headers(&self, headers: &reqwest::header::HeaderMap) -> HashMap<String, String> {
        headers
            .iter()
            .filter_map(|(name, value)| {
                value.to_str().ok().map(|v| (name.to_string(), v.to_string()))
            })
            .collect()
    }
}

#[async_trait]
impl HttpTransport for ReqwestTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        let method = self.convert_method(request.method);
        let headers = self.convert_headers(request.headers);

        let mut req_builder = self.client
            .request(method, &request.url)
            .headers(headers);

        if let Some(body) = request.body {
            req_builder = req_builder.body(body.to_vec());
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    TransportError::Timeout
                } else {
                    TransportError::Connection(e.to_string())
                }
            })?;

        let status = response.status().as_u16();
        let response_headers = self.extract_headers(response.headers());
        let body = response.bytes().await
            .map_err(|e| TransportError::Request(format!("Failed to read response body: {}", e)))?;

        Ok(HttpResponse {
            status,
            headers: response_headers,
            body,
        })
    }

    async fn send_streaming(&self, request: HttpRequest) -> Result<ChunkedStream, TransportError> {
        let method = self.convert_method(request.method);
        let headers = self.convert_headers(request.headers);

        let mut req_builder = self.client
            .request(method, &request.url)
            .headers(headers);

        if let Some(body) = request.body {
            req_builder = req_builder.body(body.to_vec());
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    TransportError::Timeout
                } else {
                    TransportError::Connection(e.to_string())
                }
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.bytes().await
                .map_err(|e| TransportError::Request(format!("Failed to read error response: {}", e)))?;
            return Err(TransportError::Request(
                format!("HTTP error {}: {}", status.as_u16(), String::from_utf8_lossy(&body))
            ));
        }

        let stream = response.bytes_stream();
        let mapped_stream = Box::pin(stream.map(|result| {
            result.map_err(|e| TransportError::Request(format!("Stream error: {}", e)))
        }));

        Ok(mapped_stream)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reqwest_transport_creation() {
        let transport = ReqwestTransport::new(
            Duration::from_secs(30),
            Duration::from_secs(10),
        );
        assert!(transport.is_ok());
    }
}
