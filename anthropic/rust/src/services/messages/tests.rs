//! Comprehensive tests for the Messages service
//!
//! These tests follow London-School TDD patterns using mocks for all dependencies.

use super::*;
use crate::auth::AuthManager;
use crate::error::AnthropicError;
use crate::transport::{HttpResponse, HttpTransport};
use async_trait::async_trait;
use bytes::Bytes;
use futures::stream;
use http::{HeaderMap, Method};
use std::sync::{Arc, Mutex};
use url::Url;

// ============================================================================
// Mock Implementations
// ============================================================================

/// Mock HTTP transport for testing
struct MockHttpTransport {
    responses: Arc<Mutex<Vec<Result<HttpResponse, AnthropicError>>>>,
    stream_responses: Arc<Mutex<Vec<Result<Vec<String>, AnthropicError>>>>,
    requests: Arc<Mutex<Vec<(Method, String, HeaderMap, Option<Vec<u8>>)>>>,
}

impl MockHttpTransport {
    fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(Vec::new())),
            stream_responses: Arc::new(Mutex::new(Vec::new())),
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn with_response(mut self, response: Result<HttpResponse, AnthropicError>) -> Self {
        self.responses.lock().unwrap().push(response);
        self
    }

    fn with_stream_response(mut self, events: Vec<String>) -> Self {
        self.stream_responses.lock().unwrap().push(Ok(events));
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
        method: Method,
        url: String,
        headers: HeaderMap,
        body: Option<Vec<u8>>,
    ) -> Result<Box<dyn futures::Stream<Item = Result<Bytes, AnthropicError>> + Send + Unpin>, AnthropicError>
    {
        self.requests
            .lock()
            .unwrap()
            .push((method, url, headers, body));

        let events = self
            .stream_responses
            .lock()
            .unwrap()
            .pop()
            .unwrap_or_else(|| Ok(Vec::new()))?;

        let byte_stream = events
            .into_iter()
            .map(|s| Ok(Bytes::from(s)))
            .collect::<Vec<_>>();

        Ok(Box::new(Box::pin(stream::iter(byte_stream))))
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

fn create_test_service(
    transport: Arc<dyn HttpTransport>,
) -> MessagesServiceImpl {
    let auth_manager = Arc::new(MockAuthManager::new());
    let base_url = Url::parse("https://api.anthropic.com").unwrap();
    MessagesServiceImpl::new(transport, auth_manager, base_url)
}

fn create_success_response(body: &str) -> Result<HttpResponse, AnthropicError> {
    Ok(HttpResponse {
        status: 200,
        headers: HeaderMap::new(),
        body: body.as_bytes().to_vec(),
    })
}

fn create_error_response(status: u16, error_type: &str, message: &str) -> Result<HttpResponse, AnthropicError> {
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

fn create_test_message() -> Message {
    Message {
        id: "msg_123".to_string(),
        message_type: "message".to_string(),
        role: Role::Assistant,
        content: vec![ContentBlock::Text {
            text: "Hello!".to_string(),
            cache_control: None,
        }],
        model: "claude-3-5-sonnet-20241022".to_string(),
        stop_reason: Some(StopReason::EndTurn),
        stop_sequence: None,
        usage: Usage {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: None,
            cache_read_input_tokens: None,
        },
    }
}

// ============================================================================
// Tests: Create Message
// ============================================================================

#[tokio::test]
async fn test_create_message_success() {
    let message = create_test_message();
    let response_json = serde_json::to_string(&message).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json))
    );

    let service = create_test_service(transport.clone());

    let request = CreateMessageRequest::new(
        "claude-3-5-sonnet-20241022",
        1024,
        vec![MessageParam::user("Hello, Claude!")],
    );

    let result = service.create(request).await;

    assert!(result.is_ok());
    let returned_message = result.unwrap();
    assert_eq!(returned_message.id, "msg_123");
    assert_eq!(returned_message.role, Role::Assistant);

    // Verify request was made correctly
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let (method, url, _headers, body) = &requests[0];
    assert_eq!(method, &Method::POST);
    assert!(url.contains("/v1/messages"));
    assert!(body.is_some());
}

#[tokio::test]
async fn test_create_message_with_system_prompt() {
    let message = create_test_message();
    let response_json = serde_json::to_string(&message).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json))
    );

    let service = create_test_service(transport.clone());

    let request = CreateMessageRequest::new(
        "claude-3-5-sonnet-20241022",
        1024,
        vec![MessageParam::user("Hello!")],
    )
    .with_system("You are a helpful assistant");

    let result = service.create(request).await;

    assert!(result.is_ok());

    // Verify the request body includes system prompt
    let requests = transport.get_requests();
    let (_method, _url, _headers, body) = &requests[0];
    let body_json: serde_json::Value =
        serde_json::from_slice(body.as_ref().unwrap()).unwrap();
    assert!(body_json.get("system").is_some());
}

#[tokio::test]
async fn test_create_message_with_temperature() {
    let message = create_test_message();
    let response_json = serde_json::to_string(&message).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json))
    );

    let service = create_test_service(transport);

    let request = CreateMessageRequest::new(
        "claude-3-5-sonnet-20241022",
        1024,
        vec![MessageParam::user("Hello!")],
    )
    .with_temperature(0.7);

    let result = service.create(request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_create_message_with_tools() {
    let message = create_test_message();
    let response_json = serde_json::to_string(&message).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json))
    );

    let service = create_test_service(transport);

    let tool = Tool::new(
        "get_weather",
        "Get the current weather",
        serde_json::json!({
            "type": "object",
            "properties": {
                "location": {"type": "string"}
            }
        }),
    );

    let request = CreateMessageRequest::new(
        "claude-3-5-sonnet-20241022",
        1024,
        vec![MessageParam::user("What's the weather?")],
    )
    .with_tools(vec![tool]);

    let result = service.create(request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_create_message_api_error() {
    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_error_response(
            400,
            "invalid_request_error",
            "Invalid model specified",
        ))
    );

    let service = create_test_service(transport);

    let request = CreateMessageRequest::new(
        "invalid-model",
        1024,
        vec![MessageParam::user("Hello!")],
    );

    let result = service.create(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Api { status, message, .. } => {
            assert_eq!(status, 400);
            assert!(message.contains("Invalid model"));
        }
        _ => panic!("Expected API error"),
    }
}

#[tokio::test]
async fn test_create_message_validation_error() {
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    // Empty model should fail validation
    let request = CreateMessageRequest::new("", 1024, vec![MessageParam::user("Hello!")]);

    let result = service.create(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Validation(_) => {}
        e => panic!("Expected validation error, got: {:?}", e),
    }
}

// ============================================================================
// Tests: Streaming
// ============================================================================

#[tokio::test]
async fn test_create_stream_success() {
    let events = vec![
        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_123\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-3-5-sonnet-20241022\",\"usage\":{\"input_tokens\":10,\"output_tokens\":0}}}\n".to_string(),
        "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n".to_string(),
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n".to_string(),
        "data: {\"type\":\"content_block_stop\",\"index\":0}\n".to_string(),
        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"input_tokens\":10,\"output_tokens\":5}}\n".to_string(),
        "data: {\"type\":\"message_stop\"}\n".to_string(),
    ];

    let transport = Arc::new(MockHttpTransport::new().with_stream_response(events));

    let service = create_test_service(transport);

    let request = CreateMessageRequest::new(
        "claude-3-5-sonnet-20241022",
        1024,
        vec![MessageParam::user("Hello!")],
    );

    let result = service.create_stream(request).await;

    assert!(result.is_ok());
    let stream = result.unwrap();

    // Collect the stream
    let message = stream.collect().await;
    assert!(message.is_ok());
    let message = message.unwrap();
    assert_eq!(message.id, "msg_123");
}

// ============================================================================
// Tests: Token Counting
// ============================================================================

#[tokio::test]
async fn test_count_tokens_success() {
    let token_count = TokenCount {
        input_tokens: 42,
    };
    let response_json = serde_json::to_string(&token_count).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json))
    );

    let service = create_test_service(transport.clone());

    let request = CountTokensRequest::new(
        "claude-3-5-sonnet-20241022",
        vec![MessageParam::user("Hello, Claude!")],
    );

    let result = service.count_tokens(request).await;

    assert!(result.is_ok());
    let count = result.unwrap();
    assert_eq!(count.input_tokens, 42);

    // Verify request was made to the correct endpoint
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let (_method, url, _headers, _body) = &requests[0];
    assert!(url.contains("/v1/messages/count_tokens"));
}

#[tokio::test]
async fn test_count_tokens_with_system() {
    let token_count = TokenCount {
        input_tokens: 50,
    };
    let response_json = serde_json::to_string(&token_count).unwrap();

    let transport = Arc::new(
        MockHttpTransport::new().with_response(create_success_response(&response_json))
    );

    let service = create_test_service(transport);

    let request = CountTokensRequest::new(
        "claude-3-5-sonnet-20241022",
        vec![MessageParam::user("Hello!")],
    )
    .with_system("You are a helpful assistant");

    let result = service.count_tokens(request).await;

    assert!(result.is_ok());
    let count = result.unwrap();
    assert_eq!(count.input_tokens, 50);
}

#[tokio::test]
async fn test_count_tokens_validation_error() {
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    // Empty messages should fail validation
    let request = CountTokensRequest::new("claude-3-5-sonnet-20241022", vec![]);

    let result = service.count_tokens(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        AnthropicError::Validation(_) => {}
        e => panic!("Expected validation error, got: {:?}", e),
    }
}

// ============================================================================
// Tests: Type Conversions and Builders
// ============================================================================

#[test]
fn test_message_param_builders() {
    let user_msg = MessageParam::user("Hello");
    assert_eq!(user_msg.role, Role::User);
    assert!(matches!(user_msg.content, MessageContent::Text(_)));

    let assistant_msg = MessageParam::assistant("Hi there");
    assert_eq!(assistant_msg.role, Role::Assistant);
}

#[test]
fn test_create_message_request_builder() {
    let request = CreateMessageRequest::new(
        "claude-3-5-sonnet-20241022",
        1024,
        vec![MessageParam::user("Hello")],
    )
    .with_temperature(0.7)
    .with_top_p(0.9)
    .with_top_k(40);

    assert_eq!(request.model, "claude-3-5-sonnet-20241022");
    assert_eq!(request.max_tokens, 1024);
    assert_eq!(request.temperature, Some(0.7));
    assert_eq!(request.top_p, Some(0.9));
    assert_eq!(request.top_k, Some(40));
}

#[test]
fn test_tool_builder() {
    let tool = Tool::new(
        "get_weather",
        "Get weather information",
        serde_json::json!({"type": "object"}),
    )
    .with_cache_control(CacheControl::ephemeral());

    assert_eq!(tool.name, "get_weather");
    assert!(tool.cache_control.is_some());
}

#[test]
fn test_thinking_config() {
    let thinking = ThinkingConfig::enabled();
    assert_eq!(thinking.thinking_type, "enabled");
    assert!(thinking.budget_tokens.is_none());

    let thinking_with_budget = ThinkingConfig::with_budget(1000);
    assert_eq!(thinking_with_budget.budget_tokens, Some(1000));
}

// ============================================================================
// Tests: Serialization/Deserialization
// ============================================================================

#[test]
fn test_message_serialization() {
    let message = create_test_message();
    let json = serde_json::to_string(&message).unwrap();
    let deserialized: Message = serde_json::from_str(&json).unwrap();
    assert_eq!(message, deserialized);
}

#[test]
fn test_content_block_serialization() {
    let text_block = ContentBlock::Text {
        text: "Hello".to_string(),
        cache_control: None,
    };
    let json = serde_json::to_string(&text_block).unwrap();
    assert!(json.contains("\"type\":\"text\""));

    let deserialized: ContentBlock = serde_json::from_str(&json).unwrap();
    assert_eq!(text_block, deserialized);
}

#[test]
fn test_tool_use_serialization() {
    let tool_use = ContentBlock::ToolUse {
        id: "tool_123".to_string(),
        name: "get_weather".to_string(),
        input: serde_json::json!({"location": "London"}),
    };

    let json = serde_json::to_string(&tool_use).unwrap();
    assert!(json.contains("\"type\":\"tool_use\""));

    let deserialized: ContentBlock = serde_json::from_str(&json).unwrap();
    assert_eq!(tool_use, deserialized);
}
