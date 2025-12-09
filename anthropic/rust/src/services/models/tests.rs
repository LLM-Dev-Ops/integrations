//! Comprehensive tests for the Models service
//!
//! These tests follow London-School TDD patterns using mocks for all dependencies.

use super::*;
use crate::auth::AuthManager;
use crate::error::AnthropicError;
use crate::transport::{HttpResponse, HttpTransport};
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::{Arc, Mutex};
use url::Url;

// ============================================================================
// Mock Implementations
// ============================================================================

/// Mock HTTP transport for testing
struct MockHttpTransport {
    responses: Arc<Mutex<Vec<Result<HttpResponse, AnthropicError>>>>,
    requests: Arc<Mutex<Vec<(Method, String, HeaderMap, Option<Vec<u8>>)>>>,
}

impl MockHttpTransport {
    fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(Vec::new())),
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn with_response(mut self, response: Result<HttpResponse, AnthropicError>) -> Self {
        self.responses.lock().unwrap().push(response);
        self
    }

    fn get_requests(&self) -> Vec<(Method, String, HeaderMap, Option<Vec<u8>>)> {
        self.requests.lock().unwrap().clone()
    }
}

#[async_trait]
impl HttpTransport for MockHttpTransport {
    async fn execute(
        &self,
        method: Method,
        url: String,
        headers: HeaderMap,
        body: Option<Vec<u8>>,
    ) -> Result<HttpResponse, AnthropicError> {
        self.requests
            .lock()
            .unwrap()
            .push((method.clone(), url.clone(), headers.clone(), body.clone()));

        self.responses
            .lock()
            .unwrap()
            .pop()
            .unwrap_or_else(|| {
                Err(AnthropicError::Internal(
                    "No mock response configured".to_string(),
                ))
            })
    }

    async fn execute_stream(
        &self,
        _method: Method,
        _url: String,
        _headers: HeaderMap,
        _body: Option<Vec<u8>>,
    ) -> Result<Box<dyn futures::Stream<Item = Result<bytes::Bytes, AnthropicError>> + Send + Unpin>, AnthropicError>
    {
        Err(AnthropicError::Internal(
            "Streaming not supported in this mock".to_string(),
        ))
    }
}

/// Mock auth manager for testing
struct MockAuthManager {
    headers_to_add: Vec<(String, String)>,
}

impl MockAuthManager {
    fn new() -> Self {
        Self {
            headers_to_add: vec![
                ("x-api-key".to_string(), "test-key".to_string()),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
                ("content-type".to_string(), "application/json".to_string()),
            ],
        }
    }
}

impl AuthManager for MockAuthManager {
    fn add_auth_headers(&self, headers: &mut HeaderMap) {
        for (key, value) in &self.headers_to_add {
            headers.insert(
                http::HeaderName::from_bytes(key.as_bytes()).unwrap(),
                http::HeaderValue::from_str(value).unwrap(),
            );
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn create_test_service(transport: Arc<dyn HttpTransport>) -> ModelsServiceImpl {
    let auth_manager = Arc::new(MockAuthManager::new());
    let base_url = Url::parse("https://api.anthropic.com").unwrap();
    ModelsServiceImpl::new(transport, auth_manager, base_url)
}

fn create_success_response(body: &str) -> Result<HttpResponse, AnthropicError> {
    Ok(HttpResponse {
        status: 200,
        headers: HeaderMap::new(),
        body: body.as_bytes().to_vec(),
    })
}

fn create_error_response(
    status: u16,
    error_type: &str,
    message: &str,
) -> Result<HttpResponse, AnthropicError> {
    let error_json = serde_json::json!({
        "type": "error",
        "error": {
            "type": error_type,
            "message": message
        }
    });
    Ok(HttpResponse {
        status,
        headers: HeaderMap::new(),
        body: serde_json::to_vec(&error_json).unwrap(),
    })
}

fn create_test_model() -> ModelInfo {
    ModelInfo::new("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet")
        .with_created_at("2024-10-22T00:00:00Z")
}

fn create_test_model_list() -> ModelListResponse {
    ModelListResponse::new(vec![
        ModelInfo::new("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet")
            .with_created_at("2024-10-22T00:00:00Z"),
        ModelInfo::new("claude-3-opus-20240229", "Claude 3 Opus")
            .with_created_at("2024-02-29T00:00:00Z"),
        ModelInfo::new("claude-3-sonnet-20240229", "Claude 3 Sonnet")
            .with_created_at("2024-02-29T00:00:00Z"),
    ])
}

// ============================================================================
// Tests: List Models
// ============================================================================

#[tokio::test]
async fn test_list_models_success() {
    let model_list = create_test_model_list();
    let response_json = serde_json::to_string(&model_list).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport.clone());

    let result = service.list().await;

    assert!(result.is_ok());
    let returned_list = result.unwrap();
    assert_eq!(returned_list.data.len(), 3);
    assert_eq!(returned_list.data[0].id, "claude-3-5-sonnet-20241022");
    assert_eq!(returned_list.data[0].display_name, "Claude 3.5 Sonnet");

    // Verify request was made correctly
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let (method, url, headers, body) = &requests[0];
    assert_eq!(method, &Method::GET);
    assert!(url.contains("/v1/models"));
    assert!(body.is_none());
    assert!(headers.contains_key("x-api-key"));
}

#[tokio::test]
async fn test_list_models_empty_list() {
    let model_list = ModelListResponse::new(vec![]);
    let response_json = serde_json::to_string(&model_list).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport);

    let result = service.list().await;

    assert!(result.is_ok());
    let returned_list = result.unwrap();
    assert_eq!(returned_list.data.len(), 0);
}

#[tokio::test]
async fn test_list_models_api_error() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        500,
        "internal_server_error",
        "Internal server error",
    )));

    let service = create_test_service(transport);

    let result = service.list().await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, message, .. } => {
            assert_eq!(status, 500);
            assert!(message.contains("Internal server error"));
        }
        _ => panic!("Expected API error"),
    }
}

#[tokio::test]
async fn test_list_models_authentication_error() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        401,
        "authentication_error",
        "Invalid API key",
    )));

    let service = create_test_service(transport);

    let result = service.list().await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, error_type, .. } => {
            assert_eq!(status, 401);
            assert_eq!(error_type, "authentication_error");
        }
        _ => panic!("Expected API error"),
    }
}

#[tokio::test]
async fn test_list_models_network_error() {
    let transport = Arc::new(MockHttpTransport::new().with_response(Err(
        AnthropicError::Network("Connection failed".to_string()),
    )));

    let service = create_test_service(transport);

    let result = service.list().await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Network(msg) => {
            assert!(msg.contains("Connection failed"));
        }
        _ => panic!("Expected network error"),
    }
}

// ============================================================================
// Tests: Retrieve Model
// ============================================================================

#[tokio::test]
async fn test_retrieve_model_success() {
    let model = create_test_model();
    let response_json = serde_json::to_string(&model).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport.clone());

    let result = service.retrieve("claude-3-5-sonnet-20241022").await;

    assert!(result.is_ok());
    let returned_model = result.unwrap();
    assert_eq!(returned_model.id, "claude-3-5-sonnet-20241022");
    assert_eq!(returned_model.display_name, "Claude 3.5 Sonnet");
    assert_eq!(returned_model.type_, "model");

    // Verify request was made correctly
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let (method, url, _headers, body) = &requests[0];
    assert_eq!(method, &Method::GET);
    assert!(url.contains("/v1/models/claude-3-5-sonnet-20241022"));
    assert!(body.is_none());
}

#[tokio::test]
async fn test_retrieve_model_not_found() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        404,
        "not_found_error",
        "Model not found",
    )));

    let service = create_test_service(transport);

    let result = service.retrieve("invalid-model").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, message, .. } => {
            assert_eq!(status, 404);
            assert!(message.contains("Model not found"));
        }
        _ => panic!("Expected API error"),
    }
}

#[tokio::test]
async fn test_retrieve_model_empty_id() {
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let result = service.retrieve("").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Validation(_) => {}
        e => panic!("Expected validation error, got: {:?}", e),
    }
}

#[tokio::test]
async fn test_retrieve_model_with_special_characters() {
    let model = create_test_model();
    let response_json = serde_json::to_string(&model).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport.clone());

    let result = service
        .retrieve("claude-3-5-sonnet-20241022")
        .await;

    assert!(result.is_ok());

    // Verify URL encoding
    let requests = transport.get_requests();
    let (_method, url, _headers, _body) = &requests[0];
    assert!(url.contains("/v1/models/"));
}

// ============================================================================
// Tests: Error Handling
// ============================================================================

#[tokio::test]
async fn test_parse_api_error_with_valid_json() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        400,
        "invalid_request_error",
        "Invalid request parameters",
    )));

    let service = create_test_service(transport);

    let result = service.list().await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api {
            status,
            message,
            error_type,
        } => {
            assert_eq!(status, 400);
            assert_eq!(message, "Invalid request parameters");
            assert_eq!(error_type, "invalid_request_error");
        }
        _ => panic!("Expected API error"),
    }
}

#[tokio::test]
async fn test_parse_api_error_with_invalid_json() {
    let transport = Arc::new(MockHttpTransport::new().with_response(Ok(HttpResponse {
        status: 500,
        headers: HeaderMap::new(),
        body: b"<html>Internal Server Error</html>".to_vec(),
    })));

    let service = create_test_service(transport);

    let result = service.list().await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api {
            status,
            message,
            error_type,
        } => {
            assert_eq!(status, 500);
            assert!(message.contains("html"));
            assert_eq!(error_type, "unknown");
        }
        _ => panic!("Expected API error"),
    }
}

#[tokio::test]
async fn test_rate_limit_error() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        429,
        "rate_limit_error",
        "Rate limit exceeded",
    )));

    let service = create_test_service(transport);

    let result = service.list().await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, .. } => {
            assert_eq!(status, 429);
        }
        _ => panic!("Expected API error"),
    }
}

// ============================================================================
// Tests: Serialization/Deserialization
// ============================================================================

#[test]
fn test_model_info_serialization() {
    let model = create_test_model();
    let json = serde_json::to_string(&model).unwrap();
    let deserialized: ModelInfo = serde_json::from_str(&json).unwrap();
    assert_eq!(model, deserialized);
}

#[test]
fn test_model_list_response_serialization() {
    let model_list = create_test_model_list();
    let json = serde_json::to_string(&model_list).unwrap();
    let deserialized: ModelListResponse = serde_json::from_str(&json).unwrap();
    assert_eq!(model_list, deserialized);
}

#[test]
fn test_model_info_json_structure() {
    let model = create_test_model();
    let json = serde_json::to_value(&model).unwrap();

    assert_eq!(json["id"], "claude-3-5-sonnet-20241022");
    assert_eq!(json["display_name"], "Claude 3.5 Sonnet");
    assert_eq!(json["type"], "model");
    assert_eq!(json["created_at"], "2024-10-22T00:00:00Z");
}
