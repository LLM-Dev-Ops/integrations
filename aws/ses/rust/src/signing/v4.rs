//! AWS Signature Version 4 implementation for SES.
//!
//! This module implements the AWS Signature Version 4 signing process,
//! which is used to authenticate requests to AWS services like SES.
//!
//! The signing process involves:
//! 1. Creating a canonical request from the HTTP request
//! 2. Creating a string to sign from the canonical request
//! 3. Deriving a signing key from AWS credentials
//! 4. Calculating the signature
//! 5. Adding the Authorization header to the request
//!
//! Reference: https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html

use super::cache::SigningKeyCache;
use super::canonical::{canonical_headers, canonical_query_string, normalize_uri_path, uri_encode};
use super::error::SigningError;
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use http::HeaderMap;
use sha2::{Digest, Sha256};
use std::sync::Arc;

type HmacSha256 = Hmac<Sha256>;

/// AWS Signature V4 algorithm identifier.
pub const AWS_ALGORITHM: &str = "AWS4-HMAC-SHA256";

/// Service name for SES v2 API.
pub const SES_SERVICE: &str = "ses";

/// Unsigned payload constant for requests without body.
pub const UNSIGNED_PAYLOAD: &str = "UNSIGNED-PAYLOAD";

/// Parameters for AWS Signature V4 signing.
///
/// This struct contains all the information needed to sign a request
/// with AWS Signature V4.
///
/// # Examples
///
/// ```no_run
/// use integrations_aws_ses::signing::SigningParams;
///
/// let params = SigningParams::new("us-east-1", "ses")
///     .with_access_key("AKIAIOSFODNN7EXAMPLE")
///     .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
/// ```
#[derive(Clone, Debug)]
pub struct SigningParams {
    /// AWS region (e.g., "us-east-1").
    pub region: String,
    /// AWS service name (e.g., "ses").
    pub service: String,
    /// AWS access key ID.
    pub access_key_id: String,
    /// AWS secret access key.
    pub secret_access_key: String,
    /// Optional session token for temporary credentials.
    pub session_token: Option<String>,
}

impl SigningParams {
    /// Create new signing parameters.
    ///
    /// # Arguments
    ///
    /// * `region` - AWS region (e.g., "us-east-1")
    /// * `service` - AWS service name (e.g., "ses")
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_aws_ses::signing::SigningParams;
    ///
    /// let params = SigningParams::new("us-east-1", "ses");
    /// ```
    pub fn new(region: impl Into<String>, service: impl Into<String>) -> Self {
        Self {
            region: region.into(),
            service: service.into(),
            access_key_id: String::new(),
            secret_access_key: String::new(),
            session_token: None,
        }
    }

    /// Set the access key ID.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_aws_ses::signing::SigningParams;
    ///
    /// let params = SigningParams::new("us-east-1", "ses")
    ///     .with_access_key("AKIAIOSFODNN7EXAMPLE");
    /// ```
    pub fn with_access_key(mut self, access_key_id: impl Into<String>) -> Self {
        self.access_key_id = access_key_id.into();
        self
    }

    /// Set the secret access key.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_aws_ses::signing::SigningParams;
    ///
    /// let params = SigningParams::new("us-east-1", "ses")
    ///     .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    /// ```
    pub fn with_secret_key(mut self, secret_access_key: impl Into<String>) -> Self {
        self.secret_access_key = secret_access_key.into();
        self
    }

    /// Set the session token for temporary credentials.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_aws_ses::signing::SigningParams;
    ///
    /// let params = SigningParams::new("us-east-1", "ses")
    ///     .with_session_token("AQoDYXdzEJr...");
    /// ```
    pub fn with_session_token(mut self, session_token: impl Into<String>) -> Self {
        self.session_token = Some(session_token.into());
        self
    }
}

/// Calculate SHA-256 hash of data and return as hex string.
///
/// # Arguments
///
/// * `data` - The data to hash
///
/// # Examples
///
/// ```
/// use integrations_aws_ses::signing::sha256_hex;
///
/// let hash = sha256_hex(b"hello world");
/// assert_eq!(hash.len(), 64); // SHA-256 produces 64 hex characters
/// ```
pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Calculate HMAC-SHA256.
///
/// # Arguments
///
/// * `key` - The HMAC key
/// * `data` - The data to authenticate
///
/// # Returns
///
/// The HMAC-SHA256 output as a byte vector
fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// Derive the signing key for AWS Signature V4.
///
/// The signing key is derived through a series of HMAC operations:
/// 1. kDate = HMAC("AWS4" + SecretKey, Date)
/// 2. kRegion = HMAC(kDate, Region)
/// 3. kService = HMAC(kRegion, Service)
/// 4. kSigning = HMAC(kService, "aws4_request")
///
/// # Arguments
///
/// * `secret_key` - AWS secret access key
/// * `date_stamp` - Date in YYYYMMDD format
/// * `region` - AWS region
/// * `service` - AWS service name
///
/// # Returns
///
/// The derived signing key
///
/// # Examples
///
/// ```
/// use integrations_aws_ses::signing::derive_signing_key;
///
/// let key = derive_signing_key(
///     "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
///     "20231215",
///     "us-east-1",
///     "ses"
/// );
/// assert_eq!(key.len(), 32); // HMAC-SHA256 produces 32 bytes
/// ```
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

/// Format a timestamp for AWS signatures.
///
/// Returns the date-time in `YYYYMMDD'T'HHMMSS'Z'` format.
///
/// # Examples
///
/// ```
/// use integrations_aws_ses::signing::format_datetime;
/// use chrono::{TimeZone, Utc};
///
/// let dt = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();
/// assert_eq!(format_datetime(&dt), "20231215T103045Z");
/// ```
pub fn format_datetime(dt: &DateTime<Utc>) -> String {
    dt.format("%Y%m%dT%H%M%SZ").to_string()
}

/// Format a date stamp for AWS signatures.
///
/// Returns the date in `YYYYMMDD` format.
///
/// # Examples
///
/// ```
/// use integrations_aws_ses::signing::format_date_stamp;
/// use chrono::{TimeZone, Utc};
///
/// let dt = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();
/// assert_eq!(format_date_stamp(&dt), "20231215");
/// ```
pub fn format_date_stamp(dt: &DateTime<Utc>) -> String {
    dt.format("%Y%m%d").to_string()
}

/// Build the credential scope string.
///
/// Format: `{date}/{region}/{service}/aws4_request`
///
/// # Examples
///
/// ```
/// use integrations_aws_ses::signing::build_credential_scope;
///
/// let scope = build_credential_scope("20231215", "us-east-1", "ses");
/// assert_eq!(scope, "20231215/us-east-1/ses/aws4_request");
/// ```
pub fn build_credential_scope(date_stamp: &str, region: &str, service: &str) -> String {
    format!("{}/{}/{}/aws4_request", date_stamp, region, service)
}

/// Build a canonical request from HTTP request components.
///
/// The canonical request is a standardized representation of the HTTP request
/// used in the signing process.
///
/// Format:
/// ```text
/// HTTPMethod\n
/// CanonicalURI\n
/// CanonicalQueryString\n
/// CanonicalHeaders\n
/// SignedHeaders\n
/// HashedPayload
/// ```
///
/// # Arguments
///
/// * `method` - HTTP method (GET, POST, etc.)
/// * `uri` - Request URI path
/// * `query_params` - Query string parameters as (name, value) pairs
/// * `headers` - HTTP headers
/// * `payload_hash` - SHA-256 hash of the request payload
///
/// # Returns
///
/// A tuple of (canonical_request, signed_headers)
fn build_canonical_request(
    method: &str,
    uri: &str,
    query_params: &[(String, String)],
    headers: &HeaderMap,
    payload_hash: &str,
) -> (String, String) {
    // Normalize and encode the URI path
    let canonical_uri = uri_encode(&normalize_uri_path(uri), false);

    // Build canonical query string
    let canonical_query = canonical_query_string(query_params);

    // Build canonical headers and signed headers
    let (canonical_headers_str, signed_headers) = canonical_headers(headers);

    // Build the canonical request
    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.to_uppercase(),
        canonical_uri,
        canonical_query,
        canonical_headers_str,
        signed_headers,
        payload_hash
    );

    (canonical_request, signed_headers)
}

/// Create the string to sign.
///
/// Format:
/// ```text
/// AWS4-HMAC-SHA256\n
/// timestamp\n
/// credential_scope\n
/// hashed_canonical_request
/// ```
///
/// # Arguments
///
/// * `timestamp` - Request timestamp
/// * `credential_scope` - Credential scope string
/// * `canonical_request_hash` - SHA-256 hash of the canonical request
fn build_string_to_sign(
    timestamp: &DateTime<Utc>,
    credential_scope: &str,
    canonical_request_hash: &str,
) -> String {
    format!(
        "{}\n{}\n{}\n{}",
        AWS_ALGORITHM,
        format_datetime(timestamp),
        credential_scope,
        canonical_request_hash
    )
}

/// Sign an HTTP request using AWS Signature V4.
///
/// This function adds the `Authorization` header to the request with the
/// calculated signature. It also adds required headers like `x-amz-date`
/// and `x-amz-content-sha256`.
///
/// # Arguments
///
/// * `method` - HTTP method (GET, POST, PUT, DELETE, etc.)
/// * `uri` - Request URI path
/// * `query_params` - Query string parameters
/// * `headers` - HTTP headers (will be modified to add signing headers)
/// * `payload` - Request body (optional)
/// * `params` - Signing parameters (credentials, region, service)
/// * `timestamp` - Request timestamp
/// * `cache` - Optional signing key cache for performance
///
/// # Returns
///
/// Returns `Ok(())` on success, adding the Authorization header to `headers`.
/// Returns `Err(SigningError)` on failure.
///
/// # Examples
///
/// ```no_run
/// use integrations_aws_ses::signing::{sign_request, SigningParams};
/// use http::HeaderMap;
/// use chrono::Utc;
///
/// let mut headers = HeaderMap::new();
/// headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());
///
/// let params = SigningParams::new("us-east-1", "ses")
///     .with_access_key("AKIAIOSFODNN7EXAMPLE")
///     .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
///
/// sign_request(
///     "POST",
///     "/v2/email/outbound-emails",
///     &[],
///     &mut headers,
///     Some(b"{\"Content\":{\"Simple\":{\"Subject\":{\"Data\":\"Test\"}}}"),
///     &params,
///     &Utc::now(),
///     None,
/// ).unwrap();
///
/// assert!(headers.contains_key("authorization"));
/// ```
pub fn sign_request(
    method: &str,
    uri: &str,
    query_params: &[(String, String)],
    headers: &mut HeaderMap,
    payload: Option<&[u8]>,
    params: &SigningParams,
    timestamp: &DateTime<Utc>,
    cache: Option<Arc<SigningKeyCache>>,
) -> Result<(), SigningError> {
    // Validate required parameters
    if params.access_key_id.is_empty() {
        return Err(SigningError::SigningFailed {
            message: "Access key ID is required".to_string(),
        });
    }
    if params.secret_access_key.is_empty() {
        return Err(SigningError::SigningFailed {
            message: "Secret access key is required".to_string(),
        });
    }

    // Format timestamp strings
    let date_stamp = format_date_stamp(timestamp);
    let amz_date = format_datetime(timestamp);

    // Calculate payload hash
    let payload_hash = match payload {
        Some(data) => sha256_hex(data),
        None => sha256_hex(b""),
    };

    // Add required headers
    headers.insert("x-amz-date", amz_date.parse().map_err(|_| {
        SigningError::SigningFailed {
            message: "Failed to parse x-amz-date header".to_string(),
        }
    })?);

    headers.insert(
        "x-amz-content-sha256",
        payload_hash.parse().map_err(|_| SigningError::SigningFailed {
            message: "Failed to parse x-amz-content-sha256 header".to_string(),
        })?,
    );

    // Add session token if present
    if let Some(ref token) = params.session_token {
        headers.insert("x-amz-security-token", token.parse().map_err(|_| {
            SigningError::SigningFailed {
                message: "Failed to parse x-amz-security-token header".to_string(),
            }
        })?);
    }

    // Build canonical request
    let (canonical_request, signed_headers) =
        build_canonical_request(method, uri, query_params, headers, &payload_hash);

    // Calculate hash of canonical request
    let canonical_request_hash = sha256_hex(canonical_request.as_bytes());

    // Build credential scope
    let credential_scope = build_credential_scope(&date_stamp, &params.region, &params.service);

    // Build string to sign
    let string_to_sign = build_string_to_sign(timestamp, &credential_scope, &canonical_request_hash);

    // Derive or retrieve signing key
    let signing_key = if let Some(ref key_cache) = cache {
        // Try to get from cache
        key_cache
            .get(
                &params.access_key_id,
                &params.region,
                &params.service,
                &date_stamp,
            )
            .unwrap_or_else(|| {
                // Not in cache, derive and store
                let key = derive_signing_key(
                    &params.secret_access_key,
                    &date_stamp,
                    &params.region,
                    &params.service,
                );
                key_cache.put(
                    &params.access_key_id,
                    &params.region,
                    &params.service,
                    &date_stamp,
                    key.clone(),
                );
                key
            })
    } else {
        // No cache, just derive
        derive_signing_key(
            &params.secret_access_key,
            &date_stamp,
            &params.region,
            &params.service,
        )
    };

    // Calculate signature
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

    // Build Authorization header
    let authorization = format!(
        "{} Credential={}/{}, SignedHeaders={}, Signature={}",
        AWS_ALGORITHM, params.access_key_id, credential_scope, signed_headers, signature
    );

    // Add Authorization header
    headers.insert("authorization", authorization.parse().map_err(|_| {
        SigningError::SigningFailed {
            message: "Failed to parse authorization header".to_string(),
        }
    })?);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

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

        let hash = sha256_hex(b"hello world");
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn test_hmac_sha256() {
        let result = hmac_sha256(b"key", b"message");
        assert_eq!(result.len(), 32);

        // Test with known vector
        let result = hmac_sha256(b"", b"");
        assert_eq!(result.len(), 32);
    }

    #[test]
    fn test_derive_signing_key() {
        let key = derive_signing_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "20231215", "us-east-1", "ses");
        assert_eq!(key.len(), 32);

        // Same inputs should produce same key
        let key2 = derive_signing_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "20231215", "us-east-1", "ses");
        assert_eq!(key, key2);

        // Different date should produce different key
        let key3 = derive_signing_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "20231216", "us-east-1", "ses");
        assert_ne!(key, key3);
    }

    #[test]
    fn test_format_datetime() {
        let dt = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();
        assert_eq!(format_datetime(&dt), "20231215T103045Z");

        let dt = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
        assert_eq!(format_datetime(&dt), "20240101T000000Z");
    }

    #[test]
    fn test_format_date_stamp() {
        let dt = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();
        assert_eq!(format_date_stamp(&dt), "20231215");

        let dt = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
        assert_eq!(format_date_stamp(&dt), "20240101");
    }

    #[test]
    fn test_build_credential_scope() {
        let scope = build_credential_scope("20231215", "us-east-1", "ses");
        assert_eq!(scope, "20231215/us-east-1/ses/aws4_request");

        let scope = build_credential_scope("20240101", "eu-west-1", "s3");
        assert_eq!(scope, "20240101/eu-west-1/s3/aws4_request");
    }

    #[test]
    fn test_signing_params_new() {
        let params = SigningParams::new("us-east-1", "ses");
        assert_eq!(params.region, "us-east-1");
        assert_eq!(params.service, "ses");
        assert!(params.access_key_id.is_empty());
        assert!(params.secret_access_key.is_empty());
        assert!(params.session_token.is_none());
    }

    #[test]
    fn test_signing_params_builder() {
        let params = SigningParams::new("us-east-1", "ses")
            .with_access_key("AKIAIOSFODNN7EXAMPLE")
            .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
            .with_session_token("token123");

        assert_eq!(params.access_key_id, "AKIAIOSFODNN7EXAMPLE");
        assert_eq!(
            params.secret_access_key,
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        );
        assert_eq!(params.session_token, Some("token123".to_string()));
    }

    #[test]
    fn test_build_canonical_request() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());
        headers.insert("x-amz-date", "20231215T103045Z".parse().unwrap());

        let query_params = vec![];
        let payload_hash = sha256_hex(b"");

        let (canonical_request, signed_headers) =
            build_canonical_request("GET", "/v2/email/configuration-sets", &query_params, &headers, &payload_hash);

        assert!(canonical_request.contains("GET"));
        assert!(canonical_request.contains("/v2/email/configuration-sets"));
        assert!(canonical_request.contains("host:email.us-east-1.amazonaws.com"));
        assert!(canonical_request.contains("x-amz-date:20231215T103045Z"));
        assert!(signed_headers.contains("host"));
        assert!(signed_headers.contains("x-amz-date"));
    }

    #[test]
    fn test_build_string_to_sign() {
        let timestamp = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();
        let credential_scope = "20231215/us-east-1/ses/aws4_request";
        let canonical_request_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

        let string_to_sign = build_string_to_sign(&timestamp, credential_scope, canonical_request_hash);

        assert!(string_to_sign.starts_with("AWS4-HMAC-SHA256"));
        assert!(string_to_sign.contains("20231215T103045Z"));
        assert!(string_to_sign.contains(credential_scope));
        assert!(string_to_sign.contains(canonical_request_hash));
    }

    #[test]
    fn test_sign_request_basic() {
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
        assert!(headers.contains_key("authorization"));
        assert!(headers.contains_key("x-amz-date"));
        assert!(headers.contains_key("x-amz-content-sha256"));

        let auth_header = headers.get("authorization").unwrap().to_str().unwrap();
        assert!(auth_header.starts_with("AWS4-HMAC-SHA256"));
        assert!(auth_header.contains("Credential=AKIAIOSFODNN7EXAMPLE"));
        assert!(auth_header.contains("SignedHeaders="));
        assert!(auth_header.contains("Signature="));
    }

    #[test]
    fn test_sign_request_with_payload() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());
        headers.insert("content-type", "application/json".parse().unwrap());

        let params = SigningParams::new("us-east-1", "ses")
            .with_access_key("AKIAIOSFODNN7EXAMPLE")
            .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

        let timestamp = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();
        let payload = b"{\"test\":\"data\"}";

        let result = sign_request(
            "POST",
            "/v2/email/outbound-emails",
            &[],
            &mut headers,
            Some(payload),
            &params,
            &timestamp,
            None,
        );

        assert!(result.is_ok());
        assert!(headers.contains_key("authorization"));

        let content_sha = headers.get("x-amz-content-sha256").unwrap().to_str().unwrap();
        assert_eq!(content_sha, sha256_hex(payload));
    }

    #[test]
    fn test_sign_request_with_session_token() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());

        let params = SigningParams::new("us-east-1", "ses")
            .with_access_key("AKIAIOSFODNN7EXAMPLE")
            .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
            .with_session_token("AQoDYXdzEJr...");

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
        assert!(headers.contains_key("x-amz-security-token"));
    }

    #[test]
    fn test_sign_request_with_cache() {
        let cache = Arc::new(SigningKeyCache::new());
        let mut headers = HeaderMap::new();
        headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());

        let params = SigningParams::new("us-east-1", "ses")
            .with_access_key("AKIAIOSFODNN7EXAMPLE")
            .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

        let timestamp = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();

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

        // Second request should use cache
        let mut headers2 = HeaderMap::new();
        headers2.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());
        let result = sign_request(
            "GET",
            "/v2/email/configuration-sets",
            &[],
            &mut headers2,
            None,
            &params,
            &timestamp,
            Some(cache.clone()),
        );
        assert!(result.is_ok());
        assert_eq!(cache.len(), 1); // Still only one entry
    }

    #[test]
    fn test_sign_request_missing_access_key() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());

        let params = SigningParams::new("us-east-1", "ses")
            .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

        let timestamp = Utc.now();

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

        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), SigningError::SigningFailed { .. }));
    }

    #[test]
    fn test_sign_request_missing_secret_key() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());

        let params = SigningParams::new("us-east-1", "ses")
            .with_access_key("AKIAIOSFODNN7EXAMPLE");

        let timestamp = Utc::now();

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

        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), SigningError::SigningFailed { .. }));
    }

    #[test]
    fn test_sign_request_with_query_params() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());

        let params = SigningParams::new("us-east-1", "ses")
            .with_access_key("AKIAIOSFODNN7EXAMPLE")
            .with_secret_key("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

        let timestamp = Utc.with_ymd_and_hms(2023, 12, 15, 10, 30, 45).unwrap();

        let query_params = vec![
            ("PageSize".to_string(), "10".to_string()),
            ("NextToken".to_string(), "abc123".to_string()),
        ];

        let result = sign_request(
            "GET",
            "/v2/email/configuration-sets",
            &query_params,
            &mut headers,
            None,
            &params,
            &timestamp,
            None,
        );

        assert!(result.is_ok());
        assert!(headers.contains_key("authorization"));
    }

    // AWS Signature V4 Test Suite
    // These tests use the official AWS test vectors from:
    // https://docs.aws.amazon.com/general/latest/gr/signature-v4-test-suite.html

    #[test]
    fn test_aws_test_suite_get_vanilla() {
        // Test case: GET request with no query string or body
        let mut headers = HeaderMap::new();
        headers.insert("host", "example.amazonaws.com".parse().unwrap());

        let params = SigningParams::new("us-east-1", "service")
            .with_access_key("AKIDEXAMPLE")
            .with_secret_key("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY");

        let timestamp = Utc.with_ymd_and_hms(2015, 8, 30, 12, 36, 0).unwrap();

        let result = sign_request(
            "GET",
            "/",
            &[],
            &mut headers,
            None,
            &params,
            &timestamp,
            None,
        );

        assert!(result.is_ok());

        let auth = headers.get("authorization").unwrap().to_str().unwrap();
        assert!(auth.contains("AWS4-HMAC-SHA256"));
        assert!(auth.contains("Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request"));
        assert!(auth.contains("SignedHeaders=host;x-amz-content-sha256;x-amz-date"));
        assert!(auth.contains("Signature="));
    }

    #[test]
    fn test_ses_service_constant() {
        assert_eq!(SES_SERVICE, "ses");
    }

    #[test]
    fn test_aws_algorithm_constant() {
        assert_eq!(AWS_ALGORITHM, "AWS4-HMAC-SHA256");
    }

    #[test]
    fn test_unsigned_payload_constant() {
        assert_eq!(UNSIGNED_PAYLOAD, "UNSIGNED-PAYLOAD");
    }
}
