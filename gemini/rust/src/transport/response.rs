//! HTTP response parser for the Gemini API.
//!
//! This module provides the `ResponseParser` for parsing HTTP responses,
//! handling errors, and extracting metadata like retry-after headers.

use serde::de::DeserializeOwned;
use std::time::Duration;

use crate::error::{
    GeminiError, AuthenticationError, RequestError, RateLimitError,
    ServerError, ResponseError, ResourceError, ValidationDetail,
};
use super::http::HttpResponse;

/// Parser for HTTP responses from the Gemini API.
///
/// The `ResponseParser` handles:
/// - Successful response deserialization
/// - Error response parsing and mapping to error types
/// - Retry-after header extraction
/// - Request ID extraction for debugging
pub struct ResponseParser;

impl ResponseParser {
    /// Parses a successful HTTP response into the expected type.
    ///
    /// # Arguments
    ///
    /// * `response` - The HTTP response to parse
    ///
    /// # Returns
    ///
    /// A `Result` containing the deserialized response or a `GeminiError`
    ///
    /// # Example
    ///
    /// ```no_run
    /// use integrations_gemini::transport::{ResponseParser, HttpResponse};
    /// use bytes::Bytes;
    /// use serde::Deserialize;
    /// use std::collections::HashMap;
    ///
    /// #[derive(Deserialize)]
    /// struct ModelResponse {
    ///     name: String,
    /// }
    ///
    /// let response = HttpResponse {
    ///     status: 200,
    ///     headers: HashMap::new(),
    ///     body: Bytes::from(r#"{"name":"gemini-pro"}"#),
    /// };
    ///
    /// let parsed: ModelResponse = ResponseParser::parse_response(response).unwrap();
    /// assert_eq!(parsed.name, "gemini-pro");
    /// ```
    pub fn parse_response<T: DeserializeOwned>(response: HttpResponse) -> Result<T, GeminiError> {
        // Check if the status code indicates success
        if response.status >= 200 && response.status < 300 {
            // Deserialize the response body
            let parsed: T = serde_json::from_slice(&response.body)?;
            Ok(parsed)
        } else {
            // Parse error response
            Err(Self::parse_error_response(response))
        }
    }

    /// Parses an error response and maps it to the appropriate error type.
    ///
    /// This method uses the enhanced error mapper to parse the response body
    /// and map HTTP status codes to specific error variants with detailed information:
    /// - 400 -> RequestError::ValidationError (with field-level details)
    /// - 401 -> AuthenticationError::InvalidApiKey
    /// - 403 -> AuthenticationError::QuotaExceeded or PermissionDenied
    /// - 404 -> ResourceError::NotFound (model, file, or cached content)
    /// - 413 -> RequestError::PayloadTooLarge (with size info)
    /// - 415 -> RequestError::UnsupportedMediaType (with MIME type)
    /// - 429 -> RateLimitError::TooManyRequests (with retry_after)
    /// - 500 -> ServerError::InternalError
    /// - 503 -> ServerError::ServiceUnavailable or ModelOverloaded
    ///
    /// # Arguments
    ///
    /// * `response` - The HTTP error response
    ///
    /// # Returns
    ///
    /// A `GeminiError` representing the error with all available details
    pub fn parse_error_response(response: HttpResponse) -> GeminiError {
        let retry_after = Self::parse_retry_after(&response.headers);
        let request_id = Self::extract_request_id(&response.headers);

        // Use the enhanced mapper to parse the error response body
        use crate::error::map_http_status_with_body;
        let mut error = map_http_status_with_body(response.status, &response.body);

        // Update retry_after from headers for rate limit errors
        if let GeminiError::RateLimit(ref mut rate_limit_error) = error {
            match rate_limit_error {
                RateLimitError::TooManyRequests { retry_after: ref mut ra } => {
                    *ra = retry_after;
                }
                RateLimitError::QuotaExceeded { retry_after: ref mut ra } => {
                    *ra = retry_after;
                }
                _ => {}
            }
        }

        // Update retry_after from headers for server errors
        if let GeminiError::Server(ref mut server_error) = error {
            if let ServerError::ServiceUnavailable { retry_after: ref mut ra } = server_error {
                *ra = retry_after;
            }
        }

        // Log request ID if available for debugging
        if let Some(ref id) = request_id {
            tracing::debug!(
                request_id = %id,
                status = response.status,
                error = ?error,
                "API error occurred"
            );
        }

        error
    }

    /// Parses the Retry-After header from the response.
    ///
    /// The Retry-After header can be in two formats:
    /// - Delay in seconds (e.g., "120")
    /// - HTTP date (not currently supported)
    ///
    /// # Arguments
    ///
    /// * `headers` - The response headers
    ///
    /// # Returns
    ///
    /// An `Option<Duration>` containing the retry delay if present
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_gemini::transport::ResponseParser;
    /// use std::collections::HashMap;
    /// use std::time::Duration;
    ///
    /// let mut headers = HashMap::new();
    /// headers.insert("retry-after".to_string(), "60".to_string());
    ///
    /// let retry_after = ResponseParser::parse_retry_after(&headers);
    /// assert_eq!(retry_after, Some(Duration::from_secs(60)));
    /// ```
    pub fn parse_retry_after(headers: &std::collections::HashMap<String, String>) -> Option<Duration> {
        // Check for Retry-After header (case-insensitive)
        for (key, value) in headers {
            if key.to_lowercase() == "retry-after" {
                // Try to parse as seconds
                if let Ok(seconds) = value.parse::<u64>() {
                    return Some(Duration::from_secs(seconds));
                }
                // Could also parse HTTP date format here if needed
            }
        }
        None
    }

    /// Extracts the request ID from response headers for debugging.
    ///
    /// The request ID can be used to track requests in logs and when
    /// contacting support.
    ///
    /// # Arguments
    ///
    /// * `headers` - The response headers
    ///
    /// # Returns
    ///
    /// An `Option<String>` containing the request ID if present
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_gemini::transport::ResponseParser;
    /// use std::collections::HashMap;
    ///
    /// let mut headers = HashMap::new();
    /// headers.insert("x-request-id".to_string(), "abc123".to_string());
    ///
    /// let request_id = ResponseParser::extract_request_id(&headers);
    /// assert_eq!(request_id, Some("abc123".to_string()));
    /// ```
    pub fn extract_request_id(headers: &std::collections::HashMap<String, String>) -> Option<String> {
        // Common request ID header names (case-insensitive)
        let possible_headers = ["x-request-id", "x-goog-request-id", "request-id"];

        for (key, value) in headers {
            let key_lower = key.to_lowercase();
            if possible_headers.contains(&key_lower.as_str()) {
                return Some(value.clone());
            }
        }
        None
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use serde::Deserialize;
    use std::collections::HashMap;

    #[derive(Deserialize, Debug, PartialEq)]
    struct TestResponse {
        name: String,
        value: i32,
    }

    fn create_response(status: u16, body: &str) -> HttpResponse {
        HttpResponse {
            status,
            headers: HashMap::new(),
            body: Bytes::from(body.to_string()),
        }
    }

    #[test]
    fn test_parse_successful_response() {
        let response = create_response(200, r#"{"name":"test","value":42}"#);
        let parsed: TestResponse = ResponseParser::parse_response(response).unwrap();

        assert_eq!(parsed.name, "test");
        assert_eq!(parsed.value, 42);
    }

    #[test]
    fn test_parse_400_validation_error() {
        let response = create_response(400, r#"{"error":{"message":"Invalid request"}}"#);
        let error = ResponseParser::parse_response::<TestResponse>(response).unwrap_err();

        assert!(matches!(error, GeminiError::Request(RequestError::ValidationError { .. })));
    }

    #[test]
    fn test_parse_401_auth_error() {
        let response = create_response(401, r#"{"error":{"message":"Invalid API key"}}"#);
        let error = ResponseParser::parse_response::<TestResponse>(response).unwrap_err();

        assert!(matches!(error, GeminiError::Authentication(AuthenticationError::InvalidApiKey)));
    }

    #[test]
    fn test_parse_403_quota_error() {
        let response = create_response(403, r#"{"error":{"message":"Quota exceeded"}}"#);
        let error = ResponseParser::parse_response::<TestResponse>(response).unwrap_err();

        assert!(matches!(error, GeminiError::Authentication(AuthenticationError::QuotaExceeded)));
    }

    #[test]
    fn test_parse_404_model_not_found() {
        let response = create_response(404, r#"{"error":{"message":"Model 'gemini-fake' not found"}}"#);
        let error = ResponseParser::parse_response::<TestResponse>(response).unwrap_err();

        assert!(matches!(error, GeminiError::Resource(ResourceError::ModelNotFound { .. })));
    }

    #[test]
    fn test_parse_429_rate_limit() {
        let mut headers = HashMap::new();
        headers.insert("retry-after".to_string(), "60".to_string());

        let response = HttpResponse {
            status: 429,
            headers,
            body: Bytes::from(r#"{"error":{"message":"Too many requests"}}"#),
        };

        let error = ResponseParser::parse_response::<TestResponse>(response).unwrap_err();

        assert!(matches!(error, GeminiError::RateLimit(RateLimitError::TooManyRequests { .. })));
        assert_eq!(error.retry_after(), Some(Duration::from_secs(60)));
    }

    #[test]
    fn test_parse_500_internal_error() {
        let response = create_response(500, r#"{"error":{"message":"Internal server error"}}"#);
        let error = ResponseParser::parse_response::<TestResponse>(response).unwrap_err();

        assert!(matches!(error, GeminiError::Server(ServerError::InternalError { .. })));
    }

    #[test]
    fn test_parse_503_service_unavailable() {
        let response = create_response(503, r#"{"error":{"message":"Service unavailable"}}"#);
        let error = ResponseParser::parse_response::<TestResponse>(response).unwrap_err();

        assert!(matches!(error, GeminiError::Server(ServerError::ServiceUnavailable { .. })));
    }

    #[test]
    fn test_parse_503_model_overloaded() {
        let response = create_response(503, r#"{"error":{"message":"Model 'gemini-pro' is overloaded"}}"#);
        let error = ResponseParser::parse_response::<TestResponse>(response).unwrap_err();

        assert!(matches!(error, GeminiError::Server(ServerError::ModelOverloaded { .. })));
    }

    #[test]
    fn test_parse_retry_after_seconds() {
        let mut headers = HashMap::new();
        headers.insert("retry-after".to_string(), "120".to_string());

        let retry_after = ResponseParser::parse_retry_after(&headers);
        assert_eq!(retry_after, Some(Duration::from_secs(120)));
    }

    #[test]
    fn test_parse_retry_after_missing() {
        let headers = HashMap::new();
        let retry_after = ResponseParser::parse_retry_after(&headers);
        assert_eq!(retry_after, None);
    }

    #[test]
    fn test_parse_retry_after_case_insensitive() {
        let mut headers = HashMap::new();
        headers.insert("Retry-After".to_string(), "30".to_string());

        let retry_after = ResponseParser::parse_retry_after(&headers);
        assert_eq!(retry_after, Some(Duration::from_secs(30)));
    }

    #[test]
    fn test_extract_request_id() {
        let mut headers = HashMap::new();
        headers.insert("x-request-id".to_string(), "abc123".to_string());

        let request_id = ResponseParser::extract_request_id(&headers);
        assert_eq!(request_id, Some("abc123".to_string()));
    }

    #[test]
    fn test_extract_request_id_case_insensitive() {
        let mut headers = HashMap::new();
        headers.insert("X-Request-ID".to_string(), "xyz789".to_string());

        let request_id = ResponseParser::extract_request_id(&headers);
        assert_eq!(request_id, Some("xyz789".to_string()));
    }

    #[test]
    fn test_extract_request_id_goog_variant() {
        let mut headers = HashMap::new();
        headers.insert("x-goog-request-id".to_string(), "goog123".to_string());

        let request_id = ResponseParser::extract_request_id(&headers);
        assert_eq!(request_id, Some("goog123".to_string()));
    }

    #[test]
    fn test_extract_request_id_missing() {
        let headers = HashMap::new();
        let request_id = ResponseParser::extract_request_id(&headers);
        assert_eq!(request_id, None);
    }
}
