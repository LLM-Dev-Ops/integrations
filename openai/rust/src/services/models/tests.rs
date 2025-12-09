//! Unit tests for model service

use super::*;
use crate::errors::OpenAIError;
use crate::fixtures::*;
use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
use http::Method;
use std::sync::Arc;

fn create_test_service(
    transport: MockHttpTransport,
    auth: MockAuthManager,
    resilience: MockResilienceOrchestrator,
) -> ModelServiceImpl {
    ModelServiceImpl::new(Arc::new(transport), Arc::new(auth), Arc::new(resilience))
}

#[tokio::test]
async fn test_list_models_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(list_models_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.list().await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.data.len(), 2);
    assert!(mock_transport.verify_request(Method::GET, "/models"));
}

#[tokio::test]
async fn test_retrieve_model_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(retrieve_model_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.retrieve("gpt-4-0613").await;

    assert!(result.is_ok());
    let model = result.unwrap();
    assert_eq!(model.id, "gpt-4-0613");
    assert!(mock_transport.verify_request_with_body(Method::GET, "/models/gpt-4-0613", ""));
}

#[tokio::test]
async fn test_list_models_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new().with_error("Invalid API key");

    let service = create_test_service(
        mock_transport,
        mock_auth,
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.list().await;
    assert!(result.is_err());
    matches!(result.unwrap_err(), OpenAIError::Authentication { .. });
}

#[tokio::test]
async fn test_retrieve_model_not_found() {
    let mock_transport = MockHttpTransport::new()
        .with_error_response(OpenAIError::invalid_request("Model not found"));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.retrieve("invalid-model").await;
    assert!(result.is_err());
}
