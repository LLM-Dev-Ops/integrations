//! Integration tests for files service.

use integrations_gemini::mocks::{MockAuthManager, MockHttpTransport};
use integrations_gemini::services::files::FilesServiceImpl;
use integrations_gemini::services::FilesService;
use integrations_gemini::types::{UploadFileRequest, ListFilesParams, FileState};
use integrations_gemini::{GeminiConfig, GeminiError};
use secrecy::SecretString;
use std::sync::Arc;
use std::time::Duration;

/// Helper to create a test files service with mock transport.
fn create_test_service(transport: Arc<MockHttpTransport>) -> FilesServiceImpl {
    let config = Arc::new(
        GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap()
    );

    let auth_manager = Arc::new(MockAuthManager::new("test-key"));

    FilesServiceImpl::new(config, transport, auth_manager)
}

#[tokio::test]
async fn test_upload_file_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let file_json = r#"{
        "name": "files/abc123",
        "displayName": "test_document.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": "1024",
        "createTime": "2024-01-01T00:00:00Z",
        "updateTime": "2024-01-01T00:00:00Z",
        "expirationTime": "2024-01-02T00:00:00Z",
        "sha256Hash": "abc123hash",
        "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc123",
        "state": "ACTIVE"
    }"#;
    transport.enqueue_json_response(200, file_json);

    let service = create_test_service(transport.clone());
    let request = UploadFileRequest {
        display_name: Some("test_document.pdf".to_string()),
        file_data: b"PDF file content here".to_vec(),
        mime_type: "application/pdf".to_string(),
    };

    // Act
    let response = service.upload(request).await;

    // Assert
    assert!(response.is_ok(), "Expected successful file upload");
    let file = response.unwrap();
    assert_eq!(file.name, "files/abc123");
    assert_eq!(file.display_name, Some("test_document.pdf".to_string()));
    assert_eq!(file.mime_type, "application/pdf");
    assert_eq!(file.state, Some(FileState::Active));

    // Verify request was made to upload endpoint
    transport.verify_request_count(1);
    let requests = transport.get_requests();
    assert!(requests[0].url.contains("/upload/"));
    assert!(requests[0].url.contains("/files"));
}

#[tokio::test]
async fn test_upload_file_with_multipart() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{
        "name": "files/test123",
        "displayName": "image.png",
        "mimeType": "image/png",
        "state": "PROCESSING"
    }"#);

    let service = create_test_service(transport.clone());
    let request = UploadFileRequest {
        display_name: Some("image.png".to_string()),
        file_data: b"PNG image data".to_vec(),
        mime_type: "image/png".to_string(),
    };

    // Act
    let response = service.upload(request).await;

    // Assert
    assert!(response.is_ok());

    // Verify multipart content-type header
    let requests = transport.get_requests();
    let content_type = requests[0].headers.get("Content-Type").unwrap();
    assert!(content_type.contains("multipart/related"));
    assert!(content_type.contains("boundary="));

    // Verify body contains display name
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("image.png"));
}

#[tokio::test]
async fn test_list_files_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let files_json = r#"{
        "files": [
            {
                "name": "files/file1",
                "displayName": "document1.pdf",
                "mimeType": "application/pdf",
                "state": "ACTIVE"
            },
            {
                "name": "files/file2",
                "displayName": "image.png",
                "mimeType": "image/png",
                "state": "ACTIVE"
            }
        ]
    }"#;
    transport.enqueue_json_response(200, files_json);

    let service = create_test_service(transport.clone());

    // Act
    let response = service.list(None).await;

    // Assert
    assert!(response.is_ok(), "Expected successful files list");
    let response = response.unwrap();
    assert_eq!(response.files.len(), 2);
    assert_eq!(response.files[0].name, "files/file1");
    assert_eq!(response.files[1].name, "files/file2");

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Get, "files");
}

#[tokio::test]
async fn test_list_files_with_pagination() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let files_json = r#"{
        "files": [
            {"name": "files/file1", "displayName": "file1.txt", "mimeType": "text/plain"}
        ],
        "nextPageToken": "next_page_token_456"
    }"#;
    transport.enqueue_json_response(200, files_json);

    let service = create_test_service(transport.clone());
    let params = ListFilesParams {
        page_size: Some(20),
        page_token: None,
    };

    // Act
    let response = service.list(Some(params)).await;

    // Assert
    assert!(response.is_ok());
    let response = response.unwrap();
    assert_eq!(response.files.len(), 1);
    assert_eq!(response.next_page_token, Some("next_page_token_456".to_string()));

    // Verify pagination params in URL
    let requests = transport.get_requests();
    assert!(requests[0].url.contains("pageSize=20"));
}

#[tokio::test]
async fn test_get_file_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let file_json = r#"{
        "name": "files/abc123",
        "displayName": "my_file.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": "2048",
        "state": "ACTIVE",
        "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc123"
    }"#;
    transport.enqueue_json_response(200, file_json);

    let service = create_test_service(transport.clone());

    // Act
    let response = service.get("abc123").await;

    // Assert
    assert!(response.is_ok(), "Expected successful file get");
    let file = response.unwrap();
    assert_eq!(file.name, "files/abc123");
    assert_eq!(file.display_name, Some("my_file.pdf".to_string()));
    assert_eq!(file.state, Some(FileState::Active));

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Get, "files/abc123");
}

#[tokio::test]
async fn test_get_file_with_files_prefix() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{
        "name": "files/xyz789",
        "displayName": "file.txt",
        "mimeType": "text/plain"
    }"#);

    let service = create_test_service(transport.clone());

    // Act - pass file name with "files/" prefix
    let response = service.get("files/xyz789").await;

    // Assert
    assert!(response.is_ok());
    let file = response.unwrap();
    assert_eq!(file.name, "files/xyz789");
}

#[tokio::test]
async fn test_delete_file_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    // DELETE typically returns 204 No Content
    transport.enqueue_json_response(204, "");

    let service = create_test_service(transport.clone());

    // Act
    let response = service.delete("abc123").await;

    // Assert
    assert!(response.is_ok(), "Expected successful file deletion");

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Delete, "files/abc123");
}

#[tokio::test]
async fn test_delete_file_with_200_response() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    // Some APIs return 200 instead of 204
    transport.enqueue_json_response(200, "{}");

    let service = create_test_service(transport);

    // Act
    let response = service.delete("abc123").await;

    // Assert
    assert!(response.is_ok(), "Should accept 200 status for delete");
}

#[tokio::test]
async fn test_delete_file_not_found() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let error_json = r#"{
        "error": {
            "code": 404,
            "message": "File not found",
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
        GeminiError::Resource(integrations_gemini::error::ResourceError::FileNotFound { .. }) => {
            // Expected
        }
        e => panic!("Expected ResourceError::FileNotFound, got {:?}", e),
    }
}

#[tokio::test]
async fn test_wait_for_active_already_active() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let active_file_json = r#"{
        "name": "files/abc123",
        "displayName": "file.pdf",
        "mimeType": "application/pdf",
        "state": "ACTIVE"
    }"#;
    transport.enqueue_json_response(200, active_file_json);

    let service = create_test_service(transport.clone());

    // Act
    let response = service
        .wait_for_active("abc123", Duration::from_secs(10), Duration::from_millis(100))
        .await;

    // Assert
    assert!(response.is_ok());
    let file = response.unwrap();
    assert_eq!(file.state, Some(FileState::Active));

    // Should only check once since it's already active
    transport.verify_request_count(1);
}

#[tokio::test]
async fn test_wait_for_active_processing_then_active() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());

    // First check: still processing
    let processing_json = r#"{
        "name": "files/abc123",
        "displayName": "file.pdf",
        "mimeType": "application/pdf",
        "state": "PROCESSING"
    }"#;
    transport.enqueue_json_response(200, processing_json);

    // Second check: now active
    let active_json = r#"{
        "name": "files/abc123",
        "displayName": "file.pdf",
        "mimeType": "application/pdf",
        "state": "ACTIVE"
    }"#;
    transport.enqueue_json_response(200, active_json);

    let service = create_test_service(transport.clone());

    // Act
    let response = service
        .wait_for_active("abc123", Duration::from_secs(10), Duration::from_millis(50))
        .await;

    // Assert
    assert!(response.is_ok());
    let file = response.unwrap();
    assert_eq!(file.state, Some(FileState::Active));

    // Should have checked twice
    transport.verify_request_count(2);
}

#[tokio::test]
async fn test_wait_for_active_failed_state() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let failed_json = r#"{
        "name": "files/abc123",
        "displayName": "file.pdf",
        "mimeType": "application/pdf",
        "state": "FAILED"
    }"#;
    transport.enqueue_json_response(200, failed_json);

    let service = create_test_service(transport);

    // Act
    let response = service
        .wait_for_active("abc123", Duration::from_secs(10), Duration::from_millis(100))
        .await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Resource(integrations_gemini::error::ResourceError::FileProcessingFailed { .. }) => {
            // Expected
        }
        e => panic!("Expected ResourceError::FileProcessingFailed, got {:?}", e),
    }
}

#[tokio::test]
async fn test_upload_file_validation_error_empty_mime_type() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = UploadFileRequest {
        display_name: Some("file.pdf".to_string()),
        file_data: b"content".to_vec(),
        mime_type: "".to_string(), // Invalid: empty MIME type
    };

    // Act
    let response = service.upload(request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for empty MIME type");
}

#[tokio::test]
async fn test_upload_file_validation_error_empty_data() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = UploadFileRequest {
        display_name: Some("file.pdf".to_string()),
        file_data: vec![], // Invalid: empty data
        mime_type: "application/pdf".to_string(),
    };

    // Act
    let response = service.upload(request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for empty file data");
}

#[tokio::test]
async fn test_get_file_validation_error_empty_name() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    // Act
    let response = service.get("").await;

    // Assert
    assert!(response.is_err(), "Expected validation error for empty file name");
}

#[tokio::test]
async fn test_upload_file_api_error_413() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let error_json = r#"{
        "error": {
            "code": 413,
            "message": "File too large",
            "status": "PAYLOAD_TOO_LARGE"
        }
    }"#;
    transport.enqueue_json_response(413, error_json);

    let service = create_test_service(transport);
    let request = UploadFileRequest {
        display_name: Some("huge_file.pdf".to_string()),
        file_data: vec![0; 1024 * 1024], // 1MB
        mime_type: "application/pdf".to_string(),
    };

    // Act
    let response = service.upload(request).await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Request(integrations_gemini::error::RequestError::PayloadTooLarge { .. }) => {
            // Expected
        }
        e => panic!("Expected RequestError::PayloadTooLarge, got {:?}", e),
    }
}

#[tokio::test]
async fn test_files_network_error() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_error(integrations_gemini::transport::TransportError::Connection {
        message: "Connection timeout".to_string(),
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
async fn test_upload_bytes_helper() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{
        "name": "files/test123",
        "displayName": "test.txt",
        "mimeType": "text/plain",
        "state": "ACTIVE"
    }"#);

    let service = create_test_service(transport.clone());

    // Act
    let response = service
        .upload_bytes(
            b"Hello, world!".to_vec(),
            "text/plain".to_string(),
            Some("test.txt".to_string()),
        )
        .await;

    // Assert
    assert!(response.is_ok());
    let file = response.unwrap();
    assert_eq!(file.name, "files/test123");
}
