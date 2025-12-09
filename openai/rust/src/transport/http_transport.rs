use crate::client::OpenAIConfig;
use crate::errors::{NetworkError, OpenAIError, OpenAIResult};
use crate::transport::{
    BoxStream, HttpTransport, MultipartBuilder, RequestBuilder, ResponseParser, StreamHandler,
};
use async_trait::async_trait;
use bytes::Bytes;
use http::{HeaderMap, Method};
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::time::Duration;
use url::Url;

/// HTTP transport implementation using reqwest
pub struct ReqwestTransport {
    client: Client,
    base_url: Url,
    default_headers: HeaderMap,
}

impl ReqwestTransport {
    /// Creates a new ReqwestTransport from configuration
    pub fn new(config: &OpenAIConfig) -> Self {
        let mut client_builder = Client::builder()
            .timeout(config.timeout)
            .pool_max_idle_per_host(config.max_connections)
            .user_agent(&config.user_agent);

        if let Some(proxy_url) = &config.proxy {
            if let Ok(proxy) = reqwest::Proxy::all(proxy_url.as_str()) {
                client_builder = client_builder.proxy(proxy);
            }
        }

        let client = client_builder
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            base_url: config.base_url.clone(),
            default_headers: HeaderMap::new(),
        }
    }

    /// Creates a new ReqwestTransport with base URL and timeout
    pub fn with_base_url(base_url: &str, timeout: Duration) -> OpenAIResult<Self> {
        let url = Url::parse(base_url)?;

        let client = Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|e| {
                OpenAIError::Network(NetworkError::ConnectionFailed(format!(
                    "Failed to build HTTP client: {}",
                    e
                )))
            })?;

        Ok(Self {
            client,
            base_url: url,
            default_headers: HeaderMap::new(),
        })
    }

    /// Sets default headers to include in all requests
    pub fn with_default_headers(mut self, headers: HeaderMap) -> Self {
        self.default_headers = headers;
        self
    }

    /// Builds a full URL from a path
    fn build_url(&self, path: &str) -> String {
        let path = path.trim_start_matches('/');
        format!("{}/{}", self.base_url.as_str().trim_end_matches('/'), path)
    }

    /// Merges default headers with request-specific headers
    fn merge_headers(&self, request_headers: Option<HeaderMap>) -> HeaderMap {
        let mut headers = self.default_headers.clone();
        if let Some(req_headers) = request_headers {
            for (key, value) in req_headers.iter() {
                headers.insert(key.clone(), value.clone());
            }
        }
        headers
    }
}

#[async_trait]
impl HttpTransport for ReqwestTransport {
    async fn request<T, R>(
        &self,
        method: Method,
        path: &str,
        body: Option<&T>,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<R>
    where
        T: Serialize + Send + Sync,
        R: DeserializeOwned,
    {
        let url = self.build_url(path);
        let merged_headers = self.merge_headers(headers);

        let mut request = match method {
            Method::GET => self.client.get(&url),
            Method::POST => self.client.post(&url),
            Method::PUT => self.client.put(&url),
            Method::DELETE => self.client.delete(&url),
            Method::PATCH => self.client.patch(&url),
            _ => {
                return Err(OpenAIError::Network(NetworkError::RequestFailed(
                    format!("Unsupported HTTP method: {}", method),
                )))
            }
        };

        // Apply merged headers
        for (key, value) in merged_headers.iter() {
            request = request.header(key, value);
        }

        // Add body if present
        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request.send().await?;
        ResponseParser::parse_response(response).await
    }

    async fn request_stream<T, R>(
        &self,
        method: Method,
        path: &str,
        body: Option<&T>,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<BoxStream<R>>
    where
        T: Serialize + Send + Sync,
        R: DeserializeOwned + Send + 'static,
    {
        let url = self.build_url(path);
        let merged_headers = self.merge_headers(headers);

        let mut request = match method {
            Method::GET => self.client.get(&url),
            Method::POST => self.client.post(&url),
            _ => {
                return Err(OpenAIError::Network(NetworkError::RequestFailed(
                    format!("Unsupported HTTP method for streaming: {}", method),
                )))
            }
        };

        // Apply merged headers
        for (key, value) in merged_headers.iter() {
            request = request.header(key, value);
        }

        // Add body if present
        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request.send().await?;
        StreamHandler::handle_stream(response).await
    }

    async fn upload_file(
        &self,
        path: &str,
        file_data: Bytes,
        file_name: &str,
        purpose: &str,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<serde_json::Value> {
        let url = self.build_url(path);
        let merged_headers = self.merge_headers(headers);

        let multipart = MultipartBuilder::new()
            .add_file("file", file_name, file_data)
            .add_text("purpose", purpose)
            .build()?;

        let mut request = self.client.post(&url).multipart(multipart);

        // Apply merged headers
        for (key, value) in merged_headers.iter() {
            request = request.header(key, value);
        }

        let response = request.send().await?;
        ResponseParser::parse_response(response).await
    }

    async fn download_file(&self, path: &str, headers: Option<HeaderMap>) -> OpenAIResult<Bytes> {
        let url = self.build_url(path);
        let merged_headers = self.merge_headers(headers);

        let mut request = self.client.get(&url);

        // Apply merged headers
        for (key, value) in merged_headers.iter() {
            request = request.header(key, value);
        }

        let response = request.send().await?;
        ResponseParser::parse_bytes(response).await
    }

    async fn request_raw<R>(
        &self,
        method: Method,
        path: &str,
        body: Bytes,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<R>
    where
        R: DeserializeOwned,
    {
        let url = self.build_url(path);
        let merged_headers = self.merge_headers(headers);

        let mut request = match method {
            Method::POST => self.client.post(&url),
            Method::PUT => self.client.put(&url),
            Method::PATCH => self.client.patch(&url),
            _ => {
                return Err(OpenAIError::Network(NetworkError::RequestFailed(
                    format!("Unsupported HTTP method for raw request: {}", method),
                )))
            }
        };

        // Apply merged headers
        for (key, value) in merged_headers.iter() {
            request = request.header(key, value);
        }

        request = request.body(body);

        let response = request.send().await?;
        ResponseParser::parse_response(response).await
    }

    async fn request_bytes<T>(
        &self,
        method: Method,
        path: &str,
        body: Option<&T>,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<Bytes>
    where
        T: Serialize + Send + Sync,
    {
        let url = self.build_url(path);
        let merged_headers = self.merge_headers(headers);

        let mut request = match method {
            Method::GET => self.client.get(&url),
            Method::POST => self.client.post(&url),
            Method::PUT => self.client.put(&url),
            Method::DELETE => self.client.delete(&url),
            Method::PATCH => self.client.patch(&url),
            _ => {
                return Err(OpenAIError::Network(NetworkError::RequestFailed(
                    format!("Unsupported HTTP method: {}", method),
                )))
            }
        };

        // Apply merged headers
        for (key, value) in merged_headers.iter() {
            request = request.header(key, value);
        }

        // Add body if present
        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request.send().await?;
        ResponseParser::parse_bytes(response).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::OpenAIConfig;

    #[test]
    fn test_build_url() {
        let config = OpenAIConfig::new("test-key");
        let transport = ReqwestTransport::new(&config);

        assert_eq!(
            transport.build_url("/chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );

        assert_eq!(
            transport.build_url("chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );
    }
}
