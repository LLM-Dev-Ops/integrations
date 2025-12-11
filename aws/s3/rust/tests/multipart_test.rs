//! Integration tests for MultipartService.

use aws_s3::mocks::{MockResponse, MockTransport, MockSigner, TestFixtures};
use aws_s3::services::MultipartService;
use aws_s3::config::S3Config;
use aws_s3::types::*;
use bytes::Bytes;
use std::sync::Arc;

fn create_test_service_with_transport(transport: Arc<MockTransport>) -> MultipartService {
    let config = Arc::new(S3Config::default());
    let signer = Arc::new(MockSigner::new());
    MultipartService::new(config, transport, signer)
}

#[tokio::test]
async fn test_create_multipart_upload() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(TestFixtures::create_multipart_xml())
            .with_header("x-amz-request-id", "test-request-id"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = CreateMultipartUploadRequest::new("test-bucket", "large-file.bin");
    let result = service.create(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.bucket, "test-bucket");
    assert_eq!(output.key, "test-key.txt");
    assert_eq!(output.upload_id, "upload-id-12345");
}

#[tokio::test]
async fn test_create_multipart_with_options() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(TestFixtures::create_multipart_xml()),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let mut request = CreateMultipartUploadRequest::new("test-bucket", "large-file.bin");
    request.content_type = Some("application/octet-stream".to_string());
    request.storage_class = Some(StorageClass::StandardIa);
    request.server_side_encryption = Some(ServerSideEncryption::Aes256);

    let result = service.create(request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_upload_part() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok()
            .with_header("etag", "\"part-etag-1\"")
            .with_header("x-amz-request-id", "test-request-id"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let data = Bytes::from(vec![0u8; 5 * 1024 * 1024]); // 5MB
    let request = UploadPartRequest::new(
        "test-bucket",
        "large-file.bin",
        "upload-id-12345",
        1,
        data,
    );

    let result = service.upload_part(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.e_tag, "\"part-etag-1\"");
}

#[tokio::test]
async fn test_complete_multipart_upload() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(TestFixtures::complete_multipart_xml())
            .with_header("x-amz-request-id", "test-request-id"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let parts = vec![
        CompletedPart {
            part_number: 1,
            e_tag: "\"part-etag-1\"".to_string(),
        },
        CompletedPart {
            part_number: 2,
            e_tag: "\"part-etag-2\"".to_string(),
        },
    ];

    let result = service.complete("test-bucket", "large-file.bin", "upload-id-12345", &parts).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.bucket, "test-bucket");
    assert_eq!(output.key, "test-key.txt");
    assert_eq!(output.e_tag, Some("\"combined-etag\"".to_string()));
}

#[tokio::test]
async fn test_abort_multipart_upload() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::no_content(),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.abort("test-bucket", "large-file.bin", "upload-id-12345").await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_list_parts() {
    let list_parts_xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Bucket>test-bucket</Bucket>
    <Key>large-file.bin</Key>
    <UploadId>upload-id-12345</UploadId>
    <PartNumberMarker>0</PartNumberMarker>
    <NextPartNumberMarker>2</NextPartNumberMarker>
    <MaxParts>1000</MaxParts>
    <IsTruncated>false</IsTruncated>
    <Part>
        <PartNumber>1</PartNumber>
        <LastModified>2024-01-15T10:30:00.000Z</LastModified>
        <ETag>"part-etag-1"</ETag>
        <Size>5242880</Size>
    </Part>
    <Part>
        <PartNumber>2</PartNumber>
        <LastModified>2024-01-15T10:31:00.000Z</LastModified>
        <ETag>"part-etag-2"</ETag>
        <Size>3145728</Size>
    </Part>
</ListPartsResult>"#;

    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(list_parts_xml),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = ListPartsRequest {
        bucket: "test-bucket".to_string(),
        key: "large-file.bin".to_string(),
        upload_id: "upload-id-12345".to_string(),
        max_parts: Some(100),
        part_number_marker: None,
    };

    let result = service.list_parts(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.parts.len(), 2);
    assert_eq!(output.parts[0].part_number, 1);
    assert_eq!(output.parts[0].e_tag, "\"part-etag-1\"");
    assert!(!output.is_truncated);
}

#[tokio::test]
async fn test_high_level_upload_small_file() {
    // For small files, upload helper should still create multipart but with single part
    let transport = Arc::new(MockTransport::with_responses(vec![
        // Create multipart
        MockResponse::ok_with_body(TestFixtures::create_multipart_xml()),
        // Upload single part
        MockResponse::ok().with_header("etag", "\"part-etag-1\""),
        // Complete
        MockResponse::ok_with_body(TestFixtures::complete_multipart_xml()),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let data = vec![0u8; 1024]; // 1KB
    let result = service.upload("test-bucket", "small-file.bin", &data, Some("application/octet-stream")).await;

    assert!(result.is_ok());
    assert_eq!(transport.request_count(), 3);
}

#[tokio::test]
async fn test_high_level_upload_abort_on_failure() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        // Create multipart succeeds
        MockResponse::ok_with_body(TestFixtures::create_multipart_xml()),
        // Upload part fails
        MockResponse::error(500, TestFixtures::error_xml("InternalError", "Internal Server Error")),
        // Abort should be called
        MockResponse::no_content(),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let data = vec![0u8; 1024];
    let result = service.upload("test-bucket", "fail-file.bin", &data, None).await;

    assert!(result.is_err());
    // Verify abort was called (3 requests: create, upload, abort)
    assert_eq!(transport.request_count(), 3);

    let last_request = transport.last_request().unwrap();
    assert_eq!(last_request.method, "DELETE");
}
