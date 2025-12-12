//! HTTP transport layer for Google Drive API.

use crate::errors::{GoogleDriveError, TransportError};
use async_trait::async_trait;
use bytes::Bytes;
use futures::stream::Stream;
use futures::StreamExt;
use pin_project::pin_project;
use reqwest::{header::HeaderMap, Client, Method, Response, StatusCode};
use std::pin::Pin;
use std::task::{Context, Poll};
use url::Url;

/// HTTP transport abstraction for testability.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send a request and receive raw bytes.
    async fn send_raw(&self, request: HttpRequest) -> Result<Bytes, TransportError>;

    /// Send a request and receive a streaming response.
    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<ByteStream, TransportError>;
}

/// HTTP request representation.
#[derive(Debug)]
pub struct HttpRequest {
    /// HTTP method.
    pub method: HttpMethod,
    /// Request URL.
    pub url: Url,
    /// Request headers.
    pub headers: HeaderMap,
    /// Request body.
    pub body: Option<RequestBody>,
    /// Request timeout.
    pub timeout: Option<std::time::Duration>,
}

/// HTTP method.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    /// GET method.
    Get,
    /// POST method.
    Post,
    /// PUT method.
    Put,
    /// PATCH method.
    Patch,
    /// DELETE method.
    Delete,
}

impl From<HttpMethod> for Method {
    fn from(method: HttpMethod) -> Self {
        match method {
            HttpMethod::Get => Method::GET,
            HttpMethod::Post => Method::POST,
            HttpMethod::Put => Method::PUT,
            HttpMethod::Patch => Method::PATCH,
            HttpMethod::Delete => Method::DELETE,
        }
    }
}

/// Request body variants.
pub enum RequestBody {
    /// Empty body.
    Empty,
    /// Fixed-size bytes.
    Bytes(Bytes),
    /// Streaming body.
    Stream(Pin<Box<dyn Stream<Item = Result<Bytes, GoogleDriveError>> + Send>>),
    /// Multipart body.
    Multipart(MultipartBody),
}

impl std::fmt::Debug for RequestBody {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RequestBody::Empty => write!(f, "Empty"),
            RequestBody::Bytes(bytes) => write!(f, "Bytes({} bytes)", bytes.len()),
            RequestBody::Stream(_) => write!(f, "Stream"),
            RequestBody::Multipart(_) => write!(f, "Multipart"),
        }
    }
}

/// Multipart body for file uploads.
pub struct MultipartBody {
    /// Metadata part (JSON).
    pub metadata: Bytes,
    /// Content part.
    pub content: Bytes,
    /// Content type.
    pub content_type: String,
    /// Boundary string.
    pub boundary: String,
}

impl MultipartBody {
    /// Creates a new multipart body.
    pub fn new(metadata: Bytes, content: Bytes, content_type: impl Into<String>) -> Self {
        Self {
            metadata,
            content,
            content_type: content_type.into(),
            boundary: Self::generate_boundary(),
        }
    }

    fn generate_boundary() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        format!("==============={}", timestamp)
    }

    /// Converts to bytes.
    pub fn to_bytes(&self) -> Bytes {
        let mut parts = Vec::new();

        // Metadata part
        parts.push(format!("--{}\r\n", self.boundary));
        parts.push("Content-Type: application/json; charset=UTF-8\r\n\r\n".to_string());
        parts.push(String::from_utf8_lossy(&self.metadata).to_string());
        parts.push("\r\n".to_string());

        // Content part
        parts.push(format!("--{}\r\n", self.boundary));
        parts.push(format!("Content-Type: {}\r\n\r\n", self.content_type));

        let mut result = parts.join("").into_bytes();
        result.extend_from_slice(&self.content);
        result.extend_from_slice(format!("\r\n--{}--", self.boundary).as_bytes());

        Bytes::from(result)
    }

    /// Gets the content type header value.
    pub fn content_type_header(&self) -> String {
        format!("multipart/related; boundary={}", self.boundary)
    }
}

/// HTTP response representation.
pub struct HttpResponse {
    /// Response status code.
    pub status: StatusCode,
    /// Response headers.
    pub headers: HeaderMap,
    /// Response body.
    pub body: Bytes,
}

impl HttpResponse {
    /// Creates a new HTTP response.
    pub fn new(status: StatusCode, headers: HeaderMap, body: Bytes) -> Self {
        Self {
            status,
            headers,
            body,
        }
    }
}

/// Byte stream for streaming responses.
#[pin_project]
pub struct ByteStream {
    #[pin]
    inner: Pin<Box<dyn Stream<Item = Result<Bytes, TransportError>> + Send>>,
}

impl ByteStream {
    /// Creates a new byte stream.
    pub fn new<S>(stream: S) -> Self
    where
        S: Stream<Item = Result<Bytes, TransportError>> + Send + 'static,
    {
        Self {
            inner: Box::pin(stream),
        }
    }
}

impl Stream for ByteStream {
    type Item = Result<Bytes, TransportError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.project();
        this.inner.poll_next(cx)
    }
}

/// Reqwest-based HTTP transport implementation.
pub struct ReqwestTransport {
    client: Client,
}

impl ReqwestTransport {
    /// Creates a new reqwest transport.
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    /// Creates a new reqwest transport with default client.
    pub fn default() -> Result<Self, TransportError> {
        let client = Client::builder()
            .build()
            .map_err(|e| TransportError::Http(format!("Failed to create client: {}", e)))?;
        Ok(Self { client })
    }
}

#[async_trait]
impl HttpTransport for ReqwestTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        let method: Method = request.method.into();
        let mut req = self.client.request(method, request.url.clone());

        // Add headers
        for (key, value) in request.headers.iter() {
            req = req.header(key, value);
        }

        // Add timeout
        if let Some(timeout) = request.timeout {
            req = req.timeout(timeout);
        }

        // Add body
        if let Some(body) = request.body {
            match body {
                RequestBody::Empty => {
                    // No body
                }
                RequestBody::Bytes(bytes) => {
                    req = req.body(bytes);
                }
                RequestBody::Multipart(multipart) => {
                    req = req.header("Content-Type", multipart.content_type_header());
                    req = req.body(multipart.to_bytes());
                }
                RequestBody::Stream(_) => {
                    return Err(TransportError::Http(
                        "Streaming request body not supported in send()".to_string(),
                    ));
                }
            }
        }

        // Send request
        let response = req.send().await?;

        // Extract response
        let status = response.status();
        let headers = response.headers().clone();
        let body = response.bytes().await?;

        Ok(HttpResponse::new(status, headers, body))
    }

    async fn send_raw(&self, request: HttpRequest) -> Result<Bytes, TransportError> {
        let response = self.send(request).await?;
        Ok(response.body)
    }

    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<ByteStream, TransportError> {
        let method: Method = request.method.into();
        let mut req = self.client.request(method, request.url.clone());

        // Add headers
        for (key, value) in request.headers.iter() {
            req = req.header(key, value);
        }

        // Add timeout
        if let Some(timeout) = request.timeout {
            req = req.timeout(timeout);
        }

        // Add body
        if let Some(body) = request.body {
            match body {
                RequestBody::Empty => {
                    // No body
                }
                RequestBody::Bytes(bytes) => {
                    req = req.body(bytes);
                }
                RequestBody::Multipart(multipart) => {
                    req = req.header("Content-Type", multipart.content_type_header());
                    req = req.body(multipart.to_bytes());
                }
                RequestBody::Stream(_) => {
                    return Err(TransportError::Http(
                        "Streaming request body not supported in send_streaming()".to_string(),
                    ));
                }
            }
        }

        // Send request
        let response = req.send().await?;

        // Check status
        let status = response.status();
        if !status.is_success() {
            let body = response.bytes().await?;
            return Err(TransportError::Http(format!(
                "HTTP {} error: {}",
                status,
                String::from_utf8_lossy(&body)
            )));
        }

        // Create stream
        let stream = response.bytes_stream().map(|result| {
            result.map_err(|e| TransportError::Network(format!("Stream error: {}", e)))
        });

        Ok(ByteStream::new(stream))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multipart_body() {
        let metadata = Bytes::from(r#"{"name":"test.txt"}"#);
        let content = Bytes::from("Hello, World!");
        let multipart = MultipartBody::new(metadata, content, "text/plain");

        let bytes = multipart.to_bytes();
        let content_type = multipart.content_type_header();

        assert!(content_type.starts_with("multipart/related; boundary="));
        assert!(bytes.len() > 0);
    }

    #[test]
    fn test_http_method_conversion() {
        assert_eq!(Method::from(HttpMethod::Get), Method::GET);
        assert_eq!(Method::from(HttpMethod::Post), Method::POST);
        assert_eq!(Method::from(HttpMethod::Put), Method::PUT);
        assert_eq!(Method::from(HttpMethod::Patch), Method::PATCH);
        assert_eq!(Method::from(HttpMethod::Delete), Method::DELETE);
    }
}
