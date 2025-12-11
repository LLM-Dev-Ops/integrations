//! HTTP transport module for the Mistral client.
//!
//! Provides the HTTP transport layer for making API requests,
//! including support for regular requests and streaming.

mod http_transport;

pub use http_transport::{HttpTransport, ReqwestTransport};

use async_trait::async_trait;
use bytes::Bytes;
use futures::Stream;
use std::collections::HashMap;
use std::pin::Pin;

use crate::errors::MistralResult;

/// HTTP method.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    /// GET request.
    Get,
    /// POST request.
    Post,
    /// PUT request.
    Put,
    /// PATCH request.
    Patch,
    /// DELETE request.
    Delete,
}

impl From<Method> for reqwest::Method {
    fn from(method: Method) -> Self {
        match method {
            Method::Get => reqwest::Method::GET,
            Method::Post => reqwest::Method::POST,
            Method::Put => reqwest::Method::PUT,
            Method::Patch => reqwest::Method::PATCH,
            Method::Delete => reqwest::Method::DELETE,
        }
    }
}

/// HTTP response.
#[derive(Debug)]
pub struct HttpResponse {
    /// HTTP status code.
    pub status: u16,
    /// Response headers.
    pub headers: HashMap<String, String>,
    /// Response body.
    pub body: Bytes,
}

/// Byte stream type for streaming responses.
pub type ByteStream = Pin<Box<dyn Stream<Item = MistralResult<Bytes>> + Send>>;

/// Trait for HTTP transport implementations.
#[async_trait]
pub trait Transport: Send + Sync {
    /// Sends an HTTP request and returns the response.
    async fn send(
        &self,
        method: Method,
        url: &str,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<HttpResponse>;

    /// Sends an HTTP request and returns a streaming response.
    async fn send_streaming(
        &self,
        method: Method,
        url: &str,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<ByteStream>;

    /// Sends a multipart form request.
    async fn send_multipart(
        &self,
        url: &str,
        headers: HashMap<String, String>,
        form: reqwest::multipart::Form,
    ) -> MistralResult<HttpResponse>;
}
