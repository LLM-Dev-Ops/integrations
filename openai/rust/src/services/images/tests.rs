//! Unit tests for image service

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
) -> ImageServiceImpl {
    ImageServiceImpl::new(Arc::new(transport), Arc::new(auth), Arc::new(resilience))
}

#[tokio::test]
async fn test_image_generation_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(image_generation_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ImageGenerationRequest {
        prompt: "A white cat".to_string(),
        model: Some("dall-e-3".to_string()),
        n: None,
        size: None,
        response_format: None,
        quality: None,
        style: None,
        user: None,
    };

    let result = service.generate(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.data.len(), 1);
    assert!(mock_transport.verify_request(Method::POST, "/images/generations"));
}

#[tokio::test]
async fn test_image_generation_with_b64_response() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(image_generation_response_b64());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ImageGenerationRequest {
        prompt: "A cat".to_string(),
        model: Some("dall-e-3".to_string()),
        n: None,
        size: None,
        response_format: Some("b64_json".to_string()),
        quality: None,
        style: None,
        user: None,
    };

    let result = service.generate(request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_image_generation_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new().with_error("Invalid API key");

    let service = create_test_service(mock_transport, mock_auth, MockResilienceOrchestrator::passthrough());

    let request = ImageGenerationRequest {
        prompt: "Test".to_string(),
        model: None,
        n: None,
        size: None,
        response_format: None,
        quality: None,
        style: None,
        user: None,
    };

    let result = service.generate(request).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_image_generation_invalid_prompt() {
    let mock_transport = MockHttpTransport::new()
        .with_error_response(OpenAIError::invalid_request("Invalid prompt"));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ImageGenerationRequest {
        prompt: "".to_string(),
        model: None,
        n: None,
        size: None,
        response_format: None,
        quality: None,
        style: None,
        user: None,
    };

    let result = service.generate(request).await;
    assert!(result.is_err());
}
