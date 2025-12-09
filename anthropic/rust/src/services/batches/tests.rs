//! Comprehensive tests for the Batches service
//!
//! These tests follow London-School TDD patterns using mocks for all dependencies.

use super::*;
use crate::auth::AuthManager;
use crate::error::AnthropicError;
use crate::services::messages::{CreateMessageRequest, Message, MessageParam, Role};
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
    ) -> Result<
        Box<dyn futures::Stream<Item = Result<bytes::Bytes, AnthropicError>> + Send + Unpin>,
        AnthropicError,
    > {
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

fn create_test_service(transport: Arc<dyn HttpTransport>) -> BatchesServiceImpl {
    let auth_manager = Arc::new(MockAuthManager::new());
    let base_url = Url::parse("https://api.anthropic.com").unwrap();
    BatchesServiceImpl::new(transport, auth_manager, base_url)
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

fn create_test_batch() -> MessageBatch {
    MessageBatch {
        id: "batch_123".to_string(),
        type_: "message_batch".to_string(),
        processing_status: BatchStatus::InProgress,
        request_counts: BatchProcessingStatus {
            succeeded: 0,
            errored: 0,
            expired: 0,
            canceled: 0,
        },
        ended_at: None,
        created_at: "2024-01-01T00:00:00Z".to_string(),
        expires_at: "2024-01-02T00:00:00Z".to_string(),
        cancel_initiated_at: None,
        results_url: None,
    }
}

fn create_test_batch_request() -> CreateBatchRequest {
    CreateBatchRequest::new(vec![
        BatchRequest::new(
            "req1",
            CreateMessageRequest::new(
                "claude-3-5-sonnet-20241022",
                1024,
                vec![MessageParam::user("Hello")],
            ),
        ),
        BatchRequest::new(
            "req2",
            CreateMessageRequest::new(
                "claude-3-5-sonnet-20241022",
                1024,
                vec![MessageParam::user("Hi")],
            ),
        ),
    ])
}

// ============================================================================
// Tests: Create Batch
// ============================================================================

#[tokio::test]
async fn test_create_batch_success() {
    let batch = create_test_batch();
    let response_json = serde_json::to_string(&batch).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport.clone());
    let request = create_test_batch_request();

    let result = service.create(request).await;

    assert!(result.is_ok());
    let returned_batch = result.unwrap();
    assert_eq!(returned_batch.id, "batch_123");
    assert_eq!(returned_batch.processing_status, BatchStatus::InProgress);

    // Verify request was made correctly
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let (method, url, headers, body) = &requests[0];
    assert_eq!(method, &Method::POST);
    assert!(url.contains("/v1/messages/batches"));
    assert!(body.is_some());
    assert!(headers.contains_key("x-api-key"));
}

#[tokio::test]
async fn test_create_batch_empty_requests() {
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = CreateBatchRequest::new(vec![]);

    let result = service.create(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Validation(_) => {}
        e => panic!("Expected validation error, got: {:?}", e),
    }
}

#[tokio::test]
async fn test_create_batch_api_error() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        400,
        "invalid_request_error",
        "Invalid batch request",
    )));

    let service = create_test_service(transport);
    let request = create_test_batch_request();

    let result = service.create(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, message, .. } => {
            assert_eq!(status, 400);
            assert!(message.contains("Invalid batch request"));
        }
        _ => panic!("Expected API error"),
    }
}

// ============================================================================
// Tests: Retrieve Batch
// ============================================================================

#[tokio::test]
async fn test_retrieve_batch_success() {
    let batch = create_test_batch();
    let response_json = serde_json::to_string(&batch).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport.clone());

    let result = service.retrieve("batch_123").await;

    assert!(result.is_ok());
    let returned_batch = result.unwrap();
    assert_eq!(returned_batch.id, "batch_123");

    // Verify request was made correctly
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let (method, url, _headers, body) = &requests[0];
    assert_eq!(method, &Method::GET);
    assert!(url.contains("/v1/messages/batches/batch_123"));
    assert!(body.is_none());
}

#[tokio::test]
async fn test_retrieve_batch_empty_id() {
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
async fn test_retrieve_batch_not_found() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        404,
        "not_found_error",
        "Batch not found",
    )));

    let service = create_test_service(transport);

    let result = service.retrieve("invalid_batch").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, .. } => {
            assert_eq!(status, 404);
        }
        _ => panic!("Expected API error"),
    }
}

// ============================================================================
// Tests: List Batches
// ============================================================================

#[tokio::test]
async fn test_list_batches_success() {
    let batch_list = BatchListResponse::new(
        vec![create_test_batch(), create_test_batch()],
        false,
    );
    let response_json = serde_json::to_string(&batch_list).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport.clone());

    let result = service.list(None).await;

    assert!(result.is_ok());
    let returned_list = result.unwrap();
    assert_eq!(returned_list.data.len(), 2);
    assert!(!returned_list.has_more);

    // Verify request was made correctly
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let (method, url, _headers, body) = &requests[0];
    assert_eq!(method, &Method::GET);
    assert!(url.contains("/v1/messages/batches"));
    assert!(body.is_none());
}

#[tokio::test]
async fn test_list_batches_with_pagination() {
    let batch_list = BatchListResponse::new(vec![create_test_batch()], true);
    let response_json = serde_json::to_string(&batch_list).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport.clone());

    let params = BatchListParams::new()
        .with_after_id("batch_100")
        .with_limit(10);

    let result = service.list(Some(params)).await;

    assert!(result.is_ok());
    let returned_list = result.unwrap();
    assert!(returned_list.has_more);

    // Verify URL includes query parameters
    let requests = transport.get_requests();
    let (_method, url, _headers, _body) = &requests[0];
    assert!(url.contains("after_id=batch_100"));
    assert!(url.contains("limit=10"));
}

#[tokio::test]
async fn test_list_batches_with_before_id() {
    let batch_list = BatchListResponse::new(vec![create_test_batch()], false);
    let response_json = serde_json::to_string(&batch_list).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport.clone());

    let params = BatchListParams::new().with_before_id("batch_200");

    let result = service.list(Some(params)).await;

    assert!(result.is_ok());

    // Verify URL includes query parameter
    let requests = transport.get_requests();
    let (_method, url, _headers, _body) = &requests[0];
    assert!(url.contains("before_id=batch_200"));
}

#[tokio::test]
async fn test_list_batches_empty_list() {
    let batch_list = BatchListResponse::new(vec![], false);
    let response_json = serde_json::to_string(&batch_list).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport);

    let result = service.list(None).await;

    assert!(result.is_ok());
    let returned_list = result.unwrap();
    assert_eq!(returned_list.data.len(), 0);
}

// ============================================================================
// Tests: Cancel Batch
// ============================================================================

#[tokio::test]
async fn test_cancel_batch_success() {
    let mut batch = create_test_batch();
    batch.processing_status = BatchStatus::Canceling;
    batch.cancel_initiated_at = Some("2024-01-01T01:00:00Z".to_string());

    let response_json = serde_json::to_string(&batch).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json)),
    );

    let service = create_test_service(transport.clone());

    let result = service.cancel("batch_123").await;

    assert!(result.is_ok());
    let returned_batch = result.unwrap();
    assert_eq!(returned_batch.processing_status, BatchStatus::Canceling);
    assert!(returned_batch.cancel_initiated_at.is_some());

    // Verify request was made correctly
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let (method, url, _headers, body) = &requests[0];
    assert_eq!(method, &Method::POST);
    assert!(url.contains("/v1/messages/batches/batch_123/cancel"));
    assert!(body.is_none());
}

#[tokio::test]
async fn test_cancel_batch_empty_id() {
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let result = service.cancel("").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Validation(_) => {}
        e => panic!("Expected validation error, got: {:?}", e),
    }
}

#[tokio::test]
async fn test_cancel_batch_already_completed() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        400,
        "invalid_request_error",
        "Batch already completed",
    )));

    let service = create_test_service(transport);

    let result = service.cancel("batch_123").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, message, .. } => {
            assert_eq!(status, 400);
            assert!(message.contains("already completed"));
        }
        _ => panic!("Expected API error"),
    }
}

// ============================================================================
// Tests: Get Batch Results
// ============================================================================

#[tokio::test]
async fn test_get_batch_results_success() {
    // JSONL format (one JSON object per line)
    let jsonl_response = r#"{"custom_id":"req1","type":"succeeded","message":{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"text","text":"Hello!"}],"model":"claude-3-5-sonnet-20241022","stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":5}}}
{"custom_id":"req2","type":"succeeded","message":{"id":"msg_2","type":"message","role":"assistant","content":[{"type":"text","text":"Hi!"}],"model":"claude-3-5-sonnet-20241022","stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":5}}}"#;

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(jsonl_response)),
    );

    let service = create_test_service(transport.clone());

    let result = service.results("batch_123").await;

    assert!(result.is_ok());
    let results = result.unwrap();
    assert_eq!(results.results.len(), 2);
    assert_eq!(results.succeeded().len(), 2);
    assert_eq!(results.errored().len(), 0);

    // Verify request was made correctly
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let (method, url, _headers, body) = &requests[0];
    assert_eq!(method, &Method::GET);
    assert!(url.contains("/v1/messages/batches/batch_123/results"));
    assert!(body.is_none());
}

#[tokio::test]
async fn test_get_batch_results_with_errors() {
    let jsonl_response = r#"{"custom_id":"req1","type":"succeeded","message":{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"text","text":"Hello!"}],"model":"claude-3-5-sonnet-20241022","stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":5}}}
{"custom_id":"req2","type":"errored","error":{"type":"invalid_request_error","message":"Invalid request"}}"#;

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(jsonl_response)),
    );

    let service = create_test_service(transport);

    let result = service.results("batch_123").await;

    assert!(result.is_ok());
    let results = result.unwrap();
    assert_eq!(results.results.len(), 2);
    assert_eq!(results.succeeded().len(), 1);
    assert_eq!(results.errored().len(), 1);
}

#[tokio::test]
async fn test_get_batch_results_empty_id() {
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let result = service.results("").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Validation(_) => {}
        e => panic!("Expected validation error, got: {:?}", e),
    }
}

#[tokio::test]
async fn test_get_batch_results_not_ready() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        400,
        "invalid_request_error",
        "Batch results not ready",
    )));

    let service = create_test_service(transport);

    let result = service.results("batch_123").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, message, .. } => {
            assert_eq!(status, 400);
            assert!(message.contains("not ready"));
        }
        _ => panic!("Expected API error"),
    }
}

// ============================================================================
// Tests: Error Handling
// ============================================================================

#[tokio::test]
async fn test_network_error() {
    let transport = Arc::new(MockHttpTransport::new().with_response(Err(
        AnthropicError::Network("Connection failed".to_string()),
    )));

    let service = create_test_service(transport);

    let result = service.list(None).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Network(msg) => {
            assert!(msg.contains("Connection failed"));
        }
        _ => panic!("Expected network error"),
    }
}

#[tokio::test]
async fn test_authentication_error() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        401,
        "authentication_error",
        "Invalid API key",
    )));

    let service = create_test_service(transport);

    let result = service.list(None).await;

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
async fn test_rate_limit_error() {
    let transport = Arc::new(MockHttpTransport::new().with_response(create_error_response(
        429,
        "rate_limit_error",
        "Rate limit exceeded",
    )));

    let service = create_test_service(transport);

    let result = service.list(None).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, .. } => {
            assert_eq!(status, 429);
        }
        _ => panic!("Expected API error"),
    }
}
