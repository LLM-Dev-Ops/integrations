//! Request types for S3 operations.

use super::common::*;
use bytes::Bytes;
use std::time::Duration;

/// Request to put an object.
#[derive(Debug, Clone)]
pub struct PutObjectRequest {
    /// Target bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Object body.
    pub body: Option<Bytes>,
    /// Content type.
    pub content_type: Option<String>,
    /// Content encoding.
    pub content_encoding: Option<String>,
    /// Content disposition.
    pub content_disposition: Option<String>,
    /// Cache control directive.
    pub cache_control: Option<String>,
    /// Content language.
    pub content_language: Option<String>,
    /// Expected content MD5 (base64).
    pub content_md5: Option<String>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
    /// Server-side encryption.
    pub server_side_encryption: Option<ServerSideEncryption>,
    /// Canned ACL.
    pub acl: Option<CannedAcl>,
    /// User-defined metadata.
    pub metadata: std::collections::HashMap<String, String>,
    /// Tags to apply.
    pub tagging: Option<Vec<Tag>>,
    /// Checksum algorithm.
    pub checksum_algorithm: Option<ChecksumAlgorithm>,
    /// Object lock mode.
    pub object_lock_mode: Option<String>,
    /// Object lock retain until date.
    pub object_lock_retain_until_date: Option<String>,
    /// Object lock legal hold.
    pub object_lock_legal_hold: Option<bool>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl PutObjectRequest {
    /// Create a new put object request.
    pub fn new(bucket: impl Into<String>, key: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            body: None,
            content_type: None,
            content_encoding: None,
            content_disposition: None,
            cache_control: None,
            content_language: None,
            content_md5: None,
            storage_class: None,
            server_side_encryption: None,
            acl: None,
            metadata: std::collections::HashMap::new(),
            tagging: None,
            checksum_algorithm: None,
            object_lock_mode: None,
            object_lock_retain_until_date: None,
            object_lock_legal_hold: None,
            expected_bucket_owner: None,
        }
    }

    /// Set the object body.
    pub fn with_body(mut self, body: impl Into<Bytes>) -> Self {
        self.body = Some(body.into());
        self
    }

    /// Set the content type.
    pub fn with_content_type(mut self, content_type: impl Into<String>) -> Self {
        self.content_type = Some(content_type.into());
        self
    }

    /// Set the storage class.
    pub fn with_storage_class(mut self, storage_class: StorageClass) -> Self {
        self.storage_class = Some(storage_class);
        self
    }

    /// Set the server-side encryption.
    pub fn with_encryption(mut self, encryption: ServerSideEncryption) -> Self {
        self.server_side_encryption = Some(encryption);
        self
    }

    /// Set the canned ACL.
    pub fn with_acl(mut self, acl: CannedAcl) -> Self {
        self.acl = Some(acl);
        self
    }

    /// Add metadata.
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    /// Set tags.
    pub fn with_tags(mut self, tags: Vec<Tag>) -> Self {
        self.tagging = Some(tags);
        self
    }

    /// Set cache control.
    pub fn with_cache_control(mut self, cache_control: impl Into<String>) -> Self {
        self.cache_control = Some(cache_control.into());
        self
    }
}

/// Request to get an object.
#[derive(Debug, Clone, Default)]
pub struct GetObjectRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Version ID.
    pub version_id: Option<String>,
    /// Byte range (e.g., "bytes=0-999").
    pub range: Option<String>,
    /// If-Match ETag.
    pub if_match: Option<String>,
    /// If-None-Match ETag.
    pub if_none_match: Option<String>,
    /// If-Modified-Since date.
    pub if_modified_since: Option<String>,
    /// If-Unmodified-Since date.
    pub if_unmodified_since: Option<String>,
    /// Response content type override.
    pub response_content_type: Option<String>,
    /// Response content disposition override.
    pub response_content_disposition: Option<String>,
    /// Response cache control override.
    pub response_cache_control: Option<String>,
    /// Response content encoding override.
    pub response_content_encoding: Option<String>,
    /// Response content language override.
    pub response_content_language: Option<String>,
    /// Response expires override.
    pub response_expires: Option<String>,
    /// Part number (for multipart objects).
    pub part_number: Option<u32>,
    /// SSE-C algorithm.
    pub sse_customer_algorithm: Option<String>,
    /// SSE-C key.
    pub sse_customer_key: Option<String>,
    /// SSE-C key MD5.
    pub sse_customer_key_md5: Option<String>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl GetObjectRequest {
    /// Create a new get object request.
    pub fn new(bucket: impl Into<String>, key: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            ..Default::default()
        }
    }

    /// Set the version ID.
    pub fn with_version_id(mut self, version_id: impl Into<String>) -> Self {
        self.version_id = Some(version_id.into());
        self
    }

    /// Set a byte range.
    pub fn with_range(mut self, start: u64, end: u64) -> Self {
        self.range = Some(format!("bytes={}-{}", start, end));
        self
    }

    /// Set If-Match condition.
    pub fn with_if_match(mut self, etag: impl Into<String>) -> Self {
        self.if_match = Some(etag.into());
        self
    }

    /// Set If-None-Match condition.
    pub fn with_if_none_match(mut self, etag: impl Into<String>) -> Self {
        self.if_none_match = Some(etag.into());
        self
    }
}

/// Request to delete an object.
#[derive(Debug, Clone)]
pub struct DeleteObjectRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Version ID.
    pub version_id: Option<String>,
    /// MFA for versioned deletes.
    pub mfa: Option<String>,
    /// Bypass governance mode.
    pub bypass_governance_retention: Option<bool>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl DeleteObjectRequest {
    /// Create a new delete object request.
    pub fn new(bucket: impl Into<String>, key: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            version_id: None,
            mfa: None,
            bypass_governance_retention: None,
            expected_bucket_owner: None,
        }
    }

    /// Set the version ID.
    pub fn with_version_id(mut self, version_id: impl Into<String>) -> Self {
        self.version_id = Some(version_id.into());
        self
    }
}

/// Request to delete multiple objects.
#[derive(Debug, Clone)]
pub struct DeleteObjectsRequest {
    /// Bucket name.
    pub bucket: String,
    /// Objects to delete.
    pub objects: Vec<ObjectIdentifier>,
    /// Quiet mode (only return errors).
    pub quiet: bool,
    /// MFA for versioned deletes.
    pub mfa: Option<String>,
    /// Bypass governance mode.
    pub bypass_governance_retention: Option<bool>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl DeleteObjectsRequest {
    /// Create a new batch delete request.
    pub fn new(bucket: impl Into<String>, objects: Vec<ObjectIdentifier>) -> Self {
        Self {
            bucket: bucket.into(),
            objects,
            quiet: false,
            mfa: None,
            bypass_governance_retention: None,
            expected_bucket_owner: None,
        }
    }

    /// Enable quiet mode.
    pub fn quiet(mut self) -> Self {
        self.quiet = true;
        self
    }
}

/// Request to head (get metadata of) an object.
#[derive(Debug, Clone, Default)]
pub struct HeadObjectRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Version ID.
    pub version_id: Option<String>,
    /// If-Match ETag.
    pub if_match: Option<String>,
    /// If-None-Match ETag.
    pub if_none_match: Option<String>,
    /// If-Modified-Since date.
    pub if_modified_since: Option<String>,
    /// If-Unmodified-Since date.
    pub if_unmodified_since: Option<String>,
    /// Part number.
    pub part_number: Option<u32>,
    /// SSE-C algorithm.
    pub sse_customer_algorithm: Option<String>,
    /// SSE-C key.
    pub sse_customer_key: Option<String>,
    /// SSE-C key MD5.
    pub sse_customer_key_md5: Option<String>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl HeadObjectRequest {
    /// Create a new head object request.
    pub fn new(bucket: impl Into<String>, key: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            ..Default::default()
        }
    }
}

/// Request to copy an object.
#[derive(Debug, Clone)]
pub struct CopyObjectRequest {
    /// Source bucket.
    pub source_bucket: String,
    /// Source key.
    pub source_key: String,
    /// Source version ID.
    pub source_version_id: Option<String>,
    /// Destination bucket.
    pub dest_bucket: String,
    /// Destination key.
    pub dest_key: String,
    /// Metadata directive.
    pub metadata_directive: Option<String>,
    /// New metadata (if REPLACE).
    pub metadata: std::collections::HashMap<String, String>,
    /// New content type.
    pub content_type: Option<String>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
    /// Server-side encryption.
    pub server_side_encryption: Option<ServerSideEncryption>,
    /// Canned ACL.
    pub acl: Option<CannedAcl>,
    /// Tagging directive.
    pub tagging_directive: Option<String>,
    /// New tags.
    pub tagging: Option<Vec<Tag>>,
    /// If-Match condition.
    pub copy_source_if_match: Option<String>,
    /// If-None-Match condition.
    pub copy_source_if_none_match: Option<String>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl CopyObjectRequest {
    /// Create a new copy object request.
    pub fn new(
        source_bucket: impl Into<String>,
        source_key: impl Into<String>,
        dest_bucket: impl Into<String>,
        dest_key: impl Into<String>,
    ) -> Self {
        Self {
            source_bucket: source_bucket.into(),
            source_key: source_key.into(),
            source_version_id: None,
            dest_bucket: dest_bucket.into(),
            dest_key: dest_key.into(),
            metadata_directive: None,
            metadata: std::collections::HashMap::new(),
            content_type: None,
            storage_class: None,
            server_side_encryption: None,
            acl: None,
            tagging_directive: None,
            tagging: None,
            copy_source_if_match: None,
            copy_source_if_none_match: None,
            expected_bucket_owner: None,
        }
    }

    /// Copy to same bucket with different key.
    pub fn same_bucket(
        bucket: impl Into<String>,
        source_key: impl Into<String>,
        dest_key: impl Into<String>,
    ) -> Self {
        let bucket = bucket.into();
        Self::new(bucket.clone(), source_key, bucket, dest_key)
    }
}

/// Request to list objects (v2).
#[derive(Debug, Clone, Default)]
pub struct ListObjectsV2Request {
    /// Bucket name.
    pub bucket: String,
    /// Prefix filter.
    pub prefix: Option<String>,
    /// Delimiter for hierarchy.
    pub delimiter: Option<String>,
    /// Maximum keys to return.
    pub max_keys: Option<u32>,
    /// Continuation token.
    pub continuation_token: Option<String>,
    /// Start after key.
    pub start_after: Option<String>,
    /// Fetch owner info.
    pub fetch_owner: Option<bool>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl ListObjectsV2Request {
    /// Create a new list objects request.
    pub fn new(bucket: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            ..Default::default()
        }
    }

    /// Set prefix filter.
    pub fn with_prefix(mut self, prefix: impl Into<String>) -> Self {
        self.prefix = Some(prefix.into());
        self
    }

    /// Set delimiter.
    pub fn with_delimiter(mut self, delimiter: impl Into<String>) -> Self {
        self.delimiter = Some(delimiter.into());
        self
    }

    /// Set maximum keys.
    pub fn with_max_keys(mut self, max_keys: u32) -> Self {
        self.max_keys = Some(max_keys);
        self
    }

    /// Set continuation token.
    pub fn with_continuation_token(mut self, token: impl Into<String>) -> Self {
        self.continuation_token = Some(token.into());
        self
    }
}

/// Request to create a bucket.
#[derive(Debug, Clone)]
pub struct CreateBucketRequest {
    /// Bucket name.
    pub bucket: String,
    /// Location constraint (region).
    pub location_constraint: Option<String>,
    /// Canned ACL.
    pub acl: Option<CannedAcl>,
    /// Grant read access.
    pub grant_read: Option<String>,
    /// Grant write access.
    pub grant_write: Option<String>,
    /// Grant full control.
    pub grant_full_control: Option<String>,
    /// Enable object lock.
    pub object_lock_enabled: Option<bool>,
}

impl CreateBucketRequest {
    /// Create a new create bucket request.
    pub fn new(bucket: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            location_constraint: None,
            acl: None,
            grant_read: None,
            grant_write: None,
            grant_full_control: None,
            object_lock_enabled: None,
        }
    }

    /// Set location constraint.
    pub fn with_region(mut self, region: impl Into<String>) -> Self {
        self.location_constraint = Some(region.into());
        self
    }
}

/// Request to delete a bucket.
#[derive(Debug, Clone)]
pub struct DeleteBucketRequest {
    /// Bucket name.
    pub bucket: String,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl DeleteBucketRequest {
    /// Create a new delete bucket request.
    pub fn new(bucket: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            expected_bucket_owner: None,
        }
    }
}

/// Request to check if a bucket exists.
#[derive(Debug, Clone)]
pub struct HeadBucketRequest {
    /// Bucket name.
    pub bucket: String,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl HeadBucketRequest {
    /// Create a new head bucket request.
    pub fn new(bucket: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            expected_bucket_owner: None,
        }
    }
}

/// Request to create a multipart upload.
#[derive(Debug, Clone)]
pub struct CreateMultipartUploadRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Content type.
    pub content_type: Option<String>,
    /// Content encoding.
    pub content_encoding: Option<String>,
    /// Content disposition.
    pub content_disposition: Option<String>,
    /// Cache control.
    pub cache_control: Option<String>,
    /// Content language.
    pub content_language: Option<String>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
    /// Server-side encryption.
    pub server_side_encryption: Option<ServerSideEncryption>,
    /// Canned ACL.
    pub acl: Option<CannedAcl>,
    /// Metadata.
    pub metadata: std::collections::HashMap<String, String>,
    /// Tags.
    pub tagging: Option<Vec<Tag>>,
}

impl CreateMultipartUploadRequest {
    /// Create a new multipart upload request.
    pub fn new(bucket: impl Into<String>, key: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            content_type: None,
            content_encoding: None,
            content_disposition: None,
            cache_control: None,
            content_language: None,
            storage_class: None,
            server_side_encryption: None,
            acl: None,
            metadata: std::collections::HashMap::new(),
            tagging: None,
        }
    }
}

/// Request to upload a part.
#[derive(Debug, Clone)]
pub struct UploadPartRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Upload ID.
    pub upload_id: String,
    /// Part number (1-10000).
    pub part_number: u32,
    /// Part body.
    pub body: Bytes,
    /// Content MD5.
    pub content_md5: Option<String>,
    /// SSE-C algorithm.
    pub sse_customer_algorithm: Option<String>,
    /// SSE-C key.
    pub sse_customer_key: Option<String>,
    /// SSE-C key MD5.
    pub sse_customer_key_md5: Option<String>,
}

impl UploadPartRequest {
    /// Create a new upload part request.
    pub fn new(
        bucket: impl Into<String>,
        key: impl Into<String>,
        upload_id: impl Into<String>,
        part_number: u32,
        body: impl Into<Bytes>,
    ) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            upload_id: upload_id.into(),
            part_number,
            body: body.into(),
            content_md5: None,
            sse_customer_algorithm: None,
            sse_customer_key: None,
            sse_customer_key_md5: None,
        }
    }
}

/// Request to list parts.
#[derive(Debug, Clone)]
pub struct ListPartsRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Upload ID.
    pub upload_id: String,
    /// Max parts to return.
    pub max_parts: Option<u32>,
    /// Part number marker.
    pub part_number_marker: Option<u32>,
}

impl ListPartsRequest {
    /// Create a new list parts request.
    pub fn new(
        bucket: impl Into<String>,
        key: impl Into<String>,
        upload_id: impl Into<String>,
    ) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            upload_id: upload_id.into(),
            max_parts: None,
            part_number_marker: None,
        }
    }
}

/// Request to presign a GET URL.
#[derive(Debug, Clone)]
pub struct PresignGetRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Expiration duration (max 7 days).
    pub expires_in: Duration,
    /// Version ID.
    pub version_id: Option<String>,
    /// Response content type.
    pub response_content_type: Option<String>,
    /// Response content disposition.
    pub response_content_disposition: Option<String>,
}

impl PresignGetRequest {
    /// Create a new presign GET request.
    pub fn new(
        bucket: impl Into<String>,
        key: impl Into<String>,
        expires_in: Duration,
    ) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            expires_in,
            version_id: None,
            response_content_type: None,
            response_content_disposition: None,
        }
    }
}

/// Request to presign a PUT URL.
#[derive(Debug, Clone)]
pub struct PresignPutRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Expiration duration (max 7 days).
    pub expires_in: Duration,
    /// Content type.
    pub content_type: Option<String>,
    /// Content length.
    pub content_length: Option<u64>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
}

impl PresignPutRequest {
    /// Create a new presign PUT request.
    pub fn new(
        bucket: impl Into<String>,
        key: impl Into<String>,
        expires_in: Duration,
    ) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            expires_in,
            content_type: None,
            content_length: None,
            storage_class: None,
        }
    }
}

/// Request to presign a DELETE URL.
#[derive(Debug, Clone)]
pub struct PresignDeleteRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Expiration duration (max 7 days).
    pub expires_in: Duration,
    /// Version ID.
    pub version_id: Option<String>,
}

impl PresignDeleteRequest {
    /// Create a new presign DELETE request.
    pub fn new(
        bucket: impl Into<String>,
        key: impl Into<String>,
        expires_in: Duration,
    ) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            expires_in,
            version_id: None,
        }
    }
}

/// Request to get object tagging.
#[derive(Debug, Clone)]
pub struct GetObjectTaggingRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Version ID.
    pub version_id: Option<String>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl GetObjectTaggingRequest {
    /// Create a new get tagging request.
    pub fn new(bucket: impl Into<String>, key: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            version_id: None,
            expected_bucket_owner: None,
        }
    }
}

/// Request to put object tagging.
#[derive(Debug, Clone)]
pub struct PutObjectTaggingRequest {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Tags to set.
    pub tags: Vec<Tag>,
    /// Version ID.
    pub version_id: Option<String>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl PutObjectTaggingRequest {
    /// Create a new put tagging request.
    pub fn new(bucket: impl Into<String>, key: impl Into<String>, tags: Vec<Tag>) -> Self {
        Self {
            bucket: bucket.into(),
            key: key.into(),
            tags,
            version_id: None,
            expected_bucket_owner: None,
        }
    }
}

// =============================================
// Bucket Tagging Request Types
// =============================================

/// Request to get bucket tagging.
#[derive(Debug, Clone)]
pub struct GetBucketTaggingRequest {
    /// Bucket name.
    pub bucket: String,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl GetBucketTaggingRequest {
    /// Create a new get bucket tagging request.
    pub fn new(bucket: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            expected_bucket_owner: None,
        }
    }
}

/// Request to put bucket tagging.
#[derive(Debug, Clone)]
pub struct PutBucketTaggingRequest {
    /// Bucket name.
    pub bucket: String,
    /// Tags to set.
    pub tags: Vec<Tag>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl PutBucketTaggingRequest {
    /// Create a new put bucket tagging request.
    pub fn new(bucket: impl Into<String>, tags: Vec<Tag>) -> Self {
        Self {
            bucket: bucket.into(),
            tags,
            expected_bucket_owner: None,
        }
    }
}

/// Request to delete bucket tagging.
#[derive(Debug, Clone)]
pub struct DeleteBucketTaggingRequest {
    /// Bucket name.
    pub bucket: String,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl DeleteBucketTaggingRequest {
    /// Create a new delete bucket tagging request.
    pub fn new(bucket: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            expected_bucket_owner: None,
        }
    }
}

/// Request to list multipart uploads.
#[derive(Debug, Clone, Default)]
pub struct ListMultipartUploadsRequest {
    /// Bucket name.
    pub bucket: String,
    /// Prefix filter.
    pub prefix: Option<String>,
    /// Delimiter for hierarchy.
    pub delimiter: Option<String>,
    /// Key marker for pagination.
    pub key_marker: Option<String>,
    /// Upload ID marker for pagination.
    pub upload_id_marker: Option<String>,
    /// Maximum uploads to return.
    pub max_uploads: Option<u32>,
    /// Expected bucket owner.
    pub expected_bucket_owner: Option<String>,
}

impl ListMultipartUploadsRequest {
    /// Create a new list multipart uploads request.
    pub fn new(bucket: impl Into<String>) -> Self {
        Self {
            bucket: bucket.into(),
            ..Default::default()
        }
    }

    /// Set prefix filter.
    pub fn with_prefix(mut self, prefix: impl Into<String>) -> Self {
        self.prefix = Some(prefix.into());
        self
    }

    /// Set delimiter.
    pub fn with_delimiter(mut self, delimiter: impl Into<String>) -> Self {
        self.delimiter = Some(delimiter.into());
        self
    }

    /// Set max uploads.
    pub fn with_max_uploads(mut self, max_uploads: u32) -> Self {
        self.max_uploads = Some(max_uploads);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_put_object_request_builder() {
        let request = PutObjectRequest::new("bucket", "key")
            .with_body(b"hello")
            .with_content_type("text/plain")
            .with_storage_class(StorageClass::StandardIa)
            .with_metadata("author", "test");

        assert_eq!(request.bucket, "bucket");
        assert_eq!(request.key, "key");
        assert_eq!(request.content_type, Some("text/plain".to_string()));
        assert_eq!(request.storage_class, Some(StorageClass::StandardIa));
        assert_eq!(request.metadata.get("author"), Some(&"test".to_string()));
    }

    #[test]
    fn test_get_object_request_range() {
        let request = GetObjectRequest::new("bucket", "key").with_range(0, 999);

        assert_eq!(request.range, Some("bytes=0-999".to_string()));
    }

    #[test]
    fn test_list_objects_request() {
        let request = ListObjectsV2Request::new("bucket")
            .with_prefix("prefix/")
            .with_delimiter("/")
            .with_max_keys(100);

        assert_eq!(request.prefix, Some("prefix/".to_string()));
        assert_eq!(request.delimiter, Some("/".to_string()));
        assert_eq!(request.max_keys, Some(100));
    }

    #[test]
    fn test_copy_object_same_bucket() {
        let request = CopyObjectRequest::same_bucket("bucket", "source", "dest");

        assert_eq!(request.source_bucket, "bucket");
        assert_eq!(request.dest_bucket, "bucket");
        assert_eq!(request.source_key, "source");
        assert_eq!(request.dest_key, "dest");
    }
}
