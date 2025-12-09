use crate::errors::{
    AuthenticationError, OpenAIError, RateLimitError, ServerError, ValidationError,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIErrorResponse {
    pub error: OpenAIErrorDetail,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIErrorDetail {
    pub message: String,
    #[serde(rename = "type")]
    pub error_type: Option<String>,
    pub code: Option<String>,
    pub param: Option<String>,
}

pub struct ErrorMapper;

impl ErrorMapper {
    /// Maps HTTP status code and error response to OpenAIError
    pub fn map_status_code(
        status_code: u16,
        error_response: Option<OpenAIErrorResponse>,
    ) -> OpenAIError {
        let error_detail = error_response.map(|r| r.error);
        let message = error_detail
            .as_ref()
            .map(|d| d.message.clone())
            .unwrap_or_else(|| format!("HTTP error: {}", status_code));
        let error_type = error_detail.as_ref().and_then(|d| d.error_type.clone());
        let error_code = error_detail.as_ref().and_then(|d| d.code.clone());

        match status_code {
            400 => OpenAIError::Validation(ValidationError::InvalidRequest(message)),
            401 => {
                // Check if it's an expired key or invalid key
                if message.contains("expired") {
                    OpenAIError::Authentication(AuthenticationError::ExpiredApiKey(message))
                } else {
                    OpenAIError::Authentication(AuthenticationError::InvalidApiKey(message))
                }
            }
            403 => {
                // Check if it's permission issue
                if message.contains("permission") {
                    OpenAIError::Authentication(AuthenticationError::InsufficientPermissions(
                        message,
                    ))
                } else {
                    OpenAIError::Authentication(AuthenticationError::Unauthorized(message))
                }
            }
            404 => OpenAIError::Request {
                status_code,
                message,
                error_type,
                error_code,
            },
            429 => {
                // Rate limit - will be updated with retry_after if available
                OpenAIError::RateLimit(RateLimitError::RateLimitExceeded {
                    message,
                })
            }
            500 => OpenAIError::Server(ServerError::InternalError(message)),
            502 => OpenAIError::Server(ServerError::BadGateway(message)),
            503 => OpenAIError::Server(ServerError::ServiceUnavailable(message)),
            504 => OpenAIError::Server(ServerError::GatewayTimeout(message)),
            _ => OpenAIError::Request {
                status_code,
                message,
                error_type,
                error_code,
            },
        }
    }

    /// Maps HTTP status code with headers for better rate limit handling
    pub fn map_status_with_headers(
        status_code: u16,
        headers: &http::HeaderMap,
        body: &str,
    ) -> OpenAIError {
        // Try to parse error response
        let error_response: Option<OpenAIErrorResponse> = serde_json::from_str(body).ok();

        let mut error = Self::map_status_code(status_code, error_response);

        // For rate limits, extract retry-after header
        if status_code == 429 {
            if let Some(retry_after) = Self::extract_retry_after(headers) {
                let msg = match &error {
                    OpenAIError::RateLimit(RateLimitError::RateLimitExceeded { message }) => {
                        message.clone()
                    }
                    _ => "Rate limit exceeded".to_string(),
                };
                error = OpenAIError::RateLimit(RateLimitError::TooManyRequests {
                    message: msg,
                    retry_after_secs: Some(retry_after),
                });
            }
        }

        error
    }

    pub fn map_error_type(error_type: &str, message: String) -> OpenAIError {
        match error_type {
            "invalid_request_error" => {
                OpenAIError::Validation(ValidationError::InvalidRequest(message))
            }
            "authentication_error" => {
                OpenAIError::Authentication(AuthenticationError::InvalidApiKey(message))
            }
            "permission_error" => {
                OpenAIError::Authentication(AuthenticationError::Unauthorized(message))
            }
            "rate_limit_error" => {
                OpenAIError::RateLimit(RateLimitError::RateLimitExceeded {
                    message,
                })
            }
            "server_error" => OpenAIError::Server(ServerError::InternalError(message)),
            _ => OpenAIError::Unknown(message),
        }
    }

    /// Extracts retry-after header value in seconds
    pub fn extract_retry_after(headers: &http::HeaderMap) -> Option<u64> {
        headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
    }

    /// Parses error response from JSON body
    pub fn parse_error_response(body: &str) -> Option<OpenAIErrorResponse> {
        serde_json::from_str(body).ok()
    }

    /// Creates an error from response components
    pub fn from_response(status: u16, headers: &http::HeaderMap, body: &[u8]) -> OpenAIError {
        let body_str = String::from_utf8_lossy(body);
        Self::map_status_with_headers(status, headers, &body_str)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_status_code_401() {
        let error = ErrorMapper::map_status_code(401, None);
        assert!(matches!(error, OpenAIError::Authentication(_)));
    }

    #[test]
    fn test_map_status_code_429() {
        let error = ErrorMapper::map_status_code(429, None);
        assert!(matches!(error, OpenAIError::RateLimit(_)));
    }

    #[test]
    fn test_map_error_type() {
        let error =
            ErrorMapper::map_error_type("invalid_request_error", "Invalid request".to_string());
        assert!(matches!(error, OpenAIError::Validation(_)));
    }
}
