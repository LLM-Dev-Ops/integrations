//! AWS Signature V4 signing implementation.
//!
//! This module implements the AWS Signature V4 signing process for S3 requests.
//! It handles canonical request creation, string to sign generation, and
//! signature calculation.

mod canonical;
mod signer;

pub use signer::{AwsSigner, AwsSignerV4, SignedRequest};

use crate::credentials::AwsCredentials;
use crate::error::SigningError;
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

/// AWS Signature V4 algorithm identifier.
pub const AWS_ALGORITHM: &str = "AWS4-HMAC-SHA256";

/// Service name for S3.
pub const S3_SERVICE: &str = "s3";

/// Unsigned payload constant for presigned URLs.
pub const UNSIGNED_PAYLOAD: &str = "UNSIGNED-PAYLOAD";

/// Streaming payload constant.
pub const STREAMING_PAYLOAD: &str = "STREAMING-AWS4-HMAC-SHA256-PAYLOAD";

/// Calculate SHA-256 hash of data.
pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Calculate SHA-256 hash and return bytes.
pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Calculate HMAC-SHA256.
pub fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// Generate the signing key for AWS Signature V4.
///
/// kDate = HMAC("AWS4" + SecretKey, Date)
/// kRegion = HMAC(kDate, Region)
/// kService = HMAC(kRegion, Service)
/// kSigning = HMAC(kService, "aws4_request")
pub fn derive_signing_key(
    secret_key: &str,
    date_stamp: &str,
    region: &str,
    service: &str,
) -> Vec<u8> {
    let k_secret = format!("AWS4{}", secret_key);
    let k_date = hmac_sha256(k_secret.as_bytes(), date_stamp.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    hmac_sha256(&k_service, b"aws4_request")
}

/// Build the credential scope string.
///
/// Format: `{date}/{region}/{service}/aws4_request`
pub fn build_credential_scope(date_stamp: &str, region: &str, service: &str) -> String {
    format!("{}/{}/{}/aws4_request", date_stamp, region, service)
}

/// Build the credential string.
///
/// Format: `{access_key_id}/{credential_scope}`
pub fn build_credential_string(access_key_id: &str, credential_scope: &str) -> String {
    format!("{}/{}", access_key_id, credential_scope)
}

/// Format a timestamp for AWS signatures.
///
/// Returns the date-time in `YYYYMMDD'T'HHMMSS'Z'` format.
pub fn format_datetime(dt: &DateTime<Utc>) -> String {
    dt.format("%Y%m%dT%H%M%SZ").to_string()
}

/// Format a date stamp for AWS signatures.
///
/// Returns the date in `YYYYMMDD` format.
pub fn format_date_stamp(dt: &DateTime<Utc>) -> String {
    dt.format("%Y%m%d").to_string()
}

/// Check if a header should be signed.
pub fn should_sign_header(header_name: &str) -> bool {
    let name_lower = header_name.to_lowercase();

    // Always sign these headers
    if name_lower == "host" || name_lower.starts_with("x-amz-") {
        return true;
    }

    // Sign content-related headers
    if name_lower == "content-type"
        || name_lower == "content-md5"
        || name_lower == "content-length"
    {
        return true;
    }

    // Don't sign other headers by default
    false
}

/// Sign a request and return the Authorization header value.
pub fn sign_request(
    method: &str,
    uri: &str,
    query_string: &str,
    headers: &[(String, String)],
    payload_hash: &str,
    credentials: &AwsCredentials,
    region: &str,
    timestamp: &DateTime<Utc>,
) -> Result<String, SigningError> {
    let date_stamp = format_date_stamp(timestamp);
    let amz_date = format_datetime(timestamp);

    // Create canonical request
    let canonical_request = canonical::build_canonical_request(
        method,
        uri,
        query_string,
        headers,
        payload_hash,
    );

    // Calculate hash of canonical request
    let canonical_request_hash = sha256_hex(canonical_request.as_bytes());

    // Build credential scope
    let credential_scope = build_credential_scope(&date_stamp, region, S3_SERVICE);

    // Build string to sign
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}",
        AWS_ALGORITHM, amz_date, credential_scope, canonical_request_hash
    );

    // Derive signing key
    let signing_key = derive_signing_key(
        credentials.secret_access_key(),
        &date_stamp,
        region,
        S3_SERVICE,
    );

    // Calculate signature
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

    // Build signed headers string
    let signed_headers = canonical::build_signed_headers(headers);

    // Build Authorization header
    let authorization = format!(
        "{} Credential={}, SignedHeaders={}, Signature={}",
        AWS_ALGORITHM,
        build_credential_string(credentials.access_key_id(), &credential_scope),
        signed_headers,
        signature
    );

    Ok(authorization)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_hex() {
        let hash = sha256_hex(b"");
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );

        let hash = sha256_hex(b"test");
        assert_eq!(
            hash,
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        );
    }

    #[test]
    fn test_hmac_sha256() {
        let result = hmac_sha256(b"key", b"message");
        assert_eq!(result.len(), 32);
    }

    #[test]
    fn test_derive_signing_key() {
        let key = derive_signing_key("secret", "20231215", "us-east-1", "s3");
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn test_build_credential_scope() {
        let scope = build_credential_scope("20231215", "us-east-1", "s3");
        assert_eq!(scope, "20231215/us-east-1/s3/aws4_request");
    }

    #[test]
    fn test_format_datetime() {
        use chrono::TimeZone;
        let dt = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();
        assert_eq!(format_datetime(&dt), "20231215T103045Z");
    }

    #[test]
    fn test_format_date_stamp() {
        use chrono::TimeZone;
        let dt = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();
        assert_eq!(format_date_stamp(&dt), "20231215");
    }

    #[test]
    fn test_should_sign_header() {
        assert!(should_sign_header("Host"));
        assert!(should_sign_header("host"));
        assert!(should_sign_header("x-amz-date"));
        assert!(should_sign_header("X-Amz-Content-Sha256"));
        assert!(should_sign_header("Content-Type"));
        assert!(should_sign_header("Content-MD5"));
        assert!(!should_sign_header("User-Agent"));
        assert!(!should_sign_header("Accept"));
    }
}
