//! Integration tests for PresignService.

use aws_s3::mocks::MockSigner;
use aws_s3::services::PresignService;
use aws_s3::config::S3Config;
use aws_s3::types::*;
use std::sync::Arc;
use std::time::Duration;

fn create_test_service() -> PresignService {
    let config = Arc::new(S3Config::default());
    let signer = Arc::new(MockSigner::new());
    PresignService::new(config, signer)
}

#[tokio::test]
async fn test_presign_get() {
    let service = create_test_service();

    let request = PresignGetRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key.txt".to_string(),
        expires_in: Duration::from_secs(3600),
        version_id: None,
        response_content_type: None,
        response_content_disposition: None,
    };

    let result = service.presign_get(request).await;

    assert!(result.is_ok());
    let presigned = result.unwrap();
    assert_eq!(presigned.method, "GET");
    assert!(presigned.url.to_string().contains("test-bucket"));
    assert!(presigned.url.to_string().contains("test-key.txt"));
    assert!(presigned.url.to_string().contains("X-Amz-Signature"));
}

#[tokio::test]
async fn test_presign_get_with_version() {
    let service = create_test_service();

    let request = PresignGetRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key.txt".to_string(),
        expires_in: Duration::from_secs(3600),
        version_id: Some("version-123".to_string()),
        response_content_type: None,
        response_content_disposition: None,
    };

    let result = service.presign_get(request).await;

    assert!(result.is_ok());
    let presigned = result.unwrap();
    assert!(presigned.url.to_string().contains("versionId=version-123"));
}

#[tokio::test]
async fn test_presign_get_with_response_headers() {
    let service = create_test_service();

    let request = PresignGetRequest {
        bucket: "test-bucket".to_string(),
        key: "document.pdf".to_string(),
        expires_in: Duration::from_secs(3600),
        version_id: None,
        response_content_type: Some("application/pdf".to_string()),
        response_content_disposition: Some("attachment; filename=\"report.pdf\"".to_string()),
    };

    let result = service.presign_get(request).await;

    assert!(result.is_ok());
    let presigned = result.unwrap();
    assert!(presigned.url.to_string().contains("response-content-type"));
    assert!(presigned.url.to_string().contains("response-content-disposition"));
}

#[tokio::test]
async fn test_presign_put() {
    let service = create_test_service();

    let request = PresignPutRequest {
        bucket: "test-bucket".to_string(),
        key: "upload-key.txt".to_string(),
        expires_in: Duration::from_secs(3600),
        content_type: Some("text/plain".to_string()),
        content_length: Some(1024),
        storage_class: None,
    };

    let result = service.presign_put(request).await;

    assert!(result.is_ok());
    let presigned = result.unwrap();
    assert_eq!(presigned.method, "PUT");
    assert!(presigned.url.to_string().contains("test-bucket"));
    assert!(presigned.url.to_string().contains("upload-key.txt"));
}

#[tokio::test]
async fn test_presign_put_with_storage_class() {
    let service = create_test_service();

    let request = PresignPutRequest {
        bucket: "test-bucket".to_string(),
        key: "archive-key.txt".to_string(),
        expires_in: Duration::from_secs(3600),
        content_type: None,
        content_length: None,
        storage_class: Some(StorageClass::StandardIa),
    };

    let result = service.presign_put(request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_presign_delete() {
    let service = create_test_service();

    let request = PresignDeleteRequest {
        bucket: "test-bucket".to_string(),
        key: "delete-key.txt".to_string(),
        expires_in: Duration::from_secs(900),
        version_id: None,
    };

    let result = service.presign_delete(request).await;

    assert!(result.is_ok());
    let presigned = result.unwrap();
    assert_eq!(presigned.method, "DELETE");
}

#[tokio::test]
async fn test_presign_delete_with_version() {
    let service = create_test_service();

    let request = PresignDeleteRequest {
        bucket: "test-bucket".to_string(),
        key: "delete-key.txt".to_string(),
        expires_in: Duration::from_secs(900),
        version_id: Some("version-456".to_string()),
    };

    let result = service.presign_delete(request).await;

    assert!(result.is_ok());
    let presigned = result.unwrap();
    assert!(presigned.url.to_string().contains("versionId=version-456"));
}

#[tokio::test]
async fn test_presign_head() {
    let service = create_test_service();

    let result = service.presign_head("test-bucket", "test-key.txt", Duration::from_secs(3600)).await;

    assert!(result.is_ok());
    let presigned = result.unwrap();
    assert_eq!(presigned.method, "HEAD");
}

#[tokio::test]
async fn test_presign_url_expiration() {
    let service = create_test_service();

    let request = PresignGetRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key.txt".to_string(),
        expires_in: Duration::from_secs(7200), // 2 hours
        version_id: None,
        response_content_type: None,
        response_content_disposition: None,
    };

    let result = service.presign_get(request).await;

    assert!(result.is_ok());
    let presigned = result.unwrap();

    // Check that expires_at is approximately 2 hours in the future
    let expected_expiration = chrono::Utc::now() + chrono::Duration::hours(2);
    let diff = (presigned.expires_at - expected_expiration).num_seconds().abs();
    assert!(diff < 5, "Expiration should be ~2 hours from now");
}

#[tokio::test]
async fn test_presign_url_contains_credentials() {
    let service = create_test_service();

    let request = PresignGetRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key.txt".to_string(),
        expires_in: Duration::from_secs(3600),
        version_id: None,
        response_content_type: None,
        response_content_disposition: None,
    };

    let result = service.presign_get(request).await;

    assert!(result.is_ok());
    let presigned = result.unwrap();
    let url_str = presigned.url.to_string();

    // Verify required query parameters are present
    assert!(url_str.contains("X-Amz-Algorithm"));
    assert!(url_str.contains("X-Amz-Credential"));
    assert!(url_str.contains("X-Amz-Date"));
    assert!(url_str.contains("X-Amz-Expires"));
    assert!(url_str.contains("X-Amz-SignedHeaders"));
    assert!(url_str.contains("X-Amz-Signature"));
}
