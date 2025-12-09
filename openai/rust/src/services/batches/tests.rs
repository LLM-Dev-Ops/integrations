//! Unit tests for batch service

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
) -> BatchServiceImpl {
    BatchServiceImpl::new(Arc::new(transport), Arc::new(auth), Arc::new(resilience))
}

#[tokio::test]
async fn test_create_batch_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(batch_response_validating());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = BatchRequest {
        input_file_id: "file-abc123".to_string(),
        endpoint: "/v1/chat/completions".to_string(),
        completion_window: "24h".to_string(),
        metadata: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    let batch = result.unwrap();
    assert_eq!(batch.id, "batch_abc123");
    assert_eq!(batch.status, BatchStatus::Validating);
    assert!(mock_transport.verify_request(Method::POST, "/batches"));
}

#[tokio::test]
async fn test_retrieve_batch_completed() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(batch_response_completed());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.retrieve("batch_abc123").await;

    assert!(result.is_ok());
    let batch = result.unwrap();
    assert_eq!(batch.status, BatchStatus::Completed);
    assert_eq!(batch.request_counts.completed, 100);
}

#[tokio::test]
async fn test_list_batches_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(list_batches_response());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.list(None, None).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.data.len(), 1);
}

#[tokio::test]
async fn test_cancel_batch_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(batch_response_validating());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.cancel("batch_abc123").await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_create_batch_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new().with_error("Invalid API key");

    let service = create_test_service(mock_transport, mock_auth, MockResilienceOrchestrator::passthrough());

    let request = BatchRequest {
        input_file_id: "file-abc123".to_string(),
        endpoint: "/v1/chat/completions".to_string(),
        completion_window: "24h".to_string(),
        metadata: None,
    };

    let result = service.create(request).await;
    assert!(result.is_err());
}
