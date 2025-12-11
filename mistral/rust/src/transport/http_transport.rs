//! HTTP transport implementation using reqwest.

use async_trait::async_trait;
use bytes::Bytes;
use futures::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use super::{ByteStream, HttpResponse, Method, Transport};
use crate::errors::{ApiErrorResponse, MistralError, MistralResult};

/// HTTP transport trait for the Mistral client.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Executes an HTTP request.
    async fn execute(
        &self,
        method: Method,
        url: String,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<HttpResponse>;

    /// Executes a streaming HTTP request.
    async fn execute_stream(
        &self,
        method: Method,
        url: String,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<ByteStream>;

    /// Executes a multipart form request.
    async fn execute_multipart(
        &self,
        url: String,
        headers: HashMap<String, String>,
        form: reqwest::multipart::Form,
    ) -> MistralResult<HttpResponse>;

    /// Convenience method for GET requests.
    async fn get(&self, path: &str) -> MistralResult<Vec<u8>>;

    /// Convenience method for POST requests.
    async fn post(&self, path: &str, body: Vec<u8>) -> MistralResult<Vec<u8>>;

    /// Convenience method for streaming POST requests.
    async fn post_stream<T: serde::de::DeserializeOwned + Send + 'static>(
        &self,
        path: &str,
        body: Vec<u8>,
    ) -> MistralResult<std::pin::Pin<Box<dyn futures::Stream<Item = MistralResult<T>> + Send>>>;

    /// Convenience method for PATCH requests.
    async fn patch(&self, path: &str, body: Vec<u8>) -> MistralResult<Vec<u8>>;

    /// Convenience method for DELETE requests.
    async fn delete(&self, path: &str) -> MistralResult<Vec<u8>>;

    /// Convenience method for multipart file uploads.
    async fn post_multipart(
        &self,
        path: &str,
        file: Vec<u8>,
        filename: &str,
        purpose: &str,
    ) -> MistralResult<Vec<u8>>;
}

/// Reqwest-based HTTP transport implementation.
pub struct ReqwestTransport {
    client: reqwest::Client,
    timeout: Duration,
    base_url: String,
    api_key: String,
}

/// Configuration for ReqwestTransport.
pub struct TransportConfig {
    /// Base URL for the API.
    pub base_url: String,
    /// API key for authentication.
    pub api_key: String,
    /// Request timeout.
    pub timeout: Duration,
}

impl ReqwestTransport {
    /// Creates a new reqwest transport.
    pub fn new(timeout: Duration) -> MistralResult<Self> {
        Self::with_config(TransportConfig {
            base_url: "https://api.mistral.ai".to_string(),
            api_key: String::new(),
            timeout,
        })
    }

    /// Creates a new transport with configuration.
    pub fn with_config(config: TransportConfig) -> MistralResult<Self> {
        let client = reqwest::Client::builder()
            .timeout(config.timeout)
            .pool_max_idle_per_host(10)
            .build()
            .map_err(|e| MistralError::Configuration {
                message: format!("Failed to create HTTP client: {}", e),
            })?;

        Ok(Self {
            client,
            timeout: config.timeout,
            base_url: config.base_url,
            api_key: config.api_key,
        })
    }

    /// Creates a new transport with a custom client.
    pub fn with_client(client: reqwest::Client, base_url: String, api_key: String, timeout: Duration) -> Self {
        Self { client, timeout, base_url, api_key }
    }

    /// Gets the default headers for requests.
    fn default_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), format!("Bearer {}", self.api_key));
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        headers
    }

    /// Builds a full URL from a path.
    fn build_url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    /// Maps HTTP status codes to Mistral errors.
    fn map_http_error(
        &self,
        status: u16,
        body: &Bytes,
        headers: &HashMap<String, String>,
    ) -> MistralError {
        // Try to parse API error response
        let api_error: Option<ApiErrorResponse> = serde_json::from_slice(body).ok();

        let message = api_error
            .as_ref()
            .map(|e| e.error.message.clone())
            .unwrap_or_else(|| format!("HTTP {} error", status));

        let retry_after = self.extract_retry_after(headers);

        match status {
            400 => MistralError::BadRequest {
                message,
                error_type: api_error.as_ref().and_then(|e| e.error.error_type.clone()),
                param: api_error.as_ref().and_then(|e| e.error.param.clone()),
                code: api_error.as_ref().and_then(|e| e.error.code.clone()),
            },
            401 => MistralError::Authentication { message },
            403 => MistralError::Permission { message },
            404 => MistralError::NotFound {
                message,
                resource: api_error.as_ref().and_then(|e| e.error.param.clone()),
            },
            422 => MistralError::Validation {
                message,
                errors: Vec::new(),
            },
            429 => MistralError::RateLimit {
                message,
                retry_after,
            },
            500 => MistralError::Internal {
                message,
                request_id: headers.get("x-request-id").cloned(),
            },
            502 => MistralError::BadGateway {
                message: "Bad gateway - upstream error".to_string(),
            },
            503 => MistralError::ServiceUnavailable {
                message,
                retry_after,
            },
            504 => MistralError::GatewayTimeout {
                message: "Gateway timeout - request took too long".to_string(),
            },
            _ => MistralError::Unknown {
                status,
                message,
                body: String::from_utf8_lossy(body).to_string().into(),
            },
        }
    }

    /// Extracts retry-after duration from headers.
    fn extract_retry_after(&self, headers: &HashMap<String, String>) -> Option<Duration> {
        headers
            .get("retry-after")
            .or_else(|| headers.get("Retry-After"))
            .and_then(|v| v.parse::<u64>().ok())
            .map(Duration::from_secs)
    }

    /// Converts response headers to a HashMap.
    fn extract_headers(headers: &reqwest::header::HeaderMap) -> HashMap<String, String> {
        headers
            .iter()
            .filter_map(|(k, v)| {
                v.to_str()
                    .ok()
                    .map(|val| (k.as_str().to_string(), val.to_string()))
            })
            .collect()
    }
}

#[async_trait]
impl HttpTransport for ReqwestTransport {
    async fn execute(
        &self,
        method: Method,
        url: String,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<HttpResponse> {
        let mut request = self.client.request(method.into(), &url);

        for (key, value) in &headers {
            request = request.header(key, value);
        }

        if let Some(body) = body {
            request = request.body(body);
        }

        let response = request.send().await?;
        let status = response.status().as_u16();
        let response_headers = Self::extract_headers(response.headers());
        let body = response.bytes().await?;

        if status >= 400 {
            return Err(self.map_http_error(status, &body, &response_headers));
        }

        Ok(HttpResponse {
            status,
            headers: response_headers,
            body,
        })
    }

    async fn execute_stream(
        &self,
        method: Method,
        url: String,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<ByteStream> {
        let mut request = self.client.request(method.into(), &url);

        for (key, value) in &headers {
            request = request.header(key, value);
        }

        if let Some(body) = body {
            request = request.body(body);
        }

        let response = request.send().await?;
        let status = response.status().as_u16();

        if status >= 400 {
            let response_headers = Self::extract_headers(response.headers());
            let body = response.bytes().await?;
            return Err(self.map_http_error(status, &body, &response_headers));
        }

        let stream = response.bytes_stream().map(|result| {
            result.map_err(|e| MistralError::Stream {
                message: e.to_string(),
            })
        });

        Ok(Box::pin(stream))
    }

    async fn execute_multipart(
        &self,
        url: String,
        headers: HashMap<String, String>,
        form: reqwest::multipart::Form,
    ) -> MistralResult<HttpResponse> {
        let mut request = self.client.post(&url).multipart(form);

        for (key, value) in &headers {
            // Skip Content-Type as it's set by multipart
            if key.to_lowercase() != "content-type" {
                request = request.header(key, value);
            }
        }

        let response = request.send().await?;
        let status = response.status().as_u16();
        let response_headers = Self::extract_headers(response.headers());
        let body = response.bytes().await?;

        if status >= 400 {
            return Err(self.map_http_error(status, &body, &response_headers));
        }

        Ok(HttpResponse {
            status,
            headers: response_headers,
            body,
        })
    }

    async fn get(&self, path: &str) -> MistralResult<Vec<u8>> {
        let url = self.build_url(path);
        let response = self.execute(Method::Get, url, self.default_headers(), None).await?;
        Ok(response.body.to_vec())
    }

    async fn post(&self, path: &str, body: Vec<u8>) -> MistralResult<Vec<u8>> {
        let url = self.build_url(path);
        let response = self.execute(
            Method::Post,
            url,
            self.default_headers(),
            Some(Bytes::from(body)),
        ).await?;
        Ok(response.body.to_vec())
    }

    async fn post_stream<T: serde::de::DeserializeOwned + Send + 'static>(
        &self,
        path: &str,
        body: Vec<u8>,
    ) -> MistralResult<std::pin::Pin<Box<dyn futures::Stream<Item = MistralResult<T>> + Send>>> {
        let url = self.build_url(path);
        let stream = self.execute_stream(
            Method::Post,
            url,
            self.default_headers(),
            Some(Bytes::from(body)),
        ).await?;

        // Transform the byte stream into SSE events and parse them
        let parsed_stream = stream.map(move |chunk| {
            let bytes = chunk?;
            let text = String::from_utf8_lossy(&bytes);

            // Parse SSE format: "data: {...}\n\n"
            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if data.trim() == "[DONE]" {
                        continue;
                    }
                    match serde_json::from_str::<T>(data) {
                        Ok(parsed) => return Ok(parsed),
                        Err(e) => return Err(MistralError::Deserialization {
                            message: e.to_string(),
                            body: data.to_string(),
                        }),
                    }
                }
            }

            Err(MistralError::Stream {
                message: "No valid SSE data in chunk".to_string(),
            })
        }).filter_map(|result| async move {
            match result {
                Ok(item) => Some(Ok(item)),
                Err(MistralError::Stream { message }) if message.contains("No valid SSE") => None,
                Err(e) => Some(Err(e)),
            }
        });

        Ok(Box::pin(parsed_stream))
    }

    async fn patch(&self, path: &str, body: Vec<u8>) -> MistralResult<Vec<u8>> {
        let url = self.build_url(path);
        let response = self.execute(
            Method::Patch,
            url,
            self.default_headers(),
            Some(Bytes::from(body)),
        ).await?;
        Ok(response.body.to_vec())
    }

    async fn delete(&self, path: &str) -> MistralResult<Vec<u8>> {
        let url = self.build_url(path);
        let response = self.execute(Method::Delete, url, self.default_headers(), None).await?;
        Ok(response.body.to_vec())
    }

    async fn post_multipart(
        &self,
        path: &str,
        file: Vec<u8>,
        filename: &str,
        purpose: &str,
    ) -> MistralResult<Vec<u8>> {
        let url = self.build_url(path);

        let file_part = reqwest::multipart::Part::bytes(file)
            .file_name(filename.to_string())
            .mime_str("application/octet-stream")
            .map_err(|e| MistralError::Configuration {
                message: format!("Invalid MIME type: {}", e),
            })?;

        let form = reqwest::multipart::Form::new()
            .part("file", file_part)
            .text("purpose", purpose.to_string());

        let mut headers = self.default_headers();
        headers.remove("Content-Type"); // Let multipart set its own

        let response = self.execute_multipart(url, headers, form).await?;
        Ok(response.body.to_vec())
    }
}

#[async_trait]
impl Transport for ReqwestTransport {
    async fn send(
        &self,
        method: Method,
        url: &str,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<HttpResponse> {
        self.execute(method, url.to_string(), headers, body).await
    }

    async fn send_streaming(
        &self,
        method: Method,
        url: &str,
        headers: HashMap<String, String>,
        body: Option<Bytes>,
    ) -> MistralResult<ByteStream> {
        self.execute_stream(method, url.to_string(), headers, body)
            .await
    }

    async fn send_multipart(
        &self,
        url: &str,
        headers: HashMap<String, String>,
        form: reqwest::multipart::Form,
    ) -> MistralResult<HttpResponse> {
        self.execute_multipart(url.to_string(), headers, form)
            .await
    }
}

/// Creates a shared transport instance.
pub fn create_transport(timeout: Duration) -> MistralResult<Arc<dyn HttpTransport>> {
    Ok(Arc::new(ReqwestTransport::new(timeout)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_method_conversion() {
        assert_eq!(reqwest::Method::from(Method::Get), reqwest::Method::GET);
        assert_eq!(reqwest::Method::from(Method::Post), reqwest::Method::POST);
        assert_eq!(reqwest::Method::from(Method::Put), reqwest::Method::PUT);
        assert_eq!(reqwest::Method::from(Method::Patch), reqwest::Method::PATCH);
        assert_eq!(
            reqwest::Method::from(Method::Delete),
            reqwest::Method::DELETE
        );
    }

    #[test]
    fn test_transport_creation() {
        let transport = ReqwestTransport::new(Duration::from_secs(30));
        assert!(transport.is_ok());
    }
}
