//! Integration tests for cached content service.

use integrations_gemini::mocks::{MockAuthManager, MockHttpTransport};
use integrations_gemini::services::cached_content::CachedContentServiceImpl;
use integrations_gemini::services::CachedContentService;
use integrations_gemini::types::{
    CreateCachedContentRequest, UpdateCachedContentRequest, ListCachedContentsParams,
    Content, Part, Role,
};
use integrations_gemini::{GeminiConfig, GeminiError};
use secrecy::SecretString;
use std::sync::Arc;

/// Helper to create a test cached content service with mock transport.
fn create_test_service(transport: Arc<MockHttpTransport>) -> CachedContentServiceImpl {
    let config = Arc::new(
        GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap()
    );

    let auth_manager = Arc::new(MockAuthManager::new("test-key"));

    CachedContentServiceImpl::new(config, transport, auth_manager)
}

#[tokio::test]
async fn test_create_cached_content_with_ttl() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let cached_content_json = r#"{
        "name": "cachedContents/abc123",
        "model": "models/gemini-1.5-pro",
        "displayName": "My Cached Content",
        "usageMetadata": {
            "totalTokenCount": 1000
        },
        "createTime": "2024-01-01T00:00:00Z",
        "updateTime": "2024-01-01T00:00:00Z",
        "expireTime": "2024-01-02T00:00:00Z"
    }"#;
    transport.enqueue_json_response(200, cached_content_json);

    let service = create_test_service(transport.clone());
    let request = CreateCachedContentRequest {
        model: "models/gemini-1.5-pro".to_string(),
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text {
                text: "Large context to cache".to_string(),
            }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        display_name: Some("My Cached Content".to_string()),
        ttl: Some("86400s".to_string()), // 1 day
        expire_time: None,
    };

    // Act
    let response = service.create(request).await;

    // Assert
    assert!(response.is_ok(), "Expected successful cached content creation");
    let cached = response.unwrap();
    assert_eq!(cached.name, "cachedContents/abc123");
    assert_eq!(cached.model, "models/gemini-1.5-pro");
    assert_eq!(cached.display_name, Some("My Cached Content".to_string()));

    // Verify request was made
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Post, "cachedContents");

    // Verify request includes TTL
    let requests = transport.get_requests();
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("ttl"));
    assert!(body_str.contains("86400s"));
}

#[tokio::test]
async fn test_create_cached_content_with_expire_time() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{
        "name": "cachedContents/xyz789",
        "model": "models/gemini-1.5-pro",
        "expireTime": "2024-12-31T23:59:59Z"
    }"#);

    let service = create_test_service(transport.clone());
    let request = CreateCachedContentRequest {
        model: "models/gemini-1.5-pro".to_string(),
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Content".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        display_name: None,
        ttl: None,
        expire_time: Some("2024-12-31T23:59:59Z".to_string()),
    };

    // Act
    let response = service.create(request).await;

    // Assert
    assert!(response.is_ok());

    // Verify request includes expire_time
    let requests = transport.get_requests();
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("expireTime"));
    assert!(body_str.contains("2024-12-31T23:59:59Z"));
}

#[tokio::test]
async fn test_create_cached_content_validation_error_both_ttl_and_expire_time() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = CreateCachedContentRequest {
        model: "models/gemini-1.5-pro".to_string(),
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Content".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        display_name: None,
        ttl: Some("3600s".to_string()),         // Both TTL and expire_time - invalid
        expire_time: Some("2024-12-31T23:59:59Z".to_string()),
    };

    // Act
    let response = service.create(request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for both TTL and expire_time");
    match response.unwrap_err() {
        GeminiError::Request(integrations_gemini::error::RequestError::ValidationError { .. }) => {
            // Expected
        }
        e => panic!("Expected RequestError::ValidationError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_create_cached_content_validation_error_neither_ttl_nor_expire_time() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = CreateCachedContentRequest {
        model: "models/gemini-1.5-pro".to_string(),
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Content".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        display_name: None,
        ttl: None,         // Neither TTL nor expire_time - invalid
        expire_time: None,
    };

    // Act
    let response = service.create(request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for missing TTL and expire_time");
}

#[tokio::test]
async fn test_list_cached_contents_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let list_json = r#"{
        "cachedContents": [
            {
                "name": "cachedContents/cache1",
                "model": "models/gemini-1.5-pro",
                "displayName": "Cache 1"
            },
            {
                "name": "cachedContents/cache2",
                "model": "models/gemini-1.5-flash",
                "displayName": "Cache 2"
            }
        ]
    }"#;
    transport.enqueue_json_response(200, list_json);

    let service = create_test_service(transport.clone());

    // Act
    let response = service.list(None).await;

    // Assert
    assert!(response.is_ok(), "Expected successful cached contents list");
    let response = response.unwrap();
    assert_eq!(response.cached_contents.len(), 2);
    assert_eq!(response.cached_contents[0].name, "cachedContents/cache1");
    assert_eq!(response.cached_contents[1].name, "cachedContents/cache2");

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Get, "cachedContents");
}

#[tokio::test]
async fn test_list_cached_contents_with_pagination() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let list_json = r#"{
        "cachedContents": [
            {"name": "cachedContents/cache1", "model": "models/gemini-1.5-pro"}
        ],
        "nextPageToken": "page_token_123"
    }"#;
    transport.enqueue_json_response(200, list_json);

    let service = create_test_service(transport.clone());
    let params = ListCachedContentsParams {
        page_size: Some(10),
        page_token: None,
    };

    // Act
    let response = service.list(Some(params)).await;

    // Assert
    assert!(response.is_ok());
    let response = response.unwrap();
    assert_eq!(response.next_page_token, Some("page_token_123".to_string()));

    // Verify pagination params in URL
    let requests = transport.get_requests();
    assert!(requests[0].url.contains("pageSize=10"));
}

#[tokio::test]
async fn test_get_cached_content_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let cached_json = r#"{
        "name": "cachedContents/abc123",
        "model": "models/gemini-1.5-pro",
        "displayName": "My Cache",
        "usageMetadata": {
            "totalTokenCount": 5000
        }
    }"#;
    transport.enqueue_json_response(200, cached_json);

    let service = create_test_service(transport.clone());

    // Act
    let response = service.get("abc123").await;

    // Assert
    assert!(response.is_ok(), "Expected successful cached content get");
    let cached = response.unwrap();
    assert_eq!(cached.name, "cachedContents/abc123");
    assert_eq!(cached.display_name, Some("My Cache".to_string()));

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Get, "cachedContents/abc123");
}

#[tokio::test]
async fn test_get_cached_content_with_prefix() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{
        "name": "cachedContents/xyz789",
        "model": "models/gemini-1.5-pro"
    }"#);

    let service = create_test_service(transport);

    // Act - pass name with "cachedContents/" prefix
    let response = service.get("cachedContents/xyz789").await;

    // Assert
    assert!(response.is_ok());
    let cached = response.unwrap();
    assert_eq!(cached.name, "cachedContents/xyz789");
}

#[tokio::test]
async fn test_update_cached_content_ttl() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{
        "name": "cachedContents/abc123",
        "model": "models/gemini-1.5-pro",
        "expireTime": "2024-01-03T00:00:00Z"
    }"#);

    let service = create_test_service(transport.clone());
    let request = UpdateCachedContentRequest {
        ttl: Some("172800s".to_string()), // 2 days
        expire_time: None,
    };

    // Act
    let response = service.update("abc123", request).await;

    // Assert
    assert!(response.is_ok(), "Expected successful cached content update");

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Patch, "cachedContents/abc123");

    // Verify update mask in URL
    let requests = transport.get_requests();
    assert!(requests[0].url.contains("updateMask="));
    assert!(requests[0].url.contains("ttl"));
}

#[tokio::test]
async fn test_update_cached_content_expire_time() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{
        "name": "cachedContents/abc123",
        "model": "models/gemini-1.5-pro",
        "expireTime": "2025-01-01T00:00:00Z"
    }"#);

    let service = create_test_service(transport.clone());
    let request = UpdateCachedContentRequest {
        ttl: None,
        expire_time: Some("2025-01-01T00:00:00Z".to_string()),
    };

    // Act
    let response = service.update("abc123", request).await;

    // Assert
    assert!(response.is_ok());

    // Verify update mask includes expire_time
    let requests = transport.get_requests();
    assert!(requests[0].url.contains("updateMask="));
    assert!(requests[0].url.contains("expire_time"));
}

#[tokio::test]
async fn test_update_cached_content_validation_error_both() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = UpdateCachedContentRequest {
        ttl: Some("3600s".to_string()),
        expire_time: Some("2025-01-01T00:00:00Z".to_string()), // Both - invalid
    };

    // Act
    let response = service.update("abc123", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for both TTL and expire_time in update");
}

#[tokio::test]
async fn test_update_cached_content_validation_error_neither() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = UpdateCachedContentRequest {
        ttl: None,
        expire_time: None, // Neither - invalid
    };

    // Act
    let response = service.update("abc123", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for neither TTL nor expire_time in update");
}

#[tokio::test]
async fn test_delete_cached_content_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(204, "");

    let service = create_test_service(transport.clone());

    // Act
    let response = service.delete("abc123").await;

    // Assert
    assert!(response.is_ok(), "Expected successful cached content deletion");

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Delete, "cachedContents/abc123");
}

#[tokio::test]
async fn test_delete_cached_content_not_found() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let error_json = r#"{
        "error": {
            "code": 404,
            "message": "Cached content not found",
            "status": "NOT_FOUND"
        }
    }"#;
    transport.enqueue_json_response(404, error_json);

    let service = create_test_service(transport);

    // Act
    let response = service.delete("nonexistent").await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Resource(integrations_gemini::error::ResourceError::CachedContentNotFound { .. }) => {
            // Expected
        }
        e => panic!("Expected ResourceError::CachedContentNotFound, got {:?}", e),
    }
}

#[tokio::test]
async fn test_cached_content_api_error_401() {
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
async fn test_cached_content_network_error() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_error(integrations_gemini::transport::TransportError::Connection {
        message: "Connection failed".to_string(),
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
