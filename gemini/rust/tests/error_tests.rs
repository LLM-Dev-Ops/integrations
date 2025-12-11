//! Integration tests for error handling and error types.

use integrations_gemini::error::{
    GeminiError, GeminiResult, AuthenticationError, ConfigurationError, ContentError,
    NetworkError, RateLimitError, RequestError, ResourceError, ResponseError, ServerError,
    ValidationDetail, map_http_status, map_api_error,
};
use std::time::Duration;

#[test]
fn test_error_is_retryable_network_timeout() {
    // Arrange
    let error = GeminiError::Network(NetworkError::Timeout {
        duration: Duration::from_secs(30),
    });

    // Act & Assert
    assert!(error.is_retryable());
}

#[test]
fn test_error_is_retryable_network_connection_failed() {
    // Arrange
    let error = GeminiError::Network(NetworkError::ConnectionFailed {
        message: "Connection refused".to_string(),
    });

    // Act & Assert
    assert!(error.is_retryable());
}

#[test]
fn test_error_is_retryable_rate_limit() {
    // Arrange
    let error = GeminiError::RateLimit(RateLimitError::TooManyRequests {
        retry_after: Some(Duration::from_secs(60)),
    });

    // Act & Assert
    assert!(error.is_retryable());
}

#[test]
fn test_error_is_retryable_server_unavailable() {
    // Arrange
    let error = GeminiError::Server(ServerError::ServiceUnavailable {
        retry_after: Some(Duration::from_secs(30)),
    });

    // Act & Assert
    assert!(error.is_retryable());
}

#[test]
fn test_error_is_retryable_server_overloaded() {
    // Arrange
    let error = GeminiError::Server(ServerError::ModelOverloaded {
        model: "gemini-1.5-pro".to_string(),
    });

    // Act & Assert
    assert!(error.is_retryable());
}

#[test]
fn test_error_not_retryable_authentication() {
    // Arrange
    let error = GeminiError::Authentication(AuthenticationError::InvalidApiKey);

    // Act & Assert
    assert!(!error.is_retryable());
}

#[test]
fn test_error_not_retryable_configuration() {
    // Arrange
    let error = GeminiError::Configuration(ConfigurationError::MissingApiKey);

    // Act & Assert
    assert!(!error.is_retryable());
}

#[test]
fn test_error_not_retryable_validation() {
    // Arrange
    let error = GeminiError::Request(RequestError::ValidationError {
        message: "Invalid request".to_string(),
        details: vec![],
    });

    // Act & Assert
    assert!(!error.is_retryable());
}

#[test]
fn test_error_not_retryable_content_safety() {
    // Arrange
    let error = GeminiError::Content(ContentError::SafetyBlocked {
        reason: "Unsafe content".to_string(),
        safety_ratings: vec![],
    });

    // Act & Assert
    assert!(!error.is_retryable());
}

#[test]
fn test_error_retry_after_rate_limit() {
    // Arrange
    let error = GeminiError::RateLimit(RateLimitError::TooManyRequests {
        retry_after: Some(Duration::from_secs(120)),
    });

    // Act
    let retry_after = error.retry_after();

    // Assert
    assert_eq!(retry_after, Some(Duration::from_secs(120)));
}

#[test]
fn test_error_retry_after_server_unavailable() {
    // Arrange
    let error = GeminiError::Server(ServerError::ServiceUnavailable {
        retry_after: Some(Duration::from_secs(45)),
    });

    // Act
    let retry_after = error.retry_after();

    // Assert
    assert_eq!(retry_after, Some(Duration::from_secs(45)));
}

#[test]
fn test_error_retry_after_none() {
    // Arrange
    let error = GeminiError::Configuration(ConfigurationError::MissingApiKey);

    // Act
    let retry_after = error.retry_after();

    // Assert
    assert_eq!(retry_after, None);
}

#[test]
fn test_map_http_status_200() {
    // Act
    let error = map_http_status(200, "OK".to_string());

    // Assert
    assert!(error.is_none());
}

#[test]
fn test_map_http_status_400() {
    // Act
    let error = map_http_status(400, "Bad request".to_string());

    // Assert
    assert!(error.is_some());
    match error.unwrap() {
        GeminiError::Request(RequestError::InvalidParameter { .. }) => {
            // Expected
        }
        e => panic!("Expected RequestError::InvalidParameter, got {:?}", e),
    }
}

#[test]
fn test_map_http_status_401() {
    // Act
    let error = map_http_status(401, "Unauthorized".to_string());

    // Assert
    assert!(error.is_some());
    match error.unwrap() {
        GeminiError::Authentication(AuthenticationError::InvalidApiKey) => {
            // Expected
        }
        e => panic!("Expected AuthenticationError::InvalidApiKey, got {:?}", e),
    }
}

#[test]
fn test_map_http_status_403() {
    // Act
    let error = map_http_status(403, "Forbidden".to_string());

    // Assert
    assert!(error.is_some());
    match error.unwrap() {
        GeminiError::Authentication(AuthenticationError::InvalidApiKey) => {
            // Expected
        }
        e => panic!("Expected AuthenticationError::InvalidApiKey, got {:?}", e),
    }
}

#[test]
fn test_map_http_status_404() {
    // Act
    let error = map_http_status(404, "Not found".to_string());

    // Assert
    assert!(error.is_some());
    match error.unwrap() {
        GeminiError::Request(RequestError::InvalidParameter { .. }) => {
            // Expected
        }
        e => panic!("Expected RequestError, got {:?}", e),
    }
}

#[test]
fn test_map_http_status_429() {
    // Act
    let error = map_http_status(429, "Too many requests".to_string());

    // Assert
    assert!(error.is_some());
    match error.unwrap() {
        GeminiError::RateLimit(RateLimitError::TooManyRequests { .. }) => {
            // Expected
        }
        e => panic!("Expected RateLimitError::TooManyRequests, got {:?}", e),
    }
}

#[test]
fn test_map_http_status_500() {
    // Act
    let error = map_http_status(500, "Internal server error".to_string());

    // Assert
    assert!(error.is_some());
    match error.unwrap() {
        GeminiError::Server(ServerError::InternalError { .. }) => {
            // Expected
        }
        e => panic!("Expected ServerError::InternalError, got {:?}", e),
    }
}

#[test]
fn test_map_http_status_503() {
    // Act
    let error = map_http_status(503, "Service unavailable".to_string());

    // Assert
    assert!(error.is_some());
    match error.unwrap() {
        GeminiError::Server(ServerError::ServiceUnavailable { .. }) => {
            // Expected
        }
        e => panic!("Expected ServerError::ServiceUnavailable, got {:?}", e),
    }
}

#[test]
fn test_map_api_error_authentication() {
    // Arrange
    let json = serde_json::json!({
        "error": {
            "code": 401,
            "message": "API key not valid",
            "status": "UNAUTHENTICATED"
        }
    });

    // Act
    let error = map_api_error(&json);

    // Assert
    assert!(error.is_some());
    match error.unwrap() {
        GeminiError::Authentication(_) => {
            // Expected
        }
        e => panic!("Expected AuthenticationError, got {:?}", e),
    }
}

#[test]
fn test_map_api_error_rate_limit() {
    // Arrange
    let json = serde_json::json!({
        "error": {
            "code": 429,
            "message": "Quota exceeded",
            "status": "RESOURCE_EXHAUSTED"
        }
    });

    // Act
    let error = map_api_error(&json);

    // Assert
    assert!(error.is_some());
    match error.unwrap() {
        GeminiError::RateLimit(_) => {
            // Expected
        }
        e => panic!("Expected RateLimitError, got {:?}", e),
    }
}

#[test]
fn test_map_api_error_invalid_format() {
    // Arrange
    let json = serde_json::json!({
        "not_an_error": "missing error field"
    });

    // Act
    let error = map_api_error(&json);

    // Assert
    assert!(error.is_none());
}

#[test]
fn test_validation_error_with_details() {
    // Arrange
    let error = GeminiError::Request(RequestError::ValidationError {
        message: "Invalid request".to_string(),
        details: vec![
            ValidationDetail {
                field: "contents".to_string(),
                description: "Contents cannot be empty".to_string(),
            },
            ValidationDetail {
                field: "model".to_string(),
                description: "Model name is required".to_string(),
            },
        ],
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("Invalid request"));
}

#[test]
fn test_content_error_safety_blocked() {
    // Arrange
    let error = GeminiError::Content(ContentError::SafetyBlocked {
        reason: "Dangerous content detected".to_string(),
        safety_ratings: vec![
            integrations_gemini::error::SafetyRatingInfo {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT".to_string(),
                probability: "HIGH".to_string(),
            },
        ],
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("safety"));
    assert!(!error.is_retryable());
}

#[test]
fn test_content_error_recitation_blocked() {
    // Arrange
    let error = GeminiError::Content(ContentError::RecitationBlocked {
        safety_ratings: vec![],
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("recitation"));
}

#[test]
fn test_content_error_prohibited_content() {
    // Arrange
    let error = GeminiError::Content(ContentError::ProhibitedContent);

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("Prohibited content"));
}

#[test]
fn test_resource_error_file_not_found() {
    // Arrange
    let error = GeminiError::Resource(ResourceError::FileNotFound {
        file_name: "files/abc123".to_string(),
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("File not found"));
    assert!(error_msg.contains("abc123"));
}

#[test]
fn test_resource_error_model_not_found() {
    // Arrange
    let error = GeminiError::Resource(ResourceError::ModelNotFound {
        model: "invalid-model".to_string(),
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("Model not found"));
    assert!(error_msg.contains("invalid-model"));
}

#[test]
fn test_resource_error_cached_content_not_found() {
    // Arrange
    let error = GeminiError::Resource(ResourceError::CachedContentNotFound {
        name: "cachedContents/xyz".to_string(),
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("Cached content not found"));
}

#[test]
fn test_network_error_timeout() {
    // Arrange
    let error = GeminiError::Network(NetworkError::Timeout {
        duration: Duration::from_secs(30),
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("timed out"));
}

#[test]
fn test_network_error_dns() {
    // Arrange
    let error = GeminiError::Network(NetworkError::DnsResolutionFailed {
        host: "invalid.example.com".to_string(),
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("DNS"));
    assert!(error_msg.contains("invalid.example.com"));
}

#[test]
fn test_response_error_deserialization() {
    // Arrange
    let error = GeminiError::Response(ResponseError::DeserializationError {
        message: "Invalid JSON".to_string(),
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("deserialize"));
}

#[test]
fn test_response_error_malformed_chunk() {
    // Arrange
    let error = GeminiError::Response(ResponseError::MalformedChunk {
        message: "Invalid chunk format".to_string(),
    });

    // Act
    let error_msg = error.to_string();

    // Assert
    assert!(error_msg.contains("Malformed chunk"));
}

#[test]
fn test_error_from_reqwest_timeout() {
    // Arrange
    let reqwest_err = reqwest::Error::builder(
        reqwest::StatusCode::REQUEST_TIMEOUT,
    )
    .body("timeout")
    .build();

    // Act
    let error: GeminiError = reqwest_err.into();

    // Assert
    match error {
        GeminiError::Network(NetworkError::Timeout { .. }) => {
            // Expected
        }
        e => panic!("Expected NetworkError::Timeout, got {:?}", e),
    }
}

#[test]
fn test_error_from_serde_json() {
    // Arrange
    let json_err = serde_json::from_str::<serde_json::Value>("invalid json").unwrap_err();

    // Act
    let error: GeminiError = json_err.into();

    // Assert
    match error {
        GeminiError::Response(ResponseError::DeserializationError { .. }) => {
            // Expected
        }
        e => panic!("Expected ResponseError::DeserializationError, got {:?}", e),
    }
}

#[test]
fn test_rate_limit_error_retry_after() {
    // Arrange
    let error = RateLimitError::TooManyRequests {
        retry_after: Some(Duration::from_secs(90)),
    };

    // Act
    let retry = error.retry_after();

    // Assert
    assert_eq!(retry, Some(Duration::from_secs(90)));
}

#[test]
fn test_rate_limit_error_quota_exceeded_retry_after() {
    // Arrange
    let error = RateLimitError::QuotaExceeded {
        retry_after: Some(Duration::from_secs(3600)),
    };

    // Act
    let retry = error.retry_after();

    // Assert
    assert_eq!(retry, Some(Duration::from_secs(3600)));
}

#[test]
fn test_rate_limit_error_token_limit_no_retry_after() {
    // Arrange
    let error = RateLimitError::TokenLimitExceeded;

    // Act
    let retry = error.retry_after();

    // Assert
    assert_eq!(retry, None);
}

#[test]
fn test_gemini_result_ok() {
    // Arrange
    let result: GeminiResult<String> = Ok("success".to_string());

    // Act & Assert
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "success");
}

#[test]
fn test_gemini_result_err() {
    // Arrange
    let result: GeminiResult<String> = Err(GeminiError::Configuration(
        ConfigurationError::MissingApiKey,
    ));

    // Act & Assert
    assert!(result.is_err());
}
