//! Tests for the Chat service.

use cohere_client::fixtures::{api_meta, chat_response, sse_chat_stream_data};
use cohere_client::mocks::{MockClientBuilder, MockHttpTransport, MockResponse};
use cohere_client::services::chat::{ChatMessage, ChatRequest, ChatServiceImpl, MessageRole};
use cohere_client::errors::CohereError;
use std::sync::Arc;

#[tokio::test]
async fn test_chat_sends_message() {
    let mock_response = chat_response();
    let (service, transport) = MockClientBuilder::new()
        .with_response(MockResponse::json(&mock_response))
        .build(|t, a, u| ChatServiceImpl::new(t, a, u));

    let request = ChatRequest::new("Hello");
    let result = service.chat(request).await.unwrap();

    assert_eq!(result.text, mock_response.text);
    assert!(result.generation_id.is_some());

    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].method, http::Method::POST);
    assert!(requests[0].url.contains("/chat"));
}

#[tokio::test]
async fn test_chat_with_history() {
    let (service, transport) = MockClientBuilder::new()
        .with_response(MockResponse::json(&chat_response()))
        .build(|t, a, u| ChatServiceImpl::new(t, a, u));

    let request = ChatRequest::new("How are you?")
        .chat_history(vec![
            ChatMessage::user("Hello"),
            ChatMessage::chatbot("Hi there!"),
        ]);

    let _ = service.chat(request).await.unwrap();

    let requests = transport.get_requests();
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("chat_history"));
}

#[tokio::test]
async fn test_chat_with_generation_options() {
    let (service, transport) = MockClientBuilder::new()
        .with_response(MockResponse::json(&chat_response()))
        .build(|t, a, u| ChatServiceImpl::new(t, a, u));

    let request = ChatRequest::new("Hello")
        .temperature(0.7)
        .max_tokens(100)
        .top_p(0.9)
        .top_k(50);

    let _ = service.chat(request).await.unwrap();

    let requests = transport.get_requests();
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("\"temperature\":0.7"));
    assert!(body_str.contains("\"max_tokens\":100"));
}

#[tokio::test]
async fn test_chat_validation_empty_message() {
    let (service, _) = MockClientBuilder::new()
        .with_response(MockResponse::json(&chat_response()))
        .build(|t, a, u| ChatServiceImpl::new(t, a, u));

    let request = ChatRequest::new("");
    let result = service.chat(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        CohereError::Validation { .. } => {}
        other => panic!("Expected validation error, got {:?}", other),
    }
}

#[tokio::test]
async fn test_chat_validation_invalid_temperature() {
    let (service, _) = MockClientBuilder::new()
        .with_response(MockResponse::json(&chat_response()))
        .build(|t, a, u| ChatServiceImpl::new(t, a, u));

    let request = ChatRequest::new("Hello").temperature(5.0);
    let result = service.chat(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        CohereError::Validation { .. } => {}
        other => panic!("Expected validation error, got {:?}", other),
    }
}

#[tokio::test]
async fn test_chat_handles_error_response() {
    let (service, _) = MockClientBuilder::new()
        .with_response(MockResponse::error(400, "Invalid request"))
        .build(|t, a, u| ChatServiceImpl::new(t, a, u));

    let request = ChatRequest::new("Hello");
    let result = service.chat(request).await;

    assert!(result.is_err());
}

#[test]
fn test_chat_message_constructors() {
    let user_msg = ChatMessage::user("Hello");
    assert_eq!(user_msg.role, MessageRole::User);
    assert_eq!(user_msg.content, "Hello");

    let chatbot_msg = ChatMessage::chatbot("Hi there!");
    assert_eq!(chatbot_msg.role, MessageRole::Chatbot);
    assert_eq!(chatbot_msg.content, "Hi there!");

    let system_msg = ChatMessage::system("You are a helpful assistant.");
    assert_eq!(system_msg.role, MessageRole::System);
}
