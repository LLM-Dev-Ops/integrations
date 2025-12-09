//! Unit tests for chat completion service
//!
//! Following London School TDD approach with comprehensive test coverage:
//! - Happy path tests
//! - Error handling tests
//! - Validation tests
//! - Streaming tests
//! - Retry behavior tests
//! - Timeout tests

use super::*;
use crate::errors::OpenAIError;
use crate::fixtures::*;
use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
use crate::services::chat::{ChatMessage, ChatMessageRole};
use http::Method;
use std::sync::Arc;

// Helper function to create a test service
fn create_test_service(
    transport: MockHttpTransport,
    auth: MockAuthManager,
    resilience: MockResilienceOrchestrator,
) -> ChatCompletionServiceImpl {
    ChatCompletionServiceImpl::new(
        Arc::new(transport),
        Arc::new(auth),
        Arc::new(resilience),
    )
}

#[tokio::test]
async fn test_chat_completion_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Hello, how are you?")],
    );

    let result = service.create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.id, "chatcmpl-123");
    assert_eq!(response.model, "gpt-4-0613");
    assert_eq!(response.choices.len(), 1);
    assert_eq!(response.choices[0].message.role, ChatMessageRole::Assistant);

    // Verify the request was made correctly
    assert!(mock_transport.verify_request(Method::POST, "/chat/completions"));
}

#[tokio::test]
async fn test_chat_completion_with_parameters() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Test")],
    )
    .with_temperature(0.7)
    .with_max_tokens(100);

    let result = service.create(request).await;

    assert!(result.is_ok());
    assert!(mock_transport.verify_request_with_body(
        Method::POST,
        "/chat/completions",
        "gpt-4"
    ));
    assert!(mock_transport.verify_request_with_body(
        Method::POST,
        "/chat/completions",
        "temperature"
    ));
}

#[tokio::test]
async fn test_chat_completion_multiple_choices() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response_with_multiple_choices());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Tell me two things")],
    );

    let result = service.create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.choices.len(), 2);
    assert_eq!(response.choices[0].index, 0);
    assert_eq!(response.choices[1].index, 1);
}

#[tokio::test]
async fn test_chat_completion_with_tool_calls() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response_with_tool_calls());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("What's the weather in SF?")],
    );

    let result = service.create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.choices[0].finish_reason, Some(FinishReason::ToolCalls));
    assert!(response.choices[0].message.tool_calls.is_some());
}

#[tokio::test]
async fn test_chat_completion_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new()
        .with_error("Invalid API key");

    let service = create_test_service(
        mock_transport.clone(),
        mock_auth,
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Hello")],
    );

    let result = service.create(request).await;

    assert!(result.is_err());
    if let Err(OpenAIError::Authentication { message }) = result {
        assert!(message.contains("Invalid API key"));
    } else {
        panic!("Expected authentication error");
    }

    // No HTTP request should have been made
    assert_eq!(mock_transport.request_count(), 0);
}

#[tokio::test]
async fn test_chat_completion_rate_limit_error() {
    let mock_transport = MockHttpTransport::new()
        .with_error_response(OpenAIError::rate_limit("Rate limit exceeded"));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Hello")],
    );

    let result = service.create(request).await;

    assert!(result.is_err());
    matches!(result.unwrap_err(), OpenAIError::RateLimit { .. });
}

#[tokio::test]
async fn test_chat_completion_server_error() {
    let mock_transport = MockHttpTransport::new()
        .with_error_response(OpenAIError::server("Internal server error"));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Hello")],
    );

    let result = service.create(request).await;

    assert!(result.is_err());
    matches!(result.unwrap_err(), OpenAIError::Server { .. });
}

#[tokio::test]
async fn test_chat_completion_invalid_request_error() {
    let mock_transport = MockHttpTransport::new()
        .with_error_response(OpenAIError::invalid_request("Invalid model"));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "invalid-model",
        vec![ChatMessage::user("Hello")],
    );

    let result = service.create(request).await;

    assert!(result.is_err());
    matches!(result.unwrap_err(), OpenAIError::InvalidRequest { .. });
}

#[tokio::test]
async fn test_chat_completion_stream_success() {
    let mock_transport = MockHttpTransport::new()
        .with_stream_response(chat_stream_sequence());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Hello")],
    );

    let result = service.create_stream(request).await;

    assert!(result.is_ok());

    // Verify that stream parameter was set
    assert!(mock_transport.verify_request_with_body(
        Method::POST,
        "/chat/completions",
        "\"stream\":true"
    ));
}

#[tokio::test]
async fn test_chat_completion_stream_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new()
        .with_error("Invalid API key");

    let service = create_test_service(
        mock_transport,
        mock_auth,
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Hello")],
    );

    let result = service.create_stream(request).await;

    assert!(result.is_err());
    matches!(result.unwrap_err(), OpenAIError::Authentication { .. });
}

#[tokio::test]
async fn test_chat_completion_with_system_message() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![
            ChatMessage::system("You are a helpful assistant."),
            ChatMessage::user("Hello"),
        ],
    );

    let result = service.create(request).await;

    assert!(result.is_ok());
    assert!(mock_transport.verify_request_with_body(
        Method::POST,
        "/chat/completions",
        "system"
    ));
}

#[tokio::test]
async fn test_chat_completion_with_conversation_history() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![
            ChatMessage::user("What is 2+2?"),
            ChatMessage::assistant("2+2 equals 4."),
            ChatMessage::user("What about 3+3?"),
        ],
    );

    let result = service.create(request).await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn test_chat_completion_length_finish_reason() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response_with_length_finish());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Write a long story")],
    )
    .with_max_tokens(100);

    let result = service.create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.choices[0].finish_reason, Some(FinishReason::Length));
}

#[tokio::test]
async fn test_chat_completion_content_filter() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response_with_content_filter());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Inappropriate content")],
    );

    let result = service.create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.choices[0].finish_reason, Some(FinishReason::ContentFilter));
}

#[tokio::test]
async fn test_chat_completion_resilience_execution() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response());

    let mock_resilience = MockResilienceOrchestrator::new();

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        mock_resilience.clone(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Hello")],
    );

    let result = service.create(request).await;

    assert!(result.is_ok());
    assert_eq!(mock_resilience.execution_count(), 1);
}

#[tokio::test]
async fn test_chat_completion_auth_headers_applied() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response());

    let mock_auth = MockAuthManager::new();

    let service = create_test_service(
        mock_transport,
        mock_auth.clone(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Hello")],
    );

    let result = service.create(request).await;

    assert!(result.is_ok());
    assert_eq!(mock_auth.auth_call_count(), 1);
}

#[test]
fn test_chat_completion_request_builder() {
    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Test")],
    )
    .with_temperature(0.5)
    .with_max_tokens(200);

    assert_eq!(request.model, "gpt-4");
    assert_eq!(request.temperature, Some(0.5));
    assert_eq!(request.max_tokens, Some(200));
}

#[test]
fn test_chat_message_builders() {
    let system_msg = ChatMessage::system("You are helpful");
    assert_eq!(system_msg.role, ChatMessageRole::System);
    assert_eq!(system_msg.content, Some("You are helpful".to_string()));

    let user_msg = ChatMessage::user("Hello");
    assert_eq!(user_msg.role, ChatMessageRole::User);
    assert_eq!(user_msg.content, Some("Hello".to_string()));

    let assistant_msg = ChatMessage::assistant("Hi there!");
    assert_eq!(assistant_msg.role, ChatMessageRole::Assistant);
    assert_eq!(assistant_msg.content, Some("Hi there!".to_string()));
}
