//! Error response fixtures

use serde_json::json;

/// Sample 401 authentication error response
pub fn error_401_invalid_api_key() -> serde_json::Value {
    json!({
        "error": {
            "message": "Incorrect API key provided: invalid_key. You can find your API key at https://platform.openai.com/account/api-keys.",
            "type": "invalid_request_error",
            "param": null,
            "code": "invalid_api_key"
        }
    })
}

/// Sample 429 rate limit error response
pub fn error_429_rate_limit() -> serde_json::Value {
    json!({
        "error": {
            "message": "Rate limit reached for requests",
            "type": "rate_limit_error",
            "param": null,
            "code": "rate_limit_exceeded"
        }
    })
}

/// Sample 429 quota exceeded error response
pub fn error_429_quota_exceeded() -> serde_json::Value {
    json!({
        "error": {
            "message": "You exceeded your current quota, please check your plan and billing details.",
            "type": "insufficient_quota",
            "param": null,
            "code": "insufficient_quota"
        }
    })
}

/// Sample 500 internal server error response
pub fn error_500_internal_server_error() -> serde_json::Value {
    json!({
        "error": {
            "message": "The server had an error while processing your request. Sorry about that!",
            "type": "server_error",
            "param": null,
            "code": null
        }
    })
}

/// Sample 503 service unavailable error response
pub fn error_503_service_unavailable() -> serde_json::Value {
    json!({
        "error": {
            "message": "The engine is currently overloaded, please try again later.",
            "type": "server_error",
            "param": null,
            "code": "service_unavailable"
        }
    })
}

/// Sample 400 invalid request error response
pub fn error_400_invalid_request() -> serde_json::Value {
    json!({
        "error": {
            "message": "Invalid value for 'model': 'invalid-model'. Please check the model name.",
            "type": "invalid_request_error",
            "param": "model",
            "code": "invalid_value"
        }
    })
}

/// Sample 400 missing required parameter error response
pub fn error_400_missing_parameter() -> serde_json::Value {
    json!({
        "error": {
            "message": "Missing required parameter: 'messages'.",
            "type": "invalid_request_error",
            "param": "messages",
            "code": "missing_required_parameter"
        }
    })
}

/// Sample 404 not found error response
pub fn error_404_not_found() -> serde_json::Value {
    json!({
        "error": {
            "message": "The requested resource was not found.",
            "type": "invalid_request_error",
            "param": null,
            "code": "not_found"
        }
    })
}

/// Sample 400 context length exceeded error response
pub fn error_400_context_length_exceeded() -> serde_json::Value {
    json!({
        "error": {
            "message": "This model's maximum context length is 4096 tokens. However, your messages resulted in 5000 tokens.",
            "type": "invalid_request_error",
            "param": "messages",
            "code": "context_length_exceeded"
        }
    })
}

/// Sample 403 permission denied error response
pub fn error_403_permission_denied() -> serde_json::Value {
    json!({
        "error": {
            "message": "You do not have permission to access this resource.",
            "type": "permission_error",
            "param": null,
            "code": "permission_denied"
        }
    })
}

/// Sample 400 invalid content error response (content filtering)
pub fn error_400_content_policy_violation() -> serde_json::Value {
    json!({
        "error": {
            "message": "Your request was rejected as a result of our safety system.",
            "type": "invalid_request_error",
            "param": "prompt",
            "code": "content_policy_violation"
        }
    })
}

/// Builder for creating custom error responses
pub struct ErrorResponseBuilder {
    message: String,
    error_type: String,
    param: Option<String>,
    code: Option<String>,
}

impl ErrorResponseBuilder {
    pub fn new() -> Self {
        Self {
            message: "An error occurred".to_string(),
            error_type: "api_error".to_string(),
            param: None,
            code: None,
        }
    }

    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = message.into();
        self
    }

    pub fn with_type(mut self, error_type: impl Into<String>) -> Self {
        self.error_type = error_type.into();
        self
    }

    pub fn with_param(mut self, param: impl Into<String>) -> Self {
        self.param = Some(param.into());
        self
    }

    pub fn with_code(mut self, code: impl Into<String>) -> Self {
        self.code = Some(code.into());
        self
    }

    pub fn build(self) -> serde_json::Value {
        json!({
            "error": {
                "message": self.message,
                "type": self.error_type,
                "param": self.param,
                "code": self.code
            }
        })
    }
}

impl Default for ErrorResponseBuilder {
    fn default() -> Self {
        Self::new()
    }
}
