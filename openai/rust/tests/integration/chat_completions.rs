//! Integration tests for chat completions

use super::*;
use integrations_openai::prelude::*;
use integrations_openai::services::chat::{ChatMessage, ChatMessageRole};
use serde_json::json;
use wiremock::matchers::{body_json_schema, method, path};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn test_chat_completion_integration_success() {
    let mock_server = setup_mock_server().await;

    // Set up mock response
    let response_body = json!({
        "id": "chatcmpl-integration-123",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "Integration test response"
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15
        }
    });

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
        .mount(&mock_server)
        .await;

    // Create client pointing to mock server
    let config = OpenAIConfig {
        api_key: "test-api-key".to_string(),
        base_url: Some(mock_server.uri()),
        ..Default::default()
    };

    let client = OpenAIClientBuilder::new()
        .with_config(config)
        .build()
        .expect("Failed to build client");

    // Make request
    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Test message")],
    );

    let result = client.chat().create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.id, "chatcmpl-integration-123");
    assert_eq!(response.choices[0].message.content, Some("Integration test response".to_string()));
}

#[tokio::test]
async fn test_chat_completion_integration_authentication_error() {
    let mock_server = setup_mock_server().await;

    // Set up mock error response
    let error_body = json!({
        "error": {
            "message": "Invalid API key",
            "type": "invalid_request_error",
            "code": "invalid_api_key"
        }
    });

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(401).set_body_json(error_body))
        .mount(&mock_server)
        .await;

    let config = OpenAIConfig {
        api_key: "invalid-key".to_string(),
        base_url: Some(mock_server.uri()),
        ..Default::default()
    };

    let client = OpenAIClientBuilder::new()
        .with_config(config)
        .build()
        .expect("Failed to build client");

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Test")],
    );

    let result = client.chat().create(request).await;

    assert!(result.is_err());
}

#[tokio::test]
async fn test_chat_completion_integration_rate_limit() {
    let mock_server = setup_mock_server().await;

    let error_body = json!({
        "error": {
            "message": "Rate limit exceeded",
            "type": "rate_limit_error",
            "code": "rate_limit_exceeded"
        }
    });

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(429).set_body_json(error_body))
        .mount(&mock_server)
        .await;

    let config = OpenAIConfig {
        api_key: "test-api-key".to_string(),
        base_url: Some(mock_server.uri()),
        ..Default::default()
    };

    let client = OpenAIClientBuilder::new()
        .with_config(config)
        .build()
        .expect("Failed to build client");

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Test")],
    );

    let result = client.chat().create(request).await;

    assert!(result.is_err());
}

#[tokio::test]
async fn test_chat_completion_integration_with_parameters() {
    let mock_server = setup_mock_server().await;

    let response_body = json!({
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "Response"
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15
        }
    });

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
        .mount(&mock_server)
        .await;

    let config = OpenAIConfig {
        api_key: "test-api-key".to_string(),
        base_url: Some(mock_server.uri()),
        ..Default::default()
    };

    let client = OpenAIClientBuilder::new()
        .with_config(config)
        .build()
        .expect("Failed to build client");

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Test")],
    )
    .with_temperature(0.7)
    .with_max_tokens(100);

    let result = client.chat().create(request).await;

    assert!(result.is_ok());
}
