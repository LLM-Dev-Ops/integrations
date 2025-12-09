//! Unit tests for file service

use super::*;
use crate::errors::OpenAIError;
use crate::fixtures::*;
use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
use crate::services::files::FilePurpose;
use bytes::Bytes;
use http::Method;
use std::sync::Arc;

fn create_test_service(
    transport: MockHttpTransport,
    auth: MockAuthManager,
    resilience: MockResilienceOrchestrator,
) -> FileServiceImpl {
    FileServiceImpl::new(Arc::new(transport), Arc::new(auth), Arc::new(resilience))
}

#[tokio::test]
async fn test_file_upload_success() {
    let mock_transport = MockHttpTransport::new()
        .with_file_upload_response(Ok(file_object_response()));

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = FileUploadRequest {
        file: Bytes::from("test file content"),
        filename: "test.jsonl".to_string(),
        purpose: FilePurpose::FineTune,
    };

    let result = service.upload(request).await;

    assert!(result.is_ok());
    let file_obj = result.unwrap();
    assert_eq!(file_obj.id, "file-abc123");
    assert_eq!(mock_transport.request_count(), 1);
}

#[tokio::test]
async fn test_list_files_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(list_files_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.list().await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.data.len(), 2);
    assert!(mock_transport.verify_request(Method::GET, "/files"));
}

#[tokio::test]
async fn test_retrieve_file_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(file_object_response());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.retrieve("file-abc123").await;

    assert!(result.is_ok());
    let file_obj = result.unwrap();
    assert_eq!(file_obj.id, "file-abc123");
}

#[tokio::test]
async fn test_delete_file_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(delete_file_response());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.delete("file-abc123").await;

    assert!(result.is_ok());
    let status = result.unwrap();
    assert_eq!(status.id, "file-abc123");
    assert!(status.deleted);
}

#[tokio::test]
async fn test_download_file_success() {
    let test_data = Bytes::from("file content");
    let mock_transport = MockHttpTransport::new()
        .with_file_download_response(Ok(test_data.clone()));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.download("file-abc123").await;

    assert!(result.is_ok());
    let content = result.unwrap();
    assert_eq!(content, test_data);
}

#[tokio::test]
async fn test_file_upload_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new().with_error("Invalid API key");

    let service = create_test_service(mock_transport, mock_auth, MockResilienceOrchestrator::passthrough());

    let request = FileUploadRequest {
        file: Bytes::from("test"),
        filename: "test.jsonl".to_string(),
        purpose: FilePurpose::FineTune,
    };

    let result = service.upload(request).await;
    assert!(result.is_err());
}
