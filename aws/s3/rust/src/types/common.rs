//! Common enums and data types for S3.

use serde::{Deserialize, Serialize};

/// S3 storage class.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StorageClass {
    /// Standard storage for frequently accessed data.
    #[default]
    Standard,
    /// Reduced redundancy storage (not recommended).
    ReducedRedundancy,
    /// Standard-IA for infrequently accessed data.
    StandardIa,
    /// One Zone-IA for infrequently accessed, non-critical data.
    OnezoneIa,
    /// Intelligent-Tiering for unknown or changing access patterns.
    IntelligentTiering,
    /// Glacier Instant Retrieval for archive data.
    GlacierInstantRetrieval,
    /// Glacier Flexible Retrieval (formerly Glacier).
    Glacier,
    /// Glacier Deep Archive for long-term archive.
    DeepArchive,
    /// S3 Outposts storage class.
    Outposts,
    /// Express One Zone for single-digit millisecond access.
    ExpressOnezone,
}

impl StorageClass {
    /// Returns the S3 API string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            StorageClass::Standard => "STANDARD",
            StorageClass::ReducedRedundancy => "REDUCED_REDUNDANCY",
            StorageClass::StandardIa => "STANDARD_IA",
            StorageClass::OnezoneIa => "ONEZONE_IA",
            StorageClass::IntelligentTiering => "INTELLIGENT_TIERING",
            StorageClass::GlacierInstantRetrieval => "GLACIER_IR",
            StorageClass::Glacier => "GLACIER",
            StorageClass::DeepArchive => "DEEP_ARCHIVE",
            StorageClass::Outposts => "OUTPOSTS",
            StorageClass::ExpressOnezone => "EXPRESS_ONEZONE",
        }
    }
}

impl std::str::FromStr for StorageClass {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "STANDARD" => Ok(StorageClass::Standard),
            "REDUCED_REDUNDANCY" => Ok(StorageClass::ReducedRedundancy),
            "STANDARD_IA" => Ok(StorageClass::StandardIa),
            "ONEZONE_IA" => Ok(StorageClass::OnezoneIa),
            "INTELLIGENT_TIERING" => Ok(StorageClass::IntelligentTiering),
            "GLACIER_IR" => Ok(StorageClass::GlacierInstantRetrieval),
            "GLACIER" => Ok(StorageClass::Glacier),
            "DEEP_ARCHIVE" => Ok(StorageClass::DeepArchive),
            "OUTPOSTS" => Ok(StorageClass::Outposts),
            "EXPRESS_ONEZONE" => Ok(StorageClass::ExpressOnezone),
            _ => Err(format!("Unknown storage class: {}", s)),
        }
    }
}

/// Server-side encryption types.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ServerSideEncryption {
    /// S3-managed keys (SSE-S3).
    Aes256,
    /// AWS KMS-managed keys (SSE-KMS).
    AwsKms {
        /// KMS key ID (optional, uses default if not specified).
        key_id: Option<String>,
    },
    /// Customer-provided keys (SSE-C).
    CustomerProvided {
        /// Algorithm (only AES256 supported).
        algorithm: String,
        /// Base64-encoded key.
        key: String,
        /// Base64-encoded MD5 of the key.
        key_md5: String,
    },
}

impl ServerSideEncryption {
    /// Create SSE-S3 encryption.
    pub fn aes256() -> Self {
        ServerSideEncryption::Aes256
    }

    /// Create SSE-KMS encryption with default key.
    pub fn kms() -> Self {
        ServerSideEncryption::AwsKms { key_id: None }
    }

    /// Create SSE-KMS encryption with specific key.
    pub fn kms_with_key(key_id: impl Into<String>) -> Self {
        ServerSideEncryption::AwsKms {
            key_id: Some(key_id.into()),
        }
    }

    /// Returns the S3 API string representation.
    pub fn as_header_value(&self) -> &'static str {
        match self {
            ServerSideEncryption::Aes256 => "AES256",
            ServerSideEncryption::AwsKms { .. } => "aws:kms",
            ServerSideEncryption::CustomerProvided { .. } => "AES256",
        }
    }
}

/// Canned ACL (Access Control List) settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum CannedAcl {
    /// Owner gets FULL_CONTROL. No one else has access rights (default).
    #[default]
    Private,
    /// Owner gets FULL_CONTROL. Everyone else gets READ access.
    PublicRead,
    /// Owner gets FULL_CONTROL. Everyone else gets READ and WRITE access.
    PublicReadWrite,
    /// Owner gets FULL_CONTROL. Amazon EC2 gets READ access.
    AuthenticatedRead,
    /// Object owner gets FULL_CONTROL. Bucket owner gets READ access.
    BucketOwnerRead,
    /// Both object and bucket owners get FULL_CONTROL.
    BucketOwnerFullControl,
}

impl CannedAcl {
    /// Returns the S3 API string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            CannedAcl::Private => "private",
            CannedAcl::PublicRead => "public-read",
            CannedAcl::PublicReadWrite => "public-read-write",
            CannedAcl::AuthenticatedRead => "authenticated-read",
            CannedAcl::BucketOwnerRead => "bucket-owner-read",
            CannedAcl::BucketOwnerFullControl => "bucket-owner-full-control",
        }
    }
}

/// Checksum algorithms supported by S3.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChecksumAlgorithm {
    /// CRC32 checksum.
    Crc32,
    /// CRC32C checksum (Castagnoli).
    Crc32c,
    /// SHA-1 checksum.
    Sha1,
    /// SHA-256 checksum.
    Sha256,
}

impl ChecksumAlgorithm {
    /// Returns the S3 API string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            ChecksumAlgorithm::Crc32 => "CRC32",
            ChecksumAlgorithm::Crc32c => "CRC32C",
            ChecksumAlgorithm::Sha1 => "SHA1",
            ChecksumAlgorithm::Sha256 => "SHA256",
        }
    }
}

/// Object tag.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Tag {
    /// Tag key (max 128 characters).
    pub key: String,
    /// Tag value (max 256 characters).
    pub value: String,
}

impl Tag {
    /// Create a new tag.
    pub fn new(key: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            value: value.into(),
        }
    }
}

/// S3 bucket information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bucket {
    /// Bucket name.
    pub name: String,
    /// Creation date (ISO 8601 format).
    pub creation_date: Option<String>,
}

/// S3 object information (from list operations).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Object {
    /// Object key.
    pub key: String,
    /// Last modified date (ISO 8601 format).
    pub last_modified: Option<String>,
    /// ETag (entity tag).
    pub e_tag: Option<String>,
    /// Size in bytes.
    pub size: Option<u64>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
    /// Owner information.
    pub owner: Option<Owner>,
}

/// Full object metadata (from HEAD or GET).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Object {
    /// Object key.
    pub key: String,
    /// ETag.
    pub e_tag: Option<String>,
    /// Content length in bytes.
    pub content_length: Option<u64>,
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
    /// Last modified date.
    pub last_modified: Option<String>,
    /// Version ID.
    pub version_id: Option<String>,
    /// Storage class.
    pub storage_class: Option<StorageClass>,
    /// Server-side encryption.
    pub server_side_encryption: Option<String>,
    /// SSE-KMS key ID.
    pub sse_kms_key_id: Option<String>,
    /// User-defined metadata.
    pub metadata: std::collections::HashMap<String, String>,
    /// Number of tags.
    pub tag_count: Option<u32>,
    /// Delete marker flag.
    pub delete_marker: Option<bool>,
}

/// Object owner information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Owner {
    /// Owner ID.
    pub id: Option<String>,
    /// Display name.
    pub display_name: Option<String>,
}

/// Object identifier for batch operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectIdentifier {
    /// Object key.
    pub key: String,
    /// Version ID (optional, for versioned objects).
    pub version_id: Option<String>,
}

impl ObjectIdentifier {
    /// Create a new object identifier.
    pub fn new(key: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            version_id: None,
        }
    }

    /// Create an object identifier with a version ID.
    pub fn with_version(key: impl Into<String>, version_id: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            version_id: Some(version_id.into()),
        }
    }
}

/// Multipart upload part information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Part {
    /// Part number (1-10000).
    pub part_number: u32,
    /// ETag of the uploaded part.
    pub e_tag: String,
    /// Size of the part in bytes.
    pub size: Option<u64>,
    /// Last modified date.
    pub last_modified: Option<String>,
}

impl Part {
    /// Create a new part.
    pub fn new(part_number: u32, e_tag: impl Into<String>) -> Self {
        Self {
            part_number,
            e_tag: e_tag.into(),
            size: None,
            last_modified: None,
        }
    }
}

/// Completed part for multipart upload completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedPart {
    /// Part number.
    pub part_number: u32,
    /// ETag.
    pub e_tag: String,
}

impl From<Part> for CompletedPart {
    fn from(part: Part) -> Self {
        Self {
            part_number: part.part_number,
            e_tag: part.e_tag,
        }
    }
}

/// Delete result for batch delete operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletedObject {
    /// Deleted object key.
    pub key: String,
    /// Version ID if applicable.
    pub version_id: Option<String>,
    /// Delete marker flag.
    pub delete_marker: Option<bool>,
    /// Delete marker version ID.
    pub delete_marker_version_id: Option<String>,
}

/// Error from batch delete operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteError {
    /// Object key.
    pub key: String,
    /// Version ID if applicable.
    pub version_id: Option<String>,
    /// Error code.
    pub code: String,
    /// Error message.
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_class_roundtrip() {
        let class = StorageClass::Standard;
        assert_eq!(class.as_str(), "STANDARD");
        assert_eq!("STANDARD".parse::<StorageClass>().unwrap(), class);
    }

    #[test]
    fn test_canned_acl_str() {
        assert_eq!(CannedAcl::Private.as_str(), "private");
        assert_eq!(CannedAcl::PublicRead.as_str(), "public-read");
        assert_eq!(
            CannedAcl::BucketOwnerFullControl.as_str(),
            "bucket-owner-full-control"
        );
    }

    #[test]
    fn test_server_side_encryption() {
        let sse = ServerSideEncryption::aes256();
        assert_eq!(sse.as_header_value(), "AES256");

        let kms = ServerSideEncryption::kms_with_key("arn:aws:kms:...");
        assert_eq!(kms.as_header_value(), "aws:kms");
    }

    #[test]
    fn test_tag_creation() {
        let tag = Tag::new("Environment", "Production");
        assert_eq!(tag.key, "Environment");
        assert_eq!(tag.value, "Production");
    }

    #[test]
    fn test_object_identifier() {
        let id = ObjectIdentifier::new("my-key");
        assert_eq!(id.key, "my-key");
        assert!(id.version_id.is_none());

        let versioned = ObjectIdentifier::with_version("my-key", "v1");
        assert_eq!(versioned.version_id, Some("v1".to_string()));
    }

    #[test]
    fn test_part_creation() {
        let part = Part::new(1, "abc123");
        assert_eq!(part.part_number, 1);
        assert_eq!(part.e_tag, "abc123");

        let completed: CompletedPart = part.into();
        assert_eq!(completed.part_number, 1);
        assert_eq!(completed.e_tag, "abc123");
    }
}
