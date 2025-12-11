//! HTTP transport implementations.

use crate::errors::{CohereError, CohereResult};
use async_trait::async_trait;
use bytes::Bytes;
use futures::stream::Stream;
use http::{HeaderMap, Method, StatusCode};
use reqwest::Client;
use std::pin::Pin;
use std::time::Duration;
use url::Url;

/// Response from HTTP transport
#[derive(Debug)]
pub struct TransportResponse {
    /// HTTP status code
    pub status: u16,
    /// Response headers
    pub headers: HeaderMap,
    /// Response body
    pub body: Bytes,
}

/// HTTP transport trait for making requests to the Cohere API.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send a regular HTTP request
    async fn send(
        &self,
        method: Method,
        url: Url,
        headers: HeaderMap,
        body: Option<Bytes>,
    ) -> CohereResult<TransportResponse>;

    /// Send a streaming HTTP request (returns SSE stream)
    async fn send_streaming(
        &self,
        method: Method,
        url: Url,
        headers: HeaderMap,
        body: Option<Bytes>,
    ) -> CohereResult<Pin<Box<dyn Stream<Item = CohereResult<Bytes>> + Send>>>;

    /// Execute a request and return the response
    async fn execute(
        &self,
        method: Method,
        url: String,
        headers: HeaderMap,
        body: Option<Vec<u8>>,
    ) -> CohereResult<TransportResponse> {
        let parsed_url = Url::parse(&url)?;
        let body_bytes = body.map(Bytes::from);
        self.send(method, parsed_url, headers, body_bytes).await
    }

    /// Execute a streaming request
    async fn execute_stream(
        &self,
        method: Method,
        url: String,
        headers: HeaderMap,
        body: Option<Vec<u8>>,
    ) -> CohereResult<Pin<Box<dyn Stream<Item = CohereResult<Bytes>> + Send>>> {
        let parsed_url = Url::parse(&url)?;
        let body_bytes = body.map(Bytes::from);
        self.send_streaming(method, parsed_url, headers, body_bytes)
            .await
    }
}

/// Reqwest-based HTTP transport implementation
pub struct ReqwestTransport {
    client: Client,
    timeout: Duration,
}

impl ReqwestTransport {
    /// Create a new reqwest transport
    pub fn new(timeout: Duration) -> CohereResult<Self> {
        let client = Client::builder()
            .timeout(timeout)
            .pool_max_idle_per_host(10)
            .tcp_keepalive(Duration::from_secs(60))
            .build()
            .map_err(|e| CohereError::Configuration {
                message: format!("Failed to create HTTP client: {}", e),
            })?;

        Ok(Self { client, timeout })
    }

    /// Create a new reqwest transport with custom client
    pub fn with_client(client: Client, timeout: Duration) -> Self {
        Self { client, timeout }
    }

    /// Convert HTTP method to reqwest method
    fn to_reqwest_method(&self, method: Method) -> reqwest::Method {
        match method {
            Method::GET => reqwest::Method::GET,
            Method::POST => reqwest::Method::POST,
            Method::PUT => reqwest::Method::PUT,
            Method::DELETE => reqwest::Method::DELETE,
            Method::PATCH => reqwest::Method::PATCH,
            Method::HEAD => reqwest::Method::HEAD,
            Method::OPTIONS => reqwest::Method::OPTIONS,
            _ => reqwest::Method::GET,
        }
    }

    /// Convert HeaderMap to reqwest HeaderMap
    fn to_reqwest_headers(&self, headers: HeaderMap) -> reqwest::header::HeaderMap {
        let mut reqwest_headers = reqwest::header::HeaderMap::new();
        for (name, value) in headers.iter() {
            if let Ok(header_name) =
                reqwest::header::HeaderName::from_bytes(name.as_str().as_bytes())
            {
                if let Ok(header_value) = reqwest::header::HeaderValue::from_bytes(value.as_bytes())
                {
                    reqwest_headers.insert(header_name, header_value);
                }
            }
        }
        reqwest_headers
    }

    /// Convert reqwest headers back to http HeaderMap
    fn from_reqwest_headers(&self, headers: &reqwest::header::HeaderMap) -> HeaderMap {
        let mut http_headers = HeaderMap::new();
        for (name, value) in headers.iter() {
            if let Ok(header_name) = http::header::HeaderName::from_bytes(name.as_str().as_bytes())
            {
                if let Ok(header_value) = http::header::HeaderValue::from_bytes(value.as_bytes()) {
                    http_headers.insert(header_name, header_value);
                }
            }
        }
        http_headers
    }

    /// Map HTTP error status to CohereError
    fn map_http_error(&self, status: reqwest::StatusCode, body: &Bytes) -> CohereError {
        let body_str = String::from_utf8_lossy(body);

        // Try to parse as JSON error response
        if let Ok(error_response) =
            serde_json::from_slice::<crate::errors::categories::ApiErrorResponse>(body)
        {
            return CohereError::Api {
                status: status.as_u16(),
                message: error_response.message,
                code: error_response.code,
            };
        }

        match status.as_u16() {
            401 => CohereError::Authentication {
                message: format!("Authentication failed: {}", body_str),
            },
            403 => CohereError::Authentication {
                message: format!("Access forbidden: {}", body_str),
            },
            429 => {
                CohereError::RateLimit {
                    message: format!("Rate limit exceeded: {}", body_str),
                    retry_after: None, // Could parse from headers
                }
            }
            404 => CohereError::NotFound {
                message: body_str.to_string(),
                resource_type: "resource".to_string(),
            },
            400 => CohereError::Validation {
                message: format!("Validation error: {}", body_str),
                details: vec![],
            },
            422 => CohereError::Validation {
                message: format!("Unprocessable entity: {}", body_str),
                details: vec![],
            },
            500..=599 => CohereError::Server {
                message: format!("Server error: {}", body_str),
                status_code: Some(status.as_u16()),
            },
            _ => CohereError::Api {
                status: status.as_u16(),
                message: body_str.to_string(),
                code: None,
            },
        }
    }

    /// Parse retry-after header from response
    fn parse_retry_after(
        &self,
        headers: &reqwest::header::HeaderMap,
    ) -> Option<std::time::Duration> {
        headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .map(std::time::Duration::from_secs)
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
    ) -> CohereResult<TransportResponse> {
        let reqwest_method = self.to_reqwest_method(method);
        let reqwest_headers = self.to_reqwest_headers(headers);

        let mut request = self
            .client
            .request(reqwest_method, url.as_str())
            .headers(reqwest_headers);

        if let Some(body_data) = body {
            request = request.body(body_data.to_vec());
        }

        let response = request.send().await?;

        let status = response.status();
        let response_headers = self.from_reqwest_headers(response.headers());
        let body_bytes = response.bytes().await?;

        // Check for HTTP errors
        if !status.is_success() {
            return Err(self.map_http_error(status, &body_bytes));
        }

        Ok(TransportResponse {
            status: status.as_u16(),
            headers: response_headers,
            body: body_bytes,
        })
    }

    async fn send_streaming(
        &self,
        method: Method,
        url: Url,
        headers: HeaderMap,
        body: Option<Bytes>,
    ) -> CohereResult<Pin<Box<dyn Stream<Item = CohereResult<Bytes>> + Send>>> {
        let reqwest_method = self.to_reqwest_method(method);
        let reqwest_headers = self.to_reqwest_headers(headers);

        let mut request = self
            .client
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
                    Err(CohereError::StreamError {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_reqwest_transport_creation() {
        let transport = ReqwestTransport::new(Duration::from_secs(30));
        assert!(transport.is_ok());
    }

    #[test]
    fn test_method_conversion() {
        let transport = ReqwestTransport::new(Duration::from_secs(30)).unwrap();

        assert_eq!(
            transport.to_reqwest_method(Method::GET),
            reqwest::Method::GET
        );
        assert_eq!(
            transport.to_reqwest_method(Method::POST),
            reqwest::Method::POST
        );
        assert_eq!(
            transport.to_reqwest_method(Method::PUT),
            reqwest::Method::PUT
        );
        assert_eq!(
            transport.to_reqwest_method(Method::DELETE),
            reqwest::Method::DELETE
        );
    }

    #[test]
    fn test_header_conversion() {
        let transport = ReqwestTransport::new(Duration::from_secs(30)).unwrap();

        let mut headers = HeaderMap::new();
        headers.insert("content-type", "application/json".parse().unwrap());
        headers.insert("x-custom-header", "custom-value".parse().unwrap());

        let reqwest_headers = transport.to_reqwest_headers(headers);

        assert_eq!(
            reqwest_headers.get("content-type").unwrap(),
            "application/json"
        );
        assert_eq!(
            reqwest_headers.get("x-custom-header").unwrap(),
            "custom-value"
        );
    }
}
