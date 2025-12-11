//! Files service implementation for Gemini API.

use super::FilesService;
use super::validation::{validate_upload_request, validate_file_name, MAX_FILE_SIZE};
use crate::auth::AuthManager;
use crate::config::GeminiConfig;
use crate::error::{GeminiError, GeminiResult, RequestError, ResourceError};
use crate::transport::{HttpTransport, HttpRequest, HttpMethod};
use crate::types::{File, UploadFileRequest, ListFilesParams, ListFilesResponse, FileState};
use async_trait::async_trait;
use bytes::Bytes;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

/// Upload base URL - different from regular API base URL.
const UPLOAD_BASE_URL: &str = "https://generativelanguage.googleapis.com/upload";

/// Implementation of the Files service.
pub struct FilesServiceImpl {
    config: Arc<GeminiConfig>,
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
}

impl FilesServiceImpl {
    /// Create a new files service instance.
    pub fn new(
        config: Arc<GeminiConfig>,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
    ) -> Self {
        Self {
            config,
            transport,
            auth_manager,
        }
    }

    /// Build the upload URL.
    fn build_upload_url(&self) -> String {
        format!(
            "{}/{}/files",
            UPLOAD_BASE_URL,
            self.config.api_version
        )
    }

    /// Build the URL for file operations.
    fn build_file_url(&self, file_name: &str) -> String {
        format!(
            "{}/{}/{}",
            self.config.base_url,
            self.config.api_version,
            file_name
        )
    }

    /// Build the list files URL.
    fn build_list_url(&self) -> String {
        format!(
            "{}/{}/files",
            self.config.base_url,
            self.config.api_version
        )
    }

    /// Build headers for JSON requests.
    fn build_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        // Add authentication
        if let Some((name, value)) = self.auth_manager.get_auth_header() {
            headers.insert(name, value);
        }

        headers
    }

    /// Build headers for multipart upload.
    fn build_multipart_headers(&self, boundary: &str) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert(
            "Content-Type".to_string(),
            format!("multipart/related; boundary={}", boundary),
        );
        headers.insert("X-Goog-Upload-Protocol".to_string(), "multipart".to_string());

        // Add authentication
        if let Some((name, value)) = self.auth_manager.get_auth_header() {
            headers.insert(name, value);
        }

        headers
    }

    /// Add auth and pagination query params to URL.
    fn add_query_params(&self, mut url: String, params: Option<&ListFilesParams>) -> String {
        let mut query_parts = Vec::new();

        // Add auth query param if needed
        if let Some((key, value)) = self.auth_manager.get_auth_query_param() {
            query_parts.push(format!("{}={}", key, value));
        }

        // Add pagination params
        if let Some(params) = params {
            if let Some(page_size) = params.page_size {
                query_parts.push(format!("pageSize={}", page_size));
            }
            if let Some(ref page_token) = params.page_token {
                query_parts.push(format!("pageToken={}", urlencoding::encode(page_token)));
            }
        }

        if !query_parts.is_empty() {
            url = format!("{}?{}", url, query_parts.join("&"));
        }

        url
    }

    /// Create multipart body for file upload.
    fn create_multipart_body(
        &self,
        request: &UploadFileRequest,
        boundary: &str,
    ) -> Vec<u8> {
        let mut body = Vec::new();

        // Add metadata part
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");

        let metadata = json!({
            "file": {
                "display_name": request.display_name
            }
        });
        body.extend_from_slice(metadata.to_string().as_bytes());
        body.extend_from_slice(b"\r\n");

        // Add file data part
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(
            format!("Content-Type: {}\r\n\r\n", request.mime_type).as_bytes()
        );
        body.extend_from_slice(&request.file_data);
        body.extend_from_slice(b"\r\n");

        // Add closing boundary
        body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

        body
    }

    /// Parse error response from API.
    fn parse_error(&self, status: u16, body: &Bytes) -> GeminiError {
        // Try to parse as JSON error
        if let Ok(text) = std::str::from_utf8(body) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(text) {
                if let Some(error_obj) = json.get("error") {
                    let message = error_obj.get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or(text)
                        .to_string();

                    // Map status codes to appropriate errors
                    return match status {
                        400 => GeminiError::Request(RequestError::InvalidParameter {
                            parameter: "request".to_string(),
                            message,
                        }),
                        401 | 403 => GeminiError::Authentication(
                            crate::error::AuthenticationError::InvalidApiKey
                        ),
                        404 => GeminiError::Resource(ResourceError::FileNotFound {
                            file_name: "unknown".to_string(),
                        }),
                        413 => GeminiError::Request(RequestError::PayloadTooLarge {
                            size: 0,
                            max_size: 0,
                        }),
                        429 => GeminiError::RateLimit(
                            crate::error::RateLimitError::TooManyRequests { retry_after: None }
                        ),
                        500..=599 => GeminiError::Server(
                            crate::error::ServerError::InternalError { message }
                        ),
                        _ => GeminiError::Response(
                            crate::error::ResponseError::UnexpectedFormat { message }
                        ),
                    };
                }
            }
        }

        // Fallback error
        GeminiError::Response(crate::error::ResponseError::UnexpectedFormat {
            message: format!("HTTP {} - {}", status, String::from_utf8_lossy(body)),
        })
    }

    /// Upload file bytes with MIME type and display name.
    pub async fn upload_bytes(
        &self,
        content: Vec<u8>,
        mime_type: String,
        display_name: Option<String>,
    ) -> GeminiResult<File> {
        let request = UploadFileRequest {
            display_name,
            file_data: content,
            mime_type,
        };
        self.upload(request).await
    }

    /// Wait for file to become active.
    pub async fn wait_for_active(
        &self,
        name: &str,
        timeout: Duration,
        poll_interval: Duration,
    ) -> GeminiResult<File> {
        let start = std::time::Instant::now();

        loop {
            let file = self.get(name).await?;

            match file.state {
                Some(FileState::Active) => return Ok(file),
                Some(FileState::Failed) => {
                    return Err(GeminiError::Resource(ResourceError::FileProcessingFailed {
                        file_name: name.to_string(),
                        message: "File processing failed".to_string(),
                    }));
                }
                Some(FileState::Processing) | None => {
                    // Continue waiting
                }
            }

            if start.elapsed() >= timeout {
                return Err(GeminiError::Network(crate::error::NetworkError::Timeout {
                    duration: timeout,
                }));
            }

            tokio::time::sleep(poll_interval).await;
        }
    }
}

#[async_trait]
impl FilesService for FilesServiceImpl {
    async fn upload(&self, request: UploadFileRequest) -> Result<File, GeminiError> {
        // Validate request
        validate_upload_request(&request)?;

        // Generate boundary for multipart
        let boundary = format!("----gemini_boundary_{}", uuid::Uuid::new_v4());

        // Build URL
        let url = self.build_upload_url();
        let url = self.add_query_params(url, None);

        // Build headers
        let headers = self.build_multipart_headers(&boundary);

        // Create multipart body
        let body = self.create_multipart_body(&request, &boundary);

        // Create HTTP request
        let http_request = HttpRequest {
            method: HttpMethod::Post,
            url,
            headers,
            body: Some(Bytes::from(body)),
        };

        // Send request
        let response = self.transport.send(http_request)
            .await
            .map_err(|e| GeminiError::Network(crate::error::NetworkError::ConnectionFailed {
                message: e.to_string(),
            }))?;

        // Check status
        if response.status != 200 {
            return Err(self.parse_error(response.status, &response.body));
        }

        // Parse response
        let file: File = serde_json::from_slice(&response.body)?;
        Ok(file)
    }

    async fn list(
        &self,
        params: Option<ListFilesParams>,
    ) -> Result<ListFilesResponse, GeminiError> {
        // Build URL
        let url = self.build_list_url();
        let url = self.add_query_params(url, params.as_ref());

        // Build headers
        let headers = self.build_headers();

        // Create HTTP request
        let http_request = HttpRequest {
            method: HttpMethod::Get,
            url,
            headers,
            body: None,
        };

        // Send request
        let response = self.transport.send(http_request)
            .await
            .map_err(|e| GeminiError::Network(crate::error::NetworkError::ConnectionFailed {
                message: e.to_string(),
            }))?;

        // Check status
        if response.status != 200 {
            return Err(self.parse_error(response.status, &response.body));
        }

        // Parse response
        let list_response: ListFilesResponse = serde_json::from_slice(&response.body)?;
        Ok(list_response)
    }

    async fn get(&self, file_name: &str) -> Result<File, GeminiError> {
        // Validate file name
        validate_file_name(file_name)?;

        // Build URL - handle both "files/file-name" and just "file-name"
        let name = if file_name.starts_with("files/") {
            file_name.to_string()
        } else {
            format!("files/{}", file_name)
        };

        let url = self.build_file_url(&name);
        let url = self.add_query_params(url, None);

        // Build headers
        let headers = self.build_headers();

        // Create HTTP request
        let http_request = HttpRequest {
            method: HttpMethod::Get,
            url,
            headers,
            body: None,
        };

        // Send request
        let response = self.transport.send(http_request)
            .await
            .map_err(|e| GeminiError::Network(crate::error::NetworkError::ConnectionFailed {
                message: e.to_string(),
            }))?;

        // Check status
        if response.status != 200 {
            return Err(self.parse_error(response.status, &response.body));
        }

        // Parse response
        let file: File = serde_json::from_slice(&response.body)?;
        Ok(file)
    }

    async fn delete(&self, file_name: &str) -> Result<(), GeminiError> {
        // Validate file name
        validate_file_name(file_name)?;

        // Build URL - handle both "files/file-name" and just "file-name"
        let name = if file_name.starts_with("files/") {
            file_name.to_string()
        } else {
            format!("files/{}", file_name)
        };

        let url = self.build_file_url(&name);
        let url = self.add_query_params(url, None);

        // Build headers
        let headers = self.build_headers();

        // Create HTTP request
        let http_request = HttpRequest {
            method: HttpMethod::Delete,
            url,
            headers,
            body: None,
        };

        // Send request
        let response = self.transport.send(http_request)
            .await
            .map_err(|e| GeminiError::Network(crate::error::NetworkError::ConnectionFailed {
                message: e.to_string(),
            }))?;

        // Check status - DELETE typically returns 204 No Content on success
        if response.status != 200 && response.status != 204 {
            return Err(self.parse_error(response.status, &response.body));
        }

        Ok(())
    }
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}
