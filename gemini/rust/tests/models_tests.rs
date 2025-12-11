//! Integration tests for models service.

use integrations_gemini::mocks::{MockAuthManager, MockHttpTransport};
use integrations_gemini::services::models::ModelsServiceImpl;
use integrations_gemini::services::ModelsService;
use integrations_gemini::types::ListModelsParams;
use integrations_gemini::{GeminiConfig, GeminiError};
use secrecy::SecretString;
use std::sync::Arc;

/// Helper to create a test models service with mock transport.
fn create_test_service(transport: Arc<MockHttpTransport>) -> ModelsServiceImpl {
    let config = Arc::new(
        GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap()
    );

    let auth_manager = Arc::new(MockAuthManager::new("test-key"));

    ModelsServiceImpl::new(config, transport, auth_manager)
}

/// Helper to create a test models service without caching.
fn create_test_service_no_cache(transport: Arc<MockHttpTransport>) -> ModelsServiceImpl {
    let config = Arc::new(
        GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap()
    );

    let auth_manager = Arc::new(MockAuthManager::new("test-key"));

    ModelsServiceImpl::new_without_cache(config, transport, auth_manager)
}

#[tokio::test]
async fn test_list_models_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let models_json = r#"{
        "models": [
            {
                "name": "models/gemini-1.5-pro",
                "version": "001",
                "displayName": "Gemini 1.5 Pro",
                "description": "Advanced multimodal model",
                "inputTokenLimit": 1000000,
                "outputTokenLimit": 8192,
                "supportedGenerationMethods": ["generateContent", "countTokens"],
                "temperature": 1.0,
                "topP": 0.95,
                "topK": 64
            },
            {
                "name": "models/gemini-1.5-flash",
                "version": "001",
                "displayName": "Gemini 1.5 Flash",
                "description": "Fast and efficient model",
                "inputTokenLimit": 1000000,
                "outputTokenLimit": 8192,
                "supportedGenerationMethods": ["generateContent", "countTokens"]
            }
        ]
    }"#;
    transport.enqueue_json_response(200, models_json);

    let service = create_test_service(transport.clone());

    // Act
    let response = service.list(None).await;

    // Assert
    assert!(response.is_ok(), "Expected successful models list");
    let response = response.unwrap();
    assert_eq!(response.models.len(), 2);
    assert_eq!(response.models[0].name, "models/gemini-1.5-pro");
    assert_eq!(response.models[1].name, "models/gemini-1.5-flash");

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Get, "models");
}

#[tokio::test]
async fn test_list_models_with_pagination() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let models_json = r#"{
        "models": [
            {
                "name": "models/gemini-1.5-pro",
                "displayName": "Gemini 1.5 Pro"
            }
        ],
        "nextPageToken": "next_page_token_123"
    }"#;
    transport.enqueue_json_response(200, models_json);

    let service = create_test_service(transport.clone());
    let params = ListModelsParams {
        page_size: Some(10),
        page_token: None,
    };

    // Act
    let response = service.list(Some(params)).await;

    // Assert
    assert!(response.is_ok());
    let response = response.unwrap();
    assert_eq!(response.models.len(), 1);
    assert_eq!(response.next_page_token, Some("next_page_token_123".to_string()));

    // Verify request includes pagination params
    let requests = transport.get_requests();
    assert!(requests[0].url.contains("pageSize=10"));
}

#[tokio::test]
async fn test_list_models_with_page_token() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let models_json = r#"{
        "models": [
            {
                "name": "models/gemini-1.5-flash",
                "displayName": "Gemini 1.5 Flash"
            }
        ]
    }"#;
    transport.enqueue_json_response(200, models_json);

    let service = create_test_service(transport.clone());
    let params = ListModelsParams {
        page_size: Some(10),
        page_token: Some("page_token_abc".to_string()),
    };

    // Act
    let response = service.list(Some(params)).await;

    // Assert
    assert!(response.is_ok());

    // Verify request includes page token
    let requests = transport.get_requests();
    assert!(requests[0].url.contains("pageToken="));
}

#[tokio::test]
async fn test_get_model_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let model_json = r#"{
        "name": "models/gemini-1.5-pro",
        "version": "001",
        "displayName": "Gemini 1.5 Pro",
        "description": "Advanced multimodal model",
        "inputTokenLimit": 1000000,
        "outputTokenLimit": 8192,
        "supportedGenerationMethods": ["generateContent", "countTokens"],
        "temperature": 1.0,
        "topP": 0.95,
        "topK": 64,
        "maxTemperature": 2.0
    }"#;
    transport.enqueue_json_response(200, model_json);

    let service = create_test_service(transport.clone());

    // Act
    let response = service.get("gemini-1.5-pro").await;

    // Assert
    assert!(response.is_ok(), "Expected successful model get");
    let model = response.unwrap();
    assert_eq!(model.name, "models/gemini-1.5-pro");
    assert_eq!(model.version, Some("001".to_string()));
    assert_eq!(model.display_name, Some("Gemini 1.5 Pro".to_string()));
    assert_eq!(model.input_token_limit, Some(1000000));
    assert_eq!(model.output_token_limit, Some(8192));

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Get, "models/gemini-1.5-pro");
}

#[tokio::test]
async fn test_get_model_with_models_prefix() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let model_json = r#"{
        "name": "models/gemini-1.5-pro",
        "displayName": "Gemini 1.5 Pro"
    }"#;
    transport.enqueue_json_response(200, model_json);

    let service = create_test_service(transport.clone());

    // Act - pass model name with "models/" prefix
    let response = service.get("models/gemini-1.5-pro").await;

    // Assert
    assert!(response.is_ok());
    let model = response.unwrap();
    assert_eq!(model.name, "models/gemini-1.5-pro");
}

#[tokio::test]
async fn test_get_model_caching() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let model_json = r#"{
        "name": "models/gemini-1.5-pro",
        "displayName": "Gemini 1.5 Pro"
    }"#;
    // Only enqueue one response
    transport.enqueue_json_response(200, model_json);

    let service = create_test_service(transport.clone());

    // Act - Get the same model twice
    let response1 = service.get("gemini-1.5-pro").await;
    let response2 = service.get("gemini-1.5-pro").await;

    // Assert
    assert!(response1.is_ok());
    assert!(response2.is_ok());

    // Should only make one HTTP request due to caching
    transport.verify_request_count(1);
}

#[tokio::test]
async fn test_get_model_no_cache() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let model_json = r#"{
        "name": "models/gemini-1.5-pro",
        "displayName": "Gemini 1.5 Pro"
    }"#;
    // Enqueue two responses for two requests
    transport.enqueue_json_response(200, model_json);
    transport.enqueue_json_response(200, model_json);

    let service = create_test_service_no_cache(transport.clone());

    // Act - Get the same model twice without cache
    let response1 = service.get("gemini-1.5-pro").await;
    let response2 = service.get("gemini-1.5-pro").await;

    // Assert
    assert!(response1.is_ok());
    assert!(response2.is_ok());

    // Should make two HTTP requests when cache is disabled
    transport.verify_request_count(2);
}

#[tokio::test]
async fn test_get_model_not_found() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let error_json = r#"{
        "error": {
            "code": 404,
            "message": "Model not found: invalid-model",
            "status": "NOT_FOUND"
        }
    }"#;
    transport.enqueue_json_response(404, error_json);

    let service = create_test_service(transport);

    // Act
    let response = service.get("invalid-model").await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Resource(integrations_gemini::error::ResourceError::ModelNotFound { .. }) => {
            // Expected
        }
        e => panic!("Expected ResourceError::ModelNotFound, got {:?}", e),
    }
}

#[tokio::test]
async fn test_list_models_api_error_401() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let error_json = r#"{
        "error": {
            "code": 401,
            "message": "Invalid API key",
            "status": "UNAUTHENTICATED"
        }
    }"#;
    transport.enqueue_json_response(401, error_json);

    let service = create_test_service(transport);

    // Act
    let response = service.list(None).await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Authentication(_) => {
            // Expected
        }
        e => panic!("Expected AuthenticationError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_list_models_api_error_429() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let error_json = r#"{
        "error": {
            "code": 429,
            "message": "Too many requests",
            "status": "RESOURCE_EXHAUSTED"
        }
    }"#;
    transport.enqueue_json_response(429, error_json);

    let service = create_test_service(transport);

    // Act
    let response = service.list(None).await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::RateLimit(_) => {
            // Expected
        }
        e => panic!("Expected RateLimitError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_list_models_server_error() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let error_json = r#"{
        "error": {
            "code": 500,
            "message": "Internal server error",
            "status": "INTERNAL"
        }
    }"#;
    transport.enqueue_json_response(500, error_json);

    let service = create_test_service(transport);

    // Act
    let response = service.list(None).await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Server(_) => {
            // Expected
        }
        e => panic!("Expected ServerError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_list_models_network_error() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_error(integrations_gemini::transport::TransportError::Connection {
        message: "Network connection failed".to_string(),
        source: None,
    });

    let service = create_test_service(transport);

    // Act
    let response = service.list(None).await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Network(_) => {
            // Expected
        }
        e => panic!("Expected NetworkError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_list_all_models_multiple_pages() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());

    // First page
    let page1_json = r#"{
        "models": [
            {"name": "models/model-1", "displayName": "Model 1"}
        ],
        "nextPageToken": "token_page2"
    }"#;
    transport.enqueue_json_response(200, page1_json);

    // Second page
    let page2_json = r#"{
        "models": [
            {"name": "models/model-2", "displayName": "Model 2"}
        ],
        "nextPageToken": "token_page3"
    }"#;
    transport.enqueue_json_response(200, page2_json);

    // Third page (last)
    let page3_json = r#"{
        "models": [
            {"name": "models/model-3", "displayName": "Model 3"}
        ]
    }"#;
    transport.enqueue_json_response(200, page3_json);

    let service = create_test_service(transport.clone());

    // Act
    let all_models = service.list_all().await;

    // Assert
    assert!(all_models.is_ok());
    let models = all_models.unwrap();
    assert_eq!(models.len(), 3);
    assert_eq!(models[0].name, "models/model-1");
    assert_eq!(models[1].name, "models/model-2");
    assert_eq!(models[2].name, "models/model-3");

    // Should have made 3 requests for 3 pages
    transport.verify_request_count(3);
}

#[tokio::test]
async fn test_list_all_models_single_page() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let models_json = r#"{
        "models": [
            {"name": "models/model-1", "displayName": "Model 1"},
            {"name": "models/model-2", "displayName": "Model 2"}
        ]
    }"#;
    transport.enqueue_json_response(200, models_json);

    let service = create_test_service(transport.clone());

    // Act
    let all_models = service.list_all().await;

    // Assert
    assert!(all_models.is_ok());
    let models = all_models.unwrap();
    assert_eq!(models.len(), 2);

    // Should only make one request for single page
    transport.verify_request_count(1);
}
