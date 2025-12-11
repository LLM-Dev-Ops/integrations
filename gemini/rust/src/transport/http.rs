//! Core HTTP transport abstractions for the Gemini API client.

use async_trait::async_trait;
use bytes::Bytes;
use std::collections::HashMap;
use std::pin::Pin;
use futures::Stream;

use super::error::TransportError;

/// HTTP request for the transport layer.
#[derive(Debug, Clone)]
pub struct HttpRequest {
    /// HTTP method.
    pub method: HttpMethod,
    /// Request URL.
    pub url: String,
    /// Request headers.
    pub headers: HashMap<String, String>,
    /// Request body.
    pub body: Option<Bytes>,
}

/// HTTP method.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Patch,
    Delete,
}

/// HTTP response from the transport layer.
#[derive(Debug)]
pub struct HttpResponse {
    /// HTTP status code.
    pub status: u16,
    /// Response headers.
    pub headers: HashMap<String, String>,
    /// Response body.
    pub body: Bytes,
}

/// Chunked stream for streaming responses.
pub type ChunkedStream = Pin<Box<dyn Stream<Item = Result<Bytes, TransportError>> + Send>>;

/// HTTP transport abstraction for testability.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send a streaming request and receive a chunked response stream.
    async fn send_streaming(&self, request: HttpRequest) -> Result<ChunkedStream, TransportError>;
}
