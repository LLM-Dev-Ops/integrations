//! Error code mapping from S3 responses to typed errors.

use super::*;

/// Parsed S3 error response.
#[derive(Debug, Clone)]
pub struct S3ErrorResponse {
    /// S3 error code (e.g., "NoSuchKey").
    pub code: String,
    /// Human-readable error message.
    pub message: String,
    /// Affected bucket, if any.
    pub bucket: Option<String>,
    /// Affected key, if any.
    pub key: Option<String>,
    /// AWS request ID.
    pub request_id: Option<String>,
    /// Extended request ID.
    pub host_id: Option<String>,
}

/// Map an S3 error code to a typed error.
///
/// # Arguments
///
/// * `code` - The S3 error code (e.g., "NoSuchKey")
/// * `response` - Optional full error response for additional context
///
/// # Returns
///
/// The appropriate `S3Error` variant for the error code.
pub fn map_s3_error_code(code: &str, response: Option<S3ErrorResponse>) -> S3Error {
    let resp = response.unwrap_or(S3ErrorResponse {
        code: code.to_string(),
        message: String::new(),
        bucket: None,
        key: None,
        request_id: None,
        host_id: None,
    });

    match code {
        // Bucket errors
        "NoSuchBucket" => S3Error::Bucket(BucketError::NotFound {
            bucket: resp.bucket.unwrap_or_default(),
            request_id: resp.request_id,
        }),
        "BucketAlreadyExists" => S3Error::Bucket(BucketError::AlreadyExists {
            bucket: resp.bucket.unwrap_or_default(),
            request_id: resp.request_id,
        }),
        "BucketAlreadyOwnedByYou" => S3Error::Bucket(BucketError::AlreadyOwnedByYou {
            bucket: resp.bucket.unwrap_or_default(),
            request_id: resp.request_id,
        }),
        "BucketNotEmpty" => S3Error::Bucket(BucketError::NotEmpty {
            bucket: resp.bucket.unwrap_or_default(),
            request_id: resp.request_id,
        }),
        "TooManyBuckets" => S3Error::Bucket(BucketError::TooManyBuckets {
            request_id: resp.request_id,
        }),

        // Object errors
        "NoSuchKey" => S3Error::Object(ObjectError::NotFound {
            bucket: resp.bucket.unwrap_or_default(),
            key: resp.key.unwrap_or_default(),
            request_id: resp.request_id,
        }),
        "PreconditionFailed" => S3Error::Object(ObjectError::PreconditionFailed {
            bucket: resp.bucket.unwrap_or_default(),
            key: resp.key.unwrap_or_default(),
            condition: resp.message,
            request_id: resp.request_id,
        }),
        "NotModified" => S3Error::Object(ObjectError::NotModified {
            bucket: resp.bucket.unwrap_or_default(),
            key: resp.key.unwrap_or_default(),
            request_id: resp.request_id,
        }),
        "InvalidObjectState" => S3Error::Object(ObjectError::InvalidState {
            bucket: resp.bucket.unwrap_or_default(),
            key: resp.key.unwrap_or_default(),
            message: resp.message,
            request_id: resp.request_id,
        }),

        // Multipart errors
        "NoSuchUpload" => S3Error::Multipart(MultipartError::UploadNotFound {
            bucket: resp.bucket.unwrap_or_default(),
            key: resp.key.unwrap_or_default(),
            upload_id: String::new(),
            request_id: resp.request_id,
        }),
        "InvalidPart" => S3Error::Multipart(MultipartError::InvalidPart {
            part_number: 0,
            reason: resp.message,
            request_id: resp.request_id,
        }),
        "InvalidPartOrder" => S3Error::Multipart(MultipartError::InvalidPartOrder {
            request_id: resp.request_id,
        }),
        "TooManyParts" => S3Error::Multipart(MultipartError::TooManyParts {
            request_id: resp.request_id,
        }),

        // Access errors
        "AccessDenied" => S3Error::Access(AccessError::AccessDenied {
            message: if resp.message.is_empty() {
                None
            } else {
                Some(resp.message)
            },
            request_id: resp.request_id,
        }),
        "InvalidAccessKeyId" => S3Error::Access(AccessError::InvalidAccessKeyId {
            request_id: resp.request_id,
        }),
        "SignatureDoesNotMatch" => S3Error::Access(AccessError::SignatureDoesNotMatch {
            request_id: resp.request_id,
        }),
        "ExpiredToken" => S3Error::Access(AccessError::ExpiredToken {
            request_id: resp.request_id,
        }),
        "AccountProblem" => S3Error::Access(AccessError::AccountProblem {
            message: resp.message,
            request_id: resp.request_id,
        }),

        // Server errors
        "InternalError" => S3Error::Server(ServerError::InternalError {
            message: if resp.message.is_empty() {
                None
            } else {
                Some(resp.message)
            },
            request_id: resp.request_id,
        }),
        "ServiceUnavailable" => S3Error::Server(ServerError::ServiceUnavailable {
            retry_after: None,
            request_id: resp.request_id,
        }),
        "SlowDown" => S3Error::Server(ServerError::SlowDown {
            retry_after: None,
            request_id: resp.request_id,
        }),

        // Request errors
        "InvalidBucketName" => S3Error::Request(RequestError::InvalidBucketName {
            bucket: resp.bucket.unwrap_or_default(),
            reason: resp.message,
        }),
        "InvalidRequest" | "MalformedXML" => S3Error::Request(RequestError::Validation {
            message: resp.message,
        }),
        "EntityTooLarge" => S3Error::Request(RequestError::EntityTooLarge {
            size: 0,
            max_size: 5 * 1024 * 1024 * 1024, // 5GB
        }),
        "EntityTooSmall" => S3Error::Request(RequestError::EntityTooSmall {
            size: 0,
            min_size: 5 * 1024 * 1024, // 5MB for parts
        }),

        // Unknown error - map to server error with the code as message
        _ => S3Error::Server(ServerError::InternalError {
            message: Some(format!("Unknown S3 error code: {} - {}", code, resp.message)),
            request_id: resp.request_id,
        }),
    }
}

/// Map an HTTP status code to an error when no S3 error code is available.
pub fn map_http_status(status: u16, request_id: Option<String>) -> S3Error {
    match status {
        301 | 307 => S3Error::Configuration(ConfigurationError::WrongRegion {
            correct_region: "unknown".to_string(),
            configured_region: "unknown".to_string(),
        }),
        400 => S3Error::Request(RequestError::Validation {
            message: "Bad request".to_string(),
        }),
        403 => S3Error::Access(AccessError::AccessDenied {
            message: None,
            request_id,
        }),
        404 => S3Error::Object(ObjectError::NotFound {
            bucket: String::new(),
            key: String::new(),
            request_id,
        }),
        409 => S3Error::Bucket(BucketError::AlreadyExists {
            bucket: String::new(),
            request_id,
        }),
        412 => S3Error::Object(ObjectError::PreconditionFailed {
            bucket: String::new(),
            key: String::new(),
            condition: "Precondition failed".to_string(),
            request_id,
        }),
        500 => S3Error::Server(ServerError::InternalError {
            message: None,
            request_id,
        }),
        502 => S3Error::Server(ServerError::BadGateway { request_id }),
        503 => S3Error::Server(ServerError::ServiceUnavailable {
            retry_after: None,
            request_id,
        }),
        _ => S3Error::Server(ServerError::InternalError {
            message: Some(format!("HTTP status {}", status)),
            request_id,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_no_such_bucket() {
        let error = map_s3_error_code(
            "NoSuchBucket",
            Some(S3ErrorResponse {
                code: "NoSuchBucket".into(),
                message: "The specified bucket does not exist".into(),
                bucket: Some("my-bucket".into()),
                key: None,
                request_id: Some("ABC123".into()),
                host_id: None,
            }),
        );

        match error {
            S3Error::Bucket(BucketError::NotFound { bucket, request_id }) => {
                assert_eq!(bucket, "my-bucket");
                assert_eq!(request_id, Some("ABC123".to_string()));
            }
            _ => panic!("Expected BucketError::NotFound"),
        }
    }

    #[test]
    fn test_map_no_such_key() {
        let error = map_s3_error_code(
            "NoSuchKey",
            Some(S3ErrorResponse {
                code: "NoSuchKey".into(),
                message: "The specified key does not exist".into(),
                bucket: Some("my-bucket".into()),
                key: Some("my-key".into()),
                request_id: Some("DEF456".into()),
                host_id: None,
            }),
        );

        match error {
            S3Error::Object(ObjectError::NotFound {
                bucket,
                key,
                request_id,
            }) => {
                assert_eq!(bucket, "my-bucket");
                assert_eq!(key, "my-key");
                assert_eq!(request_id, Some("DEF456".to_string()));
            }
            _ => panic!("Expected ObjectError::NotFound"),
        }
    }

    #[test]
    fn test_map_access_denied() {
        let error = map_s3_error_code("AccessDenied", None);

        match error {
            S3Error::Access(AccessError::AccessDenied { .. }) => {}
            _ => panic!("Expected AccessError::AccessDenied"),
        }
    }

    #[test]
    fn test_map_slow_down() {
        let error = map_s3_error_code("SlowDown", None);

        match error {
            S3Error::Server(ServerError::SlowDown { .. }) => {}
            _ => panic!("Expected ServerError::SlowDown"),
        }

        assert!(error.is_retryable());
    }

    #[test]
    fn test_map_unknown_code() {
        let error = map_s3_error_code("SomeUnknownError", None);

        match error {
            S3Error::Server(ServerError::InternalError { message, .. }) => {
                assert!(message.is_some());
                assert!(message.unwrap().contains("SomeUnknownError"));
            }
            _ => panic!("Expected ServerError::InternalError"),
        }
    }

    #[test]
    fn test_map_http_status() {
        assert!(matches!(
            map_http_status(403, None),
            S3Error::Access(AccessError::AccessDenied { .. })
        ));

        assert!(matches!(
            map_http_status(404, None),
            S3Error::Object(ObjectError::NotFound { .. })
        ));

        assert!(matches!(
            map_http_status(500, None),
            S3Error::Server(ServerError::InternalError { .. })
        ));

        assert!(matches!(
            map_http_status(503, None),
            S3Error::Server(ServerError::ServiceUnavailable { .. })
        ));
    }
}
