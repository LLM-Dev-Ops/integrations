//! HTTP request types for AWS SES API.
//!
//! This module provides type-safe request building for AWS SES API calls.

use http::HeaderMap;
use serde::Serialize;
use std::collections::HashMap;

use crate::error::{SesError, SesResult};

/// HTTP methods supported by the SES API.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    /// GET request
    GET,
    /// POST request
    POST,
    /// PUT request
    PUT,
    /// DELETE request
    DELETE,
    /// PATCH request
    PATCH,
}

impl HttpMethod {
    /// Convert to reqwest Method.
    pub fn as_str(&self) -> &'static str {
        match self {
            HttpMethod::GET => "GET",
            HttpMethod::POST => "POST",
            HttpMethod::PUT => "PUT",
            HttpMethod::DELETE => "DELETE",
            HttpMethod::PATCH => "PATCH",
        }
    }
}

/// A request to the AWS SES API.
///
/// This struct represents a complete HTTP request with all necessary
/// components for making an AWS SES API call.
#[derive(Debug, Clone)]
pub struct SesRequest {
    /// HTTP method
    method: HttpMethod,

    /// Request path (e.g., "/v2/email/outbound-emails")
    path: String,

    /// Query parameters
    query_params: Vec<(String, String)>,

    /// HTTP headers
    headers: HeaderMap,

    /// Request body (if any)
    body: Option<Vec<u8>>,

    /// Content type
    content_type: Option<String>,
}

impl SesRequest {
    /// Create a new GET request.
    ///
    /// # Arguments
    ///
    /// * `path` - The API endpoint path
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    ///
    /// let request = SesRequest::get("/v2/email/identities");
    /// ```
    pub fn get(path: impl Into<String>) -> Self {
        Self::new(HttpMethod::GET, path)
    }

    /// Create a new POST request.
    ///
    /// # Arguments
    ///
    /// * `path` - The API endpoint path
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    ///
    /// let request = SesRequest::post("/v2/email/outbound-emails");
    /// ```
    pub fn post(path: impl Into<String>) -> Self {
        Self::new(HttpMethod::POST, path)
    }

    /// Create a new PUT request.
    ///
    /// # Arguments
    ///
    /// * `path` - The API endpoint path
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    ///
    /// let request = SesRequest::put("/v2/email/identities/example.com");
    /// ```
    pub fn put(path: impl Into<String>) -> Self {
        Self::new(HttpMethod::PUT, path)
    }

    /// Create a new DELETE request.
    ///
    /// # Arguments
    ///
    /// * `path` - The API endpoint path
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    ///
    /// let request = SesRequest::delete("/v2/email/identities/example.com");
    /// ```
    pub fn delete(path: impl Into<String>) -> Self {
        Self::new(HttpMethod::DELETE, path)
    }

    /// Create a new request with the specified method.
    ///
    /// # Arguments
    ///
    /// * `method` - The HTTP method
    /// * `path` - The API endpoint path
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::{SesRequest, HttpMethod};
    ///
    /// let request = SesRequest::new(HttpMethod::POST, "/v2/email/outbound-emails");
    /// ```
    pub fn new(method: HttpMethod, path: impl Into<String>) -> Self {
        Self {
            method,
            path: path.into(),
            query_params: Vec::new(),
            headers: HeaderMap::new(),
            body: None,
            content_type: None,
        }
    }

    /// Add a query parameter to the request.
    ///
    /// # Arguments
    ///
    /// * `key` - The parameter name
    /// * `value` - The parameter value
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    ///
    /// let request = SesRequest::get("/v2/email/identities")
    ///     .query("PageSize", "100")
    ///     .query("NextToken", "abc123");
    /// ```
    pub fn query(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.query_params.push((key.into(), value.into()));
        self
    }

    /// Add multiple query parameters to the request.
    ///
    /// # Arguments
    ///
    /// * `params` - An iterator of (key, value) pairs
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    /// use std::collections::HashMap;
    ///
    /// let mut params = HashMap::new();
    /// params.insert("PageSize", "100");
    /// params.insert("NextToken", "abc123");
    ///
    /// let request = SesRequest::get("/v2/email/identities")
    ///     .query_params(params);
    /// ```
    pub fn query_params<I, K, V>(mut self, params: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        for (key, value) in params {
            self.query_params.push((key.into(), value.into()));
        }
        self
    }

    /// Add a header to the request.
    ///
    /// # Arguments
    ///
    /// * `key` - The header name
    /// * `value` - The header value
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    ///
    /// let request = SesRequest::post("/v2/email/outbound-emails")
    ///     .header("Content-Type", "application/json");
    /// ```
    pub fn header(mut self, key: impl AsRef<str>, value: impl AsRef<str>) -> SesResult<Self> {
        let header_name = http::header::HeaderName::from_bytes(key.as_ref().as_bytes())
            .map_err(|e| SesError::Validation {
                message: format!("Invalid header name: {}", e),
                field: Some("header".to_string()),
            })?;

        let header_value = http::header::HeaderValue::from_str(value.as_ref())
            .map_err(|e| SesError::Validation {
                message: format!("Invalid header value: {}", e),
                field: Some("header".to_string()),
            })?;

        self.headers.insert(header_name, header_value);
        Ok(self)
    }

    /// Set the request body as raw bytes.
    ///
    /// # Arguments
    ///
    /// * `body` - The request body
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    ///
    /// let request = SesRequest::post("/v2/email/outbound-emails")
    ///     .body(b"raw body content".to_vec());
    /// ```
    pub fn body(mut self, body: Vec<u8>) -> Self {
        self.body = Some(body);
        self
    }

    /// Set the request body as JSON.
    ///
    /// This method serializes the provided value to JSON and sets it as the
    /// request body. It also sets the Content-Type header to application/json.
    ///
    /// # Arguments
    ///
    /// * `json` - A value that can be serialized to JSON
    ///
    /// # Returns
    ///
    /// The modified request or an error if serialization fails.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    /// use serde::Serialize;
    ///
    /// #[derive(Serialize)]
    /// struct SendEmailRequest {
    ///     from: String,
    ///     to: Vec<String>,
    ///     subject: String,
    /// }
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let email = SendEmailRequest {
    ///     from: "sender@example.com".to_string(),
    ///     to: vec!["recipient@example.com".to_string()],
    ///     subject: "Test".to_string(),
    /// };
    ///
    /// let request = SesRequest::post("/v2/email/outbound-emails")
    ///     .json(&email)?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn json<T: Serialize>(mut self, json: &T) -> SesResult<Self> {
        let body = serde_json::to_vec(json)?;
        self.body = Some(body);
        self.content_type = Some("application/json".to_string());
        Ok(self)
    }

    /// Get the HTTP method.
    pub fn method(&self) -> HttpMethod {
        self.method
    }

    /// Get the request path.
    pub fn path(&self) -> &str {
        &self.path
    }

    /// Get the query parameters.
    pub fn query_params(&self) -> &[(String, String)] {
        &self.query_params
    }

    /// Get the headers.
    pub fn headers(&self) -> &HeaderMap {
        &self.headers
    }

    /// Get mutable access to the headers.
    pub fn headers_mut(&mut self) -> &mut HeaderMap {
        &mut self.headers
    }

    /// Get the request body.
    pub fn body(&self) -> Option<&[u8]> {
        self.body.as_deref()
    }

    /// Get the content type.
    pub fn content_type(&self) -> Option<&str> {
        self.content_type.as_deref()
    }

    /// Build the full URL for this request.
    ///
    /// # Arguments
    ///
    /// * `endpoint` - The base endpoint URL
    ///
    /// # Returns
    ///
    /// The complete URL as a string.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesRequest;
    ///
    /// let request = SesRequest::get("/v2/email/identities")
    ///     .query("PageSize", "100");
    ///
    /// let url = request.build_url("https://email.us-east-1.amazonaws.com");
    /// assert_eq!(url, "https://email.us-east-1.amazonaws.com/v2/email/identities?PageSize=100");
    /// ```
    pub fn build_url(&self, endpoint: &str) -> String {
        let mut url = format!("{}{}", endpoint, self.path);

        if !self.query_params.is_empty() {
            url.push('?');
            let query_string = self
                .query_params
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join("&");
            url.push_str(&query_string);
        }

        url
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Serialize;

    #[test]
    fn test_http_method_as_str() {
        assert_eq!(HttpMethod::GET.as_str(), "GET");
        assert_eq!(HttpMethod::POST.as_str(), "POST");
        assert_eq!(HttpMethod::PUT.as_str(), "PUT");
        assert_eq!(HttpMethod::DELETE.as_str(), "DELETE");
        assert_eq!(HttpMethod::PATCH.as_str(), "PATCH");
    }

    #[test]
    fn test_ses_request_get() {
        let request = SesRequest::get("/v2/email/identities");
        assert_eq!(request.method(), HttpMethod::GET);
        assert_eq!(request.path(), "/v2/email/identities");
    }

    #[test]
    fn test_ses_request_post() {
        let request = SesRequest::post("/v2/email/outbound-emails");
        assert_eq!(request.method(), HttpMethod::POST);
        assert_eq!(request.path(), "/v2/email/outbound-emails");
    }

    #[test]
    fn test_ses_request_put() {
        let request = SesRequest::put("/v2/email/identities/example.com");
        assert_eq!(request.method(), HttpMethod::PUT);
        assert_eq!(request.path(), "/v2/email/identities/example.com");
    }

    #[test]
    fn test_ses_request_delete() {
        let request = SesRequest::delete("/v2/email/identities/example.com");
        assert_eq!(request.method(), HttpMethod::DELETE);
        assert_eq!(request.path(), "/v2/email/identities/example.com");
    }

    #[test]
    fn test_ses_request_query() {
        let request = SesRequest::get("/v2/email/identities")
            .query("PageSize", "100")
            .query("NextToken", "abc123");

        assert_eq!(request.query_params().len(), 2);
        assert_eq!(request.query_params()[0], ("PageSize".to_string(), "100".to_string()));
        assert_eq!(request.query_params()[1], ("NextToken".to_string(), "abc123".to_string()));
    }

    #[test]
    fn test_ses_request_query_params() {
        let mut params = HashMap::new();
        params.insert("PageSize", "100");
        params.insert("NextToken", "abc123");

        let request = SesRequest::get("/v2/email/identities")
            .query_params(params);

        assert_eq!(request.query_params().len(), 2);
    }

    #[test]
    fn test_ses_request_header() {
        let request = SesRequest::post("/v2/email/outbound-emails")
            .header("Content-Type", "application/json")
            .unwrap();

        assert!(request.headers().contains_key("content-type"));
    }

    #[test]
    fn test_ses_request_body() {
        let body = b"test body".to_vec();
        let request = SesRequest::post("/v2/email/outbound-emails")
            .body(body.clone());

        assert_eq!(request.body(), Some(body.as_slice()));
    }

    #[test]
    fn test_ses_request_json() {
        #[derive(Serialize)]
        struct TestData {
            name: String,
            value: i32,
        }

        let data = TestData {
            name: "test".to_string(),
            value: 42,
        };

        let request = SesRequest::post("/v2/email/outbound-emails")
            .json(&data)
            .unwrap();

        assert!(request.body().is_some());
        assert_eq!(request.content_type(), Some("application/json"));

        let parsed: TestData = serde_json::from_slice(request.body().unwrap()).unwrap();
        assert_eq!(parsed.name, "test");
        assert_eq!(parsed.value, 42);
    }

    #[test]
    fn test_ses_request_build_url() {
        let request = SesRequest::get("/v2/email/identities")
            .query("PageSize", "100")
            .query("NextToken", "abc123");

        let url = request.build_url("https://email.us-east-1.amazonaws.com");
        assert_eq!(
            url,
            "https://email.us-east-1.amazonaws.com/v2/email/identities?PageSize=100&NextToken=abc123"
        );
    }

    #[test]
    fn test_ses_request_build_url_no_query() {
        let request = SesRequest::get("/v2/email/identities");

        let url = request.build_url("https://email.us-east-1.amazonaws.com");
        assert_eq!(
            url,
            "https://email.us-east-1.amazonaws.com/v2/email/identities"
        );
    }

    #[test]
    fn test_ses_request_headers_mut() {
        let mut request = SesRequest::post("/v2/email/outbound-emails");

        let header_name = http::header::HeaderName::from_static("x-custom-header");
        let header_value = http::header::HeaderValue::from_static("custom-value");
        request.headers_mut().insert(header_name.clone(), header_value.clone());

        assert_eq!(
            request.headers().get(&header_name).unwrap(),
            &header_value
        );
    }
}
