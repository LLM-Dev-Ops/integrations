//! AWS S3 Integration Module
//!
//! Production-ready, type-safe interface for interacting with Amazon S3.
//!
//! # Features
//!
//! - **Full API Coverage**: Objects, Buckets, Multipart, Presign, Tagging
//! - **AWS Signature V4**: Complete signing implementation
//! - **Streaming**: Memory-efficient uploads and downloads
//! - **Resilience**: Retry, circuit breaker, rate limiting
//! - **Observability**: Tracing, metrics, structured logging
//! - **S3-Compatible**: Works with MinIO, LocalStack, R2, etc.
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use aws_s3::{S3Client, S3Config};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), aws_s3::S3Error> {
//!     // Create client from environment
//!     let client = aws_s3::create_client_from_env()?;
//!
//!     // Upload an object
//!     let response = client.objects().put(
//!         aws_s3::PutObjectRequest::new("my-bucket", "hello.txt")
//!             .with_body(b"Hello, S3!".to_vec())
//!     ).await?;
//!
//!     println!("Uploaded with ETag: {}", response.e_tag);
//!     Ok(())
//! }
//! ```

#![warn(missing_docs)]
#![warn(rustdoc::missing_crate_level_docs)]
#![deny(unsafe_code)]

pub mod client;
pub mod config;
pub mod credentials;
pub mod error;
pub mod mocks;
pub mod resilience;
pub mod services;
pub mod signing;
pub mod transfer;
pub mod transport;
pub mod types;
pub mod xml;

// Re-export main types at crate root
pub use client::{S3Client, S3ClientBuilder, S3ClientImpl};
pub use config::S3Config;
pub use credentials::{
    AwsCredentials, ChainCredentialsProvider, CredentialsProvider, EnvCredentialsProvider,
    ProfileCredentialsProvider, StaticCredentialsProvider,
};
pub use error::{
    AccessError, BucketError, ConfigurationError, CredentialsError, MultipartError, NetworkError,
    ObjectError, RequestError, ResponseError, S3Error, ServerError, SigningError, TransferError,
};
pub use services::{
    BucketsService, MultipartService, ObjectsService, PresignService, TaggingService,
};
pub use signing::{AwsSigner, AwsSignerV4};
pub use transport::{HttpRequest, HttpResponse, HttpTransport};
pub use types::{
    // Request types
    CopyObjectRequest,
    CreateBucketRequest,
    CreateMultipartUploadRequest,
    DeleteBucketRequest,
    DeleteObjectRequest,
    DeleteObjectsRequest,
    GetObjectRequest,
    GetObjectTaggingRequest,
    HeadBucketRequest,
    HeadObjectRequest,
    ListObjectsV2Request,
    ListPartsRequest,
    PresignDeleteRequest,
    PresignGetRequest,
    PresignPutRequest,
    PutObjectRequest,
    PutObjectTaggingRequest,
    UploadPartRequest,
    // Response types
    CompleteMultipartUploadOutput,
    CopyObjectOutput,
    CreateBucketOutput,
    CreateMultipartUploadOutput,
    DeleteObjectOutput,
    DeleteObjectsOutput,
    GetObjectOutput,
    GetObjectTaggingOutput,
    HeadBucketOutput,
    HeadObjectOutput,
    ListBucketsOutput,
    ListObjectsV2Output,
    ListPartsOutput,
    PresignedUrl,
    PutObjectOutput,
    PutObjectTaggingOutput,
    UploadPartOutput,
    // Common types
    Bucket,
    CannedAcl,
    ChecksumAlgorithm,
    Object,
    ObjectIdentifier,
    Owner,
    Part,
    S3Object,
    ServerSideEncryption,
    StorageClass,
    Tag,
};

/// Create a new S3 client from environment variables.
///
/// This will attempt to read configuration from:
/// - `AWS_REGION` / `AWS_DEFAULT_REGION` for region
/// - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for credentials
/// - `AWS_SESSION_TOKEN` for temporary credentials
/// - `AWS_ENDPOINT_URL_S3` / `AWS_ENDPOINT_URL` for custom endpoints
///
/// # Example
///
/// ```rust,no_run
/// let client = aws_s3::create_client_from_env()?;
/// # Ok::<(), aws_s3::S3Error>(())
/// ```
pub fn create_client_from_env() -> Result<impl S3Client, S3Error> {
    S3ClientBuilder::new().from_env().build()
}

/// Create a new S3 client with explicit configuration.
///
/// # Example
///
/// ```rust,no_run
/// use aws_s3::{S3Config, AwsCredentials};
///
/// let config = S3Config::builder()
///     .region("us-west-2")
///     .credentials(AwsCredentials::new("AKID", "SECRET"))
///     .build()?;
///
/// let client = aws_s3::create_client(config)?;
/// # Ok::<(), aws_s3::S3Error>(())
/// ```
pub fn create_client(config: S3Config) -> Result<impl S3Client, S3Error> {
    S3ClientBuilder::new().config(config).build()
}

/// Result type alias for S3 operations.
pub type Result<T> = std::result::Result<T, S3Error>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crate_exports() {
        // Verify all major types are exported
        let _ = std::any::type_name::<S3Error>();
        let _ = std::any::type_name::<S3Config>();
        let _ = std::any::type_name::<AwsCredentials>();
        let _ = std::any::type_name::<PutObjectRequest>();
        let _ = std::any::type_name::<GetObjectRequest>();
    }
}
