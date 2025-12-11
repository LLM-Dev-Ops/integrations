//! HTTP transport layer for S3 requests.
//!
//! This module provides the HTTP transport abstraction for making S3 API calls.
//! It handles connection pooling, timeouts, and TLS configuration.

use crate::error::{NetworkError, S3Error};
use async_trait::async_trait;
use bytes::Bytes;
use std::collections::HashMap;
use std::time::Duration;

/// HTTP request to be sent.
#[derive(Debug, Clone)]
pub struct HttpRequest {
    /// HTTP method.
    pub method: String,
    /// Request URL.
    pub url: String,
    /// Request headers.
    pub headers: HashMap<String, String>,
    /// Request body.
    pub body: Option<Bytes>,
}

impl HttpRequest {
    /// Create a new HTTP request.
    pub fn new(method: impl Into<String>, url: impl Into<String>) -> Self {
        Self {
            method: method.into(),
            url: url.into(),
            headers: HashMap::new(),
            body: None,
        }
    }

    /// Set the request body.
    pub fn with_body(mut self, body: impl Into<Bytes>) -> Self {
        self.body = Some(body.into());
        self
    }

    /// Add a header.
    pub fn with_header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(name.into(), value.into());
        self
    }

    /// Add multiple headers.
    pub fn with_headers(mut self, headers: HashMap<String, String>) -> Self {
        self.headers.extend(headers);
        self
    }
}

/// HTTP response received.
#[derive(Debug)]
pub struct HttpResponse {
    /// HTTP status code.
    pub status: u16,
    /// Response headers.
    pub headers: HashMap<String, String>,
    /// Response body.
    pub body: Bytes,
}

impl HttpResponse {
    /// Check if the response indicates success (2xx status).
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }

    /// Check if the response indicates a client error (4xx status).
    pub fn is_client_error(&self) -> bool {
        (400..500).contains(&self.status)
    }

    /// Check if the response indicates a server error (5xx status).
    pub fn is_server_error(&self) -> bool {
        (500..600).contains(&self.status)
    }

    /// Get a header value by name (case-insensitive).
    pub fn get_header(&self, name: &str) -> Option<&str> {
        let name_lower = name.to_lowercase();
        self.headers
            .iter()
            .find(|(k, _)| k.to_lowercase() == name_lower)
            .map(|(_, v)| v.as_str())
    }

    /// Get the AWS request ID from response headers.
    pub fn request_id(&self) -> Option<&str> {
        self.get_header("x-amz-request-id")
    }

    /// Get the content length.
    pub fn content_length(&self) -> Option<u64> {
        self.get_header("content-length")
            .and_then(|v| v.parse().ok())
    }

    /// Get the content type.
    pub fn content_type(&self) -> Option<&str> {
        self.get_header("content-type")
    }

    /// Get the ETag.
    pub fn etag(&self) -> Option<&str> {
        self.get_header("etag")
    }
}

/// HTTP transport trait for making requests.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and return the response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, S3Error>;

    /// Send a request with streaming body.
    async fn send_streaming(
        &self,
        request: HttpRequest,
        body_stream: Box<dyn futures::Stream<Item = Result<Bytes, std::io::Error>> + Send + Unpin>,
    ) -> Result<HttpResponse, S3Error>;
}

/// Default HTTP transport using reqwest.
pub struct ReqwestTransport {
    client: reqwest::Client,
}

impl ReqwestTransport {
    /// Create a new transport with default settings.
    pub fn new() -> Result<Self, S3Error> {
        Self::builder().build()
    }

    /// Create a transport builder.
    pub fn builder() -> ReqwestTransportBuilder {
        ReqwestTransportBuilder::new()
    }
}

impl Default for ReqwestTransport {
    fn default() -> Self {
        Self::new().expect("Failed to create default transport")
    }
}

#[async_trait]
impl HttpTransport for ReqwestTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, S3Error> {
        let method = request.method.parse::<reqwest::Method>().map_err(|e| {
            S3Error::Network(NetworkError::ConnectionFailed {
                message: format!("Invalid HTTP method: {}", e),
            })
        })?;

        let mut req_builder = self.client.request(method, &request.url);

        // Add headers
        for (name, value) in &request.headers {
            req_builder = req_builder.header(name, value);
        }

        // Add body
        if let Some(body) = request.body {
            req_builder = req_builder.body(body);
        }

        let response = req_builder.send().await.map_err(|e| {
            if e.is_timeout() {
                S3Error::Network(NetworkError::Timeout {
                    duration: Duration::from_secs(30),
                })
            } else if e.is_connect() {
                S3Error::Network(NetworkError::ConnectionFailed {
                    message: e.to_string(),
                })
            } else {
                S3Error::Network(NetworkError::ConnectionFailed {
                    message: e.to_string(),
                })
            }
        })?;

        let status = response.status().as_u16();
        let headers: HashMap<String, String> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let body = response.bytes().await.map_err(|e| {
            S3Error::Network(NetworkError::ConnectionFailed {
                message: format!("Failed to read response body: {}", e),
            })
        })?;

        Ok(HttpResponse {
            status,
            headers,
            body,
        })
    }

    async fn send_streaming(
        &self,
        request: HttpRequest,
        body_stream: Box<dyn futures::Stream<Item = Result<Bytes, std::io::Error>> + Send + Unpin>,
    ) -> Result<HttpResponse, S3Error> {
        let method = request.method.parse::<reqwest::Method>().map_err(|e| {
            S3Error::Network(NetworkError::ConnectionFailed {
                message: format!("Invalid HTTP method: {}", e),
            })
        })?;

        let mut req_builder = self.client.request(method, &request.url);

        // Add headers
        for (name, value) in &request.headers {
            req_builder = req_builder.header(name, value);
        }

        // Convert the stream to reqwest body
        let body = reqwest::Body::wrap_stream(body_stream);
        req_builder = req_builder.body(body);

        let response = req_builder.send().await.map_err(|e| {
            S3Error::Network(NetworkError::ConnectionFailed {
                message: e.to_string(),
            })
        })?;

        let status = response.status().as_u16();
        let headers: HashMap<String, String> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let body = response.bytes().await.map_err(|e| {
            S3Error::Network(NetworkError::ConnectionFailed {
                message: format!("Failed to read response body: {}", e),
            })
        })?;

        Ok(HttpResponse {
            status,
            headers,
            body,
        })
    }
}

impl std::fmt::Debug for ReqwestTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ReqwestTransport").finish_non_exhaustive()
    }
}

/// Builder for reqwest transport.
pub struct ReqwestTransportBuilder {
    connect_timeout: Duration,
    read_timeout: Duration,
    pool_max_idle_per_host: usize,
    pool_idle_timeout: Option<Duration>,
    verify_ssl: bool,
    user_agent: String,
}

impl ReqwestTransportBuilder {
    /// Create a new builder with default settings.
    pub fn new() -> Self {
        Self {
            connect_timeout: Duration::from_secs(5),
            read_timeout: Duration::from_secs(30),
            pool_max_idle_per_host: 100,
            pool_idle_timeout: Some(Duration::from_secs(90)),
            verify_ssl: true,
            user_agent: format!("aws-s3-integration/{}", env!("CARGO_PKG_VERSION")),
        }
    }

    /// Set the connection timeout.
    pub fn connect_timeout(mut self, timeout: Duration) -> Self {
        self.connect_timeout = timeout;
        self
    }

    /// Set the read timeout.
    pub fn read_timeout(mut self, timeout: Duration) -> Self {
        self.read_timeout = timeout;
        self
    }

    /// Set the maximum idle connections per host.
    pub fn pool_max_idle_per_host(mut self, max: usize) -> Self {
        self.pool_max_idle_per_host = max;
        self
    }

    /// Set the idle connection timeout.
    pub fn pool_idle_timeout(mut self, timeout: Option<Duration>) -> Self {
        self.pool_idle_timeout = timeout;
        self
    }

    /// Set whether to verify SSL certificates.
    pub fn verify_ssl(mut self, verify: bool) -> Self {
        self.verify_ssl = verify;
        self
    }

    /// Set the User-Agent header.
    pub fn user_agent(mut self, user_agent: impl Into<String>) -> Self {
        self.user_agent = user_agent.into();
        self
    }

    /// Build the transport.
    pub fn build(self) -> Result<ReqwestTransport, S3Error> {
        let client = reqwest::Client::builder()
            .connect_timeout(self.connect_timeout)
            .timeout(self.read_timeout)
            .pool_max_idle_per_host(self.pool_max_idle_per_host)
            .pool_idle_timeout(self.pool_idle_timeout)
            .danger_accept_invalid_certs(!self.verify_ssl)
            .user_agent(&self.user_agent)
            .build()
            .map_err(|e| {
                S3Error::Network(NetworkError::TlsError {
                    message: e.to_string(),
                })
            })?;

        Ok(ReqwestTransport { client })
    }
}

impl Default for ReqwestTransportBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_http_request_builder() {
        let request = HttpRequest::new("GET", "https://example.com")
            .with_header("Content-Type", "application/json")
            .with_body(b"test body");

        assert_eq!(request.method, "GET");
        assert_eq!(request.url, "https://example.com");
        assert_eq!(
            request.headers.get("Content-Type"),
            Some(&"application/json".to_string())
        );
        assert!(request.body.is_some());
    }

    #[test]
    fn test_http_response_status_checks() {
        let success = HttpResponse {
            status: 200,
            headers: HashMap::new(),
            body: Bytes::new(),
        };
        assert!(success.is_success());
        assert!(!success.is_client_error());
        assert!(!success.is_server_error());

        let client_error = HttpResponse {
            status: 404,
            headers: HashMap::new(),
            body: Bytes::new(),
        };
        assert!(!client_error.is_success());
        assert!(client_error.is_client_error());

        let server_error = HttpResponse {
            status: 500,
            headers: HashMap::new(),
            body: Bytes::new(),
        };
        assert!(server_error.is_server_error());
    }

    #[test]
    fn test_http_response_headers() {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/xml".to_string());
        headers.insert("x-amz-request-id".to_string(), "ABC123".to_string());
        headers.insert("ETag".to_string(), "\"abc123\"".to_string());
        headers.insert("Content-Length".to_string(), "1024".to_string());

        let response = HttpResponse {
            status: 200,
            headers,
            body: Bytes::new(),
        };

        assert_eq!(response.get_header("Content-Type"), Some("application/xml"));
        assert_eq!(response.get_header("content-type"), Some("application/xml")); // case insensitive
        assert_eq!(response.request_id(), Some("ABC123"));
        assert_eq!(response.etag(), Some("\"abc123\""));
        assert_eq!(response.content_length(), Some(1024));
        assert_eq!(response.content_type(), Some("application/xml"));
    }

    #[test]
    fn test_transport_builder() {
        let transport = ReqwestTransport::builder()
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(60))
            .pool_max_idle_per_host(50)
            .verify_ssl(true)
            .build();

        assert!(transport.is_ok());
    }
}
