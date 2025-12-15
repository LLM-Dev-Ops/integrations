//! HTTP to Bedrock error mapping.

use super::*;
use std::time::Duration;

/// Map an HTTP response to a BedrockError.
pub fn map_bedrock_error(
    status: u16,
    error_type: Option<&str>,
    message: Option<&str>,
    request_id: Option<String>,
    model_id: Option<&str>,
    region: Option<&str>,
) -> BedrockError {
    let error_type = error_type.unwrap_or("");
    let message_str = message.map(|s| s.to_string());

    match (status, error_type) {
        // 400 Bad Request
        (400, "ValidationException") => BedrockError::Request(RequestError::Validation {
            message: message_str.unwrap_or_else(|| "Validation error".to_string()),
            request_id,
        }),
        (400, "ModelStreamErrorException") => BedrockError::Stream(StreamError::ModelError {
            message: message_str.unwrap_or_else(|| "Model stream error".to_string()),
            request_id,
        }),

        // 403 Access Denied
        (403, "AccessDeniedException") => {
            // Check if this is a model access issue
            if let (Some(mid), Some(reg)) = (model_id, region) {
                BedrockError::Model(ModelError::NotAccessible {
                    model_id: mid.to_string(),
                    region: reg.to_string(),
                    suggestion: Some(
                        "Model may not be enabled in this region. Use models().list() to discover available models.".to_string()
                    ),
                    request_id,
                })
            } else {
                BedrockError::Authentication(AuthenticationError::AccessDenied {
                    message: message_str,
                    request_id,
                })
            }
        }

        // 404 Not Found
        (404, "ResourceNotFoundException") => {
            BedrockError::Model(ModelError::NotFound {
                model_id: model_id.unwrap_or("unknown").to_string(),
                request_id,
            })
        }

        // 422 Unprocessable Entity
        (422, "UnprocessableEntityException") => {
            BedrockError::Request(RequestError::Validation {
                message: message_str.unwrap_or_else(|| "Unprocessable entity".to_string()),
                request_id,
            })
        }

        // 424 Model Not Ready
        (424, "ModelNotReadyException") => BedrockError::Model(ModelError::NotReady {
            model_id: model_id.unwrap_or("unknown").to_string(),
            request_id,
        }),

        // 429 Rate Limited
        (429, "ThrottlingException") => {
            BedrockError::RateLimit(RateLimitError::TooManyRequests {
                retry_after: Some(Duration::from_secs(5)), // Default backoff
                request_id,
            })
        }
        (429, "ServiceQuotaExceededException") => {
            BedrockError::RateLimit(RateLimitError::TokenRateLimited { request_id })
        }

        // 500 Internal Error
        (500, "InternalServerException") | (500, _) => {
            BedrockError::Server(ServerError::InternalError {
                message: message_str,
                request_id,
            })
        }

        // 503 Service Unavailable
        (503, "ServiceUnavailableException") => {
            BedrockError::Server(ServerError::ServiceUnavailable {
                retry_after: Some(Duration::from_secs(10)),
                request_id,
            })
        }
        (503, "ModelErrorException") => BedrockError::Model(ModelError::Overloaded {
            model_id: model_id.unwrap_or("unknown").to_string(),
            request_id,
        }),

        // Default mapping by status code
        (400..=499, _) => BedrockError::Request(RequestError::Validation {
            message: message_str.unwrap_or_else(|| format!("Client error: {}", status)),
            request_id,
        }),
        (500..=599, _) => BedrockError::Server(ServerError::InternalError {
            message: message_str,
            request_id,
        }),

        // Unknown status
        _ => BedrockError::Server(ServerError::InternalError {
            message: Some(format!("Unexpected status code: {}", status)),
            request_id,
        }),
    }
}

/// Parse the x-amzn-errortype header to extract the error code.
pub fn parse_error_type(header_value: &str) -> &str {
    // Header format: "ErrorType:additional_info" or just "ErrorType"
    header_value.split(':').next().unwrap_or(header_value)
}

/// Extract retry-after from response headers.
pub fn parse_retry_after(header_value: &str) -> Option<Duration> {
    header_value
        .parse::<u64>()
        .ok()
        .map(Duration::from_secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_validation_error() {
        let error = map_bedrock_error(
            400,
            Some("ValidationException"),
            Some("Invalid model parameters"),
            Some("req-123".to_string()),
            None,
            None,
        );

        match error {
            BedrockError::Request(RequestError::Validation { message, request_id }) => {
                assert_eq!(message, "Invalid model parameters");
                assert_eq!(request_id, Some("req-123".to_string()));
            }
            _ => panic!("Expected ValidationError"),
        }
    }

    #[test]
    fn test_map_model_not_found() {
        let error = map_bedrock_error(
            404,
            Some("ResourceNotFoundException"),
            Some("Model not found"),
            Some("req-456".to_string()),
            Some("amazon.titan-text-express-v1"),
            None,
        );

        match error {
            BedrockError::Model(ModelError::NotFound { model_id, request_id }) => {
                assert_eq!(model_id, "amazon.titan-text-express-v1");
                assert_eq!(request_id, Some("req-456".to_string()));
            }
            _ => panic!("Expected ModelNotFound"),
        }
    }

    #[test]
    fn test_map_rate_limit() {
        let error = map_bedrock_error(
            429,
            Some("ThrottlingException"),
            None,
            None,
            None,
            None,
        );

        match error {
            BedrockError::RateLimit(RateLimitError::TooManyRequests { retry_after, .. }) => {
                assert!(retry_after.is_some());
            }
            _ => panic!("Expected RateLimitError"),
        }
    }

    #[test]
    fn test_parse_error_type() {
        assert_eq!(
            parse_error_type("ValidationException:http/1.1"),
            "ValidationException"
        );
        assert_eq!(parse_error_type("ThrottlingException"), "ThrottlingException");
    }

    #[test]
    fn test_parse_retry_after() {
        assert_eq!(parse_retry_after("30"), Some(Duration::from_secs(30)));
        assert_eq!(parse_retry_after("invalid"), None);
    }
}
