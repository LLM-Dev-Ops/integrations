//! Mock implementations for testing.
//!
//! This module provides mock implementations of S3 components for testing.

mod transport;
mod credentials;
mod signer;

pub use transport::{MockTransport, MockResponse, MockResponseBuilder};
pub use credentials::MockCredentialsProvider;
pub use signer::MockSigner;

use crate::types::*;
use bytes::Bytes;
use std::collections::HashMap;

/// Test fixtures for S3 operations.
pub struct TestFixtures;

impl TestFixtures {
    /// Create a sample S3 object for testing.
    pub fn sample_object() -> S3Object {
        S3Object {
            key: "test-key.txt".to_string(),
            size: 1024,
            last_modified: "2024-01-15T10:30:00Z".to_string(),
            e_tag: Some("\"abc123\"".to_string()),
            storage_class: Some(StorageClass::Standard),
            owner: None,
        }
    }

    /// Create a sample bucket for testing.
    pub fn sample_bucket() -> Bucket {
        Bucket {
            name: "test-bucket".to_string(),
            creation_date: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    /// Create sample tags for testing.
    pub fn sample_tags() -> Vec<Tag> {
        vec![
            Tag {
                key: "Environment".to_string(),
                value: "Test".to_string(),
            },
            Tag {
                key: "Project".to_string(),
                value: "S3Integration".to_string(),
            },
        ]
    }

    /// Create a sample put object request for testing.
    pub fn sample_put_request() -> PutObjectRequest {
        PutObjectRequest::new("test-bucket", "test-key.txt", Bytes::from("test content"))
    }

    /// Create a sample get object request for testing.
    pub fn sample_get_request() -> GetObjectRequest {
        GetObjectRequest::new("test-bucket", "test-key.txt")
    }

    /// Create a sample list objects request for testing.
    pub fn sample_list_request() -> ListObjectsV2Request {
        ListObjectsV2Request::new("test-bucket")
    }

    /// Create sample XML for ListObjectsV2 response.
    pub fn list_objects_xml() -> &'static str {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>test-bucket</Name>
    <Prefix></Prefix>
    <KeyCount>2</KeyCount>
    <MaxKeys>1000</MaxKeys>
    <IsTruncated>false</IsTruncated>
    <Contents>
        <Key>file1.txt</Key>
        <LastModified>2024-01-15T10:30:00.000Z</LastModified>
        <ETag>"abc123"</ETag>
        <Size>1024</Size>
        <StorageClass>STANDARD</StorageClass>
    </Contents>
    <Contents>
        <Key>file2.txt</Key>
        <LastModified>2024-01-16T11:30:00.000Z</LastModified>
        <ETag>"def456"</ETag>
        <Size>2048</Size>
        <StorageClass>STANDARD_IA</StorageClass>
    </Contents>
</ListBucketResult>"#
    }

    /// Create sample XML for ListBuckets response.
    pub fn list_buckets_xml() -> &'static str {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Owner>
        <ID>owner-id</ID>
        <DisplayName>Owner Name</DisplayName>
    </Owner>
    <Buckets>
        <Bucket>
            <Name>bucket1</Name>
            <CreationDate>2024-01-01T00:00:00.000Z</CreationDate>
        </Bucket>
        <Bucket>
            <Name>bucket2</Name>
            <CreationDate>2024-01-02T00:00:00.000Z</CreationDate>
        </Bucket>
    </Buckets>
</ListAllMyBucketsResult>"#
    }

    /// Create sample XML for error response.
    pub fn error_xml(code: &str, message: &str) -> String {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>{}</Code>
    <Message>{}</Message>
    <RequestId>test-request-id</RequestId>
</Error>"#,
            code, message
        )
    }

    /// Create sample XML for CreateMultipartUpload response.
    pub fn create_multipart_xml() -> &'static str {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Bucket>test-bucket</Bucket>
    <Key>test-key.txt</Key>
    <UploadId>upload-id-12345</UploadId>
</InitiateMultipartUploadResult>"#
    }

    /// Create sample XML for CompleteMultipartUpload response.
    pub fn complete_multipart_xml() -> &'static str {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Location>https://test-bucket.s3.amazonaws.com/test-key.txt</Location>
    <Bucket>test-bucket</Bucket>
    <Key>test-key.txt</Key>
    <ETag>"combined-etag"</ETag>
</CompleteMultipartUploadResult>"#
    }

    /// Create sample XML for GetObjectTagging response.
    pub fn get_tagging_xml() -> &'static str {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<Tagging>
    <TagSet>
        <Tag>
            <Key>Environment</Key>
            <Value>Test</Value>
        </Tag>
        <Tag>
            <Key>Project</Key>
            <Value>S3Integration</Value>
        </Tag>
    </TagSet>
</Tagging>"#
    }

    /// Create sample headers for a successful GET response.
    pub fn get_object_headers() -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "text/plain".to_string());
        headers.insert("content-length".to_string(), "1024".to_string());
        headers.insert("etag".to_string(), "\"abc123\"".to_string());
        headers.insert("last-modified".to_string(), "Mon, 15 Jan 2024 10:30:00 GMT".to_string());
        headers.insert("x-amz-request-id".to_string(), "test-request-id".to_string());
        headers
    }

    /// Create sample headers for a PUT response.
    pub fn put_object_headers() -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("etag".to_string(), "\"abc123\"".to_string());
        headers.insert("x-amz-request-id".to_string(), "test-request-id".to_string());
        headers
    }
}
