//! Integration tests for TaggingService.

use aws_s3::mocks::{MockResponse, MockTransport, MockSigner, TestFixtures};
use aws_s3::services::TaggingService;
use aws_s3::config::S3Config;
use aws_s3::types::*;
use std::sync::Arc;

fn create_test_service_with_transport(transport: Arc<MockTransport>) -> TaggingService {
    let config = Arc::new(S3Config::default());
    let signer = Arc::new(MockSigner::new());
    TaggingService::new(config, transport, signer)
}

#[tokio::test]
async fn test_get_object_tagging() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(TestFixtures::get_tagging_xml())
            .with_header("x-amz-request-id", "test-request-id"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = GetObjectTaggingRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key.txt".to_string(),
        version_id: None,
    };

    let result = service.get(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.tags.len(), 2);

    let tag1 = output.tags.iter().find(|t| t.key == "Environment").unwrap();
    assert_eq!(tag1.value, "Test");

    let tag2 = output.tags.iter().find(|t| t.key == "Project").unwrap();
    assert_eq!(tag2.value, "S3Integration");
}

#[tokio::test]
async fn test_get_object_tagging_with_version() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(TestFixtures::get_tagging_xml())
            .with_header("x-amz-version-id", "version-123"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = GetObjectTaggingRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key.txt".to_string(),
        version_id: Some("version-123".to_string()),
    };

    let result = service.get(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.version_id, Some("version-123".to_string()));

    // Verify version was in the request
    let recorded = transport.last_request().unwrap();
    assert!(recorded.url.contains("versionId=version-123"));
}

#[tokio::test]
async fn test_get_object_tagging_empty() {
    let empty_tagging_xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<Tagging>
    <TagSet>
    </TagSet>
</Tagging>"#;

    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(empty_tagging_xml),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = GetObjectTaggingRequest {
        bucket: "test-bucket".to_string(),
        key: "untagged-key.txt".to_string(),
        version_id: None,
    };

    let result = service.get(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert!(output.tags.is_empty());
}

#[tokio::test]
async fn test_put_object_tagging() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok()
            .with_header("x-amz-request-id", "test-request-id"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = PutObjectTaggingRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key.txt".to_string(),
        version_id: None,
        tags: TestFixtures::sample_tags(),
    };

    let result = service.put(request).await;

    assert!(result.is_ok());

    // Verify request body contains tagging XML
    let recorded = transport.last_request().unwrap();
    let body = recorded.body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("<Tagging>"));
    assert!(body_str.contains("<TagSet>"));
    assert!(body_str.contains("Environment"));
    assert!(body_str.contains("Test"));
}

#[tokio::test]
async fn test_put_object_tagging_with_version() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok()
            .with_header("x-amz-version-id", "version-456"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = PutObjectTaggingRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key.txt".to_string(),
        version_id: Some("version-456".to_string()),
        tags: vec![Tag {
            key: "Status".to_string(),
            value: "Archived".to_string(),
        }],
    };

    let result = service.put(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.version_id, Some("version-456".to_string()));
}

#[tokio::test]
async fn test_delete_object_tagging() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::no_content(),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.delete("test-bucket", "test-key.txt", None).await;

    assert!(result.is_ok());

    // Verify DELETE request was made
    let recorded = transport.last_request().unwrap();
    assert_eq!(recorded.method, "DELETE");
    assert!(recorded.url.contains("tagging"));
}

#[tokio::test]
async fn test_delete_object_tagging_with_version() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::no_content(),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.delete("test-bucket", "test-key.txt", Some("version-789")).await;

    assert!(result.is_ok());

    // Verify version was in the request
    let recorded = transport.last_request().unwrap();
    assert!(recorded.url.contains("versionId=version-789"));
}

#[tokio::test]
async fn test_tagging_max_tags() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok(),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    // S3 allows max 10 tags
    let tags: Vec<Tag> = (0..10)
        .map(|i| Tag {
            key: format!("Key{}", i),
            value: format!("Value{}", i),
        })
        .collect();

    let request = PutObjectTaggingRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key.txt".to_string(),
        version_id: None,
        tags,
    };

    let result = service.put(request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_get_tagging_object_not_found() {
    let error_xml = TestFixtures::error_xml("NoSuchKey", "The specified key does not exist.");
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::error(404, error_xml),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = GetObjectTaggingRequest {
        bucket: "test-bucket".to_string(),
        key: "nonexistent.txt".to_string(),
        version_id: None,
    };

    let result = service.get(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        aws_s3::S3Error::Object(aws_s3::ObjectError::NotFound { .. }) => {}
        other => panic!("Expected ObjectError::NotFound, got {:?}", other),
    }
}
