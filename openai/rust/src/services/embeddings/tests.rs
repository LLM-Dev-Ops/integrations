//! Unit tests for embeddings service

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
) -> EmbeddingsServiceImpl {
    EmbeddingsServiceImpl::new(
        Arc::new(transport),
        Arc::new(auth),
        Arc::new(resilience),
    )
}

#[tokio::test]
async fn test_embeddings_success_single_input() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(embeddings_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = EmbeddingsRequest {
        model: "text-embedding-ada-002".to_string(),
        input: vec!["The quick brown fox".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.model, "text-embedding-ada-002");
    assert_eq!(response.data.len(), 1);
    assert!(mock_transport.verify_request(Method::POST, "/embeddings"));
}

#[tokio::test]
async fn test_embeddings_success_multiple_inputs() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(embeddings_response_multiple_inputs());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = EmbeddingsRequest {
        model: "text-embedding-ada-002".to_string(),
        input: vec!["First text".to_string(), "Second text".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.data.len(), 2);
    assert_eq!(response.data[0].index, 0);
    assert_eq!(response.data[1].index, 1);
}

#[tokio::test]
async fn test_embeddings_with_custom_dimensions() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(embeddings_response_custom_dimensions());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = EmbeddingsRequest {
        model: "text-embedding-3-small".to_string(),
        input: vec!["Test text".to_string()],
        encoding_format: None,
        dimensions: Some(512),
        user: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    assert!(mock_transport.verify_request_with_body(
        Method::POST,
        "/embeddings",
        "\"dimensions\":512"
    ));
}

#[tokio::test]
async fn test_embeddings_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new()
        .with_error("Invalid API key");

    let service = create_test_service(
        mock_transport.clone(),
        mock_auth,
        MockResilienceOrchestrator::passthrough(),
    );

    let request = EmbeddingsRequest {
        model: "text-embedding-ada-002".to_string(),
        input: vec!["Test".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = service.create(request).await;

    assert!(result.is_err());
    matches!(result.unwrap_err(), OpenAIError::Authentication { .. });
    assert_eq!(mock_transport.request_count(), 0);
}

#[tokio::test]
async fn test_embeddings_invalid_model_error() {
    let mock_transport = MockHttpTransport::new()
        .with_error_response(OpenAIError::invalid_request("Invalid model"));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = EmbeddingsRequest {
        model: "invalid-model".to_string(),
        input: vec!["Test".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = service.create(request).await;

    assert!(result.is_err());
    matches!(result.unwrap_err(), OpenAIError::InvalidRequest { .. });
}

#[tokio::test]
async fn test_embeddings_rate_limit_error() {
    let mock_transport = MockHttpTransport::new()
        .with_error_response(OpenAIError::rate_limit("Rate limit exceeded"));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = EmbeddingsRequest {
        model: "text-embedding-ada-002".to_string(),
        input: vec!["Test".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = service.create(request).await;

    assert!(result.is_err());
    matches!(result.unwrap_err(), OpenAIError::RateLimit { .. });
}

#[tokio::test]
async fn test_embeddings_resilience_execution() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(embeddings_response());

    let mock_resilience = MockResilienceOrchestrator::new();

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        mock_resilience.clone(),
    );

    let request = EmbeddingsRequest {
        model: "text-embedding-ada-002".to_string(),
        input: vec!["Test".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    assert_eq!(mock_resilience.execution_count(), 1);
}

#[tokio::test]
async fn test_embeddings_3_small_model() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(embeddings_response_3_small());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = EmbeddingsRequest {
        model: "text-embedding-3-small".to_string(),
        input: vec!["Test".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    assert!(mock_transport.verify_request_with_body(
        Method::POST,
        "/embeddings",
        "text-embedding-3-small"
    ));
}

#[tokio::test]
async fn test_embeddings_3_large_model() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(embeddings_response_3_large());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = EmbeddingsRequest {
        model: "text-embedding-3-large".to_string(),
        input: vec!["Test".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
}
