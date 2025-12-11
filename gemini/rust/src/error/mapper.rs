//! Error mapping utilities for HTTP status codes and API responses.

use std::time::Duration;
use serde::Deserialize;
use super::categories::*;
use super::types::GeminiError;

/// Structured API error response from Gemini.
#[derive(Debug, Deserialize)]
pub struct ApiErrorResponse {
    pub error: ApiErrorDetail,
}

/// Detailed error information from API.
#[derive(Debug, Deserialize)]
pub struct ApiErrorDetail {
    pub code: i32,
    pub message: String,
    pub status: String,
    #[serde(default)]
    pub details: Vec<serde_json::Value>,
}

/// Maps HTTP status codes and response body to appropriate GeminiError variants.
///
/// This function parses the API error response and maps it to the most specific
/// error type based on status code and error message content.
pub fn map_http_status_with_body(status: u16, body: &[u8]) -> GeminiError {
    // Try to parse structured error response
    let (message, error_details) = if let Ok(error_response) = serde_json::from_slice::<ApiErrorResponse>(body) {
        (error_response.error.message, Some(error_response.error))
    } else {
        // Fallback to plain text or generic JSON parsing
        let body_str = String::from_utf8_lossy(body).to_string();
        if let Ok(json) = serde_json::from_slice::<serde_json::Value>(body) {
            if let Some(error) = json.get("error") {
                if let Some(msg) = error.get("message").and_then(|m| m.as_str()) {
                    (msg.to_string(), None)
                } else {
                    (body_str, None)
                }
            } else {
                (body_str, None)
            }
        } else {
            (body_str, None)
        }
    };

    match status {
        // 400 Bad Request - Request validation errors
        400 => {
            let details = error_details
                .as_ref()
                .map(|e| parse_validation_details(&e.details))
                .unwrap_or_default();

            GeminiError::Request(RequestError::ValidationError {
                message,
                details,
            })
        }

        // 401 Unauthorized - Authentication errors
        401 => GeminiError::Authentication(AuthenticationError::InvalidApiKey),

        // 403 Forbidden - Could be quota or permissions
        403 => {
            if message.to_lowercase().contains("quota") {
                GeminiError::Authentication(AuthenticationError::QuotaExceeded)
            } else {
                // Check for permission denied in status
                if let Some(ref details) = error_details {
                    if details.status.to_uppercase().contains("PERMISSION_DENIED") {
                        GeminiError::Authentication(AuthenticationError::QuotaExceeded)
                    } else {
                        GeminiError::Authentication(AuthenticationError::InvalidApiKey)
                    }
                } else {
                    GeminiError::Authentication(AuthenticationError::InvalidApiKey)
                }
            }
        }

        // 404 Not Found - Resource errors
        404 => {
            let resource_name = extract_resource_name(&message);

            // Determine the type of resource based on message content
            if message.to_lowercase().contains("model") {
                GeminiError::Resource(ResourceError::ModelNotFound {
                    model: resource_name,
                })
            } else if message.to_lowercase().contains("file") {
                GeminiError::Resource(ResourceError::FileNotFound {
                    file_name: resource_name,
                })
            } else if message.to_lowercase().contains("cached") {
                GeminiError::Resource(ResourceError::CachedContentNotFound {
                    name: resource_name,
                })
            } else {
                // Default to model not found
                GeminiError::Resource(ResourceError::ModelNotFound {
                    model: resource_name,
                })
            }
        }

        // 413 Payload Too Large
        413 => {
            // Try to extract size information from message
            let (size, max_size) = extract_size_info(&message);
            GeminiError::Request(RequestError::PayloadTooLarge {
                size,
                max_size,
            })
        }

        // 415 Unsupported Media Type
        415 => {
            let mime_type = extract_mime_type(&message);
            GeminiError::Request(RequestError::UnsupportedMediaType {
                mime_type,
            })
        }

        // 429 Too Many Requests - Rate limiting
        429 => GeminiError::RateLimit(RateLimitError::TooManyRequests {
            retry_after: None, // Will be set from headers by response parser
        }),

        // 500 Internal Server Error
        500 => GeminiError::Server(ServerError::InternalError { message }),

        // 503 Service Unavailable
        503 => {
            // Check if it's model overloaded
            if message.to_lowercase().contains("overload") {
                GeminiError::Server(ServerError::ModelOverloaded {
                    model: extract_resource_name(&message),
                })
            } else {
                GeminiError::Server(ServerError::ServiceUnavailable {
                    retry_after: None, // Will be set from headers by response parser
                })
            }
        }

        // Default: treat as server error
        _ => GeminiError::Server(ServerError::InternalError {
            message: format!("HTTP {}: {}", status, message),
        }),
    }
}

/// Legacy function for backward compatibility - uses empty body.
pub fn map_http_status(status: u16, message: String) -> GeminiError {
    map_http_status_with_body(status, message.as_bytes())
}

/// Extracts resource name from error message (simple heuristic).
fn extract_resource_name(message: &str) -> String {
    // Try to extract model name or resource identifier from message
    // Look for patterns like "models/name" or "files/name"
    if let Some(found) = message
        .split_whitespace()
        .find(|s| s.starts_with("models/") || s.starts_with("files/") || s.starts_with("cachedContents/"))
    {
        return found.trim_matches(|c: char| !c.is_alphanumeric() && c != '/' && c != '-' && c != '_').to_string();
    }

    // Try to extract from quotes
    if let Some(start) = message.find('\'') {
        if let Some(end) = message[start + 1..].find('\'') {
            return message[start + 1..start + 1 + end].to_string();
        }
    }

    if let Some(start) = message.find('"') {
        if let Some(end) = message[start + 1..].find('"') {
            return message[start + 1..start + 1 + end].to_string();
        }
    }

    "unknown".to_string()
}

/// Extracts size information from error message.
fn extract_size_info(message: &str) -> (usize, usize) {
    // Try to parse numbers from message like "size 1000000 exceeds max 500000"
    let numbers: Vec<usize> = message
        .split_whitespace()
        .filter_map(|s| s.trim_matches(|c: char| !c.is_numeric()).parse().ok())
        .collect();

    match numbers.len() {
        0 => (0, 0),
        1 => (numbers[0], 0),
        _ => (numbers[0], numbers[1]),
    }
}

/// Extracts MIME type from error message.
fn extract_mime_type(message: &str) -> String {
    // Look for MIME type patterns like "image/png" or "application/json"
    for word in message.split_whitespace() {
        if word.contains('/') && (word.starts_with("image/") ||
                                   word.starts_with("video/") ||
                                   word.starts_with("audio/") ||
                                   word.starts_with("application/") ||
                                   word.starts_with("text/")) {
            return word.trim_matches(|c: char| !c.is_alphanumeric() && c != '/').to_string();
        }
    }
    "unknown".to_string()
}

/// Parses validation details from error response details array.
fn parse_validation_details(details: &[serde_json::Value]) -> Vec<ValidationDetail> {
    let mut result = Vec::new();

    for detail in details {
        // Try to extract field and description from various formats
        if let Some(obj) = detail.as_object() {
            let field = obj.get("field")
                .or_else(|| obj.get("fieldPath"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            let description = obj.get("description")
                .or_else(|| obj.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if !description.is_empty() {
                result.push(ValidationDetail {
                    field: field.to_string(),
                    description: description.to_string(),
                });
            }
        }
    }

    result
}

/// Parses retry-after duration from error message or headers.
fn parse_retry_after(message: &str) -> Option<Duration> {
    // This is a placeholder - in practice, retry-after would come from HTTP headers
    // For now, return a default backoff duration
    if message.to_lowercase().contains("retry") {
        Some(Duration::from_secs(30))
    } else {
        None
    }
}

/// Maps API error responses to appropriate GeminiError variants.
pub fn map_api_error(error_type: &str, message: String) -> GeminiError {
    match error_type {
        "INVALID_ARGUMENT" => GeminiError::Request(RequestError::ValidationError {
            message,
            details: vec![],
        }),
        "UNAUTHENTICATED" => GeminiError::Authentication(AuthenticationError::InvalidApiKey),
        "PERMISSION_DENIED" => GeminiError::Authentication(AuthenticationError::QuotaExceeded),
        "NOT_FOUND" => GeminiError::Resource(ResourceError::ModelNotFound {
            model: "unknown".to_string(),
        }),
        "RESOURCE_EXHAUSTED" => GeminiError::RateLimit(RateLimitError::QuotaExceeded {
            retry_after: Some(Duration::from_secs(60)),
        }),
        "FAILED_PRECONDITION" => GeminiError::Request(RequestError::ValidationError {
            message,
            details: vec![],
        }),
        "ABORTED" => GeminiError::Server(ServerError::InternalError { message }),
        "OUT_OF_RANGE" => GeminiError::Request(RequestError::InvalidParameter {
            parameter: "unknown".to_string(),
            message,
        }),
        "UNIMPLEMENTED" => GeminiError::Request(RequestError::InvalidModel {
            model: "unknown".to_string(),
        }),
        "INTERNAL" => GeminiError::Server(ServerError::InternalError { message }),
        "UNAVAILABLE" => GeminiError::Server(ServerError::ServiceUnavailable {
            retry_after: Some(Duration::from_secs(30)),
        }),
        "DEADLINE_EXCEEDED" => GeminiError::Network(NetworkError::Timeout {
            duration: Duration::from_secs(30),
        }),
        _ => GeminiError::Server(ServerError::InternalError {
            message: format!("{}: {}", error_type, message),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_http_status_401() {
        let error = map_http_status(401, "Invalid API key".to_string());
        assert!(matches!(
            error,
            GeminiError::Authentication(AuthenticationError::InvalidApiKey)
        ));
    }

    #[test]
    fn test_map_http_status_429() {
        let error = map_http_status(429, "Rate limit exceeded".to_string());
        assert!(matches!(
            error,
            GeminiError::RateLimit(RateLimitError::TooManyRequests { .. })
        ));
    }

    #[test]
    fn test_map_http_status_503() {
        let error = map_http_status(503, "Service unavailable".to_string());
        assert!(matches!(
            error,
            GeminiError::Server(ServerError::ServiceUnavailable { .. })
        ));
    }

    #[test]
    fn test_map_http_status_503_overloaded() {
        let error = map_http_status(503, "Model overloaded".to_string());
        assert!(matches!(
            error,
            GeminiError::Server(ServerError::ModelOverloaded { .. })
        ));
    }

    #[test]
    fn test_map_http_status_with_body_structured() {
        let body = r#"{"error":{"code":400,"message":"Invalid parameter","status":"INVALID_ARGUMENT","details":[]}}"#;
        let error = map_http_status_with_body(400, body.as_bytes());
        assert!(matches!(
            error,
            GeminiError::Request(RequestError::ValidationError { .. })
        ));
    }

    #[test]
    fn test_map_http_status_404_model() {
        let body = r#"{"error":{"message":"Model 'gemini-fake' not found"}}"#;
        let error = map_http_status_with_body(404, body.as_bytes());
        assert!(matches!(
            error,
            GeminiError::Resource(ResourceError::ModelNotFound { .. })
        ));
    }

    #[test]
    fn test_map_http_status_404_file() {
        let body = r#"{"error":{"message":"File 'test.pdf' not found"}}"#;
        let error = map_http_status_with_body(404, body.as_bytes());
        assert!(matches!(
            error,
            GeminiError::Resource(ResourceError::FileNotFound { .. })
        ));
    }

    #[test]
    fn test_map_http_status_404_cached_content() {
        let body = r#"{"error":{"message":"Cached content not found"}}"#;
        let error = map_http_status_with_body(404, body.as_bytes());
        assert!(matches!(
            error,
            GeminiError::Resource(ResourceError::CachedContentNotFound { .. })
        ));
    }

    #[test]
    fn test_map_http_status_413_payload_too_large() {
        let body = r#"{"error":{"message":"Payload size 1000000 exceeds maximum 500000"}}"#;
        let error = map_http_status_with_body(413, body.as_bytes());
        if let GeminiError::Request(RequestError::PayloadTooLarge { size, max_size }) = error {
            assert_eq!(size, 1000000);
            assert_eq!(max_size, 500000);
        } else {
            panic!("Expected PayloadTooLarge error");
        }
    }

    #[test]
    fn test_map_http_status_415_unsupported_media_type() {
        let body = r#"{"error":{"message":"Unsupported media type: image/bmp"}}"#;
        let error = map_http_status_with_body(415, body.as_bytes());
        if let GeminiError::Request(RequestError::UnsupportedMediaType { mime_type }) = error {
            assert_eq!(mime_type, "image/bmp");
        } else {
            panic!("Expected UnsupportedMediaType error");
        }
    }

    #[test]
    fn test_extract_resource_name_with_path() {
        let name = extract_resource_name("Model models/gemini-1.5-pro not found");
        assert_eq!(name, "models/gemini-1.5-pro");
    }

    #[test]
    fn test_extract_resource_name_with_quotes() {
        let name = extract_resource_name("Model 'gemini-pro' not found");
        assert_eq!(name, "gemini-pro");
    }

    #[test]
    fn test_extract_size_info() {
        let (size, max_size) = extract_size_info("Payload size 1000000 exceeds maximum 500000");
        assert_eq!(size, 1000000);
        assert_eq!(max_size, 500000);
    }

    #[test]
    fn test_extract_mime_type() {
        let mime = extract_mime_type("Unsupported media type: image/png");
        assert_eq!(mime, "image/png");
    }

    #[test]
    fn test_parse_validation_details() {
        let details_json = serde_json::json!([
            {"field": "temperature", "description": "Must be between 0 and 2"},
            {"fieldPath": "contents[0]", "message": "Content cannot be empty"}
        ]);
        let details = parse_validation_details(details_json.as_array().unwrap());
        assert_eq!(details.len(), 2);
        assert_eq!(details[0].field, "temperature");
        assert_eq!(details[1].field, "contents[0]");
    }

    #[test]
    fn test_map_api_error_invalid_argument() {
        let error = map_api_error("INVALID_ARGUMENT", "Invalid request".to_string());
        assert!(matches!(
            error,
            GeminiError::Request(RequestError::ValidationError { .. })
        ));
    }

    #[test]
    fn test_map_api_error_resource_exhausted() {
        let error = map_api_error("RESOURCE_EXHAUSTED", "Quota exceeded".to_string());
        assert!(matches!(
            error,
            GeminiError::RateLimit(RateLimitError::QuotaExceeded { .. })
        ));
    }
}
