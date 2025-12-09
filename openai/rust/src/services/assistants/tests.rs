//! Unit tests for assistants service

use super::*;
use crate::errors::OpenAIError;
use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
use http::Method;
use serde_json::json;
use std::sync::Arc;

fn create_test_service(
    transport: MockHttpTransport,
    auth: MockAuthManager,
    resilience: MockResilienceOrchestrator,
) -> AssistantServiceImpl {
    AssistantServiceImpl::new(Arc::new(transport), Arc::new(auth), Arc::new(resilience))
}

fn assistant_response() -> serde_json::Value {
    json!({
        "id": "asst_abc123",
        "object": "assistant",
        "created_at": 1677610602,
        "name": "Math Tutor",
        "description": null,
        "model": "gpt-4",
        "instructions": "You are a helpful math tutor.",
        "tools": [],
        "file_ids": [],
        "metadata": {}
    })
}

#[tokio::test]
async fn test_create_assistant_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(assistant_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = AssistantRequest {
        model: "gpt-4".to_string(),
        name: Some("Math Tutor".to_string()),
        description: None,
        instructions: Some("You are a helpful math tutor.".to_string()),
        tools: None,
        file_ids: None,
        metadata: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    let assistant = result.unwrap();
    assert_eq!(assistant.id, "asst_abc123");
    assert!(mock_transport.verify_request(Method::POST, "/assistants"));
}

#[tokio::test]
async fn test_list_assistants_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(json!({
            "object": "list",
            "data": [assistant_response()],
            "has_more": false
        }));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.list(None, None, None, None).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.data.len(), 1);
}

#[tokio::test]
async fn test_retrieve_assistant_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(assistant_response());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.retrieve("asst_abc123").await;

    assert!(result.is_ok());
    let assistant = result.unwrap();
    assert_eq!(assistant.id, "asst_abc123");
}

#[tokio::test]
async fn test_delete_assistant_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(json!({
            "id": "asst_abc123",
            "object": "assistant.deleted",
            "deleted": true
        }));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.delete("asst_abc123").await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_create_assistant_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new().with_error("Invalid API key");

    let service = create_test_service(mock_transport, mock_auth, MockResilienceOrchestrator::passthrough());

    let request = AssistantRequest {
        model: "gpt-4".to_string(),
        name: None,
        description: None,
        instructions: None,
        tools: None,
        file_ids: None,
        metadata: None,
    };

    let result = service.create(request).await;
    assert!(result.is_err());
}
