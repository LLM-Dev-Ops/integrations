//! HTTP request builder for the Gemini API.
//!
//! This module provides the `RequestBuilder` for constructing HTTP requests
//! with proper authentication, headers, and URL formatting.

use bytes::Bytes;
use serde::Serialize;
use std::collections::HashMap;
use url::Url;

use crate::auth::AuthManager;
use crate::error::GeminiError;
use super::http::{HttpRequest, HttpMethod};

/// Builder for constructing HTTP requests to the Gemini API.
///
/// The `RequestBuilder` handles:
/// - URL construction with API version prefixes
/// - Authentication via the configured auth manager
/// - Header management (Content-Type, custom headers)
/// - Request body serialization
#[derive(Clone)]
pub struct RequestBuilder {
    /// Base URL for the API.
    base_url: Url,
    /// API version (e.g., "v1beta").
    api_version: String,
    /// Authentication manager.
    auth_manager: Box<dyn AuthManager>,
}

impl RequestBuilder {
    /// Creates a new request builder.
    ///
    /// # Arguments
    ///
    /// * `base_url` - The base URL for the API
    /// * `api_version` - The API version to use (e.g., "v1beta")
    /// * `auth_manager` - The authentication manager
    ///
    /// # Example
    ///
    /// ```no_run
    /// use integrations_gemini::transport::RequestBuilder;
    /// use integrations_gemini::auth::ApiKeyAuthManager;
    /// use integrations_gemini::config::{GeminiConfig, AuthMethod};
    /// use secrecy::SecretString;
    /// use url::Url;
    ///
    /// let config = GeminiConfig::builder()
    ///     .api_key(SecretString::new("test-key".into()))
    ///     .build()
    ///     .unwrap();
    ///
    /// let auth_manager = ApiKeyAuthManager::from_config(&config);
    /// let builder = RequestBuilder::new(
    ///     config.base_url.clone(),
    ///     config.api_version.clone(),
    ///     Box::new(auth_manager),
    /// );
    /// ```
    pub fn new(
        base_url: Url,
        api_version: String,
        auth_manager: Box<dyn AuthManager>,
    ) -> Self {
        Self {
            base_url,
            api_version,
            auth_manager,
        }
    }

    /// Builds a complete URL for the given path.
    ///
    /// This method:
    /// - Prepends the API version to the path
    /// - Joins the path with the base URL
    /// - Adds authentication query parameters if needed
    ///
    /// # Arguments
    ///
    /// * `path` - The endpoint path (e.g., "/models/gemini-pro:generateContent")
    ///
    /// # Returns
    ///
    /// A `Result` containing the complete URL or a `GeminiError`
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_gemini::transport::RequestBuilder;
    /// # use integrations_gemini::auth::ApiKeyAuthManager;
    /// # use integrations_gemini::config::GeminiConfig;
    /// # use secrecy::SecretString;
    /// # let config = GeminiConfig::builder()
    /// #     .api_key(SecretString::new("test-key".into()))
    /// #     .build()
    /// #     .unwrap();
    /// # let auth_manager = ApiKeyAuthManager::from_config(&config);
    /// # let builder = RequestBuilder::new(
    /// #     config.base_url.clone(),
    /// #     config.api_version.clone(),
    /// #     Box::new(auth_manager),
    /// # );
    /// let url = builder.build_url("/models/gemini-pro:generateContent").unwrap();
    /// // url will be: https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent
    /// ```
    pub fn build_url(&self, path: &str) -> Result<Url, GeminiError> {
        // Remove leading slash if present
        let path = path.trim_start_matches('/');

        // Construct the full path with API version
        let full_path = format!("{}/{}", self.api_version, path);

        // Join with base URL
        let mut url = self.base_url.join(&full_path)?;

        // Add authentication query parameter if needed
        if let Some((key, value)) = self.auth_manager.get_auth_query_param() {
            url.query_pairs_mut().append_pair(&key, &value);
        }

        Ok(url)
    }

    /// Builds an HTTP request with the given parameters.
    ///
    /// This method:
    /// - Constructs the full URL
    /// - Serializes the request body to JSON
    /// - Adds required headers (Content-Type, authentication)
    /// - Merges any extra headers
    ///
    /// # Arguments
    ///
    /// * `method` - The HTTP method (GET, POST, etc.)
    /// * `path` - The endpoint path
    /// * `body` - Optional request body (will be serialized to JSON)
    /// * `extra_headers` - Optional additional headers
    ///
    /// # Returns
    ///
    /// A `Result` containing the `HttpRequest` or a `GeminiError`
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_gemini::transport::{RequestBuilder, HttpMethod};
    /// # use integrations_gemini::auth::ApiKeyAuthManager;
    /// # use integrations_gemini::config::GeminiConfig;
    /// # use secrecy::SecretString;
    /// # use serde::Serialize;
    /// # use std::collections::HashMap;
    /// # let config = GeminiConfig::builder()
    /// #     .api_key(SecretString::new("test-key".into()))
    /// #     .build()
    /// #     .unwrap();
    /// # let auth_manager = ApiKeyAuthManager::from_config(&config);
    /// # let builder = RequestBuilder::new(
    /// #     config.base_url.clone(),
    /// #     config.api_version.clone(),
    /// #     Box::new(auth_manager),
    /// # );
    /// #[derive(Serialize)]
    /// struct GenerateRequest {
    ///     prompt: String,
    /// }
    ///
    /// let body = GenerateRequest {
    ///     prompt: "Hello".to_string(),
    /// };
    ///
    /// let request = builder.build_request(
    ///     HttpMethod::Post,
    ///     "/models/gemini-pro:generateContent",
    ///     Some(&body),
    ///     None,
    /// ).unwrap();
    /// ```
    pub fn build_request<T: Serialize>(
        &self,
        method: HttpMethod,
        path: &str,
        body: Option<&T>,
        extra_headers: Option<HashMap<String, String>>,
    ) -> Result<HttpRequest, GeminiError> {
        let url = self.build_url(path)?;

        let mut headers = HashMap::new();

        // Add Content-Type header if there's a body
        if body.is_some() {
            headers.insert("Content-Type".to_string(), "application/json".to_string());
        }

        // Add authentication header if needed
        if let Some((key, value)) = self.auth_manager.get_auth_header() {
            headers.insert(key, value);
        }

        // Merge extra headers
        if let Some(extra) = extra_headers {
            headers.extend(extra);
        }

        // Serialize body to JSON if present
        let body_bytes = if let Some(body) = body {
            let json = serde_json::to_vec(body)?;
            Some(Bytes::from(json))
        } else {
            None
        };

        Ok(HttpRequest {
            method,
            url: url.to_string(),
            headers,
            body: body_bytes,
        })
    }

    /// Builds a streaming HTTP request.
    ///
    /// This is a convenience method that calls `build_request` with POST method
    /// and is specifically designed for streaming endpoints.
    ///
    /// # Arguments
    ///
    /// * `path` - The endpoint path (typically a streaming endpoint)
    /// * `body` - The request body (will be serialized to JSON)
    ///
    /// # Returns
    ///
    /// A `Result` containing the `HttpRequest` or a `GeminiError`
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_gemini::transport::RequestBuilder;
    /// # use integrations_gemini::auth::ApiKeyAuthManager;
    /// # use integrations_gemini::config::GeminiConfig;
    /// # use secrecy::SecretString;
    /// # use serde::Serialize;
    /// # let config = GeminiConfig::builder()
    /// #     .api_key(SecretString::new("test-key".into()))
    /// #     .build()
    /// #     .unwrap();
    /// # let auth_manager = ApiKeyAuthManager::from_config(&config);
    /// # let builder = RequestBuilder::new(
    /// #     config.base_url.clone(),
    /// #     config.api_version.clone(),
    /// #     Box::new(auth_manager),
    /// # );
    /// #[derive(Serialize)]
    /// struct StreamRequest {
    ///     prompt: String,
    /// }
    ///
    /// let body = StreamRequest {
    ///     prompt: "Tell me a story".to_string(),
    /// };
    ///
    /// let request = builder.build_streaming_request(
    ///     "/models/gemini-pro:streamGenerateContent",
    ///     &body,
    /// ).unwrap();
    /// ```
    pub fn build_streaming_request<T: Serialize>(
        &self,
        path: &str,
        body: &T,
    ) -> Result<HttpRequest, GeminiError> {
        self.build_request(HttpMethod::Post, path, Some(body), None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::ApiKeyAuthManager;
    use crate::config::{AuthMethod, GeminiConfig};
    use secrecy::SecretString;
    use serde::Serialize;

    #[derive(Serialize)]
    struct TestBody {
        message: String,
    }

    fn create_test_builder(auth_method: AuthMethod) -> RequestBuilder {
        let config = GeminiConfig::builder()
            .api_key(SecretString::new("test-api-key".into()))
            .auth_method(auth_method)
            .build()
            .unwrap();

        let auth_manager = ApiKeyAuthManager::from_config(&config);

        RequestBuilder::new(
            config.base_url,
            config.api_version,
            Box::new(auth_manager),
        )
    }

    #[test]
    fn test_build_url_with_version() {
        let builder = create_test_builder(AuthMethod::Header);
        let url = builder.build_url("/models/gemini-pro:generateContent").unwrap();

        assert!(url.as_str().contains("/v1beta/models/gemini-pro:generateContent"));
    }

    #[test]
    fn test_build_url_with_query_param_auth() {
        let builder = create_test_builder(AuthMethod::QueryParam);
        let url = builder.build_url("/models").unwrap();

        assert!(url.query().is_some());
        assert!(url.query().unwrap().contains("key=test-api-key"));
    }

    #[test]
    fn test_build_url_strips_leading_slash() {
        let builder = create_test_builder(AuthMethod::Header);
        let url1 = builder.build_url("/models").unwrap();
        let url2 = builder.build_url("models").unwrap();

        assert_eq!(url1, url2);
    }

    #[test]
    fn test_build_request_with_body() {
        let builder = create_test_builder(AuthMethod::Header);
        let body = TestBody {
            message: "test".to_string(),
        };

        let request = builder.build_request(
            HttpMethod::Post,
            "/models/gemini-pro:generateContent",
            Some(&body),
            None,
        ).unwrap();

        assert_eq!(request.method, HttpMethod::Post);
        assert!(request.headers.contains_key("Content-Type"));
        assert_eq!(request.headers.get("Content-Type").unwrap(), "application/json");
        assert!(request.body.is_some());
    }

    #[test]
    fn test_build_request_with_header_auth() {
        let builder = create_test_builder(AuthMethod::Header);
        let request = builder.build_request::<TestBody>(
            HttpMethod::Get,
            "/models",
            None,
            None,
        ).unwrap();

        assert!(request.headers.contains_key("x-goog-api-key"));
        assert_eq!(request.headers.get("x-goog-api-key").unwrap(), "test-api-key");
    }

    #[test]
    fn test_build_request_with_extra_headers() {
        let builder = create_test_builder(AuthMethod::Header);
        let mut extra = HashMap::new();
        extra.insert("X-Custom-Header".to_string(), "custom-value".to_string());

        let request = builder.build_request::<TestBody>(
            HttpMethod::Get,
            "/models",
            None,
            Some(extra),
        ).unwrap();

        assert!(request.headers.contains_key("X-Custom-Header"));
        assert_eq!(request.headers.get("X-Custom-Header").unwrap(), "custom-value");
    }

    #[test]
    fn test_build_streaming_request() {
        let builder = create_test_builder(AuthMethod::Header);
        let body = TestBody {
            message: "stream test".to_string(),
        };

        let request = builder.build_streaming_request(
            "/models/gemini-pro:streamGenerateContent",
            &body,
        ).unwrap();

        assert_eq!(request.method, HttpMethod::Post);
        assert!(request.body.is_some());
    }

    #[test]
    fn test_build_request_without_body() {
        let builder = create_test_builder(AuthMethod::Header);
        let request = builder.build_request::<TestBody>(
            HttpMethod::Get,
            "/models",
            None,
            None,
        ).unwrap();

        // Should not have Content-Type when no body
        assert!(!request.headers.contains_key("Content-Type"));
        assert!(request.body.is_none());
    }
}
