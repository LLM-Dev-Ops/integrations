//! Integration tests for BucketsService.

use aws_s3::mocks::{MockResponse, MockTransport, MockSigner, TestFixtures};
use aws_s3::services::BucketsService;
use aws_s3::config::S3Config;
use aws_s3::types::*;
use std::sync::Arc;

fn create_test_service_with_transport(transport: Arc<MockTransport>) -> BucketsService {
    let config = Arc::new(S3Config::default());
    let signer = Arc::new(MockSigner::new());
    BucketsService::new(config, transport, signer)
}

#[tokio::test]
async fn test_create_bucket_success() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok()
            .with_header("location", "/test-bucket")
            .with_header("x-amz-request-id", "test-request-id"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = CreateBucketRequest::new("test-bucket");
    let result = service.create(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.location, Some("/test-bucket".to_string()));
}

#[tokio::test]
async fn test_create_bucket_with_region() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok().with_header("location", "/test-bucket"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let mut request = CreateBucketRequest::new("test-bucket");
    request.region = Some("eu-west-1".to_string());

    let result = service.create(request).await;
    assert!(result.is_ok());

    // Verify XML body was sent for non-us-east-1 region
    let recorded = transport.last_request().unwrap();
    assert!(recorded.body.is_some());
}

#[tokio::test]
async fn test_delete_bucket_success() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::no_content(),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = DeleteBucketRequest::new("test-bucket");
    let result = service.delete(request).await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn test_delete_bucket_not_empty() {
    let error_xml = TestFixtures::error_xml("BucketNotEmpty", "The bucket you tried to delete is not empty.");
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::error(409, error_xml),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = DeleteBucketRequest::new("test-bucket");
    let result = service.delete(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        aws_s3::S3Error::Bucket(aws_s3::BucketError::NotEmpty { bucket, .. }) => {
            assert_eq!(bucket, "test-bucket");
        }
        other => panic!("Expected BucketError::NotEmpty, got {:?}", other),
    }
}

#[tokio::test]
async fn test_head_bucket_success() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok()
            .with_header("x-amz-bucket-region", "us-west-2")
            .with_header("x-amz-request-id", "test-request-id"),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = HeadBucketRequest::new("test-bucket");
    let result = service.head(request).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.region, Some("us-west-2".to_string()));
}

#[tokio::test]
async fn test_head_bucket_not_found() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::error(404, ""),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let request = HeadBucketRequest::new("nonexistent-bucket");
    let result = service.head(request).await;

    assert!(result.is_err());
}

#[tokio::test]
async fn test_list_buckets_success() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(TestFixtures::list_buckets_xml()),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.list().await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.buckets.len(), 2);
    assert_eq!(output.buckets[0].name, "bucket1");
    assert_eq!(output.buckets[1].name, "bucket2");
    assert!(output.owner.is_some());
}

#[tokio::test]
async fn test_get_bucket_location() {
    let location_xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">eu-west-1</LocationConstraint>"#;

    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(location_xml),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.get_location("test-bucket").await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "eu-west-1");
}

#[tokio::test]
async fn test_get_bucket_location_us_east_1() {
    // Empty LocationConstraint means us-east-1
    let location_xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></LocationConstraint>"#;

    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok_with_body(location_xml),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.get_location("test-bucket").await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "us-east-1");
}

#[tokio::test]
async fn test_bucket_exists_true() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::ok(),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.exists("test-bucket").await;
    assert!(result.is_ok());
    assert!(result.unwrap());
}

#[tokio::test]
async fn test_bucket_exists_false() {
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::error(404, ""),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.exists("nonexistent-bucket").await;
    assert!(result.is_ok());
    assert!(!result.unwrap());
}

#[tokio::test]
async fn test_bucket_exists_access_denied() {
    let error_xml = TestFixtures::error_xml("AccessDenied", "Access Denied");
    let transport = Arc::new(MockTransport::with_responses(vec![
        MockResponse::error(403, error_xml),
    ]));
    let service = create_test_service_with_transport(transport.clone());

    let result = service.exists("private-bucket").await;
    // Access denied means the bucket exists but we can't access it
    assert!(result.is_err());
}
