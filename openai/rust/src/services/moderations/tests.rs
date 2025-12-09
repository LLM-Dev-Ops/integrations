//! Unit tests for moderation service

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
) -> ModerationServiceImpl {
    ModerationServiceImpl::new(Arc::new(transport), Arc::new(auth), Arc::new(resilience))
}

#[tokio::test]
async fn test_moderation_safe_content() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(moderation_response_safe());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ModerationRequest {
        input: vec!["Hello, how are you?".to_string()],
        model: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.results.len(), 1);
    assert!(!response.results[0].flagged);
    assert!(mock_transport.verify_request(Method::POST, "/moderations"));
}

#[tokio::test]
async fn test_moderation_flagged_content() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(moderation_response_flagged());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ModerationRequest {
        input: vec!["Inappropriate content".to_string()],
        model: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert!(response.results[0].flagged);
    assert!(response.results[0].categories.hate);
}

#[tokio::test]
async fn test_moderation_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new().with_error("Invalid API key");

    let service = create_test_service(mock_transport, mock_auth, MockResilienceOrchestrator::passthrough());

    let request = ModerationRequest {
        input: vec!["Test".to_string()],
        model: None,
    };

    let result = service.create(request).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_moderation_rate_limit_error() {
    let mock_transport = MockHttpTransport::new()
        .with_error_response(OpenAIError::rate_limit("Rate limit exceeded"));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ModerationRequest {
        input: vec!["Test".to_string()],
        model: None,
    };

    let result = service.create(request).await;
    assert!(result.is_err());
}
