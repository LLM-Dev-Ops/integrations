//! HTTP transport implementation.

use async_trait::async_trait;
use bytes::Bytes;
use futures::Stream;
use reqwest::{Client, ClientBuilder};
use std::collections::HashMap;
use std::pin::Pin;
use std::time::Duration;
use tracing::instrument;

use super::{MultipartPart, MultipartRequest, StreamingResponse, TransportError};

/// HTTP method.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    /// GET request.
    Get,
    /// POST request.
    Post,
    /// DELETE request.
    Delete,
}

/// HTTP request representation.
#[derive(Debug, Clone)]
pub struct HttpRequest {
    /// HTTP method.
    pub method: HttpMethod,
    /// Request path.
    pub path: String,
    /// Request headers.
    pub headers: HashMap<String, String>,
    /// Request body.
    pub body: Option<Vec<u8>>,
    /// Request timeout override.
    pub timeout: Option<Duration>,
}

impl HttpRequest {
    /// Creates a new GET request.
    pub fn get(path: impl Into<String>) -> Self {
        Self {
            method: HttpMethod::Get,
            path: path.into(),
            headers: HashMap::new(),
            body: None,
            timeout: None,
        }
    }

    /// Creates a new POST request.
    pub fn post(path: impl Into<String>) -> Self {
        Self {
            method: HttpMethod::Post,
            path: path.into(),
            headers: HashMap::new(),
            body: None,
            timeout: None,
        }
    }

    /// Creates a new DELETE request.
    pub fn delete(path: impl Into<String>) -> Self {
        Self {
            method: HttpMethod::Delete,
            path: path.into(),
            headers: HashMap::new(),
            body: None,
            timeout: None,
        }
    }

    /// Sets the request body.
    pub fn with_body(mut self, body: Vec<u8>) -> Self {
        self.body = Some(body);
        self
    }

    /// Sets a header.
    pub fn with_header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(name.into(), value.into());
        self
    }

    /// Sets the request timeout.
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }
}

/// HTTP response representation.
#[derive(Debug, Clone)]
pub struct HttpResponse {
    /// HTTP status code.
    pub status: u16,
    /// Response headers.
    pub headers: HashMap<String, String>,
    /// Response body.
    pub body: Vec<u8>,
}

impl HttpResponse {
    /// Returns true if the status indicates success (2xx).
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }

    /// Parses the body as JSON.
    pub fn json<T: serde::de::DeserializeOwned>(&self) -> Result<T, serde_json::Error> {
        serde_json::from_slice(&self.body)
    }
}

/// HTTP transport trait.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send a streaming HTTP request.
    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<StreamingResponse, TransportError>;

    /// Send a multipart form request.
    async fn send_multipart(
        &self,
        request: MultipartRequest,
    ) -> Result<HttpResponse, TransportError>;
}

/// HTTP transport implementation using reqwest.
pub struct HttpTransportImpl {
    client: Client,
    base_url: String,
}

impl HttpTransportImpl {
    /// Creates a new HTTP transport.
    pub fn new(base_url: impl Into<String>, timeout: Duration) -> Result<Self, TransportError> {
        let client = ClientBuilder::new()
            .timeout(timeout)
            .pool_max_idle_per_host(10)
            .tcp_keepalive(Duration::from_secs(60))
            .build()
            .map_err(|e| TransportError::Connection {
                message: e.to_string(),
            })?;

        Ok(Self {
            client,
            base_url: base_url.into(),
        })
    }

    /// Builds the full URL for a path.
    fn build_url(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path.trim_start_matches('/'))
    }
}

#[async_trait]
impl HttpTransport for HttpTransportImpl {
    #[instrument(skip(self, request), fields(method = ?request.method, path = %request.path))]
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        let url = self.build_url(&request.path);

        let mut req_builder = match request.method {
            HttpMethod::Get => self.client.get(&url),
            HttpMethod::Post => self.client.post(&url),
            HttpMethod::Delete => self.client.delete(&url),
        };

        // Add headers
        for (name, value) in &request.headers {
            req_builder = req_builder.header(name, value);
        }

        // Add body if present
        if let Some(body) = request.body {
            req_builder = req_builder.body(body);
        }

        // Override timeout if specified
        if let Some(timeout) = request.timeout {
            req_builder = req_builder.timeout(timeout);
        }

        // Execute request
        let response = req_builder.send().await.map_err(|e| {
            if e.is_timeout() {
                TransportError::Timeout {
                    timeout: request.timeout.unwrap_or(Duration::from_secs(60)),
                }
            } else if e.is_connect() {
                TransportError::Connection {
                    message: e.to_string(),
                }
            } else {
                TransportError::InvalidResponse {
                    message: e.to_string(),
                }
            }
        })?;

        // Extract response
        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .map(|(k, v)| {
                (
                    k.to_string(),
                    v.to_str().unwrap_or_default().to_string(),
                )
            })
            .collect();
        let body = response
            .bytes()
            .await
            .map_err(|e| TransportError::InvalidResponse {
                message: e.to_string(),
            })?
            .to_vec();

        Ok(HttpResponse {
            status,
            headers,
            body,
        })
    }

    #[instrument(skip(self, request), fields(method = ?request.method, path = %request.path))]
    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<StreamingResponse, TransportError> {
        let url = self.build_url(&request.path);

        let mut req_builder = self.client.post(&url);

        // Add headers
        for (name, value) in &request.headers {
            req_builder = req_builder.header(name, value);
        }

        // Add body if present
        if let Some(body) = request.body {
            req_builder = req_builder.body(body);
        }

        // Override timeout if specified
        if let Some(timeout) = request.timeout {
            req_builder = req_builder.timeout(timeout);
        }

        // Execute request
        let response = req_builder.send().await.map_err(|e| {
            if e.is_timeout() {
                TransportError::Timeout {
                    timeout: request.timeout.unwrap_or(Duration::from_secs(60)),
                }
            } else if e.is_connect() {
                TransportError::Connection {
                    message: e.to_string(),
                }
            } else {
                TransportError::InvalidResponse {
                    message: e.to_string(),
                }
            }
        })?;

        let status = response.status().as_u16();
        let headers: HashMap<String, String> = response
            .headers()
            .iter()
            .map(|(k, v)| {
                (
                    k.to_string(),
                    v.to_str().unwrap_or_default().to_string(),
                )
            })
            .collect();

        // Convert to byte stream
        let stream = response.bytes_stream();
        let stream: Pin<Box<dyn Stream<Item = Result<Bytes, TransportError>> + Send>> =
            Box::pin(futures::StreamExt::map(stream, |result| {
                result.map_err(|e| TransportError::InvalidResponse {
                    message: e.to_string(),
                })
            }));

        Ok(StreamingResponse {
            status,
            headers,
            stream,
        })
    }

    #[instrument(skip(self, request), fields(path = %request.path))]
    async fn send_multipart(
        &self,
        request: MultipartRequest,
    ) -> Result<HttpResponse, TransportError> {
        let url = self.build_url(&request.path);

        // Build multipart form
        let mut form = reqwest::multipart::Form::new();

        for part in request.parts {
            form = match part {
                MultipartPart::Text { name, value } => form.text(name, value),
                MultipartPart::File {
                    name,
                    filename,
                    content_type,
                    data,
                } => {
                    let part = reqwest::multipart::Part::bytes(data)
                        .file_name(filename)
                        .mime_str(&content_type)
                        .map_err(|e| TransportError::InvalidResponse {
                            message: e.to_string(),
                        })?;
                    form.part(name, part)
                }
            };
        }

        let mut req_builder = self.client.post(&url).multipart(form);

        // Add headers
        for (name, value) in &request.headers {
            req_builder = req_builder.header(name, value);
        }

        // Override timeout if specified
        if let Some(timeout) = request.timeout {
            req_builder = req_builder.timeout(timeout);
        }

        // Execute request
        let response = req_builder.send().await.map_err(|e| {
            if e.is_timeout() {
                TransportError::Timeout {
                    timeout: request.timeout.unwrap_or(Duration::from_secs(60)),
                }
            } else if e.is_connect() {
                TransportError::Connection {
                    message: e.to_string(),
                }
            } else {
                TransportError::InvalidResponse {
                    message: e.to_string(),
                }
            }
        })?;

        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .map(|(k, v)| {
                (
                    k.to_string(),
                    v.to_str().unwrap_or_default().to_string(),
                )
            })
            .collect();
        let body = response
            .bytes()
            .await
            .map_err(|e| TransportError::InvalidResponse {
                message: e.to_string(),
            })?
            .to_vec();

        Ok(HttpResponse {
            status,
            headers,
            body,
        })
    }
}

impl std::fmt::Debug for HttpTransportImpl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HttpTransportImpl")
            .field("base_url", &self.base_url)
            .finish()
    }
}
