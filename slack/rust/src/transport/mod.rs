//! HTTP transport layer for the Slack client.
//!
//! Provides low-level HTTP communication with the Slack API,
//! including request building, response parsing, and error handling.

use crate::errors::{
    NetworkError, RateLimitError, ResponseError, SlackError, SlackResult,
};
use async_trait::async_trait;
use bytes::Bytes;
use http::{HeaderMap, Method, StatusCode};
use reqwest::{Client, ClientBuilder, Response};
use serde::{de::DeserializeOwned, Serialize};
use std::time::Duration;
use tracing::{debug, instrument, warn};

/// HTTP transport trait for making API requests
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send a JSON request and receive a JSON response
    async fn send_json<Req, Res>(&self, request: TransportRequest<Req>) -> SlackResult<Res>
    where
        Req: Serialize + Send + Sync,
        Res: DeserializeOwned;

    /// Send a form-encoded request
    async fn send_form<Res>(&self, request: FormRequest) -> SlackResult<Res>
    where
        Res: DeserializeOwned;

    /// Send a multipart request (for file uploads)
    async fn send_multipart<Res>(&self, request: MultipartRequest) -> SlackResult<Res>
    where
        Res: DeserializeOwned;

    /// Send a raw request and receive raw bytes
    async fn send_raw(&self, request: RawRequest) -> SlackResult<Bytes>;
}

/// Transport request for JSON payloads
#[derive(Debug)]
pub struct TransportRequest<T> {
    /// HTTP method
    pub method: Method,
    /// URL path
    pub url: String,
    /// Request headers
    pub headers: HeaderMap,
    /// Request body
    pub body: Option<T>,
    /// Request timeout
    pub timeout: Option<Duration>,
}

impl<T> TransportRequest<T> {
    /// Create a new GET request
    pub fn get(url: impl Into<String>, headers: HeaderMap) -> Self {
        Self {
            method: Method::GET,
            url: url.into(),
            headers,
            body: None,
            timeout: None,
        }
    }

    /// Create a new POST request
    pub fn post(url: impl Into<String>, headers: HeaderMap, body: T) -> Self {
        Self {
            method: Method::POST,
            url: url.into(),
            headers,
            body: Some(body),
            timeout: None,
        }
    }

    /// Set the request timeout
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }
}

/// Form-encoded request
#[derive(Debug)]
pub struct FormRequest {
    /// HTTP method
    pub method: Method,
    /// URL path
    pub url: String,
    /// Request headers
    pub headers: HeaderMap,
    /// Form fields
    pub fields: Vec<(String, String)>,
    /// Request timeout
    pub timeout: Option<Duration>,
}

impl FormRequest {
    /// Create a new form POST request
    pub fn post(url: impl Into<String>, headers: HeaderMap) -> Self {
        Self {
            method: Method::POST,
            url: url.into(),
            headers,
            fields: Vec::new(),
            timeout: None,
        }
    }

    /// Add a form field
    pub fn field(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.fields.push((name.into(), value.into()));
        self
    }

    /// Set the request timeout
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }
}

/// Multipart request for file uploads
#[derive(Debug)]
pub struct MultipartRequest {
    /// URL path
    pub url: String,
    /// Request headers
    pub headers: HeaderMap,
    /// Form fields
    pub fields: Vec<(String, String)>,
    /// Files to upload
    pub files: Vec<FileUpload>,
    /// Request timeout
    pub timeout: Option<Duration>,
}

impl MultipartRequest {
    /// Create a new multipart request
    pub fn new(url: impl Into<String>, headers: HeaderMap) -> Self {
        Self {
            url: url.into(),
            headers,
            fields: Vec::new(),
            files: Vec::new(),
            timeout: None,
        }
    }

    /// Add a form field
    pub fn field(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.fields.push((name.into(), value.into()));
        self
    }

    /// Add a file
    pub fn file(mut self, upload: FileUpload) -> Self {
        self.files.push(upload);
        self
    }

    /// Set the request timeout
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }
}

/// File upload data
#[derive(Debug, Clone)]
pub struct FileUpload {
    /// Form field name
    pub field_name: String,
    /// File name
    pub file_name: String,
    /// File content
    pub content: Bytes,
    /// MIME type
    pub mime_type: String,
}

impl FileUpload {
    /// Create a new file upload
    pub fn new(
        field_name: impl Into<String>,
        file_name: impl Into<String>,
        content: impl Into<Bytes>,
    ) -> Self {
        let file_name_str = file_name.into();
        let mime_type = mime_guess::from_path(&file_name_str)
            .first_or_octet_stream()
            .to_string();

        Self {
            field_name: field_name.into(),
            file_name: file_name_str,
            content: content.into(),
            mime_type,
        }
    }

    /// Set the MIME type
    pub fn with_mime_type(mut self, mime_type: impl Into<String>) -> Self {
        self.mime_type = mime_type.into();
        self
    }
}

/// Raw request for non-JSON responses
#[derive(Debug)]
pub struct RawRequest {
    /// HTTP method
    pub method: Method,
    /// URL path
    pub url: String,
    /// Request headers
    pub headers: HeaderMap,
    /// Request body
    pub body: Option<Bytes>,
    /// Request timeout
    pub timeout: Option<Duration>,
}

impl RawRequest {
    /// Create a new raw GET request
    pub fn get(url: impl Into<String>, headers: HeaderMap) -> Self {
        Self {
            method: Method::GET,
            url: url.into(),
            headers,
            body: None,
            timeout: None,
        }
    }
}

/// Default HTTP transport implementation using reqwest
pub struct ReqwestTransport {
    client: Client,
    default_timeout: Duration,
}

impl ReqwestTransport {
    /// Create a new transport with the given timeout
    pub fn new(timeout: Duration) -> SlackResult<Self> {
        let client = ClientBuilder::new()
            .timeout(timeout)
            .pool_max_idle_per_host(10)
            .build()
            .map_err(|e| SlackError::Network(NetworkError::Http(e.to_string())))?;

        Ok(Self {
            client,
            default_timeout: timeout,
        })
    }

    /// Create a new transport with a pre-built client
    pub fn with_client(client: Client, default_timeout: Duration) -> Self {
        Self {
            client,
            default_timeout,
        }
    }

    /// Parse the response and handle errors
    async fn parse_response<Res: DeserializeOwned>(
        &self,
        response: Response,
    ) -> SlackResult<Res> {
        let status = response.status();

        // Handle rate limiting
        if status == StatusCode::TOO_MANY_REQUESTS {
            let retry_after = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(60);

            return Err(SlackError::RateLimit(RateLimitError::RateLimited {
                retry_after: Duration::from_secs(retry_after),
                tier: response
                    .headers()
                    .get("X-Slack-Rate-Limit-Tier")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from),
            }));
        }

        // Parse response body
        let body = response.text().await.map_err(|e| {
            SlackError::Network(NetworkError::Http(e.to_string()))
        })?;

        debug!(response_body = %body, "Received response");

        // Parse JSON
        let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
            SlackError::Response(ResponseError::DeserializationError {
                message: e.to_string(),
            })
        })?;

        // Check for Slack "ok" field
        if let Some(ok) = json.get("ok").and_then(|v| v.as_bool()) {
            if !ok {
                let error_code = json
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown_error");
                let error_msg = json.get("error").and_then(|v| v.as_str());

                return Err(SlackError::from_slack_error(error_code, error_msg));
            }
        }

        // Deserialize to target type
        serde_json::from_value(json).map_err(|e| {
            SlackError::Response(ResponseError::DeserializationError {
                message: e.to_string(),
            })
        })
    }
}

#[async_trait]
impl HttpTransport for ReqwestTransport {
    #[instrument(skip(self, request), fields(method = %request.method, url = %request.url))]
    async fn send_json<Req, Res>(&self, request: TransportRequest<Req>) -> SlackResult<Res>
    where
        Req: Serialize + Send + Sync,
        Res: DeserializeOwned,
    {
        let timeout = request.timeout.unwrap_or(self.default_timeout);

        let mut req_builder = self
            .client
            .request(request.method.clone(), &request.url)
            .headers(request.headers)
            .timeout(timeout);

        if let Some(body) = &request.body {
            req_builder = req_builder.json(body);
        }

        let response = req_builder.send().await.map_err(|e| {
            SlackError::Network(NetworkError::from(e))
        })?;

        self.parse_response(response).await
    }

    #[instrument(skip(self, request), fields(url = %request.url))]
    async fn send_form<Res>(&self, request: FormRequest) -> SlackResult<Res>
    where
        Res: DeserializeOwned,
    {
        let timeout = request.timeout.unwrap_or(self.default_timeout);

        let response = self
            .client
            .request(request.method, &request.url)
            .headers(request.headers)
            .form(&request.fields)
            .timeout(timeout)
            .send()
            .await
            .map_err(|e| SlackError::Network(NetworkError::from(e)))?;

        self.parse_response(response).await
    }

    #[instrument(skip(self, request), fields(url = %request.url, file_count = request.files.len()))]
    async fn send_multipart<Res>(&self, request: MultipartRequest) -> SlackResult<Res>
    where
        Res: DeserializeOwned,
    {
        let timeout = request.timeout.unwrap_or(self.default_timeout);

        let mut form = reqwest::multipart::Form::new();

        // Add text fields
        for (name, value) in request.fields {
            form = form.text(name, value);
        }

        // Add files
        for file in request.files {
            let part = reqwest::multipart::Part::bytes(file.content.to_vec())
                .file_name(file.file_name)
                .mime_str(&file.mime_type)
                .map_err(|e| {
                    SlackError::Network(NetworkError::Http(e.to_string()))
                })?;
            form = form.part(file.field_name, part);
        }

        let response = self
            .client
            .post(&request.url)
            .headers(request.headers)
            .multipart(form)
            .timeout(timeout)
            .send()
            .await
            .map_err(|e| SlackError::Network(NetworkError::from(e)))?;

        self.parse_response(response).await
    }

    #[instrument(skip(self, request), fields(method = %request.method, url = %request.url))]
    async fn send_raw(&self, request: RawRequest) -> SlackResult<Bytes> {
        let timeout = request.timeout.unwrap_or(self.default_timeout);

        let mut req_builder = self
            .client
            .request(request.method, &request.url)
            .headers(request.headers)
            .timeout(timeout);

        if let Some(body) = request.body {
            req_builder = req_builder.body(body);
        }

        let response = req_builder.send().await.map_err(|e| {
            SlackError::Network(NetworkError::from(e))
        })?;

        let status = response.status();
        if !status.is_success() {
            warn!(status = %status, "Request failed with non-success status");
        }

        response.bytes().await.map_err(|e| {
            SlackError::Network(NetworkError::Http(e.to_string()))
        })
    }
}

impl std::fmt::Debug for ReqwestTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ReqwestTransport")
            .field("default_timeout", &self.default_timeout)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transport_request_builder() {
        let headers = HeaderMap::new();
        let request: TransportRequest<()> = TransportRequest::get("https://slack.com/api/test", headers);

        assert_eq!(request.method, Method::GET);
        assert_eq!(request.url, "https://slack.com/api/test");
        assert!(request.body.is_none());
    }

    #[test]
    fn test_form_request_builder() {
        let headers = HeaderMap::new();
        let request = FormRequest::post("https://slack.com/api/test", headers)
            .field("channel", "C123")
            .field("text", "Hello");

        assert_eq!(request.fields.len(), 2);
        assert_eq!(request.fields[0], ("channel".to_string(), "C123".to_string()));
    }

    #[test]
    fn test_file_upload_mime_detection() {
        let upload = FileUpload::new("file", "test.png", vec![0u8; 10]);
        assert_eq!(upload.mime_type, "image/png");

        let upload = FileUpload::new("file", "document.pdf", vec![0u8; 10]);
        assert_eq!(upload.mime_type, "application/pdf");
    }

    #[test]
    fn test_multipart_request_builder() {
        let headers = HeaderMap::new();
        let upload = FileUpload::new("file", "test.txt", b"content".to_vec());

        let request = MultipartRequest::new("https://slack.com/api/files.upload", headers)
            .field("channels", "C123")
            .file(upload);

        assert_eq!(request.fields.len(), 1);
        assert_eq!(request.files.len(), 1);
    }
}
