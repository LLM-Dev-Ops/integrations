//! HTTP response handling for AWS SES API.
//!
//! This module provides response parsing and error extraction for AWS SES API calls.

use http::StatusCode;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::{SesError, SesResult};

/// A response from the AWS SES API.
///
/// This struct wraps the HTTP response and provides convenient methods
/// for parsing JSON data and extracting metadata.
#[derive(Debug, Clone)]
pub struct SesResponse {
    /// HTTP status code
    status: StatusCode,

    /// Response headers
    headers: HashMap<String, String>,

    /// Response body
    body: Vec<u8>,

    /// AWS request ID (from x-amzn-RequestId header)
    request_id: Option<String>,
}

impl SesResponse {
    /// Create a new response.
    ///
    /// # Arguments
    ///
    /// * `status` - HTTP status code
    /// * `headers` - Response headers
    /// * `body` - Response body
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// let response = SesResponse::new(
    ///     StatusCode::OK,
    ///     HashMap::new(),
    ///     b"response body".to_vec()
    /// );
    /// ```
    pub fn new(
        status: StatusCode,
        headers: HashMap<String, String>,
        body: Vec<u8>,
    ) -> Self {
        // Extract request ID from headers
        let request_id = headers
            .get("x-amzn-requestid")
            .or_else(|| headers.get("x-amzn-request-id"))
            .or_else(|| headers.get("x-amz-request-id"))
            .cloned();

        Self {
            status,
            headers,
            body,
            request_id,
        }
    }

    /// Create a response from a reqwest Response.
    ///
    /// # Arguments
    ///
    /// * `response` - The reqwest response
    ///
    /// # Returns
    ///
    /// A new `SesResponse` or an error if reading the body fails.
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use integrations_aws_ses::http::SesResponse;
    /// use reqwest::Response;
    ///
    /// async fn from_reqwest(response: Response) -> Result<SesResponse, Box<dyn std::error::Error>> {
    ///     let ses_response = SesResponse::from_reqwest(response).await?;
    ///     Ok(ses_response)
    /// }
    /// ```
    pub async fn from_reqwest(response: reqwest::Response) -> SesResult<Self> {
        let status = response.status();

        // Extract headers
        let mut headers = HashMap::new();
        for (name, value) in response.headers() {
            if let Ok(value_str) = value.to_str() {
                headers.insert(name.as_str().to_lowercase(), value_str.to_string());
            }
        }

        // Read body
        let body = response
            .bytes()
            .await
            .map_err(|e| SesError::Transport {
                message: format!("Failed to read response body: {}", e),
                source: Some(Box::new(e)),
                retryable: true,
            })?
            .to_vec();

        Ok(Self::new(status, headers, body))
    }

    /// Get the HTTP status code.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// let response = SesResponse::new(StatusCode::OK, HashMap::new(), vec![]);
    /// assert_eq!(response.status(), StatusCode::OK);
    /// ```
    pub fn status(&self) -> StatusCode {
        self.status
    }

    /// Get a header value.
    ///
    /// # Arguments
    ///
    /// * `name` - The header name (case-insensitive)
    ///
    /// # Returns
    ///
    /// The header value if present, None otherwise.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// let mut headers = HashMap::new();
    /// headers.insert("content-type".to_string(), "application/json".to_string());
    ///
    /// let response = SesResponse::new(StatusCode::OK, headers, vec![]);
    /// assert_eq!(response.header("content-type"), Some("application/json"));
    /// ```
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(&name.to_lowercase()).map(|s| s.as_str())
    }

    /// Get all headers.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// let mut headers = HashMap::new();
    /// headers.insert("content-type".to_string(), "application/json".to_string());
    ///
    /// let response = SesResponse::new(StatusCode::OK, headers.clone(), vec![]);
    /// assert_eq!(response.headers(), &headers);
    /// ```
    pub fn headers(&self) -> &HashMap<String, String> {
        &self.headers
    }

    /// Get the response body as bytes.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// let body = b"response body".to_vec();
    /// let response = SesResponse::new(StatusCode::OK, HashMap::new(), body.clone());
    /// assert_eq!(response.body(), &body);
    /// ```
    pub fn body(&self) -> &[u8] {
        &self.body
    }

    /// Get the response body as a UTF-8 string.
    ///
    /// # Returns
    ///
    /// The body as a string, or an error if it's not valid UTF-8.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// let response = SesResponse::new(
    ///     StatusCode::OK,
    ///     HashMap::new(),
    ///     b"response body".to_vec()
    /// );
    /// assert_eq!(response.body_string().unwrap(), "response body");
    /// ```
    pub fn body_string(&self) -> SesResult<&str> {
        std::str::from_utf8(&self.body).map_err(|e| SesError::Serialization {
            message: format!("Response body is not valid UTF-8: {}", e),
        })
    }

    /// Parse the response body as JSON.
    ///
    /// # Returns
    ///
    /// The deserialized JSON value or an error if parsing fails.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    /// use serde::Deserialize;
    ///
    /// #[derive(Deserialize)]
    /// struct ApiResponse {
    ///     message: String,
    /// }
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let body = r#"{"message": "success"}"#.as_bytes().to_vec();
    /// let response = SesResponse::new(StatusCode::OK, HashMap::new(), body);
    ///
    /// let data: ApiResponse = response.json()?;
    /// assert_eq!(data.message, "success");
    /// # Ok(())
    /// # }
    /// ```
    pub fn json<T: DeserializeOwned>(&self) -> SesResult<T> {
        serde_json::from_slice(&self.body).map_err(Into::into)
    }

    /// Get the AWS request ID.
    ///
    /// This can be used for debugging and support requests.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// let mut headers = HashMap::new();
    /// headers.insert("x-amzn-requestid".to_string(), "abc-123".to_string());
    ///
    /// let response = SesResponse::new(StatusCode::OK, headers, vec![]);
    /// assert_eq!(response.request_id(), Some("abc-123"));
    /// ```
    pub fn request_id(&self) -> Option<&str> {
        self.request_id.as_deref()
    }

    /// Check if the response indicates success.
    ///
    /// # Returns
    ///
    /// `true` if the status code is in the 2xx range.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// let response = SesResponse::new(StatusCode::OK, HashMap::new(), vec![]);
    /// assert!(response.is_success());
    ///
    /// let error_response = SesResponse::new(StatusCode::BAD_REQUEST, HashMap::new(), vec![]);
    /// assert!(!error_response.is_success());
    /// ```
    pub fn is_success(&self) -> bool {
        self.status.is_success()
    }

    /// Extract error information from the response.
    ///
    /// This parses AWS error responses and converts them to SesError.
    ///
    /// # Returns
    ///
    /// A `SesError` with error details from the response.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let error_body = r#"{
    ///     "__type": "MessageRejected",
    ///     "message": "Email address is not verified"
    /// }"#.as_bytes().to_vec();
    ///
    /// let response = SesResponse::new(StatusCode::BAD_REQUEST, HashMap::new(), error_body);
    /// let error = response.into_error();
    /// # Ok(())
    /// # }
    /// ```
    pub fn into_error(self) -> SesError {
        // Try to parse as JSON error response
        if let Ok(error_response) = serde_json::from_slice::<AwsErrorResponse>(&self.body) {
            return self.error_from_aws_response(error_response);
        }

        // Fallback to generic error based on status code
        self.error_from_status_code()
    }

    /// Convert AWS error response to SesError.
    fn error_from_aws_response(&self, error: AwsErrorResponse) -> SesError {
        let code = error.type_field.unwrap_or_else(|| "Unknown".to_string());
        let message = error.message.unwrap_or_else(|| "Unknown error".to_string());

        // Determine if the error is retryable
        let retryable = match self.status.as_u16() {
            500..=599 => true, // Server errors are retryable
            429 => true,       // Rate limiting is retryable
            _ => false,
        };

        SesError::AwsApi {
            code,
            message,
            request_id: self.request_id.clone(),
            retryable,
        }
    }

    /// Convert status code to SesError.
    fn error_from_status_code(&self) -> SesError {
        let message = self.body_string().unwrap_or("Unknown error").to_string();
        let retryable = self.status.is_server_error() || self.status == StatusCode::TOO_MANY_REQUESTS;

        SesError::AwsApi {
            code: self.status.as_u16().to_string(),
            message,
            request_id: self.request_id.clone(),
            retryable,
        }
    }

    /// Extract pagination token from response.
    ///
    /// Many AWS SES API operations support pagination. This method extracts
    /// the NextToken field if present.
    ///
    /// # Returns
    ///
    /// The next token for pagination, if present.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::SesResponse;
    /// use http::StatusCode;
    /// use std::collections::HashMap;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let body = r#"{
    ///     "Identities": [],
    ///     "NextToken": "abc123"
    /// }"#.as_bytes().to_vec();
    ///
    /// let response = SesResponse::new(StatusCode::OK, HashMap::new(), body);
    /// let token = response.pagination_token()?;
    /// assert_eq!(token, Some("abc123".to_string()));
    /// # Ok(())
    /// # }
    /// ```
    pub fn pagination_token(&self) -> SesResult<Option<String>> {
        #[derive(Deserialize)]
        struct PaginationResponse {
            #[serde(rename = "NextToken")]
            next_token: Option<String>,
        }

        if self.body.is_empty() {
            return Ok(None);
        }

        match serde_json::from_slice::<PaginationResponse>(&self.body) {
            Ok(resp) => Ok(resp.next_token),
            Err(_) => Ok(None), // No pagination token present
        }
    }
}

/// AWS error response structure.
///
/// This represents the JSON structure of AWS API error responses.
#[derive(Debug, Clone, Deserialize, Serialize)]
struct AwsErrorResponse {
    /// Error type (e.g., "MessageRejected", "Throttling")
    #[serde(rename = "__type")]
    type_field: Option<String>,

    /// Error message
    #[serde(rename = "message")]
    message: Option<String>,

    /// Additional error details
    #[serde(flatten)]
    extra: HashMap<String, serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ses_response_new() {
        let response = SesResponse::new(
            StatusCode::OK,
            HashMap::new(),
            b"test body".to_vec(),
        );

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body(), b"test body");
    }

    #[test]
    fn test_ses_response_header() {
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/json".to_string());

        let response = SesResponse::new(StatusCode::OK, headers, vec![]);

        assert_eq!(response.header("content-type"), Some("application/json"));
        assert_eq!(response.header("Content-Type"), Some("application/json"));
        assert_eq!(response.header("missing"), None);
    }

    #[test]
    fn test_ses_response_body_string() {
        let response = SesResponse::new(
            StatusCode::OK,
            HashMap::new(),
            b"test body".to_vec(),
        );

        assert_eq!(response.body_string().unwrap(), "test body");
    }

    #[test]
    fn test_ses_response_json() {
        #[derive(Deserialize)]
        struct TestData {
            name: String,
            value: i32,
        }

        let body = r#"{"name": "test", "value": 42}"#.as_bytes().to_vec();
        let response = SesResponse::new(StatusCode::OK, HashMap::new(), body);

        let data: TestData = response.json().unwrap();
        assert_eq!(data.name, "test");
        assert_eq!(data.value, 42);
    }

    #[test]
    fn test_ses_response_request_id() {
        let mut headers = HashMap::new();
        headers.insert("x-amzn-requestid".to_string(), "abc-123".to_string());

        let response = SesResponse::new(StatusCode::OK, headers, vec![]);

        assert_eq!(response.request_id(), Some("abc-123"));
    }

    #[test]
    fn test_ses_response_request_id_alternate_headers() {
        let mut headers = HashMap::new();
        headers.insert("x-amz-request-id".to_string(), "xyz-789".to_string());

        let response = SesResponse::new(StatusCode::OK, headers, vec![]);

        assert_eq!(response.request_id(), Some("xyz-789"));
    }

    #[test]
    fn test_ses_response_is_success() {
        let success = SesResponse::new(StatusCode::OK, HashMap::new(), vec![]);
        assert!(success.is_success());

        let error = SesResponse::new(StatusCode::BAD_REQUEST, HashMap::new(), vec![]);
        assert!(!error.is_success());
    }

    #[test]
    fn test_ses_response_into_error_with_json() {
        let error_body = r#"{
            "__type": "MessageRejected",
            "message": "Email address is not verified"
        }"#
        .as_bytes()
        .to_vec();

        let response = SesResponse::new(StatusCode::BAD_REQUEST, HashMap::new(), error_body);
        let error = response.into_error();

        assert_eq!(error.error_code(), Some("MessageRejected"));
        assert!(!error.is_retryable());
    }

    #[test]
    fn test_ses_response_into_error_without_json() {
        let response = SesResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            HashMap::new(),
            b"Internal error".to_vec(),
        );
        let error = response.into_error();

        assert!(error.is_retryable());
    }

    #[test]
    fn test_ses_response_pagination_token() {
        let body = r#"{
            "Identities": [],
            "NextToken": "abc123"
        }"#
        .as_bytes()
        .to_vec();

        let response = SesResponse::new(StatusCode::OK, HashMap::new(), body);
        let token = response.pagination_token().unwrap();

        assert_eq!(token, Some("abc123".to_string()));
    }

    #[test]
    fn test_ses_response_pagination_token_missing() {
        let body = r#"{
            "Identities": []
        }"#
        .as_bytes()
        .to_vec();

        let response = SesResponse::new(StatusCode::OK, HashMap::new(), body);
        let token = response.pagination_token().unwrap();

        assert_eq!(token, None);
    }

    #[test]
    fn test_ses_response_pagination_token_empty_body() {
        let response = SesResponse::new(StatusCode::OK, HashMap::new(), vec![]);
        let token = response.pagination_token().unwrap();

        assert_eq!(token, None);
    }
}
