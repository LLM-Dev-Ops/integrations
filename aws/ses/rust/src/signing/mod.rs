//! AWS Signature Version 4 signing for SES.
//!
//! This module provides a complete implementation of AWS Signature Version 4,
//! which is required to authenticate requests to AWS Simple Email Service (SES) v2 API.
//!
//! # Overview
//!
//! AWS Signature V4 is a cryptographic signing protocol used to authenticate
//! requests to AWS services. The signing process involves:
//!
//! 1. Creating a canonical request - A standardized representation of the HTTP request
//! 2. Creating a string to sign - A combination of the algorithm, timestamp, scope, and canonical request hash
//! 3. Calculating a signing key - Derived from AWS credentials using HMAC-SHA256
//! 4. Calculating the signature - HMAC-SHA256 of the string to sign with the signing key
//! 5. Adding the Authorization header - Contains the signature and metadata
//!
//! # Components
//!
//! - **canonical** - Functions for creating canonical requests, URIs, query strings, and headers
//! - **v4** - Core AWS Signature V4 implementation with signing functions
//! - **cache** - Thread-safe cache for derived signing keys to improve performance
//! - **error** - Error types for signing operations
//!
//! # Quick Start
//!
//! ```no_run
//! use integrations_aws_ses::signing::{sign_request, SigningParams};
//! use http::HeaderMap;
//! use chrono::Utc;
//!
//! // Create signing parameters
//! let params = SigningParams::new("us-east-1", "ses")
//!     .with_access_key("AKIAIOSFODNN7EXAMPLE")
//!     .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
//!
//! // Prepare request headers
//! let mut headers = HeaderMap::new();
//! headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());
//! headers.insert("content-type", "application/json".parse().unwrap());
//!
//! // Sign the request
//! sign_request(
//!     "POST",
//!     "/v2/email/outbound-emails",
//!     &[],
//!     &mut headers,
//!     Some(b"{\"Content\":{\"Simple\":{\"Subject\":{\"Data\":\"Test\"}}}}"),
//!     &params,
//!     &Utc::now(),
//!     None,
//! ).unwrap();
//!
//! // Now the request has an Authorization header and can be sent to AWS
//! assert!(headers.contains_key("authorization"));
//! ```
//!
//! # Using the Signing Key Cache
//!
//! For better performance, use the signing key cache to avoid re-deriving
//! keys for every request:
//!
//! ```no_run
//! use integrations_aws_ses::signing::{sign_request, SigningParams, SigningKeyCache};
//! use http::HeaderMap;
//! use chrono::Utc;
//! use std::sync::Arc;
//!
//! // Create a cache (should be reused across requests)
//! let cache = Arc::new(SigningKeyCache::new());
//!
//! let params = SigningParams::new("us-east-1", "ses")
//!     .with_access_key("AKIAIOSFODNN7EXAMPLE")
//!     .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
//!
//! let mut headers = HeaderMap::new();
//! headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());
//!
//! // First request derives and caches the signing key
//! sign_request(
//!     "GET",
//!     "/v2/email/configuration-sets",
//!     &[],
//!     &mut headers,
//!     None,
//!     &params,
//!     &Utc::now(),
//!     Some(cache.clone()),
//! ).unwrap();
//!
//! // Subsequent requests reuse the cached key (much faster!)
//! let mut headers2 = HeaderMap::new();
//! headers2.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());
//! sign_request(
//!     "GET",
//!     "/v2/email/configuration-sets",
//!     &[],
//!     &mut headers2,
//!     None,
//!     &params,
//!     &Utc::now(),
//!     Some(cache),
//! ).unwrap();
//! ```
//!
//! # Working with Canonical Requests
//!
//! You can also use the lower-level canonical request functions:
//!
//! ```
//! use integrations_aws_ses::signing::{
//!     uri_encode, normalize_uri_path, canonical_query_string, canonical_headers
//! };
//! use http::HeaderMap;
//!
//! // Encode URI paths
//! let encoded = uri_encode("/my path/file.txt", false);
//! assert_eq!(encoded, "/my%20path/file.txt");
//!
//! // Normalize paths
//! let normalized = normalize_uri_path("/foo//bar/../baz");
//! assert_eq!(normalized, "/baz");
//!
//! // Build canonical query strings
//! let params = vec![
//!     ("Action".to_string(), "SendEmail".to_string()),
//!     ("Version".to_string(), "2010-12-01".to_string()),
//! ];
//! let query = canonical_query_string(&params);
//! assert_eq!(query, "Action=SendEmail&Version=2010-12-01");
//!
//! // Build canonical headers
//! let mut headers = HeaderMap::new();
//! headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());
//! headers.insert("x-amz-date", "20231215T103045Z".parse().unwrap());
//! let (canonical, signed) = canonical_headers(&headers);
//! ```
//!
//! # Security Considerations
//!
//! - Never log or expose AWS credentials (access key ID, secret access key, or session token)
//! - Use temporary credentials (with session tokens) when possible
//! - Rotate credentials regularly
//! - Use the signing key cache to improve performance without compromising security
//! - Ensure timestamps are accurate (AWS rejects requests with timestamps more than 15 minutes off)
//!
//! # References
//!
//! - [AWS Signature Version 4 Signing Process](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html)
//! - [AWS SES v2 API Reference](https://docs.aws.amazon.com/ses/latest/APIReference-V2/Welcome.html)

mod cache;
mod canonical;
mod error;
mod v4;

// Re-export the public API
pub use cache::SigningKeyCache;
pub use canonical::{
    canonical_headers, canonical_query_string, normalize_uri_path, should_sign_header, uri_encode,
};
pub use error::SigningError;
pub use v4::{
    build_credential_scope, derive_signing_key, format_date_stamp, format_datetime, sha256_hex,
    sign_request, SigningParams, AWS_ALGORITHM, SES_SERVICE, UNSIGNED_PAYLOAD,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exports() {
        // Test that all public items are accessible
        let cache = SigningKeyCache::new();
        assert!(cache.is_empty());

        let encoded = uri_encode("test", false);
        assert_eq!(encoded, "test");

        let normalized = normalize_uri_path("/test");
        assert_eq!(normalized, "/test");

        let query = canonical_query_string(&[]);
        assert_eq!(query, "");

        assert_eq!(SES_SERVICE, "ses");
        assert_eq!(AWS_ALGORITHM, "AWS4-HMAC-SHA256");
        assert_eq!(UNSIGNED_PAYLOAD, "UNSIGNED-PAYLOAD");
    }

    #[test]
    fn test_signing_params_construction() {
        let params = SigningParams::new("us-east-1", "ses")
            .with_access_key("AKID")
            .with_secret_key("SECRET");

        assert_eq!(params.region, "us-east-1");
        assert_eq!(params.service, "ses");
        assert_eq!(params.access_key_id, "AKID");
        assert_eq!(params.secret_access_key, "SECRET");
    }

    #[test]
    fn test_error_types() {
        let error = SigningError::MissingHeader {
            header: "host".to_string(),
        };
        assert!(error.to_string().contains("host"));

        let error = SigningError::InvalidUrl {
            message: "test".to_string(),
        };
        assert!(error.to_string().contains("test"));

        let error = SigningError::SigningFailed {
            message: "test".to_string(),
        };
        assert!(error.to_string().contains("test"));
    }

    #[test]
    fn test_hash_functions() {
        let hash = sha256_hex(b"test");
        assert_eq!(hash.len(), 64); // SHA-256 produces 64 hex chars

        // Empty string hash
        let empty_hash = sha256_hex(b"");
        assert_eq!(
            empty_hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_signing_key_derivation() {
        let key = derive_signing_key("secret", "20231215", "us-east-1", "ses");
        assert_eq!(key.len(), 32); // HMAC-SHA256 produces 32 bytes

        // Same inputs produce same key
        let key2 = derive_signing_key("secret", "20231215", "us-east-1", "ses");
        assert_eq!(key, key2);

        // Different inputs produce different keys
        let key3 = derive_signing_key("secret", "20231216", "us-east-1", "ses");
        assert_ne!(key, key3);
    }

    #[test]
    fn test_timestamp_formatting() {
        use chrono::{TimeZone, Utc};

        let dt = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();

        let datetime = format_datetime(&dt);
        assert_eq!(datetime, "20231215T103045Z");

        let date_stamp = format_date_stamp(&dt);
        assert_eq!(date_stamp, "20231215");
    }

    #[test]
    fn test_credential_scope() {
        let scope = build_credential_scope("20231215", "us-east-1", "ses");
        assert_eq!(scope, "20231215/us-east-1/ses/aws4_request");
    }

    #[test]
    fn test_should_sign_header() {
        // Should sign
        assert!(should_sign_header("host"));
        assert!(should_sign_header("Host"));
        assert!(should_sign_header("x-amz-date"));
        assert!(should_sign_header("X-Amz-Date"));
        assert!(should_sign_header("x-amz-content-sha256"));
        assert!(should_sign_header("content-type"));
        assert!(should_sign_header("Content-Type"));

        // Should not sign
        assert!(!should_sign_header("user-agent"));
        assert!(!should_sign_header("User-Agent"));
        assert!(!should_sign_header("accept"));
        assert!(!should_sign_header("connection"));
    }

    #[test]
    fn test_uri_encoding() {
        // Path encoding (preserves slashes)
        assert_eq!(uri_encode("/path/to/file", false), "/path/to/file");
        assert_eq!(uri_encode("/path with spaces", false), "/path%20with%20spaces");

        // Query encoding (encodes slashes)
        assert_eq!(uri_encode("value/with/slash", true), "value%2Fwith%2Fslash");
        assert_eq!(uri_encode("key=value", true), "key%3Dvalue");
    }

    #[test]
    fn test_path_normalization() {
        assert_eq!(normalize_uri_path(""), "/");
        assert_eq!(normalize_uri_path("/"), "/");
        assert_eq!(normalize_uri_path("//"), "/");
        assert_eq!(normalize_uri_path("/foo//bar"), "/foo/bar");
        assert_eq!(normalize_uri_path("/foo/./bar"), "/foo/bar");
        assert_eq!(normalize_uri_path("/foo/../bar"), "/bar");
        assert_eq!(normalize_uri_path("foo/bar"), "/foo/bar");
    }

    #[test]
    fn test_query_string_building() {
        // Empty
        assert_eq!(canonical_query_string(&[]), "");

        // Single parameter
        let params = vec![("key".to_string(), "value".to_string())];
        assert_eq!(canonical_query_string(&params), "key=value");

        // Multiple parameters (sorted)
        let params = vec![
            ("z".to_string(), "last".to_string()),
            ("a".to_string(), "first".to_string()),
        ];
        assert_eq!(canonical_query_string(&params), "a=first&z=last");

        // Special characters
        let params = vec![("key".to_string(), "value with spaces".to_string())];
        assert_eq!(
            canonical_query_string(&params),
            "key=value%20with%20spaces"
        );
    }

    #[test]
    fn test_canonical_headers_building() {
        use http::HeaderMap;

        let mut headers = HeaderMap::new();
        headers.insert("Host", "example.com".parse().unwrap());
        headers.insert("X-Amz-Date", "20231215T103045Z".parse().unwrap());
        headers.insert("User-Agent", "test".parse().unwrap()); // Should be filtered

        let (canonical, signed) = canonical_headers(&headers);

        // Should contain signed headers
        assert!(canonical.contains("host:example.com\n"));
        assert!(canonical.contains("x-amz-date:20231215T103045Z\n"));

        // Should not contain unsigned headers
        assert!(!canonical.contains("user-agent"));

        // Signed headers should be sorted
        assert_eq!(signed, "host;x-amz-date");
    }

    #[test]
    fn test_full_signing_flow() {
        use chrono::{TimeZone, Utc};
        use http::HeaderMap;

        let mut headers = HeaderMap::new();
        headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());

        let params = SigningParams::new("us-east-1", "ses")
            .with_access_key("AKIAIOSFODNN7EXAMPLE")
            .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

        let timestamp = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();

        let result = sign_request(
            "GET",
            "/v2/email/configuration-sets",
            &[],
            &mut headers,
            None,
            &params,
            &timestamp,
            None,
        );

        assert!(result.is_ok());

        // Verify required headers were added
        assert!(headers.contains_key("authorization"));
        assert!(headers.contains_key("x-amz-date"));
        assert!(headers.contains_key("x-amz-content-sha256"));

        // Verify Authorization header format
        let auth = headers.get("authorization").unwrap().to_str().unwrap();
        assert!(auth.starts_with("AWS4-HMAC-SHA256"));
        assert!(auth.contains("Credential="));
        assert!(auth.contains("SignedHeaders="));
        assert!(auth.contains("Signature="));
    }

    #[test]
    fn test_signing_with_cache() {
        use chrono::Utc;
        use http::HeaderMap;
        use std::sync::Arc;

        let cache = Arc::new(SigningKeyCache::new());

        let mut headers = HeaderMap::new();
        headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());

        let params = SigningParams::new("us-east-1", "ses")
            .with_access_key("AKIAIOSFODNN7EXAMPLE")
            .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

        let timestamp = Utc::now();

        // First request should populate cache
        let result = sign_request(
            "GET",
            "/v2/email/configuration-sets",
            &[],
            &mut headers,
            None,
            &params,
            &timestamp,
            Some(cache.clone()),
        );

        assert!(result.is_ok());
        assert_eq!(cache.len(), 1);

        // Second request should use cached key
        let mut headers2 = HeaderMap::new();
        headers2.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());

        let result = sign_request(
            "GET",
            "/v2/email/templates",
            &[],
            &mut headers2,
            None,
            &params,
            &timestamp,
            Some(cache.clone()),
        );

        assert!(result.is_ok());
        assert_eq!(cache.len(), 1); // Still only one cached key
    }

    #[test]
    fn test_constants() {
        assert_eq!(SES_SERVICE, "ses");
        assert_eq!(AWS_ALGORITHM, "AWS4-HMAC-SHA256");
        assert_eq!(UNSIGNED_PAYLOAD, "UNSIGNED-PAYLOAD");
    }
}
