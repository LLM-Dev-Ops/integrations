//! Error types for the S3 integration module.
//!
//! This module defines a comprehensive error hierarchy following the SPARC specification.
//! Errors are categorized by their source and nature to enable appropriate handling.

mod mapping;

pub use mapping::map_s3_error_code;

use std::time::Duration;
use thiserror::Error;

/// Top-level error type for the S3 integration.
#[derive(Debug, Error)]
pub enum S3Error {
    /// Configuration-related errors.
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    /// Credential-related errors.
    #[error("Credentials error: {0}")]
    Credentials(#[from] CredentialsError),

    /// AWS signing errors.
    #[error("Signing error: {0}")]
    Signing(#[from] SigningError),

    /// Request validation errors.
    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    /// Bucket operation errors.
    #[error("Bucket error: {0}")]
    Bucket(#[from] BucketError),

    /// Object operation errors.
    #[error("Object error: {0}")]
    Object(#[from] ObjectError),

    /// Multipart upload errors.
    #[error("Multipart error: {0}")]
    Multipart(#[from] MultipartError),

    /// Access and authorization errors.
    #[error("Access error: {0}")]
    Access(#[from] AccessError),

    /// Network and transport errors.
    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    /// Server-side errors.
    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    /// Response parsing errors.
    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    /// Transfer and streaming errors.
    #[error("Transfer error: {0}")]
    Transfer(#[from] TransferError),
}

impl S3Error {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        match self {
            S3Error::Network(e) => e.is_retryable(),
            S3Error::Server(e) => e.is_retryable(),
            S3Error::Transfer(TransferError::StreamInterrupted { .. }) => true,
            _ => false,
        }
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            S3Error::Server(ServerError::SlowDown { retry_after, .. }) => *retry_after,
            S3Error::Server(ServerError::ServiceUnavailable { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }

    /// Returns the HTTP status code if applicable.
    pub fn status_code(&self) -> Option<u16> {
        match self {
            S3Error::Access(_) => Some(403),
            S3Error::Bucket(BucketError::NotFound { .. }) => Some(404),
            S3Error::Bucket(BucketError::AlreadyExists { .. }) => Some(409),
            S3Error::Bucket(BucketError::AlreadyOwnedByYou { .. }) => Some(409),
            S3Error::Bucket(BucketError::NotEmpty { .. }) => Some(409),
            S3Error::Object(ObjectError::NotFound { .. }) => Some(404),
            S3Error::Object(ObjectError::PreconditionFailed { .. }) => Some(412),
            S3Error::Object(ObjectError::NotModified { .. }) => Some(304),
            S3Error::Multipart(MultipartError::UploadNotFound { .. }) => Some(404),
            S3Error::Request(_) => Some(400),
            S3Error::Server(ServerError::InternalError { .. }) => Some(500),
            S3Error::Server(ServerError::ServiceUnavailable { .. }) => Some(503),
            S3Error::Server(ServerError::SlowDown { .. }) => Some(503),
            S3Error::Server(ServerError::BadGateway { .. }) => Some(502),
            _ => None,
        }
    }

    /// Returns the S3 error code if available.
    pub fn s3_error_code(&self) -> Option<&str> {
        match self {
            S3Error::Bucket(e) => Some(e.code()),
            S3Error::Object(e) => Some(e.code()),
            S3Error::Multipart(e) => Some(e.code()),
            S3Error::Access(e) => Some(e.code()),
            S3Error::Server(e) => Some(e.code()),
            _ => None,
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            S3Error::Bucket(e) => e.request_id(),
            S3Error::Object(e) => e.request_id(),
            S3Error::Multipart(e) => e.request_id(),
            S3Error::Access(e) => e.request_id(),
            S3Error::Server(e) => e.request_id(),
            _ => None,
        }
    }
}

/// Configuration-related errors.
#[derive(Debug, Error)]
pub enum ConfigurationError {
    /// Missing required region configuration.
    #[error("Missing region: region must be specified via config or environment")]
    MissingRegion,

    /// Missing required credentials.
    #[error("Missing credentials: credentials must be specified via config or environment")]
    MissingCredentials,

    /// Invalid endpoint URL.
    #[error("Invalid endpoint URL: {url}")]
    InvalidEndpoint {
        /// The invalid URL.
        url: String,
        /// Details about the validation error.
        details: String,
    },

    /// Invalid configuration value.
    #[error("Invalid configuration: {field} - {message}")]
    InvalidConfiguration {
        /// The configuration field name.
        field: String,
        /// Error message.
        message: String,
    },

    /// Wrong region detected (redirect response).
    #[error("Wrong region: bucket is in region '{correct_region}', not '{configured_region}'")]
    WrongRegion {
        /// The region where the bucket is located.
        correct_region: String,
        /// The region that was configured.
        configured_region: String,
    },
}

/// Credential-related errors.
#[derive(Debug, Error)]
pub enum CredentialsError {
    /// No credentials could be found.
    #[error("Credentials not found: no credentials could be loaded from any source")]
    NotFound,

    /// Credentials have expired.
    #[error("Credentials expired: session credentials expired at {expiration}")]
    Expired {
        /// When the credentials expired.
        expiration: String,
    },

    /// Credentials are invalid.
    #[error("Invalid credentials: {message}")]
    Invalid {
        /// Details about why credentials are invalid.
        message: String,
    },

    /// Credential refresh failed.
    #[error("Credential refresh failed: {message}")]
    RefreshFailed {
        /// Details about the refresh failure.
        message: String,
    },

    /// IMDS (Instance Metadata Service) error.
    #[error("IMDS error: {message}")]
    ImdsError {
        /// Details about the IMDS error.
        message: String,
    },

    /// Profile configuration error.
    #[error("Profile error: {message}")]
    ProfileError {
        /// Details about the profile error.
        message: String,
    },
}

/// AWS Signature V4 signing errors.
#[derive(Debug, Error)]
pub enum SigningError {
    /// Invalid timestamp for signing.
    #[error("Invalid timestamp: {message}")]
    InvalidTimestamp {
        /// Details about the timestamp error.
        message: String,
    },

    /// Signature calculation failed.
    #[error("Signature calculation failed: {message}")]
    CalculationFailed {
        /// Details about the calculation error.
        message: String,
    },

    /// Unsupported signing algorithm.
    #[error("Unsupported algorithm: {algorithm}")]
    UnsupportedAlgorithm {
        /// The unsupported algorithm.
        algorithm: String,
    },

    /// Credential scope mismatch.
    #[error("Credential scope mismatch: expected {expected}, got {actual}")]
    CredentialScopeMismatch {
        /// Expected scope.
        expected: String,
        /// Actual scope.
        actual: String,
    },
}

/// Request validation errors.
#[derive(Debug, Error)]
pub enum RequestError {
    /// General validation error.
    #[error("Validation error: {message}")]
    Validation {
        /// Details about the validation error.
        message: String,
    },

    /// Invalid bucket name.
    #[error("Invalid bucket name '{bucket}': {reason}")]
    InvalidBucketName {
        /// The invalid bucket name.
        bucket: String,
        /// Reason why the name is invalid.
        reason: String,
    },

    /// Invalid object key.
    #[error("Invalid object key '{key}': {reason}")]
    InvalidObjectKey {
        /// The invalid object key.
        key: String,
        /// Reason why the key is invalid.
        reason: String,
    },

    /// Invalid byte range.
    #[error("Invalid range '{range}': {reason}")]
    InvalidRange {
        /// The invalid range.
        range: String,
        /// Reason why the range is invalid.
        reason: String,
    },

    /// Entity too large.
    #[error("Entity too large: {size} bytes exceeds maximum of {max_size} bytes")]
    EntityTooLarge {
        /// The size of the entity.
        size: u64,
        /// Maximum allowed size.
        max_size: u64,
    },

    /// Entity too small.
    #[error("Entity too small: {size} bytes is below minimum of {min_size} bytes")]
    EntityTooSmall {
        /// The size of the entity.
        size: u64,
        /// Minimum required size.
        min_size: u64,
    },

    /// Missing required content length.
    #[error("Missing content length: Content-Length header is required")]
    MissingContentLength,
}

/// Bucket operation errors.
#[derive(Debug, Error)]
pub enum BucketError {
    /// Bucket not found.
    #[error("Bucket not found: '{bucket}'")]
    NotFound {
        /// The bucket name.
        bucket: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Bucket already exists (owned by another account).
    #[error("Bucket already exists: '{bucket}' is owned by another AWS account")]
    AlreadyExists {
        /// The bucket name.
        bucket: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Bucket already owned by you.
    #[error("Bucket already owned by you: '{bucket}'")]
    AlreadyOwnedByYou {
        /// The bucket name.
        bucket: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Bucket is not empty.
    #[error("Bucket not empty: '{bucket}' contains objects")]
    NotEmpty {
        /// The bucket name.
        bucket: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Too many buckets.
    #[error("Too many buckets: account limit reached")]
    TooManyBuckets {
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Invalid bucket state.
    #[error("Invalid bucket state: '{bucket}' - {message}")]
    InvalidState {
        /// The bucket name.
        bucket: String,
        /// Error message.
        message: String,
        /// AWS request ID.
        request_id: Option<String>,
    },
}

impl BucketError {
    /// Returns the S3 error code.
    pub fn code(&self) -> &str {
        match self {
            BucketError::NotFound { .. } => "NoSuchBucket",
            BucketError::AlreadyExists { .. } => "BucketAlreadyExists",
            BucketError::AlreadyOwnedByYou { .. } => "BucketAlreadyOwnedByYou",
            BucketError::NotEmpty { .. } => "BucketNotEmpty",
            BucketError::TooManyBuckets { .. } => "TooManyBuckets",
            BucketError::InvalidState { .. } => "InvalidBucketState",
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            BucketError::NotFound { request_id, .. }
            | BucketError::AlreadyExists { request_id, .. }
            | BucketError::AlreadyOwnedByYou { request_id, .. }
            | BucketError::NotEmpty { request_id, .. }
            | BucketError::TooManyBuckets { request_id }
            | BucketError::InvalidState { request_id, .. } => request_id.as_deref(),
        }
    }
}

/// Object operation errors.
#[derive(Debug, Error)]
pub enum ObjectError {
    /// Object not found.
    #[error("Object not found: '{bucket}/{key}'")]
    NotFound {
        /// The bucket name.
        bucket: String,
        /// The object key.
        key: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Precondition failed (If-Match, etc.).
    #[error("Precondition failed for '{bucket}/{key}': {condition}")]
    PreconditionFailed {
        /// The bucket name.
        bucket: String,
        /// The object key.
        key: String,
        /// The condition that failed.
        condition: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Object not modified (304 response).
    #[error("Object not modified: '{bucket}/{key}'")]
    NotModified {
        /// The bucket name.
        bucket: String,
        /// The object key.
        key: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Invalid object state (e.g., Glacier restore required).
    #[error("Invalid object state for '{bucket}/{key}': {message}")]
    InvalidState {
        /// The bucket name.
        bucket: String,
        /// The object key.
        key: String,
        /// Error message.
        message: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Object too large.
    #[error("Object too large: {size} bytes exceeds maximum")]
    TooLarge {
        /// The object size.
        size: u64,
        /// AWS request ID.
        request_id: Option<String>,
    },
}

impl ObjectError {
    /// Returns the S3 error code.
    pub fn code(&self) -> &str {
        match self {
            ObjectError::NotFound { .. } => "NoSuchKey",
            ObjectError::PreconditionFailed { .. } => "PreconditionFailed",
            ObjectError::NotModified { .. } => "NotModified",
            ObjectError::InvalidState { .. } => "InvalidObjectState",
            ObjectError::TooLarge { .. } => "EntityTooLarge",
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            ObjectError::NotFound { request_id, .. }
            | ObjectError::PreconditionFailed { request_id, .. }
            | ObjectError::NotModified { request_id, .. }
            | ObjectError::InvalidState { request_id, .. }
            | ObjectError::TooLarge { request_id, .. } => request_id.as_deref(),
        }
    }
}

/// Multipart upload errors.
#[derive(Debug, Error)]
pub enum MultipartError {
    /// Upload not found.
    #[error("Upload not found: upload_id '{upload_id}' for '{bucket}/{key}'")]
    UploadNotFound {
        /// The bucket name.
        bucket: String,
        /// The object key.
        key: String,
        /// The upload ID.
        upload_id: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Invalid part.
    #[error("Invalid part {part_number}: {reason}")]
    InvalidPart {
        /// The part number.
        part_number: u32,
        /// Reason why the part is invalid.
        reason: String,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Invalid part order.
    #[error("Invalid part order: parts must be in ascending order")]
    InvalidPartOrder {
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Too many parts.
    #[error("Too many parts: maximum is 10,000 parts")]
    TooManyParts {
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Part too small.
    #[error("Part too small: {size} bytes is below minimum of {min_size} bytes")]
    PartTooSmall {
        /// The part number.
        part_number: u32,
        /// The part size.
        size: u64,
        /// Minimum required size.
        min_size: u64,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Part too large.
    #[error("Part too large: {size} bytes exceeds maximum of {max_size} bytes")]
    PartTooLarge {
        /// The part number.
        part_number: u32,
        /// The part size.
        size: u64,
        /// Maximum allowed size.
        max_size: u64,
        /// AWS request ID.
        request_id: Option<String>,
    },
}

impl MultipartError {
    /// Returns the S3 error code.
    pub fn code(&self) -> &str {
        match self {
            MultipartError::UploadNotFound { .. } => "NoSuchUpload",
            MultipartError::InvalidPart { .. } => "InvalidPart",
            MultipartError::InvalidPartOrder { .. } => "InvalidPartOrder",
            MultipartError::TooManyParts { .. } => "TooManyParts",
            MultipartError::PartTooSmall { .. } => "EntityTooSmall",
            MultipartError::PartTooLarge { .. } => "EntityTooLarge",
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            MultipartError::UploadNotFound { request_id, .. }
            | MultipartError::InvalidPart { request_id, .. }
            | MultipartError::InvalidPartOrder { request_id }
            | MultipartError::TooManyParts { request_id }
            | MultipartError::PartTooSmall { request_id, .. }
            | MultipartError::PartTooLarge { request_id, .. } => request_id.as_deref(),
        }
    }
}

/// Access and authorization errors.
#[derive(Debug, Error)]
pub enum AccessError {
    /// Access denied.
    #[error("Access denied")]
    AccessDenied {
        /// Additional message if available.
        message: Option<String>,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Invalid access key ID.
    #[error("Invalid access key ID")]
    InvalidAccessKeyId {
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Signature does not match.
    #[error("Signature does not match")]
    SignatureDoesNotMatch {
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Expired token.
    #[error("Token has expired")]
    ExpiredToken {
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Account problem.
    #[error("Account problem: {message}")]
    AccountProblem {
        /// Error message.
        message: String,
        /// AWS request ID.
        request_id: Option<String>,
    },
}

impl AccessError {
    /// Returns the S3 error code.
    pub fn code(&self) -> &str {
        match self {
            AccessError::AccessDenied { .. } => "AccessDenied",
            AccessError::InvalidAccessKeyId { .. } => "InvalidAccessKeyId",
            AccessError::SignatureDoesNotMatch { .. } => "SignatureDoesNotMatch",
            AccessError::ExpiredToken { .. } => "ExpiredToken",
            AccessError::AccountProblem { .. } => "AccountProblem",
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            AccessError::AccessDenied { request_id, .. }
            | AccessError::InvalidAccessKeyId { request_id }
            | AccessError::SignatureDoesNotMatch { request_id }
            | AccessError::ExpiredToken { request_id }
            | AccessError::AccountProblem { request_id, .. } => request_id.as_deref(),
        }
    }
}

/// Network and transport errors.
#[derive(Debug, Error)]
pub enum NetworkError {
    /// Connection failed.
    #[error("Connection failed: {message}")]
    ConnectionFailed {
        /// Error message.
        message: String,
    },

    /// Request timed out.
    #[error("Request timed out after {duration:?}")]
    Timeout {
        /// The timeout duration.
        duration: Duration,
    },

    /// DNS resolution failed.
    #[error("DNS resolution failed for '{host}'")]
    DnsResolutionFailed {
        /// The host that could not be resolved.
        host: String,
    },

    /// TLS/SSL error.
    #[error("TLS error: {message}")]
    TlsError {
        /// Error message.
        message: String,
    },

    /// Connection reset.
    #[error("Connection reset by peer")]
    ConnectionReset,
}

impl NetworkError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            NetworkError::ConnectionFailed { .. }
                | NetworkError::Timeout { .. }
                | NetworkError::ConnectionReset
        )
    }
}

/// Server-side errors.
#[derive(Debug, Error)]
pub enum ServerError {
    /// Internal server error (500).
    #[error("Internal server error")]
    InternalError {
        /// Error message.
        message: Option<String>,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Service unavailable (503).
    #[error("Service unavailable")]
    ServiceUnavailable {
        /// Retry after duration hint.
        retry_after: Option<Duration>,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Slow down (503) - rate limiting.
    #[error("Slow down - reduce request rate")]
    SlowDown {
        /// Retry after duration hint.
        retry_after: Option<Duration>,
        /// AWS request ID.
        request_id: Option<String>,
    },

    /// Bad gateway (502).
    #[error("Bad gateway")]
    BadGateway {
        /// AWS request ID.
        request_id: Option<String>,
    },
}

impl ServerError {
    /// Returns the S3 error code.
    pub fn code(&self) -> &str {
        match self {
            ServerError::InternalError { .. } => "InternalError",
            ServerError::ServiceUnavailable { .. } => "ServiceUnavailable",
            ServerError::SlowDown { .. } => "SlowDown",
            ServerError::BadGateway { .. } => "BadGateway",
        }
    }

    /// Returns the AWS request ID if available.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            ServerError::InternalError { request_id, .. }
            | ServerError::ServiceUnavailable { request_id, .. }
            | ServerError::SlowDown { request_id, .. }
            | ServerError::BadGateway { request_id } => request_id.as_deref(),
        }
    }

    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        true
    }
}

/// Response parsing errors.
#[derive(Debug, Error)]
pub enum ResponseError {
    /// XML parse error.
    #[error("XML parse error: {message}")]
    XmlParseError {
        /// Error message.
        message: String,
    },

    /// Invalid response format.
    #[error("Invalid response: {message}")]
    InvalidResponse {
        /// Error message.
        message: String,
    },

    /// Unexpected content type.
    #[error("Unexpected content type: expected {expected}, got {actual}")]
    UnexpectedContent {
        /// Expected content type.
        expected: String,
        /// Actual content type.
        actual: String,
    },

    /// Missing required field.
    #[error("Missing required field '{field}' in response")]
    MissingField {
        /// The missing field name.
        field: String,
    },
}

/// Transfer and streaming errors.
#[derive(Debug, Error)]
pub enum TransferError {
    /// Stream interrupted.
    #[error("Stream interrupted at byte {bytes_transferred}: {message}")]
    StreamInterrupted {
        /// Bytes successfully transferred before interruption.
        bytes_transferred: u64,
        /// Error message.
        message: String,
    },

    /// Checksum mismatch.
    #[error("Checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch {
        /// Expected checksum.
        expected: String,
        /// Actual checksum.
        actual: String,
    },

    /// Incomplete body.
    #[error("Incomplete body: expected {expected} bytes, received {received} bytes")]
    IncompleteBody {
        /// Expected size.
        expected: u64,
        /// Received size.
        received: u64,
    },

    /// Upload was aborted.
    #[error("Upload aborted: {reason}")]
    UploadAborted {
        /// Reason for abort.
        reason: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_s3_error_is_retryable() {
        let network_timeout = S3Error::Network(NetworkError::Timeout {
            duration: Duration::from_secs(30),
        });
        assert!(network_timeout.is_retryable());

        let server_error = S3Error::Server(ServerError::InternalError {
            message: None,
            request_id: None,
        });
        assert!(server_error.is_retryable());

        let access_denied = S3Error::Access(AccessError::AccessDenied {
            message: None,
            request_id: None,
        });
        assert!(!access_denied.is_retryable());

        let object_not_found = S3Error::Object(ObjectError::NotFound {
            bucket: "test".into(),
            key: "key".into(),
            request_id: None,
        });
        assert!(!object_not_found.is_retryable());
    }

    #[test]
    fn test_s3_error_status_code() {
        let access_denied = S3Error::Access(AccessError::AccessDenied {
            message: None,
            request_id: None,
        });
        assert_eq!(access_denied.status_code(), Some(403));

        let not_found = S3Error::Object(ObjectError::NotFound {
            bucket: "bucket".into(),
            key: "key".into(),
            request_id: None,
        });
        assert_eq!(not_found.status_code(), Some(404));

        let internal = S3Error::Server(ServerError::InternalError {
            message: None,
            request_id: None,
        });
        assert_eq!(internal.status_code(), Some(500));
    }

    #[test]
    fn test_bucket_error_codes() {
        assert_eq!(
            BucketError::NotFound {
                bucket: "test".into(),
                request_id: None
            }
            .code(),
            "NoSuchBucket"
        );
        assert_eq!(
            BucketError::AlreadyExists {
                bucket: "test".into(),
                request_id: None
            }
            .code(),
            "BucketAlreadyExists"
        );
    }

    #[test]
    fn test_retry_after() {
        let slow_down = S3Error::Server(ServerError::SlowDown {
            retry_after: Some(Duration::from_secs(30)),
            request_id: None,
        });
        assert_eq!(slow_down.retry_after(), Some(Duration::from_secs(30)));

        let not_found = S3Error::Object(ObjectError::NotFound {
            bucket: "bucket".into(),
            key: "key".into(),
            request_id: None,
        });
        assert!(not_found.retry_after().is_none());
    }
}
