//! HTTP Transport
//!
//! HTTP client interface and implementations for OAuth2 requests.

use async_trait::async_trait;
use std::collections::HashMap;
use std::time::Duration;

use crate::error::{NetworkError, OAuth2Error, ProtocolError};

/// HTTP request definition.
#[derive(Clone, Debug)]
pub struct HttpRequest {
    /// HTTP method.
    pub method: HttpMethod,
    /// Request URL.
    pub url: String,
    /// Request headers.
    pub headers: HashMap<String, String>,
    /// Request body.
    pub body: Option<String>,
    /// Request timeout.
    pub timeout: Option<Duration>,
}

/// HTTP method.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Delete,
}

impl HttpMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Get => "GET",
            Self::Post => "POST",
            Self::Put => "PUT",
            Self::Delete => "DELETE",
        }
    }
}

/// HTTP response definition.
#[derive(Clone, Debug)]
pub struct HttpResponse {
    /// HTTP status code.
    pub status: u16,
    /// Status text.
    pub status_text: String,
    /// Response headers.
    pub headers: HashMap<String, String>,
    /// Response body.
    pub body: String,
}

/// HTTP transport interface (for dependency injection).
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, OAuth2Error>;
}

/// Default reqwest-based HTTP transport.
pub struct ReqwestHttpTransport {
    client: reqwest::Client,
    default_timeout: Duration,
    max_response_size: usize,
}

impl ReqwestHttpTransport {
    /// Create new transport with default settings.
    pub fn new() -> Self {
        Self::with_options(Duration::from_secs(30), 1048576) // 1MB
    }

    /// Create transport with custom options.
    pub fn with_options(timeout: Duration, max_response_size: usize) -> Self {
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .redirect(reqwest::redirect::Policy::none()) // Don't follow redirects for OAuth2
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            default_timeout: timeout,
            max_response_size,
        }
    }
}

impl Default for ReqwestHttpTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpTransport for ReqwestHttpTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, OAuth2Error> {
        let timeout = request.timeout.unwrap_or(self.default_timeout);

        let mut req_builder = match request.method {
            HttpMethod::Get => self.client.get(&request.url),
            HttpMethod::Post => self.client.post(&request.url),
            HttpMethod::Put => self.client.put(&request.url),
            HttpMethod::Delete => self.client.delete(&request.url),
        };

        for (key, value) in &request.headers {
            req_builder = req_builder.header(key, value);
        }

        if let Some(body) = request.body {
            req_builder = req_builder.body(body);
        }

        req_builder = req_builder.timeout(timeout);

        let response = req_builder.send().await.map_err(|e| {
            if e.is_timeout() {
                OAuth2Error::Network(NetworkError::Timeout { timeout })
            } else if e.is_connect() {
                OAuth2Error::Network(NetworkError::ConnectionFailed {
                    message: e.to_string(),
                })
            } else {
                OAuth2Error::Network(NetworkError::ConnectionFailed {
                    message: e.to_string(),
                })
            }
        })?;

        let status = response.status().as_u16();
        let status_text = response
            .status()
            .canonical_reason()
            .unwrap_or("")
            .to_string();

        // Check for unexpected redirect
        if (300..400).contains(&status) {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            return Err(OAuth2Error::Protocol(ProtocolError::UnexpectedRedirect {
                location,
            }));
        }

        // Collect headers
        let mut headers = HashMap::new();
        for (key, value) in response.headers() {
            if let Ok(v) = value.to_str() {
                headers.insert(key.to_string().to_lowercase(), v.to_string());
            }
        }

        // Check content length
        if let Some(len) = response.content_length() {
            if len as usize > self.max_response_size {
                return Err(OAuth2Error::Protocol(ProtocolError::ResponseTooLarge {
                    size: len as usize,
                }));
            }
        }

        let body = response.text().await.map_err(|e| {
            OAuth2Error::Protocol(ProtocolError::InvalidResponse {
                message: e.to_string(),
            })
        })?;

        if body.len() > self.max_response_size {
            return Err(OAuth2Error::Protocol(ProtocolError::ResponseTooLarge {
                size: body.len(),
            }));
        }

        Ok(HttpResponse {
            status,
            status_text,
            headers,
            body,
        })
    }
}

/// Mock HTTP transport for testing.
#[derive(Default)]
pub struct MockHttpTransport {
    responses: std::sync::Mutex<Vec<HttpResponse>>,
    request_history: std::sync::Mutex<Vec<HttpRequest>>,
    default_response: std::sync::Mutex<Option<HttpResponse>>,
}

impl MockHttpTransport {
    /// Create new mock transport.
    pub fn new() -> Self {
        Self::default()
    }

    /// Queue a response to return.
    pub fn queue_response(&self, response: HttpResponse) -> &Self {
        self.responses.lock().unwrap().push(response);
        self
    }

    /// Queue a JSON response.
    pub fn queue_json_response<T: serde::Serialize>(&self, status: u16, body: &T) -> &Self {
        let response = HttpResponse {
            status,
            status_text: if status == 200 { "OK" } else { "Error" }.to_string(),
            headers: [("content-type".to_string(), "application/json".to_string())]
                .into_iter()
                .collect(),
            body: serde_json::to_string(body).unwrap(),
        };
        self.queue_response(response)
    }

    /// Set default response when queue is empty.
    pub fn set_default_response(&self, response: HttpResponse) -> &Self {
        *self.default_response.lock().unwrap() = Some(response);
        self
    }

    /// Get request history.
    pub fn get_requests(&self) -> Vec<HttpRequest> {
        self.request_history.lock().unwrap().clone()
    }

    /// Get last request.
    pub fn get_last_request(&self) -> Option<HttpRequest> {
        self.request_history.lock().unwrap().last().cloned()
    }

    /// Clear request history.
    pub fn clear_history(&self) {
        self.request_history.lock().unwrap().clear();
    }
}

#[async_trait]
impl HttpTransport for MockHttpTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, OAuth2Error> {
        self.request_history.lock().unwrap().push(request);

        let response = self
            .responses
            .lock()
            .unwrap()
            .pop()
            .or_else(|| self.default_response.lock().unwrap().clone());

        response.ok_or_else(|| {
            OAuth2Error::Network(NetworkError::ConnectionFailed {
                message: "No mock response available".to_string(),
            })
        })
    }
}

/// Create production HTTP transport.
pub fn create_transport(timeout: Option<Duration>) -> impl HttpTransport {
    match timeout {
        Some(t) => ReqwestHttpTransport::with_options(t, 1048576),
        None => ReqwestHttpTransport::new(),
    }
}

/// Create mock HTTP transport for testing.
pub fn create_mock_transport() -> MockHttpTransport {
    MockHttpTransport::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_transport() {
        let transport = MockHttpTransport::new();
        transport.queue_json_response(200, &serde_json::json!({"key": "value"}));

        let request = HttpRequest {
            method: HttpMethod::Get,
            url: "https://example.com".to_string(),
            headers: HashMap::new(),
            body: None,
            timeout: None,
        };

        let response = transport.send(request).await.unwrap();
        assert_eq!(response.status, 200);
        assert!(response.body.contains("value"));

        let history = transport.get_requests();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].url, "https://example.com");
    }

    #[test]
    fn test_http_method_as_str() {
        assert_eq!(HttpMethod::Get.as_str(), "GET");
        assert_eq!(HttpMethod::Post.as_str(), "POST");
        assert_eq!(HttpMethod::Put.as_str(), "PUT");
        assert_eq!(HttpMethod::Delete.as_str(), "DELETE");
    }
}
