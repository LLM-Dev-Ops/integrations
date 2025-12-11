//! Response types for S3 operations.

use super::common::*;
use bytes::Bytes;

/// Response from put object operation.
#[derive(Debug, Clone)]
pub struct PutObjectOutput {
    /// ETag of the uploaded object.
    pub e_tag: Option<String>,
    /// Version ID if versioning enabled.
    pub version_id: Option<String>,
    /// Server-side encryption algorithm.
    pub server_side_encryption: Option<String>,
    /// SSE-KMS key ID.
    pub sse_kms_key_id: Option<String>,
    /// Bucket key enabled.
    pub bucket_key_enabled: Option<bool>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from get object operation.
#[derive(Debug)]
pub struct GetObjectOutput {
    /// Object body.
    pub body: Bytes,
    /// ETag.
    pub e_tag: Option<String>,
    /// Content length.
    pub content_length: Option<u64>,
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
    /// Last modified.
    pub last_modified: Option<String>,
    /// Version ID.
    pub version_id: Option<String>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
    /// Server-side encryption.
    pub server_side_encryption: Option<String>,
    /// SSE-KMS key ID.
    pub sse_kms_key_id: Option<String>,
    /// Metadata.
    pub metadata: std::collections::HashMap<String, String>,
    /// Tag count.
    pub tag_count: Option<u32>,
    /// Delete marker.
    pub delete_marker: Option<bool>,
    /// Parts count (for multipart objects).
    pub parts_count: Option<u32>,
    /// Content range (for range requests).
    pub content_range: Option<String>,
    /// Accept ranges.
    pub accept_ranges: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from head object operation.
#[derive(Debug, Clone)]
pub struct HeadObjectOutput {
    /// ETag.
    pub e_tag: Option<String>,
    /// Content length.
    pub content_length: Option<u64>,
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
    /// Last modified.
    pub last_modified: Option<String>,
    /// Version ID.
    pub version_id: Option<String>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
    /// Server-side encryption.
    pub server_side_encryption: Option<String>,
    /// SSE-KMS key ID.
    pub sse_kms_key_id: Option<String>,
    /// Metadata.
    pub metadata: std::collections::HashMap<String, String>,
    /// Delete marker.
    pub delete_marker: Option<bool>,
    /// Parts count.
    pub parts_count: Option<u32>,
    /// Object lock mode.
    pub object_lock_mode: Option<String>,
    /// Object lock retain until date.
    pub object_lock_retain_until_date: Option<String>,
    /// Object lock legal hold.
    pub object_lock_legal_hold_status: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from delete object operation.
#[derive(Debug, Clone)]
pub struct DeleteObjectOutput {
    /// Delete marker flag.
    pub delete_marker: Option<bool>,
    /// Version ID of the delete marker.
    pub version_id: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from delete objects (batch) operation.
#[derive(Debug, Clone)]
pub struct DeleteObjectsOutput {
    /// Successfully deleted objects.
    pub deleted: Vec<DeletedObject>,
    /// Errors during deletion.
    pub errors: Vec<DeleteError>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from copy object operation.
#[derive(Debug, Clone)]
pub struct CopyObjectOutput {
    /// ETag of the copied object.
    pub e_tag: Option<String>,
    /// Last modified date.
    pub last_modified: Option<String>,
    /// Version ID.
    pub version_id: Option<String>,
    /// Source version ID.
    pub copy_source_version_id: Option<String>,
    /// Server-side encryption.
    pub server_side_encryption: Option<String>,
    /// SSE-KMS key ID.
    pub sse_kms_key_id: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from list objects v2 operation.
#[derive(Debug, Clone)]
pub struct ListObjectsV2Output {
    /// Bucket name.
    pub name: Option<String>,
    /// Prefix used.
    pub prefix: Option<String>,
    /// Delimiter used.
    pub delimiter: Option<String>,
    /// Maximum keys.
    pub max_keys: Option<u32>,
    /// Key count returned.
    pub key_count: Option<u32>,
    /// Is truncated (more results available).
    pub is_truncated: bool,
    /// Continuation token for next page.
    pub next_continuation_token: Option<String>,
    /// Start after value.
    pub start_after: Option<String>,
    /// Continuation token used.
    pub continuation_token: Option<String>,
    /// Objects returned.
    pub contents: Vec<S3Object>,
    /// Common prefixes (for hierarchy).
    pub common_prefixes: Vec<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from create bucket operation.
#[derive(Debug, Clone)]
pub struct CreateBucketOutput {
    /// Bucket location.
    pub location: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from head bucket operation.
#[derive(Debug, Clone)]
pub struct HeadBucketOutput {
    /// Bucket region.
    pub bucket_region: Option<String>,
    /// Access point alias flag.
    pub access_point_alias: Option<bool>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from list buckets operation.
#[derive(Debug, Clone)]
pub struct ListBucketsOutput {
    /// Owner information.
    pub owner: Option<Owner>,
    /// Buckets list.
    pub buckets: Vec<Bucket>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from create multipart upload operation.
#[derive(Debug, Clone)]
pub struct CreateMultipartUploadOutput {
    /// Bucket name.
    pub bucket: String,
    /// Object key.
    pub key: String,
    /// Upload ID.
    pub upload_id: String,
    /// Server-side encryption.
    pub server_side_encryption: Option<String>,
    /// SSE-KMS key ID.
    pub sse_kms_key_id: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from upload part operation.
#[derive(Debug, Clone)]
pub struct UploadPartOutput {
    /// Part ETag.
    pub e_tag: String,
    /// Server-side encryption.
    pub server_side_encryption: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from complete multipart upload operation.
#[derive(Debug, Clone)]
pub struct CompleteMultipartUploadOutput {
    /// Bucket name.
    pub bucket: Option<String>,
    /// Object key.
    pub key: Option<String>,
    /// Object ETag.
    pub e_tag: Option<String>,
    /// Object location URL.
    pub location: Option<String>,
    /// Version ID.
    pub version_id: Option<String>,
    /// Server-side encryption.
    pub server_side_encryption: Option<String>,
    /// SSE-KMS key ID.
    pub sse_kms_key_id: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from list parts operation.
#[derive(Debug, Clone)]
pub struct ListPartsOutput {
    /// Bucket name.
    pub bucket: Option<String>,
    /// Object key.
    pub key: Option<String>,
    /// Upload ID.
    pub upload_id: Option<String>,
    /// Part number marker.
    pub part_number_marker: Option<u32>,
    /// Next part number marker.
    pub next_part_number_marker: Option<u32>,
    /// Max parts.
    pub max_parts: Option<u32>,
    /// Is truncated.
    pub is_truncated: bool,
    /// Parts list.
    pub parts: Vec<Part>,
    /// Initiator.
    pub initiator: Option<Owner>,
    /// Owner.
    pub owner: Option<Owner>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Presigned URL.
#[derive(Debug, Clone)]
pub struct PresignedUrl {
    /// The presigned URL.
    pub url: String,
    /// HTTP method.
    pub method: String,
    /// Expiration timestamp.
    pub expires_at: chrono::DateTime<chrono::Utc>,
    /// Headers to include with the request.
    pub signed_headers: std::collections::HashMap<String, String>,
}

impl PresignedUrl {
    /// Check if the URL has expired.
    pub fn is_expired(&self) -> bool {
        chrono::Utc::now() >= self.expires_at
    }

    /// Get remaining time until expiration.
    pub fn time_remaining(&self) -> Option<chrono::Duration> {
        let remaining = self.expires_at - chrono::Utc::now();
        if remaining.num_seconds() > 0 {
            Some(remaining)
        } else {
            None
        }
    }
}

/// Response from get object tagging operation.
#[derive(Debug, Clone)]
pub struct GetObjectTaggingOutput {
    /// Version ID.
    pub version_id: Option<String>,
    /// Tags.
    pub tags: Vec<Tag>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from put object tagging operation.
#[derive(Debug, Clone)]
pub struct PutObjectTaggingOutput {
    /// Version ID.
    pub version_id: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

// =============================================
// Bucket Tagging Response Types
// =============================================

/// Response from get bucket tagging operation.
#[derive(Debug, Clone)]
pub struct GetBucketTaggingOutput {
    /// Tags.
    pub tags: Vec<Tag>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from put bucket tagging operation.
#[derive(Debug, Clone)]
pub struct PutBucketTaggingOutput {
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Response from delete bucket tagging operation.
#[derive(Debug, Clone)]
pub struct DeleteBucketTaggingOutput {
    /// AWS request ID.
    pub request_id: Option<String>,
}

// =============================================
// List Multipart Uploads Response Type
// =============================================

/// Response from list multipart uploads operation.
#[derive(Debug, Clone)]
pub struct ListMultipartUploadsOutput {
    /// Bucket name.
    pub bucket: Option<String>,
    /// Prefix filter.
    pub prefix: Option<String>,
    /// Delimiter.
    pub delimiter: Option<String>,
    /// Key marker.
    pub key_marker: Option<String>,
    /// Upload ID marker.
    pub upload_id_marker: Option<String>,
    /// Next key marker for pagination.
    pub next_key_marker: Option<String>,
    /// Next upload ID marker for pagination.
    pub next_upload_id_marker: Option<String>,
    /// Maximum uploads.
    pub max_uploads: Option<u32>,
    /// Is truncated (more results available).
    pub is_truncated: bool,
    /// Multipart uploads list.
    pub uploads: Vec<MultipartUpload>,
    /// Common prefixes (for hierarchy).
    pub common_prefixes: Vec<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
}

/// Information about an in-progress multipart upload.
#[derive(Debug, Clone)]
pub struct MultipartUpload {
    /// Object key.
    pub key: String,
    /// Upload ID.
    pub upload_id: String,
    /// Upload initiator.
    pub initiator: Option<Owner>,
    /// Object owner.
    pub owner: Option<Owner>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
    /// Upload initiated date.
    pub initiated: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};

    #[test]
    fn test_presigned_url_expiration() {
        let url = PresignedUrl {
            url: "https://example.com".to_string(),
            method: "GET".to_string(),
            expires_at: Utc::now() + Duration::hours(1),
            signed_headers: std::collections::HashMap::new(),
        };

        assert!(!url.is_expired());
        assert!(url.time_remaining().is_some());
    }

    #[test]
    fn test_presigned_url_expired() {
        let url = PresignedUrl {
            url: "https://example.com".to_string(),
            method: "GET".to_string(),
            expires_at: Utc::now() - Duration::hours(1),
            signed_headers: std::collections::HashMap::new(),
        };

        assert!(url.is_expired());
        assert!(url.time_remaining().is_none());
    }

    #[test]
    fn test_list_objects_output_default() {
        let output = ListObjectsV2Output {
            name: Some("my-bucket".to_string()),
            prefix: None,
            delimiter: None,
            max_keys: Some(1000),
            key_count: Some(10),
            is_truncated: false,
            next_continuation_token: None,
            start_after: None,
            continuation_token: None,
            contents: vec![],
            common_prefixes: vec![],
            request_id: None,
        };

        assert!(!output.is_truncated);
        assert!(output.next_continuation_token.is_none());
    }
}
