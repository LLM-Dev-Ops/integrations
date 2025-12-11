//! Integration tests for ObjectsService.

use aws_s3::mocks::{MockResponse, MockTransport, MockCredentialsProvider, MockSigner, TestFixtures};
use aws_s3::services::ObjectsService;
use aws_s3::config::S3Config;
use aws_s3::types::*;
use bytes::Bytes;
use std::sync::Arc;

fn create_test_service() -> ObjectsService {
    let config = Arc::new(S3Config::default());
    let transport = Arc::new(MockTransport::with_default(MockResponse::ok()));
    let signer = Arc::new(MockSigner::new());
    ObjectsService::new(config, transport, signer)
}

fn create_test_service_with_transport(transport: Arc<MockTransport>) -> ObjectsService {
    let config = Arc::new(S3Config::default());
    let signer = Arc::new(MockSigner::new());
    ObjectsService::new(config, transport, signer)
}

#[tokio::test]
async fn test_put_object_success() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok()
            .with_header("etag", "\"abc123\"")
            .with_header("x-amz-request-id", "test-request-id"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = PutObjectRequest::new("test-bucket", "test-key.txt", Bytes::from("test content"));
    let result = service.put(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.e_tag, "\"abc123\"");

    // Verify request was made
    let recorded = transport.last_request().unwrap();
    assert_eq!(recorded.method, "PUT");
    assert!(recorded.url.contains("test-bucket"));
    assert!(recorded.url.contains("test-key.txt"));
}

#[tokio::test]
async fn test_put_object_with_metadata() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok().with_header("etag", "\"abc123\""),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let mut request = PutObjectRequest::new("test-bucket", "test-key.txt", Bytes::from("content"));
    request.content_type = Some("text/plain".to_string());
    request.metadata.insert("custom".to_string(), "value".to_string());

    let result = service.put(request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_get_object_success() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body("file content")
            .with_headers(TestFixtures::get_object_headers()),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = GetObjectRequest::new("test-bucket", "test-key.txt");
    let result = service.get(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.body, Bytes::from("file content"));
    assert_eq!(output.content_type, Some("text/plain".to_string()));
}

#[tokio::test]
async fn test_get_object_not_found() {
    let error_xml = TestFixtures::error_xml("NoSuchKey", "The specified key does not exist.");
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::error(404, error_xml),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = GetObjectRequest::new("test-bucket", "nonexistent.txt");
    let result = service.get(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        aws_s3::S3Error::Object(aws_s3::ObjectError::NotFound { key, .. }) => {
            assert_eq!(key, "nonexistent.txt");
        }
        other => panic!("Expected ObjectError::NotFound, got {:?}", other),
    }
}

#[tokio::test]
async fn test_delete_object_success() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::no_content(),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.delete("test-bucket", "test-key.txt", None).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_head_object_success() {
    let mut headers = TestFixtures::get_object_headers();
    headers.insert("x-amz-meta-custom".to_string(), "custom-value".to_string());

    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok().with_headers(headers),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = HeadObjectRequest::new("test-bucket", "test-key.txt");
    let result = service.head(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.content_type, Some("text/plain".to_string()));
}

#[tokio::test]
async fn test_copy_object_success() {
    let copy_response = r#"<?xml version="1.0" encoding="UTF-8"?>
<CopyObjectResult>
    <ETag>"copied-etag"</ETag>
    <LastModified>2024-01-15T10:30:00.000Z</LastModified>
</CopyObjectResult>"#;

    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(copy_response),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = CopyObjectRequest::new(
        "source-bucket",
        "source-key.txt",
        "dest-bucket",
        "dest-key.txt",
    );
    let result = service.copy(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.e_tag, Some("\"copied-etag\"".to_string()));
}

#[tokio::test]
async fn test_list_objects_success() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(TestFixtures::list_objects_xml()),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = ListObjectsV2Request::new("test-bucket");
    let result = service.list(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.contents.len(), 2);
    assert_eq!(output.contents[0].key, "file1.txt");
    assert_eq!(output.contents[1].key, "file2.txt");
    assert!(!output.is_truncated);
}

#[tokio::test]
async fn test_list_objects_with_prefix() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(TestFixtures::list_objects_xml()),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let mut request = ListObjectsV2Request::new("test-bucket");
    request.prefix = Some("folder/".to_string());
    request.max_keys = Some(100);

    let result = service.list(request).await;
    assert!(result.is_ok());

    // Verify query params were included
    let recorded = transport.last_request().unwrap();
    assert!(recorded.url.contains("prefix="));
    assert!(recorded.url.contains("max-keys="));
}

#[tokio::test]
async fn test_delete_objects_batch() {
    let delete_response = r#"<?xml version="1.0" encoding="UTF-8"?>
<DeleteResult>
    <Deleted>
        <Key>file1.txt</Key>
    </Deleted>
    <Deleted>
        <Key>file2.txt</Key>
    </Deleted>
</DeleteResult>"#;

    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(delete_response),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let objects = vec![
        ObjectIdentifier::new("file1.txt"),
        ObjectIdentifier::new("file2.txt"),
    ];
    let request = DeleteObjectsRequest::new("test-bucket", objects);

    let result = service.delete_objects(request).await;
    assert!(result.is_ok());

    let output = result.unwrap();
    assert_eq!(output.deleted.len(), 2);
}
